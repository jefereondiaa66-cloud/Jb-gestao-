// =====================================================================
// JB Gestão · redator de contratos por IA (Setor Pessoal › Contratos, V125)
//
// Usada pela versão da nuvem (nuvem/jb-nuvem.js → redator.escrever). Dentro do
// Claude o programa fala direto com o Claude da conta de quem usa; na nuvem,
// passa por aqui. Recebe a conversa montada pelo programa (regras, base
// jurídica, pedido e, na edição, o documento), confere a sessão e a permissão
// da pessoa e pede a resposta ao Claude. Devolve só o texto; quem interpreta,
// confere as leis citadas, mostra e grava é o programa.
//
// · A chave da API fica no cofre de segredos das funções do Supabase
//   (ANTHROPIC_API_KEY), a mesma da leitura de documentos. Nunca vai para o
//   navegador nem para o repositório.
// · Só atende quem está com a sessão do JB válida e pode criar no Setor Pessoal
//   e ver dados pessoais (dp.criar + dp_sensivel.ler), ou é administrador:
//   a mesma regra que o programa usa para liberar a criação de contratos.
// · Não lê nem grava dados do sistema. Não guarda a conversa.
// · Os dados pessoais do cadastro (CPF, RG, endereço, salário) não chegam aqui:
//   o programa manda marcadores ({{pessoa.cpf}}) e troca pelo dado na tela.
//
// Corpo: {mensagens: [{role: "user"|"assistant", content: string}], rapido?: true, longo?: true, fluxo?: true}
//   rapido: a IA pensa menos antes de escrever (o texto começa a chegar antes). longo: a resposta pode ser um
//   documento inteiro. Sem "longo", o pedido rápido continua limitado a respostas curtas, como antes.
// Resposta: {ok: true, texto, cortado, modelo} ou {erro, mensagem}
// Com "fluxo": true a resposta vem aos poucos (uma linha JSON por vez): {t:"inicio"}, {t:"texto", d},
// {t:"pulso"} e, no fim, {t:"fim", ok, texto, cortado, modelo} ou {t:"erro", erro, mensagem}.
// GET (com a sessão) só acorda a função e diz se a chave está configurada.
// Ativar: Supabase → Edge Functions → Secrets → ANTHROPIC_API_KEY (opcional: JB_IA_MODELO)
// =====================================================================
import Anthropic from "npm:@anthropic-ai/sdk";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
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
const MAX_MENSAGENS = 12;
const MAX_LETRAS = 400_000;
const MARCA = "redator de contratos do JB Gestão";   // o pedido precisa ser o do programa

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });
const falha = (status: number, erro: string, mensagem: string) => resp(status, { erro, mensagem });

