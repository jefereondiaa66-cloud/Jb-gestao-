-- Reversão de 20261030221000_jbcore_01_ponte.sql
-- Remove só o que o JB CORE acrescentou. public.docs, seg.* e os dados
-- do sistema não são tocados. O histórico em jbcore.* é perdido: baixe
-- antes, se quiser guardar (select * from jbcore.operacoes / publicacoes).
select cron.unschedule(jobid) from cron.job where jobname in ('jbcore-hospedagem', 'jbcore-podar');
drop trigger if exists docs_jbcore_mudancas on public.docs;
drop function if exists public.jb_admin_core_painel();
drop function if exists public.jb_admin_core_conferir();
drop schema if exists jbcore cascade;
