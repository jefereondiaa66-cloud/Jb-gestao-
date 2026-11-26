-- =====================================================================
-- JB CORE · 08 · JB Fiscal (NF-e pela Focus NFe)
--
-- Só acrescenta. Não toca em public.docs nem em nenhum dado do sistema.
--   1. jbcore.fiscal_auditoria: cada chamada ao serviço fiscal (ação, ambiente,
--      referência, resultado, quem). É o que a ação "auditoria" mostra.
--   2. jbcore.fiscal_envios: reserva de cada referência de emissão. Uma
--      referência entra uma vez só; a função jb-fiscal nunca envia de novo uma
--      referência que já está aqui (emissão idempotente).
--   3. public.jb_fiscal_* : funções que só a credencial interna da função
--      jb-fiscal (service_role) pode chamar: conferir o segredo, reservar e
--      marcar envios, registrar e ler a auditoria.
--   4. jbcore.fiscal(acao, args, uid_app): usada pela ponte do Claude. Só
--      administrador ativo da ponte (jbcore.usuario_da_ponte, a mesma regra de
--      jbcore.aplicar) e só o dono do banco (como jbcore.publicar_nuvem).
--      Dispara a função jb-fiscal por pg_net com o segredo do cofre no
--      cabeçalho x-jb-fiscal-segredo e devolve o número do pedido; a resposta
--      sai em jbcore.resposta(<pedido>).
--
-- Segredo do cofre: nome "jb_fiscal_segredo". Esta migração cria um aleatório
-- (só se ainda não existir); o valor nunca vai para o repositório nem para as
-- variáveis da função. Para criar à mão (ou trocar), no editor SQL do Supabase:
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
--          'jb_fiscal_segredo', 'JB Fiscal: autoriza o banco a chamar a função jb-fiscal');
--   -- trocar: select vault.update_secret((select id from vault.secrets where name = 'jb_fiscal_segredo'),
--   --                                   encode(extensions.gen_random_bytes(32), 'hex'));
--
-- Antes de aplicar: select seg.fazer_copia();
-- Reversão: 20261108120000_jbcore_08_fiscal.down.sql (apaga o histórico fiscal;
-- baixe antes: select * from jbcore.fiscal_auditoria; select * from jbcore.fiscal_envios;)
-- =====================================================================

/* ---------- 1. auditoria ---------- */
create table if not exists jbcore.fiscal_auditoria (
  id bigserial primary key,
  em timestamptz not null default now(),
  origem text not null check (origem in ('nuvem', 'claude')),
  uid_app text,
  nome text,
  papel text,
  acao text not null,
  ambiente text check (ambiente is null or ambiente in ('homologacao', 'producao')),
  referencia text,
  documento text,            -- chave de acesso, quando houver
  resultado text not null,   -- "ok" ou o tipo do erro (validacao, permissao, ...)
  detalhe text,
  duracao_ms integer
);
create index if not exists fiscal_auditoria_em_idx on jbcore.fiscal_auditoria (em desc);
create index if not exists fiscal_auditoria_ref_idx on jbcore.fiscal_auditoria (referencia) where referencia is not null;
alter table jbcore.fiscal_auditoria enable row level security;

/* ---------- 2. reserva das referências de emissão ---------- */
create table if not exists jbcore.fiscal_envios (
  ambiente text not null check (ambiente in ('homologacao', 'producao')),
  referencia text not null check (referencia ~ '^[A-Za-z0-9_.-]{1,80}$'),
  sha256 text,
  situacao text not null check (situacao in ('reservada', 'enviando', 'enviada', 'recusada', 'sem_confirmacao', 'ja_existia')),
  uid_app text,
  detalhe text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (ambiente, referencia)
);
alter table jbcore.fiscal_envios enable row level security;

/* ---------- 3. funções da função jb-fiscal (service_role) ---------- */
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'jb_fiscal_segredo') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'jb_fiscal_segredo',
                                'JB Fiscal: autoriza o banco a chamar a função jb-fiscal');
  end if;
end $$;

create or replace function public.jb_fiscal_confere(p_segredo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select extensions.digest(d.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_segredo, ''), 'sha256')
    from vault.decrypted_secrets d where d.name = 'jb_fiscal_segredo'), false)
$$;

