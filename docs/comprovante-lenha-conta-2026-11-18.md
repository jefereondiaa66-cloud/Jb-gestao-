# Comprovante de entrega de lenha · conta com o fornecedor (18/11/2026)

Pedido do Jeferson: no comprovante que a cerâmica entrega a quem trouxe a lenha, colocar junto com a compra feita
o total que a empresa deve àquele fornecedor.

## Como ficou

Depois do quadro **Pagamento**, o comprovante ganha o quadro **Conta com o fornecedor**:

```
CONTA COM O FORNECEDOR
Saldo anterior                R$ 3.000,00
(+) Esta entrega              R$ 2.000,00
================================
TOTAL DEVIDO          R$ 5.000,00
================================
   Posição da conta em 18/11/2026 11:40
```

- Vale para o cupom 80 mm, o cupom 58 mm (tela, impressão e PDF) e a folha A4 (quadro "Conta com o fornecedor ·
  posição em …", com a linha "Total devido ao fornecedor").
- **Saldo anterior**: o que falta pagar de tudo o que veio antes desta entrega (entregas mais antigas e outros
  valores da conta do fornecedor, como acréscimo de acerto). **Esta entrega**: o que falta pagar dela (se já tiver
  pagamento ou desconto, a linha vira "(+) Falta pagar desta entrega").
- **Total devido**: o mesmo "Falta pagar" do Financeiro › Contas a pagar – Lenha para aquele fornecedor
  (`CPL_LENHA.conta`), já com pagamentos, combustível do fornecedor, descontos de acerto e adiantamentos.
- É a posição na hora em que o comprovante é emitido. Se ele for emitido de novo mais tarde e já houver entregas
  lançadas depois, elas aparecem numa linha própria: "(+) Entregas lançadas depois desta".
- Se a cerâmica tiver crédito com o fornecedor (pagou a mais ou deu combustível acima do que devia), aparece
  "Crédito da cerâmica (desconta das próximas entregas)".
- O quadro **Pagamento** mostra também o que já foi descontado da entrega ("Combustível e descontos" e
  "Adiantamento descontado"), para a conta fechar: pago + descontos + saldo a pagar = valor da entrega.
- Compra cancelada, importada do controle antigo (paga antes do sistema) ou sem fornecedor cadastrado: o comprovante
  sai como antes, sem o quadro.

## Técnico

- `contaFornLenhaV(v)` no bloco `docs-cupom` de `app/jb-gestao.html`; `docEntregaLenhaV` usa o resultado no cupom
  e na folha A4. Só leitura: nenhum registro é gravado ou alterado. Se o módulo do Financeiro não estiver carregado,
  a conta é a soma dos saldos (`finVenda`) das entregas do fornecedor. Qualquer falha só tira o quadro.
- O cupom aceita `total` e `nota` dentro de um bloco (`htmlCupom` e `pdfCupom`): o total sai no mesmo destaque do
  total do cupom. Nenhum outro comprovante usa isso hoje, então os outros cupons não mudam.

## Testes

- `node scripts/verificar.mjs`: a conta (antes + esta + depois = total, mesmo dia pelo número, compromissos pela
  data, crédito, cancelada/antiga/sem fornecedor sem conta, falha sem quadro, soma sem o Financeiro) e o desenho.
- `node scripts/construir.mjs && node scripts/testar-comprovante-lenha-conta.mjs` (programa real, banco simulado,
  dados fictícios): conta igual ao Financeiro, outro fornecedor fora, combustível, pagamento parcial pelo PAGAR /
  DAR BAIXA, emitido de novo depois de outra entrega, adiantamento, cupom 80/58 mm e folha A4 na tela, PDF
  (com `JB_LIBS`) e nada gravado ao emitir.

## Como desfazer

Reverter o commit (GitHub › Actions › "Reverter publicação"). Nenhum dado muda: o quadro é montado na hora.
