-- V148 (20/11/2026): EPI ou material dado ao fornecedor de lenha é uma saída do almoxarifado (requisição com
-- destino "Fornecedor de lenha (terceiros)" e o campo pagLenha). O Setor da Lenha (módulo Compras) pode gravar
-- essa saída pelo Lançar lenha e pela compra de lenha. Só saídas com pagLenha; nunca item da Cozinha.
-- O resto do almoxarifado continua só com o módulo Almoxarifado. Nenhum dado existente muda.
-- Cópia de segurança nº 62 antes. Reverter: 20261120220000_seg_lenha_saida_alm.down.sql
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
    when p_raiz = 'alm' and p_item->>'jbt' = 'saida' and jsonb_typeof(p_item->'pagLenha') = 'object'
      and coalesce(p_item->'pagLenha'->>'fornecedorId', '') <> '' then 'compras'
  end
$function$;
