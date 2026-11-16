# Contratos com inteligência artificial (V125 · 15/11/2026)

A aba **Contratos** do Setor Pessoal deixou de ser só um catálogo de modelos. Agora a pessoa descreve o que
precisa, a IA identifica o documento certo, pergunta só o que falta, redige o texto completo e depois
conversa sobre o próprio documento. Os 50 modelos prontos continuam na biblioteca e funcionam sem IA.

## O que mudou na tela

| Antes | Agora |
|---|---|
| Abas Modelos · Documentos emitidos · Controle | Campo grande "Criar contrato com inteligência artificial" + abas **Documentos · Biblioteca de modelos · Controle de vencimentos · Base jurídica** |
| Situações: rascunho, pronto para assinar, assinado, vigente, encerrado, cancelado | Mais **Gerado** e os filtros Rascunhos, Gerados, Aguardando assinatura, Assinados, Vigentes, Próximos do vencimento, Encerrados, Cancelados |
| "Marcar como assinado" livre | **Registrar assinatura** exige data, forma, quem assinou e a comprovação |
| Documento assinado podia ser editado | Assinado, vigente, encerrado ou cancelado fica travado; mudança vira **aditivo, distrato, renovação ou cópia** |

## Como funciona (código em `app/jb-gestao.html`, bloco "CONTRATOS COM INTELIGÊNCIA ARTIFICIAL")

| Etapa | Onde |
|---|---|
| Interpretar o pedido (tipo, natureza, vínculo, até 4 perguntas) | `ctPromptInterpretar`, `ctInterpretar` |
| Redigir o documento completo, mostrando o texto enquanto chega | `ctPromptElaborar`, `ctElaborar`, `ctLerDoc` |
| Conversar sobre o documento | `ctPromptEditar`, `ctEditar`, `ctAplicarOps` |
| Conferir (8 verificações) e análise jurídica | `ctVerificar`, `ctRefs`, `ctHtmlAnalise` |
| Desenhar (tela, PDF, Word, impressão) | `ctD` → o mesmo motor dos documentos (`htmlDoc`, `pdfDoc`, `wordDoc`) |
| Salvar, versões, situações, assinatura | `ctSalvar`, `ctVersoesDe`, `ctMudarStatus`, `ctRegistrarAssinatura` |
| Renovar, aditivo, distrato, duplicar, modelo da empresa | `ctDerivar`, `ctOrigemDe`, `ctDuplicar`, `ctSalvarModelo` |

Regras que não mudam:

- **Edição por operações.** A IA não devolve o contrato inteiro a cada pedido: devolve "alterar a cláusula 6",
  "nova cláusula depois da 3", "remover a 2". O programa aplica; o que não foi citado fica letra por letra.
- **Base jurídica.** A IA só pode citar o que está em `CT_BASE` (mais o que a empresa acrescentar na aba
  Base jurídica, guardado em `config/empresa › ctBase`). Depois de redigir, `ctRefs` confere cada lei e artigo
  citado contra a base e marca "confirmar" no que não estiver lá. Para atualizar a base, edite `CT_BASE`
  (lei, artigos, resumo fiel, endereço do texto oficial e, para Código Civil e CLT, as faixas de artigos).
- **Dado pessoal fora da IA.** CPF, RG, endereço, nascimento, PIS e salário do cadastro vão como marcadores
  (`{{pessoa.cpf}}`, `{{empresa.rep_cpf}}`) e só viram dado na hora de mostrar (`ctResolver`). Ao fazer aditivo
  de um documento antigo, os campos sensíveis dele também viram marcadores antes do envio (`ctOrigemDe`).
- **Vínculo de emprego.** A IA analisa a realidade descrita; cláusula de "sem vínculo" não é tratada como
  proteção, e `ctVerificar` aponta sinais de vínculo no texto. Nada aqui diz que a IA substitui advogado.
- **Formato por tipo.** Contrato civil ou comercial sai com folha de rosto, partes, cláusulas e testemunhas;
  contrato de trabalho sem folha de rosto e sem foro; termo (aditivo, distrato, renovação) curto;
  notificação sem cláusulas, só com o notificante assinando.

## Onde ficam os dados

- `docsEmitidos/<id>`: resumo do documento (`modelo: 'ia'`, número, título, parte, situação, vigência, versão,
  assinatura, documento de origem). Modelos da empresa usam `serie: 'MD'` e não entram na lista de contratos.
