# Telas reais — Gas Expert / Tele Expert e apps de revenda e entregador no Google Play

> Pesquisa feita em 25/11/2026. Método: páginas abertas com navegador automático (Playwright) e curl; fichas do Google Play lidas no HTML (`hl=pt_BR&gl=BR`); imagens de tela baixadas de `play-lh.googleusercontent.com` e olhadas uma a uma em folhas de contato. Capturas ficam só em `/tmp/claude-0/-home-user-Jb-gestao-/8e9001e3-ac32-5afb-91ab-506f80bf0618/scratchpad/telas/gasexpert_lojas_de_app/` (nada copiado para o repositório). Cores em hexadecimal são **estimativas minhas a olho** a partir das capturas.
> Legenda: **[lido direto]** = li na página/ficha ou vi na imagem; **[resumo de busca]** = veio só de resultado do WebSearch; **[minha inferência]** / **[recomendação minha]** = não observado.
> Total visto: cerca de 95 imagens de telas (cerca de 60 de apps de revenda/entregador e cerca de 35 de apps de consumidor). Gas Expert: **nenhuma** imagem de tela pôde ser vista (motivo abaixo).

## 1. Gas Expert / Tele Expert (Maikonlyne): o que dá para ver e o mapa das teclas F1–F12

### Takeaway
O site gasexpert.maik.com.br abre, mas é só texto de venda; todas as imagens dele ficam em `lh7-us.googleusercontent.com`, os vídeos no YouTube e o manual em `maikonlyne.com.br`, e os três estão bloqueados nesta rede. Por isso **não vi nenhuma tela do Gas Expert** e **não consegui confirmar o mapa F1–F12**; o mapa que está em `visual_telas.md` continua sendo de segunda mão.

