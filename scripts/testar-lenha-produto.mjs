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

  /* helpers da janela "Saída para fornecedor de lenha" */
  await page.evaluate(() => {
    window.PLT = {
      marcar: async (id, q, p) => { const cb = document.querySelector(`.veu input[data-pk="${id}"]`); if (!cb) throw new Error('item não está na lista: ' + id); cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(120);
        const iq = document.querySelector(`.veu [data-pq="${id}"]`); iq.value = String(q); iq.dispatchEvent(new Event('input', { bubbles: true }));
        if (p != null) { const ip = document.querySelector(`.veu [data-pp="${id}"]`); ip.value = p; ip.dispatchEvent(new Event('input', { bubbles: true })) } await T.dorme(80) },
      ok: async () => { document.querySelector('.veu [data-ok]').click(); await T.dorme(700) },
      fechar: async () => { for (let k = 0; k < 4; k++) { const b = document.querySelector('.veu [data-r]'); if (!b) break; b.click(); await T.dorme(200) } },
    };
  });

  /* 0b. onde aparece: tela da compra, janela de pagamento, início, menu e o Lançar saída do almoxarifado */
  const ach = await page.evaluate(async (cid) => {
    SV = 'lenha'; location.hash = '#/compra/' + cid; await T.dorme(900);
    const btn = !!document.querySelector('#vvProd142');
    document.querySelector('#vvProd142').click(); await T.dorme(400);
    const abreForn = (document.querySelector('.veu #plF') || {}).value === 'f_lenha'; await PLT.fechar();
    const pg = document.querySelector('#vvPag'); if (pg) pg.click(); await T.dorme(400);
    const aviso = !!document.querySelector('#mpProd142');
    const a = document.querySelector('#mpProd142a'); if (a) a.click(); await T.dorme(500);
    const form = !!document.querySelector('.veu #plF'); await PLT.fechar();
    location.hash = '#/setor-lenha'; await T.dorme(900);
    const ini = !!document.querySelector('a[href="#/clProd/novo"]');
    const menu = [...document.querySelectorAll('a[href="#/clProd/novo"]')].some((x) => /Pagar fornecedor com produto/.test(x.textContent));
    location.hash = '#/clProd/novo'; await T.dorme(900); const rota = !!document.querySelector('.veu #plF') && /#\/clComb/.test(location.hash); await PLT.fechar();
    return { btn, abreForn, aviso, form, ini, menu, rota }; }, ini.id);
  ok(ach.btn && ach.abreForn, 'a compra de lenha tem “Pagar com produto”, que abre a saída do almoxarifado com o fornecedor da compra');
  ok(ach.aviso && ach.form, 'a janela “Registrar pagamento” avisa e leva para a saída do almoxarifado');
  ok(ach.ini && ach.menu, 'o início e o menu do Setor da Lenha têm “Pagar fornecedor com produto”');
  ok(ach.rota, 'o atalho #/clProd/novo abre a saída para fornecedor de lenha');

  /* 1. bota do estoque: saída do almoxarifado (requisição) para o fornecedor */
  const p1 = await page.evaluate(async (cid) => {
    const agora = new Date().toISOString();
    await gravar('almItens', { id: 'it_coz', codigo: 'COZ-001', nome: 'Arroz de teste', categoria: 'Cozinha', unidade: 'kg', ativo: true, criadoEm: agora }, null);
    await T.esperar(() => DATA.almItens.some((i) => i.id === 'it_coz'));
    const nS = DATA.almSaidas.length;
    ALM_V148.abrirPagLenha({ fornecedorId: 'f_lenha' }); await T.dorme(300);
    const semCoz = !document.querySelector('.veu input[data-pk="it_coz"]');
    await PLT.marcar('it_bota', 1, null); const sug = (document.querySelector('.veu [data-pp="it_bota"]') || {}).value;
    await PLT.marcar('it_bota', 1, '100,00');
    await PLT.ok(); await T.esperar(() => DATA.almSaidas.length === nS + 1); await T.sincronizado(); await PLT.fechar();
    const sd = DATA.almSaidas.find((x) => x.pagLenha); const c = DATA.compras.find((x) => x.id === cid); const cr = CB_LENHA.credPorId('a:' + sd.id);
    return { semCoz, sug, setor: sd.setor, num: +sd.numero > 0, valor: sd.pagLenha.valor, custo: sd.itens[0].custoTotal, saldo: finVenda(c).saldo, est: ALMOX_V52.estI('it_bota').saldo, desc: cr && cr.desc,
      mov: ALMOX_V52.movsAlm().some((x) => x.itemId === 'it_bota' && x.q === -1 && !/Pagamento de lenha/.test(x.tipo)), banco: T.banco('alm').some((x) => x.id === sd.id && x.pagLenha && x.pagLenha.fornecedorId === 'f_lenha'), caixa: (c.pagamentos || []).length }; }, ini.id);
  ok(p1.semCoz, 'itens da Cozinha não aparecem na lista');
  ok(/80/.test(String(p1.sug)), `o preço vem do custo médio do almoxarifado (${p1.sug})`);
  ok(/Fornecedor de lenha/.test(p1.setor) && p1.num, `virou requisição do almoxarifado (destino “${p1.setor}”)`);
  ok(p1.valor === 100 && p1.custo === 80, `R$ 100 combinados por 1 par de bota (custo no estoque R$ ${p1.custo})`);
  ok(p1.saldo === 500 && p1.desc === 100, `a compra de lenha ficou com R$ ${p1.saldo} a pagar`);
  ok(p1.est === 9 && p1.mov, `a bota saiu do almoxarifado como saída comum (saldo ${p1.est})`);
  ok(p1.banco, 'a saída chegou ao banco central com o fornecedor');
  ok(p1.caixa === 0, 'nada saiu do Caixa');

  /* 2. sem saldo: comprar agora (sai do Caixa), entra e sai do almoxarifado */
  const p2 = await page.evaluate(async (cid) => {
    const agora = new Date().toISOString();
    await gravar('almItens', { id: 'it_luva', codigo: 'EPI-002', nome: 'Luva de teste', categoria: 'EPI', unidade: 'par', ativo: true, criadoEm: agora }, null);
    await gravar('almFornecedores', { id: 'lj1', nome: 'Loja de teste', ativo: true, criadoEm: agora }, null);
    await T.esperar(() => DATA.almItens.some((i) => i.id === 'it_luva') && DATA.almFornecedores.some((x) => x.id === 'lj1'));
    const nE = DATA.almEntradas.length, nS = DATA.almSaidas.length;
    ALM_V148.abrirPagLenha({ fornecedorId: 'f_lenha' }); await T.dorme(300);
    await PLT.marcar('it_luva', 2, '25,00');
    const caixa = !document.querySelector('.veu #plCompra').hidden;
    const sl = document.querySelector('.veu #plLoja'); sl.value = 'lj1';
    const sc = document.querySelector('.veu #plConta'); sc.value = [...sc.options].map((o) => o.value).filter(Boolean)[0] || '';
    await PLT.ok(); await T.esperar(() => DATA.almSaidas.length === nS + 1); await T.sincronizado(); await PLT.fechar();
    const en = DATA.almEntradas.find((x) => x.paraFornLenha === 'f_lenha'); const sd = DATA.almSaidas.filter((x) => x.pagLenha).find((x) => (x.itens || []).some((l) => l.itemId === 'it_luva'));
    await T.esperar(() => (DATA.almEntradas.find((x) => x.id === en.id).finTitulos || []).length > 0, 4000).catch(() => {});
    const en2 = DATA.almEntradas.find((x) => x.id === en.id);
    return { caixa, temConta: !!sc.value, ent: DATA.almEntradas.length === nE + 1 && en && en.forma === 'vista' && en.total === 50, fin: (en2.finTitulos || []).length > 0, sd: !!sd && sd.pagLenha.valor === 50,
      est: ALMOX_V52.estI('it_luva').saldo, saldo: finVenda(DATA.compras.find((x) => x.id === cid)).saldo }; }, ini.id);
  ok(p2.caixa, 'item sem saldo mostra “Comprar agora” (loja, forma e de onde saiu o dinheiro)');
  ok(p2.temConta && p2.ent, 'a compra entrou no almoxarifado, paga à vista (R$ 50)');
  ok(p2.fin, 'a compra ficou ligada ao Financeiro (compromisso pago)');
  ok(p2.sd && p2.est === 0, `e saiu na mesma hora para o fornecedor (saldo da luva ${p2.est})`);
  ok(p2.saldo === 450, `desconto de R$ 50 na lenha (resta ${p2.saldo})`);

  /* 2b. Contas a pagar – Lenha: o que foi pago, discriminado */
  const p2b = await page.evaluate(async () => { const x = CPL_LENHA.conta('f_lenha');
    location.hash = '#/fLenha'; await T.dorme(900); const tela = (document.querySelector('#conteudo') || document.body).textContent;
    return { prod: x.prod, saldo: x.saldo, tela: /Produtos \(bota, EPI…\) R\$\s?150,00/.test(tela) }; });
  ok(p2b.prod === 150 && p2b.saldo === 450, `Contas a pagar – Lenha separa os produtos (R$ ${p2b.prod}) e o saldo (R$ ${p2b.saldo})`);
  ok(p2b.tela, 'a lista do Contas a pagar – Lenha mostra o que foi pago com produto');

  /* 3. não deixa tirar mais do que tem no almoxarifado */
  const p3 = await page.evaluate(async () => { const nS = DATA.almSaidas.length;
    ALM_V148.abrirPagLenha({ fornecedorId: 'f_lenha' }); await T.dorme(300); await PLT.marcar('it_bota', 20, '100,00'); await PLT.ok();
    const aberto = !!document.querySelector('.veu #plF'); await PLT.fechar(); return aberto && DATA.almSaidas.length === nS; });
  ok(p3, 'quantidade maior que o saldo do almoxarifado é recusada');

  /* 3b. cadastrar item novo pela janela */
  const p3b = await page.evaluate(async () => {
    ALM_V148.abrirPagLenha({ fornecedorId: 'f_lenha' }); await T.dorme(300);
    document.querySelector('.veu [data-pln]').click(); await T.dorme(300);
    document.querySelector('#ciNome').value = 'Capacete de teste'; const vs = [...document.querySelectorAll('.veu')]; vs[vs.length - 1].querySelector('[data-ok]').click();
    await T.esperar(() => DATA.almItens.some((i) => i.nome === 'Capacete de teste')); await T.dorme(300);
    const it = DATA.almItens.find((i) => i.nome === 'Capacete de teste'); const lista = !!document.querySelector(`.veu input[data-pk="${it.id}"]`); await PLT.fechar();
    return it.origemCadastro === 'Setor da Lenha' && it.categoria === 'EPI' && lista; });
  ok(p3b, '“Cadastrar item novo” cadastra no Almoxarifado e o item aparece na lista');

  /* 4. telas */
  const tl = await page.evaluate(async () => { const out = {};
    for (const [r, t, sv] of [['#/clComb', 'Bota de teste', 'lenha'], ['#/clAPagar', 'Combustível e produtos', 'lenha'], ['#/almSaidas', 'Fornecedor de lenha', 'almox']]) {
      SV = sv; location.hash = r; await T.dorme(900); out[r] = (document.querySelector('#conteudo') || document.body).textContent.includes(t); }
    return out; });
  Object.entries(tl).forEach(([r, v]) => ok(v, `a tela ${r} mostra a saída para o fornecedor`));

  /* 5. Lançar saída do almoxarifado tem a opção do fornecedor de lenha */
  const p5 = await page.evaluate(async () => { SV = 'almox'; location.hash = '#/almProdutos'; await T.dorme(900);
    ALMOX_V52 && window.ALM_V146; const b = document.querySelector('#prSai'); if (b) b.click(); await T.dorme(400);
    const tem = !!document.querySelector('.veu [data-plabre]'); if (tem) document.querySelector('.veu [data-plabre]').click(); await T.dorme(300);
    const abriu = !!document.querySelector('.veu #plF'); await PLT.fechar(); return { tem, abriu, b: !!b }; });
  ok(p5.b && p5.tem && p5.abriu, 'o “Lançar saída” do almoxarifado tem “Lançar saída para fornecedor de lenha”');

  /* 6. Lançar lenha: o que o fornecedor levou nesta entrega (combustível e EPI), gravado junto com a compra */
  const p6 = await page.evaluate(async () => {
    SV = 'lenha'; RASC_V.compra = null; location.hash = '#/lenhaLancar'; await T.dorme(900);
    const sel = document.querySelector('#lxForn'); sel.value = 'f_lenha'; sel.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(400);
    const q = document.querySelector('#lxQtd'); q.value = '5'; q.dispatchEvent(new Event('input', { bubbles: true }));
    const pr = document.querySelector('#lxPreco'); pr.value = '60,00'; pr.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(150);
    const dep = document.querySelector('[data-dep]'); if (dep) dep.click(); await T.dorme(300);
    document.querySelector('[data-pag="prazo"]').click(); await T.dorme(300);
    const sv = document.querySelector('#lxSemVenc'); if (sv && !sv.checked) { sv.checked = true; sv.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300) }
    const passo = !!document.querySelector('#lxLevou');
    document.querySelector('[data-lvadd="comb"]').click(); await T.dorme(300);
    const op = document.querySelector('.veu #clcO'); op.value = 'fora';
    document.querySelector('.veu #clcL').value = '10'; const cv = document.querySelector('.veu #clcV'); cv.value = '7,00';
    document.querySelector('.veu [data-ok]').click(); await T.dorme(400);
    document.querySelector('[data-lvadd="prod"]').click(); await T.dorme(300);
    const trav = document.querySelector('.veu #plF').disabled;
    await PLT.marcar('it_bota', 1, '90,00'); await PLT.ok(); await T.dorme(300);
    const resumo = (document.querySelector('#lxLevou') || {}).textContent || '';
    const nC = DATA.compras.length, nS = DATA.almSaidas.length, nM = DATA.clComb.length;
    document.querySelector('#lxOk').click(); await T.dorme(500);
    if (document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')) await T.confirmarJanela();
    await T.esperar(() => DATA.compras.length === nC + 1 && DATA.almSaidas.length === nS + 1 && DATA.clComb.length === nM + 1, 8000).catch(() => {}); await T.sincronizado();
    const c = DATA.compras.filter((x) => x.setor === 'lenha').sort((a, b2) => (+b2.numero || 0) - (+a.numero || 0))[0];
    const sd = DATA.almSaidas.filter((x) => x.pagLenha).find((x) => x.pagLenha.compraId === c.id);
    const mc = DATA.clComb.find((x) => /Lançado junto com a compra/.test(x.obs || ''));
    return { passo, trav, resumo: /10 L/.test(resumo) && /Bota de teste/.test(resumo) && /160,00/.test(resumo), compra: c && c.total === 300, sd: !!sd && sd.pagLenha.valor === 90, mc: !!mc && mc.valor === 70, est: ALMOX_V52.estI('it_bota').saldo, cid: c && c.id }; });
  ok(p6.passo && p6.trav, 'o Lançar lenha tem o passo “O que o fornecedor levou” (fornecedor travado na saída)');
  ok(p6.resumo, 'o resumo mostra o combustível e o EPI antes de salvar (R$ 160)');
  ok(p6.compra, 'a compra da lenha foi gravada (R$ 300)');
  ok(p6.sd && p6.est === 8, `o EPI saiu do almoxarifado ligado à compra (saldo da bota ${p6.est})`);
  ok(p6.mc, 'o combustível foi lançado e desconta do fornecedor (R$ 70)');

  /* 7. combustível na bomba: vira abastecimento do Setor de Combustível (baixa o estoque) */
  const p7 = await page.evaluate(async () => {
    const er0 = CB_LENHA.conferirComb({ onde: 'bomba', fornecedorId: 'f_lenha', produtoId: 'p_s10', litros: 12, preco: 7, data: hoje() });
    await gravar('estoqueMov', { id: 'em_s10', data: hoje(), produtoId: 'p_s10', tipo: 'Entrada', delta: 500, quantidade: 500, valorEntrada: 3500, criadoEm: new Date().toISOString() }, null).catch(() => {});
    await T.dorme(300);
    const er = CB_LENHA.conferirComb({ onde: 'bomba', fornecedorId: 'f_lenha', produtoId: 'p_s10', litros: 12, preco: 7, data: hoje() });
    let rec = null, msg = ''; if (!er.length) { try { rec = await CB_LENHA.gravarComb({ onde: 'bomba', fornecedorId: 'f_lenha', produtoId: 'p_s10', litros: 12, preco: 7, data: hoje(), quem: 'Motorista X' }) } catch (e) { msg = e.message } }
    await T.sincronizado();
    const c = rec && DATA.consumos.find((x) => x.id === rec.id);
    return { er0, er, msg, ok: !!c && c.setor === 'combustivel' && c.abastecidoEm === 'Fornecedor de lenha' && c.combLenha && c.combLenha.valor === 84 && c.combLenhaForn === 'f_lenha', sv: SV }; });
  console.log('    (bomba sem estoque: ' + JSON.stringify(p7.er0) + ' · depois: ' + JSON.stringify(p7.er) + ' ' + p7.msg + ')');
  ok(p7.ok, 'combustível na bomba vira abastecimento do Setor de Combustível para o fornecedor (R$ 84)');
  ok(p7.sv === 'lenha', 'a tela continua no Setor da Lenha depois do lançamento');

  /* 8. Nova compra (tela completa): bloco "O fornecedor levou (já pago)" e o resumo com o que fica a pagar */
  const p8 = await page.evaluate(async () => {
    SV = 'lenha'; const R = novoRascunhoV(OP.compra, 'lenha'); Object.assign(R, { parteId: 'f_lenha', itens: [{ produtoId: 'p_lenha', qtd: 10, preco: 60 }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto', lenhaLocal: 'chao' });
    RASC_V.compra = R;
    for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
    const box = document.querySelector('#lx148'); const antesPag = box && box.nextElementSibling && /Pagamento/.test((box.nextElementSibling.querySelector('legend') || {}).textContent || '');
    document.querySelector('#lx148 [data-lvadd="comb"]').click(); await T.dorme(300);
    document.querySelector('.veu #clcO').value = 'fora'; document.querySelector('.veu #clcL').value = '20'; document.querySelector('.veu #clcV').value = '7,00';
    document.querySelector('.veu [data-ok]').click(); await T.dorme(400);
    document.querySelector('#lx148 [data-lvadd="prod"]').click(); await T.dorme(300);
    await PLT.marcar('it_bota', 1, '100,00'); await PLT.ok(); await T.dorme(400);
    const res = (document.querySelector('#vdResumo') || {}).textContent || '';
    const nC = DATA.compras.length, nS = DATA.almSaidas.length, nM = DATA.clComb.length;
    document.querySelector('#vdOk').click(); await T.dorme(500);
    if (document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')) await T.confirmarJanela();
    await T.esperar(() => DATA.compras.length === nC + 1 && DATA.almSaidas.length === nS + 1 && DATA.clComb.length === nM + 1, 8000).catch(() => {}); await T.sincronizado(); await T.dorme(300);
    const c = DATA.compras.filter((x) => x.setor === 'lenha').sort((a, b2) => (+b2.numero || 0) - (+a.numero || 0))[0];
    return { box: !!box, antesPag, res: /Levou[^]*240,00/.test(res) && /Fica a pagar[^]*360,00/.test(res), saldo: finVenda(c).saldo, sd: DATA.almSaidas.some((x) => x.pagLenha && x.pagLenha.compraId === c.id), cb: DATA.clComb.length === nM + 1 }; });
  ok(p8.box && p8.antesPag, 'a Nova compra da lenha tem o bloco “O fornecedor levou (já pago)” antes do pagamento');
  ok(p8.res, 'o resumo mostra o que ele levou (R$ 240) e o que fica a pagar (R$ 360)');
  ok(p8.sd && p8.cb, 'ao confirmar, o EPI sai do almoxarifado e o combustível é lançado');
  ok(p8.saldo === 360, `a compra fica só com o resto a pagar (R$ ${p8.saldo})`);

  /* 9. depois: na compra já lançada, "Combustível que ele levou" abate essa compra */
  const p9 = await page.evaluate(async () => {
    const c = DATA.compras.filter((x) => x.setor === 'lenha').sort((a, b2) => (+b2.numero || 0) - (+a.numero || 0))[0]; const s0 = finVenda(c).saldo;
    SV = 'lenha'; location.hash = '#/compra/' + c.id; await T.dorme(900);
    const b = document.querySelector('#vvComb148'); if (!b) return { b: false }; b.click(); await T.dorme(300);
    document.querySelector('.veu #clcO').value = 'fora'; document.querySelector('.veu #clcL').value = '5'; document.querySelector('.veu #clcV').value = '8,00';
    document.querySelector('.veu [data-ok]').click(); await T.dorme(700); await T.sincronizado();
    return { b: true, s0, s1: finVenda(DATA.compras.find((x) => x.id === c.id)).saldo }; });
  ok(p9.b && p9.s1 === Math.round((p9.s0 - 40) * 100) / 100, `na compra já lançada, “Combustível que ele levou” abate essa compra (${p9.s0} → ${p9.s1})`);

  /* 10. lançado uma vez só: o repetido é bloqueado nos dois setores */
  const p10 = await page.evaluate(async () => {
    const lenhaBomba = CB_LENHA.conferirComb({ onde: 'bomba', fornecedorId: 'f_lenha', produtoId: 'p_s10', litros: 10, preco: 7, data: hoje() });
    const lenhaFora = CB_LENHA.conferirComb({ onde: 'fora', fornecedorId: 'f_lenha', litros: 10, preco: 7, data: hoje() });
    const s0 = SV; SV = 'combustivel'; const M = MODS.consumos; const st = { ...M.padrao(), id: 'dupx', data: hoje(), hora: '10:00' }; st.abastecidoEm = 'Fornecedor de lenha'; M.aoMudar(st, 'abastecidoEm');
    st.produtoId = 'p_s10'; M.aoMudar(st, 'produtoId'); st.quantidade = 10; st.combLenhaForn = 'f_lenha'; st.combLenhaPreco = 7;
    const comb = conferirRegistro('consumos', st).erros.quantidade || ''; SV = s0;
    const outro = CB_LENHA.conferirComb({ onde: 'fora', fornecedorId: 'f_lenha', litros: 33, preco: 7, data: hoje() });
    return { lenhaBomba, lenhaFora, comb, outro }; });
  ok(p10.lenhaBomba.some((x) => /já foi lançado/.test(x)), 'Lenha: o mesmo abastecimento da bomba não é lançado duas vezes');
  ok(p10.lenhaFora.some((x) => /já foi lançado/.test(x)), 'Lenha: o mesmo combustível lançado à mão também é bloqueado');
  ok(/já foi lançado/.test(p10.comb), 'Setor de Combustível: o que a Lenha já lançou é bloqueado ali');
  ok(!p10.outro.length, 'outro combustível (litros diferentes) continua livre');

  ok(!erros.length, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  ok(false, 'o teste parou: ' + (e && e.message));
} finally {
  await browser.close(); http.close();
}
console.log(`\nLenha paga com produto: ${resultados.filter((r) => r[0] === 'ok').length} aprovados, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
