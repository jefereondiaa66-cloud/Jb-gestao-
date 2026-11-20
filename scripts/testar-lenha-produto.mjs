#!/usr/bin/env node
// Teste do pagamento do fornecedor de lenha com produto (V142), no navegador,
// com o programa REAL (saida/claude.html) e o banco central simulado
// (scripts/lib/servidor-falso.mjs). Os dados são de teste e só existem no banco
// simulado, em memória. Cada passo confere a tela, o cálculo e o que chegou ao banco.
//
// Uso: node scripts/construir.mjs && node scripts/testar-combustivel-lenha.mjs
// Leitura por foto: quem lê é o motor do Lançamento Inteligente por Foto (IA). Aqui a IA é
// SIMULADA (devolve o texto que estaria na foto); o teste confere o resto do caminho: pedido
// e imagem enviados, conferência dos campos, formulário de conferência e gravação.
// FOTOS=<pasta> guarda capturas das telas novas (computador e celular).
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
  ['locais', 'l_cam', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste', tipo: 'Caminhão', identificacao: 'ABC1D23', controleUso: 'Hodômetro (km)', situacao: 'Ativo', responsavel: 'Motorista Teste' }],
  ['locais', 'l_trat', { id: 'l_trat', setor: 'combustivel', nome: 'Trator Teste', tipo: 'Trator', controleUso: 'Horímetro (horas)', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', cnpj: '11222333000181', situacao: 'Ativo' }],
  ['fornecedores', 'f_lenha', { id: 'f_lenha', setor: 'lenha', nome: 'Fornecedor Lenha Exemplo', tipoPessoa: 'Física', situacao: 'Ativo', regraTipo: 'Percentual sobre o valor da carga', regraValor: 10, regraTexto: 'Desconto de 10% por carga, conforme contrato de teste.' }],
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

  console.log('Lenha paga com produto');
  /* 0. almoxarifado: uma bota com 10 pares a R$ 80; compra de lenha de R$ 600 a prazo */
  const ini = await page.evaluate(async () => {
    const agora = new Date().toISOString();
    await gravar('almItens', { id: 'it_bota', codigo: 'EPI-001', nome: 'Bota de teste', categoria: 'EPI', unidade: 'par', ativo: true, criadoEm: agora }, null);
    await gravar('almEntradas', { id: 'en_bota', data: hoje(), numero: 1, itens: [{ itemId: 'it_bota', qtd: 10, preco: 80 }], frete: 0, criadoEm: agora }, null);
    await T.esperar(() => ALMOX_V52.estI('it_bota').saldo === 10);
    const c = await T.comprar('lenha', 'f_lenha', 'p_lenha', 10, 60); await T.sincronizado();
    return { est: ALMOX_V52.estI('it_bota').saldo, cm: ALMOX_V52.estI('it_bota').cm, saldo: finVenda(c).saldo, id: c.id }; });
  ok(ini.est === 10 && ini.cm === 80, `almoxarifado com 10 pares de bota a R$ 80 (saldo ${ini.est}, custo ${ini.cm})`);
  ok(ini.saldo === 600, `compra de lenha de R$ 600 a pagar (${ini.saldo})`);

  /* 1. pagamento com bota pela tela (Setor da Lenha) */
  const p1 = await page.evaluate(async (cid) => {
    await T.abrirNovo('clProd', 'lenha', { fornecedorId: 'f_lenha', forma: CB_LENHA.FORMA_P[0], itemId: 'it_bota', quantidade: 1 });
    const sug = (document.querySelector('#camada [data-k="precoUnit"]') || {}).value;
    T.escolher('precoUnit', '100'); await T.dorme(300);
    const tela = document.querySelector('#camada').textContent;
    await T.salvarGaveta(); await T.esperar(() => DATA.clProd.length === 1); await T.sincronizado();
    const m = DATA.clProd[0]; const c = DATA.compras.find((x) => x.id === cid); const cr = CB_LENHA.credPorId('p:' + m.id);
    const mov = ALMOX_V52.movsAlm().find((x) => x.tipo === 'Pagamento de lenha');
    return { sug, tela: /Saldo no almoxarifado/.test(tela) && /Desconta de/.test(tela), valor: m.valor, custo: m.custoTotal, saldo: finVenda(c).saldo, est: ALMOX_V52.estI('it_bota').saldo, desc: cr && cr.desc,
      mov: mov && mov.q === -1 && Math.round(mov.valor) === -80, banco: T.banco('clCtrl').some((x) => x.id === m.id && x.tipo === 'prod'), caixa: (c.pagamentos || []).length }; }, ini.id);
  ok(p1.tela, 'o formulário mostra o saldo do almoxarifado e o desconto antes de salvar');
  ok(/80/.test(String(p1.sug)), `o preço vem sugerido pelo custo médio do almoxarifado (${p1.sug})`);
  ok(p1.valor === 100 && p1.custo === 80, `pagamento de R$ 100 com 1 par de bota (custo no estoque R$ ${p1.custo})`);
  ok(p1.saldo === 500 && p1.desc === 100, `a compra de lenha ficou com R$ ${p1.saldo} a pagar`);
  ok(p1.est === 9, `a bota saiu do almoxarifado (saldo ${p1.est})`);
  ok(p1.mov, 'a saída aparece nas movimentações do almoxarifado como “Pagamento de lenha”, pelo custo');
  ok(p1.banco, 'o pagamento chegou ao banco central');
  ok(p1.caixa === 0, 'nada saiu do Caixa (não é pagamento em dinheiro)');

  /* 2. outra coisa (fora do estoque) */
  const p2 = await page.evaluate(async (cid) => {
    await T.abrirNovo('clProd', 'lenha', { fornecedorId: 'f_lenha', forma: CB_LENHA.FORMA_P[1], descricao: 'Saco de cimento comprado fora', valor: 50 });
    await T.salvarGaveta(); await T.esperar(() => DATA.clProd.length === 2); await T.sincronizado();
    return { saldo: finVenda(DATA.compras.find((x) => x.id === cid)).saldo, est: ALMOX_V52.estI('it_bota').saldo }; }, ini.id);
  ok(p2.saldo === 450 && p2.est === 9, `“outra coisa” de R$ 50 desconta (resta ${p2.saldo}) e não mexe no estoque`);

  /* 3. não deixa tirar mais do que tem no almoxarifado */
  const p3 = await page.evaluate(() => { const st = { ...MODS.clProd.padrao(), id: 'x', fornecedorId: 'f_lenha', itemId: 'it_bota', quantidade: 20, precoUnit: 100 };
    return conferirRegistro('clProd', st).erros.quantidade || ''; });
  ok(/Estoque insuficiente/.test(p3), 'quantidade maior que o saldo do almoxarifado é recusada');

  /* 4. telas */
  const tl = await page.evaluate(async () => { const out = {};
    for (const [r, t] of [['#/clComb', 'Produto · Bota de teste'], ['#/clProd', 'Bota de teste'], ['#/clAPagar', 'Combustível e produtos'], ['#/almMov', 'Pagamento de lenha']]) {
      SV = r === '#/almMov' ? 'almox' : 'lenha'; location.hash = r; await T.dorme(900); out[r] = (document.querySelector('#conteudo') || document.body).textContent.includes(t); }
    return out; });
  Object.entries(tl).forEach(([r, v]) => ok(v, `a tela ${r} mostra o pagamento com produto`));

  /* 5. excluir devolve o estoque e o valor a pagar */
  const p5 = await page.evaluate(async (cid) => { const m = DATA.clProd.find((x) => x.itemId === 'it_bota'); await apagar('clProd', m); await T.esperar(() => DATA.clProd.length === 1); await T.sincronizado();
    return { saldo: finVenda(DATA.compras.find((x) => x.id === cid)).saldo, est: ALMOX_V52.estI('it_bota').saldo }; }, ini.id);
  ok(p5.saldo === 550 && p5.est === 10, `excluir o pagamento com bota: volta a R$ ${p5.saldo} a pagar e ${p5.est} pares no estoque`);

  ok(!erros.length, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  ok(false, 'o teste parou: ' + (e && e.message));
} finally {
  await browser.close(); http.close();
}
console.log(`\nLenha paga com produto: ${resultados.filter((r) => r[0] === 'ok').length} aprovados, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
