-- Desfaz 20261125160000_seg_pagamentos_producao.sql (volta como ficou em 20261116150000_seg_compartilhar_setores).
-- Nenhum dado é apagado: as conferências continuam nos lançamentos e a fila e a agenda continuam no Financeiro.
-- Sem esta leitura, a Produção volta a ver só "Na fila de pagamento" ou "Pago" (sem o dia agendado).
create or replace function seg.leitura_item(p_raiz text, p_item jsonb)
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_item is null or jsonb_typeof(p_item) <> 'object' then '{}'::text[]
    when p_raiz = 'fin' then case p_item->>'tipo'
      -- Combustível › Terceiros que abastecem
      when 'terceiro' then array['compras']
      -- responsáveis da aba do setor; o responsável do Financeiro vai no compromisso que o
      -- Almoxarifado, os Paletes e o Barro lançam
      when 'responsavel' then case
        when p_item->>'aba' = 'Financeiro' then array['almox', 'paletes', 'barro']
        when seg.modulo_da_aba(p_item->>'aba') is not null then array[seg.modulo_da_aba(p_item->>'aba')]
        else '{}'::text[] end
      -- conta em que se paga ou recebe na hora (Caixa, bancos): só o nome (o saldo inicial sai na entrega)
      when 'conta' then array['compras', 'vendas', 'almox', 'paletes', 'barro']
      -- categorias do Financeiro, usadas no compromisso que o setor lança
      when 'config' then array['compras', 'almox', 'paletes', 'barro']
      -- compromisso lançado pelo setor; despesa com combustível aparece no Setor de Combustível
      when 'titulo' then case
        when seg.modulo_da_origem(p_item->>'setorOrigem') is not null then array[seg.modulo_da_origem(p_item->>'setorOrigem')]
        when coalesce(p_item->>'categoria', '') ~* 'combust' then array['compras']
        else '{}'::text[] end
      else '{}'::text[] end
    -- configuração do barro (valor e parâmetros), usada no lançamento da maromba
    when p_raiz = 'barro' then case when p_item->>'jbt' = 'config' then array['producao'] else '{}'::text[] end
    else '{}'::text[]
  end
$function$;
