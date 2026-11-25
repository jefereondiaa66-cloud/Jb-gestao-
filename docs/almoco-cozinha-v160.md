# V160 · Controle de almoço da Cozinha (24/11/2026)

> Desde a V162 (25/11/2026) o controle é de **café, almoço e janta** e quem não foi marcado conta como NÃO:
> veja [refeicoes-cozinha-v162.md](refeicoes-cozinha-v162.md). O resto continua como descrito aqui.

Pedido do Jeferson (24/11/2026): dentro do **Setor do Almoxarifado / Cozinha**, só na parte da **Cozinha** (sem
misturar com o almoxarifado: telas, menus, tabelas e relatórios separados), registrar todo dia quem almoçou na
fábrica e descontar sozinho o valor da refeição na folha de cada funcionário, no Setor Pessoal.

## Onde fica

- **Início do setor** → botão **"Almoço do dia"**, logo depois do botão "Cozinha".
- **Cozinha** (estoque da cozinha) → botão **"Controle de almoço"**.
- **Módulos do setor** → as quatro telas juntas, logo depois de "Cozinha": Almoço do dia · Relatórios do almoço ·
  Histórico do almoço · Valor do almoço.
- Busca geral (Ctrl K): "almoço", "refeição", "desconto refeição".
- Rotas: `#/almoco`, `#/almocoRel`, `#/almocoHist`, `#/almocoValor`.
- Código: `app/jb-gestao.html`, blocos `almoco-v160-css` e `almoco-v160` (fim do arquivo, `window.JB_ALMOCO`);
  na folha do Setor Pessoal, `refeicaoMes()` (perto do extrato mensal).

## O que tem

- **Almoço do dia** (tela principal, feita para o celular):
  - data de hoje no alto, setas para o dia anterior e o seguinte e "Outro dia" para lançar ou corrigir dias
    passados (dia que ainda não chegou não abre);
  - uma linha por funcionário **ativo do Setor Pessoal** (o mesmo cadastro, sem lista da cozinha), em ordem
    alfabética, com nome, função e os botões **SIM** e **NÃO** grandes. Afastado e desligado não aparecem; num
    dia passado aparece quem ainda trabalhava naquele dia (desligado depois, admitido antes);
  - **SIM**: a linha fica verde e o desconto do dia entra na hora. **NÃO**: a linha fica cinza e nada é
    descontado. Dá para trocar enquanto o mês estiver aberto; a troca corrige o lançamento;
  - embaixo do nome: quem marcou e a hora. Tocar no nome mostra todas as marcações do dia;
  - **Marcar todos como SIM**: só quem ainda está sem marcação (quem está NÃO continua NÃO), com confirmação e
    **Desfazer** por alguns segundos;
  - busca pelo nome no alto e filtros Todos · Sem marcar · SIM · NÃO, com a contagem;
  - **rodapé fixo**: almoços do dia, valor do dia e quantos faltam marcar (no celular, logo acima da barra de baixo).
- **Novo funcionário** (cadastro rápido): nome completo, CPF, função e data de admissão. Vai para o
  **cadastro do Setor Pessoal** (o CPF na parte protegida) e já aparece na lista do dia. Confere CPF válido e
  CPF repetido. O Setor Pessoal recebe o aviso "Cadastro rápido da Cozinha: completar NOME" no botão PENDÊNCIAS
  e completa o resto (setor, tipo de contratação, remuneração).
- **Valor do almoço**: valor por dia de almoço, com a data em que passa a valer. **Vale só daqui pra frente**: o
  dia já lançado guarda o valor de quando foi marcado (o primeiro valor pode começar num dia passado). Uma
  mudança agendada para depois pode ser cancelada antes de valer. Tabela com todos os valores, quem salvou e quando.
- **Desconto na folha (Setor Pessoal)**: evento **"Desconto refeição"** = almoços do mês × valor de cada dia:
  - extrato do funcionário: linha "(–) Desconto refeição (N almoços na fábrica)";
  - fechamento da folha: coluna "Refeição" e o total "Desconto refeição" (só aparecem quando há almoço no mês);
  - recibo, documento da folha, planilha e holerite (evento **530 · Desconto refeição**);
  - mudou na cozinha, a folha (ainda aberta) muda sozinha.
