#!/usr/bin/env node
// Medição de desempenho do JB ERP, sem internet e sem nenhum dado real (dados simulados,
// scripts/lib/dados-sinteticos.mjs). Serve a construção (dist/ e saida/) num servidor HTTP/2 local que
// imita o Netlify (compressão, cabeçalhos do _headers, ETag/304) e, se houver a pasta --ext, também os
// arquivos de fora (fontes, Chart.js, supabase-js) nos endereços de sempre. Mede em "computador" e
// "celular" (processador 4x mais lento e rede 4G simulada):
//   A abertura da nuvem até a tela de entrada (primeira vez e repetida)
//   B abertura do programa com os dados até a primeira tela pronta (versão do Claude, banco simulado)
//   C troca de setores e telas: tempo até a tela parar de mudar, travadas (tarefas longas), mutações
//   D toque/clique: atraso até a resposta na tela (Event Timing, como o INP do Google)
//   E pesquisa e filtros: atraso por tecla
//   F uso prolongado: memória, elementos e ouvintes depois de muitas trocas de tela
// Uso: node scripts/construir.mjs && node scripts/medir-desempenho.mjs [--pasta=<pasta com dist/ e saida/>]
//      [--ext=<pasta com sites/<host>/...>] [--saida=resultado.json] [--escala=1] [--perfis=computador,celular]
//      [--vidro] [--voltas=2] [--perfil-cpu] [--telas=#/a,#/b] [--sem-nuvem]
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';
import { createSecureServer } from 'node:http2';
import { createHash } from 'node:crypto';
import { gzipSync, brotliCompressSync, constants as Z } from 'node:zlib';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
import { gerarDadosSinteticos } from './lib/dados-sinteticos.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : (process.argv.includes('--' + k) ? true : d); };
const PASTA = arg('pasta', RAIZ), EXT = arg('ext', null), ESCALA = +arg('escala', 1), VOLTAS = +arg('voltas', 2);
const PERFIS = String(arg('perfis', 'computador,celular')).split(',');
const SAIDA = arg('saida', null), VIDRO = !!arg('vidro', false), PERFIL_CPU = !!arg('perfil-cpu', false);
const SO_TELAS = arg('telas', null) ? String(arg('telas', '')).split(',') : null, SEM_NUVEM = !!arg('sem-nuvem', false);   // para comparar rápido só algumas telas

/* ---------- certificado de teste (só para o servidor local) ---------- */
const CERT = join(PASTA, 'saida', '.cert-medir');
if (!existsSync(CERT + '.pem')) execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${CERT}.key" -out "${CERT}.pem" -days 30 -subj "/CN=jb-medir" 2>/dev/null`);

