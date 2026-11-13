# V115 · Custo de buscar o combustível, lenha paga com combustível e posição do fornecedor (13/11/2026)

Pedido do Jeferson. Tudo dentro do programa que já existe (`app/jb-gestao.html`). Só acrescenta: nenhum
dado gravado muda e os lançamentos antigos guardam o custo com que foram gravados.

## 1. Custo por litro = média das compras + custo de buscar

- O que vem na nota não é o custo todo: a cerâmica gasta para ir buscar o combustível.
- `custoMedioNota(id)` é a média das compras (como era). `custoBuscar(id)` é o acréscimo por litro, que mora no
  cadastro do combustível (`produtos.custoBuscar`); em branco vale **R$ 0,40**. `custoPartes(id)` devolve
  `{media, buscar, custo}` e `custoMedio(id)` passou a devolver o custo com o acréscimo.
- Só vale para itens do tipo **Combustível** do Setor de Combustível. Óleo, graxa, lenha, almoxarifado e produtos
  de venda não mudam.
- Usa o custo novo: abastecimento (custo unitário e total), valor do estoque de combustível, custo de combustível
  da produção e Controladoria (que leem o custo gravado no abastecimento), relatórios do setor e diesel do Barro.
- **Não muda:** o valor da compra, a conta a pagar ao posto e o Financeiro (valor da nota). Abastecimento em posto
  externo continua pelo preço do posto, sem acréscimo.
- Cada abastecimento novo grava `custoMediaNota` e `custoBuscar` junto de `custoUnit`, então mudar o acréscimo
  depois não mexe no histórico.
- Telas: cadastro do combustível (campo "Custo de buscar por litro (R$)" e a conta ao vivo), lista de itens
  ("Custo por litro", com média + buscar), formulário do abastecimento (saldo e custo com as duas parcelas),
  estoque e relatório de estoque do Combustível.

## 2. Lenha paga com combustível (bloco V62)

- O "preço combinado por litro" vem com o custo novo (média + custo de buscar) e continua editável.
- Novo campo **Fornecedor de lenha**: ao escolher, a tela lista as compras dele em aberto (valor, já pago, a pagar).
- **De onde abater:** uma compra só, ou o **saldo geral do fornecedor** (da compra mais antiga para a mais nova).
  O abastecimento grava `pagLenha.rateio[]` e um pagamento em cada compra (`pl-<abastecimento>`, `-2`, `-3`…).
- A tela mostra a conta: litros × preço = valor, a média, o custo de buscar e quanto fica a pagar.
- Valor maior que a dívida **não trava mais**: avisa e guarda a sobra em `pagLenha.credito`
  (crédito da cerâmica com o fornecedor).
- Na compra de lenha do mesmo fornecedor aparece **"Abater crédito de combustível (R$ …)"**. O abatimento é um
  pagamento na compra, forma "Combustível da fábrica", com `creditoDe` = abastecimento e código fixo
  (`plc-<abastecimento>-<compra>`), então não repete. Crédito disponível = sobra − o que já foi abatido.

## 3. Relatório de compras da lenha (`#/relvendas` › Compras, no Setor da Lenha)

Depois da lista de compras do período saem três blocos (na tela, no visualizar/PDF e em abas no Excel):

1. **Resumo**: compras do período + compras de outros períodos ainda em aberto = deve antes dos pagamentos;
   − pago com combustível (litros e valor) − outros pagamentos (− crédito de combustível) = **saldo a pagar**.
2. **Posição por fornecedor**: uma linha por fornecedor com as mesmas colunas e o total.
3. **Lenha paga com combustível**: data, fornecedor, compra, combustível, litros, preço por litro e valor abatido.

Com o filtro de fornecedor, sai só a posição dele. O responsável escolhido no relatório (V80) continua valendo.

## Técnico

- Núcleo: `custoMedioNota`, `custoBuscar`, `custoPartes`, `custoMedio`, `txtCustoV` (junto do estoque).
- `opcoesCampo(f, st)` passou a entregar o registro às opções de lista (para filtrar as compras pelo fornecedor).
- `telaRelatorios` e `exportar` aceitam `res.extras` (quadro ou tabela com título); `htmlExtraRel`, `totaisExtraRel`.
- Bloco novo `custo-buscar-v115` (cadastro do combustível e posição do fornecedor); `window.PAGLENHA_V115`,
  `window.POSICAO_LENHA_V115`.
- Teste: `node scripts/testar-custo-buscar.mjs` (35 conferências, 1280 px e 390 px).
