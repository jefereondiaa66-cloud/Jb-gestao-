#!/usr/bin/env node
// Teste de ponta a ponta do Controle de refeições da Cozinha (V160 almoço; V162 café, almoço e janta), no navegador,
// com o programa REAL (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs, com o gatilho
// das refeições imitado: mês com folha fechada não muda, lançamento não se apaga nem muda de refeição, o banco carimba
// o histórico e o valor da refeição no dia). Dados fictícios.
//  - V162: três refeições (café, almoço e janta), cada uma com o seu valor; quem não foi marcado conta como NÃO
//  - o controle fica só na parte da Cozinha do Setor do Almoxarifado / Cozinha (botões, menu Módulos, telas próprias)
//  - lista do dia: só os ativos do Setor Pessoal, em ordem alfabética, com busca; afastado, demitido e admitido
//    depois do dia ficam fora (quem saiu depois aparece nos dias em que trabalhava)
//  - SIM fica verde e lança na hora, NÃO fica cinza e não desconta, troca de SIM/NÃO com o histórico de quem marcou,
//    "Marcar todos como SIM" (todos que estão NÃO) e "Desfazer", rodapé com a refeição, o valor dela e o total do dia
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
    const REFS = { cafe: ['cf', 'do café'], almoco: ['al', 'do almoço'], janta: ['jt', 'da janta'] };
    const precoSrv = (d, ref) => { const t = ((doc('almocoCfg', 'valor') || {}).tabela || []).map((e, i) => ({ e, i })).filter((x) => x.e && !x.e.cancelado && x.e.desde <= d && (x.e.ref || 'almoco') === ref);
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
        if (!eb) throw erroSrv('JB409', 'Lançamento de refeição não se apaga: para corrigir, marque SIM ou NÃO.');
        const ref = vb.ref == null ? 'almoco' : vb.ref;
        if (!REFS[ref] || k !== REFS[ref][0] + '-' + vb.data + '-' + vb.funcionarioId) throw erroSrv('22023', 'dados inválidos');
        if (ea && (va.ref || 'almoco') !== ref) throw erroSrv('22023', 'O lançamento da refeição não muda de pessoa, de dia nem de refeição.');
        if (window.__recusaFid && vb.funcionarioId === window.__recusaFid) throw erroSrv('22023', 'Funcionário não encontrado no Setor Pessoal.');
        meses.add(String(vb.data).slice(0, 7));
        const simAnt = ea ? (va.sim === undefined ? null : va.sim) : undefined;
        let valor = 0;
        if (vb.sim === true) { valor = ea && va.sim === true ? +va.valor || 0 : precoSrv(vb.data, ref); if (valor == null) throw erroSrv('JB422', 'O valor ' + REFS[ref][1] + ' ainda não foi definido para ' + vb.data + '.'); }
        const hist = ea && Array.isArray(va.hist) ? va.hist.slice() : [];
        if (!ea || simAnt !== vb.sim) hist.push([vb.sim === true ? 1 : vb.sim === false ? 0 : null, 'u_DONO', new Date().toISOString()]);
        b[k] = { id: k, funcionarioId: vb.funcionarioId, data: vb.data, ref, sim: vb.sim, valor, hist };
      }
      for (const m of meses) if (travaSrv(m)) throw erroSrv('JB423', 'A folha de ' + m.slice(5, 7) + '/' + m.slice(0, 4) + ' já foi fechada no Setor Pessoal. As refeições desse mês não mudam mais: para corrigir, o Pessoal precisa reabrir a folha.');
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
      st: (fid) => { const l = T.linha(fid); return l ? (l.classList.contains('sim') ? 'sim' : l.classList.contains('nao') ? 'nao' : 'outro') : 'ausente'; },
      refeicao: async (k) => { document.querySelector('[data-alm-ref="' + k + '"]').click(); await T.esperar(() => document.querySelector('.alm-tela[data-ref="' + k + '"]')); await T.dorme(150); },
      refs: () => Object.fromEntries([...document.querySelectorAll('[data-alm-ref]')].map((b) => [b.dataset.almRef, b.querySelector('em').textContent.trim()])),
      tocar: async (fid, k) => { const b = T.linha(fid).querySelector(k === 'sim' ? '.bs' : '.bn'); b.click(); await T.dorme(150); },
      rod: () => [...document.querySelectorAll('#almRod b')].map((b) => b.textContent.trim()),
      nomes: () => [...document.querySelectorAll('.alm-lin:not([hidden]) .alm-nm b')].map((b) => b.textContent.trim()),
      item: (d, fid, ref) => { const k = ({ cafe: 'cf', janta: 'jt' }[ref] || 'al') + '-' + d + '-' + fid; for (const x of window.__srv.estado.docs.values()) { if (x.colecao === 'almoco' && x.dados.items && x.dados.items[k]) return x.dados.items[k]; } return null; },
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
  ok(ini.a.indexOf('Refeições do dia') === ini.a.indexOf('Cozinha') + 1, 'no início do setor, o botão "Refeições do dia" fica logo depois do "Cozinha": ' + ini.a.join(' | '));
  const iC = ini.abas.indexOf('Cozinha');
  ok(iC >= 0 && ini.abas.slice(iC + 1, iC + 5).join() === 'Refeições do dia,Relatórios das refeições,Histórico das refeições,Valor das refeições', 'no menu Módulos do setor, as 4 telas das refeições ficam juntas, logo depois da Cozinha (separadas do almoxarifado)', ini.abas);
  await ir('#/almCozinha', '[data-alm-bt]');
  ok(await avaliar(() => document.querySelector('[data-alm-bt]').textContent.trim() === 'Controle de refeições'), 'a tela da Cozinha (estoque da cozinha) tem o botão "Controle de refeições"');

  console.log('Lista do dia');
  await ir('#/almoco', '.alm-tela .alm-lin');
  const rp = await avaliar(() => { const h = new Date().getHours(); return { auto: document.querySelector('.alm-tela').dataset.ref, esperado: h < 10 ? 'cafe' : h < 16 ? 'almoco' : 'janta',
    rotulos: [...document.querySelectorAll('[data-alm-ref] span')].map((x) => x.textContent.trim()) }; });
  ok(rp.rotulos.join() === 'Café,Almoço,Janta' && rp.auto === rp.esperado, 'três refeições no alto (Café, Almoço e Janta) e a da hora já vem escolhida: ' + rp.auto);
  await avaliar(() => T.refeicao('almoco'));
  await foto('01-dia-vazio');
  const l0 = await avaliar(() => ({ nomes: T.nomes(), preco: document.querySelector('.alm-preco').textContent, rod: T.rod(), data: document.querySelector('.alm-dt b').textContent, todos: !!document.querySelector('[data-alm-todos]:not([hidden])'),
    sts: ['f_ana', 'f_bru', 'f_car'].map(T.st), nao: [...document.querySelectorAll('.alm-lin .bn')].every((b) => b.getAttribute('aria-pressed') === 'true'),
    chips: [...document.querySelectorAll('[data-alm-f]')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()), rotRod: [...document.querySelectorAll('#almRod span')].map((x) => x.textContent.trim()) }));
  ok(l0.nomes.join() === 'Ana Teste Ativa,Bruno Teste Ativo,Carla Teste Ativa', 'só os ativos do Setor Pessoal, em ordem alfabética (afastado, demitido e admitido depois ficam fora): ' + l0.nomes.join(', '));
  ok(l0.sts.join() === 'nao,nao,nao' && l0.nao && l0.chips.join() === 'Todos 3,SIM 0,NÃO 3', 'quem não foi marcado já aparece como NÃO (sem "sem marcação"): ' + l0.chips.join(' | '));
  ok(/R\$ 5,00/.test(l0.preco) && l0.rod.join() === '0,R$ 0,00,R$ 0,00' && l0.rotRod.join() === 'Almoços do dia,Valor do almoço,Total do dia', 'mostra o valor do almoço do dia e o rodapé zerado (almoços, valor do almoço e total do dia): ' + l0.rod.join(' | '));
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
  ok(m1.v1.st === 'sim' && m1.v1.rod.join() === '1,R$ 5,00,R$ 5,00', 'SIM: a linha fica verde e o rodapé soma na hora (antes de o banco responder)', m1.v1);
  ok(m1.i1 && m1.i1.sim === true && m1.i1.valor === 5 && m1.i1.ref === 'almoco' && m1.i1.funcionarioId === 'f_ana' && m1.i1.hist.length === 1 && m1.i1.hist[0][1] === 'u_DONO', 'o SIM vira lançamento do almoço ligado ao funcionário e ao dia, com o valor do dia e quem marcou');
  ok(m1.v2.st === 'nao' && m1.i2.sim === false && m1.i2.valor === 0 && m1.v2.rod.join() === '1,R$ 5,00,R$ 5,00', 'NÃO tocado: fica guardado como NÃO, cinza, e nada é descontado');
  ok(m1.i3.sim === false && m1.i3.valor === 0 && m1.i3.hist.length === 2 && m1.v3.join() === '0,R$ 0,00,R$ 0,00', 'trocar SIM por NÃO corrige o lançamento (sai do desconto) e o histórico guarda as duas marcações');
  ok(m1.i4.sim === true && m1.i4.valor === 5 && m1.i4.hist.length === 3 && m1.st === 'sim', 'trocar de volta para SIM volta a descontar: histórico com 3 marcações');
  ok(/SIM · Dono às \d\d:\d\d/.test(m1.marc), 'a linha mostra quem marcou e a hora: ' + m1.marc);
  const hm = await avaliar(async () => { document.querySelector('[data-alm-ver="f_ana"]').click(); await T.dorme(250);
    const t = [...document.querySelectorAll('.veu .alm-vref[data-ref="almoco"] .alm-hist li')].map((li) => li.textContent.replace(/\s+/g, ' '));
    const blocos = [...document.querySelectorAll('.veu .alm-vref')].map((b) => [...b.querySelector('.alm-vref-t').children].map((x) => x.textContent.trim()).filter(Boolean).join(' '));
    document.querySelector('.veu [data-x]').click(); await T.dorme(200); return { t, blocos }; });
  ok(hm.t.length === 3 && /^SIM/.test(hm.t[0]) && /^NÃO/.test(hm.t[1]) && /^SIM/.test(hm.t[2]) && hm.t.every((x) => /Dono · \d\d\/\d\d\/\d{4} às \d\d:\d\d/.test(x)), 'tocar no nome mostra as marcações do dia com quem marcou, a data e a hora');
  ok(hm.blocos.length === 3 && /^Café NÃO/.test(hm.blocos[0]) && /^Almoço SIM R\$ 5,00/.test(hm.blocos[1]) && /^Janta NÃO/.test(hm.blocos[2]), 'e mostra as três refeições do dia (sem marcação conta como NÃO): ' + hm.blocos.join(' | '));

  console.log('Marcar todos como SIM e Desfazer');
  const mt = await avaliar(async ({ HOJE }) => {
    document.querySelector('[data-alm-todos]').click(); await T.dorme(200);
    const txt = document.querySelector('.veu .modal').textContent; await T.confirmar(); await T.sincronizado();
    const sts = ['f_ana', 'f_bru', 'f_car'].map(T.st); const rod = T.rod(); const desf = !!document.querySelector('.alm-desf button');
    const car = T.item(HOJE, 'f_car');
    document.querySelector('.alm-desf button').click(); await T.dorme(300); await T.sincronizado();
    return { txt, sts, rod, desf, car, depois: ['f_ana', 'f_bru', 'f_car'].map(T.st), car2: T.item(HOJE, 'f_car'), todos: !!document.querySelector('[data-alm-todos]:not([hidden])') };
  }, { HOJE });
  ok(/Marcar 2 pessoas como SIM/.test(mt.txt) && /Almoço de/.test(mt.txt) && /tocar em NÃO para quem não comeu/.test(mt.txt), 'pede confirmação dizendo quantos, a refeição, e que depois é só tocar em NÃO para quem não comeu');
  ok(mt.sts.join() === 'sim,sim,sim' && mt.rod.join() === '3,R$ 15,00,R$ 15,00' && mt.car.sim === true && mt.car.valor === 5, 'marca SIM todos que estavam NÃO');
  ok(mt.desf && mt.depois.join() === 'sim,nao,nao' && mt.car2.sim === false && mt.car2.hist.length === 2 && mt.car2.hist[1][0] === 0, '"Desfazer" volta para NÃO quem foi marcado pelo botão, sem apagar o histórico');
  ok(mt.todos, 'com alguém como NÃO, o "Marcar todos" volta a aparecer');

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
  const fb = await avaliar(async ({ MES }) => { window.__travaSrv = MES; await T.tocar('f_car', 'sim'); await T.esperar(() => T.toasts().some((t) => /folha/.test(t)), 8000); await T.dorme(400);
    const r = { st: T.st('f_car'), msg: T.toasts().find((t) => /folha/.test(t)) }; window.__travaSrv = ''; return r; }, { MES });
  ok(fb.st === 'nao' && /já foi fechada no Setor Pessoal/.test(fb.msg), 'o banco recusa o mês fechado; a linha volta como estava e a mensagem explica: ' + (fb.msg || '').slice(0, 90));

  console.log('Recusa do banco num lançamento (sem criar a parte do mês de novo)');
  const rc = await avaliar(async ({ HOJE }) => { window.__recusaFid = 'f_car'; const antes = JSON.stringify(T.item(HOJE, 'f_ana'));
    await T.tocar('f_car', 'sim'); await T.esperar(() => T.toasts().some((t) => /não encontrado/.test(t)), 8000); await T.dorme(400);
    const r = { st: T.st('f_car'), msg: T.toasts().find((t) => /não encontrado/.test(t)), ana: JSON.stringify(T.item(HOJE, 'f_ana')) === antes };
    window.__recusaFid = ''; return r; }, { HOJE });
  ok(rc.st === 'nao' && /Carla Teste Ativa: Funcionário não encontrado no Setor Pessoal/.test(rc.msg) && rc.ana, 'erro de um lançamento volta para a tela com a mensagem do banco, e os outros lançamentos do mês ficam como estavam', rc);

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

  console.log('Valor das refeições: só daqui pra frente');
  await ir('#/almocoValor', '#almVOk');
  await foto('03-valor');
  const va = await avaliar(async ({ ONTEM, HOJE, d3 }) => {
    const set = (sel, x) => { const e = document.querySelector(sel); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); };
    const cards = [...document.querySelectorAll('.alm-val>div')].map((c) => c.dataset.ref + ' ' + c.querySelector('.grande').textContent.trim());
    const sel0 = document.querySelector('#almVR').value;
    const sel = document.querySelector('#almVR'); sel.value = 'almoco'; sel.dispatchEvent(new Event('change', { bubbles: true }));
    const antes = document.querySelector('.alm-val>div[data-ref="almoco"] .grande').textContent;
    set('#almVV', '6,00'); set('#almVD', ONTEM); document.querySelector('#almVOk').click(); await T.dorme(250); const eOntem = document.querySelector('#almVE').textContent;
    await T.dorme(750); set('#almVD', HOJE); document.querySelector('#almVOk').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    const depois = document.querySelector('.alm-val>div[data-ref="almoco"] .grande').textContent;
    { const s2 = document.querySelector('#almVR'); s2.value = 'almoco'; s2.dispatchEvent(new Event('change', { bubbles: true })); }
    await T.dorme(750); set('#almVV', '7,50'); set('#almVD', d3); document.querySelector('#almVOk').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    const agendado = document.querySelector('.alm-val>div[data-ref="almoco"]').textContent.replace(/\s+/g, ' ');
    document.querySelector('[data-alm-canc]').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    /* o programa redesenha a tela logo depois de gravar (espera a janela de confirmação sumir) */
    await T.esperar(() => [...document.querySelectorAll('.alm-tb tbody tr')].some((tr) => /Cancelado/.test(tr.textContent)), 5000).catch(() => {});
    const tab = window.__srv.estado.docs.get('almocoCfg/valor').dados.tabela;
    const linhas = [...document.querySelectorAll('.alm-tb tbody tr')].map((tr) => tr.textContent.replace(/\s+/g, ' '));
    return { cards, sel0, antes, eOntem, depois, agendado, tab, linhas, preco: JB_ALMOCO.precoDe(d3) };
  }, { ONTEM, HOJE, d3: dia(3) });
  ok(va.cards.join() === 'cafe —,almoco R$ 5,00,janta —' && va.sel0 === 'cafe', 'um cartão para cada refeição (café e janta ainda sem valor); o formulário já vem na primeira sem valor', va.cards);
  ok(/R\$ 5,00/.test(va.antes) && /só daqui pra frente/.test(va.eOntem), 'com um valor já definido, o novo valor não pode começar num dia que já passou');
  ok(/R\$ 6,00/.test(va.depois) && va.tab.length === 3 && va.tab[0].valor === 5 && va.tab[1].valor === 6 && va.tab[1].desde === HOJE && va.tab[1].por === 'u_DONO', 'salva o novo valor a partir de hoje, guardando o antigo e quem salvou');
  ok(/7,50/.test(va.agendado) && va.tab[2].cancelado && va.tab[2].cancelado.por === 'u_DONO' && va.preco === 6, 'valor agendado para depois aparece em "Próxima mudança" e pode ser cancelado (fica no histórico como cancelado)');
  ok(va.linhas.length === 3 && va.linhas.some((l) => /Cancelado/.test(l)) && va.linhas.some((l) => /Vale hoje/.test(l)) && va.linhas.every((l) => /Almoço/.test(l)), 'a tabela de valores mostra todos, com a refeição e a situação de cada um', va.linhas);
  const vc = await avaliar(async ({ ONTEM }) => {
    const set = (sel, x) => { const e = document.querySelector(sel); e.value = x; e.dispatchEvent(new Event('input', { bubbles: true })); };
    await T.dorme(750); const s = document.querySelector('#almVR'); s.value = 'cafe'; s.dispatchEvent(new Event('change', { bubbles: true }));
    const ajuda = document.querySelector('#almVA').textContent, min = document.querySelector('#almVD').min, bt = document.querySelector('#almVOk').textContent;
    set('#almVV', '3,00'); set('#almVD', ONTEM); document.querySelector('#almVOk').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    await T.esperar(() => /R\$ 3,00/.test(document.querySelector('.alm-val>div[data-ref="cafe"] .grande').textContent), 5000).catch(() => {});
    const tab = window.__srv.estado.docs.get('almocoCfg/valor').dados.tabela;
    return { ajuda, min, bt, cafe: document.querySelector('.alm-val>div[data-ref="cafe"] .grande').textContent, janta: document.querySelector('.alm-val>div[data-ref="janta"]').textContent.replace(/\s+/g, ' '),
      ult: tab[tab.length - 1], n: tab.length, preco: [JB_ALMOCO.precoDe(ONTEM, 'cafe'), JB_ALMOCO.precoDe(ONTEM, 'janta'), JB_ALMOCO.precoDe(ONTEM)] };
  }, { ONTEM });
  ok(/primeiro valor do café/.test(vc.ajuda) && vc.min === '' && /café/.test(vc.bt), 'o primeiro valor do café pode começar num dia que já passou (para lançar os dias anteriores)', vc);
  ok(/R\$ 3,00/.test(vc.cafe) && vc.n === 4 && vc.ult.ref === 'cafe' && vc.ult.valor === 3 && vc.ult.desde === ONTEM && vc.preco[0] === 3 && vc.preco[1] === null && vc.preco[2] === 5 && /Ainda não definido/.test(vc.janta), 'o café tem o valor dele; a janta continua sem valor e o almoço com o dele', vc);
  await ir('#/almoco', '.alm-tela .alm-lin');
  const nv = await avaliar(async ({ HOJE }) => { const p = document.querySelector('.alm-preco').textContent;
    await T.tocar('f_bru', 'sim'); await T.sincronizado(); return { p, bru: T.item(HOJE, 'f_bru'), ana: T.item(HOJE, 'f_ana'), rod: T.rod() }; }, { HOJE });
  ok(/R\$ 6,00/.test(nv.p) && nv.bru.valor === 6 && nv.ana.valor === 5 && nv.rod[1] === 'R$ 11,00', 'depois da mudança, o novo SIM vale R$ 6,00 e o almoço já lançado continua com R$ 5,00');

  console.log('Café e janta');
  const cj = await avaliar(async ({ HOJE }) => {
    await T.refeicao('cafe');
    const c0 = { preco: document.querySelector('.alm-preco').textContent, sts: ['f_ana', 'f_bru', 'f_car'].map(T.st), rod: T.rod(), rot: [...document.querySelectorAll('#almRod span')].map((x) => x.textContent.trim()) };
    await T.tocar('f_ana', 'sim'); await T.sincronizado();
    const c1 = { item: T.item(HOJE, 'f_ana', 'cafe'), alm: T.item(HOJE, 'f_ana'), rod: T.rod(), refs: T.refs() };
    await T.refeicao('janta');
    const j0 = { aviso: (document.querySelector('.alm-aviso') || {}).textContent || '', simOff: [...document.querySelectorAll('.alm-lin .bs')].every((b) => b.disabled), naoOn: [...document.querySelectorAll('.alm-lin .bn')].every((b) => !b.disabled), todos: !!document.querySelector('[data-alm-todos]'), sts: ['f_ana', 'f_bru', 'f_car'].map(T.st) };
    await T.refeicao('almoco');
    return { c0, c1, j0, alm: { sts: ['f_ana', 'f_bru', 'f_car'].map(T.st), rod: T.rod() } };
  }, { HOJE });
  ok(/Café neste dia: R\$ 3,00/.test(cj.c0.preco) && cj.c0.sts.join() === 'nao,nao,nao' && cj.c0.rod.join() === '0,R$ 0,00,R$ 11,00' && cj.c0.rot.join() === 'Cafés do dia,Valor do café,Total do dia', 'no café, todos começam como NÃO; o rodapé mostra o café e o total do dia (com o almoço)', cj.c0);
  ok(cj.c1.item && cj.c1.item.ref === 'cafe' && cj.c1.item.sim === true && cj.c1.item.valor === 3 && cj.c1.alm.valor === 5 && cj.c1.rod.join() === '1,R$ 3,00,R$ 14,00', 'SIM no café: lançamento próprio do café, com o valor do café, sem mexer no almoço', cj.c1);
  ok(cj.c1.refs.cafe === '1' && cj.c1.refs.almoco === '2' && cj.c1.refs.janta === '0', 'cada refeição mostra quantos têm SIM no dia', cj.c1.refs);
  ok(/valor da janta ainda não foi definido/.test(cj.j0.aviso) && cj.j0.simOff && cj.j0.naoOn && !cj.j0.todos && cj.j0.sts.join() === 'nao,nao,nao', 'janta sem valor: aviso, SIM travado (o NÃO continua livre) e sem "Marcar todos"', cj.j0);
  ok(cj.alm.sts.join() === 'sim,sim,nao' && cj.alm.rod.join() === '2,R$ 11,00,R$ 14,00', 'voltando ao almoço, as marcações do almoço continuam as mesmas', cj.alm);

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
  ok(fo.ana[0] === 8 && fo.ana[1] === 2 && fo.bru[0] === 6 && fo.bru[1] === 1 && fo.car[0] === 0 && fo.tt === 14, 'a folha de cada um soma as refeições do mês × o valor de cada uma (Ana 1 café R$ 3,00 + 1 almoço R$ 5,00; Bruno 1 almoço R$ 6,00; Carla nenhuma)', fo);
  ok(fo.ana[2] === 2000 - 8 && fo.ana[3] === 8, 'o desconto entra nos descontos e baixa o líquido a pagar');
  ok(fo.linha && fo.linha[1] === -8 && /1 café e 1 almoço na fábrica/.test(fo.linha[0]), 'o extrato do funcionário mostra a linha "(–) Desconto refeição" com cada refeição: ' + (fo.linha && fo.linha[0]));
  ok(fo.h530 && fo.h530.d === 'Desconto refeição' && fo.h530.v === 6 && fo.h530.ref === '1 almoço', 'o holerite traz o evento 530 "Desconto refeição"');
  ok(fo.th.includes('Refeição') && fo.kpis.includes('Desconto refeição'), 'o fechamento da folha mostra a coluna "Refeição" e o total "Desconto refeição"');
  ok(fo.rec.some((l) => /Desconto refeição \(2 refeições\) = -R\$ 8,00/.test(l)) && fo.dfHead.includes('(–) Refeição'), 'o recibo e o documento da folha levam o desconto', fo.rec);
  ok(!fo.thF.includes('Refeição'), 'folha de mês sem refeição (fechada antes) continua igual, sem a coluna nova');

  console.log('Fechar a folha trava o mês na cozinha');
  const fe = await avaliar(async ({ MES }) => {
    /* já está na tela da folha (mostrando outro mês): redesenha no mês de agora */
    UIF.mes = MES; if (location.hash === '#/folha') renderTela(); else JBNAV.ir('#/folha'); await T.esperar(() => document.querySelector('#bFechar')); document.querySelector('#bFechar').click(); await T.dorme(200); await T.confirmar(); await T.sincronizado();
    const fc = folhaDo(MES); const it = (fc.itens || []).find((x) => x.funcionarioId === 'f_bru');
    JBNAV.ir('#/almoco'); await T.esperar(() => document.querySelector('.alm-tela')); await T.dorme(300);
    const r = { sit: fc.situacao, congelado: it && it.descRefeicao, trava: !!document.querySelector('.alm-aviso.trava'), desab: [...document.querySelectorAll('.alm-bts button')].every((b) => b.disabled), todos: !!document.querySelector('[data-alm-todos]') };
    /* o banco também recusa (mesmo que a tela tente) */
    let recusa = '';
    try { await JB_ALMOCO.marcar(F('f_car'), hoje(), true, 'almoco'); } catch (e) {}
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
    document.querySelector('[data-alm-aba="func"]').click(); await T.dorme(250);
    const s = document.querySelector('[data-alm-p="ref"]'); s.value = 'almoco'; s.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    const so = { th: [...document.querySelectorAll('.alm-tb thead th')].map((x) => x.textContent.trim()), pf: lin(), foot: document.querySelector('.alm-tb tfoot').textContent.replace(/\s+/g, ' ') };
    document.querySelector('[data-alm-aba="lanc"]').click(); await T.dorme(250);
    const la = { th: [...document.querySelectorAll('.alm-tb thead th')].map((x) => x.textContent.trim()), n: lin().length };
    const s2 = document.querySelector('[data-alm-p="ref"]'); s2.value = ''; s2.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(300);
    la.todas = lin().map((r) => r[1]);
    return { pf, pfT, pd, itens, ex, tot: R.tot, so, la };
  });
  ok(re.pf.length === 2 && re.pf[0][0] === 'Ana Teste Ativa' && re.pf[0].slice(3).join() === '1,1,0,2,R$ 8,00' && re.pf[1].slice(3).join() === '0,1,0,1,R$ 6,00' && /Total de 2 pessoas\s*1\s*2\s*0\s*3\s*R\$ 14,00/.test(re.pfT), 'resumo por funcionário: cafés, almoços, jantas, total de refeições e valor a descontar, com o total', [re.pf, re.pfT]);
  ok(re.pd.length === 1 && re.pd[0].slice(2).join() === '1,2,0,3,R$ 14,00', 'resumo por dia: quantos comeram em cada refeição e o valor do dia', re.pd);
  ok(re.so.th.join() === 'Funcionário,Matrícula,Função,Almoços,Valor a descontar' && re.so.pf.length === 2 && /Total de 2 pessoas\s*2\s*R\$ 11,00/.test(re.so.foot), 'o filtro "Refeição" mostra só uma refeição (aqui o almoço)', re.so);
  ok(re.la.th.includes('Refeição') && re.la.n === 2 && re.la.todas.join() === 'Café,Almoço,Almoço', 'as refeições lançadas mostram de qual refeição é cada uma (só os SIM)', re.la);
  ok(['Visualizar', 'Imprimir', 'Exportar PDF', 'Exportar Excel'].every((x) => re.itens.includes(x)), 'exporta em PDF e Excel (e visualiza e imprime)');
  ok(re.ex[0].f === 'xlsx' && re.ex[0].cols.join() === 'Data,Dia da semana,Cafés,Almoços,Jantas,Refeições,Valor do dia' && /Período:/.test(re.ex[0].opc.filtros) && re.ex[1].f === 'pdf' && re.ex[1].opc.extras.length === 1, 'o Excel leva a tabela e os filtros; o relatório completo leva por funcionário e por dia', re.ex.map((x) => x.cols));
  await ir('#/almocoHist', '.alm-hl');
  const hi = await avaliar(() => ({ n: document.querySelectorAll('.alm-hl>div').length, txt: document.querySelector('.alm-hl').textContent, valores: document.querySelectorAll('.alm-tb tbody tr').length }));
  ok(hi.n === 10 && /Café de/.test(hi.txt) && /Almoço de/.test(hi.txt) && /Carla Teste Ativa/.test(hi.txt) && !/Desmarcado/.test(hi.txt) && hi.valores === 4, 'o histórico lista cada marcação, com a refeição, e as mudanças nos valores', { n: hi.n, valores: hi.valores });

  console.log('Nada fora do controle e da folha');
  const depois = await avaliar(() => T.fora());
  const semFolha = (j) => JSON.stringify(JSON.parse(j).filter((d) => !['folhas', 'despesas', 'producao', 'vales', 'horasExtras'].includes(d[0])));
  ok(semFolha(antes) === semFolha(depois), 'o controle de refeições não grava fora das coleções dele (e do cadastro do Setor Pessoal)');

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
  ok(pc.r1 === '#/almoco' && pc.r2 === '#/almoco', 'o perfil Cozinha só abre as refeições: o Setor Pessoal e o almoxarifado voltam para as refeições do dia');
  ok(!pc.valor.form && pc.valor.aviso, 'o perfil Cozinha vê os valores das refeições, mas não altera');
  ok(pc.dia.novo && pc.dia.sim && pc.dia.mods.join() === 'Refeições do dia,Relatórios das refeições,Histórico das refeições,Valor das refeições', 'o perfil Cozinha lança, faz o cadastro rápido e só tem as telas das refeições no menu', pc.dia.mods);
  ok(pc.card.v && pc.card.rota === '#/almoco' && pc.rotaAdmin === '#/setor-almox', 'o cartão do setor aparece para a Cozinha e entra direto nas refeições (o administrador continua entrando no início do setor)');
  /* nuvem: outro perfil (gerente) que tem no servidor só a Cozinha, sem o Almoxarifado (ex.: quem cuida da lenha e passou a marcar as refeições) */
  const sc = await avaliar(async () => {
    APP.papel = 'gerente'; window.JB_MODULO_SRV = (m) => m !== 'almox';
    const s = SETORES.find((x) => x.id === 'almox'); const rota = s.rota;
    JBNAV.ir('#/almEntradas'); await T.dorme(600); const r1 = location.hash;
    JBNAV.ir('#/setor-almox'); await T.dorme(600); const r2 = location.hash;
    await T.esperar(() => document.querySelector('.alm-tela')); await T.dorme(200);
    const mods = [...document.querySelectorAll('.sv-abas a')].map((a) => a.textContent.trim()), sim = !document.querySelector('.alm-bts .bs').disabled;
    JBNAV.ir('#/vendas'); await T.dorme(500); const r3 = location.hash;
    delete window.JB_MODULO_SRV; const rotaCom = s.rota;
    APP.papel = 'admin'; JBNAV.ir('#/almoco'); await T.esperar(() => document.querySelector('.alm-tela')); await T.dorme(200);
    return { rota, r1, r2, r3, mods, sim, rotaCom };
  });
  ok(sc.rota === '#/almoco' && sc.r1 === '#/almoco' && sc.r2 === '#/almoco' && sc.sim && sc.mods.join() === 'Refeições do dia,Relatórios das refeições,Histórico das refeições,Valor das refeições', 'quem tem no servidor só a Cozinha (sem o Almoxarifado) entra direto nas refeições, marca SIM e só vê as telas das refeições no setor', sc);
  ok(sc.r3 === '#/vendas' && sc.rotaCom === '#/setor-almox', 'as outras telas dessa pessoa seguem o perfil dela, e com o Almoxarifado liberado o setor abre no início', sc);
  console.log('Lançar por foto (a lista da cozinha)');
  const lf = await avaliar(async ({ HOJE }) => {
    /* a IA é imitada: devolve o que leria numa lista com Ana, Carla e um nome que não está no cadastro */
    window.__prompts = [];
    const l0 = window.ALM_IA_LER;
    window.ALM_IA_LER = { motor: async () => ({ tipo: 'teste', maxImgs: 4, ler: async (prompt, imgs) => { window.__prompts.push({ prompt, n: imgs.length, tipos: imgs.map((b) => b.type) }); await T.dorme(150);
      return 'Aqui está: ' + JSON.stringify({ data: HOJE, pessoas: [{ lido: 'Ana', n: 1, cafe: true, almoco: true, janta: null }, { lido: 'Carla', n: 3, cafe: true, almoco: true, janta: true }, { lido: 'Zé da Silva', n: null, cafe: true, almoco: false, janta: null }], obs: '' }); } }) };
    JBNAV.ir('#/almoco'); await T.esperar(() => document.querySelector('[data-alm-foto]')); await T.refeicao('almoco');
    const antes = { car: T.item(HOJE, 'f_car'), bruC: T.item(HOJE, 'f_bru', 'cafe') };
    document.querySelector('[data-alm-foto]').click(); await T.esperar(() => document.querySelector('.veu:not(.saindo) .alm-foto #almFF'));
    const m = () => document.querySelector('.veu:not(.saindo) .alm-foto');
    const lerOff = m().querySelector('#almFL').disabled;
    /* uma "foto" de verdade (imagem PNG feita aqui), como se viesse da câmera */
    const cv = document.createElement('canvas'); cv.width = 600; cv.height = 800; const x = cv.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 600, 800); x.fillStyle = '#000'; x.font = '40px sans-serif'; x.fillText('Ana  Carla  Zé', 40, 100);
    const blob = await new Promise((ok) => cv.toBlob(ok, 'image/png'));
    const dt = new DataTransfer(); dt.items.add(new File([blob], 'lista.png', { type: 'image/png' }));
    const inp = m().querySelector('#almFF'); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(150);
    const fotos = m().querySelectorAll('.alm-fts img').length;
    m().querySelector('#almFL').click(); await T.esperar(() => m() && m().querySelector('.alm-fr'), 8000);
    const pr = window.__prompts[0];
    const linhas = [...m().querySelectorAll('.alm-fr')].map((r) => ({ lido: r.querySelector('small').textContent, sel: r.querySelector('select').value, falta: r.classList.contains('semfunc'),
      rf: [...r.querySelectorAll('[data-alm-fr]')].map((b) => b.textContent + (b.disabled ? '-' : b.getAttribute('aria-pressed') === 'true' ? '+' : '0')).join(' ') }));
    const res1 = m().querySelector('#almFRes').textContent, bt1 = m().querySelector('#almFOk').textContent, avisoJ = /Janta: o valor ainda não foi definido/.test(m().textContent);
    /* o nome que a IA não achou: a pessoa escolhe quem é */
    const s = m().querySelectorAll('.alm-fr select')[2]; s.value = 'f_bru'; s.dispatchEvent(new Event('change', { bubbles: true })); await T.dorme(100);
    const res2 = m().querySelector('#almFRes').textContent, bt2 = m().querySelector('#almFOk').textContent;
    await T.dorme(750); m().querySelector('#almFOk').click(); await T.esperar(() => !m(), 8000); await T.sincronizado();
    const r = { lerOff, fotos, pr: { n: pr.n, tipos: pr.tipos, temLista: /1: Ana Teste Ativa · Cozinheira/.test(pr.prompt) && /3: Carla Teste Ativa/.test(pr.prompt), semCpf: !/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/.test(pr.prompt), almoco: /considere que é do ALMOÇO/.test(pr.prompt) },
      linhas, res1, bt1, avisoJ, res2, bt2, antes,
      carA: T.item(HOJE, 'f_car'), carC: T.item(HOJE, 'f_car', 'cafe'), carJ: T.item(HOJE, 'f_car', 'janta'), bruC: T.item(HOJE, 'f_bru', 'cafe'), anaA: T.item(HOJE, 'f_ana'),
      toast: T.toasts().slice(-1)[0] || '', log: DATA.log.some((l) => l.recId === HOJE && l.acao === 'lançou por foto'), sts: ['f_ana', 'f_bru', 'f_car'].map(T.st) };
    window.ALM_IA_LER = l0; return r;
  }, { HOJE });
  ok(lf.lerOff && lf.fotos === 1 && lf.pr.n === 1 && lf.pr.tipos[0] === 'image/jpeg', 'botão "Lançar por foto": tira a foto (fica a miniatura) e manda para a IA já preparada em JPG', lf.pr);
  ok(lf.pr.temLista && lf.pr.semCpf && lf.pr.almoco, 'a IA recebe a lista dos funcionários ativos do dia (nome e função, sem CPF) para ligar cada nome escrito ao cadastro', lf.pr);
  ok(lf.linhas.length === 3 && lf.linhas[0].sel === 'f_ana' && lf.linhas[1].sel === 'f_car' && lf.linhas[2].sel === '' && lf.linhas[2].falta && lf.linhas[1].rf === 'Café+ Almoço+ Janta-', 'conferência: cada nome da foto com o funcionário achado; o nome que não bate fica para escolher; janta sem valor fica travada', lf.linhas);
  ok(/Vai marcar SIM: 1 café, 1 almoço\./.test(lf.res1) && /Já estavam com SIM: 1 café, 1 almoço/.test(lf.res1) && /1 nome sem funcionário escolhido fica de fora/.test(lf.res1) && lf.bt1 === 'Lançar SIM (2)' && lf.avisoJ, 'antes de salvar mostra o que vai marcar, o que já estava SIM e o nome que fica de fora: ' + lf.res1);
  ok(/Vai marcar SIM: 2 cafés, 1 almoço\./.test(lf.res2) && lf.bt2 === 'Lançar SIM (3)', 'escolhendo quem é o nome, ele entra na conta: ' + lf.res2);
  ok(lf.carA.sim === true && lf.carA.valor === 6 && lf.carC.sim === true && lf.carC.valor === 3 && lf.carC.ref === 'cafe' && !lf.carJ && lf.bruC.sim === true && lf.anaA.valor === 5 && lf.anaA.hist.length === 3, 'salva SIM com o valor de cada refeição; quem já estava SIM fica como estava; a janta sem valor não entra', lf);
  ok(lf.sts.join() === 'sim,sim,sim' && /Lista de .+ lançada: 2 cafés, 1 almoço com SIM/.test(lf.toast) && lf.log, 'a tela mostra na hora, avisa o que foi lançado e fica no histórico: ' + lf.toast);
  ok(erros.length === 0, 'computador: nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));

  console.log('Celular');
  const docs2 = [...await page.evaluate(() => [...window.__srv.estado.docs.values()].map((d) => [d.colecao, d.id, d.dados]))];
  const m = await abrir(docs2, true);
  await m.page.evaluate(() => JBNAV.ir('#/almoco')); await m.page.waitForSelector('.alm-tela .alm-lin', { timeout: 15000 }); await m.page.waitForTimeout(500);
  await m.page.evaluate(() => T.refeicao('almoco')); await m.page.waitForTimeout(300);
  if (FOTOS) await m.page.screenshot({ path: join(FOTOS, '05-celular.png') });
  const ce = await m.page.evaluate(async () => {
    const b = document.querySelector('.alm-lin .bs').getBoundingClientRect(); const rod = document.querySelector('#almRod').getBoundingClientRect();
    const lin = document.querySelector('.alm-lin').getBoundingClientRect();
    const rf = [...document.querySelectorAll('[data-alm-ref]')].map((x) => x.getBoundingClientRect());
    /* a barra de baixo do celular (e o botão redondo do meio) não pode cobrir o rodapé */
    const barra = document.querySelector('#c2mob'); let lim = innerHeight;
    if (barra && getComputedStyle(barra).display !== 'none') lim = Math.min(barra.getBoundingClientRect().top, ...[...barra.querySelectorAll('.c2-fab span')].map((x) => x.getBoundingClientRect().top));
    const lado = T.semRolagemLateral();
    await T.tocar('f_car', 'sim'); await T.sincronizado();
    return { refAlt: Math.min(...rf.map((x) => x.height)), refLarg: Math.min(...rf.map((x) => x.width)), alt: b.height, larg: b.width, rodVisivel: rod.bottom <= lim + 1 && rod.top < lim, primeira: lin.bottom <= Math.min(rod.top, lim) + 1, lado, car: T.st('f_car'), volta: T.nomes().length, med: [Math.round(lin.top), Math.round(lin.bottom), Math.round(rod.top), Math.round(rod.bottom), Math.round(lim)] };
  });
  ok(ce.alt >= 48 && ce.larg >= 60, `botões SIM e NÃO grandes para o dedo (${Math.round(ce.larg)} × ${Math.round(ce.alt)} px)`);
  ok(ce.refAlt >= 48 && ce.refLarg >= 100, `botões Café, Almoço e Janta grandes, lado a lado (${Math.round(ce.refLarg)} × ${Math.round(ce.refAlt)} px)`);
  ok(ce.rodVisivel && ce.primeira && ce.lado, 'o rodapé com a refeição, o valor e o total do dia fica à vista (acima da barra de baixo), a primeira pessoa aparece sem rolar e nada rola para o lado', ce.med);
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
