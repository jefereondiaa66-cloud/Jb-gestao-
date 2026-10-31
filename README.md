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
| `node scripts/verificar.mjs` | 20 verificações: programa, construção, ponte (testes B–F) |
| `node scripts/construir.mjs` | gera `dist/` (nuvem) e `saida/claude.html` (Claude) |
| `node scripts/testar-navegador.mjs` | abre o programa real no Chromium com o banco simulado |
| `node scripts/do-claude.mjs <pagina>` | traz para cá uma versão alterada dentro do Claude |

Documentação: [`docs/operacao.md`](docs/operacao.md) (como funciona e como operar) ·
[`docs/auditoria-2026-10-30.md`](docs/auditoria-2026-10-30.md) (estado encontrado e decisões) ·
agente: [`.claude/agents/jb-core.md`](.claude/agents/jb-core.md).
