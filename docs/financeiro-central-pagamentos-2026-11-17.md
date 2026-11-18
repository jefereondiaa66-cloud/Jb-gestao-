# Financeiro: auditoria e Central de pagamentos (17/11/2026)

Pedido do Jeferson ("prompt master" da reengenharia do Financeiro): auditar o setor inteiro antes de mexer,
organizar o Financeiro como **central de pagamentos** com módulos independentes e integrados
(Lenha, Combustível, Despesas gerais, Outros pagamentos), situações simples, formulários rápidos,
navegação linear, integridade dos dados e os 14 testes obrigatórios num ambiente separado.

Bloco no programa: `<script id="central-pagamentos">` (e `<style id="central-pagamentos-css">`) no fim de
`app/jb-gestao.html`. Teste: `node scripts/testar-central-pagamentos.mjs`.

## 1. Auditoria (antes de mudar)

Como foi feita: o programa real com o banco simulado (contas, compromissos de vários tipos, compras de lenha e
de combustível, despesa do Setor Pessoal, extrato e importação), passando por **24 telas** do Financeiro e
clicando em **cada botão, link, linha e aba** de cada tela (cerca de 230 cliques), anotando o que acontece
(janela, gaveta, menu, aviso, troca de tela, download) e qualquer erro de JavaScript. Depois as mesmas telas
no celular (390 px), conferindo se algo passa da largura. Mais a leitura do código de cálculo
(`obrigacoes`, `situacao`, `saldoConta`, painel, contas a pagar, pagamentos do dia, calendário).

Resultado geral: **nenhum erro de JavaScript, nenhum botão quebrado e nenhuma tela passando da largura no
celular**. Os cálculos de saldo, parcial, vencido e divergência estão certos e são calculados dos fatos (nada
gravado como "situação"). O que foi encontrado e corrigido:

| # | Onde | Problema | Correção |
|---|------|----------|----------|
| 1 | Listas em cartões (Pagamentos do dia, Pagamentos e outras telas com vários botões na linha) | A coluna de botões era medida só pelo primeiro botão: "Reprogramar", "Comprovante" e "Abrir" ficavam por cima do valor e da situação | A largura agora soma todos os botões da célula (vale para todas as listas do programa) |
| 2 | Pagamentos do dia e Pagamentos | O título do cartão era a categoria ("Lenha", "Energia") e não quem recebe | A coluna "Compromisso" passou a ser o título do cartão |
| 3 | Todo o Financeiro | Situações com nomes técnicos: Programado, Parcial, Pago informado, Identificado no banco, Conciliado | Nomes simples: **Agendado, Parcialmente pago, Pago, Pago · no banco, Pago · conciliado** (só o texto; a regra é a mesma) |
| 4 | Não existia | Central de pagamentos (hoje, próximos dias, atraso, agendadas, parciais, pagas, total) | Criada (seção 2) |
| 5 | Não existiam | Módulos Combustível, Despesas gerais e Outros pagamentos | Criados (seção 3) |
| 6 | Painel do setor | 11 indicadores e 2 gráficos na abertura do setor: muita coisa para quem só precisa pagar | O painel continua igual, agora na aba **Indicadores**; o setor abre na Central |
| 7 | Categorias padrão | Sem "Água", "Internet" e "Serviços" | Aparecem como tipo no formulário rápido de Despesas gerais e entram nas categorias quando usadas pela primeira vez |
| 8 | Cadastros e Configurações | "Adicionar" com o campo vazio não fazia nada e não avisava | Agora avisa e põe o cursor no campo |
| 9 | Extratos › Importações | Importação gravada sem os números de linhas mostraria "undefined" | Mostra 0 / "—" |

Pontos conferidos e mantidos como estão (funcionam): pagamento parcial e quitação com diferença
(fica como divergência a conferir), estorno sem apagar, multa e juros, permuta em milheiros, pagar várias
marcadas, programar várias para o dia, calendário mês/semana, MEIs e DAS, caixa e bancos, transferências,
fluxo de caixa, conciliação, comprovantes, relatórios (PDF, Excel, CSV), auditoria, cadastros,
configurações, Lançamento Inteligente por Foto e Contas a pagar – Lenha.

Observação: os filtros de "Contas a pagar" continuam escolhidos quando se volta à tela (ex.: depois de tocar
em "Contas vencidas" no Indicadores). É de propósito; o filtro escolhido fica visível na caixa "Situação".

## 2. Central de pagamentos (`#/setor-financeiro`)

