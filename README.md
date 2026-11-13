# JB Gestão Cerâmica

Um programa, dois endereços, um banco só.

```
             app/jb-gestao.html  (fonte única, neste repositório)
                     │  node scripts/construir.mjs
          ┌──────────┴──────────┐
  dist/ (nuvem, Netlify)   saida/claude.html (artifact no Claude)
          │                      │
  jb-nuvem.js: login,      jb-core-ponte: conector
  tempo real               Supabase do dono
          └──────────┬──────────┘
          Banco central (Supabase · public.docs)
          + jbcore: fila de mudanças, operações idempotentes,
            painel, histórico de publicações, verificação do site
```

- **Lançou na nuvem?** Grava no banco central na hora; o Claude recebe em até ~30 s (página parada: na hora em que voltar a mexer).
- **Lançou no Claude?** Vai para o mesmo banco (cada gravação com código único: se a
  conexão cair, o reenvio não duplica; o que não subir fica guardado no navegador).
- **Mudou o código?** Commit na `main` → o Netlify verifica, constrói e publica sozinho;
  a mesma construção gera a página do Claude.

| Comando | Para quê |
|---|---|
| `node scripts/verificar.mjs` | verificações do programa, da construção, da ponte (testes B–F) e do JB Fiscal |
| `node scripts/construir.mjs` | gera `dist/` (nuvem) e `saida/claude.html` (Claude) |
| `node scripts/testar-navegador.mjs` | abre o programa real no Chromium com o banco simulado |
| `node scripts/testar-janelas.mjs` | testa janelas, abas, rascunhos, clique duplo e gravação sem conexão (21 itens) |
| `node scripts/testar-vendas.mjs` | Setor de Vendas: pedido, venda, ticket 58/80 mm, orçamento, simulação ([docs/vendas-v110.md](docs/vendas-v110.md)) |
| `node scripts/testar-combustivel-lenha.mjs` | Combustível e Lenha de ponta a ponta: lançamentos, foto (IA simulada), programação, descontos e acerto (69 conferências) |
| `node scripts/testar-custo-buscar.mjs` | V115: custo por litro = média das compras + custo de buscar, lenha paga com combustível (saldo geral, rateio e crédito) e posição do fornecedor no relatório de compras (35 conferências) |
| `node scripts/testar-lancamento-foto.mjs` | testa o Lançamento Inteligente por Foto de ponta a ponta (IA e banco simulados) |
| `node scripts/testar-leitura-rapida.mjs` | testa a leitura por foto aos poucos: função do servidor (precisa do Deno) e adaptador da nuvem, com a IA simulada |
| `node scripts/testar-fiscal.mjs` | testa o JB Fiscal (tradução da nota para a Focus NFe, envio sem duplicar, produção bloqueada) sem rede |
| `node scripts/do-claude.mjs <pagina>` | traz para cá uma versão alterada dentro do Claude |

Documentação: [`docs/operacao.md`](docs/operacao.md) (como funciona e como operar) ·
[`docs/fiscal.md`](docs/fiscal.md) (nota fiscal pela Focus NFe: tokens, instalação, produção) ·
[`docs/auditoria-2026-10-30.md`](docs/auditoria-2026-10-30.md) (estado encontrado e decisões) ·
[`docs/evolucao-2026-11-13.md`](docs/evolucao-2026-11-13.md) (área de trabalho: janelas, abas, rascunhos) ·
[`docs/combustivel-lenha-2026-11-13.md`](docs/combustivel-lenha-2026-11-13.md) (Combustível e Lenha, V112) ·
agente: [`.claude/agents/jb-core.md`](.claude/agents/jb-core.md).
