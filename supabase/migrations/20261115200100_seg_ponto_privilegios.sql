-- Ponto facial (V126): aperto de privilégios das funções criadas em 20261115200000_seg_ponto_marcacoes.sql.
-- Defesa a mais, não essencial: jb_ponto_integridade já recusa quem não está logado ou não tem permissão no DP,
-- e seg.ponto_proteger só roda como gatilho.
-- Aplicada em 16/11/2026, logo depois da migração principal.
-- Reverter: grant execute on function public.jb_ponto_integridade() to public, anon;
--           grant execute on function seg.ponto_proteger() to public, anon, authenticated;
revoke all on function public.jb_ponto_integridade() from public, anon;
revoke all on function seg.ponto_proteger() from public, anon, authenticated;
