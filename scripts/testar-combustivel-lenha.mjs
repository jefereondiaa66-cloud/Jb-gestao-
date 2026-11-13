#!/usr/bin/env node
// Teste de ponta a ponta dos setores de Combustível e Lenha (V57), no navegador,
// com o programa REAL (saida/claude.html) e o banco central simulado
// (scripts/lib/servidor-falso.mjs). Os dados são de teste e só existem no banco
// simulado, em memória. Cada passo confere a tela, o cálculo e o que chegou ao banco.
//
// Uso: node scripts/construir.mjs && node scripts/testar-combustivel-lenha.mjs
// Leitura de foto (OCR): a biblioteca Tesseract.js é baixada do jsDelivr pelo programa.
// Para testar sem internet, aponte OCR_DIR para uma pasta com os pacotes do npm
// desempacotados (tesseract.js-5.1.1, tesseract.js-core-5.1.1, tesseract.js-data-por-1.0.0,
// cada um com a sua pasta package/). Sem a pasta e sem internet, o teste de OCR é
// marcado como NÃO EXECUTADO (nunca como aprovado). OCR_REDE=1 baixa do jsDelivr (com internet).
// FOTOS=<pasta> guarda capturas das telas novas (computador e celular).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const OCR_DIR = process.env.OCR_DIR || '';
const OCR_REDE = process.env.OCR_REDE === '1';   // 1: baixa a biblioteca de OCR do jsDelivr de verdade (GitHub Actions)

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

/* arquivos do OCR: da pasta local (sem internet) ou bloqueados */
function arquivoOCR(url) {
  if (!OCR_DIR) return null;
  const m = [
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@5\.1\.1\/(.+)$/, 'tesseract.js-5.1.1/package/'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js-core@5\.1\.1\/(.+)$/, 'tesseract.js-core-5.1.1/package/'],
    [/^https:\/\/cdn\.jsdelivr\.net\/npm\/@tesseract\.js-data\/por@1\.0\.0\/(.+)$/, 'tesseract.js-data-por-1.0.0/package/'],
  ];
  for (const [re, pasta] of m) { const x = re.exec(url); if (x) { const p = join(OCR_DIR, pasta, x[1]); return existsSync(p) ? p : null; } }
  return null;
}

