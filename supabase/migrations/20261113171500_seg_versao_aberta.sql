-- Versão aberta em cada acesso (13/11/2026)
-- Pedido do dono: conferir se todos os acessos estão na versão mais nova do sistema.
-- Acrescenta em seg.sessoes a versão do site que a página daquela sessão carregou e quando informou,
-- e a função public.jb_versao_aberta(p_site), que a própria página chama depois de entrar.
-- Só acrescenta duas colunas (vazias) e uma função; não altera nenhum dado existente.
-- Antes de aplicar: select seg.fazer_copia();
-- Reverter: rodar 20261113171500_seg_versao_aberta.down.sql.
alter table seg.sessoes add column if not exists versao_site text;
alter table seg.sessoes add column if not exists versao_em timestamptz;

create or replace function public.jb_versao_aberta(p_site text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not seg.sessao_ok() then return jsonb_build_object('ok', false); end if;
  if p_site is null or p_site !~ '^[0-9a-f]{6,64}$' then return jsonb_build_object('ok', false); end if;
  update seg.sessoes set versao_site = p_site, versao_em = now()
    where session_id = seg.sessao_atual() and user_id = auth.uid();
  return jsonb_build_object('ok', true);
end $function$;

revoke all on function public.jb_versao_aberta(text) from public, anon;
grant execute on function public.jb_versao_aberta(text) to authenticated;
