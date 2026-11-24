#!/usr/bin/env node
// Teste de ponta a ponta do Controle de almoço da Cozinha (V160), no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs, com o gatilho do almoço imitado:
// mês com folha fechada não muda, lançamento não se apaga, o banco carimba o histórico e o valor do dia). Dados fictícios.
//  - o controle fica só na parte da Cozinha do Setor do Almoxarifado / Cozinha (botões, menu Módulos, telas próprias)
//  - lista do dia: só os ativos do Setor Pessoal, em ordem alfabética, com busca; afastado, demitido e admitido
//    depois do dia ficam fora (quem saiu depois aparece nos dias em que trabalhava)
//  - SIM fica verde e lança na hora, NÃO fica cinza e não desconta, troca de SIM/NÃO com o histórico de quem marcou,
//    "Marcar todos como SIM" (só quem está sem marcação) e "Desfazer", rodapé com almoços e valor do dia
//  - valor do almoço: só daqui pra frente (os dias já lançados guardam o valor antigo), agendar e cancelar
//  - cadastro rápido: vai para o cadastro do Setor Pessoal (sem lista separada) e aparece na lista do dia
//  - folha: evento "Desconto refeição" no extrato, na folha, no recibo e no holerite; folha fechada trava o mês
//    (na tela e no banco); folha antiga sem almoço continua igual
//  - relatórios por funcionário e por dia, histórico, PDF e Excel; perfil Cozinha só vê o almoço
//  - celular: botões grandes, rodapé à vista e nada rolando para o lado; nenhum erro de JavaScript
// Uso: node scripts/construir.mjs && node scripts/testar-almoco.mjs        (FOTOS=<pasta> guarda capturas das telas)
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

/* datas relativas ao dia em que o teste roda (o navegador usa o mesmo relógio) */
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dia = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d); };
const HOJE = dia(0), ONTEM = dia(-1);
const mesMenos = (m, n) => { let [y, mm] = m.split('-').map(Number); mm -= n; while (mm < 1) { mm += 12; y--; } return y + '-' + pad(mm); };
const MES = HOJE.slice(0, 7), MES_FECHADO = mesMenos(MES, 2), DIA_FECHADO = MES_FECHADO + '-10';

/* CPFs fictícios com dígitos válidos */
function cpf(base) { const d = String(base).padStart(9, '0').split('').map(Number);
  const dv = (arr, p) => { const s = arr.reduce((a, x, i) => a + x * (p - i), 0); const r = (s * 10) % 11 % 10; return r; };
  const d1 = dv(d, 10), d2 = dv([...d, d1], 11); return d.join('') + d1 + d2; }
const CPF_ANA = cpf(123456789), CPF_NOVO = cpf(987654321);

const F = (id, nome, extra) => ['funcionarios', id, { id, nome, situacao: 'Ativo', admissao: '2025-01-10', ...extra }];
const docsIniciais = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', cnpj: '11.222.333/0001-81', cidade: 'Cidade Exemplo/MA' } }],
  F('f_ana', 'Ana Teste Ativa', { cargo: 'Cozinheira', matricula: '0001', setor: 'Administrativo', tipoContratacao: 'Empregado CLT', formaRemuneracao: 'Mensal fixo' }),
  F('f_bru', 'Bruno Teste Ativo', { cargo: 'Ajudante de produção', matricula: '0002', setor: 'Produção', tipoContratacao: 'Empregado CLT', formaRemuneracao: 'Mensal fixo' }),
  F('f_car', 'Carla Teste Ativa', { matricula: '0003', setor: 'Queima', tipoContratacao: 'Sem carteira assinada (diarista ou informal)', formaRemuneracao: 'Diária' }),
  F('f_dav', 'Davi Teste Afastado', { situacao: 'Afastado', matricula: '0004', setor: 'Produção' }),
  F('f_edu', 'Edu Teste Desligado', { situacao: 'Desligado', dataDesligamento: ONTEM, matricula: '0005', setor: 'Produção' }),
  F('f_fab', 'Fabio Teste Futuro', { admissao: dia(5), matricula: '0006', setor: 'Produção' }),
  ['sensivel', 'f_ana', { id: 'f_ana', cpf: CPF_ANA, salario: 2000 }],
  ['sensivel', 'f_bru', { id: 'f_bru', cpf: cpf(222333444), salario: 1800 }],
  ['sensivel', 'f_car', { id: 'f_car', cpf: cpf(333444555), valorDiaria: 90 }],
  ['folhas', MES_FECHADO, { id: MES_FECHADO, competencia: MES_FECHADO, situacao: 'Fechada', itens: [], totais: { pessoas: 0, liquido: 0 }, fechadoEm: MES_FECHADO + '-28T18:00:00.000Z' }],
  ['almocoCfg', 'valor', { id: 'valor', tabela: [{ id: 'v_ini', desde: MES_FECHADO + '-01', valor: 5, por: 'u_DONO', em: MES_FECHADO + '-01T10:00:00.000Z' }] }],
  ['producaoSetor', 'ps_1', { id: 'ps_1', data: HOJE, tipo: 'Produção do dia', quantidade: 12000, obs: 'lançamento antigo de produção' }],
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
const ok = (c, m, det) => { console.log(`  ${c ? '✔' : '✘'} ${m}${!c && det !== undefined ? ' → ' + JSON.stringify(det).slice(0, 700) : ''}`); if (!c) falhas++; };
const limpa = (o) => (typeof o === 'string' ? o.replace(/\u00a0/g, ' ') : Array.isArray(o) ? o.map(limpa) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, limpa(v)])) : o);

