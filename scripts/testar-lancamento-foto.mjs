#!/usr/bin/env node
// Teste de ponta a ponta do Lançamento Inteligente por Foto, no programa REAL
// (saida/claude.html) num Chromium, com o banco central simulado e a IA simulada
// (a "leitura" devolve um JSON fixo; nada sai para a internet). Confere:
//   1. nota com item já cadastrado + item novo, sem forma de pagamento no documento:
//      faz a pergunta única, cadastra fornecedor e item novo, liga o item existente,
//      dá entrada no estoque, lança a conta paga no Financeiro e guarda o original
//   2. o mesmo arquivo de novo é reconhecido como documento repetido
//   3. boleto: vai só para o Financeiro, com vencimento e linha digitável, sem pergunta
//   4. PDF digital: o texto do PDF segue junto para a leitura (precisa do pdfjs-dist:
//      PDFJS_DIR=<pasta com pdf.min.js e pdf.worker.min.js>; sem ele, o item é pulado)
// Uso: node scripts/construir.mjs && node scripts/testar-lancamento-foto.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const PDFJS = process.env.PDFJS_DIR || '';

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

/* PDF mínimo com texto (uma página), escrito à mão para não depender de nada */
function pdfMinimo(linhas) {
  const conteudo = 'BT /F1 11 Tf 50 780 Td 14 TL ' + linhas.map((l) => `(${l.replace(/[()\\]/g, '')}) Tj T*`).join(' ') + ' ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let s = '%PDF-1.4\n'; const pos = [];
  objs.forEach((o, i) => { pos.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return s;
}

const NOTA = {
  tipoDocumento: 'nota_fiscal',
  fornecedor: { nome: 'Ferragens Boa Vista Ltda', cnpjCpf: '11.222.333/0001-81', endereco: 'Rua A, 10', cidade: 'Exemplo', uf: 'MG', telefone: '(31) 3333-0000' },
  documento: { numero: '000123', serie: '1', chaveAcesso: null, dataEmissao: '2026-11-03' },
  itens: [
    { codigo: 'P10', descricao: 'PARAFUSO SEXTAVADO 10MM', quantidade: 100, unidade: 'UN', valorUnitario: 0.5, valorTotal: 50, confianca: 'alta', categoriaItem: 'Peças e manutenção', unidadeSistema: 'unidade' },
    { codigo: 'L22', descricao: 'LUVA DE RASPA CANO LONGO', quantidade: 2, unidade: 'PR', valorUnitario: 15, valorTotal: 30, confianca: 'media', categoriaItem: 'EPI', unidadeSistema: 'par' },
  ],
  valores: { produtos: 80, desconto: null, frete: 10, ipi: null, icmsST: null, total: 90 },
  vencimentos: [], boleto: {}, pagamento: { situacao: 'desconhecido' }, categoriaFinanceira: null, ilegiveis: [], observacoes: null,
};
const BOLETO = {
  tipoDocumento: 'boleto',
  fornecedor: { nome: 'Transportes Rio Claro', cnpjCpf: '11.444.777/0001-61' },
  documento: { numero: '9876', dataEmissao: '2026-11-01' },
  itens: [], valores: { total: 350.75 },
  vencimentos: [{ data: '2026-11-20', valor: 350.75 }],
  boleto: { linhaDigitavel: '34191.79001 01043.510047 91020.150008 1 96610000035075', banco: 'Itaú' },
  pagamento: { situacao: 'pendente', forma: 'Boleto', evidencia: 'Vencimento 20/11/2026' }, categoriaFinanceira: 'Fretes', ilegiveis: [],
};

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  const ctx = await browser.newContext();
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const u = r.request().url();
    const m = /pdf\.js\/3\.11\.174\/(pdf(?:\.worker)?\.min\.js)$/.exec(u);
    if (m && PDFJS && existsSync(join(PDFJS, m[1]))) return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(join(PDFJS, m[1])) });
    return r.abort();
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ codigo }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.__arquivos = []; window.__leituras = [];
    const assets = { upload: async (f) => { const id = 'a' + window.__arquivos.length.toString().padStart(31, '0'); window.__arquivos.push({ id, nome: f.name, tam: f.size }); return { id, url: '/_blob/' + id, sizeBytes: f.size, contentType: f.type }; }, list: async () => ({ assets: [] }), delete: async () => {} };
    const sample = async (input, o) => { window.__leituras.push({ prompt: String(input), imagens: o && o.images ? o.images.length : 0, tier: o && o.modelTier }); await new Promise((r) => setTimeout(r, 50)); return { text: '```json\n' + JSON.stringify(window.__resposta) + '\n```', truncated: false }; };
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 20, mediaTypes: ['image/jpeg', 'image/png'] }, tools: {} });
    sample.json = async () => ({});
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'assets' ? assets : n === 'sample' ? sample : null) };
  }, { codigo: servidorFalso });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  ok(await page.evaluate(() => !!window.LANC_IA_V65 && typeof TELAS_V.almIA === 'function' && typeof TELAS_V.fIA === 'function'), 'módulo carregado com as telas do Almoxarifado e do Financeiro');

  // item já cadastrado (deve ser reconhecido, não duplicado)
  await page.evaluate(() => gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: 'it1', nome: 'Parafuso sextavado 10mm', categoria: 'Peças e manutenção', unidade: 'unidade' }, null, true));
  await page.waitForFunction(() => DATA.almItens.some((i) => i.id === 'it1'));

  const foto = async (nome) => page.evaluate(async (nome) => {
    const cv = document.createElement('canvas'); cv.width = 900; cv.height = 1300; const x = cv.getContext('2d');
    x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 1300); x.fillStyle = '#000'; x.font = '28px sans-serif'; x.fillText('NOTA FISCAL ' + nome, 40, 60);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png'));
    LANC_IA_V65.adicionar([new File([b], nome + '.png', { type: 'image/png' })]);
  }, nome);
  const fase = (f, ms = 20000) => page.waitForFunction((f) => LANC_IA_V65.estado() && LANC_IA_V65.estado().fase === f, f, { timeout: ms });
  const confirmarDialogo = async () => { await page.waitForSelector('.veu [data-r="1"]', { timeout: 5000 }); await page.click('.veu [data-r="1"]'); };

  /* ---------- 1. nota: item existente + item novo, pagamento não informado ---------- */
  await page.evaluate((r) => { window.__resposta = r; location.hash = '#/almIA'; }, NOTA);
  await page.waitForSelector('#liaZona');
  ok(await page.evaluate(() => [...document.querySelectorAll('.dir-aba')].some((a) => /Lançamento Inteligente por Foto/.test(a.textContent))), 'aba "Lançamento Inteligente por Foto" no Almoxarifado');
  await foto('nota123');
  await fase('conferir');
  const c1 = await page.evaluate(() => { const C = LANC_IA_V65.estado().C; return { dest: C.destino, l0: C.linhas[0].alvo, l1: C.linhas[1].alvo, forn: C.forn.escolha, perg: C.pag.fonte, erros: LANC_IA_V65.alertas().erros, total: LANC_IA_V65.calc().total, imgs: window.__leituras[0].imagens }; });
  ok(c1.dest === 'almox', 'nota com itens vai para estoque + Financeiro');
  ok(c1.l0 === 'it1', 'item já cadastrado foi reconhecido (não cria outro)');
  ok(c1.l1 === 'novo', 'item que não existe fica para cadastrar');
  ok(c1.forn === 'novo', 'fornecedor novo fica para cadastrar');
  ok(c1.perg === 'pergunta' && c1.erros.some((e) => /como foi realizado o pagamento/i.test(e)), 'sem forma de pagamento no documento: faz a pergunta única');
  ok(c1.total === 90, `total conferido com o documento (${c1.total})`);
  ok(c1.imgs >= 2, `página em pé enviada em faixas para a leitura (${c1.imgs} imagens)`);
  ok(await page.evaluate(() => !!document.querySelector('#liaPerg') && /Como foi realizado o pagamento\?/.test(document.querySelector('#liaPerg').textContent)), 'pergunta "Como foi realizado o pagamento?" na tela');
  await page.click('[data-liaforma="PIX"]');
  await page.click('#liaOk'); await confirmarDialogo();
  await fase('pronto');
  const r1 = await page.evaluate(async () => {
    await new Promise((r) => setTimeout(r, 400));
    const f = DATA.almFornecedores.find((x) => x.doc === '11222333000181');
    const it = DATA.almItens.filter((i) => /luva de raspa/i.test(i.nome));
    const e = DATA.almEntradas.find((x) => x.ia);
    const ts = (e && e.finTitulos || []).map((id) => DATA.fTitulos.find((t) => t.id === id)).filter(Boolean);
    return { forn: !!f, nIt: it.length, itCat: it[0] && it[0].categoria, itUn: it[0] && it[0].unidade, nPar: DATA.almItens.filter((i) => /parafuso/i.test(i.nome)).length,
      ent: !!e, total: e && e.total, anexo: !!(e && e.anexo && e.anexo.id), anexos: e && (e.anexos || []).length, hashes: e && e.ia.hashes.length, forma: e && e.pagoVia,
      saldo: ALMOX_V52.estI('it1').saldo, nt: ts.length, pago: ts[0] && (ts[0].pagamentos || []).length, tAnexo: !!(ts[0] && ts[0].anexo && ts[0].anexo.id), tIa: !!(ts[0] && ts[0].ia),
      apelido: (DATA.almItens.find((i) => i.id === 'it1').apelidos || []).length, log: (DATA.log || []).length };
  });
  ok(r1.forn, 'fornecedor cadastrado com o CNPJ lido');
  ok(r1.nIt === 1 && r1.itCat === 'EPI' && r1.itUn === 'par', `item novo cadastrado uma vez, categoria e unidade sugeridas (${r1.itCat}, ${r1.itUn})`);
  ok(r1.nPar === 1, 'o parafuso continua com um cadastro só');
  ok(r1.ent && r1.total === 90, `entrada no estoque gravada (total ${r1.total})`);
  ok(r1.saldo === 100, `estoque do parafuso atualizado (${r1.saldo})`);
  ok(r1.anexo && r1.anexos === 1 && r1.hashes === 1, 'documento original anexado à entrada, com impressão digital');
  ok(r1.forma === 'PIX' && r1.nt === 1 && r1.pago === 1, 'conta lançada no Financeiro já paga via PIX (resposta da pergunta)');
  ok(r1.tAnexo && r1.tIa, 'compromisso do Financeiro também abre o documento original');
  ok(r1.apelido === 1, 'o sistema aprende a descrição do fornecedor para o item existente');
  ok(await page.evaluate(() => /Resumo do que foi lançado/.test(document.body.textContent) && /Últimos lançamentos por foto/.test(document.body.textContent)), 'resumo final e histórico na tela');

  /* ---------- 2. o mesmo arquivo de novo ---------- */
  await page.evaluate(() => LANC_IA_V65.novo());
  await foto('nota123');
  await fase('conferir');
  const c2 = await page.evaluate(() => ({ erros: LANC_IA_V65.alertas().erros, forn: LANC_IA_V65.estado().C.forn.escolha, l1: LANC_IA_V65.estado().C.linhas[1].alvo, como: LANC_IA_V65.estado().C.linhas[0].como }));
  ok(c2.erros.some((e) => /já foi lançad/i.test(e)), 'mesmo documento de novo: avisa que já foi lançado e não deixa lançar sem confirmação');
  ok(c2.forn !== 'novo' && c2.l1 !== 'novo', 'na segunda vez, fornecedor e item novo já são reconhecidos');
  ok(c2.como === 'aprendido', 'descrição aprendida liga o item direto');

  /* ---------- 3. boleto: só Financeiro, sem pergunta ---------- */
  await page.evaluate((r) => { LANC_IA_V65.novo(); window.__resposta = r; location.hash = '#/fIA'; }, BOLETO);
  await page.waitForSelector('#liaZona');
  ok(await page.evaluate(() => [...document.querySelectorAll('.dir-aba')].some((a) => /Lançamento Inteligente por Foto/.test(a.textContent))), 'aba "Lançamento Inteligente por Foto" no Financeiro');
  await foto('boleto9876');
  await fase('conferir');
  const c3 = await page.evaluate(() => { const C = LANC_IA_V65.estado().C; return { dest: C.destino, perg: C.pag.fonte, sit: C.pag.sit, cat: C.categoria, erros: LANC_IA_V65.alertas().erros }; });
  ok(c3.dest === 'fin' && c3.perg === 'documento' && c3.sit === 'pendente', 'boleto vai só para o Financeiro, em aberto, sem perguntar');
  ok(c3.cat === 'Fretes' || c3.cat === 'Outras despesas', `categoria sugerida das existentes (${c3.cat})`);
  ok(!c3.erros.length, 'conferência sem pendências' + (c3.erros.length ? ': ' + c3.erros.join(' | ') : ''));
  const nTit = await page.evaluate(() => DATA.fTitulos.length);
  await page.click('#liaOk'); await confirmarDialogo();
  await fase('pronto');
  const r3 = await page.evaluate(async (n) => { await new Promise((r) => setTimeout(r, 300)); const t = DATA.fTitulos.find((x) => x.ia && x.docOrigemTipo === 'Boleto'); return { n: DATA.fTitulos.length - n, valor: t && t.valor, venc: t && t.vencimento, linha: t && t.linhaDigitavel, anexo: !!(t && t.anexo && t.anexo.id), pg: t && t.pagamentos.length, ent: DATA.almEntradas.filter((e) => e.ia).length }; }, nTit);
  ok(r3.n === 1 && r3.valor === 350.75 && r3.venc === '2026-11-20', `compromisso do boleto: ${r3.valor} vence ${r3.venc}`);
  ok(!!r3.linha && r3.anexo && r3.pg === 0, 'linha digitável e boleto anexados; fica em aberto');
  ok(r3.ent === 1, 'boleto não mexe no estoque');

  /* ---------- 4. PDF digital ---------- */
  if (PDFJS) {
    await page.evaluate(({ r, pdf }) => { LANC_IA_V65.novo(); window.__resposta = r; window.__leituras = []; location.hash = '#/almIA';
      LANC_IA_V65.adicionar([new File([pdf], 'danfe.pdf', { type: 'application/pdf' })]); }, { r: { ...NOTA, documento: { ...NOTA.documento, numero: '555' } }, pdf: pdfMinimo(['DANFE NF-e 555', 'PARAFUSO SEXTAVADO 10MM 100 UN 0,50 50,00']) });
    await fase('conferir', 30000).catch(() => {});
    const c4 = await page.evaluate(() => ({ fase: LANC_IA_V65.estado().fase, erro: LANC_IA_V65.estado().erro, l: window.__leituras[0] || {} }));
    ok(c4.fase === 'conferir' && /TEXTO EXTRAÍDO DO PDF/.test(c4.l.prompt || '') && /PARAFUSO SEXTAVADO/.test(c4.l.prompt || '') && c4.l.imagens >= 1, `PDF aberto: texto e imagem da página seguem para a leitura${c4.erro ? ' (' + c4.erro + ')' : ''}`);
  } else console.log('  - PDF: pulado (defina PDFJS_DIR para testar)');

  const relevantes = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: join(RAIZ, "saida/tela-lancamento-foto.png"), fullPage: true });
  await ctx.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nLançamento por foto: tudo certo.');
process.exit(falhas ? 1 : 0);
