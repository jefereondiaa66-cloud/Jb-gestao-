-- =====================================================================
-- V165 · Estoque integrado (Almoxarifado ↔ Combustível): versão de cada produto
--
-- Para duas pessoas não tirarem o mesmo saldo ao mesmo tempo, em aparelhos
-- diferentes. Cada produto (item do almoxarifado "i:<id>" ou produto de setor
-- "p:<id>") tem um número de versão. Toda gravação em alm, compras, consumos
-- e estoqueMov que mexe num produto aumenta a versão dele (gatilho). As
-- operações novas do estoque integrado (transferir, usar, requisição) leem a
-- versão quando a janela abre e, ao confirmar, reservam: se outra pessoa mexeu
-- no produto no meio tempo, o banco recusa e a tela confere o saldo de novo.
--
-- Só acrescenta: tabela nova, funções novas e um gatilho que nunca impede uma
-- gravação (se falhar, a gravação segue). Nenhum dado existente muda.
-- Reversão: 20261125120000_seg_estoque_versoes.down.sql
-- Aplicada em 25/11/2026 com a cópia de segurança nº 79 antes.
-- =====================================================================

create table if not exists seg.estoque_versao (
  chave text primary key check (chave ~ '^[ip]:[A-Za-z0-9_.:-]{1,120}$'),
  versao bigint not null default 0,
  em timestamptz not null default now()
);
alter table seg.estoque_versao enable row level security;
revoke all on seg.estoque_versao from public, anon, authenticated;

-- produtos que um lançamento (item de um documento agrupado) movimenta
create or replace function seg.estoque_chaves(p jsonb)
returns text[] language sql immutable set search_path to '' as $$
  select coalesce(array_agg(distinct c) filter (where c is not null and c ~ '^[ip]:[A-Za-z0-9_.:-]{1,120}$'), '{}')
  from (
    select 'p:' || (p->>'produtoId') as c where jsonb_typeof(p) = 'object' and coalesce(p->>'produtoId', '') <> ''
    union all select 'p:' || (p->>'produtoDestinoId') where jsonb_typeof(p) = 'object' and coalesce(p->>'produtoDestinoId', '') <> ''
    union all select 'i:' || (p->>'itemId') where jsonb_typeof(p) = 'object' and coalesce(p->>'itemId', '') <> ''
    union all select 'i:' || (p->>'almItemId') where jsonb_typeof(p) = 'object' and coalesce(p->>'almItemId', '') <> ''
    union all select 'i:' || (l->>'itemId') from jsonb_array_elements(case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else '[]'::jsonb end) l
      where coalesce(l->>'itemId', '') <> ''
    union all select 'p:' || (l->>'produtoId') from jsonb_array_elements(case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else '[]'::jsonb end) l
      where coalesce(l->>'produtoId', '') <> ''
    union all select 'p:' || (l->>'produtoSetorId') from jsonb_array_elements(case when jsonb_typeof(p->'itens') = 'array' then p->'itens' else '[]'::jsonb end) l
      where coalesce(l->>'produtoSetorId', '') <> ''
  ) x(c)
$$;

-- gatilho: aumenta a versão dos produtos mexidos (nunca bloqueia a gravação)
create or replace function seg.estoque_versao_docs()
returns trigger language plpgsql security definer set search_path to '' as $$
declare
  v_raiz text := split_part(coalesce(new.colecao, old.colecao), '/', 1);
  a jsonb; b jsonb; k text; ch text[] := '{}';
begin
  if v_raiz not in ('alm', 'compras', 'consumos', 'estoqueMov') then return null; end if;
  begin
    a := case when tg_op <> 'INSERT' then coalesce(old.dados->'items', '{}'::jsonb) else '{}'::jsonb end;
    b := case when tg_op <> 'DELETE' then coalesce(new.dados->'items', '{}'::jsonb) else '{}'::jsonb end;
    if jsonb_typeof(a) <> 'object' then a := '{}'::jsonb; end if;
    if jsonb_typeof(b) <> 'object' then b := '{}'::jsonb; end if;
    for k in select jsonb_object_keys(a) union select jsonb_object_keys(b) loop
      if (a->k) is distinct from (b->k) then
        ch := ch || seg.estoque_chaves(a->k) || seg.estoque_chaves(b->k);
      end if;
    end loop;
    if array_length(ch, 1) > 0 then
      insert into seg.estoque_versao (chave, versao)
      select distinct c, 1 from unnest(ch) c
      on conflict (chave) do update set versao = seg.estoque_versao.versao + 1, em = now();
    end if;
  exception when others then
    null;   -- a versão é só um aviso de mudança: a gravação do sistema nunca para por causa dela
  end;
  return null;
