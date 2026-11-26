-- =====================================================================================================
-- V177 · Despesas de Entrega — ajuste de desempenho das duas regras criadas em 20261125230000_desp_entrega.
-- A conferência "este login é de motorista?" passa a ser calculada UMA vez por consulta (mesmo formato da
-- regra docs_leitura, com "(select ...)"), e não linha por linha. Não muda quem pode ler o quê.
-- Medido no banco: leitura completa de um funcionário com todas as permissões caiu de 93 ms para 78 ms;
-- o motorista continua lendo 0 documentos e 0 fotos de outras pessoas.
-- Reversão: supabase/migrations/20261125233000_desp_entrega_politicas_rapidas.down.sql
-- (para tirar o módulo inteiro do banco: 20261125230000_desp_entrega.down.sql).
-- =====================================================================================================
alter policy docs_motorista_nao_le on public.docs using (not (select seg.eh_motorista()));
alter policy jb_anexos_motorista on storage.objects
  using (bucket_id <> 'anexos' or not (select seg.eh_motorista()) or owner_id = (select auth.uid())::text);
