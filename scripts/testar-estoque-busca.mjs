#!/usr/bin/env node
// Teste de ponta a ponta da V176 (25/11/2026), no navegador, com o programa REAL (saida/claude.html) e o banco
// central SIMULADO (scripts/lib/servidor-falso.mjs): busca do Almoxarifado, ligação com o Combustível e valor
// por embalagem no Combustível ("12 galões de 20 L · R$ 575,00 o galão · valor total R$ 6.900,00").
// Só dados fictícios, em memória: nada vai para o banco real da Cerâmica Concretiza.
// Uso: node scripts/construir.mjs && node scripts/testar-estoque-busca.mjs
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
const CAT = 'Combustíveis e lubrificantes';
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_oleo', { id: 'p_oleo', setor: 'combustivel', nome: 'Óleo 15W40 Teste', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Óleo lubrificante' }],
  ['produtos', 'p_graxa', { id: 'p_graxa', setor: 'combustivel', nome: 'Graxa Teste', unidade: 'kg', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Graxa' }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10 Teste', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['estoqueMov', mes + '-s0', { chave: mes + '-s0', items: {
    m1: { id: 'm1', setor: 'combustivel', tipo: 'Entrada', data: hoje, hora: '05:00', produtoId: 'p_s10', quantidade: 500, delta: 500, motivo: 'Estoque inicial de teste', criadoEm: '2026-11-01T09:00:00.000Z', criadoPor: 'u_DONO' },
    m2: { id: 'm2', setor: 'combustivel', tipo: 'Entrada', integrado: true, data: hoje, hora: '05:01', produtoId: 'p_graxa', quantidade: 55.2, delta: 55.2, unidade: 'kg', valorUnit: 33.33, valorEntrada: 1839.82, embalagem: '3 baldes de 18,4 kg', motivo: 'Entrada de produtos (estoque integrado)', criadoEm: '2026-11-01T09:00:00.000Z', criadoPor: 'u_DONO' } } }],
];
const hashTxt = (t) => { let h = 0; for (const c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const I = (id, codigo, nome, categoria, unidade, extra) => ({ id, jbt: 'item', codigo, nome, categoria, unidade, ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z', ...(extra || {}) });
const almRecs = {
  fa1: { id: 'fa1', jbt: 'fornecedor', nome: 'POSTO FICTICIO EMPREENDIMENTOS', doc: CNPJ, ativo: true, data: hoje, criadoEm: '2026-11-01T09:00:00.000Z' },
  i_oleo: I('i_oleo', 'CMB-901', 'Óleo de motor 15W40 teste', CAT, 'litro', { produtoSetorId: 'p_oleo', fatorSetor: 1 }),
  i_graxa: I('i_graxa', 'CMB-902', 'Graxa teste', CAT, 'kg', { produtoSetorId: 'p_graxa', fatorSetor: 1 }),
  i_fluido: I('i_fluido', 'CMB-903', 'Fluido de freio DOT 3 500 ml teste', CAT, 'litro'),
  i_luva: I('i_luva', 'EPI-901', 'Luva de vaqueta teste', 'EPI', 'par'),
  i_prego: I('i_prego', 'GER-901', 'Prego 15 x 18 teste', 'Produtos em geral', 'kg'),
  i_paraf: I('i_paraf', 'PEC-903', 'Parafuso sextavado 1/2 teste', 'Peças e manutenção', 'unidade'),
  i_fur: I('i_fur', 'FER-901', 'Furadeira 550 W 1/2 teste', 'Ferramentas', 'unidade'),
  i_lamp: I('i_lamp', 'ELE-901', 'LAMPADA LED 40W teste', 'Elétrico', 'unidade'),
  i_ades: I('i_ades', 'PEC-904', 'Adesivo para juntas de motor diesel teste', 'Peças e manutenção', 'unidade'),
  i_arroz: I('i_arroz', 'COZ-901', 'Arroz tipo 1 teste', 'Cozinha', 'kg', { tipoCoz: 'Alimento' }),
  e0: { id: 'e0', jbt: 'entrada', data: '2026-11-03', fornecedorId: 'fa1', nota: '100', itens: [{ itemId: 'i_luva', qtd: 10, preco: 20 }], total: 200, forma: 'vista', criadoEm: '2026-11-03T09:00:00.000Z' },
};
const grupos = {};
Object.values(almRecs).forEach((r) => { const k = mes + '-s' + (hashTxt(r.id) % 6); (grupos[k] = grupos[k] || { chave: k, items: {} }).items[r.id] = r; });
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
const sp = (s) => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && window.JB_ESTOQUE && window.JB_BUSCA, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      sinc: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(350); },
      sp: (s) => String(s == null ? '' : s).replace(/ /g, ' ').replace(/\s+/g, ' ').trim(),
      fecharJanelas: () => document.querySelectorAll('.veu').forEach((v) => v.remove()),
      pre: (o) => { const m = document.querySelector('.ei-modal'); Object.entries(o).forEach(([k, v]) => { const el = m.querySelector('#' + k); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); },
    };
  });

  console.log('1. Busca: palavras em qualquer ordem, singular e plural, medidas escritas de outro jeito');
  const c1 = await page.evaluate(() => { const b = JB_BUSCA.bate;
    return { luva: b('vaqueta luva', 'Luva de vaqueta'), plural: b('luvas', 'Luva de vaqueta'), prego: b('15x18', 'Prego 15 x 18'), prego2: b('prego 15 x 18', 'Prego 15x18'),
      oleo: b('oleo 15w40', 'Óleo de motor 15W-40'), paraf: b('parafusos 1/2', 'Parafuso sextavado 1/2'), nao: b('luva raspa', 'Luva de vaqueta'), vazio: b('', 'qualquer coisa') }; });
  ok(c1.luva && c1.plural && c1.prego && c1.prego2 && c1.oleo && c1.paraf && c1.vazio, 'acha: ' + JSON.stringify(c1));
  ok(!c1.nao, 'não acha o que não é (luva de raspa ≠ luva de vaqueta)');

  console.log('2. Estoque / Produtos: busca e aviso de produto que está em outra tela');
  await page.evaluate(() => { JBNAV.ir('#/almProdutos'); });
  await page.waitForSelector('#prQ', { timeout: 15000 });
  const nomesLista = () => page.evaluate(() => [...document.querySelectorAll('#prL .apr-card .apr-tx b')].map((b) => b.textContent).join(' | '));
  await page.fill('#prQ', '15x18'); await page.waitForTimeout(350);
  const t15 = await nomesLista();
  ok(/Prego 15 x 18 teste/.test(t15) && !/Luva/.test(t15), '“15x18” acha o “Prego 15 x 18”');
  await page.fill('#prQ', 'vaqueta luvas'); await page.waitForTimeout(350);
  ok(/Luva de vaqueta teste/.test(await nomesLista()), '“vaqueta luvas” acha a “Luva de vaqueta”');
  await page.fill('#prQ', 'arroz'); await page.waitForTimeout(350);
  const outro = await page.evaluate(() => { const b = document.querySelector('[data-outro]'); return b ? { k: b.dataset.outro, txt: T.sp(b.closest('p').innerText) } : null; });
  ok(outro && outro.k === 'coz' && /Arroz tipo 1 teste/.test(outro.txt), 'arroz não é daqui: mostra que está na Cozinha, com botão: ' + (outro && outro.txt));
  await page.click('[data-outro]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => location.hash) === '#/almCozinha', 'o botão abre a Cozinha já com a busca');
  await page.evaluate(() => { const X = JBNAV; X.ir('#/almProdutos'); }); await page.waitForSelector('#prQ'); await page.fill('#prQ', 'oleo 15w40'); await page.waitForTimeout(350);
  const cardOleo = await page.evaluate(() => { const x = document.querySelector('.apr-sd-cmb'); return x ? T.sp(x.innerText) : ''; });
  ok(/no Combustível/.test(cardOleo), 'o produto ligado mostra o que tem no Combustível: ' + cardOleo);
  await page.fill('#prQ', ''); await page.waitForTimeout(200);

  console.log('3. Classificação: lâmpada de 40W, furadeira de 550 W e cola de junta de motor diesel ficam no Almoxarifado');
  const c3 = await page.evaluate(() => { const C = (id) => JB_ESTOQUE.classificar(ALMOX_V52.ITEM(id)).setor;
    return { fur: C('i_fur'), lamp: C('i_lamp'), ades: C('i_ades'), fluido: C('i_fluido'), oleo: C('i_oleo'), nome: JB_ESTOQUE.classificar({ id: 'x', nome: 'Balde óleo 15W40 teste', categoria: 'Peças e manutenção' }).setor }; });
  ok(c3.fur === 'almox' && c3.lamp === 'almox' && c3.ades === 'almox', 'ferramenta, elétrico e adesivo: Almoxarifado');
  ok(c3.fluido === 'combustivel' && c3.oleo === 'combustivel' && c3.nome === 'combustivel', 'fluido de freio, óleo ligado e “balde óleo 15W40”: Combustível');

  console.log('4. Combustível: lançar por embalagem com o valor de cada uma');
  const c4 = await page.evaluate(async () => {
    JB_ESTOQUE.abrirEntradaProduto('p_oleo'); await T.esperar(() => document.querySelector('.ei-modal #eiEV'));
    T.pre({ eiEN: '12', eiET: 'galão', eiEC: '20', eiEV: '575,00' });
    const m = document.querySelector('.ei-modal'); const q = m.querySelector('#eiQ').value, v = m.querySelector('#eiV').value, emb = m.querySelector('#eiE').value, conta = T.sp(m.querySelector('[data-embr]').textContent);
    m.querySelector('[data-r="1"]').click(); await T.esperar(() => saldoP('p_oleo') === 240, 8000); await T.sinc();
    const e = JB_ESTOQUE.entradasIntegradas().find((x) => x.produtoId === 'p_oleo');
    return { q, v, emb, conta, rec: e && [e.quantidade, e.valorUnit, e.valorEntrada, e.embalagem], txt: T.sp(JB_ESTOQUE.txtValorProd('p_oleo')), preco: T.sp(JB_ESTOQUE.txtPrecoProd('p_oleo')), graxa: T.sp(JB_ESTOQUE.txtValorProd('p_graxa')) };
  });
  ok(c4.q === '240' && c4.v === '28,75' && c4.emb === '12 galões de 20 L', `12 galões × 20 L = ${c4.q} L; R$ 575,00 o galão = R$ ${c4.v} o litro (${c4.emb})`);
  ok(/valor total R\$ 6\.900,00/.test(c4.conta), 'a conta aparece na janela: ' + c4.conta);
  ok(c4.rec && c4.rec.join() === '240,28.75,6900,12 galões de 20 L', 'gravado em litros, com o valor do litro e a embalagem: ' + (c4.rec && c4.rec.join(' / ')));
  ok(c4.txt === '240 L = 12 galões de 20 L · R$ 575,00 o galão (R$ 28,75 o litro) · valor total R$ 6.900,00', 'o que tem: ' + c4.txt);
  ok(c4.preco === 'R$ 575,00 o galão (R$ 28,75 o litro)', 'preço: ' + c4.preco);
  ok(c4.graxa === '55,2 kg = 3 baldes de 18,4 kg · R$ 613,27 o balde (R$ 33,33 o kg) · valor total R$ 1.839,82', 'graxa em kg: ' + c4.graxa);

  console.log('5. Valor do galão posto como valor do litro: pergunta antes de gravar');
  const c5 = await page.evaluate(async () => {
    JB_ESTOQUE.abrirEntradaProduto('p_oleo'); await T.esperar(() => document.querySelector('.ei-modal #eiEV'));
    const m = document.querySelector('.ei-modal'); const pref = [m.querySelector('#eiET').value, m.querySelector('#eiEC').value];
    T.pre({ eiQ: '20', eiV: '575' }); m.querySelector('[data-r="1"]').click();
    await T.esperar(() => [...document.querySelectorAll('.veu .modal')].some((x) => /Valor fora do normal/.test(x.innerText)), 5000);
    const txt = T.sp([...document.querySelectorAll('.veu .modal')].map((x) => x.innerText).find((t) => /Valor fora do normal/.test(t)));
    const cancelar = [...document.querySelectorAll('.veu .modal button')].filter((b) => /Cancelar/.test(b.textContent)).pop(); cancelar.click(); await T.dorme(400);
    const aberta = !!document.querySelector('.ei-modal'); T.fecharJanelas(); await T.dorme(200);
    return { pref, txt, aberta, saldo: saldoP('p_oleo'), n: JB_ESTOQUE.entradasIntegradas().filter((x) => x.produtoId === 'p_oleo').length };
  });
  ok(c5.pref.join() === 'galão,20', 'a janela já vem com a embalagem de sempre (galão de 20 L)');
  ok(/R\$ 575,00 o litro/.test(c5.txt) && /galão inteiro/.test(c5.txt), 'aviso: ' + c5.txt.slice(0, 220));
  ok(c5.aberta && c5.saldo === 240 && c5.n === 1, 'cancelar não grava nada e volta para a janela');

  console.log('6. Telas do Combustível: embalagens, preço e valor total embaixo do nome; a soma do custo por litro sumiu');
  const c6 = await page.evaluate(async () => {
    JBNAV.ir('#/setor-combustivel'); await T.dorme(900); JBNAV.ir('#/estoque'); await T.esperar(() => [...document.querySelectorAll('h3')].some((h) => /Saldo por item/.test(h.textContent)), 10000); await T.dorme(500);
    const tr = document.querySelector('tr[data-pf="p_oleo"]'); const sub = tr ? T.sp((tr.querySelector('.je-vtot') || {}).textContent) : '';
    const ent = document.querySelector('[data-eient] table'); const cab = ent ? [...ent.tHead.rows[0].cells].map((c) => T.sp(c.textContent)) : [];
    const lin = ent ? [...ent.tBodies[0].rows].map((r) => T.sp(r.innerText)).find((t) => /Óleo 15W40/.test(t)) : '';
    JBNAV.ir('#/produtos'); await T.esperar(() => document.querySelector('#bCsv') && document.querySelector('table.tbl tbody tr'), 10000); await T.dorme(500);
    const t = document.querySelector('table.tbl'); const h = [...t.tHead.rows[0].cells].map((c) => T.sp(c.textContent)); const iC = h.findIndex((x) => /Custo por litro/.test(x));
    const pe = t.tFoot && t.tFoot.rows[0] ? T.sp(t.tFoot.rows[0].cells[iC] && t.tFoot.rows[0].cells[iC].textContent) : '';
    const lo = [...t.tBodies[0].rows].find((r) => /Óleo 15W40 Teste/.test(r.innerText)); const lg = [...t.tBodies[0].rows].find((r) => /Graxa Teste/.test(r.innerText));
    const cols = MODS.produtos.cols; const ex = cols[0].xExp ? cols[0].xExp(PROD('p_oleo')) : null;
    return { sub, cab, lin, pe, sub2: lo ? T.sp((lo.querySelector('.je-vtot') || {}).textContent) : '', custoG: lg ? T.sp(lg.cells[iC].textContent) : '', ex };
  });
  ok(/12 galões de 20 L/.test(c6.sub) && /valor total R\$ 6\.900,00/.test(c6.sub), 'Saldo por item: ' + c6.sub);
  ok(c6.cab.includes('Valor total') && c6.cab.includes('Preço') && !c6.cab.includes('Valor unit.'), 'Entradas de produtos com Preço e Valor total: ' + c6.cab.join(' | '));
  ok(/240 L \(12 galões de 20 L\)/.test(c6.lin) && /R\$ 6\.900,00/.test(c6.lin), 'a entrada mostra as embalagens e o total: ' + c6.lin.slice(0, 160));
  ok(/12 galões de 20 L/.test(c6.sub2), 'lista de Combustíveis: ' + c6.sub2);
  ok(c6.pe === '', 'o rodapé não soma mais o custo por litro (antes dava um total sem sentido): “' + c6.pe + '”');
  ok(/o kg/.test(c6.custoG), 'graxa aparece por kg: ' + c6.custoG);
  ok(c6.ex === 'Óleo 15W40 Teste', 'a exportação da lista leva só o nome, sem a linha de embalagens');

  console.log('7. Lançar entrada de item do Combustível ainda sem ligação: liga e vai para o Combustível');
  const c7 = await page.evaluate(async () => {
    const p0 = DATA.produtos.length; JBNAV.ir('#/almProdutos'); await T.esperar(() => document.querySelector('#prQ'));
    ALMOX_V52.lancar('entrada', 'i_fluido'); await T.esperar(() => document.querySelector('[data-pq="i_fluido"]'));
    const q = document.querySelector('[data-pq="i_fluido"]'); q.value = '16'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const mot = document.querySelector('#lpMot'); mot.value = 'Sobra encontrada'; mot.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll('.veu [data-ok]')].pop().click();
    await T.esperar(() => [...document.querySelectorAll('.veu .modal')].some((x) => /A quantidade é de embalagens/.test(x.innerText)), 6000);
    const per = T.sp([...document.querySelectorAll('.veu .modal')].map((x) => x.innerText).find((t) => /A quantidade é de embalagens/.test(t)));
    document.querySelector('.ei-modal .ei-ops [data-k="emb"]').click();
    await T.esperar(() => { const i = ALMOX_V52.ITEM('i_fluido'); return i.produtoSetorId && saldoP(i.produtoSetorId) === 8; }, 10000); await T.sinc(); await T.dorme(800);
    const it = ALMOX_V52.ITEM('i_fluido'); const p = PROD(it.produtoSetorId);
    return { per, novos: DATA.produtos.length - p0, p: p && [p.setor, p.unidade], s: saldoP(it.produtoSetorId), alm: ALMOX_V52.estI('i_fluido').saldo };
  });
  ok(/500 ml/.test(c7.per) && /= 8 L\b/.test(c7.per) && /contado em litros/.test(c7.per), 'pergunta se são frascos: ' + c7.per.slice(0, 200));
  ok(c7.novos === 1 && c7.p && c7.p.join() === 'combustivel,L', 'criou um produto só no Combustível e ligou o item');
  ok(c7.s === 8 && c7.alm === 0, `16 frascos de 500 ml = ${c7.s} L no Combustível, nada no Almoxarifado (${c7.alm})`);

  console.log('8. Nova entrada do Almoxarifado: escolher o produto digitando; avisos de preço e de conteúdo');
  const c8 = await page.evaluate(async () => {
    T.fecharJanelas(); const d = { ...ALMOX_V52.rascunhoE(null), fornecedorId: 'fa1', forma: 'vista', itens: [{ itemId: '', qtd: '', preco: '' }] }; ALMOX_V52.setRE(d);
    JBNAV.ir('#/almEntrada/nova'); await T.esperar(() => document.querySelector('[data-eesc]')); await T.dorme(300);
    const sel = document.querySelector('select[data-ei="itemId"]'); const escondida = !!(sel && sel.hidden);
    document.querySelector('[data-eesc]').click(); await T.esperar(() => document.querySelector('#escQ'));
    const qi = document.querySelector('#escQ'); qi.value = 'vaqueta'; qi.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(150);
    const achados = [...document.querySelectorAll('#escL [data-esc-id]')].map((b) => b.dataset.escId);
    document.querySelector('#escL [data-esc-id="i_luva"]').click(); await T.dorme(400);
    const escolhido = (document.querySelector('select[data-ei="itemId"]') || {}).value;
    const av = ALMOX_V52.conferirE({ ...d, itens: [{ itemId: 'i_luva', qtd: 10, preco: 45 }, { itemId: 'i_fluido', qtd: 6, preco: 20 }] }).avisos.map(T.sp);
    return { escondida, achados, escolhido, av };
  });
  ok(c8.escondida && c8.achados.join() === 'i_luva' && c8.escolhido === 'i_luva', 'a lista enorme virou busca: digitou “vaqueta”, achou e escolheu a luva');
  ok(c8.av.some((a) => /Luva de vaqueta teste/.test(a) && /acima da última compra \(R\$ 20,00/.test(a)), 'preço muito acima da última compra: avisa');
  ok(c8.av.some((a) => /500 ml/.test(a) && /lance 3 L e o preço de 1 litro/.test(a)), 'nome com 500 ml e quantidade em frascos: avisa (6 frascos = 3 L)');

  console.log('9. Busca do topo: produtos e fornecedores');
  const c9 = await page.evaluate(() => { const g = (q) => pqBuscar(q).map((x) => x.g + ':' + x.itens.map((e) => T.sp(e.t)).join('/'));
    return { luva: g('luva vaqueta'), forn: g('posto ficticio'), graxa: g('graxa'), diesel: g('diesel s10 teste') }; });
  ok(c9.luva.some((x) => /^Produtos:.*Luva de vaqueta teste/.test(x)), 'acha o produto: ' + c9.luva.join(' ; '));
  ok(c9.forn.some((x) => /^Fornecedores:.*POSTO FICTICIO/.test(x)), 'acha o fornecedor: ' + c9.forn.join(' ; '));
  ok(c9.diesel.some((x) => /^Produtos:.*Diesel S10 Teste/.test(x)), 'acha produto só do Combustível: ' + c9.diesel.join(' ; '));

  ok(erros.length === 0, 'nenhum erro de JavaScript na página' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) { console.error(e); falhas++; }
finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
