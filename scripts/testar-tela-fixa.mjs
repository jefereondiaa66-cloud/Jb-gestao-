#!/usr/bin/env node
// Teste da tela fixa (sem redesenho à toa) e das datas com ano errado, no programa real, com banco simulado.
// Uso: node scripts/construir.mjs && node scripts/testar-tela-fixa.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const docs = [['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'recado', { id: 'r1', para: 'u_DONO', titulo: 'Recado', texto: 'Texto de exemplo', segundos: 2, expiraEm: '2099-01-01T00:00:00Z' }]];
for (let i = 1; i <= 40; i++) {
  docs.push(['funcionarios', 'f' + i, { id: 'f' + i, nome: 'Funcionário Exemplo ' + i, situacao: 'Ativo', setor: 'Produção', departamento: 'Fábrica', admissao: '2024-02-01', tipoContratacao: 'Empregado CLT', formaRemuneracao: 'Mensal fixo' }]);
  docs.push(['sensivel', 'f' + i, { id: 'f' + i, salario: 2000 }]);
}
const http = createServer((req, res) => {
  const p = join(RAIZ, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 700 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] }); docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, orderBy: () => q, limit: () => q, get: async () => ({ docs: [], forEach() {} }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(`http://127.0.0.1:${http.address().port}/saida/claude.html`);
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 45000 });
  await page.waitForFunction(() => DATA.funcionarios.length === 40, null, { timeout: 20000 });
  await page.waitForSelector('.jb-recado', { timeout: 15000 });
  ok(await page.evaluate(() => document.querySelector('.jb-recado p').textContent === 'Texto de exemplo'), 'recado aparece na tela da pessoa');
  await page.waitForSelector('.jb-recado', { state: 'detached', timeout: 4000 });
  ok(await page.evaluate(() => { mostrarRecado({ id: 'r1', para: 'u_DONO', texto: 'x' }); mostrarRecado({ id: 'r2', para: 'outra', texto: 'x' }); return !document.querySelector('.jb-recado'); }), 'recado some sozinho, não repete e não aparece para outra pessoa');
  await page.evaluate(() => { window.__r = 0; const o = renderTela; renderTela = function () { __r++; return o.apply(this, arguments); }; location.hash = '#/funcionarios'; });
  await page.waitForTimeout(800);
  await page.evaluate(() => { scrollTo(0, 300); });
  await page.waitForTimeout(700);

  await page.evaluate(() => { __r = 0; ['uso', 'log', 'diagnostico', '_fichas'].forEach(agendarRender); });
  await page.waitForTimeout(1000);
  ok(await page.evaluate(() => __r) === 0, 'dados de fundo não redesenham a tela');

  ok(await page.evaluate(() => { DATA.uso = [{ id: 't' }]; return colecaoMudou('uso') === true && colecaoMudou('uso') === false; }), 'dados iguais recebidos de novo não contam como mudança');

  await page.evaluate(() => { __r = 0; agendarRender('funcionarios'); });
  await page.waitForTimeout(700);
  const j = await page.evaluate(() => ({ r: __r, y: scrollY }));
  ok(j.r === 1 && Math.abs(j.y - 300) < 3, `dado real redesenha uma vez e a página fica no lugar (${j.r}x, y=${j.y})`);

  await page.evaluate(() => { __r = 0; ULT_ROLAGEM = Date.now() + 1200; agendarRender('funcionarios'); });
  await page.waitForTimeout(500);
  const a1 = await page.evaluate(() => __r);
  await page.waitForTimeout(2300);
  const a2 = await page.evaluate(() => __r);
  ok(a1 === 0 && a2 === 1, `durante a rolagem o redesenho espera (${a1} → ${a2})`);

  await page.evaluate(() => { USO_SUJO = false; renderTela(); renderTela(); });
  ok(await page.evaluate(() => USO_SUJO) === false, 'redesenhar a mesma tela não grava o contador de uso');

  const css = await page.evaluate(() => ({ x: getComputedStyle(document.documentElement).overflowX, t: getComputedStyle(document.body).touchAction }));
  ok(css.x === 'hidden' && /pan-y/.test(css.t), 'a página não anda para os lados no computador');

  ok(await page.evaluate(() => dataAbsurda('0202-10-20') && !dataAbsurda('2026-10-20') && !dataAbsurda('')), 'ano digitado errado é reconhecido');
  ok(await page.evaluate(() => { const r = conferirRegistro('desligamentos', { funcionarioId: 'f1', data: '2026-10-20', tipo: 'Pedido de demissão', situacao: 'Concluído', dataEncerramento: '0202-10-20' }); return !!r.erros.dataEncerramento; }), 'formulário barra a data com ano errado');
  ok(erros.length === 0, `sem erro de JavaScript (${erros[0] || 'nenhum'})`);
} finally { await browser.close(); http.close(); }
console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
