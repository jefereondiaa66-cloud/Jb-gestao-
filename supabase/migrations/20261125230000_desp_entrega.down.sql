-- Reversão de 20261125230000_desp_entrega.sql (V177 · Despesas de Entrega)
-- Tira as duas políticas restritivas, os três gatilhos e as funções novas, e as duas coleções de
-- seg.colecoes. Nenhuma função ou regra que já existia foi trocada pela migração, então não há nada
-- para "voltar como era". Os documentos gravados em despEnt e despEntCad NÃO são apagados.
-- Antes de rodar: select seg.fazer_copia();

drop policy if exists docs_motorista_nao_le on public.docs;
drop policy if exists jb_anexos_motorista on storage.objects;
drop trigger if exists docs_aa_motorista_nao_grava on public.docs;
drop trigger if exists docs_desp_proteger_iu on public.docs;
drop trigger if exists docs_desp_proteger_d on public.docs;

drop function if exists public.jb_mot_sou();
drop function if exists public.jb_mot_eu();
drop function if exists public.jb_mot_lancar(jsonb);
drop function if exists public.jb_mot_lista(jsonb);
drop function if exists public.jb_mot_corrigir(jsonb);
drop function if exists public.jb_mot_pedir_correcao(jsonb);
drop function if exists public.jb_mot_viagem(jsonb);
drop function if exists public.jb_desp_logins();
drop function if exists seg.motorista_nao_grava();
drop function if exists seg.desp_proteger();
drop function if exists seg.desp_resumo(jsonb);
drop function if exists seg.desp_validar(jsonb, jsonb, jsonb, jsonb);
drop function if exists seg.desp_eu_motorista();
drop function if exists seg.desp_gravar_item(text, jsonb);
drop function if exists seg.desp_item(text);
drop function if exists seg.desp_mapa(text, jsonb);
drop function if exists seg.desp_regra(jsonb, text, boolean);
drop function if exists seg.desp_config();
drop function if exists seg.desp_agora();
drop function if exists seg.desp_chave(text, text);
drop function if exists seg.desp_hash(text);
drop function if exists seg.eh_motorista();
delete from seg.colecoes where raiz in ('despEnt', 'despEntCad');
