# Financeiro V130: painel com três indicadores e Central de Pagamentos (18/11/2026)

Pedido do Jeferson: **reformular e evoluir o Financeiro atual, sem criar outro**. O painel fica só com três
indicadores e um botão; o Gustavo resolve toda a rotina na **Central de Pagamentos**: agenda, pagamentos do
dia, pagamento extra, classificação por setor, encaminhamento automático e relatório do dia para o dono.
Nada do que existia foi apagado: telas, lançamentos, históricos, fornecedores, categorias e integrações
continuam os mesmos.

Bloco no programa: `<style id="central-pagamentos-css">` e `<script id="central-pagamentos">` no fim de
`app/jb-gestao.html` (o mesmo bloco de 17/11, agora maior). Teste: `node scripts/testar-central-pagamentos.mjs`.

## 1. Auditoria (antes de mudar)

O que o Financeiro de 17/11 tinha, e o que isso significava para o pedido:

| Ponto | Como estava | O que foi feito |
|---|---|---|
| Abertura do setor | Central com 7 indicadores e cerca de 20 quadradinhos de atalho | Painel com **3 indicadores** e **1 botão** |
| Menu do setor | 8 entradas de pagamento (Contas a pagar, Pagamentos do dia, Calendário, Lenha, Combustível, Despesas gerais, Outros, Pagamentos) + Lançamento por Foto | Uma entrada: **Central de Pagamentos**. As telas antigas continuam existindo, por dentro da Central (Mais ▾) |
| Base de compromissos | `FINANCEIRO_SETOR.obrigacoes()`: leitura única de títulos do Financeiro, compras da Lenha e do Combustível e despesas do Setor Pessoal; situação calculada dos fatos | Mantida. A Central só lê e usa as ações que já existiam (`pagar`, `programar`, `anexar`, `cancelarT`) |
| Setor de um lançamento | Só o `setorOrigem` (quem lançou) e a categoria | Campo novo `enc` no próprio título (seção 4). `setorOrigem` e categoria **não mudam**: a Controladoria lê os dois |
| Integrações reais | Lenha (conta por fornecedor, adiantamento), Combustível (despesas de combustível), Almoxarifado (entradas), Setor Pessoal (despesas), Controladoria | Todas preservadas e usadas no encaminhamento |
| Gravação | Junta campos: apagar uma chave não remove, é preciso gravar vazio | Respeitado (`adiantamentoLenha: null`, `motivo: ''`) |

## 2. Painel do Financeiro (`#/setor-financeiro`)

- **Pagos no mês** (mês escolhido no seletor): valor e quantidade. Toque abre Central › Pagos no mês.
- **Pagamentos de hoje**: valor total, quantidade, pago e pendente. Toque abre Central › Hoje.
- **Pagamentos agendados**: valor e quantidade dos compromissos futuros e o próximo dia. Toque abre Central › Contas (agendados).
- Botão **Central de Pagamentos**. Nenhum quadradinho, atalho ou lista.

No celular a barra de baixo ganhou **Central**.

## 3. Central de Pagamentos (`#/fcentral`)

Cabeçalho: **Novo pagamento**, **Relatório do dia ▾** e **Mais ▾** (exportar a lista, lançar por foto, trazer
várias contas para um dia, Lenha por fornecedor, Combustível por posto, Despesas gerais, Outros pagamentos,
Contas a pagar completa, gráficos e conferência com o banco).

| Aba | O que tem |
|---|---|
| **Hoje** | Resumo do dia (previsto, pago, extras, falta pagar, em atraso), avisos de "aguardando classificação" e "pendente de integração", listas Para pagar hoje, Em atraso e Pagos hoje |
| **Agenda** | O calendário de sempre (mês, semana e dia). Tocar num dia abre o dia: o que está agendado, **Pagar**, **Agendar para o dia**, lançar o que não estava agendado e o **relatório daquele dia** |
| **Contas** | Todas as contas, com pesquisa e filtros por situação, setor, categoria, fornecedor e período |
| **Pagos** | Uma linha por pagamento feito (data efetiva, quem deu baixa, forma e conta), com filtros por período, setor e tipo (agendado ou extra) |
| **Indicadores** | Pago no mês, previsto, pendente, vencido, pago hoje, despesas extras, **despesas por setor**, **pagamentos futuros** e **histórico mensal** |

