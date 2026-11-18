-- Reversão de 20261108120000_jbcore_08_fiscal.sql
-- Remove só o que o JB Fiscal acrescentou. public.docs, seg.* e os dados do
-- sistema não são tocados (as notas, a configuração fiscal e os XML guardados
-- pelo programa ficam em public.docs e continuam lá).
-- ATENÇÃO: o histórico do serviço fiscal é perdido. Baixe antes, se quiser guardar:
--   select * from jbcore.fiscal_auditoria;  select * from jbcore.fiscal_envios;
-- Depois desta reversão, a ponte do Claude e a nuvem recebem erro ao chamar o
-- serviço fiscal (nada é emitido); desligue também a função jb-fiscal no Supabase.
drop function if exists jbcore.fiscal(text, jsonb, text);
drop function if exists public.jb_fiscal_auditoria(integer);
drop function if exists public.jb_fiscal_registrar(jsonb);
drop function if exists public.jb_fiscal_envio(text, text);
drop function if exists public.jb_fiscal_marcar(text, text, text, text);
drop function if exists public.jb_fiscal_reservar(text, text, text, text);
drop function if exists public.jb_fiscal_confere(text);
drop table if exists jbcore.fiscal_envios;
drop table if exists jbcore.fiscal_auditoria;
delete from vault.secrets where name = 'jb_fiscal_segredo';
