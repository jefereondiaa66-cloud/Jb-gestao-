# V137 · Almoxarifado: cadastro de materiais por grupo, em lote e com reposição (18/11/2026)

Pedido do Jeferson: organizar o cadastro de todos os materiais do almoxarifado, item por item ou
por grupo de produtos, para formar o estoque. O patrimônio (máquinas, veículos, móveis) continua
no Centro de Inventário e não foi mexido.

## O que muda na tela

- **Grupos de materiais** (aba nova): família de itens dentro de cada categoria, por exemplo
  Peças e manutenção › Rolamentos. A ficha do grupo mostra os itens que estão dentro dele, com
  saldo e valor, e tem dois botões: "Novo item neste grupo" e "Cadastrar vários de uma vez".
- **Cadastrar vários itens**: um nome por linha, todos com a mesma categoria, grupo, unidade e
  local. O código sai em sequência (PEC-001, PEC-002…) e o que já existe na categoria fica de fora.
  Até 200 por vez. O atalho também aparece no alto da lista de Itens.
- **Ficha do item**: grupo, marca, especificação, código do fabricante ou de barras (não repete),
  estoque máximo, prazo de reposição em dias e custo de referência.
- **Estoque**: filtro por grupo, situação "Repor agora", colunas Consumo/mês e Comprar, curva ABC
  ao lado da situação e o quadro "Valor por grupo". A pesquisa acha por marca, grupo e código do
  fabricante.
- **Relatórios** novos: Sugestão de compra, Curva ABC e Estoque por grupo.
- **Inventário do almoxarifado**: botão "Folha de contagem" (para imprimir e contar no papel, sem
  o saldo do sistema, na ordem do local de guarda) e aviso, ao fechar, de quantos itens ficaram
  sem contagem.

## As contas

- Consumo médio: requisições − devoluções + EPIs entregues nos últimos 90 dias.
- Ponto de reposição: consumo por dia × prazo de reposição + estoque mínimo.
- Comprar: o que falta para chegar ao estoque máximo; sem máximo, um mês de consumo acima do ponto.
- Curva ABC: valor consumido em 12 meses. A até 80% do total, B até 95%, C o resto.
- Custo de referência: só vale enquanto o item não tem nenhuma entrada com preço (saldo inicial
  que veio da contagem). Com a primeira entrada, volta a valer o custo médio das compras.

Tudo isso só sugere: nada é comprado nem lançado sozinho.

## O que não muda

- Entradas, requisições, EPIs, ferramentas, contas a pagar e o cálculo do saldo.
- O banco: os grupos são um tipo novo (`jbt: grupo`) dentro da coleção `alm`, que já existia.
  Nenhum registro antigo muda de formato e não há migração.
- Permissões: quem já via e editava os Itens vê e edita os Grupos.

## Teste

`node scripts/construir.mjs && node scripts/testar-almox-materiais.mjs`
