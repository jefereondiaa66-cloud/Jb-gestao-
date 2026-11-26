#!/usr/bin/env node
// Teste de ponta a ponta do Caixa do dia (V167, 25/11/2026): Resumo financeiro do dia (saldo inicial e final, entradas,
// saídas, onde foi gasto, pessoal e produção, boletos liquidados, avulsos, caixa e bancos), fechamento do dia (conferências,
// mudanças depois de fechar, refazer), relatório ao proprietário (documento e WhatsApp), painel do caixa e Pagamentos
// avulsos (diárias, produção, repetidos, Controle por grade). Programa REAL (saida/claude.html) e banco central simulado:
// os dados são fictícios e só existem na memória do teste.
// Uso: node scripts/construir.mjs && node scripts/testar-caixa-dia.mjs   (FOTOS=<pasta> guarda capturas)
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
    let salvo = null; try { salvo = JSON.parse(sessionStorage.getItem('__srv_cx') || 'null'); } catch (e) {}
    (salvo || [['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }]]).forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv; window.__abertos = [];
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
    const wo = window.open; window.open = (u, ...a) => { window.__abertos.push(String(u)); return null; };
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
      confirmar: async () => { await T.dorme(750); const m = document.querySelector('.veu .modal'); m.querySelector('[data-ok]').click(); await T.esperar(() => !document.body.contains(m) || m.querySelector('[data-ok]:not([disabled])'), 15000); await T.dorme(450); return !document.body.contains(m); },
      tx: (x) => (x ? x.textContent : '').replace(/\s+/g, ' ').trim(),
      kpis: (raiz) => Object.fromEntries([...(raiz || document).querySelectorAll('.rf-kpis .rf-k')].map((k) => [k.querySelector('span').textContent.trim(), k.querySelector('b').textContent.replace(/\s+/g, ' ').trim()])),
      avulso: async (d) => { T.limpar(); window.CAIXA_DIA_V167.novoAvulso({}); await T.esperar(() => document.querySelector('.veu .modal #avDs')); await T.dorme(150);
        if (d.tipo) { document.querySelector('.veu .modal [data-avt="' + d.tipo + '"]').click(); await T.dorme(120); }
        T.val('#avDs', d.desc); T.val('#avB', d.benef); if (d.at) T.val('#avAt', d.at); if (d.au) T.val(d.tipo === 'Diária' || d.tipo === 'Pagamento de produção' || !d.tipo ? '#avAu' : '#avAuO', d.au);
        if (d.q) { T.val('#avQ', String(d.q)); T.val('#avVu', d.vu); } if (d.valor) T.val('#avV', d.valor); if (d.data) T.val('#avD', d.data); if (d.conta) T.val('#avCt', d.conta); if (d.forma) T.val('#avF', d.forma); if (d.doc) T.val('#avDoc', d.doc); await T.dorme(150); },
    };
  });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await utilidades();
  const foto = async (nome) => { if (FOTOS) { await page.waitForTimeout(400); await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: true }); } };

  console.log('Caixa do dia e pagamentos avulsos (V167)');
  /* contas: Caixa R$ 10.000 e Banco do Brasil R$ 5.000 no fim de 10 dias atrás; um dia antes de hoje sem nada */
  const h = await page.evaluate(async () => {
    const h = hoje(), ag = new Date().toISOString(), d0 = addDias(h, -10);
    await gravar('fContas', { id: '__caixa', data: d0, nome: 'Caixa (dinheiro)', tipoConta: 'Caixa', situacao: 'Ativa', saldoInicial: 10000, dataSaldoInicial: d0, criadoEm: ag, criadoPor: 'u_DONO' }, null);
    await gravar('fContas', { id: 'bb', data: d0, nome: 'Banco do Brasil', tipoConta: 'Conta corrente', banco: 'Banco do Brasil', situacao: 'Ativa', saldoInicial: 5000, dataSaldoInicial: d0, criadoEm: ag, criadoPor: 'u_DONO' }, null);
    /* entrada: venda recebida hoje por PIX no banco (só o recebimento conta; a venda a prazo não) */
    await gravar('vendas', { id: 'v1', numero: 1, setor: 'vendas', tipoOp: 'venda', data: h, cliente: { nome: 'Construtora Exemplo' }, itens: [], total: 12000, pagamentos: [{ id: 'vp1', data: h, valor: 8000, forma: 'PIX', contaId: 'bb' }], criadoEm: ag, criadoPor: 'u_DONO' }, null);
    /* saída: boleto de combustível pago hoje pelo Caixa */
    const JB = window.JB_BOLETO; const sem = '237' + '9' + '1642' + '0000070000' + '0000000000000000000001234'; const barras = sem.slice(0, 4) + JB.mod11Banco(sem) + sem.slice(4);
    await gravar('fTitulos', { id: 'tb', numero: 1, data: h, descricao: 'Boleto do diesel', categoria: 'Combustíveis', setorOrigem: 'Geral (Financeiro)', beneficiarioTipo: 'Outro', beneficiario: 'Posto Exemplo', beneficiarioNome: 'Posto Exemplo', valor: 700, vencimento: h, formaPrevista: 'Boleto', docOrigemTipo: 'Boleto', codigoBarras: barras, linhaDigitavel: JB.decodificar(barras).linha,
      pagamentos: [{ id: 'pb1', data: h, valor: 700, forma: 'Boleto', contaId: '__caixa', quitacao: true, por: 'u_DONO', em: ag }], criadoEm: ag, criadoPor: 'u_DONO' }, null);
    /* uma conta que vence hoje e não foi paga (pendência do fechamento) */
    await gravar('fTitulos', { id: 'tx', numero: 2, data: h, descricao: 'Internet de novembro', categoria: 'Telefone/internet', setorOrigem: 'Geral (Financeiro)', beneficiarioTipo: 'Outro', beneficiario: 'Provedor Net', beneficiarioNome: 'Provedor Net', valor: 120, vencimento: h, formaPrevista: 'PIX', pagamentos: [], criadoEm: ag, criadoPor: 'u_DONO' }, null);
    /* Controle por grade: Desenforna 10 grades × R$ 35,00, paga hoje em dinheiro pelo Caixa */
    await gravar('pgTrab', { id: 'tg1', nome: 'José Ribamar', apelido: 'Zé', setor: 'Desenforna', situacao: 'Ativo', dataCadastro: h, criadoEm: ag, criadoPor: 'u_DONO' }, null);
    await gravar('pgLanc', { id: 'lg1', data: h, trabId: 'tg1', setor: 'Desenforna', grades: 10, valorGrade: 35, obs: '', criadoEm: ag, criadoPor: 'u_DONO' }, null);
    await gravar('pgPag', { id: 'gp1', data: h, trabId: 'tg1', valor: 350, forma: 'Dinheiro', contaId: '__caixa', obs: '', origem: 'Financeiro · Pagamento por grade', criadoEm: ag, criadoPor: 'u_DONO' }, null);
    /* transferência do Caixa para o banco: não é receita nem despesa */
    await gravar('fTransf', { id: 'tr1', data: h, contaDe: '__caixa', contaPara: 'bb', valor: 1000, criadoEm: ag, criadoPor: 'u_DONO' }, null);
    await T.sincronizado(); return h;
  });

  /* 1. pagamentos avulsos: diária (com quem autorizou), produção (quantidade × valor) e compra pequena */
  const a1 = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fPagAv', /Pagamentos avulsos/); r.vazio = /Nenhum pagamento avulso no período/.test(T.tx(document.querySelector('#svCorpo')));
    await T.avulso({ tipo: 'Diária', desc: 'Diária na limpeza do forno 6', benef: 'Antônio Pereira', at: 'Limpeza do forno 6', q: 1, vu: '500,00' });
    r.calc = T.tx(document.querySelector('.veu .modal #avVt')); r.valorAuto = document.querySelector('.veu .modal #avV').value; r.cat = document.querySelector('.veu .modal #avC').value; r.setor = document.querySelector('.veu .modal #avS').value;
    const semAut = !(await T.confirmar()); r.semAut = semAut && /quem autorizou/i.test(T.ultimoToast());
    T.val('#avAu', 'Abner'); await T.dorme(750); const b = document.querySelector('.veu .modal [data-ok]'); b.click(); b.click(); b.click(); await T.esperar(() => !document.querySelector('.veu .modal #avDs'), 15000); await T.sincronizado();
    await T.avulso({ tipo: 'Pagamento de produção', desc: 'Produção da maromba (extra)', benef: 'Carlos Souza', at: 'Maromba no sábado', au: 'Mayara', q: 40, vu: '30,00' }); await T.confirmar(); await T.sincronizado();
    await T.avulso({ tipo: 'Compra pequena', desc: 'Pão e café da equipe', benef: 'Padaria Central', valor: '300,00', doc: '11.222.333/0001-81' }); await T.confirmar(); await T.sincronizado();
    const av = DATA.fTitulos.filter((t) => t.avulso); r.n = av.length;
    r.dia = av.find((t) => t.avulso.tipo === 'Diária'); r.dia = r.dia && { valor: r.dia.valor, pag: r.dia.pagamentos.length, pv: r.dia.pagamentos[0].valor, conta: r.dia.pagamentos[0].contaId, aut: r.dia.avulso.autorizadoPor, at: r.dia.avulso.atividade, extra: r.dia.extra, enc: r.dia.enc.setor, cat: r.dia.categoria, por: r.dia.pagamentos[0].por, qtd: r.dia.avulso.qtd };
    r.prod = av.find((t) => t.avulso.tipo === 'Pagamento de produção'); r.prod = r.prod && { valor: r.prod.valor, qtd: r.prod.avulso.qtd, un: r.prod.avulso.unidade, vu: r.prod.avulso.valorUnit };
    r.compra = av.find((t) => t.avulso.tipo === 'Compra pequena'); r.compra = r.compra && { valor: r.compra.valor, doc: r.compra.cnpjCpf, enc: r.compra.enc.setor };
    await T.ir('#/fPagAv', /Pagamentos avulsos/); r.k = T.kpis(); r.cards = [...document.querySelectorAll('.av-card .t')].map(T.tx);
    const ob = FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === 't:' + DATA.fTitulos.find((t) => t.avulso && t.avulso.tipo === 'Diária').id); r.sit = CPG_FIN.sitU(ob); r.ext = CPG_FIN.ehExtra(ob);
    return r;
  });
  ok(a1.vazio && a1.calc === '1 × R$ 500,00 = R$ 500,00' && a1.valorAuto === '500,00' && a1.setor === 'producao' && a1.cat, `tipo Diária: atividade, quantidade × valor (${a1.calc}), setor Produção e categoria sugeridos`, a1);
  ok(a1.semAut, 'diária sem “quem autorizou” não grava e avisa');
  ok(a1.n === 3 && a1.dia && a1.dia.valor === 500 && a1.dia.pag === 1 && a1.dia.pv === 500 && a1.dia.conta === '__caixa' && a1.dia.aut === 'Abner' && a1.dia.at === 'Limpeza do forno 6' && a1.dia.extra === true && a1.dia.enc === 'producao' && a1.dia.por === 'u_DONO' && a1.sit === 'Pago' && a1.ext,
    'diária gravada uma vez só (clique triplo) como compromisso já pago no Financeiro: Caixa, quem autorizou, quem lançou, atividade e setor', a1.dia);
  ok(a1.prod && a1.prod.valor === 1200 && a1.prod.qtd === 40 && a1.prod.vu === 30 && a1.compra && a1.compra.valor === 300 && a1.compra.doc === '11222333000181' && a1.compra.enc === 'almox',
    'pagamento de produção (40 × R$ 30,00 = R$ 1.200,00) e compra pequena com CNPJ (setor Compras e almoxarifado)', { prod: a1.prod, compra: a1.compra });
  ok(a1.k['Total no período'] === 'R$ 2.000,00' && a1.k['Diárias'] === 'R$ 500,00' && a1.k['Pagamentos de produção'] === 'R$ 1.200,00' && a1.k['Outros avulsos'] === 'R$ 300,00' && a1.cards.length === 3,
    `tela dos avulsos com totais (${Object.entries(a1.k).map(([k, v]) => k + ' ' + v).join(' · ')})`, a1.k);

  /* 2. repetidos: mesmo nome, dia e valor; outra diária no mesmo dia; e o mesmo pagamento já feito no Controle por grade */
  const a2 = await page.evaluate(async () => {
    const r = {}; const n0 = DATA.fTitulos.length;
    await T.avulso({ tipo: 'Diária', desc: 'Diária repetida', benef: 'Antônio Pereira', at: 'Limpeza', au: 'Abner', valor: '500,00' }); r.fechou1 = await T.confirmar(); r.aviso1 = T.tx(document.querySelector('.veu .modal #avDup')); r.vis1 = !document.querySelector('.veu .modal #avDup').hidden;
    T.limpar(); await T.avulso({ tipo: 'Diária', desc: 'Outra diária', benef: 'Antônio Pereira', at: 'Pátio', au: 'Abner', valor: '80,00' }); await T.confirmar(); r.aviso2 = T.tx(document.querySelector('.veu .modal #avDup'));
    T.limpar(); await T.avulso({ tipo: 'Pagamento de produção', desc: 'Desenforna do forno 8', benef: 'José Ribamar', at: 'Desenforna', au: 'Mayara', valor: '350,00' }); await T.confirmar(); r.aviso3 = T.tx(document.querySelector('.veu .modal #avDup'));
    r.nada = DATA.fTitulos.length === n0;
    /* confirmando que é outro pagamento, grava */
    document.querySelector('.veu .modal #avDupOk').click(); r.gravou = await T.confirmar(); await T.sincronizado(); r.n = DATA.fTitulos.length - n0;
    const t = DATA.fTitulos.find((x) => x.descricao === 'Desenforna do forno 8'); r.cancelar = !!t; if (t) { await gravar('fTitulos', { ...clone(t), cancelado: { motivo: 'teste de repetido', em: new Date().toISOString(), por: 'u_DONO' } }, t); await T.sincronizado(); }
    return r;
  });
  ok(!a2.fechou1 && a2.vis1 && /Já existe um pagamento de R\$ 500,00 para Antônio Pereira/.test(a2.aviso1) && /Já existe uma diária para Antônio Pereira/.test(a2.aviso2) && /O Controle por grade já tem um pagamento de R\$ 350,00 para José Ribamar/.test(a2.aviso3) && a2.nada,
    'repetido pede confirmação: mesmo nome, dia e valor; outra diária no mesmo dia; e o pagamento já feito no Controle por grade', a2);
  ok(a2.gravou && a2.n === 1, 'marcando “É outro pagamento”, grava (fica no histórico que foi confirmado)');

  /* 3. resumo financeiro do dia */
  const r3 = await page.evaluate(async () => {
    const r = {}; await T.ir('#/fResumo', /Resumo financeiro do dia/); await T.dorme(300); const c = document.querySelector('#svCorpo');
    r.k = T.kpis(c); r.resp = [...c.querySelectorAll('.rf-resp li')].map((l) => T.tx(l));
    const sec = (t) => { const s = [...c.querySelectorAll('.rf-sec')].find((x) => (x.querySelector('h3') || {}).textContent && x.querySelector('h3').textContent.startsWith(t)); return s ? T.tx(s) : ''; };
    r.cat = sec('Despesas por categoria'); r.set = sec('Despesas por setor'); r.ent = sec('Entradas'); r.pes = sec('Pessoal e produção'); r.bol = sec('Boletos liquidados'); r.av = sec('Pagamentos avulsos'); r.cx = sec('Caixa e bancos');
    r.banner = T.tx(c.querySelector('.rf-fech')); r.botoes = [...c.querySelectorAll('.sec-cab .acoes .btn, .sec-cab button')].map(T.tx);
    const D = CAIXA_DIA_V167.diaDados(hoje()); r.D = { ini: D.saldoIni, tE: D.tE, tS: D.tS, res: D.res, fim: D.saldoFim, nE: D.nE, nS: D.nS, transf: D.transf.length, pes: D.pes };
    return r;
  });
  await foto('01-resumo-dia');
  ok(r3.D.ini === 15000 && r3.D.tE === 8000 && r3.D.tS === 3050 && r3.D.res === 4950 && r3.D.fim === 19950 && r3.D.nE === 1 && r3.D.nS === 5 && r3.D.transf === 2,
    `números do dia: saldo inicial R$ 15.000,00 + entradas R$ 8.000,00 − saídas R$ 3.050,00 = saldo final R$ 19.950,00 (a transferência de R$ 1.000,00 não conta)`, r3.D);
  ok(r3.k['Saldo inicial do dia'] === 'R$ 15.000,00' && r3.k['Entradas'] === 'R$ 8.000,00' && r3.k['Saídas'] === 'R$ 3.050,00' && r3.k['Resultado do dia'] === 'R$ 4.950,00' && r3.k['Saldo final do dia'] === 'R$ 19.950,00',
    `tela: ${['Saldo inicial do dia', 'Entradas', 'Saídas', 'Resultado do dia', 'Saldo final do dia'].map((k) => k + ' ' + r3.k[k]).join(' · ')}`, r3.k);
  ok(r3.resp.length === 7 && r3.resp.some((l) => /Quanto entrou\?\s*R\$ 8\.000,00/.test(l)) && r3.resp.some((l) => /Gasto com produção\s*R\$ 1\.550,00/.test(l)) && r3.resp.some((l) => /Gasto com pessoal.*R\$ 500,00/.test(l)) && r3.resp.some((l) => /Disponível em caixa e bancos\s*R\$ 19\.950,00/.test(l)),
    'as sete perguntas do dono respondidas no alto (entrou, saiu, onde gastou, produção, pessoal, disponível, resultado)', r3.resp);
  ok(/Funcionários|Mão de obra da produção/.test(r3.cat) && /Combustíveis/.test(r3.cat) && /Pagamentos da Produção/.test(r3.cat) && /Produção/.test(r3.set) && /Recebimentos de vendas/.test(r3.ent) && /R\$ 8\.000,00/.test(r3.ent),
    'despesas por categoria e por setor; entradas por origem (recebimentos de vendas)', { cat: r3.cat, set: r3.set, ent: r3.ent });
  ok(/Desenforna \(controle por grade\)\s*R\$ 350,00/.test(r3.pes) && /Mão de obra da produção \(lançada no Financeiro\)\s*R\$ 1\.200,00/.test(r3.pes) && /Diárias\s*R\$ 500,00/.test(r3.pes),
    `pessoal e produção: desenforna do Controle por grade, mão de obra da produção e diárias (${r3.pes.slice(0, 160)})`);
  ok(/Boleto do diesel/.test(r3.bol) && /700,00/.test(r3.bol) && /Antônio Pereira|Diária na limpeza/.test(r3.av) && /Padaria Central|Pão e café/.test(r3.av), 'boletos liquidados e pagamentos avulsos do dia');
  ok(/Caixa \(dinheiro\)\s*R\$ 10\.000,00\s*R\$ 0,00\s*R\$ 4\.050,00\s*R\$ 5\.950,00/.test(r3.cx) && /Banco do Brasil\s*R\$ 5\.000,00\s*R\$ 9\.000,00\s*R\$ 0,00\s*R\$ 14\.000,00/.test(r3.cx) && /Transferências entre contas/.test(r3.cx),
    'caixa e bancos: inicial, entradas, saídas e final de cada conta (a transferência aparece à parte)', r3.cx);
  ok(/Dia aberto/.test(r3.banner) && r3.botoes.some((b) => /Enviar relatório ao proprietário/.test(b)) && r3.botoes.some((b) => /Fechamento do dia/.test(b)), 'dia aberto, com os botões “Enviar relatório ao proprietário” e “Fechamento do dia”');

  /* 4. fechamento do dia */
  const r4 = await page.evaluate(async () => {
    const r = {}; document.querySelector('#rfFech').click(); await T.esperar(() => document.querySelector('.veu .modal #fcE')); const m = document.querySelector('.veu .modal');
    r.itens = [...m.querySelectorAll('.rf-it > b')].map(T.tx);
    r.semConf = !(await T.confirmar()); r.aviso = T.ultimoToast();
    m.querySelector('#fcE').click(); m.querySelector('#fcS').click(); T.val('#fcO', 'Caixa conferido com o Gustavo'); r.fechou = await T.confirmar(); await T.sincronizado();
    const F = DATA.fin.find((x) => x.tipo === 'fechamento' && x.data === hoje()); r.F = F && { ent: F.snap.ent, sai: F.snap.sai, fim: F.snap.saldoFim, n: F.snap.movs.length, por: F.fechadoPor, obs: F.obs, pend: F.pend.length, v: F.versao };
    await T.ir('#/fResumo', /Dia fechado/); r.banner = T.tx(document.querySelector('.rf-fech'));
    /* depois de fechado, um pagamento novo no dia: aparece como mudança */
    await T.avulso({ tipo: 'Frete', desc: 'Frete de areia', benef: 'Fretes JR', valor: '50,00' }); await T.confirmar(); await T.sincronizado();
    await T.ir('#/fResumo', /Mudou depois do fechamento/); r.banner2 = T.tx(document.querySelector('.rf-fech')); r.botao = T.tx(document.querySelector('#rfFech'));
    document.querySelector('#rfFech').click(); await T.esperar(() => document.querySelector('.veu .modal #fcE')); const m2 = document.querySelector('.veu .modal'); r.janela2 = T.tx(m2.querySelector('.aviso'));
    m2.querySelector('#fcE').click(); m2.querySelector('#fcS').click(); await T.confirmar(); await T.sincronizado();
    const F2 = DATA.fin.find((x) => x.tipo === 'fechamento' && x.data === hoje()); r.F2 = { v: F2.versao, sai: F2.snap.sai, hist: F2.hist.length, histSai: F2.hist[0] && F2.hist[0].sai, n: DATA.fin.filter((x) => x.tipo === 'fechamento').length };
    await T.ir('#/fResumo', /Dia fechado/); r.banner3 = T.tx(document.querySelector('.rf-fech')); r.ant = [...document.querySelectorAll('#rfAnt tbody tr')].map(T.tx);
    return r;
  });
  ok(r4.itens.length === 7 && /Entradas: R\$ 8\.000,00 · 1 recebimento/.test(r4.itens[0]) && /Saídas: R\$ 3\.050,00 · 5 pagamentos/.test(r4.itens[1]) && r4.itens.some((i) => /sem comprovante anexado/.test(i)) && r4.itens.some((i) => /venceu no dia e não foi paga \(R\$ 120,00\)/.test(i)) && r4.itens.some((i) => /ainda não foi contado/.test(i)),
    `a janela de fechamento traz as conferências: ${r4.itens.slice(2).join(' | ')}`, r4.itens);
  ok(r4.semConf && /conferiu as entradas e as saídas/.test(r4.aviso), 'sem marcar que conferiu entradas e saídas, não fecha');
  ok(r4.fechou && r4.F && r4.F.ent === 8000 && r4.F.sai === 3050 && r4.F.fim === 19950 && r4.F.n === 8 && r4.F.por === 'u_DONO' && r4.F.obs === 'Caixa conferido com o Gustavo' && r4.F.pend >= 2 && r4.F.v === 1 && /Dia fechado por/.test(r4.banner),
    'dia fechado: guarda os números, os lançamentos, quem fechou, a observação e as pendências encontradas', r4.F);
  ok(/Mudou depois do fechamento/.test(r4.banner2) && /entrou depois: saída R\$ 50,00 · Fretes JR/.test(r4.banner2) && /Refazer o fechamento/.test(r4.botao) && /Mudou depois: 1 lançamento/.test(r4.janela2),
    `depois de fechado, o que mudou fica à vista (${r4.banner2.slice(0, 140)}…)`);
  ok(r4.F2.v === 2 && r4.F2.sai === 3100 && r4.F2.hist === 1 && r4.F2.histSai === 3050 && r4.F2.n === 1 && /Dia fechado/.test(r4.banner3) && r4.ant.length === 1 && /3\.100,00/.test(r4.ant[0]) && /refeito/.test(r4.ant[0]),
    'refazer o fechamento guarda o anterior no histórico (um registro por dia, nada apagado) e “Relatórios anteriores” mostra o dia', r4.F2);

  /* 5. relatório ao proprietário: documento da empresa e resumo para o WhatsApp */
  const r5 = await page.evaluate(async () => {
    const r = {}; const R = CAIXA_DIA_V167.dadosRel(hoje()); r.extras = R.extras.map((x) => x.titulo); r.linhas = R.rows.length; r.txt = CAIXA_DIA_V167.textoRel(hoje());
    document.querySelector('#rfRel').click(); await T.dorme(250); r.menu = [...document.querySelectorAll('.dc-pop [data-i]')].map((b) => T.tx(b.querySelector('b') || b).replace(/\s*(dias fechados|resumo pronto.*|WhatsApp, e-mail.*)$/, ''));
    [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Enviar ao proprietário pelo WhatsApp/.test(b.textContent)).click(); await T.dorme(200); r.wa = (window.__abertos || []).pop() || '';
    document.querySelector('#rfRel').click(); await T.dorme(250); [...document.querySelectorAll('.dc-pop [data-i]')].find((b) => /Visualizar o relatório/.test(b.textContent)).click();
    await T.esperar(() => location.hash === '#/documento' || /responsável por este relatório/.test(T.tx(document.querySelector('.veu .modal'))));
    if (location.hash !== '#/documento') { const m = document.querySelector('.veu .modal'); r.resp = T.tx(m); const op = m.querySelector('input[type=radio], [data-resp], button:not([data-r])'); if (op && op.type === 'radio') op.click(); const g = [...m.querySelectorAll('button')].find((b) => /Gerar relatório/.test(b.textContent)); if (g) g.click(); }
    await T.esperar(() => location.hash === '#/documento'); await T.dorme(900); r.doc = document.querySelector('#conteudo').textContent.replace(/\s+/g, ' ').slice(0, 8000);
    JBNAV.voltar(); await T.esperar(() => /^#\/fResumo/.test(location.hash)); r.voltou = location.hash; return r;
  });
  ok(r5.extras.join('|') === 'Resultado do dia|Entradas por origem|Despesas por categoria|Despesas por setor|Pessoal e produção|Boletos liquidados|Pagamentos avulsos|Caixa e bancos|Transferências entre contas (não são receita nem despesa)' && r5.linhas === 7,
    'relatório com resultado, entradas, despesas por categoria e setor, pessoal e produção, boletos, avulsos, caixa e bancos e transferências', r5.extras);
  ok(/RESUMO FINANCEIRO DIÁRIO/.test(r5.txt) && /\*ENTRADAS\*\n- Recebimentos de vendas: R\$\s8\.000,00\nTotal de entradas: R\$\s8\.000,00/.test(r5.txt) && /Total de saídas: R\$\s3\.100,00/.test(r5.txt) && /- Resultado líquido: R\$\s4\.900,00/.test(r5.txt) && /Saldo inicial: R\$\s15\.000,00\nSaldo final: R\$\s19\.900,00/.test(r5.txt) && /Dia fechado por/.test(r5.txt),
    'resumo pronto para o WhatsApp no formato do pedido (entradas, saídas, resultado, saldo inicial e final, fechamento)', r5.txt);
  ok(['Visualizar o relatório', 'Gerar PDF', 'Imprimir', 'Compartilhar o PDF', 'Enviar ao proprietário pelo WhatsApp', 'Copiar o resumo', 'Baixar planilha (Excel)', 'Relatórios anteriores'].every((x, i) => (r5.menu[i] || '').startsWith(x)) && /^https:\/\/wa\.me\/\?text=/.test(r5.wa) && /RESUMO%20FINANCEIRO/.test(r5.wa),
    '“Enviar relatório ao proprietário”: visualizar, PDF, imprimir, compartilhar, WhatsApp, copiar e planilha', r5.menu);
  ok(/Resumo financeiro diário/i.test(r5.doc) && /Resultado do dia/i.test(r5.doc) && /Pessoal e produção/i.test(r5.doc) && /Construtora Exemplo/.test(r5.doc) && /^#\/fResumo/.test(r5.voltou), 'o relatório abre no padrão de documentos da empresa e o Voltar retorna ao resumo');

  /* 6. outro dia, painel do caixa e as telas antigas (Fluxo de caixa e Caixa e bancos) com o Controle por grade */
  const r6 = await page.evaluate(async () => {
    const r = {}; const ontem = addDias(hoje(), -1); await T.ir('#/fResumo/' + ontem, /Resumo financeiro do dia/); r.kOntem = T.kpis(document.querySelector('#svCorpo')); r.bOntem = T.tx(document.querySelector('.rf-fech'));
    await T.ir('#/fResumo', /Painel do caixa/); const P = [...document.querySelectorAll('.rf-sec')].find((s) => /Painel do caixa/.test(s.textContent)); r.painel = T.kpis(P); r.barras = [...P.querySelectorAll('.rf-ch-b i')].filter((i) => parseFloat(i.style.height) > 0).length;
    P.querySelector('[data-rfg2="mes"]').click(); await T.dorme(400); const P2 = [...document.querySelectorAll('.rf-sec')].find((s) => /Painel do caixa/.test(s.textContent)); r.meses = P2.querySelectorAll('details tbody tr').length; r.on = T.tx(P2.querySelector('.rf-seg .on'));
    const MV = window.movimentosV48(); r.grade = MV.filter((m) => m.grade).map((m) => m.categoria + ' ' + m.valor + ' ' + m.conta).join(); r.saldoCaixa = window.saldoMovV48('__caixa', hoje(), MV);
    await T.ir('#/ffluxo', /Fluxo de caixa/); r.fluxo = /Pagamentos da Produção/.test(T.tx(document.querySelector('#svCorpo')));
    return r;
  });
  ok(r6.kOntem['Saldo inicial do dia'] === 'R$ 15.000,00' && r6.kOntem['Entradas'] === 'R$ 0,00' && r6.kOntem['Saídas'] === 'R$ 0,00' && r6.kOntem['Saldo final do dia'] === 'R$ 15.000,00' && /não fechado/.test(r6.bOntem),
    'o dia anterior abre pelo endereço (sem movimento: saldo inicial = final = R$ 15.000,00, “não fechado”)', r6.kOntem);
  ok(r6.painel['Saldo acumulado'] === 'R$ 19.900,00' && r6.painel['Receitas do mês'] === 'R$ 8.000,00' && r6.painel['Despesas do mês'] === 'R$ 3.100,00' && r6.painel['Contas a pagar'] === 'R$ 120,00' && r6.painel['Contas a receber'] === 'R$ 4.000,00' && r6.barras >= 2 && r6.meses === 6 && r6.on === 'Meses',
    `painel do caixa: ${Object.entries(r6.painel).map(([k, v]) => k + ' ' + v).join(' · ')}; gráfico por dia, semana e mês`, r6.painel);
  ok(r6.grade === 'Pagamentos da Produção 350 __caixa' && r6.saldoCaixa === 5900 && r6.fluxo, 'o pagamento do Controle por grade entra no caixa (saldo do Caixa R$ 5.900,00) e no Fluxo de caixa realizado como “Pagamentos da Produção”', r6);

  /* 7. menu, favoritos, busca e celular */
  const r7 = await page.evaluate(async () => {
    await T.ir('#/setor-financeiro', /./); await T.dorme(400); const todas = [...document.querySelectorAll('.sv-abas a')].map(T.tx); const r = { todas, abas: todas.slice(0, 7), favs: [...document.querySelectorAll('#conteudo .c2-pill')].map(T.tx) };
    r.busca = pqEntradas().filter((e) => e.h === '#/fResumo' || e.h === '#/fPagAv').length; return r;
  });
  ok(r7.abas.slice(3, 5).join('|') === 'Boletos e contas a pagar|Resumo financeiro do dia' && r7.todas.indexOf('Pagamentos avulsos') > r7.todas.indexOf('Outros pagamentos') && r7.favs.some((f) => /Resumo financeiro do dia/.test(f)) && r7.busca === 2, `no menu do Financeiro (${r7.abas.join(' · ')}), nos favoritos e na busca geral`, r7);
  await page.setViewportSize({ width: 390, height: 844 });
  const r8 = await page.evaluate(async () => { const r = {}; await T.ir('#/fResumo', /Resumo financeiro do dia/); await T.dorme(400); r.resumo = document.documentElement.scrollWidth <= 392;
    await T.ir('#/fPagAv', /Pagamentos avulsos/); await T.dorme(300); r.av = document.documentElement.scrollWidth <= 392; window.CAIXA_DIA_V167.novoAvulso({}); await T.dorme(400); r.form = document.querySelector('.veu .modal').scrollWidth <= document.querySelector('.veu .modal').clientWidth + 2; T.limpar(); return r; });
  await foto('02-celular');
  ok(r8.resumo && r8.av && r8.form, 'no celular (390 px) o resumo, os avulsos e o formulário cabem na largura');

  /* 8. depois de atualizar a página: tudo igual */
  await page.evaluate(async () => { await T.sincronizado(); const dump = []; window.__srv.estado.docs.forEach((d) => dump.push([d.colecao, d.id, d.dados])); sessionStorage.setItem('__srv_cx', JSON.stringify(dump)); });
  const antes = await page.evaluate(() => JSON.stringify(CAIXA_DIA_V167.diaDados(hoje()).tS) + '|' + DATA.fTitulos.filter((t) => t.avulso).length + '|' + (DATA.fin.find((x) => x.tipo === 'fechamento') || {}).versao);
  await page.reload(); await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 }); await utilidades();
  const depois = await page.evaluate(async () => { await T.dorme(800); return JSON.stringify(CAIXA_DIA_V167.diaDados(hoje()).tS) + '|' + DATA.fTitulos.filter((t) => t.avulso).length + '|' + (DATA.fin.find((x) => x.tipo === 'fechamento') || {}).versao; });
  ok(antes === depois, `depois de atualizar a página: saídas do dia, avulsos e fechamento iguais (${depois})`);
  ok(!erros.length, 'nenhum erro de JavaScript durante o teste' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  console.log('  ✘ o teste parou: ' + (e && e.message ? e.message.slice(0, 900) : e)); falhas++;
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
