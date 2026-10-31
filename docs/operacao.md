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
  Supabase de quem abre a página, a cada 30 s busca mudanças enquanto alguém usa a página (5 min com a
  aba escondida ou sem ninguém mexer há 5 min; ao voltar a mexer, busca na hora), confere tudo a cada
  30 min (só com a página em uso) e ao tocar no indicador "Sincronizado". Uma conferência só redesenha
  as partes que mudaram. Gravações vão para uma fila com código
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

## 5. Como a nuvem é publicada (sem precisar mexer no painel do Netlify)

O publicador `jb-publicar` (função no Supabase) faz o papel da ferramenta oficial do Netlify:

1. Pedir ao conector do Netlify um endereço de publicação (`deploy-site`; vale 30 min).
2. `select jbcore.publicar_nuvem('publicar', '<commit completo da main>', '<endereço>');`
   O banco chama a função com o segredo do cofre; ela baixa aquele commit do GitHub e entrega ao Netlify.
3. O Netlify roda `netlify.toml` (verificar → construir). **Se a verificação falhar, não publica.**
4. `jbcore.verificar_hospedagem()` (a cada 10 min, ou rodada à mão) lê `/versao.json` no ar e marca a
   publicação como "verificada"; se foi recusada ou não aparece em 2 h, marca "falhou".

`select jbcore.publicar_nuvem('simular', '<commit>')` monta o pacote sem publicar (resposta em `jbcore.resposta(<pedido>)`).
Ligar o Netlify direto ao GitHub (Project configuration → Build & deploy → Link repository) continua possível
e dispensa o passo 1–2; os dois caminhos usam o mesmo `netlify.toml`.

## 6. Testes obrigatórios

| Teste | Como foi comprovado | Situação |
|---|---|---|
| A · código do desenvolvimento publicado na nuvem | commit `8d4cbfc` publicado pelo `jb-publicar` em 30/10 23:02 (deploy `6ae521f4…`): o Netlify rodou a verificação, publicou, e o `index.html` no ar tem o mesmo sha256 do construído localmente (`8428cb5d…`); histórico "verificada" | **ok, ao vivo** |
| B · funcionário cadastrado chega ao banco | `verificar.mjs` (ponte com servidor simulado) e no navegador com o programa real e os 392 registros: `gravar('funcionarios', …)` chegou ao banco | ok (simulado); gravação Claude → banco central comprovada ao vivo (ver abaixo) |
| C · despesa disponível nos relatórios | `verificar.mjs`: lançamento em bloco agrupado pelo mesmo caminho do sistema (`update` → `set`), o "relatório" (ouvinte da coleção) soma as despesas | ok (simulado) |
| D · atualização chega a quem está usando | `verificar.mjs` e navegador: alteração "na nuvem" aparece no sistema aberto; alteração do Claude chega ao banco preservando os outros campos; exclusão propaga | ok (simulado) |
| E · queda de conexão sem duplicar | resposta perdida depois de gravar → reenvio reconhecido (1 gravação só); sem internet → fila guardada no navegador → reaberto, sobe uma vez só. No banco real: mesma operação enviada duas vezes = `repetida`, versão não muda | ok (simulado + banco real) |
| F · falha de publicação e recuperação | `verificar.mjs` barra uma versão com erro (o Netlify não publica); `reverter.yml` desfaz por commit | ok (local); fluxo do GitHub ainda não executado |

**Ao vivo, 30/10 22:43–22:47:** o artifact do Claude (publicação de 22:35) abriu pelo conector Supabase do dono,
leu o banco central, consultou mudanças periodicamente (sinal de vida em `jbcore.estado`, chave `ponte:claude`)
e enviou 6 gravações (`ws`, `diagnostico`, `uso`): 6 aplicadas, 0 erros, 0 duplicações, 1 conflito
detectado no contador de uso, gravado ao mesmo tempo pela nuvem e pelo Claude (esperado; fica no painel).

O motor no banco real também foi testado com uma coleção de teste (`jbcoreTeste`, já apagada):
gravar, repetir (idempotente), atualizar, conflito, documento inexistente, caminho inválido,
exclusão e exclusão repetida, e usuário não administrador recusado.
