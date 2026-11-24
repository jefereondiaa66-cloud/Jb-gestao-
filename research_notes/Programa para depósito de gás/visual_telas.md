# Visual e telas de programas para depósito de gás / revenda de GLP (Brasil em primeiro lugar, mais referências internacionais)

> **Aviso de método (leia antes de usar estas notas).** Pesquisa feita em 24/11/2026. Nesta sessão, a abertura direta de páginas estava bloqueada pela rede (os sites `www.popgas.com.br`, `ahgas.com.br`, `revgas.com`, `glpdigital.com.br`, `distribuidorpro.com.br` e `gasexpert.maik.com.br` não resolveram; o repositório GitHub `Solace-Inc-Team/depo` também não está liberado). Por isso **não foi possível ver nenhuma captura de tela nem assistir a vídeos**. Tudo o que está em "Achados com fonte" vem do **texto** das páginas dos fabricantes, das lojas de aplicativos, de centrais de ajuda e do Reclame Aqui, lido por meio dos resumos da busca na web. Consequência prática: há boa evidência sobre **quais telas existem, que campos/atalhos/estados têm e como o fluxo funciona**, mas **quase nenhuma evidência sobre posição exata dos elementos, cores e tipografia** dos sistemas brasileiros de gás. Onde eu descrevo layout ou cor sem fonte, isso está marcado como **Recomendação (minha, não observada)**. Quase todas as fontes brasileiras são material de divulgação do próprio fabricante (não verificado de forma independente).

---

## 1. Como é a tela principal de pedidos ("tela de pedidos / atendimento")? Como aparece o identificador de chamadas (bina)? Que campos e atalhos existem para operar rápido?

### Takeaway
O padrão brasileiro é: **o telefone toca → o sistema identifica o número → abre a ficha do cliente com histórico/último pedido já dentro da tela de pedido**, e o atendente faz o pedido, corrige o cadastro e despacha sem sair dessa tela; o melhor detalhe de usabilidade documentado é o "foco inteligente" (uma nova ligação não rouba o foco do pedido em andamento). O único conjunto de atalhos de teclado documentado em texto é o do Gas Expert/Tele Expert (F1–F7, F10, F12, Ctrl+C/S/E, setas, Esc).

### Cited Findings

