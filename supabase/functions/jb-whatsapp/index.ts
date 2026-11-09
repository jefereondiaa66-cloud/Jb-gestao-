// =====================================================================
// JB WhatsApp · resumo diário para os donos, pela API oficial da Meta
//
// Quem chama: só o banco (jbcore.whatsapp_disparar, agendada às 19h de
// Fortaleza, e jbcore.whatsapp_previa), por pg_net, com o segredo do cofre
// "jb_whatsapp_segredo" no cabeçalho x-jb-whatsapp-segredo.
//
// Ações:
//   previa  {dia?}                  monta o resumo e devolve; nada é enviado.
//   enviar  {dia?, so_para?, forcar?} gera o PDF, sobe para a Meta e manda o
//           modelo aprovado. Cada dia/telefone entra uma vez só
//           (jbcore.whatsapp_envios): reenvio nunca duplica, exceto quem falhou.
//           so_para: teste para um único número, sem marcar o dia como enviado.
//
// Credenciais (segredos da função, nunca no repositório):
//   WHATSAPP_TOKEN            token permanente de usuário do sistema da Meta
//   WHATSAPP_PHONE_NUMBER_ID  identificador do número remetente
// =====================================================================
import * as PDFLib from "npm:pdf-lib@1.17.1";
import { COLECOES, calcularResumo, corpoModelo, diaEmFortaleza, diaValido, organizar, telefoneValido } from "./nucleo.js";
import { gerarPdf, nomeArquivo } from "./pdf.js";

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WA_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const WA_PHONE = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";

const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
const sbH = { apikey: SB_SERVICO, Authorization: `Bearer ${SB_SERVICO}`, "Content-Type": "application/json" };

async function rpc(nome: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${nome}`, { method: "POST", headers: sbH, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`banco (${nome}): ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

async function lerDocs() {
  const out: unknown[] = [];
  const filtro = encodeURIComponent(`(${COLECOES.join(",")})`);
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/docs?select=colecao,id,dados&colecao=in.${filtro}&order=colecao,id`, { headers: { ...sbH, Range: `${de}-${de + 999}` } });
    if (!r.ok) throw new Error(`banco (docs): ${r.status} ${(await r.text()).slice(0, 300)}`);
    const pg = await r.json();
    out.push(...pg);
    if (pg.length < 1000) return out;
  }
}

async function montarResumo(dia: string) {
  return calcularResumo(organizar(await lerDocs() as never), dia);
}

// A logo fica no repositório público (logo.png, ao lado desta função). Se não baixar, o PDF sai sem ela.
const LOGO_URL = "https://raw.githubusercontent.com/jefereondiaa66-cloud/Jb-gestao-/main/supabase/functions/jb-whatsapp/logo.png";
async function baixarLogo() {
  try {
    const r = await fetch(LOGO_URL, { signal: AbortSignal.timeout(8000) });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  } catch (_e) { return null; }
}

function erroMeta(j: Record<string, any>, status: number) {
  const e = j?.error ?? {};
  return `Meta ${status}: ${e.code ?? ""} ${e.message ?? ""} ${e.error_data?.details ?? ""}`.trim().slice(0, 450);
}

async function subirPdf(versao: string, bytes: Uint8Array, arquivo: string) {
  const fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", "application/pdf");
  fd.append("file", new Blob([bytes], { type: "application/pdf" }), arquivo);
  const r = await fetch(`https://graph.facebook.com/${versao}/${WA_PHONE}/media`, { method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}` }, body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(erroMeta(j, r.status));
  return String(j.id);
}

async function mandar(versao: string, corpo: unknown) {
  const r = await fetch(`https://graph.facebook.com/${versao}/${WA_PHONE}/messages`, {
    method: "POST", headers: { Authorization: `Bearer ${WA_TOKEN}`, "Content-Type": "application/json" }, body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, detalhe: erroMeta(j, r.status) };
  return { ok: true, wamid: String(j.messages?.[0]?.id ?? "") };
}

async function enviar(dia: string, soPara: string | null, forcar: boolean) {
  const ctx = await rpc("jb_whatsapp_contexto", {});
  const cfg = ctx.config;
  if (!cfg.ativo && !soPara && !forcar) return { ok: true, ignorado: "envio desligado" };
  if (!WA_TOKEN || !WA_PHONE) return { ok: false, erro: "faltam as credenciais da Meta (WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID)" };
  if (soPara && !telefoneValido(soPara)) return { ok: false, erro: "telefone de teste inválido: use 55 + DDD + número" };
  const lista: { nome: string; telefone: string }[] = soPara ? [{ nome: "teste", telefone: soPara }] : ctx.destinatarios;
  if (!lista.length) return { ok: false, erro: "nenhum destinatário ativo cadastrado" };

  const R = await montarResumo(dia);
  const agora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }).format(new Date());
  const pdf = await gerarPdf(PDFLib, R, await baixarLogo(), { geradoEm: "gerado em " + agora });
  const arquivo = nomeArquivo(dia);
  const mediaId = await subirPdf(cfg.versao_api, pdf, arquivo);

  const resultado = [];
  for (const d of lista) {
    if (!soPara) {
      const ok = await rpc("jb_whatsapp_reservar", { p_dia: dia, p_telefone: d.telefone });
      if (!ok) { resultado.push({ nome: d.nome, situacao: "já enviado" }); continue; }
    }
    const r = await mandar(cfg.versao_api, corpoModelo({ para: d.telefone, modelo: cfg.modelo, idioma: cfg.idioma, mediaId, arquivo, parametros: R.parametros }));
    if (!soPara) await rpc("jb_whatsapp_marcar", { p_dia: dia, p_telefone: d.telefone, p_situacao: r.ok ? "enviada" : "falhou", p_wamid: r.wamid ?? null, p_detalhe: r.detalhe ?? null });
    resultado.push({ nome: d.nome, situacao: r.ok ? "enviada" : "falhou", detalhe: r.detalhe });
  }
  return { ok: resultado.every((x) => x.situacao !== "falhou"), dia, resultado };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return resp({ ok: false, erro: "método não permitido" }, 405);
  try {
    const seg = req.headers.get("x-jb-whatsapp-segredo") ?? "";
    if (!seg || !(await rpc("jb_whatsapp_confere", { p_segredo: seg }))) return resp({ ok: false, erro: "não autorizado" }, 401);
    const b = await req.json().catch(() => ({}));
    const dia = diaValido(b.dia) ? String(b.dia) : diaEmFortaleza();
    if (b.acao === "previa") return resp({ ok: true, resumo: await montarResumo(dia), credenciais: !!(WA_TOKEN && WA_PHONE) });
    if (b.acao === "enviar") return resp(await enviar(dia, b.so_para ? String(b.so_para) : null, !!b.forcar));
    return resp({ ok: false, erro: "ação inválida" }, 400);
  } catch (e) {
    console.error("jb-whatsapp", e);
    return resp({ ok: false, erro: String((e as Error)?.message ?? e).slice(0, 500) }, 500);
  }
});
