# Telas reais: ahgas e Vendergás (visto em novembro de 2026)

Como ler estas notas:
- **[lido direto]** = eu abri a página ou a imagem nesta sessão (24/11/2026) e li/vi o conteúdo.
- **[resumo de busca]** = não usado nestas notas (não fiz nenhuma busca na web; tudo veio das páginas abertas direto).
- **[inferência]** = conclusão minha a partir do que vi; não está escrito na página.
- Cores em hexadecimal são **aproximações a olho** (as imagens são fotos de monitor, vídeos comprimidos ou maquetes inclinadas).
- As capturas ficaram só na pasta temporária `/tmp/claude-0/-home-user-Jb-gestao-/8e9001e3-ac32-5afb-91ab-506f80bf0618/scratchpad/telas/ahgas_vendergas/` (nada foi copiado para o repositório).

Resumo do que foi possível ver:

| Fornecedor | Telas do sistema web (escritório) | Telas de aplicativo | Total de imagens de tela vistas |
|---|---|---|---|
| Vendergás | 9 telas diferentes (maquetes do site + quadros do vídeo de fundo da página inicial) | 2 (app do consumidor; maquininha na mão do entregador, ilegível) | 13 imagens |
| ahgas | **nenhuma** (o site não publica nenhuma captura do sistema; o login fica em outro endereço, bloqueado nesta sessão) | 16 capturas (4 do app do entregador + 12 de apps do consumidor, na Google Play) | 16 imagens |

---

## 1. Vendergás: como são as telas do sistema?

### Takeaway
O Vendergás é um sistema web de fundo branco com uma faixa azul-marinho no topo (menu horizontal de ícones com legenda) e verde-água como cor de destaque. A tela central é um **quadro de pedidos em colunas coloridas por situação** (tipo kanban), com cartões de pedido que trazem cliente, etiqueta de situação, valor, telefone, entregador, hora e tempo decorrido, mais uma fileira de botõezinhos de ação. Não há preços publicados.

### Cited Findings

