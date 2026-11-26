# V176 (26/11/2026) · Almoxarifado ↔ Combustível: busca, lançamentos e valor por embalagem

Pedido do Jeferson: conferir a ligação entre o Setor de Combustível e o Almoxarifado, melhorar lançamentos e
buscas, e corrigir o valor dos óleos no Combustível ("10 tambores, cada tambor custa isso, então o estoque total é
isso, o valor total").

## Valor no Combustível
- Lançar por embalagem: Embalagens, Tipo, Cada uma tem e **Valor de cada uma**. O valor da embalagem calcula o valor
  do litro (e o contrário). A janela mostra a conta: `12 × 20 L = 240 L · 12 × R$ 575,00 = valor total R$ 6.900,00`.
- A janela já vem com a embalagem de sempre do produto (a do último lançamento ou a do item mestre).
- Valor do litro 3 vezes acima ou abaixo do custo médio pergunta antes de gravar (o valor do tambor inteiro posto
  como valor do litro).
- Saldo por item, lista de Combustíveis e "Tem agora" mostram `240 L = 12 galões de 20 L · R$ 575,00 o galão
  (R$ 28,75 o litro) · valor total R$ 6.900,00`. Graxa aparece por kg.
- Entradas de produtos: Quantidade com as embalagens, Preço e **Valor total** (no celular o cartão mostra o total, não
  o valor de 1 litro). O rodapé da lista não soma mais o custo por litro.

## Busca
- `JB_BUSCA`: palavras em qualquer ordem, sem acento, singular e plural, medidas escritas de outro jeito
  (15x18 = 15 x 18, 15W-40 = 15w40). Usada no Estoque / Produtos, nos lançamentos, nas janelas de escolher produto e
  na busca do topo (agora com Produtos e Fornecedores).
- Produto que está em outra tela (Cozinha, Limpeza): aviso com botão para abrir lá.
- Nas entradas e no lançamento por foto, o produto é escolhido digitando (no lugar da lista com 220 itens).

## Lançamentos
- Entrada de item do Combustível ainda sem ligação: liga e vai direto para o Combustível.
- Nome com o conteúdo ("500 ml", "18 kg") e quantidade inteira em litro/kg: pergunta se são embalagens.
- Avisos de preço muito diferente da última compra.
- Classificação: lâmpada de 40W, furadeira de 550 W e cola de junta de motor diesel não vão mais para o Combustível.
- Lançamento por foto: fornecedor com LTDA, ME, EPP… é o mesmo já cadastrado sem isso.

## Servidor (migração 20261126000000_seg_estoque_integrado_setores, cópia nº 82 antes)
Em vez de dar o módulo inteiro de um setor ao outro, libera só o estoque integrado:
- o Almoxarifado lê os produtos e os lançamentos (entradas, compras, usos) do Combustível — nada dos outros setores;
- o Almoxarifado grava a entrada integrada do Combustível e o produto criado pelo item mestre;
- o Combustível grava o item mestre CMB e completa a entrada que o Almoxarifado mandou para lá.
Reversão: `20261126000000_seg_estoque_integrado_setores.down.sql` (as funções voltam letra por letra).

Teste: `node scripts/testar-estoque-busca.mjs` (dados fictícios).

## Complemento (26/11/2026, madrugada)
- Início do Setor de Combustível: cada produto do bloco Estoque mostra as embalagens, o preço de cada uma e o valor
  total (antes só "custo médio R$ 28,75"); a linha quebra em vez de cortar.
- Entrada de produtos (várias linhas): no celular os campos saíam para fora da janela. Agora cada linha segue o
  padrão do lançamento de um produto (quantas embalagens, quanto tem em cada uma, valor de cada uma, conta e total na
  hora), em duas colunas dentro da janela; escolher o produto já traz a embalagem de sempre.
- Lançar · produto: as embalagens vêm primeiro; a quantidade total e o valor de 1 litro são calculados.
