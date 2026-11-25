# Lado técnico de um programa para depósito de gás (revenda de GLP): arquitetura, integrações e modelo de dados de referência

> **Como ler estas notas.** Pesquisa feita em 25/11/2026. Cada fato traz a marca **[lido direto]** (lido na própria página, ou no código/arquivo do repositório baixado nesta sessão) ou **[resumo de busca]** (veio do resumo do buscador, sem abrir a página: confira antes de usar como número final). Tudo o que está em "Inferências" e todas as tabelas do modelo de dados são **proposta minha**, não fonte.
> As notas anteriores (`funcionalidades.md`, `programas_existentes.md`, `programas_complemento.md`, `visual_telas.md`, `telas_reais_*.md`) já cobrem *o que* os sistemas fazem; aqui o foco é *como* fazer. Não repito o que já está lá, só cito quando ajuda.
> Limitações de rede: sites da Meta, Google, Supabase, Banco Central e fornecedores de nota fiscal estavam bloqueados para abertura direta; por isso muitos números de preço são [resumo de busca]. Em compensação, baixei (git clone) os repositórios públicos do Banco Central (API Pix), Supabase (documentação), Baileys, Evolution API, PagSeguro PlugPag, nfephp sped-nfe, QZ Tray, WebUSBReceiptPrinter e de vários sistemas abertos de gás, e li os arquivos direto.

---

## 1. Como os produtos existentes são construídos (desktop, nuvem, app), o que funciona sem internet e como o painel de entregas se atualiza

### Takeaway
O mercado tem duas gerações convivendo: programas **Windows instalados** com licença por computador e banco local na rede da loja (Gas Expert, XGás, BITTWork, Ultragil), que funcionam sem internet e ligam a bina direto no PC; e sistemas **web em nuvem** com app Android do entregador (RevGás, Vendergás, ahgas, PopGás, System Gas, DistribuidorPRO), em que o painel mostra pedidos e entregadores "em tempo real". Só alguns apps de entregador anunciam funcionar sem sinal e sincronizar depois (DistribuidorPRO, ControlGás/CGMobile, o projeto aberto "depo"). Nenhum fornecedor publica a pilha técnica (linguagem, banco); a única pilha que se pode ver de verdade é a dos projetos abertos.

