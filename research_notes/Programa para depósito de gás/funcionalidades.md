# Funcionalidades de um programa para depósito de gás (revenda de GLP e água) — inventário funcional completo

> **Nota de método (ler antes de usar estas notas)**
>
> - **Como as fontes foram lidas.** Nesta sessão a abertura direta de páginas (WebFetch) foi bloqueada pela rede para os sites testados (`www.gasgestor.com.br`, `www.revgas.com.br`, `www.vendergas.com.br`, `sistemachama.com.br`, `www.sindigas.org.br`). Por isso, **tudo o que está em "Cited Findings" vem do resumo/trecho que o buscador devolveu sobre a página citada**, não da leitura integral da página. Os links são os das páginas de origem. Antes de usar um item como promessa de produto ou regra legal, vale abrir a página.
> - **Quase todas as fontes de sistemas são páginas de venda dos próprios fornecedores.** Elas provam que a funcionalidade é *anunciada* no mercado, não que funcione bem.
> - **"Inferences"** traz o desenho funcional (campos, regras e passo a passo) montado por mim a partir das fontes e da lógica do negócio. Está marcado como inferência: é proposta de requisito, não fato verificado.
> - **Nomes pedidos que não foram encontrados.** Não achei produto chamado exatamente **"GasGestor"** (o mais próximo é o **Gasgest**, gasgest.com.br) nem **"Sistema Chama"** como sistema de gestão (o **Chama** que aparece nas buscas é um aplicativo/marketplace de pedido de gás para o consumidor).
> - **Limite de buscas.** O orçamento de buscas da sessão acabou antes da última rodada (8 consultas não executadas: detalhes do acerto cego, indicadores do Solutio, Bittwork/Mastercon, G6M/abilitygás/GestGAS, blog ahgas sobre caixa, cálculo de preço do BS, manual da Caixa do Gás do Povo e ficha completa do Sebrae). Esses pontos aparecem em "Gaps".
> - Data de referência: novembro de 2026, Brasil.

---

## 1. Atendimento e registro de pedidos (disk-gás com bina, WhatsApp/chatbot, aplicativos/marketplaces, portaria/balcão)

### Takeaway
O coração de todo sistema do setor é uma tela de atendimento que identifica o cliente pelo telefone (bina ou digitação), mostra cadastro e histórico e deixa lançar o pedido na mesma tela, mandando-o direto ao celular do entregador. Em 2026 o WhatsApp (inclusive com robô de IA que lança o pedido sozinho) e os marketplaces (Appgas, Preço do Gás, Chama, app da distribuidora) convivem com o telefone; a venda de portaria tem tela própria em pelo menos um sistema.

### Cited Findings

