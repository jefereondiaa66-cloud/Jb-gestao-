# Telas reais do PopGás e do RevGás (vistas direto, novembro de 2026)

Como ler estas notas:
- **[lido direto]** = texto lido na própria página, ou tela que eu abri e olhei (captura feita em 24/11/2026).
- **[inferência]** = conclusão minha a partir do que vi.
- Nenhum fato aqui vem de resumo de busca: não usei o buscador nesta rodada.
- As cores em hexadecimal são **estimativas a olho** sobre imagens comprimidas; servem como ponto de partida, não como medida exata.
- As capturas ficaram só na pasta temporária da sessão; nada foi copiado para o repositório. As descrições são minhas.
- Os dados que aparecem nas telas do PopGás são de demonstração ("Cliente Exemplo 156", "Revenda Exemplo C"); em algumas telas o disfarce trocou até rótulos (ex.: uma opção de configuração aparece com o nome "Cliente Exemplo 279").

Quantidade vista: **PopGás 25 imagens do painel/app do cliente + 2 telas do app do entregador (loja do Google)**, sendo 2 das 25 repetidas (mesma tela em dois endereços) — 25 telas distintas. **RevGás: 8 telas do app do entregador (loja do Google)** e 9 imagens do site, nenhuma delas tela do sistema.

---

## 1. Como são as telas do PopGás (painel no navegador)?

### Takeaway
O painel do PopGás é um sistema de navegador com cara de "ERP moderno": barra superior azul-marinho, abas internas (várias telas abertas ao mesmo tempo), menu lateral só de ícones e, em quase toda tela, o mesmo molde — título, busca rápida com contador de registros, botões quadrados coloridos e uma tabela com etiquetas coloridas de situação. É limpo e coerente, mas espaçoso (10 linhas por página) e feito para mouse; o único atalho visível é F4 na busca.

### Cited Findings

