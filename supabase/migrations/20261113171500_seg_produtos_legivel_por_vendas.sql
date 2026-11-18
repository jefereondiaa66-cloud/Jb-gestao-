-- Quem pode ler o módulo Vendas passa a poder LER o cadastro de produtos.
-- Motivo: vendedor só com o módulo Vendas via "Nenhum produto ativo no Setor de Vendas"
-- ao lançar a venda, porque a coleção "produtos" pertence ao módulo Compras.
-- Só leitura: criar/editar/excluir produto continua exigindo o módulo Compras.
-- Cópia feita antes (seg.copias nº 40).
-- Reverter: recriar a função sem a linha
--   or (c.raiz = 'produtos' and seg.pode('vendas', 'ler'))
create or replace function seg.raizes_legiveis()
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(array_agg(c.raiz), '{}'::text[])
  from seg.colecoes c
  where seg.liberado() and (c.tipo = 'geral' or seg.pode(c.modulo, 'ler')
         or (c.raiz = 'produtos' and seg.pode('vendas', 'ler')))
    and c.raiz <> 'data'   -- V68: preferências de cada pessoa, só a própria
$function$;
