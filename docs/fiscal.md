# JB Fiscal · nota fiscal (NF-e) pela Focus NFe

O Setor Fiscal do JB Gestão prepara, calcula e confere a nota. Quem assina e manda para a SEFAZ do
Maranhão é a **Focus NFe**. A ligação entre os dois é a função **jb-fiscal** do Supabase.

```
 JB Gestão (nuvem)  ── sessão de quem clica ──►  função jb-fiscal  ──►  Focus NFe  ──►  SEFAZ-MA
 JB Gestão (Claude) ── banco central (só administradores) ──┘   (tokens nos segredos do Supabase)
```

- Na **versão da nuvem**, cada pessoa entra com o próprio usuário e senha; o servidor confere a sessão e o perfil.
- No **Claude**, só administradores, pela ligação com o banco central (a mesma que grava os dados).
- Ninguém precisa ligar conector no Claude. O antigo conector "JB Fiscal" (Cloudflare) não é mais usado.
- Tudo fica em **homologação** (teste, sem valor fiscal) até a produção ser liberada no servidor e no JB.

## 1. O que o dono faz na Focus NFe (uma vez)

1. Entrar no painel da Focus NFe (a conta já existe).
2. Cadastrar a empresa: CNPJ, inscrição estadual, regime tributário e endereço. Ligar a emissão de **NF-e**.
3. Enviar o **certificado digital A1** (arquivo `.pfx` e a senha dele) no painel da Focus NFe.
   O certificado e a senha ficam **só lá**: não vão para o JB, para o Supabase nem para o repositório.
4. Pegar os **dois tokens da empresa** no painel: o de **homologação** e o de **produção**.
   (Opcional) o **token principal da conta**, se quiser ver a validade do certificado na tela "Serviço".
5. Numeração: o JB manda o número e a série de cada nota. Confira no painel da Focus a série usada
   e informe no JB (Setor Fiscal › Configurações › Numeração) o último número já usado por outro sistema.

## 2. Onde colar os tokens no Supabase (nomes exatos)

Supabase → projeto **JB Gestão** → **Edge Functions** → **Secrets** → adicionar:

| Nome (exatamente assim) | O que colar | Precisa? |
|---|---|---|
| `FOCUSNFE_TOKEN_HOMOLOGACAO` | token de homologação da empresa | sim |
| `FOCUSNFE_TOKEN_PRODUCAO` | token de produção da empresa | só para produção |
| `PRODUCAO_LIBERADA` | `nao` até terminar os testes; `sim` para liberar | sim |
| `CNPJ_EMITENTE` | CNPJ da cerâmica, só os 14 números | recomendado (sem ele não dá para inutilizar números, e o servidor não confere o CNPJ da nota) |
| `FOCUSNFE_TOKEN_CONTA` | token principal da conta Focus NFe | opcional (só para ler o certificado na tela "Serviço") |

Nunca cole token no chat, no programa, em planilha ou no repositório (ele é público).
Trocar um token: é só salvar o novo valor no mesmo nome; vale no pedido seguinte.

## 3. Instalação (feita uma vez por quem administra, ou pelo agente JB CORE)

1. Cópia de segurança: `select seg.fazer_copia();`
2. Aplicar a migração `supabase/migrations/20261108120000_jbcore_08_fiscal.sql`.
   Ela cria a auditoria fiscal, a reserva das referências e o segredo do cofre `jb_fiscal_segredo`
   (aleatório; o cabeçalho da migração explica como criar ou trocar à mão). Reversão: arquivo `.down.sql` ao lado.
3. Implantar a função **jb-fiscal** (pasta `supabase/functions/jb-fiscal`, arquivos `index.ts` e `nucleo.js`)
   com a conferência de JWT **desligada** (`verify_jwt = false`), como a jb-auth e a jb-publicar:
   a chamada do banco não tem sessão; a função confere a sessão ou o segredo ela mesma.
4. Publicar o programa (commit na `main` → nuvem; `saida/claude.html` → artifact do Claude).
5. No JB: **Setor Fiscal › Serviço e auditoria › Verificar agora**. Deve aparecer "Focus NFe", o token
   guardado, a ligação com a Focus aceita e, com `CNPJ_EMITENTE`, a empresa e o certificado.

## 4. Testes em homologação (antes de liberar a produção)

Faça cada um e confira o resultado na nota e na auditoria do serviço:

1. Emitir uma nota → "Autorizada" com protocolo; baixar o DANFE e o XML.
2. Emitir uma nota com erro de propósito (ex.: NCM errado no produto) → "Rejeitada" com o motivo; corrigir e reenviar.
3. "Consultar situação" de uma nota → a situação confere.
4. Cancelar uma nota autorizada → "Cancelada" com protocolo; baixar o XML do cancelamento.
5. Descartar uma nota numerada e inutilizar o número (Configurações › Números a inutilizar).

