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

## 7. Lançamento Inteligente por Foto (Almoxarifado e Financeiro)

Aba "Lançamento Inteligente por Foto" no Setor do Almoxarifado (`#/almIA`) e no Setor Financeiro (`#/fIA`).
A pessoa fotografa (câmera do celular ou do computador) ou anexa PDF/JPG/PNG, uma ou várias páginas.

| Etapa | O que acontece |
|---|---|
| Leitura | Fotos e páginas de PDF viram imagens (página comprida vai em faixas, para a letra miúda continuar legível); o texto do PDF digital vai junto. Roda em segundo plano: dá para mudar de tela, um aviso no canto leva de volta. |
| Quem lê | No Claude: o Claude da própria página (capacidade `sample` com `images: true`). Na nuvem: a função `jb-ler-documento` do Supabase, que confere a sessão e a permissão (`almox` ou `financeiro` com "criar") e usa a chave `ANTHROPIC_API_KEY` guardada nos segredos das funções. |
| Conferência | Fornecedor por CNPJ/CPF (com dígito verificador) e nome; itens por descrição aprendida, código do fornecedor, nome igual ou parecido (marcado "confira"); soma dos itens × total; impostos e descontos da nota rateados no custo; documento repetido (impressão digital SHA-256 do arquivo, chave de acesso, número da nota do mesmo fornecedor, compromisso já lançado); leitura duvidosa e campos ilegíveis sinalizados. |
| Pergunta | Só uma, quando o documento não mostra: "Como foi realizado o pagamento?" (formas do Financeiro ou "Ainda não foi pago"). |
| Gravação | Depois da confirmação: guarda o original (`anexo`/`anexos`), cadastra fornecedor e itens que faltam, grava a entrada pelo mesmo caminho da "Nova entrada" (`almEntradas` → `sincFinEntrada` → `fTitulos`) ou, se for só despesa (boleto, fatura), o compromisso em `fTitulos`. Cada registro leva o campo `ia` com o que foi lido. Nenhuma coleção nova. |

Ativar na nuvem (uma vez): Supabase → projeto "JB Gestão" → Edge Functions → Secrets → `ANTHROPIC_API_KEY`
(chave de console.anthropic.com). Opcional: `JB_IA_MODELO` (padrão `claude-opus-5-5`). Sem a chave, a tela avisa
"A leitura por IA ainda não foi ativada no servidor" e nada é lançado.
Ativar no Claude: o artifact precisa declarar `sample: {images: true}`; sem isso, só PDFs digitais (com texto) são lidos lá.
Teste: `node scripts/construir.mjs && PDFJS_DIR=<pasta do pdfjs-dist/build> node scripts/testar-lancamento-foto.mjs`.

## 7. Desfazer e Refazer

Dois ícones no alto de todos os setores (Ctrl+Z e Ctrl+Y). Código: bloco `<script id="jb-desfazer">`, no fim de
`app/jb-gestao.html`. Ele envolve `APP.db`, por onde passam todas as gravações; nenhum módulo precisou mudar e o banco não mudou.

- Uma ação do usuário é uma entrada, mesmo com várias gravações. Documentos agrupados são desfeitos item a item.
- Histórico separado por setor; vale enquanto a aba estiver aberta (`sessionStorage`) e é limpo ao sair.
- Com formulário aberto, volta primeiro o que foi digitado. Com o cursor em pesquisa, Ctrl+Z é o do próprio campo.
- Não desfaz se o registro mudou depois, se está travado (só os autorizados), se a folha do mês está fechada ou se o cadastro já é usado.
- Pedem confirmação: folha, funcionários, contratos, vendas, compras, financeiro, configurações e ações com 4 ou mais registros.
- `log`, uso e registros do sistema ficam de fora. Nota fiscal e acessos ficam na lista como "não pode ser desfeita".
- Teste: `node scripts/construir.mjs && node scripts/testar-desfazer.mjs`.

## 8. Centro de Inventário

Setor independente, de acesso exclusivo do dono: inventário patrimonial de várias empresas.

| Peça | Onde |
|---|---|
| Telas | blocos `inv-estilos` e `inv-centro` no fim de `app/jb-gestao.html`; rota `#/inventario/...` |
| QR Code | `inv-qr-gerador` (qrcode-generator, MIT) e `inv-qr-leitor` (jsQR, Apache-2.0), embutidos |
| Banco | esquema `inv` (migração `20261108233000_inv_01_centro_inventario`), relacional e fora de `public.docs` |
| Entrada no banco | nuvem: `public.jb_inv` (sessão conferida) · Claude: `inv.api_ponte` (conector do dono) · as duas caem em `inv.executar` |
| Quem acessa | tabela `inv.acessos`. Ser administrador do JB não dá acesso. Para os outros o setor nem aparece. |

Regras garantidas no banco: cada registro preso à empresa (chaves compostas), código patrimonial único por empresa,
inventário concluído congelado, movimentações, leituras e auditoria sem alteração nem exclusão, empresas e bens sem exclusão.
Anexos ficam em `inv.arquivos`/`inv.arquivo_partes`, com limite de 250 MB e pausa automática se o banco chegar perto do limite do plano.
Cópias: `inv.fazer_copia()` diária às 3h20 (30 dias), separada da cópia geral; os arquivos anexos não entram nela.
Para abrir o inventário a outra pessoa é preciso uma linha nova em `inv.acessos`, só com pedido do dono.
Estoque/materiais: `inv.naturezas` já separa as naturezas; só `patrimonial` está ativa.

## 9. Resumo diário no WhatsApp

Todo dia às 19h de Fortaleza (22h UTC) o banco chama a função `jb-whatsapp`, que monta o mesmo "Resumo do dia" do programa,
gera o PDF e manda para os donos pela API oficial da Meta. Só lê os dados: não grava nada em `public.docs`.

| Peça | Onde |
|---|---|
| Função | `supabase/functions/jb-whatsapp` (contas em `nucleo.js`, PDF em `pdf.js`) |
| Configuração | `jbcore.whatsapp_config` (`ativo`, `dias_semana`, 0 = domingo) |
| Quem recebe | `jbcore.whatsapp_destinatarios` (55 + DDD + número) |
| Histórico | `jbcore.whatsapp_envios`: um envio por dia e telefone; só repete quem falhou |
| Agendamento | `jb-whatsapp-resumo` (`cron.job`); desligado (`ativo = false`) não faz nada |

Modelo a cadastrar na Meta: nome `jb_resumo_diario`, categoria Utilidade, idioma Português (Brasil), cabeçalho Documento. Corpo:

```
Resumo do dia da Cerâmica Concretiza: {{1}}.

Dinheiro: {{2}}.
Vendas: {{3}}.
Produção na maromba: {{4}}.
Fornos: {{5}}.
Combustível: {{6}}.
Lenha: {{7}}.

O relatório completo está no PDF em anexo.
```

Para ligar: gravar os segredos da função `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, cadastrar os destinatários e testar antes:

```sql
select jbcore.whatsapp_previa('2026-11-05');                 -- monta e não envia; resultado em jbcore.resposta(<pedido>)
insert into jbcore.whatsapp_destinatarios (nome, telefone) values ('Nome', '5586999999999');
select jbcore.whatsapp_disparar(null, '5586999999999');      -- teste para um número
update jbcore.whatsapp_config set ativo = true;
```

Se as regras da tela do Resumo do dia (bloco V77 de `app/jb-gestao.html`) mudarem, mude também `nucleo.js`.
