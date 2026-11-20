#!/usr/bin/env node
// Teste de ponta a ponta das Movimentações dos setores (V151), no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Dados fictícios.
//  - Almoxarifado, Combustível, Lenha e Produção têm o módulo "Movimentações" no menu do setor
//  - a lista traz o setor inteiro (entradas, saídas, abastecimentos, consumo, despesas, pagamentos, levadas,
//    produção…), com os botões de tipo no alto, que filtram na hora, a pesquisa, o período e quem lançou
//  - o saldo antes e depois de cada movimento de estoque bate com o saldo de hoje
//  - tocar num lançamento abre o COMPROVANTE DE MOVIMENTAÇÃO (cupom e A4), com imprimir e PDF;
//    o menu de três pontos tem Visualizar, Imprimir, PDF, Compartilhar e Ir para o lançamento
//  - nada é gravado no banco ao abrir as telas e os comprovantes
// Uso: node scripts/construir.mjs && node scripts/testar-movimentacoes.mjs
// FOTOS=<pasta> guarda capturas das telas (computador e celular).
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const acharLib = (nome) => { for (const b of [RAIZ, process.cwd(), process.env.JB_LIBS || '']) { if (!b) continue; const p = join(b, 'node_modules', nome); if (existsSync(p)) return p; } return null; };
const LIB_PDF = acharLib('jspdf/dist/jspdf.umd.min.js'), LIB_TAB = acharLib('jspdf-autotable/dist/jspdf.plugin.autotable.min.js');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', cnpj: '11.222.333/0001-81', cidade: 'Cidade Exemplo/MA' } }],
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', situacao: 'Ativo', setor: 'Produção', departamento: 'Produção' }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_cam', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste', tipo: 'Caminhão', identificacao: 'ABC1D23', controleUso: 'Hodômetro (km)', situacao: 'Ativo', responsavel: 'Motorista Teste' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', cnpj: '11222333000181', situacao: 'Ativo' }],
  ['fornecedores', 'f_lenha', { id: 'f_lenha', setor: 'lenha', nome: 'Madeireira Exemplo', tipoPessoa: 'Física', situacao: 'Ativo' }],
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
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const u = r.request().url();
    if (/jspdf(\.umd)?(\.min)?\.js/.test(u) && !/autotable/.test(u)) return LIB_PDF ? r.fulfill({ contentType: 'text/javascript', body: readFileSync(LIB_PDF) }) : r.abort();
    if (/autotable/.test(u)) return LIB_TAB ? r.fulfill({ contentType: 'text/javascript', body: readFileSync(LIB_TAB) }) : r.abort();
    return r.abort();
  });
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
  const foto = async (nome) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, nome + '.png') }); };
  const ir = async (rota, sel) => { await page.evaluate((r) => JBNAV.ir(r), rota); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(500); };

  /* utilidades dentro da página (as mesmas dos outros testes) */
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        const er = [...document.querySelectorAll('#camada .cmp.erro')].map((w) => (w.querySelector('.rot') || {}).textContent + ': ' + (w.querySelector('.msg') || {}).textContent); if (er.length) throw new Error('formulário não salvou: ' + er.join(' | ')); },
      abrirNovo: async (mod, setor, dados) => { SV = setor; PREFILL = { mod, dados }; JBNAV.ir('#/' + mod + '/novo'); await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(300); },
      docsNoBanco: () => [...window.__srv.estado.docs.values()].filter((d) => d.colecao !== 'diagnostico').length,   /* o autodiagnóstico diário do sistema grava sozinho */
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { JBNAV.ir('#/compra/nova'); await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
    };
  });

  console.log('Dados de exemplo (pelas telas e funções do próprio programa)');
  const prep = await page.evaluate(async () => {
    /* Combustível: entrada (compra), abastecimento, abastecimento em posto, combustível do fornecedor de lenha, saída e despesa */
    const c1 = await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5); await T.sincronizado();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', localId: 'l_cam', quantidade: 120, medidor: 1500 }); await T.salvarGaveta(); await T.sincronizado();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', localId: 'l_cam', quantidade: 50, origem: 'Posto externo', postoId: 'f_posto', precoPosto: 6, formaPosto: 'PIX', condPosto: 'A prazo', vencPosto: hoje(), cupom: '4455' });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.origem === 'Posto externo')); await T.sincronizado();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 30, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_lenha', combLenhaPreco: 6 }); await T.salvarGaveta(); await T.sincronizado();
    SV = 'combustivel';
    await gravarRegistro('estoqueMov', { ...MODS.estoqueMov.padrao(), id: novoId(), setor: 'combustivel', tipo: 'Saída', produtoId: 'p_s10', quantidade: 10, motivo: 'Gerador da secagem', destino: 'Gerador' }, null, true); await T.sincronizado();
    await gravarRegistro('fTitulos', { ...MODS.fTitulos.padrao(), id: novoId(), data: hoje(), descricao: 'Diesel da entrega (posto da cidade)', categoria: 'Combustível para entrega', setorOrigem: 'Setor de Combustível', beneficiarioTipo: 'Outro', beneficiario: 'Posto da cidade', motorista: 'Motorista Teste', valor: 200, vencimento: hoje(), formaPrevista: 'Dinheiro', pagamentos: [] }, null, true); await T.sincronizado();
    /* Lenha: entrega (compra), consumo no forno, levada, combustível à mão, desconto */
    const c2 = await T.comprar('lenha', 'f_lenha', 'p_lenha', 20, 100); await T.sincronizado();
    await T.abrirNovo('consumos', 'lenha', { produtoId: 'p_lenha', localId: 'l_forno', quantidade: 5, operador: 'Forneiro Teste' }); await T.salvarGaveta(); await T.sincronizado();
    SV = 'lenha';
    await gravar('lenhaMov', { id: novoId(), tipo: 'transferencia', setor: 'lenha', data: hoje(), hora: '09:30', de: 'fora', para: 'chao', quantidade: 3, unidade: 'm³', classe: 'Grossa', quem: 'Carregador Teste', criadoEm: new Date().toISOString(), criadoPor: APP.uid }, null);
    await gravarRegistro('clComb', { ...MODS.clComb.padrao(), id: novoId(), fornecedorId: 'f_lenha', onde: MODS.clComb.fields.find((f) => f.k === 'onde').op[0], quantidade: 8, precoUnit: 6.25, valor: 50 }, null, true);
    await gravarRegistro('clDesc', { ...MODS.clDesc.padrao(), id: novoId(), fornecedorId: 'f_lenha', valor: 40, motivo: 'Carga com lenha molhada', docRef: 'Romaneio 12' }, null, true); await T.sincronizado();
    /* Almoxarifado: itens, entrada sem compra, EPI e empréstimo de ferramenta */
    const mk = (o) => gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: novoId(), ...o }, null, true);
    const rol = await mk({ nome: 'Rolamento 6205', categoria: 'Peças e manutenção', unidade: 'unidade' });
    const luva = await mk({ nome: 'Luva de raspa', categoria: 'EPI', unidade: 'par' });
    const arroz = await mk({ nome: 'Arroz 5 kg', categoria: 'Cozinha', unidade: 'pacote' });
    const chave = await mk({ nome: 'Chave de fenda', categoria: 'Ferramentas', unidade: 'unidade' });
    const aj = (itemId, qtd, preco) => gravarRegistro('almAjustes', { ...MODS.almAjustes.padrao(), id: novoId(), data: hoje(), itemId, tipo: 'entrada', qtd, precoUnit: preco, motivo: 'Saldo inicial', responsavel: 'Almoxarife Teste' }, null, true);
    await aj(rol.id || rol, 10, 25); await aj(luva.id || luva, 20, 8); await aj(arroz.id || arroz, 6, 30); await aj(chave.id || chave, 4, 15);
    await T.sincronizado();
    const id = (x, n) => (x && x.id) || (DATA.almItens.find((i) => i.nome === n) || {}).id;
    await gravarRegistro('almEpis', { ...MODS.almEpis.padrao(), id: novoId(), data: hoje(), itemId: id(luva, 'Luva de raspa'), qtd: 2, funcId: 'f1', motivo: 'Entrega inicial' }, null, true);
    await gravarRegistro('almEmprestimos', { ...MODS.almEmprestimos.padrao(), id: novoId(), data: hoje(), previsao: hoje(), itemId: id(chave, 'Chave de fenda'), qtd: 1, funcId: 'f1' }, null, true);
    await T.sincronizado();
    /* Produção: maromba, parada, secador, enforna, desenforna e tijolo pronto */
    const P = (mod, o) => gravarRegistro(mod, { ...MODS[mod].padrao(), id: novoId(), data: hoje(), ...o }, null, true);
    await P('pmaromba', { turno: '1º turno', grades: 10, porGrade: 500, perdas: 100, motivoPerda: 'Barro seco', situacao: 'Confirmado', operador: 'Operador Teste' });
    await P('pparadas', { turno: '1º turno', inicio: '09:00', fim: '09:40', motivo: 'Falta de energia' });
    await P('psecmov', { mov: 'Entrada no secador', grades: 10, porGrade: 490 });
    await P('pfornadas', { fornoId: 'l_forno', numero: 7, quantidade: 4000, confirmacao: 'Confirmada', situacao: 'Em queima', responsavel: 'Forneiro Teste' });
    await T.sincronizado();
    const fid = DATA.pfornadas[0] && DATA.pfornadas[0].id;
    await P('pdesenf', { fornoId: 'l_forno', fornadaId: fid, total: 3900, primeira: 3500, segunda: 300, quebrados: 100, situacao: 'Confirmado', responsavel: 'Forneiro Teste' });
    await P('pprontomov', { mov: 'Saída', qualidade: '1ª qualidade', quantidade: 1000, destino: 'Carregamento de venda' });
    await T.sincronizado();
    return { c1: !!c1, c2: !!c2, cons: DATA.consumos.length, tit: (DATA.fTitulos || []).length, saldo: saldoP('p_s10'), lenha: saldoP('p_lenha'), alm: DATA.almAjustes.length, prod: (DATA.pmaromba || []).length + (DATA.pdesenf || []).length };
  });
  /* a enforna da fornada nº 7 (4.000 tijolos) baixa sozinha 4,12 m³ de lenha (1,03 m³ por milheiro): 20 − 5 − 4,12 = 10,88 */
  ok(prep.c1 && prep.c2 && prep.cons >= 5 && prep.saldo === 840 && prep.lenha === 10.88, `dados lançados (abastecimentos, consumos e a baixa automática da enforna; diesel ${prep.saldo} L; lenha ${prep.lenha} m³)`);

  /* ---------- Combustível ---------- */
  console.log('Combustível');
  await ir('#/setor-combustivel', '#svCorpo');
  ok(await page.locator('#conteudo .sv-abas a[href="#/movCombustivel"]').count() === 1, 'o módulo Movimentações está no menu do setor (e nos Módulos do alto)');
  ok(await page.locator('#conteudo .sv-abas a[href="#/consumos"]').count() === 1 && /Abastecimentos/.test(await page.locator('#conteudo .sv-abas a[href="#/consumos"]').innerText()), 'a lista de abastecimentos continua, com o nome "Abastecimentos"');
  const nAntes = await page.evaluate(() => T.docsNoBanco());
  await ir('#/movCombustivel', '[data-mvg] [data-mvgr]');
  await foto('01-combustivel');
  const cb = await page.evaluate(() => {
    const U = JB_MOV.estado('combustivel'); const R = U.rows;
    const chip = (g) => { const b = document.querySelector(`[data-mvgr="${g}"] em`); return b ? +b.textContent : -1; };
    const ab = R.find((r) => r.tipo === 'Abastecimento'); const ps = R.find((r) => r.tipo === 'Abastecimento em posto');
    return { tudo: chip(''), ent: chip('ent'), abast: chip('abast'), lenha: chip('lenha'), sai: chip('sai'), desp: chip('desp'), linhas: document.querySelectorAll('[data-mvres] tr[data-mv]').length,
      ab: ab ? { q: ab.qtdTxt, antes: ab.sAntes, depois: ab.sDepois, quem: ab.quem, parte: ab.parte } : null, posto: ps ? { q: ps.qtdTxt, desp: ps.g2 && ps.g2.includes('desp') } : null,
      contaPostoRepetida: R.filter((r) => r.kind === 'titulo' && r.rec && r.rec.consumoId).length, saldoFinal: R.filter((r) => r.pid === 'p_s10' && r.sDepois != null).sort((a, b) => (a.ord < b.ord ? 1 : -1))[0] };
  });
  ok(!(await page.locator('[data-mvres] table tfoot').count()), 'sem linha de total: tipos diferentes não se somam');
  ok(cb.tudo === 6 && cb.linhas === 6, `a lista traz o setor inteiro: ${cb.tudo} movimentações (entrada, abastecimento, posto, fornecedor de lenha, saída e despesa)`);
  ok(cb.ent === 1 && cb.abast === 2 && cb.lenha === 1 && cb.sai === 1 && cb.desp === 2, `botões de tipo com a contagem certa (Entradas ${cb.ent}, Abastecimentos ${cb.abast}, Para fornecedor de lenha ${cb.lenha}, Saídas ${cb.sai}, Despesas ${cb.desp})`);
  ok(cb.posto && cb.posto.desp && cb.contaPostoRepetida === 0, 'abastecimento em posto aparece em Abastecimentos e em Despesas, sem repetir a conta a pagar dele');
  ok(cb.ab && cb.ab.q === '−120 L' && cb.ab.antes === 1000 && cb.ab.depois === 880, `abastecimento: ${cb.ab && cb.ab.q}, saldo ${cb.ab && cb.ab.antes} → ${cb.ab && cb.ab.depois} L`);
  ok(cb.saldoFinal && cb.saldoFinal.sDepois === 840, 'o saldo depois do último movimento é o saldo de hoje (840 L)');
  /* filtro de tipo no alto: atualiza na hora, sem trocar de tela */
  await page.click('[data-mvgr="abast"]'); await page.waitForTimeout(250);
  let lin = await page.locator('[data-mvres] tr[data-mv]').count();
  ok(lin === 2 && /movCombustivel/.test(page.url()), `botão "Abastecimentos": ${lin} linhas, na mesma tela`);
  await page.click('[data-mvgr="desp"]'); await page.waitForTimeout(250);
  const desp = await page.evaluate(() => [...document.querySelectorAll('[data-mvres] tr[data-mv]')].map((t) => t.innerText).join(' | '));
  ok(/Despesa com combustível/.test(desp) && /Abastecimento em posto/.test(desp), 'botão "Despesas": a despesa do Financeiro e o abastecimento no posto');
  await page.click('[data-mvgr=""]'); await page.waitForTimeout(200);
  await page.fill('#mvQ', 'caminhao abc'); await page.waitForTimeout(450);
  lin = await page.locator('[data-mvres] tr[data-mv]').count();
  ok(lin === 2, `pesquisa sem acento ("caminhao abc"): ${lin} linhas (os dois abastecimentos do caminhão)`);
  await page.fill('#mvQ', 'madeireira'); await page.waitForTimeout(450);
  lin = await page.locator('[data-mvres] tr[data-mv]').count();
  ok(lin === 1, 'pesquisa pelo fornecedor de lenha encontra o combustível dado a ele');
  await page.fill('#mvQ', ''); await page.waitForTimeout(450);
  /* menu de três pontos (padrão V129) */
  const tem3 = await page.locator('[data-mvres] tr[data-mv] .jbl-m').count();
  if (tem3) {
    await page.locator('[data-mvres] tr[data-mv] .jbl-m').first().click(); await page.waitForTimeout(250);
    const itens = await page.evaluate(() => [...document.querySelectorAll('.dc-pop button, .dc-pop a')].map((b) => b.innerText.split('\n')[0].trim()));
    ok(itens.includes('Visualizar') && itens.includes('Imprimir comprovante') && itens.some((x) => /PDF/.test(x)) && itens.some((x) => /Compartilhar/.test(x)) && itens.includes('Ir para o lançamento'),
      'três pontinhos: Visualizar, Imprimir, PDF, Compartilhar e Ir para o lançamento (' + itens.join(', ') + ')');
    await page.keyboard.press('Escape'); await page.mouse.click(5, 5); await page.waitForTimeout(150);
  } else ok(false, 'a linha ganha o menu de três pontos');
  /* tocar na linha: comprovante da movimentação */
  await page.locator('[data-mvres] tr[data-mv]', { hasText: '−120 L' }).first().click();
  await page.waitForFunction(() => location.hash === '#/documento' && typeof DOC_VER !== 'undefined' && DOC_VER, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  const dv = await page.evaluate(() => { const D = DOC_VER.D; const txt = document.getElementById('conteudo').innerText;
    return { tipo: D.tipo, kind: D.cupom && D.cupom.kind, cupom: !!D.cupom, tx: txt, setor: D.setor, linhas: (D.cupom.blocos || []).map((b) => b.rot) }; });
  ok(dv.tipo === 'COMPROVANTE DE MOVIMENTAÇÃO' && dv.cupom && dv.kind === 'movimentacao', 'tocar no lançamento abre o comprovante de movimentação (cupom no padrão do sistema)');
  ok(/Saldo antes/.test(dv.tx) && /Saldo depois/.test(dv.tx) && /Caminhão Teste/.test(dv.tx) && /Imprimir/.test(dv.tx) && /Exportar PDF/.test(dv.tx), 'comprovante detalhado: saldo antes e depois, veículo, Imprimir e Exportar PDF');
  ok(dv.linhas.includes('Movimentação') && dv.linhas.includes('Registro no sistema') && dv.linhas.length >= 3, 'cupom com o movimento, os detalhes do lançamento de origem e o registro (' + dv.linhas.join(' · ') + ')');
  await foto('02-comprovante-cupom');
  const a4 = await page.evaluate(() => { const b = document.querySelector('[data-fmt="a4"]'); if (b) b.click(); return !!b; });
  if (a4) { await page.waitForTimeout(400); ok(/COMPROVANTE DE MOVIMENTA/i.test(await page.locator('#conteudo').innerText()), 'o mesmo comprovante em folha A4'); await foto('03-comprovante-a4'); }
  const pdf = await page.evaluate(() => { try { if (!window.jspdf) return 'sem biblioteca'; const d = pdfDoDoc(JB_MOV.docMov(JB_MOV.estado('combustivel').rows.find((r) => r.tipo === 'Entrada de combustível'))); return d && d.output('arraybuffer').byteLength > 1000 ? 'ok' : 'vazio'; } catch (e) { return 'erro: ' + e.message; } });
  if (pdf === 'sem biblioteca') console.log('  – PDF não conferido: biblioteca jsPDF ausente neste ambiente');
  else ok(pdf === 'ok', 'o PDF do comprovante é gerado (' + pdf + ')');
  await page.evaluate(() => { const a = [...document.querySelectorAll('#conteudo a.btn')].find((x) => /Voltar/.test(x.textContent)); if (a) a.click(); });
  await page.waitForFunction(() => location.hash === '#/movCombustivel', null, { timeout: 8000 }); await page.waitForTimeout(400);
  ok(await page.locator('[data-mvres] tr[data-mv]').count() === 6, 'Voltar leva de novo às movimentações');
  /* todos os comprovantes do setor montam sem erro */
  const todos = await page.evaluate(() => JB_MOV.estado('combustivel').rows.map((r) => { try { const D = JB_MOV.docMov(r); return D && D.cupom && D.blocos.length ? '' : r.tipo; } catch (e) { return r.tipo + ': ' + e.message; } }).filter(Boolean));
  ok(!todos.length, 'comprovante de todos os tipos do Combustível' + (todos.length ? ': ' + todos.join('; ') : ''));

  /* ---------- Lenha ---------- */
  console.log('Lenha');
  await ir('#/setor-lenha', '#svCorpo');
  ok(await page.locator('#conteudo .sv-abas a[href="#/movLenha"]').count() === 1, 'o módulo Movimentações está no menu do Setor da Lenha');
  await ir('#/movLenha', '[data-mvg] [data-mvgr]');
  await foto('04-lenha');
  const ln = await page.evaluate(() => { const chip = (g) => { const b = document.querySelector(`[data-mvgr="${g}"] em`); return b ? +b.textContent : -1; };
    const R = JB_MOV.estado('lenha').rows; const c = R.find((r) => r.tipo === 'Consumo nos fornos'); const auto = R.find((r) => r.tipo === 'Consumo na enforna (automático)');
    return { tudo: chip(''), ent: chip('ent'), cons: chip('cons'), lev: chip('lev'), comb: chip('comb'), desc: chip('desc'), consQ: c && c.qtdTxt, consD: c && c.sDepois, auto: auto && auto.qtdTxt, autoD: auto && auto.sDepois, tipos: R.map((r) => r.tipo) }; });
  ok(ln.ent === 1 && ln.cons === 2 && ln.lev === 1 && ln.comb === 2 && ln.desc === 1, `Entradas ${ln.ent}, Consumo ${ln.cons} (manual e a baixa da enforna), Levadas ${ln.lev}, Combustível e produtos ${ln.comb} (bomba e à mão), Descontos ${ln.desc}`);
  ok(ln.consQ === '−5 m³' && ln.consD === 15 && ln.auto === '−4,12 m³' && ln.autoD === 10.88, `consumo no forno ${ln.consQ} (saldo ${ln.consD} m³) e baixa da enforna ${ln.auto} (saldo ${ln.autoD} m³)`);
  await page.click('[data-mvgr="comb"]'); await page.waitForTimeout(250);
  ok(await page.locator('[data-mvres] tr[data-mv]').count() === 2, 'botão "Combustível e produtos" filtra na hora');
  const tl = await page.evaluate(() => JB_MOV.estado('lenha').rows.map((r) => { try { const D = JB_MOV.docMov(r); return D && D.cupom ? '' : r.tipo; } catch (e) { return r.tipo + ': ' + e.message; } }).filter(Boolean));
  ok(!tl.length, 'comprovante de todos os tipos da Lenha' + (tl.length ? ': ' + tl.join('; ') : ''));
  await page.click('[data-mvgr=""]');

  /* ---------- Almoxarifado ---------- */
  console.log('Almoxarifado');
  await ir('#/setor-almox', '#svCorpo');
  ok(await page.locator('#conteudo .sv-abas a[href="#/almMov"]').count() === 1, 'Movimentações continua no menu do almoxarifado');
  await ir('#/almMov', '[data-mvg] [data-mvgr]');
  await foto('05-almox');
  const al = await page.evaluate(() => { const chip = (g) => { const b = document.querySelector(`[data-mvgr="${g}"] em`); return b ? +b.textContent : -1; };
    return { tudo: chip(''), ent: chip('ent'), sai: chip('sai'), epi: chip('epi'), fer: chip('fer'), esc: document.querySelectorAll('[data-mvesc]').length, busca: !!document.querySelector('#mvQ') }; });
  ok(al.busca && al.esc === 4, 'almoxarifado com a pesquisa e os botões Tudo, Almoxarifado, Cozinha e Limpeza');
  ok(al.ent === 4 && al.epi === 1 && al.sai === 1 && al.fer === 1 && al.tudo === 6, `Entradas ${al.ent}, Saídas ${al.sai} (a luva do EPI), EPIs ${al.epi}, Ferramentas ${al.fer} (empréstimo), Tudo ${al.tudo}`);
  await page.click('[data-mvesc="coz"]'); await page.waitForTimeout(250);
  ok(await page.locator('[data-mvres] tr[data-mv]').count() === 1 && /Arroz/.test(await page.locator('[data-mvres]').innerText()), 'botão Cozinha: só o arroz');
  await page.click('[data-mvesc=""]'); await page.waitForTimeout(200);
  /* "Ver as movimentações deste item" (ficha do item) continua abrindo filtrado, agora com o saldo depois de cada movimento */
  await page.evaluate(() => { const i = DATA.almItens.find((x) => x.nome === 'Luva de raspa'); ALMOX_V52.verMov(i.id); });
  await page.waitForSelector('[data-mvres] tr[data-mv]'); await page.waitForTimeout(500);
  const kx = await page.evaluate(() => ({ item: JB_MOV.estado('almox').item, linhas: document.querySelectorAll('[data-mvres] tr[data-mv]').length, saldo: /Saldo depois/.test(document.querySelector('[data-mvres] thead').innerText), txt: document.querySelector('[data-mvres] tbody').innerText }));
  ok(kx.item && kx.linhas === 2 && kx.saldo && /18 par/.test(kx.txt), 'ficha do item → movimentações só da luva, com o saldo depois de cada uma (20 → 18)');
  await page.selectOption('#mvI', ''); await page.waitForTimeout(250);
  const ta = await page.evaluate(() => JB_MOV.estado('almox').rows.map((r) => { try { const D = JB_MOV.docMov(r); return D && D.cupom ? '' : r.tipo; } catch (e) { return r.tipo + ': ' + e.message; } }).filter(Boolean));
  ok(!ta.length, 'comprovante de todos os tipos do Almoxarifado' + (ta.length ? ': ' + ta.join('; ') : ''));

  /* ---------- Produção ---------- */
  console.log('Produção');
  await ir('#/setor-producao', '#svCorpo');
  ok(await page.locator('#conteudo .sv-abas a[href="#/movProducao"]').count() === 1, 'o módulo Movimentações está nas abas do Setor de Produção');
  await ir('#/movProducao', '[data-mvg] [data-mvgr]');
  await foto('06-producao');
  const pr = await page.evaluate(() => { const chip = (g) => { const b = document.querySelector(`[data-mvgr="${g}"] em`); return b ? +b.textContent : -1; };
    return { tudo: chip(''), mar: chip('mar'), par: chip('par'), sec: chip('sec'), enf: chip('enf'), des: chip('des'), pro: chip('pro'), per: chip('per'), resumo: document.querySelector('[data-mvres] .resumo').innerText }; });
  ok(pr.tudo === 6 && pr.mar === 1 && pr.par === 1 && pr.sec === 1 && pr.enf === 1 && pr.des === 1 && pr.pro === 1, 'maromba, parada, secador, enforna, desenforna e tijolo pronto');
  ok(pr.per === 2 && /4\.900/.test(pr.resumo) && /200/.test(pr.resumo), `Perdas: ${pr.per} lançamentos (maromba e desenforna); resumo com a produção líquida e as perdas`);
  await page.click('[data-mvgr="per"]'); await page.waitForTimeout(250);
  ok(await page.locator('[data-mvres] tr[data-mv]').count() === 2, 'botão "Perdas" filtra na hora');
  const tp = await page.evaluate(() => JB_MOV.estado('producao').rows.map((r) => { try { const D = JB_MOV.docMov(r); return D && D.cupom ? '' : r.tipo; } catch (e) { return r.tipo + ': ' + e.message; } }).filter(Boolean));
  ok(!tp.length, 'comprovante de todos os tipos da Produção' + (tp.length ? ': ' + tp.join('; ') : ''));

  /* ---------- nada foi gravado ---------- */
  await page.waitForTimeout(400);
  const nDepois = await page.evaluate(() => T.docsNoBanco());
  ok(nDepois === nAntes, `abrir as telas e os comprovantes não grava nada no banco (${nAntes} → ${nDepois} documentos)`);

  /* ---------- celular ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await ir('#/movCombustivel', '[data-mvg] [data-mvgr]');
  const larg = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(larg <= 392, `no celular a tela não rola para o lado (${larg}px)`);
  await foto('07-celular');
  ok(!erros.length, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  console.error(e); falhas++;
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