Colunas das listas: vencimento, fornecedor ou beneficiário, descrição, categoria, **setor**, forma, valor e
situação. No celular a lista vira cartão, com categoria e forma numa linha própria.

**Pagar** (um toque na linha): janela curta com data, forma e conta já preenchidas; confirma e a baixa fica
com a data efetiva e quem pagou. "Mais opções" abre a janela completa (parcial, multa, juros, permuta).
Agendar não paga: a conta só fica paga quando alguém confirma o pagamento.

**Novo pagamento**: descrição, fornecedor ou beneficiário, valor, categoria, setor responsável, data, forma de
pagamento, conta de saída e observações. Dois modos: **Já foi pago** (pagamento extra, nasce pago e marcado
como `extra`) e **Agendar para pagar** (entra na agenda, sem baixa).

**Relatório do dia** (para o dono): agendado × pago × extras × ficou sem pagar × em atraso, cada pagamento com
hora, setor, forma, conta e quem lançou, pago por setor e por forma. Sai como documento da empresa
(visualizar, PDF, imprimir, compartilhar, Excel) e como **resumo pronto para o WhatsApp**.

## 4. Setor de destino: identificação e encaminhamento

Destinos: Lenha, Combustível, Compras e almoxarifado, Produção, Barro, Paletes, Vendas e entregas, Pessoal,
Administrativo, Impostos e bancos.

### Como o sistema identifica (nesta ordem)

1. **Categoria** que só serve a um setor (ex.: Lenha, Combustível para entrega, Peças e materiais,
   Funcionários). Categorias genéricas ("Fornecedores", "Outras despesas") não decidem nada.
2. **Fornecedor do cadastro** de Lenha ou de Combustível (nome igual, ou nome curto que só casa com um
   cadastro). Se a descrição falar de outro assunto ("Vale" para alguém que tem o nome de um fornecedor de
   lenha), **não decide**.
3. Fornecedor do almoxarifado.
4. **Classificação manual anterior** de quem recebe (o que a pessoa já classificou à mão ensina as próximas
   contas, inclusive as antigas parecidas). Se a descrição disser outra coisa, não decide.
5. **Palavras da descrição** (diesel, lenha, peças, manutenção, vale, frete, internet, imposto…). Palavras de
   dois setores com o mesmo peso: não decide.
6. **Histórico** de quem recebe (3 em cada 4 lançamentos no mesmo setor), só para lançamento novo.

Sem certeza, o sistema **não escolhe**: mostra **SETOR NÃO IDENTIFICADO – CLASSIFICAR MANUALMENTE** e a pessoa
toca no setor certo numa lista (um toque, sem recadastrar). A conta guarda se foi automático ou manual, a
regra usada, quem fez e quando.

Ensaio com as descrições, beneficiários e categorias que existem hoje no banco de verdade (só leitura, nada
gravado; os dados não ficam no repositório): de 109 lançamentos feitos direto no Financeiro, 96 saem com
setor, 11 ficam aguardando classificação (categoria genérica e descrição sem assunto) e 2 de lenha ficam
pendentes de integração (lançados para um fornecedor sem ligação com o cadastro). Todas as contas em aberto
hoje saem com setor.

### O que "encaminhar" faz (sem copiar nada)

O setor fica gravado no próprio título, no campo `enc`:

```
enc: { setor, modo: 'auto'|'manual', regra, st: 'ok'|'pendente'|'aguardando', motivo, em, por, hist: [...] }
```

Cada setor **lê** os títulos encaminhados a ele; não existe segundo lançamento, então não há como duplicar.

