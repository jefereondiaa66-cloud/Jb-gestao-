#!/usr/bin/env node
// Teste da V181 · visual novo da tela Variações (todos os setores, Setor Pessoal e "Variações de todos os setores"),
// no programa REAL (saida/claude.html) num Chromium, com o banco central simulado (scripts/lib/servidor-falso.mjs) e
// dados SIMULADOS (scripts/lib/dados-sinteticos.mjs, semente fixa). Nada sai para a internet. Confere, no computador e
// no celular:
//   - os números da tela são os das funções de sempre (VARIACOES_V73.val / comparar / fmt): cartões, resumo do mês,
//     destaques, "mês × mês anterior" e tabela "Mês a mês";
//   - cores pelo sentido de cada número (verde melhorou, vermelho piorou, cinza sem mudança ou neutro): Perdas subindo
//     fica vermelho;
//   - nenhum "novo" nem "antes era zero" (agora "sem dado no mês anterior"); horas escritas como "horas";
//   - seletor do mês (lista, setas e "Mês atual"), cartão escolhe o gráfico, linha da tabela escolhe o mês;
//   - celular: nada passa da largura da tela, tabela contínua rolando por dentro, e o fim da tela fica livre do selo
//     "Powered by Netlify" e da barra de baixo;
//   - nada é gravado no banco, sem erro de JavaScript, e quem não tem as Variações continua sem acesso.
// Uso: node scripts/construir.mjs && node scripts/testar-variacoes-visual.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
import { gerarDadosSinteticos } from './lib/dados-sinteticos.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
if (!existsSync(join(RAIZ, 'saida/claude.html'))) { console.log('✘ falta saida/claude.html (rode node scripts/construir.mjs)'); process.exit(1); }

const http = createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

// As Variações são exclusivas de dois códigos de usuário (V85); o teste entra com um deles.
const DONO = 'u_FZmOBZqQYLD0VE7xkGL8AA';
const DOCS = gerarDadosSinteticos(1, 7);
DOCS.push(['acesso', DONO, { id: DONO, nome: 'Dono Teste', papel: 'admin', ativo: true }]);
const MES = '2026-10';

