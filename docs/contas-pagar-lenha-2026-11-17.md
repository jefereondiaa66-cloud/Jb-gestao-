# Financeiro · Contas a pagar – Lenha (17/11/2026)

Pedido do Jeferson: dentro do Setor Financeiro, um módulo em que se clica e aparece tudo da conta da lenha,
por fornecedor, com o botão **PAGAR / DAR BAIXA** (pagamento inteiro ou parcial), o histórico de cada um e o
combustível do fornecedor entrando como crédito. Exemplo dele: devia R$ 10.000 e pagou R$ 5.000 de uma vez →
fica uma linha só com o resto (R$ 5.000), com o pagamento detalhado no histórico.

Tudo no programa que já existe (`app/jb-gestao.html`, blocos `contas-pagar-lenha-css` e `contas-pagar-lenha`,
no fim do arquivo). Rota `#/fLenha` (lista) e `#/fLenha/<fornecedor>` (histórico). Nenhuma tabela nova no banco.

## De onde vêm os números (nada é cadastrado de novo)

| Na tela | Vem de |
|---|---|
| Entregas, quantidade, valor por unidade, data | compras do Setor da Lenha (`compras`, setor `lenha`), sem as importadas "pagas antes do sistema" |
| Abatimentos | combustível do fornecedor (V117: bomba e à mão), "Pago com combustível" antigo (V62) e descontos de acerto (V112) |
| Pago | pagamentos já registrados nas compras (qualquer tela) + os feitos aqui + adiantamentos |
| Saldo | `finVenda` de cada compra (o mesmo número de Contas a pagar, Setor da Lenha e acerto) |
| Outros valores da conta | compromissos do Financeiro do fornecedor de lenha (ex.: acréscimo de acerto) |

Total a pagar = entregas − abatimentos · Total em aberto = soma dos saldos · Fornecedores pendentes = saldo > 0.

## Situações (a mesma palavra no Financeiro inteiro)

Pago (saldo zero) · Vencido (tem entrega com vencimento passado e saldo) · Parcialmente pago (houve pagamento
desde a última vez que a conta ficou zerada) · Agendado (contas em aberto com data programada) · Pendente.
Filtros: Todos, Em aberto, Parcialmente pagos, Pagos, Vencidos, Agendados; pesquisa por nome ou CPF/CNPJ.

## PAGAR / DAR BAIXA

- Valor, data, forma, conta de saída (Caixa ou banco; some nas formas sem dinheiro), observação e comprovante.
- Antes de confirmar mostra o efeito: quais entregas quita, qual fica parcial e o saldo que sobra.
- O pagamento quita primeiro as entregas mais antigas e entra na lista de pagamentos da própria compra
  (`pagamentos[]`, com `baixaLenhaId`), como qualquer pagamento de compra no sistema. Os dados da entrega
  (quantidade, preço, valor, data) nunca mudam.
- Cada pagamento tem um cabeçalho na coleção `fin` (tipo `baixaLenha`) gravado **antes** das parcelas, com o
  plano e os códigos fixos de cada parcela. Se a conexão cair no meio, a baixa fica "Registro incompleto"
  (também em PENDÊNCIAS) e **Concluir o registro** termina sem repetir nada.
- **Acima do saldo**: só com a caixa "Confirmo" marcada e justificativa. O que passa vira adiantamento: um
  compromisso à vista e pago no Financeiro (categoria Lenha, `adiantamentoLenha`), que desconta sozinho das
  próximas entregas do fornecedor (cálculo no `finVenda`, como o combustível da V117).
- **Repetição**: pagamento igual (mesmo valor e dia) ou outro pagamento do mesmo fornecedor há menos de 5
  minutos pede a confirmação "é outro pagamento". Um pagamento por fornecedor de cada vez, botão travado
  durante a gravação e o bloqueio de clique duplo do sistema (0,7 s).
- **Combustível como pagamento**: forma "Combustível (vira crédito do fornecedor)" abre o lançamento certo
  já com o fornecedor (bomba da cerâmica no Setor de Combustível, ou à mão no Setor da Lenha). Também pelo
  botão "Combustível" na tela do fornecedor.
- Depois de confirmar: aviso com o saldo e a barra "Pagamento registrado · Comprovante".

## Histórico do fornecedor

Extrato (cada lançamento em ordem de data com o saldo depois dele), Entregas, Pagamentos (data, valor, forma,
conta, contas pagas, quem registrou, situação, comprovante e estorno) e Combustível e descontos. Extrato em
documento (imprimir/PDF) e Excel. **Agendar / Editar / Cancelar agendamento**: grava a data programada nas
contas em aberto (aparece em Pagamentos do dia e no Calendário; não marca como pago).

**Estorno** (administrador e Financeiro, com motivo): marca as parcelas como estornadas (não apaga), cancela o
adiantamento junto e devolve o valor ao saldo.

## Ligações

- Tela entra em `FIN_ABAS_EXTRA` logo depois de "Contas a pagar" (aparece nos Módulos do Financeiro).
- Permissões: ver `admin`, `financeiro`, `gerente`; pagar, estornar e agendar `admin` e `financeiro`.
- Pesquisa (Ctrl K): a tela e a conta de cada fornecedor. PENDÊNCIAS: registro incompleto.
- Relatórios do Financeiro: "Contas a pagar da lenha por fornecedor".
- Compra de lenha mostra o adiantamento descontado. Acerto de lenha: "Pago antes" inclui o adiantamento.

## Teste

`node scripts/construir.mjs && node scripts/testar-contas-pagar-lenha.mjs` (39 conferências, banco simulado):
parcial R$ 3.000 de R$ 5.000 → R$ 2.000 em aberto; final R$ 2.000 → Pago; acima do saldo sem/ com
justificativa e adiantamento descontando da próxima entrega; três cliques = um pagamento; estorno; queda no
meio e conclusão sem repetir; agendar/editar/cancelar; histórico e comprovante; filtros e pesquisa; Setor da
Lenha e Contas a pagar com os mesmos saldos; combustível virando crédito; recarga da página; celular.

## Como desfazer

Reverter o commit (GitHub › Actions › "Reverter publicação"). Os pagamentos feitos continuam guardados nas
compras (como pagamentos normais) e os cabeçalhos ficam no `fin`, sem efeito sem o módulo.
