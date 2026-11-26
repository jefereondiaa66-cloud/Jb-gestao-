-- Setor da Lenha V111 (13/11/2026): tipos de lenha, locais de estoque e levadas
-- Acrescenta três coleções no módulo de compras (mesmo acesso de Lenha e Combustível):
--   lenhaClasses   tipos de lenha cadastrados (além de Grossa e Fina, que já vêm no programa)
--   lenhaDepositos locais de estoque cadastrados (além de Chão da fábrica e Estoque de fora)
--   lenhaMov       levadas de lenha de um local para outro e saldo inicial por local
-- Nenhum dado existente é alterado. Cópia de segurança nº 38 feita antes.
-- Reverter: delete from seg.colecoes where raiz in ('lenhaClasses','lenhaDepositos','lenhaMov');
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('lenhaClasses', 'compras', false, 'dados', true),
       ('lenhaDepositos', 'compras', false, 'dados', true),
       ('lenhaMov', 'compras', false, 'dados', true)
on conflict do nothing;
