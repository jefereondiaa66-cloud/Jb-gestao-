#!/usr/bin/env node
// Teste da área de trabalho (V57) no navegador: janelas de lançamento, abas,
// rascunhos, salvamento honesto e clique duplo. Abre o programa REAL
// (saida/claude.html) num Chromium com o banco central simulado.
// Requer Playwright. Uso: node scripts/construir.mjs && node scripts/testar-janelas.mjs
// Nada aqui usa dados reais: os registros são de exemplo e ficam só na memória.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const mes = new Date().toISOString().slice(0, 7);
const DOCS = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', situacao: 'Ativo', departamento: 'Produção' }],
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo 2', situacao: 'Ativo', departamento: 'Produção' }],
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  // blocos de vales e do histórico já existentes: a gravação sem conexão cai no caminho "fica na fila"
  ...Array.from({ length: 32 }, (_, i) => ['vales', `${mes}-s${i}`, { chave: `${mes}-s${i}`, items: {} }]),
  ...Array.from({ length: 32 }, (_, i) => ['log', `${mes}-s${i}`, { chave: `${mes}-s${i}`, items: {} }]),
];

const http = createServer((req, res) => {
  const p = join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

async function abrir(w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ codigo, docs }) => {
    if (window.__srv) return;
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs: DOCS });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  const nav = async (x) => { await page.evaluate((x) => { location.hash = x; }, x); await page.waitForTimeout(600); };
  const ev = (f, a) => page.evaluate(f, a);
  return { ctx, page, erros, nav, ev };
}
const relevantes = (erros) => erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));