### Cited Findings
- [lido direto] Site é um Google Sites com três páginas: início/Gas Expert, "Binas (Linha Fixa)" e "Bina Cell PC". Rodapé: "® Gas Expert 2023", MAIKONLYNE SISTEMAS E SOLUÇÕES EM INFORMÁTICA LTDA, Cachoeirinha/RS — [Gas Expert](https://gasexpert.maik.com.br/)
- [lido direto] Recursos listados: bina (fixo e celular), fluxo de caixa e contas bancárias, estoque com "compras, empréstimos, comodatos e ressarcimentos", **geolocalização** ("identifica seus clientes que compraram ou deixaram de comprar diretamente no mapa"), exportação para Excel "em um clique", **integração com WhatsApp** ("encaminhe os pedidos para o WhatsApp do seu entregador em poucos cliques"), recibos em mini impressora, contas a pagar "individual ou em lotes", **lembretes** de aniversariantes, contas a vencer, previsão de vendas e manutenção da frota — [Gas Expert](https://gasexpert.maik.com.br/gasexpert)
- [lido direto] Quatro vídeos demonstrativos (títulos): "Lançamento de Pedidos", "Acerto de Contas", "Relatório de Vendas", "Emitir Comodatos" (vídeos no YouTube, não abriram) — [Gas Expert](https://gasexpert.maik.com.br/)
- [lido direto] Modelo comercial: licença sem mensalidade nem anuidade; **uma licença por computador** em rede local; 12 meses de suporte grátis (telefone, e‑mail, WhatsApp, acesso remoto); banco de CEP dos Correios incluso; migração grátis de clientes; "mais de 2.400 clientes/revendas"; "compatível com todas as versões do Windows"; "receba a versão 2024". **Nenhum preço aparece no site.** — [Gas Expert](https://gasexpert.maik.com.br/)
- [lido direto] Bina física USB para **2 ou 4 linhas fixas**, DTMF e FSK, sem fonte nem pilha, compatível com PABX, 0800, ADSL e fibra via modem; garantia 6 meses; conserto só enviando para assistência em SC — [Binas](https://gasexpert.maik.com.br/binas)
- [lido direto] Bina Cell PC: app Android que manda ao sistema as chamadas recebidas no celular, pela **mesma rede Wi‑Fi**; até **4 celulares** na mesma rede; Android 4 a 11; exige Gas Expert ou Tele Expert 2018 ou superior — [Bina Cell PC](https://gasexpert.maik.com.br/binacell). O app não aparece no Google Play pela busca "bina cell pc maikonlyne" [lido direto na busca da loja].
- [lido direto] Hosts que falharam ao abrir a página: `lh7-us.googleusercontent.com`, `www.youtube.com`, `www.gstatic.com`, `fonts.googleapis.com`; `www.maikonlyne.com.br` e `i.ytimg.com` sem resposta ao curl.
- [resumo de busca] Busca por "Tele Expert Maikonlyne atalhos F1…F6 pedidos realizados" não trouxe nada do produto (só listas genéricas de teclas F de outros programas).

### Inferences
- [minha inferência] Os títulos dos vídeos indicam as quatro telas que o fabricante considera centrais: lançar pedido, acerto de contas (do entregador/caixa), relatório de vendas e comodato.
- [minha inferência] "Encaminhar pedido para o WhatsApp do entregador" sugere que o Gas Expert **não tem app de entregador próprio**: o despacho é por mensagem de WhatsApp montada pelo sistema.

### Gaps
- Mapa exato F1–F12 do Gas Expert/Tele Expert: **não confirmado**. O que existe é o de `visual_telas.md` (F1–F7 em "Pedidos Realizados", F6 confirmar saída/entrega/entregador, Ctrl+C/S/E, F10 SMS, F12 Google Maps), tirado de `maikonlyne.com.br/pagina/Tele-Expert`, que não abriu aqui. F8, F9 e F11 seguem desconhecidos.
- Aparência das telas (cores, colunas): não vista. Preço da licença: não publicado no site lido.

## 2. Fichas do Google Play: números, atualização e queixas (todos [lido direto] nas fichas, 25/11/2026)

### Takeaway
Os apps de **consumidor** das distribuidoras e marketplaces têm notas altas e muitos downloads (Fogás 4,89 com 216 mil avaliações; Ultragaz 5 mi+); os apps de **entregador** têm poucas avaliações e notas mais baixas (RevGás 3,55; ahgas 3,80; AmigU 3,99). As queixas dos entregadores se repetem: **notificação de pedido novo que não chega**, pedido transferido/cancelado depois de aceito, falta de **histórico mensal para calcular comissão**, falta de botão "cliente não apareceu" e impossibilidade de **editar quantidade/preço/vários produtos** na venda.

### Cited Findings
Tabela (nota com 2 casas, nº de avaliações, downloads, última atualização). Fonte de cada linha: `https://play.google.com/store/apps/details?id=<id>&hl=pt_BR&gl=BR`.

| App (id) | Para quem | Nota | Avaliações | Downloads | Atualizado |
|---|---|---|---|---|---|
| [PopGas - Entregadores](https://play.google.com/store/apps/details?id=br.com.popgas.delivery_app&hl=pt_BR&gl=BR) | entregador | sem nota | — | 500+ | 28/03/2026 |
| [PopGas - Entrega de Gás](https://play.google.com/store/apps/details?id=br.com.ubergaz.app&hl=pt_BR&gl=BR) | consumidor | 4,75 | 2.929 | 100 mil+ | 27/08/2025 |
| [RevGás para Entregadores](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR&gl=BR) | entregador | 3,55 | 86 | 10 mil+ | 05/11/2026 |
| [RevGás Bina](https://play.google.com/store/apps/details?id=com.revgas.bina&hl=pt_BR&gl=BR) | atendente (bina) | sem nota | — | 500+ | 13/05/2026 |
| [GS Gás (feito pela RevGás)](https://play.google.com/store/apps/details?id=com.revgas.venda&hl=pt_BR&gl=BR) | consumidor de uma revenda (Marabá‑PA) | 4,17 | 6 | 1 mil+ | 06/11/2025 |
| [SystemGas Entregador](https://play.google.com/store/apps/details?id=br.com.systemgas.entregador&hl=pt_BR&gl=BR) (BLUAR TECNOLOGIA) | entregador | sem nota | — | 50+ | 16/11/2026 |
| [ahgas entregador](https://play.google.com/store/apps/details?id=com.watermelontecnologia.gasdelivery&hl=pt_BR&gl=BR) | entregador | 3,80 | 79 | 10 mil+ | 13/10/2026 |
| [ahgas](https://play.google.com/store/apps/details?id=com.app.ahgas_fdb3160&hl=pt_BR&gl=BR) (há ~19 apps "com.app.ahgas_xxxx", um por revenda) | consumidor | 4,60 | 10 | 1 mil+ | 12/06/2025 |
| [Appgas: Gás com frete grátis](https://play.google.com/store/apps/details?id=br.com.mobile2you.appgas.costumer&hl=pt_BR&gl=BR) | consumidor | 4,86 | 68.926 | 1 mi+ | 05/11/2026 |
| [Appgas Entregador](https://play.google.com/store/apps/details?id=br.com.mobile2you.appgas.driver&hl=pt_BR&gl=BR) | entregador | 4,27 | 11 | 1 mil+ | 05/10/2026 |
| [Preço do Gás](https://play.google.com/store/apps/details?id=br.com.precodogas&hl=pt_BR&gl=BR) | consumidor | 4,80 | 39.732 | 1 mi+ | 23/11/2026 |
| [Revendedor Preço do Gás](https://play.google.com/store/apps/details?id=br.com.precodogas.revendedor&hl=pt_BR&gl=BR) | revenda | 4,28 | 59 | 10 mil+ | 26/10/2026 |
| [Upgas](https://play.google.com/store/apps/details?id=br.com.upgas.app&hl=pt_BR&gl=BR) | consumidor | 4,79 | 36.542 | 1 mi+ | 16/10/2026 |
| [UpGas - para Motorista](https://play.google.com/store/apps/details?id=br.com.upgas.motorista.app&hl=pt_BR&gl=BR) | revenda/entregador | 4,30 | 44 | 1 mil+ | 27/10/2023 |
| [Ultragaz: Pedir Botijão de Gás](https://play.google.com/store/apps/details?id=com.grupoultra.ultragazbrasilgas&hl=pt_BR&gl=BR) | consumidor | 4,56 | 152.277 | 5 mi+ | 18/11/2026 |
| [AmigU](https://play.google.com/store/apps/details?id=com.grupoultra.entregadorultragaz&hl=pt_BR&gl=BR) (Ultragaz) | entregador | 3,99 | 323 | 10 mil+ | 08/10/2026 |
| [Pedir Gás | Supergasbras](https://play.google.com/store/apps/details?id=com.supergasbras.app&hl=pt_BR&gl=BR) | consumidor | 4,68 | 28.344 | 1 mi+ | 09/11/2026 |
| [Super Canal | Supergasbras](https://play.google.com/store/apps/details?id=com.supergasbras.apprevendedor&hl=pt_BR&gl=BR) | revenda | 4,68 | 710 | 10 mil+ | 26/10/2026 |
| [Entregador | Supergasbras](https://play.google.com/store/apps/details?id=com.supergasbras.driver&hl=pt_BR&gl=BR) | entregador | 4,46 | 63 | 10 mil+ | 22/10/2026 |
| [Super Gestão | Supergasbras](https://play.google.com/store/apps/details?id=com.supergasbras.superapp&hl=pt_BR&gl=BR) | cliente granel/empresa | 4,80 | 1.981 | 50 mil+ | 15/10/2026 |
| [Minha Revenda Nacional Gás](https://play.google.com/store/apps/details?id=br.com.nacionalgas.revendedor_nacionalgas_app&hl=pt_BR&gl=BR) | revenda | 4,35 | 37 | 5 mil+ | 04/11/2026 |
| [Fogás: Pedir Gás de Cozinha](https://play.google.com/store/apps/details?id=br.com.fogas.service&hl=pt_BR&gl=BR) | consumidor | 4,89 | 216.379 | 1 mi+ | 23/11/2026 |
| [Revendedor Fogás](https://play.google.com/store/apps/details?id=br.com.fogas.curso.aula02&hl=pt_BR&gl=BR) | revenda | 4,82 | 2.094 | 10 mil+ | 19/11/2026 |
| [Entregador Fogás](https://play.google.com/store/apps/details?id=br.com.fogas.entregador.appentregador&hl=pt_BR&gl=BR) | entregador | 4,82 | 1.142 | 10 mil+ | 23/11/2026 |
| [Fogás Atendimento – Revendas](https://play.google.com/store/apps/details?id=br.com.fogas.service.provider&hl=pt_BR&gl=BR) | revenda/entregador | 4,95 | 1.469 | 10 mil+ | 19/11/2026 |
| [Chama Gás](https://play.google.com/store/apps/details?id=br.com.kpsolutions.chamagas&hl=pt_BR&gl=BR) (KP Solutions — **não confirmei que seja o "Chama" marketplace**) | consumidor | 1,88 | 226 | 100 mil+ | 20/03/2026 |

Não encontrados no Google Play (buscas da loja em pt_BR/BR): **Vendergás** (nenhum app), **System Gas gestor** (só o app do entregador), **Appgas revendedor** (o desenvolvedor Appgas só tem consumidor e entregador), **Chama parceiro** (só apps sem relação ou o "Chama Gás" da KP Solutions). "Minha Revenda" (com.minharevenda.app, Brightmoon, 4,81/522/10 mil+) é app de revenda de cosméticos, **não de gás** — descartado.

Queixas e pedidos visíveis nos comentários (os 3 exibidos em cada ficha):
- RevGás Entregadores: "poderia ter acesso às **entregas mensais** que eu fiz, ajudaria muito a calcular minha **comissão**, tenho que anotar por fora" (3★, 21/10/2026); pedir para **cadastrar o cliente na venda na rua avulsa** (4★, 2022); pagamento dividido em até 3x no cartão e **editar entregas e endereços** (2★, 2022).
- ahgas entregador: lançar **2 ou mais produtos por cliente** num só pedido e ter **campo de observação** (3★, 2020); **editar valor e quantidade** do pedido recebido para dar desconto (3★, 2021); app travava o celular e GPS traçava rota "no meio de quadras" (1★, 2019). Nota da versão atual: "Múltiplos produtos e possibilidade de preço zero no produto".
- AmigU (Ultragaz): pedido aceito é **cancelado ou transferido para outro entregador** quando já está a caminho (1★, 2022); comissão de **R$ 1 por entrega** pelo app sem reajuste há 4 anos (1★, 09/2024); bonificações não pagas (1★, 07/2024).
- Entregador | Supergasbras: **sem notificação de pedido novo** (1★, 11/2025; 4★, 07/2024 — "ficar com o ícone flutuante na tela atrapalha"); sem "recuperar senha" (4★, 07/2026).
- Entregador Fogás: pedir **opção de desistência quando o cliente não aparece** (3★, 02/2026; "ficam esperando o cliente mais de 30 minutos e as outras entregas atrasam"); falta número da casa, localização errada, entrega fica marcada como feita por outro (5★, 2023).
- Fogás Atendimento (revenda): "**só notifica quando quer**", duplicidade de pedidos (2★, 2020); telefone do comprador não funciona e GPS não bate com o endereço (5★, 2021); cliente pode avaliar a revenda mesmo quando ele cancela (1★, 2021).
- Revendedor Fogás: pedido à distribuidora mostra só a data, **sem horário nem status**, "do nada o caminhão chega" (2★, 2022); app mostra "revenda fechada" nos fins de semana (1★, 2021).
- Minha Revenda Nacional Gás: não salva a senha; **3 produtos diferentes exigiam 3 ordens e 3 NF‑e** (2★, 06/2024) — a ficha atual anuncia "pedido com múltiplos produtos"; horários de programação às vezes não abrem (3★, 2025).
- UpGas Motorista: sem opção de inscrição, WhatsApp só com mensagem automática (1★, 2024); app desloga sozinho mas continua mostrando "disponível" ao cliente (3★, 2019). Sem atualização desde 10/2023.
- Consumidor (Fogás, Preço do Gás, Appgas, Upgas, Ultragaz, Supergasbras, Chama Gás): **prazo prometido não cumprido** (15–30 min virou mais de 1 h; 50 min virou 1 h+), previsão de entrega alterada depois do aceite, **status "entregue" sem ter entregue**, total diferente do carrinho (R$ 119,99 + R$ 1,99 virou R$ 151,99 no Appgas), cobrança antes de achar revenda, cadastro longo antes de dizer que não atende a região (Chama Gás: "era só ter pedido o CEP"), e ligação da revenda 5 min depois de o cliente só abrir o app (PopGas — sensação de vigilância).

Descrições das fichas (trechos [lido direto]):
- SystemGas Entregador: recebe pedidos, inicia rotas, registra conclusão e "operações externas autorizadas"; envia a localização **também em segundo plano**, com **notificação permanente** quando o rastreio está ativo; pontos de GPS **expiram em 3 dias**; rastreio acaba quando o entregador **encerra a jornada**. Novidade: "proteção contra edições simultâneas do pedido entre entregador e central" e "melhorias em conexões instáveis".
- PopGas Entregadores: "Novo fluxo de adicionar despesas".
- RevGás Bina: app identificador de chamadas que mostra **dentro do painel de vendas** da RevGás os dados do cliente que está ligando.
- Revendedor Preço do Gás: novidade "funcionalidades da taxa de serviço".
- Fogás Atendimento: "cadastro de pedidos do **Disk Gás ou Portaria** e criação de banco de dados de clientes".

### Inferences
- [minha inferência] Os fornecedores de gestão (PopGás, RevGás, SystemGas, ahgas) têm apps de entregador com **poucos downloads** (50+ a 10 mil+): são ferramentas internas de cada revenda, não produtos de massa. Quem tem volume são distribuidoras e marketplaces.
- [minha inferência] Notificação que não chega é o defeito número 1 de app de entregador; o SystemGas resolve isso declarando serviço em primeiro plano com notificação fixa.

### Gaps
- Comentários: só os 3 que a ficha mostra sem rolar; não li a lista completa.
- Não achei fichas de Vendergás, System Gas (gestor), Appgas revendedor nem "Chama parceiro".

## 3. Telas vistas: descrição detalhada por produto

### Takeaway
O padrão de app de entregador é: **chave "Disponível" no topo**, **lista/cartões de pedidos** com endereço em destaque, **botão de ação grande no rodapé** que muda conforme a etapa (Iniciar entrega → Cheguei → Entreguei), atalho para **mapa/rota** e **ligar para o cliente**, e um **resumo do dia por forma de pagamento**. Do lado da revenda, os melhores exemplos são o cartão com **etiquetas coloridas de estado** (Fogás Atendimento) e a lista com **"cada status, uma cor"** (Nacional Gás).

### Cited Findings
Todas as descrições abaixo são [lido direto] nas imagens (imagens servidas por `play-lh.googleusercontent.com`, a partir das fichas indicadas). Cores são minhas estimativas.

**3.1 RevGás para Entregadores** — 8 imagens — [ficha](https://play.google.com/store/apps/details?id=com.revgas.entrega&hl=pt_BR&gl=BR)
- Paleta: fundo branco #FFFFFF; destaque **laranja em degradê** #F58A3C→#F07A6A nos botões em pílula; verde #2E9D44 para "Finalizadas" e para o botão deslizante; vermelho #D0202E para "Canceladas" e "CANCELAR ENTREGA". Fonte sem serifa (tipo Work Sans/Inter), densidade baixa, feita para toque.
- Boas‑vindas (3 telas): ilustração laranja + frase ("Faça vendas onde você estiver", "Receba as entregas diretamente pelo aplicativo") + botão "Quero fazer entregas".
- **Tela principal/mapa**: cabeçalho com menu (☰) à esquerda, **chave liga/desliga de disponibilidade com ✓ verde** no centro, foto do entregador à direita; mapa ocupa ~80%; ícone de moto marca o entregador; rodapé com "● Procurando entregas" (pulso laranja).
- **Indisponível**: mesma barra, chave cinza desligada, ilustração de xícara de café e texto "Indisponível — Fique disponível para receber entregas".
- **Entrega em andamento**: título, "Chegada estimada: 09:42", nome do cliente grande ("Fátima"), endereço com ponto de referência ("Próximo à Padaria Pão de Mel") e botão redondo de **mapa**; contato com botão de **telefone**; item "1 GLP 13KG Ultragaz R$130,00 Cartão de crédito" com botão de **lápis (editar)**; link vermelho "CANCELAR ENTREGA"; no rodapé **botão de arrastar "Entreguei"** (círculo verde com »» que desliza sobre trilho cinza) — evita toque acidental.
- **Venda na rua — "Selecione o produto"**: lista de cartões (ícone do botijão/galão, nome "GLP 13KG Ultragaz", preço "R$ 130,00"); o cartão escolhido ganha borda laranja e mostra **lixeira, quantidade, "+"** e link "Adicionar desconto"; outros itens: Água 20L R$ 13,00, GLP 45KG R$ 240,00, GLP 5KG R$ 82,50, Kit regulador de pressão R$ 45,00; rodapé fixo "Confirmar — R$ 130,00".
- **Resumo / Desempenho hoje**: cartão "Ganhos R$ 1.300,00" com linhas **Dinheiro R$ 780,00 / Cartão de crédito R$ 520,00 / PIX R$ 260,00** (ícones de cada forma) e link "Ver histórico"; cartão "Produtos vendidos 12" com GLP 13kg Ultragaz 10 e Água 20L 2; dois blocos lado a lado "**12 Finalizadas**" (verde) e "**2 Canceladas**" (vermelho).
- Forte: acerto do dia pronto no celular, por forma de pagamento; "Entreguei" deslizante; referência no endereço. Fraco: (pelos comentários) sem histórico mensal para comissão.

**3.2 RevGás Bina** — 6 imagens — [ficha](https://play.google.com/store/apps/details?id=com.revgas.bina&hl=pt_BR&gl=BR)
- Abertura laranja chapado #F26522 com logo "REVGÁS BINA" branco; tela "Seu Bina está ativo" com grande ícone de telefone branco num círculo laranja com halo; três telas de permissão com ilustração isométrica laranja ("Precisamos do registro de chamadas", "Precisamos de acesso ao telefone", "Precisamos te notificar") e "Bem‑vindo ao RevGás Bina!" — cada uma com botão pílula laranja "Continuar/Começar" e "Versão 1.0" no rodapé.
- [lido direto no texto da tela] O app coleta o registro de chamadas "mesmo quando o aplicativo está fechado" para identificar o cliente **no ERP RevGás**. A tela que aparece no computador quando toca **não está nas imagens**.

**3.3 SystemGas Entregador** — 4 imagens — [ficha](https://play.google.com/store/apps/details?id=br.com.systemgas.entregador&hl=pt_BR&gl=BR)
- Paleta: fundo cinza muito claro #F6F7F8, cartões brancos com cantos arredondados; destaque **verde‑petróleo** #0F9D74 (botões cheios), verde claro #E8F7F0 para estado ativo; vermelho #F2222E no botão "Encerrar jornada". Densidade média; feito para toque.
- Início: barra "Entregador Fabio" com ☰ e ícone de sair; cartão "Pedidos — Resumo do dia ›"; seção "Pedidos enviados" com estado vazio "Nenhum pedido enviado para você".
- **Folha inferior "Jornada e localização"**: caixa verde clara "Jornada ativa — Iniciada em 15/09 às 22:08 — Sua localização continua sendo enviada em segundo plano enquanto a jornada estiver ativa", link "Política de Privacidade", botão vermelho largo "Encerrar jornada".
- **Criar novo pedido (passo 2 de 4)**: indicador de 4 passos numerados (o atual em círculo verde); "Produtos"; campo "Pesquisar produto…"; **chips de categoria** Todos / Gás / Água / Vasilhames / Acessórios; linha do produto selecionado em fundo verde claro com ✓, etiquetas "Água" e "UN", campo de **preço editável** ("R$ 24") e contador − 1 +; abaixo, caixa de regra: "Desconto máximo: R$ 1,25 (5%) — Preço mínimo permitido: R$ 23,75 — ✓ Valor permitido"; barra verde no rodapé "🛒 1 item no carrinho — R$ 24,00 ›".
- **Resumo do pedido**: lista rótulo/valor (Tipo de atendimento: Entrega; Cliente; Telefone; CPF/CNPJ; Produtos; Total dos produtos R$ 25,00; Pagamento: Cartão Crédito (3x): R$ 25,00; Endereço: Não informado; Observação) e botão verde "Finalizar pedido".
- Forte: **preço mínimo/desconto máximo mostrado na hora** (trava de preço visível para o entregador); categoria "Vasilhames" separada; jornada explícita (liga/desliga rastreio). Fraco: nomes de produto quebrando em várias linhas na coluna estreita ("AGUA HOMOL OGACA O").

**3.4 PopGas – Entregadores** — 3 imagens — [ficha](https://play.google.com/store/apps/details?id=br.com.popgas.delivery_app&hl=pt_BR&gl=BR)
- Paleta: branco; destaque **verde‑limão** #8CC63F nos botões; azul #1E88E5 nos links e ícones da lista; logo azul/verde. Visual mais antigo (Material simples), feito para toque.
- Login: "Email do Funcionário", "Senha", botão verde "Entrar".
- **Barra inferior de 5 abas**: **Pedidos · Carregamento · Acerto · Transferência · Meus Dados** (ícones de lista, caminhão, cifrão, caminhão com botijões, pessoa) — confirma visualmente o fluxo carregamento → pedidos → acerto descrito em `visual_telas.md`.
- Meus Dados: "Expediente de Trabalho" ("Você não está em expediente agora. Você não tem nenhum expediente programado nos próximos 30 dias"); lista com ícone à direita: Eventos, **Escala Semanal**, **Pontuação Bonificação**, **Ausências & Folgas**, **Penalidades**, Pedidos Entregues; "Dados Pessoais".
- Pedidos em andamento: estado vazio "Nenhum pedido aberto no momento!" + botão verde "Atualizar Pedidos" (atualização manual).
- Forte: o app do entregador também é o "RH de bolso" (escala, folgas, bonificação, penalidade). Fraco: depende de botão "Atualizar" (sem tempo real aparente).

**3.5 Appgas Entregador** — 6 imagens — [ficha](https://play.google.com/store/apps/details?id=br.com.mobile2you.appgas.driver&hl=pt_BR&gl=BR)
- Paleta: **azul‑marinho** #1F4A8C no cabeçalho e botões; verde #2EAA4F ("CHEGUEI NO ENDEREÇO", chave ligada); vermelho #E0323F ("CANCELAR PEDIDO"); fundo #F2F2F2. Botões em pílula, caixa alta, toque.
- Início: logo Appgas no centro do cabeçalho azul, chave verde de disponibilidade à direita; **abas "Iniciar entrega (1)" e "Andamento (1)"** com contador; cartão do pedido: "#27139 · 📍7.31km · 🕒 Até 16:11", endereço em negrito, "• 1x Botijão de 13kg • Consigaz", botão azul "INICIAR ENTREGA".
- Detalhe: "Pedido #27139", "Aguardando iniciar entrega — Previsão de entrega 16:11", distância, endereço, "1x Botijão de 13kg • Consigaz — R$ 11,99" com selo cinza "Cartão de Crédito na entrega"; botões "INICIAR ENTREGA" e "PRECISO DE AJUDA" (contorno).
- Andamento: cartão com nome do cliente em azul e botão verde "CHEGUEI NO ENDEREÇO"; "VER MAPA".
- **Código de confirmação da entrega**: folha inferior com **4 caixas para dígitos** ("Informe o código exibido ao cliente no aplicativo"), chave "Não possuo código de confirmação da entrega", "PRECISO DE AJUDA", "PEDIDO ENTREGUE!" (verde claro, desabilitado até digitar).
- Ajuda: "Como podemos te ajudar?" → LIGAR PARA O CLIENTE / FALAR COM APPGAS / CANCELAR PEDIDO (vermelho). Selo verde "Pago Online" quando pago no app.
- Forte: **código de 4 dígitos** prova a entrega (evita "entregue sem entregar"); três estados claros por botão. Fraco: só um produto por pedido nas telas.

**3.6 Revendedor Preço do Gás** — 7 imagens — [ficha](https://play.google.com/store/apps/details?id=br.com.precodogas.revendedor&hl=pt_BR&gl=BR)
- Paleta: **turquesa** #19B3B1 no cabeçalho e no painel; verde #1E9E2E "ACEITAR"; vermelho #D9322E "REJEITAR"; linhas da lista em verde muito claro #E8F8EC. Visual de 2018 (datas nas telas: 14–16/01/2018), Android antigo.
- **Ver Pedidos**: mapa Google ocupando metade de cima com o pino do cliente e a rota; metade de baixo turquesa com o pedido: nome do cliente, "A Aceitar", "Previsto: 16/01/2018 15:48", forma "Dinheiro", "Troco: não", valor "R$99,00", "1x Gás de Cozinha 13Kg", marca "Servgás", endereço e telefone; dois botões grandes **ACEITAR** (verde, esquerda) e **REJEITAR** (vermelho, direita).
- **Lista com filtro** (combo "A Aceitar" / "Entregue"): cartões centralizados "Cliente: EMILY", "Data Prevista | Data Entrega", endereço e telefone em caixa alta, "ID 10129" à esquerda e "Status: A Aceitar" à direita.
- Fraco: texto centralizado e em caixa alta dificulta leitura; filtro por combo em vez de abas.

**3.7 UpGas – para Motorista** — 7 imagens (peças publicitárias com tela dentro) — [ficha](https://play.google.com/store/apps/details?id=br.com.upgas.motorista.app&hl=pt_BR&gl=BR)
- Paleta: **amarelo** #FFE000 + azul‑marinho #0D3B7A; mascote botijão. "Mapa de Pedidos": barra "Disponível" com bolinha verde; cartão sobre o mapa com ícone de botijão e número "1", nome "Ana", "R$ 110,00", botões pequenos "ACEITAR" (azul) e "RECUSAR" (vermelho); rodapé "Existem 1 solicitações — CLIQUE AQUI!". "Atendimento": nome grande, "2,4 km · 6 a 11 min", endereço, complemento, telefone, "1 botijão", "R$ 110,00", botão losango azul de **rota**, botão amarelo "CANCELAR".
- Fraco: botões Aceitar/Recusar minúsculos para uso na rua.

**3.8 AmigU (Ultragaz)** — 3 imagens (peças com tela) — [ficha](https://play.google.com/store/apps/details?id=com.grupoultra.entregadorultragaz&hl=pt_BR&gl=BR)
- Paleta: azul royal #1A1AE6/#0A3DFF, ciano #19E3FF, verde #2BE84A. Tela principal: foto do entregador num cabeçalho azul com botijões, nome "João Pedro", chave indisponível/disponível, contadores "Entregas 20" e "Avaliação 5,0 ★★★★★" e **medalha dourada**; cartão azul "ENTREGA EM ANDAMENTO — Tempo restante para entrega: 30 min →"; abaixo origem/endereço e "PRODUTO: BOTIJÃO 13Kg"; rodapé "LIGAR PARA ULTRAGAZ".
- **"NOVA ENTREGA!!!"** (alerta em tela cheia): "Pedido 760845 · 🕒30 min", bairro em azul ("BELA VISTA"), endereço, "P13", "PAGO — Cartão de Crédito", "VER FOTO DO LOCAL" (contorno), botão cheio "INICIAR ENTREGA", "LIGAR PARA ULTRAGAZ".
- Forte: **contagem regressiva** do prazo e **foto do local**; gamificação (medalha, nota).

**3.9 Entregador | Supergasbras** — 6 imagens — [ficha](https://play.google.com/store/apps/details?id=com.supergasbras.driver&hl=pt_BR&gl=BR)
- Material 3 simples; barra de status vermelha #E2231A; fundo #FAF7F7; **barra inferior de 3 abas: Pendentes · Em Curso · Perfil** (aba ativa com pílula rosada e texto vermelho). "Pendentes — Fila de pedidos para entrega" com chave "Disponível" no topo direito; "Perfil" com nome, "Pedidos — Seu histórico de pedidos ›", "Seus Dados — Seu cadastro no App ›". As imagens só mostram estados vazios.

**3.10 ahgas entregador** — 4 imagens — [ficha](https://play.google.com/store/apps/details?id=com.watermelontecnologia.gasdelivery&hl=pt_BR&gl=BR)
- Paleta: barra azul #1E73E8; marca d'água do logo ahgas ao fundo; **FAB azul "+"** (nova venda na rua) no canto inferior direito; ícones na barra: perfil e "carregamento" (pessoa com carrinho).
- **Cartão de pedido com faixa de cabeçalho colorida por estado**: preta #1E1E1E com "Automática – [nome]" e "Entregue"; azul #2F80ED com nome, telefone e "Liberado". Corpo: produto "P-13", "1 x R$ 85.00", forma e total à direita ("Crédito – R$ 85.00", "Dinheiro – R$ 260.00"), "Observação: Entregar depois das 09:30", endereço com CEP, "Data de Entrega: 24/05/2019 09:00" e ícones **documento (nota)**, **pino (mapa)** e **lixeira**.
- [minha inferência] "Automática" = venda feita na rua pelo entregador (o mesmo termo do site ahgas).

**3.11 Fogás Atendimento – Revendas** — 2 imagens — [ficha](https://play.google.com/store/apps/details?id=br.com.fogas.service.provider&hl=pt_BR&gl=BR)
- Cabeçalho azul #0A86D0 "Atendimento" com ícones de **telefone (bolinha vermelha)** e **chat (bolinha verde)** e "opções"; **abas PEDIDOS (badge amarelo "1") · CLIENTES · RELATÓRIOS**.
- **Cartão de pedido com etiquetas**: "Pedido" + selos pequenos **NOVO** (verde #5BA817), **APP** (azul #1F6FB2), **DIAMANTE** (ciano #1FB5D3 — nível de fidelidade do cliente); "01 botija — R$ 70,00" à esquerda, endereço e "Distância: 1,0 km" à direita; **faixa de rodapé colorida** com o prazo: verde "entregar em 45 min." (novo) ou azul "pedido na revenda / entregar em 60 min." (aceito, selo ACEITO). Fundo do cartão aceito em azul muito claro #E6F3FB. Botão contorno "criar novo pedido".
- **Detalhes**: itens "02 Fogás 8 kg R$ 38,00", "01 Fogás 13 kg R$ 52,00", endereço, distância, botão "ver mapa"; "Desconto – R$ 1,00" em vermelho; total "R$ 127,00"; "• Troco de R$ 3,00"; rodapé com **"recusar" (vermelho) e "entregar em 15 min." (verde)** — o aceite já promete o prazo.
- Forte: melhor exemplo de **estado + origem + nível do cliente** num olhar; prazo como faixa colorida.

**3.12 Minha Revenda Nacional Gás** — 5 imagens — [ficha](https://play.google.com/store/apps/details?id=br.com.nacionalgas.revendedor_nacionalgas_app&hl=pt_BR&gl=BR)
- Paleta: vermelho #E30613 no cabeçalho ("Olá, Administrador(a) — Matriz 0001‑23 — Trocar"); fundo branco/cinza; azul‑marinho #123C8C no botão principal.
- **Novo pedido** (à distribuidora): endereço, Filial NG, Modalidade (CIF), Produtos ("100 P13, 20 P20"); folha "Disponibilidade de estoque": **3 botões de dia** (SEX 10/10, SÁB 11/10, SEG 13/10, selecionado em azul) e "Estoque disponível" com ✓ verde **P13 3664 / P20 42**; "Confirmar e continuar".
- **Meus pedidos — "Cada status, uma cor"**: cartões "Ordem: #2090776", "Programado para: QUI, 09/10", "Produtos: 150 P13, 10 P20, 5 P45", selo de estado: **Liberado (verde), Retido (amarelo/laranja), Faturado (azul claro), Pendente (amarelo)**; botão "Detalhes"; barra inferior vermelha Menu · Início · Pedidos.
- **Detalhes do pedido**: selo "Faturado", 5 estrelas para avaliar, quadro produtos × valor (150 P13 R$ 12000,12…; total R$ 19500,92), **linha do tempo vertical** com ✓ verdes: PENDENTE 07/10/2025 09:30 → RETIDO 09:31 → LIBERADO 09:32 → FATURADO 10:02; Pagamento "A prazo", "10 DD", Modalidade CIF, Filial; "Última sincronização em 07/10/2025 10:02".
- Forte: linha do tempo com hora de cada mudança; "última sincronização" visível.

**3.13 Super Canal | Supergasbras** — 5 imagens — [ficha](https://play.google.com/store/apps/details?id=com.supergasbras.apprevendedor&hl=pt_BR&gl=BR)
- Vermelho‑laranja #E0401C; login por **CNPJ** + senha; atalhos em cartões: Condições Comerciais, 2ª via Nota Fiscal, 2ª via Boleto, Volume de Compras, Comp. Vasilhames; resto é conteúdo (Super Educa, notícias, parcerias, banco de posts). Barra inferior: Início · Financeiro · Mais. Não é ferramenta de operação.

**3.14 Revendedor Fogás e Entregador Fogás** — 9 imagens, **todas ilustrações de marketing sem tela real** (5 passos: programar pedido de gás, boletos/notas, itens de adequação, loja de pontos, gerenciar entregadores; e "Receba e entregue os pedidos", treinamentos, mapa de estados). Nada de layout a registrar.

**3.15 Apps de consumidor (referência de status e de checkout)**
- **PopGas consumidor** (6 imagens) — [ficha](https://play.google.com/store/apps/details?id=br.com.ubergaz.app&hl=pt_BR&gl=BR): "Tipo de Entrega" em **cartões com rádio e preço**: Entrega Rápida 10 a 30 min R$ 91,00 / Entrega Normal até 60 min R$ 88,00 / Entrega Programada R$ 86,00 (preço cai com o prazo); carrinho com escolha **Desconto ou Brinde**; finalização com linhas de desconto (App, Brinde, Primeira compra) e total em azul; **pedido com régua de 4 etapas** (Pedido Aceito → Pedido Confirmado → Em preparação → Saiu para entrega); botões "Cancelar Pedido" e "Chat via WhatsApp"; mapa com o entregador e "Placa do Veículo". Cores: azul‑marinho #2B2F5B no cabeçalho, verde #6CB33F nos botões.
- **Upgas** (8 imagens) — [ficha](https://play.google.com/store/apps/details?id=br.com.upgas.app&hl=pt_BR&gl=BR): lista de revendas com tempo ("15 até 20 min"), selo de marca colorido (Consigaz azul claro, Liquigás verde, Nacional Gás vermelho), selo "Melhor oferta" e preço; ordenar por Tempo ou Preço; "Previsão de entrega 17:07–17:16" com barra de progresso e "Motorista saiu para entrega".
- **Pedir Gás Supergasbras** (8): fluxo Endereços → Produtos (revenda, distância, "Entrega em 30 min", "Aberto agora 09:00 às 17:00") → Pagamento em **ladrilhos** (Dinheiro, Cartão de Crédito, Débito, Pix) → Clube/cupons.
- **Ultragaz** (7): maioria propaganda; vê‑se tipo de pagamento em cartões (Pagar online, Pagar na entrega, Trocar o Vale Gás, **Resgatar benefício Gás do Povo**) e "**Lembrete de compra — Previsão para a próxima compra 23/01/2026**".
- **Preço do Gás** (24, quase todas propaganda): lista de revendas com "Dinheiro R$ 98,99 / Cartão à vista / Até 2x", nota ★4,5 e link "agendar"; acompanhamento com ✓ por etapa e hora; "Somos 3911 revendedores".
- Appgas consumidor e Fogás consumidor: imagens só promocionais ou pequenas demais para ler.

### Inferences
- [minha inferência] A comissão do entregador (queixa da RevGás e da AmigU) e o "acerto por forma de pagamento" (tela Resumo da RevGás) são o mesmo problema visto de dois lados: o entregador quer ver o que fez no mês; a revenda quer fechar o dia.

### Gaps
- Nenhuma imagem mostra **painel web do gestor**, **tela do computador quando a bina toca**, **estoque de cheios e vazios** ou **tabela de preços**: as fichas do Play só cobrem o celular. O PopGás tem aba "Carregamento" e "Transferência", mas as telas internas não aparecem.

## 4. Padrões que se repetem e recomendações

### Takeaway
Seis padrões aparecem em quase todos: chave de disponibilidade, cartão de pedido com estado colorido, botão grande que muda por etapa, prazo/contagem visível, mapa + ligar como ações secundárias e resumo do dia por forma de pagamento.

### Cited Findings
Padrões que se repetem [lido direto nas telas citadas na seção 3]:
- **Chave "Disponível/Indisponível" no topo** da tela do entregador: RevGás, Appgas, UpGas, AmigU, Supergasbras; o SystemGas usa "Jornada ativa / Encerrar jornada".
- **Cartão de pedido** com: nº do pedido, endereço em negrito (às vezes ponto de referência), produto × quantidade (marca junto: "Botijão 13kg • Consigaz"), valor, forma de pagamento como selo, distância e prazo ("Até 16:11", "30 min"). Estado mostrado por **cor de faixa ou selo**: ahgas (preto = entregue, azul = liberado), Fogás (verde = novo, azul = aceito), Nacional Gás (verde liberado, amarelo retido/pendente, azul faturado).
- **Um botão principal grande no rodapé** que muda a cada etapa: Iniciar entrega → Cheguei no endereço → Pedido entregue (Appgas); Iniciar entrega (AmigU); Entreguei deslizante (RevGás); Aceitar/Rejeitar lado a lado, verde à esquerda e vermelho à direita (Preço do Gás, UpGas, Fogás).
- **Ações secundárias em botões redondos ou contorno**: mapa/rota, ligar para o cliente, editar, "Preciso de ajuda"; cancelar sempre em vermelho e separado.
- **Prazo visível**: contagem regressiva (AmigU), "Chegada estimada" (RevGás), faixa "entregar em 45 min" (Fogás), "Previsão 17:07–17:16" (Upgas).
- **Resumo do dia por forma de pagamento** (Dinheiro / Cartão / PIX) e contadores Finalizadas × Canceladas (RevGás); abas Carregamento / Acerto / Transferência (PopGás).
- **Venda na rua** pelo entregador: FAB "+" (ahgas), "Selecione o produto" com desconto (RevGás), "Criar novo pedido" em 4 passos com trava de preço mínimo (SystemGas).
- Linha do tempo de estados com hora (Nacional Gás; PopGas e Preço do Gás para o consumidor).
- Paletas: cada marca usa sua cor de destaque, mas **verde = confirmar/entregue** e **vermelho = cancelar/recusar** é universal.

### Inferences
Recomendações (minhas, não observadas):
- [recomendação minha] App do entregador com 3 abas no rodapé — **Pedidos · Carro (carregamento: cheios e vazios) · Meu dia (acerto)** — e a chave "Em jornada" no topo, com notificação fixa do Android enquanto ativa (copiar SystemGas) para o aviso de pedido novo não falhar.
- [recomendação minha] Cartão de pedido: faixa superior colorida por estado (Novo #2E7D32 verde, Em rota #1565C0 azul, Atrasado #C62828 vermelho, Entregue #424242 cinza escuro), selos pequenos de origem (Telefone, WhatsApp, Portaria, Rua) e prazo restante na faixa inferior (padrão Fogás).
- [recomendação minha] Confirmação de entrega por **botão deslizante** (RevGás) e, na mesma tela, pergunta obrigatória "**Vazio recolhido? (sim/não/marca)**", que nenhum app mostrou e que alimenta o estoque de vasilhames.
- [recomendação minha] Botões "Cliente não atendeu" e "Endereço não encontrado" com motivo (pedido dos entregadores Fogás) e histórico mensal com total de entregas e comissão (pedido dos entregadores RevGás).
- [recomendação minha] Venda na rua com **vários produtos**, preço editável dentro de limites e aviso "Preço mínimo permitido" (SystemGas), mais campo de observação curto (pedido do ahgas).
- [recomendação minha] No computador (atendente), manter o que o Gas Expert promete — bina abrindo a ficha e teclas de função —, mas mostrar a legenda das teclas sempre visível no rodapé da tela de pedidos, já que nem o mapa F1–F12 do próprio Gas Expert é fácil de achar.

### Gaps
- Telas do gestor web (painel, mapa ao vivo, estoque, caixa, preços) desses fornecedores não estão no Google Play; dependem de vídeo ou demonstração (outras notas desta pasta cobrem PopGás/RevGás/ahgas/Vendergás pelos sites).
