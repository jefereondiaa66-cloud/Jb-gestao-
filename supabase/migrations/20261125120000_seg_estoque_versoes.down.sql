-- Reversão de 20261125120000_seg_estoque_versoes.sql (V165). Não mexe em public.docs.
drop trigger if exists docs_estoque_versao on public.docs;
drop function if exists public.jb_estoque(text, jsonb);
drop function if exists jbcore.estoque_ponte(text, jsonb, text);
drop function if exists seg.estoque_executar(text, jsonb);
drop function if exists seg.estoque_versao_docs();
drop function if exists seg.estoque_chaves(jsonb);
drop table if exists seg.estoque_versao;
