#!/usr/bin/env node
// Teste de ponta a ponta do Financeiro (V131, 18/11/2026): painel no visual de antes, Agenda de Pagamentos e a
// Central de Pagamentos (Hoje, Agenda, Contas, Pagos e Indicadores), no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs).
// Os dados são de teste e só existem no banco simulado, em memória: nada toca o banco de verdade.
// Fluxos conferidos (pedido do Jeferson): agendamento, pagamento, pagamento extra, classificação automática,
// classificação manual, encaminhamento aos setores (Combustível, Lenha, Almoxarifado e os demais), falha e
// nova tentativa sem duplicar, indicadores, agenda (dia, semana e mês), relatório do dia, histórico e
// rastreabilidade, duplicidade, navegação, persistência depois de atualizar a página e celular.
// Continuam conferidos os 14 testes da Central de 17/11: cadastrar, localizar fornecedor, agendar, alterar a
// data, pagamento parcial, saldo, pagamento final, quitação, histórico, indicadores, filtros, navegação,
// persistência e sem duplicados.
// Uso: node scripts/construir.mjs && node scripts/testar-central-pagamentos.mjs   (FOTOS=<pasta> guarda capturas)
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', cnpj: '11222333000181', situacao: 'Ativo' }],
  ['fornecedores', 'f_vasco', { id: 'f_vasco', setor: 'lenha', nome: 'Vasco da Madeira', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_a', { id: 'f_a', setor: 'lenha', nome: 'Fornecedor Lenha A', tipoPessoa: 'Física', situacao: 'Ativo' }],
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
let falhas = 0;
const ok = (c, m, det) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) { falhas++; if (det !== undefined && process.env.DETALHE) console.log('      detalhe: ' + JSON.stringify(det).slice(0, 1800)); } };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('dialog', (d) => d.accept());
  page.on('popup', (p) => p.close().catch(() => {}));
  // o banco simulado nasce com os cadastros; depois de "atualizar a página" ele volta com o que já foi gravado
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    let salvo = null; try { salvo = JSON.parse(sessionStorage.getItem('__srv_teste') || 'null'); } catch (e) {}
    (salvo || docs).forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });

  const utilidades = () => page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 200) + ' | aviso: ' + T.ultimoToast()); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes'); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
      limpar: () => { document.querySelectorAll('.veu,.dc-pop').forEach((x) => x.remove()); if (GAV) { try { fecharGaveta(true); } catch (e) {} } },
      ir: async (rota, re) => { marcarSetor('financeiro'); T.limpar(); if (location.hash === rota) renderTela(); else location.hash = rota; try { await T.esperar(() => (re || /./).test((document.querySelector('#svCorpo') || {}).textContent || '')); } catch (e) { throw new Error('a tela ' + rota + ' não mostrou ' + re + ' | aba ' + CPG_FIN.UI.aba + ' | ' + ((document.querySelector('#svCorpo') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 300)); } await T.dorme(350); },
      /* abre a Central numa aba (as abas são estado da tela, não endereço) */
      central: async (aba, re) => { CPG_FIN.UI.aba = aba || 'hoje'; await T.ir('#/fcentral', re || /Central de Pagamentos/); },
      /* a Agenda de Pagamentos é uma tela própria (a mesma agenda também é uma das partes da Central) */
      agenda: async (re) => { await T.ir('#/fagenda', re || /Agenda de Pagamentos/); },
      val: (sel, v) => { const el = document.querySelector('.veu .modal ' + sel); if (!el) throw new Error('sem campo ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      ultimoToast: () => { const t = [...document.querySelectorAll('#toasts .toast')]; return t.length ? t[t.length - 1].textContent : ''; },
      /* o sistema ignora um segundo clique no mesmo botão em menos de 0,7 s (proteção contra clique duplo): espera como uma pessoa */
      confirmar: async () => { await T.dorme(750); const m = document.querySelector('.veu .modal'); m.querySelector('[data-ok]').click(); await T.esperar(() => !document.body.contains(m) || m.querySelector('[data-ok]:not([disabled])'), 15000); await T.dorme(450); return !document.body.contains(m); },
      tit: (desc) => DATA.fTitulos.find((t) => t.descricao === desc),
      tits: (desc) => DATA.fTitulos.filter((t) => t.descricao === desc),
      ob: (ref) => { const o = FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === ref); if (!o) return null; const e = CPG_FIN.encDe(o); return { valor: o.valor, saldo: o.s.saldo, pago: o.s.pagoEf, sit: CPG_FIN.sitU(o), mod: CPG_FIN.moduloDe(o), prog: o.prog, pags: o.pagamentos.length, setor: e.setor, modo: e.modo, st: e.st, extra: CPG_FIN.ehExtra(o) }; },
      linha: (ref) => { const tr = document.querySelector('#svCorpo tr[data-cpgref="' + ref + '"]'); return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : ''; },
      refs: () => [...document.querySelectorAll('#svCorpo tr[data-cpgref]')].map((tr) => (FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === tr.dataset.cpgref) || {}).descricao),
      /* ação da linha: o botão existe na linha (no layout novo fica dentro do menu de três pontos) */
      acaoLinha: (ref, a) => { const b = [...document.querySelectorAll('#svCorpo [data-cpga="' + a + '"]')].find((x) => x.dataset.ref === ref); if (!b) throw new Error('linha sem a ação ' + a + ' (' + ref + ')'); b.click(); },
      temAcao: (ref, a) => [...document.querySelectorAll('#svCorpo [data-cpga="' + a + '"]')].some((x) => x.dataset.ref === ref),
      /* formulário "Novo pagamento" da Central */
      novo: async (d) => { T.limpar(); document.querySelector('#cpgNovo').click(); await T.esperar(() => document.querySelector('.veu .modal #npV')); await T.dorme(120);
        if (d.modo) { document.querySelector('.veu .modal [data-npm="' + d.modo + '"]').click(); await T.dorme(80); }
        T.val('#npDs', d.desc); T.val('#npB', d.benef); if (d.valor != null) T.val('#npV', d.valor); if (d.data) T.val('#npD', d.data); await T.dorme(350);
        if (d.cat) T.val('#npC', d.cat); if (d.setor) T.val('#npS', d.setor); if (d.lenhaForn !== undefined) T.val('#npLF', d.lenhaForn); if (d.forma) T.val('#npF', d.forma); await T.dorme(250);
        const m = document.querySelector('.veu .modal'); return { setor: m.querySelector('#npS').value, cat: m.querySelector('#npC').value, id: m.querySelector('#npId').textContent.replace(/\s+/g, ' ').trim(), lenha: !m.querySelector('#npLw').hidden, lenhaForn: m.querySelector('#npLF').value, lenhaInfo: m.querySelector('#npLi').textContent.replace(/\s+/g, ' ').trim(), conta: m.querySelector('#npCt').value, contaVisivel: !m.querySelector('#npCw').hidden, okTxt: m.querySelector('[data-ok]').textContent.trim(), data: m.querySelector('#npD').value, rot: m.querySelector('#npDl').textContent }; },
      /* Pagar da linha: janela rápida (saldo inteiro) ou, com valor, a janela completa (parcial) */
      pagarLinha: async (ref, valor) => { document.querySelector('[data-cpgpagar="' + ref + '"]').click(); await T.esperar(() => document.querySelector('.veu .modal #prC')); await T.dorme(120);
        if (valor == null) return T.confirmar();
        document.querySelector('.veu .modal #prMais').click(); await T.esperar(() => document.querySelector('.veu .modal #mpV')); await T.dorme(120); T.val('#mpV', valor); T.val('#mpC', '__caixa'); return T.confirmar(); },
      kpis: () => Object.fromEntries([...document.querySelectorAll('#svCorpo .hero .kpi, #conteudo .hero .kpi')].map((k) => [k.querySelector('.l').textContent.trim(), k.querySelector('.v').textContent.trim() + ' | ' + ((k.querySelector('.delta') || {}).textContent || '').replace(/\s+/g, ' ').trim()])),
      resumo: () => Object.fromEntries([...document.querySelectorAll('#cpgCorpo .resumo > div')].map((d) => [d.querySelector('span').textContent.trim(), d.querySelector('b').textContent.trim()])),
      num: (s) => Math.round(parseFloat(String(s).replace(/[^\d,-]/g, '').replace(',', '.')) * 100) / 100,
      novaConta: async (rota, d) => { await T.ir(rota); document.querySelector('#cpmNova').click(); await T.dorme(200); const pop = document.querySelector('.dc-pop'); if (pop) { [...pop.querySelectorAll('[data-i]')].find((b) => (d.menu || /./).test(b.textContent)).click(); }
        await T.esperar(() => document.querySelector('.veu .modal #ncV')); await T.dorme(120);
        T.val('#ncB', d.benef); if (d.tipo) T.val('#ncT', d.tipo); T.val('#ncDs', d.desc); T.val('#ncV', d.valor); T.val('#ncVc', d.venc); if (d.ag) T.val('#ncAg', d.ag); },
      pagosDe: () => { const h = hoje(); let mes = 0, dia = 0, n = 0; FINANCEIRO_SETOR.obrigacoes().filter((o) => !o.cancelado).forEach((o) => o.pagamentos.forEach((p) => { if (String(p.data).slice(0, 7) === h.slice(0, 7)) { mes += p.valor; n++; } if (p.data === h) dia += p.valor; })); return { mes: Math.round(mes * 100) / 100, dia: Math.round(dia * 100) / 100, n }; },
    };
  });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const foto = async (nome) => { if (FOTOS) { await page.waitForTimeout(400); await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); } };

  console.log('Financeiro reformulado: painel e Central de Pagamentos');
  await page.evaluate(async () => { const h = hoje(); await gravar('fContas', { id: '__caixa', data: h, nome: 'Caixa (dinheiro)', tipoConta: 'Caixa', situacao: 'Ativa', saldoInicial: 20000, dataSaldoInicial: addDias(h, -30), criadoEm: new Date().toISOString(), criadoPor: 'u_DONO' }, null); await T.sincronizado(); });

  /* A. painel do setor: só os três indicadores e a entrada da Central */
  const pa = await page.evaluate(async () => {
    await T.ir('#/setor-financeiro', /Central de Pagamentos/); await T.dorme(600);
    const c = document.querySelector('#conteudo'); const tx = (x) => (x ? x.textContent : '').replace(/\s+/g, ' ').trim();
    const r = { kpis: Object.keys(T.kpis()), abas: [...document.querySelectorAll('.sv-abas a')].map(tx), lista: tx(c.querySelector('#cpgLista')), mods: [...c.querySelectorAll('.cpg-mods a > span:first-child')].map(tx),
      favs: [...c.querySelectorAll('.c2-pill')].map(tx), tiles: [...c.querySelectorAll('.c2-tile')].map(tx), botoes: [...c.querySelectorAll('#cpgExp, #cpgNova, #cpgNovoP')].map(tx), limpo: document.querySelector('#svCorpo').hasAttribute('data-inicio-limpo') };
    /* a pasta da agenda no acesso rápido abre a tela própria */
    [...c.querySelectorAll('.c2-pill')].find((a) => /Agenda de Pagamentos/.test(a.textContent)).click(); await T.esperar(() => location.hash === '#/fagenda' && document.querySelector('#cpgCorpo')); await T.dorme(500);
    r.agenda = { h1: tx(document.querySelector('#svCorpo h1')), abas: document.querySelectorAll('[data-cpgaba]').length, cal: !!document.querySelector('#cpgCorpo .fi-cal'), modos: [...document.querySelectorAll('#cpgCorpo [data-cpgcal]')].map(tx).join('|'), novo: !!document.querySelector('#cpgNovo'), rel: !!document.querySelector('#cpgRel'), navOn: tx(document.querySelector('.sv-abas a.on')) };
    JBNAV.voltar(); await T.esperar(() => location.hash === '#/setor-financeiro'); await T.dorme(500); r.voltou1 = location.hash;
    /* a Central abre pelo quadradinho dos módulos */
    [...document.querySelectorAll('#conteudo .c2-tile')].find((a) => /Central de Pagamentos/.test(a.textContent)).click(); await T.esperar(() => location.hash === '#/fcentral' && document.querySelector('#cpgCorpo')); await T.dorme(500);
    r.central = { h1: tx(document.querySelector('#svCorpo h1')), abas: [...document.querySelectorAll('[data-cpgaba]')].map(tx), on: tx(document.querySelector('[data-cpgaba].on')), novo: !!document.querySelector('#cpgNovo'), rel: !!document.querySelector('#cpgRel'), navOn: tx(document.querySelector('.sv-abas a.on')) };
    JBNAV.voltar(); await T.esperar(() => location.hash === '#/setor-financeiro'); r.voltou = location.hash; return r;
  });
  await foto('01-painel');
  const ANT = ['Contas a pagar – Lenha', 'Contas a pagar – Combustível', 'Despesas gerais', 'Outros pagamentos', 'Pagamentos do dia', 'Calendário', 'Indicadores', 'Contas a pagar', 'Pagamentos', 'Extratos', 'Caixa e bancos', 'Conciliação', 'Relatórios', 'Configurações'];
  ok(pa.kpis.join('|') === 'Pagar hoje|Próximos 7 dias|Em atraso|Agendadas|Parcialmente pagas|Pago neste mês|Total pendente' && /^Para pagar agora/.test(pa.lista) && pa.mods.join('|') === 'Lenha|Combustível|Despesas gerais|Outros pagamentos' && !pa.limpo
    && pa.botoes.length === 3 && /Exportar/.test(pa.botoes[0]) && /Nova conta/.test(pa.botoes[1]) && /Novo pagamento/.test(pa.botoes[2]),
    `painel do Financeiro no visual de antes: sete indicadores (${pa.kpis.join(' · ')}), a lista “Para pagar agora”, “A pagar por módulo” e os botões Exportar, Nova conta e Novo pagamento`, pa);
  ok(/Agenda de Pagamentos/.test(pa.favs[0] || '') && /Central de Pagamentos/.test(pa.favs[1] || '') && ['Contas a pagar – Lenha', 'Contas a pagar – Combustível', 'Despesas gerais', 'Outros pagamentos'].every((x) => pa.favs.some((f) => f.includes(x)))
    && /Agenda de Pagamentos/.test(pa.tiles[0] || '') && /Central de Pagamentos/.test(pa.tiles[1] || '') && ANT.concat(['Lançamento Inteligente por Foto']).every((x) => pa.tiles.some((t) => t.includes(x))) && pa.tiles.length >= 20,
    `acesso rápido de volta: atalhos favoritos (${pa.favs.join(' · ')}) e ${pa.tiles.length} módulos, com a Agenda de Pagamentos e a Central de Pagamentos na frente`, pa);
  ok(pa.abas[0] === 'Painel' && pa.abas[1] === 'Agenda de Pagamentos' && pa.abas[2] === 'Central de Pagamentos' && ANT.every((x) => pa.abas.includes(x)),
    `menu do setor com todas as telas de antes e as duas novas (${pa.abas.join(' · ')})`);
  ok(pa.agenda.h1 === 'Agenda de Pagamentos' && pa.agenda.abas === 0 && pa.agenda.cal && pa.agenda.modos === 'Mês|Semana|Dia' && pa.agenda.novo && pa.agenda.rel && pa.agenda.navOn === 'Agenda de Pagamentos' && pa.voltou1 === '#/setor-financeiro',
    'a pasta “Agenda de Pagamentos” do acesso rápido abre uma tela própria (calendário por mês, semana e dia, Novo pagamento e Relatório do dia) e o Voltar retorna ao painel', pa.agenda);
  ok(pa.central.h1 === 'Central de Pagamentos' && pa.central.abas.join('|') === 'Hoje|Agenda|Contas|Pagos|Indicadores' && pa.central.on === 'Hoje' && pa.central.novo && pa.central.rel && pa.central.navOn === 'Central de Pagamentos' && pa.voltou === '#/setor-financeiro',
    'o módulo “Central de Pagamentos” abre a Central (Hoje · Agenda · Contas · Pagos · Indicadores) e o Voltar retorna ao painel');

  /* 1. NOVO PAGAMENTO extra com identificação automática (Combustível) e encaminhamento ao setor */
  const n1 = await page.evaluate(async () => {
    await T.central('hoje');
    const f = await T.novo({ desc: 'Gasolina da saveiro', benef: 'Posto Exemplo', valor: '180,00' });
    /* categoria obrigatória: sem ela não grava e avisa */
    const semCat = !(await T.confirmar()); const aviso = T.ultimoToast(); const n0 = DATA.fTitulos.length;
    const cats = [...document.querySelectorAll('.veu .modal #npC optgroup')].map((g) => g.label + ': ' + [...g.querySelectorAll('option')].map((o) => o.value).join('/'));
    T.val('#npC', 'Combustíveis'); await T.dorme(200); const setorDepois = document.querySelector('.veu .modal #npS').value;
    /* clique triplo: um pagamento só */
    await T.dorme(750); const b = document.querySelector('.veu .modal [data-ok]'); b.click(); b.click(); b.click(); await T.esperar(() => !document.querySelector('.veu .modal #npV'), 15000); await T.sincronizado();
    const t = T.tit('Gasolina da saveiro'); const R = 't:' + t.id; await T.central('hoje', /Gasolina da saveiro/);
    const r = { f, semCat, aviso, n0, cats, setorDepois, n: T.tits('Gasolina da saveiro').length, t: { extra: t.extra, cond: t.condicao, forn: t.fornecedorId, orig: t.setorOrigem, cat: t.categoria, enc: t.enc && { s: t.enc.setor, m: t.enc.modo, st: t.enc.st, h: (t.enc.hist || []).length, regra: t.enc.regra }, pg: (t.pagamentos || []).map((p) => ({ v: p.valor, d: p.data, c: p.contaId, q: p.quitacao, por: p.por })), numero: t.numero }, ob: T.ob(R), linha: T.linha(R), toast: T.ultimoToast(), R };
    /* o Setor de Combustível lê o pagamento em "Despesa com combustível" */
    marcarSetor('combustivel'); location.hash = '#/combEntrega'; await T.esperar(() => /Despesa com combustível/.test((document.querySelector('#svCorpo') || {}).textContent || '')); await T.dorme(400);
    r.noSetor = /Gasolina da saveiro/.test(document.querySelector('#svCorpo').textContent); r.kHoje = (T.kpis().Hoje || '');
    r.lanc = JB_DOCL.lancamentosSetor('combustivel').filter((x) => /Gasolina da saveiro/.test(x.desc)).map((x) => x.tipo);
    return r;
  });
  ok(n1.f.setor === 'combustivel' && /Setor identificado/.test(n1.f.id) && /fornecedor de combustível do cadastro/.test(n1.f.id) && n1.f.conta === '__caixa' && n1.f.contaVisivel && n1.f.okTxt === 'Registrar pagamento' && n1.cats.some((c) => /^Combustível: /.test(c) && /Combustíveis/.test(c)),
    `1. identificação automática ao digitar: ${n1.f.id}`);
  ok(n1.semCat && /categoria/i.test(n1.aviso) && n1.n0 === 0, `1. campo obrigatório vazio não grava e avisa: “${n1.aviso}”`);
  ok(n1.n === 1 && n1.t.extra === true && n1.t.cond === 'À vista' && n1.t.forn === 'f_posto' && n1.t.orig === 'Geral (Financeiro)' && n1.t.pg.length === 1 && n1.t.pg[0].v === 180 && n1.t.pg[0].c === '__caixa' && n1.t.pg[0].q === true && n1.t.pg[0].por === 'u_DONO' && n1.ob.sit === 'Pago' && n1.ob.saldo === 0 && n1.ob.extra,
    '1. pagamento extra registrado direto no Financeiro: já nasce pago (R$ 180,00, Caixa, data de hoje, quem pagou) e o clique triplo grava um só');
  ok(n1.t.enc && n1.t.enc.s === 'combustivel' && n1.t.enc.m === 'auto' && n1.t.enc.st === 'ok' && n1.t.enc.h === 1 && n1.ob.mod === 'comb' && /Combustível/.test(n1.linha) && /extra/.test(n1.linha) && /Encaminhado ao Setor de Combustível/.test(n1.toast),
    `1. encaminhado automaticamente ao Setor de Combustível (${n1.t.enc && n1.t.enc.regra}); a ligação fica no próprio pagamento`);
  ok(n1.noSetor && /180,00/.test(n1.kHoje) && n1.lanc.join() === 'Pagamento encaminhado pelo Financeiro', '1. o Setor de Combustível mostra o pagamento em “Despesa com combustível” e nos Lançamentos do setor, sem lançar de novo');

  /* 2. setor NÃO identificado: aguardando classificação → classificação manual com um toque → o sistema aprende */
  const n2 = await page.evaluate(async () => {
    await T.central('hoje');
    const f = await T.novo({ desc: 'Pagamento ao Zeca', benef: 'Zeca', valor: '90,00', cat: 'Outras despesas' });
    const fechou = await T.confirmar(); await T.sincronizado(); const t0 = T.tit('Pagamento ao Zeca'); const R = 't:' + t0.id; const toast = T.ultimoToast();
    await T.central('hoje', /Pagamento ao Zeca/);
    const r = { f, fechou, toast, antes: T.ob(R), enc0: { st: t0.enc.st, s: t0.enc.setor }, linha0: T.linha(R), faixa: (document.querySelector('#cpgCorpo .cpg-linha') || {}).textContent || '', acao: T.temAcao(R, 'classificar'), n0: DATA.fTitulos.length };
    /* classificar: a lista de setores; tocar no setor já salva */
    T.acaoLinha(R, 'classificar'); await T.esperar(() => document.querySelector('.veu .modal [data-set]')); await T.dorme(150);
    const m = document.querySelector('.veu .modal'); r.janela = m.textContent.replace(/\s+/g, ' '); r.lista = [...m.querySelectorAll('[data-set]')].map((b) => b.textContent.trim());
    m.querySelector('[data-set="adm"]').click(); await T.esperar(() => !document.body.contains(m), 12000); await T.sincronizado();
    const t1 = T.tit('Pagamento ao Zeca'); r.depois = T.ob(R); r.enc1 = { s: t1.enc.setor, m: t1.enc.modo, st: t1.enc.st, h: t1.enc.hist.map((x) => (x.de || '-') + '>' + (x.para || '-') + ':' + (x.modo || '-')) }; r.n1 = DATA.fTitulos.length; r.mesmoId = t1.id === t0.id; r.pagos = t1.pagamentos.length; r.toast2 = T.ultimoToast();
    await T.central('hoje', /Pagamento ao Zeca/); r.linha1 = T.linha(R); r.faixa1 = (document.querySelector('#cpgCorpo .cpg-linha') || {}).textContent || '';
    r.log = DATA.log.filter((l) => l.modulo === 'fTitulos' && l.recId === t1.id).map((l) => l.acao);
    /* o histórico ensina: o próximo pagamento ao Zeca já vem identificado */
    const f2 = await T.novo({ desc: 'Outro acerto', benef: 'Zeca', valor: '10,00' }); r.aprendeu = { setor: f2.setor, id: f2.id, cat: f2.cat }; T.limpar();
    return r;
  });
  ok(n2.f.setor === '' && /SETOR NÃO IDENTIFICADO – CLASSIFICAR MANUALMENTE/.test(n2.f.id) && n2.fechou && n2.enc0.st === 'aguardando' && n2.enc0.s === '' && n2.antes.st === 'aguardando' && n2.antes.sit === 'Pago' && /aguardando classificação/.test(n2.toast),
    '2. sem certeza o sistema não escolhe setor: mostra “SETOR NÃO IDENTIFICADO – CLASSIFICAR MANUALMENTE” e o pagamento fica registrado, aguardando classificação');
  ok(/Setor não identificado/.test(n2.linha0) && /1 aguardando classificação/.test(n2.faixa) && n2.acao, '2. a Central mostra o que aguarda classificação e a linha oferece “Classificar setor”');
  ok(n2.lista.length === 10 && n2.lista.includes('Administrativo') && /CLASSIFICAR MANUALMENTE/.test(n2.janela) && n2.depois.setor === 'adm' && n2.depois.modo === 'manual' && n2.depois.st === 'ok' && n2.enc1.h.join() === '->-:-,->adm:manual' && n2.n1 === n2.n0 && n2.mesmoId && n2.pagos === 1,
    `2. classificação manual com um toque (lista de ${n2.lista.length} setores): vai para Administrativo, marcada como manual, sem cadastrar o pagamento de novo`);
  ok(/Administrativo/.test(n2.linha1) && !/aguardando classificação/.test(n2.faixa1) && n2.log.some((a) => /classificou o setor \(manual\)/.test(a)) && n2.aprendeu.setor === 'adm' && /classificados à mão em Administrativo/.test(n2.aprendeu.id) && n2.aprendeu.cat === 'Outras despesas',
    `2. o histórico registra a classificação e o sistema aprende: novo pagamento ao Zeca já vem em Administrativo (“${n2.aprendeu.id}”)`);

  /* 3. Lenha: pagamento a fornecedor do cadastro vira crédito na conta dele (desconta das entregas) */
  const n3 = await page.evaluate(async () => {
    const c = await T.comprar('lenha', 'f_vasco', 'p_lenha', 40, 75); await T.sincronizado(); const RC = 'c:' + c.id;
    const L = window.CPL_LENHA; const antes = { saldo: L.conta('f_vasco').saldo, ob: T.ob(RC).saldo };
    await T.central('hoje');
    const f = await T.novo({ desc: 'Adiantamento da madeira', benef: 'Vasco', valor: '1.000,00', forma: 'Dinheiro' });
    const fechou = await T.confirmar(); await T.sincronizado(); const t = T.tit('Adiantamento da madeira'); const R = 't:' + t.id;
    const cta = L.conta('f_vasco');
    const r = { f, fechou, antes, depois: { saldo: cta.saldo, ob: T.ob(RC).saldo, adts: cta.adts.map((a) => a.id), pagoConta: cta.pago }, t: { forn: t.fornecedorId, bt: t.beneficiarioTipo, nome: t.beneficiarioNome, cat: t.categoria, adl: t.adiantamentoLenha, enc: t.enc && t.enc.setor + '/' + t.enc.modo + '/' + t.enc.st }, ob: T.ob(R), n: T.tits('Adiantamento da madeira').length, compras: DATA.compras.length, toast: T.ultimoToast(), R, RC };
    marcarSetor('financeiro'); location.hash = '#/fLenha/f_vasco'; await T.esperar(() => /Vasco da Madeira/.test((document.querySelector('#svCorpo') || {}).textContent || '')); await T.dorme(500);
    r.telaLenha = document.querySelector('#svCorpo').textContent.replace(/\s+/g, ' ').slice(0, 1500);
    return r;
  });
  ok(n3.f.setor === 'lenha' && /fornecedor de lenha do cadastro \(Vasco da Madeira\)/.test(n3.f.id) && n3.f.cat === 'Lenha' && n3.f.lenha && n3.f.lenhaForn === 'f_vasco' && /desconta das entregas em aberto \(hoje R\$\s?3\.000,00 a pagar\)/.test(n3.f.lenhaInfo),
    `3. Lenha identificada pelo fornecedor do cadastro, mesmo com o nome curto: ${n3.f.id}`);
  ok(n3.fechou && n3.antes.saldo === 3000 && n3.depois.saldo === 2000 && n3.depois.ob === 2000 && n3.depois.adts.length === 1 && n3.t.forn === 'f_vasco' && n3.t.bt === 'Fornecedor cadastrado' && n3.t.adl && n3.t.adl.fornecedorId === 'f_vasco' && n3.t.adl.central === true && n3.t.enc === 'lenha/auto/ok' && n3.ob.mod === 'lenha' && n3.n === 1 && n3.compras === 1 && /2\.000,00/.test(n3.telaLenha),
    '3. encaminhado ao Setor da Lenha: entra na conta do fornecedor como pagamento e o saldo dele cai de R$ 3.000,00 para R$ 2.000,00, sem lançar nada em dobro');

  /* 4. falha de encaminhamento: fica pendente de integração; nova tentativa conclui sem duplicar */
  const n4 = await page.evaluate(async () => {
    await T.central('hoje');
    const f = await T.novo({ desc: 'Lenha do seu Chico', benef: 'Chico', valor: '500,00', forma: 'Dinheiro' });
    const fechou = await T.confirmar(); await T.sincronizado(); const t0 = T.tit('Lenha do seu Chico'); const R = 't:' + t0.id; const toast = T.ultimoToast();
    await T.central('hoje', /Lenha do seu Chico/);
    const r = { f, fechou, toast, enc0: { s: t0.enc.setor, st: t0.enc.st, motivo: t0.enc.motivo }, pago0: T.ob(R), linha0: T.linha(R), faixa: (document.querySelector('#cpgCorpo .cpg-linha') || {}).textContent || '', acao: T.temAcao(R, 'reenviar'), n0: DATA.fTitulos.length, pend: (window.LEMBRETES_V61 ? window.LEMBRETES_V61() : []).filter((x) => /^cpg-/.test(x.key)).map((x) => x.titulo) };
    const pgAntes = FINANCEIRO_SETOR.obrigacoes().reduce((s, o) => s + o.pagamentos.length, 0);
    /* tentar de novo: escolhe o fornecedor do cadastro e a MESMA conta é encaminhada */
    T.acaoLinha(R, 'reenviar'); await T.esperar(() => document.querySelector('.veu .modal #clF')); await T.dorme(200);
    const m = document.querySelector('.veu .modal'); r.preSel = m.querySelector('#clS').value; r.lenhaVisivel = !m.querySelector('#clLw').hidden;
    r.semForn = !(await T.confirmar()); r.aviso = T.ultimoToast();
    T.val('#clF', 'f_a'); r.salvou = await T.confirmar(); await T.sincronizado();
    const t1 = T.tit('Lenha do seu Chico'); r.enc1 = { s: t1.enc.setor, st: t1.enc.st, m: t1.enc.modo }; r.adl = t1.adiantamentoLenha; r.forn = t1.fornecedorId; r.n1 = DATA.fTitulos.length; r.mesmoId = t1.id === t0.id; r.pgs = t1.pagamentos.length;
    r.pgDepois = FINANCEIRO_SETOR.obrigacoes().reduce((s, o) => s + o.pagamentos.length, 0) - pgAntes; const cta = window.CPL_LENHA.conta('f_a'); r.conta = { adts: cta.adts.length, credito: cta.credito };
    await T.central('hoje', /Lenha do seu Chico/); r.linha1 = T.linha(R); r.acao1 = T.temAcao(R, 'reenviar');
    r.pend1 = (window.LEMBRETES_V61 ? window.LEMBRETES_V61() : []).filter((x) => x.key === 'cpg-pint').length;
    return r;
  });
  ok(n4.f.setor === 'lenha' && n4.f.lenha && n4.f.lenhaForn === '' && /pendente de integração/.test(n4.f.lenhaInfo) && n4.fechou && n4.enc0.s === 'lenha' && n4.enc0.st === 'pendente' && /fornecedor de lenha/.test(n4.enc0.motivo) && n4.pago0.sit === 'Pago' && n4.pago0.pago === 500 && /Encaminhamento pendente/.test(n4.toast),
    `4. se o encaminhamento não se completa, o pagamento continua registrado no Financeiro (pago, R$ 500,00) e fica pendente de integração: “${n4.enc0.motivo}”`);
  ok(/pendente de integração/.test(n4.linha0) && /pendentes? de integração/.test(n4.faixa) && n4.acao && n4.pend.some((x) => /encaminhamento pendente/.test(x)), '4. a pendência aparece na linha, na Central e no botão PENDÊNCIAS, com “Tentar encaminhar de novo”', { linha0: n4.linha0, faixa: n4.faixa, acao: n4.acao, pend: n4.pend });
  ok(n4.preSel === 'lenha' && n4.lenhaVisivel && n4.semForn && /fornecedor de lenha/.test(n4.aviso) && n4.salvou && n4.enc1.s === 'lenha' && n4.enc1.st === 'ok' && n4.adl && n4.adl.fornecedorId === 'f_a' && n4.forn === 'f_a' && n4.n1 === n4.n0 && n4.mesmoId && n4.pgs === 1 && n4.pgDepois === 0 && n4.conta.adts === 1 && n4.conta.credito === 500 && !n4.acao1 && n4.pend1 === 0 && !/pendente de integração/.test(n4.linha1),
    '4. nova tentativa conclui o encaminhamento na mesma conta (crédito de R$ 500,00 na conta do fornecedor): nenhum lançamento ou pagamento repetido');

  /* 5. compras de materiais → Almoxarifado; despesa administrativa → classificação administrativa; escolha manual no formulário */
  const n5 = await page.evaluate(async () => {
    const r = {}; await T.central('hoje');
    r.f1 = await T.novo({ desc: 'Parafusos e tinta para o galpão', benef: 'Loja do Parafuso', valor: '230,00', forma: 'Dinheiro' }); r.ok1 = await T.confirmar(); await T.sincronizado();
    await T.central('hoje');
    r.f2 = await T.novo({ desc: 'Honorários da contabilidade', benef: 'Escritório Contábil', valor: '400,00' }); r.cats2 = [...document.querySelectorAll('.veu .modal #npC optgroup')].map((g) => g.label)[0] || ''; T.val('#npC', 'Outras despesas'); r.setor2b = document.querySelector('.veu .modal #npS').value; r.ok2 = await T.confirmar(); await T.sincronizado();
    await T.central('hoje');
    r.f3 = await T.novo({ desc: 'Serviço avulso', benef: 'Fulano de Tal', valor: '70,00', cat: 'Outras despesas', setor: 'producao' }); r.ok3 = await T.confirmar(); await T.sincronizado();
    const e = (d) => { const t = T.tit(d); return t && t.enc ? t.enc.setor + '/' + t.enc.modo + '/' + t.enc.st : ''; };
    r.e1 = e('Parafusos e tinta para o galpão'); r.e2 = e('Honorários da contabilidade'); r.e3 = e('Serviço avulso'); r.c1 = T.tit('Parafusos e tinta para o galpão').categoria;
    /* o Almoxarifado lê a compra em Contas a pagar do almoxarifado */
    marcarSetor('almox'); location.hash = '#/almPagar'; await T.esperar(() => /Contas a pagar do almoxarifado/.test((document.querySelector('#conteudo') || {}).textContent || '')); await T.dorme(500);
    const tx = document.querySelector('#conteudo').textContent.replace(/\s+/g, ' '); r.almox = /Pagamentos encaminhados pelo Financeiro/.test(tx) && /Parafusos e tinta para o galpão/.test(tx);
    r.lancAlm = JB_DOCL.lancamentosSetor('almox').filter((x) => /Parafusos/.test(x.desc)).length; r.lancProd = JB_DOCL.lancamentosSetor('producao').filter((x) => /Serviço avulso/.test(x.desc)).length;
    return r;
  });
  ok(n5.f1.setor === 'almox' && n5.ok1 && n5.e1 === 'almox/auto/ok' && n5.c1 === 'Materiais' && n5.almox && n5.lancAlm === 1, `5. compra de materiais identificada pelas palavras (${n5.f1.id}) e lida pelo Almoxarifado em “Contas a pagar”, sem entrada em dobro`);
  ok(n5.f2.setor === 'adm' && n5.ok2 && n5.e2 === 'adm/auto/ok' && n5.setor2b === 'adm', `5. despesa administrativa recebe a classificação administrativa (${n5.f2.id})`);
  ok(n5.f3.setor === 'producao' && /escolhido por você/i.test(n5.f3.id) && n5.ok3 && n5.e3 === 'producao/manual/ok' && n5.lancProd === 1, '5. setor escolhido à mão no formulário fica marcado como manual e é encaminhado ao setor escolhido (aparece nos Lançamentos da Produção)');

  /* 6. AGENDAR pelo Novo pagamento e pela AGENDA (tocar no dia) */
  const n6 = await page.evaluate(async () => {
    const r = {}; const h = hoje(); const d3 = addDias(h, 3); r.d3 = d3;
    await T.central('hoje');
    r.f = await T.novo({ modo: 'agendar', desc: 'Conta de energia', benef: 'Companhia de Energia', valor: '850,00', data: d3 });
    T.val('#npD', addDias(h, -1)); r.passado = !(await T.confirmar()); r.avisoP = T.ultimoToast(); T.val('#npD', d3);
    r.fechou = await T.confirmar(); await T.sincronizado(); const t = T.tit('Conta de energia'); r.R = 't:' + t.id; r.t = { venc: t.vencimento, prev: t.dataPrevista, pgs: (t.pagamentos || []).length, extra: !!t.extra, cond: t.condicao, enc: t.enc.setor + '/' + t.enc.modo }; r.ob = T.ob(r.R); r.toast = T.ultimoToast();
    /* agenda do mês: o dia mostra o compromisso; tocar no dia abre o dia */
    CPG_FIN.UI.cal = 'mes'; CPG_FIN.UI.mes = d3.slice(0, 7); await T.agenda(/Toque num dia/);
    const cel = document.querySelector('#cpgCorpo .fi-cal [data-cpgdia="' + d3 + '"]'); r.celula = cel ? cel.textContent.replace(/\s+/g, ' ').trim() : ''; r.classes = document.querySelector('#cpgCorpo .fi-cal') ? 'fi-cal' : '';
    cel.click(); await T.esperar(() => document.querySelector('#cpgDia')); await T.dorme(400);
    r.dia = { data: document.querySelector('#cpgDia').value, lista: T.refs(), titulo: [...document.querySelectorAll('#cpgCorpo h3.grupo-t')].map((x) => x.textContent.trim())[0], novoTxt: document.querySelector('#cpgNovo').textContent.trim(), rel: !!document.querySelector('#cpgRel'), resumo: T.resumo() };
    /* lançar, dentro do dia, o que não estava agendado para ele */
    const f2 = await T.novo({ desc: 'Internet do escritório', benef: 'Provedor de Internet', valor: '150,00', cat: 'Outras despesas' }); r.f2 = { modo: f2.okTxt, data: f2.data, rot: f2.rot, contaVisivel: f2.contaVisivel, setor: f2.setor };
    r.fechou2 = await T.confirmar(); await T.sincronizado(); await T.agenda(/Internet do escritório/); r.dia2 = T.refs(); r.t2 = T.tit('Internet do escritório').dataPrevista;
    /* semana e volta para hoje */
    CPG_FIN.UI.cal = 'sem'; CPG_FIN.UI.sem = d3; renderTela(); await T.dorme(400); r.semana = !!document.querySelector('#cpgCorpo .fi-sem') && /Companhia de Energia/.test(document.querySelector('#cpgCorpo .fi-sem').textContent);
    CPG_FIN.UI.cal = 'dia'; CPG_FIN.UI.dia = h; renderTela(); await T.dorme(400); r.hojeTxt = document.querySelector('#cpgNovo').textContent.trim();
    /* agendado para hoje: aparece em "Para pagar hoje" */
    await T.central('hoje');
    await T.novo({ modo: 'agendar', desc: 'Boleto do contador', benef: 'Escritório Contábil', valor: '420,00', data: h, cat: 'Outras despesas' }); r.fechou3 = await T.confirmar(); await T.sincronizado();
    await T.central('hoje', /Boleto do contador/); r.RB = 't:' + T.tit('Boleto do contador').id; r.hoje = { linha: T.linha(r.RB), ob: T.ob(r.RB), resumo: T.resumo() };
    return r;
  });
  await foto('02-central-hoje');
  ok(n6.f.okTxt === 'Agendar pagamento' && !n6.f.contaVisivel && n6.f.rot === 'Data para pagar' && n6.f.setor === 'producao' && n6.passado && /passado/.test(n6.avisoP) && n6.fechou && n6.t.venc === n6.d3 && n6.t.prev === n6.d3 && n6.t.pgs === 0 && !n6.t.extra && n6.t.cond === 'A prazo' && n6.ob.sit === 'Agendado' && n6.ob.saldo === 850 && n6.ob.pags === 0 && /não marca como pago/.test(n6.toast),
    `6. agendamento pelo Novo pagamento: fica Agendado para ${n6.d3}, com saldo R$ 850,00 e NENHUM pagamento (agendar não é pagar); data no passado é barrada`);
  ok(n6.classes === 'fi-cal' && /850,00/.test(n6.celula) && /1 a pagar/.test(n6.celula) && n6.dia.data === n6.d3 && n6.dia.lista.join() === 'Conta de energia' && /Agendado para/.test(n6.dia.titulo) && /^Agendar para \d\d\/\d\d$/.test(n6.dia.novoTxt) && !n6.dia.rel,
    `6. agenda no calendário do sistema: o dia mostra “${n6.celula}”; tocar no dia abre a lista dele e o botão vira “${n6.dia.novoTxt}”`);
  ok(n6.f2.modo === 'Agendar pagamento' && n6.f2.data === n6.d3 && !n6.f2.contaVisivel && n6.fechou2 && n6.t2 === n6.d3 && n6.dia2.slice().sort().join() === 'Conta de energia,Internet do escritório' && n6.semana && n6.hojeTxt === 'Novo pagamento',
    '6. dentro do dia dá para lançar o que não estava agendado para ele; a semana mostra os mesmos compromissos');
  ok(n6.fechou3 && /Agendado/.test(n6.hoje.linha) && n6.hoje.ob.sit === 'Agendado' && n6.hoje.ob.saldo === 420 && T_num(n6.hoje.resumo['Falta pagar']) === 2420, '6. o que foi agendado para hoje aparece em “Para pagar hoje”');

  /* 7. PAGAR com poucos cliques: confirma, registra a data efetiva e quem pagou, atualiza a situação */
  const n7 = await page.evaluate(async (RB) => {
    const r = {}; const h = hoje(); await T.central('hoje', /Boleto do contador/);
    r.pagosAntes = T.pagosDe();
    document.querySelector('[data-cpgpagar="' + RB + '"]').click(); await T.esperar(() => document.querySelector('.veu .modal #prC')); await T.dorme(150);
    const m = document.querySelector('.veu .modal'); r.janela = { conta: m.querySelector('#prC').value, data: m.querySelector('#prD').value, txt: m.textContent.replace(/\s+/g, ' ').slice(0, 120) };
    /* três cliques em Confirmar: um pagamento só */
    await T.dorme(750); const b = m.querySelector('[data-ok]'); b.click(); b.click(); b.click(); await T.esperar(() => !document.body.contains(m), 15000); await T.sincronizado();
    const t = T.tit('Boleto do contador'); r.pg = t.pagamentos.map((p) => ({ v: p.valor, d: p.data, c: p.contaId, por: p.por, q: p.quitacao })); r.ob = T.ob(RB); r.pagosDepois = T.pagosDe();
    await T.central('hoje', /Boleto do contador/); r.linha = T.linha(RB); r.semPagar = !document.querySelector('[data-cpgpagar="' + RB + '"]'); r.resumo = T.resumo();
    r.grupos = [...document.querySelectorAll('#cpgCorpo h3.grupo-t')].map((x) => x.textContent.trim());
    return r;
  }, n6.RB);
  ok(n7.janela.conta === '__caixa' && n7.janela.data && /420,00/.test(n7.janela.txt) && n7.pg.length === 1 && n7.pg[0].v === 420 && n7.pg[0].c === '__caixa' && n7.pg[0].por === 'u_DONO' && n7.pg[0].q === true && n7.ob.sit === 'Pago' && n7.ob.saldo === 0 && !n7.ob.extra,
    '7. pagar em dois toques (Pagar → Confirmar): baixa com a data efetiva, a conta de saída e quem pagou; três cliques gravam um pagamento só');
  ok(n7.semPagar && /Pago/.test(n7.linha) && !/extra/.test(n7.linha) && Math.abs(n7.pagosDepois.dia - n7.pagosAntes.dia - 420) < 0.005 && T_num(n7.resumo['Pago no dia']) === n7.pagosDepois.dia && T_num(n7.resumo['Falta pagar']) === 2000 && n7.grupos.some((g) => /^Pagos hoje/.test(g)),
    `7. a situação e os números do dia mudam na hora: pago no dia ${n7.resumo['Pago no dia']}, falta pagar ${n7.resumo['Falta pagar']}`);

  /* 8. conta lançada no módulo, pagamento parcial, saldo, pagamento final e quitação (os testes 1 a 8 de 17/11) */
  const n8 = await page.evaluate(async () => {
    const r = {}; const h = hoje();
    await T.novaConta('#/fGerais', { benef: 'Oficina Mecânica Exemplo', tipo: 'Manutenção', desc: 'Conserto da maromba', valor: '5.000,00', venc: addDias(h, 10) });
    r.fechou = await T.confirmar(); await T.sincronizado(); const t = T.tit('Conserto da maromba'); const R = 't:' + t.id; r.R = R; r.a = T.ob(R);
    /* agendar e alterar a data, pela linha */
    CPG_FIN.UI.f.sit = ''; await T.central('contas', /Conserto da maromba/);
    document.querySelector('[data-cpgag="' + R + '"]').click(); await T.esperar(() => document.querySelector('.veu .modal #cgD')); T.val('#cgD', addDias(h, 4)); r.ag1 = await T.confirmar(); await T.sincronizado(); r.b = T.ob(R);
    await T.central('contas', /Conserto da maromba/); r.rotAg = document.querySelector('[data-cpgag="' + R + '"]').textContent.trim();
    document.querySelector('[data-cpgag="' + R + '"]').click(); await T.esperar(() => document.querySelector('.veu .modal #cgD')); T.val('#cgD', addDias(h, 6)); r.ag2 = await T.confirmar(); await T.sincronizado(); r.c = T.ob(R); r.d6 = addDias(h, 6);
    /* parcial pela janela completa */
    await T.central('contas', /Conserto da maromba/); r.p1 = await T.pagarLinha(R, '3.000,00'); await T.sincronizado(); T.limpar(); r.d = T.ob(R);
    await T.central('contas', /Conserto da maromba/); r.linhaParcial = T.linha(R);
    r.p2 = await T.pagarLinha(R); await T.sincronizado(); T.limpar(); r.e = T.ob(R); r.pg = T.tit('Conserto da maromba').pagamentos.map((p) => p.valor);
    await T.central('contas'); r.somiu = !document.querySelector('#svCorpo tr[data-cpgref="' + R + '"]');
    [...document.querySelectorAll('[data-cpgsit]')].find((b) => b.dataset.cpgsit === 'Pago').click(); await T.dorme(400); r.linhaPaga = T.linha(R); r.semBotao = !document.querySelector('[data-cpgpagar="' + R + '"]') && !document.querySelector('[data-cpgag="' + R + '"]') && !T.temAcao(R, 'cancelar');
    r.n = T.tits('Conserto da maromba').length;
    return r;
  });
  ok(n8.fechou && n8.a.sit === 'Pendente' && n8.a.saldo === 5000 && n8.a.mod === 'gerais' && n8.a.setor === 'producao' && n8.ag1 && n8.b.sit === 'Agendado' && n8.b.pags === 0 && n8.rotAg === 'Editar agendamento' && n8.ag2 && n8.c.prog === n8.d6 && n8.c.saldo === 5000 && n8.n === 1,
    '8. conta lançada pelo módulo (Despesas gerais) entra na Central, é agendada e tem a data alterada sem criar outra conta e sem virar paga');
  ok(n8.p1 && n8.d.sit === 'Parcialmente pago' && n8.d.saldo === 2000 && n8.d.pago === 3000 && /2\.000,00/.test(n8.linhaParcial) && /pago R\$\s?3\.000,00 de R\$\s?5\.000,00/.test(n8.linhaParcial) && n8.p2 && n8.pg.join() === '3000,2000' && n8.e.sit === 'Pago' && n8.e.saldo === 0 && n8.somiu && /Pago/.test(n8.linhaPaga) && n8.semBotao,
    '8. pagamento parcial de R$ 3.000,00 (saldo R$ 2.000,00), pagamento final e quitação: os dois pagamentos ficam guardados e a conta paga não oferece Pagar, Agendar nem Cancelar');

  /* 8b. módulos por dentro da Central: os quadros do alto abrem a lista (pedido do Jeferson de 18/11/2026: "falta pagar" mostra o que
     se deve e "pago" mostra os pagos) */
  const n8b = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fGerais', /Despesas gerais/); await T.dorme(300);
    r.quadros = [...document.querySelectorAll('#svCorpo .cpl-cards [data-cpmq] .rot')].map((x) => x.textContent.trim());
    const qd = async (k) => { document.querySelector('.cpl-cards [data-cpmq="' + k + '"]').click(); await T.dorme(400); return { l: T.refs(), sel: (document.querySelector('.cpl-cards [aria-selected="true"] .rot') || {}).textContent, t: (document.querySelector('#svCorpo .cpm-tit') || {}).textContent || '' }; };
    r.pago = await qd('pago'); r.falta = await qd('falta'); r.abertas = FINANCEIRO_SETOR.obrigacoes().filter((o) => CPG_FIN.moduloDe(o) === 'gerais' && !o.cancelado && o.s.saldo > 0.004).map((o) => o.descricao).sort().join(' | ');
    return r;
  });
  ok(n8b.quadros.join('|') === 'Falta pagar|Em atraso|Agendado|Pago neste mês' && n8b.pago.l.includes('Conserto da maromba') && n8b.pago.sel === 'Pago neste mês' && /^Pagas neste mês/.test(n8b.pago.t)
    && n8b.falta.sel === 'Falta pagar' && !n8b.falta.l.includes('Conserto da maromba') && n8b.falta.l.slice().sort().join(' | ') === n8b.abertas,
    `8b. nos módulos, os quadros do alto abrem a lista: Pago neste mês [${n8b.pago.l.join(' | ')}] · Falta pagar [${n8b.falta.l.join(' | ')}]`, n8b);

  /* 9. cancelar agendamento e cancelar conta; duplicidade */
  const n9 = await page.evaluate(async () => {
    const r = {}; const R = 't:' + T.tit('Internet do escritório').id; CPG_FIN.UI.f.sit = ''; await T.central('contas', /Internet do escritório/);
    r.antes = T.ob(R); T.acaoLinha(R, 'desagendar'); await T.esperar(() => !T.tit('Internet do escritório').dataPrevista); await T.sincronizado(); r.depois = T.ob(R);
    await T.central('contas', /Internet do escritório/); T.acaoLinha(R, 'cancelar'); await T.esperar(() => document.querySelector('.veu .modal #mcM'));
    r.semMotivo = !(await T.confirmar()); T.val('#mcM', 'lançada em duplicidade no teste'); r.cancelou = await T.confirmar(); await T.sincronizado(); T.limpar();
    r.fim = T.ob(R); r.guardada = !!T.tit('Internet do escritório').cancelado; await T.central('contas'); r.some = !document.querySelector('#svCorpo tr[data-cpgref="' + R + '"]');
    /* o mesmo pagamento de novo: avisa e só grava se a pessoa disser que é outro */
    await T.central('hoje'); await T.novo({ desc: 'Gasolina da saveiro', benef: 'Posto Exemplo', valor: '180,00', cat: 'Combustíveis' });
    r.barrou = !(await T.confirmar()); const box = document.querySelector('.veu .modal #npDup'); r.aviso = box && !box.hidden ? document.querySelector('.veu .modal #npDupT').textContent : ''; r.nDup = T.tits('Gasolina da saveiro').length; T.limpar();
    return r;
  });
  ok(n9.antes.sit === 'Agendado' && n9.depois.sit === 'Pendente' && !n9.depois.prog && n9.depois.saldo === 150 && n9.depois.pags === 0, '9. cancelar o agendamento devolve a conta para Pendente, com o mesmo saldo e sem pagamento');
  ok(n9.semMotivo && n9.cancelou && n9.fim.sit === 'Cancelado' && n9.guardada && n9.some, '9. cancelar conta pede o motivo e guarda a conta como Cancelada (não apaga)');
  ok(n9.barrou && /Parece repetido/.test(n9.aviso) && n9.nDup === 1, `9. lançamento duplicado é barrado com aviso (“${n9.aviso.slice(0, 60)}…”) e só grava com a confirmação “é outro pagamento”`);

  /* 10. corrigir classificação errada (com histórico) e reverter a ligação com a Lenha */
  const n10 = await page.evaluate(async (R3) => {
    const r = {}; const L = window.CPL_LENHA; const RZ = 't:' + T.tit('Pagamento ao Zeca').id; CPG_FIN.UI.f.sit = 'todas'; await T.central('contas', /Pagamento ao Zeca/);
    T.acaoLinha(RZ, 'classificar'); await T.esperar(() => document.querySelector('.veu .modal [data-set]')); await T.dorme(150); let m = document.querySelector('.veu .modal'); r.titulo = m.querySelector('h3').textContent; r.atual = (m.querySelector('[data-set].pri') || {}).dataset.set;
    m.querySelector('[data-set="dp"]').click(); await T.esperar(() => !document.body.contains(m), 12000); await T.sincronizado();
    const t = T.tit('Pagamento ao Zeca'); r.z = { s: t.enc.setor, m: t.enc.modo, h: t.enc.hist.length, ult: t.enc.hist[t.enc.hist.length - 1] };
    /* o crédito do Vasco sai da Lenha e depois volta: a conta dele acompanha, sem duplicar */
    r.s0 = L.conta('f_vasco').saldo;
    await T.central('contas', /Adiantamento da madeira/); T.acaoLinha(R3, 'classificar'); await T.esperar(() => document.querySelector('.veu .modal [data-set]')); await T.dorme(150); m = document.querySelector('.veu .modal');
    m.querySelector('[data-set="adm"]').click(); await T.esperar(() => !document.body.contains(m), 12000); await T.sincronizado();
    const a = T.tit('Adiantamento da madeira'); r.fora = { adl: !!a.adiantamentoLenha, saldo: L.conta('f_vasco').saldo, enc: a.enc.setor, pgs: a.pagamentos.length };
    await T.central('contas', /Adiantamento da madeira/); T.acaoLinha(R3, 'classificar'); await T.esperar(() => document.querySelector('.veu .modal [data-set]')); await T.dorme(150); m = document.querySelector('.veu .modal');
    m.querySelector('[data-set="lenha"]').click(); await T.dorme(200); r.pedeForn = !m.querySelector('#clLw').hidden; r.preForn = m.querySelector('#clF').value; r.salvou = await T.confirmar(); await T.sincronizado();
    const b = T.tit('Adiantamento da madeira'); r.volta = { adl: b.adiantamentoLenha && b.adiantamentoLenha.fornecedorId, saldo: L.conta('f_vasco').saldo, enc: b.enc.setor + '/' + b.enc.modo, h: b.enc.hist.length, pgs: b.pagamentos.length, n: T.tits('Adiantamento da madeira').length };
    return r;
  }, n3.R);
  ok(/Corrigir o setor/.test(n10.titulo) && n10.atual === 'adm' && n10.z.s === 'dp' && n10.z.m === 'manual' && n10.z.h === 3 && n10.z.ult.de === 'adm' && n10.z.ult.para === 'dp', '10. classificação errada é corrigida num toque e o histórico guarda de onde para onde (Administrativo → Pessoal), sem apagar o registro anterior');
  ok(n10.s0 === 2000 && !n10.fora.adl && n10.fora.saldo === 3000 && n10.fora.enc === 'adm' && n10.fora.pgs === 1 && n10.pedeForn && n10.preForn === 'f_vasco' && n10.salvou && n10.volta.adl === 'f_vasco' && n10.volta.saldo === 2000 && n10.volta.enc === 'lenha/manual' && n10.volta.h === 3 && n10.volta.pgs === 1 && n10.volta.n === 1,
    '10. tirar o pagamento da Lenha desfaz o crédito (saldo do fornecedor volta a R$ 3.000,00) e devolver refaz (R$ 2.000,00): nada duplica', n10);

  /* 11. indicadores: painel e Central batem com os registros do Financeiro */
  const n11 = await page.evaluate(async () => {
    const r = {}; const h = hoje(); const OS = FINANCEIRO_SETOR.obrigacoes(); const ab = OS.filter((o) => !o.cancelado && o.s.saldo > 0.004);
    const P = T.pagosDe(); const fut = ab.filter((o) => o.dataCal > h); const pendHoje = ab.filter((o) => o.dataCal === h);
    r.esp = { mes: P.mes, n: P.n, dia: P.dia, pendHoje: pendHoje.reduce((s, o) => s + o.s.saldo, 0), fut: Math.round(fut.reduce((s, o) => s + o.s.saldo, 0) * 100) / 100, nFut: fut.length, pend: Math.round(ab.reduce((s, o) => s + o.s.saldo, 0) * 100) / 100, venc: Math.round(ab.filter((o) => o.s.vencido).reduce((s, o) => s + o.s.saldo, 0) * 100) / 100 };
    CPG_FIN.UI.b = ''; CPG_FIN.UI.q = ''; await T.ir('#/setor-financeiro', /Para pagar agora/); await T.dorme(500); r.k = T.kpis();
    /* tocar num indicador do painel abre a lista dele, na própria tela */
    [...document.querySelectorAll('#conteudo .cpg-hero .kpi')].find((k) => k.querySelector('.l').textContent.trim() === 'Agendadas').click(); await T.dorme(500);
    r.tituloAg = document.querySelector('#cpgLista').textContent.trim(); r.listaAg = T.refs().slice().sort(); r.agEsp = ab.filter((o) => o.prog).map((o) => o.descricao).sort();
    CPG_FIN.UI.b = '';
    await T.central('ind', /Despesas por setor/); r.res = T.resumo();
    r.setores = Object.fromEntries([...document.querySelectorAll('#cpgCorpo table.cpg-ind')][0] ? [...[...document.querySelectorAll('#cpgCorpo table.cpg-ind')][0].tBodies[0].rows].filter((tr) => tr.cells.length === 4 && tr.querySelector('a')).map((tr) => [tr.cells[0].textContent.trim(), [tr.cells[1].textContent.trim(), tr.cells[2].textContent.trim()]]) : []);
    r.blocos = [...document.querySelectorAll('#cpgCorpo .bloco h3')].map((x) => x.childNodes[0].textContent.trim());
    r.somaSet = Math.round(Object.values(r.setores).reduce((s, v) => s + (T.num(v[0]) || 0), 0) * 100) / 100;
    /* tocar num setor leva às contas dele */
    [...document.querySelectorAll('#cpgCorpo [data-cpgset]')].find((a) => a.dataset.cpgset === 'combustivel').click(); await T.dorme(500); r.abaSet = (document.querySelector('[data-cpgaba].on') || {}).textContent; r.listaSet = T.refs();
    return r;
  });
  const E = n11.esp, K11 = n11.k;
  ok(T_num(K11['Pago neste mês'].split('|')[0]) === E.mes && T_num(K11['Total pendente'].split('|')[0]) === E.pend && T_num(K11['Pagar hoje'].split('|')[0]) === Math.round(E.pendHoje * 100) / 100 && Object.keys(K11).length === 7,
    `11. painel: pagar hoje ${K11['Pagar hoje']} · pago neste mês ${K11['Pago neste mês']} · total pendente ${K11['Total pendente']} (conferido com os registros)`, { K11, E });
  ok(/^Agendadas/.test(n11.tituloAg) && n11.listaAg.join() === n11.agEsp.join() && n11.listaAg.includes('Conta de energia') && n11.blocos.join('|') === 'Despesas por setor|Pagamentos futuros|Histórico mensal', '11. tocar em “Agendadas” no painel mostra as contas agendadas; a Central tem despesas por setor, pagamentos futuros e histórico mensal', n11);
  ok(Object.keys(n11.res).length === 6 && T_num(Object.entries(n11.res).find(([k]) => /^Pago em/.test(k))[1]) === E.mes && T_num(n11.res['Total pendente']) === E.pend && T_num(n11.res['Total vencido']) === E.venc && T_num(n11.res['Pago hoje']) === E.dia && n11.somaSet === E.mes && n11.setores['Combustível'] && T_num(n11.setores['Combustível'][0]) === 180 && T_num(n11.setores['Lenha'][0]) === 1500 && T_num(n11.setores['Lenha'][1]) === 2000,
    `11. indicadores da Central: ${Object.entries(n11.res).map(([k, v]) => k + ' ' + v).join(' · ')}; a soma do pago por setor fecha com o pago no mês`);
  ok(n11.abaSet === 'Contas' && n11.listaSet.join() === 'Gasolina da saveiro', '11. tocar num setor mostra só as contas dele');

  /* 12. filtros, pesquisa e Pagos */
  const n12 = await page.evaluate(async () => {
    const r = {}; const F = CPG_FIN.UI.f; Object.assign(F, { q: '', sit: '', setor: '', cat: '', benef: '', de: '', ate: '' }); await T.central('contas');
    const chip = async (k) => { [...document.querySelectorAll('[data-cpgsit]')].find((b) => b.dataset.cpgsit === k).click(); await T.dorme(350); return T.refs().slice().sort().join(' | '); };
    r.aberto = await chip(''); r.agend = await chip('Agendado'); r.pago = (await chip('Pago')).split(' | ').length; r.todas = (await chip('todas')).split(' | ').length; r.chips = Object.fromEntries([...document.querySelectorAll('[data-cpgsit]')].map((b) => [b.dataset.cpgsit || 'aberto', +b.querySelector('span').textContent]));
    const sel = (k, v) => { const s = document.querySelector('#cpgCorpo [data-cpgf="' + k + '"]'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); };
    sel('setor', 'lenha'); await T.dorme(400); r.lenha = T.refs().slice().sort().join(' | '); sel('setor', ''); await T.dorme(300);
    sel('cat', 'Outras despesas'); await T.dorme(400); r.cat = T.refs().length; sel('cat', ''); await T.dorme(300);
    sel('sit', '_enc'); await T.dorme(400); r.enc = T.refs().length; sel('sit', '_aguard'); await T.dorme(400); r.aguard = T.refs().length; sel('sit', 'Cancelado'); await T.dorme(400); r.canc = T.refs().join(); sel('sit', 'todas'); await T.dorme(300);
    const q = document.querySelector('#cpgQ'); q.value = 'posto exem'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(750); r.busca = T.refs().join(' | ');
    document.querySelector('#cpgQ').value = ''; document.querySelector('#cpgQ').dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(750);
    /* Pagos: pagamentos realizados, com extras separados */
    Object.assign(CPG_FIN.UI.p, { q: '', de: hoje().slice(0, 7) + '-01', ate: '', setor: '', tipo: '' }); await T.central('pagos', /Total pago no período/);
    r.pagos = { n: document.querySelectorAll('#svCorpo tr[data-pid]').length, res: T.resumo(), esp: T.pagosDe() };
    const s = document.querySelector('#cpgCorpo [data-cpgp="tipo"]'); s.value = 'extra'; s.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(400); r.extras = T.refs().slice().sort();
    Object.assign(CPG_FIN.UI.p, { tipo: '' });
    return r;
  });
  ok(n12.aberto === 'Conta de energia | Lenha de eucalipto' && n12.agend === 'Conta de energia' && n12.pago >= 8 && n12.chips.aberto === 2 && n12.chips.todas === n12.todas && n12.lenha === 'Adiantamento da madeira | Lenha de eucalipto | Lenha do seu Chico' && n12.cat >= 2 && n12.aguard === 0 && n12.canc === 'Internet do escritório' && n12.enc >= 8 && n12.busca === 'Gasolina da saveiro',
    `12. filtros da Central: situação (em aberto [${n12.aberto}] · agendados [${n12.agend}] · cancelados [${n12.canc}]), setor, categoria, encaminhamento e pesquisa por fornecedor`);
  ok(n12.pagos.n === n12.pagos.esp.n && T_num(n12.pagos.res['Total pago no período']) === n12.pagos.esp.mes && +n12.pagos.res.Pagamentos === n12.pagos.esp.n && n12.extras.includes('Gasolina da saveiro') && n12.extras.includes('Pagamento ao Zeca') && !n12.extras.includes('Boleto do contador') && !n12.extras.includes('Conserto da maromba'),
    `12. Pagos: ${n12.pagos.n} pagamentos realizados no mês (${n12.pagos.res['Total pago no período']}); os extras ficam separados do que estava agendado`);

  /* 13. relatório do dia: agendado × pago × extras × pendente, para imprimir, gerar PDF e mandar ao dono */
  const n13 = await page.evaluate(async () => {
    const r = {}; const h = hoje(); const D = CPG_FIN.dadosRelDia(h); const Q = D.Q;
    r.q = { pagos: Q.pagos.length, extras: Q.extras.length, ag: Q.doAg.length, vPago: Q.vPago, vExtra: Q.vExtra, vAg: Q.vAg, pend: Q.pend.length, atras: Q.atras.length };
    r.cols = D.cols.map((c) => c.l); r.linhas = D.rows.map((x) => x.descricao + '|' + x.tipo + '|' + x.setor + '|' + x.por); r.horas = D.rows.map((x) => x.hora); r.extrasT = D.extras.map((x) => x.titulo);
    r.resumo = D.extras[0].itens.map((x) => x.join(': ')); r.txt = CPG_FIN.textoRelDia(h);
    await T.central('hoje'); document.querySelector('#cpgRel').click(); await T.dorme(250); r.menu = [...document.querySelectorAll('.dc-pop [data-i]')].map((b) => b.childNodes[0].textContent.trim());
    [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Visualizar/.test(b.textContent)).click();
    /* todo relatório pergunta quem é o responsável (regra do sistema); o teste confirma a opção marcada */
    await T.esperar(() => location.hash === '#/documento' || document.querySelector('.veu .rr-modal')); if (document.querySelector('.veu .rr-modal')) { r.pergunta = true; await T.dorme(750); document.querySelector('.veu .rr-modal [data-r="1"]').click(); }
    await T.esperar(() => location.hash === '#/documento'); await T.dorme(900);
    r.doc = document.querySelector('#conteudo').textContent.replace(/\s+/g, ' ').slice(0, 6000);
    JBNAV.voltar(); await T.esperar(() => location.hash === '#/fcentral'); await T.dorme(400); r.voltou = (document.querySelector('[data-cpgaba].on') || {}).textContent;
    return r;
  });
  const P13 = n13.q;
  ok(P13.pagos === 10 && P13.extras === 7 && P13.ag === 3 && Math.abs(P13.vPago - (P13.vExtra + P13.vAg)) < 0.005 && P13.vAg === 5420 && n13.cols.join('|') === 'Hora|Fornecedor ou beneficiário|Descrição|Categoria|Setor|Forma|Conta|Tipo|Valor|Lançado por' && n13.horas.length === 10 && n13.horas.every((x) => /^\d\d:\d\d$/.test(x))
    && n13.linhas.some((l) => /^Boleto do contador.*\|Agendado\|Administrativo\|Dono$/.test(l)) && n13.linhas.some((l) => /^Gasolina da saveiro.*\|Extra \(não agendado\)\|Combustível\|Dono$/.test(l)) && n13.extrasT.join('|') === 'Resumo do dia|Ficou sem pagar (estava agendado para o dia)|Pago por setor|Pago por forma e conta',
    `13. relatório do dia: ${P13.pagos} pagamentos (${P13.ag} do que estava agendado e ${P13.extras} extras), com hora, setor, forma, conta e quem lançou`);
  ok(/RELATÓRIO DE PAGAMENTOS DO DIA/i.test(n13.doc) && /Gasolina da saveiro/.test(n13.doc) && /Resumo do dia/i.test(n13.doc) && /Pago por setor/i.test(n13.doc) && n13.menu.join('|') === 'Visualizar o relatório|Gerar PDF|Imprimir|Compartilhar o PDF|Enviar ao dono pelo WhatsApp|Copiar o resumo|Exportar Excel' && /\*Pagamentos do dia/.test(n13.txt) && /Extras \(não agendados\)/.test(n13.txt) && /- Posto Exemplo · Gasolina da saveiro · R\$\s?180,00 · PIX \(extra\)/.test(n13.txt) && n13.voltou === 'Hoje',
    '13. o relatório abre no padrão de documentos da empresa (visualizar, PDF, imprimir, compartilhar) e tem o resumo pronto para o WhatsApp do dono');

  /* 14. rastreabilidade na janela do pagamento */
  const n14 = await page.evaluate(async () => {
    const r = {}; const R = 't:' + T.tit('Pagamento ao Zeca').id; CPG_FIN.UI.f.sit = 'todas'; await T.central('contas', /Pagamento ao Zeca/);
    document.querySelector('#svCorpo tr[data-cpgref="' + R + '"]').click(); await T.esperar(() => document.querySelector('#camada .gaveta')); await T.dorme(400);
    const g = document.querySelector('#camada .gaveta'); r.txt = g.textContent.replace(/\s+/g, ' '); r.hist = [...g.querySelectorAll('.hist .it')].map((x) => x.textContent.replace(/\s+/g, ' ').slice(0, 70)); r.trilha = g.querySelectorAll('.fi-vinc li').length; r.botao = !!g.querySelector('[data-cpgx="classificar"]');
    T.limpar(); return r;
  });
  ok(/Classificação e encaminhamento/.test(n14.txt) && /Cadastrado por\s*Dono/.test(n14.txt) && /Data do cadastro/.test(n14.txt) && /Baixa realizada por\s*Dono/.test(n14.txt) && /Data efetiva do pagamento/.test(n14.txt) && /Setor de destino\s*Setor Pessoal/.test(n14.txt) && /Classificação\s*Manual/.test(n14.txt) && /Encaminhado ao Setor Pessoal/.test(n14.txt) && /Pagamento extra/.test(n14.txt)
    && n14.trilha === 3 && n14.botao && n14.hist.filter((h) => /classificou o setor/.test(h)).length === 2 && n14.hist.some((h) => /registrou pagamento extra/.test(h)),
    '14. cada pagamento guarda o próprio histórico: quem cadastrou e quando, quem deu a baixa e a data efetiva, setor de destino, classificação automática ou manual e a trilha do encaminhamento');

  /* 15. navegação: todas as telas de antes continuam no menu do setor, cada uma na sua entrada; a Agenda e a Central são telas a mais */
  const n15 = await page.evaluate(async () => {
    const r = { rotas: {} }; await T.central('hoje'); const p0 = JBNAV.estado ? JBNAV.estado().pilha.length : 0;
    for (const a of ['agenda', 'contas', 'pagos', 'ind', 'hoje']) { [...document.querySelectorAll('[data-cpgaba]')].find((b) => b.dataset.cpgaba === a).click(); await T.dorme(300); }
    r.abasNaoEmpilham = (JBNAV.estado ? JBNAV.estado().pilha.length : 0) === p0 && location.hash === '#/fcentral';
    for (const [rota, re, rot] of [['#/fagenda', /Agenda de Pagamentos/, 'Agenda de Pagamentos'], ['#/fcentral', /Central de Pagamentos/, 'Central de Pagamentos'], ['#/fdia', /Pagamentos do dia/, 'Pagamentos do dia'], ['#/fcal', /Calendário financeiro/, 'Calendário'], ['#/fpagar', /Contas a pagar/, 'Contas a pagar'], ['#/fpag', /Pagamentos/, 'Pagamentos'],
      ['#/fpainel', /./, 'Indicadores'], ['#/fComb', /Combustível/, 'Contas a pagar – Combustível'], ['#/fGerais', /Despesas gerais/, 'Despesas gerais'], ['#/fOutros', /Outros pagamentos/, 'Outros pagamentos'], ['#/fLenha', /Lenha/, 'Contas a pagar – Lenha']]) {
      await T.ir(rota, re); r.rotas[rota] = { on: ((document.querySelector('.sv-abas a.on') || {}).textContent || '').trim(), esperado: rot }; }
    /* painel: os números abrem a lista; o menu Mais ▾ da linha tem a classificação do setor; o aviso de classificação leva às contas */
    CPG_FIN.UI.b = ''; CPG_FIN.UI.q = ''; await T.ir('#/setor-financeiro', /Para pagar agora/); await T.dorme(400);
    const kpi = async (rot) => { [...document.querySelectorAll('#conteudo .cpg-hero .kpi')].find((k) => k.querySelector('.l').textContent.trim() === rot).click(); await T.dorme(500); return { t: document.querySelector('#cpgLista').textContent.trim(), n: T.refs().length, on: (document.querySelector('#conteudo .cpg-hero .kpi.cpg-on .l') || {}).textContent }; };
    r.kPag = await kpi('Pago neste mês'); r.kTot = await kpi('Total pendente'); r.abertas = FINANCEIRO_SETOR.obrigacoes().filter((o) => !o.cancelado && o.s.saldo > 0.004).length;
    document.querySelector('#cpgTudo') && document.querySelector('#cpgTudo').click(); await T.dorme(400); r.nTot = T.refs().length;
    const mais = [...document.querySelectorAll('#svCorpo [data-cpgmais]')].find((b) => /^t:/.test(b.dataset.cpgmais)); mais.click(); await T.dorme(250); r.menuLinha = [...document.querySelectorAll('.dc-pop [data-i]')].map((b) => b.childNodes[0].textContent.trim()); T.limpar();
    r.colunas = [...document.querySelectorAll('#svCorpo table.cpg-tab thead th')].map((x) => x.textContent.trim()).filter(Boolean).join('|');
    document.querySelector('#cpgNovoP').click(); await T.esperar(() => document.querySelector('.veu .modal #npV')); r.novoP = true; T.limpar();
    await T.ir('#/fGerais', /Despesas gerais/); document.querySelector('#svCorpo a[href="#/setor-financeiro"]').click(); await T.esperar(() => location.hash === '#/setor-financeiro'); r.voltaPainel = location.hash;
    return r;
  });
  ok(n15.abasNaoEmpilham && Object.values(n15.rotas).every((x) => x.on === x.esperado) && n15.voltaPainel === '#/setor-financeiro',
    '15. trocar de parte na Central não cria passo no Voltar; todas as telas de antes continuam no menu, cada uma na sua entrada, e os módulos voltam para o painel', n15.rotas);
  ok(/^Pagas neste mês/.test(n15.kPag.t) && n15.kPag.n > 0 && n15.kPag.on === 'Pago neste mês' && /^Todas em aberto/.test(n15.kTot.t) && n15.kTot.on === 'Total pendente' && n15.nTot === n15.abertas && n15.colunas === 'Data|Conta|Módulo|Valor|Pago|Falta pagar|Situação'
    && n15.menuLinha[0] === 'Histórico e saldo' && n15.menuLinha.some((x) => /Classificar setor|Corrigir setor/.test(x)) && n15.novoP,
    `15. no painel, os números abrem a lista (Pago neste mês: ${n15.kPag.n}; Total pendente: ${n15.nTot}), a lista tem as colunas de antes e o Mais ▾ da linha traz o setor (${n15.menuLinha.join(' · ')})`, n15);

  /* 16. persistência: depois de atualizar a página tudo continua igual */
  const antes16 = await page.evaluate(() => ({ n: DATA.fTitulos.length, pg: T.pagosDe(), encs: DATA.fTitulos.map((t) => t.descricao + ':' + ((t.enc || {}).setor || '-') + '/' + ((t.enc || {}).st || '-')).sort().join(';'), vasco: window.CPL_LENHA.conta('f_vasco').saldo }));
  await page.evaluate(async () => { await T.sincronizado(); const dump = []; window.__srv.estado.docs.forEach((d) => dump.push([d.colecao, d.id, d.dados])); sessionStorage.setItem('__srv_teste', JSON.stringify(dump)); });
  {
    await page.reload(); await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 }); await utilidades();
    const dep16 = await page.evaluate(async () => { await T.ir('#/setor-financeiro', /Central de Pagamentos/); await T.dorme(500); return { n: DATA.fTitulos.length, pg: T.pagosDe(), encs: DATA.fTitulos.map((t) => t.descricao + ':' + ((t.enc || {}).setor || '-') + '/' + ((t.enc || {}).st || '-')).sort().join(';'), vasco: window.CPL_LENHA.conta('f_vasco').saldo, k: Object.keys(T.kpis()).length }; });
    ok(dep16.n === antes16.n && dep16.pg.mes === antes16.pg.mes && dep16.pg.n === antes16.pg.n && dep16.encs === antes16.encs && dep16.vasco === antes16.vasco && dep16.k === 7, `16. depois de atualizar a página: ${dep16.n} contas, ${dep16.pg.n} pagamentos (R$ ${dep16.pg.mes}), setores, encaminhamentos e saldo da Lenha iguais`);
  }

  /* 17. sem duplicados no fim de tudo */
  const n17 = await page.evaluate(() => { const ids = DATA.fTitulos.map((t) => t.id); const nums = DATA.fTitulos.map((t) => t.numero); const pids = DATA.fTitulos.flatMap((t) => (t.pagamentos || []).map((p) => p.id));
    const por = {}; DATA.fTitulos.filter((t) => !t.cancelado).forEach((t) => { por[t.descricao] = (por[t.descricao] || 0) + 1; });
    return { n: ids.length, ids: new Set(ids).size, nums: new Set(nums).size, pids: pids.length, pidsU: new Set(pids).size, rep: Object.entries(por).filter(([, v]) => v > 1).map(([k]) => k), compras: DATA.compras.length }; });
  ok(n17.ids === n17.n && n17.nums === n17.n && n17.pidsU === n17.pids && !n17.rep.length && n17.compras === 1, `17. sem registros duplicados: ${n17.n} contas com números e identificadores únicos, ${n17.pids} pagamentos únicos, nenhuma descrição repetida`);

  /* 18. celular */
  await page.setViewportSize({ width: 390, height: 844 });
  const n18 = await page.evaluate(async () => {
    const r = {}; const med = () => { const se = document.scrollingElement; return { larg: se.scrollWidth, vis: innerWidth }; };
    await T.ir('#/setor-financeiro', /Central de Pagamentos/); await T.dorme(700); r.painel = { ...med(), k: Object.keys(T.kpis()).length, pills: document.querySelectorAll('#conteudo .c2-pill').length, tiles: document.querySelectorAll('#conteudo .c2-tile').length, barra: [...document.querySelectorAll('#c2mob a, #c2mob button')].map((a) => a.textContent.trim()) };
    for (const a of ['hoje', 'agenda', 'contas', 'pagos', 'ind']) { CPG_FIN.UI.cal = 'mes'; await T.central(a); await T.dorme(500); r[a] = med(); }
    CPG_FIN.UI.cal = 'mes'; await T.agenda(); await T.dorme(400); r.agMes = med(); CPG_FIN.UI.cal = 'dia'; CPG_FIN.UI.dia = hoje(); renderTela(); await T.dorme(500); r.agDia = med(); r.fim = [...document.querySelectorAll('#cpgCorpo .cpg-fim button')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    /* cartão da lista no celular: categoria e forma numa linha própria (sem texto emendado) e nenhum trecho de código aparecendo na tela */
    CPG_FIN.UI.p = Object.assign(CPG_FIN.UI.p || {}, { q: '', de: '', ate: '', setor: '', tipo: '' }); await T.central('pagos'); await T.dorme(600);
    const cel = [...document.querySelectorAll('#svCorpo table.cpg-pg .cpg-cel')]; r.cel = { n: cel.length, vis: cel.filter((x) => x.getBoundingClientRect().height > 0).length, txt: cel[0] ? cel[0].textContent : '', emenda: [...document.querySelectorAll('#svCorpo table.cpg-pg td.lc-d1')].some((td) => /\S/.test(getComputedStyle(td, '::after').content.replace(/^none$|"/g, ''))) };
    r.vazou = /\.cpg-[a-z0-9-]+\s*\{|<\/?style|function\s*\(|=>\s*\{/.test(document.body.innerText);
    await T.central('hoje'); document.querySelector('#cpgNovo').click(); await T.esperar(() => document.querySelector('.veu .modal #npV')); await T.dorme(300); const m = document.querySelector('.veu .modal').getBoundingClientRect(); r.modal = { w: Math.round(m.width), dentro: m.left >= 0 && m.right <= innerWidth + 1 }; T.limpar();
    return r;
  });
  await foto('03-celular-hoje');
  ok(n18.painel.larg <= n18.painel.vis + 2 && n18.painel.k === 7 && n18.painel.pills >= 6 && n18.painel.tiles >= 20 && n18.painel.barra.includes('Agenda') && ['hoje', 'agenda', 'contas', 'pagos', 'ind', 'agMes', 'agDia'].every((a) => n18[a].larg <= n18[a].vis + 2) && n18.fim.length === 2 && /não estava agendado/.test(n18.fim[0]) && /Relatório do dia para o dono/.test(n18.fim[1]) && n18.modal.dentro && n18.cel.n > 0 && n18.cel.vis === n18.cel.n && / · /.test(n18.cel.txt) && !n18.cel.emenda && !n18.vazou,
    `18. no celular (390 px) o painel, a Agenda de Pagamentos (com o fechamento do dia), as cinco partes da Central e o Novo pagamento cabem na largura; o cartão mostra categoria e forma (${n18.cel.txt}); barra de baixo: ${n18.painel.barra.join(' · ')}`, n18);

  ok(!erros.length, erros.length ? 'erros de JavaScript: ' + erros.slice(0, 4).join(' | ') : 'nenhum erro de JavaScript durante o teste');
} catch (e) { falhas++; console.error('  ✘ o teste parou: ' + (e && e.message ? e.message.split('\n')[0] : e)); }
finally { await browser.close(); http.close(); }
function T_num(s) { return Math.round(parseFloat(String(s).replace(/[^\d,-]/g, '').replace(',', '.')) * 100) / 100; }
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