/* ---------- servidor: o Netlify (dist/), a página do Claude (saida/) e os sites de fora ---------- */
const NUVEM = 'jb-gestao-ceramica.netlify.app', CLAUDE = 'artifact.jb-medir', SUPA = 'kdsaslmlvjllgzbzsnxt.supabase.co';
const FORA = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
function lerHeaders(dir) {   // formato do _headers do Netlify: linha do caminho, depois "  Nome: valor"
  const f = join(dir, '_headers'); if (!existsSync(f)) return [];
  const regras = []; let r = null;
  for (const l of readFileSync(f, 'utf8').split('\n')) {
    if (!l.trim() || l.trim().startsWith('#')) continue;
    if (!/^\s/.test(l)) { r = { re: new RegExp('^' + l.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), h: {} }; regras.push(r); continue; }
    const i = l.indexOf(':'); if (r && i > 0) r.h[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
  }
  return regras;
}
const cacheComp = new Map();
let contagem = { pedidos: 0, bytes: 0, r304: 0 };
function entregar(req, res, arquivo, extras) {
  if (!existsSync(arquivo) || statSync(arquivo).isDirectory()) { res.writeHead(404); res.end(); return; }
  const corpo = readFileSync(arquivo), etag = '"' + createHash('sha1').update(corpo).digest('hex').slice(0, 20) + '"';
  const tipo = TIPOS[extname(arquivo)] || (arquivo.endsWith('css2') ? 'text/css' : 'application/octet-stream');
  const h = Object.assign({ 'content-type': tipo, etag, vary: 'accept-encoding' }, extras);
  contagem.pedidos++;
  if (req.headers['if-none-match'] === etag) { contagem.r304++; delete h['content-type']; res.writeHead(304, h); res.end(); return; }
  let saida = corpo; const ae = String(req.headers['accept-encoding'] || '');
  if (/text|javascript|json|svg|manifest/.test(tipo) && corpo.length > 1024) {
    const enc = ae.includes('br') ? 'br' : ae.includes('gzip') ? 'gzip' : null;
    if (enc) { const k = etag + enc; if (!cacheComp.has(k)) cacheComp.set(k, enc === 'br' ? brotliCompressSync(corpo, { params: { [Z.BROTLI_PARAM_QUALITY]: 5 } }) : gzipSync(corpo, { level: 6 })); saida = cacheComp.get(k); h['content-encoding'] = enc; }
  }
  contagem.bytes += saida.length; res.writeHead(200, h); res.end(saida);
}
const regrasNuvem = lerHeaders(join(PASTA, 'dist'));
const servidor = createSecureServer({ key: readFileSync(CERT + '.key'), cert: readFileSync(CERT + '.pem'), allowHTTP1: true }, (req, res) => {
  const host = String(req.headers[':authority'] || req.headers.host || '').split(':')[0];
  const caminho = decodeURIComponent(String(req.url || '/').split('?')[0]);
  if (host === SUPA) {   // a tela de entrada não precisa do banco: responde "sem sessão"
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
    res.writeHead(401, Object.assign({ 'content-type': 'application/json' }, cors)); res.end('{"message":"sem sessão (teste)"}'); return;
  }
  if (host === NUVEM) {
    const dist = join(PASTA, 'dist'), p = normalize(join(dist, caminho === '/' ? 'index.html' : caminho));
    if (!p.startsWith(dist)) { res.writeHead(403); res.end(); return; }
    const h = {}; for (const r of regrasNuvem) if (r.re.test(caminho === '/' ? '/' : caminho)) Object.assign(h, r.h);
    delete h['strict-transport-security'];
    return entregar(req, res, p, h);
  }
  if (host === CLAUDE) return entregar(req, res, join(PASTA, 'saida', 'claude.html'), { 'cache-control': 'no-cache' });
  if (FORA.includes(host) && EXT) {
    const p = normalize(join(EXT, host, caminho === '/css2' ? 'css2' : caminho));
    if (!p.startsWith(normalize(EXT))) { res.writeHead(403); res.end(); return; }
    return entregar(req, res, p, { 'cache-control': host === 'fonts.googleapis.com' ? 'private, max-age=86400' : 'public, max-age=31536000, immutable', 'access-control-allow-origin': '*', 'timing-allow-origin': '*' });
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const PORTA = servidor.address().port;
const mapa = [NUVEM, CLAUDE, SUPA, ...FORA].map((h) => `MAP ${h} 127.0.0.1:${PORTA}`).join(', ');
/* os endereços de teste vão direto para o servidor local (fora do proxy do ambiente, se houver) */
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy, bypass: [NUVEM, CLAUDE, SUPA, ...FORA, '127.0.0.1', 'localhost'].join(',') } : undefined, args: ['--host-resolver-rules=' + mapa, '--ignore-certificate-errors', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });

const PERFIL = {
  computador: { ctx: { viewport: { width: 1366, height: 768 } }, cpu: 1, rede: { latency: 40, downloadThroughput: 20e6 / 8, uploadThroughput: 10e6 / 8 } },
  celular: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, cpu: 4, rede: { latency: 150, downloadThroughput: 6e6 / 8, uploadThroughput: 2e6 / 8 } },
};
/* sonda: conta mutações, tarefas longas e o atraso dos toques; marca quando a tela de entrada aparece */
const SONDA = () => {
  const M = window.__jbMed = { mut: 0, ultMut: 0, longas: [], eventos: [], entrada: 0 };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) M.longas.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) M.eventos.push([e.name, e.startTime, e.duration, e.interactionId]); }).observe({ type: 'event', durationThreshold: 16, buffered: true }); } catch (e) {}
  new MutationObserver((ms) => { const t = performance.now(); M.mut += ms.length; M.ultMut = t;
    for (const m of ms) { const e = m.target.nodeType === 1 ? m.target : m.target.parentElement; if (e && e.closest && e.closest('#conteudo')) { M.ultMutC = t; if (!M.priMutC) M.priMutC = t; break; } } }).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const olhar = () => { const e = document.getElementById('jbl'); const r = e && e.getBoundingClientRect(); if (r && r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden') { M.entrada = performance.now(); return; } requestAnimationFrame(olhar); };
  requestAnimationFrame(olhar);
};
const mediana = (l) => { const a = l.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) / 2)] : null; };
const p95 = (l) => { const a = l.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.ceil(a.length * 0.95) - 1)] : null; };
const r0 = (x) => (x == null ? null : Math.round(x));
const somaLongas = (l, ini, fim) => l.filter(([s]) => s >= ini - 1 && s <= fim).reduce((a, [, d]) => a + d, 0);
const bloqueio = (l, ini, fim) => l.filter(([s]) => s >= ini - 1 && s <= fim).reduce((a, [, d]) => a + Math.max(0, d - 50), 0);

