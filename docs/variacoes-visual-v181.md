# V181 · Visual novo da tela Variações (27/11/2026)

Pedido do Jeferson (com print da aba Variações da Produção no celular): deixar a leitura mais fácil e pôr um
painel caprichado no alto de **todos os setores**, no mesmo padrão. **Só layout, visual e organização.**
Nenhum dado, valor, cálculo, fórmula, nome de indicador ou regra de comparação entre meses mudou, e as outras
telas (Início, Lançar, Funções, Setores) e a navegação ficaram como estavam.

## O que mudou na tela

Vale para as Variações de cada setor (`#/setor-variacoes/<setor>`), do Setor Pessoal (`#/dpvariacoes`) e para
"Variações de todos os setores" (`#/setor-variacoes`). Quem vê continua o mesmo (V85: Jeferson e Bayron).

1. **Seletor do mês** no alto: setas ‹ ›, lista com os 24 últimos meses (o mês em andamento marcado) e o botão
   "Mês atual". Ao lado, "Comparado com setembro de 2026". Mês em andamento: etiqueta "em andamento: dias 1 a N"
   e o mesmo aviso de antes sobre comparação parcial.
2. **Resumo do mês** (faixa preta com o filete vermelho da Concretiza): quantos números **melhoraram** (verde),
   **pioraram** (vermelho) e ficaram **sem mudança ou são neutros** (cinza); os nomes de cada grupo; e os
   destaques **"Mais melhorou"** e **"Mais piorou"** com "de → para" (ex.: 65,2 → 100,2 milheiros).
   O destaque é a maior variação percentual entre os números com base de comparação; número sem dado no mês
   anterior não entra no destaque (não dá para dizer quanto mudou).
3. **Cartões dos números**: ícone, valor grande com a unidade (milheiros, %, horas, R$), seta com a variação
   (% ou p.p.), "vs set/26", mini-gráfico dos últimos 6 meses (o ponto do mês escolhido na cor da variação),
   valor do mês anterior e média dos 3 meses. Filete em cima na cor do sentido. Tocar no cartão mostra os meses
   dele no gráfico. Os cartões do que mais melhorou e do que mais piorou ganham a marca.
4. **Mês × mês anterior**: para cada número, os dois valores e a variação lado a lado, com duas barras (o mês,
   na cor do sentido, e o anterior, em cinza), cada número na própria escala.
5. **Últimos meses** (gráfico de barras): o mês escolhido em preto, os outros em cinza; no celular os rótulos
   ficam "jan/26 fev mar…" (o ano só no começo e em janeiro).
6. **Mês a mês** (tabela): contínua também no celular (não vira cartões), com o mês fixo à esquerda e o resto
   rolando de lado; o mês escolhido com o filete vermelho.
7. **Variações de todos os setores**: resumo geral (somando todos os setores) e um cartão por setor com
   "N melhoraram · N pioraram" e os 3 primeiros números.
8. **Textos**: "novo" e "antes era zero" viraram **"sem dado no mês anterior"** (na tabela, só a seta, com a
   explicação na dica); "estável" virou "sem mudança"; "h" virou "horas". Na seção "Variação de vendas por
   vendedor" (V152), "novo" virou **"sem venda no mês anterior"**.
9. **Fim da tela livre**: espaço para o selo "Powered by Netlify" e a barra de baixo do celular não cobrirem o
   último quadro. No celular, a explicação do cabeçalho some (é a mesma do seletor e do resumo) e o painel sobe.

Cores: verde = melhorou, vermelho = piorou, cinza = sem mudança ou número neutro, pelo sentido de cada número,
como já era (Perdas, custos, faltas subindo = vermelho). As cores de estado são as do tema (funcionam no escuro);
a marca Concretiza (preto e vermelho) aparece só nos detalhes: a faixa do resumo, o marcador dos títulos e o mês
escolhido na tabela. Com outra paleta escolhida (ex.: azul), o resto do programa segue a paleta e as Variações
mantêm o preto e o vermelho da marca.

## O que não mudou

- As contas: o trecho de `const okM=` até o fim de `comparar()` no bloco `variacoes-v73` (`SETS`, `val`,
  `media3`, `fmt`, `fmtDif`, `comparar`) está igual ao da V180, letra por letra. A conferência `[variacoes]` do
  `verificar.mjs` guarda a impressão digital desse trecho (SHA-256 `c71a15fc…aff8`).
- Os números mostrados: com dados simulados, as 840 combinações setor × número × mês (valor, nota, texto,
  sentido, cor, diferença e %) saíram iguais antes e depois.
- Rotas, permissões (V85), abas dos setores, atalho da tela de setores, seção por vendedor (V152, mesmos
  números), banco (nada é gravado).

## Onde está no código

- `app/jb-gestao.html`:
  - `<style id="variacoes-v73-css">`: o visual novo, todo preso a `.vr-raiz` (a raiz da tela Variações);
  - `<script id="variacoes-v73">`: só as funções que desenham, de `function pill(` até `telas`
    (`partesV`, `valorV`, `pill`, `sparkV`, `barras`, `barraMes`, `destaquesV`, `desenhar`, `telaGeral`);
  - `<style id="variacoes-vendedor-v152-css">` e `<script id="variacoes-vendedor-v152">`: barras no mesmo
    padrão e o texto "sem venda no mês anterior".

## Conferência feita

- `node scripts/verificar.mjs` (conferência nova `[variacoes] V181`).
- `node scripts/testar-variacoes-visual.mjs` (novo; dados simulados, computador e celular): números da tela
  iguais aos de `val`/`comparar`/`media3` em todos os setores, no Setor Pessoal e na visão geral; Perdas subindo
  em vermelho; nada de "novo"/"antes era zero"; seletor do mês, cartão, barra e linha da tabela; celular sem
  passar da largura e tabela contínua; fim da tela acima do selo e da barra; tema escuro e paleta azul; nada
  gravado; sem erro de JavaScript; outro administrador continua sem acesso.
- Também passaram: `testar-variacoes-vendedor.mjs` (V152, com o texto novo), `testar-navegacao.mjs`
  (262 telas sem erro) e os testes de navegador, Vidro claro, tema e Controladoria.

## Como desfazer

GitHub → Actions → "Reverter publicação" do commit da V181. Nenhum dado depende dela.
