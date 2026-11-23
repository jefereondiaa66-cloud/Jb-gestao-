#!/usr/bin/env node
// Teste de ponta a ponta do Controle de Produção por Grade (V156), no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Dados fictícios.
//  - Produção ganha a aba "Controle por grade" (Painel, Lançar o dia, Lançamentos, Trabalhadores, Pagamentos,
//    Extrato, Relatórios) e o Financeiro ganha o módulo "Pagamento por grade" (cartão no painel e tela própria)
//  - cadastro do trabalhador SEM valor por grade; o valor é digitado em cada lançamento e fica gravado nele
//    (lançar outro valor depois não muda os anteriores; corrigir um lançamento não mexe nos outros)
//  - lançamento do dia em lote (Enforna e Desenforna), com aviso de lançamento repetido e de troca de setor
//  - pagamento parcial e total, aviso de pagamento repetido, pagamento acima do saldo só com confirmação e motivo,
//    estorno e cancelamento sem apagar (com motivo e histórico), recibo com os lançamentos quitados (os mais antigos primeiro)
//  - painel separado por Enforna e Desenforna; extrato com filtros; relatórios; pagamento pelo Financeiro
//  - nada é gravado fora das coleções do controle (não mistura com custos, despesas nem com a produção)
//  - os dados voltam iguais ao abrir de novo (armazenamento no banco central); celular sem rolagem para o lado
// Uso: node scripts/construir.mjs && node scripts/testar-controle-grade.mjs
// FOTOS=<pasta> guarda capturas das telas (computador e celular).
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

/* dados que já existiam: um lançamento de produção, um compromisso do Financeiro e uma despesa (não podem mudar) */
const docsIniciais = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', cnpj: '11.222.333/0001-81', cidade: 'Cidade Exemplo/MA' } }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['producaoSetor', 'ps_1', { id: 'ps_1', data: '2026-11-02', tipo: 'Produção do dia', quantidade: 12000, obs: 'lançamento antigo de produção' }],
  ['despesas', 'd_1', { id: 'd_1', data: '2026-11-03', descricao: 'Despesa antiga', valor: 150 }],
];

const http = createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
/* o programa escreve "R$ 1,00" com espaço que não quebra; nas conferências vale o espaço comum */
const limpa = (o) => (typeof o === 'string' ? o.replace(/\u00a0/g, ' ') : Array.isArray(o) ? o.map(limpa) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, limpa(v)])) : o);

/* abre o programa com estes documentos no banco central simulado */
async function abrir(docs, mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } });
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
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      ultimaJanela: () => { const vs = [...document.querySelectorAll('.veu')]; return vs[vs.length - 1] || null; },
      textoJanela: () => { const v = T.ultimaJanela(); return v ? v.textContent.replace(/\s+/g, ' ') : ''; },
      clicarJanela: async (sel) => { await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector(sel)); T.ultimaJanela().querySelector(sel).click(); await T.dorme(200); },
      digitar: (el, v) => { if (typeof el === 'string') el = (T.ultimaJanela() && T.ultimaJanela().querySelector(el)) || document.querySelector(el); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      salvarGaveta: async () => {
        await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(300);
        if (document.querySelector('.veu .modal [data-r="1"]')) { document.querySelector('.veu .modal [data-r="1"]').click(); await T.dorme(300); }
        const er = [...document.querySelectorAll('#camada .cmp.erro')].map((w) => (w.querySelector('label') || {}).textContent + ': ' + (w.querySelector('.msg') || {}).textContent);
        if (er.length) throw new Error('formulário não salvou: ' + er.join(' | '));
        await T.esperar(() => !document.querySelector('#camada [data-acao="salvar"]'));
      },
      abrirNovo: async (mod, dados) => { PREFILL = { mod, dados }; JBNAV.ir('#/' + mod + '/novo'); await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      abrirRegistro: async (mod, id, acao) => { JBNAV.ir('#/' + mod + '/' + id); await T.esperar(() => document.querySelector('#camada ' + (acao ? '[data-acao="' + acao + '"]' : '[data-acao]'))); await T.dorme(200); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(250); },
      foraDoControle: () => JSON.stringify([...window.__srv.estado.docs.values()].filter((d) => !['prodGrade', 'prodGradeTrab', 'sensivel', 'log', 'ws', 'diagnostico'].includes(d.colecao)).map((d) => [d.colecao, d.id, d.dados]).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]))),
      trab: (nome) => DATA.pgTrab.find((t) => t.nome === nome),
      lancs: (tid) => DATA.pgLanc.filter((l) => l.trabId === tid).sort((a, b) => a.data.localeCompare(b.data) || String(a.criadoEm).localeCompare(String(b.criadoEm))),
      saldo: (tid) => JB_GRADE.contaDe(tid).saldo,
      semRolagemLateral: () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
  return { ctx, page, erros };
}

