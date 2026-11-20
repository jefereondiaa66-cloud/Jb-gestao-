-- Desfaz 20261120160000_seg_lenha_pago_com_produto.sql (nenhum dado é apagado)
delete from seg.leitura_compartilhada where (raiz, modulo) in (('alm', 'compras'), ('clCtrl', 'almox'));
