# V117 · Combustível para fornecedor de lenha (13/11/2026)

Pedido do Jeferson: todo combustível que a cerâmica dá a um fornecedor de lenha é descontado sozinho do que
a cerâmica deve a ele, pelo nome do fornecedor, com um painel no Setor de Combustível (igual ao "Combustível
para entrega") e outro no Setor da Lenha. Exemplo dele: comprou R$ 1.600 de lenha e o fornecedor abasteceu
R$ 500 na cerâmica: fica só R$ 1.100 para pagar.

Substitui os itens 2 e 3 da V115 (lenha paga pelo saldo geral com crédito abatido à mão e posição do
fornecedor no relatório de compras), a pedido do Jeferson. O item 1 da V115 (custo de buscar) continua.
Tudo no programa que já existe (`app/jb-gestao.html`, bloco "17. combustível para fornecedor de lenha" dentro
do Combustível e Lenha V112). Só acrescenta: nenhum dado gravado muda de formato e nada é apagado.

## Como se lança

1. **Setor de Combustível** (o lançamento de sempre): Novo abastecimento → "Abastecido em: **Fornecedor de
   lenha**" → escolhe o fornecedor (fornecedores do Setor da Lenha) → litros → preço por litro.
   - O preço vem com o custo por litro da V115 (média das compras + custo de buscar) e pode ser mudado.
   - Antes de salvar, a tela mostra quanto a cerâmica deve a ele agora e quanto fica depois do desconto.
   - O diesel sai do estoque da bomba (e conta no totalizador), mas fica **fora do custo de combustível da
     produção** (Controladoria): é pagamento da lenha.
   - Também pela Central de lançamentos ("Abastecer fornecedor de lenha"), pelo menu de funções e pelo
     botão "Pagar com combustível" da compra de lenha, que já abre com o fornecedor.
2. **Setor da Lenha, à mão** (o que não passou pela bomba, ex.: posto por conta da cerâmica): Combustível dos
   fornecedores → Lançar à mão → fornecedor, data, onde recebeu, litros e preço (opcionais) e valor. Não mexe
   no estoque de combustível. Fica na coleção `clCtrl` (tipo `comb`).

Gravado no abastecimento: `abastecidoEm: 'Fornecedor de lenha'`, `categoria: 'Combustível para fornecedor de
lenha'`, `foraDaProducao: true` e `combLenha: {fornecedorId, fornecedorNome, fornecedorDoc, precoUnit, valor}`.

## O desconto (calculado, nunca um contador)

- O combustível de cada fornecedor abate o saldo das compras de lenha dele em aberto, da compra mais antiga
  para a mais nova (data da compra). Os lançamentos entram em ordem de data.
- O que passar do que está em aberto vira **crédito** e desconta sozinho da próxima compra dele.
- Contas a pagar, Financeiro, acerto, painéis e "Valores a pagar" leem o valor que resta (`finVenda`).
- Excluir o lançamento refaz o desconto na hora (o sistema avisa antes).
- Compra de acerto fechado que ainda tem saldo também recebe o combustível lançado depois, como um pagamento:
  o acerto continua igual, só diminui o que falta pagar.

## Acerto de lenha

- O combustível já descontado nas compras do acerto aparece na tela e no demonstrativo (data, origem,
  quantidade, compra e valor) e no resumo: "(−) Combustível do fornecedor".
- Ao fechar, ele vira abatimento fixo da compra (`abatimentos[]` com `srcId: 'cb:<lançamento>'`), uma vez só.
  O lançamento fica travado: só sai com o estorno do acerto. Estornar o acerto devolve o desconto ao cálculo
  automático.

## Telas

- **Setor de Combustível**: indicador "Combustível para lenha" (mês e hoje), bloco "Combustível para lenha"
  com os últimos abastecimentos, tela própria (`#/combLenha`) com hoje, mês, ano, por fornecedor e a lista com
  a situação do desconto (esta só para quem vê os valores da lenha). Nas listas e relatórios o fornecedor
  aparece no lugar do veículo; os relatórios por veículo juntam tudo em "Fornecedores de lenha".
- **Setor da Lenha**: indicador "Combustível dos fornecedores", bloco no início com o que resta a pagar a cada
  fornecedor, tela "Combustível dos fornecedores" (`#/clComb`) com o resumo por fornecedor e os lançamentos,
  "Valores a pagar" com compras em aberto − combustível = resta a pagar, crédito e líquido previsto, e
  "Pagamentos" com o combustível separado do dinheiro.
- **Compra de lenha**: bloco "Combustível do fornecedor" com o que foi descontado e quanto falta.
- **Resumo do dia** (e o WhatsApp das 19h): o abastecimento aparece com o nome do fornecedor.

## Permissões

- Lançar o abastecimento: quem já lança abastecimentos (`consumos`).
- Ver os valores da lenha e lançar à mão: administrador, gerente e financeiro (`clComb`, como os descontos).
  Quem só lança abastecimento não vê quanto a cerâmica deve ao fornecedor.

## Técnico

- `window.CB_LENHA`: `aloc()` (repartição memorizada pelas coleções), `creds()`, `credPorId()`, `resumoForn()`,
  `sitCred()`, `novoAbast()`.
- A lista de contas do Financeiro (`obrigacoes`) passou a considerar também `consumos` e `clCtrl` na memória.
- O "Pago com combustível" da V62 continua valendo para os lançamentos antigos (só aparece neles); os novos
  usam este.
- Teste: `node scripts/testar-combustivel-fornecedor-lenha.mjs` (37 conferências, 1280 px e 390 px).
