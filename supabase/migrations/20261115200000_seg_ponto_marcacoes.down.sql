-- Reverte 20261115200000_seg_ponto_marcacoes.sql (ponto facial V125).
-- Tira a proteção e o registro das coleções. As marcações e os eventos já gravados continuam em public.docs
-- (colecao 'pontoMarcacoes' e 'pontoEventos'); ninguém além do administrador volta a enxergá-los.
drop trigger if exists docs_ponto_proteger_iu on public.docs;
drop trigger if exists docs_ponto_proteger_d on public.docs;
drop function if exists public.jb_ponto_integridade();
drop function if exists seg.ponto_proteger();
drop function if exists seg.ponto_elo(text, jsonb);
drop table if exists seg.ponto_cadeia;
delete from seg.colecoes where raiz in ('pontoMarcacoes', 'pontoEventos');