end $$;

drop trigger if exists docs_estoque_versao on public.docs;
create trigger docs_estoque_versao after insert or update or delete on public.docs
  for each row execute function seg.estoque_versao_docs();

-- ações: 'versoes' {chaves:[...]} → {versoes:{chave:n}}
--        'reservar' {versoes:{chave:n}} → {ok:true, versoes:{...}} ou {ok:false, mudou:[...]}
create or replace function seg.estoque_executar(p_acao text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_ch text[]; k text; v_vista bigint; v_atual bigint; v_mudou text[] := '{}'; v_res jsonb := '{}'::jsonb;
begin
  if p_acao = 'versoes' then
    select coalesce(array_agg(x), '{}') into v_ch from jsonb_array_elements_text(coalesce(p_dados->'chaves', '[]'::jsonb)) x
      where x ~ '^[ip]:[A-Za-z0-9_.:-]{1,120}$';
    if array_length(v_ch, 1) > 50 then raise exception 'muitos produtos de uma vez' using errcode = '22023'; end if;
    select coalesce(jsonb_object_agg(c, coalesce(v.versao, 0)), '{}'::jsonb) into v_res
      from unnest(v_ch) c left join seg.estoque_versao v on v.chave = c;
    return jsonb_build_object('versoes', v_res);
  elsif p_acao = 'reservar' then
    if jsonb_typeof(p_dados->'versoes') <> 'object' then raise exception 'versões ausentes' using errcode = '22023'; end if;
    select coalesce(array_agg(x order by x), '{}') into v_ch from jsonb_object_keys(p_dados->'versoes') x
      where x ~ '^[ip]:[A-Za-z0-9_.:-]{1,120}$';
    if array_length(v_ch, 1) > 50 then raise exception 'muitos produtos de uma vez' using errcode = '22023'; end if;
    insert into seg.estoque_versao (chave, versao) select c, 0 from unnest(v_ch) c on conflict (chave) do nothing;
    perform 1 from seg.estoque_versao where chave = any(v_ch) order by chave for update;
    foreach k in array v_ch loop
      v_vista := (p_dados->'versoes'->>k)::bigint;
      select versao into v_atual from seg.estoque_versao where chave = k;
      if v_atual is distinct from v_vista then v_mudou := v_mudou || k; end if;
    end loop;
    if array_length(v_mudou, 1) > 0 then
      return jsonb_build_object('ok', false, 'mudou', to_jsonb(v_mudou));
    end if;
    update seg.estoque_versao set versao = versao + 1, em = now() where chave = any(v_ch);
    select coalesce(jsonb_object_agg(chave, versao), '{}'::jsonb) into v_res from seg.estoque_versao where chave = any(v_ch);
    return jsonb_build_object('ok', true, 'versoes', v_res);
  end if;
  raise exception 'ação desconhecida' using errcode = '22023';
end $$;

-- nuvem (login próprio)
create or replace function public.jb_estoque(p_acao text, p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not seg.liberado() then raise exception 'sessão inválida' using errcode = '42501'; end if;
  return seg.estoque_executar(p_acao, p_dados);
end $$;
revoke all on function public.jb_estoque(text, jsonb) from public, anon;
grant execute on function public.jb_estoque(text, jsonb) to authenticated;

-- ponte do Claude (conector do dono): só administrador ativo
create or replace function jbcore.estoque_ponte(p_acao text, p_dados jsonb, p_uid_app text)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if jbcore.usuario_da_ponte(p_uid_app) is null then raise exception 'estoque: acesso restrito' using errcode = '42501'; end if;
  return seg.estoque_executar(p_acao, p_dados);
end $$;
revoke all on function jbcore.estoque_ponte(text, jsonb, text) from public, anon, authenticated;
revoke all on function seg.estoque_executar(text, jsonb) from public, anon, authenticated;
revoke all on function seg.estoque_versao_docs() from public, anon, authenticated;