O Setor Financeiro agora abre na Central. No alto, sete números (tocar num número mostra as contas dele
logo abaixo):

- **Pagar hoje**: contas com data (agendada ou vencimento) até hoje que ainda não venceram.
- **Próximos 7 dias**.
- **Em atraso**: todas as vencidas com saldo, mesmo se reagendadas.
- **Agendadas**, **Parcialmente pagas**.
- **Pago neste mês**: pagamentos do mês. O abatimento com combustível da fábrica não conta como dinheiro pago.
- **Total pendente**: tudo o que está em aberto.

A lista abre em **Para pagar agora** (atrasadas primeiro, depois as de hoje), com pesquisa e as 6 primeiras.
O botão "Ver todas" mostra o resto. Abaixo, **A pagar por módulo**: os quatro módulos com o total em aberto e
o atraso. A soma dos módulos é sempre o total pendente.

Cada conta tem **Pagar**, **Agendar / Editar agendamento** e **Mais ▾**, que oferece:

- Histórico e saldo
- Anexar comprovante
- Cancelar agendamento
- Abrir na origem
- Editar dados
- Cancelar conta

O pagamento de entrega de lenha abre o PAGAR / DAR BAIXA do módulo da Lenha. As demais contas usam o
pagamento de sempre do Financeiro. **Agendar nunca marca como pago.**

"Nova conta ▾" lança uma despesa geral, combustível ou outro pagamento. Lenha não entra aqui, porque as
entregas vêm do Setor da Lenha.

## 3. Módulos

Cada conta mora em **um módulo só**. A regra é a mesma em todas as telas (`CPG_FIN.moduloDe`):

| Módulo | O que entra |
|--------|-------------|
| **Lenha** (`#/fLenha`) | Entregas do Setor da Lenha, contas de lenha de fornecedor cadastrado e adiantamentos. Uma conta de lenha lançada para alguém sem cadastro fica em Outros pagamentos, para os totais sempre fecharem com os do módulo da Lenha |
| **Combustível** (`#/fComb`) | Compras do Setor de Combustível e contas com tipo de combustível (inclusive "Combustível para entrega" e "Combustível e óleo"). Agrupado por posto ou fornecedor |
| **Despesas gerais** (`#/fGerais`) | Energia, água, internet, manutenção, serviços, impostos, folha (Setor Pessoal), almoxarifado, fretes, MEIs e as demais despesas da operação. Agrupado por tipo |
| **Outros pagamentos** (`#/fOutros`) | Contas do Financeiro sem tipo, "Outras despesas" ou marcadas como eventuais e extraordinárias |

A conta lançada pelo formulário rápido de um módulo guarda `moduloFin`, para ficar no módulo onde foi lançada.

Cada módulo tem cinco totais: a pagar, em atraso, agendado, pago no mês e contas em aberto. Também tem
pesquisa, os filtros Em aberto · Pendentes · Agendadas · Parciais · Vencidas · Pagas · Canceladas · Todas,
Exportar (PDF/Excel) e **Nova conta**.

### Formulário rápido "Nova conta"

Pede só quem recebe, tipo, descrição, valor, vencimento e, se quiser, a data para agendar. Ao digitar quem
recebe, aparecem na lista os fornecedores cadastrados e os nomes já usados. Em Despesas gerais tem a opção
"se repete todo mês", que cria uma conta por mês. No Combustível, o menu oferece três caminhos:

- **Abastecimento em posto**: pede o motorista.
- **Outra conta de combustível**.
- **Compra para o tanque da cerâmica**: abre a compra do Setor de Combustível, para entrar no estoque e não
  ser lançada duas vezes.

O formulário valida tudo antes de gravar: campos obrigatórios, valor maior que zero e data agendada que não
seja no passado. Usa as mesmas conferências do cadastro completo de compromisso:

- documento já lançado;
- conta parecida já existente (mesmo beneficiário e valor);
- vencimento hoje ou antes.

O aviso aparece na janela e a conta só é gravada se a pessoa marcar "Conferi: está certo". Clique repetido em
Salvar grava uma vez só. A conta vira um compromisso do Financeiro, igual ao do cadastro completo (número,
histórico, auditoria e desfazer).

## 4. Situações

| Mostrado | Quando |
|----------|--------|
| Pendente | Em aberto, sem pagamento e sem data agendada |
| Agendado | Em aberto, com data agendada, ainda não vencido |
| Parcialmente pago | Pagou parte; o saldo continua em aberto |
| Vencido | Venceu e ainda tem saldo (vale também para parcial) |
| Pago | Saldo zero |
| Cancelado | Cancelado com motivo (continua guardado) |

