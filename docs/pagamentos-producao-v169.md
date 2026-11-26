# V169 · Pagamentos da Produção: conferência na Produção, fila de quem paga e pagamento pelo Controle por grade (25/11/2026)

Pedido do Jeferson ("Complemento do prompt – Integração financeira com produção", partes 14 a 18) e o combinado no
mesmo dia: o pagamento da produção é conferido primeiro na Produção; depois de conferido, vai para o Gustavo; e no
Financeiro fica um "painelzinho" igual ao da Lenha e do Combustível.

O que já existia e foi usado como estava: o Controle por grade (V156/V158: cadastro dos trabalhadores, grades da
Enforna e da Desenforna com o valor digitado em cada lançamento, empreita do forno, extrato, pagamento com recibo, os
pagamentos quitando primeiro os lançamentos mais antigos), a agenda do Gustavo (V133) e a fila "Encaminhados para
agendamento" (V166).

Bloco no programa: `<style id="pagamentos-producao-v169-css">` e `<script id="pagamentos-producao-v169">` no fim de
`app/jb-gestao.html`. Teste: `node scripts/testar-pagamentos-producao.mjs` (programa real, banco simulado, dados fictícios).

## 1. Como funciona (o fluxo)

1. **A Produção lança** as grades (Enforna e Desenforna) e as empreitas do forno, como sempre. O valor continua digitado
   em cada lançamento.
2. **O responsável confere** em Produção › Controle por grade › **Conferir e enviar** (`#/pgConf`): os lançamentos
   ainda não conferidos aparecem separados por trabalhador, todos marcados. Ele desmarca o que estiver errado, corrige
   (botão Abrir) e toca em **Conferir e enviar ao Financeiro**. A janela mostra o resumo por trabalhador e o total; é
   preciso marcar "Conferi as quantidades e os valores". "Pagar até" e observação são opcionais.
3. **Vai para o Gustavo**: cada conferência de cada trabalhador vira um compromisso do Financeiro, na categoria
   **Pagamentos da Produção**, que já chega na fila **Encaminhados para agendamento** da agenda do Gustavo.
4. **O Gustavo agenda** (escolhe o dia) ou **paga direto**. Pagar abre o pagamento do Controle por grade, com o valor
   conferido e em aberto já preenchido, e sai o **recibo** para o trabalhador assinar. O pagamento sai do Caixa ou do
   banco escolhido (aparece no Caixa e bancos, no Fluxo de caixa e no Resumo do dia).
5. **A Produção vê a situação** de cada lançamento e de cada conferência: a conferir, na fila de pagamento, agendado
   para o dia, pago em parte, pago.

## 2. Na Produção

- **Conferir e enviar** (`#/pgConf`), sub-aba do Controle por grade, logo depois de Lançamentos. Quadros: a conferir,
  enviado ao Financeiro, agendado e pago no período. "Enviados": cada conferência com a situação, os lançamentos, o
  recibo e **Desfazer a conferência**.
- **A ordem do controle**: os pagamentos quitam primeiro os lançamentos mais antigos, então não dá para enviar um
  lançamento deixando um mais antigo do mesmo trabalhador para trás (desmarcar um dia desmarca os mais novos; marcar
  um dia marca os mais antigos).
- **Lançamento conferido não muda** dia, pessoa, setor, grades nem valor (a observação pode). Para corrigir: desfazer a
  conferência (só enquanto não foi pago nem agendado; pede o motivo e guarda no histórico do lançamento) ou cancelar o
  lançamento e lançar de novo.
- A lista **Lançamentos** ganhou a coluna e o filtro **Pagamento**; a ficha do lançamento mostra quem conferiu e quando.
- No painel do controle, um aviso mostra quanto está esperando conferência.
- Quem confere: os mesmos perfis que lançam as grades (administrador, gerente, estoquista, gestor). Fica registrado quem
  conferiu e quando.

## 3. No Financeiro

- **Pagamentos da Produção** (`#/fProd`), no menu (depois de Pagamento por grade), nos atalhos favoritos e em
  **A pagar por módulo** do painel (o cartão aparece quando a Produção já enviou alguma conferência; o cartão antigo
  "Pagamento por grade · Produção" sai nesse momento).
- Quadros (indicadores do pedido): **a pagar (conferido)**, **enviado para agendamento**, **agendado**, **pago no
  período** e **a conferir na Produção** (o que ainda não foi conferido, que não entra no total a pagar); e o **devido
  por atividade**: produção (Enforna), desenforna e empreitas.
- Filtros: trabalhador, equipe (Enforna, Desenforna ou as duas), atividade, centro de custo e período (o período vale
  para os pagamentos; o que está em aberto aparece sempre).
- Um cartão por trabalhador, como na Lenha: conferências, conferido, já pago, falta pagar, situação, **Pagar** e
  **Agendar**. Tocando no trabalhador: as conferências com Pagar, Agendar, Tirar da fila, Enviar para agendamento e Ver
  (a gaveta do compromisso, com o histórico), e o que ainda não foi conferido.
- Os compromissos também aparecem na Central de Pagamentos, em Contas a pagar, no Calendário, no Fluxo de caixa
  (previsto) e no Total pendente, como as outras contas. Não há previsão de multa e juros para eles.
- Pagar o que a Produção ainda não conferiu (por exemplo, em "Pagar outro trabalhador") pede confirmação.

## 4. Regras (sem duplicar, sem misturar)

- **Identificador fixo** de cada compromisso: `pp:<trabalhador>:<envio>`. Um lançamento só entra em um envio; conferir
  de novo o que já foi conferido não muda nada; clique repetido grava uma vez só.
- **Nada é copiado**: o compromisso é calculado dos lançamentos conferidos e dos pagamentos do controle (FIN_ORIGENS).
  A conferência fica no próprio lançamento (`conf`: envio, quem, quando, observação, pagar até, histórico).
- **O Financeiro não grava na Produção** (o pagamento é o do Controle por grade, que o Financeiro já gravava) e **a
  Produção não grava no Financeiro**. A fila e a agenda ficam no registro de apoio do Financeiro (`m_pp_…`), como nas
  compras dos setores.
- **Histórico**: conferência e desfazer na auditoria (`pgConf`), fila e agenda no histórico do compromisso, pagamento no
  controle (recibo).

## 5. Banco (só leitura nova)

Migração `supabase/migrations/20261125160000_seg_pagamentos_producao.sql` (reversão no `.down.sql`): `seg.leitura_item`
passa a entregar à Produção os registros de apoio do Financeiro dos pagamentos da produção (tipo `meta`, ref começando
com `pp:`), para a Produção ver "Agendado para …". Nada muda na escrita. Cópia de segurança antes.

## 6. Testes

`node scripts/testar-pagamentos-producao.mjs`: conferência (quadros, ordem do controle, janela, "Conferi" obrigatório,
envio único, histórico, sem repetir), Financeiro (3 compromissos com identificador fixo, categoria, módulo, fila,
painel, agenda, indicadores, devido por atividade, filtros), agendar, gaveta, pagar pelo controle (valor sugerido,
recibo, Caixa), pagamento não conferido pede confirmação, lançamento travado, desfazer (bloqueado quando agendado,
motivo, histórico), conferir de novo, coluna Pagamento, recarregar a página, celular e busca geral.

## 7. Como desfazer

Reverter o commit desta versão tira as telas e a conferência volta a não existir (os campos `conf` gravados nos
lançamentos ficam guardados e não atrapalham; o Controle por grade continua como antes). Reverter a migração com o
`.down.sql`.
