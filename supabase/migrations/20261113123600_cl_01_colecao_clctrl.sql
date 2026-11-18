-- =====================================================================
-- Combustível e Lenha (V57) · 01 · coleção clCtrl
--
-- O QUE FAZ: registra a coleção nova "clCtrl" nas regras de acesso do banco
-- central (seg.colecoes), no mesmo módulo das outras coleções dos setores
-- de Lenha e Combustível ("compras"). Ela guarda, um registro por documento:
--   tipo 'prog'     programação de abastecimento/consumo (não move estoque)
--   tipo 'rasc'     rascunho de lançamento (leitura de foto ainda não conferida)
--   tipo 'desconto' desconto de lenha (pendente/autorizado/recusado)
--   tipo 'acerto'   acerto de lenha com fornecedor (aberto/fechado/estornado)
-- Nenhuma tabela é criada, nenhum registro existente é alterado ou apagado.
-- Auditoria: igual às outras coleções (auditar = true → seg.auditoria).
--
-- ANTES: select seg.fazer_copia();   (cópia nº 37, 13/11/2026, 626 registros)
--
-- REVERSÃO (só depois de conferir que não há registros em clCtrl, ou com
-- autorização do dono para deixá-los inacessíveis a não administradores):
--   delete from seg.colecoes where raiz = 'clCtrl';
-- =====================================================================
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('clCtrl', 'compras', false, 'dados', true)
on conflict (raiz) do nothing;
