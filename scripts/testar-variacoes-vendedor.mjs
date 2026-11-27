#!/usr/bin/env node
// Teste da V152 · Variação de vendas por vendedor (aba Variações do Setor de Vendas), no programa REAL
// (saida/claude.html) num Chromium, com o banco central simulado (scripts/lib/servidor-falso.mjs).
// Nada sai para a internet e só se usam dados fictícios. Confere, no computador e no celular:
//   - a seção aparece só na aba Variações de Vendas, no fim (depois da tabela "Mês a mês");
//   - os números (R$, milheiros, preço médio, participação, quantidade de vendas e TOTAL GERAL) e as regras:
//     zero, "sem venda no mês anterior" (V181; antes "novo") e "—" sem dividir por zero, unidade ÷ 1.000, frete fora do preço médio, venda cancelada
//     e pedido não faturado fora, a mesma pessoa com duas contas (ou com nome trocado) = um vendedor só;
//   - período: o mês da aba e o anterior de mesma duração (mês em andamento: os mesmos dias);
//   - filtros (vendedor e ordem), setas do mês (mudam o mês da aba toda), gráficos, celular,
//     sem erro de JavaScript e sem gravar nada no banco;
//   - as outras variações e o Setor de Vendas ficam IGUAIS: as mesmas telas, abertas na versão sem a
//     V152 (o mesmo programa sem o bloco novo), saem iguais letra por letra.
// Uso: node scripts/construir.mjs && node scripts/testar-variacoes-vendedor.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

/* ---------- a mesma página sem o bloco V152 (para provar que o resto não mudou) ---------- */
const app = readFileSync(join(RAIZ, 'app/jb-gestao.html'), 'utf8');
const iniBloco = app.indexOf('<style id="variacoes-vendedor-v152-css">');
const fimBloco = app.indexOf('</script>\n', app.indexOf('<script id="variacoes-vendedor-v152">')) + '</script>\n'.length;
if (iniBloco < 0 || fimBloco < iniBloco) { console.log('✘ bloco variacoes-vendedor-v152 não encontrado em app/jb-gestao.html'); process.exit(1); }
const BLOCO = app.slice(iniBloco, fimBloco);
const claude = readFileSync(join(RAIZ, 'saida/claude.html'), 'utf8');
if (claude.split(BLOCO).length !== 2) { console.log('✘ saida/claude.html não tem o bloco V152 (rode node scripts/construir.mjs)'); process.exit(1); }
const SEM_V152 = claude.replace(BLOCO, '');

