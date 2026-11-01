// JB Gestão · login, sessões e administração de contas
// Roda no servidor (Supabase Edge Functions). O navegador nunca recebe chave de serviço nem segredo.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const CHAVE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAVE_PUBLICA = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORIGENS = (Deno.env.get("JB_ORIGENS") || "*").split(",").map((s) => s.trim()).filter(Boolean);
const DOMINIO_INTERNO = "jbgestao.invalid"; // e-mail interno; ninguém recebe mensagem nele

const admin = createClient(SB_URL, CHAVE_SERVICO, { auth: { persistSession: false, autoRefreshToken: false } });
const publico = () => createClient(SB_URL, CHAVE_PUBLICA, { auth: { persistSession: false, autoRefreshToken: false } });
// cliente que age como a pessoa logada: o banco confere a assinatura do token e a sessão do JB
const comoUsuario = (token: string) => createClient(SB_URL, CHAVE_PUBLICA, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${token}` } },
});
const tokenDe = (req: Request) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");

let segredoCache: string | null = null;
async function segredo(): Promise<string> {
  if (segredoCache) return segredoCache;
  const { data, error } = await admin.rpc("jb_srv_segredo");
  if (error || !data) throw new Error("segredo das senhas não configurado");
  segredoCache = String(data);
  return segredoCache;
}

// senha interna = HMAC(segredo, usuario:senha). Sem o segredo do servidor, a senha digitada
// não serve para entrar direto na API de autenticação, só pelo login do JB (com limites e registro).
async function senhaInterna(usuario: string, senha: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(await segredo()),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${usuario}:${senha}`));
  return "H" + Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const emailDe = (usuario: string) => `${usuario}@${DOMINIO_INTERNO}`;
