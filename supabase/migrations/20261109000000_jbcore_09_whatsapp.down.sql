-- Reversão de 20261109000000_jbcore_09_whatsapp.sql
-- Apaga a configuração, os destinatários e o histórico de envios do resumo no WhatsApp.
-- Não toca em public.docs. Baixe antes, se quiser guardar:
--   select * from jbcore.whatsapp_destinatarios; select * from jbcore.whatsapp_envios;
select cron.unschedule('jb-whatsapp-resumo');
drop function if exists jbcore.whatsapp_previa(date);
drop function if exists jbcore.whatsapp_disparar(date, text, boolean);
drop function if exists jbcore.whatsapp_chamar(jsonb);
drop function if exists public.jb_whatsapp_marcar(date, text, text, text, text);
drop function if exists public.jb_whatsapp_reservar(date, text);
drop function if exists public.jb_whatsapp_contexto();
drop function if exists public.jb_whatsapp_confere(text);
drop table if exists jbcore.whatsapp_envios;
drop table if exists jbcore.whatsapp_destinatarios;
drop table if exists jbcore.whatsapp_config;
delete from vault.secrets where name = 'jb_whatsapp_segredo';
