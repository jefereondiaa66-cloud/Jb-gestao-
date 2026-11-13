# Combustível e Lenha · reestruturação (V57) · 13/11/2026

Relatório técnico do "Projeto master — reestruturação e evolução dos módulos de Combustível e Lenha".
Tudo foi feito dentro do programa que já existe (`app/jb-gestao.html`, bloco
`/* Combustível e Lenha · reestruturação (V57) */`, logo depois do bloco V56). Nenhum dado foi apagado,
nenhuma coleção antiga mudou de formato e nenhum cálculo antigo foi trocado.

## 1. Diagnóstico inicial

| Peça | O que existia |
|---|---|
| Dados | `public.docs` no banco central. Lenha e Combustível usam as coleções `compras`, `consumos`, `estoqueMov` (agrupadas por mês), `produtos`, `locais`, `fornecedores` (módulo `compras` no `seg`). Em 13/11: 431 compras de lenha (412 importadas do controle antigo, "pagas antes do sistema"), 27 de combustível, 27 consumos de lenha, 68 abastecimentos. |
| Estoque | Sempre **calculado** dos lançamentos (`saldos()`): compras + movimentações − consumos (posto externo não conta). Não há contador que possa ser somado duas vezes. |
| Gravação | Cada lançamento tem identificador único; gravar o mesmo de novo substitui, não duplica. A ponte do Claude manda `op_id` único (`jbcore.aplicar`), já testado (teste E). |
| Combustível | Abastecimento (V48: terceiros, posto externo a prazo → conta no Financeiro), totalizador da bomba (V55), lançar vários, conferência das bombas, terceiros, operador ↔ máquina (V56). |
| Lenha | Compras e consumo; custo médio ponderado mês a mês, diagnóstico das compras, mão de obra (V50); a Produção liga a lenha à fornada **só pelo forno e pela data**. |
| Financeiro | A conta a pagar mora na própria compra (`pagamentos[]`); o Financeiro lê as compras (base única, sem cópia). |

**Problemas encontrados**

1. Saldo negativo de combustível era aceito por qualquer perfil, só com um aviso (V48); sem autorização nem registro.
2. Não havia saída de combustível (retirada para fora das máquinas) nem programação de abastecimento/consumo.
3. Não havia lançamento por foto (só anexar a foto).
4. Lenha: nenhum controle de **desconto** do fornecedor, de **acerto** nem de "quanto ainda pode ser descontado".
5. Consumo de lenha sem identificador da fornada: a Produção atribuía pelo período, sem vínculo explícito.
6. Menu com 10–14 abas em linha, sem grupos e sem pesquisa.
7. Abastecimento em posto a prazo: se a conta ao posto falhasse, só aparecia um aviso na hora (sem reconciliação).
8. Qualquer perfil que lança podia excluir lançamento de estoque (V51).

## 2. O que foi aproveitado (sem duplicar)

Formulário e lista padrão (`MODS`, gaveta, filtros, exportação, total da V51), compra/venda (`confirmarOpV`,
numeração reservada), estoque calculado, Financeiro (lê as compras), histórico de alterações (`log`),
documentos (`verDoc`, PDF, Word), totalizador da bomba, terceiros, lançar vários, custo da lenha, fornos
(`locais` tipo Forno) e fornadas da Produção (`pfornadas`). "Entrada" de combustível e de lenha continua sendo a
**compra** (que já gera conta a pagar) — não foi criado um segundo cadastro de entradas.

## 3. O que foi implementado

### Organização e uso
- **Menu de funções agrupado** nos dois setores (Combustível: Operações · Controle · Gestão; Lenha: Operações ·
  Controle · Financeiro · Relatórios), com **pesquisa**, ícones, marcação de pendências e 5 atalhos fixos na barra.
  Continua aberto se a tela for redesenhada pela sincronização.
- **Central de lançamentos** (`#/clLanc`): abastecer veículo, abastecer máquina, fotografar comprovante, entrada,
  saída, transferência, entrada sem nota, lançar vários, programar, consultar; pendências e últimas movimentações.
- **Início** dos dois setores ganhou pendências, próximas programações e (Lenha) "lenha a pagar".

### Combustível
- **Saída** (`estoqueMov` tipo Saída) com destino e responsável; **transferência** e entrada sem nota com foto.
- **Saldo negativo**: sem a permissão `clNegativo` (gerente/administrador) o lançamento é recusado; com ela, exige
  motivo, grava `negativoAutorizado {por, em, motivo, saldo antes/depois}` no lançamento e no histórico.
- **Programações** (`#/clProg`): descrição, veículo/máquina ou setor, combustível, quantidade, data, periodicidade
  (única, diária, semanal, quinzenal, mensal), responsável, observações, situação (Programado, Pendente — data
  passou —, Realizado, Cancelado). **Não movimentam nada.** "Realizar" abre o abastecimento já preenchido; ao salvar,
  a programação vira Realizada (com o lançamento) e a recorrente gera a próxima. Não se realiza duas vezes.
  Avisos de atrasadas e das próximas 2 datas nas pendências e no início.