async function prepararPagina(ctx, perfil) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', Object.assign({ offline: false }, PERFIL[perfil].rede));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PERFIL[perfil].cpu });
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(SONDA);
  return { page, cdp, erros };
}

/* ---------- A: abertura da nuvem até a tela de entrada ---------- */
async function medirNuvem(perfil) {
  const ctx = await browser.newContext(Object.assign({ ignoreHTTPSErrors: true }, PERFIL[perfil].ctx));
  if (!EXT) await ctx.route(/^https:\/\/(cdn\.jsdelivr|cdnjs|fonts\.)/, (r) => r.abort());
  const { page, erros } = await prepararPagina(ctx, perfil);
  const vezes = [];
  for (let k = 0; k < 3; k++) {
    contagem = { pedidos: 0, bytes: 0, r304: 0 };
    await page.goto(`https://${NUVEM}/`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForFunction(() => window.__jbMed && window.__jbMed.entrada > 0, null, { timeout: 120000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      const rec = performance.getEntriesByType('resource'); return { entrada: __jbMed.entrada, fcp: fcp ? fcp.startTime : null, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, longas: __jbMed.longas,
        recursos: rec.length, transferido: rec.reduce((a, r) => a + (r.transferSize || 0), 0) + (n.transferSize || 0) }; });
    vezes.push({ entrada: r0(m.entrada), fcp: r0(m.fcp), dcl: r0(m.dcl), load: r0(m.load), travadas: r0(somaLongas(m.longas, 0, m.entrada || m.load)), bloqueio: r0(bloqueio(m.longas, 0, m.entrada || m.load)),
      pedidosServidor: contagem.pedidos, respostas304: contagem.r304, kbServidor: Math.round(contagem.bytes / 1024), kbTransferidos: Math.round(m.transferido / 1024) });
  }
  await ctx.close();
  return { primeiraVez: vezes[0], repetida: vezes[2], erros: [...new Set(erros)].slice(0, 5) };
}

/* ---------- B a F: o programa com dados (versão do Claude e banco simulado) ---------- */
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
async function medirPrograma(perfil) {
  const docs = gerarDadosSinteticos(ESCALA, 7);
  if (VIDRO) docs.push(['data/users/u_DONO', 'prefs', { lidas: {}, vidroClaro: true }]);
  const ctx = await browser.newContext(Object.assign({ ignoreHTTPSErrors: true }, PERFIL[perfil].ctx));
  if (!EXT) await ctx.route(/^https:\/\/(cdn\.jsdelivr|cdnjs|fonts\.)/, (r) => r.abort());
  const { page, cdp, erros } = await prepararPagina(ctx, perfil);
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] }); docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d)); window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  const R = { perfil, documentos: docs.length };
  /* B: abertura com os dados */
  await page.goto(`https://${CLAUDE}/claude.html`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado === true, null, { timeout: 180000 });
  const quieto = (ini, max = 12000) => page.evaluate(async ({ ini, max }) => { for (;;) { await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); const t = performance.now();
    if (t - Math.max(__jbMed.ultMut, ini) > 300 || t - ini > max) return Math.max(__jbMed.ultMut, ini) - ini; } }, { ini, max });
  await quieto(0, 30000);
  const b = await page.evaluate(() => ({ pronto: performance.now(), longas: __jbMed.longas, nos: document.getElementsByTagName('*').length, setores: document.querySelectorAll('[data-setor]').length }));
  R.abertura = { prontoMs: r0(Math.max(...[0, ...b.longas.map(([s, d]) => s + d)].filter((x) => x <= b.pronto))), travadas: r0(somaLongas(b.longas, 0, b.pronto)), maiorTravada: r0(Math.max(0, ...b.longas.map((x) => x[1]))), elementos: b.nos, setores: b.setores };
  /* rotas: as telas de todos os setores (os links de cada tela inicial; no Pessoal, também o menu) */
  await page.evaluate(() => JBNAV.ir('#/setores')); await quieto(await page.evaluate(() => performance.now()));
  const setores = await page.evaluate(() => [...document.querySelectorAll('[data-setor]')].map((b) => b.dataset.setor));
  const rotas = [];
  for (const s of (SO_TELAS ? [] : setores)) {
    await page.evaluate((s) => { const b = document.querySelector(`[data-setor="${s}"]`); if (b) b.click(); }, s);
    await quieto(await page.evaluate(() => performance.now()));
    const casa = await page.evaluate(() => location.hash);
    const alvos = await page.evaluate(() => { const l = [...document.querySelectorAll('#conteudo a[href^="#/"]')].map((a) => a.getAttribute('href'));
      if (location.hash === '#/painel' && typeof MITENS !== 'undefined') MITENS.forEach((x) => { if (x.m && !x.f && !x.a && !x.r) l.push('#/' + x.m); });
      return [...new Set(l)].filter((h) => h !== location.hash && h !== '#/setores' && !/\/(novo|nova)(\/|$)/.test(h)); });
    rotas.push({ setor: s, casa, telas: alvos });
    await page.evaluate(() => JBNAV.ir('#/setores')); await quieto(await page.evaluate(() => performance.now()));
  }
  const todas = []; rotas.forEach((r) => { todas.push(r.casa); r.telas.forEach((t) => todas.push(t)); });
  /* telas do mesmo tipo (a ficha de cada funcionário, cada título...) contam até duas vezes */
  const porTipo = {}; const unicas = SO_TELAS || [...new Set(todas)].filter((h) => { const k = h.replace(/\/[^/]*\d[^/]*$/, '/:id'); porTipo[k] = (porTipo[k] || 0) + 1; return porTipo[k] <= 2; });
  /* C: troca de tela, medida a cada volta */
  async function medirTela(h) {
    const ini = await page.evaluate((h) => { const t = performance.now(), M = window.__jbMed; M.priMutC = 0; M.j = { ini: t, mut: M.mut, nl: M.longas.length, visivel: null }; try { JBNAV.ir(h); } catch (e) { M.j.erro = String(e); }
      /* "visível": a primeira pintura depois que o conteúdo da tela começou a mudar */
      const olhar = () => requestAnimationFrame(() => { if (M.priMutC > t) setTimeout(() => { if (M.j.visivel == null) M.j.visivel = performance.now() - t; }, 0); else if (performance.now() - t < 15000) olhar(); });
      olhar(); return t; }, h);
    const pronto = await quieto(ini);
    return page.evaluate(({ h, pronto }) => { const j = __jbMed.j, l = __jbMed.longas.slice(j.nl); return { h, pronto, visivel: j.visivel, mut: __jbMed.mut - j.mut, travadas: l.reduce((a, [, d]) => a + d, 0), maior: Math.max(0, ...l.map((x) => x[1])), erro: j.erro || null, chegou: location.hash }; }, { h, pronto });
  }
  const gc = async () => { try { await cdp.send('HeapProfiler.collectGarbage'); } catch (e) {} };
  const memoria = async () => { await gc(); await gc(); const hp = await cdp.send('Runtime.getHeapUsage'); const dc = await cdp.send('Memory.getDOMCounters'); return { heapMB: Math.round(hp.usedSize / 1048576 * 10) / 10, elementos: dc.nodes, ouvintes: dc.jsEventListeners, documentos: dc.documents }; };
  if (PERFIL_CPU) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
  const memIni = await memoria();
  const voltas = [];
  for (let v = 0; v < VOLTAS; v++) {
    const res = [];
    for (const h of unicas) res.push(await medirTela(h));
    await page.evaluate(() => JBNAV.ir('#/setores')); await quieto(await page.evaluate(() => performance.now()));
    voltas.push({ res, mem: await memoria() });
  }
  let perfilCpu = null;
  if (PERFIL_CPU) { const { profile } = await cdp.send('Profiler.stop'); perfilCpu = resumirPerfil(profile); }
  const porTela = {};
  voltas.forEach((v) => v.res.forEach((r) => { (porTela[r.h] = porTela[r.h] || []).push(r); }));
  const linhas = Object.entries(porTela).map(([h, l]) => ({ tela: h, visivelMs: r0(mediana(l.map((x) => x.visivel))), prontoMs: r0(mediana(l.map((x) => x.pronto))), travadasMs: r0(mediana(l.map((x) => x.travadas))), maiorTravadaMs: r0(Math.max(...l.map((x) => x.maior))), mutacoes: r0(mediana(l.map((x) => x.mut))), erro: l.find((x) => x.erro) ? l.find((x) => x.erro).erro : null }));
  R.telas = { quantidade: linhas.length, visivelMediana: r0(mediana(linhas.map((x) => x.visivelMs))), visivelP95: r0(p95(linhas.map((x) => x.visivelMs))), prontoMediana: r0(mediana(linhas.map((x) => x.prontoMs))), prontoP95: r0(p95(linhas.map((x) => x.prontoMs))), prontoMax: r0(Math.max(...linhas.map((x) => x.prontoMs))),
    travadasTotal: r0(linhas.reduce((a, x) => a + x.travadasMs, 0)), maiorTravada: r0(Math.max(...linhas.map((x) => x.maiorTravadaMs))), mutacoesMediana: r0(mediana(linhas.map((x) => x.mutacoes))), piores: [...linhas].sort((a, b) => b.prontoMs - a.prontoMs).slice(0, 12), todas: linhas };
  R.usoProlongado = { trocasDeTela: unicas.length * VOLTAS, inicio: memIni, voltas: voltas.map((v) => v.mem) };
  /* D: toques/cliques de verdade nos cartões dos setores e na volta para Setores */
  await page.evaluate(() => { __jbMed.eventos = []; });
  for (const s of (SO_TELAS ? [] : setores)) {
    await page.evaluate(() => JBNAV.ir('#/setores')); await quieto(await page.evaluate(() => performance.now()));
    const sel = `[data-setor="${s}"]`;
    try { if (PERFIL[perfil].ctx.hasTouch) await page.tap(sel, { timeout: 5000 }); else await page.click(sel, { timeout: 5000 }); } catch (e) { continue; }
    await quieto(await page.evaluate(() => performance.now()));
  }
  const ev = await page.evaluate(() => __jbMed.eventos);
  const porInteracao = {}; ev.forEach(([n, s, d, id]) => { porInteracao[id] = Math.max(porInteracao[id] || 0, d); });
  const toques = Object.values(porInteracao);
  R.toques = { quantidade: toques.length, mediana: r0(mediana(toques)), p95: r0(p95(toques)), max: r0(Math.max(0, ...toques)) };
  /* E: pesquisa e filtros (digitar no campo de busca das listas) */
  const busca = [];
  for (const h of SO_TELAS ? SO_TELAS.filter((x) => /funcionarios|fornecedores|clientes/.test(x)) : ['#/funcionarios', '#/fornecedores', '#/clientes', ...unicas.filter((x) => /lanc|mov|compras|contas|titulos|itens|estoque/i.test(x)).slice(0, 6)]) {
    await medirTela(h);
    const campo = await page.evaluate(() => { const l = [...document.querySelectorAll('#conteudo input[type="search"], #conteudo input[placeholder*="esquis" i], #conteudo input[placeholder*="uscar" i], #conteudo input[placeholder*="iltrar" i]')].filter((x) => x.offsetParent !== null);
      if (!l.length) return null; l[0].setAttribute('data-med-busca', '1'); return true; });
    if (!campo) continue;
    await page.evaluate(() => { __jbMed.eventos = []; });
    try { await page.click('[data-med-busca="1"]', { timeout: 3000 }); await page.keyboard.type('simulado 01', { delay: 90 }); } catch (e) { continue; }
    const fim = await page.evaluate(() => performance.now()); const assentou = await quieto(fim);
    const evs = await page.evaluate(() => __jbMed.eventos.filter((e) => /key|input|beforeinput/.test(e[0])));
    const pi = {}; evs.forEach(([n, s, d, id]) => { pi[id] = Math.max(pi[id] || 0, d); });
    const ds = Object.values(pi);
    busca.push({ tela: h, teclas: ds.length, piorTecla: r0(Math.max(0, ...ds)), medianaTecla: r0(mediana(ds)), assentouDepoisMs: r0(assentou) });
  }
  R.pesquisa = busca;
  if (perfilCpu) R.perfilCpu = perfilCpu;
  R.erros = [...new Set(erros)].filter((m) => !/Failed to fetch|NetworkError|net::/.test(m)).slice(0, 8);
  await ctx.close();
  return R;
}
/* perfil de CPU: tempo próprio por função (linha do app/jb-gestao.html quando é a página do Claude) */
function resumirPerfil(p) {
  const self = new Map(), porId = new Map(p.nodes.map((n) => [n.id, n]));
  const dt = p.timeDeltas || []; const amostras = p.samples || [];
  for (let i = 0; i < amostras.length; i++) { const n = porId.get(amostras[i]); if (!n) continue; const f = n.callFrame; const k = (f.functionName || '(anônima)') + ' @' + (f.url.includes(CLAUDE) ? 'L' + (f.lineNumber) : f.url.split('/').pop() + ':' + (f.lineNumber + 1)); self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000); }
  return [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, ms]) => [k, Math.round(ms)]);
}

