#!/usr/bin/env node
// Teste de ponta a ponta da V165 (estoque integrado Almoxarifado ↔ Combustível), no navegador, com o programa
// REAL (saida/claude.html) e o banco central SIMULADO (scripts/lib/servidor-falso.mjs).
// Só dados fictícios, em memória: nada vai para o banco real da Cerâmica Concretiza.
// Uso: node scripts/construir.mjs && node scripts/testar-estoque-integrado.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mes = hoje.slice(0, 7);
const CNPJ = '11222333000181';
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10 Teste', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_oleo', { id: 'p_oleo', setor: 'combustivel', nome: 'Óleo 10W40 Teste', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Óleo lubrificante' }],
  ['produtos', 'p_graxa', { id: 'p_graxa', setor: 'combustivel', nome: 'Graxa Teste', unidade: 'kg', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Graxa' }],
  ['locais', 'l_carreg', { id: 'l_carreg', setor: 'combustivel', nome: 'Carregadeira Teste', tipo: 'Máquina', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Distribuidora Fictícia', tipoPessoa: 'Jurídica', cnpj: CNPJ, doc: CNPJ, situacao: 'Ativo' }],
  ['estoqueMov', mes + '-s0', { chave: mes + '-s0', items: {
    m1: { id: 'm1', setor: 'combustivel', tipo: 'Entrada', data: hoje, hora: '05:00', produtoId: 'p_s10', quantidade: 500, delta: 500, motivo: 'Estoque inicial de teste', criadoEm: '2026-11-01T09:00:00.000Z', criadoPor: 'u_DONO' },
    m2: { id: 'm2', setor: 'combustivel', tipo: 'Entrada', data: hoje, hora: '05:01', produtoId: 'p_graxa', quantidade: 10, delta: 10, motivo: 'Estoque inicial de teste', criadoEm: '2026-11-01T09:00:00.000Z', criadoPor: 'u_DONO' },
    m3: { id: 'm3', setor: 'combustivel', tipo: 'Entrada', data: hoje, hora: '05:02', produtoId: 'p_oleo', quantidade: 40, delta: 40, motivo: 'Estoque inicial de teste', criadoEm: '2026-11-01T09:00:00.000Z', criadoPor: 'u_DONO' } } }],
];
/* os documentos do almoxarifado ficam no grupo certo (o mesmo cálculo do programa), para uma edição não criar cópia */
const hashTxt = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const almItens = {
    fa1: { id: 'fa1', jbt: 'fornecedor', nome: 'Distribuidora Fictícia', doc: CNPJ, ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z' },
    i_balde: { id: 'i_balde', jbt: 'item', codigo: 'PEC-901', nome: 'BALDE OLEO 10W40 TESTE', categoria: 'Peças e manutenção', unidade: 'unidade', ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z' },
    i_filtro: { id: 'i_filtro', jbt: 'item', codigo: 'PEC-902', nome: 'FILTRO LUBRIFICANTE TESTE', categoria: 'Peças e manutenção', unidade: 'unidade', ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z' },
    i_luva: { id: 'i_luva', jbt: 'item', codigo: 'EPI-901', nome: 'Luva de raspa teste', categoria: 'EPI', unidade: 'par', ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z' },
    i_soja: { id: 'i_soja', jbt: 'item', codigo: 'COZ-901', nome: 'Óleo de soja teste', categoria: 'Cozinha', unidade: 'unidade', ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z' } };
const grupos = {};
Object.values(almItens).forEach((r) => { const k = mes + '-s' + (hashTxt(r.id) % 6); (grupos[k] = grupos[k] || { chave: k, items: {} }).items[r.id] = r; });
Object.entries(grupos).forEach(([k, d]) => docs.push(['alm', k, d]));


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
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && window.JB_ESTOQUE, null, { timeout: 30000 });

  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ([...document.querySelectorAll('.veu .modal')].map((m) => m.textContent).join(' || ') || '—').slice(0, 300)); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      banco: (col) => { const out = []; window.__srv.estado.docs.forEach((d) => { if (d.colecao !== col) return; if (d.dados && d.dados.items) Object.entries(d.dados.items).forEach(([id, v]) => { if (v) out.push({ ...v, id }); }); else out.push({ ...d.dados, id: d.id }); }); return out; },
      sinc: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(350); },
      ultimoOk: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]')); const bs = [...document.querySelectorAll('.veu .modal [data-r="1"]')]; bs[bs.length - 1].click(); await T.dorme(200); },
      /* janela do estoque integrado: preenche e confirma; depois confirma a pergunta final, se houver */
      janela: async (campos, extra) => { await T.esperar(() => document.querySelector('.ei-modal')); const m = document.querySelector('.ei-modal');
        Object.entries(campos).forEach(([k, v]) => { const el = m.querySelector(k); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); });
        if (extra) await extra(); m.querySelector('[data-r="1"]').click(); await T.dorme(300);
        const conf = [...document.querySelectorAll('.veu .modal:not(.ei-modal) [data-r="1"]')]; if (conf.length) { conf[conf.length - 1].click(); await T.dorme(300); }
        await T.esperar(() => !document.querySelector('.ei-modal') || (document.querySelector('[data-eierro]') || {}).textContent, 6000); return (document.querySelector('[data-eierro]') || {}).textContent || ''; },
      fecharJanelas: () => document.querySelectorAll('.veu').forEach((v) => v.remove()),
      escolha: async (k) => { await T.esperar(() => document.querySelector('.ei-modal .ei-ops')); const t = document.querySelector('.ei-modal h3').textContent; document.querySelector('.ei-modal .ei-ops [data-k="' + k + '"]').click(); await T.dorme(250); return t; },
      total: (pid, iid) => { const i = window.ALMOX_V52.ITEM(iid); const f = +(i && i.fatorSetor) || 1; return Math.round((ALMOX_V52.estI(iid).saldo * f + saldoP(pid)) * 1000) / 1000; },
      mestre: (pid) => DATA.almItens.find((i) => i.produtoSetorId === pid),
      entradaAlm: async (draft) => { const d = { ...ALMOX_V52.rascunhoE(null), fornecedorId: 'fa1', forma: 'prazo', nParc: 1, ...draft }; ALMOX_V52.setRE(d); const antes = DATA.almEntradas.length;
        JBNAV.ir('#/almEntrada/nova'); await T.esperar(() => document.querySelector('#eOk')); await T.dorme(200); document.querySelector('#eOk').click();
        await T.dorme(300); if (DATA.almEntradas.length === antes && document.querySelector('.veu .modal [data-r="1"]')) await T.ultimoOk();
        await T.esperar(() => DATA.almEntradas.length > antes, 8000); await T.sinc(); return DATA.almEntradas.find((e) => !window.__vistas || !window.__vistas.has(e.id)); },
      compra: async (prod, qtd, nf) => { SV = 'combustivel'; const R = novoRascunhoV(OP.compra, 'combustivel'); Object.assign(R, { parteId: 'f_posto', itens: [{ produtoId: prod, qtd, preco: 6 }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto', nf: nf || '' });
        RASC_V.compra = R; for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); await T.dorme(1200); document.querySelector('#vdOk').click(); await T.esperar(() => document.querySelector('.veu .modal'), 4000).catch(() => {}); await T.dorme(200); },
    };
  });

  console.log('1. Classificação do setor de cada item');
  const c1 = await page.evaluate(() => { const C = (i) => JB_ESTOQUE.classificar(i).setor; const I = ALMOX_V52.ITEM;
    return { balde: C(I('i_balde')), filtro: C(I('i_filtro')), luva: C(I('i_luva')), soja: C(I('i_soja')), diesel: C({ id: 'x', nome: 'Diesel S10 granel', categoria: 'Outros' }), graxa: C({ id: 'y', nome: 'Graxa de chassi', categoria: 'Peças e manutenção' }), parafuso: C({ id: 'z', nome: 'Parafuso sextavado', categoria: 'Peças e manutenção' }) }; });
  ok(c1.balde === 'combustivel' && c1.diesel === 'combustivel' && c1.graxa === 'combustivel', 'óleo 10W40, diesel e graxa são do Combustível');
  ok(c1.filtro === 'almox' && c1.parafuso === 'almox', 'filtros e peças ficam no Almoxarifado');
  ok(c1.luva === 'almox' && c1.soja === 'almox', 'EPI e cozinha (óleo de soja) não vão para o Combustível');

  console.log('2. Cadastro mestre dos produtos do Combustível (sem mexer nos cadastros atuais)');
  const c2 = await page.evaluate(async () => { const antes = JSON.stringify(T.banco('produtos').sort((a, b) => a.id < b.id ? -1 : 1));
    const n = await JB_ESTOQUE.criarMestres(); await T.esperar(() => ['p_s10', 'p_oleo', 'p_graxa'].every((p) => T.mestre(p))); await T.sinc();
    const de2 = await JB_ESTOQUE.criarMestres();
    return { n, de2, cods: ['p_graxa', 'p_oleo', 'p_s10'].map((p) => T.mestre(p).codigo + '/' + T.mestre(p).categoria), prodIguais: JSON.stringify(T.banco('produtos').sort((a, b) => a.id < b.id ? -1 : 1)) === antes,
      saldos: [saldoP('p_s10'), saldoP('p_oleo'), saldoP('p_graxa')], almS10: ALMOX_V52.estI(T.mestre('p_s10').id).saldo }; });
  ok(c2.n === 3 && c2.de2 === 0, `3 itens mestres criados, e pedir de novo não duplica (${c2.n}, depois ${c2.de2})`);
  ok(c2.cods.every((x) => /^CMB-\d{3}\/Combustíveis e lubrificantes$/.test(x)), 'códigos CMB-00x na categoria Combustíveis e lubrificantes: ' + c2.cods.join(', '));
  ok(c2.prodIguais, 'os produtos do Combustível não foram alterados');
  ok(c2.saldos.join() === '500,40,10' && c2.almS10 === 0, 'saldos de antes continuam iguais e nada foi somado no Almoxarifado');

  console.log('3. Entrada pelo Almoxarifado: diesel vai direto para o Combustível, filtro fica');
  const c3 = await page.evaluate(async () => { window.__vistas = new Set(DATA.almEntradas.map((e) => e.id)); const ms = T.mestre('p_s10');
    const tot0 = T.total('p_s10', ms.id);
    JBNAV.ir('#/almEntrada/nova'); await T.dorme(100);
    const e = await T.entradaAlm({ nota: '5501', itens: [{ itemId: ms.id, qtd: 1000, preco: 6 }, { itemId: 'i_filtro', qtd: 2, preco: 50 }], venc1: hoje() });
    window.__vistas.add(e.id);
    const ls = e.itens; const s10 = ls.find((l) => l.itemId === ms.id), fi = ls.find((l) => l.itemId === 'i_filtro');
    const movC = JB_MOV.montar('combustivel').filter((r) => /Almoxarifado/.test(r.tipo));
    return { dest: s10.destino, prodL: s10.produtoSetorId, q: s10.qtdSetor, fdest: fi.destino || '', s10: saldoP('p_s10'), almS10: ALMOX_V52.estI(ms.id).saldo, filtro: ALMOX_V52.estI('i_filtro').saldo,
      tot: T.total('p_s10', ms.id) - tot0, contas: (e.finTitulos || []).length, umRegistro: T.banco('alm').filter((x) => x.jbt === 'entrada').length, movC: movC.length, cm: custoMedioNota('p_s10') }; });
  ok(c3.dest === 'combustivel' && c3.prodL === 'p_s10' && c3.q === 1000, 'a linha do diesel grava destino Combustível e 1.000 L');
  ok(c3.s10 === 1500 && c3.almS10 === 0, `estoque do Combustível 500 → ${c3.s10}; no Almoxarifado ${c3.almS10}`);
  ok(c3.tot === 1000, 'estoque total aumentou 1.000 L uma vez só');
  ok(c3.fdest === '' && c3.filtro === 2, 'o filtro ficou no Almoxarifado (2 un)');
  ok(c3.umRegistro === 1 && c3.contas === 1, 'um registro de entrada e uma conta a pagar');
  ok(c3.movC === 1, 'a entrada aparece nas Movimentações do Combustível como “Entrada pelo Almoxarifado”');
  ok(c3.cm === 6, `custo médio do diesel usa o preço da entrada do almoxarifado (${c3.cm})`);

  console.log('4. A mesma nota lançada como compra no Combustível é barrada');
  const c4 = await page.evaluate(async () => { const n0 = DATA.compras.length; await T.compra('p_s10', 1000, '5501'); const tit = await T.escolha('');
    await T.dorme(300); return { tit, n: DATA.compras.length - n0, s10: saldoP('p_s10') }; });
  ok(/já foi lançada no Almoxarifado/.test(c4.tit) && c4.n === 0 && c4.s10 === 1500, 'nota repetida: aviso e nada gravado (' + c4.tit + ')');

  console.log('5. Mesma quantidade sem nota: pergunta compra nova ou o mesmo material');
  const c5 = await page.evaluate(async () => { const n0 = DATA.compras.length;
    await T.compra('p_s10', 1000, ''); if (!document.querySelector('.ei-modal')) return { dbg: (document.querySelector('.toast,#toasts,.toasts') || {}).textContent || document.body.innerText.slice(0, 300), er: conferirOpV(OP.compra, RASC_V.compra).erros };
    const t1 = await T.escolha('mesmo'); const nA = DATA.compras.length - n0;
    await T.compra('p_s10', 1000, ''); if (!document.querySelector('.ei-modal')) return { dbg2: [...document.querySelectorAll('.veu .modal')].map((m) => m.textContent).join('|') + ' || ' + (document.querySelector('#vdResumo') || {}).textContent, er: conferirOpV(OP.compra, RASC_V.compra).erros, vd: !!document.querySelector('#vdOk'), dis: document.querySelector('#vdOk') && document.querySelector('#vdOk').disabled };
    await T.escolha('nova'); const nB = DATA.compras.length - n0;
    await T.compra('p_s10', 1000, '7777'); await T.escolha('nova'); await T.ultimoOk(); await T.esperar(() => DATA.compras.length > n0, 8000); await T.sinc();
    return { t1, nA, nB, nC: DATA.compras.length - n0, s10: saldoP('p_s10') }; });
  if (c5.dbg !== undefined || c5.dbg2 !== undefined) console.log('DEBUG', JSON.stringify(c5));
  ok(/Compra nova ou o mesmo material/.test(c5.t1) && c5.nA === 0, '“é o mesmo material”: nada é lançado (já está no estoque)');
  ok(c5.nB === 0, '“compra nova” sem número da nota não grava');
  ok(c5.nC === 1 && c5.s10 === 2500, `compra nova com outra nota grava uma vez (saldo ${c5.s10})`);

  console.log('6. Ligar o balde ao óleo (fator 20) e transferir parte');
  const c6 = await page.evaluate(async () => { window.__vistas = new Set(DATA.almEntradas.map((e) => e.id));
    await T.entradaAlm({ nota: '6601', itens: [{ itemId: 'i_balde', qtd: 3, preco: 300, destino: 'almox' }], venc1: hoje() });
    const b0 = ALMOX_V52.estI('i_balde').saldo, o0 = saldoP('p_oleo');
    JB_ESTOQUE.abrirLigar('i_balde'); const eL = await T.janela({ '#eiP': 'p_oleo', '#eiF': '20' }); if (eL) return { dbgL: eL, it: ALMOX_V52.ITEM('i_balde') }; await T.esperar(() => ALMOX_V52.ITEM('i_balde').produtoSetorId === 'p_oleo'); await T.sinc();
    const b1 = ALMOX_V52.estI('i_balde').saldo; const tot0 = T.total('p_oleo', 'i_balde');
    JB_ESTOQUE.abrirTransferir('i_balde'); const erro = await T.janela({ '#eiQ': '5' }); T.fecharJanelas();
    JB_ESTOQUE.abrirTransferir('i_balde'); await T.janela({ '#eiQ': '2', '#eiM': 'para a troca de óleo' }); await T.esperar(() => ALMOX_V52.estI('i_balde').saldo === 1); await T.sinc();
    const tr = T.banco('alm').filter((x) => x.jbt === 'transf');
    return { b0, b1, o0, erro, b2: ALMOX_V52.estI('i_balde').saldo, o2: saldoP('p_oleo'), tot0, tot2: T.total('p_oleo', 'i_balde'), nTr: tr.length, tr: tr[0], cons: DATA.consumos.length,
      movA: ALMOX_V52.movsAlm().filter((m) => m.tipo === 'Transferência').length }; });
  if (c6.dbgL) console.log('DEBUG', JSON.stringify(c6));
  ok(c6.b0 === 3 && c6.b1 === 3, 'o que já estava no Almoxarifado continua lá depois de ligar (3 baldes)');
  ok(/só 3/.test(c6.erro), 'transferir mais que o saldo é recusado: ' + c6.erro);
  ok(c6.b2 === 1 && c6.o2 === c6.o0 + 40, `2 baldes saíram do Almoxarifado e entraram 40 L no Combustível (${c6.o0} → ${c6.o2})`);
  ok(c6.tot0 === c6.tot2, `transferência não muda o estoque total (${c6.tot0} = ${c6.tot2})`);
  ok(c6.nTr === 1 && c6.tr.qtd === 2 && c6.tr.qtdSetor === 40 && !('finTitulos' in c6.tr), 'um registro de transferência, com origem e destino, sem conta a pagar');
  ok(c6.cons === 0 && c6.movA === 1, 'receber pela transferência não é consumo; aparece nas Movimentações do almoxarifado');

  console.log('7. USAR: só baixa ao confirmar');
  const c7 = await page.evaluate(async () => { const g0 = saldoP('p_graxa');
    JB_ESTOQUE.abrirUsar('p_graxa'); const e1 = await T.janela({ '#eiQ': '50', '#eiF': 'lubrificação' }); T.fecharJanelas();
    JB_ESTOQUE.abrirUsar('p_graxa'); const e2 = await T.janela({ '#eiQ': '2' }); T.fecharJanelas();
    JB_ESTOQUE.abrirUsar('p_graxa'); await T.janela({ '#eiQ': '2', '#eiL': 'l_carreg', '#eiF': 'lubrificação da carregadeira' }); await T.esperar(() => saldoP('p_graxa') === g0 - 2); await T.sinc();
    const u = T.banco('consumos').filter((c) => c.acao === 'usar');
    return { g0, e1, e2, g1: saldoP('p_graxa'), n: u.length, u: u[0], mov: JB_MOV.montar('combustivel').filter((r) => r.tipo === 'Uso (USAR)').length }; });
  ok(/insuficiente/.test(c7.e1) && /finalidade/.test(c7.e2), 'USAR acima do saldo e sem finalidade é recusado');
  ok(c7.g1 === c7.g0 - 2 && c7.n === 1, `uso de 2 kg baixou o saldo (${c7.g0} → ${c7.g1}) com um registro`);
  ok(c7.u.localId === 'l_carreg' && c7.u.finalidade && c7.u.criadoPor === 'u_DONO' && c7.mov === 1, 'o uso guarda máquina, finalidade e usuário e aparece nas Movimentações');

  console.log('8. Requisição do Departamento Pessoal (5 L de óleo) não é consumo do Combustível');
  const c8 = await page.evaluate(async () => { const o0 = saldoP('p_oleo'), u0 = DATA.consumos.length;
    JB_ESTOQUE.abrirRequisicao('p_oleo'); await T.janela({ '#eiS': 'Departamento Pessoal', '#eiQ': '5', '#eiP': 'Pessoa Fictícia', '#eiF': 'gerador' }); await T.esperar(() => saldoP('p_oleo') === o0 - 5); await T.sinc();
    const r = T.banco('estoqueMov').filter((m) => m.requisicao); return { o0, o1: saldoP('p_oleo'), n: r.length, r: r[0], cons: DATA.consumos.length - u0 }; });
  ok(c8.o1 === c8.o0 - 5 && c8.n === 1 && c8.r.setorSolicitante === 'Departamento Pessoal' && c8.r.tipo === 'Saída', 'saída para o DP registrada com o setor e quem retirou');
  ok(c8.cons === 0, 'a requisição não virou consumo do Combustível');

  console.log('9. Devolver ao Almoxarifado (fator 20: 20 L = 1 balde)');
  const c9 = await page.evaluate(async () => { const b0 = ALMOX_V52.estI('i_balde').saldo, o0 = saldoP('p_oleo'), t0 = T.total('p_oleo', 'i_balde');
    JB_ESTOQUE.abrirDevolver('p_oleo'); await T.janela({ '#eiQ': '20', '#eiI': 'i_balde', '#eiM': 'sobrou' }); await T.esperar(() => ALMOX_V52.estI('i_balde').saldo === b0 + 1); await T.sinc();
    return { b0, b1: ALMOX_V52.estI('i_balde').saldo, o0, o1: saldoP('p_oleo'), t0, t1: T.total('p_oleo', 'i_balde') }; });
  ok(c9.b1 === c9.b0 + 1 && c9.o1 === c9.o0 - 20 && c9.t0 === c9.t1, `devolução: +1 balde no Almoxarifado, −20 L no Combustível, total igual (${c9.t0})`);

  console.log('10. Concorrência: outra pessoa mexe no produto com a janela aberta');
  const c10 = await page.evaluate(async () => { const g0 = saldoP('p_graxa'); const u0 = T.banco('consumos').filter((c) => c.acao === 'usar').length;
    const v0 = await JB_ESTOQUE.lerVersoes(['p:p_graxa']);
    JB_ESTOQUE.abrirUsar('p_graxa'); await T.esperar(() => document.querySelector('.ei-modal')); await T.dorme(300);
    /* outro aparelho lança um consumo da mesma graxa direto no banco */
    const b = window.__srv.estado.docs.get('consumos/' + hoje().slice(0, 7) + '-s0'); const itens = { ...((b && b.dados.items) || {}) };
    itens.outro = { id: 'outro', setor: 'combustivel', produtoId: 'p_graxa', quantidade: 7, unidade: 'kg', origem: 'Estoque da fábrica', data: hoje(), hora: '10:00', criadoEm: new Date().toISOString(), criadoPor: 'u_OUTRO' };
    window.__srv.estado.gravarDireto('consumos', hoje().slice(0, 7) + '-s0', { chave: hoje().slice(0, 7) + '-s0', items: itens });
    const v1 = await JB_ESTOQUE.lerVersoes(['p:p_graxa']);
    let toast = ''; const t0 = window.toast; window.toast = (m, t) => { toast = m; return t0(m, t); };
    await T.janela({ '#eiQ': '6', '#eiF': 'teste de concorrência' }); window.toast = t0;
    await T.dorme(500); const u1 = T.banco('consumos').filter((c) => c.acao === 'usar').length;
    const r1 = await JB_ESTOQUE.reservar(v1); const r2 = await JB_ESTOQUE.reservar(v1);
    return { v0: v0['p:p_graxa'], v1: v1['p:p_graxa'], toast, gravou: u1 - u0, r1: r1.ok, r2: r2.ok }; });
  ok(c10.v1 > c10.v0, `a gravação do outro aparelho mudou a versão do produto (${c10.v0} → ${c10.v1})`);
  ok(/Outra pessoa mexeu/.test(c10.toast) && c10.gravou === 0, 'a janela aberta antes foi recusada e nada foi gravado');
  ok(c10.r1 === true && c10.r2 === false, 'duas reservas com a mesma versão: só a primeira passa');

  console.log('11. Queda de conexão no meio da transferência não duplica');
  const c11 = await page.evaluate(async () => { const n0 = T.banco('alm').filter((x) => x.jbt === 'transf').length; const b0 = ALMOX_V52.estI('i_balde').saldo;
    window.__srv.estado.falhas.depois = 1;
    JB_ESTOQUE.abrirTransferir('i_balde'); await T.janela({ '#eiQ': '1' }); await T.esperar(() => APP.central.estado().pendentes === 0, 15000); await T.sinc(); await T.dorme(800);
    return { n: T.banco('alm').filter((x) => x.jbt === 'transf').length - n0, b: ALMOX_V52.estI('i_balde').saldo, b0 }; });
  ok(c11.n === 1 && c11.b === c11.b0 - 1, `resposta perdida e reenvio: uma transferência só (${c11.n})`);

  console.log('12. Soma dos setores = estoque total; telas');
  const c12 = await page.evaluate(async () => { const L = JB_ESTOQUE.linhasSaldo(); const conf = L.every((x) => Math.abs(x.tot - (x.its.reduce((a, i) => a + ALMOX_V52.estI(i.id).saldo * (+i.fatorSetor || 1), 0) + x.comb)) < 1e-6) && L.filter((x) => x.p && x.p.id === 'p_oleo').length === 1;
    JBNAV.ir('#/estoqueCentral'); await T.esperar(() => document.querySelector('#eiT0'), 10000).catch(() => {}); if (!document.querySelector('#eiT0')) return { dbg: location.hash + ' | ' + document.querySelector('#conteudo').innerText.slice(0, 400) }; const txt = document.body.textContent;
    const sel = document.querySelector('#eiT0'); sel.value = 'trf'; sel.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(200);
    const linhasTrf = document.querySelectorAll('tr[data-eim]').length;
    const orig = [...document.querySelectorAll('tr[data-eim]')].map((tr) => tr.children[4].textContent + '>' + tr.children[5].textContent);
    SV = 'combustivel'; location.hash = '#/estoque'; await T.esperar(() => document.querySelector('[data-je="usar"]')); const usarBt = document.querySelectorAll('[data-je="usar"]').length;
    JBNAV.ir('#/almMov'); await T.dorme(800);
    return { conf, tem: /Saldo por setor/.test(txt) && /CMB-0/.test(txt), linhasTrf, orig, usarBt, conferir: JB_ESTOQUE.paraConferir().map((i) => i.id) }; });
  if (c12.dbg) console.log('DEBUG', c12.dbg);
  ok(c12.conf, 'cada produto: total = Almoxarifado × fator + Combustível (óleo numa linha só, com o balde)');
  ok(c12.tem, 'tela Estoque integrado com saldo por setor e códigos mestres');
  ok(c12.linhasTrf === 3 && c12.orig.includes('Almoxarifado>Combustível') && c12.orig.includes('Combustível>Almoxarifado'), 'filtro de transferências mostra origem e destino: ' + c12.orig.join(' | '));
  ok(c12.usarBt >= 3, 'botão USAR em cada produto do estoque do Combustível');
  ok(c12.conferir.length === 0, 'nenhum item pendente na conferência de cadastro');

  console.log('13. Cadastro automático nos dois lados (V168)');
  const c13 = await page.evaluate(async () => {
    const np = { ...MODS.produtos.padrao(), id: 'p_novo', nome: 'Arla 32 Teste', setor: 'combustivel', unidade: 'L', tipoItem: 'Aditivo', controlaEstoque: 'Sim', situacao: 'Ativo' };
    await gravarRegistro('produtos', np, null, true); await T.esperar(() => T.mestre('p_novo'), 8000); await T.sinc(); await T.dorme(800);
    const m = T.mestre('p_novo'); const nMestres = DATA.almItens.filter((i) => i.produtoSetorId === 'p_novo').length;
    const ni = { ...MODS.almItens.padrao(), id: 'i_hid', nome: 'Óleo hidráulico 68 granel teste', categoria: 'Combustíveis e lubrificantes', unidade: 'litro' };
    await gravarRegistro('almItens', ni, null, true); await T.esperar(() => (ALMOX_V52.ITEM('i_hid') || {}).produtoSetorId, 8000); await T.sinc(); await T.dorme(800);
    const ph = PROD(ALMOX_V52.ITEM('i_hid').produtoSetorId);
    const nb = { ...MODS.almItens.padrao(), id: 'i_balde2', nome: 'Balde óleo 15W40 teste', categoria: 'Peças e manutenção', unidade: 'unidade' };
    await gravarRegistro('almItens', nb, null, true); await T.dorme(1500);
    const pAntes = DATA.produtos.length; const ed = { ...PROD('p_novo'), obs: 'editado' }; await gravar('produtos', ed, PROD('p_novo')); await T.dorme(1200);
    return { cod: m && m.codigo, cat: m && m.categoria, nMestres, saldo: saldoP('p_novo'), ph: ph && [ph.setor, ph.unidade, ph.almItemId], nProdHid: DATA.produtos.filter((p) => p.almItemId === 'i_hid').length,
      balde: !!(ALMOX_V52.ITEM('i_balde2') || {}).produtoSetorId, conf: JB_ESTOQUE.paraConferir().map((i) => i.id), depoisEd: DATA.produtos.length - pAntes, mestresDepoisEd: DATA.almItens.filter((i) => i.produtoSetorId === 'p_novo').length }; });
  ok(/^CMB-\d{3}$/.test(c13.cod) && c13.cat === 'Combustíveis e lubrificantes' && c13.nMestres === 1 && c13.saldo === 0, `produto novo no Combustível ganhou o código mestre ${c13.cod} no Almoxarifado, sem saldo`);
  ok(c13.ph && c13.ph.join() === 'combustivel,L,i_hid' && c13.nProdHid === 1, 'item novo do Almoxarifado (categoria Combustíveis, em litro) apareceu no Setor de Combustível, ligado');
  ok(!c13.balde && c13.conf.includes('i_balde2'), 'balde (outra unidade) não é ligado sozinho: vai para a Conferência de cadastro');
  ok(c13.depoisEd === 0 && c13.mestresDepoisEd === 1, 'editar um produto não cria nada de novo');

  console.log('14. Entrada de produtos pendente de foto e valor, com observação, e duplicidade (V168)');
  const c14 = await page.evaluate(async () => {
    const s0 = saldoP('p_s10'), g0 = saldoP('p_graxa'); const n0 = DATA.estoqueMov.filter((m) => m.integrado).length;
    JB_ESTOQUE.abrirEntradaLote(); await T.esperar(() => document.querySelector('.ei-modal [data-lk="1"]'));
    const lin = (k, p, q, v, o) => { const r = document.querySelector('.ei-modal [data-lk="' + k + '"]'); r.querySelector('[data-lp]').value = p; r.querySelector('[data-lq]').value = q; r.querySelector('[data-lv]').value = v; r.querySelector('[data-lo]').value = o; };
    lin(0, 'p_s10', '300', '', 'tambor azul do galpão'); lin(1, 'p_graxa', '4', '25,50', 'graxa de chassi, marca X');
    document.querySelector('.ei-modal [data-r="1"]').click(); await T.esperar(() => DATA.estoqueMov.filter((m) => m.integrado).length === n0 + 2, 8000); await T.sinc();
    const E = JB_ESTOQUE.entradasIntegradas(); const es = E.find((m) => m.produtoId === 'p_s10'), eg = E.find((m) => m.produtoId === 'p_graxa');
    const pend0 = [JB_ESTOQUE.pendenteE(es), JB_ESTOQUE.pendenteE(eg)];
    JBNAV.ir('#/estoqueCentral'); await T.esperar(() => document.querySelector('[data-je="comp"]')); const naCentral = document.querySelectorAll('[data-je="comp"]').length;
    const lemb = (window.LEMBRETES_V61() || []).filter((l) => /^ei-pend-/.test(l.key)).length;
    /* duplicidade: lançar de novo o mesmo diesel 300 L */
    let msgDup = ''; const c0 = window.confirmar; window.confirmar = async (t, x) => { msgDup = t + ': ' + x; return false; };
    JB_ESTOQUE.abrirEntradaLote(); await T.esperar(() => document.querySelector('.ei-modal [data-lk="0"]')); lin(0, 'p_s10', '300', '', '');
    document.querySelector('.ei-modal [data-r="1"]').click(); await T.dorme(800); window.confirmar = c0; T.fecharJanelas();
    const n1 = DATA.estoqueMov.filter((m) => m.integrado).length;
    /* completar no Almoxarifado (Estoque integrado): valor e observação; a mesma entrada muda nos dois */
    JB_ESTOQUE.abrirCompletar(es.id); await T.esperar(() => document.querySelector('.ei-modal #eiV'));
    document.querySelector('.ei-modal #eiV').value = '6,10'; document.querySelector('.ei-modal #eiO').value = 'tambor azul, conferido';
    document.querySelector('.ei-modal [data-r="1"]').click(); await T.esperar(() => +((DATA.estoqueMov.find((m) => m.id === es.id) || {}).valorUnit) === 6.1, 8000); await T.sinc();
    const es2 = DATA.estoqueMov.find((m) => m.id === es.id); const b = T.banco('estoqueMov').find((m) => m.id === es.id);
    SV = 'combustivel'; location.hash = '#/estoque'; await T.esperar(() => document.querySelector('[data-eient]')); const noComb = /6,10/.test(document.querySelector('[data-eient]').textContent);
    return { s: saldoP('p_s10') - s0, g: saldoP('p_graxa') - g0, obs: [es.obs, eg.obs], vg: eg.valorUnit, pend0, naCentral, lemb, msgDup, dupGravou: n1 - (n0 + 2), vu: es2.valorUnit, obs2: es2.obs, qtd: es2.quantidade, banco: b && b.valorUnit, mesmo: DATA.estoqueMov.filter((m) => m.integrado && m.produtoId === 'p_s10').length, noComb, pend1: JB_ESTOQUE.pendenteE(es2), cm: custoMedioNota('p_graxa') };
  });
  ok(c14.s === 300 && c14.g === 4, 'a entrada soma no estoque na hora (300 L de diesel e 4 kg de graxa)');
  ok(c14.obs[0] === 'tambor azul do galpão' && c14.vg === 25.5, 'observação e valor (quando informado) ficam no lançamento');
  ok(c14.pend0.join() === 'true,true' && c14.naCentral >= 2 && c14.lemb === 2, 'sem foto ou sem valor: pendente no Estoque integrado (Almoxarifado) e nas Pendências');
  ok(/duplicidade/.test(c14.msgDup) && c14.dupGravou === 0, 'o mesmo produto e quantidade lançado de novo: aviso de duplicidade e nada gravado');
  ok(c14.vu === 6.1 && c14.obs2 === 'tambor azul, conferido' && c14.qtd === 300 && c14.banco === 6.1 && c14.mesmo === 1, 'completar o valor e a observação muda o mesmo lançamento (sem cópia)');
  ok(c14.noComb, 'o valor completado aparece também no Estoque do Combustível');
  ok(c14.pend1 === true, 'ainda sem foto: continua pendente só da foto');
  ok(Math.abs(c14.cm - 25.5) < 1e-6, `o valor da entrada entra no custo médio (graxa ${c14.cm})`);

  console.log('15. Na tela Estoque do Combustível: pendente no cartão, tocar abre para editar (quantidade, valor, observação)');
  const c15 = await page.evaluate(async () => {
    SV = 'combustivel'; location.hash = '#/estoque'; await T.esperar(() => document.querySelector('tr[data-pf="p_graxa"] [data-je="comp"]'));
    const etiqueta = document.querySelector('tr[data-pf="p_graxa"] [data-je="comp"]').textContent; const g0 = saldoP('p_graxa');
    const tr = document.querySelector('tr[data-pf="p_graxa"]'); (tr.querySelector('td') || tr).click();
    await T.esperar(() => document.querySelector('.ei-modal #eiQ')); const q = document.querySelector('.ei-modal #eiQ'); q.value = '5';
    document.querySelector('.ei-modal #eiO').value = 'graxa de chassi, 5 baldes de 1 kg'; document.querySelector('.ei-modal [data-r="1"]').click();
    await T.esperar(() => saldoP('p_graxa') === g0 + 1, 8000); await T.sinc();
    const e = JB_ESTOQUE.entradasIntegradas().find((m) => m.produtoId === 'p_graxa');
    const semPend = !document.querySelector('tr[data-pf="p_diesel_inexistente"]'); const sP = !!document.querySelector('tr[data-pf="p_oleo"] [data-je="comp"]');
    return { etiqueta, d: saldoP('p_graxa') - g0, q: e.quantidade, obs: e.obs, vt: e.valorEntrada, hist: (DATA.log || []).some((l) => l.recId === e.id && /completou/.test(l.acao)), sP };
  });
  ok(/Pendente: foto/.test(c15.etiqueta), 'o cartão da graxa mostra a etiqueta “' + c15.etiqueta + '”');
  ok(c15.d === 1 && c15.q === 5 && c15.obs === 'graxa de chassi, 5 baldes de 1 kg' && c15.vt === 127.5, 'tocar no cartão abriu o lançamento: quantidade 4 → 5 (saldo +1), observação e valor total atualizados');
  ok(c15.hist, 'a mudança ficou no histórico');
  ok(c15.sP === false, 'produto sem entrada pendente não mostra a etiqueta');

  ok(erros.length === 0, 'nenhum erro de JavaScript na página' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) { console.error(e); falhas++; }
finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