- **Folha fechada trava o mês**: com a folha do mês **fechada ou paga** no Setor Pessoal, a cozinha mostra o
  aviso e não deixa mudar nada daquele mês (o banco também recusa). Reabrir a folha destrava.
- **Relatórios do almoço**: por funcionário (dias que almoçou e valor a descontar), por dia (quantos almoçaram e
  valor do dia) e os lançamentos; filtro por período e por funcionário; visualizar, imprimir, **PDF** e **Excel**
  (e o relatório completo com os dois resumos). Mostra a situação da folha de cada mês do período.
- **Histórico do almoço**: cada marcação (SIM, NÃO, desmarcado pelo Desfazer) com quem marcou, data e hora,
  filtros e exportação; e as mudanças no valor do almoço.

## Perfis

| Perfil | Pode |
|---|---|
| **Cozinha** (novo) | só o almoço: marcar SIM e NÃO e fazer o cadastro rápido. Vê o valor, não altera. Qualquer outra tela volta para o Almoço do dia |
| **Pessoal / Administrador** (rh, dp, admin) | tudo da Cozinha + alterar o valor do almoço, ver a folha e fechar o mês |
| gerente | marca e consulta |
| financeiro | só consulta |

Na nuvem, o servidor confere de novo: módulo **"Cozinha – controle de almoço"** (ver, criar, editar) para
quem lança; o valor do almoço é do módulo **Folha de pagamento**.

## Regras do banco (migração `20261124130000_seg_almoco_cozinha`)

- Coleções novas: `almoco` (um item por pessoa e dia, `al-AAAA-MM-DD-<funcionário>`, agrupados por mês) e
  `almocoCfg` (documento `valor`, com a tabela de valores). Nenhuma coleção do almoxarifado é tocada.
- Gatilho em `almoco`, para todos (inclusive administrador e a ponte do Claude): mês com folha fechada ou paga
  não muda; lançamento não se apaga; o banco grava quem marcou, a hora e o valor do dia (o valor e o histórico
  mandados pela tela são ignorados).
- Gatilho em `almocoCfg`: valor só daqui pra frente, valor salvo não muda nem some, cancelamento só de mudança
  que ainda não começou.
- `jb_almoco_cadastrar`: cadastro rápido no servidor (CPF conferido, matrícula sem repetir).
- `jb_compartilhados`: a Cozinha recebe só nome, função e datas dos funcionários e só a situação da folha de cada
  mês ("almocoFolhas"). Salário, CPF e dados pessoais continuam só para o Setor Pessoal.
- Testada no banco real antes de valer, dentro de uma transação desfeita no fim: 37 de 37.
- Reverter: `20261124130000_seg_almoco_cozinha.down.sql` (os lançamentos continuam em `public.docs`).

## Como começar (nuvem)

1. **Setor Pessoal / administrador**: Valor do almoço → escreva o valor (ex.: 5,00) e a data em que começa.
2. **Usuários e segurança** (painel do administrador): para a cozinheira, perfil **"Cozinha (só o controle de
   almoço)"** e o módulo **"Cozinha – controle de almoço"** com Ver, Criar e Editar.
3. A Cozinha entra, toca no Setor do Almoxarifado / Cozinha e cai direto no Almoço do dia.

## Testes

- `node scripts/testar-almoco.mjs` (no navegador, com o programa real e o banco simulado, gatilho imitado):
  lista do dia, SIM/NÃO/troca, marcar todos e desfazer, busca, outros dias, mês fechado (na tela e no banco),
  recusa de um lançamento sem recriar a parte do mês, cadastro rápido, valor só daqui pra frente, agendar e
  cancelar, folha (extrato, folha, recibo, holerite 530), fechar e reabrir a folha, relatórios, PDF e Excel,
  histórico, perfil Cozinha e celular (botões grandes, rodapé acima da barra de baixo, sem rolar para o lado).
- `node scripts/verificar.mjs` grupo `[almoco]`.

## Observações

- A **quinzena** não muda: o desconto entra na folha mensal (as quinzenas não estão em uso).
- Desconto em salário precisa de autorização do funcionário por escrito (art. 462 da CLT e Súmula 342 do TST):
  vale guardar o termo assinado de cada um. (Não é parecer jurídico.)
