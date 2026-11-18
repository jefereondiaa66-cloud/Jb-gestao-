# V120 · Comprovante do lançamento (13/11/2026)

Pedido do Jeferson: ao abrir um lançamento, poder emitir um comprovante dele, em todos os
setores (em 13/11/2026, às 22:30, o Jeferson pediu o Setor Pessoal também).

## O que mudou

- **Botão "Comprovante" na janela do lançamento.** Aparece no rodapé, ao lado de Fechar/Salvar,
  em todo registro aberto pelo formulário padrão nos setores de Vendas, Lenha, Combustível,
  Produção, Financeiro, Almoxarifado, Barro, Paletes e Controle (53 módulos). Nos cadastros
  (cliente, fornecedor, veículo, item…) o botão se chama **"Imprimir ficha"**.
- **Setor Pessoal também** (pedido de 13/11/2026, 22:30): todas as telas do menu do DP têm o botão;
  a ficha do funcionário tem "Imprimir ficha".
- **Compromisso do Financeiro** (janela de contas a pagar): botão "Comprovante" com valor
  previsto, pagamentos informados e saldo.
- O documento abre em **Visualizar documento**, no padrão da V116: cupom 80 mm, cupom 58 mm ou
  folha A4, com Imprimir, Exportar PDF, Baixar (Word) e Compartilhar. A ficha de cadastro sai só
  em folha A4.

## Regras

- **Só leitura.** O comprovante é montado na hora com o que está gravado no registro: mesmas
  seções e campos da tela (só os preenchidos), mais "Registro no sistema" (quem lançou e quando).
  Nada é gravado, recalculado ou alterado, e nenhum histórico é criado.
- **Alteração não salva não vira comprovante:** o sistema pede para salvar antes.
- Todo comprovante diz que é interno e **não é documento fiscal**.
- O setor que sai no documento é o da tela de origem (regra central dos documentos, V111).

## Onde está no código

- `app/jb-gestao.html`, bloco `<script id="comprovante-lanc-v120">` (`COMP_LANC`): regra de setor,
  montagem do documento (`doc`), comprovante do compromisso (`docObrig`).
- Dois pontos de ligação: rodapé e ação `comprovante` em `abrirRegistro`; botão em `abrirObrig`.

## Como conferir

`node scripts/construir.mjs && node scripts/testar-comprovante-lancamento.mjs` (17 conferências).

## Como desfazer

Reverter o commit desta versão (GitHub › Actions › "Reverter publicação"). Não há migração nem
dado novo no banco.