- `sensivel/docsEmitidos:<id>`: pedido, texto atual, análise e conversa.
- `sensivel/docsEmitidos:<id>:v<n>`: cada versão do texto (nunca é sobrescrita).
- `sensivel/config:empresa`: CPF do representante legal. Cargo do representante e filiais ficam em
  `config/empresa` (`empresa.repCargo`, `estabelecimentos`).

O texto fica na área protegida (`dp_sensivel`): quem não tem acesso a dados pessoais vê a lista, mas não abre
o conteúdo nem cria contratos.

## A IA em cada lugar

- **No Claude:** o programa usa o Claude da conta de quem está usando (`APP.sample`).
- **Na nuvem:** `nuvem/jb-nuvem.js › redator` chama a função `jb-contratos-ia` do Supabase
  (`supabase/functions/jb-contratos-ia`), que confere a sessão e a permissão (`dp.criar` + `dp_sensivel.ler`,
  ou administrador) e usa a chave `ANTHROPIC_API_KEY` guardada nos segredos das funções — a mesma da leitura de
  documentos por foto. Sem a chave, a tela avisa e os modelos prontos continuam funcionando.

## Testes

- `node scripts/verificar.mjs` (grupo `contratos`): regras fixas, formato do documento e operações de edição.
- `node scripts/construir.mjs && node scripts/testar-contratos.mjs`: 50 conferências no navegador com IA simulada
  (pedido livre, perguntas, civil, trabalhista, edição, análise, PDF, assinatura, travas, duplicar, renovar,
  aditivo, distrato, modelo, recuperação, celular). Para o PDF, aponte `JB_LIBS` para uma pasta com
  `jspdf@2.5.1` e `jspdf-autotable@3.8.2`.
- `JB_IA_GRAVADA=<pasta>` faz o teste usar respostas reais gravadas (`1.txt`, `2.txt`…) e grava em
  `pedido-N.txt` o pedido que ficou sem resposta: serve para conferir os pedidos com a IA de verdade.

## Teste com a IA de verdade (15/11/2026)

Além da IA simulada, os pedidos montados pelo programa foram respondidos pelo Claude de verdade e as
respostas passaram pelo programa (`JB_IA_GRAVADA`), com o pedido do dono: "Preciso elaborar um contrato para
uma empresa que ficará responsável pela manutenção dos equipamentos da Cerâmica…".

| Etapa | O que a IA devolveu | O que o programa fez |
|---|---|---|
| Interpretar | Tipo certo (prestação de serviços de manutenção, civil, sem vínculo) e 4 perguntas curtas com sugestões | Mostrou as perguntas; nenhuma sobre dados da empresa |
| Interpretar de novo | Nenhuma pergunta a mais | Seguiu para a redação |
| Redigir (1ª rodada) | Contrato completo com 23 cláusulas, dados da empresa preenchidos, mas 24 campos em branco (deixou em branco até prazos de praxe) | Leu o formato sem erro, conferiu 15 referências (todas na base), salvou a versão 1 |
| Editar ("acrescente a cláusula dos materiais") | 1 cláusula nova e 1 alterada para não contradizer, com a explicação | Aplicou só as duas; as outras 22 ficaram letra por letra; versão 2; PDF de 11 páginas |
| Redigir (2ª rodada, com a regra das condições de praxe) | 27 cláusulas, só 7 campos em branco (fatos que o dono não informou), condições de praxe propostas e listadas em "confirmar", normas fora da base não citadas no texto | Leu sem erro, conferiu 13 referências (todas na base) |

Ajustes que saíram desse teste: sinais de vínculo conferidos frase a frase (sem contar negações nem os
empregados da própria contratada), a regra de propor condições de praxe em vez de deixar em branco,
o botão "Preencher tudo" e dois acertos no PDF (folha de rosto e cabeçalho com título comprido).

## Criar do meu jeito (V125.1 · 16/11/2026)

Pedido do dono: liberdade total para fazer o contrato do jeito dele, falando ou escrevendo.

- Aba **Criar do meu jeito** na tela de Contratos: campo grande com microfone. "Montar do jeito que eu falei"
  abre o **modo livre**: a IA vai direto para a redação (sem perguntas), usa as cláusulas, condições e palavras
  do dono, não questiona nem põe ressalvas no texto. Se algo puder não valer na Justiça, aparece só em uma linha
  na Análise jurídica, sem bloquear. A conversa sobre o documento segue a mesma regra (`S.livre`, gravado em
  `docsEmitidos.livre` e no corpo protegido).
