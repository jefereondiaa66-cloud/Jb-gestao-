#!/usr/bin/env node
// Teste de ponta a ponta da Central de pagamentos e dos módulos do Financeiro (17/11/2026), no navegador,
// com o programa REAL (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs).
// Os dados são de teste e só existem no banco simulado, em memória: nada toca o banco de verdade.
// Cobre os 14 testes pedidos pelo Jeferson no "prompt master" do Financeiro:
//   1 cadastrar uma obrigação · 2 localizar o fornecedor · 3 agendar · 4 alterar a data do agendamento
//   5 pagamento parcial · 6 saldo restante · 7 pagamento final · 8 quitação · 9 histórico
//   10 indicadores do painel · 11 filtros e pesquisas · 12 navegação · 13 persistência após atualizar a página
//   14 sem registros duplicados
// e mais: cada conta em um módulo só (Lenha, Combustível, Despesas gerais, Outros pagamentos), agendar não
// marca como pago, cancelar agendamento, cancelar conta, conta que se repete todo mês, tipo novo de conta,
// botões das listas sem cobrir valor e situação, celular.
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
  ['fornecedores', 'f_ofi', { id: 'f_ofi', setor: 'combustivel', nome: 'Oficina Mecânica Exemplo', tipoPessoa: 'Jurídica', situacao: 'Ativo' }],
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
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('dialog', (d) => d.accept());
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
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 200)); },
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
      ir: async (rota, re) => { marcarSetor('financeiro'); document.querySelectorAll('.veu,.dc-pop').forEach((x) => x.remove()); if (GAV) { try { fecharGaveta(true); } catch (e) {} } if (location.hash === rota) renderTela(); else location.hash = rota; await T.esperar(() => (re || /./).test((document.querySelector('#svCorpo') || {}).textContent || '')); await T.dorme(350); },
      val: (sel, v) => { const el = document.querySelector('.veu .modal ' + sel); if (!el) throw new Error('sem campo ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      ultimoToast: () => { const t = [...document.querySelectorAll('#toasts .toast')]; return t.length ? t[t.length - 1].textContent : ''; },
      /* o sistema ignora um segundo clique no mesmo botão em menos de 0,7 s (proteção contra clique duplo): espera como uma pessoa */
      confirmar: async () => { await T.dorme(750); const m = document.querySelector('.veu .modal'); m.querySelector('[data-ok]').click(); await T.esperar(() => !document.body.contains(m) || m.querySelector('[data-ok]:not([disabled])'), 15000); await T.dorme(450); return !document.body.contains(m); },
      tit: (desc) => DATA.fTitulos.find((t) => t.descricao === desc),
      ob: (ref) => { const o = FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === ref); return o ? { valor: o.valor, saldo: o.s.saldo, pago: o.s.pagoEf, sit: CPG_FIN.sitU(o), mod: CPG_FIN.moduloDe(o), prog: o.prog, pags: o.pagamentos.length } : null; },
      linha: (ref) => { const tr = document.querySelector('#svCorpo tr[data-cpgref="' + ref + '"]'); return tr ? tr.textContent.replace(/\s+/g, ' ').trim() : ''; },
      novaConta: async (rota, d) => { await T.ir(rota); document.querySelector('#cpmNova').click(); await T.dorme(200); const pop = document.querySelector('.dc-pop'); if (pop) { [...pop.querySelectorAll('[data-i]')].find((b) => (d.menu || /./).test(b.textContent)).click(); }
        await T.esperar(() => document.querySelector('.veu .modal #ncV')); await T.dorme(120);
        T.val('#ncB', d.benef); if (d.tipo) T.val('#ncT', d.tipo); T.val('#ncDs', d.desc); T.val('#ncV', d.valor); T.val('#ncVc', d.venc); if (d.ag) T.val('#ncAg', d.ag); if (d.mot) T.val('#ncM', d.mot);
        if (d.meses) { const r = document.querySelector('.veu .modal #ncR'); r.click(); T.val('#ncN', String(d.meses)); } },
      pagarLinha: async (ref, valor) => { document.querySelector('[data-cpgpagar="' + ref + '"]').click(); await T.esperar(() => document.querySelector('.veu .modal #mpV')); await T.dorme(120); T.val('#mpV', valor); T.val('#mpC', '__caixa'); return T.confirmar(); },
      kpis: () => Object.fromEntries([...document.querySelectorAll('#svCorpo .cpg-hero .kpi')].map((k) => [k.querySelector('.l').textContent.trim(), k.querySelector('.v').textContent.trim() + ' | ' + ((k.querySelector('.delta') || {}).textContent || '').trim()])),
      mods: () => Object.fromEntries([...document.querySelectorAll('#svCorpo [data-cpgmod]')].map((a) => [a.dataset.cpgmod, a.querySelector('b').textContent.replace(/\s+/g, ' ').trim()])),
      num: (s) => Math.round(parseFloat(String(s).replace(/[^\d,-]/g, '').replace(',', '.')) * 100) / 100,
    };
  });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const foto = async (nome) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); };

  console.log('Central de pagamentos e módulos do Financeiro');
  /* A. a Central abre o setor; os quatro módulos existem */
  const ini = await page.evaluate(async () => {
    await T.ir('#/setor-financeiro', /Para pagar agora/);
    const abas = [...document.querySelectorAll('.sv-abas a')].map((a) => a.textContent.trim());
    return { abas, h1: (document.querySelector('#svCorpo h1') || {}).textContent || '', kpis: Object.keys(T.kpis()), mods: Object.keys(T.mods()), vazio: /Nenhuma conta em aberto/.test(document.querySelector('#svCorpo').textContent) };
  });
  ok(ini.abas[0] === 'Central de pagamentos' && ['Contas a pagar – Lenha', 'Contas a pagar – Combustível', 'Despesas gerais', 'Outros pagamentos', 'Indicadores'].every((x) => ini.abas.includes(x)), `o setor abre na Central e tem os módulos: ${ini.abas.slice(0, 5).join(' · ')}`);
  ok(ini.kpis.join('|') === 'Pagar hoje|Próximos 7 dias|Em atraso|Agendadas|Parcialmente pagas|Pago neste mês|Total pendente' && ini.mods.join() === 'lenha,comb,gerais,outros' && ini.vazio, `indicadores da Central: ${ini.kpis.join(' · ')}`);

  /* 1 e 2. cadastrar uma obrigação e localizar o fornecedor */
  const t1 = await page.evaluate(async () => {
    const lista = async () => { document.querySelector('#cpmNova').click(); await T.esperar(() => document.querySelector('.veu .modal #ncBL')); const o = [...document.querySelectorAll('.veu .modal #ncBL option')].map((x) => x.value); document.querySelectorAll('.veu').forEach((v) => v.remove()); return o; };
    await T.ir('#/fGerais', /Despesas gerais/); const sugest = await lista();
    await T.novaConta('#/fGerais', { benef: 'Oficina Mecânica Exemplo', tipo: 'Manutenção', desc: 'Conserto da maromba', valor: '5.000,00', venc: addDias(hoje(), 10) });
    /* campo obrigatório vazio: não grava e avisa */
    T.val('#ncV', ''); const semValor = !(await T.confirmar()); const aviso = T.ultimoToast(); const n0 = DATA.fTitulos.length;
    T.val('#ncV', '5.000,00'); const fechou = await T.confirmar(); await T.sincronizado();
    const t = T.tit('Conserto da maromba'); await T.ir('#/fGerais', /Conserto da maromba/);
    const q = document.querySelector('#cpmQ'); q.value = 'oficina mec'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(700);
    const achou = [...document.querySelectorAll('#svCorpo tr[data-cpgref]')].map((tr) => tr.dataset.cpgref);
    q.value = 'nao existe isso'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(700); const nada = document.querySelectorAll('#svCorpo tr[data-cpgref]').length;
    document.querySelector('#cpmQ').value = ''; document.querySelector('#cpmQ').dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(700);
    return { sugest, semValor, aviso, n0, fechou, t: t && { id: t.id, numero: t.numero, forn: t.fornecedorId, tipoB: t.beneficiarioTipo, nome: t.beneficiarioNome, cat: t.categoria, valor: t.valor, mod: t.moduloFin, pags: (t.pagamentos || []).length }, n: DATA.fTitulos.length, achou, nada, ob: t && T.ob('t:' + t.id), linha: t && T.linha('t:' + t.id) };
  });
  const R1 = 't:' + (t1.t || {}).id;
  await foto('01-despesas-gerais');
  ok(t1.semValor && /valor/i.test(t1.aviso) && t1.n0 === 0, `1. campo obrigatório vazio não grava e avisa: “${t1.aviso}”`);
  ok(t1.fechou && t1.n === 1 && t1.t && t1.t.valor === 5000 && t1.t.cat === 'Manutenção' && t1.t.mod === 'gerais' && t1.t.numero >= 1 && t1.ob.sit === 'Pendente' && t1.ob.saldo === 5000 && t1.ob.mod === 'gerais', `1. obrigação cadastrada pelo formulário rápido: nº ${t1.t && t1.t.numero}, R$ 5.000,00, Pendente, em Despesas gerais`);
  ok(t1.sugest.includes('Oficina Mecânica Exemplo') && t1.sugest.includes('Posto Exemplo') && t1.t.forn === 'f_ofi' && t1.t.tipoB === 'Fornecedor cadastrado' && t1.achou.join() === R1 && t1.nada === 0, '2. fornecedor localizado: aparece na lista do cadastro, fica ligado ao cadastro dele e a pesquisa da tela encontra a conta');

  /* 3 e 4. agendar e alterar a data do agendamento (agendar não marca como pago) */
  const t3 = await page.evaluate(async (R1) => {
    const d3 = addDias(hoje(), 3), d5 = addDias(hoje(), 5);
    await T.ir('#/fGerais', /Conserto da maromba/);
    const b1 = document.querySelector('[data-cpgag="' + R1 + '"]'); const rot1 = b1.textContent.trim(); b1.click(); await T.esperar(() => document.querySelector('.veu .modal #cgD'));
    T.val('#cgD', addDias(hoje(), -1)); const passado = !(await T.confirmar()); const avisoP = T.ultimoToast();
    T.val('#cgD', d3); const f1 = await T.confirmar(); await T.sincronizado(); const a = T.ob(R1); const linhaA = T.linha(R1);
    const b2 = document.querySelector('[data-cpgag="' + R1 + '"]'); const rot2 = b2.textContent.trim(); b2.click(); await T.esperar(() => document.querySelector('.veu .modal #cgD'));
    const tinhaCancelar = !!document.querySelector('.veu .modal #cgX'); const valorAntes = document.querySelector('.veu .modal #cgD').value;
    T.val('#cgD', d5); const f2 = await T.confirmar(); await T.sincronizado(); const b = T.ob(R1);
    return { rot1, rot2, passado, avisoP, f1, f2, a, b, d3, d5, linhaA, tinhaCancelar, valorAntes, tit: T.tit('Conserto da maromba').dataPrevista, n: DATA.fTitulos.length };
  }, R1);
  ok(t3.rot1 === 'Agendar' && t3.passado && /passado/.test(t3.avisoP) && t3.f1 && t3.a.sit === 'Agendado' && t3.a.prog === t3.d3 && t3.a.saldo === 5000 && t3.a.pags === 0 && /Agendado/.test(t3.linhaA), `3. pagamento agendado para ${t3.d3}: situação Agendado, saldo continua R$ 5.000,00 e nenhum pagamento foi criado`);
  ok(t3.rot2 === 'Editar agendamento' && t3.tinhaCancelar && t3.valorAntes === t3.d3 && t3.f2 && t3.b.prog === t3.d5 && t3.tit === t3.d5 && t3.b.sit === 'Agendado' && t3.b.pags === 0 && t3.n === 1, `4. data do agendamento alterada de ${t3.d3} para ${t3.d5}, sem criar outra conta`);

  /* 5 e 6. pagamento parcial e saldo restante */
  const t5 = await page.evaluate(async (R1) => {
    await T.ir('#/fGerais', /Conserto da maromba/);
    const f = await T.pagarLinha(R1, '3.000,00'); await T.sincronizado(); if (GAV) fecharGaveta(true);
    await T.ir('#/fGerais', /Conserto da maromba/);
    const chips = Object.fromEntries([...document.querySelectorAll('[data-cpms]')].map((b) => [b.dataset.cpms || 'todas', +b.querySelector('span').textContent]));
    return { f, o: T.ob(R1), linha: T.linha(R1), chips, t: T.tit('Conserto da maromba').pagamentos.map((p) => ({ v: p.valor, q: p.quitacao, c: p.contaId })) };
  }, R1);
  ok(t5.f && t5.t.length === 1 && t5.t[0].v === 3000 && t5.t[0].q === false && t5.o.sit === 'Parcialmente pago' && /Parcialmente pago/.test(t5.linha), '5. pagamento parcial de R$ 3.000,00 registrado: situação Parcialmente pago (não fica como pago)');
  ok(t5.o.saldo === 2000 && t5.o.pago === 3000 && /2\.000,00/.test(t5.linha) && t5.chips['Parcialmente pago'] === 1 && t5.chips.aberto === 1 && t5.chips.Pago === 0, `6. saldo restante R$ 2.000,00 (devido 5.000 − pago 3.000) · filtros: ${JSON.stringify(t5.chips)}`);

  /* 7 e 8. pagamento final e quitação */
  const t7 = await page.evaluate(async (R1) => {
    await T.ir('#/fGerais', /Conserto da maromba/);
    const f = await T.pagarLinha(R1, '2.000,00'); await T.sincronizado(); if (GAV) fecharGaveta(true);
    await T.ir('#/fGerais', /Despesas gerais/);
    const aberto = !!document.querySelector('#svCorpo tr[data-cpgref="' + R1 + '"]');
    document.querySelector('[data-cpms="Pago"]').click(); await T.dorme(400);
    const linha = T.linha(R1); const semBotao = !document.querySelector('[data-cpgpagar="' + R1 + '"]') && !document.querySelector('[data-cpgag="' + R1 + '"]');
    return { f, o: T.ob(R1), aberto, linha, semBotao, pg: T.tit('Conserto da maromba').pagamentos.map((p) => p.valor) };
  }, R1);
  ok(t7.f && t7.pg.join() === '3000,2000' && t7.o.saldo === 0 && t7.o.pago === 5000, '7. pagamento final de R$ 2.000,00 registrado: os dois pagamentos ficam guardados (3.000 + 2.000)');
  ok(t7.o.sit === 'Pago' && !t7.aberto && /Pago/.test(t7.linha) && t7.semBotao, '8. quitação confirmada: situação Pago, sai de “Em aberto”, aparece em “Pagas” e não oferece mais Pagar nem Agendar');

  /* 9. histórico */
  const t9 = await page.evaluate(async (R1) => {
    await T.ir('#/fGerais', /Despesas gerais/); document.querySelector('[data-cpms=""]').click(); await T.dorme(400);
    document.querySelector('[data-cpgmais="' + R1 + '"]').click(); await T.dorme(200);
    const menu = [...document.querySelectorAll('.dc-pop [data-i]')].map((b) => b.textContent.trim());
    [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Histórico/.test(b.textContent)).click();
    await T.esperar(() => document.querySelector('#camada .gaveta')); await T.dorme(300);
    const g = document.querySelector('#camada .gaveta'); const txt = g.textContent.replace(/\s+/g, ' ');
    const r = { menu, pagos: g.querySelectorAll('[data-est]').length, txt, hist: g.querySelectorAll('.hist .it').length, acoes: [...g.querySelectorAll('.hist .it')].map((x) => x.textContent.replace(/\s+/g, ' ').slice(0, 60)) };
    fecharGaveta(true); await T.dorme(200); document.querySelector('[data-cpms="aberto"]').click(); return r;
  }, R1);
  ok(t9.menu.some((m) => /Histórico e saldo/.test(m)) && t9.pagos === 2 && /3\.000,00/.test(t9.txt) && /2\.000,00/.test(t9.txt) && /Saldo\s*R\$\s?0,00/.test(t9.txt) && t9.hist >= 4 && t9.acoes.filter((a) => /registrou pagamento/.test(a)).length === 2,
    `9. histórico da conta: 2 pagamentos, saldo e ${t9.hist} registros (criação, agendamentos e pagamentos, com quem e quando)`);

  /* cenário para os indicadores: contas de todos os módulos */
  const cen = await page.evaluate(async () => {
    const h = hoje();
    const falhou = [], avisos = []; const passo = async (rota, d) => { await T.novaConta(rota, d); const tipos = [...document.querySelectorAll('.veu .modal #ncT option')].map((o) => o.value); let f = await T.confirmar(); const box = document.querySelector('.veu .modal #ncDup'); if (!f && box && !box.hidden) { avisos.push(d.desc + ': ' + document.querySelector('.veu .modal #ncDupT').textContent); document.querySelector('.veu .modal #ncDupOk').click(); f = await T.confirmar(); } if (!f) { falhou.push(d.desc + ': ' + T.ultimoToast() + ' [tipos: ' + tipos.join('/') + '] [tipo escolhido: ' + (document.querySelector('.veu .modal #ncT') || {}).value + ']'); document.querySelectorAll('.veu').forEach((v) => v.remove()); } return f; };
    let a = await passo('#/fGerais', { benef: 'Companhia de Energia Exemplo', tipo: 'Energia', desc: 'Conta de energia', valor: '850,00', venc: h });
    a = (await passo('#/fGerais', { benef: 'Companhia de Água Exemplo', tipo: 'Água', desc: 'Conta de água', valor: '120,00', venc: addDias(h, -1) })) && a;
    a = (await passo('#/fGerais', { benef: 'Provedor Exemplo', tipo: 'Internet', desc: 'Internet do escritório', valor: '150,00', venc: addDias(h, 20), ag: addDias(h, 12) })) && a;
    a = (await passo('#/fOutros', { benef: 'Borracharia Exemplo', desc: 'Conserto de pneu', valor: '75,00', venc: addDias(h, 2) })) && a;
    a = (await passo('#/fComb', { menu: /Abastecimento em posto/, benef: 'Posto Exemplo', desc: 'Abastecimento da entrega', valor: '250,00', venc: h, mot: 'Motorista Exemplo' })) && a;
    await T.sincronizado();
    await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5);
    await T.comprar('lenha', 'f_a', 'p_lenha', 40, 75);
    await T.sincronizado();
    const mods = {}; FINANCEIRO_SETOR.obrigacoes().forEach((o) => { (mods[CPG_FIN.moduloDe(o)] = mods[CPG_FIN.moduloDe(o)] || []).push(o.descricao); });
    return { a, falhou, avisos, n: DATA.fTitulos.length, mods, cats: FINANCEIRO_SETOR.h.fcfg().categorias.filter((c) => ['Água', 'Internet'].includes(c)), ent: T.tit('Abastecimento da entrega') };
  });
  ok(cen.avisos.length === 3 && cen.avisos.every((x) => /vencimento/i.test(x)) && /Conta de água: O vencimento é antes/.test(cen.avisos.join()), `contas lançadas vencendo hoje ou antes pedem conferência antes de salvar (${cen.avisos.length} avisos)`);
  ok(cen.a && cen.n === 6 && cen.mods.gerais.length === 4 && cen.mods.outros.join() === 'Conserto de pneu' && cen.mods.comb.length === 2 && cen.mods.lenha.length === 1 && cen.ent.motorista === 'Motorista Exemplo' && cen.ent.fornecedorId === 'f_posto' && cen.cats.join() === 'Água,Internet',
    `${cen.falhou.length ? 'NÃO GRAVOU: ' + cen.falhou.join(' || ') + ' — ' : ''}cada conta cai em um módulo só: Despesas gerais ${cen.mods.gerais.length} · Outros ${cen.mods.outros.length} · Combustível ${cen.mods.comb.length} (compra do setor + abastecimento em posto) · Lenha ${cen.mods.lenha.length}; tipos novos (Água, Internet) entraram nas categorias`);

  /* 10. indicadores do painel */
  const t10 = await page.evaluate(async () => {
    await T.ir('#/setor-financeiro', /Para pagar agora/);
    const k = T.kpis(), m = T.mods(); const linhas = [...document.querySelectorAll('#svCorpo tr[data-cpgref]')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim().slice(0, 70));
    const tit = document.querySelector('#cpgLista').textContent.trim();
    const r = { k, m, linhas, tit, tot: T.num(k['Total pendente'].split('|')[0]), soma: Object.values(m).reduce((s, v) => s + T.num(v), 0) }; return r;
  });
  await foto('02-central');
  const K = t10.k;
  ok(/9\.600,00.*4 contas/.test(K['Pagar hoje']) && /75,00.*1 conta/.test(K['Próximos 7 dias']) && /120,00.*1 conta/.test(K['Em atraso']) && /150,00.*1 conta/.test(K['Agendadas']) && /0,00.*nenhuma/.test(K['Parcialmente pagas']) && /5\.000,00.*1 conta/.test(K['Pago neste mês']) && /9\.945,00.*7 contas/.test(K['Total pendente']),
    `10. indicadores: hoje ${K['Pagar hoje']} · próximos ${K['Próximos 7 dias']} · atraso ${K['Em atraso']} · agendadas ${K['Agendadas']} · pago ${K['Pago neste mês']} · total ${K['Total pendente']}`);
  ok(t10.m.lenha === 'R$ 3.000,00' && t10.m.comb === 'R$ 5.750,00' && t10.m.gerais === 'R$ 1.120,00' && t10.m.outros === 'R$ 75,00' && Math.abs(t10.soma - t10.tot) < 0.005 && t10.linhas.length === 5 && /Companhia de Água/.test(t10.linhas[0]) && /Para pagar agora · R\$\s9\.720,00 · 5 contas/i.test(t10.tit),
    `10. a soma dos módulos (${Object.values(t10.m).join(' + ')}) fecha com o total pendente; “Para pagar agora” traz a atrasada primeiro e as 4 de hoje`);

  /* agendar não é pagar: cancelar agendamento, cancelar conta */
  const tx = await page.evaluate(async () => {
    const r = {}; const ti = T.tit('Internet do escritório'); const R = 't:' + ti.id;
    await T.ir('#/fGerais', /Internet do escritório/);
    r.antes = T.ob(R);
    document.querySelector('[data-cpgmais="' + R + '"]').click(); await T.dorme(200);
    [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Cancelar agendamento/.test(b.textContent)).click(); await T.esperar(() => !T.tit('Internet do escritório').dataPrevista); await T.sincronizado();
    r.depois = T.ob(R);
    /* cancelar a conta (sem pagamento): pede motivo e guarda como cancelada */
    await T.ir('#/fGerais', /Internet do escritório/);
    document.querySelector('[data-cpgmais="' + R + '"]').click(); await T.dorme(200);
    [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Cancelar conta/.test(b.textContent)).click(); await T.esperar(() => document.querySelector('.veu .modal #mcM'));
    r.semMotivo = !(await T.confirmar()); T.val('#mcM', 'lançada em duplicidade no teste'); r.cancelou = await T.confirmar(); await T.sincronizado(); if (GAV) fecharGaveta(true);
    r.fim = T.ob(R); r.guardada = !!T.tit('Internet do escritório') && !!T.tit('Internet do escritório').cancelado;
    await T.ir('#/fGerais', /Despesas gerais/); r.somemAberto = !document.querySelector('#svCorpo tr[data-cpgref="' + R + '"]');
    document.querySelector('[data-cpms="Cancelado"]').click(); await T.dorme(400); r.naCancelada = /Cancelado/.test(T.linha(R)); document.querySelector('[data-cpms="aberto"]').click();
    /* conta já paga não tem "Cancelar conta" */
    const R1 = 't:' + T.tit('Conserto da maromba').id; document.querySelector('[data-cpms=""]').click(); await T.dorme(400);
    document.querySelector('[data-cpgmais="' + R1 + '"]').click(); await T.dorme(200); r.menuPaga = [...document.querySelectorAll('.dc-pop [data-i]')].map((b) => b.textContent.trim()); document.querySelectorAll('.dc-pop').forEach((p) => p.remove());
    document.querySelector('[data-cpms="aberto"]').click();
    return r;
  });
  ok(tx.antes.sit === 'Agendado' && tx.depois.sit === 'Pendente' && !tx.depois.prog && tx.depois.saldo === 150 && tx.depois.pags === 0, 'cancelar o agendamento devolve a conta para Pendente, com o mesmo saldo e sem pagamento');
  ok(tx.semMotivo && tx.cancelou && tx.fim.sit === 'Cancelado' && tx.fim.saldo === 0 && tx.guardada && tx.somemAberto && tx.naCancelada && !tx.menuPaga.some((m) => /Cancelar conta/.test(m)),
    'cancelar conta pede o motivo, guarda a conta como Cancelada (não apaga) e tira do que há para pagar; conta com pagamento não oferece cancelamento');

  /* 11. filtros e pesquisas */
  const t11 = await page.evaluate(async () => {
    const r = {}; const refs = () => [...document.querySelectorAll('#svCorpo tr[data-cpgref]')].map((tr) => (FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === tr.dataset.cpgref) || {}).descricao);
    await T.ir('#/fGerais', /Despesas gerais/);
    for (const f of ['aberto', 'Pendente', 'Agendado', 'Parcialmente pago', 'Vencido', 'Pago', 'Cancelado', '']) { document.querySelector('[data-cpms="' + f + '"]').click(); await T.dorme(300); r[f || 'todas'] = refs().sort().join(' | '); }
    document.querySelector('[data-cpms="aberto"]').click(); await T.dorme(300);
    r.grupos = [...document.querySelectorAll('#svCorpo h3.grupo-t')].map((h) => h.textContent.trim());
    await T.ir('#/setor-financeiro', /Para pagar agora/);
    const clicar = async (rot) => { [...document.querySelectorAll('#svCorpo .cpg-hero .kpi')].find((k) => k.querySelector('.l').textContent.trim() === rot).click(); await T.dorme(450); return { t: document.querySelector('#cpgLista').textContent.trim(), l: refs().sort().join(' | '), on: (document.querySelector('#svCorpo .cpg-hero .kpi.cpg-on .l') || {}).textContent }; };
    r.kHoje = await clicar('Pagar hoje'); r.kProx = await clicar('Próximos 7 dias'); r.kAtr = await clicar('Em atraso'); r.kPag = await clicar('Pago neste mês'); r.kTot = await clicar('Total pendente');
    const q = document.querySelector('#cpgQ'); q.value = 'posto'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(700); r.busca = refs().sort().join(' | ');
    document.querySelector('#cpgQ').value = ''; document.querySelector('#cpgQ').dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(700);
    document.querySelector('[data-cpgb="agora"]').click(); await T.dorme(400); r.volta = document.querySelector('#cpgLista').textContent.trim();
    return r;
  });
  ok(t11.aberto === 'Conta de energia | Conta de água' && t11.Pendente === 'Conta de energia' && t11.Vencido === 'Conta de água' && t11.Pago === 'Conserto da maromba' && t11.Cancelado === 'Internet do escritório' && t11.Agendado === '' && t11['Parcialmente pago'] === '' && t11.todas.split(' | ').length === 4,
    `11. filtros por situação em Despesas gerais: em aberto [${t11.aberto}] · vencidas [${t11.Vencido}] · pagas [${t11.Pago}] · canceladas [${t11.Cancelado}]`);
  ok(t11.grupos.some((g) => /^Energia/i.test(g)) && t11.grupos.some((g) => /^Água/i.test(g)) && /Pagar hoje/.test(t11.kHoje.t) && t11.kHoje.l.split(' | ').length === 4 && t11.kHoje.on === 'Pagar hoje' && t11.kProx.l === 'Conserto de pneu' && t11.kAtr.l === 'Conta de água' && t11.kPag.l === 'Conserto da maromba' && t11.kTot.l.split(' | ').length === 6
    && t11.busca === 'Abastecimento da entrega | Diesel S10' && /Para pagar agora/.test(t11.volta), '11. os números da Central filtram a lista (hoje, próximos 7 dias, atraso, pagas, total) e a pesquisa encontra pelo nome do fornecedor');

  /* 12. navegação entre telas */
  const t12 = await page.evaluate(async () => {
    const r = []; const reg = () => r.push(location.hash);
    await T.ir('#/setor-financeiro', /Para pagar agora/); reg();
    document.querySelector('#svCorpo [data-cpgmod="comb"]').click(); await T.esperar(() => location.hash === '#/fComb'); await T.dorme(400); reg();
    const h1 = document.querySelector('#svCorpo h1').textContent;
    [...document.querySelectorAll('#svCorpo .sec-cab a.btn, #svCorpo .acoes a.btn, #svCorpo a.btn')].find((a) => /Central/.test(a.textContent)).click(); await T.esperar(() => location.hash === '#/setor-financeiro'); await T.dorme(400); reg();
    document.querySelector('#svCorpo [data-cpgmod="lenha"]').click(); await T.esperar(() => location.hash === '#/fLenha'); await T.dorme(400); reg();
    JBNAV.voltar(); await T.esperar(() => location.hash === '#/setor-financeiro'); await T.dorme(400); reg();
    [...document.querySelectorAll('.sv-abas a')].find((a) => a.textContent.trim() === 'Outros pagamentos').click(); await T.esperar(() => location.hash === '#/fOutros'); await T.dorme(400); reg();
    const ativa = (document.querySelector('.sv-abas a.on') || {}).textContent;
    [...document.querySelectorAll('.sv-abas a')].find((a) => a.textContent.trim() === 'Indicadores').click(); await T.esperar(() => location.hash === '#/fpainel'); await T.dorme(500); reg();
    const painel = { h1: document.querySelector('#svCorpo h1').textContent, ativa: (document.querySelector('.sv-abas a.on') || {}).textContent.trim(), graf: !!document.querySelector('#gF1') };
    JBNAV.voltar(); await T.dorme(500); reg(); JBNAV.voltar(); await T.dorme(500); reg();
    /* abrir a conta na origem e voltar para a lista de onde saiu */
    await T.ir('#/fComb', /Combustível/); const ref = [...document.querySelectorAll('#svCorpo tr[data-cpgref]')].map((tr) => tr.dataset.cpgref).find((x) => x.startsWith('c:'));
    document.querySelector('[data-cpgmais="' + ref + '"]').click(); await T.dorme(200); [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Abrir na origem/.test(b.textContent)).click(); await T.dorme(900); const naOrigem = location.hash;
    JBNAV.voltar(); await T.dorme(700); reg();
    return { r, h1, ativa: ativa && ativa.trim(), painel, naOrigem };
  });
  ok(t12.r.slice(0, 7).join(' ') === '#/setor-financeiro #/fComb #/setor-financeiro #/fLenha #/setor-financeiro #/fOutros #/fpainel' && /Combustível/.test(t12.h1) && t12.ativa === 'Outros pagamentos' && t12.painel.ativa === 'Indicadores' && t12.painel.graf
    && t12.r[7] === '#/fOutros' && t12.r[8] === '#/setor-financeiro' && /^#\/compra\//.test(t12.naOrigem) && t12.r[9] === '#/fComb', `12. navegação: Central → módulo → Central → Lenha → Voltar → aba → Indicadores → Voltar, Voltar; “Abrir na origem” volta para a lista (${t12.r.join(' ')})`);

  /* 14. sem registros duplicados: clique repetido, conta repetida, mês a mês */
  const t14 = await page.evaluate(async () => {
    const r = {}; const h = hoje();
    /* clique triplo em Salvar: uma conta só */
    await T.novaConta('#/fOutros', { benef: 'Chaveiro Exemplo', desc: 'Cópia de chaves', valor: '40,00', venc: addDias(h, 4) });
    await T.dorme(750); const b = document.querySelector('.veu .modal [data-ok]'); b.click(); b.click(); b.click(); await T.esperar(() => !document.querySelector('.veu .modal #ncV'), 15000); await T.sincronizado();
    r.triplo = DATA.fTitulos.filter((t) => t.descricao === 'Cópia de chaves').length;
    /* a mesma conta de novo: avisa e só grava com confirmação */
    await T.novaConta('#/fOutros', { benef: 'Chaveiro Exemplo', desc: 'Cópia de chaves', valor: '40,00', venc: addDias(h, 4) });
    r.barrou = !(await T.confirmar()); r.aviso = !document.querySelector('.veu .modal #ncDup').hidden ? document.querySelector('.veu .modal #ncDupT').textContent : '';
    r.depoisAviso = DATA.fTitulos.filter((t) => t.descricao === 'Cópia de chaves').length; document.querySelectorAll('.veu').forEach((v) => v.remove());
    /* conta que se repete todo mês: uma por mês, sem repetir */
    await T.novaConta('#/fGerais', { benef: 'Contador Exemplo', tipo: 'Serviços', desc: 'Honorários do contador', valor: '300,00', venc: addDias(h, 15), meses: 3 });
    r.rec = await T.confirmar(); await T.esperar(() => DATA.fTitulos.filter((t) => t.descricao === 'Honorários do contador').length === 3, 12000); await T.sincronizado();
    const hs = DATA.fTitulos.filter((t) => t.descricao === 'Honorários do contador').sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    r.meses = hs.map((t) => t.vencimento); r.parc = hs.map((t) => t.parcela + '/' + t.parcelas).join(); r.valores = hs.map((t) => t.valor).join(); r.esperado = [0, 1, 2].map((i) => addMeses(addDias(h, 15), i));
    r.nums = DATA.fTitulos.map((t) => t.numero); r.ids = DATA.fTitulos.map((t) => t.id);
    r.pags = DATA.fTitulos.flatMap((t) => (t.pagamentos || []).map((p) => p.id));
    r.total = DATA.fTitulos.length;
    return r;
  });
  ok(t14.triplo === 1 && t14.barrou && /repetid|mesmo benefici/i.test(t14.aviso) && t14.depoisAviso === 1, `14. clique triplo em Salvar grava uma conta só, e a mesma conta de novo é barrada com aviso (“${t14.aviso.slice(0, 60)}…”)`);
  ok(t14.rec && t14.meses.join() === t14.esperado.join() && t14.parc === '1/3,2/3,3/3' && t14.valores === '300,300,300' && t14.total === 10 && new Set(t14.nums).size === t14.nums.length && new Set(t14.ids).size === t14.ids.length && new Set(t14.pags).size === 2,
    `14. conta mensal cria uma por mês (${t14.meses.join(', ')}); ${t14.total} contas com números e identificadores únicos e 2 pagamentos ao todo`);

  /* botões das listas não cobrem o valor nem a situação (cartões) */
  const lay = await page.evaluate(async () => {
    const medir = async (rota, re) => { await T.ir(rota, re); await T.dorme(500); let ruim = 0, n = 0;
      document.querySelectorAll('#svCorpo table.lc tbody tr').forEach((tr) => { const a = tr.querySelector('td.lc-a'); const s = tr.querySelector('td.lc-s .tag'); const v = tr.querySelector('td.lc-v'); if (!a || !a.children.length) return; n++;
        const ra = a.children[0].getBoundingClientRect(); [s, v].forEach((e) => { if (!e) return; const re2 = e.getBoundingClientRect(); if (re2.width && re2.right > ra.left + 1 && re2.left < a.lastElementChild.getBoundingClientRect().right && Math.abs((re2.top + re2.bottom) / 2 - (ra.top + ra.bottom) / 2) < 14) ruim++; }); });
      const tit = [...document.querySelectorAll('#svCorpo table.lc tbody tr td.lc-t')].map((t) => t.dataset.l); return { n, ruim, tit: [...new Set(tit)].join() }; };
    return { central: await medir('#/setor-financeiro', /Para pagar agora/), gerais: await medir('#/fGerais', /Despesas gerais/), dia: await medir('#/fdia', /Pagamentos do dia/), pag: await medir('#/fpag', /Pagamentos/) };
  });
  ok(Object.values(lay).every((x) => x.n > 0 && x.ruim === 0) && lay.dia.tit === 'Compromisso' && lay.pag.tit === 'Compromisso' && lay.gerais.tit === 'Conta',
    `listas em cartões: os botões não cobrem valor nem situação (Central ${lay.central.n}, Despesas gerais ${lay.gerais.n}, Pagamentos do dia ${lay.dia.n}, Pagamentos ${lay.pag.n} linhas) e o título do cartão é quem recebe`);

  /* situações com nome simples nas telas antigas */
  const nomes = await page.evaluate(async () => {
    await T.ir('#/fpagar', /Contas a pagar/); const sel = document.querySelector('#fpS'); if (sel.value !== '') { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(500); }
    const tags = [...new Set([...document.querySelectorAll('#svCorpo td[data-l="Situação"] .tag')].map((t) => t.textContent.trim()))];
    const ops = [...document.querySelectorAll('#fpS option')].map((o) => o.textContent.trim());
    return { tags, ops };
  });
  ok(nomes.tags.includes('Pago') && nomes.tags.includes('Pendente') && !nomes.tags.some((t) => /Pago informado|Programado|^Parcial$/.test(t)) && nomes.ops.includes('Agendado') && nomes.ops.includes('Parcialmente pago'),
    `Contas a pagar usa os mesmos nomes simples: ${nomes.tags.join(' · ')}`);

  /* 13. persistência após atualizar a página */
  const antes = await page.evaluate(async () => { await T.sincronizado(); await T.ir('#/setor-financeiro', /Para pagar agora/);
    const dump = []; window.__srv.estado.docs.forEach((d) => dump.push([d.colecao, d.id, d.dados])); sessionStorage.setItem('__srv_teste', JSON.stringify(dump));
    return { k: T.kpis(), m: T.mods(), n: DATA.fTitulos.length, ob: FINANCEIRO_SETOR.obrigacoes().map((o) => o.ref + '=' + CPG_FIN.sitU(o) + ':' + o.s.saldo).sort().join(';') }; });
  await page.reload();
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const depois = await page.evaluate(async () => { await T.ir('#/setor-financeiro', /Para pagar agora/);
    const t = T.tit('Conserto da maromba');
    return { k: T.kpis(), m: T.mods(), n: DATA.fTitulos.length, ob: FINANCEIRO_SETOR.obrigacoes().map((o) => o.ref + '=' + CPG_FIN.sitU(o) + ':' + o.s.saldo).sort().join(';'), pg: t.pagamentos.map((p) => p.valor).join(), canc: !!T.tit('Internet do escritório').cancelado }; });
  ok(JSON.stringify(antes.k) === JSON.stringify(depois.k) && JSON.stringify(antes.m) === JSON.stringify(depois.m) && antes.n === depois.n && antes.ob === depois.ob && depois.pg === '3000,2000' && depois.canc,
    `13. depois de atualizar a página tudo continua igual: ${depois.n} contas, pagamentos 3.000 + 2.000, cancelamento, indicadores e saldos (total pendente ${depois.k['Total pendente']})`);

  /* celular */
  await page.setViewportSize({ width: 390, height: 844 });
  const cel = await page.evaluate(async () => { const r = {};
    for (const [rota, re] of [['#/setor-financeiro', /Para pagar agora/], ['#/fGerais', /Despesas gerais/], ['#/fComb', /Combustível/], ['#/fOutros', /Outros pagamentos/]]) { await T.ir(rota, re); await T.dorme(400); const se = document.scrollingElement; r[rota] = { larg: se.scrollWidth, vis: innerWidth, pagar: document.querySelectorAll('[data-cpgpagar]').length, kpiQuebra: [...document.querySelectorAll('.cpg-hero .kpi .v')].some((v) => v.getBoundingClientRect().height > 40) }; }
    return r; });
  await foto('03-central-celular');
  ok(Object.values(cel).every((x) => x.larg <= x.vis + 2 && !x.kpiQuebra) && cel['#/setor-financeiro'].pagar > 0, `no celular (390 px) as telas cabem na largura e os valores dos indicadores ficam numa linha só`);
  ok(erros.length === 0, `nenhum erro de JavaScript durante o teste${erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''}`);
} catch (e) { console.error('  ✘ erro no teste:', e && e.message ? e.message.slice(0, 600) : e); falhas++; }
finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
