# V152 · Variação de vendas por vendedor (21/11/2026)

Pedido do dono: dentro da aba **Variações** do Setor de Vendas, uma seção nova, **"Variação de vendas por
vendedor"**, com a variação calculada em **reais** e em **milheiros**. A mudança tinha que ser só um
acréscimo: nada do que já existe muda.

Código: bloco `<style id="variacoes-vendedor-v152-css">` + `<script id="variacoes-vendedor-v152">` no fim de
`app/jb-gestao.html`. Teste: `scripts/testar-variacoes-vendedor.mjs` (navegador) e a conferência
`[variacoes]` do `scripts/verificar.mjs`.

## 1. Onde fica e quem vê

- Endereço da aba: `#/setor-variacoes/vendas` (Setor de Vendas › Variações).
- A seção fica no **fim da aba**, logo depois da tabela "Mês a mês" das variações (V73).
- Quem vê: quem já vê a aba Variações (V85: só o Jeferson e o Bayron). Para os outros, a aba continua
  respondendo "Sem acesso" e a seção não aparece.

## 2. O que mostra

**Filtros** (na barra da seção):
- **Período:** o mesmo mês escolhido no alto da aba. As setas da seção usam a própria barra do mês da aba
  (o painel de cima e a seção mudam juntos, e a tela fica parada na seção).
- **Vendedor:** todos ou um.
- **Ordem:** faturamento (padrão), milheiros, variação % em R$ ou variação % em milheiros, do maior para o menor.

**Tabela por vendedor** (com a linha **TOTAL GERAL** no fim):

| Grupo | Colunas |
|---|---|
| Faturamento (R$) | mês atual · mês anterior · variação (R$ e %) |
| Milheiros (mil) | mês atual · mês anterior · variação (milheiros e %) |
| Preço médio por milheiro | mês atual · mês anterior · variação (R$ e %) |
| Participação | parte do vendedor no total da empresa, em R$ e em milheiros (período atual) |
| Vendas | quantidade de vendas faturadas no período atual (o anterior aparece ao parar o mouse) |

A variação em R$ e a variação em % ficam na mesma célula, uma embaixo da outra (o mesmo jeito da tabela
"Mês a mês" das variações). Assim a tabela inteira cabe na tela do computador a partir de 1.280 px, sem
rolar para o lado. No celular, cada vendedor vira um cartão com o nome de cada número.

**Gráficos:** barras por vendedor comparando o mês atual (vermelho) com o anterior (claro), um em R$ e
outro em milheiros, com o valor na ponta de cada barra e a variação % ao lado do nome.

## 3. Regras de cálculo

| Número | Como é calculado |
|---|---|
| Faturamento | total das vendas faturadas (`vendasFatV`), o mesmo do cartão "Faturamento" da aba |
| Milheiros | itens em milheiro + itens em unidade ÷ 1.000 (itens em palete ou carrada ficam só no faturamento) |
| Preço médio | valor dos tijolos ÷ milheiros, sem o frete (o mesmo critério do cartão "Preço médio do milheiro") |
| Variação R$ / milheiros | atual − anterior |
| Variação % | (atual − anterior) ÷ anterior × 100; com o anterior zerado: **"novo"** (vendeu agora) ou **"—"** (zero nos dois); nunca divide por zero |
| Participação | vendedor ÷ total da empresa no período atual × 100 |
| Período anterior | mês fechado: o mês anterior inteiro. Mês em andamento (dias 1 a N): os dias 1 a N do mês anterior (se o mês anterior for menor, até o último dia dele) |

- Cores: verde quando a variação é positiva, vermelho quando é negativa, cinza quando não mudou.
- Valores em R$ com 2 casas (R$ 1.234,56); milheiros com 2 casas (12,50 mil).
- Vendedor sem venda no período: aparece com **zero** (e "—" onde não dá para calcular), sem erro.
- Venda cancelada e pedido ainda não faturado ficam de fora (a mesma regra do cartão "Faturamento").
- **Vendedor = quem está na venda** (campo vendedor; sem ele, quem lançou). Contas diferentes com o
  mesmo nome (a mesma pessoa com dois acessos) e a mesma conta com nomes diferentes contam como **um
  vendedor só**. O nome mostrado é o do cadastro de acessos; sem cadastro, o gravado na venda.
- Com um vendedor escolhido, o TOTAL GERAL é só dele, e um aviso mostra o total da empresa.
- Avisos aparecem quando há item em unidade convertido (os milheiros da seção podem passar dos do
  cartão "Milheiros vendidos", que só conta os itens em milheiro) ou item em palete/carrada.

## 4. O que NÃO mudou (de propósito)

- Nenhuma tela, aba, campo, cálculo, tabela, rota ou componente existente. O bloco das variações (V73) e o
  Setor de Vendas (cadastro, lançamento e edição de vendas) estão byte a byte iguais.
- Banco de dados: nenhuma coleção, campo ou tabela nova; a seção só lê. Nada é gravado.
- Layout, cores e estilos das telas: a seção usa as mesmas peças do tema (cartões, tabela, pílulas
  ▲/▼ e barras das variações).

## 5. Como funciona por dentro

- `TELAS_V['setor-variacoes']` ganha um envoltório: depois de a tela das variações ser desenhada (como
  sempre), a seção é acrescentada no fim do `#svCorpo` quando a aba é a de Vendas.
- O painel V73 se redesenha sozinho (troca de mês, cartão, barra do gráfico, linha da tabela) escrevendo
  `c.innerHTML`. Para a seção não sumir, **só esse `#svCorpo`** ganha um `innerHTML` próprio que chama o
  original e, na mesma hora, recoloca a seção. Assim o V73 não é alterado e a rolagem não pula.
- `window.JB_VAR_VENDEDOR` (`periodos`, `calcular`, `pct`) existe para o teste conferir as regras com datas
  fixas.
- Tabela com `data-zero="1"`: o padrão global que troca "R$ 0,00" por "—" nas tabelas não vale aqui,
  porque o pedido é mostrar **zero**.

## 6. Testes

`node scripts/construir.mjs && node scripts/testar-variacoes-vendedor.mjs` (computador 1.366 px e celular
390 px, dados fictícios, banco simulado):

- **sem mudança no que já existia:** 15 telas (variações de Vendas em três meses, de todos os setores, da
  Lenha, da Produção, do Financeiro e do Setor Pessoal; início, lista, nova venda, relatórios, painel e
  clientes do Setor de Vendas) abertas na versão com a V152 e na mesma página **sem** o bloco novo saem
  iguais, letra por letra (sem contar a seção nova); clicar no painel das variações dá o mesmo painel;
- números, TOTAL GERAL e cartões da aba batendo; zero, "novo" e "—"; unidade ÷ 1.000; frete fora do preço
  médio; cancelada e pedido sem faturar fora; duas contas da mesma pessoa somadas; período anterior de mesma
  duração; filtros, "Limpar", ordem, setas do mês; venda nova aparece quando a tela se atualiza;
- tabela inteira na tela do computador; cartões no celular sem rolar para o lado; banco sem nenhuma gravação;
  sem erro de JavaScript; outro administrador fora das Variações não vê a seção.

## 7. Como desfazer

Apagar os dois blocos `variacoes-vendedor-v152-css` e `variacoes-vendedor-v152` do fim de
`app/jb-gestao.html` (e, se quiser, o teste, a conferência `[variacoes]` do `verificar.mjs` e o passo do
CI). Tudo volta como era; nenhum dado depende deles.
