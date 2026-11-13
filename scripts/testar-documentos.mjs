#!/usr/bin/env node
// Teste de ponta a ponta dos DOCUMENTOS (identidade documental, V111): abre o programa REAL
// (saida/claude.html) num Chromium com o banco central simulado e confere, com as funções do
// próprio sistema, que todo documento sai no padrão corporativo e que os dados não mudam:
//   - Configurações › Identidade visual e documentos: prévia, rascunho, gravação central
//   - logo trocada num lugar só vale para a tela, o PDF, o Word e a ficha de férias
//   - cabeçalho (empresa, setor, título, número ou data), faixa de emissão e rodapé (página X de Y)
//   - setor identificado pela tela de origem; nome do setor personalizável
//   - todos os modelos de contrato, termo e comprovante; relatório longo, curto e vazio
//   - valores, totais e datas idênticos aos de origem; impressão A4 e tela de celular
// Requer Playwright. As bibliotecas de PDF vêm do npm local (jspdf, jspdf-autotable) se existirem,
// ou da internet; sem elas, as conferências de PDF são puladas com aviso.
// Uso: node scripts/construir.mjs && node scripts/testar-documentos.mjs
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

// dados de exemplo (fictícios): nunca use dados reais num ambiente compartilhado
const docs = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo Um', situacao: 'Ativo', departamento: 'Produção', setor: 'Queima', cargo: 'Forneiro', matricula: '0012', admissao: '2024-03-01', tipoContratacao: 'CLT' }],
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo Dois', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção', cargo: 'Operador', matricula: '0013', admissao: '2025-01-10', tipoContratacao: 'CLT' }],
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', fantasia: 'Empresa Exemplo', cnpj: '11.222.333/0001-81', endereco: 'Rodovia Exemplo, km 1', cidade: 'Cidade Exemplo/MA', telefone: '(99) 99999-0000', responsavel: 'Responsável Exemplo' } }],
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
    if (/jspdf(\.umd)?(\.min)?\.js/.test(u) && !/autotable/.test(u)) return LIB_PDF ? r.fulfill({ contentType: 'text/javascript', body: readFileSync(LIB_PDF) }) : r.continue().catch(() => r.abort());
    if (/autotable/.test(u)) return LIB_TAB ? r.fulfill({ contentType: 'text/javascript', body: readFileSync(LIB_TAB) }) : r.continue().catch(() => r.abort());
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
  await page.waitForFunction(() => APP.carregado === true && DATA.funcionarios.length === 2 && !!(CFG.empresa && CFG.empresa.cnpj), null, { timeout: 20000 }).catch(() => {});
  const temPdf = await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable, null, { timeout: 15000 }).then(() => true).catch(() => false);
  await page.evaluate((v) => { window.__temPdf = v; }, temPdf);
  if (!temPdf) console.log('  ! bibliotecas de PDF indisponíveis neste ambiente: conferências de PDF puladas (instale jspdf e jspdf-autotable ou defina JB_LIBS)');

  // utilitários dentro da página: lista de exemplo pelas funções do sistema e leitor dos textos do PDF
  await page.evaluate(() => {
    window.__lista = (n, titulo) => {
      const cols = [{ k: 'data', l: 'Data', t: 'data' }, { k: 'forn', l: 'Fornecedor' }, { k: 'q', l: 'Quantidade (m³)', t: 'num' }, { k: 'v', l: 'Valor', t: 'moeda' }];
      const rows = Array.from({ length: n }, (_, i) => ({ data: '2026-11-' + String(1 + i % 28).padStart(2, '0'), forn: 'Fornecedor Exemplo ' + (1 + i % 5), q: 12.5 + i, v: 1250 + i * 10.37 }));
      const tot = { q: rows.reduce((s, r) => s + r.q, 0), v: round2(rows.reduce((s, r) => s + r.v, 0)) };
      const corpo = rows.map((r) => [fData(r.data), r.forn, fNum(r.q, 2), fMoeda(r.v)]);
      if (n) corpo.push(['Total', '', fNum(tot.q, 2), fMoeda(tot.v)]);
      return { D: docLista(titulo || 'Contas a pagar', cols, cols.map((c) => c.l), corpo, 'Lista', { filtros: 'Período: 01/11/2026 a 30/11/2026' }), totalValor: fMoeda(tot.v), primeira: n ? fMoeda(rows[0].v) : '' };
    };
    // textos e imagens desenhados no PDF (o PDF em si é montado pela função real do sistema)
    window.__pdf = (D) => {
      const J = window.jspdf.jsPDF, textos = [], imagens = [];
      const F = function (o) { const d = new J(o), t0 = d.text, i0 = d.addImage; d.text = function (t) { textos.push(Array.isArray(t) ? t.join(' ') : String(t)); return t0.apply(d, arguments); }; d.addImage = function (s) { imagens.push(String(s).slice(0, 60)); return i0.apply(d, arguments); }; return d; };
      F.API = J.API; window.jspdf.jsPDF = F;
      try { const doc = pdfDoc(D); return { paginas: doc.internal.getNumberOfPages(), textos, imagens, bytes: doc.output('arraybuffer').byteLength }; } finally { window.jspdf.jsPDF = J; }
    };
  });

  /* ---------- 1. Configurações › Identidade visual e documentos ---------- */
  await page.evaluate(() => { location.hash = '#/config/identidade'; });
  await page.waitForSelector('#secIdDocs #iddPrev .fvd-band');
  const cfg = await page.evaluate(() => ({ hash: location.hash, campos: ['idDocs.logoTam', 'idDocs.logoPos', 'idDocs.cabCnpj', 'idDocs.mostrarSetor', 'idDocs.rodInstitucional', 'marcaDocumentos', 'idDocs.setores.dp'].filter((c) => !document.querySelector(`#secIdDocs [data-c="${c}"]`)), slots: document.querySelectorAll('#secIdDocs [data-img]').length, previa: document.querySelector('#iddPrev').textContent }));
  ok(cfg.campos.length === 0 && cfg.slots === 2, `seção com logo, tamanho, posição, identificação, cabeçalho e rodapé (faltando: ${cfg.campos.join(', ') || 'nada'})`);
  ok(/EMPRESA EXEMPLO LTDA/.test(cfg.previa) && /11\.222\.333\/0001-81/.test(cfg.previa) && /Departamento Pessoal/.test(cfg.previa), 'prévia mostra a empresa, o CNPJ cadastrado e o setor');
  await page.selectOption('[data-c="idDocs.logoTam"]', 'G');
  await page.selectOption('[data-c="idDocs.logoPos"]', 'dir');
  await page.evaluate(() => { document.querySelector('#secIdDocs details').open = true; });
  await page.fill('[data-c="idDocs.setores.vendas"]', 'Departamento Comercial');
  await page.waitForFunction(() => !!document.querySelector('#iddPrev .fvd-band.lg-G.logo-dir'), null, { timeout: 5000 }).catch(() => {});
  const rasc = await page.evaluate(() => ({ previa: !!document.querySelector('#iddPrev .fvd-band.lg-G.logo-dir'), cfgIntacta: !(CFG.idDocs && CFG.idDocs.logoTam), salvar: !document.getElementById('cSalvar').disabled }));
  ok(rasc.previa && rasc.cfgIntacta && rasc.salvar, 'a prévia acompanha o rascunho e nada vale antes de salvar');
  await page.click('#cSalvar');
  await page.waitForFunction(() => CFG.idDocs && CFG.idDocs.logoTam === 'G' && window.__srv.estado.docs.get('config/empresa').dados.idDocs, null, { timeout: 10000 }).catch(() => {});
  const salvo = await page.evaluate(() => { const d = window.__srv.estado.docs.get('config/empresa').dados; return { id: d.idDocs, emp: d.empresa && d.empresa.cnpj }; });
  ok(salvo.id && salvo.id.logoTam === 'G' && salvo.id.logoPos === 'dir' && salvo.id.setores.vendas === 'Departamento Comercial' && salvo.emp === '11.222.333/0001-81', 'configuração gravada no banco central, sem perder os dados da empresa');

  /* ---------- 2. logo: um lugar só ---------- */
  const logo = await page.evaluate(async () => {
    const antes = logoDocSrc();
    const c = document.createElement('canvas'); c.width = 40; c.height = 40; const x = c.getContext('2d'); x.fillStyle = '#0a7'; x.fillRect(0, 0, 40, 40); const nova = c.toDataURL('image/png');
    await salvarCfg({ ...CFG, marcaImg: { menu: { src: nova, w: 40, h: 40, nome: 'teste.png' } } });
    await new Promise((r) => { const t = setInterval(() => { if (CFG.marcaImg && CFG.marcaImg.menu && CFG.marcaImg.menu.src === nova) { clearInterval(t); r(); } }, 50); setTimeout(() => { clearInterval(t); r(); }, 8000); });
    const L = window.__lista(3).D;
    const o = { mudou: logoDocSrc() === nova && antes !== nova, tela: htmlDoc(L).includes(nova), ferias: htmlFichaFerias(dadosFichaFerias('f1')).includes(nova), word: true };
    if (window.__temPdf) o.pdf = window.__pdf(window.__lista(3).D).imagens.some((s) => nova.startsWith(s));
    return o;
  });
  ok(logo.mudou && logo.tela && logo.ferias && (logo.pdf === undefined || logo.pdf), 'logo trocada nas Configurações vale na tela, no PDF e na ficha de férias, sem mexer em cada setor');

  /* ---------- 3. cabeçalho, faixa de emissão e rodapé; setor pela tela de origem ---------- */
  const setores = await page.evaluate(async () => {
    const ir = async (h) => { location.hash = h; await new Promise((r) => setTimeout(r, 250)); };
    const o = {};
    await ir('#/painel'); o.dp = carimboDoc(baseRel('RELATÓRIO DE TESTE', '', [])).setor;
    marcarSetor('vendas'); await ir('#/setor-vendas'); o.vendas = carimboDoc(baseRel('RECIBO DE PAGAMENTO', 'Recibo nº 000001', [])).setor;
    marcarSetor('lenha'); await ir('#/setor-lenha'); o.lenha = carimboDoc(baseRel('RELATÓRIO DE TESTE', '', [])).setor;
    o.explicito = carimboDoc(Object.assign(baseRel('RELATÓRIO DE TESTE', '', []), { setor: 'Setor Informado' })).setor;
    marcarSetor('dp'); await ir('#/painel');
    return o;
  });
  ok(setores.dp === 'Departamento Pessoal' && setores.vendas === 'Departamento Comercial' && setores.lenha === 'Setor da Lenha' && setores.explicito === 'Setor Informado', `setor identificado pela tela de origem, com o nome personalizado (${JSON.stringify(setores)})`);

  const lista = await page.evaluate(() => {
    const { D, totalValor, primeira } = window.__lista(8); const h = document.createElement('div'); h.innerHTML = htmlDoc(D); const q = (s) => h.querySelector(s);
    const meta = [...h.querySelectorAll('.fvd-meta span')].map((s) => s.querySelector('i').textContent + '=' + s.querySelector('b').textContent);
    return { titulo: q('.fvd-tit').textContent, sobre: q('.fvd-setor').textContent, emp: q('.fvd-emp').textContent, linha: q('.fvd-id').textContent, logo: !!q('.fvd-band .fvd-logo'), ident: q('.fvd-band-num').textContent, meta,
      ind: [...h.querySelectorAll('.fvd-ind b')].map((b) => b.textContent), tot: [...h.querySelectorAll('.fvd-tb tr.tot td')].map((t) => t.textContent), linhas: h.querySelectorAll('.fvd-tb tbody tr:not(.tot)').length, primeira: h.querySelector('.fvd-tb tbody tr td.d:last-child').textContent,
      rod: q('.fvd-rod').textContent, dir: [...h.querySelectorAll('.fvd-tb th')].map((t) => t.className), totalValor, primeiraEsperada: primeira, nota: q('.fvd-nota').textContent };
  });
  ok(lista.titulo === 'RELATÓRIO DE CONTAS A PAGAR' && /DEPARTAMENTO PESSOAL\s+·\s+RELATÓRIO/.test(lista.sobre) && lista.emp === 'EMPRESA EXEMPLO LTDA' && lista.logo && /CNPJ 11\.222\.333\/0001-81/.test(lista.linha), 'cabeçalho: logo, empresa, CNPJ cadastrado, setor e título formal');
  ok(lista.meta.some((m) => /^Setor responsável=Departamento Pessoal$/.test(m)) && lista.meta.some((m) => /^Emissão=\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/.test(m)) && lista.meta.some((m) => m === 'Responsável pela emissão=Dono') && /EMITIDO EM\d{2}\/\d{2}\/\d{4}/.test(lista.ident), 'faixa de identificação: setor, data e horário de emissão e responsável');
  if (process.env.JB_DEPURAR) console.log(JSON.stringify(lista));
  ok(lista.linhas === 8 && lista.tot[0] === 'Total' && lista.tot[3] === lista.totalValor && lista.primeira === lista.primeiraEsperada && /^R\$\s\d{1,3}(\.\d{3})*,\d{2}$/.test(lista.totalValor) && lista.ind.includes(lista.totalValor) && lista.ind[0] === '8', `tabela: todas as linhas, total idêntico ao de origem (${lista.totalValor}) e indicadores sem recálculo`);
  ok(lista.dir[2] === 'd' && lista.dir[3] === 'd' && lista.dir[0] === '', 'valores e quantidades alinhados à direita');
  ok(/EMPRESA EXEMPLO LTDA/.test(lista.rod) && /Departamento Pessoal/.test(lista.rod) && /Emitido em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/.test(lista.rod) && /Rodovia Exemplo, km 1/.test(lista.rod) && /\(99\) 99999-0000/.test(lista.rod), 'rodapé: empresa, setor, documento, emissão e dados institucionais cadastrados');
  ok(/conforme os filtros aplicados na consulta/.test(lista.nota), 'texto de emissão em linguagem formal');

  // nada inventado: sem CNPJ, endereço e telefone cadastrados, o documento não mostra esses dados
  const semDados = await page.evaluate(() => { ID_PREVIA = { ...CFG, empresa: { razao: 'Empresa Sem Cadastro LTDA' } }; try { const h = htmlDoc(baseRel('RELATÓRIO DE TESTE', '', [])); return { cnpj: /CNPJ/.test(h), tel: /Tel\./.test(h), nome: /EMPRESA SEM CADASTRO LTDA/.test(h) }; } finally { ID_PREVIA = null; } });
  ok(semDados.nome && !semDados.cnpj && !semDados.tel, 'sem CNPJ, endereço e telefone cadastrados, nada é inventado no documento');

  /* ---------- 4. todos os modelos de contrato, termo, declaração e comprovante ---------- */
  const modelos = await page.evaluate(() => {
    const r = { total: MODELOS.filter((m) => !m.link).length, falhas: [], classes: {} };
    /* dois itens da lista só apontam para a tela de medidas disciplinares (link): não são modelos de texto */
    MODELOS.filter((m) => !m.link).forEach((m) => { try {
      const D = montarDoc(m, { nome: 'Pessoa Exemplo', data_doc: hoje() }, { numero: 'T-0001/2026', status: 'Rascunho' }); const c = carimboDoc(D); r.classes[c.classe] = (r.classes[c.classe] || 0) + 1;
      const h = htmlDoc(D), w = wordDoc(D);
      if (!h.includes('fvd-band') || !h.includes('fvd-setor') || !h.includes('fvd-rod-l') || !/Emissão/.test(h) || !h.includes('T-0001/2026')) r.falhas.push(m.titulo + ' (tela)');
      if (!w.includes('EMPRESA EXEMPLO LTDA') || !/Emitido em/.test(w) || !w.includes(c.setor)) r.falhas.push(m.titulo + ' (Word)');
      if (window.__temPdf) { const p = window.__pdf(D); if (p.paginas < 1 || !p.textos.some((t) => /Página 1 de \d+/.test(t)) || !p.textos.some((t) => t.includes('EMPRESA EXEMPLO LTDA')) || !p.imagens.length) r.falhas.push(m.titulo + ' (PDF)'); }
      /* o conteúdo do modelo não muda: todas as cláusulas continuam no documento */
      if ((m.clausulas || []).length !== D.blocos.filter((b) => b.tipo === 'clausula').length) r.falhas.push(m.titulo + ' (cláusulas)');
    } catch (e) { r.falhas.push(m.titulo + ': ' + e.message); } });
    return r;
  });
  if (process.env.JB_DEPURAR) console.log(JSON.stringify(modelos).slice(0, 1500));
  ok(modelos.total > 0 && modelos.falhas.length === 0, `${modelos.total} modelos de documento no padrão, com todas as cláusulas (${JSON.stringify(modelos.classes)})${modelos.falhas.length ? ' · falhas: ' + modelos.falhas.slice(0, 5).join('; ') : ''}`);

  /* ---------- 5. famílias de documento: cada uma com a estrutura da sua finalidade ---------- */
  const fam = await page.evaluate(() => Object.fromEntries([['RELATÓRIO DE CONTRATOS', 'relatorio'], ['RECIBO DE PAGAMENTO', 'comprovante'], ['COMPROVANTE DE ENTREGA', 'comprovante'], ['FECHAMENTO DA FOLHA', 'demonstrativo'], ['EXTRATO DO FUNCIONÁRIO', 'demonstrativo'], ['FICHA DA QUINZENA', 'ficha'], ['RELATÓRIO DE PEDIDOS', 'relatorio'], ['ADVERTÊNCIA', 'formal'], ['CONTRATO DE TRABALHO', 'formal']].map(([t, e]) => [t, classeDoc(baseRel(t, '', [])) === e])));
  ok(Object.values(fam).every(Boolean), `relatório, ficha, comprovante, demonstrativo e documento formal reconhecidos (${Object.entries(fam).filter(([, v]) => !v).map(([k]) => k).join(', ') || 'todos'})`);

  /* ---------- 6. PDF: documento longo, curto e vazio ---------- */
  if (temPdf) {
    const pdf = await page.evaluate(() => {
      const longo = window.__lista(260), L = window.__pdf(longo.D), C = window.__pdf(window.__lista(2).D), V = window.__pdf(window.__lista(0).D);
      const rec = baseRel('RECIBO DE PAGAMENTO', 'Recibo nº 000123', []); rec.numero = '000123'; rec.quadros = [{ rot: 'QUEM PAGA', campos: [['Nome', 'Cliente Exemplo LTDA', 1]] }];
      rec.blocos.push({ tipo: 'tabela', head: ['Descrição', 'Valor'], body: [['Tijolo 8 furos · 10 milheiros', fMoeda(7800)]], foot: ['Total recebido', fMoeda(7800)], dir: [1] });
      rec.local = 'Cidade Exemplo/MA, ' + dataExtenso(hoje()) + '.'; rec.assinaturas = [{ nome: 'Empresa Exemplo LTDA', sub: 'Recebedor' }, { nome: 'Cliente Exemplo LTDA', sub: 'Pagador' }];
      const R = window.__pdf(rec);
      return { longoPag: L.paginas, ultimaPag: L.textos.filter((t) => new RegExp('Página ' + L.paginas + ' de ' + L.paginas).test(t)).length, cabecas: L.textos.filter((t) => t === 'Fornecedor').length, total: L.textos.includes(longo.totalValor.replace(/\u00a0/g, ' ')), m3: L.textos.some((t) => /Quantidade \(m3\)/.test(t)),
        curtoPag: C.paginas, vazioPag: V.paginas, vazioTxt: V.textos.some((t) => /Nenhum registro localizado/.test(t)),
        rec: { pag: R.paginas, num: R.textos.includes('000123') && R.textos.includes('DOCUMENTO Nº'), pagador: R.textos.includes('PAGADOR'), ass: R.textos.includes('Cliente Exemplo LTDA') && R.textos.includes('Pagador'), valor: R.textos.filter((t) => t === fMoeda(7800).replace(/\u00a0/g, ' ')).length >= 2, setor: R.textos.some((t) => /DEPARTAMENTO PESSOAL\s+·\s+COMPROVANTE/.test(t)) } };
    });
    if (process.env.JB_DEPURAR) console.log(JSON.stringify(pdf));
    ok(pdf.longoPag >= 5 && pdf.ultimaPag === 1 && pdf.cabecas === pdf.longoPag && pdf.total, `relatório longo: ${pdf.longoPag} páginas numeradas, cabeçalho da tabela repetido em todas e total preservado`);
    ok(pdf.curtoPag === 1 && pdf.vazioPag === 1 && pdf.vazioTxt && pdf.m3, 'relatório curto e vazio em uma página; unidade m³ legível no PDF');
    ok(pdf.rec.pag === 1 && pdf.rec.num && pdf.rec.pagador && pdf.rec.ass && pdf.rec.valor && pdf.rec.setor, 'recibo: número, partes, valores, assinaturas e identificação do setor');
  }

  /* ---------- 7. impressão A4 e tela de celular ---------- */
  const imp = await page.evaluate(() => {
    const D = window.__lista(70).D; const src = document.createElement('div'); src.id = 'fvdDoc'; src.className = 'fvd'; const tmp = document.createElement('div'); tmp.innerHTML = htmlDoc(D); const art = tmp.firstElementChild; document.body.appendChild(art);
    const f = window.print; let chamou = false; window.print = () => { chamou = true; };
    try { imprimirDoc(); } finally { window.print = f; }
    const box = document.getElementById('printDoc'); const r = { chamou, folha: !!box && box.classList.contains('folha'), soFolha: document.body.classList.contains('imprime-doc') }; art.remove(); return r;
  });
  ok(imp.chamou && imp.folha && imp.soFolha, 'impressão: sai só a folha do documento, na página A4 numerada');
  await page.evaluate(() => { const b = document.getElementById('printDoc'); if (b) b.remove(); document.body.classList.remove('imprime-doc'); const D = window.__lista(70).D; const box = document.createElement('div'); box.id = 'printDoc'; box.className = 'folha'; box.innerHTML = htmlDoc(D).replace(' id="fvdDoc"', ''); document.body.appendChild(box); document.body.classList.add('imprime-doc'); });
  await page.emulateMedia({ media: 'print' });
  const folha = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  const nPag = (folha.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const papel = await page.evaluate(() => { const g = (s) => getComputedStyle(document.querySelector('#printDoc ' + s)); return { thead: g('.fvd-tb thead').display, linha: g('.fvd-tb tbody tr').breakInside, rod: g('.fvd-rod').breakInside, app: getComputedStyle(document.getElementById('app')).display }; });
  ok(nPag >= 2 && nPag <= 4 && papel.thead === 'table-header-group' && papel.linha === 'avoid' && papel.rod === 'avoid' && papel.app === 'none', `impressão pelo navegador: ${nPag} páginas A4, cabeçalho da tabela repetido, linhas e rodapé sem corte, sem a interface do sistema`);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { document.getElementById('printDoc').remove(); document.body.classList.remove('imprime-doc'); });

  await page.setViewportSize({ width: 390, height: 800 });
  const cel = await page.evaluate(() => { const b = document.createElement('div'); b.style.cssText = 'position:absolute;left:0;top:0;width:390px;background:#fff;z-index:99999'; b.innerHTML = '<div class="fvd-fundo">' + htmlDoc(window.__lista(4).D).replace(' id="fvdDoc"', '') + '</div>'; document.body.appendChild(b); const a = b.querySelector('.fvd'); const r = { larg: a.getBoundingClientRect().width, faixa: a.querySelector('.fvd-band').scrollWidth <= 391, meta: a.querySelector('.fvd-meta').scrollWidth <= 391, ind: getComputedStyle(a.querySelector('.fvd-ind')).gridTemplateColumns.split(' ').length }; b.remove(); return r; });
  ok(cel.larg <= 390 && cel.faixa && cel.meta && cel.ind === 2, 'celular: cabeçalho, faixa de emissão e indicadores cabem na tela');

  ok(erros.length === 0, `nenhum erro de JavaScript (${erros.slice(0, 3).join(' | ') || 'ok'})`);
} finally {
  await browser.close();
  http.close();
}
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nDocumentos: todas as conferências passaram.');
process.exit(falhas ? 1 : 0);
