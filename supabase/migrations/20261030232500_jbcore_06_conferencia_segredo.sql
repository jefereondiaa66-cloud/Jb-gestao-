-- =====================================================================
-- JB CORE · 06 · conferência do segredo do publicador
--
-- A função jb-publicar confere o segredo recebido chamando esta função com a
-- credencial interna do Supabase (service_role). Assim o segredo fica só no
-- cofre; ninguém precisa copiá-lo para as variáveis da função.
-- Ninguém de fora (anon/authenticated) consegue chamar.
-- Não toca em dados. Reversão: drop function public.jb_publicador_confere(text);
-- =====================================================================
create or replace function public.jb_publicador_confere(p_segredo text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select extensions.digest(d.decrypted_secret, 'sha256') = extensions.digest(coalesce(p_segredo, ''), 'sha256')
    from vault.decrypted_secrets d where d.name = 'jb_publicar_segredo'), false)
$$;
revoke all on function public.jb_publicador_confere(text) from public, anon, authenticated;
grant execute on function public.jb_publicador_confere(text) to service_role;
