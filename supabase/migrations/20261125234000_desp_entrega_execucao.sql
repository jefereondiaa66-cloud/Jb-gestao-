-- =====================================================================================================
-- V177 · Despesas de Entrega — as funções novas seguem o padrão das outras do sistema: só quem entrou chama.
-- Antes deste ajuste qualquer um podia chamá-las (sem login elas já recusavam, porque conferem a sessão);
-- o verificador de segurança do Supabase apontou. Nada muda para quem está logado.
-- Reversão: supabase/migrations/20261125234000_desp_entrega_execucao.down.sql
-- =====================================================================================================
revoke execute on function public.jb_mot_sou(), public.jb_mot_eu(), public.jb_mot_lancar(jsonb), public.jb_mot_lista(jsonb),
  public.jb_mot_corrigir(jsonb), public.jb_mot_pedir_correcao(jsonb), public.jb_mot_viagem(jsonb), public.jb_desp_logins()
  from public, anon;
grant execute on function public.jb_mot_sou(), public.jb_mot_eu(), public.jb_mot_lancar(jsonb), public.jb_mot_lista(jsonb),
  public.jb_mot_corrigir(jsonb), public.jb_mot_pedir_correcao(jsonb), public.jb_mot_viagem(jsonb), public.jb_desp_logins()
  to authenticated, service_role;
