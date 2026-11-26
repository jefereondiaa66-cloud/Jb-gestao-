-- Reversão de 20261125234000_desp_entrega_execucao.sql: volta a permissão de execução ao padrão anterior (todos).
-- Não apaga dados. Para tirar o módulo inteiro do banco: 20261125230000_desp_entrega.down.sql.
grant execute on function public.jb_mot_sou(), public.jb_mot_eu(), public.jb_mot_lancar(jsonb), public.jb_mot_lista(jsonb),
  public.jb_mot_corrigir(jsonb), public.jb_mot_pedir_correcao(jsonb), public.jb_mot_viagem(jsonb), public.jb_desp_logins()
  to public;
