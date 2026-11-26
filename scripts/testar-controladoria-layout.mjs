#!/usr/bin/env node
// Teste do layout novo do Setor de Controladoria e Análise (V178), no programa REAL (saida/claude.html) num Chromium com
// o banco central simulado e dados FICTÍCIOS (três meses inventados). Nada sai para a internet. Confere:
//   1. painel no alto do setor, acima de "Atalhos favoritos" e "Módulos": os 8 indicadores pedidos (+ os 3 que já estavam),
//      cada um com o mesmo número que a Controladoria calcula (calcMes), "?" de ajuda, comparação com o mês anterior e
//      valor numa linha só; grade de 4 colunas no computador e 2 no celular
//   2. gráficos do painel com os números de calcMes: cascata da DRE, NCG × ciclo financeiro, composição de custos e despesas
//      e medidores da margem de segurança e do IMC
//   3. mês com dado faltando: "Pontos de atenção" com a mensagem de sempre e o botão que abre o lançamento no campo certo
//   4. DRE em tabela contínua (computador e celular): mesmas contas e valores de calcMes, redutoras recuadas e em vermelho,
//      subtotais e lucro líquido em destaque, variação com ▲▼; no celular a 1ª coluna fica fixa e as outras rolam de lado
//   5. nenhuma tabela do setor vira cartões no celular; Capital de giro em tabela; nada fica escondido atrás do selo do
//      Netlify nem da barra de baixo; navegar não grava nada no banco; sem erro de página
// Uso: node scripts/construir.mjs && node scripts/testar-controladoria-layout.mjs
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

/* três meses FICTÍCIOS lançados à mão (setembro e outubro completos; novembro sem as perdas após o forno e sem o caixa) */
const m9 = { produzidos: 420, perdas: 18, vendidos: 395, receita: 228450.5, salPagar: 45000, devolucoes: 2400, estIni: 30, estIniValor: 9000, lenha: 52340.75, barro: 6200,
  energia: 14120.4, combustivel: 9810, insumos: 4320, comissoes: 3210, fretes: 7640.3, arrend: 8000, mod: 38250.9, manut: 5230, deprec: 3000, cifOutros: 2105, adm: 6400,
  folhaAdm: 9210, comerciais: 1500, deprecAdm: 600, financeiras: 1930, frotaDeprec: 2500, frotaPecas: 1830, frotaOutros: 4210, entregues: 300, kmFrota: 13100, estLenha: 48200,
  caixa: 35400, empCP: 20000, das: 9820.4, outrosTrib: 0, queimas: 8, funcProd: 42, retiradas: 6000, parcelas: 9500, investimentos: 0, receber: 60000, estoques: 70000,
  imob: 850000, fornecedores: 40000, obrig: 30000, empLP: 200000, pl: 725400 };
const m10 = { ...m9, produzidos: 455, perdas: 21, vendidos: 430, receita: 246249.17, devolucoes: 1800, lenha: 56110.2, energia: 15230.15, combustivel: 10420.6, mod: 39980.4,
  manut: 7310, comissoes: 3480, fretes: 8120.75, das: 10860.3, caixa: 28700, estLenha: 51200, financeiras: 2240.1 };
delete m10.estIni; delete m10.estIniValor;
const m11 = { ...m10, produzidos: 300, vendidos: 280, receita: 171980.4, das: 7120.2, lenha: 38020.9 };
delete m11.perdas; delete m11.caixa;
const mes = (m, v) => ['ctl', 'm' + m, { id: 'm' + m, tipo: 'mes', mes: m, v, obs: '', semSetores: true, fech: '', hist: [] }];
const DOCS = [mes('2026-09', m9), mes('2026-10', m10), mes('2026-11', m11), ['config', 'aparencia', { dono: 'u_DONO' }]];