-- reserva a referência: {nova: true} na primeira vez; depois, {nova: false, situacao, idade_s}
create or replace function public.jb_fiscal_reservar(p_ambiente text, p_referencia text, p_sha256 text, p_uid_app text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jbcore.fiscal_envios%rowtype;
begin
  insert into jbcore.fiscal_envios (ambiente, referencia, sha256, situacao, uid_app)
  values (p_ambiente, p_referencia, left(p_sha256, 64), 'reservada', left(p_uid_app, 60))
  on conflict (ambiente, referencia) do nothing
  returning * into v;
  if found then return jsonb_build_object('nova', true, 'situacao', v.situacao, 'idade_s', 0); end if;
  select * into v from jbcore.fiscal_envios where ambiente = p_ambiente and referencia = p_referencia;
  return jsonb_build_object('nova', false, 'situacao', v.situacao, 'sha256', v.sha256,
    'idade_s', floor(extract(epoch from now() - v.atualizado_em)));
end $$;

create or replace function public.jb_fiscal_marcar(p_ambiente text, p_referencia text, p_situacao text, p_detalhe text default null)
returns void language sql security definer set search_path = '' as $$
  update jbcore.fiscal_envios set situacao = p_situacao, detalhe = left(p_detalhe, 500), atualizado_em = now()
  where ambiente = p_ambiente and referencia = p_referencia
$$;

create or replace function public.jb_fiscal_envio(p_ambiente text, p_referencia text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (select jsonb_build_object('situacao', e.situacao, 'criado_em', e.criado_em, 'atualizado_em', e.atualizado_em,
                                    'idade_s', floor(extract(epoch from now() - e.atualizado_em)))
          from jbcore.fiscal_envios e where e.ambiente = p_ambiente and e.referencia = p_referencia)
$$;

create or replace function public.jb_fiscal_registrar(p jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into jbcore.fiscal_auditoria (origem, uid_app, nome, papel, acao, ambiente, referencia, documento, resultado, detalhe, duracao_ms)
  values (case when p->>'origem' = 'claude' then 'claude' else 'nuvem' end,
          left(p->>'uid_app', 60), left(p->>'nome', 120), left(p->>'papel', 40), left(coalesce(p->>'acao', '?'), 40),
          case when p->>'ambiente' in ('homologacao', 'producao') then p->>'ambiente' end,
          left(p->>'referencia', 100), left(p->>'documento', 60), left(coalesce(p->>'resultado', '?'), 40), left(p->>'detalhe', 500),
          case when jsonb_typeof(p->'duracao_ms') = 'number' then least((p->>'duracao_ms')::numeric, 2147483647)::integer end)
  returning id into v;
  return v;
end $$;

create or replace function public.jb_fiscal_auditoria(p_limite integer default 100)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('em', a.em, 'origem', a.origem, 'quem', coalesce(a.nome, a.uid_app, '—'), 'uid_app', a.uid_app,
    'papel', a.papel, 'operacao', a.acao, 'ambiente', a.ambiente, 'referencia', a.referencia, 'documento', a.documento,
    'resultado', a.resultado, 'detalhe', a.detalhe) order by a.id desc), '[]'::jsonb)
  from (select * from jbcore.fiscal_auditoria order by id desc limit least(greatest(coalesce(p_limite, 100), 1), 500)) a
$$;

revoke all on function public.jb_fiscal_confere(text) from public, anon, authenticated;
revoke all on function public.jb_fiscal_reservar(text, text, text, text) from public, anon, authenticated;
revoke all on function public.jb_fiscal_marcar(text, text, text, text) from public, anon, authenticated;
revoke all on function public.jb_fiscal_envio(text, text) from public, anon, authenticated;
revoke all on function public.jb_fiscal_registrar(jsonb) from public, anon, authenticated;
revoke all on function public.jb_fiscal_auditoria(integer) from public, anon, authenticated;
grant execute on function public.jb_fiscal_confere(text) to service_role;
grant execute on function public.jb_fiscal_reservar(text, text, text, text) to service_role;
grant execute on function public.jb_fiscal_marcar(text, text, text, text) to service_role;
grant execute on function public.jb_fiscal_envio(text, text) to service_role;
grant execute on function public.jb_fiscal_registrar(jsonb) to service_role;
grant execute on function public.jb_fiscal_auditoria(integer) to service_role;

/* ---------- 4. chamada pela ponte do Claude ---------- */
create or replace function jbcore.fiscal(p_acao text, p_args jsonb, p_uid_app text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_nome text; v_seg text; v_req bigint;
begin
  if p_acao is null or p_acao not in ('status_servico', 'emitir_nfe', 'consultar_nfe', 'baixar_xml_nfe', 'baixar_danfe', 'cancelar_nfe',
      'consultar_cancelamento', 'inutilizar_numeracao', 'consultar_cep', 'consultar_cnpj', 'auditoria') then
    raise exception 'ação fiscal inválida' using errcode = '22023';
  end if;
  if p_args is not null and jsonb_typeof(p_args) <> 'object' then raise exception 'argumentos inválidos' using errcode = '22023'; end if;
  if octet_length(coalesce(p_args, '{}'::jsonb)::text) > 2000000 then raise exception 'pedido fiscal grande demais' using errcode = '54000'; end if;
  v_user := jbcore.usuario_da_ponte(p_uid_app);
  if v_user is null then
    raise exception 'serviço fiscal recusado: % não é administrador ativo', coalesce(p_uid_app, '(vazio)') using errcode = '42501';
  end if;
  select d.dados->>'nome' into v_nome from public.docs d where d.colecao = 'acesso' and d.id = p_uid_app;
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'jb_fiscal_segredo';
  if v_seg is null then raise exception 'segredo do serviço fiscal (jb_fiscal_segredo) não está no cofre' using errcode = 'P0002'; end if;
  v_req := net.http_post(
    url := 'https://kdsaslmlvjllgzbzsnxt.supabase.co/functions/v1/jb-fiscal',
    body := jsonb_build_object('acao', p_acao, 'args', coalesce(p_args, '{}'::jsonb),
                               'quem', jsonb_build_object('origem', 'claude', 'uid_app', p_uid_app, 'nome', v_nome)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jb-fiscal-segredo', v_seg),
    timeout_milliseconds := 90000);
  return v_req;
end $$;
revoke all on function jbcore.fiscal(text, jsonb, text) from public, anon, authenticated;