#### 1.1 Estrutura comum a todas as telas (casca do sistema)
Vista em todas as imagens abaixo. [lido direto]
- **Faixa 1 (bem fina, no topo):** verde-água (~#3DD6B5), sem conteúdo legível; parece faixa de aviso/ambiente.
- **Faixa 2 (menu principal):** azul-marinho (~#14146E), ícones brancos de traço fino com legenda embaixo, lado a lado. Itens lidos, na ordem: logotipo · **Teleatendimento** · **Repassar Pedido** (com um contador pequeno em verde-água, "0") · **Pedidos** · (linha vertical separadora) · **Pedido Portaria** · **Cadastrar** (ícone "+") · **Financeiro** (ícone "$") · **Fechamento de Caixa** (ícone caixa com visto) · **Relatórios** (ícone de controles deslizantes) · **Estoque** · **Vendas** (carrinho) · **Dashboard** (relógio/pizza) · **Gestão** · um ícone amarelo de grupo de pessoas · um triângulo amarelo de alerta · "Indique e ganhe" · à direita, "Tutorial"/perfil. O item ativo fica em verde-água.
- **Faixa 3 (barra de ferramentas):** também azul-marinho, separada por uma linha fina. À esquerda, ícones pequenos em verde-água separados por barrinhas verticais: seta/avião de papel, atualizar, código QR, fone de ouvido, lupa e um "›" seguido do **título da tela** (ex.: "Pagamentos Gerados", "Relatório de Previsão de Compras por Cliente"). À direita: **etiquetas arredondadas verde-água com o nome de cada loja selecionada e um "x" vermelho para remover** (ex.: quatro lojas lado a lado), um "+" para adicionar loja, intervalo de datas (duas datas sublinhadas com "APLICAR" em laranja) e botão "FILTRAR" verde-água.
- **Rodapé:** faixa azul-marinho com versão do sistema à esquerda ("... VENDERGÁS | v1.0.1042 (1205)"), botão azul arredondado "Novidades" e uma **barra verde larga "MINHAS FATURAS"** no centro; links "Sobre · Privacidade · Contato" à direita.
- **Tipografia:** letra sem serifa arredondada (parece Poppins), títulos em negrito; menu em corpo pequeno. **Densidade:** média para baixa (cartões e botões grandes, muito espaço em branco).
- Fonte: maquetes e vídeo da página inicial — [Vendergás](https://vendergas.com.br/), imagens [laptop-sistema](https://vendergas.com.br/laptop-sistema.8ad06879.webp), [laptop-celular](https://vendergas.com.br/laptop-celular.cc06c9c9.webp) e vídeo [hero-bg](https://vendergas.com.br/hero-bg.4af6208a.mp4)

#### 1.2 Tela inicial (atalhos)
- Para que serve: página de entrada com atalhos grandes. [lido direto]
- Layout: área branca com **9 blocos quadrados azul-marinho**, ícone branco em cima e nome em negrito embaixo, em duas fileiras centralizadas (6 + 3). Nomes lidos: **Rastrear Entregador · Mapa Leads · Aumente suas vendas · Caixa · Preço Médio · Quadro de Pedidos · Aplicativo para máquina de cartão · Certificado Digital · Recebimento de PIX**. Cinco deles trazem uma etiqueta branca com texto vermelho "NOVIDADE!" no canto superior direito.
- Feita para: mouse ou toque (alvos de ~130 px).
- Ponto forte: nomes em linguagem do dia a dia; etiqueta "NOVIDADE!" ensina recursos novos sem manual. Ponto fraco: mistura atalhos de trabalho (Caixa, Quadro de Pedidos) com propaganda de adicionais (Certificado Digital, PIX, máquina de cartão); não mostra nenhum número do dia.
- Fonte: [imagem laptop-sistema](https://vendergas.com.br/laptop-sistema.8ad06879.webp), na página [Vendergás](https://vendergas.com.br/)

#### 1.3 Quadro de Pedidos (a tela mais importante vista)
- Para que serve: acompanhar todos os pedidos do dia por situação e agir sobre cada um. [lido direto]
- Layout: abaixo da casca há uma faixa azul-marinho com uma caixa de seleção **"MARCAR COMO ENTREGUE"** (ação em lote), um botão contornado azul-claro **"Configurar Colunas ▾"** e, à direita, **bolinhas-contador coloridas** com legenda ("13 Em Trânsito" roxa, "25 Entregues" verde, "1 Devolvidos" laranja). Uma etiqueta lilás mostra o total ("44 pedido(s)").
- **Colunas lado a lado, cada uma com cabeçalho de cor cheia, nome em branco negrito e uma pílula mais clara com a quantidade.** Colunas e cores lidas, da esquerda para a direita:
  - (primeira, parcialmente cortada) **laranja** (~#F59E0B) com uma sub-faixa vermelha — provavelmente pendentes/novos [inferência];
  - **Repassados** — azul (~#2196F3), contador 0, com o texto em cinza itálico "Nenhum pedido repassado" quando vazia;
  - **Em Trânsito** — roxo (~#9C27B0), contador 13;
  - **Entregues** — verde (~#4CAF50), contador 25;
  - **Agendados** — marrom (~#795548), contador 3;
  - **Pedidos Entre...** (cortado) — vermelho (~#F44336), contador 13.
- **Cartão de pedido** (branco, cantos arredondados, sombra leve; cartões em atraso ganham **contorno e fundo alaranjado claro**): nome do cliente em maiúsculas negrito à esquerda e "Nº 42237" em cinza à direita; logo abaixo, **etiqueta(s) arredondada(s) de situação** na cor da coluna ("EM TRÂNSITO" roxa, "ENTREGUE" verde, "AGENDADO" marrom) e, quando é o caso, uma segunda etiqueta laranja **"ATRASADO"**; "Valor: R$ 7,00" em negrito; "Tel: 989...." em cinza; **"Entregador: NOME" em azul (parece link)**; data e hora em cinza seguidas do **tempo decorrido entre parênteses em azul** ("(13min)", "(30min)", "(2h atrás)").
- **Ações no pé do cartão:** fileira de botões quadrados pequenos só com ícone, cada um com contorno de uma cor: olho (ver, roxo/azul), seta curva (repassar, verde-água), visto (marcar entregue, azul), documento/nota (vermelho), impressora (azul) e "x" (cancelar, vermelho).
- Cada coluna rola sozinha (barra de rolagem vertical própria).
- Feita para: mouse (botões de ação com ~28 px, pequenos para dedo); nenhum atalho de teclado visível.
- Pontos fortes: situação visível pela cor a metros de distância (serve para TV na parede); tempo decorrido e etiqueta "ATRASADO" no próprio cartão; contadores no topo; filtro por várias lojas ao mesmo tempo; colunas configuráveis. Pontos fracos: botões de ação só com ícone e sem legenda (precisa decorar); o cartão **não mostra produto/quantidade nem endereço/bairro nem forma de pagamento** (só valor); seis cores cheias mais as faixas do topo deixam a tela carregada.
- Fonte: [imagem laptop-celular](https://vendergas.com.br/laptop-celular.cc06c9c9.webp) (endireitada por mim para leitura) e quadros de ~26 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4), na página [Vendergás](https://vendergas.com.br/)

#### 1.4 Rastrear Entregador (mapa)
- Para que serve: ver onde está cada entregador. [lido direto]
- Layout: **mapa de satélite ocupando a tela toda** e um **painel branco à esquerda** (~30% da largura) com título "BUSCAR ENTREGADOR", campo "Procurar", três opções de escolha única **Ativo / Inativo / Todos** (bolinha rosa-avermelhada quando marcada) e uma **lista de entregadores**. Cada item: foto redonda cinza (silhueta), nome em maiúsculas negrito, **endereço atual em duas linhas cinza** e, à direita, **nível de bateria do celular ("63%"), tipo de conexão ("Wi-Fi" ou "4G") e ícones de localização e de ligar/desligar**. Itens fora de foco ficam esmaecidos. Uma setinha "‹" redonda recolhe o painel.
- O endereço da tela, legível na barra do navegador filmada: `app.vendergas.com.br/gestao/rastrear/entregador?standalone=1` — ou seja, **abre em janela própria, sem o menu** (boa para segunda tela/TV).
- Pontos fortes: bateria e conexão do aparelho explicam "por que o entregador sumiu do mapa"; endereço por extenso dispensa saber ler mapa; modo janela separada. Pontos fracos: mapa de satélite é pesado e polui; não vi os pedidos pendentes desenhados no mesmo mapa.
- Fonte: quadros de ~18–24 s do [vídeo da página inicial](https://vendergas.com.br/hero-bg.4af6208a.mp4) — [Vendergás](https://vendergas.com.br/)

#### 1.5 Mapa de calor de vendas
- Para que serve: mostrar em que regiões se vende mais. [lido direto]
- Layout: casca normal + mapa de ruas claro (parece OpenStreetMap) com **manchas de calor** (azul → ciano → verde → amarelo → vermelho) e **pontinhos verdes com borda** para cada venda/cliente; uma legenda/caixa branca semitransparente à direita. Os nomes de bairros lidos indicam região do Distrito Federal (Taguatinga, Vicente Pires, Águas Claras, Guará).
- Ponto forte: leitura imediata. Ponto fraco: vermelho cheio cobre as ruas nas áreas densas; não vi filtro de período na própria área do mapa (o intervalo de datas fica na barra de ferramentas).
- Fonte: quadros de ~4–8 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4); recurso descrito no texto como "Mapa de calor de vendas — Visualize as regiões com maior volume de pedidos" — [Vendergás](https://vendergas.com.br/)

#### 1.6 Relatório de Previsão de Compras por Cliente
- Para que serve: listar clientes com a data provável da próxima compra. [lido direto]
- Layout: título na barra de ferramentas; **bloco de filtros no topo** em 2–3 linhas (campo de busca com lupa, "Data inicial", "Data final", duas caixas de seleção com valor "Todos", outros campos ilegíveis) e dois botões pequenos: **"LIMPAR" vermelho-rosado** e **"BUSCAR" verde-água**. Abaixo, a lista vem **agrupada por loja** (linha de título com a razão social da loja) e depois uma **tabela**.
- Colunas da tabela (lidas com alguma dúvida, a imagem é foto de monitor): **Nº · Nome · Telefone · Endereço Completo · Bairro · Perfil · Produto · Valor do pedido · Dias sem Pedir · Média dos Pedidos · Próxima data de Pedido** · mais duas colunas ilegíveis · coluna de ícones de ação à direita.
- **Linhas inteiras pintadas por situação: verde vivo, azul-claro ou branca.** Não há legenda visível na imagem; pelo contexto parece indicar "no prazo / perto de comprar / sem previsão" [inferência, não confirmado]. Valores lidos na coluna Perfil: "Consumidor final", "Atacado", "SEM PERFIL". Produto lido: "GLP 13 (VENDERGÁS)", "ASSISTÊNCIA TÉCNICA".
- Pontos fortes: a lista já traz telefone e produto, pronta para ligar/mandar mensagem; cor na linha inteira destaca quem está na hora. Pontos fracos: muitas colunas com quebra de linha em cada célula (linhas altas); cor sem legenda.
- Fonte: quadros de ~10–13 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4); recurso descrito no texto como "Previsão de compras — Saiba quando seu cliente vai comprar gás novamente e antecipe suas vendas" — [Vendergás](https://vendergas.com.br/)

#### 1.7 Pagamentos Gerados (lista financeira)
- Para que serve: lista de pagamentos/recebimentos gerados (o menu "Financeiro" está ativo). [lido direto]
- Layout: tabela simples em fundo branco, sem linhas coloridas. Colunas inferidas pelo conteúdo: número · **data e hora em duas linhas** ("11/07/2026" / "14:26") · usuário · **cliente** (em maiúsculas) · duas colunas com **nomes de pessoas** (parecem entregador e quem recebeu/baixou) · **origem** ("Aplicativo" ou "Teleatendimento") · **dois valores em R$** lado a lado (ex.: "R$ 206,00  R$ 206,00"; em algumas linhas os dois diferem, ex.: 107,00 e 120,00).
- Ponto forte: mostra de onde veio o pedido (aplicativo x telefone) e dois valores para conferência. Ponto fraco: nomes de colunas não visíveis no quadro; texto cinza claro, baixo contraste.
- Fonte: quadro de ~34 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4) — [Vendergás](https://vendergas.com.br/)

#### 1.8 Dashboard (painel de indicadores)
- Para que serve: resumo de vendas do período. [lido direto]
- Layout, de cima para baixo:
  1. **Faixa larga verde em degradê** com rótulo pequeno (parece "STATUS DO SISTEMA") e a palavra grande **"Online"**, com uma linha de texto menor embaixo.
  2. **Quatro cartões de número lado a lado, cada um de uma cor:** azul-marinho "PRODUTOS VENDIDOS **724**" (com ícone de dinheiro esmaecido), laranja em degradê "**438**" (pedidos, ícone de carrinho), azul-ciano em degradê "**R$ 84.128,62**" (valor), verde "**46**" (rótulo ilegível).
  3. **Dois painéis azul-marinho com cantos muito arredondados:** "VENDAS POR TIPO DE PAGAMENTO" (lista de formas de pagamento à esquerda — li "crédito", "convênio", "pix", "vale-gás" entre outras — com valor em R$ e quantidade à direita, e um **gráfico de rosca** pequeno no canto) e "VENDAS POR PRODUTO" (mesmo desenho). No pé do painel, o período ("... 00:00 – ... 23:59").
  4. **Quatro gráficos grandes em blocos de cor cheia:** "VENDAS **724**" (fundo azul-marinho, série "Quantidade" em ciano), um bloco laranja, "VALOR DAS VENDAS **R$ 84.128,62**" (fundo ciano/azul em degradê, série "Valor (R$)" em branco) e um bloco verde com "**46**". São gráficos de linha/área muito pontiagudos, dia a dia, com datas inclinadas no eixo. Abaixo de cada gráfico há seletores de **mês e ano** ("Janeiro ▾ 2026 ▾") e de produto ("Todos ▾").
- Pontos fortes: quatro números grandes no topo; quebra por forma de pagamento e por produto; cada gráfico troca de período sozinho. Pontos fracos: **cores cheias demais** (cada bloco de uma cor, texto branco sobre laranja/verde claro tem pouco contraste); gráfico diário com dezenas de picos é difícil de ler; os cartões não comparam com o período anterior.
- Fonte: quadros de ~36–40 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4) — [Vendergás](https://vendergas.com.br/)

#### 1.9 Janela sobreposta ao Quadro de Pedidos (provável lançamento/detalhe de pedido)
- Vi, por cima do quadro, uma **janela grande azul-marinho** ocupando ~75% da tela, dividida em uma área larga à esquerda e uma **coluna estreita à direita com um pequeno formulário**; texto ilegível. [lido direto, baixa nitidez]
- Fonte: quadro de ~30 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4) — [Vendergás](https://vendergas.com.br/)

#### 1.10 Aplicativo do consumidor (com a marca da revenda)
- Para que serve: o cliente final pede gás pelo celular. [lido direto]
- Layout (uma tela vista em maquete e em vídeo): barra superior azul "VENDERGÁS" com menu de três traços; bloco "ENTREGAR PARA" / "SELECIONAR ENDEREÇO DE ENTREGA" com seta redonda verde-água; bloco "EXIBINDO PRODUTOS PARA — BRASÍLIA" com lápis para trocar a cidade; **carrossel de produto**: nome em verde-água itálico negrito "GLP 13 KG (VENDERGÁS)", foto do botijão prateado ao centro, **setas redondas verde-água à esquerda e à direita** e três bolinhas indicadoras; texto "INFORME A QUANTIDADE"; **faixa verde-água com "–  [0]  +"**; no pé, botão largo arredondado verde-água **"FAZER PEDIDO"** sobre fundo roxo-azulado.
- Feita para: toque, uma mão. Ponto forte: um produto por vez, botões enormes, quase sem texto. Ponto fraco: tudo em maiúsculas itálicas; não mostra o preço nesta tela.
- Fonte: [imagem celular-app](https://vendergas.com.br/celular-app.e578d64f.webp) e quadros de ~14–16 s do [vídeo](https://vendergas.com.br/hero-bg.4af6208a.mp4); texto: "Aplicativo exclusivo com identidade da sua revenda tudo integrado ao sistema — Seu cliente pede gás direto pelo app!" — [Vendergás](https://vendergas.com.br/)

#### 1.11 Aplicativo na maquininha (entregador)
- Vi só a foto de um entregador segurando uma **maquininha tipo "smart" com impressora** (bobina saindo por cima). A tela mostra barra azul no topo, **lista de 3 cartões com ícone de botijão azul, nome do produto e preço em negrito** e um botão azul no pé; texto ilegível. [lido direto, baixa nitidez]
- Texto da página: "Nota fiscal na maquininha — Emita nota fiscal na hora da venda: aplicativo integrado à maquininha". Logotipos de maquininhas exibidos (nomes dos arquivos de imagem): Bin, Caixa, Cielo, Getnet, PagSeguro, Rede, SafraPay, Sicredi, Stone, Vero. [lido direto]
- Fonte: [imagem entregador](https://vendergas.com.br/entregador.d273e4f7.webp) — [Vendergás](https://vendergas.com.br/)

#### 1.12 Robô "Maia" e mensagens de WhatsApp
- Não há tela do robô; há **seis balões de mensagem no estilo WhatsApp** (verde-claro ~#DCF8C6, hora e dois vistos azuis) que mostram os avisos automáticos. Textos lidos: "Obrigado pela compra! A empresa agradece a preferência." · "O boleto de pagamento do seu gás vence hoje!" · "Hoje é um dia muito especial! Feliz aniversário para você." · "Seu pedido foi realizado com sucesso! **Gás G13.** Valor: **R$[PREÇO AQUI]**." · "Seu pedido já está em **rota de entrega**." · "Olá! Seu gás está **perto de acabar**!" [lido direto]
- Texto da página: "Maia – Robô assistente — fidelize seus clientes com inteligência artificial · Lembre seu cliente a próxima compra · Fidelize seu cliente e não perca vendas · Confirme os pedidos de seus clientes na hora". [lido direto]
- Fonte: imagens chat-1 a chat-6 (ex.: [chat-4](https://vendergas.com.br/chat-4.34c38a17.webp)) — [Vendergás](https://vendergas.com.br/)

#### 1.13 Recursos e preços lidos direto (Vendergás)
- Soluções listadas: gestão (financeiro, estoque, entregas e vendas), **emissão de CTe/MDFe**, aplicativo do entregador (entregas em tempo real, rotas), suporte, **multi lojas**, mapa de calor de vendas. [lido direto] — [Vendergás](https://vendergas.com.br/)
- Funcionalidades listadas: Fluxo de Caixa · **NFe | NFCe | CTe | MDFe** · Estoque ("inventário direto pelo sistema") · Controle de comodato · Pedidos · **Controle de Vale Gás** (emissão, resgate e saldo) · Financeiro ("Contas a pagar, receber, **fiado** e DRE") · Previsão de compras · Bina ("Identifique chamadas e chame o cliente pelo nome"). [lido direto] — [Vendergás](https://vendergas.com.br/)
- "Atuamos desde 2019 em todo o Brasil". [lido direto] — [Vendergás](https://vendergas.com.br/)
- **Preço: não há nenhum valor na página**; só botões "Quero conhecer o sistema", "Faça uma demonstração gratuita" e formulário (Nome, WhatsApp, CNPJ). [lido direto] — [Vendergás](https://vendergas.com.br/)
- O blog tem só dois artigos (marketing e fidelização), sem telas. [lido direto] — [Blog Vendergás](https://vendergas.com.br/blog.html)

### Inferences
- O menu separa claramente três formas de lançar pedido: **Teleatendimento** (telefone), **Pedido Portaria** (balcão) e **Repassar Pedido** (passar ao entregador), com um contador de pedidos a repassar sempre visível no menu. Isso confirma, pela tela, o que as notas anteriores diziam sobre "área exclusiva para a portaria".
- A coluna "origem" (Aplicativo x Teleatendimento) na lista de pagamentos indica que o canal de entrada do pedido é guardado e exibido.
- As etiquetas de lojas na barra de ferramentas mostram que o "multi lojas" funciona como **filtro global**: escolhe-se uma ou mais lojas e todas as telas passam a mostrar a soma delas.
- O sistema parece pensado para **mouse**, não para teclado: não vi nenhuma dica de atalho em nenhuma tela.

### Gaps
- **Não vi**: a tela de Teleatendimento/lançamento de pedido, o aviso de chamada (bina), Fechamento de Caixa/acerto do entregador, Estoque (cheios e vazios), Cadastro de cliente, tabela de preços, Vale Gás e o aplicativo do entregador. O site só mostra ícones para esses recursos.
- O sistema em si (`app.vendergas.com.br`) não abre nesta sessão (endereço fora da lista liberada).
- Não achei o aplicativo do Vendergás na Google Play pelas buscas da própria loja ("vendergas", "Vendergás", "sistema vendergas"); pode estar com outro nome.
- O outro site citado nas notas anteriores (`sistemavendergas.com.br`) não está liberado; **não conferi** as frases que vieram dele ("mais de 50 relatórios", "relatório de preço médio", "pedidos direto ao celular do entregador com um clique"). O atalho "Preço Médio" na tela inicial é coerente com a segunda.
- Significado exato das cores das linhas no relatório de previsão: sem legenda visível.

---

## 2. ahgas: como são as telas?

### Takeaway
O site da ahgas **não mostra nenhuma tela do sistema de escritório** — só ícones, logotipos e depoimentos. O que dá para ver são os aplicativos publicados na Google Play: o **app do entregador** (lista de cartões de pedido, muito simples, visual Android antigo) e o **app do consumidor com a marca da revenda** (4 passos: endereço → produto → revendedor → finalizar, mais avaliação por estrelas). Os preços estão publicados e batem com as notas anteriores, com dois planos a mais.

### Cited Findings

#### 2.1 App do entregador ("ahgas entregador")
Ficha: nota 3,8 com 79 avaliações, "10 mil+" downloads, atualizado em 13/10/2026, desenvolvedor "ahgas tecnologia". Descrição: "Recebe pedidos, tira automática, traça rota e administra as entregas. Acompanha posição e otimiza rotas diárias". [lido direto] — [Google Play: ahgas entregador](https://play.google.com/store/apps/details?id=com.watermelontecnologia.gasdelivery&hl=pt_BR)

As quatro capturas da loja (datadas de 2019 dentro das próprias telas, ou seja, as imagens da loja são antigas mesmo com o app atualizado em 2026):

- **Tela 1 — Entrar.** Barra superior azul (~#0B63E5) "AhGas - Entregador"; fundo quase branco (~#FAFAFA); logotipo grande ao centro; dois campos de linha simples (**CPF** e **Senha**); botão cinza-claro largo "ENTRAR". Ponto forte: entra com CPF, que o entregador sabe de cor. Ponto fraco: botão principal cinza parece desativado. [lido direto] — [imagem 1](https://play-lh.googleusercontent.com/xcpj9LDZA0PqSNy6KCfeykk_JG8S4W6uonBeblt4XdmDnojSUQrWlHpkH3xUmmqszLPUYQTtOoX8IdmITWsocWo)
- **Tela 2 — Lista vazia.** Mesma barra azul, agora com três ícones brancos à direita: **perfil (pessoa em círculo), rota (pino + carimbo/percurso) e menu de três pontos**. Fundo com o logotipo em marca-d'água. **Botão redondo azul flutuante "+"** no canto inferior direito (lançar venda "automática", isto é, venda feita na rua). [lido direto] — [imagem 2](https://play-lh.googleusercontent.com/L3muvqNwHqkRXlwFJ1mY-u0pIhkY5NTX7NC0WyM0XZiMaJJ84ythKGP7o9IErIHcDw60S5CAEBUDTVAMIp0S)
- **Telas 3 e 4 — Lista de pedidos em cartões.** Cada pedido é um cartão branco com **cabeçalho de cor cheia que indica a situação**:
  - cabeçalho **azul** (~#1E7BEA) = situação **"Liberado"** (a entregar);
  - cabeçalho **preto** (~#1C1C1C) = situação **"Entregue"**.
  - No cabeçalho: nome do cliente em branco negrito à esquerda (vendas de rua aparecem como "**Automática – Nome do cliente**"), **telefone** na linha de baixo, e a situação por extenso à direita.
  - No corpo: linha "**P-13** .......... **1 x R$ 85.00**" (produto à esquerda, quantidade x preço à direita, em cinza); linha alinhada à direita em negrito "**Crédito – R$ 85.00**" ou "**Dinheiro – R$ 260.00**" (forma de pagamento e total); linha opcional "**Observação: Entregar depois das 09:30**"; endereço completo com CEP; "**Data de Entrega:** 24/05/2019 08:30".
  - No pé, à direita, **três ícones pretos grandes sem legenda**: documento (nota/comprovante — só aparece no pedido entregue), **pino de mapa** (abrir rota) e **lixeira** (excluir).
  - [lido direto] — [imagem 3](https://play-lh.googleusercontent.com/6IcfRw9xtVwvMiW_NrIWCPnpkInHm3ukgzj1HdRgZuZS1MjzV1eSuLmrDngeSXPjnfN-jdcCwoEejPO6B3A9), [imagem 4](https://play-lh.googleusercontent.com/m149bERbwRBoTZZ0wz0PLGnpKpUJq0J6HMl-0ca4-z8QD7fDzkI6VRXOHYjz_CpIqVWXcxAPVEuUP07g80gK)
- Tipografia e densidade: Roboto padrão do Android, texto grande (~16–18 pt), 2 cartões por tela. Feito para toque.
- Pontos fortes: o cartão traz **tudo o que o entregador precisa sem abrir nada** (cliente, telefone, produto, quantidade, forma de pagamento, total, observação, endereço, hora); cor do cabeçalho separa "a fazer" de "feito"; "+" sempre à mão para venda de rua.
- Pontos fracos: **não aparece botão claro de "Entregar/Dar baixa"** nas capturas; a lixeira fica ao lado do mapa, fácil de tocar por engano; o botão "+" cobre o canto do cartão de baixo; valores no formato "85.00" (ponto) em vez de "85,00"; não há total do dia nem resumo para o acerto; não se vê campo de vasilhame vazio recolhido.

#### 2.2 App do consumidor (marca ahgas e versões com a marca da revenda)
A ahgas publica um app próprio e cerca de 19 apps iguais com a marca de cada revenda (ex.: "Fonegas", "Avenida Gas", "Liquigás Embu-Guaçu"). [lido direto] — [Google Play: desenvolvedor ahgas tecnologia](https://play.google.com/store/apps/developer?id=ahgas+tecnologia&hl=pt_BR); [app "ahgas"](https://play.google.com/store/apps/details?id=com.app.ahgas_fdb3160&hl=pt_BR) (nota 4,6 com 10 avaliações, "1 mil+" downloads, atualizado em 12/06/2025); [Liquigás Embu-Guaçu](https://play.google.com/store/apps/details?id=com.app.ahgas_fdd2be2&hl=pt_BR); [Fonegas](https://play.google.com/store/apps/details?id=com.app.ahgas_19a6608&hl=pt_BR)

Fluxo visto em 12 capturas (3 marcas, mesmas telas, só mudam cor e logotipo):
- **Passo 1 — Endereço.** Faixa do topo com o logotipo da revenda (cor da marca: azul-claro, verde-escuro ~#00704A, etc.); um campo arredondado "Endereco" e, ao lado, **botão redondo com pino azul** (usar a localização do aparelho); fundo com o logotipo em marca-d'água; **barra de botão em toda a largura no pé: "REPETIR PEDIDO"**.
- **Passo 2 — Produto.** Lista de botões largos arredondados com contorno, um por linha: **P-13 · P-45 · P-20 · Água 20L · Assistência Técnica**.
- **Passo 3 — Revendedor.** Cartão com foto do botijão, razão social da revenda, **estrelas de avaliação**, a palavra **"Aberto"** em verde e o **preço em negrito** à direita ("R$85.00", "R$110.00").
- **Passo 4 — Finalizar.** Três campos arredondados (nome, telefone, **forma de pagamento em lista — "Dinheiro"**); bloco com pino azul e o endereço em negrito em várias linhas; à direita, **ícone de calendário com data e hora de entrega** (agendamento); no pé, faixa "POR: nome da revenda" e uma **linha-resumo em três células: "P-13 / Recarga" · "1 / Quantidade" · "R$85,00 / Total"** (a célula do total na cor da marca); botão de largura total **"FINALIZAR PEDIDO"**.
- **Passo 5 — Agradecimento e avaliação.** Texto centralizado ("Obrigado pela preferência! Seu pedido será entregue pelo nosso revendedor ... [nome e telefone]"), "Avaliar Revendedor" com **cinco estrelas grandes** e botão "ENVIAR".
- Feito para: toque; um passo por tela. Pontos fortes: **"Repetir pedido" na primeira tela**; preço e "Aberto" antes de confirmar; linha-resumo produto/quantidade/total logo acima do botão final; identidade da revenda em toda tela. Pontos fracos: marca-d'água atrás do texto atrapalha a leitura; data em formato "2019-05-26" (técnico); campo "Endereco" sem acento; visual de 2019.
- Fontes das imagens: [ahgas 1](https://play-lh.googleusercontent.com/oqKdr_1jn3L6EcYm_O-nDO8qUUNXKtv6njgBpovyg_XsmJl3iSi9g6qs_LmMXpcwFiLfUzeLv1Wxj8KAaGpJDz8), [ahgas 2](https://play-lh.googleusercontent.com/0WHZatGrGviJlfDn5Xke2ZowzDATY5ovHkWXu12KwtmwklsFeXXOkVN0D31n5mB1woEziMhHA4m3jbxy0AePyQ), [ahgas 3](https://play-lh.googleusercontent.com/6ocp9PMkxcpGONI_2GxXymH9Mo15omPQokkCcz3YlOI4m5X7RgSdfRfxAos-a5_YB9aulNLrdO249ZepWk1tWA), [Liquigás Embu-Guaçu, agradecimento](https://play-lh.googleusercontent.com/pEYxkAw8INsLHaSHrT10ExwfEl2hjJHi_88fpvlz8S2b1_Ycdk1B6YunpgmngQwetKiFFmCbUOjxeJVV7gJd), [Fonegas, revendedor](https://play-lh.googleusercontent.com/gtmXq9yUJUgqbqcLd-LppiWFCLvZ9Vi013zZtFgmE0Dmv4iG3qxmC11tsmOpSEAVJ-lJSnYJaE9VZLZL654M7Q)

#### 2.3 Site da ahgas (identidade visual, sem telas do produto)
- Cores do site: branco, azul forte (~#0047AB) em faixas, verde (~#5FCF6C) em botões e links; letra Poppins; logotipo em forma de flor azul. Menu: HOME · SOBRE · BLOG · F.A.Q. · LOGIN (o login aponta para `portal.gasdelivery.com.br`). [lido direto] — [ahgas](https://ahgas.com.br/)
- As imagens das páginas inicial, Serviços, Sobre e Blog são só ícones de 113–128 px, logotipos de parceiros e fotos ilustrativas; **nenhuma captura do sistema**. [lido direto] — [ahgas](https://ahgas.com.br/); [ahgas, serviços](https://ahgas.com.br/servicos/); [ahgas, blog](https://ahgas.com.br/blog/)

#### 2.4 Recursos lidos direto (ahgas)
Todos em [ahgas](https://ahgas.com.br/) (janelas "Funcionalidades" de cada módulo). [lido direto]
- **Vendas:** mapa de calor; previsão de consumo de cada cliente; performance de vendedores e entregadores; "lançamento e passagem de pedido para melhor entregador"; **vendas disk, portaria, automática e retirada**; preços especiais por cliente; agendamento de pedidos.
- **Logística:** otimização de rotas; rastreamento de entregadores; "ordenação de fila de entrega para menor tempo de atendimento"; lançamento de automática pelo celular; **pré-fechamento**; automatização de passagem de pedidos; administração de pedidos por status; **baixa de pedidos pelo entregador**; associação de automática a cliente.
- **Estoque:** controle por movimentação e por inventário rotativo; cruzamento de vendas e movimentações; múltiplos depósitos; comodato por cliente; transbordo para filiais; controle centralizado ou por depósito; ajuste de inventário; **estoque teórico e estoque real**.
- **Financeiro:** **fechamento de caixa por entregador, portaria ou terceiros**; fluxo de caixa e DRE; contas a pagar e a receber integradas com a operação; transferência entre contas; **administração de crédito a clientes e a funcionários**; download de informações.
- **Fiscal:** emissão de notas com um clique; estoque fiscal; resumo fiscal; NF-e com preenchimento automático; **NFC-e pelo celular do entregador**; pré-configuração de tributos (Simples, lucro real ou presumido); integração com contabilidade.
- **Boleto:** emissão pelo celular e pelo app do entregador; agendamento de envio por e-mail ou SMS; notificação de cobrança; boleto com a marca da revenda. **MDFe.** **Contábil:** manifestação de notas e SPED fiscal (ICMS).
- **Bina WhatsApp:** integração com o módulo de vendas; **histórico de ligações e mensagens**; busca automática do cliente; "agilidade para lançar pedidos de WhatsApp".
- **Binho (IA):** "opera sem ajuda humana", "atende milhares de pedidos simultaneamente", integrado à plataforma.
- **App Consumidor:** um clique para recompra; agendamento; recarga e vasilhame; avaliação do revendedor; preços especiais para comércio; identidade visual da revenda; gás e água; "disponível na versão android".
- Perguntas frequentes: funciona em qualquer aparelho com internet; o app do entregador exige **Android 5.0 ou superior**; nada a instalar; treinamento remoto sem custo; atualizações sem custo. [lido direto] — [ahgas, F.A.Q.](https://ahgas.com.br/f-a-q/)
- Frases de propaganda: "A única solução 100% em nuvem do mercado!" e "Atendemos cerca de 5 mil revendedores em todo o Brasil" (afirmações do próprio fornecedor, não verificadas). [lido direto] — [ahgas](https://ahgas.com.br/)

#### 2.5 Preços lidos direto (ahgas) e comparação com as notas anteriores
Seção "Planos e pacotes", com chave Mensal/Anual. [lido direto] — [ahgas](https://ahgas.com.br/)

| Plano | Mensal | Anual (por mês) | O que inclui (texto da página) |
|---|---|---|---|
| Free | R$ 0 | R$ 0 | Monitoramento de Frota; Clientes |
| Standard | R$ 150 | R$ 120 | "Escolha 1 módulo" |
| Premium | R$ 375 | R$ 300 | "Escolha 3 módulos" |
| Expert | R$ 600 | R$ 480 | "Plataforma completa" |

- Outro bloco da mesma página traz: "PLANO BASIC — Cadastro de clientes — R$ 50,00 mensal" e "PLANOS PRO a partir de R$ 150,00 mensal — suporte em horário comercial, usuários ilimitados, 100% em nuvem". [lido direto] — [ahgas](https://ahgas.com.br/)
- "Descontos progressivos para pacotes" e "Consulte condições especiais para revendas Copagaz, Liquigás e Ultragaz". [lido direto] — [ahgas](https://ahgas.com.br/)
- **Confere com as notas anteriores:** Free, Basic R$ 50, Standard R$ 150 (R$ 120 no anual), desconto de 20% no anual.
- **Faltava nas notas anteriores:** Premium (R$ 375 / R$ 300) e Expert (R$ 600 / R$ 480); o preço é **por módulo** (1 módulo, 3 módulos, tudo).
- **Divergência dentro do próprio site** (as notas anteriores já suspeitavam): convivem dois conjuntos de planos (Free/Standard/Premium/Expert e Basic/Pro); o Basic de R$ 50 não aparece na tabela principal.
- O endereço `ahgas.com.br/planos/` não existe (erro 404); os planos ficam na página inicial. [lido direto]

### Inferences
- O vocabulário das telas do entregador ("Liberado", "Entregue", "Automática") bate com o texto do site (venda "automática", "baixa de pedidos pelo entregador"), então o app visto é mesmo a ponta do fluxo descrito.
- As capturas na loja são de 2019 (datas dentro das telas), embora o app do entregador tenha sido atualizado em outubro de 2026; **a aparência atual pode ser diferente**.
- A nota 3,8 do app do entregador (79 avaliações) sugere satisfação mediana com o app de rua; não li os comentários.

### Gaps
- **Nenhuma tela do sistema de escritório da ahgas foi vista**: pedidos/atendimento, bina, mapa, fechamento de caixa, estoque, financeiro, painel. O site não publica e o portal de login (`portal.gasdelivery.com.br`) não abre nesta sessão. Para ver, seria preciso o canal de vídeos do fornecedor ou uma demonstração.
- Não li os comentários dos usuários na Google Play.
- **Alerta sobre o site:** a página inicial da ahgas contém um parágrafo estranho, em português de Portugal, dizendo que o sistema é "apoiado financeiramente por casinos online", com link para um site de roleta. Isso tem cara de texto injetado por terceiros (site invadido ou venda de link) e não tem relação com o produto; ignorei o conteúdo e não segui o link. Vale como sinal de pouca manutenção do site. [lido direto] — [ahgas](https://ahgas.com.br/)

---

## 3. Correções e conferência das notas anteriores

### Takeaway
As notas anteriores estavam certas no essencial sobre os dois produtos; agora há confirmação por leitura direta, dois planos da ahgas que faltavam, a ficha do app do entregador que não tinha sido obtida e a constatação de que parte das frases sobre o Vendergás veio de um segundo site que continua sem conferência.

### Cited Findings
- As notas anteriores diziam que não foi possível abrir `ahgas.com.br`. **Agora abriu**; recursos e preços acima foram lidos direto. — [ahgas](https://ahgas.com.br/)
- Preços ahgas: confirmados Free, Basic R$ 50, Standard R$ 150 / R$ 120; **acrescentar** Premium R$ 375 / R$ 300 e Expert R$ 600 / R$ 480. — [ahgas](https://ahgas.com.br/)
- As notas anteriores registravam como lacuna "notas e comentários de Google Play do ahgas entregador: não obtidos". **Agora:** nota 3,8 (79 avaliações), 10 mil+ downloads, atualizado em 13/10/2026. — [Google Play](https://play.google.com/store/apps/details?id=com.watermelontecnologia.gasdelivery&hl=pt_BR)
- "Bina whats" e "Binho" (ahgas), tipos de venda disk/portaria/automática/retirada, estoque teórico x real, transbordo entre filiais, previsão de consumo por cliente, mapa de calor: **confirmados por leitura direta**. — [ahgas](https://ahgas.com.br/)
- Vendergás, confirmados em `vendergas.com.br`: bina, mapa de calor, previsão de compra, comodato, vale-gás, DRE, NFe/NFCe/CTe, nota fiscal na maquininha, multi lojas, localização dos entregadores (vista na tela). **Acrescentar:** MDFe, "fiado" citado no financeiro, robô "Maia", atuação desde 2019. — [Vendergás](https://vendergas.com.br/)
- As notas anteriores diziam não haver evidência de **como o mapa de calor aparece**. Agora há: manchas de calor sobre mapa de ruas com pontos por venda (item 1.5). — [vídeo da página inicial](https://vendergas.com.br/hero-bg.4af6208a.mp4)
- As notas anteriores diziam que nenhum produto mostrava **como a previsão de recompra aparece na tela**. Agora há um exemplo: tabela por cliente com "dias sem pedir", "média" e "próxima data", linhas coloridas (item 1.6). — [vídeo da página inicial](https://vendergas.com.br/hero-bg.4af6208a.mp4)

### Inferences
- "Vendergás em dois domínios parecem ser o mesmo produto, mas não confirmei" (nota anterior): continua sem confirmação direta; o site `vendergas.com.br` aponta o login para `app.vendergas.com.br` e não cita o outro domínio.

### Gaps
- Preço do Vendergás continua não publicado.
- Frases atribuídas a `sistemavendergas.com.br` nas notas anteriores continuam sem leitura direta.

---

## Padrões que se repetem

(Observados nas telas acima; cada item indica onde foi visto.)

1. **Cor = situação do pedido, aplicada numa área grande**, não num pontinho: cabeçalho de coluna e etiqueta no cartão (Vendergás), cabeçalho inteiro do cartão (ahgas entregador), linha inteira da tabela (previsão de compras do Vendergás).
2. **Pedido como cartão, não como linha de tabela**, nas telas de operação (quadro do Vendergás, lista do entregador da ahgas). Tabela fica para relatório e financeiro.
3. **Conteúdo mínimo do cartão:** cliente, telefone, valor, situação, hora. O da ahgas (celular) acrescenta produto, quantidade, forma de pagamento, observação e endereço; o do Vendergás (escritório) acrescenta entregador e tempo decorrido.
4. **Tempo decorrido e "atrasado" em destaque** no cartão (Vendergás).
5. **Contadores por situação sempre visíveis** (bolinhas no topo e número em cada coluna no Vendergás; contador no item "Repassar Pedido" do menu).
6. **Três entradas de pedido separadas:** telefone/disk, portaria/balcão e venda de rua ("automática") — nomes de menu no Vendergás, vocabulário e botão "+" no app da ahgas.
7. **Ações por ícone no pé do cartão** (ver, repassar, entregar, nota, imprimir, cancelar / nota, mapa, excluir). Nos dois produtos **sem legenda**.
8. **Mapa com painel lateral de lista** para rastrear entregadores; a lista mostra dado útil do aparelho (bateria, conexão) além do endereço (Vendergás).
9. **Filtro de loja e de período na barra superior, valendo para qualquer tela** (Vendergás).
10. **Painel de indicadores = 4 números grandes + quebra por forma de pagamento e por produto + gráfico por dia** (Vendergás).
11. **App do consumidor em passos curtos com "repetir pedido"**, marca da revenda, um botão largo no pé da tela (ahgas e Vendergás).
12. **Mensagens automáticas de WhatsApp em 6 momentos:** pedido confirmado, saiu para entrega, agradecimento, gás perto de acabar, boleto vencendo, aniversário (Vendergás).
13. **Azul como cor de base** nos dois fornecedores (azul-marinho + verde-água no Vendergás; azul vivo na ahgas).
14. **Nenhum sinal de atalhos de teclado** em nenhuma tela vista.

## Recomendações (minhas, não observadas)

Estas são propostas minhas para o programa do depósito, a partir do que vi; não são fatos dos produtos.

1. **Adotar o quadro em colunas por situação como tela principal** (Novo → Repassado → Em rota → Entregue, mais Agendados e Cancelados), mas com **cores mais calmas**: cabeçalho com faixa fina colorida e fundo claro, em vez de blocos de cor cheia. Sugestão de paleta de situação: novo âmbar #D97706, repassado azul #2563EB, em rota roxo #7C3AED, entregue verde #15803D, agendado cinza-azulado #475569, cancelado/devolvido vermelho #B91C1C.
2. **Cartão de pedido mais completo que o do Vendergás:** além de cliente, telefone, valor, entregador e tempo decorrido, mostrar **produto e quantidade ("2 × P13"), bairro e forma de pagamento**. São as três coisas que o atendente mais precisa para repassar e que faltam no cartão visto.
3. **Botões de ação com palavra**, pelo menos o principal ("Repassar", "Entregue"); deixar os secundários (imprimir, nota, cancelar) num menu "mais". Cancelar/excluir sempre longe do botão principal e com confirmação (no app da ahgas a lixeira fica colada ao mapa).
4. **Manter "atrasado" e o tempo decorrido** no cartão, com limite configurável (ex.: 30 min), e contorno alaranjado como no Vendergás.
5. **Lançamento de pedido pensado para teclado** (o que nenhum dos dois mostra): digitar telefone → Enter traz o cliente e o último pedido → Enter repete → escolher entregador → Enter grava. Mostrar as teclas na própria tela.
6. **App do entregador no modelo do cartão da ahgas** (tudo no cartão, cabeçalho colorido por situação, "+" para venda de rua), corrigindo as falhas: **botão grande "Entreguei"**, campo de **vasilhame vazio recolhido**, valores com vírgula, e um **resumo do dia no topo** (entregas, dinheiro, PIX, cartão, fiado, vazios) que já prepara o acerto.
7. **Mapa com lista lateral de entregadores mostrando bateria e conexão** (ideia boa do Vendergás), com mapa de ruas simples em vez de satélite, e os pedidos pendentes desenhados no mesmo mapa. Oferecer "abrir em janela separada" para TV.
8. **Painel com 4 números no topo e comparação com ontem/semana passada**, quebra por forma de pagamento e por produto; gráficos em uma única cor de destaque sobre fundo branco, barras por dia (não linhas pontiagudas).
9. **Lista "clientes para chamar hoje"** no lugar de um relatório largo: nome, telefone, produto habitual, dias desde a última compra, data prevista e um botão de WhatsApp; cor só em duas faixas (na hora / atrasado) e com legenda.
10. **Filtro de período e de depósito fixos no topo**, valendo para todas as telas.
11. **Seis mensagens automáticas de WhatsApp** como as do Vendergás (confirmação, saiu para entrega, agradecimento, lembrete de recompra, cobrança, aniversário), com texto editável pelo dono.
12. **Tela inicial com números do dia**, não só atalhos: pedidos em aberto, em rota, atrasados, caixa do dia, cheios e vazios no estoque.
13. Como nenhum dos dois fornecedores mostra publicamente as telas de **fechamento de caixa/acerto do entregador, estoque de cheios e vazios, cadastro de cliente e aviso de chamada**, o desenho dessas telas deve se apoiar nos outros produtos pesquisados e nas descrições de recurso (ex.: ahgas: "fechamento de caixa por entregador, portaria ou terceiros", "pré-fechamento", "estoque teórico e estoque real").
