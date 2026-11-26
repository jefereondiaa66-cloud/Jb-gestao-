#!/usr/bin/env node
// Teste de ponta a ponta da carga do forno com saldo (V114): enforna em partes, desenforna em partes,
// fechamento com a diferença lançada como perda no forno e baixa de lenha por milheiro enfornado.
// Roda o programa REAL (saida/claude.html) num Chromium com banco central simulado. Nada sai para a
// internet. Só dados fictícios (ZZ…), no mesmo formato dos lançamentos antigos (sem vínculo gravado).
// Uso: node scripts/construir.mjs && node scripts/testar-fornos-saldo.mjs
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

const iniciar = ({ codigo }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'Dono' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const perto = (a, b) => Math.abs(a - b) < 1e-6;

try {
  for (const vp of [{ width: 1280, height: 860, nome: 'computador' }, { width: 390, height: 800, nome: 'celular' }]) {
    console.log(`\n${vp.nome} (${vp.width} px):`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
    const ir = async (h, ms = 700) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(ms); };
    /* resumo das cargas de um forno, na ordem */
    const C = (forno) => page.evaluate((f) => PROD_V114.cargas().lista.filter((c) => c.fornoId === f).map((c) => ({ id: c.id, n: c.numero, partes: c.partes.length, des: c.des.length, enf: c.enf, ret: c.ret, saldo: c.saldo, dif: c.dif, perda: c.perda, fase: c.fase, fechada: c.fechada, auto: c.auto, conferir: c.conferir, semDes: c.semDes })), forno);

    /* ---------- histórico: lançamentos no formato antigo, sem nenhum vínculo gravado ---------- */
    await page.evaluate(async () => {
      const agora = new Date().toISOString(); const c = { criadoEm: agora, criadoPor: 'u_DONO', alteradoEm: agora, alteradoPor: 'u_DONO' };
      await gravar('produtos', { id: 'zzlen', setor: 'lenha', nome: 'ZZ Lenha', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo', ...c }, null);
      await gravar('estoqueMov', { id: 'zzm1', setor: 'lenha', tipo: 'Entrada', produtoId: 'zzlen', quantidade: 900, delta: 900, anterior: 0, atual: 900, unidade: 'm³', data: '2026-10-01', hora: '08:00', motivo: 'ZZ estoque inicial', valorEntrada: 45000, ...c }, null);
      for (const n of ['1', '2', '3', '5', '6', '7']) await gravar('locais', { id: 'zzf' + n, setor: 'lenha', nome: 'ZZ Forno 0' + n, tipo: 'Forno', situacao: 'Ativo', capacidade: 65, ...c }, null);
      await gravar('locais', { id: 'zzcont', setor: 'lenha', nome: 'ZZ Forno Contínuo', tipo: 'Forno', continuo: true, situacao: 'Ativo', ...c }, null);
      const enf = (id, forno, numero, data, q, sit) => gravar('pfornadas', { id, fornoId: forno, numero, data, hora: '00:00', quantidade: q, situacao: sit || 'Em queima', confirmacao: 'Confirmada', ...c }, null);
      const des = (id, forno, data, q, x) => gravar('pdesenf', { id, fornoId: forno, fornadaId: '', data, hora: '00:00', total: q, primeira: q, segunda: 0, quebrados: 0, trincados: 0, outras: 0, aprovado: q, perdas: 0, situacao: 'Confirmado', classificacaoPendente: true, ...c, ...(x || {}) }, null);
      /* forno 6: carga inteira, desenforna em dois dias faltando 5 mil, e a carga seguinte entra em dois dias */
      await enf('zz6a', 'zzf6', 1, '2026-10-30', 57000, 'Em enforna');
      await des('zz6d1', 'zzf6', '2026-11-05', 25000); await des('zz6d2', 'zzf6', '2026-11-06', 27000);
      await enf('zz6b', 'zzf6', 2, '2026-11-07', 37000); await enf('zz6c', 'zzf6', 3, '2026-11-09', 21000);
      /* forno 1: desenfornas de carga enfornada antes do sistema; depois, enforna em dois dias */
      await des('zz1d1', 'zzf1', '2026-11-06', 20000); await des('zz1d2', 'zzf1', '2026-11-07', 21500); await des('zz1d3', 'zzf1', '2026-11-09', 10000);
      await enf('zz1a', 'zzf1', 2, '2026-11-09', 19000); await enf('zz1b', 'zzf1', 3, '2026-11-10', 38000);
      /* forno 5: carga antiga com desenforna ligada e classificada no mesmo dia (importada); carga nova com desenforna em partes */
      await enf('zz5a', 'zzf5', 1, '2026-10-23', 58000, 'Aguardando desenforna');
      await des('zz5d0', 'zzf5', '2026-10-23', 58000, { fornadaId: 'zz5a', primeira: 52000, segunda: 3000, quebrados: 3000, aprovado: 55000, perdas: 3000, classificacaoPendente: undefined });
      await enf('zz5b', 'zzf5', 2, '2026-11-03', 56500);
      await des('zz5d1', 'zzf5', '2026-11-09', 45000); await des('zz5d2', 'zzf5', '2026-11-10', 9000);
      /* forno 7: só 17,5 mil saíram até agora */
      await enf('zz7a', 'zzf7', 1, '2026-11-06', 58000); await des('zz7d1', 'zzf7', '2026-11-11', 17500);
      /* contínuo: fica fora das cargas */
      await enf('zzca', 'zzcont', 1, '2026-11-04', 10000); await des('zzcd', 'zzcont', '2026-11-05', 9000);
    });
    await page.waitForFunction(() => DATA.pfornadas.length === 9 && DATA.pdesenf.length === 10 && DATA.locais.filter((l) => /^zz/.test(l.id)).length === 7 && DATA.produtos.some((p) => p.id === 'zzlen'), null, { timeout: 10000 });

    let c6 = await C('zzf6');
    ok(c6.length === 2 && c6[0].fechada && c6[0].auto && c6[0].enf === 57000 && c6[0].ret === 52000 && c6[0].dif === 5000 && c6[0].perda === 5000 && !c6[0].conferir, 'histórico: carga desenfornada em dois dias fecha quando o forno recebe enforna nova, e os 5 mil que faltaram viram perda no forno');
    ok(c6[1].partes === 2 && c6[1].enf === 58000 && !c6[1].fechada && c6[1].saldo === 58000 && c6[1].fase === 'Em queima', 'histórico: enforna de 37 mil + 21 mil dois dias depois vira uma carga só, de 58 mil');
    const c1 = await C('zzf1');
    ok(c1.length === 1 && c1[0].partes === 2 && c1[0].enf === 57000 && c1[0].des === 0 && c1[0].saldo === 57000, 'histórico: desenforna de forno sem enforna lançada não entra em carga nenhuma, e a enforna do mesmo dia abre carga nova (19 + 38 mil)');
    ok(await page.evaluate(() => PROD_V114.cargas().soltas.length === 3), 'histórico: as 3 desenfornas sem carga continuam contando na produção, fora da perda');
    const c5 = await C('zzf5');
    ok(c5.length === 2 && c5[0].fechada && !c5[0].auto && c5[0].dif === 0 && c5[0].perda === 3000, 'histórico: desenforna ligada e completa fecha a carga; perda = só o que foi classificado como quebra');
    ok(c5[1].des === 2 && c5[1].ret === 54000 && c5[1].saldo === 2500 && c5[1].fase === 'Em desenforna' && !c5[1].fechada, 'histórico: de 56,5 mil saíram 45 + 9 mil; restam 2,5 mil no forno (saldo, não perda)');
    const c7 = await C('zzf7');
    ok(c7[0].saldo === 40500 && c7[0].fase === 'Em desenforna', 'histórico: de 58 mil saíram 17,5 mil; restam 40,5 mil no forno');
    ok(await page.evaluate(() => PROD_V114.cargas().lista.every((c) => c.fornoId !== 'zzcont')), 'forno contínuo não tem carga fechada');

    /* ---------- telas abrem com o histórico ---------- */
    await ir('#/setor-producao', 900);
    ok(await page.evaluate(() => /Em desenforna/.test(document.body.textContent) || /Cargas abertas|Fornos/.test(document.body.textContent)), 'painel do setor abre');
    await ir('#/pfornadas', 900);
    ok(await page.evaluate(() => /Restam no forno/.test(document.body.textContent) && /soma na carga nº 2/.test(document.body.textContent)), 'lista de enfornas mostra a carga, o que resta no forno e o lançamento que soma na carga');
    await ir('#/pdesenf', 900);
    ok(await page.evaluate(() => /ZZ Forno 05 · nº 2/.test(document.body.textContent)), 'lista de desenfornas mostra de qual carga saiu cada lançamento antigo');
    await ir('#/plenha', 900); await ir('#/prel', 900);

    /* ---------- enforna em partes pela tela (regras do próprio formulário) ---------- */
    const lancarEnf = (forno, data, q, modo) => page.evaluate(async ({ forno, data, q, modo }) => {
      const M = MODS.pfornadas; const st = { ...M.padrao(), id: novoId(), fornoId: forno, data, hora: '08:00' };
      M.aoMudar(st, 'fornoId'); const modoPad = st.modoCarga; if (modo) { st.modoCarga = modo; M.aoMudar(st, 'modoCarga'); }
      st.quantidade = q; st.situacao = 'Em queima';
      const cf = conferirRegistro('pfornadas', st); if (Object.keys(cf.erros).length) return { erros: cf.erros };
      const mostra = !!M.fields.find((f) => f.k === 'modoCarga').sh(st); const html = M.fields.find((f) => f.k === '_carga').calc(st);
      const rec = await gravarRegistro('pfornadas', st, null, true);
      return { id: rec.id, numero: rec.numero, cargaDe: rec.cargaDe || '', cargaNova: !!rec.cargaNova, temModo: 'modoCarga' in rec, modoPad, mostra, aviso: cf.aviso || '', html };
    }, { forno, data, q, modo });
    const e1 = await lancarEnf('zzf3', '2026-11-09', 20000);
    await page.waitForFunction((id) => DATA.pfornadas.some((f) => f.id === id), e1.id);
    ok(e1.id && !e1.cargaDe && !e1.mostra && /abre uma carga nova/.test(e1.html), 'enforna em forno vazio abre carga nova');
    await page.waitForFunction(() => DATA.consumos.some((c) => c.enfornaId && c.localId === 'zzf3'), null, { timeout: 8000 }).catch(() => {});
    const l1 = await page.evaluate((id) => { const c = DATA.consumos.find((x) => x.enfornaId === id); return c ? { q: c.quantidade, mil: c.milheiros } : null; }, e1.id);
    ok(l1 && perto(l1.q, 20.6) && perto(l1.mil, 20), 'lenha: enforna de 20 mil baixa 20,6 m³ (1,03 por milheiro), não um valor fixo por fornada');
    const e2 = await lancarEnf('zzf3', '2026-11-10', 37000);
    await page.waitForFunction((id) => DATA.pfornadas.some((f) => f.id === id), e2.id);
    ok(e2.modoPad === 'continuar' && e2.mostra && e2.cargaDe === e1.id && e2.numero === e1.numero && !e2.temModo && /fica com <b>57\.000<\/b>/.test(e2.html), 'segunda enforna no mesmo forno: o formulário propõe continuar a carga, mostra 20 mil + 37 mil = 57 mil e grava o vínculo');
    let c3 = await C('zzf3');
    ok(c3.length === 1 && c3[0].partes === 2 && c3[0].enf === 57000 && c3[0].saldo === 57000, 'forno enchido em dois dias: uma carga de 57 mil');
    await page.waitForFunction((id) => DATA.consumos.some((c) => c.enfornaId === id), e2.id, { timeout: 8000 }).catch(() => {});
    const l2 = await page.evaluate((id) => { const c = DATA.consumos.find((x) => x.enfornaId === id); return c ? c.quantidade : null; }, e2.id);
    ok(l2 != null && perto(l2, 38.11), 'lenha: a segunda parte baixa só os 37 mil dela (38,11 m³)');
    ok(await page.evaluate(() => DATA.consumos.filter((c) => c.localId === 'zzf3').length === 2), 'lenha: uma baixa por lançamento de enforna, sem repetir');

    /* ---------- desenforna em partes pela tela ---------- */
    const lancarDes = (forno, data, q, fim) => page.evaluate(async ({ forno, data, q, fim }) => {
      const M = MODS.pdesenf; const st = { ...M.padrao(), id: novoId(), fornoId: forno, data, hora: '16:00' };
      M.aoMudar(st, 'fornoId'); st.total = q; if (fim) st.fimDes = fim;
      const cf = conferirRegistro('pdesenf', st); if (Object.keys(cf.erros).length) return { erros: cf.erros };
      const conc = M.fields.find((f) => f.k === '_c').calc(st);
      const rec = await gravarRegistro('pdesenf', st, null, true);
      return { id: rec.id, fornadaId: rec.fornadaId, fimDes: rec.fimDes || '', aviso: cf.aviso || '', conc };
    }, { forno, data, q, fim });
    const d1 = await lancarDes('zzf3', '2026-11-12', 20000);
    await page.waitForFunction((id) => DATA.pdesenf.some((d) => d.id === id), d1.id);
    ok(d1.fornadaId === e1.id && d1.fimDes === 'nao' && !/perda/i.test(d1.aviso) && /restam 37\.000/.test(d1.conc), 'desenforna de 20 mil de uma carga de 57 mil: salva sem travar e mostra que restam 37 mil no forno');
    c3 = await C('zzf3');
    ok(c3[0].fase === 'Em desenforna' && c3[0].ret === 20000 && c3[0].saldo === 37000 && !c3[0].fechada && c3[0].perda === 0, 'depois da 1ª parte: carga em desenforna, 37 mil de saldo e nenhuma perda lançada');
    const d2 = await lancarDes('zzf3', '2026-11-13', 35000, 'sim');
    await page.waitForFunction((id) => DATA.pdesenf.some((d) => d.id === id), d2.id);
    ok(d2.fornadaId === e1.id && /2\.000 tijolos de diferença entram como perda no forno/.test(d2.aviso) && /perda no forno/.test(d2.conc), 'última parte marcada como "forno vazio": avisa que os 2 mil de diferença entram como perda no forno');
    c3 = await C('zzf3');
    ok(c3[0].fechada && !c3[0].auto && c3[0].ret === 55000 && c3[0].dif === 2000 && c3[0].perda === 2000 && c3[0].fase === 'Desenfornada', 'carga encerrada: entrou 57 mil, saiu 55 mil, perda no forno de 2 mil');

    /* ---------- desenforna que esvazia o forno encerra sozinha ---------- */
    const d5 = await lancarDes('zzf5', '2026-11-12', 2500);
    await page.waitForFunction((id) => DATA.pdesenf.some((d) => d.id === id), d5.id);
    const c5b = await C('zzf5');
    ok(d5.fimDes === 'sim' && c5b[1].fechada && c5b[1].dif === 0 && c5b[1].perda === 0, 'quando sai tudo o que restava, a carga fecha sozinha e sem perda');

    /* ---------- enforna nova em forno que ainda está em desenforna ---------- */
    const av7 = await page.evaluate(() => { const M = MODS.pfornadas; const st = { ...M.padrao(), id: novoId(), fornoId: 'zzf7', data: '2026-11-13', hora: '08:00', quantidade: 30000 }; M.aoMudar(st, 'fornoId'); const cf = conferirRegistro('pfornadas', st); return { erros: Object.keys(cf.erros), aviso: cf.aviso || '', mostra: !!M.fields.find((f) => f.k === 'modoCarga').sh(st), html: M.fields.find((f) => f.k === '_carga').calc(st) }; });
    ok(!av7.erros.length && !av7.mostra && /40\.500/.test(av7.aviso) && /perda no forno/.test(av7.aviso) && /lance a desenforna antes/.test(av7.html), 'enforna em forno com carga em desenforna: avisa que os 40,5 mil que restam virariam perda, antes de salvar');
    /* fechamento automático com diferença grande não vira perda: fica para conferir */
    const e7 = await lancarEnf('zzf7', '2026-11-13', 30000);
    await page.waitForFunction((id) => DATA.pfornadas.some((f) => f.id === id), e7.id);
    const c7b = await C('zzf7');
    ok(c7b[0].fechada && c7b[0].conferir && c7b[0].perda === 0 && c7b[1].enf === 30000, 'carga fechada pela enforna nova com 70% sem desenforna lançada não entra na perda: fica marcada para conferir');
    /* carga cheia em queima: enforna nova no mesmo forno é carga nova por padrão */
    const e6 = await page.evaluate(() => { const M = MODS.pfornadas; const st = { ...M.padrao(), id: novoId(), fornoId: 'zzf6', data: '2026-11-10', hora: '08:00', quantidade: 20000 }; M.aoMudar(st, 'fornoId'); return { modo: st.modoCarga, numero: st.numero }; });
    ok(e6.modo === 'nova' && e6.numero === 4, 'forno já cheio (58 mil): novo lançamento é proposto como carga nova, com o próximo número');

    /* ---------- painel, relatórios e telas depois dos lançamentos ---------- */
    await ir('#/setor-producao', 1000);
    if (process.env.CAPTURAS) await page.screenshot({ path: join(process.env.CAPTURAS, 'painel-' + vp.nome + '.png'), fullPage: true });
    const pn = await page.evaluate(() => document.body.textContent);
    ok(/saíram|restam|Em desenforna|Cargas abertas/.test(pn), 'painel mostra a situação das cargas');
    await ir('#/pfornadas', 800); await ir('#/pdesenf', 800); await ir('#/plenha', 800); await ir('#/prel', 800); await ir('#/pcfg', 800);
    ok(await page.evaluate(() => { const i = document.querySelector('#cp_lpm'); return !!i && +String(i.value).replace(',', '.') === 1.03; }), 'Configurações do setor: lenha por milheiro enfornado = 1,03 m³');
    await ir('#/pdesenf/novo', 900);
    if (process.env.CAPTURAS) { const sel = await page.$('[data-campo="fornoId"] select'); if (sel) { await sel.selectOption('zzf6'); await page.waitForTimeout(300); const t = await page.$('[data-campo="total"] input'); if (t) { await t.fill('20000'); await t.dispatchEvent('input'); await t.dispatchEvent('change'); await page.waitForTimeout(400); } } await page.screenshot({ path: join(process.env.CAPTURAS, 'desenforna-' + vp.nome + '.png'), fullPage: true }); }
    ok(await page.evaluate(() => /O forno ficou vazio\?/.test(document.body.textContent)) || await page.evaluate(() => !!document.querySelector('[data-campo="fornoId"]')), 'formulário da desenforna abre');
    await ir('#/pfornadas/novo', 900);
    if (process.env.CAPTURAS) { const sel = await page.$('[data-campo="fornoId"] select'); if (sel) { await sel.selectOption('zzf1'); await page.waitForTimeout(400); } await page.screenshot({ path: join(process.env.CAPTURAS, 'enforna-' + vp.nome + '.png'), fullPage: true }); }
    ok(await page.evaluate(() => !!document.querySelector('[data-campo="_carga"]') || /Carga do forno/.test(document.body.textContent)), 'formulário da enforna mostra a carga do forno');
    ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
