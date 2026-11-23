# V156 · Controle de Produção por Grade (23/11/2026)

Pedido do Jeferson (22/11/2026, à noite): dentro da Produção, uma seção independente para quem recebe por
grade trabalhada na **Enforna** e na **Desenforna** ("Informe" e "Desinforma" no pedido): cadastro do
trabalhador, lançamento do dia, extrato, pagamentos inteiros ou parciais, painel separado por setor e
relatórios. Em seguida: "deixar automatizado com o setor financeiro, igual à lenha e ao combustível: um
módulozinho, ele clica e vê". E: "melhore os detalhes que eu não falei".

**Regra principal (do próprio pedido):** o valor por grade **não** fica no cadastro. Quem lança digita o valor
em cada lançamento; o total é grades × valor; cada lançamento guarda o próprio valor e lançar outro valor
depois nunca muda os anteriores. Não existe tabela de preço por trabalhador nem por setor.

## Onde fica

- **Produção → módulo "Controle por grade"** (em Módulos e em Todas as funções, logo antes de Relatórios e
  Configurações; os módulos de sempre continuam na mesma ordem entre si), com:
  Painel · Lançar o dia · Lançamentos · Trabalhadores · Pagamentos · Extrato · Relatórios.
- **V156.1 (23/11/2026, "não apareceu")**: a barra de abas fica desligada em todos os setores, menos no Pessoal
  (escolha do dono em 08/11/2026), e o módulo só aparecia no fim de Módulos. Agora o controle fica à vista:
  - **painel da Produção → "No mês"**: cartão "Controle por grade" com as grades do mês (Enforna e Desenforna) e
    quanto falta pagar; sem trabalhador cadastrado, convida a cadastrar. Toque abre o painel do controle;
  - **Produção → Lançar** (botão Lançar e o "+" do celular): opção "Grades por trabalhador", que abre o Lançar o dia.
  Pontos de extensão da Produção (só acrescentam; vazios, a tela fica igual): `window.PROD_ABAS_EXTRA` (com
  `antes`), `window.PROD_LANC_EXTRA` e `window.PROD_MES_EXTRA`.
