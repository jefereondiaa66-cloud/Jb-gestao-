-- Setor do Barro · extração (V57, 01/11/2026)
-- Acrescenta a coleção "barro" (agrupada por mês, como alm e pal) e o módulo de permissão
-- "barro". Quem já tinha acesso ao Almoxarifado recebe o mesmo acesso ao Barro; o
-- administrador muda depois em admin.html. Nenhum dado existente é alterado.
-- Reverter: delete from seg.permissoes where modulo='barro';
--           delete from seg.colecoes where raiz='barro';
--           delete from seg.modulos where codigo='barro';
insert into seg.modulos (codigo, nome, descricao, ordem)
values ('barro', 'Barro – extração', 'Jazidas, motoristas, caçambas, extração diária, custo do barro, estoque e motoristas a pagar', 14)
on conflict do nothing;
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('barro', 'barro', true, 'dados', true)
on conflict do nothing;
insert into seg.permissoes (user_id, modulo, ler, criar, editar, excluir)
select user_id, 'barro', ler, criar, editar, excluir from seg.permissoes where modulo = 'almox'
on conflict do nothing;
