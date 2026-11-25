# V172 · Marca diferente é outro produto e edição completa do lançamento

Pedido do Jeferson em 25/11/2026, para o Estoque / Produtos, a Cozinha e a Limpeza do Almoxarifado.

## Produto já cadastrado × marca nova

Na entrada (cadastro por foto ou Lançamento Inteligente por Foto), o produto é o mesmo quando **o nome e a marca batem**.

| Situação | O que o sistema faz |
| --- | --- |
| Mesmo nome e mesma marca | Avisa e já marca **Somar**: a quantidade entra no produto que já existe, no grupo dele. |
| Mesmo nome e outra marca | Avisa **Marca nova** e já marca **Cadastrar como produto novo**: o produto fica separado, no mesmo grupo do outro. Dá para dizer que é o mesmo, se a marca foi lida errado. |
| O produto de lá não tem marca gravada | Pergunta. Já vem marcado **Somar**, e somar grava a marca nele. Se for de outra marca, a pessoa marca **É outro produto**. |
| A marca não foi lida e há mais de um com o nome | Mostra todos e **não grava** até a pessoa escolher qual é (ou escrever a marca). |

- Mudar o nome ou a marca na tela refaz o aviso na hora.
- A IA da foto só devolve o produto existente quando é da mesma marca.
- O cadastro de produto só barra como repetido o mesmo nome **com a mesma marca** na mesma categoria.
- Com dois produtos do mesmo nome, a marca aparece junto do nome nas listas, nos lançamentos e nos comprovantes
  ("Rolamento 6205 2RS · NSK").
- Nota fiscal: a linha que cita uma marca já conhecida não se liga ao item de outra marca (fica como item novo). Entre
  itens de mesmo nome, vale o da marca citada. Linha sem marca conhecida: igual a antes.
- Setor de Combustível: o produto criado para uma marca nova de um nome que já existe lá leva a marca no nome
  ("Óleo 15W40 Mobil").

## Editar o lançamento por completo

Entrada e saída sem compra (inclusive a do cadastro por foto). Abre pelo **Editar** da aba Lançamentos, tocando no
cartão do lançamento ou pelo **Editar** dos últimos lançamentos na ficha do produto.

- **Quantidade**: zero tira a quantidade daquele lançamento. O produto continua cadastrado.
- **Valor de uma unidade** (entradas), **embalagens** (quantas × quanto tem em cada, a conta é feita sozinha).
- **Foto do produto**: pôr ou trocar (na nuvem).
- **Dados do produto**: nome, marca, especificação, grupo (criado se não existir) e local. Valem para todos os
  lançamentos do produto.
- **Data, motivo, quem trouxe ou retirou e observação.**
- **Excluir lançamento**, com a mesma conferência do botão da lista.

Regras: o saldo nunca fica negativo (diminuir ou tirar uma entrada que já saiu é barrado), a saída não passa do saldo,
o produto não pode virar repetido (mesmo nome e mesma marca) e cada mudança fica no histórico. Para a entrada que foi
para o estoque do Combustível, a quantidade do setor é refeita pelo fator do produto.

A ficha do produto ganhou **Trocar foto** também para quem já tem foto.

## V173 · Editar e Excluir no cartão do produto

Pedido do Jeferson no mesmo dia: os botões ficam no próprio cartão, ao lado de **Saída** e **Entrada** (no celular,
numa segunda linha, com o Excluir só com o ícone da lixeira).

- **Editar**: com um lançamento só (o cadastro por foto, por exemplo), abre direto a edição completa. Com mais de um,
  mostra a lista dos lançamentos do produto para escolher. Sem lançamento, abre a ficha.
- **Excluir**: se aquele lançamento é o único registro do produto (cadastro feito por engano), o lançamento e o
  produto saem do estoque. Com outros lançamentos, mostra a lista para escolher qual excluir, e o produto continua.
  Produto ligado ao Combustível ou que está numa contagem nunca é apagado. Tudo pede confirmação e fica no histórico.

## Teste

`node scripts/construir.mjs && node scripts/testar-almox-marca-editar.mjs` percorre tudo com dados de exemplo.
