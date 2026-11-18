-- Reversão do Centro de Inventário: apaga o módulo INTEIRO, inclusive os dados dele.
-- Só com pedido explícito do dono e depois de baixar uma cópia (Configurações do módulo).
-- Não toca em public.docs nem nos outros setores.
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.unschedule('inv-copia-diaria');
  end if;
end $$;
drop function if exists public.jb_inv(text,jsonb);
drop schema if exists inv cascade;
