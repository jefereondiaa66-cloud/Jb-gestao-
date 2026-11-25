# Telas reais: System Gas, GLP Digital (SIS GLP ADS Pro) e DistribuidorPRO

> Pesquisa feita em 25/11/2026. Os sites `systemgas.com.br` e `distribuidorpro.com.br` abriram direto (navegador automatizado e curl). O `glpdigital.com.br` **não abre mais** (veja a seção 2). As capturas estão só em `/tmp/claude-0/-home-user-Jb-gestao-/8e9001e3-ac32-5afb-91ab-506f80bf0618/scratchpad/telas/systemgas_glpdigital_distribuidorpro/` (nada foi copiado para o repositório). As telas abaixo foram descritas com minhas palavras.
>
> Legenda: **[lido direto]** = vi na página ou na imagem; **[resumo de busca]** = veio de um resumo do WebSearch; **[minha inferência]** ou **Recomendação (minha)** = não foi observado.
>
> **Aviso importante sobre quantidade:** o pedido era de 8 a 25 telas por fornecedor. Na prática, **os três sites quase não mostram telas**: o System Gas publica **3 imagens de produto** (1 painel de computador e 2 telas do app do entregador); o DistribuidorPRO publica **0 telas** (só fotos e ilustrações de depósito, PDV e integrações); o GLP Digital está **fora do ar**. Não inventei telas para completar a cota.

## 1. System Gas — o que as telas mostram

### Takeaway
O System Gas (empresa Bluar Tecnologia) mostra um painel de gestor bem moderno — menu lateral claro com item ativo em laranja, 5 cartões de números no topo (cheios, vazios, pedidos ativos, vendas, cancelados), rosca de estoque por produto, mapa de entregas com agrupamentos, gráfico de vendas por hora, barras de "pedidos por status" e lista de entregadores ativos — e um app do entregador em verde, feito para toque, com cartão grande "Novo pedido da central" e botões Recusar/Aceitar. As imagens parecem montagens de divulgação (dados de exemplo), não capturas do sistema em uso.

### Cited Findings

