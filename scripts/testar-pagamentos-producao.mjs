#!/usr/bin/env node
// Teste de ponta a ponta dos Pagamentos da Produção (V169, 25/11/2026): a Produção confere as grades, as desenfornas e
// as empreitas e envia ao Financeiro; cada conferência de cada trabalhador vira um compromisso (categoria Pagamentos da
// Produção) que já chega na fila da agenda de quem paga; agendar, pagar pelo Controle por grade (recibo), situação
// visível na Produção, lançamento conferido travado, desfazer a conferência, sem duplicar, indicadores e filtros.
// Programa REAL (saida/claude.html) e banco central simulado: os dados são fictícios e só existem na memória do teste.
// Uso: node scripts/construir.mjs && node scripts/testar-pagamentos-producao.mjs   (FOTOS=<pasta> guarda capturas)
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

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
let falhas = 0;
const ok = (c, m, det) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) { falhas++; if (det !== undefined) console.log('      detalhe: ' + JSON.stringify(det).slice(0, 1500)); } };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('popup', (p) => p.close().catch(() => {}));
  await page.addInitScript(({ codigo }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    let salvo = null; try { salvo = JSON.parse(sessionStorage.getItem('__srv_pp') || 'null'); } catch (e) {}
    (salvo || [['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
      ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', cnpj: '11.222.333/0001-81', cidade: 'Cidade Exemplo/MA' } }]]).forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
    window.open = () => null;
  }, { codigo: servidorFalso });

  const utilidades = () => page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      limpar: () => { document.querySelectorAll('.veu,.dc-pop').forEach((x) => x.remove()); if (GAV) { try { fecharGaveta(true); } catch (e) {} } },
      ir: async (rota, re, setor) => { marcarSetor(setor || 'financeiro'); T.limpar(); if (location.hash === rota) renderTela(); else location.hash = rota; await T.esperar(() => (re || /./).test((document.querySelector('#svCorpo') || {}).textContent || '')); await T.dorme(350); },
      ultimoToast: () => { const t = [...document.querySelectorAll('#toasts .toast')]; return t.length ? t[t.length - 1].textContent : ''; },
      janela: () => { const vs = [...document.querySelectorAll('.veu')]; return vs[vs.length - 1] || null; },
      textoJanela: () => { const v = T.janela(); return v ? v.textContent.replace(/\s+/g, ' ') : ''; },
      digitar: (sel, v) => { const el = (T.janela() && T.janela().querySelector(sel)) || document.querySelector(sel); if (!el) throw new Error('sem campo ' + sel); el.focus(); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      clicar: async (sel) => { await T.esperar(() => T.janela() && T.janela().querySelector(sel)); T.janela().querySelector(sel).click(); await T.dorme(250); },
      tx: (x) => (x ? x.textContent : '').replace(/\s+/g, ' ').trim(),
      cards: () => Object.fromEntries([...document.querySelectorAll('#svCorpo .cpl-cards>button')].map((b) => [T.tx(b.querySelector('.rot')), T.tx(b.querySelector('b'))])),
      trab: (nome) => DATA.prodGradeTrab.find((t) => t.nome === nome),
      prod: () => FS_O().filter((o) => o.fonte === 'producao'),
    };
    window.FS_O = () => window.FINANCEIRO_SETOR.obrigacoes();
  });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const foto = async (nome) => { if (FOTOS) { await page.waitForTimeout(400); await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); } };
  const limpa = (o) => (typeof o === 'string' ? o.replace(/ /g, ' ') : Array.isArray(o) ? o.map(limpa) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, limpa(v)])) : o);
  const av = async (f, a) => limpa(await page.evaluate(f, a));

  console.log('Pagamentos da Produção (V169)');
  /* dados fictícios: Caixa, três trabalhadores, grades da Enforna e da Desenforna e uma empreita do forno dividida entre dois */
  const D = await av(async () => {
    const h = hoje(), ag = new Date().toISOString(), d0 = addDias(h, -10);
    await gravar('fContas', { id: '__caixa', data: d0, nome: 'Caixa (dinheiro)', tipoConta: 'Caixa', situacao: 'Ativa', saldoInicial: 10000, dataSaldoInicial: d0, criadoEm: ag, criadoPor: 'u_DONO' }, null);
    const novoT = async (nome, setor) => { const id = novoId(); await gravarRegistro('pgTrab', { ...MODS.pgTrab.padrao(), id, nome, setor }, null, true); return id; };
    const A = await novoT('Trabalhador Teste A', 'Enforna'), B = await novoT('Trabalhador Teste B', 'Desenforna'), C = await novoT('Trabalhador Teste C', 'Enforna e Desenforna');
    const lanc = async (id, data, trabId, setor, grades, valorGrade) => gravarRegistro('pgLanc', { id, data, trabId, setor, grades, valorGrade, obs: '', lote: 'L' + id }, null, true);
    await lanc('la1', addDias(h, -3), A, 'Enforna', 10, 2.5);
    await lanc('la2', addDias(h, -2), A, 'Enforna', 12, 2.5);
    await lanc('la3', addDias(h, -1), A, 'Enforna', 8, 3);
    await lanc('lb1', addDias(h, -2), B, 'Desenforna', 20, 1.5);
    const emp = { id: 'E1', fornoId: '', fornoNome: 'Forno 01', total: 120, n: 2, modo: 'partes', membros: [{ id: B, nome: 'Trabalhador Teste B', parte: 60 }, { id: C, nome: 'Trabalhador Teste C', parte: 60 }] };
    for (const [id, t] of [['eb1', B], ['ec1', C]]) await gravarRegistro('pgLanc', { id, data: addDias(h, -1), trabId: t, setor: 'Desenforna', grades: 0, valorGrade: 0, valorEmp: 60, lote: 'E1', obs: '', emp: clone(emp) }, null, true);
    await T.sincronizado();
    return { h, A, B, C, n: DATA.pgLanc.length };
  });
  ok(D.n === 6, 'seis lançamentos fictícios: Enforna, Desenforna e a empreita do forno dividida entre dois');

  /* ---------- Produção: conferir e enviar ---------- */
  await av(() => T.ir('#/pgConf', /Conferir e enviar ao Financeiro/, 'producao'));
  await foto('01-conferir');
  const c1 = await av(() => ({ cards: T.cards(), grupos: [...document.querySelectorAll('.pc-t')].map((s) => T.tx(s.querySelector('.pc-t-cab label'))), sub: (window.PROD_ABAS_EXTRA.find((a) => a.m === 'pgrade') || {}).sub.map((x) => x[2]).join(','),
    aba: T.tx(document.querySelector('.pm-sub a.on')), barra: T.tx(document.querySelector('.pc-barra')) }));
  ok(c1.cards['A conferir'] === 'R$ 229,00' && c1.grupos.length === 3, 'a tela da Produção mostra R$ 229,00 a conferir, separado por trabalhador (3)', c1);
  ok(c1.sub === 'Painel,Lançar o dia,Empreita do forno,Lançamentos,Conferir e enviar,Trabalhadores,Pagamentos,Extrato,Relatórios' && c1.aba === 'Conferir e enviar', 'a Produção tem "Conferir e enviar" no Controle por grade, logo depois de Lançamentos', c1);
  ok(/6 lançamentos marcados · R\$ 229,00/.test(c1.barra), 'todos vêm marcados para conferir: ' + c1.barra);

  /* a conferência segue a ordem: desmarcar um dia desmarca os mais novos do mesmo trabalhador; marcar marca os mais antigos */
  const c2 = await av(async () => {
    const chk = (id) => document.querySelector(`[data-pcsel="${id}"]`);
    chk('la2').checked = false; chk('la2').dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    const r = { a: ['la1', 'la2', 'la3'].map((i) => chk(i).checked) };
    chk('la3').checked = true; chk('la3').dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    r.b = ['la1', 'la2', 'la3'].map((i) => chk(i).checked);
    chk('la3').checked = false; chk('la3').dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    r.c = ['la1', 'la2', 'la3'].map((i) => chk(i).checked); r.barra = T.tx(document.querySelector('.pc-barra')); return r;
  });
  ok(c2.a.join() === 'true,false,false' && c2.b.join() === 'true,true,true' && c2.c.join() === 'true,true,false', 'não dá para conferir um dia deixando um mais antigo para trás (desmarcar leva os mais novos; marcar traz os mais antigos)', c2);
  ok(/5 lançamentos marcados · R\$ 205,00/.test(c2.barra), 'sem o último dia do A: 5 lançamentos, R$ 205,00', c2.barra);
  /* com filtro na tela, o mais antigo do mesmo trabalhador que ficou fora do filtro vai junto (a ordem do controle) */
  const c2b = await av(async () => {
    const s = document.querySelector('#pcA'); s.value = 'empreita'; s.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(350);
    const r = { barra: T.tx(document.querySelector('.pc-barra')), ids: window.PAG_PROD_V169.marcados().map((p) => p.l.id).sort() };
    const s2 = document.querySelector('#pcA'); s2.value = ''; s2.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(350); return r;
  });
  ok(c2b.ids.join() === 'eb1,ec1,lb1' && /3 lançamentos marcados · R\$ 150,00/.test(c2b.barra) && /inclui 1 lançamento mais antigo fora do filtro/.test(c2b.barra), 'filtrando só as empreitas, a desenforna mais antiga do mesmo trabalhador vai junto (e a tela avisa)', c2b);

  const c3 = await av(async () => {
    document.querySelector('#pcEnviar').click(); await T.esperar(() => T.janela() && T.janela().querySelector('#pcOk'));
    const r = { tab: T.tx(T.janela().querySelector('.pc-conf-tab tfoot')) };
    T.janela().querySelector('[data-ok]').click(); await T.dorme(400); r.semOk = T.ultimoToast(); r.aberta = !!(T.janela() && T.janela().querySelector('#pcOk'));
    T.janela().querySelector('#pcOk').checked = true; T.digitar('#pcO', 'semana de teste'); await T.dorme(800);   /* a trava de clique duplo dos botões é de 700 ms */
    T.janela().querySelector('[data-ok]').click(); await T.esperar(() => DATA.pgLanc.filter((l) => l.conf && l.conf.st === 'enviado').length === 5, 12000); await T.sincronizado();
    const env = DATA.pgLanc.filter((l) => l.conf && l.conf.st === 'enviado');
    r.envios = [...new Set(env.map((l) => l.conf.envio))].length; r.por = env.every((l) => l.conf.por === 'u_DONO' && l.conf.em && l.conf.obs === 'semana de teste');
    r.la3 = !(DATA.pgLanc.find((l) => l.id === 'la3').conf); r.toast = T.ultimoToast();
    r.log = (DATA.log || []).filter((l) => l.modulo === 'pgConf' && l.acao === 'conferiu e enviou ao Financeiro').length;
    return r;
  });
  ok(/5 lançamentos/.test(c3.tab) && /R\$ 205,00/.test(c3.tab), 'a janela mostra o resumo por trabalhador e o total (R$ 205,00)', c3.tab);
  ok(/Marque que conferiu/.test(c3.semOk) && c3.aberta, 'sem marcar "Conferi as quantidades e os valores" não envia', c3.semOk);
  ok(c3.envios === 1 && c3.por && c3.la3, 'os 5 lançamentos ficam conferidos no mesmo envio, com quem, quando e a observação; o dia desmarcado fica de fora', c3);
  ok(/5 lançamentos conferidos e enviados ao Financeiro \(3 trabalhadores\)/.test(c3.toast) && c3.log === 3, 'aviso e histórico da conferência (um registro por trabalhador): ' + c3.toast, c3);

  /* clique repetido / segunda conferência dos mesmos lançamentos: nada muda */
  const c4 = await av(async () => {
    const antes = JSON.stringify(DATA.pgLanc.map((l) => [l.id, l.conf && l.conf.envio]));
    await window.PAG_PROD_V169.conferir(['la1', 'la2', 'lb1'], { obs: 'de novo' }); await T.sincronizado();
    return { igual: antes === JSON.stringify(DATA.pgLanc.map((l) => [l.id, l.conf && l.conf.envio])), toast: T.ultimoToast() };
  });
  ok(c4.igual && /já tinham sido conferidos/.test(c4.toast), 'conferir de novo os mesmos lançamentos não cria outro envio (nada duplica)', c4);

  /* ---------- Financeiro ---------- */
  const f1 = await av(() => {
    const P = T.prod(); const by = (id) => P.find((o) => o.prod.trabId === id);
    return { n: P.length, refs: P.map((o) => o.ref), unicos: new Set(P.map((o) => o.ref)).size, A: by(window.T.trab('Trabalhador Teste A').id), cat: P.every((o) => o.categoria === 'Pagamentos da Produção' && o.origem === 'Setor de Produção'),
      vals: P.map((o) => [o.benef, o.valor, o.s.saldo, o.s.st]).sort(), fila: P.every((o) => window.BOLETOS_V166.naFila(o)), mod: P.every((o) => CPG_FIN.moduloDe(o) === 'prod'), desc: by(window.T.trab('Trabalhador Teste B').id).descricao };
  });
  ok(f1.n === 3 && f1.unicos === 3 && f1.refs.every((r) => /^pp:[^:]+:[^:]+$/.test(r)), 'no Financeiro: 3 compromissos, um por trabalhador, com identificador fixo pp:<trabalhador>:<envio>', f1.refs);
  ok(f1.cat && f1.mod && JSON.stringify(f1.vals) === JSON.stringify([['Trabalhador Teste A', 55, 55, 'Pendente'], ['Trabalhador Teste B', 90, 90, 'Pendente'], ['Trabalhador Teste C', 60, 60, 'Pendente']]), 'categoria Pagamentos da Produção, origem Setor de Produção, módulo próprio; A R$ 55, B R$ 90 (desenforna + empreita), C R$ 60', f1.vals);
  ok(f1.fila, 'a conferência já chega na fila "Encaminhados para agendamento" de quem paga');
  ok(/Desenforna 20 grades \+ 1 empreita/.test(f1.desc), 'a descrição diz o que foi feito: ' + f1.desc);

  await av(() => T.ir('#/setor-financeiro', /A pagar por módulo/));
  const f2 = await av(() => ({ mods: [...document.querySelectorAll('#svCorpo .cpg-mods a')].map((a) => T.tx(a)), fmods: !!document.querySelector('.pg-fmods') }));
  ok(f2.mods.some((m) => /Pagamentos da Produção\s*R\$ 205,00/.test(m)) && !f2.fmods, 'no painel do Financeiro, "Pagamentos da Produção" entra em "A pagar por módulo" com R$ 205,00 (o cartão antigo do controle sai)', f2);
  await foto('02-painel-financeiro');
  await av(() => T.ir('#/fagenda', /./));
  const f3 = await av(() => { const f = document.querySelector('#bolFila'); return { tem: !!f, txt: T.tx(f) }; });
  ok(f3.tem && /Trabalhador Teste A/.test(f3.txt) && /Trabalhador Teste B/.test(f3.txt) && /Trabalhador Teste C/.test(f3.txt) && /3 contas · R\$ 205,00/.test(f3.txt), 'na agenda de quem paga, os três aparecem em "Encaminhados para agendamento" (R$ 205,00)', f3.txt.slice(0, 300));

  await av(() => T.ir('#/fProd', /Pagamentos da Produção/));
  await foto('03-fprod');
  const f4 = await av(() => ({ cards: T.cards(), ativ: [...document.querySelectorAll('.pv-ativ>div')].map((d) => T.tx(d)), linhas: [...document.querySelectorAll('#svCorpo tbody tr')].map((t) => T.tx(t.querySelector('td'))), fav: (window.C2_FAV_FIXOS || []).includes('#/fProd'), menu: (window.FIN_ABAS_EXTRA || []).some((a) => a.r === '#/fProd') }));
  ok(f4.cards['A pagar (conferido)'] === 'R$ 205,00' && f4.cards['Enviado para agendamento'] === 'R$ 205,00' && f4.cards['Agendado'] === 'R$ 0,00' && f4.cards['A conferir na Produção'] === 'R$ 24,00', 'indicadores: a pagar R$ 205, na fila R$ 205, agendado R$ 0 e R$ 24 ainda a conferir na Produção', f4.cards);
  ok(/Produção\s*R\$ 55,00/.test(f4.ativ[0]) && /Desenforna\s*R\$ 30,00/.test(f4.ativ[1]) && /Empreitas\s*R\$ 120,00/.test(f4.ativ[2]), 'devido por atividade: produção (Enforna) R$ 55, desenforna R$ 30, empreitas R$ 120', f4.ativ);
  ok(f4.linhas.length === 3 && f4.fav && f4.menu, 'um cartão por trabalhador, como na Lenha; no menu e nos atalhos do Financeiro', f4);
  const f5 = await av(async () => {
    const s = (id, v) => { const e = document.querySelector(id); e.value = v; e.dispatchEvent(new Event('change', { bubbles: true })); };
    s('#pvA', 'empreita'); await T.dorme(300); const r = { emp: [...document.querySelectorAll('#svCorpo tbody tr')].map((t) => T.tx(t.querySelector('td b'))) };
    s('#pvA', ''); await T.dorme(200); s('#pvE', 'Enforna'); await T.dorme(300); r.eq = [...document.querySelectorAll('#svCorpo tbody tr')].map((t) => T.tx(t.querySelector('td b')));
    s('#pvE', ''); await T.dorme(200); s('#pvT', T.trab('Trabalhador Teste B').id); await T.dorme(300); r.trab = [...document.querySelectorAll('#svCorpo tbody tr')].map((t) => T.tx(t.querySelector('td b')));
    s('#pvT', ''); await T.dorme(200); const cc = [...document.querySelectorAll('#pvC option')].map((o) => o.value).filter(Boolean); r.ccs = cc;
    s('#pvC', 'Produção · Produção (Enforna)'); await T.dorme(300); r.cc = [...document.querySelectorAll('#svCorpo tbody tr')].map((t) => T.tx(t.querySelector('td b'))); s('#pvC', ''); await T.dorme(200);
    return r;
  });
  ok(f5.emp.join() === 'Trabalhador Teste B,Trabalhador Teste C' && f5.eq.join() === 'Trabalhador Teste A' && f5.trab.join() === 'Trabalhador Teste B', 'filtros por atividade (empreita), equipe (Enforna) e trabalhador', f5);
  ok(f5.ccs.length >= 2 && f5.cc.join() === 'Trabalhador Teste A', 'filtro por centro de custo (' + f5.ccs.join(' | ') + ')', f5);

  /* agendar o B para depois de amanhã (como o Gustavo faz na fila) */
  const f6 = await av(async ({ B }) => {
    const o = T.prod().find((x) => x.prod.trabId === B); const d = addDias(hoje(), 2);
    await window.BOLETOS_V166.agendarFila([o.ref], d, 'PIX', '__caixa'); await T.sincronizado();
    const o2 = T.prod().find((x) => x.prod.trabId === B); const x = window.PAG_PROD_V169.base().porRef.get(o2.ref);
    return { d, prog: o2.prog, naAg: CPG_FIN.naAg(o2), fila: window.BOLETOS_V166.naFila(o2), sitP: window.PAG_PROD_V169.sitLote(x).t, sitL: window.PAG_PROD_V169.sitL(DATA.pgLanc.find((l) => l.id === 'lb1')).t };
  }, { B: D.B });
  ok(f6.prog === f6.d && f6.naAg && !f6.fila, 'agendado na agenda de quem paga: sai da fila e ganha o dia');
  ok(/Agendado para/.test(f6.sitP) && /Agendado para/.test(f6.sitL), 'a Produção vê "Agendado para ' + f6.d.split('-').reverse().join('/') + '" na conferência e no lançamento', f6);

  /* gaveta do compromisso: origem, histórico, sem previsão de multa e juros */
  const f7 = await av(async ({ B }) => {
    const o = T.prod().find((x) => x.prod.trabId === B); window.FINANCEIRO_SETOR.acoes.abrirObrig(o.ref); await T.dorme(500);
    const g = document.querySelector('.gaveta,.gav-corpo'); const txt = T.tx(document.querySelector('.gav-corpo')); const r = { hist: /conferiu e enviou ao Financeiro/.test(txt), multa: /Previsão de multa/.test(txt), txt: txt.slice(-400), orig: (document.querySelector('.gav-pe a.btn') || {}).getAttribute ? document.querySelector('.gav-pe a.btn').getAttribute('href') : '' };
    r.pagar = !!document.querySelector('.gav-pe [data-a="pagar"]'); T.limpar(); return r;
  }, { B: D.B });
  ok(f7.hist && !f7.multa && f7.orig === '#/fGrade/' + D.B && f7.pagar, 'a gaveta do compromisso mostra o histórico da conferência, abre a origem (extrato do trabalhador) e tem Registrar pagamento', f7);

  /* ---------- pagar pelo Financeiro: o pagamento do Controle por grade ---------- */
  const p1 = await av(async ({ A }) => {
    const o = T.prod().find((x) => x.prod.trabId === A); window.FINANCEIRO_SETOR.acoes.pagar(o.ref);
    await T.esperar(() => T.janela() && T.janela().querySelector('#pgV')); await T.dorme(300);
    const r = { valor: T.janela().querySelector('#pgV').value, resumo: T.tx(T.janela().querySelector('#pgResumo')), titulo: T.tx(T.janela().querySelector('h2,h3')) };
    T.digitar('#pgC', '__caixa'); T.janela().querySelector('[data-ok]').click();
    await T.esperar(() => DATA.pgPag.some((p) => p.trabId === A), 12000); await T.sincronizado(); await T.dorme(300);
    const p = DATA.pgPag.find((x) => x.trabId === A); r.pag = { valor: p.valor, conta: p.contaId, origem: p.origem };
    const o2 = T.prod().find((x) => x.prod.trabId === A); r.saldo = o2.s.saldo; r.st = o2.s.st; r.pagos = o2.pagamentos.map((x) => x.valor);
    r.sit = ['la1', 'la2', 'la3'].map((id) => window.PAG_PROD_V169.sitL(DATA.pgLanc.find((l) => l.id === id)).t);
    r.recibo = /Pagamento registrado/.test(T.textoJanela()); T.limpar();
    r.cx = (window.movimentosV48() || []).filter((m) => m.k === 'pg:' + p.id).map((m) => [m.tipo, m.valor, m.conta]);
    r.saldoCx = window.saldoMovV48('__caixa', hoje()); return r;
  }, { A: D.A });
  ok(p1.valor === '55,00' && /Conferido pela Produção e em aberto: R\$ 55,00 · ainda não conferido: R\$ 24,00/.test(p1.resumo), 'Pagar abre o pagamento do Controle por grade com o conferido em aberto (R$ 55,00) e mostra o que ainda não foi conferido', p1);
  ok(p1.pag.valor === 55 && p1.pag.conta === '__caixa' && p1.pag.origem === 'Financeiro · Pagamento por grade' && p1.saldo === 0 && p1.st === 'Pago informado', 'pagamento registrado no controle (R$ 55, Caixa): o compromisso fica pago', p1);
  ok(p1.sit.join() === 'Pago,Pago,A conferir' && p1.recibo, 'na Produção: os dois dias conferidos ficam "Pago"; o dia não conferido continua "A conferir"; recibo para assinar', p1.sit);
  ok(JSON.stringify(p1.cx) === JSON.stringify([['Saída', 55, '__caixa']]) && p1.saldoCx === 9945, 'o pagamento sai do Caixa (R$ 10.000,00 → R$ 9.945,00) uma vez só', p1);

  /* pagamento que iria para lançamento ainda não conferido pede confirmação */
  const p2 = await av(async ({ A }) => {
    window.JB_GRADE.abrirPagamento(A, 'Financeiro · Pagamento por grade'); await T.esperar(() => T.janela() && T.janela().querySelector('#pgV')); await T.dorme(250);
    T.digitar('#pgV', '24,00'); T.digitar('#pgC', '__caixa'); T.janela().querySelector('[data-ok]').click();
    await T.esperar(() => /ainda não foi conferida/.test(T.textoJanela())); const r = { txt: T.textoJanela() };
    await T.clicar('[data-r="0"]'); await T.dorme(300); r.n = DATA.pgPag.filter((p) => p.trabId === A).length; T.limpar(); return r;
  }, { A: D.A });
  ok(/R\$ 24,00 deste pagamento vai para lançamentos que ainda não foram conferidos/.test(p2.txt) && p2.n === 1, 'pagar o que a Produção ainda não conferiu pede confirmação (cancelado: nada gravado)', p2.txt.slice(0, 200));

  /* ---------- lançamento conferido travado; desfazer a conferência ---------- */
  const t1 = await av(() => {
    const l = DATA.pgLanc.find((x) => x.id === 'lb1'); const st = { ...clone(l), grades: 21 };
    const e1 = MODS.pgLanc.validar(st) || {}; const e2 = MODS.pgLanc.validar({ ...clone(l), obs: 'só a observação' }) || {};
    return { e1: e1.data || '', e2: e2.data || '' };
  });
  ok(/já foi conferido e enviado ao Financeiro/.test(t1.e1) && !t1.e2, 'lançamento conferido não muda grades, valor, dia, pessoa nem setor (só a observação)', t1);
  await av(() => T.ir('#/pgConf', /Conferir e enviar ao Financeiro/, 'producao'));
  const t2 = await av(async ({ B, C }) => {
    document.querySelector('[data-pcv="env"]').click(); await T.dorme(400); document.querySelector('[data-pcs=""]').click(); await T.dorme(400);
    const refB = [...window.PAG_PROD_V169.base().lotes].find((x) => x.trabId === B).ref, refC = [...window.PAG_PROD_V169.base().lotes].find((x) => x.trabId === C).ref;
    const r = { lotes: [...document.querySelectorAll('.pc-lote')].map((a) => T.tx(a.querySelector('.pc-lote-s'))), desfB: !!document.querySelector(`[data-pcdesf="${refB}"]`), desfC: !!document.querySelector(`[data-pcdesf="${refC}"]`) };
    window.PAG_PROD_V169.janelaDesfazer(refB); await T.dorme(300); r.bloqB = T.ultimoToast();
    document.querySelector(`[data-pcdesf="${refC}"]`).click(); await T.esperar(() => T.janela() && T.janela().querySelector('#pcDm'));
    T.janela().querySelector('[data-ok]').click(); await T.dorme(300); r.semMotivo = T.ultimoToast();
    T.digitar('#pcDm', 'empreita lançada no dia errado'); await T.dorme(800); T.janela().querySelector('[data-ok]').click();
    await T.esperar(() => !(DATA.pgLanc.find((l) => l.id === 'ec1').conf || {}).envio, 12000); await T.sincronizado();
    const lc = DATA.pgLanc.find((l) => l.id === 'ec1'); r.conf = { st: lc.conf.st, motivo: lc.conf.motivo, hist: (lc.conf.hist || []).map((h) => h.a) };
    r.sit = window.PAG_PROD_V169.sitL(lc).t; r.nProd = T.prod().length; r.log = (DATA.log || []).some((l) => l.modulo === 'pgConf' && l.acao === 'desfez a conferência');
    return r;
  }, { B: D.B, C: D.C });
  ok(t2.lotes.some((x) => /Agendado para/.test(x)) && t2.lotes.some((x) => /Pago/.test(x)) && t2.lotes.some((x) => /Na fila de pagamento/.test(x)), 'a Produção vê a situação de cada conferência: na fila, agendado, pago', t2.lotes);
  ok(!t2.desfB && t2.desfC && /já está agendado/.test(t2.bloqB), 'conferência agendada (ou paga) não se desfaz; a que está só na fila, sim', t2);
  ok(/Escreva o motivo/.test(t2.semMotivo) && t2.conf.st === 'desfeito' && t2.conf.motivo === 'empreita lançada no dia errado' && t2.conf.hist.join() === 'conferido,desfeito', 'desfazer pede o motivo e guarda o histórico no lançamento', t2.conf);
  ok(t2.sit === 'A conferir' && t2.nProd === 2 && t2.log, 'o lançamento volta para "A conferir" e sai do Financeiro (2 compromissos); fica na auditoria', t2);

  /* conferir de novo: novo envio, sem resto do anterior */
  const t3 = await av(async () => {
    await window.PAG_PROD_V169.conferir(['ec1'], { obs: '' }); await T.sincronizado();
    const lc = DATA.pgLanc.find((l) => l.id === 'ec1'); return { st: lc.conf.st, motivo: lc.conf.motivo, envio: !!lc.conf.envio, n: T.prod().length, hist: (lc.conf.hist || []).map((h) => h.a) };
  });
  ok(t3.st === 'enviado' && t3.envio && t3.motivo === '' && t3.n === 3 && t3.hist.join() === 'conferido,desfeito', 'conferido de novo: novo envio, sem o motivo antigo, histórico preservado', t3);

  /* ---------- lista de lançamentos da Produção com a situação do pagamento ---------- */
  await av(() => T.ir('#/pgLanc', /Lançamentos de grades/, 'producao'));
  const l1 = await av(() => ({ th: [...document.querySelectorAll('#svCorpo thead th')].map(T.tx), cel: [...document.querySelectorAll('#svCorpo tbody tr')].map((t) => T.tx(t)).filter((x) => /Trabalhador Teste A/.test(x)) }));
  ok(l1.th.includes('Pagamento') && l1.cel.some((x) => /A conferir/.test(x)) && l1.cel.filter((x) => /Pago/.test(x)).length >= 2, 'a lista de lançamentos da Produção tem a coluna "Pagamento" (a conferir, na fila, agendado, pago)', l1);

  /* ---------- persistência: recarregar a página ---------- */
  const antes = await av(() => ({ conf: DATA.pgLanc.filter((l) => l.conf && l.conf.st === 'enviado').length, prod: T.prod().map((o) => [o.ref, o.s.saldo, o.prog]).sort() }));
  await page.evaluate(async () => { await T.sincronizado(); const dump = []; window.__srv.estado.docs.forEach((d) => dump.push([d.colecao, d.id, d.dados])); sessionStorage.setItem('__srv_pp', JSON.stringify(dump)); });
  await page.reload();
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const depois = await av(async () => { await T.dorme(600); return { conf: DATA.pgLanc.filter((l) => l.conf && l.conf.st === 'enviado').length, prod: T.prod().map((o) => [o.ref, o.s.saldo, o.prog]).sort() }; });
  ok(depois.conf === antes.conf && depois.conf === 5 && JSON.stringify(depois.prod) === JSON.stringify(antes.prod), 'depois de recarregar, as conferências, a fila e o agendamento continuam iguais', { antes, depois });

  /* ---------- celular ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  const cel = await av(async () => {
    await T.ir('#/pgConf', /Conferir e enviar/, 'producao'); const a = document.documentElement.scrollWidth <= 392;
    await T.ir('#/fProd', /Pagamentos da Produção/); const b = document.documentElement.scrollWidth <= 392;
    return { a, b };
  });
  await foto('04-celular');
  ok(cel.a && cel.b, 'no celular (390 px) as duas telas cabem na largura', cel);
  await page.setViewportSize({ width: 1280, height: 900 });

  /* ---------- busca geral ---------- */
  const bq = await av(() => pqEntradas().filter((e) => e.h === '#/pgConf' || e.h === '#/fProd').map((e) => e.t));
  ok(bq.includes('Conferir e enviar ao Financeiro') && bq.includes('Pagamentos da Produção'), 'as duas telas aparecem na busca geral (Ctrl K)', bq);

  ok(!erros.length, 'nenhum erro de JavaScript durante o teste', erros);
} catch (e) {
  console.error(e); falhas++;
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
