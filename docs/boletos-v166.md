# V166 · Boletos e contas a pagar e fila de agendamento (25/11/2026)

Pedido do Jeferson ("Prompt – Central Inteligente Financeira", partes 1 a 7 e 12): cadastro de boleto por foto,
leitura automática, classificação, controle de vencimentos e prioridades, e a decisão de cada conta: **PAGAR** ou
**ENVIAR PARA AGENDAMENTO**, com a fila na agenda de quem paga (Gustavo). Regra do pedido: não refazer o Financeiro,
não duplicar, não marcar como pago sem confirmação e manter tudo rastreável.

Muito do pedido já existia e foi **usado como estava**: Lançamento Inteligente por Foto (V65), cadastro de
compromissos com documento de origem, categorias editáveis, Agenda do Gustavo (V131/V133), janela de pagamento com
comprovante, Central de Pagamentos, auditoria. Esta versão só acrescenta o que faltava.

Bloco no programa: `<style id="boletos-v166-css">` e `<script id="boletos-v166">` no fim de `app/jb-gestao.html`.
Teste: `node scripts/testar-boletos.mjs` (programa real, banco simulado, dados fictícios).

## 1. Linha digitável conferida (sem internet, sem IA)

`window.JB_BOLETO.decodificar(texto)` lê a linha digitável (47 números no boleto bancário, 48 na guia de
arrecadação) ou o código de barras (44 números) e confere os dígitos verificadores (módulo 10 dos campos e módulo 11
do dígito geral; na arrecadação, módulo 10 ou 11 conforme o terceiro número). Quando confere, tira do próprio código:

- **valor** (quando o código traz; "0000000000" = sem valor no código);
- **vencimento** pelo fator de vencimento, com a virada da FEBRABAN (o fator chegou a 9999 em 21/02/2025 e voltou a
  1000 em 22/02/2025: das duas datas possíveis fica a mais perto de hoje);
- **banco emissor** (código dos 3 primeiros números) ou o segmento da guia (energia, saneamento, prefeitura…);
- os **44 números do código de barras**, que viram a chave do boleto.

Nada é inventado: guia de arrecadação não traz vencimento no código, e o campo fica como estava.

## 2. Compromisso com os dados do boleto

O cadastro de compromisso do Financeiro (`MODS.fTitulos`) ganhou campos (só acréscimo):
código de barras, conferência do código (ao vivo), banco emissor, data de emissão, CNPJ/CPF de quem recebe (quando é
"Outro") e **prioridade**. A linha digitável aparece também para guia de imposto e conta de consumo.

- Ao digitar ou colar a linha: valor, vencimento, banco e código de barras se preenchem sozinhos (se estiverem vazios);
  forma prevista vira "Boleto".
- **Repetido não entra**: o mesmo código de barras em outro compromisso não cancelado (pago ou não) bloqueia o
  salvamento, no cadastro à mão e na leitura por foto.
- Linha que não confere: pede confirmação ("Confirmar mesmo assim?"); valor ou vencimento diferentes do código: avisa.
- CNPJ/CPF inválido não salva.

## 3. Leitura por foto

O Lançamento Inteligente por Foto continua o mesmo; três ajustes pequenos:

- a linha lida passa pela conferência (`JB_BOLETO.completarConf`): sem total ou vencimento lidos, valem os do próprio
  código; linha que não confere **não é gravada** (aviso na conferência) e o resto do lançamento segue;
- boleto já lançado (mesmo código) vira erro da conferência;
- o compromisso guarda a emissão lida e o CNPJ/CPF do fornecedor;
- correção: o valor digitado em "Valor a pagar" (quando o total não é lido) agora libera o lançamento.

## 4. Tela "Boletos e contas a pagar" (`#/fBoletos`)

No menu do Financeiro logo depois da Central e nos atalhos favoritos. Lê a base única de compromissos
(`FINANCEIRO_SETOR.obrigacoes`): títulos do Financeiro, compras da Lenha e do Combustível, despesas do Setor Pessoal.

- **Cadastrar**: Fotografar boleto (câmera), Galeria ou PDF, **Vários boletos** (um documento por arquivo, lidos e
  conferidos um de cada vez, com "Próximo boleto" na tela da leitura) e Cadastrar à mão (já como boleto).