const iniciar = ({ codigo, docs, dono }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: [dono, 'u_DONO'] }); docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d)); window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: dono, name: 'Dono Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => dono, isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
async function abrirPagina(vp, dono = DONO) {
  const ctx = await browser.newContext({ locale: 'pt-BR', viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.mobile ? 2 : 1, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS, dono });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 90000 });
  await page.waitForTimeout(500);
  return { ctx, page, erros };
}
const ir = async (page, h) => { await page.evaluate((x) => JBNAV.ir(x), h); await page.waitForTimeout(700); };
const mesDaAba = async (page, m) => { await page.evaluate((x) => { VARIACOES_V73.VR.mes = x; renderTela(); }, m); await page.waitForTimeout(450); };
const bancoSemUso = (page) => page.evaluate(() => JSON.stringify([...window.__srv.estado.docs.entries()].filter(([k]) => !/^(log|uso|diagnostico|ws)\//.test(k)).map(([k, v]) => [k, v.versao])));
/* imita o selo "Powered by Netlify" (ele só existe na versão da nuvem): caixa fixa embaixo, à esquerda */
const pôrSelo = (page) => page.evaluate(() => { if (document.getElementById('nl-badge-frame')) return; const f = document.createElement('div'); f.id = 'nl-badge-frame';
  f.style.cssText = 'position:fixed;left:12px;bottom:8px;width:158px;height:46px;border-radius:23px;background:#0e1e25;z-index:44'; document.body.appendChild(f); });

/* o que a tela mostra × o que as funções de sempre calculam (para o painel do setor aberto) */
const conferirSetor = (page, id) => page.evaluate((id) => {
  const V = VARIACOES_V73; const m = V.VR.mes; const ant = mesMenos(m, 1);
  const raiz = document.querySelector('.vr-raiz'); if (!raiz) return { erro: 'sem .vr-raiz' };
  const IS = V.SETS[id].ind.filter((I) => { try { return !I.ok || I.ok(); } catch (e) { return false; } });
  const t = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
  const digitos = (s) => String(s).replace(/[^\d,.]/g, '');
  const numDe = (I, v) => { const s = V.fmt(I, v); if (s === '—') return '—'; if (I.u === 'moeda') return s.replace(/^[^\d]*R\$\s*/, '').trim(); if (I.u === 'pct') return s.replace(/%$/, ''); return s.split(' ')[0]; };
  const res = IS.map((I) => { const a = V.val(id, I, m).v, b = V.val(id, I, ant).v; return { I, a, b, c: V.comparar(I, a, b) }; });
  const prob = [];
  // cartões
  res.forEach(({ I, a, b, c }) => {
    const card = raiz.querySelector(`.vr-card[data-vrind="${I.k}"]`); if (!card) { prob.push('sem cartão ' + I.k); return; }
    if (t(card.querySelector('.vr-num')) !== numDe(I, a)) prob.push(`cartão ${I.k}: ${t(card.querySelector('.vr-num'))} ≠ ${numDe(I, a)}`);
    if (!card.classList.contains('st-' + c.cls)) prob.push(`cartão ${I.k}: cor ${card.className} ≠ ${c.cls}`);
    const p = card.querySelector('.vr-k-var .vr-pill'); if (!p || !p.classList.contains(c.dir === 'sem' ? 'neu' : c.cls)) prob.push(`pílula ${I.k}`);
    if (c.doZero && !/sem dado no mês anterior/.test(t(p))) prob.push(`pílula ${I.k} sem o texto "sem dado no mês anterior"`);
    if (I.suf === 'h' && a != null && !/horas$/.test(t(card.querySelector('.vr-v')))) prob.push(`cartão ${I.k} sem "horas"`);
  });
  // resumo do mês e destaques
  const nB = res.filter((x) => x.c.cls === 'bom').length, nR = res.filter((x) => x.c.cls === 'ruim').length;
  const semDado = res.every((x) => x.a == null || x.a === 0) && res.every((x) => x.b == null || x.b === 0);
  const pl = (k) => t(raiz.querySelector('.vr-hero .vr-pl.' + k + ' b'));
  if (!semDado && (pl('bom') !== String(nB) || pl('ruim') !== String(nR) || pl('neu') !== String(res.length - nB - nR))) prob.push(`resumo ${pl('bom')}/${pl('ruim')}/${pl('neu')} ≠ ${nB}/${nR}/${res.length - nB - nR}`);
  const peso = (x) => (x.c.doZero || x.a == null || x.b == null || x.b === 0 ? null : Math.abs(x.a - x.b) / Math.abs(x.b));
  const maior = (cls) => { let r = null, s = -1; res.forEach((x) => { if (x.c.cls !== cls || (x.c.dir !== 'sobe' && x.c.dir !== 'desce')) return; const p = peso(x); if (p != null && p > s) { s = p; r = x; } }); return r; };
  const dB = maior('bom'), dR = maior('ruim');
  const dest = [...raiz.querySelectorAll('.vr-hero .vr-dt')].map((d) => t(d.querySelector('b')));
  if (!semDado && ((dB && dest[0] !== dB.I.l) || (dR && dest[1] !== dR.I.l))) prob.push(`destaques ${dest.join(' | ')} ≠ ${dB && dB.I.l} | ${dR && dR.I.l}`);
  if (dB && !raiz.querySelector(`.vr-card[data-vrind="${dB.I.k}"] .vr-flag.bom`)) prob.push('cartão do que mais melhorou sem a marca');
  if (dR && !raiz.querySelector(`.vr-card[data-vrind="${dR.I.k}"] .vr-flag.ruim`)) prob.push('cartão do que mais piorou sem a marca');
  // mês × mês anterior
  const linhas = [...raiz.querySelectorAll('.vr-comp .vr-cr')];
  if (linhas.length !== res.length) prob.push(`comparação com ${linhas.length} linhas ≠ ${res.length}`);
  res.forEach(({ I, a, b, c }, i) => { const L = linhas[i]; if (!L) return; const vs = [...L.querySelectorAll('.vr-cv-v .vr-num')].map(t);
    if (t(L.querySelector('.vr-cr-nome b')) !== I.l || vs[0] !== numDe(I, a) || vs[1] !== numDe(I, b) || !L.classList.contains('st-' + c.cls)) prob.push(`comparação ${I.k}: ${vs.join(' / ')}`); });
  // tabela mês a mês
  const trs = [...raiz.querySelectorAll('.vr-tab tbody tr')];
  const on = raiz.querySelector('.vr-tab tbody tr.on'); if (!on || on.dataset.vrmes !== m) prob.push('linha do mês escolhido');
  trs.forEach((tr) => { const mm = tr.dataset.vrmes; [...tr.cells].slice(1).forEach((td, k) => { const I = IS[k]; const v = V.val(id, I, mm).v;
    if (digitos(t(td.querySelector('.vr-tv'))) !== digitos(V.fmt(I, v))) prob.push(`tabela ${mm} ${I.k}: ${t(td.querySelector('.vr-tv'))} ≠ ${V.fmt(I, v)}`); }); });
  if (!trs.length) prob.push('tabela sem linhas');
  // textos que saíram
  const txt = raiz.innerText;
  if (/\bnovo\b/i.test(txt) || /antes era zero/i.test(txt)) prob.push('ainda aparece "novo" ou "antes era zero"');
  const u = raiz.lastElementChild, pen = u && u.previousElementSibling;
  return { prob, n: res.length, nB, nR, ultimo: u && u.matches('section.vvd') ? 'vvd:' + t(pen && pen.querySelector('h3')) : t(u && u.querySelector('h3')) };
}, id);

try {
  for (const vp of [{ width: 1366, height: 900, nome: 'computador' }, { width: 390, height: 844, nome: 'celular', mobile: true }]) {
    console.log(`\n${vp.nome}:`);
    const { ctx, page, erros } = await abrirPagina(vp);
    const banco0 = await bancoSemUso(page);
    await pôrSelo(page);
    const setores = await page.evaluate(() => VARIACOES_V73.setoresVisiveis().filter((s) => s !== 'dp'));
    ok(setores.length >= 8, `setores com Variações: ${setores.join(', ')}`);

    /* 1. todos os setores: números iguais aos das funções, cores, textos, celular sem passar da tela */
    for (const id of setores) {
      await ir(page, '#/setor-variacoes/' + id); await mesDaAba(page, MES);
      const r = await conferirSetor(page, id);
      ok(r.prob && r.prob.length === 0, `${id}: ${r.n} números iguais aos calculados (cartões, resumo ${r.nB} melhoraram/${r.nR} pioraram, destaques, mês × mês anterior, tabela)${r.prob && r.prob.length ? '\n      ' + r.prob.slice(0, 4).join('\n      ') : ''}${r.erro || ''}`);
      if (id === 'vendas') ok(r.ultimo === 'vvd:Mês a mês', `Vendas: a seção por vendedor (V152) continua no fim, logo depois da tabela "Mês a mês" (${r.ultimo})`);
      else ok(r.ultimo === 'Mês a mês', `${id}: a tabela "Mês a mês" fecha a tela`);
      if (vp.mobile) {
        const L = await page.evaluate(() => { const w = document.querySelector('.vr-tabw'); const t = document.querySelector('.vr-tab');
          return { iw: innerWidth, sw: document.documentElement.scrollWidth, rola: w.scrollWidth > w.clientWidth, thead: getComputedStyle(t.tHead).display, fixa: getComputedStyle(t.tBodies[0].rows[0].cells[0]).position }; });
        ok(L.iw === 390 && L.sw <= 391 && L.thead === 'table-header-group' && L.fixa === 'sticky', `${id} no celular: nada passa da largura (${L.sw} px), tabela contínua com o mês fixo${L.rola ? ' e rolando por dentro' : ''}`);
      }
    }

    /* 2. Perdas subindo = vermelho (subir é ruim) */
    await ir(page, '#/setor-variacoes/producao');
    const mp = await page.evaluate(() => { const V = VARIACOES_V73; const I = V.SETS.producao.ind.find((x) => x.k === 'perdas');
      for (let m = '2026-11'; m >= '2026-02'; m = mesMenos(m, 1)) { const c = V.comparar(I, V.val('producao', I, m).v, V.val('producao', I, mesMenos(m, 1)).v); if (c.dir === 'sobe' && !c.doZero) return m; } return ''; });
    ok(!!mp, `há um mês em que as perdas subiram (${mp})`);
    if (mp) {
      await mesDaAba(page, mp);
      const p = await page.evaluate(() => { const c = document.querySelector('.vr-card[data-vrind="perdas"]'); const pl = c.querySelector('.vr-k-var .vr-pill'); const ref = (v) => { const d = document.createElement('span'); d.style.color = 'var(' + v + ')'; c.appendChild(d); const x = getComputedStyle(d).color; d.remove(); return x; };
        return { card: c.className, pill: pl.className, seta: pl.textContent.trim().slice(0, 1), cor: getComputedStyle(pl).color, pe: ref('--pe'), linha: document.querySelector('.vr-comp .vr-cr:nth-child(5)').className }; });
      ok(/st-ruim/.test(p.card) && /\bruim\b/.test(p.pill) && p.seta === '▲' && p.cor === p.pe && /st-ruim/.test(p.linha), `perdas subindo: seta para cima em vermelho (${p.cor}), no cartão e na comparação`);
    }

    /* 3. seletor do mês, cartão e linha da tabela */
    await mesDaAba(page, MES);
    const ops = await page.evaluate(() => [...document.querySelectorAll('[data-vrin] option')].map((o) => o.value));
    ok(ops.includes('2026-09') && ops.includes(MES) && ops[0] === (await page.evaluate(() => mesAtual())), `lista de meses (do atual para trás, ${ops.length} meses)`);
    await page.selectOption('[data-vrin]', '2026-09'); await page.waitForTimeout(400);
    let e = await page.evaluate(() => ({ mes: VARIACOES_V73.VR.mes, p: document.querySelector('#svCorpo .sec-cab p').textContent, sel: document.querySelector('[data-vrin]').value }));
    ok(e.mes === '2026-09' && /setembro de 2026/.test(e.p) && e.sel === '2026-09', 'escolher o mês na lista muda a tela toda');
    await page.click('[data-vrnav="1"]'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => VARIACOES_V73.VR.mes) === '2026-10', 'seta para a frente vai ao mês seguinte');
    await page.click('[data-vrnav="-1"]'); await page.waitForTimeout(400);
    ok(await page.evaluate(() => VARIACOES_V73.VR.mes) === '2026-09', 'seta para trás vai ao mês anterior');
    await page.click('[data-vrhoje]'); await page.waitForTimeout(400);
    e = await page.evaluate(() => ({ mes: VARIACOES_V73.VR.mes, at: mesAtual(), prox: document.querySelector('[data-vrnav="1"]').disabled, and: !!document.querySelector('.vr-and'), aviso: !!document.querySelector('.vr-aviso') }));
    ok(e.mes === e.at && e.prox && e.and && e.aviso, '"Mês atual": mês em andamento, seta para a frente travada e aviso de comparação parcial');
    await mesDaAba(page, MES);
    await page.evaluate(() => document.querySelector('.vr-card[data-vrind="perdas"]').click()); await page.waitForTimeout(400);
    e = await page.evaluate(() => ({ p: document.querySelector('.vr-card[data-vrind="perdas"]').getAttribute('aria-pressed'), g: document.querySelector('.vr-graf .vr-sel b').textContent, chip: document.querySelector('.vr-chips button.on').textContent }));
    ok(e.p === 'true' && e.g === 'Perdas no mês' && e.chip === 'Perdas no mês', 'tocar num cartão mostra os meses dele no gráfico');
    await page.evaluate(() => { const r = document.querySelector('.vr-tab tbody tr[data-vrmes="2026-08"]'); if (r) r.click(); }); await page.waitForTimeout(400);
    ok(await page.evaluate(() => VARIACOES_V73.VR.mes) === '2026-08', 'tocar numa linha da tabela escolhe aquele mês');
    await page.evaluate(() => { const b = document.querySelector('.vr-gr [data-vrmes="2026-07"]'); if (b) b.click(); }); await page.waitForTimeout(400);
    ok(await page.evaluate(() => VARIACOES_V73.VR.mes) === '2026-07', 'tocar numa barra do gráfico escolhe aquele mês');
    await mesDaAba(page, MES);

    /* 4. fim da tela livre do selo do Netlify e da barra de baixo */
    for (const rota of ['#/setor-variacoes/producao', '#/setor-variacoes', '#/dpvariacoes']) {
      await ir(page, rota); await mesDaAba(page, MES);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(300);
      const f = await page.evaluate(() => { const raiz = document.querySelector('.vr-raiz'); const ks = [...raiz.children].filter((x) => x.offsetParent !== null); const u = ks[ks.length - 1].getBoundingClientRect().bottom;
        let topo = innerHeight; ['#nl-badge-frame', '#c2mob'].forEach((s) => { const x = document.querySelector(s); if (!x) return; const cs = getComputedStyle(x); if (cs.display === 'none' || cs.position !== 'fixed') return; const r = x.getBoundingClientRect(); if (r.height > 0 && r.top < innerHeight) topo = Math.min(topo, r.top); });
        return { u: Math.round(u), topo: Math.round(topo) }; });
      ok(f.u <= f.topo - 4, `${rota}: o último quadro termina acima do selo e da barra de baixo (${f.u} px; selo/barra a partir de ${f.topo} px)`);
    }

    /* 5. Setor Pessoal e "Variações de todos os setores" */
    await ir(page, '#/dpvariacoes'); await mesDaAba(page, MES);
    const dp = await conferirSetor(page, 'dp');
    ok(dp.prob && dp.prob.length === 0 && await page.evaluate(() => !!document.querySelector('.vr-dp.vr-raiz .vr-hero')), `Setor Pessoal: mesmo painel, ${dp.n} números iguais aos calculados${dp.prob && dp.prob.length ? '\n      ' + dp.prob.slice(0, 3).join('\n      ') : ''}`);
    await ir(page, '#/setor-variacoes'); await mesDaAba(page, MES);
    const g = await page.evaluate(() => { const V = VARIACOES_V73; const m = V.VR.mes; let tB = 0, tR = 0, tN = 0; const L = V.setoresVisiveis(); const prob = [];
      const cards = [...document.querySelectorAll('.vr-geral .vr-set')];
      L.forEach((id, i) => { const IS = V.SETS[id].ind.filter((I) => { try { return !I.ok || I.ok(); } catch (e) { return false; } });
        const cs = IS.map((I) => V.comparar(I, V.val(id, I, m).v, V.val(id, I, mesMenos(m, 1)).v)); const b = cs.filter((c) => c.cls === 'bom').length, r = cs.filter((c) => c.cls === 'ruim').length; tB += b; tR += r; tN += cs.length - b - r;
        const ps = cards[i] ? [...cards[i].querySelectorAll('.vr-cont .vr-pill')].map((p) => parseInt(p.textContent, 10)) : [];
        if (ps[0] !== b || ps[1] !== r) prob.push(id + ': ' + ps.join('/') + ' ≠ ' + b + '/' + r); });
      const pl = (k) => +document.querySelector('.vr-geral .vr-hero .vr-pl.' + k + ' b').textContent;
      return { n: cards.length, L: L.length, prob, tot: [pl('bom'), pl('ruim'), pl('neu')], esp: [tB, tR, tN], txt: /\bnovo\b|antes era zero/i.test(document.querySelector('.vr-geral').innerText) }; });
    ok(g.n === g.L && !g.prob.length && g.tot.join() === g.esp.join() && !g.txt, `todos os setores: ${g.n} cartões e resumo geral (${g.tot.join(' / ')}) iguais ao calculado${g.prob.length ? ': ' + g.prob.join('; ') : ''}`);
    await page.screenshot({ path: join(RAIZ, `saida/variacoes-visual-todos-${vp.nome}.png`) });
    await ir(page, '#/setor-variacoes/producao'); await mesDaAba(page, MES);
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200);
    await page.screenshot({ path: join(RAIZ, `saida/variacoes-visual-producao-${vp.nome}.png`), fullPage: true });

    ok(await bancoSemUso(page) === banco0, 'só aparência: nenhum registro do banco mudou');
    const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
    ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }

  /* 6. temas (V68): no escuro o painel segue as cores do tema; com outra paleta (ex.: azul) a marca continua preta e vermelha */
  console.log('\ntemas:');
  {
    const { ctx, page, erros } = await abrirPagina({ width: 1366, height: 900 });
    await ir(page, '#/setor-variacoes/producao'); await mesDaAba(page, MES);
    const cores = async () => page.evaluate(() => { const card = document.querySelector('.vr-card'); const ref = (v) => { const d = document.createElement('span'); d.style.color = 'var(' + v + ')'; card.appendChild(d); const x = getComputedStyle(d).color; d.remove(); return x; };
      const lum = (c) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c); return m ? (0.2126 * m[1] + 0.7152 * m[2] + 0.0722 * m[3]) / 255 : -1; };
      const hero = document.querySelector('.vr-hero');
      return { fundo: getComputedStyle(card).backgroundColor, branco: ref('--branco'), tx: getComputedStyle(card.querySelector('.vr-num')).color, tinta: ref('--tinta'), lf: lum(getComputedStyle(card).backgroundColor), lt: lum(getComputedStyle(card.querySelector('.vr-num')).color),
        hero: getComputedStyle(hero).backgroundColor, faixa: getComputedStyle(hero, '::before').backgroundColor, mes: getComputedStyle(hero.querySelector('.vr-h-mes')).color, brasa: getComputedStyle(document.documentElement).getPropertyValue('--brasa').trim() }; });
    await page.evaluate(() => { JB_TEMA.aplicar({ p: '', m: 'escuro', c: null, cn: '', b: '' }); renderTela(); }); await page.waitForTimeout(700);
    let c = await cores();
    ok(c.fundo === c.branco && c.tx === c.tinta && c.lf < 0.3 && c.lt > 0.7 && c.mes === 'rgb(255, 255, 255)', `escuro: cartões no fundo escuro do tema (${c.fundo}) com texto claro (${c.tx}); resumo em branco`);
    await page.evaluate(() => { JB_TEMA.aplicar({ p: 'azul', m: 'claro', c: null, cn: '', b: '' }); renderTela(); }); await page.waitForTimeout(700);
    c = await cores();
    ok(c.brasa.toUpperCase() !== '#D3121C' && c.hero === 'rgb(20, 20, 22)' && c.faixa === 'rgb(211, 18, 28)' && c.lf > 0.9, `paleta azul (destaque ${c.brasa}): resumo preto com a faixa vermelha da Concretiza e cartões claros`);
    await page.evaluate(() => { JB_TEMA.aplicar({ p: '', m: '', c: null, cn: '', b: '' }); renderTela(); }); await page.waitForTimeout(500);
    const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
    ok(rel.length === 0, 'sem erros de JavaScript ao trocar de tema');
    await ctx.close();
  }

  /* 7. quem não tem as Variações continua sem acesso (V85) */
  console.log('\nacesso:');
  {
    const { ctx, page } = await abrirPagina({ width: 1366, height: 900 }, 'u_OUTRO_ADMIN');
    await ir(page, '#/setor-variacoes/producao');
    ok(await page.evaluate(() => !document.querySelector('.vr-hero') && /Sem acesso/.test(document.getElementById('conteudo').textContent)), 'outro administrador: sem acesso e sem o painel');
    await ctx.close();
  }
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nVariações (visual novo): tudo certo.');
process.exit(falhas ? 1 : 0);
