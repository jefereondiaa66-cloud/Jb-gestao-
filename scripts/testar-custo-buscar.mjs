#!/usr/bin/env node
// Teste de ponta a ponta da V115, no navegador, com o programa REAL (saida/claude.html) e o banco
// central simulado (scripts/lib/servidor-falso.mjs). Dados de teste, só em memória.
//  1. custo por litro do combustível = média das compras + custo de buscar (R$ 0,40, editável);
//  2. lenha paga com combustível com esse custo: fornecedor, saldo geral, rateio e crédito;
//  3. relatório de compras da lenha com a posição do fornecedor.
// Uso: node scripts/construir.mjs && node scripts/testar-custo-buscar.mjs   (FOTOS=<pasta> guarda capturas)
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
  ['produtos', 'p_oleo', { id: 'p_oleo', setor: 'combustivel', nome: 'Óleo 15W40', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Óleo lubrificante', precoCompra: 30 }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_cam', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste', tipo: 'Caminhão', controleUso: 'Hodômetro (km)', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', situacao: 'Ativo' }],
  ['fornecedores', 'f_lenha', { id: 'f_lenha', setor: 'lenha', nome: 'Fornecedor Lenha Exemplo', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_lenha2', { id: 'f_lenha2', setor: 'lenha', nome: 'Outro Fornecedor de Lenha', tipoPessoa: 'Física', situacao: 'Ativo' }],
  /* abastecimento antigo, gravado antes da V115: tem de continuar com o custo com que foi gravado */
  ['consumos', hoje.slice(0, 7) + '-s0', { chave: hoje.slice(0, 7) + '-s0', items: { c_antigo: { id: 'c_antigo', setor: 'combustivel', data: hoje, hora: '06:00', produtoId: 'p_s10', localId: 'l_cam', quantidade: 10, unidade: 'L', origem: 'Estoque da fábrica', abastecidoEm: 'Máquina da fábrica', anterior: 10, atual: 0, custoUnit: 7.6, custoTotal: 76, criadoEm: '2026-11-01T10:00:00.000Z', criadoPor: 'u_DONO' } } }],
  ['estoqueMov', hoje.slice(0, 7) + '-s0', { chave: hoje.slice(0, 7) + '-s0', items: { m_ini: { id: 'm_ini', setor: 'combustivel', tipo: 'Entrada', data: hoje, hora: '05:00', produtoId: 'p_s10', quantidade: 10, delta: 10, motivo: 'Estoque inicial de teste', criadoEm: '2026-11-01T09:00:00.000Z', criadoPor: 'u_DONO' } } }],
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
const naoExec = (m) => { resultados.push(['não executado', m]); console.log(`  – NÃO EXECUTADO: ${m}`); };
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

  const SIM = 'Sim, pagamento de compra de lenha';
  console.log('1. Custo por litro = média das compras + custo de buscar');
  const a = await page.evaluate(async () => { const c = await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 7.6); await T.sincronizado();
    const ob = window.FINANCEIRO_SETOR ? window.FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === 'c:' + c.id) : null;
    return { nota: custoMedioNota('p_s10'), partes: custoPartes('p_s10'), cm: custoMedio('p_s10'), total: c.total, fin: ob ? ob.s.saldo : null, oleo: custoPartes('p_oleo'), lenha: custoBuscar('p_lenha'), txt: txtCustoV('p_s10', 'L') }; });
  ok(a.nota === 7.6, `a média das compras continua pelo valor da nota (${a.nota})`);
  ok(a.partes.buscar === 0.4 && a.cm === 8, `custo por litro = 7,60 + 0,40 = ${a.cm}`);
  ok(a.total === 7600 && a.fin === 7600, `a compra e a conta a pagar ao posto continuam pelo valor da nota (${a.total} / ${a.fin})`);
  ok(a.oleo.buscar === 0 && a.oleo.custo === 30 && a.lenha === 0, 'óleo lubrificante e lenha não ganham custo de buscar');
  ok(/média das compras/.test(a.txt) && /custo de buscar/.test(a.txt), 'o texto do custo mostra as duas parcelas');

  const b = await page.evaluate(async () => { await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', localId: 'l_cam', quantidade: 100 });
    const tela = document.querySelector('#camada').textContent; await T.salvarGaveta(); await T.esperar(() => DATA.consumos.length === 2); await T.sincronizado();
    const c = DATA.consumos.find((x) => x.id !== 'c_antigo'); const ant = DATA.consumos.find((x) => x.id === 'c_antigo'); const bc = T.banco('consumos').find((x) => x.id === c.id);
    return { tela: /custo de buscar/.test(tela) && /média das compras/.test(tela), cu: c.custoUnit, md: c.custoMediaNota, bs: c.custoBuscar, ct: c.custoTotal, banco: bc && bc.custoBuscar, ant: [ant.custoUnit, ant.custoTotal, ant.custoBuscar], id: c.id }; });
  ok(b.tela, 'o formulário do abastecimento mostra média das compras, custo de buscar e custo por litro');
  ok(b.cu === 8 && b.ct === 800, `abastecimento de 100 L saiu a R$ 8,00 o litro (total ${b.ct})`);
  ok(b.md === 7.6 && b.bs === 0.4 && b.banco === 0.4, 'o abastecimento guarda a média e o custo de buscar usados (também no banco)');
  ok(b.ant[0] === 7.6 && b.ant[1] === 76 && b.ant[2] === undefined, 'abastecimento antigo continua com o custo com que foi gravado');

  const cad = await page.evaluate(async () => { SV = 'combustivel'; location.hash = '#/produtos/p_s10'; await T.esperar(() => document.querySelector('#camada [data-k="custoBuscar"]'));
    const tem = /Custo por litro usado no sistema/.test(document.querySelector('#camada').textContent); const novoPad = MODS.produtos.padrao().custoBuscar;
    T.escolher('custoBuscar', '0,50'); await T.dorme(200); const vivo = /8,10/.test(document.querySelector('#camada').textContent); await T.salvarGaveta(); await T.esperar(() => +PROD('p_s10').custoBuscar === 0.5); await T.sincronizado();
    return { tem, novoPad, vivo, cm: custoMedio('p_s10'), nota: custoMedioNota('p_s10'), banco: (T.banco('produtos').find((x) => x.id === 'p_s10') || {}).custoBuscar, antes: DATA.consumos.find((x) => x.custoBuscar === 0.4).custoUnit }; });
  ok(cad.tem, 'o cadastro do combustível tem o campo “Custo de buscar por litro” e a conta do custo');
  ok(cad.novoPad === 0.4, 'combustível novo já nasce com R$ 0,40 de custo de buscar');
  ok(cad.vivo, 'mudar o custo de buscar atualiza a conta na hora (8,10)');
  ok(cad.cm === 8.1 && cad.nota === 7.6 && cad.banco === 0.5, `custo de buscar editado para 0,50: custo por litro ${cad.cm}`);
  ok(cad.antes === 8, 'mudar o custo de buscar não mexe no abastecimento já gravado');

  console.log('2. Lenha paga com combustível');
  const l = await page.evaluate(async (SIM) => {
    const c1 = await T.comprar('lenha', 'f_lenha', 'p_lenha', 10, 50, { data: addDias(hoje(), -3) }); const c2 = await T.comprar('lenha', 'f_lenha', 'p_lenha', 6, 50); await T.sincronizado();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 80, pagLenhaSim: SIM, pagLenhaForn: 'f_lenha' });
    const cx = document.querySelector('#camada'); const st0 = { compra: cx.querySelector('[data-k="pagLenhaCompra"]').value, preco: cx.querySelector('[data-k="pagLenhaPreco"]').value, txt: cx.textContent };
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((x) => x.pagLenha)); await T.esperar(() => finVenda(COMPRA_(c2.id)).pago > 0, 10000); await T.sincronizado();
    const ab = DATA.consumos.find((x) => x.pagLenha);
    return { st0: { compra: st0.compra, preco: st0.preco, abertas: /Total a pagar em 2 compra/.test(st0.txt), conta: /custo de buscar/.test(st0.txt) && /Abate em 2 compras/.test(st0.txt) }, pl: ab.pagLenha, cu: ab.custoUnit, fora: ab.foraDaProducao,
      s1: finVenda(COMPRA_(c1.id)).saldo, s2: finVenda(COMPRA_(c2.id)).saldo, p1: (COMPRA_(c1.id).pagamentos || []).length, p2: (COMPRA_(c2.id).pagamentos || []).length, ids: [c1.id, c2.id], estoque: saldoP('p_s10') }; }, SIM);
  ok(l.st0.compra === '__geral', 'escolher o fornecedor com 2 compras em aberto já propõe abater do saldo geral');
  ok(/8,10/.test(l.st0.preco), `o preço combinado vem com o custo novo (média + custo de buscar): ${l.st0.preco}`);
  ok(l.st0.abertas, 'a tela lista as compras em aberto do fornecedor com o saldo de cada uma');
  ok(l.st0.conta, 'a tela mostra a conta: litros, média, custo de buscar, preço por litro e valor abatido');
  ok(l.pl.valor === 648 && l.pl.rateio.length === 2 && l.pl.rateio[0].valor === 500 && l.pl.rateio[1].valor === 148, `80 L × 8,10 = 648 abatidos da compra mais antiga para a mais nova (500 + 148)`);
  ok(l.s1 === 0 && l.s2 === 152 && l.p1 === 1 && l.p2 === 1, `saldos depois: compra antiga quitada, a outra com ${l.s2} a pagar`);
  ok(l.pl.custoMediaNota === 7.6 && l.pl.custoBuscar === 0.5 && l.fora === true, 'o lançamento guarda a média e o custo de buscar e fica fora do custo da produção');

  const cr = await page.evaluate(async (SIM) => {
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 30, pagLenhaSim: SIM, pagLenhaForn: 'f_lenha' });
    const st = { ...MODS.consumos.padrao(), id: 'zz', produtoId: 'p_s10', quantidade: 30, pagLenhaSim: SIM, pagLenhaForn: 'f_lenha', pagLenhaCompra: document.querySelector('#camada [data-k="pagLenhaCompra"]').value, pagLenhaPreco: 8.1 };
    const conf = conferirRegistro('consumos', st); const antes = DATA.consumos.length;
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.length === antes + 1); await T.esperar(() => window.PAGLENHA_V115.devidoA('f_lenha') === 0, 10000); await T.sincronizado();
    const ab = DATA.consumos.filter((x) => x.pagLenha).sort((x, y) => String(x.criadoEm).localeCompare(String(y.criadoEm))).pop();
    return { aviso: String(conf.erros._aviso || conf.aviso || JSON.stringify(conf.erros)), trava: !!(conf.erros.pagLenhaPreco || conf.erros.pagLenhaCompra), pl: ab.pagLenha, cred: window.PAGLENHA_V115.creditosDe('f_lenha').total, deve: window.PAGLENHA_V115.devidoA('f_lenha') }; }, SIM);
  ok(!cr.trava && /crédito/.test(cr.aviso), 'valor maior que a dívida não trava: avisa que a sobra vira crédito');
  ok(cr.pl.valor === 243 && cr.pl.credito === 91 && cr.cred === 91 && cr.deve === 0, `30 L × 8,10 = 243: quitou os 152 e guardou ${cr.cred} de crédito`);

  const us = await page.evaluate(async () => { const c3 = await T.comprar('lenha', 'f_lenha', 'p_lenha', 4, 50); await T.sincronizado();
    SV = 'lenha'; location.hash = '#/compra/' + c3.id; await T.esperar(() => document.querySelector('#vvCred115')); const rot = document.querySelector('#vvCred115').textContent;
    document.querySelector('#vvCred115').click(); await T.confirmarJanela(); await T.esperar(() => finVenda(COMPRA_(c3.id)).saldo === 109, 10000); await T.sincronizado();
    window.usarCreditoCombV115(c3.id); await T.dorme(600);
    return { rot, saldo: finVenda(COMPRA_(c3.id)).saldo, cred: window.PAGLENHA_V115.creditosDe('f_lenha').total, pag: (COMPRA_(c3.id).pagamentos || []).filter((p) => p.creditoDe).length, banco: (T.banco('compras').find((x) => x.id === c3.id).pagamentos || []).length, id: c3.id }; });
  ok(/91,00/.test(us.rot), 'a compra nova do fornecedor oferece “Abater crédito de combustível (R$ 91,00)”');
  ok(us.saldo === 109 && us.cred === 0 && us.pag === 1 && us.banco === 1, `crédito abatido uma vez só: compra de 200 ficou com ${us.saldo} a pagar e o crédito zerou`);

  console.log('3. Relatório de compras da lenha com a posição do fornecedor');
  const rl = await page.evaluate(async () => { await T.comprar('lenha', 'f_lenha2', 'p_lenha', 2, 50); await T.sincronizado();
    SV = 'lenha'; Object.assign(UIRV, { id: 'rc_compras', setor: 'lenha', rapido: 'mes', ini: hoje().slice(0, 8) + '01', fim: hoje(), fornecedor: '', produto: '', usuario: '', forma: '', stvenda: '', stfin: '' });
    location.hash = '#/relvendas'; await T.esperar(() => document.querySelectorAll('.rel-extra').length === 3);
    const res = RELS_V.find((r) => r.id === 'rc_compras').b(UIRV); const pos = res.extras[1].rows; const f1 = pos.find((x) => /Exemplo/.test(x.nome)); const f2 = pos.find((x) => /Outro/.test(x.nome));
    const quadro = res.extras[0].itens.map((x) => x[1]); const tela = [...document.querySelectorAll('.rel-extra h3')].map((h) => h.textContent);
    /* compra em aberto de outro período tem de entrar na posição mesmo com o relatório só de hoje */
    Object.assign(UIRV, { rapido: 'hoje', ini: hoje(), fim: hoje(), fornecedor: 'f_lenha' }); const r2_ = RELS_V.find((r) => r.id === 'rc_compras').b(UIRV); const só = r2_.extras[1].rows;
    UIRV.fornecedor = ''; Object.assign(UIRV, { rapido: 'mes', ini: hoje().slice(0, 8) + '01', fim: hoje() });
    return { n: res.rows.length, f1, f2, quadro, tela, lista: res.extras[2].rows.length, litros: res.extras[2].rows.reduce((s, x) => s + (+x.litros || 0), 0), so: só.length, soNome: só[0] && só[0].nome, soPer: só[0] && só[0].nPer }; });
  ok(rl.tela.length === 3 && /Resumo/.test(rl.tela[0]) && /Posição por fornecedor/.test(rl.tela[1]) && /Lenha paga com combustível/.test(rl.tela[2]), 'o relatório de compras mostra o resumo, a posição por fornecedor e a lenha paga com combustível');
  ok(rl.f1 && rl.f1.antes === 1000 && rl.f1.comb === 891 && rl.f1.outros === 0 && rl.f1.saldo === 109, `fornecedor pago com combustível: deve antes 1.000 − combustível 891 = saldo ${rl.f1 && rl.f1.saldo}`);
  ok(rl.f1 && Math.abs(rl.f1.antes - rl.f1.comb - rl.f1.outros - rl.f1.cred - rl.f1.saldo) < 0.005, 'a conta fecha: deve antes − combustível − outros pagamentos = saldo a pagar');
  ok(rl.f2 && rl.f2.saldo === 100 && rl.f2.comb === 0, 'fornecedor sem combustível aparece com o saldo cheio');
  ok(rl.lista === 4 && Math.abs(rl.litros - 110) < 0.01, `lista dos abastecimentos que pagaram lenha: ${rl.lista} linhas, ${rl.litros} L no total`);
  ok(rl.so === 1 && /Exemplo/.test(rl.soNome), 'filtrando um fornecedor, sai só a posição dele (com o que está em aberto de outros dias)');

  const doc = await page.evaluate(async () => { document.querySelector('[data-x="ver"]').click(); await T.esperar(() => /POSIÇÃO POR FORNECEDOR/i.test(document.body.textContent) && document.querySelector('.fvd-h, #printDoc, .veu'));
    const t = document.body.textContent; return { pos: /Posição por fornecedor/i.test(t), res: /Saldo a pagar/i.test(t), lista: /Lenha paga com combustível/i.test(t) }; });
  ok(doc.pos && doc.res && doc.lista, 'o documento do relatório (visualizar/PDF) sai com o resumo, a posição e a lista');

  console.log('4. Celular (390 px)');
  await page.setViewportSize({ width: 390, height: 800 });
  const cel = await page.evaluate(async (SIM) => { try { if (typeof fecharGaveta === 'function') fecharGaveta(); } catch (e) {} document.querySelectorAll('.veu').forEach((v) => v.remove());
    SV = 'lenha'; location.hash = '#/relvendas'; await T.dorme(700); await T.esperar(() => document.querySelectorAll('.rel-extra').length === 3);
    const larg = document.documentElement.scrollWidth; const q = document.querySelector('.rel-quadro').getBoundingClientRect().width;
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 5, pagLenhaSim: SIM, pagLenhaForn: 'f_lenha' }); const ok2 = !!document.querySelector('#camada [data-k="pagLenhaForn"]');
    return { larg, q, ok2 }; }, SIM).catch((e) => ({ erro: String(e) }));
  ok(!cel.erro && cel.larg <= 392 && cel.q <= 390, `no celular o relatório cabe na tela (largura ${cel.larg} px)`);
  ok(cel.ok2, 'no celular o abastecimento “pago com combustível” abre com o fornecedor');
  if (process.env.FOTOS) { await page.screenshot({ path: join(process.env.FOTOS, 'v115-celular-abastecimento.png') }); await page.evaluate(() => { fecharGaveta(); document.querySelectorAll('.toast, .veu').forEach((x) => x.remove()); SV = 'lenha'; if (typeof marcarSetor === 'function') marcarSetor('lenha'); location.hash = '#/setor-lenha'; }); await page.waitForTimeout(500); await page.evaluate(() => { location.hash = '#/relvendas'; }); await page.waitForTimeout(1200); await page.screenshot({ path: join(process.env.FOTOS, 'v115-celular-relatorio.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(700); await page.screenshot({ path: join(process.env.FOTOS, 'v115-computador-relatorio.png'), fullPage: true }); }

  { const rel = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e)); ok(rel.length === 0, rel.length ? 'erros de JavaScript: ' + rel.slice(0, 3).join(' | ') : 'sem erros de JavaScript'); }
} catch (e) { falhas++; console.log('  ✘ o teste parou: ' + (e && e.message ? e.message : e)); }
finally { await browser.close(); http.close(); }
const ap = resultados.filter((r) => r[0] === 'ok').length;
console.log(`\nCusto de buscar e lenha paga com combustível (V115): ${ap} aprovados, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
