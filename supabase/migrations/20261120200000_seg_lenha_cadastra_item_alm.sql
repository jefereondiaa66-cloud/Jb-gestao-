-- V147 (20/11/2026): no pagamento de fornecedor de lenha com produto, o Setor da Lenha (módulo Compras)
-- pode cadastrar um item novo no Almoxarifado. Só itens marcados origemCadastro = 'Setor da Lenha'
-- (o Almoxarifado continua editando qualquer item pelo próprio módulo). Nenhum dado existente muda.
-- Cópia de segurança nº 61 antes. Reverter: 20261120200000_seg_lenha_cadastra_item_alm.down.sql
create or replace function seg.escrita_item(p_raiz text, p_item jsonb)
 returns text language sql immutable set search_path to ''
as $function$
  select case
    when p_item is null or jsonb_typeof(p_item) <> 'object' then null
    when p_raiz = 'fin' then case p_item->>'tipo'
      when 'terceiro' then 'compras'
      when 'responsavel' then case
        when p_item->>'aba' in ('Óleo e combustível', 'Lenha', 'Almoxarifado / Cozinha', 'Barro', 'Paletes')
          then seg.modulo_da_aba(p_item->>'aba') end
      when 'titulo' then seg.modulo_da_origem(p_item->>'setorOrigem')
    end
    when p_raiz = 'alm' and p_item->>'jbt' = 'item' and p_item->>'origemCadastro' = 'Setor da Lenha'
      and coalesce(p_item->>'categoria', '') <> 'Cozinha' then 'compras'
  end
$function$;
