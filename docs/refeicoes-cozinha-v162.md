# V162 · Café, almoço e janta na Cozinha (25/11/2026)

Pedido do Jeferson (24/11/2026): "Lá vai ser café, almoço e janta, então quero que você adicione esses outros.
Continue prático como tá agora, só apertando em SIM; nos que não forem apertados nem SIM nem NÃO, coloque
automaticamente como NÃO."

Continua tudo o que a V160 fez ([almoco-cozinha-v160.md](almoco-cozinha-v160.md)); o que muda:

## Na tela

- O controle passa a se chamar **Controle de refeições**. Início do setor → **"Refeições do dia"**; Cozinha →
  **"Controle de refeições"**; Módulos → Refeições do dia · Relatórios das refeições · Histórico das refeições ·
  Valor das refeições. Rotas iguais (`#/almoco`, `#/almocoRel`, `#/almocoHist`, `#/almocoValor`).
- **Refeições do dia**: três botões grandes no alto, **Café · Almoço · Janta**, cada um com o número de SIM do dia
  (no celular, um selo no canto). Ao abrir a tela, já vem escolhida a refeição da hora: até as 10h o café, até as
  16h o almoço, depois a janta. A escolhida à mão vale por 3 horas.
- **Quem não foi marcado é NÃO.** Não existe mais "sem marcação" nem "faltam marcar": a lista já abre com todos em
  NÃO (cinza) e basta tocar em SIM para quem comeu. Filtros: Todos · SIM · NÃO.
- **Marcar todos como SIM**: marca SIM todos que estão NÃO naquela refeição (depois é só tocar em NÃO para quem não
  comeu). **Desfazer** volta esses para NÃO.
- Rodapé: **<refeição> do dia** (quantos SIM), **Valor <da refeição>** e **Total do dia** (as três refeições).
- Tocar no nome mostra as três refeições daquele dia, cada uma com SIM/NÃO, o valor e quem marcou.

## Valores

- **Valor das refeições**: um cartão para cada refeição e o formulário com a escolha da refeição.
- Cada refeição tem o seu valor, que vale só daqui pra frente. O **primeiro** valor de cada refeição pode começar
  num dia que já passou (para lançar os dias anteriores); os seguintes, de hoje em diante.
- Enquanto uma refeição não tem valor, o SIM dela fica travado (o NÃO continua livre).
- O valor do almoço de R$ 12,00 (desde 24/11/2026) continua valendo; **café e janta ainda precisam do valor**.

## Folha do Setor Pessoal

- O evento **Desconto refeição** soma as três refeições do mês, cada uma com o valor de quando foi marcada.
- Extrato: "(–) Desconto refeição (20 almoços, 5 cafés e 3 jantas na fábrica)". Holerite (530), recibo, folha e
  cartões: "28 refeições" quando há mais de uma refeição, ou "20 almoços" quando é só uma.
- Para o assistente: `refeicoesNaFabrica`, `cafesNaFabrica`, `almocosNaFabrica`, `jantasNaFabrica`.

## Relatórios e histórico

- Filtro **Refeição** (todas, café, almoço ou janta). Por funcionário e por dia: colunas Cafés, Almoços, Jantas e
  Refeições (só a escolhida quando se filtra uma). "Refeições lançadas" (antes "Lançamentos") mostra só os SIM,
  com a coluna Refeição.
- Histórico com a coluna Refeição; mudanças nos valores com a refeição de cada valor.

## Dados

- Coleção `almoco`, um lançamento por pessoa, dia e refeição: `ref` = `cafe`, `almoco` ou `janta`, com o código
  `cf-`, `al-` ou `jt-` + dia + funcionário. **Lançamento sem `ref` é almoço** (os de 24/11/2026 ficaram como
  estavam; nada foi migrado).
- `almocoCfg/valor`: cada linha da tabela tem `ref` (sem `ref` é do almoço).
- Banco (migração `20261125120000_seg_refeicoes_cozinha.sql`, cópia nº 76 antes): `seg.almoco_preco(dia, refeição)`;
  o gatilho confere a refeição pelo código, não deixa um lançamento mudar de refeição e usa o valor da refeição; o
  primeiro valor de cada refeição pode ser retroativo. Junto, uma correção: tirar um lançamento de dentro da parte do
  mês volta a mensagem certa ("não se apaga"). Reversão: o `.down.sql` volta as funções da V160 (sem apagar nada).

## Testes

- `node scripts/testar-almoco.mjs`: 76 conferências no navegador (computador e celular), com o gatilho imitado.
- Banco real, numa transação desfeita: valores por refeição, café com valor, almoço e janta sem valor em outubro,
  código que não bate com a refeição, refeição inválida, troca de refeição, nada apagado, folha paga travada,
  almoço de 24/11 com R$ 12,00 e os 4 lançamentos reais intactos.
