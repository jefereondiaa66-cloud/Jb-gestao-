-- Reversão de 20261125233000_desp_entrega_politicas_rapidas.sql: volta as duas regras ao formato anterior
-- (mesmo efeito, só que conferido linha por linha). Não apaga dados.
alter policy docs_motorista_nao_le on public.docs using (not seg.eh_motorista());
alter policy jb_anexos_motorista on storage.objects
  using (bucket_id <> 'anexos' or not seg.eh_motorista() or owner_id = (select auth.uid())::text);
