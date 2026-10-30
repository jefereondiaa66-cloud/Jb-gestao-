# Auditoria da infraestrutura · 30/10/2026 (Etapas 1 e 2)

## O que existia

| Peça | Situação encontrada |
|---|---|
| Versão no Claude | artifact "JB Gestão", "Versão 56", 2,8 MB, banco próprio do artifact (61 coleções declaradas, 31 com dados) |
| Versão na nuvem | Netlify `jb-gestao-ceramica`, publicada às 16:20 por **upload manual** ("drop deployment"), sem repositório ligado |
| Banco da nuvem | Supabase "JB Gestão" (sa-east-1): `public.docs` + esquema `seg` (login próprio, permissões por módulo, auditoria imutável, sessões, cópia diária às 3h) |
| Funções no servidor | `jb-auth` (login), `jb-importar` e `jb-tarefa` (desativadas), `jb-publicar-site` (temporária, ver riscos) |
| Repositório GitHub | vazio |

**Causa do problema relatado.** Eram dois sistemas separados:
1. *Código*: a nuvem foi publicada arrastando o arquivo para o Netlify. Nada ligava o que se
   alterava no Claude ao site — cada atualização exigiria repetir o upload à mão.
2. *Dados*: o Claude gravava no banco do artifact; a nuvem, no Supabase. A importação de 17:00
   copiou os dados uma vez; depois disso cada lado seguiu sozinho.

## Última publicação bem-sucedida (Etapa 2)

O programa servido pela nuvem é **idêntico byte a byte** à Versão 56 do Claude: md5 do programa
`4c15674f1a404da941718345a6ff8ac0` nos dois; a nuvem só acrescenta o cabeçalho
(`nuvem/cabecalho.html`). Os arquivos `jb-nuvem.js`, `admin.html`, manifesto e ícone foram
copiados do site no ar e conferidos por md5. Esse estado é o primeiro commit do repositório
(`Base: JB Gestão exatamente como está no ar`), ponto de recuperação.

## Comparação dos dados (Claude × banco central), registro a registro

Método: impressão digital (md5) de cada documento no formato do Postgres, comparada por coleção.

- **23 de 31 coleções idênticas**, incluindo todos os dados de negócio: funcionários (68),
  dados sensíveis (68), compras (60), consumos (16), fornecedores (20), locais (25), produtos (11),
  almoxarifado, paletes, produção, financeiro, despesas, vendas, clientes, comprovantes, admissões,
  férias, afastamentos, desligamentos, configuração.
- Diferenças (só registros de sistema, alterados depois da importação):

| Registro | Decisão | Motivo |
|---|---|---|
| `iaVersoes/52b8…` (Versão 56) | **copiado para o banco central** | só existia no Claude |
| `log` (3 blocos) | mantida a nuvem | todos os itens do Claude estão na nuvem, idênticos; a nuvem tem 1 item a mais em cada |
| `acesso` (2), `ws` (3), `diagnostico/20261030` | mantida a nuvem | a versão da nuvem é a mais recente (ex.: perfil alterado na nuvem às 18:03) |
| `uso/2026-10` | mantida a nuvem | contador de uso de telas; a nuvem é a mais recente. As contagens do Claude entre 17:00 e 17:34 não foram somadas (telemetria, não é dado de negócio) |
| `acesso`/`ws` de 2 usuários novos, `fin/teste-e2e`, `prodFab/teste-e2e` | já estavam só na nuvem | — |

Depois da cópia, `iaVersoes` confere com o Claude (md5 `f23329fc…`). Cópia de segurança nº 4
(397 registros) feita antes de qualquer alteração; o banco do Claude também foi baixado inteiro
(fora do repositório).

## Riscos e pendências encontrados

1. **Repositório público.** Recomendo torná-lo privado (GitHub → Settings → General → Danger Zone →
   Change visibility). O Netlify funciona igual com repositório privado. Nada de dado pessoal ou
   segredo foi enviado (há um teste que barra chaves).
2. **`jb-publicar-site`** (função temporária de uma sessão anterior): aceita publicar no Netlify com
   um segredo fixo no código. Com o deploy pelo GitHub ela deixa de ser necessária;
   recomendo desativá-la (não desativei sem autorização).
3. **Proteção contra senhas vazadas** desligada no Supabase Auth (aviso do próprio Supabase).
4. **Anexos não são unificados**: no Claude ficam no armazenamento do artifact; na nuvem, no
   Supabase Storage (bucket `anexos`, vazio). Os 5 comprovantes antigos apontam para arquivos do Claude.
5. Registros de teste `fin/teste-e2e` e `prodFab/teste-e2e` e usuários `teste.admin`/`teste.joao`
   (desativados), de uma sessão anterior. Não apaguei.
6. Dois acessos antigos do Claude sem login na nuvem (`u_KXuEHDOM…`, `u_Lh6DhRab…`): se ainda
   trabalham, precisam de usuário na nuvem (aba "Usuários e permissões", opção "vincular ao acesso antigo").
7. As preferências pessoais (`data/users/<id>/prefs`) não estão entre as coleções liberadas no `seg`:
   na nuvem, só administradores conseguem gravá-las (comportamento anterior, não alterado).
