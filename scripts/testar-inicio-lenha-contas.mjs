#!/usr/bin/env node
// Teste do cartão "Contas a pagar" no início do Setor da Lenha (V175, 25/11/2026), no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Os dados são fictícios e só existem
// no banco simulado, em memória: nada toca o banco de verdade.
// Pedido do Jeferson: no início da Lenha, ver o total a pagar de cada fornecedor sem precisar apertar em "Ver contas".
// Confere:
//  - cada fornecedor aparece uma vez só, com o total que falta pagar, quantas compras estão em aberto e quanto já
//    venceu (ou o próximo vencimento); fornecedor quitado e compra do Combustível não aparecem;
//  - os números e a ordem são os mesmos da tela Contas a pagar (Ver contas) e do Financeiro › Contas a pagar – Lenha,
//    já com o combustível dado ao fornecedor e os pagamentos (o pagamento quita primeiro a compra mais antiga);
//  - tocar no fornecedor abre as compras dele; o número vermelho conta os fornecedores com conta vencida;
//  - no celular (390 px) nada fica cortado; com mais de 8 fornecedores, os outros somam numa linha só;
//  - o início do Combustível continua como estava; abrir o início não grava nada.
// Uso: node scripts/construir.mjs && node scripts/testar-inicio-lenha-contas.mjs   (FOTOS=<pasta> guarda capturas)
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
  ['fornecedores', 'f_d', { id: 'f_d', setor: 'lenha', nome: 'Fornecedor Lenha D', tipoPessoa: 'Física', situacao: 'Ativo' }],
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
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
  await page.evaluate(() => {
    const sp = (s) => String(s == null ? '' : s).replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();
    window.T = {
      sp,
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 200)); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela(); },
      abrirNovo: async (mod, setor, dados) => { SV = setor; PREFILL = { mod, dados }; location.hash = '#/' + mod + '/novo'; await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      /* compra pelo caminho de sempre (Nova compra); extra muda a data e o vencimento */
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        for (let k = 0; k < 3; k++) { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (DATA.compras.length > antes) break; await T.confirmarJanela(); }
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes');
        return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
      irModulo: async () => { location.hash = '#/fLenha'; await T.esperar(() => /Contas a pagar – Lenha|Fornecedores/.test(document.querySelector('#svCorpo') ? document.querySelector('#svCorpo').textContent : '')); await T.dorme(250); },
      val: (sel, v) => { const el = document.querySelector('.veu .modal ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      abrirPagar: async (fid) => { await T.irModulo(); const b = document.querySelector('[data-cplpagar="' + fid + '"]'); if (!b) throw new Error('sem botão de pagar para ' + fid); b.click(); await T.esperar(() => document.querySelector('.veu .modal #cpV')); await T.dorme(120); },
      preencher: (valor) => { T.val('#cpV', valor); T.val('#cpF', 'PIX'); const c = document.querySelector('.veu .modal #cpC'); if (c && !c.closest('[hidden]')) T.val('#cpC', '__caixa'); },
      confirmar: async () => { await T.dorme(750); const n0 = DATA.fBaixaLenha.length; document.querySelector('.veu .modal [data-ok]').click(); await T.esperar(() => !document.querySelector('.veu .modal #cpV') || document.querySelector('.veu .modal [data-ok]:not([disabled])') && DATA.fBaixaLenha.length === n0, 15000); await T.dorme(400); return !document.querySelector('.veu .modal #cpV'); },
      /* abre o início do setor e espera o cartão novo */
      inicio: async (setor, sel) => { SV = setor; location.hash = '#/setor-' + setor; await T.esperar(() => document.querySelector(sel) && /setor-/.test(location.hash)); await T.dorme(250); },
      /* o cartão "Contas a pagar" do início, linha por linha */
      cartao: () => {
        const bl = document.querySelector('#svCorpo .cpf175'); if (!bl) return null;
        const linhas = [...bl.querySelectorAll('.lst li a')].map((a) => ({ href: a.getAttribute('href'), t: T.sp(a.querySelector('.tx b').textContent), s: T.sp(a.querySelector('.tx small').textContent), v: T.sp(a.querySelector('.vl').textContent), vencido: a.querySelector('.av').classList.contains('a-pe') }));
        const n = bl.querySelector('h3 .n'), ver = bl.querySelector('h3 a');
        return { linhas, frase: T.sp((bl.querySelector('p.ajuda') || {}).textContent || ''), badge: n ? T.sp(n.textContent) : '', ver: ver ? ver.getAttribute('href') + ' ' + T.sp(ver.textContent) : '', vazio: T.sp((bl.querySelector('.ex-vazio') || {}).textContent || '') };
      },
      /* o que está gravado nas coleções de dinheiro (para conferir que abrir as telas não grava nada) */
      gravado: () => { const out = []; window.__srv.estado.docs.forEach((d) => { if (/^(compras|fin|consumos|clCtrl|clDesc)(\/|$)/.test(d.colecao)) out.push([d.colecao, d.id, d.versao, d.dados]); }); return JSON.stringify(out); },
    };
  });
  const foto = async (nome, sel) => { if (!FOTOS) return; if (sel) await page.locator(sel).first().screenshot({ path: join(FOTOS, nome + '.png') }); else await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); };

  console.log('Início da Lenha · Contas a pagar por fornecedor');
  /* A. compras de quatro fornecedores de lenha e uma do Combustível; combustível dado ao B; D quitado; A pago em parte */
  const a = await page.evaluate(async () => {
    const h = hoje(), d3 = addDias(h, -3), ontem = addDias(h, -1), d5 = addDias(h, 5);
    await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5, { vencimento: d5 });
    const c1 = await T.comprar('lenha', 'f_a', 'p_lenha', 40, 75, { data: d3, vencimento: ontem });
    const c2 = await T.comprar('lenha', 'f_a', 'p_lenha', 25, 80, { vencimento: d5 });
    const c3 = await T.comprar('lenha', 'f_b', 'p_lenha', 30, 75, { data: d3, vencimento: ontem });
    const c4 = await T.comprar('lenha', 'f_c', 'p_lenha', 10, 80, { vencimento: h });
    const c5 = await T.comprar('lenha', 'f_d', 'p_lenha', 5, 80, { data: d3, vencimento: ontem });
    await T.sincronizado();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 100, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_b', combLenhaPreco: 5 });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.combLenha)); await T.sincronizado();
    await T.abrirPagar('f_d'); T.preencher('400,00'); const pagouD = await T.confirmar(); await T.sincronizado();
    await T.abrirPagar('f_a'); T.preencher('1.000,00'); const pagouA = await T.confirmar(); await T.sincronizado();
    const st = (c) => finVenda(DATA.compras.find((x) => x.id === c.id));
    return { tot: [c1.total, c2.total, c3.total, c4.total, c5.total], pagouD, pagouA,
      sit: [c1, c2, c3, c4, c5].map((c) => { const f = st(c); return f.status + ' ' + f.saldo; }),
      fin: ['f_a', 'f_b', 'f_c', 'f_d'].map((f) => CPL_LENHA.conta(f).saldo) };
  });
  ok(igual(a.tot, [3000, 2000, 2250, 800, 400]), `compras de lenha lançadas: ${a.tot.join(' · ')}`);
  ok(a.pagouD && a.pagouA, 'pagamentos registrados pelo Financeiro (D inteiro, A R$ 1.000)');
  ok(igual(a.sit, ['Vencido 2000', 'Pendente 2000', 'Vencido 1750', 'Pendente 800', 'Pago 0']), `situação de cada compra: ${a.sit.join(' · ')}`);
  ok(igual(a.fin, [4000, 1750, 800, 0]), `Financeiro › Contas a pagar – Lenha: A ${a.fin[0]} · B ${a.fin[1]} · C ${a.fin[2]} · D ${a.fin[3]}`);

  /* B. o cartão do início: um fornecedor por linha, com o total de cada */
  const antes = await page.evaluate(() => T.gravado());
  const b = await page.evaluate(async () => {
    await T.inicio('lenha', '#svCorpo .cpf175');
    const blocos = [...document.querySelectorAll('#svCorpo .bloco > h3')].map((h) => T.sp(h.firstChild && h.firstChild.textContent));
    return { c: T.cartao(), blocos, kpi: T.sp(([...document.querySelectorAll('#svCorpo .kpi')].find((k) => /Contas a pagar/.test(k.textContent)) || {}).textContent || '') };
  });
  await foto('01-inicio-lenha', '#svCorpo .cpf175');
  const L = b.c ? b.c.linhas : [];
  ok(!!b.c && b.blocos.filter((t) => t === 'Contas a pagar').length === 1, 'o início da Lenha tem um cartão “Contas a pagar”, agora por fornecedor');
  ok(igual(L.map((x) => x.t), ['Fornecedor Lenha A', 'Fornecedor Lenha B', 'Fornecedor Lenha C']), `cada fornecedor uma vez só, na ordem da tela Contas a pagar: ${L.map((x) => x.t).join(' · ')}`);
  ok(igual(L.map((x) => x.v), ['R$ 4.000,00', 'R$ 1.750,00', 'R$ 800,00']), `total que falta pagar a cada um: ${L.map((x) => x.v).join(' · ')}`);
  ok(igual(L.map((x) => x.s), ['2 compras · R$ 2.000,00 vencido', '1 compra · tudo vencido', '1 compra · vence hoje']), `linha de baixo: ${L.map((x) => x.s).join(' | ')}`);
  ok(igual(L.map((x) => x.vencido), [true, true, false]), 'fornecedor com conta vencida em vermelho; os outros, não');
  ok(igual(L.map((x) => x.href), ['#/pagar/f_a', '#/pagar/f_b', '#/pagar/f_c']), 'cada linha leva às compras do fornecedor');
  ok(!L.some((x) => /Lenha D|Posto/.test(x.t)), 'fornecedor quitado (D) e a compra do Combustível não aparecem');
  ok(b.c && b.c.frase === 'Falta pagar R$ 6.550,00 a 3 fornecedores · R$ 3.750,00 vencido', `resumo no cartão: ${b.c && b.c.frase}`);
  ok(b.c && b.c.badge === '2' && b.c.ver === '#/pagar Ver contas', `número vermelho = fornecedores com conta vencida (${b.c && b.c.badge}); “Ver contas” continua`);
  ok(/R\$ 6\.550,00/.test(b.kpi), `o quadro “Contas a pagar” lá em cima soma o mesmo (${b.kpi.slice(0, 80)})`);

  /* C. os mesmos números da tela Contas a pagar (Ver contas) */
  const c = await page.evaluate(async () => {
    location.hash = '#/pagar'; await T.esperar(() => document.querySelector('#svCorpo table.fin-forn')); await T.dorme(200);
    const tr = [...document.querySelectorAll('#svCorpo table.fin-forn tbody tr')];
    return { linhas: tr.map((r) => [T.sp(r.querySelector('td b').textContent), T.sp(r.querySelector('td[data-l="Falta pagar"]').textContent), T.sp(r.querySelector('td[data-l="Vencido"]').textContent)]) };
  });
  ok(igual(c.linhas.map((x) => x[0]), L.map((x) => x.t)) && igual(c.linhas.map((x) => x[1]), L.map((x) => x.v)), `Ver contas: ${c.linhas.map((x) => x[0] + ' ' + x[1]).join(' · ')}`);
  ok(igual(c.linhas.map((x) => x[2]), ['R$ 2.000,00', 'R$ 1.750,00', '—']), `vencido igual nas duas telas: ${c.linhas.map((x) => x[2]).join(' · ')}`);

  /* D. tocar no fornecedor abre as compras dele */
  const d = await page.evaluate(async () => {
    await T.inicio('lenha', '#svCorpo .cpf175');
    document.querySelector('#svCorpo .cpf175 .lst a[href="#/pagar/f_a"]').click();
    await T.esperar(() => location.hash === '#/pagar/f_a' && /Fornecedor Lenha A/.test((document.querySelector('#svCorpo h1') || {}).textContent || '')); await T.dorme(200);
    return { frase: T.sp((document.querySelector('#svCorpo p.ajuda') || {}).textContent || ''), compras: document.querySelectorAll('#svCorpo table tbody tr[data-go]').length };
  });
  ok(/Falta pagar R\$ 4\.000,00 a Fornecedor Lenha A, de 2 compras em aberto, R\$ 2\.000,00 vencido/.test(d.frase) && d.compras === 2, `tocando em A: ${d.frase} (${d.compras} compras)`);
  const depois = await page.evaluate(() => T.gravado());
  ok(antes === depois, 'abrir o início, o Ver contas e as compras do fornecedor não grava nada');

  /* E. no celular: o nome, a linha de baixo e o valor aparecem inteiros */
  await page.setViewportSize({ width: 390, height: 844 });
  const e = await page.evaluate(async () => {
    await T.inicio('lenha', '#svCorpo .cpf175'); await T.dorme(300);
    const bl = document.querySelector('#svCorpo .cpf175'); bl.scrollIntoView({ block: 'start' }); await T.dorme(100);
    const cortado = [...bl.querySelectorAll('.lst .tx b, .lst .tx small, .lst .vl')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent);
    const r = bl.getBoundingClientRect(); const fora = [...bl.querySelectorAll('.lst .vl')].filter((el) => el.getBoundingClientRect().right > Math.min(innerWidth, r.right) + 0.5).map((el) => el.textContent);
    return { cortado, fora, larg: Math.round(r.width), cabe: bl.scrollWidth <= bl.clientWidth + 1, linhas: T.cartao().linhas.length };
  });
  await foto('02-inicio-lenha-celular', '#svCorpo .cpf175');
  ok(e.linhas === 3 && !e.cortado.length && !e.fora.length && e.cabe, `celular (${e.larg} px): nada cortado${e.cortado.length ? ' — cortado: ' + e.cortado.join(' | ') : ''}${e.fora.length ? ' — fora: ' + e.fora.join(' | ') : ''}`);
  await page.setViewportSize({ width: 1280, height: 900 });

  /* F. mais de 8 fornecedores: 8 linhas e os outros numa linha só, com a soma */
  const f = await page.evaluate(() => {
    const h = hoje();
    const aberto = Array.from({ length: 10 }, (_, i) => ({ v: { id: 'x' + i, tipoOp: 'compra', numero: 900 + i, setor: 'lenha', fornecedorId: 'fx' + i, fornecedor: { nome: 'Fornecedor X' + i }, data: h, vencimento: addDias(h, i + 1) }, f: { total: 100 * (i + 1), pago: 0, saldo: 100 * (i + 1), status: 'Pendente' } }));
    const div = document.createElement('div'); div.innerHTML = blocoPagarFornV({ aberto });
    const li = [...div.querySelectorAll('.lst li a')];
    const vazio = document.createElement('div'); vazio.innerHTML = blocoPagarFornV({ aberto: [] });
    return { n: li.length, ult: [li[li.length - 1].getAttribute('href'), T.sp(li[li.length - 1].querySelector('b').textContent), T.sp(li[li.length - 1].querySelector('.vl').textContent)],
      prim: T.sp(li[0].querySelector('small').textContent), frase: T.sp((div.querySelector('p.ajuda') || {}).textContent || ''), badge: !!div.querySelector('h3 .n'),
      vazio: T.sp((vazio.querySelector('.ex-vazio') || {}).textContent || ''), vazioFrase: !!vazio.querySelector('p.ajuda') };
  });
  ok(f.n === 9 && igual(f.ult, ['#/pagar', 'Mais 2 fornecedores', 'R$ 1.900,00']), `10 fornecedores: 8 linhas e “${f.ult[1]}” com ${f.ult[2]}`);
  ok(/^1 compra · vence em \d\d\/\d\d\/\d{4}$/.test(f.prim) && f.frase === 'Falta pagar R$ 5.500,00 a 10 fornecedores' && !f.badge, `sem nada vencido: “${f.prim}”, resumo “${f.frase}” e sem número vermelho`);
  ok(f.vazio === 'Nenhuma conta em aberto.' && !f.vazioFrase, 'sem conta em aberto: “Nenhuma conta em aberto.”');

  /* G. o início do Combustível continua como estava (contas escondidas; se mostrar, uma linha por compra) */
  const g = await page.evaluate(async () => {
    await T.inicio('combustivel', '#svCorpo .hero');
    const sem = { novo: !!document.querySelector('#svCorpo .cpf175'), contas: [...document.querySelectorAll('#svCorpo .bloco > h3')].some((h) => /^Contas a pagar/.test(T.sp(h.textContent))) };
    const cfg0 = CFG.combustivel; CFG.combustivel = { ...(cfg0 || {}), mostrarContas: true };
    try {
      location.hash = '#/setores'; await T.dorme(400); await T.inicio('combustivel', '#svCorpo .hero');
      const bl = [...document.querySelectorAll('#svCorpo .bloco')].find((x) => /^Contas a pagar/.test(T.sp((x.querySelector('h3') || {}).textContent || '')));
      return { sem, com: { novo: !!document.querySelector('#svCorpo .cpf175'), linhas: bl ? [...bl.querySelectorAll('.lst li')].map((x) => T.sp(x.textContent)) : null } };
    } finally { CFG.combustivel = cfg0; }
  });
  ok(!g.sem.novo && !g.sem.contas, 'Combustível: as contas continuam escondidas no início');
  ok(!g.com.novo && g.com.linhas && g.com.linhas.length === 1 && /Nº .*Posto Exemplo|Posto Exemplo.*Nº/.test(g.com.linhas[0]), `Combustível com “Mostrar contas”: uma linha por compra, como antes (${(g.com.linhas || []).join(' | ').slice(0, 90)})`);

  ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  console.error(e);
  falhas++;
} finally {
  await browser.close();
  http.close();
}
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
