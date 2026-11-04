-- Formas de pagamento cadastradas (V62, 04/11/2026)
-- Acrescenta a coleção "formasPag" no módulo de compras (mesmo acesso de Lenha e Combustível):
-- formas usadas para pagar as compras de lenha, cada uma dizendo se tira dinheiro do Caixa/banco.
-- Nenhum dado existente é alterado. Cópia de segurança nº 12 feita antes.
-- Reverter: delete from seg.colecoes where raiz='formasPag';
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('formasPag', 'compras', false, 'dados', true)
on conflict do nothing;