**Canais de pedido**
- No setor, "disk gás" é o pedido por telefone repassado ao entregador mais próximo; mais recentemente os pedidos chegam também por WhatsApp, Facebook e aplicativos de celular — [Sindigás, "Minimização do custo de comercialização do GLP" (2022)](https://www.sindigas.org.br/Download/PREMIO_GLP/2022/GESTAO/MINIMIZACAO-DO-CUSTO-DE-COMERCIALIZACAO-DO-GLP.pdf)
- Existe também a "venda automática": o entregador circula com o veículo carregado pelas áreas de maior demanda e vende na rua, sem pedido prévio — [Sindigás, mesmo documento](https://www.sindigas.org.br/Download/PREMIO_GLP/2022/GESTAO/MINIMIZACAO-DO-CUSTO-DE-COMERCIALIZACAO-DO-GLP.pdf)
- Fluxo típico descrito por um sistema para distribuidoras de água e gás: o pedido chega pelo WhatsApp, o entregador sai com o gás, recebe em dinheiro e acerta no fim do dia — [gestao-emp (GitHub)](https://github.com/Solace-Inc-Team/gestao-emp)

**Bina (identificador de chamadas) e tela de atendimento**
- Cliente cadastrado que liga: aparecem todos os dados dele mais o histórico de compras. Cliente não cadastrado: o sistema oferece cadastro rápido. Nos dois casos o pedido é feito na mesma tela — [Maikonlyne / Gas Expert, página "bina"](https://www.maikonlyne.com.br/pagina/bina)
- Sem o aparelho de bina o sistema funciona igual: basta digitar o telefone ou outro dado de pesquisa do cadastro — [Maikonlyne / Gas Expert](https://www.maikonlyne.com.br/produto/2724/gas-expert-2017-software-disk-gas,-agua-e-bebidas)
- Solutio BINA identifica chamadas recebidas no telefone fixo ou no smartphone e já abre os dados do cliente no sistema — [Solutio Gás](https://solutiogas.com.br/)
- ControlGás (Magnasys): reconhecimento de chamadas, agilidade no cadastro de clientes, atendimento personalizado e localização automática do endereço — [Magnasys](https://magnasys.com.br/)
- BITTWork: localiza o cliente por até cinco números de telefone, por nome ou por endereço, e mostra histórico de compras e dados financeiros — [BITTWork](https://bittwork.com/)
- TSI/Ultragil: pedidos por telefone com identificação de chamadas (bina), comodato, histórico de compra e pagamentos por cliente; a versão com bina custa R$ 335 à vista contra R$ 110 sem bina (preço pode estar desatualizado) — [TSI Online](https://www.tsionline.com.br/index.php/sistemas/distribuidora-de-agua-e-gas)
- BS Gestão: atendimento com identificador de chamadas (BINA); a empresa tem um "App BS Bina" (bina pelo celular) — [Brazil Sistem, BS Gestão](https://brazilsistem.com.br/bs-gestao/)
- Vendergás: teleatendimento com identificação de chamadas (bina) e pedidos enviados direto ao celular do entregador — [Sistema Vendergás](https://sistemavendergas.com.br/)
- RevGás integra app de entregadores e identificador de chamadas; publicou artigos defendendo o uso de bina ainda em 2026 — [RevGás](https://revgas.com/), [RevGás, "Utilizar BINA em 2026 ainda vale a pena?"](https://revgas.com/utilizar-bina-em-2024-ainda-vale-a-pena-para-revendas-de-gas/)
- Solutio lista "histórico detalhado de pedidos, preço exclusivo por cliente e formas de pagamento preferenciais" no cadastro do cliente — [Solutio Gás](https://solutiogas.com.br/)
- Gas Expert e BS Gestão trazem cadastro completo de clientes e banco de CEP para agilizar novos cadastros — [Maikonlyne](https://www.maikonlyne.com.br/produto/2724/gas-expert-2017-software-disk-gas,-agua-e-bebidas), [BS Gestão](https://brazilsistem.com.br/bs-gestao/)

**WhatsApp e robô (chatbot/IA)**
- PopGás: a IA atende os clientes no WhatsApp, tira dúvidas e lança o pedido direto no sistema; o robô consulta estoque e financeiro em tempo real; usa a API oficial do WhatsApp Business e modelos da OpenAI e da Anthropic. O módulo de IA/WhatsApp/App Web é vendido como premium (+R$ 199,90/mês sobre plano base de R$ 99,90/mês; valores do site do fornecedor) — [PopGás](https://www.popgas.com.br/), [PopGás, Tech & IA](https://www.popgas.com.br/recursos/tech-ia)
- Telesys lista "Pedidos pelo WhatsApp" como módulo — [Telesys](https://www.telesys.com.br/)
- Brazil Sistem tem módulos separados "BS Tele" (telefone), "BS Whats" (WhatsApp), "BS Pedidos", "BS Entregador" e "BS Financeiro", integrados entre si, e envia notificações por WhatsApp — [Brazil Sistem, BS Pedidos](https://brazilsistem.com.br/aplicativos/aplicativo-bs-pedidos/), [Brazil Sistem](https://brazilsistem.com.br/)
- Paralela vende "sistema de pedidos com IA" específico para revendas de gás e água — [Paralela](https://paralela.ai/segmentos/revendas-gas-agua/)
- GasNow Revenda se posiciona como "o plantão que a sua revenda não tem" (atendimento automático fora de hora) — [GasNow Revenda](https://gasnow.com.br/revenda)

**Portaria / balcão**
- O Vendergás tem uma área de pedidos exclusiva para a portaria — [Sistema Vendergás](https://sistemavendergas.com.br/)
- Sistemas genéricos de PDV (Sigeflex) cobrem a venda de balcão com abertura, sangria, suprimento e fechamento de caixa — [Sigeflex, módulo de vendas](https://sigeflex.com/modulos/vendas)

**Aplicativos e marketplaces de terceiros**
- Preço do Gás: a revenda se cadastra e recebe pedidos em um aplicativo próprio para revendas; não há mínimo de vendas; paga uma taxa por venda vinda do app; pode aceitar ou recusar o pedido conforme a capacidade (matéria de 2022) — [Jornal do Brasil](https://www.jb.com.br/economia/marcas/2022/10/1040264-aplicativo-preco-do-gas-forma-facil-de-comprar-gas-de-cozinha.html)
- Appgas: sem mensalidade, taxa de entrada ou multa; "só paga quando vende"; o dinheiro das vendas cai em D+1; há painel para organizar pedidos e gerenciar entregas; os entregadores usam o app "Appgas Entregador" para receber e aceitar pedidos, ver histórico e rotas — [Appgas, revendedores](https://appgas.com/revendedores), [Appgas Entregador (App Store)](https://apps.apple.com/us/app/id1505557035)
- Chama: aplicativo que conecta consumidores a revendedores; mostra apenas revendas registradas na ANP; adotou pagamento dentro do app — [Canaltech](https://canaltech.com.br/apps/gas-de-cozinha-mais-proximo-aplicativo/), [Adyen](https://www.adyen.com/pt_BR/imprensa-e-midia/chama-adota-pagamento-via-aplicativo-para-entrega-de-gs)
- Nacional Gás lançou app para venda de botijões pelas revendas ("iFood do botijão"), que já seria seu principal canal de vendas em fase de teste, com meta de alcançar as mais de 6 mil revendas até o fim de 2026 — [Baguete](https://www.baguete.com.br/noticias/nacional-gas-cria-aplicativo-para-revenda-de-botijoes), [NeoFeed](https://neofeed.com.br/negocios/nacional-gas-cria-o-ifood-do-botijao-a-espera-do-boom-de-consumo-do-gas-de-cozinha/)

**Status, agendamento e baixa**
- PopGás usa os status: confirmado, pagamento recebido, saiu para entrega, entregador chegando, entregue e cancelado; quando o pedido sai, o cliente recebe um link de acompanhamento — [PopGás](https://www.popgas.com.br/)
- Mastercon controla entregas "não iniciadas, em trânsito ou entregues" — [Rogercon, Mastercon](https://www.rogercon.com.br/sistema-mastercon-para-distribuidora-de-gas-e-agua-com-emissao-fiscal-sat-nfce)
- ahgas oferece agendamento de pedidos — [ahgas, serviços](https://ahgas.com.br/servicos/)
- PopGás baixa o estoque automaticamente ao confirmar o pedido e gera a NF-e na conclusão; RevGás dá baixa no estoque assim que a venda é finalizada — [PopGás, Essencial](https://www.popgas.com.br/recursos/essencial), [RevGás](https://revgas.com/)

### Inferences

**1.1 Cadastro mínimo que a tela de atendimento precisa mostrar (proposta)**
- Vários telefones por cliente (fixo, celular, WhatsApp; o BITTWork anuncia até cinco) e vários endereços por cliente (casa, trabalho, sítio). Regra: a busca por telefone deve achar qualquer um deles.
- Endereço com rua, número, complemento, bairro, cidade, **ponto de referência** e observação fixa de entrega ("portão azul", "cachorro bravo", "tocar no vizinho"). Não achei fonte que cite o campo "ponto de referência" pelo nome, mas é indispensável para o entregador; marcar como requisito inferido.
- Bloco "última compra": data, produto, quantidade, preço, forma de pagamento e entregador. Botão **"repetir último pedido"** (um clique).
- Produto habitual, marca do vasilhame que o cliente tem em casa, tipo de cliente (residencial, comércio, indústria, condomínio, revenda/ponto de venda), tabela de preço aplicada.
- Situação financeira: fiado em aberto, limite de crédito, bloqueio; vasilhames em comodato/pendentes de devolução.
- Previsão de quando o gás acaba (ver seção 5).

**1.2 Passo a passo — pedido por telefone (disk-gás)**
1. O telefone toca; a bina envia o número; o sistema abre um aviso (popup) com o nome do cliente ou "número novo". Com várias linhas, cada chamada vira um cartão na fila.
2. Atendente confirma endereço e ponto de referência. Se número novo: cadastro rápido (nome, endereço, referência) na mesma tela.
3. Sistema sugere o produto habitual e o preço conforme a tabela (bairro, tipo de cliente, forma de pagamento — seção 4).
4. Atendente pergunta e marca: quantidade; **troca** (cliente devolve vazio) ou **completo** (leva também o casco); marca do vazio que o cliente vai devolver; forma de pagamento; **"troco para quanto?"**; se quer nota com CPF; observações.
5. Se o cliente tem fiado vencido ou está bloqueado, o sistema avisa e pede senha de quem tem permissão para liberar.
6. Salva: o pedido entra como "aberto" na fila de despacho (seção 2). Opcional: mensagem automática de confirmação no WhatsApp.
7. Pedido agendado (para data/hora futura) fica fora da fila e entra sozinho no horário combinado, com alerta ao atendente.

**1.3 Passo a passo — pedido por WhatsApp**
1. Mensagem chega; o sistema identifica o cliente pelo número.
2. Atendente (ou robô) confirma endereço e produto; o robô só deve fechar sozinho pedidos simples (cliente conhecido, endereço conhecido, produto padrão) e passar para um humano quando houver dúvida, reclamação, endereço novo ou fiado.
3. O pedido cai na mesma fila do telefone, marcado com a origem "WhatsApp".
4. O cliente recebe confirmações automáticas: pedido aceito, saiu para entrega (com nome do entregador e, se houver, link de acompanhamento), entregue.

**1.4 Passo a passo — venda de portaria/balcão**
1. Cliente chega com o vazio (ou sem). Operador escolhe produto e quantidade.
2. Marca troca ou completo e a marca do vazio recebido.
3. Preço de portaria (normalmente menor que o de entrega, pois não há frete — inferência de prática de mercado).
4. Recebe (dinheiro, PIX, cartão, vale), emite NFC-e se configurado, imprime ou envia comprovante.
5. Baixa imediata: −1 cheio, +1 vazio (da marca informada) no estoque do depósito; entrada no caixa do turno.

**1.5 Marketplaces e app da distribuidora**
- Mínimo viável: lançar manualmente o pedido com origem "Appgas/Preço do Gás/Chama/app da companhia", com forma de pagamento "pago no aplicativo" e conta a receber contra a plataforma (repasse em D+1 no caso do Appgas, segundo o próprio site), para a conciliação bater. Integração automática por API não foi confirmada em nenhuma fonte.

**1.6 Status do pedido (proposta consolidada)**
Aberto → (Agendado) → Despachado/atribuído → Aceito pelo entregador → Saiu para entrega → Chegando → Entregue → Acertado (entrou no acerto do entregador). Saídas laterais: Cancelado (com motivo), Não entregue/ocorrência (cliente ausente, endereço não localizado, sem troco, cliente desistiu), Devolvido.

**1.7 Regras de cancelamento (proposta)**
- Motivo obrigatório (lista fixa + texto), com usuário, data e hora gravados.
- Antes do despacho: qualquer atendente cancela. Depois de despachado: só com permissão, e o entregador é avisado no app. Depois de entregue: não cancela; faz-se devolução/estorno, que mexe em estoque, caixa e nota fiscal.
- Relatório de cancelados por motivo, atendente e entregador (controle de fraude: pedido cancelado mas entregue "por fora").

**1.8 Venda automática (rua)**
- O entregador registra no app a venda feita na rua sem pedido prévio; o sistema cria o pedido já "entregue", tenta casar com cliente existente pelo telefone e baixa da carga do veículo.

### Gaps
- Não encontrei descrição técnica de como a bina se conecta (aparelho USB por linha, central PABX/VoIP, app no celular que captura a chamada). Sabe-se apenas que existem versões para fixo e para smartphone (Solutio, BS).
- Nenhuma fonte confirmou integração automática (API) entre sistemas de gestão e marketplaces; taxas por venda dos marketplaces não são publicadas.
- Não encontrei tutoriais do YouTube nem manuais/central de ajuda com telas detalhadas (a central `suporte.revgas.com` existe, mas não pôde ser aberta).
- Não foi possível confirmar em fonte os campos "ponto de referência", "troco para quanto" e "repetir último pedido"; são inferências de uso.

---

## 2. Entrega e despacho (atribuição a entregadores, rotas, mapa/GPS, app do entregador, comprovante, tempos, carga e acerto do entregador, comissões)

### Takeaway
Os sistemas atuais mandam o pedido ao aplicativo do entregador, mostram todos os entregadores no mapa em tempo real e sugerem o mais próximo; alguns medem tempo médio de entrega, km rodado e produtividade. O ponto mais crítico do negócio é o **acerto (prestação de contas) do entregador**: conferir, por pessoa, o que saiu, o que voltou cheio, os vazios trazidos e o dinheiro/PIX/cartão/fiado recebido — o modelo mais rigoroso é o "fechamento cego", em que o entregador declara e o sistema aponta a diferença.

### Cited Findings

**Despacho, mapa e aplicativo**
- RevGás: mostra a posição de cada entregador em tempo real durante a rota e envia o entregador mais próximo a cada novo pedido — [RevGás](https://revgas.com/)
- PopGás: rastreamento por GPS de todos os entregadores no mapa; distribuição de rotas por prazo ou por melhor rota; link de acompanhamento enviado ao cliente; app do entregador para Android e iPhone — [PopGás](https://www.popgas.com.br/)
- Atende Fácil (Gestão Gás): localização ao vivo de todos os entregadores; relatórios de quilômetros rodados, tempo médio de entrega e produtividade da equipe; pedido vai ao app do entregador com um toque; entregador abre a rota no Google Maps ou no Waze — [Atende Fácil](https://www.atendefacilia.com.br/gest%C3%A3o-g%C3%A1s)
- GestGAS: app do entregador com GPS e confirmação de entrega; mostra a localização exata de cada entregador e qual entrega está fazendo; app incluso na assinatura — [GestGAS](https://gestgas.com/)
- Solutio Gás: integração com Google Maps, localização em tempo real de entregadores e clientes, acompanhamento do status do pedido e localização do entregador mais próximo — [Solutio Gás](https://solutiogas.com.br/)
- System Gas: o app do entregador reúne pedidos, mapa, navegação, status e **controle de carga** — [System Gas](https://systemgas.com.br/)
- DistribuidorPRO: rotas de entrega por bairro, **romaneio e conferência de retorno**, fechamento de rotas, medição de entregas no prazo (OTIF) e app do entregador que baixa a rota e sincroniza depois (uso sem internet) — [DistribuidorPRO](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- ahgas: otimização de rotas de entrega, rastreamento e acompanhamento de entregadores — [ahgas, serviços](https://ahgas.com.br/servicos/)
- Telesys vende o rastreio por GPS como adicional pago — [Telesys](https://www.telesys.com.br/)
- Vendergás: localização em tempo real dos entregadores e mapa de calor de vendas — [Sistema Vendergás](https://sistemavendergas.com.br/), [Vendergás](https://vendergas.com.br/)
- RevGás: o entregador pode emitir NFC-e pelo app (enviando ao cliente por WhatsApp), ajustar a forma de pagamento e navegar com mapas — [RevGás, atualizações](https://revgas.com/melhores-atualizacoes-da-revgas-para-este-ano-para-sua-revenda/)
- Vendergás: aplicativo integrado à maquininha — lança o pedido, recebe em crédito, débito ou PIX e emite a nota fiscal no próprio aparelho; as vendas aparecem em tempo real para o gestor — [Vendergás](https://vendergas.com.br/)
- Uma lista de requisitos publicada por uma empresa do setor (anúncio de projeto no Workana, não produto pronto) pede: controle de estoque, painel de gestão, aplicativo para entregadores e localização do entregador mais próximo — [Workana](https://www.workana.com/pt/job/sistema-para-nossos-revendores)

**Acerto / prestação de contas do entregador**
- Modelo descrito por sistema aberto para água e gás: o entregador **abre o turno com troco**; no fim, **quem conta o dinheiro e fecha o acerto é o caixa ou o dono — o próprio entregador não consegue fechar**; **PIX só conta como recebido depois que alguém confere no extrato**; a contagem separa **cheios, vazios e avariados**, no depósito e com cada entregador; sem registro por pessoa, "quando o dinheiro não bate ninguém sabe se faltou uma entrega, um troco ou um botijão" — [gestao-emp (GitHub)](https://github.com/Solace-Inc-Team/gestao-emp)
- "Fechamento cego de caixa": o entregador declara valores e cascos e o sistema aponta as quebras; controle de cheios e vazios em poder dos motoqueiros, com **bloqueio por inadimplência de cascos** — [Gás & Água Pro (GitHub joaolucassilva/gas-water-system)](https://github.com/joaolucassilva/gas-water-system)
- BS Gestão lista "acerto de contas" entre os módulos — [Brazil Sistem, BS Gestão](https://brazilsistem.com.br/bs-gestao/)
- Regra de conferência de vasilhames: "se o número de vazios no depósito não bate com o de vendas, há botijão ou galão que saiu sem a troca" — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)
- Venda fiada não é entrada de caixa (o dinheiro só existe quando o cliente paga); misturar formas de pagamento torna o fechamento do dia uma conferência manual cuja diferença ninguém explica — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)

**Comissões e custo da entrega**
- Mastercon tem controle de comissão para entregadores — [Rogercon, Mastercon](https://www.rogercon.com.br/sistema-mastercon-para-distribuidora-de-gas-e-agua-com-emissao-fiscal-sat-nfce)
- CODEC Gás anuncia comissão automática por vendedor — [CODEC Gás](https://www.codec.com.br/codec-gas.php)
- O custo por entrega inclui, além do combustível: comissão, manutenção, pneus, seguro, depreciação e hora trabalhada — [RevGás, "Rotas inteligentes"](https://revgas.com/rotas-inteligentes-como-economizar-dinheiro-e-lucrar-com-entregas-de-gas/)
- RevGás tem relatório de desempenho dos entregadores — [RevGás](https://revgas.com/)

### Inferences

**2.1 Painel de despacho (proposta)**
- Fila de pedidos abertos ordenada por tempo de espera, com cor de alerta ao passar do prazo prometido (ex.: 30 min).
- Lista de entregadores com situação (livre, em rota, em pausa, fora do turno), carga atual do veículo (cheios por tipo) e pedidos em mãos.
- Mapa com pedidos e entregadores; sugestão do mais próximo **que tenha o produto na carga**.
- Atribuir um ou vários pedidos de uma vez (rota); reatribuir; devolver à fila.
- Regra: sem app, o despacho funciona por rádio/telefone/WhatsApp e o atendente muda o status manualmente; o sistema não pode depender de o entregador ter celular bom.

**2.2 Aplicativo do entregador (proposta de funções)**
- Entrar com senha; abrir turno; ver a carga recebida e confirmar ("recebi 12 P13 cheios e R$ 100 de troco").
- Receber pedido com som; aceitar/recusar; ver endereço, referência, observações, valor, forma de pagamento e troco a levar; botão de abrir navegação; botão de ligar/WhatsApp para o cliente.
- Marcar: saiu, chegou, entregue. Na entrega: confirmar forma de pagamento (pode mudar na hora), valor recebido, **vasilhame recolhido (tipo e marca) ou "não devolveu casco"**, foto/assinatura/nome de quem recebeu (comprovante), ocorrência se não entregou.
- Registrar venda de rua (sem pedido), despesa autorizada (combustível, com foto do cupom) e recebimento de fiado antigo.
- Ver o próprio resumo do dia (quantidade entregue, comissão prevista), sem poder fechar o próprio acerto.
- Funcionar sem sinal e sincronizar depois (o DistribuidorPRO anuncia isso).

**2.3 Passo a passo — carga de saída (início do turno)**
1. Responsável pelo depósito abre a "saída" do entregador/veículo: data, turno, veículo, km inicial.
2. Lança cheios por tipo/marca entregues ao entregador, acessórios levados (reguladores, mangueiras, águas) e **troco inicial** em dinheiro.
3. Sistema transfere o estoque do local "depósito" para o local "veículo/entregador X" (nada é vendido ainda).
4. Entregador confirma (assinatura no app ou no papel impresso — romaneio de carga).
5. Durante o dia: **recargas** (leva mais cheios, deixa vazios) são novos lançamentos na mesma saída, cada um conferido.

**2.4 Passo a passo — acerto de retorno (fim do turno), modelo cego**
1. Entregador volta. O conferente conta e lança **o que voltou fisicamente**: cheios por tipo, vazios por tipo e marca, avariados, acessórios não vendidos.
2. Entregador entrega e o caixa conta **o dinheiro**; lança também comprovantes de cartão, PIX declarados, vales/tíquetes recolhidos (vale-gás, Gás do Povo, convênio) e notas de fiado assinadas.
3. Só depois de gravar a contagem o sistema mostra o **esperado**:
   - Cheios vendidos por tipo = saída + recargas − cheios devolvidos.
   - Vazios esperados por tipo = cheios vendidos − vendas "completo" (com casco) − entregas em comodato + vazios recolhidos de comodato encerrado. Diferença = casco faltando (cliente que não devolveu, cadastrado como pendência do cliente, ou falta do entregador).
   - Valor total esperado = soma dos pedidos entregues + vendas de rua, por forma de pagamento.
   - Dinheiro esperado = vendas em dinheiro + troco inicial + fiados antigos recebidos em dinheiro − despesas autorizadas − sangrias entregues durante o dia.
4. Sistema mostra as diferenças: **falta/sobra de dinheiro, falta de vasilhame, PIX ainda não conferido, cartão sem comprovante, pedido sem baixa**.
5. Supervisor decide cada diferença: corrigir lançamento (com motivo), lançar como **vale/débito do entregador**, ou aceitar como quebra (perda) com senha.
6. Fechamento: estoque do veículo volta ao depósito; dinheiro entra no caixa do turno; fiado vira contas a receber do cliente; cartão/PIX viram valores a conferir na conciliação; comissão do entregador é calculada; imprime-se o recibo do acerto assinado pelos dois.
7. Regra de trava: não se abre nova saída para um entregador com acerto anterior em aberto (equivalente ao "bloqueio por inadimplência de cascos" citado na fonte).

**2.5 Comissão do entregador (proposta de regras configuráveis)**
- Valor fixo por unidade entregue, diferente por produto (P13, P45, água, acessório).
- Valor diferente para venda de rua, venda "completo" (com casco), cliente novo conquistado e cliente reativado.
- Desconto ou perda de comissão em pedido cancelado por culpa do entregador; bônus por meta mensal.
- Relatório por período para a folha de pagamento. A forma de descontar faltas de caixa do salário tem regras trabalhistas — confirmar com o contador (não pesquisado).

**2.6 Indicadores de entrega (proposta)**
- Tempo entre pedido e despacho; entre despacho e entrega; tempo total; % dentro do prazo (o DistribuidorPRO chama de OTIF); entregas por hora e por entregador; km por entrega; % de cancelados e de não entregues por motivo.

### Gaps
- Não encontrei, em fonte de fornecedor comercial, a tela ou o passo a passo detalhado do acerto do entregador (apenas menções: "acerto de contas" no BS Gestão, "conferência de retorno" no DistribuidorPRO). O passo a passo acima é inferência apoiada em dois projetos abertos.
- Não encontrei dados sobre valores ou modelos reais de comissão por botijão praticados no mercado.
- Não foram pesquisadas as regras trabalhistas (adicional de periculosidade do entregador, desconto de quebra de caixa, motofrete/curso para transporte de GLP). Uma fonte sobre periculosidade apareceu só pelo título: [Lopes Bahia Advogados](https://lopesbahia.com.br/direito-trabalhista/periculosidade-do-entregador-de-gas-botijao-direito/).
- "Comprovante de entrega" (foto/assinatura) só aparece como "confirmação de entrega" (GestGAS); o formato não foi detalhado em nenhuma fonte.

---

## 3. Controle de vasilhames (botijões e galões): cheios x vazios, por tipo, marca, local; venda com/sem casco; comodato; outras marcas; avariados; compra da distribuidora

### Takeaway
Vasilhame é patrimônio que circula: o sistema precisa manter dois saldos por produto (cheio e vazio), separados por marca e por local (depósito, cada veículo/entregador, cada filial, em poder de cliente em comodato, avariados). A regra operacional central é "um cheio sai, um vazio volta"; toda exceção (venda com casco, comodato, cliente que não devolveu) precisa virar um registro. Na compra, a distribuidora só entrega cheios contra a mesma quantidade de vazios, e por norma da ANP a revenda recebe do consumidor vazios de qualquer marca, cabendo à distribuidora a destroca.

### Cited Findings

**Regras do negócio**
- Para retirar botijões cheios na distribuidora é preciso ter a mesma quantidade de botijões vazios; os vazios devem ficar armazenados separados dos cheios — [Ultragaz Revendas, dicas de gestão](https://www.ultragazrevendas.com.br/gerindo-uma-revenda-de-gas-confira-as-dicas/)
- Segundo a ANP, no atendimento ao consumidor os revendedores devem receber recipientes vazios de qualquer marca de distribuidor; a Resolução ANP nº 957/2023 dispõe que cabe ao distribuidor efetuar a destroca dos vazios de outra marca — [ANP, perguntas frequentes do revendedor de GLP](https://www.gov.br/anp/pt-br/acesso-a-informacao/perguntas-frequentes/agente-economico/revendedor-de-glp)
- A norma prevê a obrigação de receber a devolução de recipientes cheios, parcialmente usados ou vazios, de marca própria ou de terceiros, que tenham avarias, vazamentos ou estejam fora do prazo de requalificação, **sem ônus ao revendedor** (pelo trecho, a obrigação é do distribuidor; conferir no texto integral) — [Resolução ANP nº 957/2023 (Lex)](https://www.lex.com.br/resolucao-anp-no-957-de-5-de-outubro-de-2023/)
- É vedada a comercialização de recipientes cheios com pessoa jurídica não autorizada a revender GLP — [Resolução ANP nº 957/2023 (Lex)](https://www.lex.com.br/resolucao-anp-no-957-de-5-de-outubro-de-2023/)
- Desde o "novo padrão", o revendedor escolhe ser **independente** (pode vender botijões de qualquer marca) ou **vinculado** a uma única distribuidora; o vinculado só compra cheios do distribuidor cuja marca exibe — [ANP, novo padrão para revendas de GLP](https://www.gov.br/anp/pt-br/assuntos/distribuicao-e-revenda/revendedor/novo-padrao-para-revendas-de-glp), [Resolução ANP nº 958/2023 (Lex)](https://www.lex.com.br/resolucao-anp-no-958-de-5-de-outubro-de-2023/)
- Existem centros de destroca onde as distribuidoras trocam entre si os botijões recolhidos de outras marcas (fonte secundária) — [Blog Preço do Gás](https://blog.precodogas.com.br/posso-comprar-gas-com-botijao-de-outra-marca/)
- A revenda não pode vender botijão cheio fora do prazo de requalificação (o blog atribui a regra a uma resolução da ANP de 2014; número a conferir) — [Blog Appgas](https://blog.appgas.com/botijao-de-gas-tem-validade/)
- A troca pode ser recusada quando o botijão vazio está amassado, enferrujado ou sem identificação (fonte de baixa confiabilidade, voltada ao Gás do Povo) — [AuxilioGas](https://www.auxiliogas.com/revenda-do-gas-do-povo-pode-exigir-botijao-vazio-entenda-o-porque/)

**O que os sistemas anunciam**
- TSI/Ultragil controla vasilhames cheios ou vazios e comodato — [TSI Online](https://www.tsionline.com.br/index.php/sistemas/distribuidora-de-agua-e-gas)
- Sigeflex: "controle digital rigoroso de vasilhames (cheios vs vazios)" — [Sigeflex](https://sigeflex.com/segmentos/deposito-agua-gas)
- System Gas: controla cascos e acompanha entradas, saídas, retornos e cargas — [System Gas](https://systemgas.com.br/)
- DistribuidorPRO: estoque de cheios/vazios, controle de comodato, troca de botijão e retorno de vasilhames — [DistribuidorPRO](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- ahgas: controle de estoque por movimentação e por **inventário rotativo**, cruzamento de vendas com movimentações, ajuste de inventário, **estoque teórico x estoque real**, gestão de comodatos por cliente incluindo vasilhames, múltiplos depósitos e **transbordo entre filiais** — [ahgas, serviços](https://ahgas.com.br/servicos/)
- ControlGás controla o estoque da empresa e das filiais separadamente — [ControlGás](https://controlgas.com.br/)
- Mastercon controla vasilhames emprestados — [Rogercon, Mastercon](https://www.rogercon.com.br/sistema-mastercon-para-distribuidora-de-gas-e-agua-com-emissao-fiscal-sat-nfce)
- BS Gestão: controle de estoque e comodatos — [Brazil Sistem, BS Gestão](https://brazilsistem.com.br/bs-gestao/)
- Distribuí Já (aberto): na venda há uma opção que indica se o cliente devolveu o casco vazio; se não devolveu, o sistema gera automaticamente uma pendência — [Distribuí Já (GitHub)](https://github.com/leoncio90/distribui-ja)
- Gás & Água Pro (aberto): controla cheios e vazios em poder dos motoqueiros — [Gás & Água Pro (GitHub)](https://github.com/joaolucassilva/gas-water-system)
- Actana e o projeto acadêmico GLP Manager: estoque em tempo real com alertas de reposição — [Actana](https://actana.com.br/sistema-para-distribuidoras-de-gas), [GLP Manager (CPS, 2025)](https://ric.cps.sp.gov.br/bitstream/123456789/47983/1/ADS_2025_1_DanielFernandesDeLima_GlpManager.pdf)
- Fórmula simples de planilha: cheios = estoque inicial + compras − vendas, com vazios controlados à parte — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)
- RevGás tem artigo próprio sobre inventário e movimentação de estoque — [RevGás](https://revgas.com/como-gerenciar-inventario-e-movimentacao-de-estoque/)

**Comodato**
- Comodato de botijões é o empréstimo do vasilhame sem custo, condicionado à compra contínua na mesma empresa; o cliente não adquire a propriedade; é legal desde que bem documentado e controlado; em planilha fica inviável quando a revenda cresce — [ControlGás, artigo sobre comodato](https://controlgas.com.br/comodato-de-botijoes-de-gas-como-funciona-riscos-e-como-controlar-com-eficiencia/)
- Uma revenda oferece o casco do P45 em comodato com contrato e controla o consumo pela média para agendar as cargas — [Capitalgás, comodatos](https://capitalgas.com.br/comodatos/)

**Compra da distribuidora (carga)**
- App "Minha Revenda" da Nacional Gás (exclusivo para revendas da marca): consultar crédito disponível, agendar pedidos de GLP, acompanhar pedidos e histórico, cancelar pedido ainda não faturado, repetir pedido anterior, pedido com mais de um produto, faturas (2ª via, pagamento por boleto ou PIX), relatório de compras com preço médio mensal, **extrato de devoluções** e faturas em aberto — [Minha Revenda Nacional Gás (App Store)](https://apps.apple.com/br/app/minha-revenda-nacional-g%C3%A1s/id6462193646)

**Água mineral (garrafão retornável)**
- Garrafões retornáveis de 10 e 20 litros têm validade de três anos (portarias do DNPM de 2008/2009; hoje o órgão é a ANM — conferir norma vigente); os fabricantes são responsáveis por substituir os vasilhames vencidos; a data de fabricação fica no fundo ou perto do bico — [A Tarde](https://atarde.com.br/economia/galoes-de-agua-mineral-tem-validade-de-tres-anos-345241), [Reclame Aqui Notícias](https://noticias.reclameaqui.com.br/noticias/galoes-retornaveis-de-agua-mineral-tem-3-anos-de-validade-fi_1616/), [Jusbrasil (DNPM)](https://www.jusbrasil.com.br/noticias/dnpm-troca-de-garrafoes-de-agua-vencidos-e-dever-dos-fabricantes/2023210)
- Um blog de distribuidora afirma validade de "até um ano" para o garrafão, o que **contradiz** as fontes acima; não usar — [Moskogás](https://moskogas.com.br/blog/qual-a-validade-da-agua-mineral/)

### Inferences

**3.1 Modelo de dados proposto**
- **Produto com vasilhame**: tipo (P2, P5, P8, P13, P20, P45, P90, água 10 L, água 20 L), peso líquido, marca. Cada produto tem saldo **cheio** e saldo **vazio**.
- **Marca**: marca(s) própria(s) da revenda (da distribuidora com quem trabalha) e **"outras marcas" (OM)** — pode ser uma linha só "OM" ou uma por marca; os vazios OM não servem diretamente para carregar na distribuidora, então precisam ser vistos em separado.
- **Local de estoque**: depósito (por filial), veículo/entregador, cliente (comodato), avariados/aguardando devolução à distribuidora, em trânsito entre filiais.
- **Movimentos** (todos com data, usuário e documento de origem): compra (carga), venda troca, venda completo, saída para entregador, retorno de entregador, transferência entre filiais, comodato (saída/retorno), compra de casco usado, venda de casco, destroca OM, baixa por avaria/perda, ajuste de inventário.

**3.2 Regras por tipo de operação (o que mexe em quê)**

| Operação | Cheios | Vazios | Financeiro |
|---|---|---|---|
| Venda **troca** (cliente devolve vazio) | −1 | +1 (da marca recebida) | preço do gás |
| Venda **completo** (com casco) | −1 | 0 | preço do gás + preço do casco |
| Venda troca **sem devolução na hora** | −1 | 0 e cria **pendência de casco** do cliente | preço do gás; pode cobrar caução |
| Cliente devolve casco pendente | 0 | +1 e baixa a pendência | devolve caução, se houve |
| **Comodato** — entrega | −1 (vai para "em poder do cliente") | 0 | preço do gás; contrato |
| Comodato — recarga | −1 | +1 | preço do gás |
| Comodato — encerramento | 0 | +1 (ou cobra o casco) | cobrança se não devolver |
| Compra de casco vazio avulso | 0 | +1 | despesa/estoque |
| **Carga da distribuidora** | +N | −N (vazios entregues) | contas a pagar |
| Carga com casco novo (compra de vasilhame) | +N | 0 | gás + vasilhame |
| Avaria/vazamento | −1 cheio (ou −1 vazio) → +1 "avariado" | | crédito da distribuidora ao devolver |
| Destroca OM | | −N OM, +N marca própria | eventual taxa |

**3.3 Passo a passo — compra da distribuidora e descarga do caminhão**
1. Pedido de carga (pelo app/portal da distribuidora ou vendedor): quantidades por tipo; o sistema sugere a quantidade com base no giro e no saldo de vazios disponíveis (não adianta pedir mais cheios do que vazios da marca).
2. Separar os vazios que vão embarcar (por tipo e marca); registrar OM que irão para destroca.
3. Chegada do caminhão (ou ida do veículo da revenda à base): conferir nota fiscal x físico — cheios recebidos por tipo, lacre/marca, peso por amostragem na balança, avariados recusados.
4. Lançar a entrada: + cheios; − vazios entregues; diferença de vazios vira saldo devedor/credor de vasilhames com a distribuidora (o app da Nacional Gás tem "extrato de devoluções", o que indica que a distribuidora acompanha esse saldo).
5. Lançar a nota em contas a pagar (boleto com vencimento) e atualizar o **custo médio** do produto.
6. Devolver à distribuidora os avariados/fora de requalificação e registrar o crédito.

**3.4 Passo a passo — inventário (contagem)**
1. Contagem diária rápida ao abrir e ao fechar: cheios e vazios por tipo no depósito.
2. Sistema compara com o saldo teórico (o ahgas chama de estoque teórico x real) e mostra a diferença.
3. Diferença exige justificativa e senha para ajustar; fica no histórico.
4. Equação de controle: (cheios + vazios + em veículos + em comodato + avariados) por tipo deve ser constante, mudando só por compra/venda de casco, perda ou destroca.

**3.5 Comodato e pendências de casco (proposta)**
- Contrato por cliente: tipo e quantidade emprestada, data, prazo, valor de reposição do casco, consumo mínimo esperado, termo assinado (anexo/foto).
- Tela "vasilhames em poder de clientes": quem tem, quantos, desde quando, última compra. Alerta de comodato parado (cliente com casco emprestado sem comprar há X dias — risco de ter trocado de fornecedor).
- Caução (depósito em dinheiro pelo casco): registrar como valor a devolver, não como receita.

**3.6 Avariados e requalificação**
- Motivos: vazamento, amassado, ferrugem, sem lacre, fora do prazo de requalificação, peso abaixo.
- Reclamação do cliente (botijão vazando ou "veio com pouco gás"): abrir ocorrência, trocar o produto, mover o devolvido para "avariados", pedir ressarcimento à distribuidora.

**3.7 Alertas**
- Estoque mínimo de cheios por tipo (sugestão de pedir carga); excesso de vazios OM; veículo com carga não acertada; divergência de inventário acima do limite.

### Gaps
- Nenhum sistema pesquisado mostrou, nas fontes, controle explícito de vazios por marca/"outras marcas" — é requisito inferido da regra da ANP e da prática de carga.
- Não encontrei as regras atuais das distribuidoras sobre proporção de OM aceita na carga, taxa de destroca ou prazo de requalificação aplicado ao revendedor.
- Limites de armazenamento por classe (NBR 15514) não foram obtidos; o sistema poderia alertar quando o estoque passa da capacidade autorizada, mas os números precisam ser conferidos na norma e no certificado da revenda.
- Não encontrei fonte sobre controle de garrafões de água por marca/fonte nem sobre recusa de garrafão vencido na troca dentro de sistemas.

---

## 4. Preços: tabelas, descontos, vale-gás (próprio, de distribuidora, de convênio e programa Gás do Povo), promoções e fidelidade

### Takeaway
Os sistemas anunciam preço exclusivo por cliente, preço médio por produto e "gestão de vale gás e vendas antecipadas", mas nenhuma fonte detalha tabelas por bairro ou forma de pagamento — isso é prática de mercado (frete por distância, desconto no PIX/dinheiro) que o programa deve suportar por configuração. O item mais novo e regulado é o **Gás do Povo** (substituto do Auxílio Gás): o vale é validado eletronicamente na revenda credenciada pela Caixa, a revenda recebe o preço de referência do estado em D+2 e não pode cobrar nada além de frete combinado e vasilhame.

### Cited Findings

**Preço e desconto nos sistemas e no mercado**
- Solutio Gás: preço exclusivo por cliente, formas de pagamento preferenciais e cálculo de preço médio por produto — [Solutio Gás](https://solutiogas.com.br/)
- Vendergás tem relatório de preço médio — [Sistema Vendergás](https://sistemavendergas.com.br/)
- Cada revenda define a própria margem; a taxa de entrega pode ser grátis, fixa ou variar com a distância/bairro; há desconto para pagamento em PIX ou dinheiro (fontes de consumo, qualidade variável) — [Blog Appgas, preço do gás](https://blog.appgas.com/preco-do-gas-de-cozinha/), [Saber Tecnologias](https://sabertecnologias.com.br/conteudo/tabela-de-preco-do-botijao-de-gas-veja-quanto-custa)
- A ANP não tabela o preço do GLP comercial; o valor do P45 varia por distribuidora, volume e região — [Guia Combustíveis ANP (site privado)](https://www.combustiveis-anp.com.br/guia/glp-p45-preco-botijao-comercial)
- Um site de marketing afirma que o art. 25 da Resolução ANP 958/2023 exige painel com o preço praticado na entrada e balança aferida disponível ao consumidor (não confirmado no texto oficial) — [Arte com Pimenta](https://artecompimenta.com.br/solucoes/trafego-pago/revenda-de-gas)

**Vale-gás e venda antecipada**
- BS Gestão anuncia "gestão de vale gás e vendas antecipadas" — [Brazil Sistem, BS Gestão](https://brazilsistem.com.br/bs-gestao/)
- Vale Gás da Ultragaz (cupom comprado antecipadamente): o cliente precisa ter um botijão vazio de qualquer marca para a troca e tem até 185 dias para usar o cupom — [Ultragaz, Vale Gás](https://www.ultragaz.com.br/gas/vale-gas/)
- Consulta fiscal antiga de Minas Gerais descreve a "pré-venda do GLP" por vale-gás: contrato de intermediação com distribuidoras, supermercados e outros estabelecimentos que repassam os vales; protocolo de entrega dos vales; na troca, emite-se a nota fiscal de venda ao consumidor, anexando o vale e o cupom — [Consulta de Contribuinte SEFAZ-MG nº 295/2006 (LegisWeb)](https://www.legisweb.com.br/legislacao/?id=299204)

**Programa Gás do Povo (governo federal)**
- É a política que substitui o Auxílio Gás; o benefício é um vale-recarga do botijão de 13 kg, não é dinheiro nem documento físico; a adesão das revendas é voluntária e exige situação "autorizada" na ANP — [gov.br, serviço Programa Gás do Povo](https://www.gov.br/pt-br/servicos/programa-gas-do-povo), [Caixa, Gás do Povo](https://www.caixa.gov.br/gasdopovo), [Ultragaz, FAQ para revendedores](https://www.ultragaz.com.br/wp-content/uploads/2025/11/Perguntas-Frequentes-Programa-Gas-do-Povo-Revendedores.pdf)
- A validação é eletrônica, na revenda habilitada, no momento da compra: cartão do Bolsa Família com chip + senha; cartão de débito da Caixa + senha; ou CPF do responsável + código enviado por SMS ao celular cadastrado; também há validação por aplicativo. O cartão serve apenas para confirmar que a pessoa é beneficiária — [Agência Gov, perguntas e respostas](https://agenciagov.ebc.com.br/noticias/202510/perguntas-respostas-saiba-como-vai-funcionar-programa-gas-do-povo), [gov.br, Ministério das Mulheres](https://www.gov.br/mulheres/pt-br/central-de-conteudos/noticias/2026/outubro-defeso-eleitoral/gas-do-povo-saiba-como-consultar-e-usar-o-vale-recarga-de-gas-de-cozinha)
- O revendedor recebe o valor das transações integralmente em **D+2 dias úteis** na conta cadastrada na adesão; o menu do Gás do Povo aparece no dispositivo em até D+1 após a ativação; a adesão tem permanência mínima de três meses — [Caixa, Manual Operacional do Revendedor (v.7, out/2026)](https://www.caixa.gov.br/empresa/programa-gas-do-povo/Documents/Manual-Operacional-Gas-do-Povo-Revendedor.pdf)
- O valor por recarga considera a UF da família, com base no preço de referência do Ministério de Minas e Energia, divulgado nos sites do MME e da ANP — [Caixa, Manual Operacional do Revendedor](https://www.caixa.gov.br/empresa/programa-gas-do-povo/Documents/Manual-Operacional-Gas-do-Povo-Revendedor.pdf)
- A revenda **não pode cobrar valores adicionais**, exceto o vasilhame vazio (quando a família não o fornece) e o frete para entrega em local combinado — [Caixa, Manual Operacional do Revendedor](https://www.caixa.gov.br/empresa/programa-gas-do-povo/Documents/Manual-Operacional-Gas-do-Povo-Revendedor.pdf)
- Famílias de 2 ou 3 pessoas recebem até 4 vales por ano (validade de 3 meses cada); famílias de 4 ou mais, até 6 por ano (validade de 2 meses cada) — [Caixa, FAQ beneficiários](https://www.caixa.gov.br/programas-sociais/programa-gas-do-povo/Documents/Perguntas-Frequentes-Programa-Gas-do-Povo-Beneficiarios.pdf); **conflita** com notícia de que a recarga liberada em 10/10/2026 tinha prazo de retirada até 9/11/2026 — [Mix Vale](https://www.mixvale.com.br/2026/10/19/gas-do-povo-em-outubro-de-2026-tem-recarga-liberada-no-dia-10-e-prazo/)
- Um blog cita preços de referência de 2026 de R$ 107,02 (SP) e R$ 93,16 (RJ), com base em portaria interministerial MME/MF; conferir na fonte oficial — [Blog Agibank](https://blog.agibank.com.br/vale-gas/)
- Em 19/11/2026 foi noticiada uma mudança no programa (só o título foi visto; conteúdo não lido) — [Correio do Estado](https://correiodoestado.com.br/extra/2026/11/19/governo-confirma-mudanca-em-programa-gas-do-povo-e-beneficiarios-sao-avisados-com-antecedencia.html)

**Promoções e fidelidade**
- Cartão fidelidade: após 10 botijões, desconto no 11º, recarga grátis ou brinde — [RevGás, 5 ações para fidelizar](https://revgas.com/5-acoes-para-fidelizar-clientes-de-gas-de-cozinha-glp/)
- Programa de indicação "Vizinho Amigo": quem indica ganha R$ 5,00 de crédito quando o vizinho indicado faz a primeira compra; o novo cliente ganha um brinde — [RevGás, promoções sem queimar margem](https://revgas.com/es/como-criar-promocoes-sem-queimar-a-sua-margem-de-lucro/)
- Brinde a cada entrega (pano de prato, pote plástico) é estratégia recorrente — [Magnasys, como fidelizar](https://magnasys.com.br/como-fidelizar-clientes-em-sua-revenda-de-gas/)

### Inferences

**4.1 Estrutura de preço proposta (ordem de prioridade, da mais específica para a mais geral)**
1. Preço de contrato/negociado do cliente (empresa, P45, condomínio).
2. Preço do convênio/vale (empresa parceira, Gás do Povo = preço de referência da UF).
3. Tabela por tipo de cliente (residencial, comercial, ponto de revenda).
4. Tabela por canal (portaria x entrega) e por zona/bairro (pode ser preço cheio diferente ou "taxa de entrega" separada).
5. Ajuste por forma de pagamento (desconto em dinheiro/PIX, acréscimo no cartão de crédito ou fiado).
6. Preço padrão do produto.
- Regras: toda tabela com data de início (histórico de reajustes — o preço muda quando a distribuidora reajusta); desconto manual acima de um limite pede senha e fica registrado; preço mínimo abaixo do qual não se vende; relatório de preço médio praticado por produto, canal e entregador.
- Preço do **casco** separado do preço do **gás**, por tipo.

**4.2 Vale-gás próprio / venda antecipada / convênio com empresas (passo a passo proposto)**
1. Cadastro do convênio: empresa pagadora, preço combinado, prazo de faturamento, quem pode retirar.
2. Emissão dos vales: numerados (ou com código/QR), produto, validade, lote. Venda antecipada: a empresa paga na emissão (ou é faturada no fim do mês).
3. O dinheiro recebido antecipado fica como **obrigação a entregar**, não como venda de produto (o estoque ainda não saiu).
4. Resgate: cliente pede e informa o vale; atendente/entregador digita ou lê o código; sistema confere se existe, se não foi usado e se está na validade; baixa o vale; baixa o estoque; emite a nota no momento da entrega (como descrito na consulta de MG).
5. Entregador devolve os vales físicos recolhidos no acerto (conta como "forma de pagamento vale", conferido por número).
6. Relatórios: vales emitidos x resgatados x vencidos por convênio; saldo a entregar.

**4.3 Vale de distribuidora (ex.: Vale Gás Ultragaz) — proposta**
- Tratar como forma de pagamento "vale da companhia": na entrega registra-se o código; gera valor a receber da distribuidora (ou abatimento na próxima carga); conciliar com o extrato da distribuidora.

**4.4 Gás do Povo no sistema (passo a passo proposto)**
1. Atendente marca o pedido como "Gás do Povo" (produto P13, quantidade 1).
2. Sistema fixa o preço do gás no preço de referência da UF e bloqueia acréscimos, deixando lançar só frete combinado e casco (regra do manual da Caixa).
3. Na entrega/portaria, a validação é feita **fora do sistema**, no dispositivo/aplicativo habilitado pela Caixa (cartão + senha ou CPF + código). O operador anota o número do comprovante no pedido.
4. Gera conta a receber da Caixa com vencimento D+2 dias úteis.
5. Conciliação: conferir o crédito na conta; relatório mensal de recargas Gás do Povo (quantidade, valor, pendentes).
6. O sistema deve permitir atualizar o preço de referência quando o governo publicar novo valor.

**4.5 Fidelidade e promoções (proposta)**
- Contador de compras por cliente (a cada N, desconto ou brinde); crédito por indicação com abatimento automático no próximo pedido; cupom com validade; brinde com controle de estoque (panos, potes); campanha por bairro/período; relatório de custo da promoção x vendas geradas.

### Gaps
- Nenhuma fonte de fornecedor detalha como funciona, na tela, a "gestão de vale gás e vendas antecipadas" (BS Gestão).
- Não confirmei tabelas de preço por bairro ou por forma de pagamento em nenhum sistema; só "preço exclusivo por cliente" (Solutio).
- Gás do Povo: não obtive o passo a passo completo do manual da Caixa (qual maquininha/aplicativo, estorno, comprovante), o preço de referência vigente por UF, nem o conteúdo da mudança noticiada em 19/11/2026. Há conflito entre fontes sobre a validade do vale (2–3 meses x cerca de 30 dias).
- Não há fonte sobre integração de sistemas de gestão com a validação da Caixa; presumo que seja manual.
- Regras de convênio com empresas (vale-gás corporativo) atuais não foram encontradas além da consulta de MG de 2006.

---

## 5. Clientes / CRM: previsão de recompra, reativação, mensagens automáticas, inativos, clientes comerciais/industriais e P45

### Takeaway
A previsão de recompra é o recurso de CRM mais específico do setor: como o consumo de gás é regular, os sistemas calculam o intervalo médio entre compras de cada cliente e avisam (ou mandam WhatsApp sozinhos) pouco antes de o gás acabar; quem passa muito do prazo vai para uma lista de reconquista. Para clientes comerciais/P45, o padrão é contrato de comodato e programação de cargas pela média de consumo.

### Cited Findings
- Cálculo simples: intervalo de recompra = média dos dias entre as compras; próxima compra prevista = data da última compra + intervalo; se o cliente não comprou até essa data, entrar em contato; a recorrência pode ser sugerida a partir de duas ou mais compras — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)
- Referência de consumo citada: um P13 a cada 25 dias por família, mas o histórico de cada cliente é o melhor parâmetro (o resumo da busca atribui o número a um "sindicato" sem nomear a fonte; conferir) — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)
- G6M: estima o ciclo com base em pelo menos duas compras entregues do mesmo produto com vasilhame; o fornecedor avisa que a previsão é aproximada — [G6M](https://www.g6m.app/)
- Vendergás tem relatório de previsão de compra do cliente — [Sistema Vendergás](https://sistemavendergas.com.br/)
- ahgas lista previsão de consumo de cada cliente — [ahgas, serviços](https://ahgas.com.br/servicos/)
- GasNow: sabe de quanto em quanto tempo cada cliente compra e o chama de volta na hora certa pelo WhatsApp; oferece também balança sob o botijão que mede o gás restante e avisa quando está acabando — [GasNow Revenda](https://gasnow.com.br/revenda)
- Leads360 (CRM): lembretes automáticos por WhatsApp programados pelo tempo médio de consumo do cliente; material sobre recuperar clientes que pararam de pedir — [Leads360, CRM para revendedora de gás](https://leads360.com.br/crm-para-revendedora-de-gas/), [Leads360, recuperar clientes](https://leads360.com.br/recuperar-clientes-pararam-pedir-gas/)
- Projeto aberto: calcula quando o botijão de cada cliente deve acabar e avisa a loja para chamar o cliente antes que compre de outro; clientes que passam do prazo (padrão: 45 dias de atraso) vão para uma lista "Reconquistar", com mensagem diferente — [ConspectusDigital/G-s- (GitHub)](https://github.com/ConspectusDigital/G-s-)
- Outro projeto aberto usa a API oficial (Cloud API) da Meta para lembretes de recompra e alertas ao dono, e prevê que o cliente possa cancelar os lembretes — [gabbms/RevGas (GitHub)](https://github.com/gabbms/RevGas)
- Gasgest: o controle de clientes mostra quem já comprou e o histórico de pedidos — [Gasgest](https://gasgest.com.br/)
- App da Nacional Gás para revendas deveria incluir histórico de compras e consumo por cliente (anúncio de lançamento; verbo no futuro) — [Baguete](https://www.baguete.com.br/noticias/nacional-gas-cria-aplicativo-para-revenda-de-botijoes)
- No nível das distribuidoras há trabalhos de predição individual de consumo residencial com inteligência artificial (só o título foi visto) — [Sindigás, Prêmio GLP 2019](https://www.sindigas.org.br/Download/PREMIO_GLP/2019/GESTAO/PREDICAO%20INDIVIDUAL%20DE%20CONSUMO%20DE%20GLP%20RESIDENCIAL%20ATRAVES%20DE%20INTELIGENCIA%20ARTIFICIAL.pdf)
- Clientes empresariais: revendas oferecem contrato de fornecimento com previsibilidade e nota fiscal; casco de P45 em comodato com contrato e cargas agendadas pela média de consumo — [Moskogás, contrato para empresas](https://moskogas.com.br/blog/contrato-de-fornecimento-de-gas-para-empresas/), [Capitalgás, comodatos](https://capitalgas.com.br/comodatos/)
- Um mapa de vendas por rua (Solutio) e um mapa de calor de vendas (Vendergás) mostram onde estão os clientes — [Solutio Gás](https://solutiogas.com.br/), [Vendergás](https://vendergas.com.br/)

### Inferences

**5.1 Regra de previsão de recompra (proposta)**
- Por cliente **e por produto**: intervalo = média (ou mediana, para ignorar exceções) dos dias entre as últimas 3 a 6 compras.
- Compra de 2 unidades de uma vez dobra o intervalo esperado.
- Cliente com uma só compra: usar intervalo padrão configurável por produto (ex.: P13 residencial ≈ 25–45 dias; conferir com dados próprios).
- Data prevista = última compra + intervalo. Faixas: "vai acabar em até N dias" (N configurável, ex.: 3), "venceu" (passou da data), "atrasado" (passou muito — provável compra em concorrente), "inativo" (sem compra há X dias, ex.: 90).
- A previsão se recalcula a cada compra; o atendente pode corrigir manualmente (casa de veraneio, cliente que viaja).

**5.2 Passo a passo — rotina diária de recompra**
1. Todo dia o sistema monta a lista "clientes que devem pedir hoje/nos próximos dias".
2. Envio automático (se o cliente aceitou receber mensagens) de WhatsApp: "Seu gás deve estar acabando. Quer que a gente leve hoje? Responda SIM".
3. Resposta "SIM" cria o pedido (ou abre a conversa para o atendente).
4. Quem não respondeu aparece para ligação ativa do atendente no dia seguinte.
5. Resultado registrado (pediu, não quis, já comprou de outro, número errado) para medir a campanha.

**5.3 Reativação e listas**
- Filtros: inativos há X dias, por bairro, por produto, por entregador que atendia, por valor comprado; exportar lista; envio em lote com modelo de mensagem e cupom de retorno.
- Cuidados: guardar o aceite do cliente para receber mensagens e respeitar o pedido de parar (opção de sair); limitar volume por dia; usar a API oficial do WhatsApp para reduzir risco de bloqueio do número (os dois projetos abertos e o PopGás citam a API oficial).

**5.4 Mensagens automáticas por evento**
- Pedido confirmado; saiu para entrega; entregue + agradecimento; pesquisa de satisfação; lembrete de fiado a vencer/vencido; aniversário; aviso de reajuste; lembrete de validade de regulador/mangueira (5 anos após a instalação registrada — ver seção 8).

**5.5 Clientes comerciais, industriais e P45**
- Cadastro com CNPJ, inscrição estadual, contato de compras, horário de recebimento, local de instalação (central de gás), quantidade de cilindros instalados e de reserva.
- Contrato: preço negociado, reajuste, prazo de pagamento (boleto faturado), consumo mínimo, comodato dos cilindros.
- **Programação de visitas/cargas** pela média de consumo (como faz a Capitalgás) e alerta "cliente P45 sem carga há X dias".
- NF-e (e não NFC-e) para contribuinte do ICMS (ver seção 7).
- Histórico de consumo em kg por mês e margem por cliente.

### Gaps
- Nenhuma fonte informa a taxa de acerto real das previsões nem números de retorno de campanhas de reativação.
- A origem do dado "um P13 a cada 25 dias por família" não ficou clara.
- Não pesquisei as regras da LGPD nem as políticas atuais do WhatsApp Business para mensagens de marketing; os cuidados acima são inferência.
- Não encontrei detalhes de como sistemas tratam contratos de clientes industriais (medição, granel, P190) — fora do escopo de botijão.

---

## 6. Financeiro: caixa por turno, fiado/contas a receber, boletos, PIX, maquininhas/TEF, contas a pagar, conciliação, DRE, custo por botijão, margem, despesas de veículos

### Takeaway
Os sistemas do setor anunciam caixa, fiado, boletos, contas a pagar/receber, conciliação bancária, DRE e dezenas de relatórios; a novidade é a maquininha "inteligente" que lança o pedido, recebe cartão/PIX e emite a nota no mesmo aparelho. A regra de ouro que as fontes repetem: fiado não é caixa, PIX só vale depois de conferido, e as formas de pagamento precisam ficar separadas para o fechamento bater.

### Cited Findings
- BS Gestão: controle de contas, acerto de contas e controle bancário com contas conciliadas; "BS Pag" é a máquina de cartão integrada — [Brazil Sistem, BS Gestão](https://brazilsistem.com.br/bs-gestao/)
- Vendergás: aplicativo integrado à maquininha (lança pedido, recebe crédito, débito ou PIX, emite nota no aparelho); emissão de boletos; NFC-e, NF-e e CT-e — [Vendergás](https://vendergas.com.br/), [Sistema Vendergás](https://sistemavendergas.com.br/)
- ahgas: controle de boletos e fluxo de caixa — [ahgas, serviços](https://ahgas.com.br/servicos/)
- Telesys: relatórios financeiros e controle de fiado — [Telesys](https://www.telesys.com.br/)
- PopGás: fechamento automático de caixa — [PopGás](https://www.popgas.com.br/)
- Vendergás, Solutio Gás e GestGAS citam DRE ou controle financeiro — [Sistema Vendergás](https://sistemavendergas.com.br/), [Solutio Gás](https://solutiogas.com.br/), [GestGAS](https://gestgas.com/)
- ControlGás: financeiro, estoque, vendas e emissão de NF-e — [ControlGás](https://controlgas.com.br/)
- Gasgest: controle financeiro, comprovantes e relatórios — [Gasgest](https://gasgest.com.br/)
- Caixa em PDVs genéricos: abertura, sangria, suprimento e fechamento com conferência automática (Sigeflex); fechamento informando o valor contado em cada forma de pagamento e mostrando a diferença, e QR Code PIX na tela com a venda só avançando após a confirmação (GestãoClick); abertura/sangria/fechamento com aprovação do gerente e boleto/PIX/link de pagamento com baixa automática (Flagy) — [Sigeflex](https://sigeflex.com/modulos/vendas), [GestãoClick](https://gestaoclick.com.br/sistema-pdv/), [Flagy](https://flagy.com.br/)
- TEF: SiTef e PayGo geram o QR Code PIX na maquininha ou no pinpad — [Lion Tecnologia](https://liontecnologia.com.br/tef/)
- PIX só conta como recebido depois que alguém confere no extrato — [gestao-emp (GitHub)](https://github.com/Solace-Inc-Team/gestao-emp)
- Venda fiada não é entrada de caixa; o dinheiro só existe quando o cliente paga — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)
- Fluxo de caixa é a diferença entre recebimentos (vendas) e pagamentos (despesas) em um período — [Ultragaz Revendas, dicas de gestão](https://www.ultragazrevendas.com.br/gerindo-uma-revenda-de-gas-confira-as-dicas/)
- Exemplo ilustrativo (não é dado de mercado): margem de R$ 17,00 por P13 cai para cerca de R$ 13,00 ao descontar R$ 4,00 de custo de entrega — [PlanilhasTech](https://planilhastech.com/como-controlar-revenda-de-gas-e-agua/)
- Custo da entrega: combustível, comissão, manutenção, pneus, seguro, depreciação e hora trabalhada — [RevGás, "Rotas inteligentes"](https://revgas.com/rotas-inteligentes-como-economizar-dinheiro-e-lucrar-com-entregas-de-gas/)
- Brazil Sistem publicou guia de como calcular o preço do botijão e o lucro real (conteúdo não lido) — [Brazil Sistem](https://brazilsistem.com.br/calcular-preco-botijao-de-gas/)
- App da distribuidora mostra faturas em aberto, 2ª via e pagamento por boleto ou PIX, além do preço médio mensal de compra — [Minha Revenda Nacional Gás](https://apps.apple.com/br/app/minha-revenda-nacional-g%C3%A1s/id6462193646)
- Marketplaces repassam o valor das vendas em D+1 (Appgas); o Gás do Povo paga em D+2 dias úteis — [Appgas](https://appgas.com/revendedores), [Caixa, Manual do Revendedor](https://www.caixa.gov.br/empresa/programa-gas-do-povo/Documents/Manual-Operacional-Gas-do-Povo-Revendedor.pdf)

### Inferences

**6.1 Caixa por turno (proposta)**
- Um caixa por operador/turno/filial: abertura com fundo de troco contado; suprimento; sangria (retirada para cofre/banco, com comprovante); recebimentos de portaria; entradas dos acertos de entregadores; pagamentos pequenos em dinheiro (despesas de caixa); fechamento com contagem por forma de pagamento; diferença registrada (falta/sobra) com justificativa; reabertura só com senha de gerente.
- Cada entregador é, na prática, um "caixa móvel" que se fecha no acerto (seção 2.4).

**6.2 Formas de pagamento a cadastrar**
- Dinheiro; PIX (chave/QR fixo; QR dinâmico com confirmação automática se houver integração bancária); cartão de débito; cartão de crédito (com taxa e prazo de recebimento por bandeira/adquirente); fiado (a prazo); boleto; vale-gás próprio; vale da distribuidora; convênio/faturado; Gás do Povo; pago em aplicativo (marketplace); cheque (ainda existe no interior — inferência).
- Regra: cada forma tem destino contábil próprio (caixa, banco, a receber de cliente, a receber de adquirente, a receber da Caixa/plataforma).

**6.3 Fiado / contas a receber (passo a passo proposto)**
1. Cliente precisa estar marcado como "pode comprar fiado", com limite e prazo (ex.: 30 dias ou "dia do pagamento").
2. Venda fiada gera título no nome do cliente, com o entregador e o pedido de origem; no acerto, o entregador entrega a nota assinada.
3. Bloqueio automático de novo fiado se houver título vencido ou limite estourado (liberação com senha).
4. Recebimento: total ou parcial; no depósito ou pelo entregador (entra no acerto dele); juros/multa opcionais; recibo.
5. Cobrança: lista de vencidos por dias de atraso; mensagem automática de lembrete; histórico de contatos.
6. Relatórios: posição do fiado por cliente, por entregador, por vencimento; perdas (baixa como incobrável com senha).

**6.4 Boletos e PIX**
- Boleto para clientes empresariais (emissão com registro no banco, retorno automático de pagamento, 2ª via por WhatsApp/e-mail).
- PIX: mínimo = registrar "PIX declarado" e conferir depois no extrato (regra da fonte); ideal = QR dinâmico por pedido com baixa automática.

**6.5 Cartões e maquininhas**
- Mínimo: lançar a venda como cartão (bandeira, débito/crédito, parcelas, NSU do comprovante) e calcular taxa e data prevista de crédito.
- Ideal: aplicativo na própria maquininha (como o Vendergás anuncia) ou TEF na portaria; conciliar vendas x extrato da adquirente.

**6.6 Contas a pagar**
- Notas da distribuidora (gás e vasilhames), fornecedores de água e acessórios, aluguel, folha, comissões, impostos, combustível, manutenção, taxas (ANP, bombeiros, alvará), parcelas de veículos. Agenda de vencimentos, pagamento parcial, anexos de comprovantes, centro de custo (filial, veículo).

**6.7 Conciliação bancária**
- Importar extrato (arquivo OFX) ou digitar; casar com lançamentos (PIX, depósitos de sangria, créditos de cartão, repasses da Caixa/marketplaces, boletos pagos, débitos); apontar o que está no banco e não no sistema e vice-versa.

**6.8 Custo, margem e DRE (proposta de cálculo)**
- **Custo do gás por unidade**: custo médio ponderado das cargas (valor da nota + frete de compra ÷ unidades).
- **Margem bruta por unidade** = preço de venda − custo do gás − impostos sobre a venda − taxa do cartão/aplicativo.
- **Margem de contribuição por entrega** = margem bruta − comissão − custo de entrega estimado (combustível e manutenção rateados por entrega ou por km).
- **DRE gerencial mensal**: receita bruta por linha (gás por tipo, água, acessórios, cascos, fretes) → (−) impostos e devoluções → (−) custo das mercadorias → margem bruta → (−) despesas com entrega (comissões, combustível, manutenção, seguros) → (−) pessoal → (−) despesas fixas (aluguel, sistema, telefone, taxas) → (−) perdas (quebras de caixa, vasilhames perdidos, incobráveis) → resultado. Por filial e consolidado.
- **Ponto de equilíbrio** em botijões/mês = despesas fixas ÷ margem de contribuição por botijão.

**6.9 Despesas de veículos**
- Abastecimento (data, veículo, km, litros, valor, motorista, posto) → consumo km/l e custo por km; manutenção (preventiva por km/data, corretiva, pneus, óleo); documentos (IPVA, licenciamento, seguro, multas); custo por veículo e por entrega; alerta de revisão e de documento a vencer. Despesa paga pelo entregador com dinheiro do troco entra no acerto com foto do cupom.

### Gaps
- Nenhum fornecedor do setor detalhou, nas fontes, caixa por turno com sangria; os detalhes vêm de PDVs genéricos.
- Não encontrei, em sistema de gás, relatório pronto de combustível/manutenção por veículo nem cálculo de custo por botijão; são requisitos inferidos.
- Não li o guia de cálculo de preço da Brazil Sistem nem o artigo "7 indicadores" do Solutio (busca esgotada).
- Tributação (regime monofásico do ICMS, PIS/Cofins, Simples Nacional, reforma tributária em transição em 2026) não foi pesquisada a fundo; a DRE precisa de validação do contador.
- Taxas reais de cartão e de marketplaces não foram levantadas.

---

## 7. Outros: fiscal e normas, multi-filial, permissões e auditoria, funcionários, frota, relatórios e painéis, backup, funcionamento sem internet, panorama de sistemas

### Takeaway
O mercado brasileiro tem dezenas de sistemas específicos (RevGás, Vendergás, BS Gestão, ControlGás, ahgas, Solutio, System Gas, PopGás, GestGAS, DistribuidorPRO, Telesys, Gas Expert, entre outros), quase todos em nuvem, com app do entregador e emissão de NFC-e/NF-e, anunciando de 50 a mais de 90 relatórios. O que é obrigatório e específico do setor é a parte fiscal do GLP (código ANP, CFOP 5656, ICMS monofásico por kg) e o enquadramento da revenda na ANP (Resolução 958/2023). Funcionamento sem internet é raro e normalmente restrito ao app do entregador.

### Cited Findings

**Fiscal**
- Para gás de cozinha o código de produto ANP informado na nota é 210203001; no ICMS monofásico o imposto é por quilo — exemplo de botijão de 13 kg com unidade tributável em KG, quantidade 13 e CST 61 (exemplo de fórum de software, não norma) — [Fórum Projeto ACBr, exemplo de venda de GLP](https://www.projetoacbr.com.br/forum/topic/79794-exemplo-vendaini-para-venda-de-produto-glp-cfop-5656-para-nfce-sp/)
- NFC-e de GLP com CFOP 5656 é rejeitada se faltar o grupo de combustível com o código ANP — [Fórum Projeto ACBr](https://www.projetoacbr.com.br/forum/topic/29607-grupo-de-combustivel-com-cfop-5656-para-venda-de-glp-gas-de-cozinha-na-nfc-e/)
- São Paulo (2025): NFC-e com CFOP 5.656 quando o comprador é pessoa física; NF-e com CFOP 5.655 quando o comprador é contribuinte do ICMS; CST 61 (monofásico); nota separada para os vasilhames com CFOP 5.920 (o resumo cita o retorno como "1.921") — [SEFAZ-SP, Resposta à Consulta 32482/2025](https://legislacao.fazenda.sp.gov.br/Paginas/RC32482_2025.aspx)
- São Paulo (2021), venda fora do estabelecimento (veículo carregado sem destinatário certo): saída do GLP com CFOP 5.657, venda com 5.656 e retorno do GLP não vendido com NF-e CFOP 1.415; para os botijões, a consulta remete a regras próprias do regulamento paulista — [SEFAZ-SP, Resposta à Consulta 24164/2021](https://legislacao.fazenda.sp.gov.br/Paginas/RC24164_2021.aspx)
- Segundo a RevGás, o único CFOP permitido na NFC-e de revendas de GLP é o 5656 (exceção rara: 5657) — [RevGás, CFOPs permitidos na NFC-e](https://revgas.com/quais-os-cfops-permitidos-para-emissao-de-nfc-e/)
- Sugestão de descrição do produto: "GLP; vasilhame XXX 13KG" — [Pronto Sistemas](https://blog.prontosistemas.com.br/1306/comercializar-botijoes/)
- Documentos emitidos pelos sistemas do setor: NFC-e, NF-e e CT-e (Vendergás); NF-e/NFC-e (RevGás, GestGAS); SAT/NFC-e (Mastercon); módulo fiscal próprio (BS Fiscal) — [Sistema Vendergás](https://sistemavendergas.com.br/), [RevGás](https://revgas.com/), [GestGAS](https://gestgas.com/), [Rogercon](https://www.rogercon.com.br/sistema-mastercon-para-distribuidora-de-gas-e-agua-com-emissao-fiscal-sat-nfce), [BS Fiscal](https://brazilsistem.com.br/bs-fiscal/)

**Normas do setor**
- A revenda de GLP é regulada pela Resolução ANP nº 958/2023, que não limita a área geográfica de atuação; as condições de segurança do armazenamento seguem a NBR 15.514; a autorização vale enquanto a empresa mantiver os documentos atualizados — [ANP, perguntas frequentes do revendedor](https://www.gov.br/anp/pt-br/acesso-a-informacao/perguntas-frequentes/agente-economico/revendedor-de-glp)
- A autorização é pedida pelo sistema SRD-GLP da ANP — [gov.br, autorização para revenda de GLP](https://www.gov.br/pt-br/servicos/obter-autorizacao-para-revenda-de-gas-liquefeito-de-petroleo)
- A ANP abriu consulta prévia (CP 03/2024) e análise de impacto para rever as Resoluções 957 e 958/2023 — conferir se já houve alteração — [FGV, Regulação em Números](https://regulacaoemnumeros-direitorio.fgv.br/post/anp-aprova-relatorio-de-analise-de-impacto-regulatorio-air-relativo-distribuicao-e-revenda-de)
- Ficha do Sebrae "Distribuidora de botijão de gás" (seções Estrutura, Pessoal, Equipamentos, Automação): cita motocicletas com estrutura metálica para transporte, uso obrigatório de EPI, balança decimal em funcionamento no ponto de revenda e oferta de acessórios para fogão na entrega e no ponto (trecho parcial) — [Sebrae, ideia de negócio](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/IDEIAS_DE_NEGOCIO/PDFS/ideia-de-negocio_distribuidora-de-botijao-de-gas.pdf)
- Ultragaz: a menor estrutura da marca tem área mínima de 30 m²; investimento inicial mínimo de R$ 60 mil; linha telefônica e sistemas de gestão devem estar prontos antes do treinamento da equipe — [Ultragaz Revendas, estrutura mínima](https://www.ultragazrevendas.com.br/qual-a-estrutura-minima-para-montar-uma-revenda-de-gas/)

**Multi-filial, permissões, auditoria, backup, offline**
- ahgas: múltiplos depósitos e transbordo entre filiais; ControlGás: estoque da empresa e das filiais separadamente; Bomsaldo: várias empresas/filiais no mesmo login com relatórios separados e permissões por usuário — [ahgas](https://ahgas.com.br/servicos/), [ControlGás](https://controlgas.com.br/), [Bomsaldo](https://bomsaldo.com.br/software-de-gestao-empresarial-para-deposito-de-gas/)
- RevGás: perfis de acesso para atendentes, financeiro, gestores, contador, supervisor da companhia (distribuidora) e entregador — [RevGás, sistema em nuvem](https://revgas.com/como-funciona-um-sistema-em-nuvem-para-revenda-de-gas/)
- DistribuidorPRO: backup automático, perfis de acesso e auditoria na nuvem; app do entregador baixa a rota e sincroniza depois — [DistribuidorPRO](https://distribuidorpro.com.br/sistema-para-revenda-de-gas)
- Gas Expert (instalado no computador): registra inclusões, alterações e exclusões com o usuário responsável; backup em local fixo escolhido (HD externo, pendrive) — [Maikonlyne, Gas Expert](https://www.maikonlyne.com.br/pagina/Gasexpert-Plus-2013)
- XGás se anuncia como gratuito e sem necessidade de internet — [XGás](https://xgas.com.br/)
- Vendergás e RevGás são totalmente em nuvem, acessíveis de computador ou celular — [Sistema Vendergás](https://sistemavendergas.com.br/), [RevGás](https://revgas.com/como-funciona-um-sistema-em-nuvem-para-revenda-de-gas/)
- Gasgest anuncia dados criptografados e painel compatível com celulares e tablets — [Gasgest](https://gasgest.com.br/)

**Relatórios e painéis**
- Quantidade anunciada: mais de 70 (BS Gestão), mais de 50 (Vendergás), mais de 90 (BITTWork) — [BS Gestão](https://brazilsistem.com.br/bs-gestao/), [Sistema Vendergás](https://sistemavendergas.com.br/), [BITTWork](https://bittwork.com/)
- Relatórios nomeados nas fontes: preço médio e previsão de compra do cliente (Vendergás); vendas e desempenho dos entregadores (RevGás); km rodados, tempo médio de entrega e produtividade (Atende Fácil); mapa de calor de vendas (Vendergás); mapa de vendas por rua (Solutio); DRE (Vendergás, Solutio, GestGAS); entregas no prazo/OTIF (DistribuidorPRO); relatório de compras com preço médio mensal (app Nacional Gás) — [Sistema Vendergás](https://sistemavendergas.com.br/), [RevGás](https://revgas.com/), [Atende Fácil](https://www.atendefacilia.com.br/gest%C3%A3o-g%C3%A1s), [Solutio Gás](https://solutiogas.com.br/), [DistribuidorPRO](https://distribuidorpro.com.br/sistema-para-revenda-de-gas), [Minha Revenda Nacional Gás](https://apps.apple.com/br/app/minha-revenda-nacional-g%C3%A1s/id6462193646)
- Solutio publicou "7 indicadores que todo dono de revenda de gás deveria acompanhar" (conteúdo não lido) — [Solutio Gás](https://solutiogas.com.br/2026/09/02/%F0%9F%93%8A-7-indicadores-que-todo-dono-de-revenda-de-gas-deveria-acompanhar/)

**Panorama de sistemas encontrados (todos com página própria)**
- RevGás — [revgas.com](https://revgas.com/); Vendergás — [vendergas.com.br](https://vendergas.com.br/) e [sistemavendergas.com.br](https://sistemavendergas.com.br/); BS Gestão — [brazilsistem.com.br](https://brazilsistem.com.br/bs-gestao/); ControlGás/Magnasys — [controlgas.com.br](https://controlgas.com.br/); ahgas — [ahgas.com.br](https://ahgas.com.br/servicos/); Solutio Gás — [solutiogas.com.br](https://solutiogas.com.br/); System Gas — [systemgas.com.br](https://systemgas.com.br/); PopGás — [popgas.com.br](https://www.popgas.com.br/); GestGAS — [gestgas.com](https://gestgas.com/); DistribuidorPRO — [distribuidorpro.com.br](https://distribuidorpro.com.br/sistema-para-revenda-de-gas); Telesys — [telesys.com.br](https://www.telesys.com.br/); Gasgest — [gasgest.com.br](https://gasgest.com.br/); GDS — [gdssolucoes.com.br](https://gdssolucoes.com.br/); Gas Expert — [maikonlyne.com.br](https://www.maikonlyne.com.br/pagina/bina); Mastercon — [rogercon.com.br](https://www.rogercon.com.br/sistema-mastercon-para-distribuidora-de-gas-e-agua-com-emissao-fiscal-sat-nfce); Ultragil — [tsionline.com.br](https://www.tsionline.com.br/index.php/sistemas/distribuidora-de-agua-e-gas); Sigeflex — [sigeflex.com](https://sigeflex.com/segmentos/deposito-agua-gas); BITTWork — [bittwork.com](https://bittwork.com/); G6M — [g6m.app](https://www.g6m.app/); Atende Fácil — [atendefacilia.com.br](https://www.atendefacilia.com.br/gest%C3%A3o-g%C3%A1s); CODEC Gás — [codec.com.br](https://www.codec.com.br/codec-gas.php); abilitygás — [abilitygas.com.br](https://abilitygas.com.br/); XGás — [xgas.com.br](https://xgas.com.br/); Actana — [actana.com.br](https://actana.com.br/sistema-para-distribuidoras-de-gas); GasNow — [gasnow.com.br](https://gasnow.com.br/revenda); Bomsaldo (lista comparativa "6 melhores") — [bomsaldo.com.br](https://gestao.bomsaldo.com.br/6-melhores-softwares-de-gestao-para-deposito-de-revenda-de-gas/)
- Faixas de preço citadas pelos próprios fornecedores ou comentários (não verificadas): Actana R$ 49,90/mês; PopGás R$ 99,90/mês + R$ 199,90/mês do módulo de IA; RevGás de R$ 50 a R$ 249/mês (comentário em artigo) — [Actana](https://actana.com.br/sistema-para-distribuidoras-de-gas), [PopGás](https://www.popgas.com.br/recursos/tech-ia), [RevGás](https://revgas.com/tudo-que-sua-revenda-de-gas-precisa-para-crescer/)

### Inferences

**7.1 Lista de relatórios típicos (proposta; os marcados com ✔ têm equivalente citado em fonte)**
- *Vendas*: por dia/semana/mês; por produto; por canal (telefone, WhatsApp, portaria, rua, aplicativo); por atendente; por entregador ✔; por bairro/rua ✔; por forma de pagamento; por tipo de cliente; por hora do dia e dia da semana (escala de pessoal); preço médio ✔; ticket médio; descontos concedidos; cancelamentos por motivo; comparação com período anterior.
- *Entregas*: tempo médio ✔; % no prazo ✔; entregas por entregador/hora ✔; km rodados ✔; ocorrências; mapa de calor ✔.
- *Clientes*: previsão de recompra ✔; inativos; novos; reativados; maiores compradores; clientes por bairro; aniversariantes; clientes com comodato; clientes com casco pendente.
- *Estoque/vasilhames*: posição de cheios e vazios por tipo, marca e local; movimentação; inventário teórico x real ✔; vasilhames com entregadores; em comodato; avariados; compras por período com preço médio ✔; giro e sugestão de carga.
- *Financeiro*: caixa por turno; acertos de entregadores e quebras; fiado em aberto/vencido; contas a pagar e a receber; fluxo de caixa realizado e previsto; recebíveis de cartão; conciliação; DRE ✔; margem por produto, canal, bairro e cliente; despesas por categoria e por veículo.
- *Vales e programas*: vales emitidos/resgatados/vencidos; convênios a faturar; Gás do Povo (recargas, a receber, recebido).
- *Pessoal*: comissões; produtividade; vales/adiantamentos; faltas de caixa por entregador.
- *Fiscal*: notas emitidas, canceladas, rejeitadas; resumo para o contador (arquivos XML do mês).
- *Auditoria*: alterações de preço, exclusões, cancelamentos, ajustes de estoque, liberações com senha.

**7.2 Painel do dono (proposta)**
- Hoje: botijões vendidos (por tipo), faturamento, pedidos em aberto e atrasados, entregadores em rota, cheios disponíveis, caixa do dia, fiado vencido, clientes que devem pedir hoje. Mês: vendas x meta, margem, evolução diária, ranking de entregadores, bairros.

**7.3 Usuários, permissões e auditoria (proposta)**
- Perfis: dono/administrador, gerente, atendente, caixa, conferente de estoque, financeiro, entregador (só app), contador (só leitura fiscal).
- Permissões sensíveis com senha: desconto acima do limite, cancelar pedido entregue, ajustar estoque, alterar preço, liberar fiado bloqueado, reabrir caixa/acerto, excluir lançamento, ver lucro.
- Registro de tudo (quem, quando, valor anterior e novo); nada é apagado de verdade, só cancelado com motivo.

**7.4 Multi-filial (proposta)**
- Cada filial com estoque, caixa, numeração fiscal, tabela de preço e equipe próprios; clientes compartilhados; transferência de estoque entre filiais com saída e entrada conferidas (e nota fiscal de transferência); pedido atendido pela filial mais próxima; relatórios por filial e consolidados.

**7.5 Funcionários e frota (proposta)**
- Funcionário: função, turno, tipo de comissão, CNH (categoria e validade), cursos e exames exigidos (confirmar quais com contador/segurança do trabalho), EPI entregue, adiantamentos/vales, veículo padrão.
- Veículo: placa, tipo (moto, triciclo, utilitário, caminhão), capacidade de carga por tipo de botijão, documentos e vencimentos, km, abastecimentos, manutenções, extintor, entregador responsável.

**7.6 Fiscal (proposta mínima)**
- Cadastro do GLP já com código ANP, unidade tributável em kg e situação tributária monofásica; NFC-e na portaria e pelo app do entregador; NF-e para empresas; documentos de remessa/retorno para venda de rua e para vasilhames conforme a regra do estado; contingência quando a SEFAZ estiver fora; envio da nota por WhatsApp; exportação mensal dos arquivos para o contador. As regras variam por estado: parametrizar com o contador.

**7.7 Backup e funcionamento sem internet (proposta)**
- Em nuvem: backup automático diário com restauração testada e exportação dos dados pelo dono.
- Sem internet: no mínimo, a tela de atendimento e a portaria devem conseguir registrar pedidos e vendas localmente e sincronizar quando a conexão voltar; o app do entregador deve guardar as entregas do dia. Nota fiscal em contingência.

**7.8 Conformidade do depósito (proposta de lembretes)**
- Vencimentos: autorização ANP/dados cadastrais, auto de vistoria dos bombeiros, alvará, licença ambiental, aferição da balança, extintores; alerta quando o estoque se aproxima da capacidade da classe de armazenamento autorizada.

### Gaps
- Não foi possível abrir manuais, centrais de ajuda nem vídeos de tutoriais; faltam telas e fluxos reais dos sistemas.
- A ficha completa do Sebrae (pessoal, automação, investimento) não foi lida por inteiro.
- Limites por classe de armazenamento (NBR 15514), exigência de painel de preços/balança (art. 25 da Res. 958/2023) e eventuais alterações de 2025–2026 nas Resoluções 957/958 não foram confirmados em texto oficial.
- Regras fiscais fora de São Paulo e o impacto da reforma tributária (fase de transição em 2026) não foram pesquisados.
- Exigências legais para entregadores e veículos (cursos, sinalização, limites de carga em moto) não foram pesquisadas.
- Nenhuma fonte confirmou funcionamento completo sem internet em sistema comercial atual (apenas app do entregador do DistribuidorPRO, o antigo Gas Expert instalado e o XGás).
- Portais/apps para revendedores da Ultragaz, Supergasbras e Copa Energia não retornaram nas buscas (só o da Nacional Gás).

---

## 8. Produtos acessórios (água, reguladores/registros, mangueiras, carvão etc.) e como são tratados

### Takeaway
A água mineral em garrafão retornável é o segundo produto de quase todo depósito e segue a mesma lógica do botijão (cheio x vazio, troca, validade do vasilhame de 3 anos). Reguladores e mangueiras são produtos de estoque simples, mas com validade de 5 anos impressa — o que cria oportunidade de lembrete de troca. Sobre carvão e outros itens não encontrei fonte específica.

### Cited Findings
- Vários sistemas são vendidos para "gás e água" ou "gás, água e bebidas": BS Gestão (gás LP e água mineral), System Gas (gás e água mineral), GestGAS (gás e água), Gas Expert (disk gás, água e bebidas), BITTWork (gás e bebidas), Ultragil (água e gás), Sigeflex (água e gás), Mastercon (gás e água) — [BS Gestão](https://brazilsistem.com.br/bs-gestao/), [System Gas](https://systemgas.com.br/), [GestGAS](https://gestgas.com/), [Gas Expert](https://www.maikonlyne.com.br/produto/2724/gas-expert-2017-software-disk-gas,-agua-e-bebidas), [BITTWork](https://bittwork.com/), [TSI Online](https://www.tsionline.com.br/index.php/sistemas/distribuidora-de-agua-e-gas), [Sigeflex](https://sigeflex.com/segmentos/deposito-agua-gas), [Rogercon](https://www.rogercon.com.br/sistema-mastercon-para-distribuidora-de-gas-e-agua-com-emissao-fiscal-sat-nfce)
- Existe guia específico sobre sistema para depósito de água mineral, focado em organizar entregas e vasilhames — [Pedegas, blog](https://pedegas.com/blog/sistema-para-deposito-de-agua-mineral-guia)
- O Sebrae recomenda oferecer acessórios para fogão e equipamentos a gás tanto na entrega quanto no ponto de revenda — [Sebrae, ideia de negócio](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/IDEIAS_DE_NEGOCIO/PDFS/ideia-de-negocio_distribuidora-de-botijao-de-gas.pdf)
- Regulador de gás: validade de cinco anos a partir da fabricação (NBR 8473), impressa no produto com mês e ano — [Sindigás, cartilha de mangueiras e reguladores](https://www.sindigas.org.br/wp-content/uploads/2017/05/2017-05-25-cartilha_mangueira_e_regulador_web.pdf)
- Mangueira: cinco anos a partir da fabricação; "se a mangueira ficou dois anos na loja, ela tem apenas mais 3 anos de uso"; a data fica na superfície da mangueira e no verso do regulador — [Sindigás, cartilha](https://www.sindigas.org.br/wp-content/uploads/2017/05/2017-05-25-cartilha_mangueira_e_regulador_web.pdf), [AEM-TO](https://www.to.gov.br/aem/noticias/agencia-de-metrologia-orienta-que-as-mangueiras-e-registros-de-gas-de-cozinhas-residenciais-industriais-e-comerciais-tem-prazo-de-validade-e-devem-ser-substituidos/374ubl4a8pb2)
- Garrafão retornável de água (10 e 20 L): validade de três anos; substituição dos vencidos é dever do fabricante — [A Tarde](https://atarde.com.br/economia/galoes-de-agua-mineral-tem-validade-de-tres-anos-345241), [Jusbrasil (DNPM)](https://www.jusbrasil.com.br/noticias/dnpm-troca-de-garrafoes-de-agua-vencidos-e-dever-dos-fabricantes/2023210)
- A RevGás tem artigo de ajuda sobre "ativação e gestão de produtos" (conteúdo não lido) — [Suporte RevGás](https://suporte.revgas.com/hc/pt-br/articles/32291318687379-Ativa%C3%A7%C3%A3o-e-gest%C3%A3o-de-produtos)

### Inferences

**8.1 Tipos de produto que o cadastro precisa distinguir (proposta)**
- **Com vasilhame retornável** (gás em todos os tamanhos; água 10 L/20 L): saldos cheio e vazio, troca, casco, comodato (seção 3).
- **Simples com validade** (regulador/registro, mangueira, kit regulador + mangueira + abraçadeiras): estoque comum, lote/data de fabricação ou validade, alerta de produto parado perto do vencimento (a validade conta da fabricação, não da venda).
- **Simples sem validade relevante** (abraçadeira, carvão, acendedor, suporte/bebedouro de água, bomba manual ou elétrica para garrafão, tampa, fogareiro, lampião, cascos vazios para venda).
- **Descartáveis de bebida** (água em garrafa, copo, pacote; refrigerante/bebidas, quando o depósito também é distribuidora de bebidas).
- **Serviços** (taxa de entrega, instalação de regulador/mangueira, visita técnica).

**8.2 Regras de operação**
- Acessórios vão na carga do entregador (ex.: 2 reguladores, 2 mangueiras por veículo) e entram no acerto de retorno.
- Sugestão de venda no atendimento: se a última troca de regulador/mangueira do cliente tem mais de 5 anos (ou nunca foi registrada), o sistema lembra o atendente de oferecer.
- Ao vender regulador/mangueira, gravar a data de validade no cadastro do cliente para lembrete futuro (mensagem automática).
- Água: registrar marca/fonte e, se possível, conferir a validade do garrafão recebido na troca (vencidos não devem ser reenvasados; separar para devolução ao fabricante).
- Comissão do entregador diferente para acessórios (incentivo à venda adicional).
- Tributação diferente da do gás (cada item com sua classificação fiscal): parametrizar com o contador.
- Kits/combos (ex.: gás + kit de instalação com desconto) com baixa de cada componente.

### Gaps
- Não encontrei fonte sobre venda de carvão em depósitos de gás, nem sobre margens ou participação dos acessórios no faturamento.
- Não confirmei em nenhum sistema o lembrete automático de validade de regulador/mangueira; é ideia inferida a partir do prazo de 5 anos.
- Regras sanitárias e de armazenamento de água mineral junto com GLP (separação de áreas) não foram pesquisadas.
- A norma vigente da ANM sobre validade de garrafões (as fontes citam portarias do antigo DNPM de 2008–2011) precisa ser confirmada.
