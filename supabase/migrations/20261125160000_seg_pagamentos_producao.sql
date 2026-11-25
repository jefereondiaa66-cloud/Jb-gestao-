-- V169 (25/11/2026): Pagamentos da Produção — a Produção confere as grades, as desenfornas e as empreitas e envia ao
-- Financeiro; o compromisso entra na fila de quem paga (o Gustavo), que agenda e paga pelo Controle por grade.
--
-- Só acrescenta LEITURA. Nada muda na escrita e nenhum dado existente muda:
--  · seg.leitura_item: a Produção passa a receber (pelo jb_compartilhados, como os outros setores) os registros de
--    apoio do Financeiro (coleção fin, tipo 'meta') dos pagamentos da produção — só os de ref começando com 'pp:'
--    (pp:<trabalhador>:<envio>). É assim que a Produção vê se o pagamento que ela conferiu está na fila, agendado ou
--    pago. Os demais registros do Financeiro continuam fora do alcance da Produção.
--  · a Produção continua sem gravar no Financeiro; o Financeiro continua gravando só os pagamentos ('pag') do
--    Controle por grade (seg.escrita_item não muda).
--
-- Cópia de segurança nº 78 antes (seg.fazer_copia, 25/11/2026). Reverter: 20261125160000_seg_pagamentos_producao.down.sql

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
      -- V169: fila e agenda do pagamento que a Produção conferiu (Pagamentos da Produção)
      when 'meta' then case
        when coalesce(p_item->>'ref', '') like 'pp:%' then array['producao']
        else '{}'::text[] end
      else '{}'::text[] end
    -- configuração do barro (valor e parâmetros), usada no lançamento da maromba
    when p_raiz = 'barro' then case when p_item->>'jbt' = 'config' then array['producao'] else '{}'::text[] end
    else '{}'::text[]
  end
$function$;