const iniciar = ({ codigo, docs, selo }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Pessoa Teste', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), set: async () => {}, onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Pessoa Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  try { localStorage.setItem('jb_ctl_mes', '2026-10'); } catch (e) {}
  /* biblioteca de gráficos de mentira: guarda a configuração de cada gráfico (o teste confere os números que vão para ele) */
  const fundo = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : (o[k] = fundo())) });
  const porTela = new Map();
  function Chart(cv, cfg) { this.canvas = cv; this.config = cfg; this.data = cfg.data; porTela.set(cv, this); (window.__graf = window.__graf || []).push({ id: cv.id, cfg }); }
  Chart.prototype.destroy = function () { porTela.delete(this.canvas); }; Chart.prototype.update = function () {}; Chart.prototype.resize = function () {};
  Chart.register = () => {}; Chart.getChart = (cv) => porTela.get(cv) || null; Chart.defaults = fundo();
  window.Chart = Chart;
  /* selo "Powered by Netlify" simulado: na nuvem ele fica fixo embaixo (acima da barra do celular) */
  if (selo) addEventListener('DOMContentLoaded', () => { const f = document.createElement('div'); f.id = 'nl-badge-frame'; f.style.cssText = selo; document.body.appendChild(f); });
};
const ROTAS = ['setor-control', 'ctlLanc', 'ctlCustos', 'ctlPerdas', 'ctlPreco', 'ctlPE', 'ctlDRE', 'ctlInd', 'ctlGiro', 'ctlImob', 'ctlDesc', 'ctlPrem', 'ctlAcesso'];
/* o que está no banco (o autodiagnóstico diário do sistema, coleção diagnostico, grava sozinho e fica de fora da conta) */
const escritas = (page) => page.evaluate(() => [...window.__srv.estado.docs.entries()].filter(([k]) => !k.startsWith('diagnostico/')).map(([k, d]) => k + ':' + d.versao).sort().join('|'));

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
async function abrir(vp, selo) {
  const ctx = await browser.newContext(vp.width < 700 ? { viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: vp });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS, selo: selo || '' });
  await page.goto(base + '/saida/claude.html#/setor-control');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && window.CONTROLADORIA, null, { timeout: 40000 });
  await page.waitForTimeout(1500);
  const ir = async (r) => { await page.evaluate((x) => JBNAV.ir('#/' + x), r); await page.waitForTimeout(900); };
  const mesTela = async (m) => { await page.evaluate((x) => { const s = document.getElementById('ctlMes'); s.value = x; s.dispatchEvent(new Event('change')); }, m); await page.waitForTimeout(900); };
  return { ctx, page, erros, ir, mesTela };
}
/* o que a Controladoria calcula para o mês (a fonte de todos os números) e o mesmo formato das telas */
const esperado = (m) => {
  const C = window.CONTROLADORIA; C.limparMemo(); const R = C.calcMes(m), P = R.prev; const I = C.IND;
  const val = (Q, id) => (id === 'receita' ? Q.v.receita : ['NCG', 'CO', 'CF', 'T', 'CDG'].includes(id) ? Q.g && Q.g[id] : ['lc'].includes(id) ? Q.b && Q.b[id] : Q[id]);
  const fmt = (id, x) => (x == null || !isFinite(x) ? '—' : id === 'receita' ? fMoeda(x) : I[id].fmt(x));
  const ids = ['receita', 'LL', 'ml', 'IMC', 'PEc', 'MS', 'NCG', 'CO', 'cpm', 'pm', 'lc'];
  const kpi = Object.fromEntries(ids.map((id) => [id, { txt: fmt(id, val(R, id)), x: val(R, id), y: P ? val(P, id) : null }]));
  const n = (x) => (x == null ? null : -x);
  const dre = (Q) => [Q.v.receita, n(+Q.v.devolucoes || 0), n(+Q.v.das || 0), n(+Q.v.outrosTrib || 0), Q.RL, n(Q.CPV), Q.LB, n(Q.DV), n(Q.DFsf), n(Q.frotaFixa), Q.RO, n(Q.fin), Q.LL, Q.EBITDA];
  return { kpi, dre: dre(R), dreAnt: P ? dre(P) : null, RL: R.RL, R: { receita: R.v.receita, RL: R.RL, CPV: R.CPV, LB: R.LB, RO: R.RO, LL: R.LL, ded: R.ded, DVDF: R.DV + R.DF, fin: R.fin, MS: R.MS, IMC: R.IMC },
    ncg: C.listaMeses().filter((x) => x <= m).slice(-12).map((x) => { const q = C.calcMes(x).g; return [q.NCG, q.CF]; }) };
};

