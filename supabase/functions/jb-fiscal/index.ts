// =====================================================================
// JB Fiscal · NF-e (modelo 55) pela Focus NFe
//
// O Setor Fiscal do programa chama UM ponto, chamarF(ferramenta, args). Esta
// função atende esse ponto pelos dois caminhos do sistema:
//  (a) versão da nuvem: nuvem/jb-nuvem.js → JB_NUVEM_API.fiscal, com a sessão
//      do JB no cabeçalho Authorization. A sessão é conferida no banco (jb_eu,
//      regras seg.*) e o perfil da pessoa vem do documento acesso/<uid>.
//  (b) Claude: a ponte (bloco jb-core-ponte) chama jbcore.fiscal no banco, que
//      só aceita administrador da ponte e dispara esta função por pg_net com o
//      segredo do cofre (jb_fiscal_segredo) no cabeçalho x-jb-fiscal-segredo.
//      O segredo é conferido no banco (public.jb_fiscal_confere): ele não fica
//      nas variáveis desta função.
// A lógica (tradução infNFe → Focus, idempotência, respostas no formato que o
// programa espera) está em nucleo.js, testado sem rede por scripts/testar-fiscal.mjs.
//
// Quem pode o quê (a mesma regra do programa, PERM['setor-fiscal-*']; não há
// módulo "setor-fiscal" nas permissões seg.*):
//   ver, consultar, baixar XML/DANFE, CEP, CNPJ: administrador, gerente, financeiro, vendedor
//   emitir: administrador, gerente, financeiro
//   cancelar e inutilizar: administrador, gerente
//   auditoria: administrador, gerente
// e, se a lista "Quem pode emitir e cancelar" (fiscalCfg/geral.autorizados) tiver
// alguém, só essas pessoas (e o administrador) emitem, cancelam e inutilizam. Essa lista
// é lida com a credencial interna da função (não com a sessão de quem chama); se a leitura
// falhar, emitir, cancelar e inutilizar são recusados (503 "indisponivel", nada enviado).
//
// Segredos (Supabase → Edge Functions → Secrets), nunca no repositório:
//   FOCUSNFE_TOKEN_HOMOLOGACAO  token da empresa na Focus NFe, ambiente de homologação
//   FOCUSNFE_TOKEN_PRODUCAO     token da empresa na Focus NFe, ambiente de produção
//   PRODUCAO_LIBERADA           "sim" libera produção; qualquer outro valor recusa produção
//   CNPJ_EMITENTE               (OBRIGATÓRIO) CNPJ da cerâmica, só os 14 números: a função confere
//                               que a nota é dele, inutiliza números e lê o cadastro da empresa
//   FOCUSNFE_TOKEN_CONTA        token principal da conta Focus NFe: necessário para a tela "Serviço"
//                               ler o cadastro da empresa e o certificado A1; sem ele o programa não
//                               libera a produção (bloqueio de propósito)
//   JB_ORIGENS                  (opcional, o mesmo da jb-auth) sites que podem chamar a função pelo
//                               navegador, separados por vírgula; padrão https://jb-gestao-ceramica.netlify.app
// Publicar SEM conferência de token (verify_jwt = false): a chamada do banco não
// tem sessão; a função confere a sessão ou o segredo ela mesma.
//
// Corpo: {acao, args, quem?}. Resposta: o formato que o programa espera, ou
// {erro: {tipo, mensagem, problemas?}, retryable?} com código HTTP de erro.
// Cada chamada fica registrada em jbcore.fiscal_auditoria (ação "auditoria").
// =====================================================================
import { ACOES, ACOES_COM_LISTA, autorizadosDaLeitura, criarServico } from "./nucleo.js";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/* a mesma regra da jb-auth: só os sites da lista recebem a autorização do navegador (CORS) */
const ORIGENS = (Deno.env.get("JB_ORIGENS") || "https://jb-gestao-ceramica.netlify.app").split(",").map((s) => s.trim()).filter(Boolean);