#### 1.1 Moldura comum a todas as telas do painel [lido direto]
Visto em todas as capturas do painel, por exemplo [lista de pedidos](https://www.popgas.com.br/screenshots/01-pedidos-lista.png) (página: [Essencial](https://www.popgas.com.br/recursos/essencial)).
- **Barra superior** (altura ~65 px numa tela de 1920): fundo azul-marinho (~#2C4263). Da esquerda para a direita: logotipo, botão "Menu" (três riscos), "Acesso Rápido" (ícone de aviãozinho, abre lista), campo "Pesquisar" mais escuro com a etiqueta **F4** no canto. À direita, sete ícones brancos (painéis, lista, pasta, tarefas com bolinha vermelha "20", sino com "99+", editar, conversas com "2") e o usuário ("Administrador") com avatar redondo.
- **Faixa de abas** logo abaixo, cinza-claro (~#E9EAEE): cada tela aberta vira uma aba com ícone colorido, nome e "x" para fechar (ex.: "Setup da organização" | "Pedidos Realizados"). A aba ativa é branca.
- **Menu lateral estreito** (~55 px), fundo azul bem claro (~#EAF1FA), só ícones azul-marinho, sem texto; o ícone da tela atual fica dentro de um quadrado arredondado azul-marinho. Os ícones mudam conforme o módulo aberto (Vendas, Estoque, Financeiro, Logística, Frota, Cadastro). No topo, um botão "»" para expandir. No módulo de clientes, os ícones trazem bolinhas com números (ex.: "401,1k").
- **Cabeçalho da tela**: título grande à esquerda (ex.: "Pedidos Realizados"), com caminho embaixo ("Vendas › Pedidos Realizados"); no centro, caixa "Busca Rápida" com ícone de informação azul, lupa e, dentro da própria caixa, um contador em letra de máquina ("235 registro(s)"); à direita, os botões de ação.
- **Botões**: quadrados de ~38 px só com ícone, cada cor com um significado fixo — roxo-índigo (~#4F46E5) = filtro (funil); verde (~#16A34A) = recarregar; azul-céu (~#1DA1F2) = novo ("+ Novo Registro", "+ Nova Conta", "+ Nova Tabela"); preto (~#111111) = ação forte ("Ações", "Salvar", "Novo Cliente", "Alterar Preços", "Reprocessar"); verde com planilha = exportar.
- **Tabela**: cartão branco com cantos arredondados e uma linha fina azul-turquesa no topo (~#22B8CF); cabeçalho em MAIÚSCULAS pequenas e negrito, com setinhas de ordenação azuis em cada coluna; linhas altas (55 a 110 px), separadas por linha cinza fina, sem zebra. Rodapé cinza com "Por página: 10", "Exibindo 1 a 10 de N registro(s)" e paginação com a página atual num quadrado preto.
- **Tipografia**: letra sem serifa geométrica (parece Inter ou similar), texto ~14–15 px, cinza-escuro quase preto; links em azul sublinhado.
- **Etiquetas de situação** (pílulas): "Sim" verde cheio (~#4CAF50) com letra branca; "Não" azul-claro (~#CFE8EF) com letra cinza; "Realizado"/"Autorizado"/"Pago Totalmente" verde-escuro cheio (~#1E7B1E); "Vencida" vermelho cheio (~#D9534F); "Não Pago"/"Não Emitido" azul-claro.

#### 1.2 Lista de pedidos — "Pedidos Realizados" [lido direto]
[Imagem](https://www.popgas.com.br/screenshots/01-pedidos-lista.png) · página [Essencial](https://www.popgas.com.br/recursos/essencial). É a tela de trabalho do atendimento.
- **Botões à direita**: carrinho azul-céu (novo pedido), funil roxo, recarregar verde, **telefone verde** (ligado à bina/chamadas), um seletor com bandeirinha e três bolinhas coloridas (verde, azul, roxa — filtro por situação) e o seletor "Período".
- **Colunas**: (bolinha de cor) · CÓDIGO · CLIENTE / ENDEREÇO · ENTREGA · SITUAÇÃO · VALOR / PAGAMENTO · DETALHES.
- **Cada linha tem três andares na coluna do cliente**: nome em link azul com ícone de pessoa; telefone com ícone de fone; endereço com ícone de pino ("Rua Exemplo, 423 - Bairro"). Assim o atendente lê tudo sem abrir o pedido.
- **Bolinha vermelha cheia** (~#FF0000) à esquerda de cada linha — nas capturas todas estão vermelhas; pelo contexto (previsões de entrega já vencidas) indica atraso **[inferência]**.
- **ENTREGA**: "Rápida" ou "Normal" em texto simples.
- **SITUAÇÃO**: pílula larga. "Aberto" = fundo verde muito claro (~#ECFDF5), borda e letra verdes (~#16A34A). "Confirmado" = fundo lilás-acinzentado (~#E8E9F3), borda cinza, letra cinza-azulada.
- **VALOR / PAGAMENTO**: valor em negrito grande ("R$ 127,00") e, embaixo, etiqueta cinza pequena com a forma ("Dinheiro", "Cartão de Débito", "Nota Assinada"); quando é PIX pela internet ainda não pago, a etiqueta fica **amarela com letra laranja**: "PIX - Online: Pendente".
- **DETALHES**: "Previsão de Entrega: 04/05 17:44" em negrito e, embaixo, a unidade que atende com ícone de prédio.
- Pontos fortes: leitura completa sem clicar; forma de pagamento e pendência de PIX visíveis; previsão de entrega com hora. Pontos fracos: só ~8 pedidos cabem na tela; não aparece o **produto/quantidade** nem o **entregador** na linha; não há totais do dia; a situação "saiu para entrega" não aparece em nenhuma linha da amostra.

#### 1.3 Novo pedido (balcão/telefone) [lido direto]
[Imagem](https://www.popgas.com.br/screenshots/features/lancamento-rapido.png) · página [Essencial](https://www.popgas.com.br/recursos/essencial).
- Assistente em **3 passos** numa linha no topo: "1 Cliente — Selecione o cliente do pedido" (bolinha preta = atual), "2 Dados do Pedido — Produtos e entrega", "3 Pagamento — Forma e valores" (bolinhas cinza).
- Passo 1: um único campo grande, já com foco: "Busque por nome, telefone ou endereço do cliente…". Abaixo, área vazia cinza-clara com ícone de pessoas e o texto "Busque um cliente para começar — A lista é carregada conforme você digita."
- Rodapé: à esquerda "Ir para Cadastro de Clientes" (roxo) e "**Novo Cadastro Simplificado**" (verde); à direita "Continuar →" (azul-céu). No topo direito, "← Voltar" (cinza).
- A página descreve o resto: endereços salvos, produtos com preço da tabela vigente, cálculo automático de troco, e a bina "identifica o cliente e abre o cadastro na hora".
- Pontos fortes: começa pelo cliente com busca única por nome/telefone/endereço; cadastro rápido sem sair do pedido. Ponto fraco: três telas para um pedido que quase sempre é "1 P13, mesmo endereço, dinheiro"; não vi atalho de teclado nem "repetir último pedido".
- **Não há imagem do aviso de chamada (bina)** nem dos passos 2 e 3 no site.

#### 1.4 Acerto de contas dos entregadores [lido direto]
[Imagem](https://www.popgas.com.br/screenshots/07-acerto-entregador.png) · páginas [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas) e [início](https://www.popgas.com.br/).
- É uma **lista de acertos já feitos**, dentro de "Financeiro › Acerto de Contas". Colunas: CÓDIGO · TIPO DE ACERTO · VALOR · SITUAÇÃO · DATA ACERTO · ORGANIZAÇÃO.
- TIPO DE ACERTO: "Entregador · NOME" (nome em negrito) ou "**Pedido Portaria** · 10334" (número do pedido em link) — ou seja, a venda no balcão ("portaria") também gera um acerto.
- SITUAÇÃO: "Realizado" em pílula verde-escura. Abaixo da tabela, à direita, um cartão "VALOR TOTAL R$ 101.330,63".
- Botões: filtro, recarregar, exportar planilha e "Ações" (roxo, com menu).
- A página descreve o conteúdo do acerto: soma os pedidos entregues, separa dinheiro, cartão e PIX, desconta despesas e troco, mostra quanto o entregador deve prestar contas e "fecha com um clique" — [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas), [Gestão](https://www.popgas.com.br/recursos/gestao).
- Ponto fraco para quem quer copiar: **o site não mostra a tela de dentro do acerto** (a conferência por forma de pagamento e por vasilhame); só a lista.

#### 1.5 Mapa de entregadores e pedidos [lido direto]
Duas imagens: [mapa da frota](https://www.popgas.com.br/screenshots/rastreamento-frota-mapa.png) (início) e [Rastrear Entregador](https://www.popgas.com.br/screenshots/erp/rastrear-entregadores.png) ([Essencial](https://www.popgas.com.br/recursos/essencial)).
- **Coluna esquerda (~20% da largura)**: "Período" com lista ("10 minutos") e link "Ver filtros"; título "Entregadores" e um **cartão por entregador** com o nome em negrito, um ícone redondo à direita e três caixinhas: "Pedidos: 2" | "Estoque: 4" | data e hora da última posição ("11/03/2022 12:36:22"). Na versão mais nova há botão de filtro roxo e link "Recarregar".
- **Mapa (resto da tela)**: base cinza-clara (Mapbox). Pedidos são **pinos redondos com número dentro**, coloridos: verde-claro (maioria), laranja, amarelo e vermelho (~#EF4444). Entregadores são um desenho de moto com a carga de botijões e o nome em negrito embaixo ("Entregador 5"). Unidades são pino com casinha; há pinos brancos com iniciais ("FA", "WA", "LI", "RS") de borda colorida. Linhas azul-claras mostram trajetos.
- Na versão nova: seletor de cidade no canto do mapa ("Uberlândia") e quatro botões de **divisão da tela** (1, 2, 3 ou 4 painéis) no canto direito; ícones de loja marcam as unidades; seta para recolher a coluna.
- A captura do mapa da frota é de **março de 2022** (data nos cartões) e não tem a moldura atual — é imagem antiga reaproveitada.
- Pontos fortes: "Pedidos" e "Estoque" de cada entregador visíveis na lista (dá para escolher quem ainda tem botijão no carro); hora da última posição denuncia aparelho sem sinal. Pontos fracos: sem legenda das cores dos pinos; muitos pinos sobrepostos; não vi fila de "pedidos sem entregador" nem botão de atribuir na captura.

#### 1.6 Cadastro de clientes e segmentação [lido direto]
[Cadastro de Clientes](https://www.popgas.com.br/screenshots/features/cadastro-de-clientes.png) e [Segmentação de Clientes](https://www.popgas.com.br/screenshots/features/historico-de-compras.png) · página [Essencial](https://www.popgas.com.br/recursos/essencial).
- Lista de clientes: colunas CÓDIGO · NOME DO CLIENTE · TELEFONE · ATIVO (pílula Sim) · PEDIDOS (pílula Sim/Não) · CADASTRO (data) · ORGANIZAÇÃO. Botões: filtro, lista, recarregar, "**Cadastro Simplificado**" (verde, com raio) e "+ Novo Cliente" (preto). Contador "401103 registro(s)".
- Segmentação: quatro cartões de número no topo ("Total de clientes 125.219", "Em risco (30–60d) 1.593" em vermelho, "Inativos (60d+) 121.843", "Avaliação média 4,6 ★"). Abaixo, "Métricas pré-definidas — Clique numa métrica para ver os clientes e tomar uma ação": grade de cartões pequenos, cada um com ícone colorido, percentual numa etiqueta no canto, nome, regra em letra miúda e número grande: **Em Risco** (sem pedido entre 30 e 60 dias), **Inativos** (60+ dias), **Insatisfeitos** (última nota ≤ 3), **Sem 2º pedido** (1 pedido há mais de 14 dias), **Sem telefone** (cadastro incompleto), **VIPs** (10+ pedidos, alta frequência), **Aniversariantes** (próximos 7 dias), **Leais** (3+ pedidos, ativos nos últimos 90 dias), **Hibernando** (90 a 180 dias), **Perdidos** (365+ dias). Cada cartão diz "Diariamente" (atualização). Depois, "Métricas customizadas" criadas pela equipe; botões "Atualizar" e "+ Nova métrica".
- Ponto forte: as regras estão escritas no próprio cartão (o dono entende sem manual). **O site não mostra a ficha do cliente por dentro.**

#### 1.7 Tabela de preço [lido direto]
[Imagem](https://www.popgas.com.br/screenshots/features/precos-e-promocoes.png) · página [Essencial](https://www.popgas.com.br/recursos/essencial).
- Colunas: CÓDIGO · PRODUTO · CANAIS DE VENDA · TIPOS DE ENTREGA / VALOR UNITÁRIO · GRUPO CLIENTE · ATIVO · ORGANIZAÇÃO.
- Cada linha é uma combinação produto + canais + grupo. Exemplo lido: "Gás de cozinha 13kg" — canais "App PopGas (Android & iOS), App Web, Automática, Instagram, Portaria, Televendas, WhatsApp" — preços em quatro linhas: "Rápida: **R$ 129,99** / Normal: **R$ 126,99** / Programada: **R$ 123,99** / Retirar na Loja: **R$ 102,99**". Outra linha do mesmo produto vale só para "Portaria, Televendas" com grupo de cliente "Desconto Total"; outra para "Portaria" com grupo "Preço de Custo". "Vasilhame P13" aparece como produto com preço próprio (R$ 190,00).
- Botões: filtro, recarregar, "Alterar Preços" (preto — reajuste em massa), chave "Entregas V2", "+ Nova Tabela".
- Ponto forte: o preço muda por **tipo de entrega** e por **canal**, e a retirada no balcão é mais barata, tudo visível numa linha. Ponto fraco: várias linhas para o mesmo produto ficam difíceis de comparar.

#### 1.8 Estoque: lotes, transferências, remessa de vasilhame [lido direto]
Páginas [Gestão](https://www.popgas.com.br/recursos/gestao) e [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas).
- [Lotes em Estoque](https://www.popgas.com.br/screenshots/erp/lotes-em-estoque.png): colunas CÓDIGO · PRODUTO · DEPÓSITO · QTD. INICIAL · QTD. ATUAL · CUSTO UNIT. · CONDIÇÃO ("BOM ESTADO" em verde, maiúsculas pequenas) · REFERÊNCIA (link "Recebimento - 18867") · VALIDADE · CRIADO EM · AÇÕES (dois ícones: histórico e recalcular). Produtos da amostra: "Gás de cozinha 13kg", "Gás 20kg - P20", "Gás 45kg - P45", "Vasilhame P13", "Mangueira P13 PVC - 1m", "AGUA NATIVA - 20 LTS", "Pano De Prato", "KIT DELTA 2 KG". Botão preto "Reprocessar".
- [Transferência de Estoque](https://www.popgas.com.br/screenshots/features/movimentacoes.png): colunas CÓDIGO · DETALHES ("6x - Gas de cozinha 13kg / 1x - AGUA FLORES - 20 Lts") · DEPOSITO ORIGEM · DEPOSITO DESTINO ("Loja 5 - Martins" → "Loja 1 - Santa Mônica") · TRANSPORTADOR · USUÁRIO/DATA.
- [Remessa de Vasilhame](https://www.popgas.com.br/screenshots/features/vasilhames.png): colunas CÓDIGO · PRODUTOS ("130x - Vasilhame P13 / 2x - Vasilhame P20 / 1x - Vasilhame P45") · EMPRESA / UNIDADE · TRANSPORTADOR(A) · DESTINATÁRIO ("Companhia Ultragaz SA") · SITUAÇÃO NF ("Autorizado" verde + link "Abrir Danfe", ou "Não Emitido" azul-claro) · CANCELADO · ORGANIZAÇÃO · USUÁRIO/DATA CRIAÇÃO. Botão "+ Nova Remessa".
- **O site não mostra um quadro de saldo "cheios × vazios" por depósito e por veículo.** O vasilhame é tratado como produto ("Vasilhame P13") e o estoque como lotes; a visão de cheios/vazios só está no texto ("Controle de cheios e vazios por depósito e por veículo… registro de troca, empréstimo, quebra e furto" — [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas)). A imagem chamada "carregamentos" no site mostra, na verdade, a [lista de veículos](https://www.popgas.com.br/screenshots/features/carregamentos.png) (CÓDIGO · MARCA/MODELO · TIPO [Carro, Triciclo, Semi-Reboque] · ANO · PLACA · ATIVO).

#### 1.9 Financeiro: contas a pagar, saldo diário, DRE [lido direto]
Página [Gestão](https://www.popgas.com.br/recursos/gestao).
- [Contas a Pagar](https://www.popgas.com.br/screenshots/06-financeiro-contas.png): colunas CÓDIGO · DESCRIÇÃO (com "Nº Documento" embaixo, às vezes em link) · CENTRO DE CUSTO ("4.1.1 Compra de GLP", "3.2.2 Tarifa Bancária", "4.3 Frete de produtos", "2.1.1 DAS - Simples…") · EMPRESA / UNIDADE · VALOR · PAGAMENTO · MÊS DE COMPETÊNCIA · ORGANIZAÇÃO. Na coluna PAGAMENTO: pílula "Pago Totalmente" (verde-escuro) + "**Pago em:** 01/08/2026"; ou "Não Pago" (azul-claro) + "**Vencimento:** 04/08/2026" + segunda pílula "**Vencida**" (vermelha). Botões: filtro, recarregar, alternar lista/agrupado, "Ações" (preto), "+ Nova Conta".
- [Saldo Diário](https://www.popgas.com.br/screenshots/features/contas-e-saldo-diario.png): colunas DATA · CONTAS ("165 conta(s)") · SALDO INICIAL · CRÉDITOS (**verde**) · DÉBITOS (**vermelho com sinal de menos**) · SALDO FINAL · ATUALIZAÇÃO · AÇÕES (olho e recalcular, quadradinhos azul-petróleo). Botões "Calcular" (verde) e "Reprocessar data" (roxo).
- [DRE Gerencial](https://www.popgas.com.br/screenshots/features/dre-gerencial.png): bloco "Filtros" com aba turquesa, campos "Tipo de Busca: Mês de Competência", "Período: Mês Específico", "Mês", "Unidade / Filial", botão "Calcular"; blocos "DESTAQUE (KPIS)" e "DEMONSTRAÇÃO" (colunas Conta | Valor (R$)), ambos vazios na captura; botões "Centros de Custo" e "Habilitar Modo de Edição".
- **O site não mostra a tela de caixa** (abertura, sangria, fechamento); só o texto: "Abertura e fechamento de caixa por loja, sangrias e suprimentos" — [Gestão](https://www.popgas.com.br/recursos/gestao).

#### 1.10 Painéis de indicadores [lido direto]
Página [Essencial](https://www.popgas.com.br/recursos/essencial).
- [Dashboard de Pedidos Realizados](https://www.popgas.com.br/screenshots/erp/dashboard-pedidos-visao-geral.png): no topo direito, período ("Últimos 6 Meses"), filtro e recarregar. Faixa de **abas com ícone**: Visão Geral · Composição · Pagamento · Clientes · Mapa de Calor · Notificações. Sete cartões pequenos, cada um com ícone num quadradinho de cor suave, rótulo em maiúsculas, valor em negrito e **etiqueta de variação** (verde "↑ +0,7%" ou vermelha "↓ -3,2%"): GMV (FATURAMENTO), PEDIDOS ENTREGUES, TICKET MÉDIO, OTD RATE, TEMPO MÉDIO ENTREGA, PREÇO MÉDIO · ENTREGA, PREÇO MÉDIO · RETI(rada). Abaixo, gráfico "Pedidos por Mês — Volume mensal e receita no período": barras verdes (~#55CF78) para pedidos e linha azul (~#2F5BEA) para faturamento, com dois eixos e seletor "Mensal".
- [Dashboard de Pedidos Atrasados](https://www.popgas.com.br/screenshots/erp/dashboard-pedidos-atrasados.png): abas Lista de Pedidos · Métricas · Mapa de Calor. Primeira fila, quatro cartões rosados com letra vinho: "2.806 TOTAL ATRASADOS — de 15.560 pedidos entregues", "37.6 min ATRASO MÉDIO", "18.0% TAXA DE ATRASO", "82.0% OTD RATE — entregues no prazo (meta ≥95%)". Segunda fila, quatro cartões em **escala de gravidade** (amarelo → laranja → rosa): "ATÉ 10 MIN — 893 Atraso Pequeno — 31.8% do total", "10–30 MIN — 959 Atraso Médio", "30–60 MIN — 533 Atraso Sério", "+60 MIN — 421 Atraso Crítico". Abaixo, gráfico "Atrasos por Dia" (barras vermelhas + linha laranja do atraso médio).
- Pontos fortes: cada número vem com a frase que explica a conta; a meta aparece junto ("meta ≥95%"); cor por gravidade. Ponto fraco: siglas em inglês (GMV, OTD RATE) num produto para dono de revenda.

#### 1.11 Atendimento por WhatsApp no painel [lido direto]
[Imagem](https://www.popgas.com.br/screenshots/04-conversa-whatsapp.png) · página [Tech & IA](https://www.popgas.com.br/recursos/tech-ia).
- Faixa verde (~#0EA37F) atrás de um cartão branco, imitando o WhatsApp Web. **Coluna esquerda "Conversas"** (~27%): busca, três abas com contagem — "Atendimentos (2)", "Fila (0)", "ChatBot (0)" — e cartões de conversa com avatar, nome, trecho da última mensagem, data, bolinha verde com número de não lidas e **três etiquetas de contorno**: verde (atendente responsável), azul (número de origem, ex.: "PopGas Fixo", "PopGas Celular 1") e roxa ("Fila: Atendimento").
- **Painel direito**: cabeçalho com nome do cliente em link e etiqueta "Atendimento: (atendente)"; seis ícones de ação (transferir, sincronizar, **carrinho = criar pedido**, play verde, embaralhar/devolver, lixeira vermelha). Conversa sobre fundo bege com desenhos: balões brancos à esquerda rotulados "Cliente"; balões verde-claros à direita rotulados "**ChatBot**"; balão **azul-marinho** à direita rotulado "**Atendente**" ("Seu atendimento foi iniciado pelo atendente: …"). Embaixo, campo "Mensagem…" com clipe, microfone e botão de enviar.
- Ponto forte: dá para ver de relance quem falou (robô × pessoa) pela cor do balão, e criar o pedido sem sair da conversa.

#### 1.12 Telas de configuração (áreas, tipos de entrega, app do entregador) [lido direto]
Página [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas).
- [Áreas de Atendimento](https://www.popgas.com.br/screenshots/features/areas-e-horarios.png): lista CÓDIGO · DESCRIÇÃO ("Uberlândia Area 1 - Tibery e Santa Mônica") · CIDADE · ATIVO · ORGANIZAÇÃO. O texto diz que as áreas são desenhadas no mapa com taxa e prazo por região; o desenho no mapa não aparece em imagem.
- [Tipos de Entrega](https://www.popgas.com.br/screenshots/features/tipos-de-entrega.png): lista com "Entrega Normal", "Entrega Programada", "Retirar Deposito", "Entrega Rapida", "Portaria", "Retirar na Loja".
- [App Entregadores – Configurações](https://www.popgas.com.br/screenshots/features/app-do-entregador.png): duas abas ("Configurações", "Produtos 3") e uma lista de **chaves liga/desliga** (verde ligado, vermelho desligado), cada uma com título em negrito e uma frase explicando: "Habilitar Escala de Trabalho"; "Habilitar Lançamento de Pedidos — permite que entregadores lancem pedidos (vendas automáticas) através do aplicativo"; "Exibir Telefone do Cliente"; preenchimento automático dos produtos no carregamento; "Exibir Endereços em Todos os Pedidos — quando off, só pedidos que saíram pra entrega"; "Habilitar Ordem de Entrega — de acordo com o vencimento/data dos pedidos"; "Habilitar Classificação de Pedidos"; "Tipo de Entrega para Vendas Automáticas — define qual tabela de preço será aplicada" (lista: "Normal"). Botão "Salvar" preto.

### Inferences
- O painel foi feito para **mouse em computador**: botões pequenos só com ícone, tabelas com ordenação por clique, nenhuma dica de atalho além do F4. Não é pensado para toque nem para digitação corrida de pedidos.
- A densidade é baixa para um balcão movimentado: 10 linhas por página e linhas de até 110 px. A vantagem é a leitura fácil; a desvantagem é rolar muito.
- O sistema nasceu para **rede com muitas lojas** (a coluna "Organização" e "Empresa/Unidade" aparece em quase toda tabela; os números da demonstração são de centenas de milhares de clientes). Para um depósito único, essas colunas são ruído.
- Como o menu lateral não tem texto, o usuário novo depende de decorar ícones; o "Pesquisar (F4)" e o "Acesso Rápido" compensam isso.

### Gaps
- Não há imagem, no site, de: aviso de chamada (bina), passos 2 e 3 do novo pedido, ficha do cliente, tela de dentro do acerto, caixa (abertura/sangria/fechamento), carregamento do veículo, quadro de cheios e vazios, desenho de áreas no mapa. Para vê-las seria preciso o teste grátis de 14 dias (exige cadastro; não fiz) ou o vídeo de demonstração no YouTube (site não liberado nesta sessão).
- Não consegui ler o significado exato da bolinha vermelha na lista de pedidos nem a legenda das cores dos pinos do mapa.
- A imagem do mapa da frota é de 2022; pode não refletir a tela atual.

---

## 2. Como são as telas de celular do PopGás (app do cliente, app do entregador, avisos)?

### Takeaway
No celular, o PopGás mostra três coisas: o cliente acompanhando o entregador num mapa, os avisos do pedido chegando pelo WhatsApp em cinco etapas, e um app do entregador simples, com cinco abas embaixo (Pedidos, Carregamento, Acerto, Transferência, Meus Dados). As telas mais importantes do entregador (pedido, carregamento, acerto) **não estão publicadas**.

### Cited Findings
- **App do cliente – "Acompanhamento do pedido"** [lido direto] — [imagem](https://www.popgas.com.br/screenshots/app-cliente-rastreamento-full.png), página [Essencial](https://www.popgas.com.br/recursos/essencial). Barra azul-marinho com seta de voltar e título; mapa em tela cheia; trajeto em linha azul-clara; o entregador é um desenho de moto com botijões; o destino é um pino laranja com casinha; embaixo, cartão branco flutuante com a inicial do entregador num círculo, "Entregador Exemplo" e "Placa do Veículo: ABC1D23".
- **Avisos no WhatsApp** [lido direto] — [imagem](https://www.popgas.com.br/screenshots/whatsapp-notificacoes-foto.png), página [Tech & IA](https://www.popgas.com.br/recursos/tech-ia). Cinco mensagens em sequência, todas com o cabeçalho "PopGás Informa" e título em negrito: "**Pedido Confirmado** — Seu pedido de número 741058 foi confirmado. Tempo estimado para entrega: até 30 minutos"; "**Pagamento Recebido!**"; "**Pedido saiu para a entrega** … Acompanhar Entrega Tempo Real: (link curto)"; "**O entregador está próximo da sua casa!** Fique atento(a)…"; "**Pedido Entregue!** Agradecemos a sua preferência." O texto da página acrescenta o aviso de cancelado e diz que cada mensagem usa modelo aprovado pela Meta e pode ser ligada ou desligada.
- **App do entregador (Android)** [lido direto] — [Google Play – PopGas Entregadores](https://play.google.com/store/apps/details?id=br.com.popgas.delivery_app&hl=pt_BR): "500+" instalações, atualizado em 28 de mar. de 2026, descrição de uma linha ("Aplicativo para funcionários receberem e entregarem pedidos de gás de cozinha"), só 3 imagens. Vi duas:
  - *Entrada*: fundo branco, logotipo antigo (chama azul e verde), campos "Email do Funcionário" e "Senha" com ícone em quadradinho cinza, botão largo verde-limão (~#94C82E) "Entrar".
  - *Meus Dados*: título grande; seção "Expediente de Trabalho" com cartão de borda azul à esquerda ("Você não está em expediente agora. Você não tem nenhum expediente programado nos próximos 30 dias."); lista de linhas altas em azul (~#1E88E5), cada uma com ícone à direita: **Eventos, Escala Semanal, Pontuação Bonificação, Ausências & Folgas, Penalidades, Pedidos Entregues**; seção "Dados Pessoais". **Barra inferior com 5 abas**: Pedidos · Carregamento · Acerto · Transferência · Meus Dados (a ativa em verde-limão).
- O que o app faz, segundo o site [lido direto]: confere o carregamento, recebe pedidos da rota com navegação, lança venda na porta do cliente, registra despesas de combustível e manutenção, faz transferência entre entregadores (com aceite de quem recebe) e fecha o acerto; escala, ausências e pontuação ficam no app — [início](https://www.popgas.com.br/), [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas), [Gestão](https://www.popgas.com.br/recursos/gestao).

### Inferences
- O app do entregador é de toque, com alvos grandes (linhas de ~80 px, botão de largura total) e visual mais antigo que o painel — as cores (azul e verde-limão) não batem com o azul-marinho do painel.
- As cinco abas do entregador resumem bem o dia dele: receber pedidos, conferir a carga, passar carga a outro, prestar contas.

### Gaps
- Não vi as telas de Pedidos, Carregamento, Acerto e Transferência do app (a terceira imagem da loja não foi aberta para respeitar o limite de imagens; pela ordem, não é garantido que mostre alguma delas).
- A loja da Apple não está liberada nesta sessão.

---

## 3. Como são as telas do RevGás?

### Takeaway
O site do RevGás **não publica nenhuma tela do sistema de gestão**: só fotos, ilustrações e ícones. As únicas telas reais disponíveis são as 8 imagens do app "RevGás para Entregadores" na loja do Google — um app de toque, branco com laranja, no estilo dos apps de corrida: chave "disponível/indisponível" no topo, mapa, e um botão de deslizar "Entreguei".

### Cited Findings
- **Site sem telas** [lido direto] — em [revgas.com](https://revgas.com/) e [Explore os recursos](https://revgas.com/explore-os-recursos/) as imagens são: foto de um revendedor em frente ao depósito, ícone 3D de nota fiscal, fotos de quatro maquininhas (Cielo, PagBank, Stone, Rede), faixa de logotipos de parceiros, um celular com mapa e um desenho de triciclo laranja carregando botijões (ilustração, não tela real), ilustração de WhatsApp e foto de uma atendente. As capas dos artigos do blogue que abri também são ilustrações (uma mostra um balão "Dona Maria LIGANDO" para falar de bina) — [atualizações](https://revgas.com/melhores-atualizacoes-da-revgas-para-este-ano-para-sua-revenda/), [BINA](https://revgas.com/utilizar-bina-em-2024-ainda-vale-a-pena-para-revendas-de-gas/), [inventário](https://revgas.com/como-gerenciar-inventario-e-movimentacao-de-estoque/).
- **Identidade visual do site** [lido direto]: laranja forte (~#F47B20) como cor de destaque, cinza-chumbo no logotipo, muito branco, ilustrações 3D e desenhos de pessoas em laranja.
- **App do entregador** [lido direto] — [Google Play – RevGás para Entregadores](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR): "10 mil+" instalações, atualizado em 5 de nov. de 2026. Oito imagens vistas:
  1. *Três telas de boas-vindas*: título "RevGás para Entregadores", ilustração em laranja (moto com botijão; celular com rota; pessoa com celular), uma frase ("Faça vendas onde você estiver." / "Receba as entregas diretamente pelo aplicativo." / "Rápido e intuitivo, para facilitar as suas entregas."), três bolinhas de página e botão largo arredondado em degradê laranja→salmão (~#F5822A → #EE7B6E) "Quero fazer entregas".
  2. *Tela inicial, disponível*: mapa em quase toda a tela (Google Maps), o entregador como desenho de moto laranja com a palavra "Gás"; três botões flutuantes redondos/brancos no topo — menu (três riscos) à esquerda, **chave liga/desliga no centro (verde com ✓)**, foto do entregador à direita; faixa branca embaixo com bolinha laranja pulsante e "**Procurando entregas**".
  3. *Tela inicial, indisponível*: mesma barra do topo com a chave desligada (cinza-escuro); sem mapa; desenho de uma xícara fumegante, "**Indisponível**" e "Fique disponível para receber entregas".
  4. *Entrega em andamento*: título centralizado; "Chegada estimada: 09:42"; bloco com **bairro/ponto ("Fátima") em destaque**, endereço e referência ("Avenida Lindolfo Monteiro, 1867 — Próximo a Padaria Pão de Mel") e botão redondo com o ícone do Google Maps; linha com o nome da cliente e botão redondo de telefone; linha do item com quantidade numa bolinha salmão ("1"), "GLP 13KG Ultragaz", "R$130,00", "Cartão de crédito" e botão redondo de lápis (editar); texto vermelho "CANCELAR ENTREGA"; no rodapé, **botão de deslizar**: círculo verde com "»" que se arrasta sobre uma trilha cinza escrita "Entreguei".
  5. *Selecione o produto* (venda na rua): lista de cartões brancos, cada um com desenho do produto (botijão cinza, galão azul, kit regulador), nome e preço ("GLP 13KG Ultragaz R$ 130,00", "Água 20L R$ 13,00", "GLP 45KG Ultragaz R$ 240,00", "GLP 5KG Ultragaz R$ 82,50", "Kit regulador de pressão R$ 45,00"). O cartão escolhido ganha **borda laranja** e abre um seletor de quantidade (lixeira laranja | "1" | "+" laranja) e o link azul "Adicionar desconto". Botão fixo embaixo em degradê laranja: "**Confirmar … R$ 130,00**" (o total dentro do botão).
  6. *Resumo – "Desempenho hoje"*: cartão "Ganhos" com valor grande ("R$ 1.300,00") e três linhas com ícone e valor: "Dinheiro R$ 780,00", "Cartão de crédito R$ 520,00", "PIX R$ 260,00", e link "Ver histórico"; cartão "Produtos vendidos — 12" com linhas "GLP 13kg Ultragaz 10", "Água 20L 2"; dois cartões lado a lado: "**12 Finalizadas**" (verde) e "**2 Canceladas**" (vermelho).
  - Cores do app: fundo branco, texto cinza-chumbo (~#2B2F38), laranja (~#F5822A) para ação, verde (~#2E9E3E) para concluído/disponível, vermelho (~#D0021B) para cancelar, azul (~#1E6FD9) para links. Letra arredondada (parece Work Sans ou similar), tamanhos grandes.
- **O que o app faz, segundo a loja** [lido direto]: ver no mapa a casa do cliente ao receber a entrega; recusar entrega nova e cancelar entrega em andamento; falar com o cliente pelo app; editar o pedido antes de finalizar (ex.: acrescentar produto); fazer vendas; **mais de uma forma de pagamento por venda**; cadastrar cliente; foto de perfil; resumo e histórico detalhado; entra com o número de telefone cadastrado — [Google Play](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR).
- **Recursos listados no site** [lido direto] — [Explore os recursos](https://revgas.com/explore-os-recursos/): *Geral*: todas as revendas numa tela; acesso restrito por colaborador (cada funcionário só vê o estabelecimento em que foi cadastrado); uso pelo celular; **busca rápida** ("encontre qualquer função em segundos"); **favoritos** ("telas mais usadas sempre à mão"). *Vendas e atendimento*: BINA; agendar entrega; mapa de calor das vendas por bairro; histórico completo do cliente; venda por atendente; controle de cancelamento (motivo). *Logística*: app do entregador (vende, cadastra cliente e emite nota); entregador ao vivo no mapa. *Financeiro*: caixa em tempo real; **controle do fiado**; contas a pagar; **acerto e conferência de entrega** ("prestação de conta simples por entregador, ao fim da rota"); **crédito do cliente** (guardado e usado automaticamente na próxima compra). *Gestão*: relatório de faturamento, lucro, venda e estoque; integração via API. *Estoque*: "**Controle dos botijões — saiba quanto tem cheio, vazio ou emprestado**"; cadastro de compras atualiza o estoque. *Fiscal*: NF-e, importação de notas de entrada (entra automática no estoque), NFC-e, MDF-e, CT-e. *Extensões*: RevBank (boleto), RevBI (painel de números), automação do WhatsApp (pedido, baixa de estoque e aviso ao entregador sem atendente).
- **Outros pontos do site** [lido direto] — [revgas.com](https://revgas.com/): o entregador pode emitir a nota "direto da maquininha"; integrações anunciadas com Cielo, PagBank, Stone e Rede; funciona todo online, sem instalar; "resumo diário" citado num depoimento; razão social Tartigrado Tecnologia LTDA.
- **Melhorias de 2025 descritas pela empresa** [lido direto] — [atualizações](https://revgas.com/melhores-atualizacoes-da-revgas-para-este-ano-para-sua-revenda/): painel de vendas adaptado ao celular; filtros que se mantêm depois de uma ação; troca rápida de produtos; inclusão de item com um clique; limite de crédito do cliente conferido antes de fechar a venda; NFC-e pelo app com envio por WhatsApp; integração com Power BI; funcionamento "mesmo quando a internet oscila".

### Inferences
- O app do RevGás segue o modelo dos apps de entrega/corrida: o entregador liga a chave, espera pedido no mapa, aceita, navega e desliza para concluir. É claramente de toque, com poucas informações por tela e botões grandes — bom para usar de luva ou com a moto parada.
- O "Resumo" do entregador (dinheiro, cartão, PIX, produtos vendidos, finalizadas e canceladas) é praticamente o **acerto visto pelo lado do entregador**; é o melhor modelo visto nesta rodada para essa tela.
- O site do RevGás vende simplicidade ("busca rápida", "favoritos", "é só um clique"), mas sem mostrar as telas não dá para conferir.

### Gaps
- **Nenhuma tela do painel de gestão do RevGás foi vista**: pedidos, bina, mapa, acerto, estoque de cheios/vazios, caixa, RevBI, cadastro e tabela de preços continuam sem conferência visual. O número mínimo de 8 imagens foi atingido só com o app do entregador (3 delas são telas de boas-vindas).
- O painel (app.revgas.com), a central de ajuda (suporte.revgas.com), o YouTube e o Instagram não estão liberados na rede desta sessão; é onde provavelmente há telas.
- As respostas completas das perguntas frequentes do site são curtas e não detalham planos.

---

## 4. Quais recursos e preços foram lidos direto, e o que diverge das notas anteriores?

### Takeaway
PopGás publica preços claros por módulo (base R$ 99,90; Gestão +R$ 49,50; Fiscal +R$ 49,50; Tech & IA +R$ 199,00; tudo junto R$ 397,90/mês), com 14 dias de teste e promoção de 3 meses pagando só a base. RevGás publica apenas "planos a partir de R$ 50,00/mês" e pede demonstração. Várias afirmações das notas anteriores precisam de ajuste (lista abaixo).

### Cited Findings

#### PopGás — preços [lido direto]
- Plano base **Essencial R$ 99,90/mês**; módulos adicionais: **Gestão + R$ 49,50/mês**, **Fiscal + R$ 49,50/mês**, **Tech & IA + R$ 199,00/mês**; "Plataforma Completa R$ 397,90/mês" — [início](https://www.popgas.com.br/), [Gestão](https://www.popgas.com.br/recursos/gestao), [Tech & IA](https://www.popgas.com.br/recursos/tech-ia).
- Três pacotes na página de planos: **Essencial R$ 99,90**; **Gestão Completa** (Essencial + Gestão + Fiscal) R$ 99,90 nos 3 primeiros meses, "depois, R$ 198,90/mês"; **Plataforma Completa** R$ 99,90 nos 3 primeiros meses, "depois, R$ 397,90/mês" — [Planos](https://www.popgas.com.br/planos).
- Promoção de entrada: módulos adicionais grátis nos 3 primeiros meses, uma vez por empresa; números de WhatsApp adicionais ficam fora — [Planos](https://www.popgas.com.br/planos).
- Teste grátis de **14 dias**, sem cartão; **sem fidelidade nem multa**; cobrança mensal por cartão, PIX ou boleto; "**sem taxa de implantação**"; primeiro mês proporcional — [Planos](https://www.popgas.com.br/planos).
- Cada plano inclui **1 CNPJ e 1 número de WhatsApp** e uma **franquia mensal de documentos fiscais e de conversas atendidas pela IA** (quantidades não informadas); acima de 5 mil pedidos/mês ou várias filiais, plano sob medida — [Planos](https://www.popgas.com.br/planos).
- Suporte humano em horário comercial por WhatsApp e e-mail; importação de clientes por planilha feita pelo próprio usuário — [início](https://www.popgas.com.br/), [Planos](https://www.popgas.com.br/planos).

#### PopGás — recursos por módulo [lido direto]
- **Essencial**: pedidos com fluxo "aberto, confirmado, saiu para entrega, entregue ou cancelado com motivo" (entregue pode ser reaberto para correção); novo pedido com busca por nome ou telefone, endereços salvos, preço da tabela vigente e troco automático; bina integrada; cadastro com CPF/CNPJ, vários endereços com coordenadas, histórico, saldo em conta e observações; pagamento em dinheiro com troco, cartão, PIX com QR code, boleto e saldo do cliente; tabelas de preço por unidade e por canal com vigência programada; cupom, primeira compra, leve mais pague menos, brinde; app do cliente com a marca da revenda; avaliação de 1 a 5 estrelas; app do entregador; painéis; várias lojas e perfis de acesso com trilha de auditoria — [Essencial](https://www.popgas.com.br/recursos/essencial).
- **Vertical de gás (incluída em todos os planos)**: carregamento de veículos (cada entrega baixa do carregamento; no retorno a sobra volta ao estoque); vasilhames (cheios e vazios por depósito e veículo, remessa à distribuidora com nota, troca, empréstimo, quebra e furto); acerto; distribuição de pedidos "por prazo de entrega ou pela melhor rota"; áreas de cobertura com taxa e prazo, horários e feriados; tipos de entrega (rápida, normal, agendada com janelas, retirada); escala, faltas, penalidades e pontuação com bonificação; custo de frota por quilômetro e por unidade entregue; brinde automático por quantidade; chamado de suporte técnico (vazamento, regulador, instalação) ligado ao pedido — [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas).
- **Gestão**: estoque por lotes com custo e condição (bom estado, avariado, vencido, devolvido); movimentações com usuário, data, origem e destino; **conferência diária** (físico × sistema, diferenças por produto); transferências; recebimento de mercadorias que já lança a conta a pagar; contas a pagar e a receber com parcelas, recorrência e baixa em lote; caixa por loja com sangria e suprimento; saldo diário por conta; centros de custo; DRE; conciliação bancária por arquivo OFX com sugestão da IA; mais de 25 relatórios com exportação para Excel — [Gestão](https://www.popgas.com.br/recursos/gestao).
- **Tech & IA**: a IA atende, monta o carrinho, confirma endereço e pagamento e cria o pedido; usa modelos do Google e, via OpenRouter, da OpenAI e da Anthropic; base de conhecimento da revenda; **WhatsApp oficial (Meta) ou número comum por QR code**; central com atendimentos, fila e chatbot; filas por assunto ou unidade (valem também para a bina); avisos automáticos; campanhas para inativos, em risco ou VIP; painéis de conversas e de entrega das mensagens — [Tech & IA](https://www.popgas.com.br/recursos/tech-ia).
- **Combinações**: "Estoque baixa automaticamente quando o pedido é entregue"; "NFC-e emitida automaticamente na entrega, se você quiser" — [Essencial](https://www.popgas.com.br/recursos/essencial).
- **Empresa**: "Nascido em uma revenda real, em operação desde 2015"; rodapé "POPGAS COMERCIO E TECNOLOGIA LTDA · Uberlândia/MG"; números anunciados pela própria empresa: 1 milhão+ de pedidos, 30 mil+ clientes atendidos por mês — [início](https://www.popgas.com.br/).

#### RevGás — preços [lido direto]
- Única menção de preço no site: "**Planos a partir de apenas R$ 50,00 / mês**", seguida de "Faça uma demonstração gratuita" — [revgas.com](https://revgas.com/). Conferi também o código-fonte da página: não há outra ocorrência de "R$" nem tabela de planos escondida.
- Não há menção a teste grátis, fidelidade, taxa de implantação ou preço das extensões (RevBank, RevBI, WhatsApp) — [revgas.com](https://revgas.com/), [Explore os recursos](https://revgas.com/explore-os-recursos/).

#### Divergências com as notas anteriores
1. **Preço do módulo de IA do PopGás**: as notas diziam "+R$ 199,90/mês"; a página diz **+ R$ 199,00/mês** (a soma 99,90 + 49,50 + 49,50 + 199,00 = 397,90 confere) — [Tech & IA](https://www.popgas.com.br/recursos/tech-ia).
2. **"Vários preços diferentes dentro do site do PopGás"**: não é contradição — são o plano base, os módulos avulsos e os pacotes; os valores batem entre as páginas — [Planos](https://www.popgas.com.br/planos).
3. **"Desconto anual de 20% no PopGás"**: **não encontrei** nenhuma menção a plano anual nas páginas lidas; a cobrança descrita é só mensal. (O endereço de cadastro tem o parâmetro "billing=monthly", o que sugere que pode existir outra opção, mas isso é inferência.) — [Planos](https://www.popgas.com.br/planos).
4. **"Não encontrei taxa de implantação"**: o PopGás declara "sem taxa de implantação" — [Planos](https://www.popgas.com.br/planos).
5. **Situações do pedido no PopGás**: a lista "confirmado, pagamento recebido, saiu para entrega, entregador chegando, entregue, cancelado" é a dos **avisos ao cliente**; as situações do pedido no sistema são "aberto, confirmado, saiu para entrega, entregue, cancelado com motivo" — [Essencial](https://www.popgas.com.br/recursos/essencial), [Tech & IA](https://www.popgas.com.br/recursos/tech-ia).
6. **Baixa de estoque e nota**: as notas diziam "baixa ao confirmar o pedido e gera NF-e na conclusão"; a página diz baixa **quando o pedido é entregue** e **NFC-e** automática na entrega (opcional, módulo Fiscal) — [Essencial](https://www.popgas.com.br/recursos/essencial).
7. **WhatsApp do PopGás**: não é só a API oficial; aceita também **número comum por QR code**. Os modelos de IA incluem os do **Google**, além de OpenAI e Anthropic — [Tech & IA](https://www.popgas.com.br/recursos/tech-ia).
8. **Tipos de entrega**: "rápida, normal, agendada, retirada" (as notas diziam "expressa, agendada, retirada") — [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas).
9. **"Mapa com recomendação de qual entregador atribuir"**: o que li é distribuição **por regra** (prazo ou melhor rota) e a frase "sabe quem está mais perto de cada pedido"; não vi, em texto nem em tela, uma recomendação por pedido — [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas), [Essencial](https://www.popgas.com.br/recursos/essencial).
10. **"Múltiplos depósitos e estoque por lote no plano superior"**: fazem parte do módulo **Gestão (+R$ 49,50)**, não do plano mais caro — [Planos](https://www.popgas.com.br/planos).
11. **Dúvida "o site de entrega ao consumidor é a mesma empresa?"**: sim, pelos indícios lidos — o sistema "nasceu dentro de uma distribuidora de gás", a razão social é POPGAS COMERCIO E TECNOLOGIA LTDA (Uberlândia/MG) e a demonstração usa lojas de Uberlândia — [início](https://www.popgas.com.br/), [Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas).
12. **Faixa "RevGás de R$ 50 a R$ 249/mês"**: só o piso de **R$ 50,00** está no site; o teto de R$ 249 não aparece em lugar nenhum das páginas lidas — [revgas.com](https://revgas.com/).
13. **Rede**: as notas diziam que popgas.com.br e revgas.com não abriam; nesta rodada abriram normalmente.
14. Confirmados sem mudança: teste de 14 dias e "sem fidelidade" no PopGás; RevGás com app do entregador, bina, rastreio e envio do entregador mais próximo; RevGás para Entregadores com 10 mil+ instalações.

### Inferences
- Para um depósito pequeno que queira estoque e financeiro, a conta real do PopGás é R$ 149,40/mês (base + Gestão) ou R$ 198,90 com nota fiscal; o valor de R$ 99,90 sozinho não inclui estoque nem caixa.
- A "franquia" de notas e de conversas com a IA sem número publicado é um custo que só aparece depois da contratação.

### Gaps
- Na tabela comparativa do PopGás, as marcas de "incluído" são ícones e não saíram no texto; não conferi linha a linha em qual módulo cada recurso está (por exemplo, "Bina Integrada" aparece no grupo "Vendas e atendimento", que corresponde ao Essencial segundo a página do módulo).
- Tamanho da franquia de notas fiscais e de conversas com a IA do PopGás: não publicado.
- Tabela de planos do RevGás: não publicada; só por demonstração.

---

## 5. Padrões que se repetem e recomendações

### Takeaway
Os dois produtos convergem em poucos padrões fortes: lista com etiqueta colorida de situação, pagamento visível na linha, mapa com lista de entregadores ao lado, app do entregador com poucas telas e botões grandes, e resumo do dia separado por forma de pagamento. As lacunas que vi (tela lenta para pedido repetido, falta de quadro de cheios e vazios, menu só de ícones) são as oportunidades para um programa próprio.

### Cited Findings — Padrões que se repetem (observados)
- **Um molde único de tela de lista**: título + caminho, busca rápida com contador, botões de filtro/recarregar/novo sempre no mesmo lugar e na mesma cor, tabela, paginação — visto em 12 telas do PopGás ([exemplo](https://www.popgas.com.br/screenshots/features/cadastro-de-clientes.png)).
- **Situação sempre em pílula colorida**, com verde = concluído/ativo, vermelho = vencido/atrasado, amarelo/laranja = pendente, azul-claro ou cinza = neutro — PopGás ([contas a pagar](https://www.popgas.com.br/screenshots/06-financeiro-contas.png)) e RevGás ("12 Finalizadas" verde, "2 Canceladas" vermelho — [Google Play](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR)).
- **Célula de vários andares** para evitar abrir o registro: nome/telefone/endereço; valor/forma de pagamento; situação/data — [lista de pedidos PopGás](https://www.popgas.com.br/screenshots/01-pedidos-lista.png).
- **Dinheiro, cartão e PIX sempre separados** no fechamento do entregador — texto do PopGás ([Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas)) e tela "Resumo" do RevGás ([Google Play](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR)).
- **Mapa com o entregador desenhado como moto com botijões** e lista de entregadores ao lado — PopGás ([mapa](https://www.popgas.com.br/screenshots/rastreamento-frota-mapa.png)) e RevGás (app e ilustração do site — [revgas.com](https://revgas.com/)).
- **Venda na rua pelo app do entregador** e **cadastro de cliente pelo entregador** — PopGás ([App Entregadores – Configurações](https://www.popgas.com.br/screenshots/features/app-do-entregador.png)) e RevGás ([Google Play](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR)).
- **Cadastro simplificado de cliente** como botão de destaque ao lado do cadastro completo — PopGás, em duas telas ([novo pedido](https://www.popgas.com.br/screenshots/features/lancamento-rapido.png), [clientes](https://www.popgas.com.br/screenshots/features/cadastro-de-clientes.png)).
- **Busca global e atalhos para as telas mais usadas** — PopGás ("Pesquisar F4", "Acesso Rápido") e RevGás ("Busca rápida", "Favoritos" — [Explore os recursos](https://revgas.com/explore-os-recursos/)).
- **Cartões de indicador com número grande, rótulo curto e uma frase explicando a conta** — PopGás ([atrasados](https://www.popgas.com.br/screenshots/erp/dashboard-pedidos-atrasados.png), [segmentação](https://www.popgas.com.br/screenshots/features/historico-de-compras.png)).
- **Preço por tipo de entrega, com retirada no balcão mais barata** — PopGás ([tabela de preço](https://www.popgas.com.br/screenshots/features/precos-e-promocoes.png)).
- **Avisos ao cliente em etapas fixas pelo WhatsApp**, com link de acompanhamento na etapa "saiu para entrega" — PopGás ([imagem](https://www.popgas.com.br/screenshots/whatsapp-notificacoes-foto.png)).
- **Configuração por chaves liga/desliga com uma frase explicando cada uma** — PopGás ([imagem](https://www.popgas.com.br/screenshots/features/app-do-entregador.png)).

### Inferences — Recomendações (minhas, não observadas)
1. **Tela de pedidos em uma só página, não em três passos.** Campo único de busca (telefone, nome ou endereço) já com foco; ao escolher o cliente, mostrar o último pedido com um botão "Repetir" e o troco calculado. Manter o "cadastro simplificado" dentro da própria tela. Tudo operável só pelo teclado (Enter avança, atalhos visíveis nos botões).
2. **Lista de pedidos do dia no padrão de três andares do PopGás, acrescentando o que falta nele**: produto e quantidade ("1 P13"), entregador, e uma faixa de totais do dia no topo (abertos, em rota, entregues, valor). Mais linhas por tela (linhas de ~56 px) com opção "compacta".
3. **Cores de situação fixas e com texto junto** (nunca só a cor): Aberto = verde-claro com borda; Em rota = azul; Entregue = verde cheio; Atrasado = vermelho; Pagamento pendente = amarelo com letra laranja; Cancelado = cinza. Legenda visível na tela e no mapa.
4. **Quadro de cheios e vazios como tela própria** (o que nenhum dos dois mostra): uma grade com linhas por produto (P13, P20, P45, água) e colunas por local (depósito, cada veículo, emprestado a clientes, em remessa para a distribuidora), com cheios e vazios lado a lado e total que precisa fechar.
5. **Acerto do entregador em duas colunas**: à esquerda o dinheiro (vendido por forma de pagamento, menos despesas e troco inicial = a entregar), à direita os vasilhames (saiu cheio, voltou cheio, voltou vazio, diferença). Diferença diferente de zero em vermelho e campo obrigatório de justificativa. Usar o "Resumo" do RevGás como modelo do lado do entregador.
6. **App do entregador com no máximo cinco abas** (Pedidos, Carga, Venda na rua, Acerto, Eu), botões de largura total, e **confirmação de entrega por deslizar** (evita toque acidental), como no RevGás. Chave "disponível/indisponível" bem visível no topo.
7. **Mapa com lista lateral de entregadores mostrando "pedidos na fila" e "botijões no carro"** (padrão PopGás), mais uma seção "Sem entregador" no topo e botão de atribuir direto no pino do pedido.
8. **Menu lateral com ícone e texto** (o do PopGás, só com ícones, exige decorar), mantendo a busca global com atalho e uma área de favoritos.
9. **Painel do dono com poucos números e a frase explicativa embaixo**, em português simples: "Entregues no prazo: 82% (meta 95%)" em vez de "OTD RATE"; "Faturamento" em vez de "GMV".
10. **Lista de clientes "para ligar hoje"** inspirada na segmentação do PopGás, mas calculada pelo intervalo de compra de cada cliente (quem costuma comprar a cada 30 dias e está há 35 sem pedir), com botão de WhatsApp na linha.
11. **Para depósito único, esconder tudo que é de rede** (colunas "Organização", "Unidade"); só aparecem quando houver segunda loja.
12. **Tabela de preços simples**: uma linha por produto, colunas "Entrega" e "Retirada no balcão", e exceções por cliente (preço combinado) na ficha do cliente — evita as várias linhas por produto vistas no PopGás.

### Gaps
- As recomendações 4 e 5 não puderam ser comparadas com nenhuma tela real: nem PopGás nem RevGás publicam a tela de saldo de vasilhames ou a de dentro do acerto.
- Não vi nenhum dos dois em uso real (com atendente digitando); velocidade de lançamento e atalhos só poderiam ser medidos no teste grátis do PopGás ou numa demonstração do RevGás.
