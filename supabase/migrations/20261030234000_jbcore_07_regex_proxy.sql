-- =====================================================================
-- JB CORE · 07 · conferência do endereço do Netlify no Postgres
--
-- A expressão {20,4000} da 05 passa do limite de repetição do Postgres
-- (255) e dava erro 2201B em toda publicação. Troca por {20,} + limite de
-- tamanho. Não toca em dados.
-- Reversão: reaplicar jbcore.publicar_nuvem de 20261030231000_jbcore_05_publicador.sql
-- =====================================================================
create or replace function jbcore.publicar_nuvem(p_acao text, p_commit text default null, p_proxy text default null, p_deploy text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_seg text; v_req bigint;
begin
  if p_acao is null or p_acao not in ('publicar', 'simular', 'estado') then raise exception 'ação inválida' using errcode = '22023'; end if;
  if p_acao in ('publicar', 'simular') and (p_commit is null or p_commit !~ '^[0-9a-f]{40}$') then
    raise exception 'commit inválido (código completo de 40 caracteres)' using errcode = '22023';
  end if;
  if p_acao in ('publicar', 'estado') and (p_proxy is null or length(p_proxy) > 4100
      or p_proxy !~ '^https://netlify-mcp\.netlify\.app/proxy/[A-Za-z0-9._~-]{20,}$') then
    raise exception 'endereço de publicação do Netlify inválido' using errcode = '22023';
  end if;
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'jb_publicar_segredo';
  if v_seg is null then raise exception 'segredo do publicador não está no cofre' using errcode = 'P0002'; end if;
  v_req := net.http_post(
    url := 'https://kdsaslmlvjllgzbzsnxt.supabase.co/functions/v1/jb-publicar',
    body := jsonb_build_object('segredo', v_seg, 'acao', p_acao, 'commit', p_commit, 'proxy', p_proxy, 'deploy', p_deploy),
    timeout_milliseconds := 120000);
  if p_acao = 'publicar' then
    insert into jbcore.publicacoes (ambiente, versao, commit_ref, situacao, detalhe)
    values ('nuvem', 'commit ' || left(p_commit, 7), p_commit, 'preparada', jsonb_build_object('origem', 'jb-publicar', 'pedido', v_req));
  end if;
  return v_req;
end $$;
revoke all on function jbcore.publicar_nuvem(text, text, text, text) from public, anon, authenticated;