function cors(req: Request): Record<string, string> {
  const origem = req.headers.get("origin") || "";
  const permitida = ORIGENS.includes("*") ? "*" : (ORIGENS.includes(origem) ? origem : ORIGENS[0] || "");
  return {
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "7200",
    "Vary": "Origin",
  };
}

/* as variáveis são lidas a cada pedido: trocar um segredo no Supabase vale na hora */
const lerEnv = () => ({
  FOCUSNFE_TOKEN_HOMOLOGACAO: Deno.env.get("FOCUSNFE_TOKEN_HOMOLOGACAO") ?? "",
  FOCUSNFE_TOKEN_PRODUCAO: Deno.env.get("FOCUSNFE_TOKEN_PRODUCAO") ?? "",
  FOCUSNFE_TOKEN_CONTA: Deno.env.get("FOCUSNFE_TOKEN_CONTA") ?? "",
  PRODUCAO_LIBERADA: Deno.env.get("PRODUCAO_LIBERADA") ?? "",
  CNPJ_EMITENTE: Deno.env.get("CNPJ_EMITENTE") ?? "",
});

/* funções do banco que só a credencial interna da função (service_role) pode chamar */
async function rpcServico(nome: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: { apikey: SB_SERVICO, authorization: `Bearer ${SB_SERVICO}`, "content-type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10_000),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco respondeu ${r.status} em ${nome}: ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
const banco = {
  reservar: (ambiente: string, referencia: string, sha256: string, uid: string | null) =>
    rpcServico("jb_fiscal_reservar", { p_ambiente: ambiente, p_referencia: referencia, p_sha256: sha256, p_uid_app: uid }),
  marcar: (ambiente: string, referencia: string, situacao: string, detalhe: string | null) =>
    rpcServico("jb_fiscal_marcar", { p_ambiente: ambiente, p_referencia: referencia, p_situacao: situacao, p_detalhe: detalhe }),
  envio: (ambiente: string, referencia: string) => rpcServico("jb_fiscal_envio", { p_ambiente: ambiente, p_referencia: referencia }),
  registrar: (registro: Record<string, unknown>) => rpcServico("jb_fiscal_registrar", { p: registro }),
  auditoria: (limite: number) => rpcServico("jb_fiscal_auditoria", { p_limite: limite }),
};

async function segredoConfere(segredo: string): Promise<boolean> {
  if (segredo.length < 32 || segredo.length > 200) return false;
  return (await rpcServico("jb_fiscal_confere", { p_segredo: segredo })) === true;
}

type Quem = { origem: string; uid: string; nome: string; papel: string; autorizados: string[] };

/* um documento que a própria pessoa pode ler (as regras de leitura do banco valem) */
async function lerDoc(auth: string, colecao: string, id: string): Promise<Record<string, unknown> | null> {
  const u = `${SB_URL}/rest/v1/docs?select=dados&colecao=eq.${encodeURIComponent(colecao)}&id=eq.${encodeURIComponent(id)}`;
  const r = await fetch(u, { headers: { apikey: SB_ANON, authorization: auth, accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (!r.ok) return null;
  const l = await r.json().catch(() => null);
  return Array.isArray(l) && l[0] && l[0].dados && typeof l[0].dados === "object" ? l[0].dados as Record<string, unknown> : null;
}

/** Lista "Quem pode emitir e cancelar" (fiscalCfg/geral.autorizados) lida com a credencial interna da
    função (service_role): a regra não pode depender do que a sessão de quem chama consegue ler.
    null = o banco não respondeu 200 com um resultado válido (ver autorizadosDaLeitura em nucleo.js). */
async function autorizadosDoServidor(): Promise<string[] | null> {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/docs?select=dados&colecao=eq.fiscalCfg&id=eq.geral`, {
      headers: { apikey: SB_SERVICO, authorization: `Bearer ${SB_SERVICO}`, accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    const t = await r.text();
    let linhas: unknown = undefined;
    try { linhas = JSON.parse(t); } catch { linhas = undefined; }
    return autorizadosDaLeitura(r.status, linhas);
  } catch {
    return null;
  }
}
class SemListaAutorizados extends Error {}

/** pessoa logada na nuvem: sessão conferida no banco (jb_eu) e perfil do documento acesso/<uid>.
    Para emitir, cancelar e inutilizar, também a lista de autorizados; sem ela, SemListaAutorizados. */
async function quemDaNuvem(auth: string, acao: string): Promise<Quem | null> {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/jb_eu`, {
    method: "POST",
    headers: { apikey: SB_ANON, authorization: auth, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return null;
  const eu = await r.json().catch(() => null);
  if (!eu || !eu.uid) return null;
  const uid = String(eu.uid);
  let papel = "consulta";
  if (eu.admin) papel = "admin";
  else {
    const ac = await lerDoc(auth, "acesso", uid).catch(() => null);
    if (ac && ac.ativo !== false && typeof ac.papel === "string") papel = ac.papel;
  }
  /* consultas seguem só a regra por perfil; quem transmite precisa da lista confirmada pelo servidor */
  let autorizados: string[] = [];
  if (ACOES_COM_LISTA.includes(acao)) {
    const l = await autorizadosDoServidor();
    if (l === null) throw new SemListaAutorizados();
    autorizados = l;
  }
  return { origem: "nuvem", uid, nome: String(eu.nome || eu.usuario || ""), papel, autorizados };
}

Deno.serve(async (req: Request) => {
  const h = cors(req);
  const resp = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...h, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  const erro = (status: number, tipo: string, mensagem: string, retryable?: boolean) =>
    resp(status, retryable === undefined ? { erro: { tipo, mensagem } } : { erro: { tipo, mensagem, retryable }, retryable });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return erro(405, "pedido", "Use POST.");
  if (!SB_URL || !SB_ANON || !SB_SERVICO) return erro(503, "configuracao", "A função fiscal está sem acesso ao banco do Supabase. Nada foi enviado.", false);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return erro(400, "pedido", "Pedido inválido. Nada foi enviado."); }
  const acao = String(b?.acao ?? "");
  if (!ACOES.includes(acao)) return erro(400, "pedido", "Ação fiscal desconhecida. Nada foi enviado.");

  let quem: Quem | null;
  const segredo = req.headers.get("x-jb-fiscal-segredo") ?? "";
  if (segredo) {
    // (b) chamada do banco: jbcore.fiscal já conferiu que é administrador da ponte
    let ok = false;
    try { ok = await segredoConfere(segredo); } catch { return erro(503, "indisponivel", "O servidor não conferiu a chamada agora. Nada foi enviado. Tente de novo.", true); }
    if (!ok) return erro(403, "acesso", "Chamada interna recusada. Nada foi enviado.", false);
    const q = (b.quem && typeof b.quem === "object" ? b.quem : {}) as Record<string, unknown>;
    quem = { origem: "claude", uid: String(q.uid_app ?? ""), nome: String(q.nome ?? ""), papel: "admin", autorizados: [] };
  } else {
    // (a) pessoa logada na nuvem
    const auth = req.headers.get("authorization") ?? "";
    if (!/^Bearer\s+\S+/.test(auth)) return erro(401, "autenticacao", "Entre no sistema de novo para usar o Setor Fiscal. Nada foi enviado.", false);
    try { quem = await quemDaNuvem(auth, acao); } catch (e) {
      if (e instanceof SemListaAutorizados) {
        return erro(503, "indisponivel", "O servidor não conseguiu ler agora as Configurações fiscais (quem pode emitir e cancelar). Nada foi enviado. Tente de novo em instantes.", true);
      }
      return erro(503, "indisponivel", "O servidor não confirmou o seu acesso agora. Nada foi enviado. Tente de novo.", true);
    }
    if (!quem) return erro(401, "autenticacao", "Sua sessão terminou. Entre de novo no sistema. Nada foi enviado.", false);
  }

  const servico = criarServico({ fetch, env: lerEnv(), banco, aviso: (m: string, e: unknown) => console.error(m, e) });
  const r = await servico.executar(acao, b.args, quem);
  return resp(r.status, r.corpo);
});