### Leitura por foto (OCR)
- `#/clFoto`: cupom do posto, foto da bomba/ficha, nota de entrada, ficha de retirada (Combustível); nota/romaneio
  e ficha do forno (Lenha). Foto da câmera ou da galeria, **comprimida** antes (máx. 1800 px, JPEG).
- Lê data, hora, fornecedor (pelo CNPJ cadastrado; pelo nome = "conferir"), combustível, litros/m³, preço,
  total (confere quantidade × preço = total), placa (→ veículo cadastrado), km/horímetro, responsável,
  totalizador da bomba, nº do documento e forno.
- **Nada é gravado pela leitura**: abre o formulário de sempre preenchido, com aviso "confira antes de salvar" e os
  campos duvidosos marcados. Campo que não aparece fica em branco. "Guardar para conferir depois" cria um
  **rascunho** (não mexe em estoque nem financeiro); "Conferência de lançamentos" lista os rascunhos.
- Dependência externa: biblioteca **Tesseract.js 5.1.1** (código aberto), baixada do jsDelivr só quando alguém toca
  em "Ler a foto" (cerca de 15 MB na primeira vez); a leitura roda no próprio aparelho. Sem internet ou com a
  biblioteca bloqueada, a tela diz isso e oferece "lançar manualmente com a foto".

### Lenha
- **Consumo ligado à fornada** da Produção (`fornadaId`, mesmo forno): grava `origemId = pfornada:<id>` e os
  milheiros da fornada; o relatório "Consumo por fornada" mostra o que é ligado e o que é "pelo período".
- **Regra do contrato** no cadastro do fornecedor (percentual, valor por m³, valor fixo por carga, cláusula e
  vigência): só **sugere** o valor do desconto.
- **Descontos** (`#/clDesc`): fornecedor, origem (carga com problema, regra do contrato, lenha da fábrica entregue
  ao fornecedor, outro documento), compra ou documento de origem obrigatório, valor, motivo, anexo.
  Nascem "Aguardando autorização"; só o administrador autoriza/recusa (data e nome gravados); depois disso não se
  editam (corrige-se cancelando). A regra do contrato não pode ser usada duas vezes na mesma carga.
- **Acerto de lenha** (`#/clAcerto`): fornecedor + período → compras ainda não acertadas, quantidade, valor bruto,
  pagamentos, descontos autorizados (escolher quais usar), outros ajustes (negativo abate; positivo vira compromisso
  no Financeiro), saldo pendente e **valor líquido a pagar**. Fechar exige "conferi" e a permissão de fechar.
  - O desconto vira **abatimento dentro da compra** (`abatimentos[]`, código fixo por desconto e compra): contas a
    pagar e Financeiro passam a mostrar o líquido sem nenhuma cópia.
  - Compras e descontos ficam travados no acerto (não entram em outro, a compra não se cancela/exclui).
  - Fechamento em etapas com estado "Fechando": se a conexão cair no meio, aparece nas pendências e "Retomar o
    fechamento" termina sem repetir nada.
  - **Estorno** (só administrador, com motivo): abatimentos ficam guardados como estornados, compras e descontos são
    liberados, acréscimos no Financeiro são cancelados. Nada é apagado.
  - **Demonstrativo** para imprimir/PDF/Word (compras, descontos com quem autorizou, ajustes, resumo e assinaturas)
    e exportação em Excel.
- **Valores a pagar** por fornecedor, **Pagamentos** (dinheiro) separados dos **abatimentos**, histórico de acertos.

### Relatórios (`#/clRel`)
Período: hoje, 7 dias, mês ou personalizado. Combustível: painel, abastecimentos, por veículo (km/horas rodados e
média), por motorista, por tipo de máquina, entradas, saídas, gastos (notas + posto), estoque, programações,
movimentações. Lenha: painel, entradas, consumo, estoque, por forno, por fornada, fornecedores, descontos, acertos,
programações, movimentações. Todos com total e exportação (visualizar, PDF, Excel). Os relatórios antigos
(`#/relvendas`, Custo da lenha, Diagnóstico) continuam como estavam.

### Reconciliação (Conferência de lançamentos, `#/clConf`)
Rascunhos de foto; programações atrasadas; lançamento feito por programação sem a baixa da programação
("corrigir" marca sem lançar de novo); **abastecimento em posto a prazo sem conta a pagar** ("lançar a conta" cria
com o código `cons-<id>`, o mesmo da V48, então nunca duplica); descontos aguardando autorização; acertos com
fechamento incompleto.

## 4. Permissões (Controle de usuários, por perfil)

