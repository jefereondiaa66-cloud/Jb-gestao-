#!/usr/bin/env node
// Teste de ponta a ponta das PENDÊNCIAS (V81), no programa REAL (saida/claude.html) num Chromium com
// banco central simulado. Nada sai para a internet. Confere:
//   1. avisos desligados por padrão: nenhum lembrete ou contador automático aparece nas telas
//   2. o botão PENDÊNCIAS (pequeno) está no alto da tela principal, de um setor e do Setor Pessoal
//   3. clicar abre a lista com as pendências de todos os setores; clicar numa abre a tela dela
//   4. resolvida a situação, a pendência some sozinha da lista
//   5. ligando os avisos em Configurações, eles voltam às telas
// Uso: node scripts/construir.mjs && node scripts/testar-pendencias.mjs
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

// dados fictícios: um funcionário com a ficha incompleta (alerta do DP); a nota fiscal rejeitada é gravada pelo próprio sistema
const DOCS = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Ana Teste Souza', situacao: 'Ativo', tipoContratacao: 'CLT' }],
];
const iniciar = ({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const ir = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(500); };
const visivel = (page, sel) => page.evaluate((s) => [...document.querySelectorAll(s)].some((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed' && !e.hidden && getComputedStyle(e).display !== 'none'), sel);
try {
  for (const vp of [{ width: 1300, height: 900, nome: 'computador' }, { width: 390, height: 800, nome: 'celular' }]) {
    console.log(`\n${vp.nome}:`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });

    await page.evaluate(() => gravar('nfe', { id: 'n1', status: 'rejeitada', ambiente: 'homologacao', data: '2026-11-07', numero: 12, serie: 1, envio: { tentativas: [] }, itens: [], dest: { end: {} }, historico: [] }, null));
    await page.waitForFunction(() => DATA.nfe.some((n) => n.id === 'n1'), null, { timeout: 10000 }).catch(() => {});
    // o botão PENDÊNCIAS que aparece na tela: no cabeçalho do setor, na barra do topo ou, na casca
    // nova (casca2), o botão "Pendências" do topo (data-c2="alertas"), que abre a mesma lista
    const marcarPd = () => page.evaluate(() => {
      document.querySelectorAll('[data-teste-pd]').forEach((e) => e.removeAttribute('data-teste-pd'));
      const b = ['.spot-cab .pd-bt', '#top .pd-bt', '[data-c2="alertas"]>button'].map((q) => document.querySelector(q)).find((e) => e && e.getBoundingClientRect().height > 0);
      if (!b) return 0; b.setAttribute('data-teste-pd', '1'); return b.getBoundingClientRect().height;
    });
    // 1 e 2: tela principal
    await ir(page, '#/setores');
    ok(await page.evaluate(() => document.documentElement.classList.contains('jb-sem-avisos')), 'avisos desligados por padrão');
    const alt = await marcarPd();
    ok(alt > 0, 'botão PENDÊNCIAS visível no alto da tela principal');
    ok(alt > 0 && alt <= 40, `botão discreto (${alt}px de altura)`);
    ok(await page.evaluate(() => !document.querySelector('.spot-card[data-pd], .pd-card') && ![...document.querySelectorAll('.spot-card h2')].some((h) => /pend/i.test(h.textContent))), 'nenhum setor ou cartão novo para as pendências');
    ok(await page.evaluate(() => ![...document.querySelectorAll('.spot-info')].some((s) => /pend[eê]n|alerta/i.test(s.textContent))), 'cartões dos setores sem contagem de pendências');
    ok(!(await visivel(page, '.v61-lemb')), 'sem a faixa "Lembretes de hoje"');

    // 3: abrir a lista
    await page.click('[data-teste-pd]');
    await page.waitForSelector('#pdPainel:not([hidden])', { timeout: 5000 }).catch(() => {});
    const itens = await page.evaluate(() => [...document.querySelectorAll('#pdPainel .pd-it b')].map((b) => b.textContent));
    ok(itens.some((t) => /Cadastro incompleto: Ana Teste Souza/.test(t)), 'lista traz o alerta do Setor Pessoal');
    ok(itens.some((t) => /Nota fiscal rejeitada/.test(t)), 'lista traz a pendência do Setor Fiscal');
    await page.screenshot({ path: join(RAIZ, `saida/pendencias-${vp.nome}.png`) });
    await page.evaluate(() => { [...document.querySelectorAll('#pdPainel .pd-it')].find((b) => /Nota fiscal rejeitada/.test(b.textContent)).click(); });
    await page.waitForTimeout(500);
    ok(await page.evaluate(() => location.hash === '#/vfiscalnf/nota/n1'), 'clicar na pendência abre a tela onde ela se resolve');
    ok(await page.evaluate(() => document.getElementById('pdPainel').hidden), 'a lista fecha ao abrir a tela');

    // 4: resolver e conferir que some
    await page.evaluate(() => gravar('nfe', { ...DATA.nfe.find((n) => n.id === 'n1'), status: 'autorizada' }, DATA.nfe.find((n) => n.id === 'n1')));
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => !window.PENDENCIAS_V81.coletar().some((x) => /Nota fiscal/.test(x.titulo))), 'pendência resolvida some da lista');

    // 2: dentro de um setor e no Setor Pessoal
    await ir(page, '#/setor-lenha');
    ok((await marcarPd()) > 0, 'botão visível no alto do Setor da Lenha');
    await ir(page, '#/painel');
    ok((await marcarPd()) > 0, 'botão visível no alto do Setor Pessoal');
    ok(!(await visivel(page, '#qtSino')) && !(await visivel(page, '#bSino')), 'sino sem contador no Setor Pessoal');
    await page.click('[data-teste-pd]');
    await page.waitForSelector('#pdPainel:not([hidden])', { timeout: 5000 }).catch(() => {});
    ok(await page.evaluate(() => !document.getElementById('pdPainel').hidden && document.querySelectorAll('#pdPainel .pd-it').length >= 1), 'a lista abre também no Setor Pessoal');
    await page.keyboard.press('Escape');
    ok(await page.evaluate(() => document.getElementById('pdPainel').hidden), 'Esc fecha a lista');

    // caixas amarelas de aviso somem das telas (ex.: "Registro gerencial" no Ponto e jornada)
    await ir(page, '#/ponto');
    ok(await page.evaluate(() => [...document.querySelectorAll('#conteudo .aviso.at')].every((e) => getComputedStyle(e).display === 'none')), 'sem caixas amarelas de aviso no Ponto e jornada');

    // 5: ligar os avisos
    if (vp.nome === 'computador') {
      await ir(page, '#/config');
      await page.waitForSelector('#pdLiga', { timeout: 8000 }).catch(() => {});
      ok(await page.evaluate(() => !!document.getElementById('pdLiga')), 'opção "Avisos e pendências" em Configurações');
      await page.evaluate(() => { const i = document.getElementById('pdLiga'); if (i) { i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); } });
      await page.waitForTimeout(700);
      ok(await page.evaluate(() => CFG.avisosTela === true && !document.documentElement.classList.contains('jb-sem-avisos')), 'ligando, os avisos voltam às telas');
      await ir(page, '#/setores');
      ok(await page.evaluate(() => [...document.querySelectorAll('.spot-info')].some((s) => /pend[eê]n/i.test(s.textContent))), 'com avisos ligados, a contagem volta aos cartões');
      await ir(page, '#/ponto');
      ok(await page.evaluate(() => [...document.querySelectorAll('#conteudo .aviso.at')].some((e) => getComputedStyle(e).display !== 'none')), 'com avisos ligados, as caixas de aviso voltam');
      await page.evaluate(async () => { await salvarCfg({ ...clone(CFG), avisosTela: false }); CFG.avisosTela = false; });
    }
    const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
    ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nPendências: tudo certo.');
process.exit(falhas ? 1 : 0);
