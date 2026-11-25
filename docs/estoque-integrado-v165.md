# V165 · Estoque integrado: Almoxarifado ↔ Setor de Combustível (25/11/2026)

Pedido do Jeferson ("Prompt mestre — integração inteligente de estoques"), com três exigências dele:
testes só com dados fictícios, compra × transferência sem estoque em dobro, e o lançamento pelo
Almoxarifado já dizendo de qual setor é cada produto, com a opção de transferir. Plano aprovado em
25/11/2026 com duas decisões: o que é do Combustível vai **direto** para o estoque do Combustível na
entrada; os **filtros ficam no Almoxarifado** (Peças e manutenção).

## Como ficou

| Peça | Onde | O que faz |
|---|---|---|
| Cadastro mestre | itens do almoxarifado (`alm`, `jbt: item`) | Categoria nova **Combustíveis e lubrificantes** (CMB-001…). O item mestre liga ao produto do Combustível: `produtoSetorId`, `fatorSetor` (1 balde = 20 L), `ligadoEm`. O cadastro do Combustível não muda. |
| Classificação | `JB_ESTOQUE.classificar` | Ligado → Combustível; categoria (Cozinha, Limpeza e EPI ficam); nome (diesel, S10, S500, gasolina, Arla, óleo de motor/hidráulico/transmissão, 15W40, graxa, fluido de freio, aditivo); último destino; senão Almoxarifado. Filtros, mangueiras e óleo de soja nunca vão para o Combustível. |
| Entrada pelo Almoxarifado | Nova entrada | Cada linha mostra o destino e o motivo; dá para trocar. Ao confirmar, a linha do Combustível grava `destino`, `produtoSetorId` e `qtdSetor` (o item é ligado e, se preciso, o produto do setor é criado). Um registro, uma conta a pagar. |
| Transferir | `alm`, `jbt: transf` | Almoxarifado → Combustível, inteiro ou em parte, com fator de unidade. Não muda o total, não gera conta. |
| Devolver ao Almoxarifado | `estoqueMov`, tipo `Transferência entre setores` (`almItemId`, `qtdAlm`) | Combustível → Almoxarifado. |
| USAR | `consumos`, `acao: usar` | Produto, quantidade, veículo/máquina (opcional), finalidade (obrigatória), confirmação. Só baixa ao confirmar. |
| Requisição de outro setor | `estoqueMov`, tipo `Saída`, `requisicao: true` | Saída para o setor que pediu (ex.: DP, 5 L de óleo), com quem retirou e quem autorizou. Não é consumo do Combustível. |
| Compra × transferência | Nova entrada do almoxarifado e Nova compra do Combustível | Mesma nota + fornecedor no outro setor: barrado. Mesmo produto e quantidade (±3%) em até 7 dias: pergunta "compra nova ou o mesmo material?"; compra nova exige o número da nota. Produto com saldo no Almoxarifado: lembra de transferir. |
| Estoque integrado | `#/estoqueCentral` (aba do Almoxarifado e atalho no Estoque do Combustível) | Saldo por setor e total (Almoxarifado × fator + Combustível), abaixo do mínimo, conferência de cadastro, botão para criar os códigos mestres e a central de movimentações dos dois setores (filtros: pesquisa, setor, tipo, produto, usuário, período; origem e destino; comprovante ao tocar). |
| Concorrência | migração `20261125120000_seg_estoque_versoes` | `seg.estoque_versao`: cada produto tem uma versão; um gatilho em `public.docs` aumenta a versão a cada gravação que mexe nele (nunca bloqueia a gravação). Transferir, devolver, USAR e requisição leem a versão ao abrir a janela e reservam ao confirmar (`jb_estoque` na nuvem, `jbcore.estoque_ponte` no Claude). Se outra pessoa mexeu no meio tempo, recusa e pede para conferir de novo. |

## Saldos

Continuam **calculados** dos lançamentos. `saldos()` (setores) soma também `JB_ESTOQUE.entradasNoSetor()`
(linhas de entrada com destino ao setor e transferências). `calcAlm()` deixa de fora as linhas que foram
para o setor e desconta/soma as transferências. O custo médio do Combustível inclui as entradas do
almoxarifado (pelo preço da linha) e as transferências (pelo custo médio do almoxarifado).