- "Abrir em branco e escrever eu mesmo": contrato vazio já com a empresa, aberto em **Editar à mão**; não passa pela IA.
- **Microfone** no campo do pedido, na aba do meu jeito e na conversa (`ctMic`): no Claude usa a capacidade
  `dictation` do artifact; na nuvem, o reconhecimento de voz do navegador (`nuvem/_headers`: `microphone=(self)`).
  Onde não houver, o aviso indica o microfone do teclado do celular.
- Continua igual: dado pessoal do cadastro não vai para a IA; documento assinado não é alterado.

## Autonomia e velocidade (V127 · 16/11/2026)

Pedido do dono: dar a ordem e receber o contrato pronto, sem burocracia, sem análise jurídica obrigatória e sem
travamento. Nada foi recriado: é a mesma aba Contratos, com estas mudanças.

- **Sem rodada de perguntas.** O pedido vai direto para a redação (`ctEnviar` → `ctElaborar`): uma chamada à IA
  em vez de duas. O que faltar fica marcado como `[PREENCHER]`; nada é inventado.
- **Pessoa do cadastro entra sozinha.** `ctAcharPessoa` reconhece o nome citado no pedido e liga o documento ao
  cadastro; os dados pessoais continuam indo só por marcador. Só liga com nome inconfundível (nome completo, ou os
  dois primeiros nomes de uma única pessoa sem outro sobrenome em seguida) e a resposta diz de quem usou o cadastro.
- **Sem etapa jurídica obrigatória.** A IA faz o que o dono pedir e registra o cuidado com a lei em uma linha
  (`ANALISE-ATENCAO`). A aba passou a se chamar **Pontos de atenção**: são avisos, nada trava, e a tela diz que o
  sistema não faz validação nem parecer jurídico. A conferência das leis citadas contra a base continua (é ela que
  evita artigo inventado). A verificação fixa "Revisão por profissional" saiu.
- **Sem travas por limite legal no editor dos modelos prontos.** Campo em branco, experiência acima de 90 dias,
  prazo acima do limite e término antes do início viram aviso no salvamento. Só dado digitado errado (CPF, CNPJ,
  número) segura o salvamento.
- **Aguardando assinatura:** pedir uma alteração aplica a mudança e volta o documento para rascunho. Documento
  **assinado** continua protegido (aditivo, distrato, renovação ou cópia).
- **Comandos simples na hora, sem IA** (`ctComandoLocal`): tirar cláusula (número ou assunto), incluir cláusula de
  confidencialidade ou de proteção de dados, mudar salário/valor, cargo/função e título. Só age quando o alvo é
  único e o pedido não traz condição própria (valor repetido em outro trecho, extenso solto, cargo junto de outro
  texto ou “confidencialidade por 5 anos” seguem para a IA). O resto do texto fica letra por letra.
- **IA leve nas mudanças pequenas** (`ctPedidoLeve`): pedidos curtos usam o modo rápido; reescritas e revisões, o completo.
- **Tela fixa.** Dados de outros setores chegando não refazem a conversa, o documento nem o editor dos modelos
  (`data-ch` em `telaCtIA`, `data-edt` em `telaEditorDoc`): o que está sendo digitado não se perde.
- **Documento remendado por partes** (`fvdRemendar`): enquanto a IA escreve, só a cláusula nova entra na tela; as
  anteriores não são redesenhadas.

- **Texto começa a chegar antes, na nuvem.** A redação e as mudanças pequenas pedem à IA a resposta ligeira (`rapido`),
  e a função `jb-contratos-ia` aceita `longo` para a resposta ligeira não ser cortada em 4000. Os registros da função
  mostravam, antes: cada rodada de perguntas 7 a 17 s, redação de um contrato de 20 mil letras 115 a 131 s (quase
  metade disso sem nada na tela) e uma alteração simples 30 s. Dentro do Claude a redação continua no modelo completo.
  Pedidos de melhorar, revisar, reescrever ou adaptar continuam no modo completo.
- **Para este funcionário.** A aba Contratos ganhou a escolha "Pessoa do cadastro (opcional)" e a ficha do
  funcionário ganhou o botão **Contrato com IA**: os dados do cadastro entram sem digitar o nome.

Medição no teste (30 cláusulas, 5 mudanças de outro setor com o contrato aberto): antes a tela inteira era
refeita a cada mudança (77 ms de redesenho, conversa e documento recriados); agora nada é refeito (4 ms, 0 elementos
trocados). Testes: `verificar.mjs` (grupo `contratos`, 6 itens) e `testar-contratos.mjs`.
