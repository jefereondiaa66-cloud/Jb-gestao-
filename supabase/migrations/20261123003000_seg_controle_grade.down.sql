-- Desfaz 20261123003000_seg_controle_grade.sql (volta como ficou em 20261120230000_seg_lenha_entrada_alm).
-- Nenhum dado é apagado: os lançamentos, pagamentos e trabalhadores por grade continuam em public.docs.
-- Sem o registro das coleções, só o administrador volta a ler e gravar o controle por grade.
delete from seg.leitura_compartilhada where raiz in ('prodGrade', 'prodGradeTrab') and modulo = 'financeiro';
delete from seg.colecoes where raiz in ('prodGrade', 'prodGradeTrab');

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
    when p_raiz = 'alm' and p_item->>'jbt' = 'entrada' and coalesce(p_item->>'paraFornLenha', '') <> '' then 'compras'
  end
$function$;