const browser = await chromium.launch();
const resultados = [];
let falhas = 0;
const ok = (c, m) => { resultados.push([c ? 'ok' : 'FALHOU', m]); console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const naoExec = (m) => { resultados.push(['não executado', m]); console.log(`  – NÃO EXECUTADO: ${m}`); };
try {
  const ctx = await browser.newContext();
  let ocrServido = 0;
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const url = r.request().url(); const f = arquivoOCR(url);
    if (!f && OCR_REDE && /^https:\/\/cdn\.jsdelivr\.net\/npm\/(tesseract\.js|tesseract\.js-core|@tesseract\.js-data)@/.test(url)) { ocrServido++; return r.continue(); }
    if (!f) return r.abort();
    ocrServido++;
    const ct = f.endsWith('.js') ? 'text/javascript' : f.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    return r.fulfill({ status: 200, body: readFileSync(f), headers: { 'content-type': ct, 'access-control-allow-origin': '*' } });
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

  /* utilidades dentro da página */
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f); },
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
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length; location.hash = '#/compra/nova';
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click(); await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
    };
  });

  console.log('Combustível');
  /* 1. entrada de combustível (compra) → estoque → contas a pagar / Financeiro */
  const c1 = await page.evaluate(async () => { const c = await T.comprar('combustivel', 'f_posto', 'p_s10', 1000, 5.5); await T.sincronizado();
    const ob = window.FINANCEIRO_SETOR ? window.FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === 'c:' + c.id) : null;
    return { saldo: saldoP('p_s10'), banco: T.banco('compras').some((x) => x.id === c.id), fin: ob ? ob.s.saldo : null, total: c.total }; });
  ok(c1.saldo === 1000, `entrada de 1.000 L pela compra entrou no estoque (saldo ${c1.saldo} L)`);
  ok(c1.banco, 'a compra chegou ao banco central');
  ok(c1.fin === 5500, `a compra aparece em contas a pagar no Financeiro (${c1.fin})`);

  /* 2. abastecimento manual pela tela */
  const ab = await page.evaluate(async () => { await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', localId: 'l_cam', quantidade: 120, medidor: 1500 }); await T.salvarGaveta();
    await T.esperar(() => DATA.consumos.length === 1); await T.sincronizado(); const c = DATA.consumos[0];
    return { saldo: saldoP('p_s10'), banco: T.banco('consumos').length, oper: c.operador, mov: CL57.movsSetor('combustivel').some((m) => m.uid === 'u:' + c.id && m.qtd === -120), id: c.id }; });
  ok(ab.saldo === 880, `abastecimento manual de 120 L baixou o estoque (saldo ${ab.saldo} L)`);
  ok(ab.banco === 1, 'o abastecimento chegou ao banco central');
  ok(ab.oper === 'Motorista Teste', 'escolher o caminhão preencheu o motorista do cadastro');
  ok(ab.mov, 'o abastecimento aparece nas movimentações centralizadas com código único');

  /* 3. repetir a mesma gravação (falha de comunicação + reenvio) não duplica */
  const rep = await page.evaluate(async (id) => { const c = DATA.consumos.find((x) => x.id === id); window.__srv.estado.falhas.depois = 1;
    await gravar('consumos', c, c); await T.dorme(1500); await gravar('consumos', c, c); await T.sincronizado();
    return { n: DATA.consumos.length, saldo: saldoP('p_s10'), banco: T.banco('consumos').length }; }, ab.id);
  ok(rep.n === 1 && rep.banco === 1 && rep.saldo === 880, `resposta perdida e reenvio: continua 1 abastecimento e saldo ${rep.saldo} L`);

  /* 4. saldo negativo: sem permissão não passa; com permissão exige motivo e fica registrado */
  const neg = await page.evaluate(async () => {
    const st = { ...MODS.consumos.padrao(), id: 'x', produtoId: 'p_s10', localId: 'l_trat', quantidade: 900 };
    APP.papel = 'estoquista'; const semPerm = conferirRegistro('consumos', st).erros.quantidade || ''; APP.papel = 'admin';
    const semMotivo = conferirRegistro('consumos', st).erros.motivoNegativo || '';
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', localId: 'l_trat', quantidade: 900, motivoNegativo: 'Carga de teste chegou e a nota ainda não foi lançada' });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.length === 2); await T.sincronizado();
    const c = DATA.consumos.find((x) => x.localId === 'l_trat');
    return { semPerm, semMotivo, aut: c.negativoAutorizado, saldo: saldoP('p_s10'), log: DATA.log.some((l) => l.recId === c.id && /saldo negativo/.test(l.acao)) }; });
  ok(/exige autorização/.test(neg.semPerm), 'estoquista não lança com saldo negativo');
  ok(/motivo/.test(neg.semMotivo), 'gerente/administrador precisa informar o motivo');
  ok(!!neg.aut && neg.aut.saldoDepois === -20 && neg.saldo === -20, `saldo negativo autorizado e registrado no lançamento (saldo ${neg.saldo} L)`);
  ok(neg.log, 'a autorização do saldo negativo está no histórico de alterações');

  /* 5. entrada sem nota, saída e transferência */
  const mv = await page.evaluate(async () => {
    await T.abrirNovo('estoqueMov', 'combustivel', { tipo: 'Entrada', produtoId: 'p_s10', quantidade: 500, motivo: 'Estoque inicial de teste' }); await T.salvarGaveta();
    await T.esperar(() => saldoP('p_s10') === 480);
    await T.abrirNovo('estoqueMov', 'combustivel', { tipo: 'Saída', produtoId: 'p_s10', quantidade: 50, destino: 'Galão da roçadeira', responsavel: 'Encarregado Teste', motivo: 'Roçada do pátio' }); await T.salvarGaveta();
    await T.esperar(() => saldoP('p_s10') === 430);
    await T.abrirNovo('estoqueMov', 'combustivel', { tipo: 'Transferência', produtoId: 'p_s10', produtoDestinoId: 'p_s500', quantidade: 30, motivo: 'Troca de tanque' }); await T.salvarGaveta();
    await T.esperar(() => saldoP('p_s500') === 30); await T.sincronizado();
    const sai = DATA.estoqueMov.find((m) => m.tipo === 'Saída');
    return { s10: saldoP('p_s10'), s500: saldoP('p_s500'), destino: sai && sai.destino, banco: T.banco('estoqueMov').length }; });
  ok(mv.s10 === 400 && mv.s500 === 30, `entrada +500, saída −50 e transferência 30 L: S10 ${mv.s10} L, S500 ${mv.s500} L`);
  ok(mv.destino === 'Galão da roçadeira', 'a saída guarda o destino e o responsável');
  ok(mv.banco === 3, 'as três movimentações chegaram ao banco central');

  /* 6. programação: não mexe no estoque; realizar lança uma vez; recorrente gera a próxima; cancelar */
  const pg = await page.evaluate(async () => {
    const antes = saldoP('p_s10');
    const p = await gravarRegistro('clProg', { ...MODS.clProg.padrao(), id: novoId(), setor: 'combustivel', descricao: 'Abastecer caminhão (teste)', localId: 'l_cam', produtoId: 'p_s10', quantidade: 100, data: hoje(), periodicidade: 'Semanal' }, null, true);
    await T.esperar(() => DATA.clProg.some((x) => x.id === p.id));
    const depoisProg = saldoP('p_s10');
    CL57.realizarProg(p.id); await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); await T.salvarGaveta();
    await T.esperar(() => (DATA.clProg.find((x) => x.id === p.id) || {}).situacao === 'Realizado' && DATA.clProg.some((x) => x.id === p.id + 'n'));
    const prox = DATA.clProg.find((x) => x.id === p.id + 'n');
    const cons = DATA.consumos.find((c) => c.progId === p.id);
    const deNovo = conferirRegistro('consumos', { ...MODS.consumos.padrao(), id: 'y', produtoId: 'p_s10', localId: 'l_cam', quantidade: 100, progId: p.id }).erros.quantidade || '';
    SV = 'combustivel'; location.hash = '#/clProg'; await T.dorme(200); CL57.cancelarProg(prox.id); await T.esperar(() => document.querySelector('#cpM'));
    document.querySelector('#cpM').value = 'Caminhão em manutenção (teste)'; await T.confirmarJanela();
    await T.esperar(() => (DATA.clProg.find((x) => x.id === prox.id) || {}).situacao === 'Cancelado'); await T.sincronizado();
    return { antes, depoisProg, saldo: saldoP('p_s10'), proxData: prox.data, cons: !!cons, deNovo, banco: T.banco('clCtrl').filter((x) => x.tipo === 'prog').length }; });
  ok(pg.antes === pg.depoisProg, 'programar não mexe no estoque');
  ok(pg.cons && pg.saldo === 300, `realizar a programação lançou o abastecimento (saldo ${pg.saldo} L)`);
  ok(/já está realizado/.test(pg.deNovo), 'a mesma programação não pode ser lançada duas vezes');
  ok(!!pg.proxData && pg.proxData > hoje, `programação semanal gerou a próxima (${pg.proxData})`);
  ok(pg.banco === 2, 'programações gravadas no banco central (coleção clCtrl), a próxima cancelada com motivo');

  /* 7. simultâneos: dois abastecimentos ao mesmo tempo, mesmo mês */
  const sim = await page.evaluate(async () => {
    const mk = (q) => ({ ...MODS.consumos.padrao(), id: novoId(), setor: 'combustivel', produtoId: 'p_s10', localId: 'l_cam', quantidade: q, unidade: 'L', data: hoje(), criadoEm: new Date().toISOString(), anterior: 0, atual: 0 });
    const a = mk(10), b = mk(15); await Promise.all([gravar('consumos', a, null), gravar('consumos', b, null)]); await T.sincronizado();
    return { local: [a.id, b.id].every((id) => DATA.consumos.some((c) => c.id === id)), banco: [a.id, b.id].every((id) => T.banco('consumos').some((c) => c.id === id)), saldo: saldoP('p_s10') }; });
  ok(sim.local && sim.banco && sim.saldo === 275, `dois lançamentos simultâneos: os dois gravados, saldo ${sim.saldo} L`);

  /* 8. relatórios */
  const rel = await page.evaluate(async () => {
    const de = hoje().slice(0, 8) + '01', ate = hoje();
    const pv = CL57.relDados('combustivel', 'porVeiculo', de, ate); const pm = CL57.relDados('combustivel', 'porMotorista', de, ate);
    SV = 'combustivel'; location.hash = '#/clRel/porVeiculo'; await T.esperar(() => document.querySelector('.cl-tabs'));
    const cam = pv.rows.find((r) => r.nome.startsWith('Caminhão Teste'));
    return { cam: cam && cam.qn, motor: pm.rows.some((r) => r.nome === 'Motorista Teste'), tela: /Caminhão Teste/.test(document.querySelector('#svCorpo').textContent),
      mov: CL57.relDados('combustivel', 'movimentacoes', de, ate).rows.length }; });
  ok(rel.cam === 245, `consumo por veículo: Caminhão Teste ${rel.cam} L (120 + 100 + 10 + 15)`);
  ok(rel.motor && rel.tela, 'consumo por motorista e a tela de relatórios mostram os dados');
  ok(rel.mov >= 9, `histórico de movimentações com ${rel.mov} lançamentos`);

  /* 9. leitura por foto (OCR): cupom do posto e ficha de retirada */
  const ocrPronto = OCR_REDE || (OCR_DIR ? existsSync(join(OCR_DIR, 'tesseract.js-5.1.1')) : false);
  if (!ocrPronto) naoExec('leitura por foto (sem OCR_DIR com a biblioteca e sem internet no teste)');
  else {
    const ocr = await page.evaluate(async () => {
      const foto = async (linhas) => { const cv = document.createElement('canvas'); cv.width = 900; cv.height = 60 + linhas.length * 54; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.fillStyle = '#111'; g.font = '34px monospace'; linhas.forEach((l, i) => g.fillText(l, 30, 60 + i * 54)); return new Promise((r) => cv.toBlob((b) => r(new File([b], 'foto.png', { type: 'image/png' })), 'image/png')); };
      const d = hoje().split('-').reverse().join('/');
      const cupom = await foto(['POSTO EXEMPLO LTDA', 'CNPJ 11.222.333/0001-81', 'DATA ' + d + ' 14:32', 'DIESEL S10', 'QTD 50,000 L', 'PRECO/L 6,190', 'TOTAL R$ 309,50', 'PLACA ABC-1D23', 'KM 15230']);
      const t0 = Date.now(); const r = await CL_OCR.lerImagem(cupom); const tempo = Date.now() - t0;
      const C = CL_OCR.interpretar(r.texto, 'combustivel', 'abPosto', r.conf);
      const v = (k) => (C[k] ? C[k].v : null);
      const lido = { q: v('quantidade'), p: v('preco'), t: v('total'), loc: v('localId'), forn: v('fornecedorId'), prod: v('produtoId'), data: v('data'), km: v('medidor') };
      const duv = Object.keys(C).filter((k) => !k.startsWith('_') && C[k].conf !== 'ok');
      await T.sincronizado(); const antes = saldoP('p_s10'); const nt = (DATA.fTitulos || []).length;
      await CL57.aplicarLeitura('combustivel', 'abPosto', Object.fromEntries(Object.entries(C).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, x.v])), null, null, duv);
      await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); await T.dorme(300);
      const aviso = /Lido da foto/.test(document.querySelector('#camada').textContent) && !!document.querySelector('#camada .cl-conferir');
      T.escolher('formaPosto', 'PIX');   /* a forma de pagamento não aparece no cupom: quem confere escolhe */
      await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.origem === 'Posto externo')); await T.sincronizado();
      await T.esperar(() => (DATA.fTitulos || []).length > nt, 8000).catch(() => {});
      const cp = DATA.consumos.find((c) => c.origem === 'Posto externo'); const saldoPosto = saldoP('p_s10');
      /* ficha de retirada */
      const ficha = await foto(['FICHA DE RETIRADA', 'DIESEL S10', '20 LITROS', 'RESPONSAVEL JOAO TESTE']);
      const r2 = await CL_OCR.lerImagem(ficha); const C2 = CL_OCR.interpretar(r2.texto, 'combustivel', 'saida', r2.conf);
      await CL57.aplicarLeitura('combustivel', 'saida', Object.fromEntries(Object.entries(C2).filter(([k]) => !k.startsWith('_')).map(([k, x]) => [k, x.v])), null, null, []);
      await T.esperar(() => document.querySelector('#camada [data-k="destino"]'));
      const de = document.querySelector('#camada [data-k="destino"]'); de.value = 'Gerador do escritório'; de.dispatchEvent(new Event('input', { bubbles: true }));
      const sAntes = saldoP('p_s10'); await T.salvarGaveta(); await T.esperar(() => DATA.estoqueMov.some((m) => m.destino === 'Gerador do escritório')); await T.sincronizado();
      return { lido, conf: r.conf, tempo, aviso, origem: cp && cp.origem, valor: cp && cp.valorPosto, saldoIgual: saldoPosto === antes ? true : antes + ' → ' + saldoPosto, conta: (DATA.fTitulos || []).some((t) => t.consumoId === (cp && cp.id)),
        saida: { q: C2.quantidade && C2.quantidade.v, resp: C2.operador && C2.operador.v, baixou: round3(sAntes - saldoP('p_s10')) } };
    });
    console.log(`    (OCR: confiança ${Math.round(ocr.conf)}%, ${Math.round(ocr.tempo / 100) / 10} s; lido ${JSON.stringify(ocr.lido)})`);
    ok(ocr.lido.q === 50 && ocr.lido.p === 6.19 && ocr.lido.t === 309.5, 'OCR do cupom: litros, preço por litro e total lidos e coerentes');
    ok(ocr.lido.loc === 'l_cam' && ocr.lido.forn === 'f_posto' && ocr.lido.prod === 'p_s10' && ocr.lido.data === hoje, 'OCR do cupom: veículo pela placa, posto pelo CNPJ, combustível e data');
    ok(ocr.aviso, 'a leitura abre o formulário para conferência, com o aviso “confira antes de salvar”');
    ok(ocr.origem === 'Posto externo' && ocr.valor === 309.5 && ocr.saldoIgual === true, `abastecimento por foto salvo como posto externo, sem mexer no estoque da fábrica (${ocr.origem}, ${ocr.valor}, estoque igual: ${ocr.saldoIgual})`);
    ok(ocr.conta, 'abastecimento em posto a prazo virou conta a pagar no Financeiro');
    ok(ocr.saida.q === 20 && ocr.saida.baixou === 20, `saída por foto: ${ocr.saida.q} L lidos, conferidos e baixados do estoque`);
    ok(ocrServido > 0, 'a biblioteca de leitura foi carregada só quando a leitura foi pedida');
  }

  console.log('Lenha');
  /* 10. entradas de lenha (compras), consumo ligado à fornada e Produção */
  const ln = await page.evaluate(async () => {
    const c1 = await T.comprar('lenha', 'f_lenha', 'p_lenha', 18.5, 95);
    const c2 = await T.comprar('lenha', 'f_lenha', 'p_lenha', 20, 100);
    const fid = novoId(); await gravar('pfornadas', { id: fid, tipo: 'fornada', fornoId: 'l_forno', numero: 1, data: hoje(), hora: '07:00', quantidade: 50000, situacao: 'Em queima', confirmacao: 'Confirmada', criadoEm: new Date().toISOString(), criadoPor: APP.uid }, null);
    await T.esperar(() => (DATA.pfornadas || []).some((f) => f.id === fid));
    await T.abrirNovo('consumos', 'lenha', { produtoId: 'p_lenha', localId: 'l_forno', quantidade: 10, fornadaId: fid, operador: 'Forneiro Teste' });
    await T.salvarGaveta(); await T.esperar(() => DATA.consumos.some((c) => c.setor === 'lenha')); await T.sincronizado();
    const cs = DATA.consumos.find((c) => c.setor === 'lenha');
    const pf = CL57.relDados('lenha', 'porFornada', hoje().slice(0, 8) + '01', hoje()).rows[0];
    const colL = MODS.pfornadas.cols.find((x) => x.k === '_l'); const naProducao = colL.v(DATA.pfornadas.find((f) => f.id === fid));
    return { c1: c1.id, c2: c2.id, saldo: saldoP('p_lenha'), origemId: cs.origemId, mil: cs.milheiros, pf, naProducao, banco: T.banco('consumos').some((c) => c.id === cs.id) }; });
  ok(ln.saldo === 28.5, `entradas de 18,5 + 20 m³ e consumo de 10 m³: estoque ${ln.saldo} m³`);
  ok(ln.origemId && ln.origemId.startsWith('pfornada:') && ln.mil === 50, 'consumo ligado à fornada da Produção (identificador de origem e milheiros da fornada)');
  ok(ln.pf && ln.pf.q === 10 && /ligado/.test(ln.pf.como) && ln.pf.pm === 0.2, 'relatório de consumo por fornada: 10 m³, 0,2 m³ por milheiro, ligação direta');
  ok(/10/.test(ln.naProducao), `a Produção vê a lenha lançada na fornada (${ln.naProducao})`);
  ok(ln.banco, 'consumo de lenha chegou ao banco central');

  /* 11. descontos: regra do contrato, autorização, duplicidade */
  const ds = await page.evaluate(async ({ c1, c2 }) => {
    SV = 'lenha'; const P = MODS.clDesc.padrao();
    const regra = { ...P, id: novoId(), fornecedorId: 'f_lenha', origemTipo: 'Regra do contrato (sobre uma carga)', compraId: c2, motivo: 'Cláusula de 10% (teste)' };
    MODS.clDesc.aoMudar(regra, 'compraId');
    const e1 = conferirRegistro('clDesc', regra).erros; const d1 = await gravarRegistro('clDesc', regra, null, true);
    await T.esperar(() => DATA.clDesc.some((x) => x.id === d1.id));
    const dup = conferirRegistro('clDesc', { ...regra, id: novoId() }).erros.compraId || '';
    const semDoc = conferirRegistro('clDesc', { ...P, id: novoId(), fornecedorId: 'f_lenha', origemTipo: 'Outro documento', valor: 50, motivo: 'x' }).erros.docRef || '';
    const d2 = await gravarRegistro('clDesc', { ...P, id: novoId(), fornecedorId: 'f_lenha', origemTipo: 'Carga com problema (compra específica)', compraId: c1, valor: 157.5, motivo: 'Carga molhada (teste)' }, null, true);
    await T.esperar(() => DATA.clDesc.length === 2);
    CL57.AC.fornecedorId = 'f_lenha'; CL57.AC.de = ''; CL57.AC.ate = hoje(); CL57.AC.usar = {}; CL57.AC.ajustes = [];
    const antesAut = CL57.calcAcerto(CL57.AC).T.desc;
    for (const d of [d1, d2]) { location.hash = '#/clDesc'; await T.dorme(100); CL57.descAcao(d.id, 'autorizar'); await T.confirmarJanela(); await T.esperar(() => DATA.clDesc.find((x) => x.id === d.id).situacao === 'Autorizado'); }
    await T.sincronizado();
    return { sug: regra.valor, e1: Object.keys(e1).length, dup, semDoc, antesAut, aut: DATA.clDesc.every((d) => d.situacao === 'Autorizado' && d.autorizacao && d.autorizacao.porNome), d1: d1.id, d2: d2.id }; }, ln);
  ok(ds.sug === 200 && ds.e1 === 0, `regra do contrato sugeriu R$ ${ds.sug} (10% de R$ 2.000,00)`);
  ok(/já foi usada nesta carga/.test(ds.dup), 'a regra do contrato não pode ser usada duas vezes na mesma carga');
  ok(/documento de origem/.test(ds.semDoc), 'desconto sem documento de origem não é aceito');
  ok(ds.antesAut === 0, 'desconto aguardando autorização não entra no acerto');
  ok(ds.aut, 'descontos autorizados com data e responsável');

  /* 12. acerto: conferência, fechamento, abatimento nas compras, Financeiro, trava e demonstrativo */
  const ac = await page.evaluate(async ({ c1, c2 }) => {
    const A = CL57.AC; A.fornecedorId = 'f_lenha'; A.de = ''; A.ate = hoje(); A.usar = {}; A.ajustes = [{ id: 'aj1', valor: -50, motivo: 'Umidade acima do combinado (teste)' }]; A.conf = false;
    const prev = CL57.calcAcerto(A).T;
    SV = 'lenha'; location.hash = '#/clAcerto/novo'; await T.esperar(() => document.querySelector('#acFechar'));
    document.querySelector('#acFechar').click(); await T.dorme(200); const semConf = !document.querySelector('.veu .modal');
    document.querySelector('#acConf').click(); window.__srv.estado.falhas.depois = 2;   /* respostas perdidas no meio do fechamento */
    document.querySelector('#acFechar').click(); await T.confirmarJanela();
    await T.esperar(() => DATA.clAcerto.some((a) => a.situacao === 'Fechado'), 20000); await T.sincronizado();
    const a = DATA.clAcerto[0]; const k1 = DATA.compras.find((x) => x.id === c1), k2 = DATA.compras.find((x) => x.id === c2);
    const ob = (id) => window.FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === 'c:' + id).s.saldo;
    const bancoC = T.banco('compras').filter((x) => x.id === c1 || x.id === c2);
    const abIds = bancoC.flatMap((x) => (x.abatimentos || []).map((y) => y.id));
    let cancelou = ''; try { await gravar('compras', { ...k1, status: 'Cancelada' }, k1); } catch (e) { cancelou = motivoErro(e); }
    const depois = CL57.calcAcerto({ ...A, usar: {}, ajustes: [] }).T;
    location.hash = '#/clAcerto/' + a.id; await T.esperar(() => document.querySelector('#caDoc')); document.querySelector('#caDoc').click();
    await T.esperar(() => location.hash === '#/documento' && /DEMONSTRATIVO DE ACERTO DE LENHA/.test(document.body.textContent));
    const doc = document.querySelector('#conteudo').textContent;
    return { prev, semConf, sit: a.situacao, liq: a.totais.liquido, s1: finVenda(k1).saldo, s2: finVenda(k2).saldo, f1: ob(c1), f2: ob(c2), dUsado: DATA.clDesc.every((d) => d.situacao === 'Usado no acerto' && d.acertoId === a.id),
      abIds: abIds.length, abUnicos: new Set(abIds).size, cancelou, depoisN: depois.n, depoisDesc: depois.desc, docOk: /3\.350,00/.test(doc) && /Fornecedor Lenha Exemplo/.test(doc), id: a.id }; }, ln);
  ok(ac.prev.bruto === 3757.5 && ac.prev.desc === 357.5 && ac.prev.liquido === 3350, `conferência: bruto ${ac.prev.bruto}, descontos ${ac.prev.desc}, ajuste −50, líquido ${ac.prev.liquido}`);
  ok(ac.semConf, 'sem marcar “conferi”, o acerto não fecha');
  ok(ac.sit === 'Fechado' && ac.liq === 3350, 'acerto fechado mesmo com respostas perdidas no meio');
  ok(ac.s1 === 1550 && ac.s2 === 1800, `abatimentos nas compras: saldos ${ac.s1} e ${ac.s2} (líquido 3.350,00)`);
  ok(ac.f1 === 1550 && ac.f2 === 1800, 'contas a pagar e Financeiro passaram a mostrar o valor líquido');
  ok(ac.abIds === 3 && ac.abUnicos === 3, `no banco: ${ac.abIds} abatimentos, nenhum repetido`);
  ok(ac.dUsado, 'descontos marcados como usados neste acerto');
  ok(/acerto de lenha/.test(ac.cancelou), 'compra de acerto fechado não pode ser cancelada sem estorno');
  ok(ac.depoisN === 0 && ac.depoisDesc === 0, 'as mesmas compras e descontos não entram em outro acerto');
  ok(ac.docOk, 'demonstrativo do acerto para imprimir/exportar com fornecedor e líquido');

  /* 13. estorno autorizado: libera tudo, sem apagar */
  const es = await page.evaluate(async ({ id, c1, c2 }) => {
    location.hash = '#/clAcerto/' + id; await T.esperar(() => document.querySelector('#caEst'));
    CL57.estornarAcerto(id); await T.esperar(() => document.querySelector('#eaM')); document.querySelector('#eaM').value = 'Teste de estorno'; await T.confirmarJanela();
    await T.esperar(() => DATA.clAcerto.find((a) => a.id === id).situacao === 'Estornado', 15000); await T.sincronizado();
    const k1 = DATA.compras.find((x) => x.id === c1);
    return { s1: finVenda(k1).saldo, s2: finVenda(DATA.compras.find((x) => x.id === c2)).saldo, guardado: (k1.abatimentos || []).length, estornados: (k1.abatimentos || []).every((a) => a.estornado), desc: DATA.clDesc.every((d) => d.situacao === 'Autorizado' && !d.acertoId),
      log: DATA.log.some((l) => l.recId === id && /estornou/.test(l.acao)) }; }, { ...ln, id: ac.id });
  ok(es.s1 === 1757.5 && es.s2 === 2000, 'estorno devolveu os saldos das compras');
  ok(es.guardado === 2 && es.estornados, 'os abatimentos continuam guardados, marcados como estornados');
  ok(es.desc && es.log, 'descontos voltaram a autorizados e o estorno ficou no histórico');

  /* 14. falha de comunicação no meio do fechamento → retomar sem duplicar */
  const rt = await page.evaluate(async ({ c1, c2 }) => {
    const A = CL57.AC; A.fornecedorId = 'f_lenha'; A.de = ''; A.ate = hoje(); A.usar = {}; A.ajustes = []; A.conf = true;
    const so0 = salvarOpV; let n = 0; salvarOpV = async function () { if (n++ === 0) { const e = new Error('sem rede'); e.code = 'unavailable'; throw e; } return so0.apply(this, arguments); };
    location.hash = '#/clAcerto/novo'; await T.esperar(() => document.querySelector('#acFechar')); document.querySelector('#acFechar').click(); await T.confirmarJanela();
    await T.esperar(() => DATA.clAcerto.some((a) => a.situacao === 'Fechando'), 10000);
    const a = DATA.clAcerto.find((x) => x.situacao === 'Fechando'); await T.esperar(() => location.hash === '#/clAcerto/' + a.id, 10000); await T.dorme(300); const pend = CL57.pendencias('lenha').some((p) => p.acao === 'acerto' && p.id === a.id);
    salvarOpV = so0; await CL57.retomarAcerto(a.id); await T.esperar(() => DATA.clAcerto.find((x) => x.id === a.id).situacao === 'Fechado', 15000);
    await CL57.retomarAcerto(a.id); await T.sincronizado();
    const k1 = DATA.compras.find((x) => x.id === c1), k2 = DATA.compras.find((x) => x.id === c2);
    const ativos = [...(k1.abatimentos || []), ...(k2.abatimentos || [])].filter((x) => !x.estornado && x.acertoId === a.id);
    return { pend, ativos: ativos.length, s: finVenda(k1).saldo + finVenda(k2).saldo }; }, ln);
  ok(rt.pend, 'fechamento interrompido aparece em pendências para retomar');
  ok(rt.ativos === 2 && rt.s === 3400, `retomado duas vezes: ${rt.ativos} abatimentos (sem duplicar), saldo total ${rt.s}`);

  /* 15. permissões, menu e telas */
  const ui = await page.evaluate(async () => {
    APP.papel = 'estoquista';
    const exc = (window.preExcluirV51('consumos', DATA.consumos[0]) || {}).bloq || '';
    const aut = pode('clDescAut', 'e'), fecha = pode('clAcertoFechar', 'e'), finV = pode('clAcerto');
    APP.papel = 'admin';
    SV = 'combustivel'; location.hash = '#/setor-combustivel'; await T.esperar(() => document.querySelector('.cl-fbtn') && /Combustível/.test(document.querySelector('.spot-id b').textContent));
    document.querySelector('.cl-fbtn').click(); await T.esperar(() => document.querySelector('.cl-fbtn').getAttribute('aria-expanded') === 'true' && !document.querySelector('#clMenu57').hidden, 2000).catch(() => {});
    const grupos = [...document.querySelectorAll('.cl-grupo h4')].map((h) => h.textContent);
    const aberto = document.querySelector('.cl-fbtn').getAttribute('aria-expanded') === 'true' && !document.querySelector('#clMenu57').hidden;
    const q = document.querySelector('.cl-menu input'); q.value = 'saida'; q.dispatchEvent(new Event('input'));
    const achou = [...document.querySelectorAll('.cl-grupo a')].filter((a) => !a.hidden).map((a) => a.textContent.trim());
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    location.hash = '#/clLanc'; await T.esperar(() => document.querySelector('.cl-acoes'));
    const cartoes = document.querySelectorAll('.cl-acao').length;
    SV = 'lenha'; location.hash = '#/setor-lenha'; await T.esperar(() => document.querySelector('.cl-fbtn') && /Lenha/.test(document.querySelector('.spot-id b').textContent)); document.querySelector('.cl-fbtn').click(); await T.dorme(100);
    const gl = [...document.querySelectorAll('.cl-grupo h4')].map((h) => h.textContent);
    for (const r of ['#/clAPagar', '#/clPag', '#/clDesc', '#/clAcerto', '#/clConf', '#/clFoto', '#/clRel/porForno', '#/clProg']) { location.hash = r; await T.dorme(250); }
    return { exc, aut, fecha, finV, grupos, aberto, achou, cartoes, gl, ini: !!document.querySelector('.cl-nav') }; });
  ok(/permissão de gerente ou administrador/.test(ui.exc), 'estoquista não exclui lançamento de estoque');
  ok(!ui.aut && !ui.fecha && !ui.finV, 'estoquista não autoriza desconto, não fecha acerto e não vê valores da lenha');
  ok(ui.aberto && ui.grupos.join() === 'Operações,Controle,Gestão', `menu de funções do Combustível em grupos: ${ui.grupos.join(', ')}`);
  ok(ui.achou.some((x) => /saída/i.test(x)), `pesquisa de funções encontra “${ui.achou.join(', ')}”`);
  ok(ui.cartoes >= 8, `central de lançamentos com ${ui.cartoes} ações`);
  ok(ui.gl.join() === 'Operações,Controle,Financeiro,Relatórios', `menu da Lenha em grupos: ${ui.gl.join(', ')}`);

  /* capturas de tela opcionais para conferência visual: FOTOS=<pasta> */
  if (process.env.FOTOS) {
    for (const [larg, alt, suf] of [[1280, 900, 'pc'], [390, 844, 'cel']]) {
      await page.setViewportSize({ width: larg, height: alt });
      for (const [rota, nome, menu] of [['#/clLanc', 'central-comb', 0], ['#/setor-combustivel', 'menu-comb', 1], ['#/setor-lenha', 'inicio-lenha', 0], ['#/clAcerto/' + ac.id, 'acerto', 0], ['#/clFoto', 'foto', 0], ['#/clRel/porVeiculo', 'relatorio', 0]]) {
        await page.evaluate(async ([r, setor]) => { SV = setor; location.hash = r; await T.dorme(600); }, [rota, /Acerto|lenha/.test(rota) ? 'lenha' : 'combustivel']);
        if (menu) await page.evaluate(async () => { document.querySelector('.cl-fbtn').click(); await T.dorme(200); });
        await page.screenshot({ path: join(process.env.FOTOS, `${nome}-${suf}.png`), fullPage: !menu });
        if (menu) await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      }
    }
  }
  const relevantes = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
} catch (e) {
  falhas++; console.error('  ✘ o teste parou:', e && (e.stack || e.message || e));
} finally {
  await browser.close(); http.close();
}
const n = (k) => resultados.filter((r) => r[0] === k).length;
console.log(`\nCombustível e Lenha: ${n('ok')} aprovados, ${n('FALHOU')} falharam, ${n('não executado')} não executados.`);
process.exit(falhas ? 1 : 0);