## 5. Dados

- **Nenhuma alteração na estrutura do banco e nenhuma migração.** Nenhum registro apagado ou sobrescrito.
- **Nada de cadastro paralelo**: tudo lê e grava nos registros que já existiam.
  - Compromissos: coleção `fin`, tipo `titulo`; agendamento em `dataPrevista`.
  - Compras dos setores: agendamento em `fin`, tipo `meta`.
  - Despesas do Setor Pessoal.
- Campos novos só em contas novas: `moduloFin` no compromisso lançado pelo formulário rápido. Categorias
  novas (Água, Internet, Serviços) entram na configuração do Financeiro só quando usadas.
- Agendar e cancelar agendamento ficam no histórico (quem, quando, de que data para qual).

## 6. Testes

`node scripts/testar-central-pagamentos.mjs`: programa real, banco simulado em memória, separado dos dados
reais (28 conferências).

| # | O que confere |
|---|---------------|
| 1 | Cadastrar uma obrigação (e campo obrigatório vazio não grava) |
| 2 | Localizar o fornecedor (lista do cadastro e pesquisa da tela) |
| 3 | Agendar: fica Agendado, saldo igual, nenhum pagamento criado |
| 4 | Alterar a data do agendamento sem criar outra conta |
| 5 | Pagamento parcial de R$ 3.000 de R$ 5.000: Parcialmente pago |
| 6 | Saldo restante de R$ 2.000 e os filtros |
| 7 | Pagamento final de R$ 2.000; os dois pagamentos ficam guardados |
| 8 | Quitação: Pago, sai de Em aberto, sem Pagar nem Agendar |
| 9 | Histórico com pagamentos, saldo, quem e quando |
| 10 | Indicadores da Central; soma dos módulos igual ao total pendente |
| 11 | Filtros por situação, números da Central e pesquisa |
| 12 | Navegação: Central → módulo → Central → Lenha → Voltar → abas → Indicadores; "Abrir na origem" e Voltar |
| 13 | Persistência depois de atualizar a página |
| 14 | Sem duplicados: clique triplo, conta repetida barrada, conta mensal uma por mês, números e identificadores únicos |

O teste confere também:

- cancelar agendamento;
- cancelar conta (com motivo, sem apagar; conta paga não oferece);
- cada conta em um módulo só;
- botões das listas sem cobrir valor e situação;
- os nomes simples das situações em Contas a pagar;
- o celular;
- nenhum erro de JavaScript.

Os testes que já existiam continuam passando:

- `verificar.mjs` 94/94
- navegação: 236 telas nos três ambientes
- Contas a pagar – Lenha
- combustível do fornecedor de lenha
- combustível e lenha
- relatórios e documentos
- comprovante de lançamento
- lançamento por foto
- navegador
- pendências
- acesso por setor
- tela fixa
- desfazer

## 7. Para desfazer

Remover os blocos `central-pagamentos` e `central-pagamentos-css` do fim de `app/jb-gestao.html` devolve o
painel antigo na abertura do setor. As outras mudanças são independentes:

- `ROT_SIT`/`rotSit` (nomes simples das situações);
- largura da coluna de botões e título "Compromisso" nas listas em cartões;
- avisos do "Adicionar";
- importações sem números.

Os dados lançados continuam válidos: são compromissos comuns do Financeiro.

## 8. Ajuste de 18/11/2026: quadros que abrem a lista

Pedido do Jeferson: "quando eu clico em cima desses quadros em cima, ele é fixo, não abre".

Todos os quadros do alto agora abrem a lista deles, e a seta "›" mostra que dá para tocar.

- **Contas a pagar – Lenha:** ver o arquivo [`contas-pagar-lenha-2026-11-17.md`](contas-pagar-lenha-2026-11-17.md).
- **Combustível, Despesas gerais e Outros pagamentos:** os quadros Falta pagar, Em atraso, Agendado e Pago
  neste mês filtram a lista. A lista ganhou um título dizendo o que está sendo mostrado.
- **Central de pagamentos:** os números já filtravam a lista, mas não parecia. Agora mostram "ver ›" e
  "mostrando" no escolhido.

Nas listas em cartões, quando há a coluna "Falta pagar", ela é o valor em destaque do cartão, porque é o que a
pessoa precisa ver primeiro. Na Central e nos módulos, a coluna "Saldo" passou a se chamar "Falta pagar",
menos na lista das contas pagas.
