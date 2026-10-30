# JB Gestão Cerâmica · JB CORE

Sistema de gestão da Cerâmica Concretiza (DP, produção, vendas, compras,
almoxarifado, financeiro, fiscal). Um único programa roda em dois lugares
e os dois usam o MESMO banco central:

- Nuvem: https://jb-gestao-ceramica.netlify.app (login próprio, todos os funcionários)
- Claude: artifact "JB Gestão" (o dono, pelo conector Supabase)

Para qualquer operação de infraestrutura, publicação, sincronização ou
recuperação, siga `.claude/agents/jb-core.md` (JB CORE AGENT). Resumo:

- Fonte única do programa: `app/jb-gestao.html`. Não edite `dist/` nem `saida/` (são gerados).
- `nuvem/`: arquivos só da versão da nuvem (adaptador `jb-nuvem.js`, `admin.html` com o painel JB Core).
- `supabase/migrations/`: só acrescentar; toda migração com reversão descrita. Cópia (`select seg.fazer_copia()`) antes.
- Antes de commit: `node scripts/verificar.mjs`. Para gerar: `node scripts/construir.mjs`.
- **Autorização do dono (30/10/2026):** alterações de código pedidas por ele podem ir direto para a
  `main` (publicação automática na nuvem) e para o artifact do Claude, desde que `verificar.mjs`
  passe inteiro. Isso não vale para dados: apagar ou sobrescrever registros continua exigindo pedido explícito.
- Repositório PÚBLICO: nunca colocar dados de pessoas, cópias do banco ou chaves secretas.
- Textos para o usuário em português do Brasil, linguagem simples.
