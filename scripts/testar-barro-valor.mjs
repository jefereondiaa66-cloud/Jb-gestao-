#!/usr/bin/env node
// Teste de ponta a ponta da V124, no navegador, com o programa REAL (saida/claude.html) e o banco
// central simulado (scripts/lib/servidor-falso.mjs). Dados de teste, só em memória.
//  Setor do Barro: o valor do barro (toneladas × R$/t vigente, hoje R$ 6,1663) aparece junto da tonelada,
//  também com a parte de extração ligada. Sem extração com custo, o custo por tonelada é o valor de
//  referência (não R$ 0,00); com extração lançada, vale o custo real da extração.
// Uso: node scripts/construir.mjs && node scripts/testar-barro-valor.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mes = hoje.slice(0, 7), dia1 = mes + '-01';
/* produção confirmada da maromba no dia 1 do mês: 100.000 tijolos × 2,225 kg = 222,5 t × R$ 6,1663 = R$ 1.372,00 */
const maromba = (id, q) => ({ id, tipo: 'maromba', data: dia1, situacao: 'Confirmado', turno: '1º turno', bruta: String(q), perdas: '0', liquida: String(q), grades: String(q / 1000), porGrade: '1000', incompleta: '0', criadoEm: dia1 + 'T20:00:00.000Z', criadoPor: 'u_DONO' });
const base = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['barro', '2026-01-s0', { chave: '2026-01-s0', items: { cfg: { id: 'cfg', jbt: 'config', data: '2026-01-01', criadoEm: '2026-11-12T00:00:00.000Z', criadoPor: 'u_DONO', mostrarExtracao: true } } }],
  ['prodFab', mes + '-s0', { chave: mes + '-s0', items: { m1: maromba('m1', 75000), m2: maromba('m2', 25000) } }],
];
/* cenário B: uma extração com custo (10 carradas × 12 t, frete R$ 150 por carrada + R$ 300 de outros = R$ 1.800 → R$ 15,00/t) e o saldo inicial */
const comExtracao = [...base, ['barro', mes + '-s1', { chave: mes + '-s1', items: {
  ext1: { id: 'ext1', jbt: 'ext', data: dia1, jazidaId: '', carradas: [{ lid: 'l1', motoristaId: '', cacambaId: '', qtd: 10, ton: 12, valor: 150, forma: 'Por carrada' }], maquinas: [], outros: [{ tipo: 'Outro', valor: 300 }], criadoEm: dia1 + 'T19:00:00.000Z', criadoPor: 'u_DONO' },
  ini1: { id: 'ini1', jbt: 'mov', tipo: 'inicial', data: dia1, ton: 500, carradas: null, motivo: '', obs: '', criadoEm: dia1 + 'T18:00:00.000Z', criadoPor: 'u_DONO' } } }]];

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const enderecoBase = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
const resultados = [];
let falhas = 0;
const ok = (c, m) => { resultados.push([c ? 'ok' : 'FALHOU', m]); console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

async function abrir(docs, largura) {
  const ctx = await browser.newContext({ viewport: { width: largura || 1280, height: 1600 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(enderecoBase + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.T = {
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      ir: async (h) => { location.hash = h; await new Promise((r) => setTimeout(r, 900)); },
      /* cartão de indicador pelo começo do rótulo: { v: número grande, s: linha de baixo } */
      kpi: (rot) => { const k = [...document.querySelectorAll('.hero .kpi')].find((x) => ((x.querySelector('.l') || {}).textContent || '').trim().startsWith(rot)); return k ? { v: (k.querySelector('.v') || {}).textContent || '', s: (k.querySelector('.delta') || {}).textContent || '' } : null; },
      txt: () => (document.getElementById('svCorpo') || document.querySelector('main') || document.body).textContent,
    };
  });
  return { ctx, page, erros };
}
const semErros = (erros) => { const rel = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e)); ok(rel.length === 0, rel.length ? 'erros de JavaScript: ' + rel.slice(0, 3).join(' | ') : 'sem erros de JavaScript'); };

try {
  console.log('1. Parte de extração ligada, nenhuma extração lançada');
  { const { ctx, page, erros } = await abrir(base);
    const a = await page.evaluate(async () => { await T.ir('#/setor-barro');
      const B = window.BARRO_V57; const t = B.totCons(B.consMes(hoje().slice(0, 7)));
      return { ton: Math.round(t.ton * 100) / 100, valor: Math.round(t.valor * 100) / 100, cons: T.kpi('Consumo do estoque em'), val: T.kpi('Valor do barro consumido'), ct: T.kpi('Custo por tonelada'), cc: T.kpi('Custo por carrada'), est: T.kpi('Estoque de barro'), rod: T.txt() }; });
    ok(a.ton === 222.5 && a.valor === 1372, `cálculo do consumo: 100.000 tijolos = ${a.ton} t = R$ ${a.valor}`);
    ok(a.cons && a.cons.v === '222,50 t', `cartão "Consumo do estoque" com a tonelada (${a.cons && a.cons.v})`);
    ok(a.val && /1\.372,00/.test(a.val.v) && /222,50 t × R\$\s6,1663\/t/.test(a.val.s), `cartão "Valor do barro consumido" com o valor em R$ (${a.val && a.val.v} · ${a.val && a.val.s})`);
    ok(a.ct && /6,1663/.test(a.ct.v) && /valor de referência/.test(a.ct.s) && !/R\$\s0,00/.test(a.ct.v + a.ct.s), `sem extração, o custo por tonelada é o valor de referência, não R$ 0,00 (${a.ct && a.ct.v} · ${a.ct && a.ct.s})`);
    ok(a.cc && a.cc.v === '—', `custo por carrada sem extração aparece como "—", não R$ 0,00 (${a.cc && a.cc.v})`);
    ok(a.est && /valor R\$/.test(a.est.s), `cartão do estoque com o valor (${a.est && a.est.s})`);
    ok(/toneladas × R\$\s6,1663\/t/.test(a.rod), 'a nota do Início explica o valor do barro (toneladas × R$ 6,1663/t)');
    const c = await page.evaluate(async () => { await T.ir('#/barroCusto'); return { ct: T.kpi('CUSTO POR TONELADA'), val: T.kpi('Valor do barro consumido') }; });
    ok(c.ct && /6,1663/.test(c.ct.v) && /valor de referência/.test(c.ct.s), `Custo do barro: custo por tonelada pelo valor de referência (${c.ct && c.ct.v})`);
    ok(c.val && /1\.372,00/.test(c.val.v), `Custo do barro: valor do barro consumido em R$ (${c.val && c.val.v})`);
    const e = await page.evaluate(async () => { await T.ir('#/barroEst'); return { cons: T.kpi('Consumido em'), agora: T.kpi('Estoque agora') }; });
    ok(e.cons && /1\.372,00/.test(e.cons.s) && e.cons.v === '222,50 t', `Estoque: consumido no mês com tonelada e valor (${e.cons && e.cons.v} · ${e.cons && e.cons.s})`);
    ok(e.agora && /valor R\$/.test(e.agora.s), 'Estoque: estoque agora com o valor');
    semErros(erros); await ctx.close(); }

  console.log('2. Extração lançada com custo e saldo inicial');
  { const { ctx, page, erros } = await abrir(comExtracao);
    const a = await page.evaluate(async () => { await T.ir('#/setor-barro'); return { ct: T.kpi('Custo por tonelada'), cc: T.kpi('Custo por carrada'), val: T.kpi('Valor do barro consumido'), est: T.kpi('Estoque de barro') }; });
    ok(a.ct && /15,00/.test(a.ct.v) && /custo real da extração/.test(a.ct.s) && /1\.800,00/.test(a.ct.s), `com extração, vale o custo real: ${a.ct && a.ct.v} (${a.ct && a.ct.s})`);
    ok(a.cc && /180,00/.test(a.cc.v), `custo por carrada real (${a.cc && a.cc.v})`);
    ok(a.val && /1\.372,00/.test(a.val.v), 'o valor do barro consumido continua pelo R$/t vigente (a troca pelo custo real é feita nas Configurações)');
    /* estoque: 500 (saldo inicial) + 120 (extração) − 222,5 (consumo) = 397,5 t × R$ 6,1663 = R$ 2.451,10 */
    ok(a.est && a.est.v === '397,50 t' && /2\.451,10/.test(a.est.s), `estoque com tonelada e valor (${a.est && a.est.v} · ${a.est && a.est.s})`);
    const r = await page.evaluate(async () => { const B = window.BARRO_V57; B.UR.id = 'resumo'; B.UR.de = hoje().slice(0, 7) + '-01'; B.UR.ate = hoje(); const R = B.dadosRel();
      await T.ir('#/barroEst'); const linhas = [...document.querySelectorAll('tbody tr')].map((x) => x.textContent).filter((x) => /Consumo do estoque de barro/.test(x));
      return { col: R.cols.some((c) => c.k === 'consV' && c.t === 'moeda'), consV: R.tot && R.tot.consV, cons: R.tot && R.tot.cons, linhas }; });
    ok(r.col && r.consV === 1372 && r.cons === 222.5, `relatório "Resumo mensal do barro": consumido ${r.cons} t e valor R$ ${r.consV}`);
    ok(r.linhas.length === 1 && /valor R\$\s1\.372,00/.test(r.linhas[0]), 'movimentos do estoque: o consumo do dia traz o valor');
    semErros(erros); await ctx.close(); }
} catch (e) { falhas++; console.log('  ✘ o teste parou: ' + (e && e.message ? e.message : e)); }
finally { await browser.close(); http.close(); }
const ap = resultados.filter((r) => r[0] === 'ok').length;
console.log(`\nValor do barro no Setor do Barro (V124): ${ap} aprovados, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