const http = createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  if (u === '/sem-v152.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(SEM_V152); return; }
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

/* ---------- dados fictícios ---------- */
// As Variações são exclusivas de dois códigos de usuário (V85); o teste entra com um deles.
const DONO = 'u_FZmOBZqQYLD0VE7xkGL8AA';
const nomeP = { p1: 'Tijolo 6 furos de primeira (teste)', p2: 'Tijolo 6 furos de segunda (teste)', p3: 'Tijolo avulso (teste)', p4: 'Palete (teste)' };
const it = (p, qtd, preco, unidade = 'milheiro') => ({ produtoId: p, nome: nomeP[p], qtd, unidade, preco, total: Math.round(qtd * preco * 100) / 100 });
const venda = (id, numero, data, vendedor, vendedorNome, itens, extra = {}) => {
  const subtotal = itens.reduce((a, i) => a + i.total, 0);
  return ['vendas', id, { id, numero, setor: 'vendas', data, hora: '09:00', clienteId: 'c1', itens, subtotal, total: subtotal + (extra.frete || 0), desconto: 0, frete: extra.frete || 0, outros: 0,
    status: extra.status || 'Concluída', forma: 'PIX', condicao: 'À vista', pagamentos: [], vendedor, vendedorNome, criadoPor: DONO, responsavel: DONO, responsavelNome: 'Dono Teste',
    criadoEm: data + 'T12:00:00.000Z', ...(extra.fluxo ? { fluxo: extra.fluxo } : {}) }];
};
const DOCS = [
  ['acesso', 'u_VA', { id: 'u_VA', nome: 'Vendedor A Teste', papel: 'vendedor', ativo: true }],
  ['acesso', 'u_VB', { id: 'u_VB', nome: 'Vendedor B Teste', papel: 'vendedor', ativo: true }],
  ['acesso', 'u_VB2', { id: 'u_VB2', nome: 'Vendedor B Teste', papel: 'vendedor', ativo: true }],   // a mesma pessoa, segunda conta
  ['acesso', 'u_VD', { id: 'u_VD', nome: 'Vendedor D Teste', papel: 'vendedor', ativo: true }],     // nunca vendeu
  ['produtos', 'p1', { id: 'p1', setor: 'vendas', nome: nomeP.p1, unidade: 'milheiro', precoVenda: 800, situacao: 'Ativo', controlaEstoque: 'Não' }],
  ['produtos', 'p2', { id: 'p2', setor: 'vendas', nome: nomeP.p2, unidade: 'milheiro', precoVenda: 600, situacao: 'Ativo', controlaEstoque: 'Não' }],
  ['clientes', 'c1', { id: 'c1', codigo: 'C0001', tipoPessoa: 'Jurídica', razao: 'Construtora Exemplo Teste', situacao: 'Ativo' }],
  venda('v1', 1, '2026-09-10', 'u_VA', 'Vendedor A Teste', [it('p1', 10, 780)]),
  venda('v2', 2, '2026-10-05', 'u_VA', 'Vendedor A (nome antigo)', [it('p1', 12, 800)]),         // nome antigo na venda: vale o do cadastro
  venda('v3', 3, '2026-10-12', 'u_VB', 'Vendedor B Teste', [it('p1', 5, 800), it('p2', 3, 600)]),
  venda('v4', 4, '2026-10-20', 'vendedor-externo', 'Vendedor Externo Teste', [it('p1', 8, 790)]), // vendedor sem conta
  venda('v10', 10, '2026-10-25', 'u_VA', 'Vendedor A Teste', [it('p1', 1, 800)]),                 // fora dos dias 1 a 21
  venda('v5', 5, '2026-11-03', 'u_VA', 'Vendedor A Teste', [it('p1', 6, 800)]),
  venda('v6', 6, '2026-11-08', 'u_VB2', 'Vendedor B Teste', [it('p1', 10, 820)], { frete: 300 }),  // frete: faturamento sim, preço médio não
  venda('v7', 7, '2026-11-15', 'u_VB', 'Vendedor B Teste', [it('p3', 2500, 0.8, 'unidade')]),     // 2.500 unidades = 2,5 milheiros
  venda('v8', 8, '2026-11-18', 'u_VC', 'Vendedor C Teste', [it('p2', 4, 600)]),                   // conta sem cadastro: nome da venda
  venda('v9', 9, '2026-11-19', 'u_VA', 'Vendedor A Teste', [it('p1', 3, 800)], { status: 'Cancelada' }),
  venda('v11', 11, '2026-11-20', 'u_VA', 'Vendedor A Teste', [it('p1', 1, 800), it('p4', 2, 50, 'palete')]),
  venda('v12', 12, '2026-11-10', 'u_VC', 'Vendedor C Teste', [it('p2', 5, 600)], { fluxo: 'pedido', status: 'Aguardando carregamento' }), // pedido sem faturar
];
const iniciar = ({ codigo, docs, dono }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: [dono] });
  srv.estado.gravarDireto('acesso', dono, { id: dono, nome: 'Dono Teste', papel: 'admin', ativo: true });
  const grupos = {};   // vendas ficam em documentos agrupados por mês, como no banco de verdade
  docs.forEach(([c, i, d]) => { if (c !== 'vendas') { srv.estado.gravarDireto(c, i, d); return; } const k = String(d.data).slice(0, 7) + '-s0'; (grupos[k] = grupos[k] || { chave: k, items: {} }).items[i] = d; });
  Object.entries(grupos).forEach(([k, g]) => srv.estado.gravarDireto('vendas', k, g));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: dono, name: 'Dono Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => dono, isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function abrirPagina(vp, url, dono = DONO) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS, dono });
  await page.goto(base + url);
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.vendas.length >= 12, null, { timeout: 40000 });
  return { ctx, page, erros };
}
const ir = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(700); };
/* escolhe o mês no alto da aba (o mesmo estado que a barra do mês usa) e redesenha a tela */
const mesDaAba = async (page, m) => { await page.evaluate((x) => { VARIACOES_V73.VR.mes = x; renderTela(); }, m); await page.waitForTimeout(400); };
const lerSecao = (page) => page.evaluate(() => {
  const s = document.querySelector('#svCorpo > section.vvd'); if (!s) return null;
  const t = (el) => (el ? el.innerText.replace(/\s+/g, ' ').trim() : '');
  const g = (b) => [...b.querySelectorAll('.vvd-g-lin')].map((l) => [t(l.querySelector('.vvd-g-nome span')), ...[...l.querySelectorAll('.vvd-g-bar b')].map(t)]);
  const gs = [...s.querySelectorAll('.vvd-graf')];
  return { titulo: t(s.querySelector('h2')), sub: t(s.querySelector('.vvd-cab p')), per: t(s.querySelector('.vvd-per')), notas: [...s.querySelectorAll('.vvd-nota')].map(t),
    linhas: [...s.querySelectorAll('.vvd-tab tbody tr')].map((tr) => [...tr.cells].map(t)), total: [...s.querySelectorAll('.vvd-tab tfoot td')].map(t),
    opcoes: [...s.querySelectorAll('#vvdVend option')].map((o) => o.textContent), g1: gs[0] ? g(gs[0]) : null, g2: gs[1] ? g(gs[1]) : null,
    titG: gs.map((x) => t(x.querySelector('h3'))), ultimo: document.querySelector('#svCorpo').lastElementChild === s,
    antes: t(s.previousElementSibling && s.previousElementSibling.querySelector('h3')) };
});
/* conteúdo da tela, sem a seção nova: para comparar com a versão sem a V152. Espera a tela assentar (há rótulos que
   o programa atualiza um pouco depois, como o "Desfazer (Ctrl+Z)"), e o rótulo dos botões Desfazer/Refazer fica de
   fora: ele muda conforme o momento em que a atualização acontece, não conforme o conteúdo */
