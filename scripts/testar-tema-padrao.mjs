#!/usr/bin/env node
// Teste do padrão de cores de todos, no programa REAL (saida/claude.html) num Chromium com banco
// central simulado. Nada sai para a internet. Confere:
//   1. sem padrão definido, cada pessoa continua com a escolha dela
//   2. o dono aplica: grava o padrão de todos, o botão diz "Aplicar para todos"
//   3. outra pessoa com o sistema aberto muda na hora, e a escolha antiga dela deixa de valer
//   4. ela pode escolher a dela, e a escolha continua depois de reabrir
//   5. o dono escolhe outro padrão: muda de novo para ela
//   6. "Restaurar padrão" de outra pessoa volta ao padrão do dono; ela não vê "Aplicar para todos"
//   7. o dono consegue publicar a paleta que já está usando, sem mexer em nada
// Uso: node scripts/construir.mjs && node scripts/testar-tema-padrao.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const http = createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const iniciar = ({ codigo, uid, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO', 'u_OUTRA'] });
  srv.estado.gravarDireto('acesso', uid, { id: uid, nome: 'Pessoa', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: uid, name: 'Pessoa', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => uid, isOwner: () => true, canEdit: () => true, profiles: async () => ({}) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

async function abrir(uid, docs) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.erros = []; page.on('pageerror', (e) => page.erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, uid, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  return page;
}
const tema = (page) => page.evaluate(() => document.documentElement.getAttribute('data-jbtema'));
// a ponte do Claude busca mudanças a cada 30 s (na nuvem chega pelo canal de tempo real)
const esperaTema = (page, id) => page.waitForFunction((x) => document.documentElement.getAttribute('data-jbtema') === x, id, { timeout: 40000 }).catch(() => {});
const noBanco = (page, c, i) => page.evaluate(([a, b]) => { const d = window.__srv.estado.docs.get(a + '/' + b); return d ? d.dados : null; }, [c, i]);
const daNuvem = (page, c, i, d) => page.evaluate(([a, b, x]) => window.__srv.estado.gravarDireto(a, b, x), [c, i, d]);
const textoAplicar = (page) => page.evaluate(() => (document.querySelector('[data-jbt-aplicar]') || {}).textContent || '');
async function escolher(page, paleta) {
  await page.evaluate(() => JB_TEMA.abrir('prontas'));
  await page.waitForSelector(`[data-jbt-p="${paleta}"]`, { timeout: 5000 });
  await page.click(`[data-jbt-p="${paleta}"]`);
  await page.waitForTimeout(150);
}
const aplicar = async (page) => { await page.click('[data-jbt-aplicar]'); await page.waitForTimeout(500); };

try {
  console.log('\ndono:');
  const dono = await abrir('u_DONO', [['config', 'aparencia', { dono: 'u_DONO' }]]);
  ok((await tema(dono)) === null, 'sem padrão definido, o sistema abre nas cores originais');
  await escolher(dono, 'verde');
  ok(/Aplicar para todos/.test(await textoAplicar(dono)), 'o botão do dono diz "Aplicar para todos"');
  await aplicar(dono);
  const ap = await noBanco(dono, 'config', 'aparencia');
  ok(ap && ap.tema && ap.tema.p === 'verde' && !!ap.tema.em && ap.dono === 'u_DONO', 'o padrão de todos foi gravado no banco');
  ok((await tema(dono)) === 'verde', 'a tela do dono mudou');
  const pd = await noBanco(dono, 'data/users/u_DONO', 'prefs');
  ok(pd && pd.tema && pd.tema.b === ap.tema.em, 'a escolha do dono fica ligada a esse padrão');
  ok(dono.erros.length === 0, 'sem erro de JavaScript no dono: ' + dono.erros.join(' | '));

  console.log('\noutra pessoa (já tinha escolhido roxo):');
  const prefsRoxo = { lidas: {}, tema: { p: 'roxo', m: 'claro' }, visual3: 'cc' };
  const outra = await abrir('u_OUTRA', [['config', 'aparencia', { dono: 'u_DONO' }], ['data/users/u_OUTRA', 'prefs', prefsRoxo]]);
  ok((await tema(outra)) === 'roxo', 'sem padrão definido, continua com a escolha dela');
  const T1 = '2026-11-08T20:00:00.000Z';
  await daNuvem(outra, 'config', 'aparencia', { dono: 'u_DONO', tema: { p: 'verde', m: 'claro', v: 'cc', em: T1 } });
  await esperaTema(outra, 'verde');
  ok((await tema(outra)) === 'verde', 'o dono escolheu: mudou na hora, com o sistema aberto');

  await escolher(outra, 'azul');
  ok(/^Aplicar$/.test((await textoAplicar(outra)).trim()), 'quem não é dono vê só "Aplicar"');
  await aplicar(outra);
  ok((await tema(outra)) === 'azul', 'ela pode escolher a dela');
  const pa = await noBanco(outra, 'data/users/u_OUTRA', 'prefs');
  ok(pa.tema.b === T1, 'a escolha dela fica ligada ao padrão atual');
  const apOutra = await noBanco(outra, 'config', 'aparencia');
  ok(apOutra.tema.p === 'verde', 'a escolha dela não muda o padrão de ninguém');

  const reab = await abrir('u_OUTRA', [['config', 'aparencia', { dono: 'u_DONO', tema: { p: 'verde', m: 'claro', v: 'cc', em: T1 } }], ['data/users/u_OUTRA', 'prefs', pa]]);
  ok((await tema(reab)) === 'azul', 'reabrindo o sistema, a escolha dela continua');
  const T2 = '2026-11-08T21:00:00.000Z';
  await daNuvem(reab, 'config', 'aparencia', { dono: 'u_DONO', tema: { p: 'grafite', m: 'claro', v: 'cc', em: T2 } });
  await esperaTema(reab, 'grafite');
  ok((await tema(reab)) === 'grafite', 'o dono escolheu outro padrão: muda de novo, mesmo para quem tinha a dela');

  await escolher(reab, 'roxo');
  await aplicar(reab);
  ok((await tema(reab)) === 'roxo', 'ela escolhe a dela outra vez');
  await reab.evaluate(() => JB_TEMA.abrir('prontas'));
  await reab.waitForSelector('[data-jbt-padrao]', { timeout: 5000 });
  await reab.click('[data-jbt-padrao]');
  await reab.waitForSelector('.modal button.pri, .modal .btn.pri', { timeout: 5000 });
  await reab.click('.modal button.pri, .modal .btn.pri');
  await reab.waitForTimeout(500);
  ok((await tema(reab)) === 'grafite', '"Restaurar padrão" volta ao padrão do dono');
  ok(reab.erros.length === 0, 'sem erro de JavaScript: ' + reab.erros.join(' | '));

  console.log('\nversão definitiva:');
  const VER = { visual3: 'nv', compacto: false, menu: 'simples', modelo: 'm1' };
  const tr = await abrir('u_OUTRA', [['config', 'aparencia', { dono: 'u_DONO', versao: VER }], ['data/users/u_OUTRA', 'prefs', { lidas: {}, visual3: 'jb' }]]);
  ok(await tr.evaluate(() => document.documentElement.classList.contains('vis-nv')), 'quem não é dono abre na versão do dono, mesmo tendo outra salva');
  ok(await tr.evaluate(() => document.documentElement.classList.contains('jb-versao-fixa')), 'a versão fica travada para quem não é dono');
  await tr.evaluate(() => definirVisual('jb'));
  await tr.waitForTimeout(300);
  ok(await tr.evaluate(() => document.documentElement.classList.contains('vis-nv')), 'trocar o estilo não funciona para quem não é dono');
  await tr.evaluate(() => definirCompacto(true));
  await tr.waitForTimeout(300);
  ok(await tr.evaluate(() => !document.body.classList.contains('compacto')), 'o modo compacto não muda para quem não é dono');
  await tr.evaluate(() => JB_TEMA.abrir('prontas'));
  await tr.waitForSelector('[data-jbt-p="azul"]', { timeout: 5000 });
  ok(await tr.evaluate(() => { const e = document.querySelector('.jbt-vis'); return !e || getComputedStyle(e).display === 'none'; }), 'no painel some a escolha de estilo, ficam as cores');
  await tr.click('[data-jbt-p="azul"]');
  await aplicar(tr);
  ok((await tema(tr)) === 'azul', 'as cores ela continua podendo escolher');
  ok(await tr.evaluate(() => document.documentElement.classList.contains('vis-nv')), 'escolher cor não mexe na versão');
  await daNuvem(tr, 'config', 'aparencia', { dono: 'u_DONO', versao: { ...VER, visual3: 'jb' } });
  await tr.waitForFunction(() => !document.documentElement.classList.contains('vis-nv') && !document.documentElement.classList.contains('vis-cc'), null, { timeout: 40000 }).catch(() => {});
  ok(await tr.evaluate(() => !document.documentElement.classList.contains('vis-nv') && !document.documentElement.classList.contains('vis-cc')), 'quando o dono muda a versão, muda para ela também');
  ok(tr.erros.length === 0, 'sem erro de JavaScript: ' + tr.erros.join(' | '));

  const dv = await abrir('u_DONO', [['config', 'aparencia', { dono: 'u_DONO' }]]);
  await dv.waitForFunction(() => { const d = window.__srv.estado.docs.get('config/aparencia'); return d && d.dados.versao && d.dados.versao.visual3; }, null, { timeout: 15000 }).catch(() => {});
  const v0 = (await noBanco(dv, 'config', 'aparencia')).versao;
  ok(v0 && v0.visual3 === 'cc' && !!v0.modelo && !!v0.menu && v0.compacto === false, 'a versão do dono é guardada sozinha: ' + JSON.stringify(v0));
  ok(await dv.evaluate(() => !document.documentElement.classList.contains('jb-versao-fixa')), 'para o dono nada fica travado');
  await dv.evaluate(() => definirVisual('nv'));
  await dv.waitForFunction(() => window.__srv.estado.docs.get('config/aparencia').dados.versao.visual3 === 'nv', null, { timeout: 15000 }).catch(() => {});
  ok((await noBanco(dv, 'config', 'aparencia')).versao.visual3 === 'nv', 'o dono troca o estilo e a versão de todos acompanha');
  ok(dv.erros.length === 0, 'sem erro de JavaScript: ' + dv.erros.join(' | '));

  console.log('\ndono publicando o que já usa:');
  const prefsDono = { lidas: {}, tema: { p: 'marrom', m: 'claro' }, visual3: 'cc' };
  const dono2 = await abrir('u_DONO', [['config', 'aparencia', { dono: 'u_DONO' }], ['data/users/u_DONO', 'prefs', prefsDono]]);
  ok((await tema(dono2)) === 'marrom', 'o dono está com a paleta dele');
  await dono2.evaluate(() => JB_TEMA.abrir('prontas'));
  await dono2.waitForSelector('[data-jbt-aplicar]', { timeout: 5000 });
  ok(await dono2.evaluate(() => !document.querySelector('[data-jbt-aplicar]').disabled), 'dá para aplicar para todos sem trocar nada');
  await aplicar(dono2);
  const ap2 = await noBanco(dono2, 'config', 'aparencia');
  ok(ap2 && ap2.tema && ap2.tema.p === 'marrom', 'a paleta que ele já usava virou o padrão de todos');
  ok(dono2.erros.length === 0, 'sem erro de JavaScript: ' + dono2.erros.join(' | '));
} finally {
  await browser.close();
  http.close();
}
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
