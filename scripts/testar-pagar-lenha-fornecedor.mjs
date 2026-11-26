#!/usr/bin/env node
// V159 (23/11/2026) · Contas a pagar do Setor da Lenha com um cartão por fornecedor. Programa REAL (saida/claude.html)
// com o banco simulado e dados fictícios (nada toca o banco de verdade): o fornecedor uma vez só com o total, igual ao
// Financeiro; tocar abre as compras dele; Voltar; pesquisa; Pagar do cartão (PAGAR / DAR BAIXA); Combustível sem mudança.
// Uso: node scripts/construir.mjs && node scripts/testar-pagar-lenha-fornecedor.mjs   (FOTOS=<pasta> guarda capturas)
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_v', { id: 'f_v', setor: 'lenha', nome: 'VASCO', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_e', { id: 'f_e', setor: 'lenha', nome: 'EDUARDO', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_p', { id: 'f_p', setor: 'lenha', nome: 'PAULO AFONSO', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', situacao: 'Ativo' }],
];
const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
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
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: extra && extra.venc || hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra && extra.r || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
    };
  });
  const ini = await page.evaluate(async () => {
    const out = [];
    out.push((await T.comprar('lenha', 'f_v', 'p_lenha', 25.73, 65, { venc: addDias(hoje(), -3) })).total);
    out.push((await T.comprar('lenha', 'f_v', 'p_lenha', 27.65, 65, { venc: addDias(hoje(), -2) })).total);
    out.push((await T.comprar('lenha', 'f_e', 'p_lenha', 28.56, 80)).total);
    out.push((await T.comprar('lenha', 'f_v', 'p_lenha', 27.53, 65)).total);
    out.push((await T.comprar('lenha', 'f_p', 'p_lenha', 20, 60, { venc: addDias(hoje(), 5) })).total);
    await T.sincronizado();
    return out;
  });
  ini.push(await page.evaluate(async () => (await T.comprar('combustivel', 'f_posto', 'p_s10', 100, 6)).total));
  ini.push(await page.evaluate(async () => (await T.comprar('combustivel', 'f_posto', 'p_s10', 50, 6)).total));
  await page.evaluate(() => T.sincronizado());
  const ir = async (h) => { await page.evaluate(async (h) => { SV = h.includes('comb') ? 'combustivel' : 'lenha'; JBNAV.ir(h.replace('comb', '')); await T.dorme(1200); }, h); };
  const foto = async (n) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, n + '.png'), fullPage: true }); };
  const cartoes = () => page.evaluate(() => [...document.querySelectorAll('#svCorpo table.fin-forn tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' ')));
  console.log('Contas a pagar da Lenha por fornecedor (V159)');
  await ir('#/pagar');
  let L = await cartoes(); await foto('01-por-fornecedor');
  ok(L.length === 3 && L.filter((t) => /VASCO/.test(t)).length === 1, `um cartão por fornecedor, VASCO uma vez só (${L.length} cartões)`);
  ok(/5\.259,15/.test(L[0]) && /3 compras em aberto/.test(L[0]) && /Vencido/.test(L[0]) && /3\.469,70/.test(L[0]), 'VASCO: 3 compras somadas (R$ 5.259,15), R$ 3.469,70 vencido, primeiro da lista');
  ok(await page.evaluate(() => { const s = CPL_LENHA.contas(); const v = s.find((x) => x.fid === 'f_v'); return v && Math.abs(v.saldo - 5259.15) < 0.01; }), 'o total do VASCO é o mesmo do Financeiro (Contas a pagar – Lenha)');
  ok(await page.evaluate(() => /Falta pagar R\$\s?8\.743,95 a 3 fornecedores/.test(document.querySelector('#svCorpo').innerText)), 'frase com o total geral');
  /* tocar no cartão abre as compras do fornecedor */
  await page.evaluate(() => [...document.querySelectorAll('#svCorpo table.fin-forn tbody tr')].find((tr) => /VASCO/.test(tr.innerText)).click()); await page.waitForTimeout(1200);
  const det = await page.evaluate(() => ({ h: location.hash, n: document.querySelectorAll('#svCorpo tr[data-go^="#/compra/"]').length, t: document.querySelector('#svCorpo h1').textContent }));
  await foto('02-compras-do-vasco');
  ok(det.h === '#/pagar/f_v' && det.n === 3 && det.t === 'VASCO', `tocando no VASCO aparecem as 3 compras dele (${det.h}, ${det.n})`);
  await page.evaluate(() => JBNAV.voltar()); await page.waitForTimeout(1000);
  ok(await page.evaluate(() => location.hash === '#/pagar' && !!document.querySelector('table.fin-forn')), 'Voltar retorna à lista por fornecedor');
  /* pesquisa */
  await page.fill('#frQ', 'eduardo'); await page.waitForTimeout(900); L = await cartoes();
  ok(L.length === 1 && /EDUARDO/.test(L[0]), 'pesquisa pelo nome deixa só o fornecedor');
  await page.fill('#frQ', ''); await page.waitForTimeout(900);
  /* Pagar no cartão: PAGAR / DAR BAIXA do Financeiro, das compras mais antigas para as mais novas */
  await page.evaluate(() => document.querySelector('[data-fpag="f_v"]').click()); await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector('.veu .modal #cpV') && /VASCO/.test(document.querySelector('.veu .modal').textContent)), 'Pagar do cartão abre o PAGAR / DAR BAIXA do VASCO');
  await page.evaluate(async () => { const v = (s, x) => { const e = document.querySelector('.veu .modal ' + s); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); };
    v('#cpV', '2.000,00'); v('#cpF', 'PIX'); const cc = document.querySelector('.veu .modal #cpC'); if (cc && !cc.closest('[hidden]')) v('#cpC', cc.options[1] ? cc.options[1].value : ''); await T.dorme(800);
    document.querySelector('.veu .modal [data-ok]').click(); await T.esperar(() => !document.querySelector('.veu .modal #cpV'), 15000); await T.sincronizado(); await T.dorme(800); });
  L = await cartoes(); await foto('03-depois-de-pagar');
  const vas = L.find((t) => /VASCO/.test(t)) || '';
  ok(/3\.259,15/.test(vas) && /327,55/.test(vas) && /2 compras em aberto/.test(vas), `depois de pagar R$ 2.000: a compra mais antiga quitada sai da lista e o VASCO fica com R$ 3.259,15 (R$ 327,55 já pagos na seguinte): ${vas}`);
  /* Combustível continua com uma linha por compra */
  await ir('comb#/setor-combustivel'); await ir('comb#/pagar');
  ok(await page.evaluate(() => !document.querySelector('table.fin-forn') && document.querySelectorAll('#svCorpo tr[data-go^="#/compra/"]').length === 2), 'Combustível: Contas a pagar sem mudança (uma linha por compra)');
  /* Exportar por fornecedor */
  const ex = await page.evaluate(async () => { SV = 'lenha'; JBNAV.ir('#/setor-lenha'); await T.dorme(1200); JBNAV.ir('#/pagar'); await T.dorme(1200); let D = null; const v0 = window.verDoc; window.verDoc = (d) => { D = d; }; try { document.querySelector('#frExp').click(); await T.esperar(() => [...document.querySelectorAll('.dc-pop [data-i], .menu-mais button, [role=menu] button')].some((b) => /Visualizar/.test(b.textContent))); [...document.querySelectorAll('.dc-pop [data-i], .menu-mais button, [role=menu] button')].find((b) => /Visualizar/.test(b.textContent)).click(); await T.dorme(300); } finally { window.verDoc = v0; }
    return D ? JSON.stringify(D.blocos.map((b) => b.head || b.titulo || '')) + ' | ' + JSON.stringify((D.blocos.find((b) => b.tipo === 'tabela') || {}).body) : ''; });
  ok(/Falta pagar/.test(ex) && /Compras de cada fornecedor/.test(ex) && (ex.match(/VASCO/g) || []).length >= 1, 'Exportar: um fornecedor por linha e, embaixo, as compras de cada um');
  ok(!erros.length, 'sem erro na página' + (erros.length ? ': ' + erros.join(' | ') : ''));
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