**Bina / identificador de chamadas**
- Gas Expert / Tele Expert (Maikonlyne): "Ao tocar o telefone, o programa carrega automaticamente o cadastro do seu cliente e o seu histórico de compras"; se quem liga **não** é cadastrado, o sistema oferece a opção de cadastrar rapidamente — [Maikonlyne – Como funciona a bina](https://www.maikonlyne.com.br/pagina/bina); [Maikonlyne – Gas Expert (produto)](https://www.maikonlyne.com.br/produto/2724/gas-expert-2017-software-disk-gas,-agua-e-bebidas)
- Tele Expert: "identificação com foco inteligente" — se entra uma nova ligação enquanto o atendente está fazendo um pedido, **o foco permanece na tela de pedido** e não pula para a nova chamada; dá para configurar **até três binas no mesmo computador** — [Maikonlyne – Atualizações Tele Expert](https://www.maikonlyne.com.br/pagina/Tele-Expert)
- O aparelho de bina não acompanha o sistema; sem bina o atendente digita o telefone ou qualquer outro item de pesquisa do cadastro — [Maikonlyne – bina](https://www.maikonlyne.com.br/pagina/bina)
- "Bina Cell": identifica chamadas do celular; exige celular e computador na mesma rede Wi‑Fi; compatível com Gas Expert/Tele Expert 2018 ou superior — [Maikonlyne – Bina Cell](https://www.maikonlyne.com.br/pagina/binacell); [Gas Expert – Bina Cell PC](https://gasexpert.maik.com.br/binacell)
- BITTWork: o número de quem liga é associado ao banco de dados (não só mostrado no visor) e traz **nome, endereço e último pedido**; suporta bina fixa (hardware ligado ao PC) e bina de celular (aplicativo) — [BITTWork – Disk entrega com BINA](https://bittwork.com/sistema-disk-entrega-bina-como-funciona.html)
- Brazil Sistem (BS Gestão): "Atendimento BINA com identificador de chamadas"; o aplicativo **BS Bina** vem incluso, identifica as chamadas e registra as ligações no sistema — [BS Gestão](https://brazilsistem.com.br/bs-gestao/); [Aplicativo BS Bina](https://brazilsistem.com.br/aplicativos/aplicativo-bs-bina/)
- ControlGás (Magnasys): módulo Tele‑Atendimento faz recebimento de chamadas **com histórico de ligações** (precisa de bina configurada e vinculada); depois do recebimento da chamada a tela oferece a opção de venda — [Wiki ControlGás – Tele‑Atendimento](https://wiki.controlgas.com.br/Tele-Atendimento); [ControlGás](https://controlgas.com.br/)
- Clickatende: identifica até **4 chamadas de linhas diferentes ao mesmo tempo**; exige equipamento físico (kit bina) — [Clickatende – Sistema de delivery](https://clickatende.com.br/sistema-de-delivery/)
- Solutio Gás: "Solutio BINA" identifica chamadas no fixo ou no smartphone e já abre os dados do cliente; há um módulo de teleatendimento para pedidos por telefone — [Solutio Gás](https://solutiogas.com.br/)
- GasNow Revenda: "A ligação por telefone ou WhatsApp toca no painel já com o cliente e o último pedido dele na tela"; todos os canais (WhatsApp, ligação, portaria, apps de gás, Google Ads, site) caem na **mesma fila** — [GasNow Revenda](https://gasnow.com.br/revenda)
- ahgas: lista "Bina whats" (identificação ligada ao WhatsApp) e o "Binho" (atendimento por IA) — [ahgas](https://ahgas.com.br/); [ahgas – Serviços](https://ahgas.com.br/servicos/)
- xGás (sistema grátis para Windows): a versão paga tem suporte a bina (precisa comprar aparelho compatível) — [xGás – Bina](https://xgas.com.br/bina.php)

**Tela de pedido — campos e comportamento**
- Gas Expert: na **mesma tela** o atendente vê o histórico do cliente, cadastra/altera os dados e lança o pedido — [Gas Expert 2025 (anúncio do fabricante no Mercado Livre)](https://www.mercadolivre.com.br/gas-expert-2025-sistema-gas-e-agua-maikonlyne/up/MLBU2795935005)
- Tipos de venda que a tela precisa cobrir: **disk (entrega), portaria (balcão), automática (venda na rua pelo entregador) e retirada**, mais agendamento de pedidos e preço especial por cliente — [ahgas](https://ahgas.com.br/)
- PopGás: tipos de entrega configuráveis (**expressa, agendada, retirada**) e áreas de atendimento definidas geograficamente — [PopGás – Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas)
- PedeGás: registra pedidos de entrega, retirada e balcão, cada um com sua forma de pagamento — [PedeGás – Paulínia](https://pedegas.com/solucoes/sistema-para-revenda-de-gas/paulinia-sp)
- NeXT ERP: PDV em dois formatos, **"mini" e "Tela Cheia"** — [NeXT Software – Distribuidora de gás](https://www.nextsoftware.com.br/segmentos/sistema-para-distribuidora-de-gas.aspx)
- Vendergás: envia o pedido para o celular do entregador "com um clique" — [Sistema Vendergás](https://sistemavendergas.com.br/)
- Gas Expert 2014: bloqueio de **valor mínimo de venda** sem senha do administrador (afeta o campo de preço na tela de pedido) — [Gas Expert 2014](https://www.maikonlyne.com.br/pagina/Gas-Expert-Plus-2014)

**Atalhos de teclado documentados (Gas Expert / Tele Expert, tela "Pedidos Realizados")**
- F1 a F7 = cancelar, alterar, excluir, opções de impressão, atualizar, **F6 = confirmar saída, entrega e/ou entregador**, e fechar pedido; **Ctrl+C** = confirma saída, entrega e/ou entregador; **Ctrl+S** = confirma só a saída; **Ctrl+E** = confirma só a entrega; **setas** andam na lista; **Esc** sai da tela (versão 2013; a ordem exata F1–F5 e F7 veio de resumo e deve ser conferida na página) — [Gas Expert 2013](https://www.maikonlyne.com.br/pagina/Gasexpert-Plus-2013)
- **F10** = enviar SMS ao cliente do pedido selecionado (menu Opções › Enviar SMS); **F12** = abrir o endereço do pedido no Google Maps (Opções › Abrir Google Maps) — [Atualizações Tele Expert](https://www.maikonlyne.com.br/pagina/Tele-Expert)

### Inferences
- A tela de atendimento, nos produtos pesquisados, é **uma tela única** (cliente + histórico + itens + pagamento + entregador), não um assistente em várias etapas. Isso é coerente com atendimento por telefone, em que o cliente está na linha.
- O "último pedido na tela" (BITTWork, GasNow) sugere que o caminho mais rápido é **repetir o último pedido** com uma confirmação — nenhum fabricante descreve um botão "repetir", é dedução.
- Os atalhos do Gas Expert separam **"saída"** (o pedido saiu com o entregador) de **"entrega"** (foi entregue): dois carimbos de tempo distintos, que alimentam o tempo de entrega.
- **Recomendação (minha, não observada) — layout sugerido da tela de atendimento:** três colunas. (1) Esquerda, estreita: fila de chamadas/contatos entrando (telefone e WhatsApp), cada item com número, nome se conhecido e há quanto tempo espera. (2) Centro, larga: campo de busca único no topo (telefone, nome, endereço), abaixo a ficha curta do cliente (nome, endereço com ponto de referência, bairro, observação fixa, saldo/fiado, cascos em comodato) e o pedido (produtos como botões grandes "P13", "P45", "Água 20 L" com + / −, forma de pagamento, "troco para", entregador, agendar). (3) Direita: últimos pedidos do cliente com botão "Repetir" e a previsão de recompra. Barra inferior fixa com os atalhos escritos nos botões (ex.: F2 Novo, F6 Despachar, F10 Mensagem, F12 Mapa, Esc Cancelar).
- **Recomendação (minha):** popup de bina como **faixa/cartão não modal** no canto superior ("Ligando: Maria – Rua X, 120 – último: 1 P13 há 28 dias") com as ações "Atender (Enter)" e "Depois"; nunca tirar o foco do pedido aberto (copiar o "foco inteligente" do Tele Expert); permitir várias chamadas empilhadas (Clickatende mostra até 4 linhas).
- **Recomendação (minha):** número desconhecido abre cadastro rápido com só 3 campos obrigatórios (telefone já preenchido, nome, endereço), como o "cadastrar rapidamente" do Gas Expert.

### Gaps
- Não vi nenhuma captura da tela de pedido: **posição dos campos, cores, tamanho de botões e aparência do popup da bina não foram confirmados** em nenhum produto.
- Não achei documentação de atalhos de teclado nos sistemas em nuvem (PopGás, RevGás, GasNow, Vendergás, GestGAS, System Gas, DistribuidorPRO).
- Não consegui acessar vídeos de demonstração no YouTube (a busca não retornou vídeos relevantes e o acesso direto estava bloqueado).

---

## 2. Como é o monitor de pedidos/entregas ("painel de entregas": kanban ou lista por status)? Cores para atraso? Mapa com a posição dos entregadores?

### Takeaway
Nos sistemas de gás, o monitor aparece de duas formas: **lista "Pedidos Realizados" operada por teclado** (Gas Expert) e **mapa ao vivo com entregadores e pedidos** (PopGás, RevGás, ControlGás, GestGAS, System Gas, Vendergás); nenhuma fonte de sistema de gás documenta as cores de status ou de atraso. Os códigos de cor e o layout mapa + barra lateral mais bem documentados vêm de softwares de despacho comparáveis (Onfleet) e de gestores de pedidos de delivery (iFood, Brendi), que usam colunas em kanban.

### Cited Findings

**Sistemas de gás (Brasil)**
- Gas Expert: tela "Pedidos Realizados" em lista; ganhou a coluna **"agendado para"** (2014) e a opção de **pintar a linha inteira ou não** (2013), o que indica linhas coloridas por situação — as cores em si não estão documentadas — [Gas Expert 2014](https://www.maikonlyne.com.br/pagina/Gas-Expert-Plus-2014); [Gas Expert 2013](https://www.maikonlyne.com.br/pagina/Gasexpert-Plus-2013)
- PopGás: **mapa de distribuição** mostra os pedidos com **recomendação de qual entregador atribuir**; rastreamento GPS do entregador atualizado continuamente — [PopGás – Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas)
- RevGás: mapa com a posição de cada entregador durante a rota; o sistema direciona o **entregador mais próximo** para cada pedido novo, avisa o entregador e dá baixa no estoque ao finalizar — [RevGás](https://revgas.com/)
- GasNow: o despacho escolhe/sugere o entregador por **distância e estoque no carro** ("só sugere quem tem o produto no carro") e envia o pedido ao celular dele; há filtro por produto (P13, P45, líquido, completo, vazio) — [GasNow Revenda](https://gasnow.com.br/revenda)
- ControlGás/Magnasys: módulo de rotas e entregas — criar rotas, **acompanhar o status das entregas em tempo real** e ver no mapa onde cada entregador está — [Magnasys – Rotas e entregas](https://magnasys.com.br/rotas-e-entregas-na-revenda-de-gas/)
- ControlGás Tele‑Atendimento: fluxo do pedido = **efetuar → encaminhar → acompanhar → encerrar** — [Wiki ControlGás – Tele‑Atendimento](https://wiki.controlgas.com.br/Tele-Atendimento)
- System Gas: a página mostra um painel de **"operação ao vivo"** com pedidos e entregas atualizados — [System Gas](https://systemgas.com.br/)
- Vendergás: localização em tempo real dos entregadores — [Sistema Vendergás](https://sistemavendergas.com.br/)
- GestGAS: rastreamento GPS em tempo real e confirmação de entregas pelo app — [GestGAS](https://gestgas.com/)
- Brazil Sistem: aviso automático por WhatsApp ao cliente quando o gás **sai para entrega** e quando o pedido é **concluído** — [Brazil Sistem](https://brazilsistem.com.br/)
- PopGás (plano Essencial): notificações por WhatsApp em cada etapa (confirmação de pagamento, saída rastreada, entrega, cancelamento) — [PopGás – Essencial](https://www.popgas.com.br/recursos/essencial)

**Softwares de despacho comparáveis (cores e layout documentados)**
- Onfleet — layout: mapa grande + **barra lateral** com tarefas, equipes e entregadores; tarefas **não atribuídas** ficam numa seção no topo; entregadores aparecem sob suas equipes com as tarefas na ordem de execução — [Onfleet – Map & Sidebar](https://support.onfleet.com/hc/en-us/articles/360023669612-Map-Sidebar)
- Onfleet — cores das tarefas: **cinza = não atribuída; roxo = atribuída; azul = em trânsito; verde = concluída com sucesso; vermelho = falhou** (verde e vermelho só no mapa); **ponto dourado** no ícone = tarefa atrasada — [BloomNation – Creating Tasks (Onfleet)](https://help.bloomnation.com/articles/Creating-Tasks); [Onfleet – Task Status](https://support.onfleet.com/hc/en-us/articles/20509786766228-Task-Status)
- Onfleet — cores dos entregadores: em serviço = círculo pulsando; **azul = em trânsito; verde = ocioso; cinza = fora de serviço** (não aparece no mapa); ponto dourado quando tem tarefa atrasada — [Onfleet – Driver Status](https://support.onfleet.com/hc/en-us/articles/10228905705876-Driver-Status)
- Onfleet — vários pedidos no mesmo ponto viram um pino com número; estados misturados = pino cinza com ponto azul — [Onfleet – Task Pin Clustering](https://support.onfleet.com/hc/en-us/articles/8445295728916-Task-Pin-Clustering)
- Shipday — abas separadas **Dispatch, Orders, Drivers, Map**; filtro "não atribuídos"; a aba Dispatch mostra pedidos novos ao lado dos entregadores e seus pedidos; atribui-se pelo botão "Assign" no pedido ou clicando na entrega no mapa; há despacho automático — [WP Mayor – Shipday review](https://wpmayor.com/shipday-review/); [Shipday FAQ](https://www.shipday.com/faq)

**Gestores de pedidos de delivery (kanban)**
- iFood Gestor de Pedidos: "Modo Quadros" (kanban) com colunas **Novos, Em preparo, Prontos, Entregando**; cada pedido é um cartão que avança; indicado para alto volume; pedido precisa ser aceito em **5 minutos** — [iFood – Gestor de Pedidos](https://blog-parceiros.ifood.com.br/gestor-de-pedidos-ifood/); [guia de terceiros](https://restaurantelucrativo.adsbunker.com/conteudos/gestor-de-pedidos-ifood/)
- Brendi: colunas **Em Análise → Em Preparo → Pronto → Em Entrega → Finalizados**; "Pronto" vem ligada e "Finalizados" desligada por padrão (a loja escolhe); no topo alterna-se entre **Kanban e Roteirização (mapa)**; pedidos recusados somem do gestor; há seção própria de cronômetro — [Brendi – Gestor de pedidos](https://ajuda.brendi.com.br/funcionalidades/gestor-de-pedidos)
- Implementação própria de gestor iFood (projeto aberto): atualiza a cada 10 s, toca som no pedido novo, mostra a **contagem de pendentes no título da janela** e **destaca pendentes há 5 min ou mais** — [GitHub – barbacue PR #3](https://github.com/marlonmfa/barbacue/pull/3)

### Inferences
- Os estados mínimos que aparecem nos sistemas de gás são: **novo/recebido → encaminhado ao entregador → saiu (saída confirmada) → entregue → encerrado/acertado**, mais cancelado e agendado. Notar que no ControlGás "entregue" não é o fim: o pedido só gera financeiro depois do **acerto** (ver seção 4).
- Sistemas de gás em nuvem vendem o **mapa** como tela principal de acompanhamento; os de desktop usam **lista com atalhos**. Um bom produto oferece os dois com alternância no topo (como o Brendi: Kanban ↔ Roteirização).
- **Recomendação (minha, não observada) — painel de entregas:** kanban com 4 colunas ("Aguardando", "Com entregador", "Em rota", "Entregue hoje") e botão para alternar para "Mapa". Cartão do pedido: hora + cronômetro, cliente, bairro, itens (ícone do botijão + quantidade), forma de pagamento, entregador (avatar/iniciais). Arrastar o cartão para a coluna ou para o nome do entregador atribui.
- **Recomendação (minha) — cores de atraso:** cronômetro no cartão que muda de cor por faixa em relação à meta de entrega (ex.: neutro até 50% do prazo, amarelo de 50% a 100%, vermelho acima do prazo, com borda piscando discreta). Seguir a lógica da Onfleet de **não trocar a cor do estado**, e sim acrescentar um **marcador de atraso** (ponto dourado) — assim cor = estado e marcador = atraso, e a tela continua legível para daltônicos se houver também ícone/texto.
- **Recomendação (minha) — mapa:** barra lateral à esquerda com "Sem entregador" no topo e, abaixo, cada entregador com sua fila na ordem (padrão Onfleet); pinos dos pedidos coloridos por estado; entregadores com cor por situação (em rota / livre / fora); sugestão automática do entregador mais próximo **que tenha o produto no carro** (padrão GasNow/RevGás/PopGás).

### Gaps
- **Nenhuma fonte de sistema de gás brasileiro documenta as cores de status ou de atraso** nem confirma layout em kanban. As cores citadas são da Onfleet (EUA) e podem ter mudado (artigos com alguns anos).
- Não achei evidência de como o mapa dos sistemas de gás desenha rotas, áreas ou mapa de calor (o ahgas apenas lista "mapa de calor" como recurso — [ahgas](https://ahgas.com.br/)).
- Não encontrei as telas passo a passo do wiki do ControlGás (só o resumo do fluxo).

---

## 3. Como é o aplicativo do entregador (lista de pedidos, botão de navegação, confirmar entrega, pagamento, devolução de vasilhame)?

### Takeaway
O app do entregador no Brasil vai além de "receber e confirmar": os mais completos (PopGás, GasNow, System Gas) começam o dia pelo **carregamento/estoque do carro**, recebem pedidos com **alerta sonoro**, abrem navegação, permitem **lançar venda na rua**, **registrar despesas** e terminam com o **acerto**. Referências internacionais acrescentam **prova de entrega** (foto, assinatura, código OTP), leitura do número de série do botijão e funcionamento com sinal fraco.

### Cited Findings

**Brasil**
- PopGás (app do entregador): o entregador **confere o carregamento**, recebe pedidos na rota, **lança vendas na porta do cliente**, **registra despesas** e **encerra o dia com o acerto**; a nota de versão mais recente fala em "novo fluxo de adição de despesas" — [PopGás](https://www.popgas.com.br/); [Google Play – PopGas Entregadores](https://play.google.com/store/apps/details?id=br.com.popgas.delivery_app&hl=en_US)
- GasNow: o **topo do app do entregador mostra o estoque do carro**; carregamento e descarregamento são registrados pelo próprio entregador — [GasNow Revenda](https://gasnow.com.br/revenda)
- System Gas: o app reúne **pedidos, mapa, navegação, status e controle de carga**; o entregador recebe o pedido, abre a navegação e atualiza a entrega **sem ligar para a central** — [System Gas](https://systemgas.com.br/)
- RevGás para Entregadores (10 mil+ downloads): vê o endereço do cliente **no mapa**, pode **recusar ou cancelar** entregas, tem **histórico resumido e detalhado**, e registra **vendas externas** (venda na rua) no app; a central acompanha a localização em tempo real — [Google Play – RevGás para Entregadores](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=en_US)
- Appgas Entregador: recebe e **aceita** pedidos no app; histórico e desempenho; "mapa inteligente" com melhor rota; a versão 2.2.1 (11/11/2025) acrescentou **alerta sonoro de pedido**, notificações push, **gorjeta** para o entregador e **CPF na nota** — [App Store – Appgas Entregador](https://apps.apple.com/br/app/appgas-entregador/id1505557035); [Google Play – Appgas Entregador](https://play.google.com/store/apps/details?id=br.com.mobile2you.appgas.driver&hl=en_US)
- BS Entregador (Brazil Sistem): o atendente registra o pedido e ele chega sozinho ao celular; o entregador acompanha o **tempo de entrega em tempo real**; a página lembra que antes o entregador tinha de **estacionar para anotar o pedido por telefone** — [Aplicativo BS Entregador](https://brazilsistem.com.br/aplicativos/aplicativo-bs-entregador/)
- GestGAS: app com GPS em tempo real, confirmação de entregas e gestão de pedidos — [GestGAS](https://gestgas.com/)
- Entregador Fogás (10 mil+ downloads): entregador é cadastrado pela revenda; acompanha o próprio desempenho e o da revenda; **cada entrega é avaliada**; suporte por chat no app — [Google Play – Entregador Fogás](https://play.google.com/store/apps/details?id=br.com.fogas.entregador.appentregador&hl=en)
- SIS GLP ADS Pro: um resumo de busca citou "app PWA para entregadores", mas uma segunda busca na mesma página **não confirmou** esse item — [SIS GLP ADS Pro](https://glpdigital.com.br/)

**Internacional**
- Cylin (Paquistão): rotas passo a passo com **paradas em sequência**; **leitura (scan) do número de série do botijão** e prova de entrega em cada parada; fluxo **tolerante a falta de sinal**; cada botijão e cada entregador têm um estado de verificação visível — [Cylin – lançamento do app do entregador](https://cylin.com.pk/newsroom/driver-app-launch); [Cylin – sobre](https://cylin.com.pk/about)
- Gasista (Emirados, feito pela Royex): app do cliente, app do agente/entregador e painel web; lista de pedidos atribuídos com navegação no mapa e **confirmação da entrega por código OTP**; chat e notificações push — [Royex – Gasista (portfólio)](https://www.royex.ae/portfolio/gasista-lpg-gas-cylinder-booking-app); [Royex – estudo de caso](https://www.royex.ae/case-studies/gasista/)
- Onfleet Driver: navegação por Google Maps, Waze ou Here; ao terminar aparece uma **tela de conclusão** em que o entregador marca **sucesso ou falha**; seções "Anexos" (foto) e "Assinatura" (o cliente assina na tela), que a empresa pode tornar obrigatórias; histórico dos últimos 7 dias; aba "Analytics" no centro da barra inferior — [Onfleet – Proof of Delivery](https://support.onfleet.com/hc/en-us/articles/10348848090644-Proof-of-Delivery); [Onfleet – Task History](https://support.onfleet.com/hc/en-us/articles/360023910851-Task-History); [Google Play – Onfleet Driver](https://play.google.com/store/apps/details?id=com.onfleet.driver.app&hl=en_US); [Onfleet – Analytics](https://support.onfleet.com/hc/en-us/articles/360023910871-Analytics)
- Shipday: fila de pedidos com endereços, detalhes, navegação, telefone e instruções; prova de entrega = foto, assinatura e hora — [Square – Shipday](https://squareup.com/us/en/app-marketplace/app/shipday); [Shipday – Route planning](https://www.shipday.com/route-planning)
- CTMS (ERP de cilindros): app do motorista com etapas de **carregamento e entrega por leitura de código** — [CTMS – FAQ](https://ctmsgas.com/faq)
- Rishabh Software (estudo de caso): painel do motorista com visão dos pedidos **atuais e agendados** — [Rishabh – estudo de caso (PDF)](https://www.rishabhsoft.com/wp-content/uploads/2025/02/RSPL-Case-Study_Real-time_Gas_Cylinder_Distribution_Tracking_System.pdf)

### Inferences
- O fluxo diário que aparece somando as fontes brasileiras é: **conferir carga → receber/aceitar pedido (som) → navegar → entregar e receber → (venda na rua, despesas) → descarregar → acerto**.
- Nenhuma fonte brasileira descreve em texto a etapa de **devolução do casco vazio** na confirmação da entrega; ela é sugerida apenas pelo "controle de carga" (System Gas) e pelo "estoque do carro" (GasNow).
- **Recomendação (minha, não observada) — telas do app:** (1) **Início**: faixa fixa no topo com o estoque do carro (ex.: "P13: 8 cheios · 4 vazios") e o dinheiro em mãos; abaixo, lista de pedidos em cartões grandes na ordem de entrega. (2) **Pedido**: endereço e ponto de referência em letra grande, itens, valor e forma de pagamento, três botões enormes: "Navegar" (abre Waze/Google Maps), "Ligar/WhatsApp", "Cheguei". (3) **Confirmar entrega**: contadores + / − para "cheios entregues" e "vazios recolhidos" (por marca se necessário), forma de pagamento recebida (Dinheiro / Pix / Cartão / Fiado) com valor e troco, opção "não entregue" com motivo. (4) **Venda na rua**. (5) **Despesa** (combustível, etc., com foto do comprovante). (6) **Meu dia / Acerto**: resumo do que deve entregar ao caixa.
- **Recomendação (minha):** funcionar sem sinal (fila local e sincronização depois, como o Cylin), som alto e vibração para pedido novo (Appgas), e botões com no mínimo ~56 px de altura para uso com uma mão.

### Gaps
- Não vi nenhuma captura das telas dos apps de entregador; **layout, cores e rótulos dos botões não foram confirmados**.
- Não encontrei evidência textual, em apps brasileiros, de **foto/assinatura como prova de entrega**, nem de registro de **vasilhame devolvido por marca** no ato da entrega.
- Não consegui ler avaliações de usuários dos apps de entregador (as listagens retornadas não traziam texto de avaliações).

---

## 4. Como é a tela de acerto do entregador?

### Takeaway
O acerto é tratado como **fechamento diário por entregador**, calculado automaticamente a partir dos pedidos entregues e vendas na rua, conferido pelo caixa/dono contra o que o entregador traz, com totais **separados por forma de pagamento (dinheiro, cartão, Pix) e troco**; em pelo menos um sistema (ControlGás) o pedido só entra no financeiro depois do acerto. Não encontrei descrição visual da tela em nenhum fabricante.

### Cited Findings
- PopGás: o entregador encerra o dia com o acerto no app; "o gestor vê cada acerto no painel, com **dinheiro, cartão, PIX e troco separados**"; cálculo automático do fechamento diário e conferência financeira; o app também registra **despesas** do entregador — [PopGás](https://www.popgas.com.br/); [PopGás – Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas); [PopGás – Gestão](https://www.popgas.com.br/recursos/gestao)
- PopGás: "carregamentos, transferências e acerto diário" aparecem juntos na lista de recursos dos planos — [PopGás – Planos](https://www.popgas.com.br/planos)
- ControlGás: "Acerto financeiro p/ Entregador" é função do Tele‑Atendimento; **os pedidos não geram lançamento financeiro sozinhos** — depois de entregue, cada pedido passa pelo acerto com o entregador, feito **no fim do turno ou a cada venda acertada**; o manual tem um passo numerado só para isso ("10º Passo") — [Wiki ControlGás – Tele‑Atendimento](https://wiki.controlgas.com.br/Tele-Atendimento)
- GasNow / integração VenderGás: fechamento de caixa com o **acerto de cada entregador**, conferido **contra os comprovantes e por forma de pagamento** — [GasNow Revenda](https://gasnow.com.br/revenda)
- Depo (projeto aberto para distribuidoras de água e gás): acerto de caixa de cada entregador; **quem fecha o acerto é o caixa ou o dono, não o entregador**; estoque separa **cheios, vazios e avariados, na loja e com cada entregador**; o motivo declarado do sistema: quando o dinheiro do dia não bate, é difícil saber se faltou uma entrega, um troco ou um botijão — [GitHub – Solace‑Inc‑Team/depo](https://github.com/Solace-Inc-Team/depo)
- Solutio Gás: fechamento de caixa por entregador — [Solutio Gás](https://solutiogas.com.br/)
- Gas Expert: fluxo de caixa **por usuário** para conferir o valor de cada operador no fim do dia; relatório de **comissões** — [Gas Expert 2014](https://www.maikonlyne.com.br/pagina/Gas-Expert-Plus-2014); [Maikonlyne – Funções do sistema](https://www.maikonlyne.com.br/pagina/funcoes)

### Inferences
- O acerto tem **duas contas que precisam fechar ao mesmo tempo**: a do dinheiro (o que vendeu × o que entregou ao caixa, por forma de pagamento, menos despesas) e a dos vasilhames (o que saiu cheio × o que voltou cheio + vazio). A fonte que explicita as duas juntas é o Depo; PopGás liga acerto a carregamentos.
- **Recomendação (minha, não observada) — tela de acerto:** cabeçalho com entregador, data e veículo. Dois blocos lado a lado. **Bloco "Botijões"**: tabela por produto (e marca) com colunas Saiu cheio · Vendido · Voltou cheio · Voltou vazio · Diferença (diferença ≠ 0 em vermelho). **Bloco "Dinheiro"**: linhas Dinheiro · Pix · Cartão · Fiado/a prazo · Vale‑gás, com colunas Esperado (calculado) · Informado (campo para digitar) · Diferença; abaixo, Despesas e Troco inicial. Rodapé com "Total a entregar ao caixa" em número grande e botões "Fechar acerto" (exige que a diferença seja zero ou uma justificativa escrita) e "Imprimir/Enviar comprovante". Lista expansível dos pedidos do dia para conferência linha a linha.
- **Recomendação (minha):** só o caixa/dono fecha o acerto (regra do Depo); o entregador vê uma prévia no celular para chegar com o valor certo.

### Gaps
- **Nenhuma descrição visual** da tela de acerto foi encontrada (campos exatos, ordem, cores).
- Não achei evidência de como os sistemas tratam **diferença/quebra de caixa** (desconto do entregador, justificativa, aprovação).
- Não consegui abrir o README do Depo nem o passo a passo do wiki do ControlGás para detalhes.

---

## 5. Tela de estoque de botijões cheios/vazios por marca; indicadores e gráficos do painel inicial (vendas por dia, por entregador, por bairro, tempo médio de entrega, previsão de recompra)

### Takeaway
O estoque nos sistemas de gás é sempre **em duas ou três situações (cheio, vazio, avariado) e por local (depósito/filial, veículo/entregador, cliente em comodato)**; controle **por marca** aparece em norma fiscal estadual, mas não achei descrição dessa tela em nenhum software. O painel mais detalhado em texto é o da GasNow (faturamento, pedidos, botijões, ticket médio, origem dos pedidos, tempos por etapa com P50/P90 e tempo ocioso por entregador); ahgas e Gas Expert documentam **previsão de consumo/recompra** e ahgas o **mapa de calor**.

### Cited Findings

**Estoque / vasilhames**
- ControlGás: controla volumes **cheios, vazios e danificados**, com **estoque separado por filial** — [ControlGás](https://controlgas.com.br/)
- DistribuidorPRO: controle de **cheios e vazios** (P13, P45), **cascos em comodato**, rotas, app do entregador e PDV balcão — [DistribuidorPRO](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- Depo: cheios, vazios e avariados, **na loja e com cada entregador** — [GitHub – depo](https://github.com/Solace-Inc-Team/depo)
- PopGás: tela de **carregamentos** dos veículos (seleção de veículo e produtos), **transferências**, reposição de vasilhames; no plano superior, múltiplos depósitos e estoque por lote — [PopGás – Revendas de gás](https://www.popgas.com.br/recursos/revendas-de-gas); [PopGás – Planos](https://www.popgas.com.br/planos)
- GasNow: estoque do carro visível no app; filtro de produto com as situações **líquido, completo e vazio** (além de P13, P45) — [GasNow Revenda](https://gasnow.com.br/revenda)
- Gas Expert: lançamento de **empréstimos/comodatos** de vasilhames, com **baixa parcial** conforme a devolução (movimento "E‑Devolução / A Retirar"); o relatório de empréstimos mostra quem está com os vasilhames, totais emprestados e devolvidos e **dias desde a última compra** — [Maikonlyne – Empréstimos/Comodatos](https://www.maikonlyne.com.br/pagina/emprestimos)
- GestGAS: botijas, água mineral e acessórios com categorização — [GestGAS](https://gestgas.com/)
- Vendergás: movimentações de estoque acompanhadas à distância e reposição programada — [Sistema Vendergás](https://sistemavendergas.com.br/)
- BITTWork: botijões cheios e vazios, comodatos e trocas; CFOPs próprios para remessa de cheio e retorno de vazio — [BITTWork](https://bittwork.com/)
- Contexto legal: norma de Sergipe (1997) aprova formulários de "Controle Diário do Saldo de Vasilhames **por Marca**" e consolidações semanal e mensal — [LegisWeb – Decreto SE](https://www.legisweb.com.br/legislacao/?id=164431)
- Bom Saldo (ERP genérico): para separar cheio e vazio, sugere cadastrar como **itens diferentes** — [Bom Saldo](https://bomsaldo.com.br/software-de-gestao-empresarial-para-deposito-de-gas/)

**Painel / indicadores**
- GasNow: indicadores de **faturamento, pedidos, botijões e ticket médio**; painel de **fonte dos pedidos** (WhatsApp, ligação, portaria, apps, Google Ads, site) com evolução **diária, mensal ou trimestral**, em faturamento ou em pedidos — [GasNow Revenda](https://gasnow.com.br/revenda)
- GasNow: por entregador — **entregas, valor e botijões**, mais o **tempo de cada etapa**, com **P50, P90 e tempo ocioso**; exemplo publicado: 1.702 pedidos no mês, 346 atendidos pela IA no WhatsApp (uma revenda, agosto de 2026) — [GasNow Revenda](https://gasnow.com.br/revenda)
- ahgas: **mapa de calor** da região, **previsão de consumo de cada cliente** (para antecipar pedidos), desempenho de vendedores e entregadores, otimização de rotas — [ahgas](https://ahgas.com.br/)
- Solutio Gás: dashboard "com as principais informações da revenda"; **mapa de venda por rua**; relatórios de vendas realizadas, consignadas e antecipadas; painel financeiro com indicadores — [Solutio Gás](https://solutiogas.com.br/); [Solutio – Módulo Gerencial](https://solutiogas.com.br/o-solutio-gas/modulo-gerencial/)
- RevGás: **caixa em tempo real** (tudo que entrou e saiu); relatórios de vendas, estoque e desempenho dos entregadores — [RevGás](https://revgas.com/)
- Gas Expert: relatórios incluem **previsão de vendas**, estoque diário, ligações, comissões e ANP/MCMM — [Maikonlyne – Funções do sistema](https://www.maikonlyne.com.br/pagina/funcoes)
- LPGSoft (Índia): painel com reservas/pedidos, níveis de estoque e entregas em trânsito — [LPGSoft (dev.to)](https://dev.to/lpgsoft/cloud-based-lpg-management-software-for-modern-gas-agencies-11ff)
- Gasista: painel administrativo para acompanhar desempenho dos entregadores, atribuir entregas, gerir estoque e KPIs — [Royex – Gasista](https://www.royex.ae/case-studies/gasista/)

### Inferences
- "Líquido / completo / vazio" (GasNow) corresponde a três produtos de venda: **só a carga (troca)**, **botijão completo (casco + gás)** e **casco vazio** — a tabela de preços e o estoque precisam das três linhas por tamanho.
- A previsão de recompra existe em pelo menos dois produtos (ahgas: por cliente; Gas Expert: "previsão de vendas" e "dias desde a última compra"), mas **nenhum descreve como ela aparece na tela**.
- **Recomendação (minha, não observada) — tela de estoque:** matriz com **linhas = produto e marca** (P13 Ultragaz, P13 Supergasbras, P45…, água 20 L) e **colunas = Cheio · Vazio · Avariado · Em comodato com clientes · Total**; abas ou filtro por **local** (Depósito, cada veículo, cada filial). Células com alerta visual quando o cheio está abaixo do mínimo. Botões "Carregar veículo", "Descarregar", "Compra/entrada", "Troca com a distribuidora", "Ajuste".
- **Recomendação (minha) — painel inicial:** linha de cartões (Faturamento hoje · Pedidos hoje · Botijões vendidos · Ticket médio · Tempo médio de entrega · Pedidos em aberto agora), cada um com comparação com ontem/mesma data da semana anterior; gráfico de barras "vendas por dia" (7/30 dias); barras horizontais "por entregador" (entregas, valor, tempo médio); ranking "por bairro" + mapa de calor; rosca/barras "origem dos pedidos" (telefone, WhatsApp, portaria, app); lista "Clientes para ligar hoje" (previsão de recompra) com botão de WhatsApp. Usar mediana e P90 do tempo de entrega (como a GasNow), não só a média.

### Gaps
- **Não achei evidência de tela de estoque por marca** em nenhum software (só a exigência fiscal estadual antiga).
- Não achei evidência de gráfico de **vendas por bairro** (só "por rua" no Solutio e mapa de calor no ahgas) nem de **tempo médio de entrega** como cartão de painel (a GasNow fala em tempo por etapa com P50/P90).
- Tipos de gráfico, cores e disposição dos painéis não foram confirmados (não vi as imagens).

---

## 6. Ficha do cliente, tabela de preços, caixa e relatórios

### Takeaway
A evidência mais concreta vem do Gas Expert (lista de cadastros, tela de tabela de preços com atualização em massa e preço mínimo protegido por senha, caixa por usuário, lista de relatórios) e do BS Gestão (comodatos, vale‑gás, vendas antecipadas, conciliação bancária, 70+ relatórios). Descrições visuais dessas telas não foram encontradas.

### Cited Findings
- Gas Expert — cadastros: clientes, funcionários, veículos, fornecedores, produtos, **tabela de preços**, **grupos de clientes**, centros de custo, cidades, **caixas** e **formas de pagamento**; menus separados de Cadastros, Movimentos e Financeiro — [Maikonlyne – Funções do sistema](https://www.maikonlyne.com.br/pagina/funcoes); [Maikonlyne – Conhecendo melhor o sistema](https://www.maikonlyne.com.br/pagina/Conhecendo-melhor-o-sistema:)
- Gas Expert 2014 — nova tela de **tabela de preços**: atualização automática de todos os preços de um produto; **bloqueio de valor mínimo de venda** sem senha do administrador; **fluxo de caixa por usuário** — [Gas Expert 2014](https://www.maikonlyne.com.br/pagina/Gas-Expert-Plus-2014)
- Gas Expert — relatórios: contas pagas, recibos, ligações, vendas, estoque diário, ANP/MCMM, comissões, previsão de vendas, empréstimos — [Maikonlyne – Funções do sistema](https://www.maikonlyne.com.br/pagina/funcoes); [Maikonlyne – Empréstimos](https://www.maikonlyne.com.br/pagina/emprestimos)
- Gas Expert — a ficha do cliente é editável **de dentro da tela de pedido**, junto com o histórico — [Gas Expert 2025 (anúncio)](https://www.mercadolivre.com.br/gas-expert-2025-sistema-gas-e-agua-maikonlyne/up/MLBU2795935005)
- Gas Expert — envio de SMS ao cliente a partir do pedido — [Maikonlyne – SMS](https://www.maikonlyne.com.br/pagina/sms)
- BS Gestão: cadastro de clientes, estoque, **comodatos**, **vale‑gás**, **vendas antecipadas**, contas a pagar/receber, **controle bancário conciliado**, do atendimento por bina até o **fechamento de caixa**; "mais de 70 relatórios" — [BS Gestão](https://brazilsistem.com.br/bs-gestao/)
- ahgas: **preços especiais por cliente**, emissão de boletos, agendamento — [ahgas](https://ahgas.com.br/)
- ControlGás: módulo de controle de **vale‑gás**; financeiro, estoque, vendas e NF‑e — [Magnasys – ControlGás](https://magnasys.com.br/controlgas/)
- GestGAS PDV: vendas no balcão, entregas, estoque, clientes e **caixa** num só lugar; endereço próprio por loja (`sualoja.gestgas.com`) — [GestGAS PDV](https://pdv.gestgas.com/relatorios); [GestGAS](https://gestgas.com/)
- Vendergás: "mais de 50 relatórios"; NFC‑e/NF‑e/CT‑e — [Sistema Vendergás](https://sistemavendergas.com.br/)
- GDS: relatórios gerenciais, conciliação bancária, DRE e integração contábil — [GDS](https://gdssolucoes.com.br/)
- xGás: cadastro de clientes e produtos, vendas entrega e vendas balcão, impressão em **impressora de 58 mm** — [xGás](https://xgas.com.br/)
- PopGás: cadastro de clientes/CRM, várias formas de pagamento, estoque e financeiro já no plano de entrada — [PopGás – Planos](https://www.popgas.com.br/planos)

### Inferences
- Itens próprios do ramo que a ficha do cliente precisa mostrar (deduzido dos módulos citados): **cascos em comodato/emprestados**, **vales‑gás e vendas antecipadas em aberto**, **tabela/preço especial**, **dias desde a última compra** e saldo a receber.
- **Recomendação (minha, não observada) — ficha do cliente:** cabeçalho com nome, telefones (com ícone de WhatsApp), endereço + ponto de referência + bairro + mini‑mapa; faixa de "pendências" (fiado, cascos emprestados, vales); abas Histórico de pedidos · Financeiro · Comodatos · Observações. Indicador "compra a cada ~N dias · próxima prevista em DD/MM".
- **Recomendação (minha) — tabela de preços:** grade produto × forma de venda (entrega, portaria/retirada) × forma de pagamento (dinheiro/Pix, cartão, a prazo), com colunas para "só a carga", "completo" e "casco"; ação "reajustar todos em R$ / %" (como a atualização automática do Gas Expert); preço mínimo com cadeado (senha do gerente para vender abaixo).
- **Recomendação (minha) — caixa:** abertura com troco inicial; movimentos do dia agrupados por forma de pagamento; entradas vindas dos acertos de entregadores identificadas; sangria/suprimento; fechamento com contagem e diferença.

### Gaps
- Nenhuma descrição visual (posição de campos, cores) dessas telas foi encontrada.
- Não achei lista completa de campos da ficha do cliente em nenhum fabricante.
- Não foi possível conferir os "70+" e "50+" relatórios nominalmente.

---

## 7. Aplicativos para o consumidor (Chama, Ultragaz, Supergasbras, Appgas, Preço do Gás etc.): fluxo e telas

### Takeaway
O fluxo comum é curto: **endereço/localização → escolher revenda ou produto (com preço e tempo de entrega) → quantidade → pagamento (no app ou na entrega) → acompanhar status**, com extras como chat com a revenda, agendamento, lembrete de recompra por número de dias e vale‑gás. Marketplaces (Chama, Preço do Gás) acrescentam comparação de preço entre revendas e a etapa em que a revenda aceita ou recusa o pedido.

### Cited Findings
- Chama: informa o endereço e o app lista as revendas da região com **preço e tempo de entrega**; só revendas registradas na ANP; sem taxa de serviço; pagamento na entrega (dinheiro, débito, crédito) ou no app com cartão de crédito; acompanhamento da entrega — [Canaltech](https://canaltech.com.br/apps/gas-de-cozinha-mais-proximo-aplicativo/); [Aptoide – Chama](https://chama.br.aptoide.com/app) (fontes de terceiros e antigas; podem estar desatualizadas)
- Preço do Gás: comparação de preços e avaliação dos usuários; a revenda recebe o pedido e **aceita ou recusa** (aviso por app, e‑mail e alerta no sistema); se recusa, a equipe procura outra revenda e o app notifica o cliente, que pode aceitar ou recusar a troca; a revenda paga taxa por botijão entregue (R$ 8,40 segundo o site) — [Preço do Gás – seja revendedor](https://www.precodogas.com.br/revendedor-seja.html); [App Store – Preço do Gas Revendedor](https://apps.apple.com/br/app/pre%C3%A7o-do-gas-revendedor/id1557593782); [JB](https://www.jb.com.br/economia/marcas/2022/10/1040264-aplicativo-preco-do-gas-forma-facil-de-comprar-gas-de-cozinha.html); [Reclame Aqui – resposta da empresa](https://www.reclameaqui.com.br/preco-do-gas/app-da-enganacao_zgcrd7GYXpwrF5Do/)
- Supergasbras "Pedir Gás": acompanhar o **status do pedido em tempo real**, **chat direto com a revenda**, só revendas autorizadas, cupom de primeira compra; também atende por WhatsApp (0800 591 2591); ~27,3 mil avaliações na Play Store — [Google Play – Pedir Gás](https://play.google.com/store/apps/details?id=com.supergasbras.app&hl=en_US); [Supergasbras – comprar](https://comprar.supergasbras.com.br/)
- Ultragaz: escolher **tipo de botijão e quantidade**, confirmar endereço, pagar **no app, na entrega ou com Vale‑Gás**, **agendar** a entrega, acompanhar o status; **lembrete de recompra** baseado em número de dias configurado pelo usuário — [Ultragaz – app](https://www.ultragaz.com.br/gas/app/); [App Store – Ultragaz](https://apps.apple.com/us/app/ultragaz-pe%C3%A7a-botij%C3%A3o/id1492200817); [Ultragaz – gás pelo celular](https://www.ultragaz.com.br/gas-pelo-celular-como-o-app-da-ultragaz-agiliza-a-compra-de-botijoes/)
- Ultragaz Vale‑Gás: código de autorização de **7 dígitos** informado no pedido; troca exige casco vazio de qualquer marca — [Ultragaz – Vale gás](https://www.ultragaz.com.br/gas/vale-gas/)
- Ultragaz pelo WhatsApp: menu "Pedir gás" → escolher e confirmar endereço → opções de botijão com preço — [Ultragaz – pedir pelo WhatsApp](https://www.ultragaz.com.br/como-pedir-gas-pelo-whatsapp-ultragaz/)
- Appgas (consumidor): app "Gás com frete grátis"; par com o Appgas Entregador — [Google Play – Appgas](https://play.google.com/store/apps/details?id=br.com.mobile2you.appgas.costumer&hl=en_US)
- PopGas (consumidor): pedir o botijão e acompanhar a entrega — [Google Play – PopGas Entrega de Gás](https://play.google.com/store/apps/details?id=br.com.ubergaz.app)
- GasXpress (Sri Lanka, estudo de caso de UX): a tela de entrega é centrada na **localização ao vivo do entregador e no estado atual do pedido**, porque o problema central era o cliente não saber quando o botijão chegaria — [GasXpress UX Case Study](https://reshikafernando.com/gasxpress-ux-case-study/)
- Gasista: app do cliente com rastreio em tempo real, chat, notificações e avaliação — [Royex – Gasista](https://www.royex.ae/case-studies/gasista/)
- Conceitos de design: "Gas Up" (Behance, 2021) cobre identidade e UI de dois apps (cliente e entregador); há um kit Figma "Gas Cylinder Booking" — [Behance – Gas Up](https://www.behance.net/gallery/121688109/Gas-Up-LPG-Gas-Delivery-App-Design-Branding); [Figma Community](https://www.figma.com/community/file/1607127147238722992/gas-cylinder-booking-fuel-station-finder-app-ui-mobile-app-design-figma)

### Inferences
- Para um depósito próprio, o equivalente mais barato a um app é um **link/catálogo web + WhatsApp** (PopGás, PedeGás, GasNow e ChatGas vendem atendimento por IA no WhatsApp — [PopGás – Tech & IA](https://www.popgas.com.br/recursos/tech-ia); [PedeGás](https://pedegas.com/); [GasNow](https://gasnow.com.br/revenda)).
- **Recomendação (minha, não observada) — página de pedido do cliente:** uma tela só: endereço lembrado, botões grandes dos produtos com preço, quantidade, "tenho o casco vazio? sim/não", forma de pagamento, "troco para", botão "Pedir". Depois, tela de acompanhamento com 4 passos (Recebido → Saiu para entrega → Chegando → Entregue), nome do entregador e previsão em minutos.

### Gaps
- Não vi as capturas de tela das lojas de apps; a ordem exata das telas e o visual não foram confirmados.
- As fontes sobre o Chama são antigas/de terceiros; não confirmei o estado atual do app em 2026.
- Não abri os projetos do Behance/Figma/Dribbble (só títulos); nenhum resultado do Dribbble foi retornado.

---

## 8. Padrões gerais de UX: tema claro/escuro, botões grandes, alertas sonoros, modo TV, responsividade, uso por pessoas com pouca familiaridade com tecnologia

### Takeaway
Há evidência de **alerta sonoro para pedido novo**, **operação por teclado**, **avisos automáticos por WhatsApp ao cliente**, **funcionamento sem internet/sem sinal** e **acesso pelo navegador sem instalar**; **não encontrei evidência de tema escuro, de modo TV/painel de parede nem de recursos de acessibilidade** em nenhum sistema de gás brasileiro.

### Cited Findings
- Som: Appgas Entregador acrescentou **alerta sonoro para pedidos** e push (v2.2.1, nov/2025) — [App Store – Appgas Entregador](https://apps.apple.com/br/app/appgas-entregador/id1505557035)
- Som (comparável): no Gestor de Pedidos do iFood o alerta é ligado em Ajustes › Alertas de som; dá para ter **sons diferentes para novo pedido, pedido atrasado e entregador chegando** — [iFood – Notificação sonora](https://blog-parceiros.ifood.com.br/notificacao-sonora/)
- Aparência: no Gas Expert, "skins" mudam a aparência e as cores das janelas — [Maikonlyne – Gas Expert (produto)](https://www.maikonlyne.com.br/produto/2724/gas-expert-2017-software-disk-gas,-agua-e-bebidas)
- Teclado: atalhos F1–F7, F10, F12, Ctrl+C/S/E, setas e Esc na lista de pedidos — [Gas Expert 2013](https://www.maikonlyne.com.br/pagina/Gasexpert-Plus-2013); [Tele Expert](https://www.maikonlyne.com.br/pagina/Tele-Expert)
- Não roubar o foco do operador: "foco inteligente" da bina — [Tele Expert](https://www.maikonlyne.com.br/pagina/Tele-Expert)
- Sem internet: ControlGás é desktop e funciona **sem depender de internet**; ControlPlus é a versão em nuvem; ambos têm apps móveis — [Magnasys – Desktop x Nuvem](https://magnasys.com.br/desktop-x-nuvem/)
- Sem internet: xGás roda em rede local em qualquer Windows — [xGás](https://xgas.com.br/)
- Sinal fraco: fluxos do app do entregador do Cylin são tolerantes a ficar offline — [Cylin](https://cylin.com.pk/newsroom/driver-app-launch)
- Navegador: Vendergás roda no navegador, sem instalação — [Sistema Vendergás](https://sistemavendergas.com.br/)
- WhatsApp ao cliente em cada etapa: Brazil Sistem (saiu para entrega / concluído) e PopGás (pagamento, saída, entrega, cancelamento) — [Brazil Sistem](https://brazilsistem.com.br/); [PopGás – Essencial](https://www.popgas.com.br/recursos/essencial)
- IA no WhatsApp montando o pedido e despachando: GasNow, PopGás, ahgas ("Binho"); Solutio anuncia para a próxima versão — [GasNow](https://gasnow.com.br/revenda); [PopGás – Tech & IA](https://www.popgas.com.br/recursos/tech-ia); [ahgas](https://ahgas.com.br/); [Solutio – IA](https://solutiogas.com.br/2026/08/19/o-futuro-da-revenda-de-gas-como-a-inteligencia-artificial-esta-transformando-o-atendimento-e-as-vendas-de-glp/)
- Contagem de pendentes no título da janela e destaque de pendentes há 5 min+ (gestor de pedidos próprio, não é de gás) — [GitHub – barbacue PR #3](https://github.com/marlonmfa/barbacue/pull/3)
- Segurança como informação sempre visível: no Cylin "toda tela mostra o estado de segurança" (botijão e entregador com verificação) — [Cylin – sobre](https://cylin.com.pk/about)

### Inferences
- O público operador (atendente de disk gás, entregador) trabalha com pressa e muitas vezes ao telefone: os fabricantes insistem em **menos passos** ("com um clique", "sem ligar para a central", "na mesma tela").
- **Recomendações (minhas, não observadas):**
  - Tema **claro por padrão** e opção de **tema escuro de alto contraste** para o painel na TV e para o app do entregador à noite; cor nunca sozinha — sempre com ícone ou palavra.
  - **Modo TV** do painel de entregas: tela cheia, sem menus, letras grandes, só colunas "Aguardando / Em rota / Atrasados" + cartões-resumo, atualização automática.
  - Sons distintos e curtos: pedido novo, pedido atrasado, ligação entrando (como a opção do iFood), com volume e "silenciar por 10 min".
  - Botões principais grandes, com **verbo + atalho** escritos ("Despachar (F6)"); no máximo uma ação principal colorida por tela.
  - Linguagem do ramo e simples: "cheio", "vazio", "casco", "troca", "completo", "fiado", "troco para".
  - Celular primeiro para dono e entregador; computador para atendimento/caixa; mesma tela se adaptando.
  - Tudo que for digitado com frequência deve ter valor padrão (1 × P13, dinheiro, sem troco) e confirmação com Enter.

### Gaps
- **Sem evidência** de tema escuro, modo TV/wallboard ou recursos de acessibilidade em sistemas de gás.
- Sem evidência visual de tamanhos de botão, fontes ou responsividade real dos produtos.

---

## 9. De que problemas de UX os usuários reclamam nas avaliações?

### Takeaway
As reclamações encontradas são de **consumidores** dos apps das distribuidoras e marketplaces: status que não reflete a realidade (marcado "entregue" sem entregar, ou preso em "recebido" por quase 24 h), preço no app diferente do telefone sem aviso, troca de revenda/marca depois do pedido e versão nova do app que parou de funcionar. **Não encontrei avaliações independentes de usuários dos sistemas de gestão** (PopGás, RevGás, Gas Expert etc.).

### Cited Findings
- Ultragaz (2023): pedido urgente ficou **quase 24 h com status "recebido"** sem entrega; a empresa admitiu "problema sistêmico" — [Reclame Aqui](https://www.reclameaqui.com.br/ultragaz/pedido-de-gas-pelo-app-da-ultragaz-nao-e-confiavel-quase-24h-esperando_PTxizUj9UYBWOLbi/)
- Ultragaz (2025): status mudou para **"entregue"** sem o gás ter chegado — [Reclame Aqui](https://www.reclameaqui.com.br/ultragaz/compra-de-gas-pelo-app_amjTkcp2v1s2nFrD/)
- Ultragaz: preço no app cerca de **20% maior** que por telefone, sem aviso — [Reclame Aqui](https://www.reclameaqui.com.br/ultragaz/paguei-20-mais-caro-pedindo-pelo-aplicativo_Jg5wf3U5Ozlpy1h_/)
- Supergasbras / app Chama Gás (2020): pedido marcado como entregue sem entrega; valor da entrega subiu em seguida — [Reclame Aqui](https://www.reclameaqui.com.br/supergasbras/app-chama-gas-entrega-nao-realizada_zFQhCUJyBHzH250C/)
- Supergasbras "Pedir Gás": avaliação na Play Store dizendo que **a versão nova não funciona e a antiga funcionava bem** — [Google Play – Pedir Gás](https://play.google.com/store/apps/details?id=com.supergasbras.app&hl=en_US)
- Preço do Gás: 23 reclamações na página (66,7% resolvidas segundo o site); queixas de **atraso**, mau atendimento do entregador e **marca entregue diferente da pedida** após troca de revenda — [Reclame Aqui – lista](https://www.reclameaqui.com.br/empresa/preco-do-gas/lista-reclamacoes/); [Reclame Aqui – caso](https://www.reclameaqui.com.br/preco-do-gas/app-da-enganacao_zgcrd7GYXpwrF5Do/)
- GasXpress (entrevistas do estudo de caso): clientes não sabiam **quando** o botijão chegaria nem **onde** estava o entregador; a loja não dava prazo claro — [GasXpress UX Case Study](https://reshikafernando.com/gasxpress-ux-case-study/)
- Dores do lado da revenda citadas por fabricantes: entregador tinha de **estacionar para anotar o pedido por telefone** — [BS Entregador](https://brazilsistem.com.br/aplicativos/aplicativo-bs-entregador/); quando o dinheiro do dia não bate, não se sabe se faltou entrega, troco ou botijão — [GitHub – depo](https://github.com/Solace-Inc-Team/depo)

### Inferences
- O erro mais danoso é o **status falso**: "entregue" deve exigir uma ação real do entregador no local (e, idealmente, confirmação do cliente), e pedido parado deve gerar alerta para a central antes de o cliente reclamar.
- **Recomendações (minhas, não observadas):** mostrar o **preço final antes de confirmar** e o mesmo preço em todos os canais (ou avisar a diferença); alerta automático de "pedido sem movimento há X minutos"; nunca trocar marca/produto sem confirmação do cliente; ao lançar tela nova, manter a antiga disponível por um tempo; no acerto, apontar exatamente **qual pedido** causa a diferença.

### Gaps
- Sem avaliações independentes de usuários dos **sistemas de gestão** e dos **apps de entregador** (as listagens retornadas não traziam o texto das avaliações; B2B Stack só trouxe dados cadastrais do "Gestor Disk Entrega" — [B2B Stack](https://www.b2bstack.com.br/compare/gestor-disk-entrega-vs-sischef)).
- As reclamações são casos isolados do Reclame Aqui — não dá para medir frequência.
- A página "ULTRA GAS" do Reclame Aqui (não verificada) pode não ser a Ultragaz e não foi usada — [Reclame Aqui – Ultra Gas](https://www.reclameaqui.com.br/empresa/ultra-gas/).
