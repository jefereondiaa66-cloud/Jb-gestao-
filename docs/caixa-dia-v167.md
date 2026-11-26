# V167 · Resumo financeiro do dia, fechamento, relatório ao proprietário e pagamentos avulsos (25/11/2026)

Pedido do Jeferson ("Complemento – Fluxo de caixa e relatório financeiro diário" e "Prompt – Central Inteligente
Financeira", partes 8 a 10): o dono abre o JB ERP e descobre, em poucos segundos, quanto entrou e saiu no dia, onde o
dinheiro foi gasto, quanto foi com produção e com pessoal, quanto há em caixa e bancos e o resultado do dia; o
responsável fecha o dia e manda o relatório ao proprietário. E uma área para os pagamentos feitos na hora, sem boleto.

O que já existia e foi usado como estava: Caixa e bancos (saldo de cada conta pelo movimento), Fluxo de caixa
(previsto, estimado e realizado), conferências de saldo, extratos e conciliação, a janela de pagamento com
comprovante e o padrão de documentos da empresa (visualizar, PDF, imprimir, compartilhar, Excel).

Bloco no programa: `<style id="caixa-dia-v167-css">` e `<script id="caixa-dia-v167">` no fim de `app/jb-gestao.html`.
Teste: `node scripts/testar-caixa-dia.mjs` (programa real, banco simulado, dados fictícios).

## 1. Só o que foi pago ou recebido de fato

A base é a mesma do Caixa e bancos (`movimentos()`): pagamentos informados dos compromissos, das compras da Lenha e do
Combustível e das despesas do Setor Pessoal, recebimentos de vendas e lançamentos avulsos de Caixa e bancos.
Conta lançada, agendada ou enviada para agendamento não é saída; venda a prazo não é entrada; transferência entre contas
próprias não é receita nem despesa (aparece à parte).

**Novo:** os pagamentos do **Controle por grade** (Enforna, Desenforna e empreitas) entram como saída realizada, na
categoria "Pagamentos da Produção", e passam a baixar o saldo da conta de onde saíram (Caixa ou banco). Antes eles não
apareciam no caixa. Ponto de extensão no `movimentos()`: `window.MOV_EXTRA` (cada função devolve movimentos; chave única,
nada entra duas vezes).

## 2. Resumo financeiro do dia (`#/fResumo`, `#/fResumo/AAAA-MM-DD`)

- **Saldo inicial do dia**, **Entradas**, **Saídas**, **Resultado do dia** e **Saldo final do dia** (Caixa e bancos com saldo
  inicial cadastrado). Lançamento sem conta informada conta nas entradas e saídas, mas não no saldo (aviso na tela).
- **Em poucos segundos**: as sete perguntas do dono (quanto entrou, quanto saiu, onde mais gastou, gasto com produção,
  gasto com pessoal, disponível em caixa e bancos, resultado do dia).
- Despesas **por categoria** e **por setor** (o setor de destino do Financeiro; tocar abre os lançamentos), **entradas por
  origem**, **pessoal e produção** (produção/enforna, desenforna, empreitas, mão de obra da produção lançada no
  Financeiro, diárias, folha e vales — cada saída numa linha só), **boletos liquidados**, **pagamentos avulsos**,
  **caixa e bancos** (inicial, entradas, saídas e final de cada conta) e todos os lançamentos do dia.
- **Painel do caixa**: saldo acumulado, receitas, despesas e resultado do mês, contas a pagar e a receber em aberto, e o
  gráfico de entradas e saídas por dia (14), semana (8) ou mês (6), com a tabela ao lado.
- Dia anterior, próximo e hoje; os dias fechados ficam em **Relatórios anteriores**.

## 3. Fechamento do dia

Botão **Fechamento do dia** (perfil que lança no Financeiro). A janela mostra entradas e saídas para conferir (as duas
caixas de "Conferi" são obrigatórias) e as pendências encontradas: lançamentos sem conta, pagamentos sem comprovante,
contas que venceram no dia e não foram pagas, divergências (pagamento diferente do previsto, saldo conferido com
diferença, pagamentos que podem ser repetidos) e se o dinheiro do Caixa foi contado.

Ao confirmar, grava um registro do dia na coleção do Financeiro (`fin`, tipo `fechamento`, id `fech_AAAA-MM-DD`): os
números, a lista dos lançamentos (chave, sinal, valor, conta, descrição), quem fechou, quando, a observação e as
pendências. **Fechar não trava nem apaga nada:** o que mudar depois aparece no resumo ("Mudou depois do fechamento",
com antes × agora) e fica na auditoria; **Refazer o fechamento** guarda o fechamento anterior no histórico do registro.

## 4. Enviar relatório ao proprietário

Botão **Enviar relatório ao proprietário ▾**: visualizar, gerar PDF, imprimir, compartilhar o PDF, **enviar ao
proprietário pelo WhatsApp** (resumo pronto no formato do pedido: entradas, saídas, pessoal e produção, resultado,
saldo inicial e final, fechamento), copiar o resumo, planilha e relatórios anteriores. O documento sai no padrão da
empresa (cabeçalho, responsável, rodapé).

## 5. Pagamentos avulsos (`#/fPagAv`)

Despesas pagas na hora: Diária, Pagamento de produção, Compra pequena, Compra emergencial, Serviço de terceiros, Frete,
Pequenos materiais, Adiantamento, Despesa operacional, Outro.

- Campos: descrição, beneficiário (com sugestões), CPF/CNPJ (conferido), valor, data, setor responsável, centro de
  custo, categoria (sugerida pelo tipo), forma, conta de saída, quem pagou, comprovante ou foto, observações. Para
  **diária** e **produção**: atividade, quantidade × valor unitário e **quem autorizou** (obrigatório).
- Grava um **compromisso já pago** do Financeiro (o mesmo caminho do "Novo pagamento" da Central), marcado como extra,
  com o setor de destino informado e os dados do avulso (`avulso: {tipo, setor, atividade, qtd, unidade, valorUnit,
  autorizadoPor, pagoPor, comp}`). Aparece na Central (Pagos), no relatório do dia, no caixa e nos indicadores.
- **Repetido pede confirmação**: mesmo nome, dia e valor; outra diária para a mesma pessoa no mesmo dia; e o mesmo
  pagamento já registrado no **Controle por grade**. Clique repetido grava uma vez só.
- Tela com totais do período (diárias, produção, outros), pesquisa, filtros por tipo e setor e exportação.

## 6. Testes

`node scripts/testar-caixa-dia.mjs` (≈35 conferências): avulsos (diária com quantidade × valor, quem autorizou
obrigatório, clique triplo, produção, compra com CNPJ, totais), repetidos (três casos), números do dia (saldo inicial
+ entradas − saídas = saldo final, transferência fora), sete respostas, categoria/setor/origem, pessoal e produção,
boletos e avulsos, caixa e bancos, fechamento (pendências, conferi obrigatório, registro, mudou depois, refazer),
relatório (seções, WhatsApp, documento da empresa), dia anterior, painel do caixa, Controle por grade no caixa e no
Fluxo de caixa, menu/favoritos/busca, celular, persistência e nenhum erro de JavaScript.

## 7. Como desfazer

Reverter o commit desta versão tira as telas e o pagamento do Controle por grade volta a ficar fora do caixa. Os
registros gravados (avulsos são compromissos já pagos; fechamentos são registros do tipo `fechamento`) ficam guardados
e não atrapalham.