/** confere a sessão do JB (mesma regra do resto do sistema) e a permissão de criar contratos */
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
  const pode = !!eu.admin || (!!(p.dp && p.dp.criar) && !!(p.dp_sensivel && p.dp_sensivel.ler));
  return { uid: String(eu.uid), pode };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method === "GET") return resp(200, { ok: true, pronto: !!CHAVE_IA });
  if (req.method !== "POST") return falha(405, "metodo", "Use POST.");
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) return falha(401, "session_expired", "Entre no sistema de novo.");
  let eu: { uid: string; pode: boolean } | null;
  try { eu = await quem(auth); } catch { return falha(503, "servidor", "O servidor não confirmou o seu acesso agora. Tente de novo."); }
  if (!eu) return falha(401, "session_expired", "Sua sessão terminou. Entre de novo no sistema.");
  if (!eu.pode) return falha(403, "permissao", "Seu acesso não permite criar contratos com a IA.");
  if (!CHAVE_IA) {
    return falha(503, "sem_chave", "A IA ainda não foi ativada no servidor: falta guardar a chave da API do Claude (ANTHROPIC_API_KEY) nos segredos das funções do Supabase. Avise o administrador.");
  }

  const corpo: { mensagens?: unknown; rapido?: unknown; longo?: unknown; fluxo?: unknown } = await req.json().catch(() => ({}));
  const bruto = Array.isArray(corpo.mensagens) ? corpo.mensagens : [];
  if (!bruto.length || bruto.length > MAX_MENSAGENS) return falha(400, "pedido", "Pedido inválido.");
  const mensagens: Anthropic.MessageParam[] = [];
  let letras = 0;
  for (let i = 0; i < bruto.length; i++) {
    const m = bruto[i] as { role?: unknown; content?: unknown };
    const papel = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== papel || typeof m.content !== "string" || !m.content.trim()) return falha(400, "pedido", "Pedido inválido.");
    letras += m.content.length;
    mensagens.push({ role: papel, content: m.content });
  }
  if (bruto.length % 2 === 0) return falha(400, "pedido", "Pedido inválido.");
  if (letras > MAX_LETRAS) return falha(413, "prompt_too_large", "O documento e a conversa ficaram grandes demais para um pedido só.");
  if (!String(mensagens[0].content).includes(MARCA)) return falha(400, "pedido", "Pedido inválido.");

  const esforco = corpo.rapido === true ? "low" : "medium";
  const cliente = new Anthropic({ apiKey: CHAVE_IA, maxRetries: 2, timeout: 280_000 });
  const t0 = Date.now();
  let fluxoIA: { abort: () => void } | null = null;

  const escrever = async (aoTexto?: (d: string) => void): Promise<[number, Record<string, unknown>]> => {
    const e2 = (status: number, erro: string, mensagem: string): [number, Record<string, unknown>] => [status, { erro, mensagem }];
    try {
      const fl = cliente.beta.messages.stream({
        model: MODELO,
        max_tokens: corpo.rapido === true && corpo.longo !== true ? 4000 : 32000,
        betas: ["server-side-fallback-2026-07-01"],
        // deno-lint-ignore no-explicit-any
        ...({ fallbacks: "default" } as any),
        // deno-lint-ignore no-explicit-any
        output_config: { effort: esforco as any },
        messages: mensagens,
      });
      fluxoIA = fl;
      fl.on("text", (d: string) => { if (aoTexto && d) aoTexto(d); });
      const msg = await fl.finalMessage();
      if (msg.stop_reason === "refusal") return e2(422, "refused", "A IA não aceitou esse pedido. Explique de outro jeito.");
      const texto = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      if (!texto.trim()) return e2(502, "empty_completion", "A IA não devolveu resposta. Tente de novo.");
      console.log(JSON.stringify({ evento: "contrato", uid: eu!.uid, modelo: msg.model, esforco, mensagens: mensagens.length,
        entrada: msg.usage?.input_tokens, saida: msg.usage?.output_tokens, letras: texto.length, ms: Date.now() - t0 }));
      return [200, { ok: true, texto, cortado: msg.stop_reason === "max_tokens", modelo: msg.model }];
    } catch (e) {
      if (e instanceof Anthropic.APIUserAbortError) return e2(499, "cancelado", "Pedido cancelado.");
      if (e instanceof Anthropic.RateLimitError) return e2(429, "rate_limited", "Muitos pedidos seguidos. Espere um minuto e tente de novo.");
      if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return e2(503, "sem_chave", "A chave da API do Claude guardada no servidor não foi aceita. Avise o administrador.");
      if (e instanceof Anthropic.BadRequestError) return e2(400, "pedido", "A IA recusou o pedido: " + String((e as Error).message).slice(0, 200));
      if (e instanceof Anthropic.APIConnectionError) return e2(503, "servidor", "O serviço de IA não respondeu. Tente de novo em instantes.");
      console.error("contrato falhou", e);
      return e2(502, "servidor", "O serviço de IA respondeu com erro. Tente de novo em instantes.");
    }
  };
  const parar = () => { try { fluxoIA?.abort(); } catch { /* já terminou */ } };

  if (corpo.fluxo !== true) { const [st, r] = await escrever(); return resp(st, r); }

  const cod = new TextEncoder();
  const saida = new ReadableStream<Uint8Array>({
    async start(ctl) {
      let aberto = true;
      const manda = (o: unknown) => { if (!aberto) return; try { ctl.enqueue(cod.encode(JSON.stringify(o) + "\n")); } catch { aberto = false; } };
      manda({ t: "inicio" });
      let junta = "", ultimo = 0;
      const solta = () => { if (junta) { manda({ t: "texto", d: junta }); junta = ""; ultimo = Date.now(); } };
      const pulso = setInterval(() => manda({ t: "pulso" }), 8000);
      try {
        const [st, r] = await escrever((d) => { junta += d; if (Date.now() - ultimo > 250) solta(); });
        solta();
        manda(st === 200 ? { t: "fim", ...r } : { t: "erro", status: st, ...r });
      } finally { clearInterval(pulso); aberto = false; try { ctl.close(); } catch { /* já fechado */ } }
    },
    cancel() { parar(); },
  });
  return new Response(saida, { status: 200, headers: { ...CORS, "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache, no-transform", "x-accel-buffering": "no" } });
});
