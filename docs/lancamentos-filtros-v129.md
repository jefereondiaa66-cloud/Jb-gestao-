# V129 · Padrão global de filtros e de lançamentos (17/11/2026)

Pedido do Jeferson: deixar os lançamentos e os filtros de todos os setores no mesmo padrão, mais
limpos, sem perder nenhuma informação ou função. Só os lançamentos e a filtragem: o início dos
setores (indicadores, módulos, atalhos) fica como estava.

## O que muda na tela

- **Período**: as duas datas de cada filtro viram um botão "Período" que abre um calendário com
  atalhos (Hoje, Ontem, Últimos 7 dias, Este mês, Mês passado, Este ano, Todo o período). No
  celular, o calendário abre embaixo, na largura da tela.
- **Competência**: o par de meses (ex.: Despesas com pessoal) vira um botão com a grade de meses.
- **Mais filtros**: do 3º filtro de lista em diante, tudo fica atrás de "Mais filtros" (com o número
  de filtros ligados ali). A pesquisa e os dois primeiros filtros ficam sempre à vista.
- **Limpar**: aparece só quando há algum filtro ligado e tira todos.
- **Ordenar**: a fileira "Ordenar por" vira um botão só, com a lista de colunas.
- **Ações de cada lançamento**: um menu de três pontos com Visualizar, Imprimir, Compartilhar,
  Editar, Excluir e as ações próprias da tela. A ação principal da linha (botão vermelho, ex.:
  "Pagar") continua à vista.
- Cartões da lista um pouco mais baixos e sem os tracinhos "—" dos campos vazios.

## O que não muda

- Dados, regras, cálculos, permissões e o banco: o bloco não grava, não apaga e não navega sozinho.
- Os campos de filtro de cada tela continuam lá (escondidos); o botão só põe o valor neles com o
  mesmo evento de antes, e a tela filtra do jeito de sempre.
- Visualizar, Imprimir e Compartilhar usam o mesmo documento do botão "Comprovante" (V120).
- Excluir é o botão da janela do registro: mesma confirmação, mesmas travas e o mesmo histórico.
  Telas que não têm Excluir na janela continuam sem ele no menu.
- Na impressão, nenhum botão ou menu aparece.

## Onde está

- `app/jb-gestao.html`: blocos `lanc-filtros-v129-css` e `lanc-filtros-v129` (no fim do arquivo,
  depois das listas em cartões).
- Teste no navegador: `node scripts/testar-lanc-filtros.mjs` (depois de `node scripts/construir.mjs`).
- Verificação: `node scripts/verificar.mjs`, grupo `lancamentos`.

## Tela nova

Não precisa fazer nada: barra com a classe `filtros` ou `fi-filtros` e lista em cartões já entram no
padrão. Duas datas viram "Período", dois meses lado a lado viram "Competência" e quatro ou mais listas
de opções ganham "Mais filtros". Ícones na coluna de ações vão para o menu; um botão `.btn.pri` fica
à vista.