try {
  /* =================== 1 e 2. computador: painel e gráficos =================== */
  console.log('\n1. painel no alto do setor (computador)');
  let A = await abrir({ width: 1366, height: 900 });
  const banco0 = await escritas(A.page);
  const E10 = await A.page.evaluate(esperado, '2026-10');
  const P1 = await A.page.evaluate(() => {
    const d = document.querySelector('#svCorpo > .hero.ctl-dash'); const fav = document.querySelector('#svCorpo .c2-favblk'); const mod = document.querySelector('#svCorpo .c2-acesso');
    const antes = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    const cards = [...document.querySelectorAll('.ctl-dash .ctl-dk:not(.ctl-dk2) > .kpi')].map((k) => ({ l: k.querySelector('.l a').textContent.trim(), v: k.querySelector('.v').textContent.trim(), q: !!k.querySelector('.l .ctl-q'), cmp: (k.querySelector('.ctl-dvar') || {}).className || '', cmpT: (k.querySelector('.ctl-dvar') || {}).textContent || '' }));
    const sec = [...document.querySelectorAll('.ctl-dash .ctl-dk2 > .kpi')].map((k) => ({ l: k.querySelector('.l a').textContent.trim(), v: k.querySelector('.v').textContent.trim() }));
    const vs = [...document.querySelectorAll('.ctl-dash .ctl-kpi .v')];
    const colunas = getComputedStyle(document.querySelector('.ctl-dash .ctl-dk')).gridTemplateColumns.split(' ').length;
    return { temDash: !!d, acima: antes(d, fav) && antes(d, mod), cards, sec, colunas,
      linha: vs.every((v) => getComputedStyle(v).whiteSpace === 'nowrap' && v.scrollWidth <= v.clientWidth + 1),
      mes: (document.getElementById('ctlMes') || {}).value, selo: !!document.querySelector('.ctl-barra .ctl-aberto, .ctl-mes .ctl-aberto'),
      pdf: !!document.querySelector('[data-pdf]'), atencao: document.querySelectorAll('.ctl-dash .ctl-dal-f').length };
  });
  ok(P1.temDash && P1.acima, 'painel (dashboard) no início do setor, acima de "Atalhos favoritos" e "Módulos"');
  ok(P1.mes === '2026-10' && P1.selo && P1.pdf, 'o mesmo seletor de mês de sempre, o selo "Mês em aberto" e o botão Relatório PDF');
  const ordem = ['Receita bruta', 'Lucro líquido', 'Margem líquida', 'IMC', 'Ponto de equilíbrio', 'Margem de segurança', 'NCG', 'Ciclo operacional'];
  ok(P1.cards.map((c) => c.l).join('|') === ordem.join('|'), 'os 8 indicadores pedidos, na ordem: ' + P1.cards.map((c) => c.l).join(', '));
  const ids8 = ['receita', 'LL', 'ml', 'IMC', 'PEc', 'MS', 'NCG', 'CO'];
  ok(P1.cards.every((c, i) => c.v === E10.kpi[ids8[i]].txt), 'cada cartão mostra exatamente o número que a Controladoria calcula (' + P1.cards.map((c) => c.v).join(' · ') + ')');
  ok(P1.sec.map((c) => c.l + '=' + c.v).join('|') === ['Custo por milheiro bom=' + E10.kpi.cpm.txt, 'Preço médio praticado=' + E10.kpi.pm.txt, 'Liquidez corrente=' + E10.kpi.lc.txt].join('|'), 'os indicadores que já estavam no painel continuam (custo por milheiro, preço médio e liquidez corrente)');
  ok(P1.cards.every((c) => c.q), 'todo cartão tem o "?" de ajuda');
  const sobeRec = E10.kpi.receita.x > E10.kpi.receita.y, sobePE = E10.kpi.PEc.x > E10.kpi.PEc.y;
  ok(/▲/.test(P1.cards[0].cmpT) === sobeRec && /\bbom\b/.test(P1.cards[0].cmp) === sobeRec && /vs set\/26/.test(P1.cards[0].cmpT), 'comparação com o mês anterior: ▲ e verde quando a receita sobe');
  ok(/▲/.test(P1.cards[4].cmpT) === sobePE && /\bruim\b/.test(P1.cards[4].cmp) === sobePE, 'no ponto de equilíbrio, subir é vermelho (precisa vender mais)');
  ok(P1.linha, 'nenhum número grande quebra a linha (todos numa linha só, sem cortar)');
  ok(P1.colunas === 4, 'grade de 4 colunas no computador');
  ok(P1.atencao === 0, 'mês completo: nada em "Pontos de atenção"');
  /* "?" abre a explicação de sempre; tocar no cartão abre o módulo */
  await A.page.click('.ctl-dash .ctl-dk > .kpi:nth-child(2) .ctl-q'); await A.page.waitForTimeout(500);
  ok(await A.page.evaluate(() => { const v = document.querySelector('.veu'); return !!v && /fórmula/i.test(v.innerText) && /resultado operacional/i.test(v.innerText); }), 'o "?" do lucro líquido abre a explicação de sempre (fórmula e conta)');
  await A.page.click('.veu [data-r]'); await A.page.waitForTimeout(400);
  await A.page.click('.ctl-dash .ctl-dk > .kpi:nth-child(7) .v'); await A.page.waitForTimeout(900);
  ok(await A.page.evaluate(() => location.hash === '#/ctlGiro'), 'tocar no número da NCG abre o Capital de giro');
  await A.ir('setor-control'); await A.page.waitForTimeout(600);

  console.log('\n2. gráficos do painel com os números da Controladoria');
  const G = await A.page.evaluate(() => {
    const ult = (id) => { const l = (window.__graf || []).filter((g) => g.id === id); return l[l.length - 1]; };
    const c = ult('cdCasc'), n = ult('cdNcg');
    return { casc: c && { labels: c.cfg.data.labels, data: c.cfg.data.datasets[0].data, tipo: c.cfg.type },
      ncg: n && { nds: n.cfg.data.datasets.length, a: n.cfg.data.datasets[0].data, b: n.cfg.data.datasets[1].data },
      comp: [...document.querySelectorAll('.ctl-dash .ctl-cb > li')].map((li) => [li.querySelector('.n').textContent, li.querySelector('.x').textContent]),
      gz: [...document.querySelectorAll('.ctl-dash .ctl-gz')].map((g) => ({ v: g.querySelector('.ctl-gz-v').textContent, svg: !!g.querySelector('svg path.ok') })) };
  });
  const r = E10.R;
  ok(!!G.casc && G.casc.tipo === 'bar' && JSON.stringify(G.casc.data) === JSON.stringify([[0, r.receita], [r.RL, r.receita], [r.LB, r.RL], [0, r.LB], [r.RO, r.LB], [r.LL, r.RO], [0, r.LL]]),
    'cascata da DRE: receita bruta → deduções → CPV → lucro bruto → despesas → financeiras → lucro líquido, com os valores da DRE');
  ok(!!G.ncg && G.ncg.nds === 2 && JSON.stringify(G.ncg.a) === JSON.stringify(E10.ncg.map((x) => x[0])) && JSON.stringify(G.ncg.b) === JSON.stringify(E10.ncg.map((x) => x[1])), 'NCG e ciclo financeiro mês a mês (o histórico do Capital de giro)');
  const v10 = Object.fromEntries(Object.entries(m10));
  const itens = ['lenha', 'barro', 'energia', 'combustivel', 'insumos', 'arrend', 'mod', 'manut', 'deprec', 'cifOutros', 'comissoes', 'fretes', 'adm', 'folhaAdm', 'comerciais', 'deprecAdm', 'frotaDeprec', 'frotaPecas', 'frotaOutros', 'financeiras'].filter((k) => v10[k] > 0);
  const valsComp = await A.page.evaluate((ks) => ks.map((k) => [window.CONTROLADORIA.CAMPOS.find((c) => c.k === k).l, fMoeda(window.CONTROLADORIA.calcMes('2026-10').v[k])]), itens);
  ok(G.comp.length === itens.length && valsComp.every(([l, x]) => G.comp.some(([a, b]) => a === l && b === x)), 'composição de custos e despesas: todos os itens com valor, com o mesmo valor dos lançamentos (' + G.comp.length + ' itens)');
  const gzEsp = await A.page.evaluate(() => { const C = window.CONTROLADORIA; const R = C.calcMes('2026-10'); return [C.IND.MS.fmt(R.MS), C.IND.IMC.fmt(R.IMC)]; });
  ok(G.gz.length === 2 && G.gz[0].v === gzEsp[0] && G.gz[1].v === gzEsp[1] && G.gz.every((g) => g.svg), 'medidores da margem de segurança e do IMC (' + G.gz.map((g) => g.v).join(' · ') + '), com as faixas do semáforo');
  /* relatório PDF da aba: os mesmos quadros de sempre (os gráficos da tela entram como imagem) */
  const pdf = await A.page.evaluate(async () => { let D = null; const v0 = window.verDoc; window.verDoc = (d) => { D = d; };
    document.querySelector('[data-pdf]').click(); await new Promise((r) => setTimeout(r, 300));
    const b = [...document.querySelectorAll('.dc-pop button')].find((x) => /Esta aba/.test(x.textContent)); if (b) b.click(); await new Promise((r) => setTimeout(r, 400));
    window.verDoc = v0; return D && D.blocos.filter((x) => x.tipo === 'secao').map((x) => x.titulo); });
  ok(Array.isArray(pdf) && pdf[0] === 'Indicadores principais', 'Relatório PDF da aba continua igual (seção "Indicadores principais")');

  /* =================== 3. mês com dado faltando =================== */
  console.log('\n3. mês com dado faltando: pontos de atenção');
  await A.mesTela('2026-11');
  const F = await A.page.evaluate(() => [...document.querySelectorAll('.ctl-dash .ctl-dal-f')].map((li) => ({ t: li.querySelector('b').textContent, n: li.querySelector('small').textContent, b: (li.querySelector('button') || {}).textContent })));
  const motivo = await A.page.evaluate(() => { const C = window.CONTROLADORIA; C.limparMemo(); return C.calcMes('2026-11').falta.LL; });
  ok(F.length >= 1 && F[0].t.toLowerCase() === motivo.toLowerCase() && /Lucro líquido/.test(F[0].n) && F[0].b === 'Lançar', 'a mensagem de sempre ("' + motivo + '"), os indicadores que ela afeta e o botão Lançar');
  ok(await A.page.evaluate(() => [...document.querySelectorAll('.ctl-dash .ctl-dk > .kpi')].filter((k) => k.querySelector('.v').textContent.trim() === '—').every((k) => !!k.querySelector('.ctl-mot'))), 'indicador sem valor mostra "—" com o motivo');
  await A.page.click('.ctl-dash .ctl-dal-f button'); await A.page.waitForTimeout(1200);
  ok(await A.page.evaluate(() => location.hash === '#/ctlLanc' && !!document.querySelector('#cc_perdas.ctl-foco')), '"Lançar" abre os lançamentos já no campo que falta (perdas após o forno)');
  await A.ir('setor-control'); await A.mesTela('2026-10');

  /* =================== 4. DRE no computador =================== */
  console.log('\n4. DRE em tabela contínua');
  await A.ir('ctlDRE');
  const D1 = await A.page.evaluate(() => { const t = document.querySelector('table.ctl-dre-abs');
    return { th: [...t.tHead.rows[0].cells].map((c) => c.childNodes[0].textContent.trim()),
      rows: [...t.tBodies[0].rows].map((r) => ({ cls: r.className, nome: r.cells[0].textContent.replace(/\s+/g, ' ').trim(), v: r.cells[1].textContent.trim(), av: r.cells[2].textContent.trim(), ant: r.cells[3].textContent.trim(), varT: r.cells[4].textContent.trim(), neg: !!r.cells[1].querySelector('.ctl-neg'), sobe: !!r.cells[4].querySelector('.sobe'), desce: !!r.cells[4].querySelector('.desce') })) }; });
  ok(D1.th.join('|') === 'Descrição|out/26|AV %|set/26|Variação', 'colunas: Descrição | mês atual | AV % | mês de comparação | Variação');
  const fm = (x) => (x == null || !isFinite(x) ? '—' : Math.abs(x) < 0.005 ? '—' : null);
  const textos = await A.page.evaluate((xs) => xs.map((x) => (x == null || !isFinite(x) ? '—' : fMoeda(x))), E10.dre);
  ok(D1.rows.length === 14 && D1.rows.every((r, i) => r.v === (fm(E10.dre[i]) || textos[i])), 'os 14 valores da DRE são os de calcMes (receita, deduções, CPV, lucro bruto, despesas, resultado, lucro líquido, EBITDA)');
  const red = D1.rows.filter((r) => /^\(−\)/.test(r.nome));
  ok(red.length === 8 && red.every((r) => /ctl-red/.test(r.cls)) && red.filter((r) => r.v !== '—').every((r) => r.neg), 'contas redutoras recuadas e com o valor negativo em vermelho');
  ok(['= Receita líquida', '= Lucro bruto', '= Resultado operacional'].every((n) => /ctl-sub/.test(D1.rows.find((r) => r.nome === n).cls)) && /ctl-tt/.test(D1.rows.find((r) => r.nome === '= Lucro líquido').cls), 'subtotais destacados e lucro líquido como linha final de destaque');
  ok(D1.rows.every((r, i) => { const x = E10.dre[i], y = E10.dreAnt[i]; if (x == null || y == null || Math.abs(x - y) < 0.005) return !r.sobe && !r.desce; return x > y ? r.sobe && /▲/.test(r.varT) : r.desce && /▼/.test(r.varT); }), 'variação positiva em verde com ▲ e negativa em vermelho com ▼');
  ok(await A.page.evaluate(() => !document.querySelector('.ctl .tbl.cartao') && !!document.querySelector('.ctl-dre-ger') && !!document.querySelector('.ctl-caixa') && !!document.getElementById('cdCmp') && !!document.getElementById('cdDre12')), 'visão gerencial e "do lucro ao caixa" no mesmo desenho; "Comparar com" e "DRE de 12 meses" continuam');
  const banco1 = await escritas(A.page);
  ok(A.erros.length === 0, 'computador: nenhum erro de página' + (A.erros.length ? ': ' + A.erros[0] : ''));
  await A.ctx.close();

  /* =================== 5. celular =================== */
  console.log('\n5. celular (390 px), com o selo do Netlify simulado');
  A = await abrir({ width: 390, height: 844 }, 'position:fixed;left:6px;bottom:84px;width:150px;height:40px;z-index:2147483000;background:#00AD9F');
  const bancoCel = await escritas(A.page);
  const C1 = await A.page.evaluate(() => ({ colunas: getComputedStyle(document.querySelector('.ctl-dash .ctl-dk')).gridTemplateColumns.split(' ').length,
    dg: getComputedStyle(document.querySelector('.ctl-dash .ctl-dg')).gridTemplateColumns.split(' ').length,
    linha: [...document.querySelectorAll('.ctl-dash .ctl-kpi .v')].every((v) => v.scrollWidth <= v.clientWidth + 1), pagina: document.documentElement.scrollWidth }));
  ok(C1.colunas === 2 && C1.dg === 1, 'celular: cartões em 2 colunas e gráficos em largura total');
  ok(C1.linha, 'celular: nenhum número quebra a linha (a fonte diminui para caber)');
  ok(C1.pagina <= 390, 'celular: a tela não rola de lado');
  const fundo = async () => { await A.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await A.page.waitForTimeout(500);
    return A.page.evaluate(() => { const ks = [...document.querySelectorAll('#svCorpo > *')].filter((e) => e.offsetParent !== null); const u = ks[ks.length - 1].getBoundingClientRect();
      const s = document.getElementById('nl-badge-frame').getBoundingClientRect(); const mb = document.getElementById('c2mob'); return { u: u.bottom, selo: s.top, barra: mb && mb.offsetParent !== null ? mb.getBoundingClientRect().top : Infinity }; }); };
  await A.page.waitForTimeout(2500);
  let F1 = await fundo();
  ok(F1.u <= F1.selo && F1.u <= F1.barra, `painel: o fim da tela fica acima do selo do Netlify e da barra de baixo (fim ${Math.round(F1.u)}, selo ${Math.round(F1.selo)}, barra ${Math.round(F1.barra)})`);
  await A.ir('ctlDRE'); await A.page.waitForTimeout(600);
  const D2 = await A.page.evaluate(() => { const t = document.querySelector('table.ctl-dre-abs'); const w = t.closest('.ctl-tw'); const td = t.tBodies[0].rows[1].cells[0]; const tr = t.tBodies[0].rows[1];
    return { thead: getComputedStyle(t.tHead).display, tr: getComputedStyle(tr).display, antes: getComputedStyle(td, '::before').content, fixa: getComputedStyle(td).position,
      fonte: Math.min(...[...t.querySelectorAll('tbody td')].map((c) => parseFloat(getComputedStyle(c).fontSize))), rola: w.scrollWidth > w.clientWidth,
      nowrap: [...t.querySelectorAll('tbody td.num')].every((c) => getComputedStyle(c).whiteSpace === 'nowrap'), pagina: document.documentElement.scrollWidth,
      sumiu: !!document.querySelector('.ctl .tbl.cartao') }; });
  ok(D2.thead === 'table-header-group' && D2.tr === 'table-row' && (D2.antes === 'none' || D2.antes === 'normal') && !D2.sumiu, 'DRE no celular: tabela contínua (sem cartões empilhados nem rótulo antes de cada valor)');
  ok(D2.fixa === 'sticky' && D2.rola && D2.pagina <= 390, 'a coluna Descrição fica fixa e as outras rolam de lado (a tela não rola)');
  ok(D2.fonte >= 13 && D2.nowrap, `fonte legível (mín. ${D2.fonte}px) e números sem quebrar a linha`);
  await A.ir('ctlGiro'); await A.page.waitForTimeout(600);
  const G2 = await A.page.evaluate(() => ({ tabs: [...document.querySelectorAll('.ctl table.ctl-t')].every((t) => getComputedStyle(t.tBodies[0].rows[0]).display === 'table-row'),
    n: document.querySelectorAll('.ctl table.ctl-t').length, ver: getComputedStyle(document.querySelector('.ctl-veredito')).display,
    ncg: !!document.querySelector('.ctl table.ctl-t tr.ctl-tt'), prazos: [...document.querySelectorAll('.ctl table.ctl-t')].some((t) => /PMF/.test(t.textContent) && /PMP/.test(t.textContent)) }));
  ok(G2.n >= 3 && G2.tabs && G2.prazos && G2.ncg, 'Capital de giro: prazos, cálculo da NCG e histórico mês a mês em tabela limpa');
  ok(G2.ver === 'block', 'Capital de giro: tamanho, tendência e cobertura numa lista só, sem cartões empilhados');
  let soCartao = [];
  for (const r of ROTAS) { await A.ir(r); const x = await A.page.evaluate(() => [...document.querySelectorAll('.ctl table.tbl')].filter((t) => t.tBodies[0] && t.tBodies[0].rows[0] && getComputedStyle(t.tBodies[0].rows[0]).display === 'block').length); if (x) soCartao.push(r); }
  ok(soCartao.length === 0, 'nenhuma tabela do setor vira cartões no celular (13 telas)' + (soCartao.length ? ': ' + soCartao.join(', ') : ''));
  await A.ir('ctlGiro'); await A.page.waitForTimeout(2500);
  F1 = await fundo();
  ok(F1.u <= F1.selo && F1.u <= F1.barra, 'Capital de giro: nada fica escondido atrás do selo do Netlify nem da barra de baixo');
  ok(A.erros.length === 0, 'celular: nenhum erro de página' + (A.erros.length ? ': ' + A.erros[0] : ''));
  ok((await escritas(A.page)) === bancoCel && banco1 === banco0, 'navegar, abrir explicações e gerar a prévia do PDF não gravou nada no banco');
  await A.ctx.close();
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nControladoria no layout novo: tudo certo.');
process.exit(falhas ? 1 : 0);