| Permissão | Perfis |
|---|---|
| Registrar movimentações, foto, programações (`clLanc`, `clFoto`, `clProg`) | administrador, gerente, estoquista |
| Autorizar saldo negativo (`clNegativo`) · excluir lançamento de estoque (`clExcluir`) | administrador, gerente |
| Consultar valores financeiros da lenha (`clFin`, `clAPagar`, `clPag`, `clAcerto` ver) · pedir desconto (`clDesc`) | administrador, gerente, financeiro |
| Montar/conferir acerto (`clAcerto` editar) | administrador, financeiro |
| Autorizar desconto, fechar e estornar acerto | **só administrador** |

Nenhuma permissão administrativa é dada automaticamente. Toda ação relevante grava usuário, data/hora, operação,
antes/depois e motivo no histórico (`log`), e o banco central guarda o antes/depois em `seg.auditoria`.

## 5. Banco de dados: cópia e migração

- Cópia de segurança nº **37** (13/11/2026 12:35, 626 registros) feita antes da migração.
- Migração `supabase/migrations/20261113123600_cl_01_colecao_clctrl.sql`: registra a coleção `clCtrl` em
  `seg.colecoes` (módulo `compras`, auditada). Só acrescenta. Reversão no cabeçalho.
- `clCtrl` guarda programações, rascunhos, descontos e acertos (um registro por documento, campo `tipo`).
- Campos novos só acrescentados: `consumos.negativoAutorizado/progId/rascId/fornadaId/origemId/fornadaRef`,
  `estoqueMov.destino/responsavel/anexo`, `compras.abatimentos/acertoId/comprovanteFoto`, `fornecedores.regra*`.

## 6. Testes executados

`node scripts/testar-combustivel-lenha.mjs` abre o programa real no Chromium com o banco central simulado e
confere tela, cálculo e o que chegou ao banco. Resultado em 13/11/2026: **63 de 63 aprovados** (OCR com a
biblioteca servida localmente a partir dos mesmos pacotes do npm). Em 11 execuções seguidas, 10 passaram inteiras e
1 teve 2 falhas que não se repetiram nas 10 seguintes (não identificadas; ver pendências).

Combustível: entrada pela compra → estoque e Financeiro; abastecimento manual pela tela; resposta perdida e
reenvio sem duplicar; saldo negativo recusado ao estoquista, com motivo para o gerente e registrado; entrada sem
nota, saída com destino e transferência; programação (não mexe no estoque, realizar lança uma vez, recorrente gera a
próxima, cancelar com motivo); dois lançamentos simultâneos; relatórios por veículo e motorista; **OCR** do cupom
(litros, preço, total, placa → veículo, CNPJ → posto, combustível, data, confiança 93%) → formulário de conferência →
abastecimento em posto sem mexer no estoque → conta a pagar no Financeiro; **saída por foto**.

Lenha: entradas e consumo (estoque); consumo ligado à fornada (origem, milheiros, relatório por fornada, a Produção
vê a lenha); regra do contrato sugere 10%; regra não se usa duas vezes; desconto sem documento recusado; desconto
pendente não entra no acerto; autorização com nome e data; acerto (bruto 3.757,50 − descontos 357,50 − ajuste 50 =
3.350,00), não fecha sem "conferi", fecha mesmo com respostas perdidas, saldos líquidos nas compras e no Financeiro,
abatimentos sem repetição no banco, compra travada, nada reaproveitado em outro acerto, demonstrativo; estorno;
fechamento interrompido aparece nas pendências e retomado duas vezes sem duplicar.

Integração e telas: permissões do estoquista; menus agrupados e pesquisa; central com as ações; todas as telas
novas abertas sem erro de JavaScript; capturas no computador e no celular (390 px) conferidas.

Também: `node scripts/verificar.mjs` (21/21) e `node scripts/testar-navegador.mjs` (8/8) continuam passando.

## 7. Pendências e riscos

1. **OCR dentro do Claude não testado ao vivo**: depende de o artifact permitir baixar a biblioteca do jsDelivr e
   criar o "worker" da leitura. Se não permitir, a tela avisa e o lançamento segue manual com a foto. Na nuvem
   (Netlify) não há bloqueio de conteúdo.
2. OCR de foto tremida, escura ou manuscrita lê pouco: por isso tudo passa por conferência. Fichas escritas à mão
   em geral não são reconhecidas.
3. Anexos: no Claude ficam no armazenamento do artifact; na nuvem, no Supabase Storage (situação anterior, não mudou).
4. As 412 compras de lenha importadas ("pagas antes do sistema") não entram em acerto nem em valores a pagar.
5. O vínculo consumo → fornada vale para lançamentos novos; os 27 consumos antigos continuam "pelo período".
6. Uma falha intermitente do teste automático (1 em 11 rodadas) não foi reproduzida; acompanhar no GitHub Actions.
7. Mudança de comportamento: estoquista não exclui mais lançamento de estoque (pede ao gerente).