const resultado = { quando: new Date().toISOString(), pasta: PASTA, escala: ESCALA, vidro: VIDRO, ext: !!EXT, perfis: {} };
try {
  for (const p of PERFIS) {
    console.log(`\n=== ${p} ===`);
    const nuvem = SEM_NUVEM ? null : await medirNuvem(p);
    if (nuvem) console.log(`A abertura da nuvem até a tela de entrada: primeira vez ${nuvem.primeiraVez.entrada} ms (FCP ${nuvem.primeiraVez.fcp}, ${nuvem.primeiraVez.kbServidor} KB), repetida ${nuvem.repetida.entrada} ms (${nuvem.repetida.pedidosServidor} pedidos, ${nuvem.repetida.respostas304} × 304, ${nuvem.repetida.kbServidor} KB) · travadas ${nuvem.primeiraVez.travadas}/${nuvem.repetida.travadas} ms`);
    const prog = await medirPrograma(p);
    console.log(`B abertura com dados: ${prog.abertura.prontoMs} ms, travadas ${prog.abertura.travadas} ms (maior ${prog.abertura.maiorTravada} ms), ${prog.abertura.elementos} elementos`);
    if (SO_TELAS) prog.telas.todas.forEach((x) => console.log(`    ${x.tela}: visível ${x.visivelMs} ms, pronta ${x.prontoMs} ms, travadas ${x.travadasMs} ms (maior ${x.maiorTravadaMs}), mutações ${x.mutacoes}`));
    console.log(`C ${prog.telas.quantidade} telas: visível em ${prog.telas.visivelMediana} ms (mediana; p95 ${prog.telas.visivelP95}) · pronta em ${prog.telas.prontoMediana} ms (mediana) · p95 ${prog.telas.prontoP95} · pior ${prog.telas.prontoMax} · travadas somadas ${prog.telas.travadasTotal} ms · maior ${prog.telas.maiorTravada} ms · mutações (mediana) ${prog.telas.mutacoesMediana}`);
    prog.telas.piores.slice(0, 6).forEach((x) => console.log(`    ${x.tela}: visível ${x.visivelMs} ms, pronta ${x.prontoMs} ms, travadas ${x.travadasMs} ms, mutações ${x.mutacoes}${x.erro ? ' · ERRO ' + x.erro : ''}`));
    console.log(`D toques: ${prog.toques.quantidade}, mediana ${prog.toques.mediana} ms, p95 ${prog.toques.p95} ms, pior ${prog.toques.max} ms`);
    prog.pesquisa.forEach((x) => console.log(`E pesquisa ${x.tela}: pior tecla ${x.piorTecla} ms, mediana ${x.medianaTecla} ms, assentou ${x.assentouDepoisMs} ms depois`));
    console.log(`F uso prolongado (${prog.usoProlongado.trocasDeTela} trocas): início ${JSON.stringify(prog.usoProlongado.inicio)} → ${prog.usoProlongado.voltas.map((v) => JSON.stringify(v)).join(' → ')}`);
    if (prog.erros.length) console.log('  erros na página:', prog.erros.join(' | '));
    resultado.perfis[p] = { nuvem, programa: prog };
  }
} finally {
  await browser.close(); servidor.close();
}
if (SAIDA) writeFileSync(SAIDA, JSON.stringify(resultado, null, 1));
console.log('\nmedição concluída' + (SAIDA ? ' → ' + SAIDA : ''));
