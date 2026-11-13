-- Reversão de 20261113171500_seg_versao_aberta.sql. A página segue funcionando sem a função
-- (ela ignora a falta do registro); só se perde a conferência de versão por acesso.
drop function if exists public.jb_versao_aberta(text);
alter table seg.sessoes drop column if exists versao_em;
alter table seg.sessoes drop column if exists versao_site;