- **Setor Financeiro → "Pagamento por grade"**: cartão no painel do Financeiro (abaixo de "A pagar por
  módulo", com o total que falta pagar) e tela própria (`#/fGrade`) para ver e pagar.
- Rotas: `#/pgrade`, `#/pgDia`, `#/pgLanc`, `#/pgTrab`, `#/pgPag`, `#/pgExtrato[/<trabalhador>]`, `#/pgRel`, `#/fGrade[/<trabalhador>]`.
- Código: `app/jb-gestao.html`, blocos `grade-v156-css` e `grade-v156` (fim do arquivo, `window.JB_GRADE`).

## O que tem

- **Cadastro**: nome completo, apelido, CPF (opcional; vai para a área protegida do Setor Pessoal), setor de
  atuação (Enforna, Desenforna ou os dois), data de cadastro, situação (ativo/inativo), telefone e chave PIX.
  Avisa nome ou CPF repetido e inativar quem ainda tem saldo.
- **Lançar o dia**: escolhe o dia e o setor; aparece uma linha por trabalhador ativo do setor (grades e valor
  por grade, com o total da linha e o total do dia antes de salvar). "Mesmo valor por grade para todos" põe o
  valor nas linhas vazias (linha só com esse valor e sem grades continua em branco). Quem não trabalhou fica em
  branco. Enter passa para o próximo campo. Pergunta antes de trocar de setor com linhas digitadas.
- **Lançamento avulso** (botão "Lançar" no painel e no extrato), lista de lançamentos com filtros e o
  formulário do sistema para corrigir um lançamento (a correção vale só para ele).
- **Extrato** de cada trabalhador: data, histórico, grades, a receber, pago e saldo corrido, com saldo anterior;
  filtros por dia, semana, mês, período escolhido e tudo. Exporta (documento, PDF, Excel).
- **Pagamentos** inteiros ou em parte: valor já sugerido com o que falta receber, data, forma, de onde saiu
  (Caixa ou banco, opcional na Produção e pedido no Financeiro), observação e comprovante (foto ou PDF).
  Depois de pagar: ver, imprimir ou compartilhar o **recibo** (cupom 80/58 mm ou folha A4), com o valor por
  extenso, os lançamentos que o pagamento quitou e as assinaturas.
- **Painel**: trabalhadores ativos, grades, total devido, total pago e saldo pendente, em **Enforna |
  Desenforna | Total**, e a lista "A receber por trabalhador" com Pagar, Lançar e Extrato.
- **Relatórios**: por trabalhador, por setor, lançamentos, pagamentos e **lista para assinatura** no dia do
  pagamento; filtros de período, setor e trabalhador; imprimir, PDF e planilha.

## Regras de segurança

- **Duas coleções novas**, só deste controle: `prodGradeTrab` (cadastro) e `prodGrade` (lançamentos `tipo:'lanc'`
  e pagamentos `tipo:'pag'`, agrupados por mês). Nenhuma coleção, lançamento ou cálculo de produção que já existia
  é tocado.
- **Não mistura**: os valores ficam neste controle e no módulo do Financeiro. Não entram sozinhos em custo,
  despesa, contas a pagar, folha, Controladoria nem no "Total pendente" da Central de Pagamentos.
- **Nada é apagado**: lançamento errado é *cancelado* com motivo; pagamento errado é *estornado* com motivo;
  os dois continuam no extrato sem somar (o administrador pode reativar um lançamento cancelado). Tudo vai
  para o histórico do sistema e para a auditoria do banco.
- **Repetição**: mesmo trabalhador, dia e setor pede confirmação; pagamento igual no mesmo dia (ou outro
  pagamento ao mesmo trabalhador há menos de 5 minutos) pede confirmação; pagar acima do saldo exige marcar
  a confirmação e escrever o motivo (o excedente fica como crédito e desconta dos próximos lançamentos).
- **Saldo** = lançado − pago. Os pagamentos quitam primeiro os lançamentos mais antigos; é isso que separa o
  pago por setor e mostra no recibo o que foi quitado. O crédito de um trabalhador não desconta do que outro
  tem a receber.
- **Permissões** (como os lançamentos da Produção): ver — quem vê a Produção; lançar e cadastrar — administrador,
  gerente, estoquista e gestor; pagar — administrador, financeiro e gerente; estornar e reativar —
  administrador e financeiro. No painel do dono, concessão e suspensão da Produção e do Financeiro valem para
  as telas novas.

## Banco (nuvem)

`supabase/migrations/20261123003000_seg_controle_grade.sql` (reversão: `.down.sql`), só acrescenta:

- `seg.colecoes`: `prodGradeTrab` e `prodGrade`, módulo Produção, com auditoria;
- `seg.leitura_compartilhada`: o Setor Financeiro lê as duas;
- `seg.escrita_item`: o Setor Financeiro grava **só pagamentos** (`tipo 'pag'`) em `prodGrade`; os casos que
  já existiam ficaram iguais.

Conferido no banco real, numa transação sempre desfeita, entrando como três pessoas (Produção; só Financeiro;
nenhum dos dois): 13 de 13 gravações com o resultado esperado (o Financeiro paga, estorna e junta pagamento num
mês com lançamento, mas não cadastra, não lança, não altera nem tira lançamento, nem troca lançamento por
pagamento; quem não tem os módulos não grava nem lê).

## Testes

- `scripts/testar-controle-grade.mjs` (programa real, banco simulado, dados fictícios): cadastro, lote da
  Enforna e da Desenforna, avisos de repetição e de troca de setor, valor guardado em cada lançamento, correção
  com histórico, pagamento parcial e total, repetido e acima do saldo, crédito, estorno, cancelar e reativar,
  recibo, painel por setor, extrato e filtros, relatórios, pagamento pelo Financeiro, nada gravado fora do
  controle, os dados voltando iguais ao abrir de novo, computador e celular sem rolagem para o lado e sem
  erro de JavaScript.
- `scripts/verificar.mjs`, grupo `[grade]`: coleções, valor por lançamento, nada apagado nem misturado,
  navegação pelo JBNAV, ligações com a Produção, o Financeiro e o painel do dono, migração só com acréscimos.

## Reverter

Tirar os blocos `grade-v156-css` e `grade-v156` e as quatro ligações (aba da Produção, nomes do Desfazer e as
listas de telas do painel do dono) e aplicar `20261123003000_seg_controle_grade.down.sql`. Os dados do controle
continuam guardados no banco.
