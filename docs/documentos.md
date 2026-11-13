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