try {
  /* ---------- computador ---------- */
  const { ctx, page, erros, nav, ev } = await abrir(1600, 900);
  await nav('#/vales/novo');
  const caixa = await page.$eval('#camada .gaveta', (g) => { const r = g.getBoundingClientRect(); return { esq: r.left, dir: innerWidth - r.right, larg: r.width }; });
  ok(caixa.larg >= 900 && Math.abs(caixa.esq - caixa.dir) < 4, `formulário centralizado e largo (largura ${Math.round(caixa.larg)}px, sobra ${Math.round(caixa.esq)}/${Math.round(caixa.dir)})`);
  ok(await ev(() => getComputedStyle(document.querySelector('#camada .campos')).gridTemplateColumns.split(' ').length === 2), 'campos em duas colunas');

  await page.selectOption('#camada [data-k="funcionarioId"]', 'f1');
  await page.fill('#camada [data-k="valor"]', '150,00');
  await page.fill('#camada [data-k="obs"]', 'teste de janela');
  await nav('#/funcionarios/f2');                                       // abre outra operação
  const s1 = await ev(() => ({ min: JAN.min.map((g) => g.titulo), gav: GAV && GAV.titulo }));
  ok(s1.min.includes('Novo vale') && s1.gav === 'Funcionário Exemplo 2', 'abrir outra operação minimiza o lançamento em andamento (não perde)');
  await nav('#/painel');
  await page.click('.jan-chip[data-jan-i="0"]'); await page.waitForTimeout(500);
  const s2 = await ev(() => ({ t: GAV && GAV.titulo, v: document.querySelector('#camada [data-k="valor"]').value, o: document.querySelector('#camada [data-k="obs"]').value, f: document.querySelector('#camada [data-k="funcionarioId"]').value }));
  ok(s2.t === 'Novo vale' && s2.v === '150,00' && s2.o === 'teste de janela' && s2.f === 'f1', 'restaurar devolve o formulário exatamente como estava');

  await page.click('#camada .gav-cab [data-fechar]'); await page.waitForTimeout(250);
  ok(await ev(() => document.querySelectorAll('.jan-dlg [data-r]').length === 3), 'fechar com alteração pergunta: minimizar, descartar ou voltar');
  await page.click('.jan-dlg [data-r="voltar"]'); await page.waitForTimeout(250);
  ok(await ev(() => !!GAV && document.querySelector('#camada [data-k="valor"]').value === '150,00'), '"voltar ao formulário" mantém tudo');

  const antes = await ev(() => DATA.vales.length);
  await page.dblclick('#camada [data-acao="salvar"]');
  await page.waitForFunction(() => !GAV, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const s3 = await ev(() => ({ n: DATA.vales.length, rasc: Object.keys(rascunhosJan()).length, banco: [...window.__srv.estado.docs.entries()].filter(([k]) => k.startsWith('vales/')).reduce((a, [, d]) => a + Object.keys(d.dados.items || {}).length, 0) }));
  ok(s3.n === antes + 1 && s3.banco === 1, `clique duplo no Salvar grava uma vez só (tela ${s3.n}, banco ${s3.banco})`);
  ok(s3.rasc === 0, 'depois de salvar, o rascunho é apagado');

  // cinco janelas ao mesmo tempo
  for (const m of ['vales', 'advertencias', 'diario', 'horasExtras', 'exames']) {
    await nav('#/' + m + '/novo');
    const el = await page.$('#camada textarea[data-k]');
    if (el) await el.fill('texto ' + m);
  }
  await nav('#/painel');
  const n5 = await ev(() => JAN.min.filter((g) => g.sujo).length);
  ok(n5 === 5, `cinco lançamentos abertos ao mesmo tempo ficam minimizados (${n5})`);
  await page.click('.jan-chip[data-jan-i="2"]'); await page.waitForTimeout(400);
  ok(await ev(() => document.querySelector('#camada textarea[data-k]').value === 'texto diario'), 'cada janela guarda o seu próprio conteúdo');

  // rascunho sobrevive a recarregar a página
  await page.waitForTimeout(700);
  page.once('dialog', (d) => d.accept());
  await page.reload();
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const recs = await ev(() => [...document.querySelectorAll('.jan-chip.rec')].map((c) => c.textContent.trim()));
  ok(recs.length === 5, `depois de recarregar, os 5 rascunhos aparecem marcados como rascunho (${recs.length})`);
  await page.click('.jan-chip.rec'); await page.waitForTimeout(700);
  ok(await ev(() => GAV && GAV.sujo && /NÃO foi salvo/.test(document.querySelector('.jan-aviso').textContent)), 'rascunho recuperado abre avisando que não foi salvo');

  // abas: não duplicam
  for (const h of ['#/setores', '#/setor-lenha', '#/funcionarios', '#/setor-lenha', '#/funcionarios']) await nav(h);
  const abas = await ev(() => ABAS.lista.map((a) => a.k));
  ok(abas.filter((k) => k === '#/funcionarios').length === 1 && abas.filter((k) => k === '#/setor-lenha').length === 1, 'abas não duplicam a mesma tela');

  // sem conexão: não diz "salvo"
  await ev(() => { JAN.min = []; renderBarraTrab(); });
  await nav('#/vales/novo');
  if (await ev(() => GAV && GAV.sujo)) await ev(() => { GAV.sujo = false; fecharRota(true); });
  await nav('#/painel'); await nav('#/vales/novo');
  await page.selectOption('#camada [data-k="funcionarioId"]', 'f2');
  await page.fill('#camada [data-k="valor"]', '44');
  await ev(() => { window.__t = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.classList && n.classList.contains('toast') && window.__t.push(n.className + ' ' + n.textContent)))).observe(document.getElementById('toasts'), { childList: true }); window.__srv.estado.falhas.permanente = 'server_unavailable'; JB_CORE_PONTE.CFG.esperaGravacao = 9000; });
  await page.click('#camada [data-acao="salvar"]');
  await page.waitForFunction(() => window.__t.some((t) => /Vale cadastrad/.test(t)), null, { timeout: 40000 }).catch(() => {});
  const ts = await ev(() => window.__t.filter((t) => /Vale cadastrad/.test(t)));
  ok(ts.length === 1 && /toast at/.test(ts[0]) && /ainda não confirmou/.test(ts[0]), 'sem conexão, a tela avisa que está aguardando o banco (não diz que salvou)');
  await ev(() => { window.__srv.estado.falhas.permanente = null; });
  await ev(() => APP.central.sincronizar().catch(() => {}));
  await page.waitForFunction(() => APP.central.estado().pendentes === 0, null, { timeout: 30000 }).catch(() => {});
  ok(await ev(() => APP.central.estado().pendentes === 0), 'quando a conexão volta, o lançamento sobe');

  ok(relevantes(erros).length === 0, `sem erros de JavaScript${relevantes(erros).length ? ': ' + relevantes(erros).slice(0, 3).join(' | ') : ''}`);
  await ctx.close();

  /* ---------- celular ---------- */
  const m = await abrir(390, 844);
  await m.nav('#/painel'); await m.nav('#/vales/novo');
  await m.page.selectOption('#camada [data-k="funcionarioId"]', 'f1');
  await m.page.click('#camada [data-jan="min"]'); await m.page.waitForTimeout(400);
  ok(await m.ev(() => document.documentElement.scrollWidth <= 390 && JAN.min.length === 1), 'celular: minimizar funciona e a página não rola para o lado');
  ok(relevantes(m.erros).length === 0, 'celular: sem erros de JavaScript');
  await m.ctx.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nÁrea de trabalho: tudo certo.');
process.exit(falhas ? 1 : 0);
