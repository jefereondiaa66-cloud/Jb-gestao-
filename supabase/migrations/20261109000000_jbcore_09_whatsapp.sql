-- =====================================================================
-- JB CORE · 09 · Resumo diário no WhatsApp (API oficial da Meta)
--
-- Só acrescenta. Não toca em public.docs nem em nenhum dado do sistema.
--   1. jbcore.whatsapp_config: linha única. Nasce DESLIGADO (ativo = false).
--   2. jbcore.whatsapp_destinatarios: quem recebe (55 + DDD + número).
--   3. jbcore.whatsapp_envios: um registro por dia e telefone; reenvio nunca duplica.
--   4. public.jb_whatsapp_* : só a credencial interna da função jb-whatsapp pode chamar.
--   5. jbcore.whatsapp_disparar / jbcore.whatsapp_previa: chamam a função por
--      pg_net com o segredo do cofre "jb_whatsapp_segredo". A resposta sai em
--      jbcore.resposta(<pedido>).
--   6. Agendamento "jb-whatsapp-resumo": 22h UTC = 19h de Fortaleza, todo dia.
--      Com ativo = false ele não faz nada.
--
-- Depois de ligar (quem manda são as credenciais da função, no Supabase):
--   insert into jbcore.whatsapp_destinatarios (nome, telefone) values ('Nome', '5586999999999');
--   select jbcore.whatsapp_disparar(null, '5586999999999');   -- teste para um número
--   update jbcore.whatsapp_config set ativo = true;
--
-- Antes de aplicar: select seg.fazer_copia();
-- Reversão: 20261109000000_jbcore_09_whatsapp.down.sql
-- =====================================================================

create table if not exists jbcore.whatsapp_config (
  id boolean primary key default true check (id),
  ativo boolean not null default false,
  dias_semana integer[] not null default '{0,1,2,3,4,5,6}',  -- 0 = domingo
  modelo text not null default 'jb_resumo_diario',
  idioma text not null default 'pt_BR',
  versao_api text not null default 'v25.0',
  atualizado_em timestamptz not null default now()
);
insert into jbcore.whatsapp_config (id) values (true) on conflict (id) do nothing;
alter table jbcore.whatsapp_config enable row level security;

create table if not exists jbcore.whatsapp_destinatarios (
  id bigserial primary key,
  nome text not null,
  telefone text not null unique check (telefone ~ '^55[0-9]{10,11}$'),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table jbcore.whatsapp_destinatarios enable row level security;

create table if not exists jbcore.whatsapp_envios (
  dia date not null,
  telefone text not null,
  situacao text not null check (situacao in ('enviando', 'enviada', 'falhou')),
  wamid text,
  detalhe text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (dia, telefone)
);
alter table jbcore.whatsapp_envios enable row level security;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'jb_whatsapp_segredo') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'jb_whatsapp_segredo',
                                'JB WhatsApp: autoriza o banco a chamar a função jb-whatsapp');
  end if;
end $$;

create or replace function public.jb_whatsapp_confere(p_segredo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select extensions.digest(d.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_segredo, ''), 'sha256')
    from vault.decrypted_secrets d where d.name = 'jb_whatsapp_segredo'), false)
$$;

create or replace function public.jb_whatsapp_contexto()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'config', (select to_jsonb(c) from jbcore.whatsapp_config c),
    'destinatarios', coalesce((select jsonb_agg(jsonb_build_object('nome', d.nome, 'telefone', d.telefone) order by d.id)
                               from jbcore.whatsapp_destinatarios d where d.ativo), '[]'::jsonb))
$$;

-- true: pode mandar. Só repete quem falhou; "enviando" pode já ter chegado, então não repete.
create or replace function public.jb_whatsapp_reservar(p_dia date, p_telefone text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into jbcore.whatsapp_envios (dia, telefone, situacao) values (p_dia, p_telefone, 'enviando')
  on conflict (dia, telefone) do update set situacao = 'enviando', detalhe = null, atualizado_em = now()
    where jbcore.whatsapp_envios.situacao = 'falhou';
  return found;
end $$;

create or replace function public.jb_whatsapp_marcar(p_dia date, p_telefone text, p_situacao text, p_wamid text, p_detalhe text)
returns void language sql security definer set search_path = '' as $$
  update jbcore.whatsapp_envios set situacao = p_situacao, wamid = p_wamid, detalhe = left(p_detalhe, 500), atualizado_em = now()
  where dia = p_dia and telefone = p_telefone
$$;

revoke all on function public.jb_whatsapp_confere(text) from public, anon, authenticated;
revoke all on function public.jb_whatsapp_contexto() from public, anon, authenticated;
revoke all on function public.jb_whatsapp_reservar(date, text) from public, anon, authenticated;
revoke all on function public.jb_whatsapp_marcar(date, text, text, text, text) from public, anon, authenticated;
grant execute on function public.jb_whatsapp_confere(text) to service_role;
grant execute on function public.jb_whatsapp_contexto() to service_role;
grant execute on function public.jb_whatsapp_reservar(date, text) to service_role;
grant execute on function public.jb_whatsapp_marcar(date, text, text, text, text) to service_role;

create or replace function jbcore.whatsapp_chamar(p_corpo jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_seg text;
begin
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'jb_whatsapp_segredo';
  if v_seg is null then raise exception 'segredo jb_whatsapp_segredo não está no cofre' using errcode = 'P0002'; end if;
  return net.http_post(
    url := 'https://kdsaslmlvjllgzbzsnxt.supabase.co/functions/v1/jb-whatsapp',
    body := p_corpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-jb-whatsapp-segredo', v_seg),
    timeout_milliseconds := 120000);
end $$;

-- Sem argumentos é o disparo das 19h. p_so_para: teste para um único número.
-- p_forcar: manda mesmo desligado ou fora dos dias marcados (ex.: reenviar a quem falhou).
create or replace function jbcore.whatsapp_disparar(p_dia date default null, p_so_para text default null, p_forcar boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_cfg jbcore.whatsapp_config%rowtype; v_dia date := coalesce(p_dia, (now() at time zone 'America/Fortaleza')::date);
begin
  select * into v_cfg from jbcore.whatsapp_config;
  if p_so_para is null and not coalesce(p_forcar, false)
     and (not v_cfg.ativo or not (extract(dow from v_dia)::integer = any (v_cfg.dias_semana))) then
    return null;
  end if;
  return jbcore.whatsapp_chamar(jsonb_build_object('acao', 'enviar', 'dia', v_dia, 'so_para', p_so_para, 'forcar', coalesce(p_forcar, false)));
end $$;

create or replace function jbcore.whatsapp_previa(p_dia date default null)
returns bigint language sql security definer set search_path = '' as $$
  select jbcore.whatsapp_chamar(jsonb_build_object('acao', 'previa', 'dia', coalesce(p_dia, (now() at time zone 'America/Fortaleza')::date)))
$$;

revoke all on function jbcore.whatsapp_chamar(jsonb) from public, anon, authenticated;
revoke all on function jbcore.whatsapp_disparar(date, text, boolean) from public, anon, authenticated;
revoke all on function jbcore.whatsapp_previa(date) from public, anon, authenticated;

select cron.schedule('jb-whatsapp-resumo', '0 22 * * *', 'select jbcore.whatsapp_disparar()');
