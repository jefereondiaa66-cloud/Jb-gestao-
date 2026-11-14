# Relatórios dos setores e documento de cada lançamento (V120 · 13/11/2026)

Pedido do Jeferson: relatórios integrados a todos os setores e todo lançamento do JB ERP consultável e
documentável (abrir, visualizar, gerar PDF, imprimir e compartilhar), no padrão documental do sistema,
sem botões repetidos, sem criar dado e sem mudar regra de negócio.

## 1. O que foi encontrado (leitura do programa)

| Ponto | Situação antes |
|---|---|
| Lançamentos | 70 cadastros e lançamentos abrem na **janela padrão** (`abrirRegistro`, campos em `MODS[mod].fields`, com seções, rótulos, opções e campos sigilosos). Vendas, compras, orçamentos, entradas e requisições do almoxarifado, compromissos do Financeiro, acertos e levadas de lenha e notas fiscais têm **tela própria**. |
| Histórico | Toda gravação pela janela registra quem e o que mudou (`DATA.log`, aba Histórico). |
| Documentos | Identidade documental única (V111/V116: `baseRel`, `htmlDoc`, `pdfDoc`, `verDoc`, `compartilharDoc`). Já existiam documentos próprios para venda, pedido, orçamento, recibos, compra e entrega de lenha, entrada e requisição do almoxarifado, acerto da lenha, holerite, folha, férias, EPI, motoristas do barro, DRE e custo por milheiro. **Os lançamentos da janela padrão não tinham documento**, nem o compromisso e os pagamentos do Financeiro. |
| Relatórios | DP, Produção, Financeiro e Vendas/Lenha/Combustível (relatórios gerais) usam a **tela padrão** (`telaRelatorios`). Almoxarifado, Paletes e Barro tinham telas próprias mais simples (lista suspensa, sem Imprimir/Compartilhar). Lenha e Combustível têm o painel de relatórios com abas (`clRel`). O **Setor Fiscal não tinha relatórios**. Controladoria é o próprio setor de análise (cada aba já emite o seu documento); Controle Central tem a Auditoria (filtros e exportação); Centro de Inventário tem relatórios e termos próprios. |
| Lacunas | Nenhum lugar mostrava "tudo o que foi lançado num setor"; a tela padrão de relatórios não tinha pesquisa, filtro de responsável nem Imprimir/Compartilhar diretos; tabela larga empurrava a tela no computador. |

## 2. Organização escolhida

- **Documento do lançamento fica onde o lançamento é aberto.** Na janela de cada lançamento, um botão
  **Documento** (Visualizar, Gerar PDF, Imprimir, Compartilhar). Nada de botão por linha nas listas: a linha
  continua abrindo o lançamento, e o documento está na janela.
- **Relatórios ficam na área de Relatórios que cada setor já tem**, sempre na mesma tela padrão. Nenhuma
  central genérica nova: cada setor só vê os próprios dados.
- **"Lançamentos do setor"** entra no fim da lista de relatórios de cada setor (a ordem dos que já existiam não
  mudou): tudo o que foi lançado só naquele setor, por todo mundo, do mais recente para o mais antigo, com
  período, tipo, situação, responsável e pesquisa. Cada linha abre o lançamento ou o documento dele. É também
  o "histórico de lançamentos do setor" pedido antes, sem precisar de botão ou aba nova.

| Setor | Onde | O que mudou |
|---|---|---|
| Setor Pessoal | Relatórios gerenciais | + Lançamentos do setor; documento em todos os lançamentos do DP; ficha cadastral na ficha do funcionário |
| Vendas | Relatórios | + Lançamentos do setor (pedidos, vendas, recebimentos com recibo, orçamentos) |
| Lenha / Combustível | Relatórios (abas) e Relatórios gerais | aba "Lançamentos do setor" → consulta padrão (entradas, consumo/abastecimentos, pagamentos, estoque, combustível do fornecedor, descontos, programações, acertos e levadas de lenha) |
| Produção | Relatórios | + Lançamentos do setor (maromba, paradas, secagem, fornadas, desenforna, tijolo pronto) |
| Financeiro | Relatórios; janela do compromisso | + Lançamentos do setor (compromissos e pagamentos de todos os setores, transferências, avulsos, conferências, comprovantes); **Documento** no compromisso: demonstrativo + comprovante de cada pagamento |
| Almoxarifado, Paletes, Barro | Relatórios | passam para a tela padrão com **os mesmos relatórios e os mesmos cálculos** (`dadosRelAlm`, `dadosRelPal`, `dadosRel`), + Lançamentos do setor |
| Fiscal | nova aba **Relatórios** | notas (todas as situações), faturamento fiscal por destinatário, notas por situação, tributos destacados |
| Controladoria | Lançamentos | **Documento do mês** (todos os campos e a origem de cada valor) |
| Controle Central, Inventário | — | sem mudança (Auditoria e relatórios próprios já atendem) |