## 5. Liberar a produção

1. Testes de homologação feitos e perfis tributários conferidos pelo contador.
2. No Supabase: `FOCUSNFE_TOKEN_PRODUCAO` guardado e `PRODUCAO_LIBERADA` = `sim`.
3. No JB: Configurações fiscais → **Conferir requisitos e liberar a produção** → escolher o ambiente
   "Produção" e salvar.

Para bloquear de novo: `PRODUCAO_LIBERADA` = `nao` no Supabase (o servidor recusa produção na hora,
inclusive consultas) e, no JB, **Bloquear a produção de novo**.

## O que fica guardado onde

| O quê | Onde |
|---|---|
| Certificado A1 e a senha dele | só na Focus NFe |
| Tokens da Focus NFe | segredos das funções do Supabase (nomes da tabela acima) |
| Segredo que deixa o banco chamar a função | cofre do banco: `jb_fiscal_segredo` |
| Notas, configuração fiscal, XML autorizado e cópia de cada pedido | banco central (`public.docs`: `nfe`, `fiscalCfg`, `nfeXml`, `nfePayload`) |
| Reserva de cada referência de envio | `jbcore.fiscal_envios` |
| Auditoria do serviço (quem, o quê, quando, resultado) | `jbcore.fiscal_auditoria` (Setor Fiscal › Serviço › Carregar a auditoria) |
| XML e DANFE originais | também na Focus NFe |
| Código | este repositório (público: sem token, sem senha, sem dado de pessoa) |

## Regras que o serviço segue

- **Só conta como autorizada a nota com o protocolo da SEFAZ.** O protocolo é lido do próprio XML
  autorizado; sem ele, a nota fica "Aguardando consulta".
- **Nunca envia duas vezes a mesma nota.** Cada envio tem uma referência única, reservada no banco antes;
  antes de enviar, o serviço consulta a Focus por ela. Sem resposta, a nota fica "Aguardando consulta":
  use **Consultar situação** antes de qualquer reenvio.
- **Produção bloqueada** enquanto `PRODUCAO_LIBERADA` não for `sim`.
- **Quem pode** (a mesma regra do programa): ver e consultar — administrador, gerente, financeiro e
  vendedor; emitir — administrador, gerente e financeiro; cancelar e inutilizar — administrador e gerente;
  auditoria — administrador e gerente. Se a lista "Quem pode emitir e cancelar" tiver alguém marcado,
  só essas pessoas (e o administrador) emitem, cancelam e inutilizam.
- Todo erro vem em português, dizendo se algo foi enviado ou não.

## O que a ligação ainda não envia

Para não inventar, o serviço só manda à Focus os campos com nome conferido. A nota que usa um destes
dados é **recusada antes do envio** (nada é transmitido) com a lista do que falta:

- crédito de ICMS do Simples (CSOSN 101), redução da base do ICMS (CST 20), diferimento (CST 51), FCP;
- código CEST do produto;
- IBS e CBS (reforma tributária);
- fatura e duplicatas (venda a prazo com parcelas);
- forma de pagamento "Outros" (código 99), que exige a descrição;
- indicador de intermediador (venda não presencial);
- responsável técnico (Configurações fiscais).

Para liberar um deles: conferir o nome do campo na documentação da Focus NFe (focusnfe.com.br/doc),
acrescentar em `supabase/functions/jb-fiscal/nucleo.js` (mapas `M_*`) com teste em
`scripts/testar-fiscal.mjs`, e testar em homologação.

## Problemas comuns

| Mensagem | O que fazer |
|---|---|
| "Falta o token da Focus NFe de homologação" | guardar `FOCUSNFE_TOKEN_HOMOLOGACAO` no Supabase |
| "A Focus NFe recusou o acesso" | conferir o token do ambiente e se a empresa está habilitada para NF-e na Focus |
| "A produção está bloqueada no servidor" | `PRODUCAO_LIBERADA` = `sim` (só depois dos testes) |
| "A nota é do CNPJ …, mas o serviço está configurado para …" | o CNPJ das Configurações fiscais e o `CNPJ_EMITENTE` precisam ser iguais |
| "A nota usa dados que a ligação com a Focus NFe ainda não sabe enviar" | ver a lista acima; nada foi enviado |
| "O serviço fiscal não respondeu" / "Aguardando consulta" | esperar um pouco e usar **Consultar situação**; nunca reenviar antes |
| Na nuvem, pessoa sem administrador não consegue salvar a nota | as coleções `nfe`, `fiscalCfg`, `nfeXml`, `nfePayload` precisam estar nas permissões do servidor (`seg.colecoes`); pedir ao agente JB CORE |

Testes sem rede: `node scripts/testar-fiscal.mjs` (também rodam em `node scripts/verificar.mjs`).
