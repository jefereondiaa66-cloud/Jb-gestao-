#!/usr/bin/env node
// Teste de ponta a ponta da V120 (comprovante do lançamento), no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Dados fictícios.
//  - todo lançamento aberto, em todos os setores, tem o botão "Comprovante"; cadastro tem "Imprimir ficha"
//  - o Setor Pessoal também (13/11/2026)
//  - o comprovante sai só do que está gravado: cupom 80/58 mm e folha A4, com os valores do registro
//  - alteração não salva não vira comprovante; emitir não grava nada no banco
//  - compromisso do Financeiro (contas a pagar) também tem o comprovante
// Uso: node scripts/construir.mjs && node scripts/testar-comprovante-lancamento.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const acharLib = (nome) => { for (const base of [RAIZ, process.cwd(), process.env.JB_LIBS || '']) { if (!base) continue; const p = join(base, 'node_modules', nome); if (existsSync(p)) return p; } return null; };
const LIB_PDF = acharLib('jspdf/dist/jspdf.umd.min.js'), LIB_TAB = acharLib('jspdf-autotable/dist/jspdf.plugin.autotable.min.js');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const D = '2026-11-13';
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  // cor escolhida pelo dono (azul): o cupom não pode pegar a cor
  ['config', 'aparencia', { dono: 'u_DONO', tema: { p: 'azul', m: 'claro', v: 'cc', em: '2026-11-13T00:00:00.000Z' } }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', fantasia: 'Empresa Exemplo', cnpj: '11.222.333/0001-81', endereco: 'Rodovia Exemplo, km 1', cidade: 'Cidade Exemplo/MA', telefone: '(99) 99999-0000', responsavel: 'Responsável Exemplo' } }],
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo Um', situacao: 'Ativo', setor: 'Queima', cargo: 'Forneiro', matricula: '0012', admissao: '2024-03-01', tipoContratacao: 'CLT' }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['locais', 'l_cam', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste', tipo: 'Caminhão', controleUso: 'Hodômetro (km)', situacao: 'Ativo' }],
  ['consumos', '2026-11-s0', { chave: '2026-11-s0', items: { c1: { id: 'c1', setor: 'combustivel', data: D, hora: '19:40', produtoId: 'p_s10', localId: 'l_cam', quantidade: 73, unidade: 'L', origem: 'Estoque da fábrica', abastecidoEm: 'Máquina da fábrica', anterior: 237, atual: 164, custoUnit: 7.49, custoTotal: 546.77, operador: 'Motorista Exemplo', medidor: 15230, obs: 'Abastecimento de teste', criadoEm: '2026-11-13T22:40:00.000Z', criadoPor: 'u_DONO' } } }],
  ['fin', '2026-11-s0', { chave: '2026-11-s0', items: { t1: { id: 't1', tipo: 'titulo', numero: 12, data: D, descricao: 'Conta de energia de outubro', categoria: 'Energia', setorOrigem: 'Geral (Financeiro)', beneficiarioTipo: 'Outro', beneficiario: 'Concessionária Exemplo', beneficiarioNome: 'Concessionária Exemplo', valor: 1500, vencimento: '2026-11-20', formaPrevista: 'PIX', pagamentos: [{ id: 'pg1', data: D, valor: 500, forma: 'PIX' }], criadoEm: '2026-11-13T12:00:00.000Z', criadoPor: 'u_DONO' } } }],
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
  await page.addInitScript(({ codigo, docs }) => {
    // eslint-disable-next-line no-eval
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'], fiscal: () => ({ status: 503, corpo: { erro: { tipo: 'configuracao', mensagem: 'simulado' } } }) });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true, null, { timeout: 30000 });
  await page.waitForFunction(() => APP.carregado === true && DATA.consumos.length === 1 && DATA.fTitulos.length === 1, null, { timeout: 20000 });
  const espera = (ms) => page.waitForTimeout(ms);
  const foto = () => page.evaluate(() => JSON.stringify([DATA.consumos, DATA.fin, DATA.locais, DATA.log.length]));
  const antes = await foto();

  console.log('Onde o botão aparece');
  const mapa = await page.evaluate(() => {
    const dp = new Set(); MENU.forEach((g) => (g[2] || []).forEach((it) => it && it.m && dp.add(it.m)));
    const ks = Object.keys(MODS);
    return { noDP: ks.filter((k) => dp.has(k) && (MODS[k].fields || []).length && !COMP_LANC.pode(k)), fora: ks.filter((k) => !dp.has(k) && (MODS[k].fields || []).length && !COMP_LANC.pode(k)), com: ks.filter((k) => COMP_LANC.pode(k)).length };
  });
  ok(mapa.noDP.length === 0, 'todas as telas do Setor Pessoal têm o comprovante' + (mapa.noDP.length ? ' · faltam: ' + mapa.noDP.join(', ') : ''));
  ok(mapa.fora.length === 0 && mapa.com > 20, `todas as telas dos outros setores têm (${mapa.com} módulos)` + (mapa.fora.length ? ' · faltam: ' + mapa.fora.join(', ') : ''));

  console.log('Abastecimento (Setor de Combustível)');
  await page.evaluate(() => { marcarSetor('combustivel'); location.hash = '#/setor-combustivel'; }); await espera(500);
  await page.evaluate(() => { location.hash = '#/consumos/c1'; });
  await page.waitForSelector('#camada .gaveta [data-acao="comprovante"]', { timeout: 8000 });
  ok((await page.textContent('#camada [data-acao="comprovante"]')).trim() === 'Comprovante', 'o lançamento aberto mostra o botão "Comprovante"');
  await page.click('#camada [data-acao="comprovante"]');
  await page.waitForSelector('#fvdDoc', { timeout: 8000 });
  const cp = await page.evaluate(() => ({ hash: location.hash, cupom: !!document.querySelector('#fvdDoc.cupom'), t: document.querySelector('#fvdDoc').innerText.replace(/[\u00a0\u202f]/g, ' '), fmts: document.querySelectorAll('[data-fmt]').length }));
  ok(cp.hash === '#/documento' && cp.cupom && cp.fmts === 3, 'abre em "Visualizar documento", no cupom, com a escolha 80 mm, 58 mm e A4');
  ok(/COMPROVANTE/.test(cp.t) && /ABASTECIMENTO/i.test(cp.t) && cp.t.includes('Diesel S10') && cp.t.includes('Caminhão Teste') && cp.t.includes('R$ 546,77') && cp.t.includes('13/11/2026 às 19:40') && cp.t.includes('Motorista Exemplo'), 'cupom traz combustível, veículo, data e hora, motorista e o custo gravado');
  ok(/n[ãa]o [ée] documento fiscal/i.test(cp.t), 'cupom avisa que não é documento fiscal');
  // pedido do Jeferson (13/11/2026): o cupom de todo setor no mesmo modelo do comprovante de entrega de lenha
  const md = await page.evaluate(() => {
    const art = document.querySelector('#fvdDoc.cupom'); const W = art.getBoundingClientRect().width;
    // nenhum valor espremido numa coluna estreita (quebrando letra por letra)
    const espremidos = [...art.querySelectorAll('.cp-ln')].filter((l) => { const v = l.lastElementChild; return v && v.textContent.length > 12 && v.getBoundingClientRect().width < W * 0.3; }).map((l) => l.textContent);
    // a cor escolhida no sistema não pinta o cupom: a faixa continua preta
    const cor = document.documentElement.getAttribute('data-jbtema') + ' · ' + getComputedStyle(art.querySelector('.cp-tipo')).backgroundColor;
    // documento só em A4 com cara de comprovante ganha o cupom (fora do Setor Pessoal); ficha não
    const P = baseRel('COMPROVANTE DE PAGAMENTO', 'Teste', []); P.classe = 'comprovante'; P.setor = nomeSetorDoc('financeiro'); P.meta = [['Pago em', '13/11/2026']];
    P.blocos.push({ tipo: 'tabela', head: ['Valores', 'Valor'], body: [['Valor do pagamento', 'R$ 10,00']], foot: ['Total pago', 'R$ 10,00'] }); garantirCupom(P);
    const Q = baseRel('RECIBO DE FÉRIAS', 'Teste', []); Q.classe = 'comprovante'; Q.setor = nomeSetorDoc('dp'); garantirCupom(Q);
    const F = baseRel('FICHA DE CADASTRO', 'Teste', []); F.classe = 'ficha'; garantirCupom(F);
    return { espremidos, cor, link: /Abrir a compra/.test(art.innerText), pag: !!P.cupom && P.cupom.total && P.cupom.total[1] === 'R$ 10,00', dp: !Q.cupom, ficha: !F.cupom };
  });
  ok(md.espremidos.length === 0, 'nenhum valor do cupom fica espremido numa coluna estreita' + (md.espremidos.length ? ': ' + md.espremidos.join(' | ') : ''));
  ok(md.cor === 'azul · rgb(0, 0, 0)', 'com a cor azul escolhida, a faixa do cupom continua preta (' + md.cor + ')');
  ok(!md.link, 'texto de link da tela ("Abrir a compra") não vai para o cupom');
  ok(md.pag && md.dp && md.ficha, 'comprovante só em A4 ganha o cupom (com o total); Setor Pessoal e ficha de cadastro não');
  await page.click('[data-fmt="a4"]'); await espera(300);
  const a4 = await page.evaluate(() => ({ folha: !!document.querySelector('#fvdDoc.fvd-doc'), t: document.querySelector('#fvdDoc').innerText }));
  ok(a4.folha && /COMPROVANTE DE ABASTECIMENTO/.test(a4.t) && /Setor de Combustível/i.test(a4.t) && a4.t.includes('Saldo antes: 237 · depois: 164 L') && a4.t.includes('R$ 546,77 (73 L × R$ 7,49/L)') && a4.t.includes('Registrado por'), 'folha A4 traz setor, saldo antes e depois, conta do custo e quem registrou');
  const temPdf = await page.evaluate(() => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable));
  if (temPdf) {
    const pdf = await page.evaluate(() => { const r = {}; const X = DOC_VER.D; for (const f of ['a4', 'c80', 'c58']) { X.formatoTela = f; try { const d = pdfDoDoc(X); r[f] = d ? d.output('arraybuffer').byteLength : 0; } catch (e) { r[f] = 'erro: ' + e.message; } } X.formatoTela = 'a4'; return r; });
    ok(pdf.a4 > 1000 && pdf.c80 > 1000 && pdf.c58 > 1000, 'PDF sai nos três formatos (A4, 80 mm e 58 mm)');
  } else console.log('  ! biblioteca de PDF indisponível neste ambiente: conferência de PDF pulada');
  await page.click('.fv-topo a.btn'); await espera(700);
  ok(await page.evaluate(() => location.hash === '#/consumos/c1' && !!document.querySelector('#camada .gaveta')), '"Voltar" reabre o mesmo lançamento');

  console.log('Cadastro (veículo) e Setor Pessoal');
  await page.evaluate(() => { location.hash = '#/locais/l_cam'; });
  await page.waitForSelector('#camada .gaveta [data-acao="comprovante"]', { timeout: 8000 });
  ok((await page.textContent('#camada [data-acao="comprovante"]')).trim() === 'Imprimir ficha', 'cadastro mostra "Imprimir ficha"');
  await page.click('#camada [data-acao="comprovante"]'); await page.waitForSelector('#fvdDoc', { timeout: 8000 });
  const fc = await page.evaluate(() => ({ t: document.querySelector('#fvdDoc').innerText, fmts: document.querySelectorAll('[data-fmt]').length }));
  ok(/FICHA DE CADASTRO/.test(fc.t) && fc.t.includes('Caminhão Teste') && fc.fmts === 0 && !/\(ex\.:/.test(fc.t), 'ficha de cadastro sai em folha A4, sem a dica "ex.:" dos campos');
  await page.evaluate(() => { location.hash = '#/funcionarios/f1'; });
  await page.waitForSelector('#camada .gaveta', { timeout: 8000 }); await espera(300);
  ok(await page.evaluate(() => (document.querySelector('#camada [data-acao="comprovante"]') || {}).textContent === 'Imprimir ficha'), 'ficha do funcionário (Setor Pessoal) tem "Imprimir ficha"');

  console.log('Financeiro');
  await page.evaluate(() => { if (GAV) fecharGaveta(true); location.hash = '#/fTitulos/t1'; });
  await page.waitForSelector('#camada .gaveta [data-acao="comprovante"]', { timeout: 8000 });
  const sujo = await page.evaluate(async () => { const i = document.querySelector('#camada [data-k="descricao"]'); i.value += ' X'; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 100)); document.querySelector('#camada [data-acao="comprovante"]').click(); await new Promise((r) => setTimeout(r, 300)); return { hash: location.hash, aviso: [...document.querySelectorAll('.toast')].some((t) => /Salve as alterações antes/.test(t.textContent)) }; });
  ok(sujo.hash === '#/fTitulos/t1' && sujo.aviso, 'com alteração não salva, pede para salvar antes e não emite');
  const ob = await page.evaluate(async () => { GAV.sujo = false; fecharGaveta(true); location.hash = '#/fpagar'; await new Promise((r) => setTimeout(r, 700)); window.FINANCEIRO_SETOR.acoes.abrirObrig('t:t1'); await new Promise((r) => setTimeout(r, 300)); return !!document.querySelector('#camada [data-a="comprovante"]'); });
  ok(ob, 'a janela do compromisso (contas a pagar) tem o botão "Comprovante"');
  await page.click('#camada [data-a="comprovante"]'); await page.waitForSelector('#fvdDoc', { timeout: 8000 });
  await page.click('[data-fmt="a4"]'); await espera(300);
  const fo = await page.evaluate(() => document.querySelector('#fvdDoc').innerText.replace(/[\u00a0\u202f]/g, ' '));
  ok(/COMPROVANTE DE COMPROMISSO FINANCEIRO/.test(fo) && fo.includes('Concessionária Exemplo') && fo.includes('R$ 1.500,00') && fo.includes('R$ 500,00') && fo.includes('R$ 1.000,00') && /Setor Financeiro/i.test(fo) && !/Nº Nº/.test(fo), 'comprovante do compromisso traz beneficiário, valor previsto, pago e saldo');

  console.log('Segurança');
  ok((await foto()) === antes, 'emitir comprovante não alterou nenhum registro nem o histórico');
  ok(erros.length === 0, 'nenhum erro de página' + (erros.length ? ': ' + erros.join(' | ') : ''));
} catch (e) { falhas++; console.error('  ✘ erro no teste:', e && e.message); }
finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nTudo certo: comprovante do lançamento (V120).');
process.exit(falhas ? 1 : 0);
