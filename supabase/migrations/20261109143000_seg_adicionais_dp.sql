-- Coleção "adicionais" do Setor Pessoal: lançamentos de insalubridade e adicional noturno.
-- Agrupada por mês e com as mesmas permissões do módulo Folha (igual a "vales").
-- Só acrescenta uma linha em seg.colecoes; não altera nenhum dado.
-- Antes de aplicar: select seg.fazer_copia();
-- Reverter: rodar 20261109143000_seg_adicionais_dp.down.sql (só depois de confirmar que a coleção está vazia).
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('adicionais', 'folha', true, 'dados', true)
on conflict do nothing;
