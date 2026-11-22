#!/usr/bin/env node
// Teste das telas do Setor de Produção no visual "Vidro claro" em teste (V155), no programa REAL (saida/claude.html)
// num Chromium com o banco central simulado e dados FICTÍCIOS. Nada sai para a internet. Confere:
//   1. com a chave desligada, nenhuma peça nova aparece e a barra de módulos continua escondida (o de sempre)
//   2. com a chave ligada, nas 15 telas da Produção: nenhum título, botão, aba, coluna ou campo de antes some
//   3. Início: barra de módulos, cabeçalho com atalhos, gráfico do dia, módulos e atalhos lado a lado e a lista
//      "Lançamentos do setor" (filtro por tipo, pesquisa e comprovante ao tocar)
//   4. os atalhos abrem os mesmos formulários de sempre; listas com trilha, título e atalhos de situação
//   5. navegar e filtrar não grava nada no banco; sem erro de página; desligar volta tudo ao de sempre
// Uso: node scripts/construir.mjs && node scripts/testar-vidro-producao.mjs
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

/* dados FICTÍCIOS do mês corrente, no formato do banco (coleção prodFab em seis partes por mês) */
function semente() {
  const hashTxt = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  const d0 = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const D = (k) => { const d = new Date(d0); d.setDate(d0.getDate() - k); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
  const recs = []; let n = 0; const id = (p) => p + '_' + (++n);
  for (let k = 6; k >= 0; k--) {
    recs.push({ id: id('ma'), tipo: 'maromba', data: D(k), turno: '1º turno', horaInicio: '06:00', horaFim: '11:58', operador: 'Operador Exemplo', grades: 200 + k, porGrade: 116, perdas: 1000, situacao: 'Confirmado', criadoPor: 'u_DONO' });
    recs.push({ id: id('sc'), tipo: 'secagem', data: D(k), hora: '12:10', mov: 'Entrada no secador', grades: 200, porGrade: 116, responsavel: 'Responsável Exemplo', criadoPor: 'u_DONO' });
  }
  recs.push({ id: id('ma'), tipo: 'maromba', data: D(0), turno: '2º turno', horaInicio: '13:00', horaFim: '17:00', grades: 190, porGrade: 116, perdas: 900, situacao: 'Pendente de confirmação', criadoPor: 'u_DONO' });
  recs.push({ id: id('pa'), tipo: 'parada', data: D(0), turno: '1º turno', inicio: '07:30', fim: '08:10', motivo: 'Quebra ou manutenção da maromba', criadoPor: 'u_DONO' });
  recs.push({ id: id('fn'), tipo: 'fornada', data: D(1), hora: '08:00', fornoId: 'fo1', numero: 1, quantidade: 55000, confirmacao: 'Confirmada', responsavel: 'Responsável Exemplo', criadoPor: 'u_DONO' });
  const docs = {}; recs.forEach((r) => { const k = r.data.slice(0, 7) + '-s' + (hashTxt(r.id) % 6); (docs[k] = docs[k] || { chave: k, items: {} }).items[r.id] = r; });
  return [...Object.entries(docs).map(([k, v]) => ['prodFab', k, v]), ['locais', 'fo1', { id: 'fo1', nome: 'Forno Exemplo', setor: 'lenha', tipo: 'Forno', situacao: 'Ativo' }],
    ['config', 'empresa', { producao: { tijolosPorGrade: 116, fimExpediente: '17:00', inicioExpediente: '06:00' } }], ['config', 'aparencia', { dono: 'u_DONO' }]];
}
const iniciar = ({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Pessoa Teste', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), set: async () => {}, onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Pessoa Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};
const ROTAS = ['setor-producao', 'plancar', 'movProducao', 'pmaromba', 'pparadas', 'psecagem', 'psecmov', 'pfornadas', 'pdesenf', 'plenha', 'ppronto', 'pprontomov', 'prel', 'pmes', 'pcfg'];
/* o que a pessoa vê na tela (o mesmo critério da conferência de funcionalidades; sem diferença de maiúsculas, que é só estilo) */
const ver = () => { const c = document.getElementById('conteudo'); const vis = (e) => e.offsetParent !== null && !e.closest('.abas-trab');
  const t = (s) => [...new Set([...c.querySelectorAll(s)].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim().toLowerCase()).filter((x) => x && x.length < 70))];
  return { h: t('h1,h2,h3'), b: t('button,a.btn,.btn'), a: t('[role=tab],.pm-sub a,.dir-aba,.sv-abas a'), th: t('th'), l: t('label') }; };
const escritas = (page) => page.evaluate(() => [...window.__srv.estado.docs.keys()].join('|'));

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, docs: semente() });
  await page.goto(base + '/saida/claude.html#/setor-producao');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const ir = async (r) => { await page.evaluate((x) => JBNAV.ir('#/' + x), r); await page.waitForTimeout(1500); };

  console.log('\n1. chave desligada: o de sempre');
  const antes = {};
  for (const r of ROTAS) { await ir(r); antes[r] = await page.evaluate(ver); }
  await ir('setor-producao');
  ok(await page.evaluate(() => !document.body.classList.contains('vc-prod') && !document.querySelector('.vc-duo,.vc-lanc,.vc-rapido,.vc-trilha,.vc-tcab,.vc-area')), 'nenhuma peça nova sem a chave');
  ok(await page.evaluate(() => { const t = document.querySelector('.sv-topo'); return !t || t.offsetParent === null; }), 'a barra de módulos continua escondida (fica no botão Módulos)');
  const banco0 = await escritas(page);

  console.log('\n2. chave ligada: nada some');
  await page.evaluate(() => definirVidro(true)); await page.waitForTimeout(1200);
  const banco1 = await escritas(page);
  let falta = [];
  for (const r of ROTAS) { await ir(r); const d = await page.evaluate(ver);
    for (const k of Object.keys(antes[r])) antes[r][k].forEach((x) => { if (!d[k].includes(x)) falta.push(r + ' › ' + x); }); }
  ok(falta.length === 0, 'nas 15 telas, todos os títulos, botões, abas, colunas e campos de antes continuam' + (falta.length ? ' (faltou: ' + falta.slice(0, 4).join('; ') + ')' : ''));

  console.log('\n3. Início no desenho novo');
  await ir('setor-producao'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => document.body.classList.contains('vc-prod') && document.querySelector('.sv-abas').offsetParent !== null), 'barra de módulos à vista');
  ok(await page.evaluate(() => [...document.querySelectorAll('.sv-abas .dir-aba')].map((a) => a.textContent.trim()).join('|').includes('Início|Lançar|Movimentações|Maromba|Secador|Fornos|Tijolo pronto|Relatórios|Configurações')), 'os nove módulos na barra');
  ok(await page.evaluate(() => !!document.querySelector('.c2-home .vc-hic') && /Registrar parada/.test(document.querySelector('.vc-rapido').textContent) && /Lançar/.test(document.querySelector('.vc-rapido').textContent)), 'cabeçalho com os atalhos e o Lançar de sempre');
  ok(await page.evaluate(() => !!document.querySelector('.pp-hero svg.vc-area')), '"Maromba hoje" com o gráfico dos 14 dias');
  ok(await page.evaluate(() => { const d = document.querySelector('.vc-duo'); return !!d && !!d.querySelector('.c2-acesso') && !!d.querySelector('.c2-favblk'); }), 'módulos e atalhos lado a lado');
  ok(await page.evaluate(() => { const s = document.querySelector('.vc-lanc'); return !!s && s.querySelectorAll('tr[data-vcl]').length === 8; }), 'Lançamentos do setor: os 8 mais recentes');
  await page.click('.vc-lanc [data-g="par"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => { const rs = [...document.querySelectorAll('.vc-lanc tr[data-vcl]')]; return rs.length === 1 && /Parada/.test(rs[0].textContent); }), 'filtro por tipo (Paradas)');
  await page.click('.vc-lanc [data-g=""]'); await page.fill('.vc-lanc .vc-lq', 'segundo nada assim'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !document.querySelector('.vc-lanc tr[data-vcl]') && !!document.querySelector('.vc-lanc .vazio')), 'pesquisa sem resultado avisa');
  await page.fill('.vc-lanc .vc-lq', ''); await page.waitForTimeout(400);
  await page.click('.vc-lanc tr[data-vcl]'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => !!document.querySelector('#camada .doc-pag, #camada .doc-folha, .dv-pag, .doc-pag, [data-docv], #docVer') || /#\/(documento|doc)\b/.test(location.hash)), 'tocar num lançamento abre o comprovante');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300); await ir('setor-producao');

  console.log('\n4. atalhos e listas');
  await page.click('.vc-rapido [data-vcir="#/pfornadas/novo"]'); await page.waitForTimeout(900);
  ok(await page.evaluate(() => location.hash === '#/pfornadas/novo'), '"Nova fornada" abre o formulário de enforna de sempre');
  await page.evaluate(() => JBNAV.voltar()); await page.waitForTimeout(600);
  await ir('pmaromba');
  ok(await page.evaluate(() => /Setor de Produção/.test((document.querySelector('.vc-trilha') || {}).textContent || '') && /Lançamentos da maromba/.test((document.querySelector('.vc-tcab') || {}).textContent || '')), 'Maromba: trilha e título da lista');
  ok(await page.evaluate(() => document.querySelectorAll('.vc-graf .vc-gc').length === 2), 'Maromba: gráficos por dia e por turno');
  await page.click('[data-vcsit] [data-v="Pendente de confirmação"]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => document.querySelector('select[data-f="situacao"]').value === 'Pendente de confirmação'), 'atalho de situação usa o filtro de sempre');
  await page.click('[data-vcsit] [data-v=""]'); await page.waitForTimeout(400);
  ok((await escritas(page)) === banco1 && banco1.split('|').filter((k) => !banco0.split('|').includes(k)).every((k) => k === 'data/users/u_DONO/prefs'), 'navegar, filtrar e abrir comprovantes não gravou nada (só a preferência da chave)');
  ok(erros.length === 0, 'nenhum erro de página' + (erros.length ? ': ' + erros[0] : ''));

  console.log('\n5. desligar');
  await page.evaluate(() => definirVidro(false)); await page.waitForTimeout(1200); await ir('setor-producao');
  ok(await page.evaluate(() => !document.body.classList.contains('vc-prod') && !document.querySelector('.vc-duo,.vc-lanc,.vc-rapido,.vc-area')), 'volta ao de sempre, sem peças novas');
  await ctx.close();
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nProdução no visual novo: tudo certo.');
process.exit(falhas ? 1 : 0);