### Cited Findings
**Programas instalados (geração antiga)**
- Gas Expert: licença sem mensalidade, **uma licença por computador** na rede local; "compatível com todas as versões do Windows"; compatível com binas de computador para linha fixa e com o app Bina Cell para celular; vende "Bina de 2 Linhas Fixas USB" [lido direto] — [Gas Expert](https://gasexpert.maik.com.br/)
- Bina Cell PC (Gas Expert): app Android que manda ao programa as chamadas do celular **pela mesma rede Wi‑Fi**, até 4 celulares [lido direto, nota anterior] — ver `telas_reais_gasexpert_lojas_de_app.md`
- XGás: programa Windows que **não exige internet**, funciona em rede local com um computador servindo o banco de dados [resumo de busca, nota anterior] — [XGás](https://xgas.com.br/); ver `programas_complemento.md`
- BITTWork: programa Windows instalado, bina por hardware (linha fixa) ou celular, até 5 telefones por cliente [nota anterior] — ver `programas_existentes.md`
- Linguagem/banco (Delphi, Firebird etc.): **nenhuma página de fornecedor do setor informa**. Não encontrei fonte; ver Gaps.

**Sistemas em nuvem (geração atual)**
- ahgas: "funciona em qualquer aparelho com internet", nada a instalar; app do entregador exige Android 5.0+ [lido direto, nota anterior] — [ahgas FAQ](https://ahgas.com.br/)
- Vendergás: "100% nuvem", app integrado à maquininha que lança o pedido, recebe cartão/PIX e emite nota no próprio aparelho; vendas aparecem "em tempo real" para o gestor [nota anterior] — [Vendergás](https://vendergas.com.br/)
- System Gas: "Pedidos em tempo real", "Entregadores no mapa"; app "Bina System Gas" (Android, BLUAR Tecnologia) manda o número das ligações do celular da empresa para o painel web [nota anterior] — ver `telas_reais_systemgas_glpdigital_distribuidorpro.md` e `programas_complemento.md`
- RevGás: integra o identificador de chamadas "diretamente com sua plataforma", no painel de vendas; publicou em 2026 que a bina "ainda vale a pena" [lido direto] — [RevGás, artigo bina](https://revgas.com/utilizar-bina-em-2024-ainda-vale-a-pena-para-revendas-de-gas/)
- Gas Expert / Tele Expert: depende de botão "Atualizar" no app do entregador (sem tempo real aparente) [nota anterior, avaliação] — ver `telas_reais_gasexpert_lojas_de_app.md`

**Sem internet (offline)**
- DistribuidorPRO: app do entregador "baixa a rota e sincroniza depois", "baixa offline" [nota anterior] — [DistribuidorPRO](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- ControlGás: app CGMobile "funciona sem internet e sincroniza depois", emite nota fiscal [nota anterior] — ver `programas_complemento.md`
- Projeto aberto "depo" (Next.js + Postgres): "Sem internet a confirmação fica guardada e vai sozinha quando o sinal volta"; o entregador confirma com "5 segundos pra desfazer" [lido direto, README] — [depo](https://github.com/Solace-Inc-Team/depo)
- Projeto aberto "lpg-cylinder-management" (Quênia, Prisma/Postgres): tabela `OfflineSyncItem` com `clientId` único (idempotência), tipos `ASSIGNED_DELIVERY_SNAPSHOT`, `VEHICLE_STOCK_SNAPSHOT`, `DELIVERY_STATUS_DRAFT`, `PROOF_OF_DELIVERY_DRAFT`, `FIELD_SALE_DRAFT` e estados `QUEUED / SYNCED / FAILED / CONFLICT`, com `conflictReason` e `clientCreatedAt` [lido direto, migração `20260507070000_stage_15_offline_mode`] — [Onguka-dev/lpg-cylinder-management](https://github.com/Onguka-dev/lpg-cylinder-management)

**Tempo real (painel de entregas)**
- Supabase Realtime "Postgres Changes" autoriza cada evento contra cada assinante (100 assinantes = 100 checagens) e processa as mudanças **numa única linha de execução** para manter a ordem; acima de ~3.000 assinantes simultâneos da mesma mudança, a recomendação é usar **Broadcast** [lido direto, documentação no repositório oficial] — [Supabase, Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- Plano Pro do Supabase: ~US$ 25/mês; números de conexões Realtime (500 simultâneas, 5 milhões de mensagens) só em guias de terceiros [resumo de busca, não confirmado] — [Supabase Pricing](https://supabase.com/pricing); [Schematic](https://schematichq.com/blog/supabase-pricing)

### Inferências
- Para um depósito pequeno, o volume é minúsculo para qualquer tecnologia de tempo real (dezenas de pedidos/hora, 2 a 10 telas abertas). Postgres Changes do Supabase sobra; não é preciso servidor próprio de WebSocket.
- A diferença real entre as gerações não é a linguagem, e sim **onde fica o banco**: no PC da loja (funciona sem internet, mas bina e backup dependem da máquina) ou na nuvem (acesso de qualquer lugar e app do entregador, mas a loja para se a internet cair). Proposta: nuvem como fonte da verdade + **fila local** no app do entregador e na tela de atendimento (pedido digitado sem internet fica guardado com um identificador gerado no aparelho e sobe quando volta), seguindo o padrão `OfflineSyncItem` (id do cliente único para não duplicar).
- O que precisa funcionar sem internet, em ordem: (1) confirmar entrega e recebimento no app do entregador; (2) lançar pedido no balcão; (3) imprimir comprovante. Emissão de NFC-e sem internet exige o modo de **contingência offline** da NFC-e (ver `legal_fiscal.md`/`conferencia_fiscal.md`).

### Gaps
- Nenhuma fonte informa a linguagem e o banco dos programas instalados do setor (a suposição "Delphi + Firebird" é comum no mercado brasileiro de automação comercial, mas **não encontrei fonte** para nenhum produto de gás).
- Nenhum fornecedor de nuvem do setor explica como faz o tempo real (WebSocket, atualização periódica etc.).

---

## 2. Integrações: como funcionam e quanto custam (estado de 2026)

### 2.1 Identificador de chamadas (bina)

### Takeaway
Há três jeitos de a chamada chegar ao programa: (a) **aparelho de bina USB** ligado à linha fixa analógica, que aparece como porta serial (COM) no Windows e entrega o número decodificado (DTMF ou FSK); (b) **app no celular** da loja que lê a chamada recebida e manda o número ao sistema (pela rede Wi‑Fi local ou pela internet); (c) **PABX IP / VoIP** (Asterisk/FreePBX ou operadora em nuvem) que avisa o sistema por evento (AMI) ou chamando uma URL. Um sistema web não lê a porta USB sozinho: precisa de um pequeno programa "ponte" no PC ou do app no celular.

### Cited Findings
- Bina USB ICBOX: aparece numa **porta COM** (achada no Gerenciador de Dispositivos do Windows); o programa de integração pede a porta; exige Windows 64 bits [resumo de busca + nota anterior] — [Suitable + IC Box](https://intercom.help/suitableapp/pt-BR/articles/5662187-como-integrar-o-suitable-ao-ic-box)
- Aparelhos Intelbras detectam automaticamente identificação **DTMF ou FSK**; DTMF segue a norma Telebrás SDT 220-250-713 [resumo de busca] — [Intelbras, manual ITC 4100](https://backend.intelbras.com/sites/default/files/2020-02/Manual-do-usuario_ITC%204100.pdf)
- Modem USB comum pode **não decodificar o DTMF brasileiro** (só detecta o toque) [resumo de busca] — [StarTech community](https://community.startech.com/t/usb56kemh2-does-not-decode-brazilian-dtmf-caller-id/1978)
- Gas Expert: até três binas no mesmo computador; foco não pula para nova chamada durante pedido [nota anterior] — ver `visual_telas.md`
- Bina por celular: Bina Cell PC (Wi‑Fi local, Android 4–11), "Bina System Gas" (Android), "App BS Bina" (Brazil Sistem) [notas anteriores]
- Solutio Bina identifica fixo, celular **e VoIP** [nota anterior] — [Solutio Gás](https://solutiogas.com.br/)
- Preço indireto: Ultragil cobra R$ 335 com bina contra R$ 110 sem bina (licença) [nota anterior] — ver `funcionalidades.md`
- VoIP/PABX: no FreePBX dá para (1) consultar uma API do sistema na entrada da chamada (`cidlookup`) e mostrar o nome no telefone; (2) escutar eventos do **AMI** (porta padrão 5038) num serviço que abre o popup no CRM (ex.: asterlink, conector SuiteCRM em Node.js); (3) abrir no navegador uma URL do CRM com o número [resumo de busca] — [SyncroMSP FreePBX](https://docs.syncromsp.com/freepbx-pbx-integrations); [asterlink](https://github.com/mrsykes/asterlink); [SuiteCRM Asterisk](https://store.suitecrm.com/docs/asterisk-integration-with-suitecrm/admin-guide); [FreePBX community](https://community.freepbx.org/t/call-popup-software-options/92315)

### Inferências
- Arquitetura proposta: tabela `chamadas` + um canal de tempo real "chamada_recebida" por loja. Três "fontes" gravam nela: (a) ponte local (programinha que lê a porta COM e faz POST autenticado), (b) app Android da loja (lê o estado do telefone), (c) webhook do PABX/VoIP. A tela de atendimento só escuta a tabela; não importa de onde veio.
- Como o navegador não lê porta serial do Windows de forma confiável para isso (a API Web Serial só existe no Chrome/Edge e exige o usuário escolher a porta), a ponte local é o caminho mais seguro para bina USB. Isso é inferência; não testei.
- Muitas revendas pequenas usam hoje o **celular/WhatsApp** como "telefone principal"; o app de bina no celular tende a ser mais útil que o aparelho USB. App Android que lê chamadas precisa de permissões sensíveis (estado do telefone/registro de chamadas) e a Google Play restringe essas permissões; não pesquisei a regra atual (ver Gaps).

### Gaps
- Não achei documentação do protocolo de saída das binas USB brasileiras (formato do texto enviado na porta COM); cada fabricante tem o seu.
- Não pesquisei a política atual da Google Play para permissões de registro de chamadas (CALL_LOG/READ_PHONE_STATE) em apps que não são discador padrão.
- Não achei preço atual de bina USB de 1 ou 2 linhas.

### 2.2 WhatsApp

### Takeaway
A API oficial (WhatsApp Business Platform / Cloud API, da Meta) cobra **por mensagem enviada em modelo** (marketing, utilidade, autenticação), com preço por país; respostas dentro da janela de 24 h depois que o cliente escreve eram grátis, mas **desde 1º/10/2026** as mensagens de serviço e os modelos de utilidade dentro da janela também passaram a ser cobrados (há divergência sobre uma cota grátis mensal). Fora da janela, só se pode mandar modelo aprovado. As bibliotecas não oficiais (Baileys, whatsapp-web.js, e a Evolution API no modo Baileys) são grátis, mas violam os termos e o número pode ser banido sem aviso.

### Cited Findings
**Cobrança oficial**
- Marketing, utilidade e autenticação são cobrados **por mensagem**; preço varia por país e categoria; utilidade e autenticação têm desconto por volume [resumo de busca, página oficial] — [Meta, Pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)
- Desde 1º/10/2026 a Meta cobra por mensagem os **modelos de utilidade enviados dentro da janela de 24 h**, que eram grátis desde 1º/07/2025 [resumo de busca, página oficial] — [Meta, atualização de preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/)
- As **mensagens de serviço** (respostas livres dentro da janela) também passaram a ser cobradas em 1º/10/2026, ao preço de utilidade do país [resumo de busca, fornecedores] — [Twilio](https://support.twilio.com/hc/en-us/articles/53100462475931-Notice-Changes-to-WhatsApp-s-Pricing-October-2026); [Vonage](https://api.support.vonage.com/hc/en-us/articles/29982160922268-WhatsApp-Service-Messages-Become-Billable-on-Oct-1-2026-What-You-Need-to-Know); [Courier](https://www.courier.com/blog/whatsapp-pricing-changes-october-2026)
- **Conflito**: respond.io e ManyChat falam em cota grátis de **1.000 mensagens de serviço por mês** por número; Courier diz que não há desconto por volume nas de serviço [resumo de busca] — [respond.io](https://respond.io/blog/whatsapp-pricing-change-2026); [ManyChat](https://manychat.com/blog/whatsapp-pricing-changes/); [Courier](https://www.courier.com/blog/whatsapp-pricing-changes-october-2026)
- Conversas iniciadas por anúncio "clique para WhatsApp" podem ter janela grátis de até 7 dias (desde que a empresa responda em 24 h) [resumo de busca] — idem fontes acima
- Valores em reais para o Brasil, só de terceiros e **conflitantes**: utilidade ~R$ 0,04–0,08; autenticação ~R$ 0,09–0,19; marketing ~R$ 0,31–0,39 por mensagem [resumo de busca, não confirmado] — [Message Central](https://www.messagecentral.com/blog/whatsapp-business-api-pricing-brazil); [Hyperleap](https://hyperleap.ai/whatsapp-pricing-calculator-brazil); [Salesforce rate card mai/2026](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/WhatsApp-Business-Messaging-Rate-Card-MM-Lite-May-1-2026.pdf)
- A Meta pode mudar preços até uma vez por trimestre [resumo de busca] — [Meta, atualização de preços](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages/)

**Janela de 24 h, modelos e opt-in**
- A janela abre a cada mensagem (ou ligação) do cliente e dura 24 h, renovando a cada nova mensagem; dentro dela, mensagem livre; fora, só modelo pré-aprovado [resumo de busca] — [Bird](https://bird.com/en-es/docs/knowledge-base/whatsapp/customer-service-window.md); [AWS End User Messaging](https://docs.aws.amazon.com/social-messaging/latest/userguide/send-message.html)
- Desde 15/01/2026 os termos da API Business **proíbem chatbots de uso geral** (assistentes genéricos de IA); robô de atendimento da própria empresa continua permitido [resumo de busca] — [TechCrunch](https://techcrunch.com/2025/10/18/whatssapp-changes-its-terms-to-bar-general-purpose-chatbots-from-its-platform/)
- Texto oficial da política de opt-in da Meta: **não consegui abrir** (site bloqueado); só achei descrição de fornecedor [resumo de busca] — [SleekFlow opt-in](https://help.sleekflow.io/en_US/whatsapp/whatsapp-message-opt-in)

**Bibliotecas não oficiais**
- Baileys (README): "não é afiliado, associado, autorizado, endossado [...] pelo WhatsApp"; "Não faça spam [...] desencorajamos [...] mensagens em massa ou automatizadas" [lido direto] — [WhiskeySockets/Baileys](https://github.com/WhiskeySockets/Baileys)
- Evolution API: suporta **as duas coisas** — "WhatsApp Web via Baileys" (grátis, "pode ter limitações") e a **Cloud API oficial**; licença Apache 2.0 com condições adicionais para uso comercial (ex.: exigir licença comercial em certos casos) [lido direto, README e LICENSE] — [EvolutionAPI/evolution-api](https://github.com/EvolutionAPI/evolution-api)
- Banimento é imprevisível (detecção por heurística); recomenda-se número dedicado; houve pacote npm falso do Baileys ("lotusbail") que roubava credenciais [resumo de busca, blogs de desenvolvedor — qualidade média] — [checkleaked, Cloud API x não oficial](https://whatsapp.checkleaked.cc/blog/avoid-whatsapp-ban); [Zylos](https://zylos.ai/research/2026-01-26-whatsapp-api-automation)
- O projeto aberto "depo" usa **os dois caminhos**: Cloud API (`graph.facebook.com/v25.0`, verificação `hub.verify_token`) e Evolution API (WhatsApp por QR code), com webhook protegido por chave HMAC derivada por instância; guarda o estado da conversa do robô por telefone em `conversas_whatsapp (empresa, telefone, estado jsonb)` [lido direto, código] — [depo, src/lib/whatsapp-evolution.ts](https://github.com/Solace-Inc-Team/depo)
- PopGás usa a API oficial do WhatsApp Business [nota anterior] — ver `funcionalidades.md`

### Inferências
- Para o depósito: usar a **Cloud API oficial** para avisos que o cliente pediu (pedido saiu, pedido entregue, comprovante, lembrete de recompra com aceite) e para o robô de pedidos. Custo estimado (com os valores de terceiros): 1.000 avisos de utilidade/mês ≈ R$ 40–80; 500 lembretes de marketing ≈ R$ 150–200. Confirmar na tabela oficial antes.
- Lembrete de recompra ("seu gás deve estar acabando") é provavelmente classificado como **marketing** pela Meta (custa mais) — inferência; a classificação é decidida pela Meta na aprovação do modelo.
- Guardar no banco: aceite do cliente (data, canal, texto mostrado), pedido de saída ("SAIR"), cada mensagem enviada com categoria e custo estimado, para LGPD e para controlar gasto.

### Gaps
- Tabela oficial de preços por mensagem para o Brasil em novembro/2026 (não consegui abrir a página da Meta).
- Confirmação da cota de 1.000 mensagens de serviço grátis.
- Texto oficial atual da política de opt-in da Meta.

### 2.3 Mapas, geocodificação e rotas

### Takeaway
Desde março/2025 o Google Maps trocou o crédito de US$ 200 por **cotas grátis por produto**: 10.000 chamadas/mês nos produtos "Essentials" (geocodificação, rotas básicas), depois a partir de US$ 5 por mil. Para um depósito pequeno isso cabe quase sempre na cota grátis. A alternativa aberta (OpenStreetMap com Nominatim e OSRM) é grátis, mas os servidores públicos **não podem ser usados em produção**: é preciso hospedar o próprio ou contratar um provedor.

### Cited Findings
- Cotas grátis mensais por SKU (desde 01/03/2025): **Essentials 10.000**, Pro 5.000, Enterprise 1.000; Map Tiles 2D e Street View Tiles 100.000 [resumo de busca, página oficial] — [Google, mudanças de março/2025](https://developers.google.com/maps/billing-and-pricing/march-2025); [Google, FAQ](https://developers.google.com/maps/billing-and-pricing/faq?hl=en)
- Geocodificação e Compute Routes/Route Matrix Essentials: depois de 10.000 grátis, US$ 5,00 por mil (até 100 mil), US$ 4,00, US$ 3,00, US$ 1,50 e US$ 0,38 por mil nas faixas maiores [resumo de busca, página oficial] — [Google, lista de preços](https://developers.google.com/maps/billing-and-pricing/pricing?hl=it)
- Planos por assinatura: Starter US$ 100/mês (50.000 chamadas), Essentials US$ 275 (100.000), Pro US$ 1.200 (250.000) [resumo de busca] — [Google, visão geral de preços](https://developers.google.com/maps/billing/overview/)
- Limite de pontos intermediários na rota Essentials: **conflito** entre páginas do Google (10 x 25) [resumo de busca] — [Routes usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
- Nominatim público: capacidade muito limitada, versões antigas da política falam em **no máximo 1 requisição por segundo** somando todos os usuários do app; uso além de projeto pequeno vai contra a política; para produção, servidor próprio ou provedor comercial [resumo de busca] — [Política do Nominatim](https://operations.osmfoundation.org/policies/nominatim/)
- Servidor de demonstração do OSRM: "melhor esforço, sem garantias", uso excessivo bloqueado, venda de acesso proibida, pode ser retirado sem aviso [resumo de busca] — [OSRM API Usage Policy](https://github.com/Project-OSRM/osrm-backend/wiki/API%20Usage%20Policy)
- Notas anteriores: Solutio integra com Google Maps; DistribuidorPRO faz rotas por bairro [notas anteriores]

### Inferências
- Depósito com 100 pedidos/dia ≈ 3.000 endereços/mês: geocodificar **uma vez por endereço** (guardar latitude/longitude no cadastro) fica muito abaixo de 10.000. O mapa do painel pode usar mapa grátis (Maps JavaScript/Embed têm cotas próprias, ou OpenStreetMap com Leaflet).
- Para "abrir navegação" no celular do entregador, basta um link para o Google Maps/Waze com o endereço ou coordenada — custo zero, sem API.
- Roteirização otimizada (várias entregas por saída) é luxo para depósito pequeno; a ordem pode ser decidida pelo entregador.
- CEP: guardar CEP e usar base de CEP (o "depo" tem migração `0035_cep`; o Gas Expert inclui base de CEP dos Correios).

### Gaps
- Preço atual da Route Optimization API.
- Não pesquisei preço de provedores comerciais de Nominatim/OSRM (OpenCage, LocationIQ etc.).

### 2.4 Rastreio do entregador pelo celular (app nativo x PWA)

### Takeaway
Um **PWA (site instalado) não rastreia a localização em segundo plano** de forma confiável, nem no Android nem no iPhone: quando a tela apaga ou o app vai para trás, a localização para. Para rastreio contínuo é preciso app nativo (ou híbrido) com **serviço em primeiro plano do tipo "location"** no Android 14+, declarado na Google Play. PWA basta se o rastreio for "posição no momento em que o entregador toca em algo" (aceitar, chegar, entregar).

### Cited Findings
- Service worker não tem acesso a `navigator.geolocation` (discussão W3C, 2016; sem evidência de mudança) [resumo de busca] — [W3C public-webapps](https://lists.w3.org/Archives/Public/public-webapps-github/2016Jul/0065.html)
- No iOS, web app em segundo plano fica pausado; Background Sync não é suportado [resumo de busca] — [firt.dev, iOS PWA](https://firt.dev/notes/pwa-ios/); [MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- Firefox Android: `watchPosition()` não funciona em segundo plano no Android O+ (bug fechado como "wontfix") [resumo de busca] — [Mozilla bug 1482733](https://bugzilla.mozilla.org/show_bug.cgi?id=1482733)
- Android 14 (API 34): todo serviço em primeiro plano precisa declarar o tipo; para localização, permissão `FOREGROUND_SERVICE_LOCATION` + `ACCESS_COARSE/FINE_LOCATION`, e o uso deve casar com casos permitidos (ex.: "rastreamento de atividade de veículo") [resumo de busca, página oficial] — [Android, tipos de serviço em primeiro plano](https://developer.android.com/about/versions/14/changes/fgs-types-required)
- Na Google Play é preciso declarar os tipos de serviço em primeiro plano no Play Console (App content), possivelmente com vídeo do uso [resumo de busca] — [Google Play, requisitos](https://support.google.com/googleplay/android-developer/answer/13392821)
- Apps de entregador do setor são Android (ahgas Android 5.0+; ControlGás CGMobile; Prime Entrega); GLP Digital usava PWA [notas anteriores]

### Inferências
- Proposta em duas etapas: (1) **PWA** do entregador com posição registrada a cada ação (aceitar/sair/entregar) e enquanto a tela está aberta — cobre 80% (saber onde foi a entrega, tempo de entrega); (2) se o dono quiser "ver no mapa onde está cada moto agora", empacotar o mesmo app como Android (Capacitor/TWA ou nativo) com serviço de localização em primeiro plano e notificação fixa.
- Gravar posições em tabela própria (`posicoes_entregador`) com retenção curta (ex.: 90 dias) por causa da LGPD (localização de empregado é dado pessoal).

### Gaps
- Não pesquisei a política da Google Play especificamente para `ACCESS_BACKGROUND_LOCATION` em apps de entrega.

### 2.5 PIX (API Pix do Banco Central, QR dinâmico, webhook, Pix Automático)

### Takeaway
A **API Pix** é um padrão do Banco Central que cada banco (PSP) implementa: o sistema cria uma cobrança (`/cob` imediata ou `/cobv` com vencimento) identificada por um `txid`, mostra o QR dinâmico, e o banco avisa o pagamento por **webhook** cadastrado por chave Pix, protegido por **mTLS**. Bancos podem cobrar tarifa de PJ no recebimento por QR dinâmico (cada banco define). Pix Automático (recorrência) existe desde 16/06/2025, útil para contratos mensais de P45/granel, não para venda avulsa.

### Cited Findings
- Especificação oficial (versão `2.11.0-rc1`, repositório do BCB, último commit 29/10/2026): grupos de endpoints para cobrança imediata (`/cob/{txid}`, PUT/PATCH/GET), cobrança com vencimento (`cobv`), cobranças recorrentes (`cobr`, `rec`), Pix recebidos (`GET /pix`, `GET /pix/{e2eid}`), devoluções (`PUT /pix/{e2eid}/devolucao/{id}`) e notificações (`Webhook`, `WebhookCob`, `WebhookCobV`, `WebhookRec`, `WebhookCobR`) [lido direto, `openapi.yaml`] — [bacen/pix-api](https://github.com/bacen/pix-api)
- O callback do webhook "deve ser acionado" quando chega Pix ligado a um txid e quando uma devolução chega a status final (`DEVOLVIDO`/`NAO_REALIZADO`); o SLA é de cada PSP, que pode **agrupar** vários Pix numa só chamada; o serviço é protegido por **mTLS** [lido direto, `openapi.yaml`] — [bacen/pix-api](https://github.com/bacen/pix-api)
- Novidades 2.11: status de cobrança com vencimento `CONCLUIDA_POR_OUTRO_ARRANJO` e `REMOVIDA_PELO_PSP_BOLETO`; campos de **Split Tributário** (`tributo`), `valorLiquido` [lido direto, changelog] — [bacen/pix-api changelog](https://github.com/bacen/pix-api)
- Endpoints de webhook: PUT/GET/DELETE `/webhook/{chave}` e GET `/webhook` [resumo de busca] — [laravel-psp-pix](https://packagist.org/packages/andersonav/laravel-psp-pix)
- Pix Automático lançado em 16/06/2025; BC ajustou regras operacionais em 2026 [resumo de busca] — [Agência Gov](https://agenciagov.ebc.com.br/noticias/202609/ajustes-pontuais-organizam-regras-operacionais-do-pix-automatico); [BCB, guia Pix Automático](https://www.bcb.gov.br/content/estabilidadefinanceira/pix/automatico/guia_pix_automatico.pdf)
- QR dinâmico passou de 5% (2021) para 40% (2025) das transações [resumo de busca] — idem
- Tarifas: bancos podem cobrar PJ no recebimento por QR dinâmico; exemplos (podem estar desatualizados): BB 0,99%; Bradesco 1,30% (mín. R$ 1, máx. R$ 150); Santander R$ 6,54 [resumo de busca] — [Tecnoblog](https://tecnoblog.net/418374/pix-custa-ate-r-10-para-clientes-pj-e-mei-no-itau-bb-e-santander/); [Nuvemshop](https://www.nuvemshop.com.br/blog/pix-pessoa-juridica/)
- O projeto "depo" usa **Mercado Pago** para gerar o Pix copia-e-cola do pedido (guarda `mp_payment_id`, código, valor e validade; se o total muda ou vence, gera outro), recebe aviso pelo id da cobrança, tem status de pedido `aguardando_pagamento` e campo `pix_devolver_cents` para Pix a devolver [lido direto, `src/db/schema.ts`] — [depo](https://github.com/Solace-Inc-Team/depo)
- Regra das notas anteriores: PIX declarado só vale depois de conferido no extrato [nota anterior] — ver `funcionalidades.md`

### Inferências
- Três níveis de PIX para o projeto: (1) chave/QR estático + "PIX a conferir" (grátis, manual); (2) QR dinâmico por pedido via API do banco da empresa ou intermediário (Mercado Pago, Efí, Asaas…) com baixa automática por webhook; (3) Pix Automático para clientes de contrato.
- A integração direta com a API Pix do banco exige certificado digital do banco (mTLS) guardado no servidor — fica numa função de servidor (ex.: Edge Function), **nunca** no navegador.
- Tabela `cobrancas_pix` com `txid` único, `e2eid` (quando pago), valor, status, validade, pedido; o webhook deve ser **idempotente** (o PSP pode reenviar e agrupar).

### Gaps
- Tarifas atuais de Pix PJ de bancos digitais/intermediários (Efí, Inter, Mercado Pago) em 2026.

### 2.6 Maquininhas, TEF e smart POS

### Takeaway
Para integrar cartão sem digitar valor duas vezes há dois caminhos: **TEF** (SiTef, PayGo) no balcão com pinpad, e **smart POS Android** (Moderninha Smart/PagBank, Stone, Cielo Smart/LIO), onde um app próprio roda na maquininha e chama o pagamento por SDK ou **deeplink**. A PagBank publica SDK oficial (PlugPagServiceWrapper); a Cielo publica exemplos oficiais de deeplink; para a Stone só achei bibliotecas de terceiros, e ela exige cadastro no programa de parceiros.

### Cited Findings
- PlugPagServiceWrapper (oficial PagSeguro): "biblioteca para integrar aplicativos Android com o terminal Moderninha Smart [...] utilizar a solução de pagamentos PlugPag, embarcado no POS" [lido direto, README] — [pagseguro-sdk-plugpagservicewrapper](https://github.com/pagseguro/pagseguro-sdk-plugpagservicewrapper)
- Terminais PagBank SmartPOS (A920, A930, P2, S920) rodam Android; terminal precisa de versão 3.10.x+ para o PlugPag; documentação atual em developer.pagbank.com.br [resumo de busca] — [GitHub PlugPag](https://github.com/pagseguro/pagseguro-sdk-plugpagservicewrapper); [pub.dev pagseguro_payment_tech](https://pub.dev/packages/pagseguro_payment_tech)
- Cielo: repositório oficial recomenda integração por **deeplink** (pagamento, cancelamento, impressão); terminal de testes pedido no Portal do Desenvolvedor [resumo de busca] — [Cielo LIO SDK Sample](https://github.com/DeveloperCielo/LIO-SDK-Sample-Integracao-Local)
- Stone: plugins Flutter não oficiais usam deeplink para os apps da Stone; exigem Android 5.0+ e **cadastro no programa de parcerias**; terminais como Sunmi P2, Positivo L400, Gertec GPOS 700X [resumo de busca] — [flutter_stone_payment](https://pub.dev/packages/flutter_stone_payment)
- TEF: SiTef e PayGo geram QR Pix na maquininha/pinpad [nota anterior] — [Lion Tecnologia](https://liontecnologia.com.br/tef/)
- Vendergás já roda app na maquininha (pedido + cartão/PIX + nota no aparelho) [nota anterior]

### Inferências
- Para depósito pequeno: começar **sem integração** (maquininha separada; entregador lança "cartão" e o código de autorização; conciliação depois pelo extrato da adquirente). Integrar smart POS só se a frota grande justificar: o app do entregador rodaria na própria maquininha Android (uma só tela).
- Guardar por pagamento: adquirente, bandeira, NSU/código de autorização, parcelas, taxa e data prevista de recebimento — para conciliar.

### Gaps
- Documentação oficial da Stone para integração em POS; custo de homologação/parceria.
- Taxas de cartão das adquirentes (mudam por negociação).

### 2.7 Boleto

### Cited Findings
- Asaas: R$ 1,99 por boleto **pago** (promoção de R$ 0,99 nos 3 primeiros meses); só cobra se o boleto for pago [resumo de busca] — [Asaas boleto](https://www.asaas.com/boleto-bancario); [Asaas preços](https://www.asaas.com/precos-e-taxas)
- Segundo o blog da própria Asaas, os grandes bancos cobram de R$ 6 a R$ 10 por boleto registrado (estimativa de fornecedor) [resumo de busca] — [Asaas blog, taxa de boleto](https://blog.asaas.com/taxa-de-boleto/)
- Desde 2.11 da API Pix existe status de cobrança Pix com vencimento "removida pelo PSP **boleto**", indicando boletos com QR Pix (boleto híbrido) [lido direto] — [bacen/pix-api](https://github.com/bacen/pix-api)

### Inferências
- Boleto só para clientes empresariais (fiado mensal, P45). Usar intermediário com API e webhook (como Asaas) ou API do banco; preferir **boleto híbrido** (com QR Pix) e cobrança Pix com vencimento (`cobv`), que pode substituir o boleto.

### Gaps
- Preços atuais de Efí, Inter, Sicoob, Banco do Brasil para boleto por API em 2026.

### 2.8 Emissão de NF-e/NFC-e por API

### Takeaway
Há dois modelos: **API de terceiros** (Focus NFe, NFE.io, PlugNotas/TecnoSpeed), que cuida do certificado, da comunicação com a SEFAZ, da contingência e do armazenamento, cobrando mensalidade por faixa de notas; ou **biblioteca aberta** (ACBr em Delphi/Lazarus e ACBrLib para outras linguagens; nfephp sped-nfe em PHP), grátis (LGPL) mas o próprio sistema cuida de tudo. Os preços públicos que achei são conflitantes; peça cotação.

### Cited Findings
- Focus NFe: planos sem taxa de adesão nem fidelidade; plano Enterprise sob consulta [resumo de busca, página oficial] — [Focus NFe, preços](https://focusnfe.com.br/precos/)
- Focus NFe, valores segundo concorrente (nov/2026): Solo R$ 89,90; Start R$ 113,90; Growth R$ 548 por mês [resumo de busca, fonte concorrente, não confirmado] — [Notaas, comparativo 2026](https://www.notaas.com.br/blog/post/focus-nfe-api-precos-planos-cidades-homologadas-alternativa-comparativo-notaas-2026/)
- NFE.io (página de NFC-e): valores **inconsistentes** entre páginas — um plano "básico" de R$ 220/mês e planos anuais de 2.000 notas/mês por R$ 2.640 (R$ 2.112 no anual) e 5.000 notas por R$ 4.920; outra página com 500 notas/mês por R$ 3.180 [resumo de busca, conflito] — [NFE.io, preços NFC-e](https://nfe.io/precos/emissao-nfce)
- NFE.io documenta processamento assíncrono, **idempotência** e contingência na emissão [resumo de busca] — [NFE.io, resiliência e contingência](https://nfe.io/docs/emissao-nfe-nfce-processamento-resiliencia-e-contingencia/)
- PlugNotas (TecnoSpeed): API REST para NF-e, NFS-e, NFC-e e MDF-e voltada a software houses; preço só por cotação [resumo de busca] — [TecnoSpeed PlugNotas](https://tecnospeed.com.br/en/plugdfe/plugnotas/)
- ACBr: "todos os fontes do ACBr são Código Aberto [...] licença LGPL"; ACBrLib (para usar em outras linguagens) também LGPL; suporte pago opcional (SAC, Clube Pro) [resumo de busca, site oficial] — [Projeto ACBr, fontes](https://projetoacbr.com.br/fontes/); [ACBrLib NFe](https://www.projetoacbr.com.br/acbrlibnfe)
- nfephp sped-nfe (PHP): licença **LGPL v3**; NF-e modelo 55 e NFC-e modelo 65 para **todos os estados**; NF-e com e-CPF não aceita em CE, PR e SP [lido direto, README e LICENSE] — [nfephp-org/sped-nfe](https://github.com/nfephp-org/sped-nfe)
- Desde 03/11/2025 a NFC-e não pode ser emitida para comprador com CNPJ (Ajuste SINIEF 11/2025) [resumo de busca] — ver também `conferencia_fiscal.md`
- NFC-e de GLP: CFOP 5656, grupo de combustível com código ANP obrigatório [nota anterior] — ver `funcionalidades.md` e `legal_fiscal.md`

### Inferências
- Para um sistema web com Supabase (sem servidor PHP/Delphi), a **API de terceiros** é o caminho prático: uma Edge Function chama a API, recebe o retorno (webhook) e guarda XML/DANFE. O custo de entrada fica em torno de R$ 90–250/mês para algumas centenas de notas (faixa a confirmar com cotação).
- Requisitos de dados: certificado A1 da empresa (guardado no provedor, não no navegador), CSC/ID do token da NFC-e, série e numeração por estabelecimento, cadastro fiscal do produto (NCM, CEST, código ANP, CST monofásico, unidade em kg) — ver notas fiscais.
- Modelagem: emissão **assíncrona** com estados (`pendente → autorizada / rejeitada / contingencia / cancelada / inutilizada`) e chave de idempotência por pedido, para não emitir duas notas do mesmo pedido.

### Gaps
- Preços oficiais atuais de Focus NFe, NFE.io e PlugNotas por faixa de notas.

### 2.9 Impressora térmica

### Cited Findings
- WebUSBReceiptPrinter (MIT): imprime em impressora térmica USB direto do navegador via **WebUSB**, com comandos ESC/POS ou StarPRNT; **no Windows o driver da impressora "toma" o USB**, e a alternativa é criar porta serial virtual e usar Web Serial — que **não funciona com impressoras Star** [lido direto, README] — [WebUSBReceiptPrinter](https://github.com/NielsLeenheer/WebUSBReceiptPrinter)
- QZ Tray: programa instalado que funciona como "plugin do navegador para mandar documentos e comandos brutos para a impressora"; suporte premium pago [lido direto, README] — [qzind/tray](https://github.com/qzind/tray)
- XGás imprime em impressora térmica de 58 mm [nota anterior]

### Inferências
- Caminho mais simples para depósito pequeno: imprimir pela **janela de impressão do navegador** com CSS para 58/80 mm (funciona com o driver da impressora, sem programa extra). Para impressão silenciosa e abertura de gaveta, QZ Tray ou a mesma "ponte local" da bina. No celular do entregador, impressora Bluetooth (Web Bluetooth no Android/Chrome) ou a impressora da smart POS.

### 2.10 Notificações push

### Cited Findings
- iPhone/iPad: Web Push só a partir do iOS 16.4 e **só para web app adicionado à tela de início**; HTTPS, service worker e manifest com `display: standalone`/`fullscreen`; pedido de permissão só após toque do usuário [resumo de busca, WebKit] — [WebKit, Web Push no iOS](https://webkit.org/?p=13878); [OneSignal](https://documentation.onesignal.com/docs/web-push-for-ios)
- "Declarative Web Push" (iOS/iPadOS 18.4+) dispensa service worker para exibir a notificação; no iOS 26 todo site adicionado à tela de início abre como web app [resumo de busca] — [WebKit, Meet Declarative Web Push](https://webkit.org/?p=16535)
- O "depo" usa a biblioteca `web-push` e guarda a inscrição do celular do cliente por pedido em `avisos_pedido (pedido, endpoint, p256dh, auth)`; a inscrição sai quando o pedido termina [lido direto, `schema.ts` e `package.json`] — [depo](https://github.com/Solace-Inc-Team/depo)

### Inferências
- Push web (grátis, com chaves VAPID) para o app do entregador e do atendente; WhatsApp para o cliente final (que não vai instalar web app). Som alto de "novo pedido" na tela de atendimento não precisa de push (a tela já está aberta e escuta o tempo real).

---

## 3. Projetos de código aberto (gás, água, vasilhames): o que os esquemas ensinam

### Takeaway
O projeto aberto mais completo e mais parecido com o que o depósito precisa é o **depo** (Solace-Inc-Team; o `gestao-emp` é o mesmo código): Postgres com **livro de movimentos de estoque** por estado (cheio/vazio/avariado) e por local (loja/entregador), viagens e acerto, turnos de caixa com diferença pendente, comodato com caução, fiado por pagamentos, estorno em vez de apagar, auditoria e **isolamento por empresa com RLS**. Os projetos menores guardam saldos em colunas (estoque cheio/vazio no produto, cascos devidos no cliente), o que é mais simples mas perde o histórico.

### Cited Findings
**depo / gestao-emp** (Next.js 16, React 19, Drizzle ORM, Postgres; 36 migrações) [lido direto, código] — [Solace-Inc-Team/depo](https://github.com/Solace-Inc-Team/depo); [Solace-Inc-Team/gestao-emp](https://github.com/Solace-Inc-Team/gestao-emp)
- Papéis fixos: `dono`, `atendente`, `caixa`, `entregador`.
- Pedido: estados `aguardando_pagamento` (Pix do portal), `aberto`, `em_rota`, `entregue`, `cancelado`, `estornado`; número sequencial único por empresa; `viagem` (pedidos que saíram juntos e são acertados juntos); pagamento principal + `cash_part_cents` (parte em dinheiro de pagamento misto); taxa de entrega; desconto com motivo; endereço próprio quando não é o principal; `occurrence` (tentativa frustrada); Pix conferido por quem e quando; `tracking_id` aleatório para o cliente acompanhar sem login.
- Item do pedido: `returns_empty` (cliente devolveu vazio?), `loan` (vai em **comodato** porque não tinha vazio), `delivered_quantity` (entrega parcial), preço unitário gravado.
- Estoque: `stock_movements` — "saldo = soma das movimentações; driver_id null = loja" — com `state` (`cheio`/`vazio`/`avariado`), filial, entregador, quantidade com sinal, motivo, pedido, turno, fornecedor e usuário. README: "Pedido que ainda não saiu já segura o botijão na loja. O inventário é feito de uma vez e só as diferenças viram ajuste."
- Comodato: `container_loans` com quantidade e **caução** com sinal (+ emprestou/recebeu, − devolveu); o que sai emprestado em pedido é somado dos itens, sem linha extra.
- Caixa: `shifts` (turno do entregador com troco inicial, esperado, contado, diferença, e `resolution` do dono para a diferença); `cash_entries` (repasse ao caixa ou gasto na rua) — "Nunca é editado nem apagado; o erro se corrige com estorno" (`voided_at/by/reason`).
- Fiado: saldo = fiado entregue − `customer_payments` (pagamentos anuláveis com motivo).
- Contas a pagar nascem com vencimento e só viram `expenses` quando pagas.
- `pedidos_programados` (cliente que pede a cada N dias; o sistema **não cria o pedido sozinho**: aparece para a atendente lançar).
- LGPD: `customers.anonymized_at` — dados pessoais apagados a pedido, pedidos continuam nos relatórios.
- `audit_log (empresa, usuário, ação, entidade, id, dados jsonb)` com índice por entidade para "histórico de um pedido".
- RLS (migração `0008_rls_por_empresa`): papel `app_tenant`, política `tenant_isolation` em cada tabela com `tenant_id = current_setting('app.tenant_id')::uuid` em USING e WITH CHECK.
- Índices pensados para as telas: pedidos por (empresa, status), (filial, status), (empresa, cliente, data); `uniqueIndex` de produto por `lower(nome)`.

**gas-water-system ("Gás & Água Pro")** (Next.js + Prisma + MySQL) [lido direto, `prisma/schema.prisma`] — [joaolucassilva/gas-water-system](https://github.com/joaolucassilva/gas-water-system)
- Produto com `priceRefillCents` (só o gás) e `priceCompleteCents` (gás + casco), `stockFull`/`stockEmpty` como colunas; `NeighborhoodFee` (taxa e tempo estimado por bairro); cliente com `avgConsumptionDays`, `pendingEmpties` (cascos devidos) e `creditBalanceCents` (dívida); entregador com cheios/vazios carregados; pedido com `emptyBottlesReturned`/`emptyBottlesOwed`; item com `isCompleteBottle`; `DriverSettlementLog`.

**lpg-cylinder-management** (Quênia, Prisma/Postgres, 33 migrações) [lido direto, nomes de migração] — [Onguka-dev/lpg-cylinder-management](https://github.com/Onguka-dev/lpg-cylinder-management)
- Estágios: cadastro mestre, clientes, inventário de cilindros, movimentos de inventário, venda de recarga, pedidos, vendas de campo, entregas, cobrança, **conciliação diária**, segurança, notificações, **modo offline**, integrações, auditoria; depois `CustomerCylinderCustody` (custódia do cilindro com o cliente), eventos de leitura (scan), recebimento do fornecedor, cilindros sem código.

**Outros** [lido direto, arquivos SQL] — PDV de depósito em MySQL com `clientes`, `motoristas`, `produtos`, `vendas`, `forma_pgto`, `valorpadrao` e tabelas `bkp` (cópia manual) — [assis-lucas/pdv-deposito-de-gas](https://github.com/assis-lucas/pdv-deposito-de-gas); ConspectusDigital/G-s- (previsão de recompra; lista "Reconquistar" após 45 dias) e gabbms/RevGas (Cloud API para lembretes) já descritos em `funcionalidades.md`. Os repositórios `leoncio90/distribui-ja` e `gabbms/RevGas` **não estão mais acessíveis** publicamente (o git pediu login em 25/11/2026).

### Inferências
- Lições para o projeto: (1) estoque como **livro de movimentos**, nunca saldo editável; (2) separar "estado" do vasilhame (cheio/vazio/avariado) de "local" (depósito/veículo/filial/cliente); (3) item do pedido diz se houve troca de vazio, venda do casco ou comodato — é isso que move o estoque de vazios e o saldo de cascos do cliente; (4) dinheiro do entregador também é livro (turno + lançamentos + acerto); (5) nada se apaga — anula-se com motivo; (6) `tracking_id` aleatório para link público; (7) RLS por empresa desde o primeiro dia.
- O modelo "colunas de saldo" (gas-water-system) é o que planilhas e sistemas simples fazem; serve como **cache** calculado, não como fonte.

### Gaps
- Não li o código do app de entregador offline do depo (só o README) nem a lógica de acerto em detalhe.

---

## 4. Modelo de dados de referência (PROPOSTA)

### Takeaway
Proposta de ~45 tabelas em Postgres (Supabase), todas com `empresa_id` e RLS, agrupadas em: cadastro, estoque (livro-razão), vendas/entregas, dinheiro (livro de caixa e títulos), fiscal, comunicação e segurança. Os três padrões centrais são **livro-razão de estoque** (saldo = soma), **vasilhame retornável** (cheio e vazio do mesmo tipo de botijão como "estados" de um mesmo item, mais saldo de cascos por cliente) e **partidas dobradas simples** no dinheiro (todo valor sai de uma conta e entra em outra: caixa do entregador → caixa da loja → banco).

### Cited Findings (padrões com fonte)
- Livro de movimentos com estado e local, saldo por soma, reserva na loja para pedido aberto, inventário que só lança diferenças — [depo](https://github.com/Solace-Inc-Team/depo) [lido direto]
- Comodato com caução e sinal — [depo](https://github.com/Solace-Inc-Team/depo) [lido direto]
- Anulação em vez de exclusão — [depo](https://github.com/Solace-Inc-Team/depo) [lido direto]
- Fila de sincronização offline com id gerado no aparelho — [lpg-cylinder-management](https://github.com/Onguka-dev/lpg-cylinder-management) [lido direto]
- RLS: índice em toda coluna usada na política e chamar `auth.uid()`/`auth.jwt()` dentro de `(select ...)` para ser avaliado uma vez por comando; views devem usar `security_invoker = true` (Postgres 15+) senão furam a RLS [lido direto, documentação Supabase] — [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Padrão multiempresa: coluna de empresa em toda tabela + RLS; claim da empresa no JWT evita subconsulta por linha, mas JWT fica "velho" até renovar [resumo de busca] — [Supabase, isolamento multiempresa](https://supabase.com/kb/faqs/database/multi-tenant-isolation); [RLS performance](https://supabase.com/docs/guides/database/postgres/row-level-security-performance)

### Proposta de tabelas (nomes em português, snake_case)
Convenções propostas para todas: `id uuid pk`, `empresa_id uuid not null` (RLS), `criado_em timestamptz`, `criado_por uuid`; valores em **centavos inteiros** (`_centavos`); quantidades de botijão inteiras; nada é apagado — linhas de dinheiro/estoque têm `anulado_em`, `anulado_por`, `motivo_anulacao`.

**A. Empresa e cadastro**
| tabela | campos principais | regras |
|---|---|---|
| `empresas` | razao_social, nome_fantasia, cnpj, ie, regime, uf, municipio_ibge, autorizacao_anp, plano | uma linha por cliente do sistema (multiempresa) |
| `filiais` | empresa_id, nome, cnpj, ie, endereco, serie_nfce, serie_nfe, csc_id | pedido, caixa e estoque sempre ligados a uma filial |
| `locais_estoque` | filial_id, tipo (`deposito`/`veiculo`/`transito`/`avaria`), veiculo_id, nome | todo saldo é por local; veículo é um local |
| `clientes` | nome, tipo (`pf`/`pj`/`orgao`), cpf_cnpj, ie, nascimento, observacoes, bloqueado_fiado, limite_fiado_centavos, tabela_preco_id, aceite_whatsapp_em, anonimizado_em | `unique(empresa_id, cpf_cnpj)` quando preenchido |
| `clientes_telefones` | cliente_id, numero_e164, tipo (`fixo`/`celular`/`whatsapp`), principal | **índice único (empresa_id, numero_e164)**; número guardado só com dígitos (+55DDD…) |
| `clientes_enderecos` | cliente_id, apelido (casa/trabalho), logradouro, numero, complemento, bairro, cidade, uf, cep, referencia, latitude, longitude, geocodificado_em, principal | geocodificar uma vez; um principal por cliente |
| `marcas` | nome (Ultragaz, Liquigás, Supergasbras…), cor, distribuidora_id | |
| `produtos` | nome, tipo (`glp`/`agua`/`vasilhame`/`outro`), marca_id, capacidade_kg (13, 45…), retornavel, vasilhame_produto_id, ncm, cest, codigo_anp, cfop_padrao, unidade_tributavel, ativo | **item cheio** (GLP P13) aponta para o **item vasilhame** (casco P13) via `vasilhame_produto_id` |
| `tabelas_preco` + `precos` | tabela: nome, tipo (`padrao`/`bairro`/`cliente`/`convenio`/`forma_pagamento`); preço: tabela_id, produto_id, modalidade (`troca`/`completo`/`so_casco`), valor_centavos, vigente_de, vigente_ate | preço gravado no item do pedido (não recalcula depois); taxa de entrega por bairro em `taxas_entrega (bairro, valor, minutos)` |
| `fornecedores` | nome, cnpj, distribuidora (sim/não), contato | distribuidora de GLP é fornecedor |
| `veiculos` | placa, modelo, tipo, renavam, vencimento_licenciamento, capacidade_botijoes | ligado a `locais_estoque` |
| `funcionarios` / `usuarios` | nome, papel, filial_id, entregador (sim/não), comissao, ativo; usuário ligado a `auth.users` | um login por pessoa |

**B. Estoque (livro-razão)**
| tabela | campos principais | regras |
|---|---|---|
| `movimentos_estoque` | filial_id, local_id, produto_id, estado (`cheio`/`vazio`/`avariado`), quantidade (com sinal), motivo (`venda`, `troca_vazio`, `carga_saida`, `retorno_carga`, `compra`, `devolucao_distribuidora`, `comodato_saida`, `comodato_retorno`, `avaria`, `ajuste_inventario`, `transferencia`), documento_tipo, documento_id, lote_movimento_id | **só insere**; transferência = 2 linhas com mesmo `lote_movimento_id` somando zero; saldo = `sum(quantidade)` por (local, produto, estado) |
| `saldos_estoque` (view materializada ou tabela-cache por gatilho) | local_id, produto_id, estado, quantidade | recalculável a partir do livro; nunca editada à mão |
| `inventarios` + `inventarios_itens` | data, local, contado, esperado, diferença | ao fechar, gera só os `ajuste_inventario` das diferenças |
| `vasilhames_clientes` (livro) | cliente_id, produto_vasilhame_id, quantidade (com sinal), tipo (`comodato`/`devendo_casco`/`casco_proprio_cliente`), caucao_centavos, documento | saldo de cascos por cliente = soma |
| `comodatos` | cliente_id, contrato_numero, produto_id, quantidade, caucao_centavos, inicio, fim, assinatura_url | contrato formal (P45/empresas) |

**C. Vendas e entregas**
| tabela | campos principais | regras |
|---|---|---|
| `pedidos` | filial_id, numero (sequencial por filial), cliente_id, telefone_origem, endereco_id (ou endereço copiado), canal (`telefone`/`whatsapp`/`balcao`/`app`/`marketplace`/`portal`), status (`agendado`, `aguardando_pagamento`, `aberto`, `despachado`, `entregue`, `nao_entregue`, `cancelado`, `devolvido`), agendado_para, entregador_id, carga_id, taxa_entrega_centavos, desconto_centavos, motivo_desconto, total_centavos, troco_para_centavos, codigo_acompanhamento (uuid aleatório), chamada_id, conversa_id | número único por (filial, numero); status só avança por função de servidor; total = soma itens + taxa − desconto (checado) |
| `pedidos_itens` | pedido_id, produto_id, modalidade (`troca`/`completo`/`comodato`/`sem_vazio_devendo`), quantidade, quantidade_entregue, preco_unitario_centavos, marca_entregue_id | a modalidade decide os movimentos de vazio e de cascos do cliente |
| `pedidos_eventos` | pedido_id, status_de, status_para, usuario_id, latitude, longitude, ocorrido_em, observacao | linha do tempo e tempo de entrega |
| `pagamentos` | pedido_id ou titulo_id, forma (`dinheiro`/`pix`/`debito`/`credito`/`fiado`/`boleto`/`vale`/`app`), valor_centavos, status (`declarado`/`confirmado`/`estornado`), adquirente, bandeira, nsu, autorizacao, parcelas, taxa_centavos, previsto_para, cobranca_pix_id, vale_id, recebido_por | **vários pagamentos por pedido** (pagamento dividido); soma = total do pedido |
| `cargas` (carga de saída/romaneio) | entregador_id, veiculo_id, local_id (veículo), saiu_em, voltou_em, troco_inicial_centavos, status (`aberta`/`em_acerto`/`fechada`) | ao sair: movimentos depósito→veículo |
| `acertos` | carga_id, dinheiro_esperado, dinheiro_contado, diferenca, cheios_esperados, cheios_contados, vazios_esperados, vazios_contados, resolucao, resolvido_por, conferido_por | **contagem cega**: grava o contado antes de mostrar o esperado; quem conta ≠ entregador |
| `vales` | tipo (`vale_proprio`/`vale_distribuidora`/`gas_do_povo`/`convenio`), codigo, cliente_id, produto_id, valor_centavos, emitido_em, validade, usado_em, pedido_id, repasse_status | código único; uso único |
| `pedidos_programados` | cliente_id, a_cada_dias, proxima_data, itens jsonb, pausado | não cria pedido sozinho (padrão depo) |
| `posicoes_entregador` | entregador_id, carga_id, latitude, longitude, precisao, registrado_em | retenção curta (LGPD) |

**D. Compras na distribuidora**
| tabela | campos principais | regras |
|---|---|---|
| `compras` | fornecedor_id, filial_id, numero_nf, chave_nfe, emitida_em, total_centavos, status | importar XML da NF-e de compra |
| `compras_itens` | compra_id, produto_id, quantidade, custo_unitario_centavos, vazios_devolvidos | entrada de cheios e saída de vazios para a distribuidora no mesmo documento |

**E. Dinheiro (partidas dobradas simples)**
| tabela | campos principais | regras |
|---|---|---|
| `contas_financeiras` | nome, tipo (`caixa_loja`/`caixa_entregador`/`banco`/`adquirente`/`pix_a_conferir`/`cofre`) | cada "lugar onde o dinheiro está" |
| `lancamentos_financeiros` | conta_debito_id, conta_credito_id, valor_centavos, historico, documento_tipo, documento_id, caixa_turno_id, data_competencia | **cada lançamento tem débito e crédito**; saldo da conta = entradas − saídas; anula-se com lançamento inverso |
| `caixas_turnos` | filial_id, conta_id, operador_id, aberto_em, fechado_em, valor_abertura, valor_contado_por_forma jsonb, diferenca | sangria/suprimento = lançamentos entre contas |
| `titulos_receber` | cliente_id, origem (pedido/fiado/convênio), valor, vencimento, status, boleto_id, cobranca_pix_id | fiado vira título; baixa por `pagamentos` |
| `titulos_pagar` | fornecedor_id, categoria, valor, vencimento, pago_em, lancamento_id | despesa nasce quando paga |
| `despesas_veiculos` | veiculo_id, tipo (combustível, manutenção, multa), km, valor, lancamento_id | |
| `cobrancas_pix` | txid (único), e2eid, valor, status, expira_em, pedido_id/titulo_id, psp | webhook idempotente |
| `boletos` | titulo_id, nosso_numero, linha_digitavel, pix_copia_cola, status, provedor_id | |
| `conciliacoes` | conta_id, linha_extrato (data, valor, descrição, id_banco), lancamento_id | importar OFX/CSV |

**F. Fiscal**
| tabela | campos principais | regras |
|---|---|---|
| `documentos_fiscais` | filial_id, modelo (`55`/`65`), serie, numero, chave, pedido_id/compra_id, status (`pendente`/`autorizado`/`rejeitado`/`contingencia`/`cancelado`/`denegado`), protocolo, motivo_rejeicao, xml_url, danfe_url, provedor_ref, idempotencia_chave | `unique(filial, modelo, serie, numero)`; uma nota autorizada por pedido |
| `documentos_fiscais_eventos` | documento_id, tipo (cancelamento, carta de correção, inutilização), protocolo, xml_url | |

**G. Comunicação**
| tabela | campos principais | regras |
|---|---|---|
| `chamadas` | numero_e164, linha, fonte (`bina_usb`/`app_celular`/`voip`), cliente_id, recebida_em, atendida_por, pedido_id | alimenta o popup em tempo real |
| `conversas` + `mensagens` | canal (whatsapp), telefone, cliente_id, janela_ate; mensagem: direção, tipo, modelo, categoria (`marketing`/`utilidade`/`servico`), wamid, status (enviada/entregue/lida/falhou), custo_estimado | `unique(wamid)` |
| `consentimentos` | cliente_id, finalidade (`avisos_pedido`/`lembrete_recompra`/`promocoes`), canal, aceito_em, texto_mostrado, revogado_em | prova do opt-in (LGPD e Meta) |
| `inscricoes_push` | usuario_id ou pedido_id, endpoint, p256dh, auth | |

**H. Segurança e auditoria**
| tabela | campos principais | regras |
|---|---|---|
| `papeis` + `permissoes` + `usuarios_papeis` | papel (dono, gerente, atendente, caixa, entregador, contador), permissão (`pedido.cancelar_despachado`, `desconto.acima_limite`, `estoque.ajustar`…), filial | checadas no servidor, não só na tela |
| `auditoria` | usuario_id, acao, tabela, registro_id, antes jsonb, depois jsonb, ip, ocorrido_em | gravada por gatilho; só inserção; ninguém edita |
| `sincronizacao_offline` | id_cliente (único), tipo, payload, status (`fila`/`ok`/`falhou`/`conflito`), motivo | evita duplicar pedido criado sem internet |

### Regras de integridade (proposta)
- `check (quantidade <> 0)` nos livros; `check (valor_centavos > 0)` nos lançamentos; débito ≠ crédito.
- Saldo de cheios por local não pode ficar negativo — checar na função que grava a venda/carga (não em gatilho que bloqueia o inventário).
- Pedido entregue não volta a "aberto"; mudança de status só por função `security definer` que grava `pedidos_eventos`, movimentos e lançamentos **na mesma transação**.
- Toda tabela com `empresa_id` e política RLS; filhos (itens, eventos) também têm `empresa_id` para a política ser simples e indexada.
- Telefone em formato único (E.164 só dígitos) + índice; busca instantânea por **final do número** com índice em `reverse(numero)` ou trigram (`pg_trgm`) — proposta, ver seção 5.

### Inferências
- O desenho acima cobre todos os itens pedidos; o que mais pesa no dia a dia é a regra do **item do pedido** (troca × completo × comodato × devendo casco), porque dela saem automaticamente o estoque de vazios, o saldo de cascos do cliente e o valor cobrado.
- Para um depósito pequeno, dá para começar com uma conta "caixa da loja", uma por entregador, "banco" e "PIX a conferir", e já ter partidas dobradas sem o usuário ver débito/crédito.

### Gaps
- Não validei esse modelo contra a escrituração fiscal (bloco K / livro de inventário do SPED) — ver notas fiscais.

---

## 5. Não funcionais: segurança e LGPD, cópias, auditoria, busca por telefone, RLS multiempresa

### Takeaway
Os pontos que fontes confirmam: incidente com dado pessoal deve ser comunicado à ANPD em **3 dias úteis** (prazo em dobro para agente de pequeno porte); Supabase Pro faz cópia diária com 7 dias de retenção e "volta no tempo" (PITR) é adicional pago (~US$ 100/mês); RLS precisa de índice e de chamadas embrulhadas em `select` para ser rápida; views podem furar a RLS se não usarem `security_invoker`.

### Cited Findings
- Resolução CD/ANPD 15/2024: comunicação do incidente à ANPD e aos titulares em **3 dias úteis** a partir de saber que afetou dados pessoais (quando houver risco ou dano relevante); complemento em até 20 dias úteis; **prazos em dobro para agentes de pequeno porte** (Res. CD/ANPD 2/2022) [resumo de busca] — [Contábeis](https://www.contabeis.com.br/artigos/72514/anpd-exige-notificacao-de-incidentes-de-seguranca-em-3-dias-uteis/); [Migalhas](https://www.migalhas.com.br/depeso/408328/implementacao-da-comunicacao-de-incidente-de-seguranca); [DOU via TSE](https://sintse.tse.jus.br/documentos/2024/Abr/26/diario-oficial-da-uniao-secao-1/autoridade-nacional-de-protecao-de-dados-resolucao-no-15-de-24-de-abril-de-2024-aprova-o-regulamento)
- Supabase Pro: cópias diárias com 7 dias; PITR como adicional de US$ 100/mês por janela de 7 dias (exige computação mínima "Small") [resumo de busca] — [Supabase Pricing](https://supabase.com/pricing); [Neon x Supabase](https://neon.com/guides/neon-launch-plan-vs-supabase-pro-plan)
- RLS no Supabase: indexar toda coluna filtrada pela política (só conta a primeira coluna de um índice composto); embrulhar `auth.uid()`/`auth.jwt()` em `(select ...)` para virar `initPlan` e ser calculado uma vez por comando; views criadas pelo `postgres` são `security definer` e **entregam todas as linhas** — usar `with (security_invoker = true)` [lido direto, documentação] — [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- Multiempresa: coluna `tenant_id` + RLS; claim da empresa no JWT (via hook de token, em `app_metadata`, nunca em metadado editável pelo usuário) evita subconsultas; cuidado com token grande e "velho" até renovar [resumo de busca] — [Supabase, multi-tenant](https://supabase.com/kb/faqs/database/multi-tenant-isolation); [dev.to, RLS multi-tenant](https://dev.to/kanta13jp1/supabase-rls-deep-dive-multi-tenant-design-dynamic-policies-and-performance-4adk)
- Padrão do depo: política `tenant_isolation` com `current_setting('app.tenant_id')` e papel dedicado; `anonymized_at` para pedido de exclusão; `audit_log` jsonb; tabelas da plataforma (avisos, erros) fora da RLS por não serem dado de empresa [lido direto] — [depo](https://github.com/Solace-Inc-Team/depo)
- DistribuidorPRO anuncia backup automático, perfis de acesso e auditoria na nuvem [nota anterior]

### Inferências (propostas)
- **LGPD**: base legal "execução de contrato" para cadastro/entrega e "consentimento" para lembretes de marketing; registrar consentimentos; anonimizar em vez de apagar (pedidos e notas fiscais têm guarda legal de 5 anos); retenção curta para localização e gravações; perfis com o mínimo necessário (entregador vê só as entregas dele).
- **Cópias**: além da cópia diária do Supabase, exportação diária cifrada para outro lugar (o projeto JB já tem `seg.fazer_copia()` — usar o mesmo padrão); testar restauração uma vez por mês. Para dinheiro e estoque, PITR vale o custo se o volume crescer.
- **Auditoria**: gatilho genérico gravando antes/depois em `auditoria` (só inserção, sem UPDATE/DELETE para ninguém, nem dono); somado ao princípio "nada se apaga, anula-se com motivo".
- **Busca instantânea por telefone**: guardar só dígitos com DDD (E.164); índice B-tree em `numero_e164` para bina (igualdade exata) e índice em `reverse(numero_e164)` ou `pg_trgm` para busca pelos últimos 4–8 dígitos digitados; normalizar o 9º dígito de celular. Medir: com dezenas de milhares de clientes, a busca indexada fica bem abaixo de 50 ms (estimativa, não medida).
- **RLS multiempresa**: `empresa_id` em todas as tabelas, inclusive filhas; função `minha_empresa()` estável lendo o claim e embrulhada em `(select ...)`; permissões finas por papel em funções de servidor; testes automáticos de RLS (um usuário de outra empresa não vê nada).

### Gaps
- Quotas atuais de conexões Realtime do Supabase Pro (só de terceiros).
- Não pesquisei exigências específicas de segurança para guardar certificado digital A1 (fica com o provedor de NF-e na proposta).
