-- Setor da Lenha V142 (20/11/2026): fornecedor de lenha pago com produto (bota, EPI, material...)
-- O pagamento fica no controle da lenha (coleção clCtrl, módulo Compras) e o item sai do estoque do
-- Almoxarifado (coleção alm, módulo Almoxarifado). Para os dois setores enxergarem a mesma coisa:
--   · quem tem Compras (Setor da Lenha) lê o almoxarifado: escolher o item e ver saldo e custo médio;
--   · quem tem Almoxarifado lê o controle da lenha: o item dado ao fornecedor sai do saldo dele.
-- Só leitura; cada setor continua gravando só o que é dele. Nenhum dado existente é alterado.
-- Cópia de segurança nº 60 feita antes.
-- Reverter: rodar 20261120160000_seg_lenha_pago_com_produto.down.sql
insert into seg.leitura_compartilhada (raiz, modulo, motivo) values
  ('alm',    'compras', 'Setor da Lenha: pagar fornecedor com item do almoxarifado (saldo e custo médio)'),
  ('clCtrl', 'almox',   'Almoxarifado: item dado a fornecedor de lenha como pagamento sai do estoque')
on conflict do nothing;