Registros antigos sem destino continuam no almoxarifado. Um item ligado depois manda para o setor só as
entradas feitas depois da ligação (`ligadoEm`); o saldo que já estava no almoxarifado fica lá até alguém
transferir.

## Testes

`node scripts/construir.mjs && node scripts/testar-estoque-integrado.mjs` — programa real no navegador,
banco simulado, só dados fictícios: classificação, códigos mestres sem mexer nos produtos, entrada com
destino, nota repetida barrada, compra nova × mesmo material, ligar com fator e transferir, USAR, requisição
do DP, devolução, concorrência (versão), queda de conexão sem duplicar, soma dos setores = total, telas e
nenhum erro de JavaScript.

## Como desfazer

Código: GitHub › Actions › "Reverter publicação". Banco: `20261125120000_seg_estoque_versoes.down.sql`
(não mexe nos dados). Os registros novos (itens mestres, transferências, usos) ficam no histórico e na
auditoria.

## V168 · Cadastro automático nos dois lados (25/11/2026)

Pedido do Jeferson: cadastrou no Combustível, aparece no Almoxarifado, e vice-versa, já com o código mestre.

- **Produto novo no Setor de Combustível** → o item mestre (CMB-…, categoria Combustíveis e lubrificantes) é criado
  sozinho no Almoxarifado, ligado ao produto. Se já existe no almoxarifado um item com o mesmo nome e unidade, sem
  ligação, ele é ligado em vez de criar outro.
- **Item novo no Almoxarifado que é do Combustível** (categoria Combustíveis e lubrificantes, ou reconhecido pelo nome
  e em litro ou kg) → o produto é criado sozinho no Setor de Combustível (ou ligado ao de mesmo nome e unidade).
- Só no cadastro novo; editar não cria nada. Sem saldo: o estoque continua entrando pela compra ou pela entrada.
- Item reconhecido pelo nome em outra unidade (balde, caixa…) não liga sozinho: vai para a Conferência de cadastro,
  onde se escolhe o fator (ex.: 1 balde = 20 L).
- Teste: parte 13 de `scripts/testar-estoque-integrado.mjs`.

## V168 · Entrada de produtos com foto, valor e observação para completar depois (25/11/2026)

- **Entrada de produtos** (Estoque integrado e Estoque do Combustível): várias linhas de produto, quantidade, valor
  (opcional) e observação/descrição. Entra no estoque do Combustível na hora e aparece também no Almoxarifado.
- É **um lançamento só** (`estoqueMov`, tipo `Entrada`, `integrado: true`, com `valorUnit`, `valorEntrada`, `obs`, `foto`).
  Sem foto ou sem valor fica **pendente**: aparece em "Entradas de produtos" no Estoque integrado e no Estoque do
  Combustível e nas PENDÊNCIAS. **Completar** (foto, valor, observação) em qualquer um dos dois atualiza o mesmo
  lançamento; a quantidade não muda depois. O valor entra no custo médio.
- **Duplicidade**: antes de gravar, o mesmo produto com a mesma quantidade nos últimos 3 dias (entrada, compra ou
  entrada pelo almoxarifado) ou repetido na mesma lista é avisado; só grava se a pessoa confirmar que é outro.
- Teste: parte 14 de `scripts/testar-estoque-integrado.mjs`.
- **Na tela Estoque do Combustível**: o cartão do produto com entrada pendente mostra a etiqueta "Pendente: foto e valor";
  tocar no cartão abre o lançamento para completar. Enquanto pendente, a **quantidade** também é editável (muda o saldo,
  com o antes e o depois no histórico; não pode ficar menor que o que já saiu). Completa, a quantidade só muda por Ajuste.
- Teste: parte 15 de `scripts/testar-estoque-integrado.mjs`.

## V170 · Tocar em qualquer cartão do Estoque do Combustível abre o lançamento (25/11/2026)

Pedido do Jeferson: produto já cadastrado, mas sem quantidade, valor, peso e foto. Tocar no cartão do produto
(Setor de Combustível › Estoque) abre **Lançar · produto** com quantidade, valor unitário, **peso/embalagem**, observação,
foto e data. Grava a mesma entrada integrada da V168 (aparece no Almoxarifado; sem foto ou sem valor fica pendente),
com o aviso de duplicidade. Se o produto já tem entrada pendente, o toque abre a pendente para completar (que agora
também tem peso/embalagem). Teste: parte 16 de `scripts/testar-estoque-integrado.mjs`.
