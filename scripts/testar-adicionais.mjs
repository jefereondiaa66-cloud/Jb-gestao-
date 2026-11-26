#!/usr/bin/env node
// Teste da insalubridade e do adicional noturno na ficha, nos lançamentos, na folha e no holerite (dados de exemplo).
// Uso: node scripts/construir.mjs && node scripts/testar-adicionais.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const base = { situacao: 'Ativo', setor: 'Produção', departamento: 'Fábrica', admissao: '2024-02-01', tipoContratacao: 'Empregado CLT', formaRemuneracao: 'Mensal fixo', cargaSemanal: 44 };
const docs = [['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['funcionarios', 'f1', { ...base, id: 'f1', nome: 'Forneiro Exemplo', insalubridade: 'Grau médio (20%)' }], ['sensivel', 'f1', { id: 'f1', salario: 2200 }],
  ['funcionarios', 'f2', { ...base, id: 'f2', nome: 'Noturno Exemplo', adicionalNoturno: 'Sim' }], ['sensivel', 'f2', { id: 'f2', salario: 2200 }],
  ['funcionarios', 'f3', { ...base, id: 'f3', nome: 'Sem Adicional' }], ['sensivel', 'f3', { id: 'f3', salario: 2200 }],
  ['folhas', '2026-09', { id: '2026-09', competencia: '2026-09', situacao: 'Fechada', itens: [{ funcionarioId: 'f1', nome: 'Forneiro Exemplo', forma: 'Mensal fixo', fixo: 2200, diarias: 0, producao: 0, extras: 0, descFaltas: 0, descAtrasos: 0, descVales: 0, jaPago: 0, bruto: 2200, descontos: 0, total: 2200 }], totais: { pessoas: 1, liquido: 2200 } }]];
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
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 } });
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
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.funcionarios.length === 3, null, { timeout: 45000 });
  await page.evaluate(() => { confirmar = async () => true; });
  const mes = await page.evaluate(() => mesAtual());
  const sm = await page.evaluate(() => +LG().salarioMinimo);
  const it = (id, m = mes) => page.evaluate(([id, m]) => itemFolha(F(id), m, {}), [id, m]);

  const i1 = await it('f1');
  ok(Math.abs(i1.insalubridade - sm * 0.2) < 0.01, `ficha com grau médio entra na folha (${i1.insalubridade})`);
  ok(Math.abs(i1.bruto - (2200 + sm * 0.2)) < 0.01, 'insalubridade soma no bruto da folha');
  ok((await it('f3')).insalubridade === 0, 'quem não tem na ficha não recebe');
  ok(await page.evaluate((m) => holerite('f1', m).proventos.some((p) => p.cod === '103'), mes), 'holerite mostra a insalubridade');
  ok(await page.evaluate(() => holerite('f1', '2026-09').proventos.every((p) => p.cod !== '103')), 'mês já fechado não muda');

  // tela: ficha
  await page.evaluate(() => { location.hash = '#/funcionarios/f3'; }); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector('.gaveta [data-k="insalubridade"]') && !!document.querySelector('.gaveta [data-k="adicionalNoturno"]')), 'ficha tem insalubridade e adicional noturno');
  await page.evaluate(() => { GAV.sujo = false; fecharRota(true); }); await page.waitForTimeout(300);

  // tela: lançamentos
  await page.evaluate(() => { location.hash = '#/lancar/f2'; }); await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelector('[data-la="adicionais"]').click()); await page.waitForTimeout(300);
  const v = await page.evaluate(async () => { const s = (id, x) => { const e = document.getElementById(id); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); }; s('laH', '10'); const val = document.getElementById('laV').value; document.getElementById('laOk').click(); await new Promise((r) => setTimeout(r, 900)); return { val, n: DATA.adicionais.length, rec: DATA.adicionais[0] }; });
  ok(v.n === 1 && v.rec.tipo === 'Adicional noturno' && +v.rec.horas === 10, 'aba Adicional grava o noturno');
  const esperadoN = await page.evaluate(() => round2(10 * valorHoraF('f2') * (+CFG.ponto.pctNoturno) / 100));
  ok(Math.abs(+v.val - esperadoN) < 0.01, `valor calculado pelas horas (${v.val})`);
  ok(Math.abs((await it('f2')).noturno - esperadoN) < 0.01, 'noturno lançado entra na folha');

  await page.evaluate(async (m) => { await lancarRegistro('adicionais', { funcionarioId: 'f1', data: m + '-05', tipo: 'Insalubridade', grau: 'Grau máximo (40%)', valor: 100 }, null); }, mes);
  await page.waitForTimeout(400);
  const i2 = await it('f1');
  ok(i2.insalubridade === 100, `lançamento substitui o valor da ficha no mês, sem somar (${i2.insalubridade})`);
  ok(await page.evaluate((m) => { const r = conferirRegistro('adicionais', { funcionarioId: 'f1', data: m + '-05', tipo: 'Adicional noturno', valor: 10 }); return !!r.erros.horas; }, mes), 'noturno sem horas é barrado');
  ok(erros.length === 0, `sem erro de JavaScript (${erros[0] || 'nenhum'})`);
} finally { await browser.close(); http.close(); }
console.log(falhas ? `${falhas} falha(s)` : 'tudo certo');
process.exit(falhas ? 1 : 0);