**Tela 1 — "Home do Gestor" (painel principal, computador)** [lido direto]
- Página: https://systemgas.com.br/ ; imagem: https://systemgas.com.br/images/hero-laptop-dashboard-clean-1200.webp (1200×800, dentro de um notebook). Texto alternativo da imagem: "Dashboard de gestão do System Gas" — [System Gas](https://systemgas.com.br/)
- **Para que serve:** visão do dia do dono/gerente: estoque, pedidos, vendas, mapa e equipe numa só tela.
- **Regiões do layout:**
  - **Menu lateral esquerdo** (~150 px de largura, fundo quase branco #f8fcfe): logotipo "SYSTEM GÁS" (círculo verde e laranja) no topo; itens com ícone de traço fino + texto: Dashboard (ativo), Pedidos, Mapa de entregas, Entregadores, Clientes, Estoque, Carga, Financeiro, Relatórios, Notificações (com selo numérico "3" em círculo azul-claro), Configurações. No rodapé do menu, cartão do usuário: avatar redondo azul com iniciais "BK", nome "Bruno Kauan", papel "Gestor" e uma seta para abrir opções.
  - **Item ativo do menu:** retângulo cheio laranja (~#f97316 a #ff7a1a; amostra de pixel com antisserrilhado deu #ff9c6f), texto e ícone brancos, cantos arredondados (~6 px).
  - **Cabeçalho do conteúdo:** título "Home do Gestor" (negrito, ~20 px, azul-marinho escuro) e subtítulo "Bem-vindo, Bruno Kauan" (cinza). À direita: seletor de data com ícone de calendário "Hoje, 24 de maio ⌄", botão "Filtros" com ícone de funil e botão quadrado de atualizar (seta circular). Todos com borda cinza clara e fundo branco.
  - **Linha de 5 cartões de números (KPIs)**, cada um com ícone num quadrado de cor suave à esquerda, rótulo pequeno cinza, número grande em negrito e uma linha de variação:
    1. "Cheios no estoque" — **792** — "▲ +12 hoje" (ícone verde, fundo verde-claro, ~#2fb688)
    2. "Vazios no estoque" — **11** — "▼ -2 hoje" (ícone laranja/caixa, ~#d6722f; seta vermelha)
    3. "Pedidos ativos" — **28** — "▲ +8 hoje" (ícone azul de documento)
    4. "Vendas entregues" — **R$ 662,50** — "+15% vs ontem" (ícone roxo "$", ~#7556d2)
    5. "Pedidos cancelados" — **2** — "▼ -1 hoje" (ícone verde com "!")
  - **Segunda linha (2 painéis):**
    - "Resumo do estoque": gráfico de rosca com o total no centro ("Total geral **803**") e legenda à direita com quadrado de cor, nome, quantidade e percentual: Galão 20L (218) 27,1% [azul]; GLP 13KG (206) 25,7% [verde]; P45 (236) 29,4% [roxo]; GLP 13KG - NACIONAL (136) 16,9% [azul-claro]; BOMBA MANUAL (7) 0,9% [laranja]. Ou seja: **o estoque é por produto e por marca (13 kg genérico x 13 kg Nacional)** e mistura gás, água e acessórios.
    - "Entregas no mapa": mapa claro em tons de cinza (estilo Google Maps "silver"), com **círculos verdes numerados** (3, 5, 4, 3 = agrupamentos de entregas), um ícone verde de moto (entregador) e um ponto azul com halo (posição atual/central); botões +, − e "centralizar" no canto inferior direito e botão de expandir (tela cheia) no canto superior direito. Bairros de exemplo: Centro, Jardim América, Bela Vista, São Cristóvão.
  - **Terceira linha (3 painéis):**
    - "Vendas do dia" (ícone de barras azul) com seletor "Hoje ⌄": valor **R$ 662,50**, "+15% vs ontem" em verde, e gráfico de **barras verticais verdes (~#069e76) por hora** (eixo 00h a 21h; eixo de valores R$ 0 a R$ 800). Picos às 12h e 18h.
    - "Pedidos por status": lista com rótulo, número à direita e **barra de progresso colorida** embaixo: Em análise 4 (cinza), Aguardando entrega 12 (verde ~#12b17d), Em rota 8 (azul ~#248cff), Entregues 28 (roxo ~#8057e4), Cancelados 2 (vermelho ~#fb4543).
    - "Entregadores ativos" com contador verde "12 de 15": linhas com foto redonda, nome (João Silva, Carlos Souza, Marcos Lima, Rafael Costa), **status com bolinha colorida** ("● Em entrega" verde, "● Em rota" verde, "● Aguardando" laranja), rota ("Rota 15", "Rota 08"…) e ícone de moto à direita; botão de largura total "Ver todos entregadores".
- **Cores gerais** [lido direto, valores aproximados por amostra de pixel]: fundo da área de conteúdo #fafcfe (quase branco azulado); cartões brancos com borda/sombra muito leve e cantos ~8 px; texto principal azul-marinho escuro (~#1e2235); texto secundário cinza (~#6b6a8d); destaque da marca laranja (menu ativo) + verde (dados positivos, gráficos).
- **Tipografia e densidade:** fonte sem serifa geométrica (parecida com Inter/Plus Jakarta), rótulos ~11–12 px, números ~18–20 px em negrito. Densidade **média**: cabe tudo numa tela de notebook sem rolar, com bastante espaço em branco.
- **Teclado ou toque:** desenho de painel para mouse/visualização; não há campos de digitação nesta tela.
- **Pontos fortes:** cheios e vazios lado a lado no topo (o que importa no gás); variação "vs hoje/ontem" em cada número; status de pedidos com cores consistentes; mapa e equipe na mesma tela; filtro de data global.
- **Pontos fracos:** é um painel de "olhar", não de "operar" (não há botão "Novo pedido" visível); números pequenos de variação com contraste fraco; cinco cores diferentes nos ícones de KPI (verde, laranja, azul, roxo, verde) sem significado fixo; legenda da rosca com cores parecidas (dois azuis).

**Tela 2 — App do entregador: "Novo pedido da central"** [lido direto]
- Imagem: https://systemgas.com.br/images/entregador-jose-app-v2-600.webp (600×1283, dentro de um celular). Alt: "Aplicativo System Gas para entregadores" — [System Gas](https://systemgas.com.br/)
- **Para que serve:** o entregador recebe um pedido enviado pela central e aceita ou recusa.
- **Layout (de cima para baixo):**
  - Barra superior branca: ícone de menu (≡) à esquerda, título "Entregador Jose" (negrito, ~22 pt, azul-marinho) no centro e ícone de sair (porta com seta) à direita.
  - **Abas em pílula** sobre fundo verde (~#00977b): "Todos" (ativa, fundo branco, texto verde), "Aceitos", "Em rota" (texto branco).
  - Fundo: mapa claro (cidades de exemplo Americana, Sumaré).
  - **Cartão central flutuante** (branco, cantos ~16 px, sombra): ícone de sino verde num círculo verde-claro; título "Novo pedido da central" (negrito, grande); selo "NOVO" (verde, fundo verde-claro) no canto. Abaixo, duas linhas com ícone em quadrado verde-claro: "Cliente / Joao" e "Endereço / Avenida Presidente Getulio Vargas, 4800, Maria Regina, Alvorada, RS" (texto em negrito, grande).
  - **Dois botões grandes lado a lado** (~110 px de altura cada): "⊗ Recusar" (fundo branco, borda e texto vermelhos ~#dd3034) e "✓ Aceitar" (fundo verde cheio ~#00977b, texto branco).
  - **Gaveta inferior** (fundo cinza-claro #f7f6f9, com alça para arrastar): "Meus pedidos (2)" com seta para recolher; cada item tem círculo verde com o número do pedido (63, 01), nome do cliente, endereço abreviado com reticências, "Aceito há 36h 48min", selo verde-claro "Aceito", distância "10,0 km" à direita e **seta de navegação verde** (abre o GPS).
- **Teclado ou toque:** claramente para **toque**, com alvos enormes e texto grande.
- **Pontos fortes:** decisão em um toque; endereço completo em letra grande; tempo desde o aceite visível; seta de navegação em cada pedido.
- **Pontos fracos:** o cartão não mostra **o que** levar (produto, quantidade), **valor**, **forma de pagamento** nem **troca de casco** — informações essenciais no gás; "Aceito há 36h" sugere que não há alerta de atraso.

**Tela 3 — App do entregador: "Minhas entregas" (rota)** [lido direto]
- Imagem: https://systemgas.com.br/images/hero-phone-app-clean-700.webp (também em 420 px: https://systemgas.com.br/images/hero-phone-app-clean-420.webp). Alt: "Aplicativo do entregador exibido em um celular" — [System Gas](https://systemgas.com.br/); [System Gas gás](https://systemgas.com.br/sistema-para-revenda-de-gas/)
- **Para que serve:** ver a rota do dia e a próxima entrega.
- **Layout:** cabeçalho **verde-escuro** (~#0b6b45) com ≡, título "Minhas entregas" e sino com ponto vermelho; abas "Rota" (ativa, pílula verde mais clara), "Mapa", "Lista". Cartão "Próxima entrega" (ícone, nome "Mercado São João", endereço, distância "450 m" e tempo "00:18" em verde). Mapa com ponto azul (eu), linha tracejada verde até o pino verde do destino e marcadores numerados 2 e 3. Painel "Paradas da rota" com "Ver todas": lista numerada 1–4 (nome, endereço, distância 450 m / 1,2 km / 2,7 km / 3,4 km, selo "Próxima" ou "Pendente" em verde-claro). Botão de largura total verde-escuro "▶ Iniciar rota". Faixa de resumo com 4 ícones: "12 Entregas", "28,4 km Rota total", "03:45 Tempo estimado", "R$ 42,60 Combustível". **Barra de navegação inferior** com 4 itens: Entregas (ativo, verde), Histórico, Notificações, Perfil.
- **Observação:** os exemplos ("Mercado São João", "Comércio Silva", "Depósito Central") e o estilo diferem do app da tela 2 (verde mais escuro, outra fonte); **[minha inferência]** é uma maquete de divulgação, possivelmente não idêntica ao app real.
- **Pontos fortes:** próxima entrega em destaque; resumo da rota com custo de combustível; navegação inferior simples.
- **Pontos fracos:** nada sobre carga do veículo, cascos ou recebimento nesta tela.

**Página inicial (moldura de marketing)** [lido direto]: cabeçalho branco com menu (Solução, Recursos, Como funciona, Planos, Dúvidas, Equipe), botão "Entrar →" (contorno verde) e botão laranja cheio "Solicitar demonstração"; faixa principal **verde-escura (~#0b5a43)** com título "Sua revenda no controle. *Do pedido à entrega.*" (parte final em laranja itálico) e um selo flutuante "● Operação ao vivo — Pedidos e entregas atualizados" sobre o notebook; botão flutuante do WhatsApp no canto — [System Gas](https://systemgas.com.br/)

**Recursos e preços lidos direto no site** [lido direto]
- Posicionamento: "ERP para revendedoras de gás e água"; "Atendimento, entregadores, estoque, cascos, financeiro e emissão fiscal em uma única plataforma" — [System Gas](https://systemgas.com.br/)
- Lista de recursos: Pedidos em tempo real; Entregadores no mapa ("rotas, status e disponibilidade da equipe"); Estoque e cascos ("cargas, retornos e saldos"); Financeiro integrado; Emissão fiscal; Relatórios inteligentes; "Estoque por entregador" ("o que saiu, foi vendido e voltou com cada profissional"); "Multiempresa e fiscal" — [System Gas](https://systemgas.com.br/)
- Dores citadas: pedidos espalhados no WhatsApp, entregador ligando para a central, estoque e cascos que não fecham, **acerto do entregador demorado** ("Carga, vendas e retornos exigem conferências manuais no fim do expediente") — [System Gas](https://systemgas.com.br/)
- Página de gás: "veja o que saiu, foi vendido e voltou com cada entregador. Isso ajuda no acerto ao fim do expediente" — [System Gas gás](https://systemgas.com.br/sistema-para-revenda-de-gas/)
- Perguntas frequentes (respostas no código da página): app do entregador "reúne pedidos, mapa, navegação, status e controle de carga"; NF-e/NFC-e "pode ser integrada ao fluxo comercial conforme a configuração da empresa"; uso em "computador, tablet e celular"; importação de clientes; implantação acompanhada; suporte — [System Gas](https://systemgas.com.br/)
- **Preço: "Planos a partir de R$ 99,90/mês"**, detalhes pelo WhatsApp; não há tabela de planos publicada — [System Gas](https://systemgas.com.br/); [System Gas gás](https://systemgas.com.br/sistema-para-revenda-de-gas/)
- Empresa: "O System Gás é oferecido pela BLUAR TECNOLOGIA LTDA" — [Privacidade](https://systemgas.com.br/privacidade/)
- **Novo (não estava nas notas anteriores):** a política de privacidade descreve **integração com a Plataforma do WhatsApp Business da Meta** (inclusive "coexistência" com número já usado no app WhatsApp Business), **recursos de inteligência artificial** em que trechos das mensagens "podem ser processados pela OpenAI para produzir uma resposta ou organizar um rascunho", **localização dos entregadores** "quando o recurso está habilitado", e infraestrutura Google Cloud/Firebase — [Privacidade](https://systemgas.com.br/privacidade/); [Exclusão de dados](https://systemgas.com.br/exclusao-de-dados/)
- Login do sistema em https://app.systemgas.com.br/ (não abriu nesta rede: falha de túnel) — [System Gas](https://systemgas.com.br/)

### Inferences
- [minha inferência] O painel prioriza **cheios x vazios** como os dois primeiros números — confirma que para gás o estoque de vasilhame é o indicador nº 1.
- [minha inferência] Cores de status do System Gas: cinza = em análise, verde = aguardando/em entrega, azul = em rota, roxo = entregue, vermelho = cancelado, laranja = aguardando (entregador). Há inconsistência: verde é usado tanto para "aguardando entrega" (pedido) quanto para "em entrega" (entregador).

### Gaps
- Não vi telas de: cadastro/lançamento de pedido, bina, acerto do entregador, carga, caixa/financeiro, cadastro de cliente, tabela de preços, WhatsApp/robô. O site não as publica e o sistema exige login.
- Não achei o app do System Gas na Google Play (busca por "systemgas" e "system gas entregador" não trouxe o app) — pode ser web/PWA ou distribuição fechada.

## 2. GLP Digital / SIS GLP ADS Pro — situação

### Takeaway
O site do SIS GLP Digital está **fora do ar**: na única vez em que abriu (captura feita nesta rodada de pesquisa, 24/11/2026) ele mostrava apenas um aviso "Sistema Não Está Mais Online". Em 25/11/2026 o endereço nem resolve mais. **Não há telas do produto para descrever**, e as informações das notas anteriores sobre ele (Google Ads, PWA, conciliação) não puderam ser conferidas.

### Cited Findings
- Título da página: "SIS GLP DIGITAL - Sistema Offline". Conteúdo [lido direto na captura]: fundo azul-marinho quase preto, logotipo "SIS GLP" branco + "DIGITAL" azul-ciano; cartão escuro com selo vermelho "● SISTEMA INDISPONÍVEL", ícone de proibido rosa, título "Sistema Não Está Mais Online", texto "a plataforma do SIS GLP DIGITAL encontra-se offline e não está mais em operação neste endereço", botão verde "Falar no WhatsApp"; rodapé "© 2026 SIS GLP DIGITAL… Desenvolvido por Roka Digital" (link para rokadigital.com.br) — [glpdigital.com.br](https://glpdigital.com.br/) (captura salva em `.../telas/systemgas_glpdigital_distribuidorpro/glp_home.png`)
- Em 25/11/2026: navegador → "ERR_TUNNEL_CONNECTION_FAILED"; curl → sem resposta; WebFetch → "ENOTFOUND glpdigital.com.br". `www.glpdigital.com.br` e `sp.glpdigital.com.br` também falharam — [glpdigital.com.br](https://glpdigital.com.br/)
- Duas buscas na web ("SIS GLP" ADS Pro; glpdigital Roka Digital) **não trouxeram nenhuma página sobre o produto** [resumo de busca].
- Nenhum app "SIS GLP" de revenda apareceu na busca da Google Play [lido direto na loja].

### Inferences
- [minha inferência] O produto foi descontinuado ou mudou de endereço. **Recomendo retirá-lo da lista de concorrentes ativos** (ou marcá-lo como "fora do ar em nov/2026").

### Gaps
- Não foi possível ver nenhuma tela, recurso ou preço. Os itens das notas anteriores (captação via Google Ads + site, PWA do entregador, comodato, conciliação bancária CSV/OFX/PDF) seguem **sem conferência**.

## 3. DistribuidorPRO — o que o site mostra

### Takeaway
O DistribuidorPRO (do grupo GestãoPRO) **não publica nenhuma captura de tela do sistema**: todas as imagens das páginas de gás, soluções, planos e integrações são fotos ou ilustrações genéricas (galpão com prateleiras, PDV de supermercado, desenho de "API"). O texto da página de gás é rico e específico (cheio/vazio, comodato, romaneio, baixa offline), mas a página de planos **contradiz** a descrição de planos da própria página de gás.

### Cited Findings

**Imagens examinadas (nenhuma é tela do produto)** [lido direto]
- https://distribuidorpro.com.br/img/sistema-para-distribuidora.webp (alt "Sistema DistribuidorPRO para revenda de gás GLP" / "Painel do Sistema ERP DistribuidorPRO"): foto de galpão de caixas com um monitor de costas sobre uma mesa — **não mostra a tela** — [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- https://distribuidorpro.com.br/img/distribuidora.webp: foto de armazém com empilhadeira — [Planos](https://distribuidorpro.com.br/planos)
- https://distribuidorpro.com.br/img/solucoes-distribuidora.webp: pessoas com tablets no armazém e ícones flutuantes com textos em inglês sem sentido ("Culutions") — [Soluções](https://distribuidorpro.com.br/solucoes)
- https://distribuidorpro.com.br/img/pdv.webp: terminal de PDV em loja com placas "PDV" — [Soluções](https://distribuidorpro.com.br/solucoes)
- https://distribuidorpro.com.br/img/integracoes.webp: ilustração de pessoas em computadores ligados a nuvens "API" — [Integrações](https://distribuidorpro.com.br/integracoes)
- https://distribuidorpro.com.br/img/erp-para-distribuidora.webp: ilustração isométrica de armazém com caminhões — [DistribuidorPRO](https://distribuidorpro.com.br/erp-para-distribuidora)
- [minha inferência] As imagens têm aparência de geradas por IA (texto deformado em inglês). Blog, roteirização e canhoto não têm imagens além do logotipo.

**Recursos lidos direto na página de gás** — [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas) [lido direto]
- Pedido: "Registre pedidos com endereço, tipo de botijão (P13, P45), troca ou primeira compra, forma de pagamento e observações. Histórico por cliente e limite de crédito integrados"; PDV balcão integrado ao estoque; pedido telefônico com endereço e rota; integração WhatsApp Business.
- Abas de módulos: Pedidos, Botijões, Rotas, Fiscal, Financeiro, App Entregador.
- Fluxo em 4 passos: 1 Pedido → 2 Separação e rota ("Botijão reservado no estoque; pedido entra na fila da rota do bairro ou entregador") → 3 Entrega e casco ("Entregador baixa no app: botijão entregue, casco retornado e pagamento registrado") → 4 Fiscal e financeiro ("NF-e emitida do pedido; título a receber gerado e saldo cheio/vazio atualizado").
- Checklist de 10 requisitos: controle separado cheio, vazio e casco; comodato por cliente; pedidos balcão + telefone + rota; rotas por bairro/entregador; **app entregador com baixa offline**; NF-e/NFC-e integrada ao pedido; fiado e limite de crédito; **romaneio e conferência de retorno**; relatório de cascos e perdas; implantação assistida.
- Outros: controle de frota; multi-filial; backup automático, perfis de acesso e auditoria. Página "Atualizado em jun/2025".
- Os depoimentos ("José Santos – GO", "Maria Costa – BA", "Roberto Pereira – SP") e o "case" não têm identificação verificável.

**Planos e preços — divergência dentro do próprio site** [lido direto]
- Página de gás: **Gestão Flex** = "Revendas enxutas com balcão e poucas rotas. PDV + estoque + NF-e, 1 depósito"; **Gestão Completa** (recomendado) = "Rotas, app entregador, cascos e financeiro integrados. Todos os módulos, App + rotas"; **Gestão Prime** = multi-filial, suporte prioritário; **Gestão de Produção** = envasamento, ordem de produção — [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- Página de planos: **o Flex é MAIOR que o Completo** ("O Plano Flex inclui tudo do Plano Completo, mais: relatórios personalizados, customizações e integrações; múltiplos CNPJ; marketing por e-mail e por WhatsApp; integração com TEF e com marketplaces"); Produção inclui tudo do Flex + PCP; Prime inclui tudo do Produção + personalização total. O Completo inclui "Vendas, PDV, Compras, Estoque e Financeiro; NFe/NFCe/NFSe/MDFe/GNRE; monitor de XML e boletos; catálogo online". Aparece ainda um cartão "GestãoGPT totalmente WEB" ("Sistema 100% web com IA"). **Todos "Sob Consulta"**, sem valor publicado — [Planos](https://distribuidorpro.com.br/planos)
- **A página de planos não fala de botijão, casco, comodato nem app do entregador** — esses itens só aparecem no texto da página de gás — [Planos](https://distribuidorpro.com.br/planos)
- Empresa: "Parte do ecossistema GestãoPRO"; telefones (11) 2391-5161 e (14) 3500-9578 — [Planos](https://distribuidorpro.com.br/planos). Segundo resumo de busca, a GestãoPRO foi fundada em 2009, fica em Manduri (SP) e atende 900 a 1.200 clientes [resumo de busca] — [uai.com.br](https://www.uai.com.br/?p=173866)
- O site do DistribuidorPRO também vende o mesmo ERP para roupas, autopeças, bebidas e alimentos (dezenas de páginas) — [DistribuidorPRO](https://distribuidorpro.com.br/) [lido direto]

### Inferences
- [minha inferência] O DistribuidorPRO é um **ERP genérico de distribuição** com uma página de marketing para gás; sem telas, não dá para confirmar que cheio/vazio, comodato e app com baixa offline existem como telas próprias.

### Gaps
- Nenhuma tela do produto foi vista. Uma página de comparação (B2B Stack) teria seção "Telas dos sistemas" do GestãoPRO Comércio [resumo de busca], mas o site não está liberado nesta rede — [B2B Stack](https://www.b2bstack.com.br/compare/gestaopro-comercio-vs-bling-erp)
- Preço real desconhecido (só "sob consulta").

## 4. Padrões que se repetem, recomendações e correções às notas anteriores

### Takeaway
Com só 3 telas reais (todas do System Gas), os padrões são poucos mas claros: painel com cheios/vazios no topo, status de pedido por cor, mapa com entregadores, app do entregador verde e de toque com Aceitar/Recusar. As notas anteriores precisam de três correções: GLP Digital está fora do ar, os planos do DistribuidorPRO se contradizem e o System Gas tem integração com WhatsApp oficial e IA.

### Cited Findings
**Padrões que se repetem (observados)**
- **Cheios e vazios como primeiros números do painel** — [System Gas](https://systemgas.com.br/); o DistribuidorPRO também trata "estoque cheio/vazio" como item nº 1 no texto — [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- **Fluxo em 3–4 etapas "pedido → entrega → gestão/fiscal"**, com o entregador dando baixa no celular — [System Gas](https://systemgas.com.br/); [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- **Estoque por entregador / conferência de retorno** como base do acerto do fim do dia — [System Gas gás](https://systemgas.com.br/sistema-para-revenda-de-gas/); [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- **Visual "SaaS moderno"**: fundo claro, cartões brancos arredondados, menu lateral com ícones de traço fino, uma cor forte de marca no item ativo, selos de status em "pílula" com fundo claro e texto forte da mesma cor — [System Gas](https://systemgas.com.br/)
- **App do entregador**: abas por situação (Todos/Aceitos/Em rota ou Rota/Mapa/Lista), cartão grande para o pedido novo, botões grandes, distância em km e seta de navegação por pedido, barra inferior com 4 itens — [System Gas](https://systemgas.com.br/)
- **Venda por demonstração via WhatsApp**, sem tabela de preços completa (System Gas "a partir de R$ 99,90"; DistribuidorPRO "sob consulta") — [System Gas](https://systemgas.com.br/); [Planos](https://distribuidorpro.com.br/planos)

**Correções às notas anteriores**
- `programas_existentes.md` descreve o SIS GLP ADS Pro como produto ativo; em nov/2026 o site diz **"Sistema Não Está Mais Online"** — [glpdigital.com.br](https://glpdigital.com.br/)
- `programas_existentes.md` diz "Planos Flex (PDV + estoque + NF-e, 1 depósito), Completa…": isso vale **só para a página de gás**; a página de planos diz o contrário (Flex = Completo + multi-CNPJ, TEF, marketplaces, marketing por WhatsApp) e acrescenta o cartão "GestãoGPT" — [DistribuidorPRO gás](https://distribuidorpro.com.br/sistema-para-revenda-de-gas); [Planos](https://distribuidorpro.com.br/planos)
- `visual_telas.md` dizia não ter evidência de cores/layout; agora há o painel e dois apps do System Gas descritos acima — [System Gas](https://systemgas.com.br/)
- Acrescentar: System Gas tem **WhatsApp Business oficial (Meta) e IA com OpenAI** (descrito na privacidade) e é da **Bluar Tecnologia** — [Privacidade](https://systemgas.com.br/privacidade/)
- Confirmado sem mudança: System Gas "a partir de R$ 99,90/mês"; app com "pedidos, mapa, navegação, status e controle de carga" — [System Gas](https://systemgas.com.br/)

### Inferences — Recomendações (minhas, não observadas)
- **Painel do dono:** copiar a ideia da linha de cartões do System Gas, mas com cores de significado fixo: Cheios (verde), Vazios/cascos (laranja), Pedidos abertos (azul), Vendas do dia (neutro/escuro), Atrasados (vermelho). Acrescentar o número que falta no concorrente: **"cascos na rua / em comodato"** e **"dinheiro com entregadores"**.
- **Cores de status de pedido** (uma por estado, sempre igual em toda tela): Novo = azul #2563eb; Aguardando entregador = âmbar #f59e0b; Em rota = roxo #7c3aed; Entregue = verde #16a34a; Cancelado = cinza/vermelho #dc2626; **Atrasado** = vermelho com borda piscando — o System Gas não mostra atraso.
- **Cartão do pedido no app do entregador:** manter o modelo "Novo pedido / Recusar / Aceitar" (botões ≥ 56 px), mas incluir **produto e quantidade (ex.: 2× P13), valor, forma de pagamento, "troca de casco: sim/não" e troco** — ausentes no System Gas.
- **Tela de operação da central (não vista em nenhum dos três):** fazer para **teclado** (atalhos F2 novo pedido, Enter confirma), separada do painel de "olhar".
- **Acerto do entregador:** tela própria em três colunas "Saiu / Vendeu / Voltou" (cheios, vazios, dinheiro por forma de pagamento), já que os dois fornecedores destacam esse fechamento mas nenhum mostra a tela.
- **Não copiar** do DistribuidorPRO a confusão de planos; se houver planos no JB, uma tabela única e coerente.

### Gaps
- Telas de bina, cadastro de pedido, acerto, carga, caixa, cliente, tabela de preços e WhatsApp/robô **não foram vistas em nenhum dos três fornecedores**. Para vê-las seria preciso uma demonstração (login de teste) ou vídeos (YouTube não está liberado nesta rede).
- Total de telas reais vistas: System Gas 3; GLP Digital 0 (site offline); DistribuidorPRO 0 (só imagens ilustrativas, 6 examinadas).
