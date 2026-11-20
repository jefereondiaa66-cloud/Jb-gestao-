# V151 · Movimentações dos setores (20/11/2026)

Pedido do Jeferson: no Almoxarifado, na Lenha, no Combustível e na Produção, o módulo **Movimentações**
mostra a movimentação do setor ao longo do tempo — não só o consumo, as entradas ou as saídas: tudo o que
entrou, o que saiu e como saiu, com quem lançou. Filtro no alto que atualiza na hora, pesquisa, e tocar
num lançamento emite um comprovante detalhado, no mesmo modelo para todos, com visualizar, imprimir e PDF.

## O que tem na tela

- **Botões de tipo no alto** (com a quantidade em cada um), que filtram na hora, sem trocar de tela:
  - Combustível: Entradas · Abastecimentos · Para fornecedor de lenha · Saídas e perdas · Transferências · Ajustes · Despesas · Pagamentos
  - Lenha: Entradas · Consumo nos fornos · Levadas · Saídas e perdas · Ajustes · Pagamentos · Combustível e produtos · Descontos e acertos
  - Almoxarifado: Entradas · Saídas · Requisições · EPIs · Devoluções · Acertos de contagem · Ferramentas · Pagamento de lenha
    (e, acima, Tudo · Almoxarifado · Cozinha · Limpeza)
  - Produção: Maromba · Paradas · Secador · Enforna · Desenforna · Tijolo pronto · Perdas
- **Pesquisa** (sem diferença de acento): item, fornecedor, veículo, motorista, pessoa, forno, nº do documento…
- **Período** (botão padrão V129), **item/combustível/tipo de lenha** e **lançado por**.
- Resumo: quantos lançamentos, quanto entrou e saiu (por unidade e em R$), despesas e pagamentos.
  Na Produção: produzido na maromba, enfornado, desenfornado, perdas e saída do tijolo pronto.
- Lista em cartões (padrão do sistema), mais recentes primeiro, 120 por vez ("Mostrar mais").
  Escolhendo um item, aparece o saldo depois de cada movimento (como a tela antiga do almoxarifado).
- **Exportar**: visualizar, PDF e Excel com os filtros da tela.

## O comprovante (tocar na linha)

"COMPROVANTE DE MOVIMENTAÇÃO", um modelo só para os quatro setores, montado pelo gerador de documentos do
sistema (cupom 80/58 mm, que é o padrão, ou folha A4): tipo, sentido, item, quantidade, valor, **saldo antes e
depois** (quando o saldo corrido bate com o saldo de hoje), origem ou destino, os detalhes do lançamento de origem
(as mesmas seções do comprovante dele) e o registro no sistema (quem lançou, quando, código), com assinaturas.
Na tela do documento: Imprimir, Exportar PDF, Baixar (Word) e Compartilhar.
Os três pontinhos da linha (V129): Visualizar, Imprimir, PDF, Compartilhar e **Ir para o lançamento**.

## Regras

- **Só leitura.** Nada é gravado, recalculado ou apagado. As fontes são as que já existem:
  `CL_MOVS` (estoque da Lenha e do Combustível, V112), pagamentos das compras, despesas com combustível do
  Financeiro (as mesmas da tela "Despesa com combustível"), levadas, combustível e produtos dos fornecedores,
  descontos e acertos da lenha, o que a Central de Pagamentos encaminhou à Lenha, `ALMOX_V52.movsAlm`
  (almoxarifado) e os lançamentos da Produção.
- Abastecimento em posto aparece em Abastecimentos **e** em Despesas, uma vez só (a conta a pagar dele não repete).
- A baixa automática de lenha da enforna aparece como "Consumo na enforna (automático)".
- Cada linha respeita a permissão do módulo de origem; a tela, a do setor.

## Onde está

- `app/jb-gestao.html`: blocos `movimentacoes-v151-css` e `movimentacoes-v151` (fim do arquivo, `window.JB_MOV`).
- Menus: Combustível e Lenha (menu agrupado V112 e Central de lançamentos: "Movimentações"; a lista antiga
  passa a se chamar "Abastecimentos" / "Consumo nos fornos"), Produção (aba "Movimentações", `shellP` exportado
  em `PRODUCAO_SETOR`), Almoxarifado (a mesma rota `#/almMov`, tela nova no lugar da antiga).
- Rotas: `#/almMov`, `#/movCombustivel`, `#/movLenha`, `#/movProducao`.
- Teste: `node scripts/construir.mjs && node scripts/testar-movimentacoes.mjs` (41 conferências).

## Como desfazer

Reverter o commit desta versão (GitHub › Actions › "Reverter publicação"). Não há migração nem dado novo.
