# V155 · Setor de Produção no visual "Vidro claro" (22/11/2026)

Pedido do dono: depois da "roupa" nova (V154), aplicar as telas do redesenho, começando pelo Setor de
Produção, **só para ele** e com todas as funções de sempre. Vale só com a chave "Vidro claro (só para você)"
ligada (Configurações › Aparência, V154). Os outros usuários continuam no visual de sempre.

Código: `<style id="v155-vidro-producao">` + `<script id="v155-vidro-producao">` no fim de `app/jb-gestao.html`.
Testes: `scripts/testar-vidro-producao.mjs` (navegador) e a conferência `[vidro]` do `scripts/verificar.mjs`.

## 1. O que muda (só com a chave, só nas 15 telas da Produção)

- **Barra de módulos** no alto: Início, Lançar, Movimentações, Maromba, Secador, Fornos, Tijolo pronto,
  Relatórios e Configurações. É a mesma navegação do setor que já existia (hoje ela fica escondida e aparece no
  botão Módulos); as subabas (ex.: Lançamentos | Paradas) ficam logo abaixo.
- **Início**: cabeçalho com ícone, data, saudação e descrição; atalhos **Registrar parada**, **Nova fornada** e
  **Desenforna** (abrem os formulários de sempre, só para quem pode lançar) ao lado do **Lançar** de sempre;
  "Maromba hoje" em cartão claro com o gráfico dos últimos 14 dias; números do mês com ponto de cor;
  acompanhamento industrial com as etapas numeradas em cor; situação dos fornos em largura total;
  **Módulos** e **Atalhos favoritos** lado a lado; e a lista **Lançamentos do setor**.
- **Lançamentos do setor**: os 8 movimentos mais recentes da Produção (os mesmos da tela Movimentações, V151),
  com filtro por tipo, pesquisa, e por linha: ver, imprimir e compartilhar o comprovante, e ir para o
  lançamento (só quem pode abrir aquele módulo). "Ver todas as movimentações" abre a tela completa.
- **Listas** (Maromba, Paradas, Secador, Fornos, Tijolo pronto): trilha "Setor de Produção › módulo" acima do
  título, cartões de números com o rótulo em cima, título do cartão da lista e atalhos de situação (usam o
  filtro "Situação" de sempre). Na **Maromba**, os gráficos "Produção líquida por dia" (30 dias) e "Por turno"
  (mês), dos lançamentos confirmados.

## 2. O que não muda

Nenhum título, botão, aba, coluna, campo, filtro, cálculo, permissão ou endereço de tela sai ou muda: as peças
de sempre só mudam de lugar ou de aparência. O que deixa de aparecer é só enfeite (as barrinhas do gráfico
antigo, trocadas pelo gráfico novo; ícones repetidos; uma saudação duplicada). Nada é gravado: as peças novas
só leem os lançamentos que já existem.

## 3. Como funciona

Depois de cada desenho da tela (inclusive o da casca), o bloco arruma as peças da Produção e acrescenta as
novas, uma vez por desenho. Ligar ou desligar a chave redesenha a tela inteira: com a chave desligada, a tela
volta a ser exatamente a de sempre.

## 4. Testes

`node scripts/construir.mjs && node scripts/testar-vidro-producao.mjs` (dados fictícios, banco simulado):
sem a chave, nenhuma peça nova; com a chave, nas 15 telas, tudo o que existia continua; Início completo;
filtro, pesquisa e comprovante dos lançamentos; atalho "Nova fornada" abre o formulário de enforna; trilha,
título, gráficos e atalhos de situação na Maromba; nada gravado; sem erro de página; desligar volta ao de sempre.

Antes de publicar, a conferência das 261 telas e dos 77 formulários foi rodada com a chave ligada e desligada.

## 5. Como desfazer

Desmarcar a chave (volta na hora). No código: apagar os dois blocos `v155-vidro-producao`, o teste, a
conferência e o passo do CI. Nenhum dado depende deles.

## 6. Próximo

As telas dos outros módulos da Produção com peças próprias (Secador, Fornos, Tijolo pronto, formulários e
comprovante), e depois os outros setores, sempre atrás da mesma chave.
