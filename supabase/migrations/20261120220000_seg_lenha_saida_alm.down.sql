-- Desfaz 20261120220000_seg_lenha_saida_alm.sql (volta como ficou em 20261120200000_seg_lenha_cadastra_item_alm)
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
