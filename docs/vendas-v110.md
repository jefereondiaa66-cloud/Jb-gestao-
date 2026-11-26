# Setor de Vendas simples (V110 · 13/11/2026)

Pedido do dono: o módulo de vendas já tinha quase tudo, mas era difícil de usar para quem tem
pouca prática com computador. O objetivo foi deixar a frente simples sem mexer nas regras.

Código: bloco `<script id="vendas-simples-v110">` (e o estilo `vendas-simples-v110-css`) no fim de
`app/jb-gestao.html`. Teste: `scripts/testar-vendas.mjs`.

## 1. Diagnóstico (o que dificultava)

| Ponto | O que havia |
|---|---|
| Tela inicial | 21 indicadores (descontos, fretes, custo do milheiro, inadimplência, meta…), filtros de período/cliente/produto/vendedor e 9 blocos de análise. Bom para a gerência; demais para o balcão. |
| Menu do setor | 17 a 19 funções no mesmo nível ("Funções do Setor de Vendas"), com nomes técnicos ("Venda rápida", "Pedidos"). |
| Pedido x venda | Dois caminhos ("Venda rápida" e "Novo pedido") sem explicação de quando usar cada um. |
| Novo pedido | Formulário longo (cliente, produtos, estoque, entrega, pagamento, observações), produto escolhido numa lista suspensa. |
| Cliente novo | Para cadastrar no meio do pedido, a pessoa ia para o cadastro completo (38 campos em 6 seções) e voltava. |
| Impressão | Só o documento A4. Nada para impressora térmica. Depois da venda direta abria o A4; depois do pedido, nada. Para reimprimir: abrir o registro → Documento → Imprimir. |
| Consulta | Lista boa, mas sem filtro por produto e sem ações (ver, editar, imprimir) na própria linha. |
| Simulação | Não existia: para fazer a conta era preciso começar um orçamento. |
| Comprovante A4 | Sem nome fantasia e telefone da cerâmica (já cadastrados em Dados da empresa). |

O que já era bom e foi mantido: numeração única com trava no banco, regras de preço por tabela,
limites de desconto com aprovação, reserva de estoque, situações do pedido, orçamento que vira
pedido sem redigitar, relatórios (dia, período, mês, cliente, produto, vendedor, margem, metas)
com exportação, histórico de compras do cliente e aviso de cadastro duplicado.

## 2. O que mudou

- **Início do setor**: 8 atalhos grandes (Novo pedido, Nova venda, Clientes, Produtos, Orçamentos,
  Simulação, Relatórios, Consultar pedidos), 6 números (vendas do dia, pedidos e vendas feitos hoje,
  vendido no mês, pedidos em aberto, finalizados no mês, orçamentos no mês) e as listas "Últimas
  vendas e pedidos" e "Pedidos em aberto", cada linha com botão de imprimir. O painel antigo,
  inteiro, está na aba **Painel completo**.
- **Nomes**: "Venda rápida" → **Nova venda**; "Pedidos" → **Consultar pedidos**; novas abas
  **Simular venda** e **Painel completo**.
- **Novo pedido / Nova venda / Orçamento**: cartões dos tijolos (nome, código, unidade, preço da
  tabela do cliente, disponível); um toque inclui o produto na tabela e põe o cursor na quantidade.
  O cartão mostra quanto já está no pedido. Subtítulo explica quando usar pedido ou venda.
  Botões: "Cancelar operação", "Salvar pedido (sem confirmar)", "Confirmar pedido", "Finalizar venda".
- **Cadastro rápido de cliente** (sem sair do pedido): nome, CPF ou CNPJ (o tipo de pessoa é
  marcado sozinho), telefone, WhatsApp, endereço, cidade, estado e observações. Mostra clientes
  parecidos enquanto digita ("Usar este"). Usa a mesma validação e a mesma gravação do cadastro
  completo (código automático, CPF/CNPJ válido e sem duplicar).
