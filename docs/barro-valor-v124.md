# V124 · Valor do barro junto da tonelada no Setor do Barro (14/11/2026)

Pedido do Jeferson: "o valor do barro não está sendo contabilizado no setor do barro; contabiliza só a
tonelada e não o valor". Tudo dentro do programa que já existe (`app/jb-gestao.html`, bloco do Setor do Barro).
Só mostra: nada é gravado, nenhum dado muda e o cálculo do consumo continua o mesmo da V71.

## Causa

- O consumo e o valor já eram calculados desde a V71: cada lançamento confirmado da maromba consome
  tijolos × peso do tijolo cru ÷ 1.000 toneladas, e o valor é toneladas × R$/t vigente no dia
  (R$ 6,1663/t desde 01/11/2026, "Índices jan–set/2026 – taxa fixa").
- Com a **parte de extração ligada** (botão "Mostrar a parte de extração"), o Início do setor troca para os
  cartões da extração. Os cartões "Custo por tonelada", "custo total" e "Custo por carrada" somavam **só as
  extrações lançadas**. Sem extração lançada, ficavam em R$ 0,00, enquanto as toneladas consumidas apareciam.
  O valor do consumo estava só na linha pequena de um cartão, e o estoque aparecia só em toneladas.

## O que mudou

- **Início com a extração ligada:** cartão novo "Valor do barro consumido" (R$ do mês, com toneladas × R$/t e o
  valor de hoje); "Consumo do estoque" junta o de hoje e o do mês (no lugar do cartão "Consumo do estoque hoje",
  para o painel continuar com 8 cartões). "Custo por tonelada": com extração com custo no mês, o custo real (como
  era); sem, o R$/t vigente, marcado "valor de referência". "Custo por carrada": real, ou toneladas por carrada × R$/t
  quando configurado, ou "—" (nunca R$ 0,00 sem dado). "Estoque de barro" com o valor (t × R$/t de hoje).
  Nota no pé explicando a conta.
- **Custo do barro:** custo por tonelada e por carrada com a mesma regra; cartão "Valor do barro consumido".
- **Estoque de barro:** "Estoque agora" e "Consumido no mês" com o valor; cada linha de consumo automático traz o valor.
- **Relatório "Resumo mensal do barro (estoque)":** coluna "Valor do consumido (R$)".
- R$/t mostrado com 4 casas (R$ 6,1663) onde aparece o valor por tonelada.
- **Não muda:** o valor do consumo continua pelo R$/t das vigências (Configurações do setor). Quando chegar o custo
  real da extração, troque o R$/t criando uma nova vigência; os dias anteriores ficam com o valor antigo.

## Técnico

- Funções novas no bloco do barro: `fRt`, `fimM`, `refPer(de,ate)`, `refMes(m)`, `custoTonB(k,de,ate)`,
  `custoCarB(k,de,ate)`, `valorEstB(ton)`. `movsBarro()` passa o valor em cada consumo; `resumoMes()` devolve `consV`.
- Verificação: `node scripts/verificar.mjs` (item "Setor do Barro (V124)").
- Teste no navegador: `node scripts/construir.mjs && node scripts/testar-barro-valor.mjs` (19 conferências).
