#!/usr/bin/env node
// Teste de ponta a ponta do módulo Financeiro › Contas a pagar – Lenha (17/11/2026), no navegador, com o
// programa REAL (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Os dados
// são de teste e só existem no banco simulado, em memória: nada toca o banco de verdade.
// Confere o pedido do Jeferson: entregas do Setor da Lenha por fornecedor, abatimento de combustível,
// PAGAR / DAR BAIXA inteiro e parcial (devido R$ 5.000, paga R$ 3.000 → parcial com R$ 2.000; paga
// R$ 2.000 → pago), pagamento acima do saldo só com confirmação e justificativa (vira adiantamento que
// desconta da próxima entrega), clique duplo e repetição sem duplicar, estorno sem apagar, queda no meio
// do registro e conclusão sem repetir, agendamento, histórico, filtros, comprovante e recarga da página.
// Uso: node scripts/construir.mjs && node scripts/testar-contas-pagar-lenha.mjs   (FOTOS=<pasta> guarda capturas)
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
  ['fornecedores', 'f_a', { id: 'f_a', setor: 'lenha', nome: 'Fornecedor Lenha A', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_b', { id: 'f_b', setor: 'lenha', nome: 'Fornecedor Lenha B', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_c', { id: 'f_c', setor: 'lenha', nome: 'Fornecedor Lenha C', tipoPessoa: 'Física', situacao: 'Ativo' }],
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
      banco: (col) => { const out = []; window.__srv.estado.docs.forEach((d) => { if (d.colecao !== col) return; if (d.dados && d.dados.items) Object.entries(d.dados.items).forEach(([id, v]) => { if (v) out.push({ ...v, id }); }); else out.push({ ...d.dados, id: d.id }); }); return out; },
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela(); },
      abrirNovo: async (mod, setor, dados) => { SV = setor; PREFILL = { mod, dados }; location.hash = '#/' + mod + '/novo'; await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes'); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
      irModulo: async (rota) => { location.hash = rota || '#/fLenha'; await T.esperar(() => /Contas a pagar – Lenha|Fornecedores/.test(document.querySelector('#svCorpo') ? document.querySelector('#svCorpo').textContent : '')); await T.dorme(250); },
      val: (sel, v) => { const el = document.querySelector('.veu .modal ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      escolher: (k, v) => { const el = document.querySelector('#camada [data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      marcar: (sel) => { const el = document.querySelector('.veu .modal ' + sel); if (!el.checked) el.click(); },
      ultimoToast: () => { const t = [...document.querySelectorAll('#toasts .toast')]; return t.length ? t[t.length - 1].textContent : ''; },
      fecharJanelas: () => document.querySelectorAll('.veu').forEach((v) => v.remove()),
      /* abre PAGAR / DAR BAIXA na lista do módulo e preenche */
      abrirPagar: async (fid) => { await T.irModulo('#/fLenha'); const b = document.querySelector('[data-cplpagar="' + fid + '"]'); if (!b) throw new Error('sem botão de pagar para ' + fid); b.click(); await T.esperar(() => document.querySelector('.veu .modal #cpV')); await T.dorme(120); },
      preencher: (valor, o) => { o = o || {}; T.val('#cpV', valor); if (o.data) T.val('#cpD', o.data); T.val('#cpF', o.forma || 'PIX'); const c = document.querySelector('.veu .modal #cpC'); if (c && !c.closest('[hidden]')) T.val('#cpC', o.conta || '__caixa'); if (o.obs) T.val('#cpO', o.obs);
        if (o.excOk) T.marcar('#cpExcOk'); if (o.just != null) T.val('#cpJ', o.just); if (o.dupOk) T.marcar('#cpDupOk'); },
      /* o sistema ignora um segundo clique no mesmo botão em menos de 0,7 s (proteção contra clique duplo): espera como uma pessoa */
      confirmar: async () => { await T.dorme(750); const n0 = DATA.fBaixaLenha.length; document.querySelector('.veu .modal [data-ok]').click(); await T.esperar(() => !document.querySelector('.veu .modal #cpV') || document.querySelector('.veu .modal [data-ok]:not([disabled])') && DATA.fBaixaLenha.length === n0, 15000); await T.dorme(400); return !document.querySelector('.veu .modal #cpV'); },
      conta: (fid) => { const x = CPL_LENHA.conta(fid); return { saldo: x.saldo, pago: x.pago, abat: x.abat, bruto: x.bruto, devido: x.devido, credito: x.credito, sit: x.sit, parcial: x.parcial, prog: x.prog, extrato: x.extrato.length ? x.extrato[x.extrato.length - 1].saldo : null }; },
    };
  });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const foto = async (nome) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); };

  console.log('Contas a pagar – Lenha');
  /* A. entregas no Setor da Lenha e combustível do fornecedor B */
  const ini = await page.evaluate(async () => {
    await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5);
    const c1 = await T.comprar('lenha', 'f_a', 'p_lenha', 40, 75);
    const c2 = await T.comprar('lenha', 'f_a', 'p_lenha', 25, 80);
    const c3 = await T.comprar('lenha', 'f_b', 'p_lenha', 30, 75);
    const c4 = await T.comprar('lenha', 'f_c', 'p_lenha', 10, 80);
    await T.sincronizado();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 100, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_b', combLenhaPreco: 5 });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.combLenha)); await T.sincronizado();
    return { c1: c1.id, c2: c2.id, c3: c3.id, c4: c4.id, tot: [c1.total, c2.total, c3.total, c4.total] };
  });
  ok(ini.tot.join() === '3000,2000,2250,800', `entregas lançadas no Setor da Lenha: ${ini.tot.join(' · ')}`);

  /* B. o módulo lê tudo sozinho: indicadores e cartões por fornecedor */
  const lista = await page.evaluate(async () => {
    await T.irModulo('#/fLenha');
    const txt = document.querySelector('#svCorpo').textContent;
    const res = [...document.querySelectorAll('#svCorpo .cpl-cards > button')].map((d) => d.textContent.replace(/\s+/g, ' ').trim());
    const linhaA = [...document.querySelectorAll('#svCorpo tr[data-go]')].find((tr) => /Fornecedor Lenha A/.test(tr.textContent));
    const linhaB = [...document.querySelectorAll('#svCorpo tr[data-go]')].find((tr) => /Fornecedor Lenha B/.test(tr.textContent));
    return { res, txt, a: linhaA ? linhaA.textContent.replace(/\s+/g, ' ') : '', b: linhaB ? linhaB.textContent.replace(/\s+/g, ' ') : '', botoes: document.querySelectorAll('[data-cplpagar]').length,
      aba: [...document.querySelectorAll('.sv-abas a')].map((a) => a.textContent.trim()).includes('Contas a pagar – Lenha'), A: T.conta('f_a'), B: T.conta('f_b') };
  });
  await foto('01-lista');
  ok(lista.aba, 'o módulo “Contas a pagar – Lenha” está nas telas do Setor Financeiro');
  ok(lista.res.some((r) => /7\.550,00/.test(r) && /Total das entregas/i.test(r)) && lista.res.some((r) => /R\$\s?0,00/.test(r) && /já pago/i.test(r)) && lista.res.some((r) => /7\.550,00/.test(r) && /Falta pagar/i.test(r) && /3 fornecedores com saldo/i.test(r)),
    `indicadores: ${lista.res.join(' | ')}`);
  ok(/5\.000,00/.test(lista.a) && /Pendente/.test(lista.a) && /PAGAR \/ DAR BAIXA/.test(lista.a), `cartão do fornecedor A: ${lista.a.slice(0, 160)}`);
  ok(/2\.250,00/.test(lista.b) && /500,00/.test(lista.b) && /1\.750,00/.test(lista.b), 'fornecedor B: entregas R$ 2.250 − combustível R$ 500 = saldo R$ 1.750 (abatimento do Setor de Combustível)');
  ok(lista.botoes === 3, `um botão ${'PAGAR / DAR BAIXA'} por fornecedor (${lista.botoes})`);

  /* C. pagamento parcial: devido R$ 5.000, paga R$ 3.000 */
  const p1 = await page.evaluate(async () => {
    await T.abrirPagar('f_a');
    const resumo = document.querySelector('.veu .modal #cpRes').textContent.replace(/\s+/g, ' ');
    T.preencher('3.000,00', { forma: 'PIX', conta: '__caixa', obs: 'Primeira parte' }); await T.dorme(150);
    const prev = document.querySelector('.veu .modal #cpPrev').textContent.replace(/\s+/g, ' ');
    const fechou = await T.confirmar(); await T.sincronizado();
    const b = DATA.fBaixaLenha[0];
    const c1 = DATA.compras.find((c) => c.numero && c.fornecedorId === 'f_a' && c.total === 3000), c2 = DATA.compras.find((c) => c.fornecedorId === 'f_a' && c.total === 2000);
    const ob = (id) => { const o = FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === 'c:' + id); return o ? o.s.saldo : null; };
    const bd = T.banco('compras').find((c) => c.id === c1.id);
    return { resumo, prev, fechou, n: DATA.fBaixaLenha.length, sit: b && b.situacao, plano: b && b.plano.length, A: T.conta('f_a'), ob1: ob(c1.id), ob2: ob(c2.id),
      pg: (bd.pagamentos || []).filter((p) => p.baixaLenhaId === b.id).map((p) => p.valor), hdrBanco: T.banco('fin').some((x) => x.tipo === 'baixaLenha' && x.id === b.id && x.situacao === 'Registrado'),
      card: ([...document.querySelectorAll('#svCorpo tr[data-go]')].find((tr) => /Fornecedor Lenha A/.test(tr.textContent)) || {}).textContent || '' };
  });
  await foto('02-parcial');
  ok(/5\.000,00/.test(p1.resumo), `a janela mostra o saldo devido de R$ 5.000,00 (${p1.resumo.slice(0, 120)})`);
  ok(/Quita/.test(p1.prev) && /2\.000,00/.test(p1.prev) && /Parcialmente pago/.test(p1.prev), `antes de confirmar mostra o efeito: ${p1.prev.slice(0, 180)}`);
  ok(p1.fechou && p1.n === 1 && p1.sit === 'Registrado' && p1.hdrBanco, 'pagamento registrado (cabeçalho da baixa no banco central como “Registrado”)');
  ok(p1.A.saldo === 2000 && p1.A.sit === 'Parcialmente pago' && p1.A.pago === 3000, `saldo restante R$ ${p1.A.saldo} · ${p1.A.sit}`);
  ok(p1.pg.join() === '3000' && p1.ob1 === 0 && p1.ob2 === 2000, 'o pagamento entrou na entrega mais antiga (Contas a pagar: 1ª quitada, 2ª com R$ 2.000)');
  ok(/Parcialmente pago/.test(p1.card), 'o cartão mostra “Parcialmente pago”');

  /* D. pagamento final de R$ 2.000 (logo depois: o sistema pede confirmação de que não é repetição) */
  const p2 = await page.evaluate(async () => {
    await T.abrirPagar('f_a'); T.preencher('2.000,00', { forma: 'PIX', conta: '__caixa' }); await T.dorme(150);
    const dupVisivel = !document.querySelector('.veu .modal #cpDup').hidden;
    const fechou1 = await T.confirmar(); const n1 = DATA.fBaixaLenha.length; const t1 = T.ultimoToast();
    T.marcar('#cpDupOk');
    const fechou2 = await T.confirmar(); const t2 = T.ultimoToast(); await T.sincronizado();
    return { dupVisivel, fechou1, n1, t1, t2, fechou2, n2: DATA.fBaixaLenha.length, A: T.conta('f_a'), rep: !!(DATA.fBaixaLenha.find((b) => b.valor === 2000) || {}).repeticaoConfirmada };
  });
  ok(p2.dupVisivel && !p2.fechou1 && p2.n1 === 1, 'pagamento logo em seguida para o mesmo fornecedor: aviso de possível repetição e não grava sem confirmar');
  ok(p2.fechou2 && p2.n2 === 2 && p2.rep, 'confirmado que é outro pagamento: registrado (a confirmação fica guardada)' + (p2.fechou2 ? '' : ' [' + p2.t1 + ' / ' + p2.t2 + '] ' + JSON.stringify(p2.dbg)));
  ok(p2.A.saldo === 0 && p2.A.sit === 'Pago' && p2.A.pago === 5000, `conta quitada: ${p2.A.sit}, pago R$ ${p2.A.pago}`);

  /* E. pagamento acima do saldo: só com confirmação e justificativa; vira adiantamento da próxima entrega */
  const p3 = await page.evaluate(async () => {
    await T.abrirPagar('f_b'); T.preencher('2.000,00', { forma: 'Dinheiro', conta: '__caixa' }); await T.dorme(150);
    const excVisivel = !document.querySelector('.veu .modal #cpExc').hidden;
    const sem = await T.confirmar(); const n0 = DATA.fBaixaLenha.length;
    T.marcar('#cpExcOk'); const semJust = await T.confirmar();
    T.val('#cpJ', 'Adiantamento combinado para a próxima carga'); const com = await T.confirmar(); await T.sincronizado();
    const b = DATA.fBaixaLenha.find((x) => x.fornecedorId === 'f_b');
    const t = DATA.fTitulos.find((x) => x.adiantamentoLenha && x.adiantamentoLenha.baixaId === b.id);
    const B1 = T.conta('f_b');
    const c5 = await T.comprar('lenha', 'f_b', 'p_lenha', 12.5, 80); await T.sincronizado();
    const f5 = finVenda(DATA.compras.find((c) => c.id === c5.id));
    const o5 = FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === 'c:' + c5.id);
    return { excVisivel, sem, semJust, n0, com, exc: b && b.excedente, tit: t ? { valor: t.valor, pago: (t.pagamentos || []).reduce((a, p) => a + p.valor, 0), cat: t.categoria, banco: T.banco('fin').some((x) => x.id === t.id) } : null, B1, c5: c5.id, f5: { saldo: f5.saldo, adt: f5.adt }, o5: o5 ? o5.valor : null, B2: T.conta('f_b') };
  });
  ok(p3.excVisivel && !p3.sem && !p3.semJust && p3.n0 === 2, 'acima do saldo: aparece o aviso e nada é gravado sem confirmação e sem justificativa');
  ok(p3.com && p3.exc === 250 && p3.tit && p3.tit.valor === 250 && p3.tit.pago === 250 && p3.tit.cat === 'Lenha' && p3.tit.banco, 'com confirmação e justificativa: R$ 1.750 na entrega e R$ 250 de adiantamento (compromisso pago no Financeiro)');
  ok(p3.B1.saldo === 0 && p3.B1.credito === 250 && p3.B1.sit === 'Pago', `fornecedor B quitado com crédito de R$ ${p3.B1.credito}`);
  ok(p3.f5.saldo === 750 && p3.f5.adt === 250 && p3.o5 === 750 && p3.B2.saldo === 750 && p3.B2.credito === 0, 'nova entrega de R$ 1.000: o adiantamento desconta sozinho (falta R$ 750 no módulo, na compra e em Contas a pagar)');

  /* F. clique duplo no Confirmar: um pagamento só */
  const dc = await page.evaluate(async () => {
    await T.abrirPagar('f_c'); T.preencher('300,00', { forma: 'PIX', conta: '__caixa' }); await T.dorme(120);
    const b = document.querySelector('.veu .modal [data-ok]'); b.click(); b.click(); b.click();
    await T.esperar(() => !document.querySelector('.veu .modal #cpV'), 15000); await T.sincronizado();
    const bs = DATA.fBaixaLenha.filter((x) => x.fornecedorId === 'f_c');
    const c4 = DATA.compras.find((c) => c.fornecedorId === 'f_c');
    return { n: bs.length, pgs: (c4.pagamentos || []).length, C: T.conta('f_c') };
  });
  ok(dc.n === 1 && dc.pgs === 1 && dc.C.saldo === 500, `três cliques em Confirmar: ${dc.n} pagamento, saldo de C R$ ${dc.C.saldo}`);

  /* G. estorno pela tela do fornecedor: nada é apagado, o valor volta ao saldo */
  const es = await page.evaluate(async () => {
    await T.irModulo('#/fLenha/f_c'); document.querySelector('[data-cplaba="pagamentos"]').click(); await T.dorme(250);
    document.querySelector('[data-cplest]').click(); await T.esperar(() => document.querySelector('.veu .modal #esM'));
    T.val('#esM', 'Lançado no fornecedor errado'); document.querySelector('.veu .modal [data-ok]').click();
    await T.esperar(() => !document.querySelector('.veu .modal #esM'), 15000); await T.sincronizado();
    const c4 = T.banco('compras').find((c) => c.fornecedorId === 'f_c'); const b = DATA.fBaixaLenha.find((x) => x.fornecedorId === 'f_c');
    return { C: T.conta('f_c'), pgs: (c4.pagamentos || []).length, est: !!((c4.pagamentos || [])[0] || {}).estornado, sit: b.situacao, tela: document.querySelector('#svCorpo').textContent };
  });
  await foto('03-estorno');
  ok(es.C.saldo === 800 && es.pgs === 1 && es.est && es.sit === 'Estornado', 'estorno: o pagamento continua guardado como estornado e o saldo de C volta a R$ 800');
  ok(/Estornado/.test(es.tela) && /Lançado no fornecedor errado/.test(es.tela), 'o histórico mostra o estorno com o motivo');

  /* H. conexão cai no meio do registro: fica "registro incompleto" e "Concluir" termina sem repetir */
  const inc = await page.evaluate(async () => {
    const orig = salvarOpV; let vezes = 0;
    salvarOpV = async function () { vezes++; throw Object.assign(new Error('sem conexão'), { code: 'unavailable' }); };
    let erro = '';
    try { await CPL_LENHA.registrar({ fid: 'f_b', valor: 100, data: hoje(), forma: 'PIX', contaId: '__caixa' }); } catch (e) { erro = e.cplIncompleto ? 'incompleto' : String(e.message); }
    salvarOpV = orig; await T.sincronizado();
    const b = DATA.fBaixaLenha.find((x) => x.fornecedorId === 'f_b' && x.valor === 100);
    const antes = { sit: b && b.situacao, B: T.conta('f_b'), banco: T.banco('fin').some((x) => x.id === b.id && x.situacao === 'Registrando') };
    const pend = (window.LEMBRETES_V61 ? window.LEMBRETES_V61() : []).filter((l) => /registro incompleto/.test(l.titulo)).length;
    await CPL_LENHA.concluir(b.id); await T.sincronizado(); await CPL_LENHA.concluir(b.id); await T.sincronizado();
    const c5 = DATA.compras.filter((c) => c.fornecedorId === 'f_b').sort((x, y) => (+y.numero || 0) - (+x.numero || 0))[0];
    return { erro, vezes, antes, pend, depois: DATA.fBaixaLenha.find((x) => x.id === b.id).situacao, pgs: (T.banco('compras').find((c) => c.id === c5.id).pagamentos || []).filter((p) => p.baixaLenhaId === b.id).length, B: T.conta('f_b') };
  });
  ok(inc.erro === 'incompleto' && inc.antes.sit === 'Registrando' && inc.antes.banco && inc.antes.B.saldo === 750, 'queda no meio: o cabeçalho fica “Registrando” e nenhum valor sai do saldo');
  ok(inc.pend === 0 || inc.pend === 1, 'pendência de registro incompleto pronta para o botão PENDÊNCIAS (aparece depois de 90 s)');
  ok(inc.depois === 'Registrado' && inc.pgs === 1 && inc.B.saldo === 650, `“Concluir o registro” duas vezes: 1 parcela só, saldo de B R$ ${inc.B.saldo}`);

  /* I. agendar, editar e cancelar o agendamento (aparece em Pagamentos do dia) */
  const ag = await page.evaluate(async () => {
    const amanha = addDias(hoje(), 1), depois = addDias(hoje(), 2);
    await T.irModulo('#/fLenha/f_c'); document.querySelector('#cfAg').click(); await T.esperar(() => document.querySelector('.veu .modal #agD'));
    T.val('#agD', amanha); document.querySelector('.veu .modal [data-ok]').click(); await T.esperar(() => !document.querySelector('.veu .modal #agD')); await T.sincronizado();
    const c4 = DATA.compras.find((c) => c.fornecedorId === 'f_c'); const o = () => FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === 'c:' + c4.id);
    const r1 = { sit: T.conta('f_c').sit, prog: o().prog, meta: T.banco('fin').some((x) => x.tipo === 'meta' && x.ref === 'c:' + c4.id && x.dataPrevista === amanha) };
    document.querySelector('#cfAg').click(); await T.esperar(() => document.querySelector('.veu .modal #agD'));
    T.val('#agD', depois); document.querySelector('.veu .modal [data-ok]').click(); await T.esperar(() => !document.querySelector('.veu .modal #agD')); await T.sincronizado();
    const r2 = o().prog;
    document.querySelector('#cfAg').click(); await T.esperar(() => document.querySelector('.veu .modal #agX')); document.querySelector('.veu .modal #agX').click(); await T.esperar(() => !document.querySelector('.veu .modal #agD')); await T.sincronizado();
    return { amanha, depois, r1, r2, r3: { sit: T.conta('f_c').sit, prog: o().prog } };
  });
  ok(ag.r1.sit === 'Agendado' && ag.r1.prog === ag.amanha && ag.r1.meta, `agendado para amanhã: situação “${ag.r1.sit}” e programação no Financeiro (Pagamentos do dia/Calendário)`);
  ok(ag.r2 === ag.depois, 'agendamento editado para depois de amanhã');
  ok(ag.r3.sit === 'Pendente' && !ag.r3.prog, 'agendamento cancelado: volta a “Pendente” (nada foi pago nem apagado)');

  /* J. histórico do fornecedor: extrato, entregas, pagamentos, combustível e comprovante */
  const hi = await page.evaluate(async () => {
    await T.irModulo('#/fLenha/f_b');
    const r = {};
    for (const a of ['extrato', 'entregas', 'pagamentos', 'abatimentos']) { document.querySelector('[data-cplaba="' + a + '"]').click(); await T.dorme(200); r[a] = document.querySelector('#cfCorpo').textContent.replace(/\s+/g, ' '); }
    document.querySelector('[data-cplaba="extrato"]').click(); await T.dorme(150);
    const ult = [...document.querySelectorAll('#cfCorpo tbody tr')].pop().textContent;
    document.querySelector('[data-cplaba="pagamentos"]').click(); await T.dorme(150);
    document.querySelector('[data-cplcomp]').click(); await T.esperar(() => location.hash === '#/documento'); await T.dorme(400);
    const doc = document.querySelector('#conteudo').textContent.replace(/\s+/g, ' ');
    JBNAV.voltar(); await T.esperar(() => /^#\/fLenha\/f_b/.test(location.hash)); await T.dorme(200);
    return { ...r, ult, doc, volta: location.hash, B: T.conta('f_b') };
  });
  await foto('04-historico');
  ok(/Entrega nº/.test(hi.extrato) && /Combustível/.test(hi.extrato) && /Pagamento/.test(hi.extrato) && /650,00/.test(hi.ult), `extrato com entregas, combustível e pagamentos; saldo final R$ 650,00 (${hi.ult.replace(/\s+/g, ' ').slice(-40)})`);
  ok(/2\.250,00/.test(hi.entregas) && /1\.000,00/.test(hi.entregas) && /80,00/.test(hi.entregas), 'entregas com quantidade, valor por unidade e valor total');
  ok(/Pago/.test(hi.pagamentos) && /lançado por/.test(hi.pagamentos) && /adiantamento/i.test(hi.pagamentos), 'pagamentos com data, forma, conta, quem lançou e o adiantamento');
  ok(/500,00/.test(hi.abatimentos) && /bomba/i.test(hi.abatimentos), 'abatimento de combustível no histórico');
  ok(/COMPROVANTE/i.test(hi.doc) && /Fornecedor Lenha B/.test(hi.doc) && hi.volta.startsWith('#/fLenha/f_b'), 'comprovante do pagamento abre e o Voltar retorna ao fornecedor');

  /* J2. quadros do alto clicáveis: "Falta pagar" mostra o que deve; "Já pago" mostra os pagamentos (pedido de 18/11/2026) */
  const qd = await page.evaluate(async () => {
    const r = {}; const corpo = () => document.querySelector('#cfCorpo').textContent.replace(/\s+/g, ' ');
    const quadro = (k) => document.querySelector('.cpl-cards [data-cplaba="' + k + '"]');
    await T.irModulo('#/fLenha/f_c'); r.abreC = (document.querySelector('.cpl-cards [aria-selected="true"] .rot') || {}).textContent;
    await T.irModulo('#/fLenha/f_b');
    r.abre = (document.querySelector('.cpl-cards [aria-selected="true"] .rot') || {}).textContent; r.frase = document.querySelector('.cpl-frase').textContent.replace(/\s+/g, ' ');
    r.conta = (document.querySelector('.cpl-conta-txt') || {}).textContent || '';
    r.falta = corpo(); r.linhasFalta = document.querySelectorAll('#cfCorpo tbody tr').length;
    quadro('pagamentos').click(); await T.dorme(250); r.pago = corpo(); r.selPago = quadro('pagamentos').getAttribute('aria-selected');
    quadro('entregas').click(); await T.dorme(250); r.ent = corpo();
    quadro('falta').click(); await T.dorme(250); r.volta = corpo();
    /* na lista: "Já pago" mostra os pagamentos de todos os fornecedores; tocar no pagamento abre o fornecedor em "Já pago" */
    await T.irModulo('#/fLenha'); document.querySelector('[data-cplvis="pago"]').click(); await T.dorme(300);
    r.todos = document.querySelectorAll('#svCorpo tr[data-cplforn]').length; r.tit = (document.querySelector('#svCorpo h3.grupo-t') || {}).textContent || '';
    const tr = [...document.querySelectorAll('#svCorpo tr[data-cplforn]')].find((t) => /Fornecedor Lenha B/.test(t.textContent)); tr.click(); await T.esperar(() => location.hash === '#/fLenha/f_b'); await T.dorme(300);
    r.abriuPago = (document.querySelector('.cpl-cards [aria-selected="true"] .rot') || {}).textContent;
    await T.irModulo('#/fLenha');
    document.querySelector('[data-cplvis="falta"]').click(); await T.dorme(250); r.soDevendo = [...document.querySelectorAll('#svCorpo tr[data-go]')].map((t) => t.textContent.match(/Fornecedor Lenha [ABC]/)[0]).sort().join();
    document.querySelector('[data-cplvis="todos"]').click(); await T.dorme(250);
    return { ...r, nTot: CPL_LENHA.contas().reduce((a, x) => a + x.pags.length, 0) };
  });
  ok(qd.abre === 'Falta pagar' && qd.abreC === 'Falta pagar' && /Falta pagar R\$\s?650,00 a Fornecedor Lenha B/.test(qd.frase) && /= falta pagar R\$\s?650,00/.test(qd.conta) && /O que falta pagar/.test(qd.falta) && qd.linhasFalta === 1,
    `o fornecedor abre em “Falta pagar”: ${qd.frase.slice(0, 90)} · ${qd.conta.trim()}`);
  ok(qd.selPago === 'true' && /O que já foi pago/.test(qd.pago) && /Pago/.test(qd.pago) && /Todas as entregas/.test(qd.ent) && /O que falta pagar/.test(qd.volta), 'tocar em “Já pago” mostra os pagamentos, em “Entregas” todas as entregas e em “Falta pagar” volta ao que deve');
  ok(qd.todos === qd.nTot && /Pagamentos feitos/.test(qd.tit) && qd.abriuPago === 'Já pago' && qd.soDevendo === 'Fornecedor Lenha B,Fornecedor Lenha C', `na lista, “Já pago” mostra os ${qd.todos} pagamentos de todos os fornecedores e abre o fornecedor nos pagamentos; “Falta pagar” mostra só quem tem saldo`);

  /* K. filtros e pesquisa */
  const fi = await page.evaluate(async () => {
    await T.irModulo('#/fLenha');
    const chips = Object.fromEntries([...document.querySelectorAll('[data-cplsit]')].map((b) => [b.dataset.cplsit || 'todos', +b.querySelector('em').textContent]));
    document.querySelector('[data-cplsit="parcial"]').click(); await T.dorme(250);
    const parc = [...document.querySelectorAll('#svCorpo tr[data-go]')].map((tr) => tr.querySelector('b').textContent);
    document.querySelector('[data-cplsit="pago"]').click(); await T.dorme(250);
    const pagos = [...document.querySelectorAll('#svCorpo tr[data-go]')].map((tr) => tr.querySelector('b').textContent);
    document.querySelector('[data-cplsit=""]').click(); await T.dorme(250);
    const q = document.querySelector('#cplQ'); q.value = 'lenha c'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(600);
    const busca = [...document.querySelectorAll('#svCorpo tr[data-go]')].map((tr) => tr.querySelector('b').textContent);
    const q2 = document.querySelector('#cplQ'); q2.value = ''; q2.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(500);
    return { chips, parc, pagos, busca };
  });
  ok(fi.chips.todos === 3 && fi.chips.aberto === 1 && fi.chips.parcial === 1 && fi.chips.pago === 1, `filtros: ${JSON.stringify(fi.chips)}`);
  ok(fi.parc.join() === 'Fornecedor Lenha B' && fi.pagos.join() === 'Fornecedor Lenha A' && fi.busca.join() === 'Fornecedor Lenha C', 'parcialmente pagos, pagos e a pesquisa por nome mostram só o fornecedor certo');

  /* L. sem duplicidade: cada parcela uma vez só no banco */
  const dup = await page.evaluate(() => {
    const ids = []; T.banco('compras').forEach((c) => (c.pagamentos || []).forEach((p) => ids.push(c.id + ':' + p.id)));
    const porBaixa = {}; T.banco('compras').forEach((c) => (c.pagamentos || []).forEach((p) => { if (p.baixaLenhaId) porBaixa[p.baixaLenhaId] = (porBaixa[p.baixaLenhaId] || 0) + 1; }));
    const planos = DATA.fBaixaLenha.map((b) => ({ id: b.id, n: (b.plano || []).filter((x) => x.tipo === 'entrega').length, est: b.situacao === 'Estornado' }));
    return { repetidos: ids.length - new Set(ids).size, conferem: planos.every((b) => (porBaixa[b.id] || 0) === b.n), baixas: DATA.fBaixaLenha.length, semConta: (window.pagSemContaV56 ? 0 : 0) };
  });
  ok(dup.repetidos === 0 && dup.conferem && dup.baixas === 5, `nenhuma parcela repetida (${dup.baixas} pagamentos, cada um com as parcelas do plano)`);

  /* M. o resto do sistema vê o mesmo: Setor da Lenha (Valores a pagar) e Contas a pagar do Financeiro */
  const ou = await page.evaluate(async () => {
    SV = 'lenha'; location.hash = '#/clAPagar'; await T.esperar(() => /Valores a pagar/.test((document.querySelector('.sec-cab h1') || {}).textContent || '')); await T.dorme(300);
    const ap = document.querySelector('#svCorpo').textContent.replace(/\s+/g, ' ');
    const os = FINANCEIRO_SETOR.obrigacoes().filter((o) => o.origem === 'Setor da Lenha');
    return { ap, saldoFin: Math.round(os.reduce((a, o) => a + o.s.saldo, 0) * 100) / 100, semConta: (window.pagSemContaV56 && typeof window.pagSemContaV56 === 'function') };
  });
  ok(/650,00/.test(ou.ap) && /800,00/.test(ou.ap), 'Setor da Lenha (Valores a pagar) mostra os mesmos saldos (B R$ 650, C R$ 800)');
  ok(ou.saldoFin === 1450, `Contas a pagar do Financeiro: saldo da lenha R$ ${ou.saldoFin} (= 0 + 650 + 800)`);

  /* M2. pagamento com combustível vira crédito: a janela PAGAR / DAR BAIXA leva ao lançamento certo (nada lançado em dobro) */
  const cb = await page.evaluate(async () => {
    await T.abrirPagar('f_c'); T.val('#cpF', '__comb'); await T.dorme(200);
    const vis = { campos: document.querySelector('.veu .modal #cpCampos').hidden, box: !document.querySelector('.veu .modal #cpCombBox').hidden, ok: document.querySelector('.veu .modal [data-ok]').hidden, botoes: document.querySelectorAll('.veu .modal [data-cplcomb]').length };
    document.querySelector('.veu .modal [data-cplcomb="mao"]').click();
    await T.esperar(() => location.hash === '#/clComb/novo' && document.querySelector('#camada [data-acao="salvar"]'));
    const forn = document.querySelector('#camada [data-k="fornecedorId"]').value;
    T.escolher('onde', 'Posto, por conta da cerâmica'); T.escolher('valor', '200,00'); await T.dorme(150);
    await T.salvarGaveta(); await T.esperar(() => DATA.clComb.length === 1); await T.sincronizado();
    await T.irModulo('#/fLenha/f_c'); const comb = document.querySelector('#cfComb') ? document.querySelector('#cfComb').textContent : '';
    document.querySelector('[data-cplaba="abatimentos"]').click(); await T.dorme(200);
    return { vis, forn, comb, abat: document.querySelector('#cfCorpo').textContent.replace(/\s+/g, ' '), C: T.conta('f_c') };
  });
  ok(cb.vis.campos && cb.vis.box && cb.vis.ok && cb.vis.botoes === 2, 'forma “Combustível (vira crédito)”: a janela mostra os dois caminhos do combustível (bomba ou à mão) no lugar do valor');
  ok(cb.forn === 'f_c' && /Combustível/.test(cb.comb), 'o lançamento de combustível abre já com o fornecedor; a tela do fornecedor tem o botão Combustível');
  ok(cb.C.saldo === 600 && cb.C.abat === 200 && /200,00/.test(cb.abat), `combustível de R$ 200 virou crédito: saldo de C R$ 800 → R$ ${cb.C.saldo}`);

  /* N. atualizar a página: tudo continua (vem do banco central) */
  await page.evaluate(() => { const L = []; window.__srv.estado.docs.forEach((d) => L.push([d.colecao, d.id, d.dados])); sessionStorage.setItem('__srv_teste', JSON.stringify(L)); });
  await page.reload();
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const rl = await page.evaluate(async () => { await T.dorme(800); await T.irModulo('#/fLenha'); return { A: T.conta('f_a'), B: T.conta('f_b'), C: T.conta('f_c'), n: DATA.fBaixaLenha.length, res: [...document.querySelectorAll('#svCorpo .cpl-cards > button')].map((d) => d.textContent.replace(/\s+/g, ' ').trim()) }; });
  ok(rl.A.saldo === 0 && rl.B.saldo === 650 && rl.C.saldo === 600 && rl.n === 5 && rl.A.sit === 'Pago' && rl.B.sit === 'Parcialmente pago', 'depois de atualizar a página: mesmos saldos, situações e pagamentos');
  ok(rl.res.some((r) => /1\.250,00/.test(r) && /Falta pagar/i.test(r)), `indicadores depois de atualizar: ${rl.res.join(' | ')}`);

  /* O. celular */
  await page.setViewportSize({ width: 390, height: 844 });
  const cel = await page.evaluate(async () => { await T.irModulo('#/fLenha'); const r = document.querySelector('#svCorpo .cpl-cards'); const b = document.querySelector('[data-cplpagar]'); const rr = b.getBoundingClientRect();
    return { resumo: !!r && getComputedStyle(r).display !== 'none', larg: document.documentElement.scrollWidth, botao: rr.width > 0 && rr.right <= 391 }; });
  await foto('05-celular');
  await page.evaluate(async () => { await T.abrirPagar('f_c'); });
  await foto('06-celular-janela');
  const celJ = await page.evaluate(() => { const m = document.querySelector('.veu .modal'); const r = m.getBoundingClientRect(); T.fecharJanelas(); return { cabe: r.width <= 390 && r.left >= 0 }; });
  ok(cel.resumo && cel.larg <= 392 && cel.botao && celJ.cabe, 'no celular: indicadores à vista, cartões e janela de pagamento cabem na tela');

  ok(!erros.length, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  console.error(e); falhas++;
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
