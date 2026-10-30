// =====================================================================
// JB CORE · publicador da nuvem
//
// Monta o pacote do site a partir de UM commit do repositório no GitHub
// (público) e entrega ao Netlify pelo endereço de publicação temporário
// (30 min) que o conector do Netlify fornece. O Netlify roda o netlify.toml:
// verificar -> construir -> publicar. Se a verificação falhar, nada é
// publicado e a versão anterior continua no ar.
//
// Só aceita chamadas com o segredo JB_PUBLICAR_SEGREDO (variável da função;
// o banco guarda uma cópia no cofre e chama por jbcore.publicar_nuvem).
// Não lê nem grava dados do sistema.
//
// Corpo: {segredo, acao: "publicar"|"simular"|"estado", commit?, proxy?, deploy?}
// =====================================================================
import { unzipSync, zipSync, strToU8 } from "npm:fflate@0.8.2";

const REPO = "jefereondiaa66-cloud/Jb-gestao-";
const SITE = "f83479b1-3b19-4d51-b194-5ae63dbc6b5f";
const PROXY = /^https:\/\/netlify-mcp\.netlify\.app\/proxy\/[A-Za-z0-9._~-]{20,4000}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DEPLOY = /^[0-9a-f]{24}$/;
const SEGREDO = Deno.env.get("JB_PUBLICAR_SEGREDO") ?? "";
// o que vai no pacote: só o necessário para verificar e construir
const INCLUIR = /^(netlify\.toml|app\/.+|nuvem\/.+|scripts\/.+)$/;

const resp = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function iguais(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

async function montarPacote(commit: string) {
  const r = await fetch(`https://codeload.github.com/${REPO}/zip/${commit}`);
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status} ao baixar o commit ${commit.slice(0, 7)}`);
  const zip = unzipSync(new Uint8Array(await r.arrayBuffer()));
  const arquivos: Record<string, Uint8Array> = {};
  for (const [nome, conteudo] of Object.entries(zip)) {
    const rel = nome.slice(nome.indexOf("/") + 1);    // tira a pasta "<repo>-<commit>/"
    if (rel && !rel.endsWith("/") && INCLUIR.test(rel)) arquivos[rel] = conteudo;
  }
  for (const essencial of ["netlify.toml", "app/jb-gestao.html", "nuvem/cabecalho.html", "scripts/verificar.mjs", "scripts/construir.mjs"]) {
    if (!arquivos[essencial]) throw new Error(`o commit ${commit.slice(0, 7)} não tem ${essencial}`);
  }
  arquivos[".jb-commit"] = strToU8(commit + "\n");
  return arquivos;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return resp(405, { ok: false, erro: "use POST" });
  if (SEGREDO.length < 32) return resp(500, { ok: false, erro: "segredo da função não configurado" });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return resp(400, { ok: false, erro: "corpo inválido" }); }
  if (!iguais(String(b.segredo ?? ""), SEGREDO)) return resp(403, { ok: false, erro: "negado" });
  const acao = String(b.acao ?? "");

  try {
    if (acao === "estado") {
      const proxy = String(b.proxy ?? ""), deploy = String(b.deploy ?? "");
      if (!PROXY.test(proxy) || !DEPLOY.test(deploy)) return resp(400, { ok: false, erro: "proxy ou deploy inválido" });
      const r = await fetch(`${proxy}/api/v1/deploys/${deploy}`, { headers: { "user-agent": "netlify-mcp" } });
      const d = await r.json().catch(() => ({}));
      return resp(200, { ok: r.ok, status: r.status, estado: d.state, erro_deploy: d.error_message ?? null,
        publicado_em: d.published_at ?? null, endereco: d.ssl_url ?? null, titulo: d.title ?? null });
    }

    const commit = String(b.commit ?? "");
    if (!COMMIT.test(commit)) return resp(400, { ok: false, erro: "commit inválido (use o código completo de 40 caracteres)" });
    const arquivos = await montarPacote(commit);
    const lista = Object.keys(arquivos).sort();
    if (acao === "simular") return resp(200, { ok: true, simulado: true, arquivos: lista.length, lista });
    if (acao !== "publicar") return resp(400, { ok: false, erro: "ação desconhecida" });

    const proxy = String(b.proxy ?? "");
    if (!PROXY.test(proxy)) return resp(400, { ok: false, erro: "endereço de publicação do Netlify inválido" });
    const pacote = zipSync(arquivos, { level: 6 });
    // mesmo formato da ferramenta oficial (@netlify/mcp): multipart com o campo "zip"
    const limite = "----NetlifyFormBoundary" + crypto.randomUUID().replace(/-/g, "");
    const enc = new TextEncoder();
    const cabeca = enc.encode(`--${limite}\r\nContent-Disposition: form-data; name="zip"; filename="jb-${commit.slice(0, 7)}.zip"\r\nContent-Type: application/zip\r\n\r\n`);
    const cauda = enc.encode(`\r\n--${limite}--\r\n`);
    const corpo = new Uint8Array(cabeca.length + pacote.length + cauda.length);
    corpo.set(cabeca, 0); corpo.set(pacote, cabeca.length); corpo.set(cauda, cabeca.length + pacote.length);
    const r = await fetch(`${proxy}/api/v1/sites/${SITE}/builds`, {
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${limite}`, "user-agent": "netlify-mcp" },
      body: corpo,
    });
    const texto = await r.text();
    let d: Record<string, unknown> = {};
    try { const j = JSON.parse(texto); d = Array.isArray(j) ? j[0] : j; } catch { /* resposta não-JSON */ }
    return resp(r.ok ? 200 : 502, { ok: r.ok, status: r.status, deploy: d.deploy_id ?? null, build: d.id ?? null,
      commit, arquivos: lista.length, bytes: pacote.length, resposta: r.ok ? undefined : texto.slice(0, 1500) });
  } catch (e) {
    return resp(500, { ok: false, erro: String(e instanceof Error ? e.message : e) });
  }
});
