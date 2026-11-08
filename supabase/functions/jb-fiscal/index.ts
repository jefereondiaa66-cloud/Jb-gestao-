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
// alguém, só essas pessoas (e o administrador) emitem, cancelam e inutilizam.
//
// Segredos (Supabase → Edge Functions → Secrets), nunca no repositório:
//   FOCUSNFE_TOKEN_HOMOLOGACAO  token da empresa na Focus NFe, ambiente de homologação
//   FOCUSNFE_TOKEN_PRODUCAO     token da empresa na Focus NFe, ambiente de produção
//   PRODUCAO_LIBERADA           "sim" libera produção; qualquer outro valor recusa produção
//   CNPJ_EMITENTE               (recomendado) CNPJ da cerâmica, só números: a função só emite
//                               para ele e precisa dele para inutilizar números
//   FOCUSNFE_TOKEN_CONTA        (opcional) token principal da conta, só para ler o cadastro
//                               da empresa (validade do certificado) na tela "Serviço"
// Publicar SEM conferência de token (verify_jwt = false): a chamada do banco não
// tem sessão; a função confere a sessão ou o segredo ela mesma.
//
// Corpo: {acao, args, quem?}. Resposta: o formato que o programa espera, ou
// {erro: {tipo, mensagem, problemas?}, retryable?} com código HTTP de erro.
// Cada chamada fica registrada em jbcore.fiscal_auditoria (ação "auditoria").
// =====================================================================
import { ACOES, criarServico } from "./nucleo.js";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SB_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const erro = (status: number, tipo: string, mensagem: string, retryable?: boolean) =>
  resp(status, retryable === undefined ? { erro: { tipo, mensagem } } : { erro: { tipo, mensagem, retryable }, retryable });

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

/** pessoa logada na nuvem: sessão conferida no banco (jb_eu) e perfil do documento acesso/<uid> */
async function quemDaNuvem(auth: string): Promise<Quem | null> {
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
  const cfg = await lerDoc(auth, "fiscalCfg", "geral").catch(() => null);
  const autorizados = cfg && Array.isArray(cfg.autorizados) ? (cfg.autorizados as unknown[]).map(String) : [];
  return { origem: "nuvem", uid, nome: String(eu.nome || eu.usuario || ""), papel, autorizados };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
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
    try { quem = await quemDaNuvem(auth); } catch { return erro(503, "indisponivel", "O servidor não confirmou o seu acesso agora. Nada foi enviado. Tente de novo.", true); }
    if (!quem) return erro(401, "autenticacao", "Sua sessão terminou. Entre de novo no sistema. Nada foi enviado.", false);
  }

  const servico = criarServico({ fetch, env: lerEnv(), banco, aviso: (m: string, e: unknown) => console.error(m, e) });
  const r = await servico.executar(acao, b.args, quem);
  return resp(r.status, r.corpo);
});