| Destino | Efeito real |
|---|---|
| **Combustível** | Entra nas despesas de combustível do setor (painel e relatórios do Combustível) |
| **Lenha** (categoria Lenha) | Liga ao fornecedor do cadastro: em aberto entra na conta dele como valor a pagar; já pago vira crédito e desconta das entregas (`adiantamentoLenha`) |
| **Compras e almoxarifado** | Aparece em Contas do almoxarifado › "Pagamentos encaminhados pelo Financeiro" |
| Produção, Barro, Paletes, Vendas, Pessoal | Aparece nos Lançamentos do Setor (para quem tem acesso ao Financeiro) |
| Administrativo, Impostos e bancos | Classificação: entra em "Despesas por setor" e nos filtros |

A ligação com a folha e os vales do Setor Pessoal ficou **de fora de propósito**: lançar na folha a partir do
Financeiro mexe em cálculo de salário e pede uma decisão do dono.

### Falha e correção

- Se a ligação não se completa (lenha sem fornecedor do cadastro, módulo ausente, queda na gravação), o
  pagamento **continua registrado no Financeiro** como **Pendente de integração**, com o motivo e o botão
  **Tentar encaminhar de novo**. A nova tentativa grava no mesmo registro: não duplica.
- **Corrigir setor** troca o destino e desfaz o efeito anterior (sair da Lenha remove o crédito dado ao
  fornecedor).
- Conta antiga de lenha sem fornecedor do cadastro aparece como pendente na Central, mas não vira cobrança
  nas Pendências: ligar ao fornecedor muda a conta dele e é uma decisão da pessoa.

### Situações

Agendado, Pendente, Pago, Vencido (e Parcialmente pago), mais **Aguardando classificação**,
**Encaminhado ao setor** e **Pendente de integração**.

### Rastreabilidade

Na janela do pagamento: quem cadastrou e quando, quem deu baixa e a data efetiva, setor de destino,
automático ou manual, a regra, o histórico de encaminhamento (de → para, quem, quando), alterações e
comprovantes. Nada é apagado.

## 5. O que mudou fora do bloco

- `abasF()` (menu do setor): passa por `arrumarAbasF`, que esconde as telas de pagamento do menu e põe a Central.
- `injetarAcesso`: início de setor com `data-inicio-limpo` não monta favoritos nem quadradinhos.
- `abrirObrig`: mostra o bloco de rastreio do encaminhamento.
- Combustível: `ehDespComb` e o painel do setor aceitam título com `enc.setor === 'combustivel'`.
- Almoxarifado: `telaPagarAlm` ganhou a seção de pagamentos encaminhados.
- Testes antigos que procuravam as telas no menu do setor (`testar-contas-pagar-lenha`,
  `testar-lancamento-foto`) agora conferem que elas abrem pela Central.

Esta versão foi montada em cima da publicação das 09:56 de 18/11 (commit `762592a`: quadros do alto que abrem
a lista nos módulos e a conta do fornecedor de lenha em palavras simples). Tudo daquela publicação continua:
os módulos Lenha, Combustível, Despesas gerais e Outros abrem por dentro da Central com os mesmos quadros.

## 6. Testes

`node scripts/testar-central-pagamentos.mjs` (programa real, banco simulado, 48 conferências): painel, menu,
Central, pagamento extra com identificação (Combustível), não identificado e classificação manual com
aprendizado, lenha virando crédito do fornecedor, pendente de integração e nova tentativa sem duplicar,
almoxarifado e administrativo, agendar e agenda (dia, semana, mês), pagar em poucos toques, parcial e
quitação, quadros do alto dos módulos, cancelar e duplicidade, corrigir setor com reversão, indicadores, filtros, relatório do dia (com
hora), rastreabilidade, navegação, persistência depois de atualizar, sem duplicados, celular e nenhum erro
de JavaScript.

Regressão: `verificar.mjs` (95 de 95) e os testes dos outros setores (navegação, lenha, combustível, vendas,
documentos, relatórios, pendências, acesso, desfazer, fiscal, WhatsApp e os demais).
`testar-leitura-rapida` (falha igual antes da mudança) e `testar-ponto-facial` (pede uma biblioteca que não
está instalada no ambiente de teste) não dependem do Financeiro.

## 7. Como desfazer

Só código mudou; nenhum dado foi convertido. Reverter o commit desta versão devolve o Financeiro de 17/11.
O campo `enc` gravado nos títulos classificados fica sem uso e não atrapalha a versão anterior.
