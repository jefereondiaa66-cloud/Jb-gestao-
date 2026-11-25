#!/usr/bin/env node
// Teste de ponta a ponta da Central de boletos (V166, 25/11/2026): Boletos e contas a pagar, conferência da linha
// digitável, bloqueio de boleto repetido, prioridades, faixas de vencimento, PAGAR ou ENVIAR PARA AGENDAMENTO e a fila
// "Encaminhados para agendamento" na agenda de quem paga. Programa REAL (saida/claude.html) e banco central simulado
// (scripts/lib/servidor-falso.mjs): os dados são fictícios e só existem na memória do teste.
// Uso: node scripts/construir.mjs && node scripts/testar-boletos.mjs   (FOTOS=<pasta> guarda capturas)
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

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
const ok = (c, m, det) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) { falhas++; if (det !== undefined) console.log('      detalhe: ' + JSON.stringify(det).slice(0, 1500)); } };
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('popup', (p) => p.close().catch(() => {}));
  await page.addInitScript(({ codigo }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    let salvo = null; try { salvo = JSON.parse(sessionStorage.getItem('__srv_bol') || 'null'); } catch (e) {}
    (salvo || [['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }]]).forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.__arquivos = []; window.__leituras = [];
    const assets = { upload: async (f) => { const id = 'a' + window.__arquivos.length.toString().padStart(31, '0'); window.__arquivos.push({ id, nome: f.name, tam: f.size }); return { id, url: '/_blob/' + id, sizeBytes: f.size, contentType: f.type }; }, list: async () => ({ assets: [] }), delete: async () => {} };
    const sample = async (input, o) => { window.__leituras.push({ prompt: String(input), imagens: o && o.images ? o.images.length : 0 }); await new Promise((r) => setTimeout(r, 50)); return { text: '```json\n' + JSON.stringify(window.__resposta) + '\n```', truncated: false }; };
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 20, mediaTypes: ['image/jpeg', 'image/png'] }, tools: {} });
    sample.json = async () => ({});
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'assets' ? assets : n === 'sample' ? sample : null) };
  }, { codigo: servidorFalso });

  const utilidades = () => page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 9000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 200) + ' | aviso: ' + T.ultimoToast()); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 12000); await T.dorme(300); },
      limpar: () => { document.querySelectorAll('.veu,.dc-pop').forEach((x) => x.remove()); if (GAV) { try { fecharGaveta(true); } catch (e) {} } },
      ir: async (rota, re) => { marcarSetor('financeiro'); T.limpar(); if (location.hash === rota) renderTela(); else location.hash = rota; await T.esperar(() => (re || /./).test((document.querySelector('#svCorpo') || {}).textContent || '')); await T.dorme(350); },
      ultimoToast: () => { const t = [...document.querySelectorAll('#toasts .toast')]; return t.length ? t[t.length - 1].textContent : ''; },
      val: (sel, v) => { const el = document.querySelector('.veu .modal ' + sel); if (!el) throw new Error('sem campo ' + sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      /* o sistema ignora um segundo clique no mesmo botão em menos de 0,7 s: espera como uma pessoa */
      confirmar: async () => { await T.dorme(750); const m = document.querySelector('.veu .modal'); m.querySelector('[data-ok]').click(); await T.esperar(() => !document.body.contains(m) || m.querySelector('[data-ok]:not([disabled])'), 15000); await T.dorme(450); return !document.body.contains(m); },
      campo: (k, v) => { const el = document.querySelector('#frm [data-k="' + k + '"]'); if (!el) throw new Error('formulário sem o campo ' + k); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      valorCampo: (k) => { const el = document.querySelector('#frm [data-k="' + k + '"]'); return el ? el.value : null; },
      visivel: (k) => { const w = document.querySelector('[data-campo="' + k + '"]'); return !!w && !w.hidden; },
      erroCampo: (k) => { const w = document.querySelector('[data-campo="' + k + '"]'); return w && w.classList.contains('erro') ? w.querySelector('.msg').textContent : ''; },
      salvarForm: async () => { await T.dorme(300); document.querySelector('.gaveta [data-acao="salvar"], [data-acao="salvar"]').click(); await T.dorme(700); },
      ob: (ref) => FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === ref),
      tit: (desc) => DATA.fTitulos.find((t) => t.descricao === desc),
      tits: (desc) => DATA.fTitulos.filter((t) => t.descricao === desc),
      B: () => window.BOLETOS_V166,
      cartoes: () => [...document.querySelectorAll('#svCorpo .bol-lista > .bol-card')].filter((c) => !c.closest('#bolFila')).map((c) => ({ ref: c.dataset.ref, t: c.querySelector('.bol-tit').textContent.trim(), tags: c.querySelector('.bol-tags').textContent.replace(/\s+/g, ' ').trim(), v: c.querySelector('.bol-val').textContent.replace(/\s+/g, ' ').trim() })),
      faixas: () => Object.fromEntries([...document.querySelectorAll('[data-bolfx]')].map((b) => [b.dataset.bolfx, [...b.children].map((x) => x.textContent).join(' ').replace(/\s+/g, ' ').trim()])),
      cartao: (ref) => document.querySelector('#svCorpo .bol-card[data-ref="' + ref + '"]'),
      /* um boleto bancário válido, montado com os dígitos verificadores de verdade (banco, vencimento, valor, campo livre) */
      boleto: (banco, venc, valor, livre) => { const JB = window.JB_BOLETO; const f = venc ? String(1000 + Math.round((Date.parse(venc + 'T00:00:00Z') - Date.parse('2025-02-22T00:00:00Z')) / 86400000)).padStart(4, '0') : '0000';
        const sem = banco + '9' + f + String(Math.round(valor * 100)).padStart(10, '0') + livre; const dv = JB.mod11Banco(sem); const barras = sem.slice(0, 4) + dv + sem.slice(4); return JB.decodificar(barras).linha; },
      /* guia de arrecadação (48 números), com o terceiro número 6 (módulo 10) */
      guia: (seg, valor, resto) => { const JB = window.JB_BOLETO; const sem = '8' + seg + '6' + String(Math.round(valor * 100)).padStart(11, '0') + resto; const dv = JB.mod10(sem); const barras = sem.slice(0, 3) + dv + sem.slice(3); return JB.decodificar(barras).linha; },
      novoTit: (id, desc, benef, valor, venc, extra) => gravar('fTitulos', { id, numero: (Math.max(0, ...DATA.fTitulos.map((t) => +t.numero || 0)) + 1), data: hoje(), descricao: desc, categoria: 'Fornecedores', setorOrigem: 'Geral (Financeiro)', beneficiarioTipo: 'Outro', beneficiario: benef, beneficiarioNome: benef, valor, vencimento: venc || '', dataPrevista: '', formaPrevista: 'Boleto', pagamentos: [], criadoEm: new Date().toISOString(), criadoPor: 'u_DONO', ...(extra || {}) }, null),
    };
  });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const foto = async (nome) => { if (FOTOS) { await page.waitForTimeout(400); await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); } };

  console.log('Boletos e contas a pagar (V166)');
  await page.evaluate(async () => { const h = hoje(); await gravar('fContas', { id: '__caixa', data: h, nome: 'Caixa (dinheiro)', tipoConta: 'Caixa', situacao: 'Ativa', saldoInicial: 20000, dataSaldoInicial: addDias(h, -30), criadoEm: new Date().toISOString(), criadoPor: 'u_DONO' }, null); await T.sincronizado(); });

  /* 1. leitor da linha digitável: dígitos verificadores, valor, vencimento e banco tirados do próprio código */
  const l1 = await page.evaluate(() => {
    const JB = window.JB_BOLETO; const h = hoje(); const lin = T.boleto('341', addDias(h, 5), 1234.56, '1790001043510047910201500');
    const d = JB.decodificar(lin); const n = JB.dg(lin); const troca = n.slice(0, 14) + ((+n[14] + 1) % 10) + n.slice(15); const ruim = JB.decodificar(troca);
    const barrasRuim = d.barras.slice(0, 20) + ((+d.barras[20] + 3) % 10) + d.barras.slice(21);
    const g = JB.decodificar(T.guia('3', 257.9, '00010011111111111111111111111')); const gn = JB.dg(g.linha); const gRuim = JB.decodificar(gn.slice(0, 5) + ((+gn[5] + 1) % 10) + gn.slice(6));
    const real = JB.decodificar('34191.79001 01043.510047 91020.150008 1 96610000035075', '2026-11-25');
    return { lin, d: { ok: d.ok, tipo: d.tipo, valor: d.valor, venc: d.venc, banco: d.banco, barras: d.barras.length, linha: JB.dg(d.linha).length }, alvo: addDias(h, 5), ruim: ruim.ok + ' ' + ruim.erro, barrasRuim: JB.decodificar(barrasRuim).ok,
      g: { ok: g.ok, tipo: g.tipo, valor: g.valor, venc: g.venc, seg: g.segmento, linha: gn.length }, gRuim: gRuim.ok + ' ' + gRuim.erro, real: { ok: real.ok, banco: real.banco, valor: real.valor },
      fatores: [JB.vencDoFator('1000', '2000-07-01'), JB.vencDoFator('1000', '2025-03-01'), JB.vencDoFator('9999', '2025-02-10'), JB.vencDoFator('0000', h)], curto: JB.decodificar('12345').erro };
  });
  ok(l1.d.ok && l1.d.tipo === 'bancario' && l1.d.valor === 1234.56 && l1.d.venc === l1.alvo && l1.d.banco === 'Itaú' && l1.d.barras === 44 && l1.d.linha === 47,
    `linha digitável conferida pelos dígitos: Itaú, R$ 1.234,56, vence ${l1.alvo} (tirados do próprio código)`, l1.d);
  ok(/^false .*campo não confere/.test(l1.ruim) && !l1.barrasRuim && /números/.test(l1.curto), `número trocado ou faltando é recusado (“${l1.ruim.slice(6)}”; “${l1.curto}”)`);
  ok(l1.g.ok && l1.g.tipo === 'arrecadacao' && l1.g.valor === 257.9 && !l1.g.venc && l1.g.seg === 'Energia elétrica e gás' && l1.g.linha === 48 && /^false .*bloco não confere/.test(l1.gRuim),
    'guia de arrecadação (conta de energia, 48 números) conferida; sem vencimento no código, nada é inventado', l1.g);
  ok(l1.real.ok && l1.real.banco === 'Itaú' && l1.real.valor === 350.75, 'linha de boleto real do Itaú confere (R$ 350,75)');
  ok(l1.fatores.join('|') === '2000-07-03|2025-02-22|2025-02-21|', `fator de vencimento com a virada de 22/02/2025 (${l1.fatores.join(' · ')})`);

  /* 2. cadastro à mão: a linha preenche valor, vencimento, banco e código de barras; repetido não entra */
  const f2 = await page.evaluate(async () => {
    await T.ir('#/fBoletos', /Boletos e contas a pagar/); const h = hoje(); const lin = T.boleto('341', addDias(h, 2), 480.9, '1790001043510047910209999');
    document.querySelector('#bolManual').click(); await T.esperar(() => document.querySelector('#frm [data-k="linhaDigitavel"]')); await T.dorme(300);
    const r = { doc: T.valorCampo('docOrigemTipo'), forma: T.valorCampo('formaPrevista'), visCod: T.visivel('codigoBarras'), visBanco: T.visivel('bancoEmissor') };
    T.campo('descricao', 'Boleto do frete de novembro'); T.campo('categoria', 'Fretes'); T.campo('beneficiario', 'Transportadora Rio Claro'); T.campo('cnpjCpf', '11.444.777/0001-61');
    T.campo('linhaDigitavel', lin); await T.dorme(400);
    r.valor = T.valorCampo('valor'); r.venc = T.valorCampo('vencimento'); r.banco = T.valorCampo('bancoEmissor'); r.cod = T.valorCampo('codigoBarras');
    r.conf = (document.querySelector('[data-campo="_bol"]') || {}).textContent.replace(/\s+/g, ' ').trim(); r.alvo = addDias(h, 2);
    const n0 = DATA.fTitulos.length; await T.salvarForm(); await T.esperar(() => DATA.fTitulos.length > n0); await T.sincronizado();
    const t = T.tit('Boleto do frete de novembro'); r.t = { lin: t.linhaDigitavel, cod: t.codigoBarras, banco: t.bancoEmissor, valor: t.valor, venc: t.vencimento, cnpj: t.cnpjCpf, doc: t.docOrigemTipo, numero: t.numero };
    /* o mesmo boleto outra vez: bloqueado, nada gravado */
    await T.ir('#/fBoletos', /Boletos e contas a pagar/); document.querySelector('#bolManual').click(); await T.esperar(() => document.querySelector('#frm [data-k="linhaDigitavel"]')); await T.dorme(300);
    T.campo('descricao', 'Boleto do frete (de novo)'); T.campo('categoria', 'Fretes'); T.campo('beneficiario', 'Transportadora Rio Claro'); T.campo('linhaDigitavel', JB_BOLETO.dg(lin)); await T.dorme(300);
    r.confDup = (document.querySelector('[data-campo="_bol"]') || {}).textContent.replace(/\s+/g, ' ').trim();
    const n1 = DATA.fTitulos.length; await T.salvarForm(); await T.dorme(500); r.erroDup = T.erroCampo('linhaDigitavel'); r.gravouDup = DATA.fTitulos.length - n1;
    /* linha com um número errado: pede confirmação (o responsável decide) e, sem confirmar, nada é gravado */
    const nn = JB_BOLETO.dg(T.boleto('237', addDias(h, 9), 75, '0000000000000000000012345')); T.campo('linhaDigitavel', nn.slice(0, 3) + ((+nn[3] + 1) % 10) + nn.slice(4)); await T.dorme(300);
    r.confRuim = (document.querySelector('[data-campo="_bol"]') || {}).textContent.replace(/\s+/g, ' ').trim(); r.codRuim = T.valorCampo('codigoBarras'); T.campo('valor', '75,00'); T.campo('vencimento', addDias(h, 9));
    await T.salvarForm(); await T.dorme(300); const dlg = [...document.querySelectorAll('.veu')].pop(); r.dlg = dlg ? dlg.textContent.replace(/\s+/g, ' ').trim() : '';
    const voltar = dlg && [...dlg.querySelectorAll('button')].find((b) => /Voltar|Cancelar/.test(b.textContent)); if (voltar) voltar.click(); await T.dorme(300); r.gravouRuim = DATA.fTitulos.length - n1;
    T.limpar(); return r;
  });
  ok(f2.doc === 'Boleto' && f2.forma === 'Boleto' && f2.visCod && f2.visBanco, '“Cadastrar à mão” abre o compromisso já como boleto, com linha digitável, código de barras e banco');
  ok(f2.valor === '480,90' && f2.venc === f2.alvo && f2.banco === 'Itaú' && f2.cod.length === 44 && /Conferida/.test(f2.conf), `a linha preenche sozinha: valor ${f2.valor}, vencimento ${f2.venc}, ${f2.banco} e o código de barras (${f2.conf.slice(0, 90)}…)`, f2);
  ok(f2.t.lin && JB_BOLETO_ok(f2.t.lin) && f2.t.cod && f2.t.cod.length === 44 && f2.t.banco === 'Itaú' && f2.t.valor === 480.9 && f2.t.venc === f2.alvo && f2.t.cnpj === '11444777000161' && f2.t.doc === 'Boleto',
    `boleto gravado no compromisso nº ${f2.t.numero} com linha, código de barras, banco, CNPJ (só números), valor e vencimento`, f2.t);
  ok(/Repetido/.test(f2.confDup) && /já está lançado no compromisso nº/.test(f2.erroDup) && f2.gravouDup === 0, `o mesmo boleto não entra duas vezes: “${f2.erroDup}”`);
  ok(/Não confere/.test(f2.confRuim) && f2.codRuim === '' && /Confirmar mesmo assim\?/.test(f2.dlg) && /não confere/.test(f2.dlg) && f2.gravouRuim === 0, 'linha com número errado avisa que não confere e só grava se o responsável confirmar', { conf: f2.confRuim, dlg: f2.dlg });

  /* 3. contas de vários vencimentos (e de outros setores), faixas e prioridades */
  const f3 = await page.evaluate(async () => {
    const h = hoje();
    await T.novoTit('tv', 'Peças da maromba', 'Loja de Peças A', 300, addDias(h, -3), { categoria: 'Manutenção' });
    await T.novoTit('th', 'Frete da carrada', 'Fretes JR', 150, h, { categoria: 'Fretes' });
    await T.novoTit('te', 'Conta de energia de outubro', 'Equatorial', 2100, addDias(h, 6), { categoria: 'Energia' });
    await T.novoTit('tm', 'Material de escritório', 'Papelaria Central', 95.5, addDias(h, 11), { categoria: 'Materiais' });
    await T.novoTit('tf', 'Uniformes', 'Confecções Silva', 640, addDias(h, 40), { categoria: 'Outras despesas' });
    await T.novoTit('ts', 'Contribuição associação', 'Associação Ceramistas', 50, '', { categoria: 'Outras despesas' });
    await T.novoTit('tp', 'Internet já paga', 'Provedor Net', 120, addDias(h, -1), { categoria: 'Telefone/internet', pagamentos: [{ id: 'pg1', data: h, valor: 120, forma: 'PIX', contaId: '__caixa', quitacao: true, por: 'u_DONO', em: new Date().toISOString() }] });
    await T.novoTit('tc', 'Conta cancelada', 'Ninguém', 77, addDias(h, 1), { cancelado: { motivo: 'teste', em: new Date().toISOString(), por: 'u_DONO' } });
    await T.sincronizado(); await T.ir('#/fBoletos', /Peças da maromba/);
    const B = T.B(); const P = (id) => B.prioridadeDe(T.ob('t:' + id)).p;
    return { faixas: T.faixas(), ordem: T.cartoes().map((c) => c.t), prios: ['tv', 'th', 'te', 'tm', 'tf', 'ts'].map(P), tagsV: (T.cartoes().find((c) => c.ref === 't:tv') || {}).tags, pagoNaLista: T.cartoes().some((c) => c.ref === 't:tp'), cancNaLista: T.cartoes().some((c) => c.ref === 't:tc'),
      resumo: document.querySelector('.bol-resumo').textContent.replace(/\s+/g, ' ').trim(), frete: P(DATA.fTitulos.find((t) => t.descricao === 'Boleto do frete de novembro').id) };
  });
  await foto('01-boletos');
  ok(/R\$ 300,00 Vencidos · 1/.test(f3.faixas.vencidos) && /R\$ 150,00 Vencem hoje · 1/.test(f3.faixas.hoje) && /R\$ 480,90 Vencem em até 3 dias · 1/.test(f3.faixas.ate3) && /R\$ 2\.100,00 Vencem de 4 a 7 dias · 1/.test(f3.faixas.ate7)
    && /R\$ 95,50 Vencem de 8 a 15 dias · 1/.test(f3.faixas.ate15) && /R\$ 690,00 Vencimentos futuros · 2/.test(f3.faixas.futuros) && /R\$ 120,00 Já pagos no mês · 1/.test(f3.faixas.pagos),
    `faixas de vencimento com quantidade e valor: ${Object.values(f3.faixas).join(' | ')}`, f3.faixas);
  ok(f3.prios.join('|') === 'Crítica|Crítica|Alta|Média|Baixa|Baixa' && f3.frete === 'Alta', `prioridade calculada: vencida e de hoje = Crítica, frete em 2 dias e energia em 6 dias (essencial) = Alta, 11 dias = Média, 40 dias e sem vencimento = Baixa (${f3.prios.join(', ')})`);
  ok(f3.ordem[0] === 'Loja de Peças A' && f3.ordem[1] === 'Fretes JR' && f3.ordem.indexOf('Equatorial') < f3.ordem.indexOf('Papelaria Central') && f3.ordem.indexOf('Papelaria Central') < f3.ordem.indexOf('Confecções Silva') && /Crítica/.test(f3.tagsV) && /Vencido/.test(f3.tagsV) && /venceu há 3 dias/.test(f3.tagsV),
    `a lista começa pelo mais urgente (${f3.ordem.join(' › ')})`);
  ok(!f3.pagoNaLista && !f3.cancNaLista && /^7 contas · R\$ 3\.816,40 a pagar/.test(f3.resumo), `em aberto por padrão (paga e cancelada fora): ${f3.resumo}`);

  /* 4. pesquisa e filtros */
  const f4 = await page.evaluate(async () => {
    const r = {}; const fx = async (k) => { document.querySelector('[data-bolfx="' + k + '"]').click(); await T.dorme(350); return T.cartoes().map((c) => c.t); };
    r.vencidos = await fx('vencidos'); r.desliga = await fx('vencidos');
    r.pagos = await fx('pagos'); await fx('pagos');
    const q = async (t) => { const i = document.querySelector('#bolQ'); i.value = t; i.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(700); return T.cartoes().map((c) => c.t); };
    r.forn = await q('equatorial'); r.valor = await q('95,50'); const lin = DATA.fTitulos.find((t) => t.descricao === 'Boleto do frete de novembro').codigoBarras; r.linha = await q(lin.slice(20, 30)); r.vazio = await q('zzzz'); await q('');
    document.querySelector('#bolFt').click(); await T.dorme(200); const cat = document.querySelector('#bolCat'); cat.value = 'Energia'; cat.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(400); r.cat = T.cartoes().map((c) => c.t);
    document.querySelector('#bolLimpa').click(); await T.dorme(400);
    const sit = (() => { document.querySelector('#bolFt').click(); return document.querySelector('#bolSit'); })(); sit.value = 'todas'; sit.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(400); r.todas = T.cartoes().length;
    document.querySelector('#bolLimpa').click(); await T.dorme(400); r.limpo = T.cartoes().length; return r;
  });
  ok(f4.vencidos.join() === 'Loja de Peças A' && f4.desliga.length === 7 && f4.pagos.join() === 'Provedor Net', 'tocar numa faixa mostra só ela (Vencidos; Já pagos no mês) e tocar de novo volta para todas');
  ok(f4.forn.join() === 'Equatorial' && f4.valor.join() === 'Papelaria Central' && f4.linha.join() === 'Transportadora Rio Claro' && !f4.vazio.length, 'pesquisa por fornecedor, por valor (95,50) e por um pedaço da linha digitável');
  ok(f4.cat.join() === 'Equatorial' && f4.todas === 9 && f4.limpo === 7, `filtro de categoria, situação “Todas” (${f4.todas}, com a paga e a cancelada) e Limpar`);

  /* 5. ENVIAR PARA AGENDAMENTO: uma conta, e várias marcadas; nunca marca como pago */
  const f5 = await page.evaluate(async () => {
    const r = {}; const ref = 't:te'; const antes = T.ob(ref); r.antes = { saldo: antes.s.saldo, pags: antes.pagamentos.length };
    T.cartao(ref).querySelector('[data-bolenv]').click(); await T.esperar(() => document.querySelector('.veu .modal #bolObs')); r.janela = document.querySelector('.veu .modal').textContent.replace(/\s+/g, ' ');
    T.val('#bolObs', 'Pagar antes do corte'); await T.dorme(750); const b = document.querySelector('.veu .modal [data-ok]'); b.click(); b.click(); b.click();
    await T.esperar(() => !document.querySelector('.veu .modal #bolObs'), 12000); await T.sincronizado();
    const t = DATA.fTitulos.find((x) => x.id === 'te'); const o = T.ob(ref); const B = T.B();
    r.fila = { st: t.fila && t.fila.st, por: t.fila && t.fila.por, obs: t.fila && t.fila.obs, hist: (t.fila && t.fila.hist || []).length }; r.sit = B.sitB(o); r.depois = { saldo: o.s.saldo, pags: o.pagamentos.length, ag: !!t.naAgenda, prog: t.dataPrevista || '' };
    await T.ir('#/fBoletos', /Equatorial/); const c = T.cartao(ref); r.tags = c.querySelector('.bol-tags').textContent.replace(/\s+/g, ' '); r.semEnviar = !c.querySelector('[data-bolenv]'); r.temTirar = !!c.querySelector('[data-bolret]');
    /* várias marcadas: a barra mostra quantas e o total */
    for (const id of ['tv', 'tm']) { const i = T.cartao('t:' + id).querySelector('[data-bolsel]'); i.click(); await T.dorme(100); }
    r.barra = document.querySelector('#bolBarra').hidden ? '' : document.querySelector('#bolSelT').textContent.replace(/\s+/g, ' '); document.querySelector('#bolSelEnv').click(); await T.esperar(() => document.querySelector('.veu .modal #bolObs')); r.janela2 = document.querySelector('.veu .modal .cpg-conf').textContent.replace(/\s+/g, ' ');
    await T.confirmar(); await T.sincronizado(); await T.dorme(300);
    r.fila2 = ['tv', 'tm'].map((id) => (DATA.fTitulos.find((x) => x.id === id).fila || {}).st); r.faixa = T.faixas().fila; r.toast = T.ultimoToast();
    /* a conta paga não tem como ir para o agendamento */
    document.querySelector('[data-bolfx="pagos"]').click(); await T.dorme(350); r.pagaSemEnviar = !T.cartao('t:tp').querySelector('[data-bolenv]') && !T.cartao('t:tp').querySelector('[data-bolpag]'); document.querySelector('[data-bolfx="pagos"]').click(); await T.dorme(300);
    return r;
  });
  ok(/Vai para a fila de “Agenda do Gustavo”/.test(f5.janela) && /Enviar não marca como pago/.test(f5.janela), 'a janela explica para onde vai e que enviar não marca como pago');
  ok(f5.fila.st === 'aguardando' && f5.fila.por === 'u_DONO' && f5.fila.obs === 'Pagar antes do corte' && f5.fila.hist === 1 && f5.sit === 'Aguardando agendamento' && f5.depois.saldo === f5.antes.saldo && f5.depois.pags === 0 && !f5.depois.ag,
    'enviada para o agendamento: “Aguardando agendamento”, com quem enviou e a observação; o clique triplo registra um envio só; continua em aberto, sem pagamento e fora da agenda', f5);
  ok(/Aguardando agendamento/.test(f5.tags) && /Pagar antes do corte/.test(f5.tags) && f5.semEnviar && f5.temTirar, 'o cartão mostra que está na fila (com a observação) e troca “Enviar” por “Tirar da fila”');
  ok(/2 contas marcadas · R\$ 395,50/.test(f5.barra) && /2 contas · R\$ 395,50/.test(f5.janela2) && f5.fila2.join() === 'aguardando,aguardando' && /R\$ 2\.495,50 Aguardando agendamento · 3/.test(f5.faixa) && /2 contas enviadas/.test(f5.toast),
    `várias de uma vez: marcar, ver o total (${f5.barra}) e enviar; a faixa “Aguardando agendamento” soma ${f5.faixa}`, { janela2: f5.janela2, toast: f5.toast, fila2: f5.fila2 });
  ok(f5.pagaSemEnviar, 'conta já paga não tem Pagar nem Enviar para agendamento');

  /* 6. a agenda de quem paga: a fila no alto, agendar as marcadas para um dia, tirar da fila */
  const f6 = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fagenda', /Encaminhados para agendamento/); const P = document.querySelector('#bolFila');
    r.cab = P.querySelector('.bol-fila-cab h3').textContent.replace(/\s+/g, ' ').trim(); r.itens = [...P.querySelectorAll('.bol-card')].map((c) => c.querySelector('.bol-tit').textContent.trim());
    r.calVazio = !document.querySelector('#cpgCorpo .fi-cal .cel .t'); r.posicao = P.previousElementSibling && P.previousElementSibling.classList.contains('sec-cab');
    for (const ref of ['t:te', 't:tm']) { P.querySelector('[data-bolsel="' + ref + '"]').click(); await T.dorme(100); }
    r.botao = document.querySelector('#bolFAg').textContent.replace(/\s+/g, ' ').trim(); document.querySelector('#bolFAg').click(); await T.esperar(() => document.querySelector('.veu .modal #bolD'));
    const d = addDias(hoje(), 3); T.val('#bolD', d); T.val('#bolF', 'PIX'); T.val('#bolC', '__caixa'); await T.dorme(200); r.diaTot = document.querySelector('#bolDiaTot').textContent.replace(/\s+/g, ' '); r.d = d;
    await T.confirmar(); await T.sincronizado(); await T.dorme(400);
    r.tits = ['te', 'tm'].map((id) => { const t = DATA.fTitulos.find((x) => x.id === id); return { ag: t.naAgenda, prog: t.dataPrevista, forma: t.formaPrevista, conta: t.contaId, fila: t.fila.st, hist: t.fila.hist.map((h) => h.a).join('>') }; });
    const P2 = document.querySelector('#bolFila'); r.restam = P2 ? [...P2.querySelectorAll('.bol-card')].map((c) => c.querySelector('.bol-tit').textContent.trim()) : [];
    /* o dia agendado aparece no calendário da agenda com o total */
    const cel = document.querySelector('#cpgCorpo .fi-cal .cel[data-cpgdia="' + d + '"]'); r.cel = cel ? cel.textContent.replace(/\s+/g, ' ').trim() : '';
    /* tirar da fila (com motivo): volta a ficar só em aberto, com o histórico */
    P2.querySelector('[data-bolret="t:tv"]').click(); await T.esperar(() => document.querySelector('.veu .modal #bolMot')); T.val('#bolMot', 'Fornecedor vai mandar outro boleto'); await T.confirmar(); await T.sincronizado(); await T.dorme(300);
    const tv = DATA.fTitulos.find((x) => x.id === 'tv'); r.tv = { st: tv.fila.st, motivo: tv.fila.motivo, hist: tv.fila.hist.map((h) => h.a).join('>'), sit: T.B().sitB(T.ob('t:tv')) }; r.filaSumiu = !document.querySelector('#bolFila');
    return r;
  });
  await foto('02-agenda-fila');
  ok(/^Encaminhados para agendamento\s*3 contas · R\$ 2\.495,50$/.test(f6.cab) && f6.itens[0] === 'Loja de Peças A' && f6.posicao, `na agenda do Gustavo, logo abaixo do título: ${f6.cab} (a mais urgente primeiro)`, f6);
  ok(/Agendar 2 contas · R\$ 2\.195,50/.test(f6.botao) && /Com estas: R\$ 2\.195,50/.test(f6.diaTot), `marcar as que vão no mesmo dia mostra o total (${f6.botao}) e o total do dia escolhido`);
  ok(f6.tits.every((t) => t.ag === true && t.prog === f6.d && t.forma === 'PIX' && t.conta === '__caixa' && t.fila === 'agendado' && t.hist === 'enviado>agendado') && f6.restam.join() === 'Loja de Peças A' && /2\.195,50/.test(f6.cel),
    `agendadas para ${f6.d} com forma e conta; saem da fila e o dia mostra o total no calendário (${f6.cel})`, f6.tits);
  ok(f6.tv.st === 'retirado' && f6.tv.motivo === 'Fornecedor vai mandar outro boleto' && f6.tv.hist === 'enviado>retirado' && f6.tv.sit === 'Vencido' && f6.filaSumiu, 'tirar da fila guarda o motivo no histórico e a conta continua em aberto; com a fila vazia, o quadro some da agenda');

  /* 7. situação “Agendado” na tela de boletos, retirar da agenda e prioridade definida pelo responsável */
  const f7 = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fBoletos', /Equatorial/); r.faixa = T.faixas().agendados; r.tagE = T.cartao('t:te').querySelector('.bol-tags').textContent.replace(/\s+/g, ' '); r.verAg = !!T.cartao('t:te').querySelector('[data-bolveag]');
    T.cartao('t:tm').querySelector('[data-bolmais]').click(); await T.dorme(250); r.menu = [...document.querySelectorAll('.dc-pop [data-i]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim());
    [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Retirar da agenda/.test(b.textContent)).click(); await T.esperar(() => document.querySelector('.veu .modal #bolMot')); await T.confirmar(); await T.sincronizado();
    const tm = DATA.fTitulos.find((x) => x.id === 'tm'); r.tm = { ag: tm.naAgenda, prog: tm.dataPrevista, st: tm.fila.st, sit: T.B().sitB(T.ob('t:tm')) };
    /* prioridade: o responsável muda e o cartão mostra; depois volta a ser calculada */
    T.cartao('t:tf').querySelector('[data-bolmais]').click(); await T.dorme(250); [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Prioridade/.test(b.textContent)).click();
    await T.esperar(() => document.querySelector('.veu .modal #bolP')); r.janelaP = document.querySelector('.veu .modal').textContent.replace(/\s+/g, ' '); T.val('#bolP', 'Crítica'); T.val('#bolPm', 'Fornecedor corta o fornecimento'); await T.confirmar(); await T.sincronizado(); await T.dorme(300);
    const tf = DATA.fTitulos.find((x) => x.id === 'tf'); r.tf = { p: tf.prioridade, mot: tf.prioridadeInfo && tf.prioridadeInfo.motivo, por: tf.prioridadeInfo && tf.prioridadeInfo.por }; r.ordem = T.cartoes().map((c) => c.t).slice(0, 3); r.tagF = T.cartao('t:tf').querySelector('.bol-tags').textContent;
    T.cartao('t:tf').querySelector('[data-bolmais]').click(); await T.dorme(250); [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Prioridade/.test(b.textContent)).click(); await T.esperar(() => document.querySelector('.veu .modal #bolP')); T.val('#bolP', ''); await T.confirmar(); await T.sincronizado();
    r.volta = T.B().prioridadeDe(T.ob('t:tf')).p + '|' + (DATA.fTitulos.find((x) => x.id === 'tf').prioridade || '');
    return r;
  });
  ok(/R\$ 2\.100,00 Agendados · 1|R\$ 2\.195,50 Agendados · 2/.test(f7.faixa) && /Agendado para/.test(f7.tagE) && f7.verAg, `na tela de boletos aparece “Agendado para” o dia, com “Ver na agenda” (${f7.faixa})`);
  ok(f7.menu.some((m) => /Retirar da agenda/.test(m)) && f7.tm.ag === false && f7.tm.prog === '' && f7.tm.st === 'retirado' && f7.tm.sit === 'Pendente', 'retirar da agenda tira o dia e a marca da agenda; a conta volta a ficar pendente', f7.tm);
  ok(/calculada é/.test(f7.janelaP) && f7.tf.p === 'Crítica' && f7.tf.mot === 'Fornecedor corta o fornecimento' && f7.tf.por === 'u_DONO' && f7.ordem.includes('Confecções Silva') && /Crítica ✎/.test(f7.tagF) && f7.volta === 'Baixa|',
    'prioridade definida pelo responsável (com motivo e quem fez) passa a valer e sobe a conta; “Automática” volta a calcular', f7);

  /* 8. PAGAR: a baixa só acontece com o pagamento confirmado (data, valor, conta, forma, comprovante) */
  const f8 = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fBoletos', /Fretes JR/); T.cartao('t:th').querySelector('[data-bolpag]').click(); await T.esperar(() => document.querySelector('.veu .modal #mpV'));
    r.campos = ['#mpV', '#mpD', '#mpF', '#mpC'].every((s) => !!document.querySelector('.veu .modal ' + s)) && !!document.querySelector('.veu .modal #mpA, .veu .modal #mpL');
    document.querySelector('.veu .modal [data-r]').click(); await T.dorme(900); r.semPagar = T.ob('t:th').pagamentos.length;
    T.cartao('t:th').querySelector('[data-bolpag]').click(); await T.esperar(() => document.querySelector('.veu .modal #mpV')); T.val('#mpC', '__caixa'); T.val('#mpF', 'PIX'); await T.confirmar(); await T.sincronizado(); await T.dorme(300);
    const o = T.ob('t:th'); r.depois = { sit: T.B().sitB(o), saldo: o.s.saldo, pags: o.pagamentos.length, conta: o.pagamentos[0] && o.pagamentos[0].conta }; r.naLista = !!T.cartao('t:th'); r.faixaPagos = T.faixas().pagos;
    return r;
  });
  ok(f8.campos && f8.semPagar === 0, 'Pagar abre a janela de pagamento (valor, data, forma, conta e comprovante); voltar sem confirmar não paga nada');
  ok(f8.depois.sit === 'Pago' && f8.depois.saldo === 0 && f8.depois.pags === 1 && f8.depois.conta === '__caixa' && !f8.naLista && /R\$ 270,00 Já pagos no mês · 2/.test(f8.faixaPagos), `pago com o pagamento registrado: sai da lista em aberto e entra em “Já pagos no mês” (${f8.faixaPagos})`);

  /* 9. a janela da conta mostra o boleto, a prioridade e o histórico do agendamento */
  const f9 = await page.evaluate(async () => {
    const id = DATA.fTitulos.find((t) => t.descricao === 'Boleto do frete de novembro').id; FINANCEIRO_SETOR.acoes.abrirObrig('t:' + id); await T.esperar(() => document.querySelector('.gaveta')); await T.dorme(300);
    const g1 = document.querySelector('.gaveta').textContent.replace(/\s+/g, ' '); T.limpar();
    FINANCEIRO_SETOR.acoes.abrirObrig('t:tv'); await T.esperar(() => document.querySelector('.gaveta')); await T.dorme(300); const g2 = document.querySelector('.gaveta').textContent.replace(/\s+/g, ' '); T.limpar();
    return { g1, g2 };
  });
  ok(/Boleto e agendamento/.test(f9.g1) && /Linha digitável\s*\d{5}\.\d{5}.*\(conferida\)/.test(f9.g1) && /Banco emissor\s*Itaú/.test(f9.g1) && /Código de barras\s*\d{44}/.test(f9.g1) && /CNPJ\s*11444777000161/.test(f9.g1), 'na janela da conta: linha digitável conferida, código de barras, banco e CNPJ', f9.g1.slice(-900));
  ok(/enviado para agendamento/.test(f9.g2) && /retirado do agendamento/.test(f9.g2) && /Fornecedor vai mandar outro boleto/.test(f9.g2) && /Prioridade\s*Crítica \(calculada/.test(f9.g2), 'e o histórico do agendamento (enviado, retirado, motivo), com a prioridade calculada', f9.g2.slice(-900));

  /* 10. leitura por foto: a linha lida é conferida; boleto repetido não entra; valor e vencimento só do próprio código */
  const conf = (linha, total, venc, nome) => ({ tipoDocumento: 'boleto', fornecedor: { nome: nome || 'Distribuidora Teste', cnpjCpf: '11.222.333/0001-81' }, documento: { numero: String(Math.floor(Math.random() * 99999)), dataEmissao: '2026-11-01' }, itens: [], valores: { total },
    vencimentos: venc ? [{ data: venc, valor: total }] : [], boleto: { linhaDigitavel: linha, banco: 'Bradesco' }, pagamento: { situacao: 'pendente', forma: 'Boleto' }, categoriaFinanceira: 'Fornecedores', ilegiveis: [] });
  const ler = async (resp, viaBotao) => page.evaluate(async ({ resp, viaBotao }) => {
    window.__resposta = resp; const cv = document.createElement('canvas'); cv.width = 600; cv.height = 300; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 300); x.fillStyle = '#000'; x.fillText('BOLETO ' + Math.random(), 20, 40);
    const b = await new Promise((r) => cv.toBlob(r, 'image/png')); const f = new File([b], 'boleto.png', { type: 'image/png' });
    if (viaBotao) { await T.ir('#/fBoletos', /Boletos e contas a pagar/); const inp = document.querySelector('input[data-bolarq]'); const dt = new DataTransfer(); dt.items.add(f); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    else { if (LANC_IA_V65.estado()) LANC_IA_V65.novo(); location.hash = '#/fIA'; await T.dorme(300); LANC_IA_V65.adicionar([f]); }
    await T.esperar(() => LANC_IA_V65.estado() && LANC_IA_V65.estado().fase === 'conferir', 20000); await T.dorme(300);
    const al = LANC_IA_V65.alertas(); const J = LANC_IA_V65.estado(); return { rota: location.hash, erros: al.erros, avisos: al.avisos, info: al.info, valorMan: J.C.valorManual || 0, vencs: J.C.vencs.map((v) => v.data), tela: (document.querySelector('#svCorpo') || {}).textContent.replace(/\s+/g, ' ') };
  }, { resp, viaBotao });
  const h0 = await page.evaluate(() => hoje());
  const linDup = await page.evaluate(() => DATA.fTitulos.find((t) => t.descricao === 'Boleto do frete de novembro').linhaDigitavel);
  const r10a = await ler(conf(linDup, 480.9, null, 'Transportadora Rio Claro'), true);
  ok(r10a.rota === '#/fIA' && r10a.erros.some((e) => /já está lançado no compromisso nº/.test(e)) && /conferida/.test(r10a.tela), '“Fotografar boleto” abre a leitura; a linha lida é conferida e o boleto já lançado não pode ser lançado de novo', r10a.erros);
  const novaLin = await page.evaluate((h) => T.boleto('237', addDias(h, 12), 812.4, '0000000000000000000055555'), h0);
  const r10b = await ler(conf(novaLin, null, null), false);
  ok(!r10b.erros.length && r10b.valorMan === 812.4 && r10b.vencs[0] === await page.evaluate((h) => addDias(h, 12), h0) && r10b.info.some((i) => /Linha digitável conferida/.test(i)),
    `sem o total e sem o vencimento lidos, valor (R$ 812,40) e vencimento saem do próprio código, conferido pelos dígitos`, r10b);
  const r10c = await page.evaluate(async () => { const J = LANC_IA_V65.estado(); J.C.categoria = 'Fornecedores'; const n0 = DATA.fTitulos.length; document.querySelector('#liaOk').click(); await T.esperar(() => document.querySelector('.veu [data-r="1"]') || LANC_IA_V65.estado().fase !== 'conferir', 6000); await T.dorme(200); const b = document.querySelector('.veu [data-r="1"]'); if (b) b.click();
    await T.esperar(() => LANC_IA_V65.estado().fase === 'pronto', 20000); await T.sincronizado(); const t = DATA.fTitulos.filter((x) => x.ia).pop(); return { n: DATA.fTitulos.length - n0, cod: t.codigoBarras, banco: t.bancoEmissor, valor: t.valor, emissao: t.dataEmissao, cnpj: t.cnpjCpf || '', tipo: t.beneficiarioTipo }; });
  ok(r10c.n === 1 && r10c.cod.length === 44 && r10c.banco === 'Bradesco' && r10c.valor === 812.4 && r10c.emissao === '2026-11-01' && (r10c.tipo !== 'Outro' || r10c.cnpj === '11222333000181'), 'o boleto lido é lançado com código de barras, banco, valor, emissão e CNPJ', r10c);
  const ruimLin = await page.evaluate((h) => { const n = JB_BOLETO.dg(T.boleto('001', addDias(h, 4), 99, '0000000000000000000077777')); return n.slice(0, 22) + ((+n[22] + 5) % 10) + n.slice(23); }, h0);
  const r10d = await ler(conf(ruimLin, 99, h0), false);
  const r10e = await page.evaluate(async () => { const J = LANC_IA_V65.estado(); J.C.categoria = 'Fornecedores'; document.querySelector('#liaOk').click(); await T.esperar(() => document.querySelector('.veu [data-r="1"]') || LANC_IA_V65.estado().fase !== 'conferir', 6000); await T.dorme(200); const b = document.querySelector('.veu [data-r="1"]'); if (b) b.click();
    await T.esperar(() => LANC_IA_V65.estado().fase === 'pronto', 20000); await T.sincronizado(); const t = DATA.fTitulos.filter((x) => x.ia).pop(); return { lin: t.linhaDigitavel || '', cod: t.codigoBarras || '', valor: t.valor }; });
  ok(r10d.avisos.some((a) => /não confere pelos dígitos verificadores/.test(a) && /não será gravada/.test(a)) && !r10d.erros.length && r10e.lin === '' && r10e.cod === '' && r10e.valor === 99,
    'linha lida com número errado: avisa e não grava a linha (nada inventado); o resto do lançamento segue', { av: r10d.avisos, r10e });

  /* 11. vários boletos de uma vez: um documento por arquivo, um depois do outro */
  const f11 = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fBoletos', /Boletos e contas a pagar/); const mk = async (n) => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 200; const b = await new Promise((rr) => cv.toBlob(rr, 'image/png')); return new File([b], n + '.png', { type: 'image/png' }); };
    window.__resposta = { tipoDocumento: 'boleto', fornecedor: { nome: 'Fornecedor do lote' }, documento: { numero: '1' }, itens: [], valores: { total: 10 }, vencimentos: [{ data: hoje(), valor: 10 }], boleto: {}, pagamento: { situacao: 'pendente' }, categoriaFinanceira: 'Fornecedores', ilegiveis: [] };
    const inp = document.querySelector('input[data-bolvarios]'); const dt = new DataTransfer(); for (const n of ['b1', 'b2', 'b3']) dt.items.add(await mk(n)); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true }));
    await T.esperar(() => LANC_IA_V65.estado() && LANC_IA_V65.estado().fase === 'conferir', 20000); await T.dorme(300); renderTela(); await T.dorme(300);
    r.aviso = (document.querySelector('#bolVarios') || {}).textContent || ''; r.arq1 = LANC_IA_V65.estado().arqs.map((a) => a.nome).join();
    document.querySelector('#bolParar').click(); await T.dorme(300); r.parou = !document.querySelector('#bolVarios'); LANC_IA_V65.novo(); return r;
  });
  ok(/1º de 3/.test(f11.aviso) && /Próximo boleto \(2 restantes\)/.test(f11.aviso) && f11.arq1 === 'b1.png' && f11.parou, `“Vários boletos”: cada arquivo é um boleto, lido e conferido um por vez (${f11.aviso.replace(/\s+/g, ' ').trim().slice(0, 80)}…)`);

  /* 12. menu, favoritos, busca geral e voltar */
  const f12 = await page.evaluate(async () => {
    await T.ir('#/setor-financeiro', /./); await T.dorme(500); const tx = (x) => x.textContent.replace(/\s+/g, ' ').trim();
    const r = { abas: [...document.querySelectorAll('.sv-abas a')].map(tx).slice(0, 5), favs: [...document.querySelectorAll('#conteudo .c2-pill')].map(tx).slice(0, 4) };
    const pil = [...document.querySelectorAll('#conteudo .c2-pill, #conteudo .c2-tile')].find((a) => /Boletos e contas a pagar/.test(a.textContent)); pil.click(); await T.esperar(() => location.hash === '#/fBoletos'); await T.dorme(400);
    r.on = tx(document.querySelector('.sv-abas a.on') || document.body).slice(0, 40); JBNAV.voltar(); await T.esperar(() => location.hash === '#/setor-financeiro'); r.voltou = location.hash;
    r.busca = typeof pqEntradas === 'function' ? pqEntradas().some((e) => e.h === '#/fBoletos') : false; r.dono = /'fBoletos','fMeta','fGrade'\]/.test(document.documentElement.innerHTML); return r;
  });
  ok(f12.abas[3] === 'Boletos e contas a pagar' && f12.favs.some((f) => /Boletos e contas a pagar/.test(f)) && f12.on === 'Boletos e contas a pagar' && f12.voltou === '#/setor-financeiro' && f12.busca,
    `no menu logo depois da Central (${f12.abas.join(' · ')}), nos atalhos favoritos e na busca geral; o Voltar retorna ao painel`, f12);

  /* 13. depois de atualizar a página: tudo igual */
  await page.evaluate(async () => { await T.sincronizado(); const dump = []; window.__srv.estado.docs.forEach((d) => dump.push([d.colecao, d.id, d.dados])); sessionStorage.setItem('__srv_bol', JSON.stringify(dump)); });
  const antes = await page.evaluate(() => DATA.fTitulos.map((t) => t.id + ':' + ((t.fila || {}).st || '') + ':' + (t.naAgenda ? t.dataPrevista : '') + ':' + (t.prioridade || '') + ':' + (t.codigoBarras || '')).sort().join('|'));
  await page.reload(); await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 }); await utilidades();
  const depois = await page.evaluate(async () => { await T.dorme(800); return DATA.fTitulos.map((t) => t.id + ':' + ((t.fila || {}).st || '') + ':' + (t.naAgenda ? t.dataPrevista : '') + ':' + (t.prioridade || '') + ':' + (t.codigoBarras || '')).sort().join('|'); });
  ok(antes === depois && antes.length > 0, 'depois de atualizar a página: fila, agendamentos, prioridades e códigos de barras iguais');
  const dup = await page.evaluate(() => { const ids = DATA.fTitulos.map((t) => t.id); const nums = DATA.fTitulos.map((t) => t.numero); const cods = DATA.fTitulos.filter((t) => t.codigoBarras && !t.cancelado).map((t) => t.codigoBarras); return { ids: ids.length === new Set(ids).size, nums: nums.length === new Set(nums).size, cods: cods.length === new Set(cods).size, n: ids.length }; });
  ok(dup.ids && dup.nums && dup.cods, `sem registros duplicados: ${dup.n} compromissos, números e códigos de barras únicos`);

  /* 14. celular: a tela e a fila cabem na largura */
  await page.setViewportSize({ width: 390, height: 844 });
  const cel = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fBoletos', /Boletos e contas a pagar/); await T.dorme(400); r.boletos = document.documentElement.scrollWidth <= 392;
    await page_enviar(); await T.ir('#/fagenda', /Encaminhados para agendamento/); await T.dorme(400); r.agenda = document.documentElement.scrollWidth <= 392 && !!document.querySelector('#bolFila .bol-card');
    return r;
    async function page_enviar() { const o = FINANCEIRO_SETOR.obrigacoes().find((x) => x.ref === 't:tf'); if (!T.B().naFila(o)) { await T.B().enviarFila(['t:tf'], ''); await T.sincronizado(); } }
  });
  await foto('03-celular-agenda');
  ok(cel.boletos && cel.agenda, 'no celular (390 px) a tela de boletos e a fila da agenda cabem na largura');

  ok(!erros.length, 'nenhum erro de JavaScript durante o teste' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  console.log('  ✘ o teste parou: ' + (e && e.message ? e.message.slice(0, 900) : e)); falhas++;
} finally {
  await browser.close(); http.close();
}
function JB_BOLETO_ok(l) { return /^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/.test(l); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