async function abrir(docs, mobile) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1366, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    let srv = null;
    const doc = (c, i) => { const d = srv.estado.docs.get(c + '/' + i); return d ? d.dados : null; };
    const erroSrv = (codigo, msg) => { const e = new Error(msg); e.codigo = codigo; return e; };
    const precoSrv = (d) => { const t = ((doc('almocoCfg', 'valor') || {}).tabela || []).map((e, i) => ({ e, i })).filter((x) => x.e && !x.e.cancelado && x.e.desde <= d);
      t.sort((a, b) => b.e.desde.localeCompare(a.e.desde) || String(b.e.em || '').localeCompare(String(a.e.em || '')) || b.i - a.i); return t.length ? +t[0].e.valor : null; };
    const travaSrv = (m) => { const f = doc('folhas', m); return (f && f.situacao && f.situacao !== 'Aberta') || window.__travaSrv === m; };
    /* o mesmo que o gatilho seg.almoco_proteger faz no banco real */
    const antesDeGravar = (colecao, id, antes, depois) => {
      if (colecao.split('/')[0] !== 'almoco') return depois;
      const a = (antes && antes.items) || {}, b = (depois && depois.items) || {}, meses = new Set();
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const va = a[k], vb = b[k], ea = !!va && typeof va === 'object', eb = !!vb && typeof vb === 'object';
        if (!ea && !eb) continue; if (ea && eb && JSON.stringify(va) === JSON.stringify(vb)) continue;
        if (ea) meses.add(String(va.data).slice(0, 7));
        if (!eb) throw erroSrv('JB409', 'Lançamento de almoço não se apaga: para corrigir, marque SIM ou NÃO.');
        if (window.__recusaFid && vb.funcionarioId === window.__recusaFid) throw erroSrv('22023', 'Funcionário não encontrado no Setor Pessoal.');
        meses.add(String(vb.data).slice(0, 7));
        const simAnt = ea ? (va.sim === undefined ? null : va.sim) : undefined;
        let valor = 0;
        if (vb.sim === true) { valor = ea && va.sim === true ? +va.valor || 0 : precoSrv(vb.data); if (valor == null) throw erroSrv('JB422', 'O valor do almoço ainda não foi definido para ' + vb.data + '.'); }
        const hist = ea && Array.isArray(va.hist) ? va.hist.slice() : [];
        if (!ea || simAnt !== vb.sim) hist.push([vb.sim === true ? 1 : vb.sim === false ? 0 : null, 'u_DONO', new Date().toISOString()]);
        b[k] = { id: k, funcionarioId: vb.funcionarioId, data: vb.data, sim: vb.sim, valor, hist };
      }
      for (const m of meses) if (travaSrv(m)) throw erroSrv('JB423', 'A folha de ' + m.slice(5, 7) + '/' + m.slice(0, 4) + ' já foi fechada no Setor Pessoal. Os almoços desse mês não mudam mais: para corrigir, o Pessoal precisa reabrir a folha.');
      if (depois) depois.items = b;
      return depois;
    };
    srv = criar({ admins: ['u_DONO'], antesDeGravar });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    window.__exp = [];
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: i === 'u_DONO' ? 'Dono' : 'Outro' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.evaluate(() => {
    /* guarda o que foi exportado (PDF e Excel) sem baixar nada */
    const e0 = window.exportar; window.exportar = function (f, nome, cols, rows, titulo, opc) { window.__exp.push({ f, nome, cols: cols.map((c) => c.l), n: rows.length, rows, titulo, opc }); return true; };
    window.__e0 = e0;
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | avisos: ' + [...document.querySelectorAll('.alm-err,#toasts .toast')].map((x) => x.textContent.trim()).filter(Boolean).join(' / ')); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(300); },
      confirmar: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]')); document.querySelector('.veu .modal [data-r="1"]').click(); await T.dorme(250); },
      linha: (fid) => document.querySelector('.alm-lin[data-fid="' + fid + '"]'),
      st: (fid) => { const l = T.linha(fid); return l ? (l.classList.contains('sim') ? 'sim' : l.classList.contains('nao') ? 'nao' : 'falta') : 'ausente'; },
      tocar: async (fid, k) => { const b = T.linha(fid).querySelector(k === 'sim' ? '.bs' : '.bn'); b.click(); await T.dorme(150); },
      rod: () => [...document.querySelectorAll('#almRod b')].map((b) => b.textContent.trim()),
      nomes: () => [...document.querySelectorAll('.alm-lin:not([hidden]) .alm-nm b')].map((b) => b.textContent.trim()),
      item: (d, fid) => { for (const x of window.__srv.estado.docs.values()) { if (x.colecao === 'almoco' && x.dados.items && x.dados.items['al-' + d + '-' + fid]) return x.dados.items['al-' + d + '-' + fid]; } return null; },
      toasts: () => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent),
      fora: () => JSON.stringify([...window.__srv.estado.docs.values()].filter((d) => !['almoco', 'almocoCfg', 'funcionarios', 'sensivel', 'log', 'ws', 'diagnostico', 'uso'].includes(d.colecao)).map((d) => [d.colecao, d.id, d.dados]).sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]))),
      semRolagemLateral: () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    };
  });
  return { ctx, page, erros };
}