- **Impressão**: janela "Imprimir" com **ticket pequeno** (desenho próprio para térmica de 58 mm
  ou 80 mm: número grande, cliente, produtos, total, pagamento, mensagem final), **comprovante
  completo (A4)**, **ticket em PDF** na largura do papel e pré-visualização. Abre sozinha depois de
  confirmar o pedido ou finalizar a venda; opção, por aparelho, de imprimir o ticket direto.
  Reimpressão pela tela do registro, pela lista de pedidos, pela lista de orçamentos e pelo início.
  Ticket e comprovante dizem "sem valor fiscal"; a NF-e continua no Setor Fiscal.
- **Simulação**: produtos em cartões, quantidade com − e +, preço editável, desconto (% ou R$) e
  frete simulados, valor final. Não grava nada. Pode levar os itens para um orçamento ou pedido
  novo (que só é gravado quando a pessoa salva na tela dele).
- **Consulta de pedidos**: coluna de ações (ver, editar quando ainda pode, imprimir) e filtro por produto.
- **Comprovante A4 das vendas**: quadro da empresa com nome fantasia e telefone.

## 3. O que NÃO mudou (de propósito)

Regras de preço, cálculos, descontos e aprovações, numeração, situações do pedido, reserva e baixa
de estoque, títulos e recebimentos, permissões dos perfis, relatórios e o Setor Fiscal. Nenhuma
coleção nova no banco, nenhum dado apagado, nenhum registro criado sozinho. A largura do papel e a
opção "imprimir direto" ficam só no navegador do aparelho (não vão para o banco).
As caixas de explicação azuis/amarelas continuam obedecendo à escolha de Configurações
("avisos desligados"); por isso as explicações novas ficam no subtítulo das telas.

## 4. Como reverter

Apagar o bloco `vendas-simples-v110` (estilo e script) do fim de `app/jb-gestao.html`. Tudo volta
como era; nenhum dado depende dele.

## 5. Testes

`node scripts/construir.mjs && node scripts/testar-vendas.mjs` (computador 1300 px e celular 390 px),
com banco simulado e dados fictícios. Com `jspdf` instalado (CI) também confere o PDF do ticket.

## 6. Revisão com vários agentes (13/11/2026)

Cinco revisores procuraram problemas (encaixe com o código antigo, dados e regras, impressão,
telas e segurança); cada achado foi conferido no código antes de corrigir. Corrigido:

- **Segurança:** o código do registro entrava como texto de JavaScript no botão de imprimir da
  lista; agora vai num atributo de dados (um código malicioso gravado no banco não executa nada).
- **Venda finalizada:** a marca que troca o A4 pela janela de impressão ficou presa à venda que
  está sendo criada (antes, abrir o comprovante de outra venda durante a gravação confundia as duas).
- **Preços:** a simulação segue a tabela por quantidade e por tipo de venda, e leva o preço certo
  para o pedido; o cartão do produto mostra o mesmo preço que a linha vai usar (condição, tipo de
  venda, cliente); na Nova venda, escolher o cliente pelo cadastro rápido não muda mais o preço combinado.
- **Cartões:** um toque nunca ocupa a linha de um produto desativado ou apagado.
- **Cadastro rápido:** Estado começa vazio; cliente inativo aparece como parecido, mas não pode ser usado.
- **Impressão:** não grava nada no banco; o texto do ticket fica na área que a cabeça térmica
  alcança (48 mm no papel de 58 mm, 72 mm no de 80 mm), também no PDF; ticket de orçamento vencido,
  recusado ou convertido avisa como o A4; se a impressão direta não abrir, a janela aparece com o PDF;
  Esc fecha a janela, que também fecha ao trocar de tela.
- **Início:** rascunhos não contam como pedidos feitos nem em aberto; "finalizados no mês" usa a data
  da entrega; cada número abre a lista ou o relatório já filtrado com o mesmo critério; nos modelos de
  tela 1 e 2 os botões grandes ficam logo abaixo da saudação.
- **Consulta:** filtro "Andamento" (em aberto, rascunhos, finalizados no mês, feitos hoje); filtro de
  produto mostra o nome; "Venda rápida" virou "Nova venda (balcão)" também no filtro e no Painel completo.