try {
  const { ctx, page, erros } = await abrir(docsIniciais, false);
  const foto = async (nome) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, nome + '.png') }); };
  const avaliar = async (fn, arg) => limpa(await page.evaluate(fn, arg));
  const ir = async (rota, sel) => { await page.evaluate((r) => JBNAV.ir(r), rota); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(400); };
  const antes = await avaliar(() => T.foraDoControle());

  console.log('Telas e menu');
  await ir('#/pgrade', '.pg-passos');
  ok(await avaliar(() => document.querySelector('#conteudo h1').textContent.includes('Controle por grade')), 'a tela do controle abre pela Produção, com os 3 passos para começar');
  ok(await avaliar(() => (window.PROD_ABAS_EXTRA || []).some((a) => a.r === '#/pgrade' && a.sub.length === 7)), 'a Produção tem a aba "Controle por grade" com Painel, Lançar o dia, Lançamentos, Trabalhadores, Pagamentos, Extrato e Relatórios');
  ok(await avaliar(() => (window.FIN_ABAS_EXTRA || []).some((a) => a.r === '#/fGrade')), 'o Financeiro tem o módulo "Pagamento por grade"');
  ok(await avaliar(() => !MODS.pgTrab.fields.some((f) => /valor|pre[cç]o/i.test(f.k + ' ' + (f.l || '')))), 'o cadastro do trabalhador não tem valor por grade (nem tabela de preços)');
  await foto('01-painel-vazio');

  console.log('Cadastro do trabalhador');
  const cad = await avaliar(async () => {
    await T.abrirNovo('pgTrab', { nome: 'Trabalhador Teste A', setor: 'Enforna' }); await T.salvarGaveta(); await T.sincronizado();
    const a = T.trab('Trabalhador Teste A');
    let curto = false; try { await T.abrirNovo('pgTrab', { nome: 'Ab', setor: 'Enforna' }); await T.salvarGaveta(); } catch (e) { curto = /não salvou/.test(e.message); }
    fecharRota(true); await T.dorme(300);
    const dup = (MODS.pgTrab.validar({ ...MODS.pgTrab.padrao(), nome: 'trabalhador teste a', setor: 'Enforna' }) || {})._aviso || '';
    for (const [nome, setor] of [['Trabalhador Teste B', 'Enforna'], ['Trabalhador Teste C', 'Desenforna'], ['Trabalhador Teste D', 'Enforna e Desenforna']])
      await gravarRegistro('pgTrab', { ...MODS.pgTrab.padrao(), id: novoId(), nome, setor }, null, true);
    await T.sincronizado();
    return { a: !!a, data: a && a.dataCadastro === hoje(), sit: a && a.situacao, curto, dup, n: DATA.pgTrab.length };
  });
  ok(cad.a && cad.data && cad.sit === 'Ativo', 'cadastra pela janela do sistema: data de cadastro de hoje e situação Ativo');
  ok(cad.curto, 'nome curto demais não salva');
  ok(/mesmo nome|já|cadastrad/i.test(cad.dup), 'nome repetido (até com letra diferente) pede confirmação: ' + cad.dup.slice(0, 80));
  ok(cad.n === 4, '4 trabalhadores cadastrados (Enforna, Enforna, Desenforna e os dois setores)');

  console.log('Lançar o dia (Enforna)');
  const d = await avaliar(() => ({ d1: addDias(hoje(), -1), d2: addDias(hoje(), -2), d3: addDias(hoje(), -3), A: T.trab('Trabalhador Teste A').id, B: T.trab('Trabalhador Teste B').id, C: T.trab('Trabalhador Teste C').id, D: T.trab('Trabalhador Teste D').id }));
  await ir('#/pgDia', '.pg-lin[data-pgl]');
  const lote = await avaliar(async ({ d3, A, B, C, D }) => {
    T.digitar('#pgD', d3); await T.esperar(() => document.querySelector('#pgD').value === d3 && document.querySelector('.pg-lin[data-pgl]')); await T.dorme(200);
    const linhas = [...document.querySelectorAll('.pg-lin[data-pgl]')].map((w) => w.dataset.pgl);
    const lin = (id) => document.querySelector(`.pg-lin[data-pgl="${id}"]`);
    T.digitar(lin(A).querySelector('[data-pgc="grades"]'), '10'); T.digitar(lin(A).querySelector('[data-pgc="valor"]'), '2,50');
    T.digitar(lin(B).querySelector('[data-pgc="grades"]'), '12');
    T.digitar('#pgVT', '2,50'); document.querySelector('#pgVTok').click(); await T.dorme(300);
    const vB = lin(B).querySelector('[data-pgc="valor"]').value, vA = lin(A).querySelector('[data-pgc="valor"]').value;
    const soma = document.querySelector('#pgSoma').textContent;
    document.querySelector('#pgSalvar').click();
    await T.esperar(() => DATA.pgLanc.length === 2 && document.querySelector('.pg-ok')); await T.sincronizado();
    const la = T.lancs(A)[0], lb = T.lancs(B)[0];
    return { linhas, temC: linhas.includes(C), temD: linhas.includes(D), vB, vA, soma, la, lb, n: DATA.pgLanc.length };
  }, d);
  ok(!lote.temC && lote.temD && lote.linhas.length === 3, 'na Enforna aparecem só os trabalhadores da Enforna (e quem trabalha nos dois setores)');
  ok(lote.vB === '2,50' && lote.vA === '2,50', '"Mesmo valor para todos" preenche só as linhas vazias');
  ok(/2 trabalhadores.*22 grades.*55,00/.test(lote.soma), 'o rodapé soma antes de salvar: ' + lote.soma);
  ok(lote.la && lote.la.grades === 10 && lote.la.valorGrade === 2.5 && lote.la.setor === 'Enforna' && lote.la.data === d.d3 && lote.la.tipo === 'lanc', 'cada linha vira um lançamento com o próprio valor por grade (10 × R$ 2,50)');
  ok(lote.lb && lote.lb.valorGrade === 2.5 && lote.la.lote && lote.la.lote === lote.lb.lote, 'os lançamentos do mesmo lote ficam ligados');
  await foto('02-lancar-o-dia');

  const dup = await avaliar(async ({ A }) => {
    const lin = () => document.querySelector(`.pg-lin[data-pgl="${A}"]`);
    T.digitar(lin().querySelector('[data-pgc="grades"]'), '10'); T.digitar(lin().querySelector('[data-pgc="valor"]'), '2,50');
    await T.dorme(800); document.querySelector('#pgSalvar').click();
    await T.esperar(() => /já tem lançamento neste dia/.test(T.textoJanela()));
    const txt = T.textoJanela(); await T.clicarJanela('[data-r="0"]');
    const n = DATA.pgLanc.length, ficou = lin().querySelector('[data-pgc="grades"]').value;
    document.querySelector('[data-pgset="Desenforna"]').click();
    await T.esperar(() => /Trocar de setor/.test(T.textoJanela())); await T.clicarJanela('[data-r="0"]'); await T.dorme(200);
    const naoTrocou = document.querySelector('[data-pgset="Enforna"]').getAttribute('aria-pressed') === 'true' && lin() && lin().querySelector('[data-pgc="grades"]').value === '10';
    document.querySelector('[data-pgset="Desenforna"]').click();
    await T.esperar(() => /Trocar de setor/.test(T.textoJanela())); await T.clicarJanela('[data-r="1"]');
    await T.esperar(() => document.querySelector('[data-pgset="Desenforna"]').getAttribute('aria-pressed') === 'true');
    return { txt, n, ficou, naoTrocou };
  }, d);
  ok(dup.n === 2 && dup.ficou === '10', 'lançamento repetido (mesmo trabalhador, dia e setor) pede confirmação; cancelando, nada é gravado e a linha continua digitada');
  ok(dup.naoTrocou, 'trocar de setor com linhas digitadas pergunta antes (cancelando, nada se perde)');

  console.log('Lançar o dia (Desenforna) e lançamento avulso');
  const des = await avaliar(async ({ d2, d1, A, C, D }) => {
    T.digitar('#pgD', d2); await T.esperar(() => document.querySelector('#pgD').value === d2); await T.dorme(200);
    const lin = (id) => document.querySelector(`.pg-lin[data-pgl="${id}"]`);
    T.digitar(lin(C).querySelector('[data-pgc="grades"]'), '20'); T.digitar(lin(C).querySelector('[data-pgc="valor"]'), '1,80');
    T.digitar(lin(D).querySelector('[data-pgc="grades"]'), '15'); T.digitar(lin(D).querySelector('[data-pgc="valor"]'), '1,80');
    await T.dorme(800); document.querySelector('#pgSalvar').click(); await T.esperar(() => DATA.pgLanc.length === 4); await T.sincronizado();
    /* lançamento avulso pelo painel, com outro valor */
    JBNAV.ir('#/pgrade'); await T.esperar(() => document.querySelector(`[data-pglancar="${A}"]`)); document.querySelector(`[data-pglancar="${A}"]`).click();
    await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#plG'));
    T.digitar('#plD', d1); T.digitar('#plS', 'Enforna'); T.digitar('#plG', '8'); T.digitar('#plV', '3,00'); await T.dorme(150);
    const prev = T.ultimaJanela().querySelector('#plT').textContent;
    await T.clicarJanela('[data-ok]'); await T.esperar(() => DATA.pgLanc.length === 5); await T.sincronizado();
    const la = T.lancs(A);
    return { prev, la: la.map((l) => [l.data, l.grades, l.valorGrade, JB_GRADE.tot(l)]), sA: T.saldo(A) };
  }, d);
  ok(/8 grades × R\$ 3,00 = R\$ 24,00/.test(des.prev), 'a janela mostra o total antes de salvar: ' + des.prev.slice(0, 70));
  ok(JSON.stringify(des.la) === JSON.stringify([[d.d3, 10, 2.5, 25], [d.d1, 8, 3, 24]]), 'o lançamento novo com R$ 3,00 não mudou o anterior de R$ 2,50 (cada um guarda o próprio valor)');
  ok(Math.abs(des.sA - 49) < 0.005, 'falta receber do trabalhador A: R$ 49,00');

  console.log('Correção de um lançamento');
  const cor = await avaliar(async ({ B, A }) => {
    const lb = T.lancs(B)[0]; const outrosAntes = JSON.stringify(DATA.pgLanc.filter((l) => l.id !== lb.id).map((l) => [l.id, l.valorGrade, l.grades]));
    await T.abrirRegistro('pgLanc', lb.id, 'salvar');
    T.digitar(document.querySelector('#camada [data-campo="valorGrade"] input'), '2,60'); await T.dorme(150);
    await T.salvarGaveta(); await T.sincronizado();
    const novo = DATA.pgLanc.find((l) => l.id === lb.id);
    const outrosDepois = JSON.stringify(DATA.pgLanc.filter((l) => l.id !== lb.id).map((l) => [l.id, l.valorGrade, l.grades]));
    const log = (DATA.log || []).filter((x) => x.recId === lb.id);
    return { v: novo.valorGrade, t: JB_GRADE.tot(novo), iguais: outrosAntes === outrosDepois, log: log.map((x) => x.acao), sB: T.saldo(B) };
  }, d);
  ok(cor.v === 2.6 && Math.abs(cor.t - 31.2) < 0.005, 'o valor corrigido vale só para aquele lançamento (12 × R$ 2,60 = R$ 31,20)');
  ok(cor.iguais, 'os outros lançamentos não mudaram');
  ok(cor.log.some((a) => /criou/.test(a)) && cor.log.some((a) => /alterou/.test(a)), 'o histórico guarda quem criou e quem alterou: ' + cor.log.join(', '));

  console.log('Pagamentos');
  await ir('#/pgrade', `[data-pgpagar="${d.A}"]`);
  const pg = await avaliar(async ({ A, B }) => {
    document.querySelector(`[data-pgpagar="${A}"]`).click();
    await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgV'));
    const sugerido = T.ultimaJanela().querySelector('#pgV').value;
    T.digitar('#pgV', '20,00'); await T.clicarJanela('[data-ok]');
    await T.esperar(() => DATA.pgPag.length === 1); await T.sincronizado();
    await T.esperar(() => /Pagamento registrado/.test(T.textoJanela())); await T.clicarJanela('[data-r="0"]');
    const p1 = DATA.pgPag[0];
    /* o mesmo pagamento de novo (o sistema ignora o 2º clique no mesmo botão em menos de 0,7 s) */
    await T.dorme(800); document.querySelector(`[data-pgpagar="${A}"]`).click(); await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgV'));
    T.digitar('#pgV', '20,00'); T.ultimaJanela().querySelector('[data-ok]').click();
    await T.esperar(() => /parece repetido/.test(T.textoJanela())); await T.clicarJanela('[data-r="0"]');
    await T.dorme(300); const nDup = DATA.pgPag.length; await T.clicarJanela('[data-r="0"]');
    /* acima do saldo: só com a confirmação e o motivo */
    await T.dorme(800); document.querySelector(`[data-pgpagar="${B}"]`).click(); await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgV'));
    T.digitar('#pgV', '50,00'); T.ultimaJanela().querySelector('[data-ok]').click(); await T.dorme(400);
    const pediu = !T.ultimaJanela().querySelector('#pgExc').hidden && DATA.pgPag.length === 1;
    T.ultimaJanela().querySelector('#pgExcOk').checked = true; T.digitar('#pgExcM', 'adiantamento combinado');
    await T.dorme(800); await T.clicarJanela('[data-ok]'); await T.esperar(() => DATA.pgPag.length === 2); await T.sincronizado();
    await T.esperar(() => /Pagamento registrado/.test(T.textoJanela())); await T.clicarJanela('[data-r="0"]');
    const p2 = DATA.pgPag.find((p) => p.trabId === B);
    /* o resto do A: confirma que não é repetido */
    await T.dorme(800); document.querySelector(`[data-pgpagar="${A}"]`).click(); await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgV'));
    const sugerido2 = T.ultimaJanela().querySelector('#pgV').value;
    T.ultimaJanela().querySelector('[data-ok]').click();
    await T.esperar(() => /parece repetido/.test(T.textoJanela())); await T.clicarJanela('[data-r="1"]');
    await T.esperar(() => DATA.pgPag.length === 3); await T.sincronizado();
    await T.esperar(() => /Pagamento registrado/.test(T.textoJanela())); await T.clicarJanela('[data-r="0"]');
    const p3 = DATA.pgPag.filter((p) => p.trabId === A).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))[0];
    const rec = JB_GRADE.docRecibo(p3); const tab = (rec.blocos || []).find((b) => b.tipo === 'secao' && b.tabela);
    return { sugerido, p1: { v: p1.valor, a: p1.saldoAntes, d: p1.saldoDepois, o: p1.origem, t: p1.tipo }, nDup, pediu, p2: { v: p2.valor, exc: p2.excedente }, sB: T.saldo(B), sugerido2, sA: T.saldo(A),
      recibo: { tit: rec.titulo, linhas: tab ? tab.tabela.body.length : -1, datas: tab ? tab.tabela.body.map((r) => r[0]) : [] } };
  }, d);
  ok(pg.sugerido === '49,00', 'a janela de pagamento já vem com o que falta receber (R$ 49,00)');
  ok(pg.p1.v === 20 && pg.p1.a === 49 && pg.p1.d === 29 && pg.p1.t === 'pag' && /Produção/.test(pg.p1.o), 'pagamento parcial de R$ 20,00: guarda o saldo antes (49) e depois (29) e de onde foi registrado');
  ok(pg.nDup === 1, 'pagamento repetido pede confirmação; cancelando, não grava');
  ok(pg.pediu, 'pagamento acima do saldo não grava sem a confirmação e o motivo');
  ok(pg.p2.v === 50 && pg.p2.exc && Math.abs(pg.p2.exc.valor - 18.8) < 0.005 && pg.p2.exc.motivo === 'adiantamento combinado', 'com a confirmação, grava e anota o excedente (R$ 18,80) e o motivo');
  ok(Math.abs(pg.sB + 18.8) < 0.005, 'quem recebeu a mais fica com crédito de R$ 18,80');
  ok(pg.sugerido2 === '29,00' && Math.abs(pg.sA) < 0.005, 'o segundo pagamento quita o resto (R$ 29,00) e o saldo zera');
  ok(pg.recibo.linhas === 2 && pg.recibo.datas.join() === [d.d3, d.d1].map((x) => x.split('-').reverse().join('/')).join(), 'o recibo mostra os lançamentos quitados, os mais antigos primeiro');
  await foto('03-painel');

  console.log('Estorno e cancelamento (sem apagar)');
  const est = await avaliar(async ({ B, C }) => {
    const p = DATA.pgPag.find((x) => x.trabId === B);
    await T.abrirRegistro('pgPag', p.id, 'pgEstornarPag');
    document.querySelector('#camada [data-acao="pgEstornarPag"]').click();
    await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgMot'));
    T.digitar('#pgMot', 'pagamento lançado errado'); await T.clicarJanela('[data-ok]');
    await T.esperar(() => DATA.pgPag.find((x) => x.id === p.id).estorno); await T.sincronizado();
    const pe = DATA.pgPag.find((x) => x.id === p.id);
    const lc = T.lancs(C)[0];
    await T.abrirRegistro('pgLanc', lc.id, 'pgCancelarLanc');
    document.querySelector('#camada [data-acao="pgCancelarLanc"]').click();
    await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgMot'));
    T.digitar('#pgMot', 'lançado em dobro'); await T.clicarJanela('[data-ok]');
    await T.esperar(() => DATA.pgLanc.find((x) => x.id === lc.id).cancelamento); await T.sincronizado();
    const sC0 = T.saldo(C);
    await T.abrirRegistro('pgLanc', lc.id, 'pgReativarLanc');
    document.querySelector('#camada [data-acao="pgReativarLanc"]').click();
    await T.esperar(() => /Reativar/.test(T.textoJanela())); await T.clicarJanela('[data-r="1"]');
    await T.esperar(() => !DATA.pgLanc.find((x) => x.id === lc.id).cancelamento); await T.sincronizado();
    const log = (DATA.log || []).filter((x) => x.recId === lc.id || x.recId === p.id).map((x) => x.acao);
    return { existe: !!pe, motivo: pe.estorno && pe.estorno.motivo, sB: T.saldo(B), sC0, sC1: T.saldo(C), nLanc: DATA.pgLanc.length, nPag: DATA.pgPag.length, log };
  }, d);
  ok(est.existe && est.motivo === 'pagamento lançado errado' && est.nPag === 3, 'o estorno não apaga o pagamento: fica marcado, com o motivo');
  ok(Math.abs(est.sB - 31.2) < 0.005, 'estornado, o valor volta para o saldo (R$ 31,20)');
  ok(Math.abs(est.sC0) < 0.005 && Math.abs(est.sC1 - 36) < 0.005 && est.nLanc === 5, 'cancelar um lançamento tira do saldo sem apagar; reativar devolve');
  ok(['estornou o pagamento', 'cancelou o lançamento', 'reativou o lançamento'].every((a) => est.log.includes(a)), 'estorno, cancelamento e reativação ficam no histórico');

  console.log('Painel, extrato e relatórios');
  await ir('#/pgrade', '.pg-ind');
  const pn = await avaliar(async () => {
    document.querySelector('[data-pgper="painel"] [data-pgpt="tudo"], .pg-per [data-pgpt="tudo"]').click(); await T.dorme(500);
    const t = document.querySelector('.pg-ind');
    const linha = (rot) => [...t.querySelectorAll('tbody tr')].find((r) => r.cells[0].textContent.startsWith(rot));
    const val = (rot) => [...linha(rot).cells].slice(1).map((c) => c.textContent.replace(/^(Enforna|Desenforna|Total)/, '').trim());
    return { cab: [...t.querySelectorAll('thead th')].map((x) => x.textContent.trim()), grades: val('Grades lançadas'), devido: val('Total devido'), pago: val('Total pago'), saldo: val('Saldo pendente') };
  });
  ok(pn.cab.join() === 'Indicador,Enforna,Desenforna,Total', 'o painel separa Enforna e Desenforna');
  ok(pn.grades.join() === '30,35,65' && pn.devido.join() === 'R$ 80,20,R$ 63,00,R$ 143,20', 'grades e total devido por setor: ' + pn.devido.join(' | '));
  ok(pn.pago.join() === 'R$ 49,00,R$ 0,00,R$ 49,00' && pn.saldo.join() === 'R$ 31,20,R$ 63,00,R$ 94,20', 'pago e saldo pendente por setor: ' + pn.saldo.join(' | '));

  await ir('#/pgExtrato/' + d.A, '.pg-tb');
  const ex = await avaliar(async ({ d3 }) => {
    const linhas = () => [...document.querySelectorAll('.pg-tb tbody tr[data-pgabre]')].length;
    document.querySelector('[data-pgpt="tudo"]').click(); await T.dorme(400); const tudo = linhas();
    const fim = document.querySelector('.pg-tb tr.pg-fim').textContent.replace(/\s+/g, ' ');
    document.querySelector('[data-pgpt="periodo"]').click(); await T.dorme(400);
    T.digitar(document.querySelector('[data-pgpd="de"]'), d3); await T.dorme(300); T.digitar(document.querySelector('[data-pgpd="ate"]'), d3); await T.dorme(400);
    const umDia = linhas(); const ant = document.querySelector('.pg-tb tr.pg-ini') ? document.querySelector('.pg-tb tr.pg-ini').textContent.replace(/\s+/g, ' ') : '';
    document.querySelector('[data-pgpt="dia"]').click(); await T.dorme(400); const dia = document.querySelector('.pg-per-nav b').textContent;
    document.querySelector('[data-pgpt="semana"]').click(); await T.dorme(400); const sem = document.querySelector('.pg-per-nav b').textContent;
    document.querySelector('[data-pgpt="mes"]').click(); await T.dorme(400); const mes = document.querySelector('.pg-per-nav b').textContent;
    const I = JB_GRADE.intervalo({ tipo: 'semana', ref: hoje() });
    return { tudo, fim, umDia, ant, dia, sem, mes, semOk: I.de <= hoje() && hoje() <= I.ate && new Date(I.de + 'T12:00').getDay() === 1 };
  }, d);
  ok(ex.tudo === 4 && /Saldo atual.*R\$ 0,00/.test(ex.fim), 'extrato do trabalhador A: 2 lançamentos e 2 pagamentos, saldo atual R$ 0,00');
  ok(ex.umDia === 1 && /Saldo anterior/.test(ex.ant), 'período personalizado (um dia) mostra só aquele dia, com o saldo anterior');
  ok(!!ex.dia && !!ex.sem && !!ex.mes && ex.semOk, 'filtros por dia, semana (de segunda a domingo) e mês: ' + [ex.dia, ex.sem, ex.mes].join(' · '));
  await foto('04-extrato');

  await ir('#/pgRel', '.pg-rel');
  const rel = await avaliar(async () => {
    const r = {};
    for (const b of [...document.querySelectorAll('[data-pgrel]')].map((x) => x.dataset.pgrel)) {
      document.querySelector(`[data-pgrel="${b}"]`).click(); await T.dorme(350);
      r[b] = document.querySelector('.pg-rel .pg-tb') ? document.querySelectorAll('.pg-rel .pg-tb tbody tr').length : 0;
    }
    const D = JB_GRADE.docRel({ tipo: 'tudo', ref: hoje(), de: '', ate: '', setor: '', trab: '' }, ['trab', 'setor', 'lanc', 'pag']);
    return { r, doc: !!D && (D.blocos || []).length > 0, tit: D && (D.titulo || D.tipo) };
  });
  ok(Object.keys(rel.r).length === 5 && Object.values(rel.r).every((n) => n > 0), 'relatórios por trabalhador, por setor, lançamentos, pagamentos e lista para assinatura: ' + JSON.stringify(rel.r));
  ok(rel.doc, 'o relatório completo sai no padrão de documentos da empresa (imprimir e PDF): ' + rel.tit);

  console.log('Financeiro');
  await ir('#/setor-financeiro', '.pg-fmods');
  const fin = await avaliar(() => ({ cartao: document.querySelector('.pg-fmods').textContent.replace(/\s+/g, ' '), dentro: !!document.querySelector('.cpg-mods .pg-fmods') }));
  ok(/R\$ 94,20/.test(fin.cartao) && !fin.dentro, 'o painel do Financeiro mostra o módulo "Pagamento por grade" com o que falta pagar (R$ 94,20), separado das contas');
  await ir('#/fGrade', `[data-pgfpagar="${d.D}"]`);
  const pf = await avaliar(async ({ D }) => {
    document.querySelector(`[data-pgfpagar="${D}"]`).click(); await T.esperar(() => T.ultimaJanela() && T.ultimaJanela().querySelector('#pgV'));
    T.ultimaJanela().querySelector('[data-ok]').click(); await T.dorme(300);
    if (/Sem a conta/.test(T.textoJanela())) await T.clicarJanela('[data-r="1"]');
    await T.esperar(() => DATA.pgPag.some((p) => p.trabId === D)); await T.sincronizado();
    const p = DATA.pgPag.find((x) => x.trabId === D);
    return { v: p.valor, o: p.origem, s: T.saldo(D) };
  }, d);
  ok(pf.v === 27 && /Financeiro/.test(pf.o) && Math.abs(pf.s) < 0.005, 'pagar pelo Financeiro grava o mesmo pagamento (origem: Financeiro) e zera o saldo');
  await foto('05-financeiro');

  console.log('Separação dos dados');
  const depois = await avaliar(() => T.foraDoControle());
  ok(antes === depois, 'nada foi gravado fora do controle por grade: produção, despesas e Financeiro continuam iguais');
  const docsFinal = await avaliar(() => [...window.__srv.estado.docs.values()].map((x) => [x.colecao, x.id, x.dados]));
  const cols = [...new Set(docsFinal.map((x) => x[0]))].sort();
  ok(cols.includes('prodGrade') && cols.includes('prodGradeTrab'), 'os dados ficam no banco central nas coleções novas: ' + cols.join(', '));
  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.join(' | ') : ''));
  await ctx.close();

  console.log('Abrindo de novo (computador e celular)');
  for (const mob of [false, true]) {
    const s = await abrir(docsFinal, mob);
    const r = await s.page.evaluate(async ({ A }) => {
      const L = T.lancs(A);
      const tela = {};
      for (const rota of ['#/pgrade', '#/pgDia', '#/pgLanc', '#/pgPag', '#/pgExtrato/' + A, '#/pgRel', '#/fGrade']) {
        JBNAV.ir(rota); await T.dorme(900); tela[rota] = T.semRolagemLateral();
      }
      JBNAV.ir('#/pgrade'); await T.dorme(700); JBNAV.ir('#/pgExtrato/' + A); await T.dorme(700); JBNAV.voltar(); await T.dorme(700);
      return { n: [DATA.pgTrab.length, DATA.pgLanc.length, DATA.pgPag.length], v: L.map((l) => l.valorGrade), tela, voltou: location.hash };
    }, d);
    ok(JSON.stringify(r.n) === '[4,5,4]' && r.v.join() === '2.5,3', (mob ? 'celular' : 'computador') + ': os dados voltam iguais (4 trabalhadores, 5 lançamentos, 4 pagamentos, valores por grade guardados)');
    ok(Object.values(r.tela).every(Boolean), (mob ? 'celular' : 'computador') + ': nenhuma tela rola para o lado ' + JSON.stringify(r.tela));
    ok(r.voltou === '#/pgrade', (mob ? 'celular' : 'computador') + ': o Voltar do extrato volta para o painel');
    if (FOTOS) { await s.page.evaluate(() => JBNAV.ir('#/pgrade')); await s.page.waitForTimeout(800); await s.page.screenshot({ path: join(FOTOS, '06-painel' + (mob ? '-celular' : '') + '.png'), fullPage: true }); }
    ok(s.erros.length === 0, (mob ? 'celular' : 'computador') + ': nenhum erro de JavaScript' + (s.erros.length ? ': ' + s.erros.join(' | ') : ''));
    await s.ctx.close();
  }
} catch (e) {
  console.error(e); falhas++;
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
