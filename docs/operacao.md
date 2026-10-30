# JB CORE · como funciona e como operar

## 1. Banco central

Supabase (PostgreSQL gerenciado), projeto `kdsaslmlvjllgzbzsnxt`. Os dados continuam na estrutura
que o sistema já usa (`public.docs`: coleção, id, dados, versão), com as regras de acesso,
permissões por módulo, auditoria e cópias do esquema `seg` (feitos antes). Nenhuma tabela foi
recriada e nenhum registro foi apagado.

O JB CORE acrescentou o esquema `jbcore` (migrações `supabase/migrations/2026103022*_jbcore_*.sql`,
cada uma com a reversão no cabeçalho):

| Peça | Função |
|---|---|
| gatilho `docs_jbcore_mudancas` | registra toda inclusão/alteração/exclusão em `jbcore.mudancas` (nunca bloqueia uma gravação) |
| `jbcore.aplicar(lote)` | grava um lote vindo do Claude: código único por operação (repetir não duplica), cada operação isolada, conflito marcado, auditoria em nome do usuário |
| `jbcore.instantaneo_pagina` / `jbcore.mudancas_desde` | leitura inicial em páginas e mudanças desde o último cursor (janela de 30 s cobre transações fora de ordem) |
| `jbcore.painel()` / `public.jb_admin_core_painel()` | dados do painel (o segundo, só para administradores logados na nuvem) |
| `jbcore.conferir()` | impressão digital de cada coleção |
| `jbcore.verificar_hospedagem()` (a cada 10 min) | lê `/versao.json` do site no ar e registra cada versão nova em `jbcore.publicacoes` |
| `jbcore.podar()` (diária) | apaga da fila mudanças com mais de 30 dias (a ponte recarrega tudo se ficar mais tempo fora) |

## 2. Sincronização

- **Nuvem**: igual a antes (login próprio, gravação pelas funções `jb_*`, tempo real do Supabase).
- **Claude**: ao abrir, a ponte (`<script id="jb-core-ponte">`) lê o banco central pelo conector
  Supabase de quem abre a página, a cada 10 s busca mudanças (60 s com a aba escondida), confere
  tudo a cada 5 min e ao tocar no indicador "Sincronizado". Gravações vão para uma fila com código
  único; sem resposta, a fila fica no navegador e é reenviada — o banco reconhece o que já aplicou.
- Só um **administrador ativo** grava pela ponte. Se a ponte não conecta em 25 s (conector não
  ligado ou não permitido, outra pessoa, banco lento), o sistema no Claude abre **somente para
  consulta**, com aviso e botão "Abrir a nuvem". Assim nunca volta a existir uma segunda cópia gravável.
- Conflito (gravar por cima de uma versão que mudou) segue a regra do sistema — a última gravação
  vale — mas fica marcado no painel e o estado anterior fica na auditoria.

## 3. Publicação do código

```
Claude Code edita app/jb-gestao.html ─► verificar ─► commit/PR ─► merge na main
     │                                                              │
     │                                          Netlify: verificar ─► construir ─► publica dist/
     │                                                              │   (falhou? não publica)
     └─► Artifact "JB Gestão" ◄── saida/claude.html (mesma construção)
                                                       banco anota a versão nova em ≤10 min
```

- Backup do código: cada versão é um commit; o Netlify guarda os deploys anteriores.
- Backup dos dados: cópia diária às 3h (30 dias) + botão "Fazer cópia de segurança".
- Recuperação: GitHub → Actions → **Reverter publicação** (desfaz por commit novo, verifica e publica).
- Dados e código têm fluxos independentes: publicar código nunca mexe nos dados.

## 4. Painel de controle

Nuvem → "Usuários e segurança" (`admin.html`) → aba **JB Core**: conexão, banco, hospedagem,
sincronização com o Claude, última atualização, erros/conflitos, versão no ar, histórico de
publicações, cópias; botões *Sincronizar e conferir*, *Fazer cópia*, *Publicar* (GitHub) e
*Recuperar versão anterior*. No Claude, o indicador de sincronização mostra fila e estado.

## 5. Uma única configuração que só você pode fazer: ligar o Netlify ao GitHub

Sem isso, o código continua chegando à nuvem só por upload manual.

1. https://app.netlify.com/projects/jb-gestao-ceramica → **Project configuration** → **Build & deploy**
   → **Continuous deployment** → **Link repository**.
2. Escolha **GitHub**, autorize, selecione `jefereondiaa66-cloud/Jb-gestao-`, branch **main**.
3. Os campos de construção vêm do `netlify.toml` (comando `node scripts/verificar.mjs && node scripts/construir.mjs`,
   pasta `dist`). Salve.
4. Faça o merge do PR do JB CORE na `main`. O primeiro deploy publica a versão com `versao.json`;
   em até 10 min o painel mostra "No ar" com a versão e o histórico ganha a primeira linha.

## 6. Testes obrigatórios

| Teste | Como foi comprovado | Situação |
|---|---|---|
| A · código do desenvolvimento publicado na nuvem | depende do passo 5 | **aguardando o Netlify ser ligado ao GitHub** |
| B · funcionário cadastrado chega ao banco | `verificar.mjs` (ponte com servidor simulado) e no navegador com o programa real e os 392 registros: `gravar('funcionarios', …)` chegou ao banco | ok (simulado); falta ao vivo no Claude |
| C · despesa disponível nos relatórios | `verificar.mjs`: lançamento em bloco agrupado pelo mesmo caminho do sistema (`update` → `set`), o "relatório" (ouvinte da coleção) soma as despesas | ok (simulado) |
| D · atualização chega a quem está usando | `verificar.mjs` e navegador: alteração "na nuvem" aparece no sistema aberto; alteração do Claude chega ao banco preservando os outros campos; exclusão propaga | ok (simulado) |
| E · queda de conexão sem duplicar | resposta perdida depois de gravar → reenvio reconhecido (1 gravação só); sem internet → fila guardada no navegador → reaberto, sobe uma vez só. No banco real: mesma operação enviada duas vezes = `repetida`, versão não muda | ok (simulado + banco real) |
| F · falha de publicação e recuperação | `verificar.mjs` barra uma versão com erro (o Netlify não publica); `reverter.yml` desfaz por commit | ok (local); fluxo do GitHub ainda não executado |

O motor no banco real também foi testado com uma coleção de teste (`jbcoreTeste`, já apagada):
gravar, repetir (idempotente), atualizar, conflito, documento inexistente, caminho inválido,
exclusão e exclusão repetida, e usuário não administrador recusado.
