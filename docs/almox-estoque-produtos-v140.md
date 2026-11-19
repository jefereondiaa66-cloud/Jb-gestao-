# V140 · Almoxarifado: Estoque / Produtos (19/11/2026)

Pedido do Jeferson: o botão "Grupos de materiais" do início do almoxarifado vira **Estoque / Produtos**,
o estoque de tudo o que tem no almoxarifado. Ele quer cadastrar os produtos tirando uma foto e dizendo
quanto tem. Quando o material sai, o saldo tem de baixar sozinho. Os lançamentos precisam ficar mais
práticos e ter as mesmas funções do resto do programa: ver, editar, imprimir, cupom e relatório.

## Tela `#/almProdutos`

- **Produtos**: a lista de todos os produtos com o saldo, o valor e a foto. A busca filtra na hora,
  por nome, código, marca ou local. Os grupos e as categorias viram filtro. Cada produto tem os botões
  "Saída" e "Entrada". Ao tocar no produto, abre a ficha dele: saldo, custo médio, mínimo, os últimos
  lançamentos, "Editar cadastro" e "Todas as movimentações".
- **Lançamentos**: tudo o que mexeu no estoque, com busca, tipo e período. Entram as requisições, as
  compras, as entradas sem compra, as devoluções, os EPIs entregues e as contagens. Cada um tem estes
  botões:
  - **Ver**
  - **Cupom** (80 ou 58 mm)
  - **A4**
  - **Editar**
  - **Excluir** (só nas entradas e saídas por ajuste feitas aqui; a requisição usa a exclusão de lá)
- **Imprimir relatório**: na aba Produtos sai a posição do estoque; na aba Lançamentos, a relação dos
  lançamentos. Os dois seguem os filtros da tela. A posição do estoque também entrou em Relatórios do
  almoxarifado, com Excel e CSV.

## Lançar saída e entrada

Você digita o que procura e a lista de produtos vai filtrando. Depois:

1. Marque os produtos.
2. Ponha a quantidade de cada um, digitando ou com os botões − e +.
3. Escolha o setor tocando num botão ou digitando, e diga quem retirou.
4. Confirme.

A saída vira uma requisição de verdade, com o mesmo número, as mesmas regras e o mesmo custo médio da
tela Requisições. A entrada sem compra vira um ajuste de entrada (saldo inicial, sobra, devolução…),
com preço opcional. Quando o produto ainda não tem compra com preço, esse preço vira o custo de
referência dele. A compra com nota continua em "Nova entrada", porque é ela que gera a conta a pagar.
No fim, o programa pergunta se quer imprimir o comprovante: Cupom 80 mm, Cupom 58 mm ou Folha A4.

## Cadastrar por foto

Você tira uma foto do produto e escreve a frase, por exemplo "tem 10 desse, marca tal". O leitor de
fotos do Lançamento Inteligente (`window.ALM_IA_LER`) preenche estes campos:

- nome
- marca
- código do fabricante
- especificação
- categoria
- grupo
- unidade
- quantidade
- preço

Você confere e salva.

- Se o grupo não existe, ele é criado.
- A quantidade vira o saldo inicial.
- A foto fica guardada no produto.
- **Produto que já existe não é duplicado.** Isso vale quando o código do fabricante é igual, quando
  o nome é igual ou quando a IA reconheceu o produto. O programa avisa e pergunta o que fazer:
  - somar ao que já tem;
  - tratar como o total de agora, acertando o saldo;
  - cadastrar como outro produto.
- Depois de salvar, a janela continua aberta e limpa, pronta para o próximo produto.
- Quando a IA não está disponível, os campos são preenchidos à mão.

O Estoque do Centro de Inventário ganhou o mesmo botão "Cadastrar por foto".

## Um estoque só

Esta tela não tem saldo próprio. Ela grava nos mesmos produtos, requisições e ajustes do almoxarifado
(coleção `alm`) e segue as mesmas regras:

- `conferirS` para a saída;
- a validação dos ajustes, dos itens e dos grupos.

O saldo que aparece aqui é o mesmo do Estoque do Centro de Inventário, da tela Requisições e dos
relatórios. O banco não mudou: nenhuma tabela, migração ou permissão nova.

## Teste

`node scripts/construir.mjs && node scripts/testar-almox-produtos.mjs` percorre o fluxo completo:

1. Cadastra por foto com um leitor falso.
2. Cadastra o mesmo produto de novo e confere que ele não duplica.
3. Faz uma busca.
4. Tenta uma saída maior que o saldo, que é recusada.
5. Faz a saída e confere que o saldo baixou.
6. Abre o cupom.
7. Lança uma entrada.
8. Edita e exclui um lançamento.
9. Abre os dois relatórios.
10. Abre a ficha do produto.
11. Repete na tela de celular.
