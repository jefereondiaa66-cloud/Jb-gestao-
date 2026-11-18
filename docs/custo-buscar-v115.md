# V115 · Custo de buscar o combustível (13/11/2026)

Pedido do Jeferson. Tudo dentro do programa que já existe (`app/jb-gestao.html`). Só acrescenta: nenhum
dado gravado muda e os lançamentos antigos guardam o custo com que foram gravados.

## 1. Custo por litro = média das compras + custo de buscar

- O que vem na nota não é o custo todo: a cerâmica gasta para ir buscar o combustível.
- `custoMedioNota(id)` é a média das compras (como era). `custoBuscar(id)` é o acréscimo por litro, que mora no
  cadastro do combustível (`produtos.custoBuscar`); em branco vale **R$ 0,30** (era R$ 0,40 até a V122, 14/11/2026). `custoPartes(id)` devolve
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

## 2 e 3. Trocados pela V117

A pedido do Jeferson (13/11/2026), da V115 fica só o item 1 (custo de buscar). A lenha paga com combustível
pelo saldo geral (com crédito abatido à mão) e a posição do fornecedor no relatório de compras foram trocadas
pela V117: o combustível dado ao fornecedor de lenha é lançado como "Abastecido em: Fornecedor de lenha" e é
descontado sozinho do que a cerâmica deve a ele, com painéis nos dois setores e lançamento à mão no Setor da
Lenha. Ver [combustivel-fornecedor-lenha-v117.md](combustivel-fornecedor-lenha-v117.md). O preço sugerido ao
fornecedor continua vindo com o custo por litro deste item 1.

## Técnico

- Núcleo: `custoMedioNota`, `custoBuscar`, `custoPartes`, `custoMedio`, `txtCustoV` (junto do estoque).
- `opcoesCampo(f, st)` entrega o registro às opções de lista; `telaRelatorios` e `exportar` aceitam `res.extras`
  (quadro ou tabela com título; `htmlExtraRel`, `totaisExtraRel`). Ficaram prontos para uso, sem relatório usando hoje.
- Bloco `custo-buscar-v115`: cadastro do combustível (custo de buscar).
- Teste: `node scripts/testar-custo-buscar.mjs` (só o custo de buscar).