## 3. O documento de cada lançamento

Montado na hora, a partir do registro **gravado** (o que está digitado e não salvo não entra), com:
empresa, logo, setor de origem e família (cabeçalho V116), título próprio do tipo ("Comprovante de vale",
"Registro de fornada", "Ficha cadastral do cliente"…), código do lançamento, data do lançamento, data e hora
do registro, quem lançou, última alteração, situação, a parte envolvida (funcionário, cliente, fornecedor),
os números principais em destaque, todas as seções do formulário com os mesmos rótulos, anexos, histórico de
alterações e observações. Comprovantes de entrega ao funcionário (vale, EPI, empréstimo, produção, diária…)
saem com as linhas de assinatura.

- **Código do lançamento**: `SIGLA-XXXXXX` (ex.: `VL-1A6USN`), tirado do identificador gravado, que não muda.
  Quando o lançamento já tem número próprio (contrato, advertência, compromisso, requisição, fornada), ele é usado.
- **Sigilo**: campos sigilosos (CPF, salário…) só saem para quem pode vê-los, pela mesma regra da janela.
- **Permissões**: a lista do setor só traz módulos que o perfil pode ver; gestor de setor vê só o seu setor (`filtroSetor`).
- Telas que já tinham documento próprio continuam com ele.

## 4. Tela padrão de relatórios (vale para todos os setores)

Pesquisa nos resultados (qualquer coluna, sem diferença de acento); filtros de **Situação** e de
**Responsável** quando o relatório tem a coluna e ainda não tem filtro próprio; **Imprimir** e
**Compartilhar** ao lado de Visualizar, PDF, Excel e CSV; a pesquisa sai nos filtros do PDF e da planilha;
tabela larga rola dentro do painel. Relatório que mistura tipos (Lançamentos do setor, notas de todas as
situações) não ganha linha de total automática (`semTotal`).

## 5. Onde fica no código (`app/jb-gestao.html`)

| Peça | Onde |
|---|---|
| Documento, Lançamentos do setor, Financeiro, Controladoria, ficha | bloco `<script id="v120-relatorios-documentos">` (`window.JB_DOCL`) |
| Ações comuns de documento | `acaoDocumento`, `itensAcaoDoc`, `menuDocumento` (junto de `emitirPdfDoc`) |
| Pesquisa e filtros dos relatórios | `filtrosExtraRel`, `ligarFiltrosExtraRel`, `acaoLinhaRel` (antes de `telaRelatorios`) |
| Imprimir e Compartilhar | `exportar` (formatos `imprimir` e `compartilhar`), `verDoc(D,{imprimir:true})` |
| Almoxarifado, Paletes, Barro | `telaRelAlm`, `telaRelPal` + `dadosRelPal`, `telaRel` do barro |
| Fiscal | `relatoriosFis`, aba em `abasFis` |

**Módulo novo:** basta estar em `MODS` (janela padrão) para ganhar o botão Documento. Para entrar nos
Lançamentos do setor, acrescente-o em `FONTES_LANC` (ou use `JB_DOCL.registrarFonte(setor, fn)`); para um
setor novo com tela padrão de relatórios, acrescente `JB_DOCL.relLanc(setor, estado, {m:'rota'})` à lista.

## 6. Testes

- `node scripts/verificar.mjs` — grupo `documentos`, item V120: peças presentes, bloco só de leitura (sem
  gravar, apagar ou registrar), todos os setores nos Lançamentos, e a pesquisa e os filtros conferidos com dados.
- `node scripts/testar-relatorios-documentos.mjs` — navegador, banco simulado: documento de todos os módulos
  (tela e PDF), botão Documento, versão gravada, sigilo, Lançamentos do setor em todos os setores, filtros e
  pesquisa, Almoxarifado/Paletes/Barro com todos os relatórios, Financeiro, Fiscal, Controladoria, ficha,
  impressão, nenhuma gravação no banco e celular.
