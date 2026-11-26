# Identidade documental (V111)

Todo documento do JB (relatórios, fichas, recibos, comprovantes, demonstrativos, contratos e
documentos do DP) sai com a mesma identidade, decidida num lugar só:
**Configurações › Identidade visual e documentos** (`config/empresa › idDocs`, `marcaImg`, `marcaDocumentos`).

| O que | Onde fica no código (`app/jb-gestao.html`) |
|---|---|
| Configuração central e padrões | `idDocs()`, `ID_DOCS_PADRAO`, `cfgDocs()` |
| Logo única | `logoDocSrc()` (lê `CFG.marcaImg`; nenhum gerador traz imagem própria) |
| Setor responsável | `setorDoDoc(D)`: `D.setor`, ou a tela de origem (`setorDaTela()`); nomes em `SETOR_DOC_PADRAO` e `idDocs().setores` |
| Emissão (data, hora, quem emitiu) | `carimboDoc(D)` e `metaDoc(D)` |
| Família do documento | `classeDoc(D)`: relatório, ficha, comprovante, demonstrativo, documento formal |
| Cabeçalho e rodapé | tela/impressão: `cabDocHtml`, `rodDocHtml` · PDF: `cabPdfCC`, `rodPdfCC` · Word: `wordDoc` |
| Nomenclatura formal | `tituloFormalDoc`, `TIPOS_FORMAIS`, `CAB_FORMAL`, `ROT_FORMAL` (só o texto do documento) |
| Impressão A4 | `@page jbdoc` / `jbpaisagem` (numeração), regras de quebra em `#printDoc` |

Regras:

- Documento novo: monte o descritor `D` com `baseRel(...)` ou `montarDoc(...)` e use `verDoc`, `emitirPdfDoc`,
  `baixarWordDoc`. Cabeçalho, setor, emissão, rodapé e paginação entram sozinhos.
- Setor diferente do da tela: informe `D.setor`. Família diferente da deduzida pelo título: `D.classe`.
- Nada de CNPJ, endereço ou telefone escritos no código: só aparece o que está cadastrado em Configurações › Empresa.
- Não mudam: campos, tabelas, cálculos, totais, assinaturas e textos legais. Documento fiscal (NF-e, DANFE)
  e ticket térmico não recebem este cabeçalho.

Testes: `node scripts/verificar.mjs` (grupo `documentos`) e `node scripts/testar-documentos.mjs`
(navegador; para conferir os PDFs, `npm i jspdf@2.5.1 jspdf-autotable@3.8.2` numa pasta e aponte `JB_LIBS` para ela).

## Padrão visual empresarial (V116)

Dois padrões, que não se misturam:

- **A · Relatórios e documentos (folha A4)**: mesma estrutura da V111, com desenho novo: cabeçalho branco
  (logo e empresa à esquerda, identificação do documento à direita, filete azul-petróleo com detalhe
  terracota), faixa de identificação com a situação colorida, partes lado a lado, cartões de indicadores
  (`{tipo:'indicadores',itens:[[rótulo,valor,tom?]]}`, tom `ok`/`at`/`pe`), tabelas leves e resumos de
  duas colunas (rótulo · valor) mostrados como quadro, dois seguidos lado a lado (`ehKvDoc`).
  Peças: CSS `#docs-concretiza`, `htmlDoc`, `pdfDoc`, `wordDoc`, `cabPdfCC`, `rodPdfCC`, `tituloPdfCC`,
  `estiloTabPdfCC` (desenhos próprios: ficha de férias, inventário).
- **B · Cupom não fiscal / recibo térmico (58 e 80 mm)**: `htmlCupom(C,larg)` e `pdfCupom(C,larg)` no
  bloco `#docs-cupom`. Documento com versão cupom traz `D.cupom` (venda, pedido, orçamento, recibos,
  comprovante de pagamento, carregamento, entrega, entrega de lenha); a tela do documento oferece
  Cupom 80 mm, Cupom 58 mm ou Folha A4 (escolha guardada no aparelho, `formatoDoc`). O ticket da
  janela "Imprimir" das Vendas (V110) usa o mesmo cupom. Nunca se apresenta como documento fiscal.

Lenha: na tela da compra de lenha, **Comprovante de entrega** (`docEntregaLenhaV`, para quem trouxe a lenha,
com assinatura de quem entregou e de quem recebeu) e **Relatório para o dono** (`docRelLenhaDonoV`).
Só leitura da compra registrada: tipo, destino, caminhão e medidas, itens, valores, pagamento e estoque.

## Documento de cada lançamento e relatórios dos setores (V120)

Todo lançamento aberto na janela padrão tem o botão **Documento** (Visualizar, Gerar PDF, Imprimir,
Compartilhar), montado pelo registro gravado com `JB_DOCL.docRegistro` no padrão A acima; o Financeiro tem o
demonstrativo do compromisso e o comprovante de cada pagamento. Cada setor tem **Lançamentos do setor** na
própria área de Relatórios, e a tela padrão de relatórios ganhou pesquisa, filtros de situação e responsável,
Imprimir e Compartilhar. Detalhes: [`relatorios-documentos-v120.md`](relatorios-documentos-v120.md).
Teste: `node scripts/testar-relatorios-documentos.mjs`.

## Cupom igual em todos os setores (V121 · 13/11/2026)

Pedido do Jeferson: o cupom de todo setor no mesmo modelo do **comprovante de entrega de lenha**.

- **Cor do cupom:** papel térmico é sempre preto no branco. O adaptador de cores dos temas (`PULA`) não mexe
  em `.cupom` nem `.cp-*` (antes, com uma paleta escolhida, a faixa preta virava azul na tela).
- **Valor comprido:** mesma regra na tela (`htmlCupom`) e no PDF (`pdfCupom`): cabe → lado a lado; valor curto →
  o rótulo quebra à esquerda; valor comprido → rótulo numa linha e o valor embaixo, à direita (`.cp-ln2`).
  Antes o valor ficava numa coluna estreita e quebrava letra por letra. `R$` não se separa do número.
- **Comprovante do lançamento (COMP_LANC):** links de ação da tela ("Abrir a compra") não vão para o papel;
  observações saem em "Observações" no fim; rótulo repetido no começo do valor sai uma vez; "Via do responsável".
- **Comprovante só em A4** (pagamento do Financeiro, entrada e requisição do almoxarifado, documento de
  lançamento, levadas…): `garantirCupom(D)` monta a versão cupom com `cupomDeDoc(D)` a partir do próprio
  documento (parte, itens, total, blocos, texto, observações, assinaturas). Vale para `classeDoc(D)==='comprovante'`,
  no Setor Pessoal só o documento de lançamento (recibos e termos do DP seguem em A4); `D.semCupom` desliga. Nada é recalculado nem gravado.

Teste: `node scripts/testar-comprovante-lancamento.mjs` (21 conferências, inclui a cor azul escolhida).
