#!/usr/bin/env node
// Teste de ponta a ponta da V173 (preço do combustível para o fornecedor de lenha), no navegador, com o programa
// REAL (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Os dados são de teste e só
// existem no banco simulado, em memória. Confere o pedido do Jeferson (25/11/2026): o fornecedor de lenha que
// abastece na cerâmica paga R$ 7,90 o litro do S500 (custo + acréscimo), e não o custo por litro do programa.
//  · campo "Preço para fornecedor de lenha" no cadastro do combustível (grava, limpa e mostra o acréscimo);
//  · Setor de Combustível: o abastecimento para fornecedor de lenha já vem com o S500 e R$ 7,90; trocar o
//    combustível troca o preço que veio sozinho, mas não o que a pessoa digitou;
//  · Setor da Lenha: "Combustível que ele levou" abre no S500 com R$ 7,90;
//  · o desconto na lenha sai pelo preço do fornecedor, e o custo do diesel no estoque continua o mesmo.
// Uso: node scripts/construir.mjs && node scripts/testar-preco-fornecedor-lenha.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_s500', { id: 'p_s500', setor: 'combustivel', nome: 'Diesel S500', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel', precoFornLenha: 7.9 }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', cnpj: '11222333000181', situacao: 'Ativo' }],
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

  /* utilidades dentro da página (as mesmas do teste da V117) */
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 160)); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      banco: (col) => { const out = []; window.__srv.estado.docs.forEach((d) => { if (d.colecao !== col) return; if (d.dados && d.dados.items) Object.entries(d.dados.items).forEach(([id, v]) => { if (v) out.push({ ...v, id }); }); else out.push({ ...d.dados, id: d.id }); }); return out; },
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        const er = [...document.querySelectorAll('#camada .cmp.erro')].map((w) => (w.querySelector('.rot') || {}).textContent + ': ' + (w.querySelector('.msg') || {}).textContent); if (er.length) throw new Error('formulário não salvou: ' + er.join(' | ')); },
      escolher: (k, v) => { const el = document.querySelector('#camada [data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); },
      valor: (k) => (document.querySelector('#camada [data-k="' + k + '"]') || {}).value,
      vivo: (k) => ((document.querySelector('#camada [data-campo="' + k + '"]') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes'); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
    };
  });

  console.log('Preço do combustível para o fornecedor de lenha (V173)');
  /* 1. diesel na bomba (S10 a 7,63 e S500 a 7,49 na nota; + 0,30 de buscar) e uma compra de lenha de R$ 4.000 */
  const ini = await page.evaluate(async () => {
    await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 7.63);
    await T.comprar('combustivel', 'f_posto', 'p_s500', 1000, 7.49);
    const c1 = await T.comprar('lenha', 'f_a', 'p_lenha', 20, 200); await T.sincronizado();
    return { c1: c1.id, saldo: finVenda(c1).saldo, s10: custoMedio('p_s10'), s500: custoMedio('p_s500'), sug500: precoSugeridoFornLenhaV('p_s500'), sug10: precoSugeridoFornLenhaV('p_s10'), padrao: prodFornLenhaPadraoV() };
  });
  ok(ini.saldo === 4000 && ini.s10 === 7.93 && ini.s500 === 7.79, `custo por litro: S10 R$ ${ini.s10} e S500 R$ ${ini.s500}; compra de lenha de R$ ${ini.saldo} em aberto`);
  ok(ini.sug500 === 7.9 && ini.sug10 === 7.93, `preço sugerido ao fornecedor: S500 R$ ${ini.sug500} (cadastro) e S10 R$ ${ini.sug10} (sem preço no cadastro, vale o custo)`);
  ok(ini.padrao === 'p_s500', 'o S500 é o combustível que já vem escolhido para o fornecedor de lenha');

  /* 2. cadastro do combustível: campo novo, acréscimo na tela, grava e limpa */
  const cad = await page.evaluate(async () => {
    SV = 'combustivel'; location.hash = '#/produtos/p_s500'; await T.esperar(() => document.querySelector('#camada [data-k="precoFornLenha"]'));
    const w = document.querySelector('#camada [data-campo="precoFornLenha"]'); const vis500 = !!w && !w.hidden; const v500 = T.valor('precoFornLenha'); const txt500 = T.vivo('_precoFornLenha');
    fecharGaveta(true); await T.dorme(200);
    location.hash = '#/produtos/p_s10'; await T.esperar(() => document.querySelector('#camada [data-k="precoFornLenha"]') && GAV && GAV.id === 'p_s10');
    const txt10 = T.vivo('_precoFornLenha');
    T.escolher('precoFornLenha', '8,10'); await T.dorme(120); const txt10b = T.vivo('_precoFornLenha');
    await T.salvarGaveta(); await T.esperar(() => (DATA.produtos.find((p) => p.id === 'p_s10') || {}).precoFornLenha === 8.1); await T.sincronizado();
    const salvo = DATA.produtos.find((p) => p.id === 'p_s10').precoFornLenha; const banco = (T.banco('produtos').find((p) => p.id === 'p_s10') || {}).precoFornLenha;
    const padraoDois = prodFornLenhaPadraoV();
    fecharGaveta(true); await T.dorme(200);
    location.hash = '#/produtos/p_s10'; await T.esperar(() => document.querySelector('#camada [data-k="precoFornLenha"]') && GAV && GAV.id === 'p_s10');
    T.escolher('precoFornLenha', ''); await T.dorme(120);
    await T.salvarGaveta(); await T.esperar(() => !('precoFornLenha' in (DATA.produtos.find((p) => p.id === 'p_s10') || {}))); await T.sincronizado();
    const limpo = !('precoFornLenha' in DATA.produtos.find((p) => p.id === 'p_s10'));
    fecharGaveta(true); await T.dorme(200);
    /* a lenha (não é combustível) não mostra o campo */
    SV = 'lenha'; location.hash = '#/produtos/p_lenha'; await T.esperar(() => GAV && GAV.id === 'p_lenha' && document.querySelector('#camada #frm'));
    const wl = document.querySelector('#camada [data-campo="precoFornLenha"]'); const naLenha = !!wl && !wl.hidden;
    fecharGaveta(true); await T.dorme(200);
    return { vis500, v500, txt500, txt10, txt10b, salvo, banco, padraoDois, limpo, naLenha };
  });
  ok(cad.vis500 && /7,90/.test(cad.v500), `cadastro do Diesel S500 mostra o preço para fornecedor de lenha: ${cad.v500}`);
  ok(/7,90/.test(cad.txt500) && /7,79/.test(cad.txt500) && /0,11/.test(cad.txt500), `mostra o custo e o acréscimo: ${cad.txt500.slice(0, 120)}`);
  ok(/Sem preço para fornecedor/.test(cad.txt10) && /7,93/.test(cad.txt10), `combustível sem preço avisa que vale o custo: ${cad.txt10.slice(0, 110)}`);
  ok(/8,10/.test(cad.txt10b) && /0,17/.test(cad.txt10b), 'ao digitar o preço, a tela mostra na hora o acréscimo sobre o custo');
  ok(cad.salvo === 8.1 && cad.banco === 8.1, `o preço do cadastro é gravado como número (R$ ${cad.salvo}) e chega ao banco central`);
  ok(cad.padraoDois === '', 'com dois combustíveis com preço para fornecedor, nenhum é escolhido sozinho no abastecimento');
  ok(cad.limpo, 'apagar o preço no cadastro tira o campo (volta a valer o custo por litro)');
  ok(!cad.naLenha, 'o campo só aparece no cadastro de combustível (não na lenha)');

  /* 3. Setor de Combustível: abastecer fornecedor de lenha */
  const ab = await page.evaluate(async () => {
    SV = 'combustivel'; CB_LENHA.novoAbast('f_a'); await T.esperar(() => document.querySelector('#camada [data-k="combLenhaPreco"]') && document.querySelector('#camada [data-k="produtoId"]'));
    await T.dorme(150);
    const prod0 = T.valor('produtoId'), preco0 = T.valor('combLenhaPreco'), forn0 = T.valor('combLenhaForn');
    T.escolher('quantidade', '70'); await T.dorme(120); const previa = T.vivo('_combLenha');
    /* trocar o combustível troca o preço que veio sozinho */
    T.escolher('produtoId', 'p_s10'); await T.dorme(120); const preco10 = T.valor('combLenhaPreco');
    T.escolher('produtoId', 'p_s500'); await T.dorme(120); const preco500 = T.valor('combLenhaPreco');
    /* o preço digitado pela pessoa fica, mesmo trocando o combustível */
    T.escolher('combLenhaPreco', '8,00'); await T.dorme(120); T.escolher('produtoId', 'p_s10'); await T.dorme(120); const digitado = T.valor('combLenhaPreco');
    T.escolher('produtoId', 'p_s500'); T.escolher('combLenhaPreco', '7,90'); await T.dorme(120);
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.combLenha)); await T.sincronizado();
    const c = DATA.consumos.find((x) => x.combLenha); const k1 = DATA.compras.find((x) => x.tipoOp === 'compra' && x.setor === 'lenha');
    const b = T.banco('consumos').find((x) => x.id === c.id) || {};
    return { prod0, preco0, forn0, previa, preco10, preco500, digitado, comb: c.combLenha, custoUnit: c.custoUnit, custoTotal: c.custoTotal, saldoLenha: finVenda(k1).saldo, diesel: saldoP('p_s500'), custo500: custoMedio('p_s500'), banco: b.combLenha && b.combLenha.valor, tem_sug: '_cblSug' in c || '_cblSug' in b };
  });
  ok(ab.prod0 === 'p_s500' && /7,90/.test(ab.preco0) && ab.forn0 === 'f_a', `“Abastecer fornecedor de lenha” já abre com o S500 a ${ab.preco0} (e não o custo de R$ 7,79)`);
  ok(/553,00/.test(ab.previa) && /70 L × R\$\s?7,90/.test(ab.previa), `antes de salvar: ${ab.previa.slice(0, 90)}`);
  ok(/7,93/.test(ab.preco10) && /7,90/.test(ab.preco500), `trocar o combustível troca o preço que veio sozinho (S10 ${ab.preco10} → S500 ${ab.preco500})`);
  ok(/8,00/.test(ab.digitado), `o preço digitado pela pessoa não muda ao trocar o combustível (${ab.digitado})`);
  ok(ab.comb && ab.comb.precoUnit === 7.9 && ab.comb.valor === 553 && ab.banco === 553, 'abastecimento gravado a R$ 7,90: 70 L × R$ 7,90 = R$ 553,00 (também no banco central)');
  ok(ab.custoUnit === 7.79 && ab.custoTotal === 545.3 && ab.custo500 === 7.79, `o custo do diesel no estoque continua R$ ${ab.custoUnit} por litro (R$ ${ab.custoTotal}); o acréscimo é só do fornecedor`);
  ok(ab.saldoLenha === 3447 && ab.diesel === 930, `desconto na lenha pelo preço do fornecedor: R$ 4.000 − R$ 553 = R$ ${ab.saldoLenha} (diesel na bomba: ${ab.diesel} L)`);
  ok(!ab.tem_sug, 'o controle do preço sugerido (_cblSug) não é gravado');

  /* 4. Setor da Lenha: "Combustível que ele levou" */
  const lm = await page.evaluate(async (c1) => {
    SV = 'lenha'; CB_LENHA.modalComb({ fornecedorId: 'f_a', data: hoje(), compraId: c1 }); await T.esperar(() => document.querySelector('#clcV'));
    const p0 = document.querySelector('#clcP').value, v0 = document.querySelector('#clcV').value, aj = (document.querySelector('#clcV').parentElement.querySelector('.ajuda') || {}).textContent || '';
    const sel = document.querySelector('#clcP'); sel.value = 'p_s10'; sel.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(80); const v10 = document.querySelector('#clcV').value;
    sel.value = 'p_s500'; sel.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(80); const v500 = document.querySelector('#clcV').value;
    const l = document.querySelector('#clcL'); l.value = '10'; l.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(80);
    const txt = (document.querySelector('#clcT') || {}).textContent || '';
    const n0 = DATA.consumos.filter((x) => x.combLenha).length;
    await T.confirmarJanela(); await T.esperar(() => DATA.consumos.filter((x) => x.combLenha).length === n0 + 1); await T.sincronizado();
    const c = DATA.consumos.filter((x) => x.combLenha).sort((a, b) => String(b.criadoEm).localeCompare(String(a.criadoEm)))[0];
    const k1 = DATA.compras.find((x) => x.id === c1);
    return { p0, v0, aj, v10, v500, txt, comb: c.combLenha, pela: c.lancadoPelaLenha, saldo: finVenda(k1).saldo };
  }, ini.c1);
  ok(lm.p0 === 'p_s500' && /7,90/.test(lm.v0), `Setor da Lenha: “Combustível que ele levou” abre no S500 a ${lm.v0}`);
  ok(/fornecedor de lenha do cadastro/.test(lm.aj), 'a ajuda do preço explica de onde ele vem');
  ok(/7,93/.test(lm.v10) && /7,90/.test(lm.v500), `trocar o combustível na janela troca o preço (S10 ${lm.v10} → S500 ${lm.v500})`);
  ok(/79,00/.test(lm.txt), `a janela mostra a conta: ${lm.txt.replace(/\s+/g, ' ').slice(0, 80)}`);
  ok(lm.comb && lm.comb.precoUnit === 7.9 && lm.comb.valor === 79 && lm.pela === true, 'gravado pela Lenha como abastecimento na bomba: 10 L × R$ 7,90 = R$ 79,00');
  ok(lm.saldo === 3368, `descontado da compra: R$ 3.447 − R$ 79 = R$ ${lm.saldo}`);

  /* 5. "Pagar com combustível" na compra de lenha também abre no S500 a R$ 7,90 */
  const pg = await page.evaluate(async (c1) => {
    window.pagarComCombustivelV62(c1); await T.esperar(() => document.querySelector('#camada [data-k="combLenhaPreco"]') && document.querySelector('#camada [data-k="produtoId"]'));
    await T.dorme(150); const r = { prod: T.valor('produtoId'), preco: T.valor('combLenhaPreco'), forn: T.valor('combLenhaForn') };
    fecharGaveta(true); await T.dorme(200); return r;
  }, ini.c1);
  ok(pg.prod === 'p_s500' && /7,90/.test(pg.preco) && pg.forn === 'f_a', `“Pagar com combustível” na compra abre com o S500 a ${pg.preco}`);

  /* 6. telas sem erro */
  await page.evaluate(async () => { for (const [r, s] of [['#/setor-combustivel', 'combustivel'], ['#/combLenha', 'combustivel'], ['#/setor-lenha', 'lenha'], ['#/clComb', 'lenha'], ['#/clAPagar', 'lenha']]) { SV = s; location.hash = r; await T.dorme(400); } });
  const tela = await page.evaluate(async () => { SV = 'combustivel'; location.hash = '#/combLenha'; await T.dorme(600); return (document.querySelector('#svCorpo') || {}).textContent || ''; });
  ok(/7,90/.test(tela) && /553,00/.test(tela), 'tela “Combustível para lenha” mostra o preço de R$ 7,90 e o valor de R$ 553,00');
  const relevantes = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
} catch (e) {
  falhas++; console.error('  ✘ o teste parou:', e && (e.stack || e.message || e));
} finally {
  await browser.close(); http.close();
}
const n = (k) => resultados.filter((r) => r[0] === k).length;
console.log(`\nPreço do combustível para o fornecedor de lenha: ${n('ok')} aprovados, ${n('FALHOU')} falharam.`);
process.exit(falhas ? 1 : 0);