const fotoTela = (page) => page.evaluate(() => { const c = document.getElementById('conteudo').cloneNode(true); c.querySelectorAll('section.vvd').forEach((x) => x.remove());
  c.querySelectorAll('.jbh button[data-jbh]').forEach((b) => { b.removeAttribute('aria-label'); b.removeAttribute('title'); b.removeAttribute('data-tip2'); }); return c.innerHTML; });
async function conteudoSemSecao(page) { let a = await fotoTela(page); for (let i = 0; i < 12; i++) { await page.waitForTimeout(250); const b = await fotoTela(page); if (b === a) return b; a = b; } return a; }
const bancoSemUso = (page) => page.evaluate(() => JSON.stringify([...window.__srv.estado.docs.entries()].filter(([k]) => !/^(log|uso|diagnostico|ws)\//.test(k)).map(([k, v]) => [k, v.versao])));

const OUT = ['Vendedor A Teste', 'R$ 10.400,00', 'R$ 7.800,00', '+R$ 2.600,00 ▲ 33,3%', '13,00 mil', '10,00 mil', '+3,00 mil ▲ 30,0%', 'R$ 800,00', 'R$ 780,00', '+R$ 20,00 ▲ 2,6%', '46,2%', '44,8%', '2'];
const OUT_EXT = ['Vendedor Externo Teste', 'R$ 6.320,00', 'R$ 0,00', '+R$ 6.320,00 ▲ sem venda no mês anterior', '8,00 mil', '0,00 mil', '+8,00 mil ▲ sem venda no mês anterior', 'R$ 790,00', '—', '—', '28,1%', '27,6%', '1'];
const OUT_B = ['Vendedor B Teste', 'R$ 5.800,00', 'R$ 0,00', '+R$ 5.800,00 ▲ sem venda no mês anterior', '8,00 mil', '0,00 mil', '+8,00 mil ▲ sem venda no mês anterior', 'R$ 725,00', '—', '—', '25,8%', '27,6%', '1'];
const OUT_TOTAL = ['TOTAL GERAL', 'R$ 22.520,00', 'R$ 7.800,00', '+R$ 14.720,00 ▲ 188,7%', '29,00 mil', '10,00 mil', '+19,00 mil ▲ 190,0%', 'R$ 776,55', 'R$ 780,00', '−R$ 3,45 ▼ 0,4%', '100,0%', '100,0%', '4'];
const sp = (x) => String(x).replace(/\s+/g, ' ');   // o R$ do sistema vem com espaço fixo

try {
  /* =============== 1. as outras telas não mudaram: com e sem a V152, o mesmo resultado =============== */
  console.log('\nsem mudança no que já existia (versão com a V152 × versão sem ela):');
  {
    const vp = { width: 1366, height: 900 };
    const A = await abrirPagina(vp, '/saida/claude.html'), B = await abrirPagina(vp, '/sem-v152.html');
    ok(await B.page.evaluate(() => typeof window.JB_VAR_VENDEDOR === 'undefined') && await A.page.evaluate(() => !!window.JB_VAR_VENDEDOR), 'as duas versões abriram (uma com, outra sem o bloco novo)');
    const rotas = [['#/setor-variacoes/vendas', null], ['#/setor-variacoes/vendas', '2026-10'], ['#/setor-variacoes/vendas', '2026-11'], ['#/setor-variacoes', null], ['#/setor-variacoes/lenha', null],
      ['#/setor-variacoes/producao', null], ['#/setor-variacoes/financeiro', null], ['#/dpvariacoes', null], ['#/setor-vendas', null], ['#/vendas', null], ['#/venda/nova', null], ['#/relvendas', null],
      ['#/painelvendas', null], ['#/clientes', null], ['#/setores', null]];
    const dif = [];
    for (const [h, mes] of rotas) {
      for (const P of [A, B]) { await ir(P.page, h); if (mes) await mesDaAba(P.page, mes); }
      const [ha, hb] = [await conteudoSemSecao(A.page), await conteudoSemSecao(B.page)];
      if (ha !== hb) { let i = 0; while (i < ha.length && ha[i] === hb[i]) i++; dif.push(h + (mes ? ' (' + mes + ')' : '') + ': ...' + ha.slice(Math.max(0, i - 60), i + 80) + ' ≠ ' + hb.slice(Math.max(0, i - 60), i + 80)); }
    }
    ok(dif.length === 0, `${rotas.length} telas iguais nas duas versões: variações (Vendas, todos os setores, Lenha, Produção, Financeiro, Setor Pessoal) e Setor de Vendas (início, lista, nova venda, relatórios, painel, clientes)${dif.length ? '\n      ' + dif.slice(0, 3).join('\n      ') : ''}`);
    // mexer no próprio painel das variações (cartão, barra do gráfico, linha da tabela, mês): o V73 continua igual
    const acoes = ['[data-vrind="mil"]', '.vr-gr [data-vrmes]', '.vr-tab tbody tr[data-vrmes]:last-child', '[data-vrnav="-1"]', '[data-vrnav="1"]'];
    for (const P of [A, B]) { await ir(P.page, '#/setor-variacoes/vendas'); await mesDaAba(P.page, '2026-10'); }
    const dif2 = [];
    for (const sel of acoes) {
      for (const P of [A, B]) { await P.page.evaluate((s) => { const e = document.querySelector('#svCorpo ' + s); if (e) e.click(); }, sel); await P.page.waitForTimeout(250); }
      if (await conteudoSemSecao(A.page) !== await conteudoSemSecao(B.page)) dif2.push(sel);
      ok(!!(await lerSecao(A.page)), `a seção continua na tela depois de clicar em ${sel} no painel das variações`);
    }
    ok(dif2.length === 0, `clicar no painel das variações (cartão, gráfico, tabela, mês) dá o mesmo painel nas duas versões${dif2.length ? ': ' + dif2.join(', ') : ''}`);
    ok(await A.page.evaluate(() => !document.querySelector('#svCorpo section.vvd') || location.hash === '#/setor-variacoes/vendas'), 'seção só na aba de Vendas');
    for (const P of [A, B]) {
      const rel = P.erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
      ok(rel.length === 0, `sem erros de JavaScript (${P === A ? 'com' : 'sem'} a V152)${rel.length ? ': ' + rel.slice(0, 3).join(' | ') : ''}`);
    }
    await A.ctx.close(); await B.ctx.close();
  }

  /* =============== 2. a seção, no computador e no celular =============== */
  for (const vp of [{ width: 1366, height: 900, nome: 'computador' }, { width: 390, height: 844, nome: 'celular' }]) {
    console.log(`\n${vp.nome}:`);
    const { ctx, page, erros } = await abrirPagina(vp, '/saida/claude.html');
    const banco0 = await bancoSemUso(page);

    // lugar da seção
    await ir(page, '#/setor-vendas');
    ok(!(await lerSecao(page)), 'não aparece no início do Setor de Vendas');
    await ir(page, '#/setor-variacoes/lenha');
    ok(await page.evaluate(() => !document.querySelector('section.vvd')), 'não aparece nas variações de outro setor (Lenha)');
    await ir(page, '#/setor-variacoes/vendas');
    await mesDaAba(page, '2026-10');
    let S = await lerSecao(page);
    ok(!!S && S.titulo === 'Variação de vendas por vendedor', `seção "Variação de vendas por vendedor" na aba Variações de Vendas (${S && S.titulo})`);
    ok(S && S.ultimo && S.antes === 'Mês a mês', 'no fim da aba, logo depois da tabela "Mês a mês"');

    // mês fechado: outubro × setembro
    ok(S && /outubro de 2026/.test(S.sub) && /setembro de 2026/.test(S.sub) && sp(S.per) === 'Período: out/26 comparado com set/26 · é o mesmo mês da barra no alto da aba', `período = mês da aba × mês anterior (${S && S.per})`);
    ok(S && igual(S.linhas.map((l) => l.map(sp)), [OUT, OUT_EXT, OUT_B]), 'outubro: R$, milheiros, preço médio, participação e vendas de cada vendedor (maior faturamento primeiro)' + (S && !igual(S.linhas.map((l) => l.map(sp)), [OUT, OUT_EXT, OUT_B]) ? '\n      ' + JSON.stringify(S.linhas.map((l) => l.map(sp))) : ''));
    ok(S && igual(S.total.map(sp), OUT_TOTAL), 'TOTAL GERAL no fim da tabela' + (S && !igual(S.total.map(sp), OUT_TOTAL) ? ': ' + JSON.stringify(S.total.map(sp)) : ''));
    const cartoes = await page.evaluate(() => { const v = (k) => { const c = document.querySelector('.vr-card[data-vrind="' + k + '"]'); return c ? c.querySelector('.vr-v').textContent.replace(/\s+/g, ' ').trim() : ''; }; return { fat: v('fat'), pm: v('pm'), nv: v('nv') }; });
    ok(S && cartoes.fat === sp(S.total[1]) && cartoes.pm === sp(S.total[7]) && cartoes.nv === S.total[12] + ' vendas', `o TOTAL GERAL bate com os cartões da aba (faturamento ${cartoes.fat}, preço médio ${cartoes.pm}, ${cartoes.nv})`);
    ok(S && igual(S.opcoes, ['Vendedor: todos', 'Vendedor A Teste', 'Vendedor B Teste', 'Vendedor C Teste', 'Vendedor Externo Teste']), `filtro de vendedor: cada pessoa uma vez, com o nome do cadastro (${S && S.opcoes.join(', ')})`);
    ok(S && igual(S.titG, ['Faturamento por vendedor (R$)', 'Milheiros por vendedor']) && igual(S.g1.map((l) => l.map(sp)), [['Vendedor A Teste', 'R$ 10.400,00', 'R$ 7.800,00'], ['Vendedor Externo Teste', 'R$ 6.320,00', 'R$ 0,00'], ['Vendedor B Teste', 'R$ 5.800,00', 'R$ 0,00']]),
      'gráfico em R$: barras do atual e do anterior para cada vendedor');
    ok(S && igual(S.g2.map((l) => l.map(sp)), [['Vendedor A Teste', '13,00 mil', '10,00 mil'], ['Vendedor B Teste', '8,00 mil', '0,00 mil'], ['Vendedor Externo Teste', '8,00 mil', '0,00 mil']]), 'gráfico em milheiros: barras do atual e do anterior para cada vendedor');
    const cores = await page.evaluate(() => { const s = document.querySelector('section.vvd'); const cor = (el) => el ? getComputedStyle(el).color : ''; const ref = (v) => { const d = document.createElement('span'); d.style.color = 'var(' + v + ')'; s.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      return { pos: cor(s.querySelector('.vvd-pos')), neg: cor(s.querySelector('tfoot .vvd-neg')), ok: ref('--ok'), pe: ref('--pe'), pBom: !!s.querySelector('.vvd-tab .vr-pill.bom'), pRuim: !!s.querySelector('.vvd-tab tfoot .vr-pill.ruim') }; });
    ok(cores.pos === cores.ok && cores.neg === cores.pe && cores.pBom && cores.pRuim, 'verde para variação positiva e vermelho para negativa (cores do tema)');

    // ordem da tabela
    await page.selectOption('#vvdOrd', 'pfat'); await page.waitForTimeout(250);
    S = await lerSecao(page);
    ok(S && igual(S.linhas.map((l) => l[0]), ['Vendedor Externo Teste', 'Vendedor B Teste', 'Vendedor A Teste']) && sp(S.total[1]) === 'R$ 22.520,00', `ordenar por variação %: "sem venda no mês anterior" primeiro (${S && S.linhas.map((l) => l[0]).join(', ')})`);
    await page.selectOption('#vvdOrd', 'fat'); await page.waitForTimeout(250);

    // filtro de vendedor (e o "Limpar" do padrão de filtros)
    await page.selectOption('#vvdVend', { label: 'Vendedor B Teste' }); await page.waitForTimeout(300);
    S = await lerSecao(page);
    ok(S && S.linhas.length === 1 && igual(S.linhas[0].map(sp), OUT_B) && igual(S.total.slice(1).map(sp), OUT_B.slice(1)), 'filtro de um vendedor: só a linha dele, e o TOTAL GERAL é só dele');
    ok(S && S.notas.some((n) => /Com um vendedor escolhido/.test(n) && /22\.520,00/.test(sp(n))), 'aviso com o total da empresa quando um vendedor está escolhido');
    const lim = await page.evaluate(() => { const b = document.querySelector('section.vvd .vvd-filtros .jbf-lim'); return b ? !b.hidden : null; });
    if (lim !== null) {
      ok(lim, '"Limpar" do padrão de filtros aparece com o vendedor escolhido');
      await page.click('section.vvd .vvd-filtros .jbf-lim'); await page.waitForTimeout(400);
      S = await lerSecao(page);
      ok(S && S.linhas.length === 3, '"Limpar" volta a mostrar todos os vendedores');
    } else { await page.selectOption('#vvdVend', ''); await page.waitForTimeout(300); }

    // zero nos dois períodos: "—" e zero, sem erro
    await mesDaAba(page, '2026-09');
    await page.selectOption('#vvdVend', { label: 'Vendedor B Teste' }); await page.waitForTimeout(300);
    S = await lerSecao(page);
    ok(S && igual(S.linhas.map((l) => l.map(sp)), [['Vendedor B Teste', 'R$ 0,00', 'R$ 0,00', 'R$ 0,00 —', '0,00 mil', '0,00 mil', '0,00 mil —', '—', '—', '—', '0,0%', '0,0%', '0']]), 'vendedor sem venda nos dois períodos: zero e "—", sem erro' + (S ? ' ' + JSON.stringify(S.linhas.map((l) => l.map(sp))) : ''));
    await page.selectOption('#vvdVend', ''); await page.waitForTimeout(250);
    await mesDaAba(page, '2026-08');
    S = await lerSecao(page);
    ok(S && S.linhas.length === 1 && /Nenhuma venda faturada em agosto de 2026 nem em julho de 2026/.test(S.linhas[0][0]) && sp(S.total[1]) === 'R$ 0,00' && S.total[3] === 'R$ 0,00 —', 'mês sem vendas: aviso na tabela e TOTAL GERAL zerado');
    ok(S && /Nenhuma venda faturada nos dois períodos/.test(await page.evaluate(() => document.querySelector('section.vvd .vvd-grafs').innerText)), 'mês sem vendas: os gráficos avisam, sem erro');

    // setas do mês da seção = barra do mês da aba (o V73 e a seção mudam juntos, sem pular a rolagem)
    await mesDaAba(page, '2026-10');
    await page.evaluate(() => { const s = document.querySelector('section.vvd'); window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - 120); });
    await page.waitForTimeout(200);
    const y0 = await page.evaluate(() => Math.round(document.querySelector('section.vvd [data-vvdmes="-1"]').getBoundingClientRect().top));
    await page.click('section.vvd [data-vvdmes="-1"]'); await page.waitForTimeout(400);
    const nav = await page.evaluate(() => ({ mes: VARIACOES_V73.VR.mes, h: document.querySelector('#svCorpo .sec-cab p').textContent, y: Math.round(document.querySelector('section.vvd [data-vvdmes="-1"]').getBoundingClientRect().top),
      fundo: Math.abs(window.scrollY + innerHeight - document.documentElement.scrollHeight) <= 2, foco: document.activeElement && document.activeElement.dataset.vvdmes }));
    S = await lerSecao(page);
    ok(nav.mes === '2026-09' && /setembro de 2026/.test(nav.h) && S && /setembro de 2026/.test(S.sub) && /agosto de 2026/.test(S.sub), 'seta da seção muda o mês da aba toda (painel e seção em setembro × agosto)');
    // setembro tem menos vendedores: a página fica mais curta e, se já estava no fim, a seta só pode descer o que faltou de página
    ok((Math.abs(nav.y - y0) <= 2 || (nav.fundo && nav.y > y0)) && nav.foco === '-1', `a tela fica parada na seção e o foco fica na seta (seta a ${y0} px do alto antes, ${nav.y} px depois${nav.fundo ? ', fim da página' : ''})`);
    // outubro tem mais vendedores (a página cresce): a seta fica exatamente no mesmo lugar
    const y1 = await page.evaluate(() => Math.round(document.querySelector('section.vvd [data-vvdmes="1"]').getBoundingClientRect().top));
    await page.click('section.vvd [data-vvdmes="1"]'); await page.waitForTimeout(400);
    const y2 = await page.evaluate(() => Math.round(document.querySelector('section.vvd [data-vvdmes="1"]').getBoundingClientRect().top));
    ok(await page.evaluate(() => VARIACOES_V73.VR.mes === '2026-10') && Math.abs(y2 - y1) <= 2, `seta para a frente volta a outubro, com a seção parada no mesmo lugar (${y1} → ${y2} px)`);

    // mês em andamento: os mesmos dias do mês anterior
    await mesDaAba(page, await page.evaluate(() => mesAtual()));
    S = await lerSecao(page);
    const esp = await page.evaluate(() => { const P = JB_VAR_VENDEDOR.periodos(VARIACOES_V73.VR.mes); const ult = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
      return { a: fMes(P.A.m), b: fMes(P.B.m), dA: +P.A.fim.slice(8), ultA: ult(P.A.m), okB: P.B.ini.endsWith('-01') && +P.B.fim.slice(8) === Math.min(+P.A.fim.slice(8), ult(P.B.m)), hoje: hoje(), fimA: P.A.fim, parcial: P.parcial }; });
    const rotA = esp.a + (esp.dA === esp.ultA ? '' : ' · dias 1 a ' + esp.dA);
    ok(esp.parcial && esp.fimA === esp.hoje && esp.okB && S && sp(S.per).startsWith(`Período: ${rotA} comparado com ${esp.b}`) && /andamento/.test(S.sub), `mês em andamento, comparado com os mesmos dias do mês anterior: ${sp(S && S.per)}`);

    // regras de cálculo, direto na função da seção (datas fixas, independem do dia de hoje)
    const R = await page.evaluate(() => {
      const V = JB_VAR_VENDEDOR; const p = (m, h) => { const x = V.periodos(m, h); return [x.A.ini, x.A.fim, x.B.ini, x.B.fim, x.parcial]; };
      const c = V.calcular('2026-11', '2026-11-21', {}); const L = (x) => x.linhas.map((r) => [r.nome, r.a.fat, r.b.fat, r.a.mil, r.b.mil, r.pmA, r.pmB, r.a.n]);
      const ordem = (o) => V.calcular('2026-11', '2026-11-21', { ord: o }).linhas.map((r) => r.nome.replace('Vendedor ', '').replace(' Teste', ''));
      return { per: [p('2026-11', '2026-11-21'), p('2027-03', '2027-03-31'), p('2026-10', '2026-11-21'), p('2027-01', '2026-11-21'), p('', '2026-11-21')],
        nov: L(c), tot: [c.total.a.fat, c.total.b.fat, c.total.a.mil, c.total.b.mil, c.total.pmA, c.total.pmB, c.total.a.n, c.total.b.n], unid: c.unid, fora: c.fora,
        pct: [V.pct(150, 100), V.pct(5, 0), V.pct(0, 0), V.pct(0, 80)],
        ord: { fat: ordem('fat'), mil: ordem('mil'), pfat: ordem('pfat'), pmil: ordem('pmil') } };
    });
    ok(igual(R.per, [['2026-11-01', '2026-11-21', '2026-10-01', '2026-10-21', true], ['2027-03-01', '2027-03-31', '2027-02-01', '2027-02-28', true], ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30', false],
      ['2026-11-01', '2026-11-21', '2026-10-01', '2026-10-21', true], ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30', false]]), 'período anterior de mesma duração (mês fechado × mês inteiro; mês em andamento × os mesmos dias; fevereiro menor)');
    ok(igual(R.nov, [['Vendedor B Teste', 10500, 5800, 12.5, 8, 816, 725, 2], ['Vendedor A Teste', 5700, 9600, 7, 12, 800, 800, 2], ['Vendedor C Teste', 2400, 0, 4, 0, 600, null, 1], ['Vendedor Externo Teste', 0, 6320, 0, 8, null, 790, 0]]),
      'novembro (1 a 21) × outubro (1 a 21): duas contas da mesma pessoa somadas, 2.500 unidades = 2,5 milheiros, frete fora do preço médio, venda cancelada e pedido sem faturar fora, venda do dia 25/10 fora' + (igual(R.nov, []) ? '' : '\n      ' + JSON.stringify(R.nov)));
    ok(igual(R.tot, [18600, 21720, 23.5, 28, 774.47, 775.71, 5, 3]) && R.unid === 1 && R.fora === 1, `totais de novembro (${JSON.stringify(R.tot)}; ${R.unid} item em unidade, ${R.fora} item em palete)`);
    ok(igual(R.pct.map((x) => x === Infinity ? 'novo' : x), [50, 'novo', null, -100]), 'variação %: sem divisão por zero ("novo" e "—")');
    ok(igual(R.ord, { fat: ['B', 'A', 'C', 'Externo'], mil: ['B', 'A', 'C', 'Externo'], pfat: ['C', 'B', 'A', 'Externo'], pmil: ['C', 'B', 'A', 'Externo'] }), `ordem por faturamento, milheiros e variação % (${JSON.stringify(R.ord)})`);
    await mesDaAba(page, '2026-11');
    S = await lerSecao(page);
    ok(S && S.notas.some((n) => /convertidos em milheiros/.test(n)) && S.notas.some((n) => /palete, carrada/.test(n)), 'avisos: item em unidade convertido e item em palete fora dos milheiros');

    // lançamento novo chega na seção (a tela se redesenha sozinha quando o banco muda)
    await mesDaAba(page, '2026-10');
    await page.evaluate(() => { DATA.vendas = DATA.vendas.concat([{ id: 'v-novo', numero: 99, setor: 'vendas', data: '2026-10-15', hora: '10:00', clienteId: 'c1', itens: [{ produtoId: 'p2', nome: 'Tijolo', qtd: 2, unidade: 'milheiro', preco: 600, total: 1200 }], subtotal: 1200, total: 1200, desconto: 0, frete: 0, outros: 0, status: 'Concluída', forma: 'PIX', condicao: 'À vista', pagamentos: [], vendedor: 'u_VC', vendedorNome: 'Vendedor C Teste', criadoPor: 'u_VC' }]); renderSemPular(); });
    await page.waitForTimeout(500);
    S = await lerSecao(page);
    ok(S && S.linhas.some((l) => l[0] === 'Vendedor C Teste' && sp(l[1]) === 'R$ 1.200,00' && /sem venda no mês anterior/.test(l[3])) && sp(S.total[1]) === 'R$ 23.720,00', 'venda nova aparece na seção quando a tela se atualiza');
    await page.evaluate(() => { DATA.vendas = DATA.vendas.filter((v) => v.id !== 'v-novo'); renderSemPular(); });
    await page.waitForTimeout(400);

    // tela: computador sem rolagem dentro da tabela; celular em cartões, sem rolar para o lado
    const tela = await page.evaluate(() => { const t = document.querySelector('.vvd-tab'); const w = t.closest('.tabwrap'); const g = getComputedStyle(document.querySelector('.vvd-grafs')).gridTemplateColumns.split(' ').length;
      return { cabe: t.scrollWidth <= w.clientWidth + 1, pagina: document.documentElement.scrollWidth <= innerWidth + 1, thead: getComputedStyle(t.tHead).display, rotulos: [...t.querySelectorAll('tbody td,tfoot td')].every((td) => td.colSpan > 1 || !!td.dataset.l), cols: g }; });
    if (vp.width > 1000) ok(tela.cabe && tela.cols === 2, `computador (${vp.width} px): tabela inteira sem rolar para o lado e os dois gráficos lado a lado`);
    else ok(tela.pagina && tela.thead === 'none' && tela.rotulos && tela.cols === 1, 'celular: linhas viram cartões com o nome de cada número, gráficos um embaixo do outro e nada passa da largura da tela');
    await page.evaluate(() => { const s = document.querySelector('section.vvd'); window.scrollTo(0, window.scrollY + s.getBoundingClientRect().top - 90); });
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(RAIZ, `saida/variacoes-vendedor-${vp.nome}.png`) });

    // nada foi gravado
    ok(await bancoSemUso(page) === banco0, 'a seção só lê: nenhum registro do banco mudou');
    const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
    ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }

  /* =============== 3. quem não tem as Variações não vê a seção =============== */
  console.log('\nacesso:');
  {
    const { ctx, page } = await abrirPagina({ width: 1366, height: 900 }, '/saida/claude.html', 'u_OUTRO_ADMIN');
    await ir(page, '#/setor-variacoes/vendas');
    ok(await page.evaluate(() => !document.querySelector('section.vvd') && /Sem acesso/.test(document.getElementById('conteudo').textContent)), 'outro administrador (fora da lista das Variações): sem acesso à aba e sem a seção');
    await ctx.close();
  }
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nVariação de vendas por vendedor: tudo certo.');
process.exit(falhas ? 1 : 0);
