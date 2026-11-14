#!/usr/bin/env node
// Teste de ponta a ponta da V120 (relatórios dos setores e documento de cada lançamento): abre o programa REAL
// (saida/claude.html) num Chromium com o banco central simulado, lança registros fictícios pelas funções do
// próprio sistema e confere:
//   - todo módulo da janela padrão gera o documento (tela, PDF) a partir do registro GRAVADO, no padrão documental
//   - botão "Documento" na janela (Visualizar, Gerar PDF, Imprimir, Compartilhar); não aparece em lançamento novo
//   - campos sigilosos ficam fora para quem não pode vê-los
//   - "Lançamentos do setor" em todos os setores, com período, tipo, situação, responsável e pesquisa
//   - Almoxarifado, Paletes e Barro na tela padrão de relatórios, com os mesmos números de antes
//   - Financeiro: demonstrativo do compromisso e comprovante de cada pagamento; Fiscal: aba Relatórios;
//     Controladoria: documento do mês; ficha do funcionário: ficha cadastral
//   - emitir documento ou relatório não grava nada no banco; celular sem rolagem lateral
// Requer Playwright. Para conferir os PDFs: `npm i jspdf@2.5.1 jspdf-autotable@3.8.2` numa pasta e JB_LIBS apontando para ela.
// Uso: node scripts/construir.mjs && node scripts/testar-relatorios-documentos.mjs
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
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', fantasia: 'Empresa Exemplo', cnpj: '11.222.333/0001-81', endereco: 'Rodovia Exemplo, km 1', cidade: 'Cidade Exemplo/MA', telefone: '(99) 99999-0000' } }],
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
  page.on('dialog', (d) => d.dismiss());
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'], fiscal: () => ({ status: 503, corpo: { erro: { tipo: 'configuracao', mensagem: 'simulado' } } }) });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'Dono' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true, null, { timeout: 40000 });
  await page.waitForFunction(() => APP.carregado === true && !!(CFG.empresa && CFG.empresa.cnpj), null, { timeout: 20000 }).catch(() => {});
  const temPdf = await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable, null, { timeout: 15000 }).then(() => true).catch(() => false);
  if (!temPdf) console.log('  ! bibliotecas de PDF indisponíveis neste ambiente: conferências de PDF puladas (instale jspdf e jspdf-autotable ou defina JB_LIBS)');

  /* ---------- lançamentos de exemplo, gravados pelas funções do sistema ---------- */
  const semente = await page.evaluate(async () => {
    const h = hoje(), agora = new Date().toISOString(), u = 'u_DONO';
    const put = (c, r) => gravar(c, r);
    /* 1) cada módulo da janela padrão: um registro com os campos obrigatórios, pela gravação da janela (carimbos e histórico) */
    const PULA = new Set(['almEntradas', 'almSaidas', 'almPagamentos', 'almInventarios', 'almDevolucoes', 'vendas', 'compras', 'orcamentos']);
    const val = (f, st) => { const o = (() => { try { return opcoesCampo(f, st); } catch (e) { return []; } })();
      switch (f.t) { case 'sel': return o.length ? o[0][0] : ''; case 'lista': return o.length ? o[0][0] : 'Exemplo'; case 'data': return h; case 'mes': return h.slice(0, 7); case 'hora': return '08:30';
        case 'num': return 12; case 'moeda': return 187.5; case 'cpf': return '52998224725'; case 'cnpj': return '11222333000181'; case 'tel': return '(99) 98888-0000'; case 'email': return 'exemplo@exemplo.com';
        case 'area': return 'Observação de exemplo.'; case 'chk': return {}; default: return 'Exemplo'; } };
    const falhou = [];
    for (const mod of ['funcionarios', ...Object.keys(MODS).filter((k) => k !== 'funcionarios' && !PULA.has(k))]) {
      const M = MODS[mod]; if (!M || !M.fields || !M.fields.length || typeof M.padrao !== 'function') continue;
      try { const st = { ...M.padrao(), id: novoId() };
        M.fields.forEach((f) => { if (['calc', 'html', 'usuario', 'arq', 'linhas'].includes(f.t)) return; const sh = !f.sh || (() => { try { return f.sh(st); } catch (e) { return true; } })(); if (!sh) return;
          if (st[f.k] === undefined || st[f.k] === '' || st[f.k] === null) { st[f.k] = val(f, st); if (M.aoMudar) try { M.aoMudar(st, f.k); } catch (e) {} } });
        if (mod === 'funcionarios') Object.assign(st, { nome: 'Funcionário Exemplo', situacao: 'Ativo', admissao: '2024-02-10', cpf: '52998224725', salario: 2500 });
        await gravarRegistro(mod, st, null, true); } catch (e) { falhou.push(mod + ': ' + e.message); }
    }
    /* 2) operações com tela própria, no formato real */
    await put('produtos', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', criadoEm: agora, criadoPor: u });
    await put('produtos', { id: 'p_lenha', setor: 'lenha', nome: 'Lenha de eucalipto', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo', criadoEm: agora, criadoPor: u });
    await put('locais', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste', tipo: 'Caminhão', situacao: 'Ativo', criadoEm: agora, criadoPor: u });
    await put('fornecedores', { id: 'f_lenha', setor: 'lenha', nome: 'Fornecedor Lenha Exemplo', tipoPessoa: 'Física', situacao: 'Ativo', criadoEm: agora, criadoPor: u });
    await put('clientes', { id: 'c1', nome: 'Cliente Exemplo', tipoPessoa: 'Física', cidade: 'Cidade Exemplo', uf: 'MA', situacao: 'Ativo', criadoEm: agora, criadoPor: u });
    await put('vendas', { id: 'v1', numero: 101, setor: 'vendas', data: h, hora: '09:10', clienteId: 'c1', cliente: { nome: 'Cliente Exemplo' }, itens: [{ produtoId: 'x', nome: 'Tijolo 8 furos', qtd: 2, unidade: 'milheiro', preco: 550, total: 1100 }], subtotal: 1100, total: 1100, desconto: 0, frete: 0, outros: 0, status: 'Concluída', forma: 'PIX', condicao: 'À vista', pagamentos: [{ id: 'pv1', data: h, valor: 1100, forma: 'PIX', por: u, em: agora }], criadoEm: agora, criadoPor: u });
    await put('compras', { id: 'cp1', numero: 7, setor: 'lenha', tipoOp: 'compra', data: h, hora: '08:00', fornecedorId: 'f_lenha', fornecedor: { nome: 'Fornecedor Lenha Exemplo' }, itens: [{ produtoId: 'p_lenha', nome: 'Lenha de eucalipto', qtd: 20, unidade: 'm³', preco: 80, total: 1600 }], subtotal: 1600, total: 1600, desconto: 0, frete: 0, outros: 0, status: 'Concluída', forma: 'PIX', condicao: 'A prazo', vencimento: h, pagamentos: [], criadoEm: agora, criadoPor: u });
    await put('consumos', { id: 'cs1', setor: 'combustivel', produtoId: 'p_s10', localId: 'l_cam', quantidade: 50, unidade: 'L', data: h, hora: '10:00', custoTotal: 300, origem: 'Estoque', operador: 'Motorista Teste', criadoEm: agora, criadoPor: u });
    await put('fTitulos', { id: 'ft1', numero: 15, data: h, descricao: 'Conta de energia de outubro', categoria: 'Energia elétrica', setorOrigem: 'Geral (Financeiro)', beneficiarioTipo: 'Outro', beneficiario: 'Companhia de Energia', beneficiarioNome: 'Companhia de Energia', valor: 850, vencimento: h, formaPrevista: 'Boleto',
      pagamentos: [{ id: 'pg1', data: h, valor: 500, forma: 'PIX', contaId: '', quitacao: false, por: u, multa: 10, juros: 2.5 }], criadoEm: agora, criadoPor: u });
    await new Promise((r) => setTimeout(r, 400));
    return { falhou };
  });
  ok(semente.falhou.length === 0, `registros de exemplo lançados pela gravação do sistema (${semente.falhou.slice(0, 3).join('; ') || 'todos os módulos'})`);
  await page.evaluate(async () => { for (const [h, s] of [['#/setor-financeiro', 'financeiro'], ['#/frel', 'financeiro'], ['#/painel', 'dp']]) { marcarSetor(s); location.hash = h; await new Promise((r) => setTimeout(r, 900)); } });
  const fotoBanco = () => page.evaluate(() => JSON.stringify([...window.__srv.estado.docs.entries()].filter(([k]) => !/^(log|uso|diagnostico)\//.test(k)).map(([k, v]) => [k, v.versao])));
  const estadoAntes = await fotoBanco();

  /* ---------- 1. documento de cada lançamento, em todos os módulos da janela padrão ---------- */
  const todos = await page.evaluate(async (temPdf) => {
    const r = { n: 0, falhas: [], mods: 0 };
    for (const mod of Object.keys(MODS)) { const rec = (DATA[mod] || [])[0]; if (!rec) continue; r.mods++;
      try { const D = JB_DOCL.fazerDoc(mod, rec.id)(); if (!D) { r.falhas.push(mod + ': sem documento'); continue; }
        const h = htmlDoc(D);
        if (!h.includes('fvd-band') || !h.includes('fvd-rod') || !h.includes('EMPRESA EXEMPLO LTDA')) r.falhas.push(mod + ': fora do padrão');
        if (!['almEntradas', 'almSaidas'].includes(mod) && (!/Hist[oó]rico de altera/.test(h) || !h.includes(String(D.numero)))) r.falhas.push(mod + ': sem código ou histórico');
        if (temPdf) { const doc = pdfDoc(D); if (!doc || doc.internal.getNumberOfPages() < 1) r.falhas.push(mod + ': PDF'); }
        r.n++;
      } catch (e) { r.falhas.push(mod + ': ' + e.message); } }
    return r;
  }, temPdf);
  ok(todos.n === todos.mods && todos.n >= 60 && todos.falhas.length === 0, `${todos.n} de ${todos.mods} módulos geram o documento no padrão (tela${temPdf ? ' e PDF' : ''})${todos.falhas.length ? ' · ' + todos.falhas.slice(0, 4).join('; ') : ''}`);

  const vale = await page.evaluate(() => {
    const v = DATA.vales[0]; const D = JB_DOCL.docRegistro('vales', v.id); const h = document.createElement('div'); h.innerHTML = htmlDoc(D);
    const txt = h.textContent; const meta = [...h.querySelectorAll('.fvd-meta > span')].map((s) => s.querySelector('i').textContent + '=' + s.querySelector('b').textContent);
    return { tit: h.querySelector('.fvd-tit').textContent, sobre: h.querySelector('.fvd-setor').textContent, num: h.querySelector('.fvd-band-num').textContent, meta, valor: txt.includes(fMoeda(v.valor)),
      func: txt.includes('Funcionário Exemplo'), ass: [...h.querySelectorAll('.fvd-ass small')].map((s) => s.textContent), cod: JB_DOCL.codLanc('vales', v), lancado: /Lançado por\s*Dono/.test(txt) };
  });
  ok(vale.tit === 'COMPROVANTE DE VALE' && /DEPARTAMENTO PESSOAL\s+·\s+COMPROVANTE/.test(vale.sobre) && vale.num.includes(vale.cod) && /^VL-/.test(vale.cod), `vale: título, setor, família e código (${vale.cod}) no cabeçalho`);
  ok(vale.meta.some((m) => /^Data do lançamento=\d{2}\/\d{2}\/\d{4}/.test(m)) && vale.meta.some((m) => /^Registrado em=\d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}$/.test(m)) && vale.meta.some((m) => /^Situação=/.test(m)) && vale.lancado, 'data, data e hora do registro, situação e quem lançou');
  ok(vale.valor && vale.func && vale.ass.includes('Recebido por (funcionário)') && vale.ass.includes('Responsável pelo lançamento'), 'valor, funcionário e assinaturas do comprovante de vale');

  /* documento sai do registro gravado, nunca do que está digitado e não salvo */
  const fiel = await page.evaluate(async () => {
    const v = DATA.vales[0]; location.hash = '#/vales/' + v.id; await new Promise((r) => setTimeout(r, 700));
    const b = document.querySelector('#camada [data-v120-doc]'); const inp = document.querySelector('#camada [data-k="valor"]');
    if (inp) { inp.value = '9.999,99'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
    b.click(); await new Promise((r) => setTimeout(r, 250));
    const itens = [...document.querySelectorAll('.dc-pop button')].map((x) => x.textContent.trim());
    document.body.click(); await new Promise((r) => setTimeout(r, 100));
    const D = JB_DOCL.docRegistro('vales', v.id); const h = htmlDoc(D);
    const r = { botao: !!b, itens, gravado: h.includes(fMoeda(v.valor)) && !h.includes('9.999,99') };
    if (window.GAV) { GAV.sujo = false; } fecharGaveta(true); location.hash = '#/vales'; await new Promise((r) => setTimeout(r, 300));
    location.hash = '#/vales/novo'; await new Promise((r) => setTimeout(r, 600)); r.novo = !!document.querySelector('#camada [data-v120-doc]'); fecharGaveta(true); location.hash = '#/vales'; await new Promise((r) => setTimeout(r, 300));
    return r;
  });
  ok(fiel.botao && ['Visualizar', 'Gerar PDF', 'Imprimir', 'Compartilhar'].every((t) => fiel.itens.some((x) => x.startsWith(t))), `janela do lançamento: botão Documento com Visualizar, Gerar PDF, Imprimir e Compartilhar (${fiel.itens.length} itens)`);
  ok(fiel.gravado && !fiel.novo, 'o documento sai do registro gravado (valor digitado e não salvo fica fora) e lançamento novo não tem botão');

  /* sigilo: sem acesso aos dados sensíveis, CPF e salário não saem */
  const sigilo = await page.evaluate(() => { const f = DATA.funcionarios[0]; const c0 = APP.canEdit, m0 = APP.modo; let com = '', sem = '';
    try { com = htmlDoc(JB_DOCL.docRegistro('funcionarios', f.id)); APP.canEdit = false; if (APP.modo === 'local') APP.modo = 'central'; sem = htmlDoc(JB_DOCL.docRegistro('funcionarios', f.id)); } finally { APP.canEdit = c0; APP.modo = m0; }
    return { com: com.includes('529.982.247-25'), sem: sem.includes('529.982.247-25') || sem.includes('2.500,00') }; });
  ok(sigilo.com && !sigilo.sem, 'campos sigilosos (CPF, salário) só saem para quem pode vê-los, como na janela');

  /* ---------- 2. lançamentos do setor ---------- */
  const lanc = await page.evaluate(() => Object.fromEntries(['dp', 'producao', 'financeiro', 'vendas', 'lenha', 'combustivel', 'almox', 'paletes', 'barro'].map((s) => { const L = JB_DOCL.lancamentosSetor(s); return [s, { n: L.length, tipos: [...new Set(L.map((x) => x.tipo))], semDoc: L.filter((x) => !x._doc && !x._go).length, campos: L.every((x) => x.data && x.tipo && x.cod && x.sit), sem: L.filter((x) => !(x.data && x.tipo && x.cod && x.sit)).map((x) => [x.tipo, x.cod, x.data, x.sit].join('|')).slice(0, 4) }]; })));
  if (process.env.JB_DEPURAR) console.log(JSON.stringify(lanc));
  ok(Object.values(lanc).every((x) => x.n > 0 && x.campos && x.semDoc === 0), `todos os setores listam os próprios lançamentos com data, tipo, código e situação (${Object.entries(lanc).map(([s, x]) => s + ' ' + x.n).join(', ')})`);
  ok(lanc.vendas.tipos.includes('Venda') && lanc.vendas.tipos.includes('Recebimento') && lanc.lenha.tipos.some((t) => /Entrada de lenha/.test(t)) && lanc.combustivel.tipos.includes('Abastecimento') && lanc.financeiro.tipos.includes('Pagamento') && !lanc.dp.tipos.includes('Funcionário'),
    'cada setor só com os seus lançamentos (venda e recebimento, entrada de lenha, abastecimento, pagamento); cadastros ficam fora');

  const telaRel = await page.evaluate(async () => {
    const ir = async (h, s) => { if (s) marcarSetor(s); if (location.hash === h) renderTela(); else location.hash = h; await new Promise((r) => setTimeout(r, 700)); };
    const r = {};
    UIR.id = 'lanc'; UIR.ini = hoje().slice(0, 8) + '01'; UIR.fim = hoje(); await ir('#/relatorios', 'dp');
    const linhas = () => document.querySelectorAll('.relgrid tr[data-ri]').length;
    await new Promise((r) => setTimeout(r, 200));
    r.dp = { semSoma: !document.querySelector('.relgrid table tfoot'), ativo: (document.querySelector('.rel-itens a.on') || {}).textContent, linhas: linhas(), botoes: [...document.querySelectorAll('.filtros [data-x]')].map((b) => b.dataset.x), tipo: !!document.querySelector('.filtros select[data-r="extra"]'), busca: !!document.querySelector('[data-rbusca]'), sit: !!document.querySelector('select[data-r="_sit"]') };
    /* pesquisa: só as linhas com o texto */
    const v = DATA.vales[0]; const cod = JB_DOCL.codLanc('vales', v);
    const i = document.querySelector('[data-rbusca]'); i.value = cod; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 900));
    r.busca = { linhas: linhas(), foco: document.activeElement && document.activeElement.matches('[data-rbusca]'), pag: (document.querySelector('.relgrid .pag span') || {}).textContent, filtros: filtrosTxtRel(document.getElementById('conteudo'), RELS.find((x) => x.id === 'lanc'), UIR) };
    /* a linha abre o menu do lançamento */
    document.querySelector('.relgrid tr[data-ri]').click(); await new Promise((r) => setTimeout(r, 250));
    r.menu = [...document.querySelectorAll('.dc-pop button')].map((b) => b.firstChild.textContent.trim()); document.body.click();
    UIR._q = '';
    /* tipo e situação */
    UIR.extra = 'Vale'; await ir('#/relatorios', 'dp'); r.tipo = { linhas: linhas(), todosVale: [...document.querySelectorAll('.relgrid tr[data-ri] td[data-l="Tipo"]')].every((td) => td.textContent === 'Vale') };
    UIR.extra = ''; await ir('#/relatorios', 'dp'); const s0 = document.querySelector('select[data-r="_sit"]');
    if (s0) { const val = [...s0.options].map((o) => o.value).filter(Boolean)[0]; UIR._sit = val; await ir('#/relatorios', 'dp'); r.sit = { val, linhas: linhas(), todas: [...document.querySelectorAll('.relgrid tr[data-ri] td[data-l="Situação"]')].every((td) => td.textContent === val) }; UIR._sit = ''; }
    /* outro relatório, outro período: a lista dos outros relatórios continua igual */
    UIR.ini = '2020-01-01'; UIR.fim = '2020-12-31'; await ir('#/relatorios', 'dp'); r.periodoVazio = linhas() === 0;
    UIR.id = 'r1'; UIR.ini = hoje().slice(0, 8) + '01'; UIR.fim = hoje(); await ir('#/relatorios', 'dp'); r.r1 = { ativo: (document.querySelector('.rel-itens a.on') || {}).textContent, ultimo: [...document.querySelectorAll('.rel-itens a')].pop().textContent };
    /* cada setor: o relatório está na tela de relatórios dele */
    const nosSetores = [['#/prel', 'producao'], ['#/frel', 'financeiro'], ['#/relvendas', 'vendas'], ['#/relvendas', 'lenha'], ['#/relvendas', 'combustivel'], ['#/almRel', 'almox'], ['#/palRel', 'paletes'], ['#/barroRel', 'barro']];
    r.setores = {};
    for (const [h, s] of nosSetores) { await ir(h, s); const a = [...document.querySelectorAll('.rel-itens a')].find((x) => x.textContent === 'Lançamentos do setor'); if (a) { a.click(); await new Promise((r) => setTimeout(r, 600)); }
      r.setores[s] = { tem: !!a, linhas: linhas(), imp: !!document.querySelector('[data-x="imprimir"]'), comp: !!document.querySelector('[data-x="compartilhar"]') }; }
    /* Lenha: aba dos relatórios leva aos Lançamentos do setor */
    await ir('#/clRel', 'lenha'); const aba = document.querySelector('[data-rel-lanc]'); r.abaLenha = !!aba; if (aba) { aba.click(); await new Promise((r) => setTimeout(r, 900)); r.abaLenhaAbre = location.hash === '#/relvendas' && (document.querySelector('.rel-itens a.on') || {}).textContent === 'Lançamentos do setor'; }
    return r;
  });
  if (process.env.JB_DEPURAR) console.log(JSON.stringify(telaRel));
  ok(telaRel.dp.ativo === 'Lançamentos do setor' && telaRel.dp.linhas > 10 && ['ver', 'pdf', 'imprimir', 'compartilhar', 'xlsx', 'csv'].every((x) => telaRel.dp.botoes.includes(x)) && telaRel.dp.tipo && telaRel.dp.busca, `DP: Lançamentos do setor com período, tipo, pesquisa e Visualizar, PDF, Imprimir, Compartilhar, Excel e CSV (${telaRel.dp.linhas} linhas)`);
  ok(telaRel.dp.semSoma, 'valores de tipos diferentes não são somados (sem linha de total automática)');
  ok(telaRel.busca.linhas === 1 && telaRel.busca.foco && /^1 linha(\(s\))? de \d+$/.test(telaRel.busca.pag) && /Pesquisa: “VL-/.test(telaRel.busca.filtros), `pesquisa pelo código acha o lançamento, mantém o cursor e sai nos filtros do PDF (${telaRel.busca.pag})`);
  ok(['Abrir lançamento', 'Visualizar documento', 'Gerar PDF', 'Imprimir', 'Compartilhar'].every((t) => telaRel.menu.includes(t)), 'a linha abre o lançamento ou o documento (Visualizar, PDF, Imprimir, Compartilhar)');
  ok(telaRel.tipo.linhas >= 1 && telaRel.tipo.todosVale && telaRel.sit && telaRel.sit.linhas >= 1 && telaRel.sit.todas && telaRel.periodoVazio, `filtros de tipo, situação${telaRel.sit ? ' (' + telaRel.sit.val + ')' : ''} e período`);
  ok(telaRel.r1.ativo === 'Relação completa dos funcionários' && telaRel.r1.ultimo === 'Lançamentos do setor', 'os relatórios que já existiam continuam na mesma ordem; o novo entra no fim da lista');
  ok(Object.values(telaRel.setores).every((x) => x.tem && x.linhas > 0 && x.imp && x.comp), `Lançamentos do setor dentro dos Relatórios de cada setor (${Object.entries(telaRel.setores).map(([s, x]) => s + ' ' + (x.tem ? x.linhas : 'falta')).join(', ')})`);
  ok(telaRel.abaLenha && telaRel.abaLenhaAbre, 'Lenha: a aba "Lançamentos do setor" dos relatórios abre a consulta padrão');

  /* ---------- 3. Almoxarifado, Paletes e Barro: mesma tela de relatórios, mesmos números ---------- */
  const conv = await page.evaluate(async () => {
    const ir = async (h, s) => { if (s) marcarSetor(s); location.hash = h; await new Promise((r) => setTimeout(r, 650)); };
    const r = {};
    for (const [h, s] of [['#/almRel', 'almox'], ['#/palRel', 'paletes'], ['#/barroRel', 'barro']]) {
      await ir(h, s); const itens = [...document.querySelectorAll('.rel-itens a')]; const res = [];
      for (const a of itens) { a.click(); await new Promise((r) => setTimeout(r, 350)); const n = document.querySelectorAll('.relgrid tbody tr').length; res.push(a.textContent + '=' + n); }
      r[s] = { n: itens.length, res, vazioOk: !document.querySelector('.fi-filtros #arId,#prId,#rId') };
    }
    return r;
  });
  ok(conv.almox.n === 9 && conv.paletes.n === 5 && conv.barro.n >= 4 && conv.almox.vazioOk, `Almoxarifado (${conv.almox.n}), Paletes (${conv.paletes.n}) e Barro (${conv.barro.n}) na tela padrão de relatórios, com todos os relatórios de antes`);

  /* ---------- 4. Financeiro, Fiscal, Controladoria e ficha do funcionário ---------- */
  const fin = await page.evaluate(async () => {
    const X = FINANCEIRO_SETOR; const o = X.obrigacoes().find((x) => x.ref === 't:ft1');
    marcarSetor('financeiro'); location.hash = '#/setor-financeiro'; await new Promise((r) => setTimeout(r, 600));
    X.acoes.abrirObrig('t:ft1'); await new Promise((r) => setTimeout(r, 400));
    const b = document.querySelector('#camada [data-a="documento"]'); b.click(); await new Promise((r) => setTimeout(r, 250));
    const menu = [...document.querySelectorAll('.dc-pop button')].map((x) => x.textContent); document.body.click(); fecharGaveta();
    const Dp = JB_DOCL.docPagF('t:ft1', 'pg1'); const hp = htmlDoc(Dp); const Do = JB_DOCL.docObrigF('t:ft1'); const ho = htmlDoc(Do);
    return { botao: !!b, menu, pag: { tit: Dp.tipo, total: hp.includes(fMoeda(512.5)) && hp.includes(fMoeda(500)) && hp.includes('Companhia de Energia'), ass: /Recebedor/.test(hp) }, obr: { tit: Do.tipo, saldo: ho.includes(fMoeda(o.s.saldo)), previsto: ho.includes(fMoeda(850)), pags: /Pagamentos informados/.test(ho) } };
  });
  if (process.env.JB_DEPURAR) console.log(JSON.stringify(fin));
  ok(fin.botao && fin.menu.length === 2 && /Demonstrativo do compromisso/.test(fin.menu[0]) && /Comprovante do pagamento/.test(fin.menu[1]), 'Financeiro: botão Documento no compromisso com o demonstrativo e o comprovante de cada pagamento');
  ok(fin.pag.tit === 'COMPROVANTE DE PAGAMENTO' && fin.pag.total && fin.pag.ass && fin.obr.tit === 'DEMONSTRATIVO DE COMPROMISSO A PAGAR' && fin.obr.saldo && fin.obr.previsto && fin.obr.pags, 'comprovante (valor, multa e juros, total) e demonstrativo (previsto, pagamentos, saldo) com os valores do compromisso');

  const outros = await page.evaluate(async () => {
    const ir = async (h, s) => { if (s) marcarSetor(s); location.hash = h; await new Promise((r) => setTimeout(r, 700)); };
    const r = {};
    await ir('#/setor-fiscal', 'fiscal'); r.abaFiscal = !!document.querySelector('a[href="#/setor-fiscal/relatorios"]');
    await ir('#/setor-fiscal/relatorios', 'fiscal'); r.relFiscal = [...document.querySelectorAll('.rel-itens a')].map((a) => a.textContent);
    await ir('#/ctlLanc', 'control'); const bc = document.querySelector('[data-v120-doc]'); r.ctl = !!bc; const m = (document.querySelector('#ctlMes') || {}).value; const Dm = JB_DOCL.docMesCtl(m); r.ctlDoc = Dm && Dm.tipo;
    const f = DATA.funcionarios[0]; await ir('#/ficha/' + f.id, 'dp'); r.ficha = !!document.querySelector('.fx-topo [data-v120-doc]');
    /* imprimir pelo menu: abre o documento e chama a impressão uma vez */
    let n = 0; const p0 = window.print; window.print = () => { n++; };
    try { acaoDocumento(JB_DOCL.fazerDoc('vales', DATA.vales[0].id), 'imprimir'); await new Promise((r) => setTimeout(r, 1200)); } finally { window.print = p0; }
    r.imprimiu = n === 1 && location.hash === '#/documento';
    const b = document.getElementById('printDoc'); if (b) b.remove(); document.body.classList.remove('imprime-doc');
    return r;
  });
  ok(outros.abaFiscal && outros.relFiscal.length === 4, `Setor Fiscal: aba Relatórios (${outros.relFiscal.join(', ')})`);
  ok(outros.ctl && outros.ctlDoc === 'DEMONSTRATIVO DOS LANÇAMENTOS DO MÊS' && outros.ficha, 'Controladoria: documento do mês; ficha do funcionário: ficha cadastral');
  ok(outros.imprimiu, 'Imprimir: abre o documento e chama a impressão uma vez');

  /* ---------- 5. nada é gravado ao emitir ---------- */
  const estadoDepois = await fotoBanco();
  if (process.env.JB_DEPURAR && estadoAntes !== estadoDepois) { const a = new Map(JSON.parse(estadoAntes)), b = new Map(JSON.parse(estadoDepois)); console.log('mudou:', [...b].filter(([k, v]) => a.get(k) !== v).map(([k]) => k).join(', '), '| sumiu:', [...a.keys()].filter((k) => !b.has(k)).join(', ')); }
  ok(estadoAntes === estadoDepois, 'emitir documentos e relatórios não grava, não altera e não duplica nada no banco');

  /* ---------- 6. celular ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  const cel = await page.evaluate(async () => {
    UIR.id = 'lanc'; marcarSetor('dp'); location.hash = '#/relatorios'; await new Promise((r) => setTimeout(r, 800));
    const r = { rel: document.documentElement.scrollWidth <= window.innerWidth + 1 };
    const v = DATA.vales[0]; location.hash = '#/vales/' + v.id; await new Promise((r) => setTimeout(r, 800));
    const b = document.querySelector('#camada [data-v120-doc]'); const bb = b && b.getBoundingClientRect();
    r.botao = !!b && bb.width > 0 && bb.right <= window.innerWidth && bb.bottom <= window.innerHeight; r.gav = document.documentElement.scrollWidth <= window.innerWidth + 1;
    fecharGaveta(true); return r;
  });
  ok(cel.rel && cel.botao && cel.gav, 'celular: relatórios e janela sem rolagem para o lado, botão Documento visível');

  ok(erros.length === 0, `nenhum erro de JavaScript (${erros.slice(0, 3).join(' | ') || 'ok'})`);
} finally {
  await browser.close();
  http.close();
}
console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nRelatórios e documentos: todas as conferências passaram.');
process.exit(falhas ? 1 : 0);
