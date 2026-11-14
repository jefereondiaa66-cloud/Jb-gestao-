#!/usr/bin/env node
// Teste de ponta a ponta da V117 (combustível para fornecedor de lenha), no navegador, com o programa
// REAL (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Os dados são de
// teste e só existem no banco simulado, em memória. Confere o pedido do Jeferson (13/11/2026): comprou
// R$ 1.600 de lenha e o fornecedor abasteceu R$ 500 na cerâmica: fica só R$ 1.100 a pagar.
//  · abastecimento padrão no Setor de Combustível ("Abastecido em: Fornecedor de lenha");
//  · desconto automático no Setor da Lenha, contas a pagar e Financeiro; sobra vira crédito da próxima compra;
//  · lançamento à mão no Setor da Lenha; excluir refaz o desconto; acerto de lenha (fecha e estorna);
//  · painéis dos dois setores, perfis e telas no computador e no celular.
// Uso: node scripts/construir.mjs && node scripts/testar-combustivel-fornecedor-lenha.mjs   (FOTOS=<pasta> guarda capturas)
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_s500', { id: 'p_s500', setor: 'combustivel', nome: 'Diesel S500', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_cam', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste', tipo: 'Caminhão', controleUso: 'Hodômetro (km)', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', cnpj: '11222333000181', situacao: 'Ativo' }],
  ['fornecedores', 'f_a', { id: 'f_a', setor: 'lenha', nome: 'Fornecedor Lenha A', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_b', { id: 'f_b', setor: 'lenha', nome: 'Fornecedor Lenha B', tipoPessoa: 'Física', situacao: 'Ativo' }],
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
const resultados = [];
let falhas = 0;
const ok = (c, m) => { resultados.push([c ? 'ok' : 'FALHOU', m]); console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  const ctx = await browser.newContext();
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

  /* utilidades dentro da página */
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 160) + ' | gaveta: ' + (GAV ? GAV.mod + '/' + GAV.id + (GAV.sujo ? ' (alterada)' : '') : '—')); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      /* o que está no banco central (simulado), seja documento solto ou agrupado */
      banco: (col) => { const out = []; window.__srv.estado.docs.forEach((d) => { if (d.colecao !== col) return; if (d.dados && d.dados.items) Object.entries(d.dados.items).forEach(([id, v]) => { if (v) out.push({ ...v, id }); }); else out.push({ ...d.dados, id: d.id }); }); return out; },
      /* confirma a janela que estiver aberta (confirmar() ou modalV()) */
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        const er = [...document.querySelectorAll('#camada .cmp.erro')].map((w) => (w.querySelector('.rot') || {}).textContent + ': ' + (w.querySelector('.msg') || {}).textContent); if (er.length) throw new Error('formulário não salvou: ' + er.join(' | ')); },
      escolher: (k, v) => { const el = document.querySelector('#camada [data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); },
      abrirNovo: async (mod, setor, dados) => { SV = setor; PREFILL = { mod, dados }; location.hash = '#/' + mod + '/novo'; await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        /* a barra de abas às vezes volta para a aba anterior logo depois de trocar a rota: confere e tenta de novo */
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes'); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
    };
  });

  const ob = async (id) => page.evaluate((i) => { const o = window.FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === 'c:' + i); return o ? { valor: o.valor, saldo: o.s.saldo } : null; }, id);

  console.log('Combustível para fornecedor de lenha');
  /* 1. estoque de diesel e compra de lenha (R$ 1.600) */
  const ini = await page.evaluate(async () => {
    await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5);
    const c1 = await T.comprar('lenha', 'f_a', 'p_lenha', 20, 80); await T.sincronizado();
    return { c1: c1.id, total: c1.total, saldo: finVenda(c1).saldo, diesel: saldoP('p_s10') };
  });
  ok(ini.total === 1600 && ini.saldo === 1600 && ini.diesel === 1000, `compra de lenha de R$ ${ini.total} em aberto e 1.000 L de diesel na bomba`);

  /* 2. abastecimento padrão no Setor de Combustível: Abastecido em "Fornecedor de lenha" */
  const ab1 = await page.evaluate(async () => {
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 100 });
    T.escolher('abastecidoEm', 'Fornecedor de lenha'); await T.dorme(150);
    const vis = (k) => { const w = document.querySelector('#camada [data-campo="' + k + '"]'); return !!w && !w.hidden; };
    const ocultos = ['localId', 'medidor', 'origem', 'terceiroNome'].filter(vis);
    const precoSugerido = document.querySelector('#camada [data-k="combLenhaPreco"]').value;
    T.escolher('combLenhaForn', 'f_a'); T.escolher('combLenhaPreco', '5,00'); await T.dorme(150);
    const previa = (document.querySelector('#camada [data-campo="_combLenha"]') || {}).textContent || '';
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.combLenha)); await T.sincronizado();
    const c = DATA.consumos.find((x) => x.combLenha); const k1 = DATA.compras.find((x) => x.tipoOp === 'compra' && x.setor === 'lenha');
    const f = finVenda(k1);
    return { ocultos, precoSugerido, previa, id: c.id, comb: c.combLenha, local: c.localId || '', origem: c.origem, fora: c.foraDaProducao, diesel: saldoP('p_s10'), saldo: f.saldo, total: f.total, desc: f.comb,
      banco: T.banco('consumos').some((x) => x.id === c.id && x.combLenha && x.combLenha.valor === 500) };
  });
  ok(ab1.ocultos.length === 0, `ao escolher “Fornecedor de lenha” somem máquina, km, origem e terceiro${ab1.ocultos.length ? ' (ainda aparecem: ' + ab1.ocultos.join(', ') + ')' : ''}`);
  ok(/5,80/.test(ab1.precoSugerido), `o preço vem sozinho com o custo por litro do diesel: média 5,50 + custo de buscar 0,30 (${ab1.precoSugerido})`);
  ok(/1\.600,00/.test(ab1.previa) && /1\.100,00/.test(ab1.previa), `antes de salvar mostra quanto fica a pagar: ${ab1.previa.replace(/\s+/g, ' ').slice(0, 140)}`);
  ok(ab1.comb && ab1.comb.valor === 500 && ab1.comb.fornecedorId === 'f_a' && ab1.comb.precoUnit === 5, 'abastecimento gravado com o fornecedor, o preço e o valor (100 L × R$ 5,00 = R$ 500,00)');
  ok(ab1.diesel === 900 && !ab1.local && ab1.origem === 'Estoque da fábrica', `o diesel saiu da bomba (saldo ${ab1.diesel} L)`);
  ok(ab1.fora === true, 'fica fora do custo de combustível da produção');
  ok(ab1.saldo === 1100 && ab1.desc === 500 && ab1.total === 1100, `desconto automático: R$ 1.600 − R$ 500 = R$ ${ab1.saldo} a pagar`);
  ok(ab1.banco, 'o abastecimento chegou ao banco central');
  const f1 = await ob(ini.c1);
  ok(f1 && f1.valor === 1100 && f1.saldo === 1100, `contas a pagar e Financeiro mostram só o resto (valor ${f1 && f1.valor}, saldo ${f1 && f1.saldo})`);

  /* 3. painéis e telas */
  const telas = await page.evaluate(async () => {
    SV = 'combustivel'; location.hash = '#/setor-combustivel'; await T.esperar(() => document.querySelector('.cbl-bloco'));
    const kpi = [...document.querySelectorAll('.kpi')].find((k) => /Combustível para lenha/.test(k.textContent));
    const bloco = document.querySelector('.cbl-bloco').textContent;
    location.hash = '#/combLenha'; await T.esperar(() => /Combustível para lenha/.test((document.querySelector('.sec-cab h1') || {}).textContent || ''));
    const tela = document.querySelector('#svCorpo').textContent;
    SV = 'lenha'; location.hash = '#/clAPagar'; await T.esperar(() => /Valores a pagar/.test((document.querySelector('.sec-cab h1') || {}).textContent || ''));
    const apagar = document.querySelector('#svCorpo').textContent;
    location.hash = '#/setor-lenha'; await T.esperar(() => document.querySelector('.cbl-ini'));
    const ini = document.querySelector('.cbl-ini').textContent; const kpiL = [...document.querySelectorAll('.kpi')].some((k) => /Combustível dos fornecedores/.test(k.textContent));
    location.hash = '#/compra/' + DATA.compras.find((x) => x.tipoOp === 'compra' && x.setor === 'lenha').id; await T.esperar(() => document.querySelector('.cbl-compra'), 6000).catch(() => {});
    const compra = (document.querySelector('.cbl-compra') || {}).textContent || '';
    return { kpi: kpi ? kpi.textContent : '', bloco, tela, apagar, ini, kpiL, compra };
  });
  ok(/500,00/.test(telas.kpi), `painel do Setor de Combustível: “Combustível para lenha” com R$ 500,00`);
  ok(/Fornecedor Lenha A/.test(telas.bloco) && /500,00/.test(telas.bloco), 'bloco “Combustível para lenha” lista o abastecimento do fornecedor');
  ok(/Fornecedor Lenha A/.test(telas.tela) && /Descontado/.test(telas.tela), 'tela “Combustível para lenha” com o abastecimento e a situação do desconto');
  ok(/1\.600,00/.test(telas.apagar) && /500,00/.test(telas.apagar) && /1\.100,00/.test(telas.apagar), 'Valores a pagar: compras R$ 1.600,00 − combustível R$ 500,00 = resta R$ 1.100,00');
  ok(telas.kpiL && /Resta R\$\s?1\.100,00/.test(telas.ini), 'início do Setor da Lenha: painel “Combustível dos fornecedores” com o que resta a pagar');
  ok(/Combustível do fornecedor/.test(telas.compra) && /1\.100,00/.test(telas.compra), 'a compra mostra o combustível descontado e quanto falta');

  /* 4. passou do que está em aberto: vira crédito e desconta sozinho da próxima compra */
  const cred = await page.evaluate(async () => {
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 300, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_a', combLenhaPreco: 5 });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.filter((c) => c.combLenha).length === 2); await T.sincronizado();
    const k1 = DATA.compras.find((x) => x.tipoOp === 'compra' && x.setor === 'lenha');
    const antes = { saldo: finVenda(k1).saldo, st: finVenda(k1).status, credito: CB_LENHA.aloc().porForn.f_a.credito };
    const c2 = await T.comprar('lenha', 'f_a', 'p_lenha', 12.5, 80); await T.sincronizado();
    return { antes, c2: c2.id, s2: finVenda(DATA.compras.find((x) => x.id === c2.id)).saldo, credito: CB_LENHA.aloc().porForn.f_a.credito };
  });
  ok(cred.antes.saldo === 0 && cred.antes.st === 'Pago' && cred.antes.credito === 400, `R$ 1.500 de combustível numa compra de R$ 1.100: compra quitada e crédito de R$ ${cred.antes.credito}`);
  ok(cred.s2 === 600 && cred.credito === 0, `próxima compra de R$ 1.000 já nasce com o crédito descontado: falta R$ ${cred.s2}`);

  /* 5. lançamento à mão no Setor da Lenha */
  const man = await page.evaluate(async () => {
    await T.abrirNovo('clComb', 'lenha', { fornecedorId: 'f_a', valor: 200, onde: 'Posto, por conta da cerâmica', operador: 'Motorista Teste' });
    const previa = (document.querySelector('#camada [data-campo="_efeito"]') || {}).textContent || '';
    await T.salvarGaveta(); await T.esperar(() => DATA.clComb.length === 1); await T.sincronizado();
    const k2 = DATA.compras.filter((x) => x.tipoOp === 'compra' && x.setor === 'lenha').sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
    return { previa, s2: finVenda(k2).saldo, banco: T.banco('clCtrl').some((x) => x.tipo === 'comb' && x.valor === 200), diesel: saldoP('p_s10') };
  });
  ok(/600,00/.test(man.previa) && /400,00/.test(man.previa), `lançamento à mão mostra o efeito antes de salvar: ${man.previa.replace(/\s+/g, ' ').slice(0, 120)}`);
  ok(man.s2 === 400, `lançamento à mão de R$ 200 descontou sozinho: falta R$ ${man.s2}`);
  ok(man.banco && man.diesel === 600, 'gravado no banco central (coleção clCtrl) sem mexer no estoque de diesel');

  /* 6. excluir o abastecimento refaz o desconto */
  const exc = await page.evaluate(async (id) => {
    const c = DATA.consumos.find((x) => x.id === id); const pe = window.preExcluirV51('consumos', c) || {};
    await apagar('consumos', c); await T.esperar(() => !DATA.consumos.some((x) => x.id === id)); await T.sincronizado();
    const ks = DATA.compras.filter((x) => x.tipoOp === 'compra' && x.setor === 'lenha');
    return { texto: pe.texto || pe.bloq || '', total: round2(soma(ks, (k) => finVenda(k).saldo)), diesel: saldoP('p_s10') };
  }, ab1.id);
  ok(/volta a ficar a pagar/.test(exc.texto), 'ao excluir, o sistema avisa que o desconto sai junto');
  ok(exc.total === 900 && exc.diesel === 700, `abastecimento excluído: o diesel voltou (${exc.diesel} L) e o desconto foi refeito (R$ 2.600 − R$ 1.700 = R$ ${exc.total})`);

  /* 7. acerto de lenha: o combustível entra no demonstrativo e trava */
  const ac = await page.evaluate(async () => {
    const A = CL112.AC; A.fornecedorId = 'f_a'; A.de = ''; A.ate = hoje(); A.usar = {}; A.ajustes = []; A.conf = false;
    const R = CL112.calcAcerto(A);
    SV = 'lenha'; location.hash = '#/clAcerto/novo'; await T.esperar(() => document.querySelector('#acFechar'));
    const tela = document.querySelector('#svCorpo').textContent;
    document.querySelector('#acConf').click(); document.querySelector('#acFechar').click(); await T.confirmarJanela();
    await T.esperar(() => DATA.clAcerto.some((a) => a.situacao === 'Fechado'), 20000); await T.sincronizado();
    const a = DATA.clAcerto.find((x) => x.situacao === 'Fechado');
    const ks = DATA.compras.filter((x) => x.tipoOp === 'compra' && x.setor === 'lenha');
    const fixo = round2(soma(ks.flatMap((k) => (k.abatimentos || []).filter((y) => !y.estornado && String(y.srcId || '').startsWith('cb:'))), (y) => y.valor));
    const D = CL112.docAcerto(a); const docTxt = JSON.stringify(D.blocos);
    const cbs = CB_LENHA.creds(); const trava = (window.preExcluirV51('consumos', DATA.consumos.find((x) => x.combLenha)) || {}).bloq || '';
    const saldo = round2(soma(ks, (k) => finVenda(k).saldo));
    /* combustível depois do acerto fechado: fica como crédito (não mexe nas compras do acerto) */
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 100, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_a', combLenhaPreco: 5 });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.filter((c) => c.combLenha).length === 2); await T.sincronizado();
    const depois = { saldo: round2(soma(ks.map((k) => DATA.compras.find((x) => x.id === k.id)), (k) => finVenda(k).saldo)), credito: CB_LENHA.aloc().porForn.f_a.credito, liq: DATA.clAcerto.find((x) => x.id === a.id).totais.liquido };
    SV = 'lenha'; location.hash = '#/clAPagar'; await T.esperar(() => /Valores a pagar/.test((document.querySelector('.sec-cab h1') || {}).textContent || ''));
    const apagar = document.querySelector('#svCorpo').textContent;
    return { tComb: R.T.comb, tSaldo: R.T.saldo, combs: R.combs.length, tela, liq: a.totais.liquido, comb: a.totais.comb, lista: (a.combustivel || []).length, fixo, docTxt, trava, saldo, depois, apagar, id: a.id };
  });
  ok(ac.tComb === 1700 && ac.tSaldo === 900 && ac.combs === 2, `acerto: combustível R$ ${ac.tComb} já descontado, saldo R$ ${ac.tSaldo}`);
  ok(/Combustível do fornecedor/.test(ac.tela), 'tela do acerto mostra o combustível do fornecedor');
  ok(ac.liq === 900 && ac.comb === 1700 && ac.lista === 2, `acerto fechado: líquido R$ ${ac.liq}, combustível guardado no acerto`);
  ok(ac.fixo === 1700 && ac.saldo === 900, 'o combustível virou abatimento fixo das compras, sem contar duas vezes');
  ok(/Combustível do fornecedor/.test(ac.docTxt) && /1\.700,00/.test(ac.docTxt), 'demonstrativo do acerto com o combustível (data, quantidade e valor)');
  ok(/acerto de lenha nº/.test(ac.trava), 'abastecimento que entrou em acerto fechado não pode ser excluído');
  ok(ac.depois.saldo === 400 && ac.depois.credito === 0 && ac.depois.liq === 900, `combustível depois do acerto fechado desconta do que falta pagar: R$ 900 − R$ 500 = R$ ${ac.depois.saldo} (o acerto continua com líquido R$ ${ac.depois.liq})`);
  ok(/500,00/.test(ac.apagar) && /400,00/.test(ac.apagar), 'Valores a pagar mostra o combustível descontado e o que resta (R$ 400,00)');

  /* 8. estorno do acerto devolve o desconto ao cálculo automático */
  const est = await page.evaluate(async (id) => {
    location.hash = '#/clAcerto/' + id; await T.esperar(() => document.querySelector('#caEst'));
    CL112.estornarAcerto(id); await T.esperar(() => document.querySelector('#eaM')); document.querySelector('#eaM').value = 'Teste de estorno'; await T.confirmarJanela();
    await T.esperar(() => DATA.clAcerto.find((a) => a.id === id).situacao === 'Estornado', 15000); await T.sincronizado();
    const ks = DATA.compras.filter((x) => x.tipoOp === 'compra' && x.setor === 'lenha');
    return { saldo: round2(soma(ks, (k) => finVenda(k).saldo)), credito: CB_LENHA.aloc().porForn.f_a.credito, livre: !(window.preExcluirV51('consumos', DATA.consumos.find((x) => x.combLenha)) || {}).bloq };
  }, ac.id);
  ok(est.saldo === 400 && est.credito === 0 && est.livre, `acerto estornado: o desconto volta a ser automático (R$ 2.600 − R$ 2.200 = R$ ${est.saldo}) e o lançamento é liberado`);

  /* 9. "Pagar com combustível" na compra abre o abastecimento já com o fornecedor; perfis */
  const outros = await page.evaluate(async () => {
    const cb = await T.comprar('lenha', 'f_b', 'p_lenha', 5, 100); await T.sincronizado();
    window.pagarComCombustivelV62(cb.id); await T.esperar(() => document.querySelector('#camada [data-k="combLenhaForn"]'));
    const forn = document.querySelector('#camada [data-k="combLenhaForn"]').value, em = document.querySelector('#camada [data-k="abastecidoEm"]').value;
    fecharGaveta(true); await T.dorme(200);
    APP.papel = 'estoquista'; const st = { ...MODS.consumos.padrao(), id: 'x', produtoId: 'p_s10', quantidade: 10, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_b', combLenhaPreco: 5 }; SV = 'combustivel';
    const efeito = MODS.consumos.fields.find((f) => f.k === '_combLenha').calc(st); const vePainel = pode('clComb'); const lanca = pode('consumos', 'e'); APP.papel = 'admin';
    const semForn = conferirRegistro('consumos', { ...st, combLenhaForn: '' }).erros.combLenhaForn || '';
    const ctl = (() => { try { return window.CTL_V60 ? 1 : 0; } catch (e) { return 0; } })();
    return { forn, em, efeito, vePainel, lanca, semForn, ctl };
  });
  ok(outros.forn === 'f_b' && outros.em === 'Fornecedor de lenha', '“Pagar com combustível” na compra abre o abastecimento já com o fornecedor');
  ok(outros.lanca && !outros.vePainel && !/a pagar/i.test(outros.efeito), 'estoquista lança o abastecimento, mas não vê os valores da lenha');
  ok(/obrigatório/i.test(outros.semForn), 'sem o fornecedor o abastecimento não salva');

  /* 10. telas sem erro (computador e celular) */
  for (const [larg, alt] of [[1280, 900], [390, 844]]) {
    await page.setViewportSize({ width: larg, height: alt });
    await page.evaluate(async () => { for (const [r, s] of [['#/setor-combustivel', 'combustivel'], ['#/combLenha', 'combustivel'], ['#/clLanc', 'combustivel'], ['#/clRel/porVeiculo', 'combustivel'], ['#/setor-lenha', 'lenha'], ['#/clComb', 'lenha'], ['#/clAPagar', 'lenha'], ['#/clPag', 'lenha'], ['#/clAcerto', 'lenha'], ['#/clLanc', 'lenha']]) { SV = s; location.hash = r; await T.dorme(400); } });
    if (process.env.FOTOS) for (const [rota, nome, setor] of [['#/setor-combustivel', 'inicio-comb', 'combustivel'], ['#/combLenha', 'comb-lenha', 'combustivel'], ['#/setor-lenha', 'inicio-lenha', 'lenha'], ['#/clComb', 'comb-forn', 'lenha'], ['#/clAPagar', 'apagar', 'lenha'], ['#/clAcerto/' + ac.id, 'acerto', 'lenha']]) {
      await page.evaluate(async ([r, s]) => { SV = s; location.hash = r; await T.dorme(700); }, [rota, setor]);
      await page.screenshot({ path: join(process.env.FOTOS, `${nome}-${larg}.png`), fullPage: true });
    }
  }
  const pag = await page.evaluate(() => document.querySelector('#svCorpo') ? 1 : 0);
  ok(pag === 1, 'todas as telas novas abriram (Combustível e Lenha, computador e celular)');
  const relevantes = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
} catch (e) {
  falhas++; console.error('  ✘ o teste parou:', e && (e.stack || e.message || e));
} finally {
  await browser.close(); http.close();
}
const n = (k) => resultados.filter((r) => r[0] === k).length;
console.log(`\nCombustível para fornecedor de lenha: ${n('ok')} aprovados, ${n('FALHOU')} falharam.`);
process.exit(falhas ? 1 : 0);
