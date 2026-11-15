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