try {
  const { page, erros } = await abrir(docsIniciais, false);
  const foto = async (nome) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, nome + '.png'), fullPage: false }); };
  const avaliar = async (fn, arg) => limpa(await page.evaluate(fn, arg));
  const ir = async (rota, sel) => { await page.evaluate((r) => JBNAV.ir(r), rota); await page.waitForSelector(sel, { timeout: 15000 }); await page.waitForTimeout(350); };
  const antes = await avaliar(() => T.fora());

  console.log('Só na parte da Cozinha do setor');
  await ir('#/setor-almox', '[data-alm-bt]');
  const ini = await avaliar(() => { const a = [...document.querySelector('[data-alm-bt]').parentElement.querySelectorAll('a')].map((x) => x.textContent.trim());
    const abas = [...document.querySelectorAll('.sv-abas a')].map((x) => x.textContent.trim()); return { a, abas }; });
  ok(ini.a.indexOf('Almoço do dia') === ini.a.indexOf('Cozinha') + 1, 'no início do setor, o botão "Almoço do dia" fica logo depois do "Cozinha": ' + ini.a.join(' | '));
  const iC = ini.abas.indexOf('Cozinha');
  ok(iC >= 0 && ini.abas.slice(iC + 1, iC + 5).join() === 'Almoço do dia,Relatórios do almoço,Histórico do almoço,Valor do almoço', 'no menu Módulos do setor, as 4 telas do almoço ficam juntas, logo depois da Cozinha (separadas do almoxarifado)');
  await ir('#/almCozinha', '[data-alm-bt]');
  ok(await avaliar(() => document.querySelector('[data-alm-bt]').textContent.trim() === 'Controle de almoço'), 'a tela da Cozinha (estoque da cozinha) tem o botão "Controle de almoço"');

  console.log('Lista do dia');
  await ir('#/almoco', '.alm-tela .alm-lin');
  await foto('01-dia-vazio');
  const l0 = await avaliar(() => ({ nomes: T.nomes(), preco: document.querySelector('.alm-preco').textContent, rod: T.rod(), data: document.querySelector('.alm-dt b').textContent, todos: !!document.querySelector('[data-alm-todos]:not([hidden])') }));
  ok(l0.nomes.join() === 'Ana Teste Ativa,Bruno Teste Ativo,Carla Teste Ativa', 'só os ativos do Setor Pessoal, em ordem alfabética (afastado, demitido e admitido depois ficam fora): ' + l0.nomes.join(', '));
  ok(/R\$ 5,00/.test(l0.preco) && l0.rod.join() === '0,R$ 0,00,3', 'mostra o valor do almoço do dia e o rodapé zerado (almoços, valor do dia, faltam marcar): ' + l0.rod.join(' | '));
  ok(l0.data.length === 10 && l0.todos, 'a data de hoje no alto e o botão "Marcar todos como SIM"');
  const funcao = await avaliar(() => [...document.querySelectorAll('.alm-lin .fn')].map((x) => x.textContent));
  ok(funcao.join() === 'Cozinheira,Ajudante de produção,Queima', 'cada linha mostra a função do cadastro (sem função, o setor): ' + funcao.join(', '));

  console.log('SIM, NÃO e troca');
  const m1 = await avaliar(async ({ HOJE }) => {
    await T.tocar('f_ana', 'sim'); const v1 = { st: T.st('f_ana'), rod: T.rod() };
    await T.sincronizado(); const i1 = T.item(HOJE, 'f_ana');
    await T.tocar('f_bru', 'nao'); await T.sincronizado(); const i2 = T.item(HOJE, 'f_bru');
    const v2 = { st: T.st('f_bru'), rod: T.rod() };
    await T.tocar('f_ana', 'nao'); await T.sincronizado(); const i3 = T.item(HOJE, 'f_ana'); const v3 = T.rod();
    await T.tocar('f_ana', 'sim'); await T.sincronizado(); const i4 = T.item(HOJE, 'f_ana');
    return { v1, i1, i2, v2, i3, v3, i4, st: T.st('f_ana'), marc: T.linha('f_ana').querySelector('.mc').textContent };
  }, { HOJE });
  ok(m1.v1.st === 'sim' && m1.v1.rod.join() === '1,R$ 5,00,2', 'SIM: a linha fica verde e o rodapé soma na hora (antes de o banco responder)');
  ok(m1.i1 && m1.i1.sim === true && m1.i1.valor === 5 && m1.i1.funcionarioId === 'f_ana' && m1.i1.hist.length === 1 && m1.i1.hist[0][1] === 'u_DONO', 'o SIM vira lançamento ligado ao funcionário e ao dia, com o valor do dia e quem marcou');
  ok(m1.v2.st === 'nao' && m1.i2.sim === false && m1.i2.valor === 0 && m1.v2.rod.join() === '1,R$ 5,00,1', 'NÃO: a linha fica cinza e nada é descontado');
  ok(m1.i3.sim === false && m1.i3.valor === 0 && m1.i3.hist.length === 2 && m1.v3.join() === '0,R$ 0,00,1', 'trocar SIM por NÃO corrige o lançamento (sai do desconto) e o histórico guarda as duas marcações');
  ok(m1.i4.sim === true && m1.i4.valor === 5 && m1.i4.hist.length === 3 && m1.st === 'sim', 'trocar de volta para SIM volta a descontar: histórico com 3 marcações');
  ok(/SIM · Dono às \d\d:\d\d/.test(m1.marc), 'a linha mostra quem marcou e a hora: ' + m1.marc);
  const hm = await avaliar(async () => { document.querySelector('[data-alm-ver="f_ana"]').click(); await T.dorme(250);
    const t = [...document.querySelectorAll('.veu .alm-hist li')].map((li) => li.textContent.replace(/\s+/g, ' ')); document.querySelector('.veu [data-x]').click(); await T.dorme(200); return t; });
  ok(hm.length === 3 && /^SIM/.test(hm[0]) && /^NÃO/.test(hm[1]) && /^SIM/.test(hm[2]) && hm.every((x) => /Dono · \d\d\/\d\d\/\d{4} às \d\d:\d\d/.test(x)), 'tocar no nome mostra as marcações do dia com quem marcou, a data e a hora');

  console.log('Marcar todos como SIM e Desfazer');
  const mt = await avaliar(async ({ HOJE }) => {
    document.querySelector('[data-alm-todos]').click(); await T.dorme(200);
    const txt = document.querySelector('.veu .modal').textContent; await T.confirmar(); await T.sincronizado();
    const sts = ['f_ana', 'f_bru', 'f_car'].map(T.st); const rod = T.rod(); const desf = !!document.querySelector('.alm-desf button');
    const car = T.item(HOJE, 'f_car');
    document.querySelector('.alm-desf button').click(); await T.dorme(300); await T.sincronizado();
    return { txt, sts, rod, desf, car, depois: ['f_ana', 'f_bru', 'f_car'].map(T.st), car2: T.item(HOJE, 'f_car'), todos: !!document.querySelector('[data-alm-todos]:not([hidden])') };
  }, { HOJE });
  ok(/Marcar 1 pessoa como SIM/.test(mt.txt) && /continua NÃO/.test(mt.txt), 'pede confirmação dizendo quantos e que quem está NÃO continua NÃO');
  ok(mt.sts.join() === 'sim,nao,sim' && mt.rod.join() === '2,R$ 10,00,0' && mt.car.sim === true && mt.car.valor === 5, 'marca SIM só quem estava sem marcação (o NÃO continua NÃO)');
  ok(mt.desf && mt.depois.join() === 'sim,nao,falta' && mt.car2.sim === null && mt.car2.hist.length === 2 && mt.car2.hist[1][0] === null, '"Desfazer" volta quem foi marcado pelo botão para sem marcação, sem apagar o histórico');
  ok(mt.todos, 'com alguém sem marcação, o "Marcar todos" volta a aparecer');

  console.log('Busca');
  const bu = await avaliar(async () => { const q = document.querySelector('#almBusca'); q.value = 'bru'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(100);
    const a = T.nomes(); q.value = 'zzz'; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(100);
    const nada = !document.querySelector('#almNada').hidden, cad = !!document.querySelector('#almNada [data-alm-novo]');
    q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); await T.dorme(100); return { a, nada, cad, todos: T.nomes().length }; });
  ok(bu.a.join() === 'Bruno Teste Ativo' && bu.nada && bu.cad && bu.todos === 3, 'a busca pelo nome filtra na hora; sem resultado, oferece "Cadastrar novo funcionário"');
  await foto('02-dia-marcado');

  console.log('Outros dias');
  const od = await avaliar(async ({ ONTEM, DIA_FECHADO, amanha }) => {
    const di = document.querySelector('#almData'); di.value = ONTEM; di.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    const ontem = T.nomes(); const voltar = !!document.querySelector('[data-alm-hoje]');
    const d2 = document.querySelector('#almData'); d2.value = DIA_FECHADO; d2.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    const trava = document.querySelector('.alm-aviso.trava') ? document.querySelector('.alm-aviso.trava').textContent : '';
    const desab = [...document.querySelectorAll('.alm-bts button')].every((b) => b.disabled); const todos = !!document.querySelector('[data-alm-todos]');
    const d3 = document.querySelector('#almData'); d3.value = amanha; d3.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    const futuro = document.querySelector('#almData').value;
    document.querySelector('[data-alm-ir="-1"]').click(); await T.dorme(250); const seta = document.querySelector('#almData').value;
    document.querySelector('[data-alm-hoje]').click(); await T.dorme(250);
    return { ontem, voltar, trava, desab, todos, futuro, seta, hoje: document.querySelector('#almData').value, max: document.querySelector('#almData').max };
  }, { ONTEM, DIA_FECHADO, amanha: dia(1) });
  ok(od.ontem.includes('Edu Teste Desligado') && od.voltar, 'em outro dia aparece quem ainda trabalhava naquele dia (desligado depois), com "Voltar para hoje"');
  ok(/folha de .+ já foi fechada no Setor Pessoal/.test(od.trava) && od.desab && !od.todos, 'mês com a folha fechada: aviso, SIM e NÃO travados e sem "Marcar todos"');
  ok(od.futuro === HOJE && od.max === HOJE && od.seta === ONTEM && od.hoje === HOJE, 'dia que ainda não chegou não abre (fica em hoje); as setas andam um dia');

  console.log('Folha fechada no banco (outro aparelho fechou antes de a tela saber)');
  const fb = await avaliar(async ({ MES }) => { window.__travaSrv = MES; await T.tocar('f_car', 'nao'); await T.esperar(() => T.toasts().some((t) => /folha/.test(t)), 8000); await T.dorme(400);
    const r = { st: T.st('f_car'), msg: T.toasts().find((t) => /folha/.test(t)) }; window.__travaSrv = ''; return r; }, { MES });
  ok(fb.st === 'falta' && /já foi fechada no Setor Pessoal/.test(fb.msg), 'o banco recusa o mês fechado; a linha volta como estava e a mensagem explica: ' + (fb.msg || '').slice(0, 90));

  console.log('Recusa do banco num lançamento (sem criar a parte do mês de novo)');
  const rc = await avaliar(async ({ HOJE }) => { window.__recusaFid = 'f_car'; const antes = JSON.stringify(T.item(HOJE, 'f_ana'));
    await T.tocar('f_car', 'sim'); await T.esperar(() => T.toasts().some((t) => /não encontrado/.test(t)), 8000); await T.dorme(400);
    const r = { st: T.st('f_car'), msg: T.toasts().find((t) => /não encontrado/.test(t)), ana: JSON.stringify(T.item(HOJE, 'f_ana')) === antes };
    window.__recusaFid = ''; return r; }, { HOJE });
  ok(rc.st === 'falta' && /Carla Teste Ativa: Funcionário não encontrado no Setor Pessoal/.test(rc.msg) && rc.ana, 'erro de um lançamento volta para a tela com a mensagem do banco, e os outros lançamentos do mês ficam como estavam', rc);

  console.log('Cadastro rápido de funcionário');
  const cr = await avaliar(async ({ CPF_ANA, CPF_NOVO }) => {
    document.querySelector('.sec-cab [data-alm-novo]').click(); await T.dorme(250);
    const v = () => document.querySelector('.veu:not(.saindo) .alm-modal'); /* a cópia que some na animação de fechar não conta */
    const campos = [...v().querySelectorAll('label')].map((l) => l.textContent.replace(/\s*\*\s*$/, '').trim());
    const set = (sel, x) => { const e = v().querySelector(sel); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); };
    /* o programa ignora um segundo clique no mesmo botão de salvar em menos de 0,7 s (proteção contra clique duplo) */
    const salvar = async () => { await T.dorme(750); v().querySelector('#almNOk').click(); await T.dorme(350); const m = v(); return m ? m.querySelector('#almNE').textContent : ''; };
    set('#almNN', 'Zé'); set('#almNC', CPF_NOVO); const e1 = await salvar();
    set('#almNN', 'Gabriel Teste Novo'); set('#almNC', '11111111111'); const e2 = await salvar();
    set('#almNC', CPF_ANA); const e3 = await salvar();
    set('#almNC', CPF_NOVO); set('#almNF', 'Forneiro'); const e4 = await salvar(); await T.sincronizado();
    const f = DATA.funcionarios.find((x) => x.nome === 'Gabriel Teste Novo');
    return { campos, e1, e2, e3, e4, fechou: !v(), f, sens: f && window.__srv.estado.docs.get('sensivel/' + f.id), log: f && DATA.log.some((l) => l.recId === f.id && l.acao === 'criou'),
      naLista: f && !!T.linha(f.id), novo: f && T.linha(f.id) && T.linha(f.id).classList.contains('novo'), n: DATA.funcionarios.length };
  }, { CPF_ANA, CPF_NOVO });
  ok(cr.campos.join() === 'Nome completo,CPF,Função,Data de admissão', 'formulário curto: nome, CPF, função e data de admissão');
  ok(/nome completo/.test(cr.e1) && /CPF inválido/.test(cr.e2) && /já está cadastrado no Setor Pessoal: Ana Teste Ativa/.test(cr.e3), 'confere nome completo, CPF válido e CPF que já existe no Setor Pessoal' + (/nome completo/.test(cr.e1) && /CPF inválido/.test(cr.e2) && /já está cadastrado/.test(cr.e3) ? '' : ': ' + JSON.stringify([cr.e1, cr.e2, cr.e3, cr.e4])));
  ok(cr.e4 === '' && cr.fechou && cr.f && cr.f.situacao === 'Ativo' && cr.f.cargo === 'Forneiro' && cr.f.admissao === HOJE && cr.f.cadastroRapido && cr.f.cadastroRapido.origem === 'Cozinha' && /^\d{4}$/.test(cr.f.matricula || ''), 'salva no cadastro do Setor Pessoal (não numa lista da cozinha), ativo, com matrícula e a marca de cadastro rápido');
  ok(cr.sens && cr.sens.dados.cpf === CPF_NOVO && Object.keys(cr.sens.dados).sort().join() === 'cpf,id', 'o CPF vai para a parte protegida do Setor Pessoal (só números)');
  ok(cr.log && cr.naLista && cr.novo && cr.n === 7, 'fica no histórico do Pessoal e já aparece (destacado) na lista do dia');

  console.log('Valor do almoço: só daqui pra frente');
  await ir('#/almocoValor', '#almVOk');
  await foto('03-valor');
  const va = await avaliar(async ({ ONTEM, HOJE, d3 }) => {
    const set = (sel, x) => { const e = document.querySelector(sel); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const antes = document.querySelector('.alm-val .grande').textContent;
    set('#almVV', '6,00'); set('#almVD', ONTEM); document.querySelector('#almVOk').click(); await T.dorme(250); const eOntem = document.querySelector('#almVE').textContent;
    await T.dorme(750); set('#almVD', HOJE); document.querySelector('#almVOk').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    const depois = document.querySelector('.alm-val .grande').textContent;
    await T.dorme(750); set('#almVV', '7,50'); set('#almVD', d3); document.querySelector('#almVOk').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    const agendado = document.querySelector('.alm-val>div:nth-child(2)').textContent.replace(/\s+/g, ' ');
    document.querySelector('[data-alm-canc]').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    /* o programa redesenha a tela logo depois de gravar (espera a janela de confirmação sumir) */
    await T.esperar(() => [...document.querySelectorAll('.alm-tb tbody tr')].some((tr) => /Cancelado/.test(tr.textContent)), 5000).catch(() => {});
    const tab = window.__srv.estado.docs.get('almocoCfg/valor').dados.tabela;
    const linhas = [...document.querySelectorAll('.alm-tb tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' '));
    return { antes, eOntem, depois, agendado, tab, linhas, preco: JB_ALMOCO.precoDe(d3) };
  }, { ONTEM, HOJE, d3: dia(3) });
  ok(/R\$ 5,00/.test(va.antes) && /só daqui pra frente/.test(va.eOntem), 'com um valor já definido, o novo valor não pode começar num dia que já passou');
  ok(/R\$ 6,00/.test(va.depois) && va.tab.length === 3 && va.tab[0].valor === 5 && va.tab[1].valor === 6 && va.tab[1].desde === HOJE && va.tab[1].por === 'u_DONO', 'salva o novo valor a partir de hoje, guardando o antigo e quem salvou');
  ok(/7,50/.test(va.agendado) && va.tab[2].cancelado && va.tab[2].cancelado.por === 'u_DONO' && va.preco === 6, 'valor agendado para depois aparece em "Próxima mudança" e pode ser cancelado (fica no histórico como cancelado)');
  ok(va.linhas.length === 3 && va.linhas.some((l) => /Cancelado/.test(l)) && va.linhas.some((l) => /Vale hoje/.test(l)), 'a tabela de valores mostra todos, com a situação de cada um', va.linhas);
  await ir('#/almoco', '.alm-tela .alm-lin');
  const nv = await avaliar(async ({ HOJE }) => { const p = document.querySelector('.alm-preco').textContent;
    await T.tocar('f_bru', 'sim'); await T.sincronizado(); return { p, bru: T.item(HOJE, 'f_bru'), ana: T.item(HOJE, 'f_ana'), rod: T.rod() }; }, { HOJE });
  ok(/R\$ 6,00/.test(nv.p) && nv.bru.valor === 6 && nv.ana.valor === 5 && nv.rod[1] === 'R$ 11,00', 'depois da mudança, o novo SIM vale R$ 6,00 e o almoço já lançado continua com R$ 5,00');

  console.log('Desconto Refeição na folha do Setor Pessoal');
  const fo = await avaliar(async ({ MES, MES_FECHADO }) => {
    const ana = itemFolha(F('f_ana'), MES, {}), bru = itemFolha(F('f_bru'), MES, {}), car = itemFolha(F('f_car'), MES, {});
    const tt = totaisFolha(itensFolha(MES, {}));
    const ex = extratoMes('f_ana', MES, {}); const H = holerite('f_bru', MES);
    UIF.mes = MES; JBNAV.ir('#/folha'); await T.esperar(() => document.querySelector('.tbl-folha')); await T.dorme(300);
    const th = [...document.querySelectorAll('.tbl-folha thead th')].map((x) => x.textContent.trim());
    const kpis = [...document.querySelectorAll('.kpis .kpi .l')].map((x) => x.textContent.trim());
    const D = docRecibo(ana, MES, null); const rec = D.blocos[0].body.map((l) => l.join(' = '));
    const DF = docFolha(MES, itensFolha(MES, {}), tt, null);
    UIF.mes = MES_FECHADO; renderTela(); await T.dorme(300);
    const thF = [...document.querySelectorAll('.tbl-folha thead th, .vazio b')].map((x) => x.textContent.trim());
    UIF.mes = MES;
    return { ana: [ana.descRefeicao, ana.qtdRefeicao, ana.total, ana.descontos], bru: [bru.descRefeicao, bru.qtdRefeicao], car: [car.descRefeicao], tt: tt.refeicao,
      linha: ex.linhas.find((l) => /Desconto refeição/.test(l[0])), h530: H.descontos.find((x) => x.cod === '530'), th, kpis, rec, dfHead: DF.blocos[0].head, thF };
  }, { MES, MES_FECHADO });
  ok(fo.ana[0] === 5 && fo.ana[1] === 1 && fo.bru[0] === 6 && fo.bru[1] === 1 && fo.car[0] === 0 && fo.tt === 11, 'a folha de cada um soma os almoços do mês × o valor de cada dia (Ana 1 × R$ 5,00; Bruno 1 × R$ 6,00; Carla nenhum)');
  ok(fo.ana[2] === 2000 - 5 && fo.ana[3] === 5, 'o desconto entra nos descontos e baixa o líquido a pagar');
  ok(fo.linha && fo.linha[1] === -5 && /1 almoço na fábrica/.test(fo.linha[0]), 'o extrato do funcionário mostra a linha "(–) Desconto refeição"');
  ok(fo.h530 && fo.h530.d === 'Desconto refeição' && fo.h530.v === 6 && fo.h530.ref === '1 almoço', 'o holerite traz o evento 530 "Desconto refeição"');
  ok(fo.th.includes('Refeição') && fo.kpis.includes('Desconto refeição'), 'o fechamento da folha mostra a coluna "Refeição" e o total "Desconto refeição"');
  ok(fo.rec.some((l) => /Desconto refeição \(1 almoço\) = -R\$ 5,00/.test(l)) && fo.dfHead.includes('(–) Refeição'), 'o recibo e o documento da folha levam o desconto');
  ok(!fo.thF.includes('Refeição'), 'folha de mês sem almoço (fechada antes) continua igual, sem a coluna nova');

  console.log('Fechar a folha trava o mês na cozinha');
  const fe = await avaliar(async ({ MES }) => {
    /* já está na tela da folha (mostrando outro mês): redesenha no mês de agora */
    UIF.mes = MES; if (location.hash === '#/folha') renderTela(); else JBNAV.ir('#/folha'); await T.esperar(() => document.querySelector('#bFechar')); document.querySelector('#bFechar').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    const fc = folhaDo(MES); const it = (fc.itens || []).find((x) => x.funcionarioId === 'f_bru');
    JBNAV.ir('#/almoco'); await T.esperar(() => document.querySelector('.alm-tela')); await T.dorme(300);
    const r = { sit: fc.situacao, congelado: it && it.descRefeicao, trava: !!document.querySelector('.alm-aviso.trava'), desab: [...document.querySelectorAll('.alm-bts button')].every((b) => b.disabled), todos: !!document.querySelector('[data-alm-todos]') };
    /* o banco também recusa (mesmo que a tela tente) */
    let recusa = '';
    try { await JB_ALMOCO.marcar(F('f_car'), hoje(), false); } catch (e) {}
    await T.dorme(300); recusa = T.toasts().slice(-1)[0] || '';
    JBNAV.ir('#/folha'); await T.esperar(() => document.querySelector('#bReabrir')); document.querySelector('#bReabrir').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    JBNAV.ir('#/almoco'); await T.esperar(() => document.querySelector('.alm-tela')); await T.dorme(300);
    r.reaberta = !document.querySelector('.alm-aviso.trava') && !document.querySelector('.alm-bts button.bs').disabled; r.recusa = recusa; return r; }, { MES });
  ok(fe.sit === 'Fechada' && fe.congelado === 6, 'a folha fechada congela o desconto de cada um');
  ok(fe.trava && fe.desab && !fe.todos && /já foi fechada/.test(fe.recusa), 'com a folha fechada, a cozinha mostra o aviso, trava o SIM/NÃO e não deixa lançar');
  ok(fe.reaberta, 'reabrir a folha no Pessoal destrava o mês na cozinha');

  console.log('Relatórios e histórico');
  await ir('#/almocoRel', '.alm-tb');
  await foto('04-relatorio');
  const re = await avaliar(async () => {
    const lin = () => [...document.querySelectorAll('.alm-tb tbody tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()));
    const pf = lin(), pfT = document.querySelector('.alm-tb tfoot').textContent.replace(/\s+/g, ' ');
    document.querySelector('[data-alm-aba="dia"]').click(); await T.dorme(250); const pd = lin();
    window.__exp.length = 0; document.querySelector('#almRx').click(); await T.dorme(150);
    const itens = [...document.querySelectorAll('.dc-pop button')].map((b) => b.childNodes[0].textContent.trim());
    [...document.querySelectorAll('.dc-pop button')].find((b) => /Exportar Excel/.test(b.textContent)).click(); await T.dorme(150);
    document.querySelector('#almRx').click(); await T.dorme(150); [...document.querySelectorAll('.dc-pop button')].find((b) => /Relatório completo \(PDF\)/.test(b.textContent)).click(); await T.dorme(150);
    const ex = window.__exp.slice();
    const R = JB_ALMOCO.dadosRel({ de: hoje(), ate: hoje(), fid: '' });
    return { pf, pfT, pd, itens, ex, tot: R.tot };
  });
  ok(re.pf.length === 2 && re.pf[0][0] === 'Ana Teste Ativa' && re.pf[0][3] === '1' && re.pf[0][4] === 'R$ 5,00' && re.pf[1][4] === 'R$ 6,00' && /Total de 2 pessoas\s*2\s*R\$ 11,00/.test(re.pfT), 'resumo por funcionário: dias que almoçou e valor a descontar, com o total', [re.pf, re.pfT]);
  ok(re.pd.length === 1 && re.pd[0][2] === '2' && re.pd[0][4] === 'R$ 11,00', 'resumo por dia: quantos almoçaram e o valor do dia');
  ok(['Visualizar', 'Imprimir', 'Exportar PDF', 'Exportar Excel'].every((x) => re.itens.includes(x)), 'exporta em PDF e Excel (e visualiza e imprime)');
  ok(re.ex[0].f === 'xlsx' && re.ex[0].cols.join() === 'Data,Dia da semana,Almoçaram,Não almoçaram,Valor do dia' && /Período:/.test(re.ex[0].opc.filtros) && re.ex[1].f === 'pdf' && re.ex[1].opc.extras.length === 1, 'o Excel leva a tabela e os filtros; o relatório completo leva por funcionário e por dia');
  await ir('#/almocoHist', '.alm-hl');
  const hi = await avaliar(() => ({ n: document.querySelectorAll('.alm-hl>div').length, txt: document.querySelector('.alm-hl').textContent, valores: document.querySelectorAll('.alm-tb tbody tr').length }));
  ok(hi.n === 7 && /Desmarcado/.test(hi.txt) && /Carla Teste Ativa/.test(hi.txt) && hi.valores === 3, 'o histórico lista cada marcação (com o "desmarcado" do Desfazer) e as mudanças no valor', hi);

  console.log('Nada fora do controle e da folha');
  const depois = await avaliar(() => T.fora());
  const semFolha = (j) => JSON.stringify(JSON.parse(j).filter((d) => !['folhas', 'despesas', 'producao', 'vales', 'horasExtras'].includes(d[0])));
  ok(semFolha(antes) === semFolha(depois), 'o controle de almoço não grava fora das coleções dele (e do cadastro do Setor Pessoal)');

  console.log('Perfil Cozinha');
  const pc = await avaliar(async () => {
    APP.papel = 'cozinha'; JBNAV.ir('#/painel'); await T.dorme(600); const r1 = location.hash;
    JBNAV.ir('#/setor-almox'); await T.dorme(600); const r2 = location.hash;
    JBNAV.ir('#/almocoValor'); await T.esperar(() => document.querySelector('.alm-val')); await T.dorme(200);
    const valor = { form: !!document.querySelector('#almVOk'), aviso: /Só o Setor Pessoal/.test(document.body.textContent) };
    JBNAV.ir('#/almoco'); await T.esperar(() => document.querySelector('.alm-tela')); await T.dorme(200);
    const dia = { novo: !!document.querySelector('.sec-cab [data-alm-novo]'), sim: !document.querySelector('.alm-bts .bs').disabled, abas: [...document.querySelectorAll('.alm-nav a')].map((a) => a.textContent.trim()), mods: [...document.querySelectorAll('.sv-abas a')].map((a) => a.textContent.trim()) };
    const s = SETORES.find((x) => x.id === 'almox');
    const card = { v: s.v(), rota: s.rota };
    APP.papel = 'admin'; renderTela(); await T.dorme(200);
    return { r1, r2, valor, dia, card, rotaAdmin: s.rota };
  });
  ok(pc.r1 === '#/almoco' && pc.r2 === '#/almoco', 'o perfil Cozinha só abre o almoço: o Setor Pessoal e o almoxarifado voltam para o almoço do dia');
  ok(!pc.valor.form && pc.valor.aviso, 'o perfil Cozinha vê o valor do almoço, mas não altera');
  ok(pc.dia.novo && pc.dia.sim && pc.dia.mods.join() === 'Almoço do dia,Relatórios do almoço,Histórico do almoço,Valor do almoço', 'o perfil Cozinha lança, faz o cadastro rápido e só tem as telas do almoço no menu');
  ok(pc.card.v && pc.card.rota === '#/almoco' && pc.rotaAdmin === '#/setor-almox', 'o cartão do setor aparece para a Cozinha e entra direto no almoço (o administrador continua entrando no início do setor)');
  ok(erros.length === 0, 'computador: nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));

  console.log('Celular');
  const docs2 = [...await page.evaluate(() => [...window.__srv.estado.docs.values()].map((d) => [d.colecao, d.id, d.dados]))];
  const m = await abrir(docs2, true);
  await m.page.evaluate(() => JBNAV.ir('#/almoco')); await m.page.waitForSelector('.alm-tela .alm-lin', { timeout: 15000 }); await m.page.waitForTimeout(500);
  if (FOTOS) await m.page.screenshot({ path: join(FOTOS, '05-celular.png') });
  const ce = await m.page.evaluate(async () => {
    const b = document.querySelector('.alm-lin .bs').getBoundingClientRect(); const rod = document.querySelector('#almRod').getBoundingClientRect();
    const lin = document.querySelector('.alm-lin').getBoundingClientRect();
    /* a barra de baixo do celular (e o botão redondo do meio) não pode cobrir o rodapé */
    const barra = document.querySelector('#c2mob'); let lim = innerHeight;
    if (barra && getComputedStyle(barra).display !== 'none') lim = Math.min(barra.getBoundingClientRect().top, ...[...barra.querySelectorAll('.c2-fab span')].map((x) => x.getBoundingClientRect().top));
    const lado = T.semRolagemLateral();
    await T.tocar('f_car', 'sim'); await T.sincronizado();
    return { alt: b.height, larg: b.width, rodVisivel: rod.bottom <= lim + 1 && rod.top < lim, primeira: lin.bottom <= Math.min(rod.top, lim) + 1, lado, car: T.st('f_car'), volta: T.nomes().length, med: [Math.round(lin.top), Math.round(lin.bottom), Math.round(rod.top), Math.round(rod.bottom), Math.round(lim)] };
  });
  ok(ce.alt >= 48 && ce.larg >= 60, `botões SIM e NÃO grandes para o dedo (${Math.round(ce.larg)} × ${Math.round(ce.alt)} px)`);
  ok(ce.rodVisivel && ce.primeira && ce.lado, 'o rodapé com os almoços e o valor do dia fica à vista (acima da barra de baixo), a primeira pessoa aparece sem rolar e nada rola para o lado', ce.med);
  ok(ce.car === 'sim' && ce.volta === 4, 'no celular, os dados voltam iguais do banco central e o SIM funciona');
  for (const r of ['#/almocoRel', '#/almocoHist', '#/almocoValor']) {
    await m.page.evaluate((x) => JBNAV.ir(x), r); await m.page.waitForTimeout(600);
    ok(await m.page.evaluate(() => T.semRolagemLateral()), 'celular: ' + r + ' sem rolagem para o lado');
  }
  ok(m.erros.length === 0, 'celular: nenhum erro de JavaScript' + (m.erros.length ? ': ' + m.erros.slice(0, 3).join(' | ') : ''));
} catch (e) {
  falhas++; console.log('  ✘ o teste parou: ' + (e && (e.stack || e.message) || e));
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