const USUARIO_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function cors(req: Request) {
  const origem = req.headers.get("origin") || "";
  const permitida = ORIGENS.includes("*") ? "*" : (ORIGENS.includes(origem) ? origem : ORIGENS[0] || "");
  return {
    "Access-Control-Allow-Origin": permitida,
    "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  };
}
const ip = (req: Request) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
const navegador = (req: Request) => (req.headers.get("user-agent") || "").slice(0, 300);
class Falha extends Error { constructor(public status: number, public codigo: string, msg: string) { super(msg); } }
const falha = (status: number, codigo: string, msg: string) => new Falha(status, codigo, msg);
const str = (v: unknown, max = 200) => (typeof v === "string" ? v : "").slice(0, max);

async function politicaSenha(senha: string, usuario: string) {
  const { data } = await admin.rpc("jb_srv_senha_min");
  const min = Number(data ?? 8) || 8;
  if (senha.length < min) throw falha(400, "senha_curta", `A senha precisa ter pelo menos ${min} caracteres.`);
  if (senha.length > 128) throw falha(400, "senha_longa", "A senha pode ter no máximo 128 caracteres.");
  if (senha.toLowerCase().includes(usuario.toLowerCase())) throw falha(400, "senha_fraca", "A senha não pode conter o nome de usuário.");
  if (/^(.)\1+$/.test(senha) || /^(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|senha|password)/i.test(senha)) {
    throw falha(400, "senha_fraca", "Escolha uma senha menos óbvia.");
  }
}

// quem está chamando: o banco confere o token e a sessão do JB (não basta ter um token)
async function quem(req: Request) {
  const token = tokenDe(req);
  if (!token) throw falha(401, "sem_sessao", "Entre no sistema para continuar.");
  const { data: q, error } = await comoUsuario(token).rpc("jb_quem");
  if (error || !q?.uid) throw falha(401, "sem_sessao", "Sessão inválida. Entre de novo.");
  if (!q.valida) throw falha(401, "sessao_encerrada", "Sua sessão foi encerrada. Entre de novo.");
  return { userId: String(q.uid), sessao: String(q.sessao || ""), token, admin: !!q.admin, trocarSenha: !!q.trocarSenha, usuario: String(q.usuario || "") };
}
async function exigirAdmin(req: Request) {
  const q = await quem(req);
  if (!q.admin) throw falha(403, "somente_admin", "Somente administradores podem fazer isso.");
  return q;
}

async function login(req: Request, b: Record<string, unknown>) {
  const usuario = str(b.usuario, 40).trim().toLowerCase();
  const senha = str(b.senha, 128);
  if (!USUARIO_RE.test(usuario) || !senha) throw falha(400, "dados", "Informe usuário e senha.");
  const { data: prep, error } = await admin.rpc("jb_srv_login_preparar", { p_usuario: usuario, p_ip: ip(req) });
  if (error) throw falha(500, "servidor", "Não foi possível entrar agora.");
  const sit = prep.situacao as string;
  if (sit === "ip_bloqueado") throw falha(429, "muitas_tentativas", `Muitas tentativas. Aguarde ${prep.minutos} minutos.`);
  if (sit === "bloqueado_temporario") throw falha(423, "bloqueado_temporario", `Conta bloqueada temporariamente. Tente em ${prep.minutos} minutos.`);
  if (sit === "bloqueado") throw falha(423, "bloqueado", "Conta bloqueada. Procure o administrador.");
  if (sit === "inativo") throw falha(403, "inativo", "Conta desativada. Procure o administrador.");
  if (sit !== "ok") {
    await admin.rpc("jb_srv_login_falhou", { p_usuario: usuario, p_ip: ip(req), p_navegador: navegador(req), p_motivo: "usuario" });
    throw falha(401, "credenciais", "Usuário ou senha incorretos.");
  }
  const { data: sess, error: e2 } = await publico().auth.signInWithPassword({ email: prep.email, password: await senhaInterna(usuario, senha) });
  if (e2 || !sess.session) {
    const { data: f } = await admin.rpc("jb_srv_login_falhou", { p_usuario: usuario, p_ip: ip(req), p_navegador: navegador(req), p_motivo: "senha" });
    if (f?.bloqueou) throw falha(423, "bloqueado_temporario", `Senha incorreta. Conta bloqueada por ${f.minutos} minutos.`);
    throw falha(401, "credenciais", "Usuário ou senha incorretos.");
  }
  const claims = JSON.parse(atob(sess.session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  const { data: ok, error: e3 } = await admin.rpc("jb_srv_login_ok", {
    p_user: prep.user_id, p_sessao: String(claims.session_id), p_ip: ip(req), p_navegador: navegador(req) });
  if (e3) { await admin.auth.admin.signOut(sess.session.access_token).catch(() => {}); throw falha(403, "indisponivel", "Conta indisponível."); }
  return {
    access_token: sess.session.access_token, refresh_token: sess.session.refresh_token,
    expires_at: sess.session.expires_at, usuario: ok.usuario, nome: ok.nome, trocarSenha: ok.trocarSenha,
  };
}

async function logout(req: Request) {
  const token = tokenDe(req);
  if (!token) return { ok: true };
  await comoUsuario(token).rpc("jb_sair").then(() => {}, () => {});
  await admin.auth.admin.signOut(token, "local").catch(() => {});
  return { ok: true };
}

async function trocarSenha(req: Request, b: Record<string, unknown>) {
  const q = await quem(req);
  const usuario = q.usuario;
  const atual = str(b.senhaAtual, 128), nova = str(b.senhaNova, 128);
  if (!atual || !nova) throw falha(400, "dados", "Informe a senha atual e a nova.");
  if (atual === nova) throw falha(400, "senha_igual", "A senha nova precisa ser diferente da atual.");
  const { data: conf, error: e2 } = await publico().auth.signInWithPassword({ email: emailDe(usuario), password: await senhaInterna(usuario, atual) });
  if (conf?.session) await admin.auth.admin.signOut(conf.session.access_token, "local").catch(() => {}); // só conferia a senha
  if (e2) {
    await admin.rpc("jb_srv_login_falhou", { p_usuario: usuario, p_ip: ip(req), p_navegador: navegador(req), p_motivo: "senha_atual" });
    throw falha(401, "senha_atual", "A senha atual está incorreta.");
  }
  await politicaSenha(nova, usuario);
  const { error: e3 } = await admin.auth.admin.updateUserById(q.userId, { password: await senhaInterna(usuario, nova) });
  if (e3) throw falha(500, "servidor", "Não foi possível trocar a senha.");
  await admin.rpc("jb_srv_senha_trocada", { p_user: q.userId, p_sessao: q.sessao, p_ip: ip(req) });
  return { ok: true };
}

async function criarUsuario(req: Request, b: Record<string, unknown>) {
  const eu = await exigirAdmin(req);
  const usuario = str(b.usuario, 40).trim().toLowerCase();
  const nome = str(b.nome, 120).trim();
  const senha = str(b.senhaInicial, 128);
  const ehAdmin = b.admin === true;
  if (!USUARIO_RE.test(usuario)) throw falha(400, "usuario", "Usuário: 3 a 40 caracteres, só letras minúsculas, números, ponto, traço ou sublinhado.");
  if (nome.length < 2) throw falha(400, "nome", "Informe o nome.");
  await politicaSenha(senha, usuario);
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: emailDe(usuario), password: await senhaInterna(usuario, senha), email_confirm: true,
    user_metadata: { usuario, nome },
  });
  if (error || !criado.user) {
    if ((error?.message || "").toLowerCase().includes("already")) throw falha(409, "usuario_existe", "Já existe um usuário com esse nome.");
    throw falha(500, "servidor", "Não foi possível criar o usuário.");
  }
  const { data: uid, error: e2 } = await admin.rpc("jb_srv_criar_perfil", {
    p_user: criado.user.id, p_usuario: usuario, p_nome: nome, p_admin: ehAdmin, p_autor: eu.userId, p_ip: ip(req), p_uid_app: str(b.uidApp, 40) || null });
  if (e2) {
    await admin.auth.admin.deleteUser(criado.user.id).catch(() => {});
    if ((e2.message || "").includes("perfis_usuario_key")) throw falha(409, "usuario_existe", "Já existe um usuário com esse nome.");
    throw falha(400, "perfil", "Não foi possível registrar o usuário: " + e2.message);
  }
  return { id: criado.user.id, usuario, nome, uid: uid, trocarSenha: true };
}

async function redefinirSenha(req: Request, b: Record<string, unknown>) {
  const eu = await exigirAdmin(req);
  const userId = str(b.userId, 60);
  const nova = str(b.senhaNova, 128);
  const { data: alvoUsuario } = await admin.rpc("jb_srv_usuario_de", { p_user: userId });
  if (!alvoUsuario) throw falha(404, "usuario", "Usuário não encontrado.");
  await politicaSenha(nova, String(alvoUsuario));
  const { error } = await admin.auth.admin.updateUserById(userId, { password: await senhaInterna(String(alvoUsuario), nova) });
  if (error) throw falha(500, "servidor", "Não foi possível redefinir a senha.");
  await admin.rpc("jb_srv_senha_redefinida", { p_user: userId, p_autor: eu.userId, p_ip: ip(req) });
  return { ok: true, trocarSenha: true };
}

async function situacaoConta(req: Request, b: Record<string, unknown>) {
  const eu = await exigirAdmin(req);
  const { error } = await admin.rpc("jb_srv_situacao_conta", { p_user: str(b.userId, 60), p_acao: str(b.acao, 20), p_autor: eu.userId, p_ip: ip(req) });
  if (error) throw falha(400, "acao", error.message);
  return { ok: true };
}

// primeiro administrador: só funciona enquanto não houver nenhum usuário, com o código de instalação
async function instalar(req: Request, b: Record<string, unknown>) {
  const codigo = str(b.codigo, 200);
  const { data: pode } = await admin.rpc("jb_srv_instalacao_permitida", { p_codigo: codigo });
  if (!pode) {
    await admin.rpc("jb_srv_evento", { p_tipo: "instalacao_recusada", p_user: null, p_autor: null, p_ip: ip(req), p_detalhes: {} });
    throw falha(403, "instalacao", "Código de instalação inválido ou sistema já instalado.");
  }
  const usuario = str(b.usuario, 40).trim().toLowerCase();
  const nome = str(b.nome, 120).trim();
  const senha = str(b.senha, 128);
  if (!USUARIO_RE.test(usuario) || nome.length < 2) throw falha(400, "dados", "Informe usuário e nome.");
  await politicaSenha(senha, usuario);
  const { data: criado, error } = await admin.auth.admin.createUser({
    email: emailDe(usuario), password: await senhaInterna(usuario, senha), email_confirm: true, user_metadata: { usuario, nome } });
  if (error || !criado.user) throw falha(500, "servidor", "Não foi possível criar o administrador: " + (error?.message || ""));
  const { error: e2 } = await admin.rpc("jb_srv_criar_perfil", {
    p_user: criado.user.id, p_usuario: usuario, p_nome: nome, p_admin: true, p_autor: criado.user.id, p_ip: ip(req), p_uid_app: str(b.uidApp, 40) || null });
  if (e2) { await admin.auth.admin.deleteUser(criado.user.id).catch(() => {}); throw falha(400, "perfil", e2.message); }
  await admin.rpc("jb_srv_instalacao_concluir", { p_user: criado.user.id, p_ip: ip(req) });
  return { ok: true, usuario };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ erro: "metodo" }), { status: 405, headers: h });
  try {
    const url = new URL(req.url);
    const acao = url.pathname.split("/").filter(Boolean).pop() || "";
    let corpo: Record<string, unknown> = {};
    try { corpo = await req.json(); } catch { corpo = {}; }
    const r = acao === "login" ? await login(req, corpo)
      : acao === "logout" ? await logout(req)
      : acao === "trocar-senha" ? await trocarSenha(req, corpo)
      : acao === "criar-usuario" ? await criarUsuario(req, corpo)
      : acao === "redefinir-senha" ? await redefinirSenha(req, corpo)
      : acao === "situacao-conta" ? await situacaoConta(req, corpo)
      : acao === "instalar" ? await instalar(req, corpo)
      : acao === "ping" ? { ok: true }
      : null;
    if (r === null) return new Response(JSON.stringify({ erro: "acao" }), { status: 404, headers: h });
    return new Response(JSON.stringify(r), { headers: h });
  } catch (e) {
    if (e instanceof Falha) return new Response(JSON.stringify({ erro: e.codigo, mensagem: e.message }), { status: e.status, headers: h });
    console.error("jb-auth", e);
    return new Response(JSON.stringify({ erro: "servidor", mensagem: "Falha inesperada no servidor." }), { status: 500, headers: h });
  }
});
