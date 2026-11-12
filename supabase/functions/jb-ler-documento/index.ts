// =====================================================================
// JB Gestão · leitura de documentos por IA (Lançamento Inteligente por Foto)
//
// Usada pela versão da nuvem (nuvem/jb-nuvem.js → leitor.ler). Recebe as
// páginas do documento (JPEG em base64, já preparadas no navegador) e o
// pedido de leitura montado pelo programa, confere a sessão e a permissão
// da pessoa e pede a leitura ao Claude. Devolve só o texto da resposta
// (o JSON lido); quem confere, liga aos cadastros e grava é o programa,
// depois que a pessoa confirma.
//
// · A chave da API fica no cofre de segredos das funções do Supabase
//   (ANTHROPIC_API_KEY). Ela nunca vai para o navegador nem para o repositório.
// · Só atende quem está com a sessão do JB válida e pode lançar no
//   almoxarifado, no financeiro ou nas compras e consumos (lenha e combustível;
//   V74: lançar abastecimentos por foto), ou é administrador.
// · Não lê nem grava dados do sistema. Não guarda as imagens.
//
// Corpo: {prompt: string, paginas: [{tipo: "image/jpeg"|"image/png", dados: base64}]}
// Resposta: {ok: true, texto, modelo} ou {erro, mensagem}
// Ativar: Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY (opcional: JB_IA_MODELO)
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
// V104 (12/11/2026): a chave vale mesmo se foi guardada nos segredos com outro nome
// (aconteceu: salva como "Jb"). Primeiro o nome certo; se não houver, o segredo cujo valor é uma chave do Claude.
const CHAVE_IA = (() => {
  const direta = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
  if (direta) return direta;
  for (const v of Object.values(Deno.env.toObject())) {
    const t = (v || "").trim();
    if (/^sk-ant-\S+$/.test(t)) return t;
  }
  return "";
})();
const MODELO = Deno.env.get("JB_IA_MODELO") || "claude-opus-5-5";
const MAX_PAGINAS = 20;
const MAX_BYTES_PAGINA = 6 * 1024 * 1024;     // base64 de uma página
const MAX_BYTES_TOTAL = 24 * 1024 * 1024;
const MAX_PROMPT = 300_000;

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });
const falha = (status: number, erro: string, mensagem: string) => resp(status, { erro, mensagem });

/** confere a sessão do JB (mesma regra do resto do sistema) e a permissão de lançar */
async function quem(auth: string) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/jb_eu`, {
    method: "POST",
    headers: { apikey: SB_ANON, authorization: auth, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) return null;
  const eu = await r.json().catch(() => null);
  if (!eu || !eu.uid) return null;
  const p = eu.permissoes || {};
  const pode = !!eu.admin || !!(p.almox && p.almox.criar) || !!(p.financeiro && p.financeiro.criar) || !!(p.compras && p.compras.criar);
  return { uid: String(eu.uid), pode };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return falha(405, "metodo", "Use POST.");
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) return falha(401, "sessao", "Entre no sistema de novo.");
  let eu;
  try { eu = await quem(auth); } catch { return falha(503, "servidor", "O servidor não confirmou o seu acesso agora. Tente de novo."); }
  if (!eu) return falha(401, "sessao", "Sua sessão terminou. Entre de novo no sistema.");
  if (!eu.pode) return falha(403, "permissao", "Seu acesso não permite lançar no Almoxarifado, no Financeiro nem no Combustível.");
  if (!CHAVE_IA) {
    return falha(503, "sem_chave", "A leitura por IA ainda não foi ativada no servidor: falta guardar a chave da API do Claude (ANTHROPIC_API_KEY) nos segredos das funções do Supabase. Avise o administrador.");
  }

  let corpo: { prompt?: unknown; paginas?: unknown };
  try { corpo = await req.json(); } catch { return falha(400, "pedido", "Pedido inválido."); }
  const prompt = typeof corpo.prompt === "string" ? corpo.prompt : "";
  const paginas = Array.isArray(corpo.paginas) ? corpo.paginas : [];
  if (!prompt || prompt.length > MAX_PROMPT) return falha(400, "pedido", "Pedido de leitura inválido.");
  if (paginas.length > MAX_PAGINAS) return falha(413, "grande", `No máximo ${MAX_PAGINAS} imagens por leitura.`);
  let total = 0;
  const imagens: Anthropic.ImageBlockParam[] = [];
  for (const p of paginas) {
    const tipo = p && typeof p === "object" ? (p as { tipo?: unknown }).tipo : "";
    const dados = p && typeof p === "object" ? (p as { dados?: unknown }).dados : "";
    if ((tipo !== "image/jpeg" && tipo !== "image/png") || typeof dados !== "string" || !/^[A-Za-z0-9+/]+=*$/.test(dados)) {
      return falha(400, "pagina", "Uma das páginas não é JPG ou PNG válido.");
    }
    if (dados.length > MAX_BYTES_PAGINA) return falha(413, "grande", "Uma das páginas é grande demais.");
    total += dados.length;
    imagens.push({ type: "image", source: { type: "base64", media_type: tipo, data: dados } });
  }
  if (total > MAX_BYTES_TOTAL) return falha(413, "grande", "Documento grande demais para uma leitura. Envie menos páginas.");
  if (!imagens.length && !/TEXTO EXTRAÍDO DO PDF/.test(prompt)) return falha(400, "pedido", "Nenhuma página para ler.");

  const cliente = new Anthropic({ apiKey: CHAVE_IA, maxRetries: 2, timeout: 280_000 });
  try {
    // recusa de segurança: o próprio serviço tenta de novo com o modelo indicado (fallbacks "default")
    const msg = await cliente.beta.messages.stream({
      model: MODELO,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      // deno-lint-ignore no-explicit-any
      ...({ fallbacks: "default" } as any),
      output_config: { effort: "medium" },
      messages: [{ role: "user", content: [...imagens, { type: "text", text: prompt }] }],
    }).finalMessage();
    if (msg.stop_reason === "refusal") return falha(422, "recusado", "A IA não leu esta imagem. Confira se é o documento ou a folha certa e tire a foto de novo.");
    const texto = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    if (msg.stop_reason === "max_tokens") return falha(422, "cortado", "A leitura veio incompleta (documento grande demais de uma vez). Envie menos páginas.");
    if (!texto.trim()) return falha(502, "vazio", "A IA não devolveu a leitura. Tente de novo.");
    console.log(JSON.stringify({ evento: "leitura", uid: eu.uid, paginas: imagens.length, modelo: msg.model, entrada: msg.usage?.input_tokens, saida: msg.usage?.output_tokens }));
    return resp(200, { ok: true, texto, modelo: msg.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return falha(429, "rate_limited", "Muitas leituras seguidas. Espere um minuto e tente de novo.");
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return falha(503, "sem_chave", "A chave da API do Claude guardada no servidor não foi aceita. Avise o administrador.");
    if (e instanceof Anthropic.BadRequestError) return falha(400, "pedido", "A IA recusou o pedido: " + String((e as Error).message).slice(0, 200));
    if (e instanceof Anthropic.APIConnectionError) return falha(503, "servidor", "O serviço de IA não respondeu. Tente de novo em instantes.");
    console.error("leitura falhou", e);
    return falha(502, "servidor", "O serviço de IA respondeu com erro. Tente de novo em instantes.");
  }
});
