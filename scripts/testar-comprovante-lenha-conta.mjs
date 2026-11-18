#!/usr/bin/env node
// Teste de ponta a ponta do comprovante de entrega de lenha com a conta do fornecedor (18/11/2026), no navegador,
// com o programa REAL (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Os dados são
// fictícios e só existem no banco simulado, em memória: nada toca o banco de verdade.
// Pedido do Jeferson: no comprovante que fica com quem entregou a lenha, junto com a compra feita, o total que a
// cerâmica deve ao fornecedor. Confere:
//  - saldo anterior + esta entrega = total devido, igual ao "Falta pagar" do Financeiro › Contas a pagar – Lenha;
//  - outro fornecedor não entra na conta; entrega do mesmo dia conta pela ordem do número;
//  - combustível do fornecedor e pagamento parcial (PAGAR / DAR BAIXA) mudam a conta como no Financeiro, e o
//    pagamento da entrega mostra o que foi descontado (pago + descontos + saldo = valor da entrega);
//  - comprovante emitido de novo mais tarde: as entregas lançadas depois aparecem numa linha própria;
//  - pago acima do saldo (adiantamento): crédito da cerâmica e desconto na entrega seguinte;
//  - cancelada, importada do controle antigo ou sem fornecedor: sem o quadro, e o comprovante sai como antes;
//  - cupom 80 e 58 mm na tela, folha A4 e PDF; emitir não grava nada no banco.
// Uso: node scripts/construir.mjs && node scripts/testar-comprovante-lenha-conta.mjs
//      (JB_LIBS=<pasta com node_modules/jspdf e jspdf-autotable> confere também os PDFs; FOTOS=<pasta> guarda capturas)
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const acharLib = (nome) => { for (const base of [RAIZ, process.cwd(), process.env.JB_LIBS || '']) { if (!base) continue; const p = join(base, 'node_modules', nome); if (existsSync(p)) return p; } return null; };
const LIB_PDF = acharLib('jspdf/dist/jspdf.umd.min.js'), LIB_TAB = acharLib('jspdf-autotable/dist/jspdf.plugin.autotable.min.js');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', fantasia: 'Empresa Exemplo', cnpj: '11.222.333/0001-81', endereco: 'Rodovia Exemplo, km 1', cidade: 'Cidade Exemplo/MA', telefone: '(99) 99999-0000', responsavel: 'Responsável Exemplo' } }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['produtos', 'p_lenha', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo' }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
  ['fornecedores', 'f_posto', { id: 'f_posto', setor: 'combustivel', nome: 'Posto Exemplo', tipoPessoa: 'Jurídica', cnpj: '11222333000181', situacao: 'Ativo' }],
  ['fornecedores', 'f_a', { id: 'f_a', setor: 'lenha', nome: 'Fornecedor Lenha A', tipoPessoa: 'Física', situacao: 'Ativo' }],
  ['fornecedores', 'f_b', { id: 'f_b', setor: 'lenha', nome: 'Fornecedor Lenha B', tipoPessoa: 'Física', situacao: 'Ativo' }],
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
  await page.evaluate(() => {
    const sp = (s) => String(s == null ? '' : s).replace(/[\u00a0\u202f]/g, ' ');
    window.T = {
      sp,
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela(); },
      abrirNovo: async (mod, setor, dados) => { SV = setor; PREFILL = { mod, dados }; location.hash = '#/' + mod + '/novo'; await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes');
        return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
      irModulo: async () => { location.hash = '#/fLenha'; await T.esperar(() => /Contas a pagar – Lenha|Fornecedores/.test(document.querySelector('#svCorpo') ? document.querySelector('#svCorpo').textContent : '')); await T.dorme(250); },
      val: (sel, v) => { const el = document.querySelector('.veu .modal ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      marcar: (sel) => { const el = document.querySelector('.veu .modal ' + sel); if (!el.checked) el.click(); },
      abrirPagar: async (fid) => { await T.irModulo(); const b = document.querySelector('[data-cplpagar="' + fid + '"]'); if (!b) throw new Error('sem botão de pagar para ' + fid); b.click(); await T.esperar(() => document.querySelector('.veu .modal #cpV')); await T.dorme(120); },
      preencher: (valor, o) => { o = o || {}; T.val('#cpV', valor); T.val('#cpF', o.forma || 'PIX'); const c = document.querySelector('.veu .modal #cpC'); if (c && !c.closest('[hidden]')) T.val('#cpC', o.conta || '__caixa'); },
      confirmar: async () => { await T.dorme(750); const n0 = DATA.fBaixaLenha.length; document.querySelector('.veu .modal [data-ok]').click(); await T.esperar(() => !document.querySelector('.veu .modal #cpV') || document.querySelector('.veu .modal [data-ok]:not([disabled])') && DATA.fBaixaLenha.length === n0, 15000); await T.dorme(400); return !document.querySelector('.veu .modal #cpV'); },
      /* o comprovante de entrega de uma compra, como sai do botão "Comprovante de entrega" */
      recibo: (id) => {
        const v = DATA.compras.find((c) => c.id === id); const D = docEntregaLenhaV(v);
        const bl = (D.cupom.blocos || []).find((x) => x.rot === 'Conta com o fornecedor'); const pg = (D.cupom.blocos || []).find((x) => x.rot === 'Pagamento');
        const tab = (D.blocos || []).find((x) => x.tipo === 'tabela' && /^Conta com o fornecedor/.test((x.head || [])[0] || ''));
        return { linhas: bl ? bl.linhas.map((l) => sp(l[0] + ' = ' + l[1])) : null, total: bl ? sp(bl.total.join(' ')) : null, nota: bl ? bl.nota : '',
          pag: pg ? pg.linhas.map((l) => sp(l[0] + ' = ' + l[1])) : [], totalEntrega: sp(D.cupom.total.join(' ')),
          a4: tab ? { body: tab.body.map((r) => sp(r.join(' = '))), foot: sp(tab.foot.join(' = ')), head: tab.head[0] } : null };
      },
      saldo: (fid) => CPL_LENHA.conta(fid).saldo,
      gravado: () => JSON.stringify([DATA.compras, DATA.fin, DATA.consumos, DATA.fTitulos, (DATA.log || []).length]),
    };
  });
  const foto = async (nome, sel) => { if (!FOTOS) return; if (sel) await page.locator(sel).first().screenshot({ path: join(FOTOS, nome + '.png') }); else await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); };

  console.log('Comprovante de entrega de lenha · conta com o fornecedor');
  /* A. duas entregas do fornecedor A no mesmo dia e uma do fornecedor B */
  const a = await page.evaluate(async () => {
    await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5);
    const c1 = await T.comprar('lenha', 'f_a', 'p_lenha', 40, 75);
    const c2 = await T.comprar('lenha', 'f_a', 'p_lenha', 25, 80);
    const c3 = await T.comprar('lenha', 'f_b', 'p_lenha', 30, 75);
    await T.sincronizado();
    window.__ids = { c1: c1.id, c2: c2.id, c3: c3.id };
    return { tot: [c1.total, c2.total, c3.total], mesmoDia: c1.data === c2.data, r1: T.recibo(c1.id), r2: T.recibo(c2.id), r3: T.recibo(c3.id), A: T.saldo('f_a'), B: T.saldo('f_b') };
  });
  ok(igual(a.tot, [3000, 2000, 2250]) && a.mesmoDia, `entregas lançadas: ${a.tot.join(' · ')} (A duas no mesmo dia)`);
  ok(igual(a.r2.linhas, ['Saldo anterior = R$ 3.000,00', '(+) Esta entrega = R$ 2.000,00']) && a.r2.total === 'TOTAL DEVIDO R$ 5.000,00',
    `2ª entrega de A: ${(a.r2.linhas || []).join(' · ')} → ${a.r2.total}`);
  ok(a.A === 5000 && a.r2.total.endsWith('5.000,00'), 'o total devido é o mesmo “Falta pagar” do Financeiro › Contas a pagar – Lenha (R$ 5.000,00)');
  ok(a.r2.totalEntrega === 'TOTAL R$ 2.000,00', `o total da entrega continua o mesmo no cupom (${a.r2.totalEntrega})`);
  ok(/^Posição da conta em \d\d\/\d\d\/\d{4} \d\d:\d\d$/.test(a.r2.nota), `a conta diz a hora da posição (${a.r2.nota})`);
  ok(a.r2.a4 && igual(a.r2.a4.body, a.r2.linhas) && a.r2.a4.foot === 'Total devido ao fornecedor = R$ 5.000,00', 'folha A4: o mesmo quadro, com “Total devido ao fornecedor”');
  ok(igual(a.r1.linhas, ['Saldo anterior = R$ 0,00', '(+) Esta entrega = R$ 3.000,00', '(+) Entregas lançadas depois desta = R$ 2.000,00']) && a.r1.total === 'TOTAL DEVIDO R$ 5.000,00',
    `1ª entrega emitida de novo depois da 2ª: ${(a.r1.linhas || []).join(' · ')} → ${a.r1.total}`);
  ok(igual(a.r3.linhas, ['Saldo anterior = R$ 0,00', '(+) Esta entrega = R$ 2.250,00']) && a.r3.total === 'TOTAL DEVIDO R$ 2.250,00' && a.B === 2250, 'fornecedor B: só a conta dele (as entregas de A não entram)');

  /* B. combustível abastecido para o fornecedor A (desconta da entrega mais antiga) */
  const b = await page.evaluate(async () => {
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', quantidade: 100, abastecidoEm: 'Fornecedor de lenha', combLenhaForn: 'f_a', combLenhaPreco: 5 });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.combLenha)); await T.sincronizado();
    return { r1: T.recibo(__ids.c1), r2: T.recibo(__ids.c2), A: T.saldo('f_a') };
  });
  ok(igual(b.r1.pag.slice(-3), ['Pago = R$ 0,00', 'Combustível e descontos = R$ 500,00', 'Saldo a pagar = R$ 2.500,00']), `pagamento da 1ª entrega mostra o combustível descontado: ${b.r1.pag.slice(-3).join(' · ')}`);
  ok(igual(b.r1.linhas, ['Saldo anterior = R$ 0,00', '(+) Falta pagar desta entrega = R$ 2.500,00', '(+) Entregas lançadas depois desta = R$ 2.000,00']) && b.r1.total === 'TOTAL DEVIDO R$ 4.500,00',
    `1ª entrega com combustível: ${(b.r1.linhas || []).join(' · ')} → ${b.r1.total}`);
  ok(igual(b.r2.linhas, ['Saldo anterior = R$ 2.500,00', '(+) Esta entrega = R$ 2.000,00']) && b.r2.total === 'TOTAL DEVIDO R$ 4.500,00' && b.A === 4500, `2ª entrega: ${(b.r2.linhas || []).join(' · ')} → ${b.r2.total} (Financeiro: R$ ${b.A})`);

  /* C. pagamento parcial pelo Financeiro (PAGAR / DAR BAIXA): quita primeiro a entrega mais antiga */
  const c = await page.evaluate(async () => {
    await T.abrirPagar('f_a'); T.preencher('1.000,00', { forma: 'PIX', conta: '__caixa' }); await T.dorme(150);
    const fechou = await T.confirmar(); await T.sincronizado();
    return { fechou, r1: T.recibo(__ids.c1), r2: T.recibo(__ids.c2), A: T.saldo('f_a') };
  });
  ok(c.fechou && igual(c.r1.pag.slice(-3), ['Pago = R$ 1.000,00', 'Combustível e descontos = R$ 500,00', 'Saldo a pagar = R$ 1.500,00']), `pago R$ 1.000 pelo Financeiro: ${c.r1.pag.slice(-3).join(' · ')}`);
  ok(igual(c.r2.linhas, ['Saldo anterior = R$ 1.500,00', '(+) Esta entrega = R$ 2.000,00']) && c.r2.total === 'TOTAL DEVIDO R$ 3.500,00' && c.A === 3500, `2ª entrega depois do pagamento: ${(c.r2.linhas || []).join(' · ')} → ${c.r2.total} (Financeiro: R$ ${c.A})`);

  /* D. na tela: cupom 80 mm, 58 mm e folha A4; emitir não grava nada */
  const antes = await page.evaluate(() => T.gravado());
  const tela = await page.evaluate(async () => {
    const v = DATA.compras.find((x) => x.id === __ids.c2);
    verDoc(docEntregaLenhaV(v), { voltar: '#/compra/' + v.id, formato: 'c80' });
    await T.esperar(() => document.querySelector('.cupom.w80'));
    const ler = () => { const el = document.querySelector('.cupom'); return { txt: T.sp(el.innerText), totais: [...el.querySelectorAll('.cp-total')].map((x) => T.sp(x.innerText).replace(/\s+/g, ' ').trim()), cabe: el.scrollWidth <= el.clientWidth + 1 }; };
    return { c80: ler() };
  });
  await foto('cupom-80mm', '.cupom');
  const t58 = await page.evaluate(async () => {
    document.querySelector('[data-fmt="c58"]').click(); await T.esperar(() => document.querySelector('.cupom.w58'));
    const el = document.querySelector('.cupom'); return { txt: T.sp(el.innerText), totais: [...el.querySelectorAll('.cp-total')].map((x) => T.sp(x.innerText).replace(/\s+/g, ' ').trim()), cabe: el.scrollWidth <= el.clientWidth + 1 };
  });
  await foto('cupom-58mm', '.cupom');
  const ta4 = await page.evaluate(async () => {
    document.querySelector('[data-fmt="a4"]').click(); await T.esperar(() => !document.querySelector('.cupom') && document.querySelector('.fvd'));
    return T.sp(document.querySelector('.fvd').innerText);
  });
  await foto('folha-a4');
  await page.evaluate(async () => { document.querySelector('[data-fmt="c80"]').click(); await T.esperar(() => document.querySelector('.cupom.w80')); });
  const ordem = (txt, partes) => { let i = 0; for (const p of partes) { const j = txt.indexOf(p, i); if (j < 0) return false; i = j + p.length; } return true; };
  ok(ordem(tela.c80.txt.toUpperCase(), ['PAGAMENTO', 'SALDO A PAGAR', 'CONTA COM O FORNECEDOR', 'SALDO ANTERIOR', 'R$ 1.500,00', '(+) ESTA ENTREGA', 'R$ 2.000,00', 'TOTAL DEVIDO', 'R$ 3.500,00', 'POSIÇÃO DA CONTA EM', 'ENTREGUE POR']),
    'cupom 80 mm: a conta com o fornecedor logo depois do pagamento e antes das assinaturas');
  ok(igual(tela.c80.totais, ['TOTAL R$ 2.000,00', 'TOTAL DEVIDO R$ 3.500,00']) && tela.c80.cabe, `cupom 80 mm: dois totais em destaque (${tela.c80.totais.join(' | ')}) e nada passa da largura`);
  ok(igual(t58.totais, ['TOTAL R$ 2.000,00', 'TOTAL DEVIDO R$ 3.500,00']) && t58.cabe && /SALDO ANTERIOR/i.test(t58.txt), `cupom 58 mm: ${t58.totais.join(' | ')}, dentro da largura`);
  ok(ordem(ta4.toUpperCase(), ['SALDO A PAGAR', 'CONTA COM O FORNECEDOR · POSIÇÃO EM', 'SALDO ANTERIOR', 'R$ 1.500,00', '(+) ESTA ENTREGA', 'R$ 2.000,00', 'TOTAL DEVIDO AO FORNECEDOR', 'R$ 3.500,00']), 'folha A4: quadro “Conta com o fornecedor” depois do pagamento');

  /* E. PDF (cupom 80 e 58 mm e folha A4), quando as bibliotecas de PDF estão disponíveis */
  const pdf = await page.evaluate(async () => {
    try { await T.esperar(() => window.jspdf && window.jspdf.jsPDF, 15000); } catch (e) { return null; }
    const D = docEntregaLenhaV(DATA.compras.find((x) => x.id === __ids.c2));
    const tem = (doc, ...p) => { const s = doc.output(); return p.every((x) => s.includes(x)); };
    let a4 = null; try { if (window.jspdf.jsPDF.API.autoTable) a4 = tem(pdfDoc(D), 'Total devido ao fornecedor', '3.500,00'); } catch (e) { a4 = 'erro: ' + e.message; }
    return { c80: tem(pdfCupom(D.cupom, 80), 'TOTAL DEVIDO', 'CONTA COM O FORNECEDOR', '3.500,00', 'Saldo anterior'), c58: tem(pdfCupom(D.cupom, 58), 'TOTAL DEVIDO', '3.500,00'), a4 };
  });
  if (!pdf) console.log('  ! biblioteca de PDF indisponível neste ambiente: conferência do PDF pulada (defina JB_LIBS)');
  else {
    ok(pdf.c80 && pdf.c58, 'PDF do cupom (80 e 58 mm) com a conta e o “TOTAL DEVIDO”');
    if (pdf.a4 === null) console.log('  ! jspdf-autotable indisponível: PDF da folha A4 pulado');
    else ok(pdf.a4 === true, 'PDF da folha A4 com o “Total devido ao fornecedor”' + (pdf.a4 === true ? '' : ' (' + pdf.a4 + ')'));
  }
  const depois = await page.evaluate(() => T.gravado());
  ok(antes === depois, 'emitir e trocar o formato do comprovante não grava nada no banco');

  /* F. pago acima do saldo: crédito da cerâmica; a entrega seguinte já sai com o adiantamento descontado */
  const f = await page.evaluate(async () => {
    await T.abrirPagar('f_b'); T.preencher('2.500,00', { forma: 'Dinheiro', conta: '__caixa' }); await T.dorme(200);
    T.marcar('#cpExcOk'); T.val('#cpJ', 'Adiantamento combinado para a próxima carga'); const fechou = await T.confirmar(); await T.sincronizado();
    const r3 = T.recibo(__ids.c3); const B1 = CPL_LENHA.conta('f_b');
    const c4 = await T.comprar('lenha', 'f_b', 'p_lenha', 10, 100); await T.sincronizado();
    return { fechou, r3, B1: { saldo: B1.saldo, credito: B1.credito }, r4: T.recibo(c4.id), B2: T.saldo('f_b') };
  });
  ok(f.fechou && f.B1.saldo === 0 && f.B1.credito === 250, `fornecedor B pago com R$ 250 a mais (crédito no Financeiro: R$ ${f.B1.credito})`);
  ok(igual(f.r3.linhas, ['Saldo anterior = R$ 0,00', '(+) Falta pagar desta entrega = R$ 0,00', 'Crédito da cerâmica (desconta das próximas entregas) = R$ 250,00']) && f.r3.total === 'TOTAL DEVIDO R$ 0,00',
    `entrega de B quitada: ${(f.r3.linhas || []).join(' · ')} → ${f.r3.total}`);
  ok(igual(f.r4.pag.slice(-3), ['Pago = R$ 0,00', 'Adiantamento descontado = R$ 250,00', 'Saldo a pagar = R$ 750,00']) && igual(f.r4.linhas, ['Saldo anterior = R$ 0,00', '(+) Falta pagar desta entrega = R$ 750,00']) && f.r4.total === 'TOTAL DEVIDO R$ 750,00' && f.B2 === 750,
    `entrega seguinte de B (R$ 1.000): ${f.r4.pag.slice(-2).join(' · ')} · ${f.r4.total}`);

  /* G. cancelada, importada do controle antigo e sem fornecedor: sem o quadro, comprovante igual ao de antes */
  const g = await page.evaluate(() => {
    const v = DATA.compras.find((x) => x.id === __ids.c2);
    const ver = (x) => { const D = docEntregaLenhaV(x); return { cupom: !!(D.cupom && D.cupom.total), bloco: D.cupom.blocos.some((b) => b.rot === 'Conta com o fornecedor'), a4: D.blocos.some((b) => b.tipo === 'tabela' && /^Conta com o fornecedor/.test((b.head || [])[0] || '')), canc: D.cupom.cancelado || '' }; };
    return { canc: ver({ ...v, status: 'Cancelada', cancelamento: { em: new Date().toISOString(), motivo: 'teste' } }), hist: ver({ ...v, historico: true }), semForn: ver({ ...v, fornecedorId: '' }) };
  });
  ok(g.canc.cupom && !g.canc.bloco && !g.canc.a4 && g.canc.canc === 'Compra cancelada', 'compra cancelada: comprovante marcado como cancelado e sem a conta');
  ok(g.hist.cupom && !g.hist.bloco && !g.hist.a4 && g.semForn.cupom && !g.semForn.bloco && !g.semForn.a4, 'importada do controle antigo ou sem fornecedor: comprovante sai, sem a conta');

  /* H. sem o módulo do Financeiro carregado: a mesma conta pela soma dos saldos das entregas */
  const h = await page.evaluate(() => { const bk = window.CPL_LENHA; window.CPL_LENHA = undefined; try { return T.recibo(__ids.c2); } finally { window.CPL_LENHA = bk; } });
  ok(igual(h.linhas, c.r2.linhas) && h.total === c.r2.total, `sem o módulo do Financeiro a conta sai igual (${h.total})`);

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