- **Faixas de vencimento** (valor e quantidade; tocar filtra): Vencidos · Vencem hoje · Em até 3 dias · De 4 a 7 dias ·
  De 8 a 15 dias · Vencimentos futuros (e sem vencimento) · Aguardando agendamento · Agendados · Já pagos no mês.
- **Pesquisa e filtros**: fornecedor, descrição, número, banco, valor ("95,50"), pedaço da linha digitável ou do código
  de barras; situação, categoria, vencimento de/até, valor de/até, só boletos.
- **Cartões** (um abaixo do outro), do mais urgente para o menos: prioridade, situação, quando vence, documento,
  linha conferida, anexo. Ações: **Pagar**, **Enviar para agendamento** (uma ou várias marcadas), Tirar da fila,
  Ver na agenda e ⋯ (detalhes, prioridade, retirar da agenda, copiar a linha, ver o documento, anexar, editar, abrir na
  origem, cadastrar como fornecedor).

### Situações nesta tela

Pendente · **Aguardando agendamento** (enviada, sem dia) · **Agendado** (na agenda de quem paga, com dia) · Vencido ·
Parcialmente pago · Pago · Cancelado. Enviar e agendar **nunca** pagam: pago é só com o pagamento registrado na janela
de pagamento (data, valor, forma, conta, comprovante; quem registrou fica gravado).

### Prioridade

Calculada (sem gravar nada): **Crítica** = vencida ou vence hoje, ou essencial em até 2 dias; **Alta** = até 3 dias,
ou essencial em até 7; **Média** = até 15 dias (ou essencial); **Baixa** = depois disso ou sem vencimento. Essenciais:
energia, água/saneamento, impostos e guias, financiamentos e empréstimos, salários/folha/pró-labore, arrendamento e
aluguel. O responsável pode definir a prioridade (⋯ › Prioridade, com motivo); "Automática" volta a calcular.

## 5. Fila na agenda de quem paga (`#/fagenda`)

Quadro **"Encaminhados para agendamento"** logo abaixo do título (só aparece com algo na fila; dá para ocultar): as
contas enviadas, da mais urgente para a menos, com quem enviou, quando e a observação. Marcar e **Agendar marcadas**
(dia, forma e conta; mostra o total já agendado no dia e o total com as novas), **Pagar** direto ou **Tirar da fila**
(com motivo). Ao agendar, a conta entra na agenda no dia escolhido (marca `naAgenda` + `dataPrevista`, como na V133) e
sai da fila. A agenda continua começando vazia: vencimentos não entram sozinhos.

## 6. Onde fica cada coisa (sem copiar nada)

- Compromisso do Financeiro: campos no próprio registro (`codigoBarras`, `bancoEmissor`, `dataEmissao`, `cnpjCpf`,
  `prioridade`, `prioridadeInfo`, `fila`).
- Conta que nasceu em outro setor (compra, despesa do DP): no registro de apoio `fMeta` (`m_<ref>`), o mesmo da agenda.
- `fila = {st: aguardando|agendado|retirado, em, por, obs, agEm, agPor, agPara, retEm, retPor, motivo, hist[]}`.
- Cada passo vai para o histórico do sistema (`enviou para agendamento`, `agendou o pagamento`, `retirou do
  agendamento`, `definiu a prioridade`) e para a auditoria do banco. A janela da conta mostra o boleto, a prioridade e o
  histórico do agendamento.

## 7. Testes

`node scripts/testar-boletos.mjs` (42 conferências): leitor da linha (bancário, arrecadação, número trocado, fator de
vencimento), cadastro à mão com preenchimento automático, repetido bloqueado, linha errada com confirmação, faixas e
prioridades, pesquisa e filtros, enviar (uma, várias, clique triplo), fila na agenda (agendar marcadas, tirar da fila),
retirar da agenda, prioridade definida, pagar (só com confirmação), janela da conta, leitura por foto (repetido,
valor do código, linha errada não gravada), vários boletos, menu/favoritos/busca/voltar, persistência, sem duplicados,
celular e nenhum erro de JavaScript. Regressão: `verificar.mjs`, Central de Pagamentos, Lançamento por Foto,
navegação, Lenha, Controle por grade, comprovantes, filtros, movimentações, pendências, relatórios.

## 8. Como desfazer

Só código mudou; nenhum dado existente foi convertido. Reverter o commit desta versão tira a tela, a fila e os campos
novos; os campos gravados nos compromissos ficam sem uso e não atrapalham.
