#!/usr/bin/env node
// Teste de ponta a ponta da V143, no navegador, com o programa REAL (saida/claude.html) e o banco
// central simulado (scripts/lib/servidor-falso.mjs). Dados de teste, só em memória.
//  Setor do Barro em dois painéis (pedido do Jeferson em 20/11/2026):
//   · o painel principal (Início) mostra só o consumo de barro ligado à maromba: consumo do mês, hoje,
//     ontem, valor e custo do barro, média por dia, acumulado do ano, dia a dia e quem lançou;
//   · a extração tem painel próprio, aberto pelo botão "Extração do barro" no alto do painel principal;
//   · o lançamento da maromba vira consumo de barro sozinho, na hora (inclusive o lançado em outro aparelho).
// Uso: node scripts/construir.mjs && node scripts/testar-barro-paineis.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const mes = hoje.slice(0, 7), dia1 = mes + '-01';
/* maromba confirmada no dia 1: 75.000 + 25.000 tijolos × 2,225 kg = 166,875 + 55,625 = 222,50 t × R$ 6,1663 = R$ 1.372,00.
   Arredondadas linha a linha (166,88 + 55,63) dariam 222,51 t: o total tem que ser o exato, igual ao dos cartões. */
const maromba = (id, q, data, situacao) => ({ id, tipo: 'maromba', data: data || dia1, situacao: situacao || 'Confirmado', turno: '1º turno', bruta: String(q), perdas: '0', liquida: String(q), grades: String(q / 1000), porGrade: '1000', incompleta: '0', criadoEm: (data || dia1) + 'T20:00:00.000Z', criadoPor: 'u_DONO' });
const cfg = (ext) => ['barro', '2026-01-s0', { chave: '2026-01-s0', items: { cfg: { id: 'cfg', jbt: 'config', data: '2026-01-01', criadoEm: '2026-11-12T00:00:00.000Z', criadoPor: 'u_DONO', mostrarExtracao: ext } } }];
const base = (ext) => [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  cfg(ext),
  ['prodFab', mes + '-s0', { chave: mes + '-s0', items: { m1: maromba('m1', 75000), m2: maromba('m2', 25000) } }],
];
/* com extração lançada (10 carradas × 12 t, R$ 1.800 → R$ 15,00/t) e o saldo inicial de 500 t */
const comExtracao = [...base(true), ['barro', mes + '-s1', { chave: mes + '-s1', items: {
  ext1: { id: 'ext1', jbt: 'ext', data: dia1, jazidaId: '', carradas: [{ lid: 'l1', motoristaId: '', cacambaId: '', qtd: 10, ton: 12, valor: 150, forma: 'Por carrada' }], maquinas: [], outros: [{ tipo: 'Outro', valor: 300 }], criadoEm: dia1 + 'T19:00:00.000Z', criadoPor: 'u_DONO' },
  ini1: { id: 'ini1', jbt: 'mov', tipo: 'inicial', data: dia1, ton: 500, carradas: null, motivo: '', obs: '', criadoEm: dia1 + 'T18:00:00.000Z', criadoPor: 'u_DONO' } } }]];

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const enderecoBase = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
const resultados = [];
let falhas = 0;
const ok = (c, m) => { resultados.push([c ? 'ok' : 'FALHOU', m]); console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

async function abrir(docs, largura) {
  const ctx = await browser.newContext({ viewport: { width: largura || 1280, height: 1400 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
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
  await page.goto(enderecoBase + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.evaluate(() => {
    const num = (s) => { const m = String(s || '').replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; };
    window.T = {
      num,
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      ir: async (h) => { JBNAV.ir(h); await new Promise((r) => setTimeout(r, 900)); },
      /* cartões de indicador do painel: rótulo → { v: número grande, s: linha de baixo } */
      kpis: () => Object.fromEntries([...document.querySelectorAll('#svCorpo .hero .kpi')].map((k) => [((k.querySelector('.l') || {}).textContent || '').trim(), { v: ((k.querySelector('.v') || {}).textContent || '').trim(), s: ((k.querySelector('.delta') || {}).textContent || '').trim(), href: k.getAttribute('href') || '' }])),
      kpi: (rot) => { const e = Object.entries(T.kpis()).find(([l]) => l.startsWith(rot)); return e ? e[1] : null; },
      /* abas do setor (são elas que montam o Módulos, os atalhos, o Novo e a barra do celular) */
      abas: () => [...document.querySelectorAll('#conteudo .sv-abas a span')].map((s) => s.textContent.trim()),
      quadradinhos: () => [...document.querySelectorAll('#conteudo .c2-tile b')].map((b) => b.textContent.trim()),
      botaoExtracao: () => [...document.querySelectorAll('#conteudo a[href="#/barroExtracao"].btn')].find((a) => a.offsetParent !== null) || null,
      novo: () => ((document.getElementById('c2novo') || {}).textContent || ''),
      txt: () => (document.getElementById('svCorpo') || document.body).textContent,
      rodape: (titulo) => { const s = [...document.querySelectorAll('#svCorpo section.bloco')].find((x) => (x.querySelector('h3') || {}).textContent.startsWith(titulo)); const f = s && s.querySelector('tfoot'); return f ? f.textContent.replace(/\s+/g, ' ').trim() : ''; },
    };
  });
  return { ctx, page, erros };
}
const semErros = (erros) => { const rel = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e)); ok(rel.length === 0, rel.length ? 'erros de JavaScript: ' + rel.slice(0, 3).join(' | ') : 'sem erros de JavaScript'); };
const DA_EXTRACAO = ['Extraído hoje', 'Extraído em', 'Custo por carrada', 'Custo por tonelada', 'Estoque de barro', 'Motoristas a pagar'];
const DENTRO = ['Lançar extração', 'Lançamentos', 'Custo do barro', 'Motoristas a pagar', 'Jazidas', 'Motoristas', 'Caçambas'];

try {
  console.log('1. Painel principal: só o consumo de barro (parte de extração ligada)');
  { const { ctx, page, erros } = await abrir(base(true));
    const a = await page.evaluate(async () => { await T.ir('#/setor-barro'); const K = T.kpis();
      return { rotulos: Object.keys(K), cons: T.kpi('Consumo do mês'), hj: T.kpi('Hoje'), ont: T.kpi('Ontem'), val: T.kpi('Valor do barro consumido'), cu: T.kpi('Custo do barro por tonelada'), med: T.kpi('Média por dia'), ac: T.kpi('Acumulado em'),
        btn: !!T.botaoExtracao(), abas: T.abas(), quad: T.quadradinhos(), novo: T.novo(), rodape: T.rodape('Lançamentos da maromba'), rodDia: T.rodape('Dia a dia'), txt: T.txt() }; });
    ok(a.cons && a.cons.v === '222,50 t' && /R\$\s1\.372,00/.test(a.cons.s) && /100\.000 tijolos da maromba/.test(a.cons.s), `consumo do mês pela maromba: ${a.cons && a.cons.v} (${a.cons && a.cons.s})`);
    ok(a.val && /1\.372,00/.test(a.val.v) && /222,50 t × R\$\s6,1663\/t/.test(a.val.s), `valor do barro consumido em R$ (${a.val && a.val.v} · ${a.val && a.val.s})`);
    ok(a.cu && /6,1663/.test(a.cu.v) && /13,72 por milheiro/.test(a.cu.s) && /Índices jan–set\/2026/.test(a.cu.s), `custo do barro: ${a.cu && a.cu.v} (${a.cu && a.cu.s})`);
    ok(!!(a.hj && a.ont && a.med && a.ac), 'hoje, ontem, média por dia e acumulado do ano no painel');
    ok(a.ac && a.ac.v === '222,50 t' && /desde/.test(a.ac.s), `acumulado do ano (${a.ac && a.ac.v} · ${a.ac && a.ac.s})`);
    const intrusos = a.rotulos.filter((l) => DA_EXTRACAO.some((x) => l.startsWith(x)));
    ok(intrusos.length === 0 && a.rotulos.length === 7, `nenhum cartão da extração no painel principal (${a.rotulos.length} cartões${intrusos.length ? '; sobrou: ' + intrusos.join(', ') : ''})`);
    ok(a.btn, 'botão "Extração do barro" no alto do painel principal');
    ok(a.abas.includes('Extração do barro') && !a.abas.some((l) => DENTRO.includes(l)), `fora da extração, as telas de dentro dela não aparecem (abas: ${a.abas.join(', ')})`);
    ok(a.quad.includes('Extração do barro') && !a.quad.some((l) => DENTRO.includes(l)), `módulos do painel principal sem as telas da extração (${a.quad.join(', ')})`);
    ok(!/Lançar extração/.test(a.novo), 'o botão Novo do painel principal não oferece lançar extração');
    ok(/222,50/.test(a.rodape) && !/222,51/.test(a.rodape) && /1\.372,00/.test(a.rodape), `total de "quem lançou" é o exato, igual ao dos cartões (${a.rodape})`);
    ok(/222,50/.test(a.rodDia) && /1\.372,00/.test(a.rodDia), `total do dia a dia (${a.rodDia})`);
    ok(/Dono/.test(a.txt) && /toneladas × R\$\s6,1663\/t/.test(a.txt), 'quem lançou a maromba e a conta do valor no pé do painel');

    console.log('2. O botão abre o painel da extração; o Voltar volta ao consumo');
    const b = await page.evaluate(async () => { T.botaoExtracao().click(); await T.dorme(1000); const K = T.kpis();
      return { hash: location.hash, rotulos: Object.keys(K), ht: T.kpi('Extraído hoje'), em: T.kpi('Extraído em'), ct: T.kpi('Custo por tonelada'), cc: T.kpi('Custo por carrada'), est: T.kpi('Estoque de barro'), mot: T.kpi('Motoristas a pagar'),
        abas: T.abas(), novo: T.novo(), cad: [...document.querySelectorAll('#svCorpo .bloco')].filter((x) => /Cadastros da extração/.test(x.textContent)).map((x) => [...x.querySelectorAll('a')].map((l) => l.getAttribute('href'))).flat(),
        lancar: !![...document.querySelectorAll('#conteudo a[href="#/barroExt/nova"].btn')].find((x) => x.offsetParent !== null) }; });
    ok(b.hash === '#/barroExtracao', `o botão leva ao painel da extração (${b.hash})`);
    ok(!!(b.ht && b.em && b.ct && b.cc && b.est && b.mot), 'painel da extração com extraído hoje e no mês, custo por tonelada e por carrada, estoque e motoristas a pagar');
    ok(!b.rotulos.some((l) => /^Consumo do mês|^Valor do barro consumido|^Custo do barro por tonelada/.test(l)), 'os cartões do consumo ficam só no painel principal');
    ok(b.ct && /6,1663/.test(b.ct.v) && /valor de referência/.test(b.ct.s) && b.cc && b.cc.v === '—', `sem extração lançada: custo por tonelada de referência (${b.ct && b.ct.v}) e por carrada "—"`);
    ok(b.est && /valor R\$/.test(b.est.s), `estoque com o valor (${b.est && b.est.s})`);
    ok(DENTRO.every((l) => b.abas.includes(l)), `dentro da extração aparecem as telas dela (abas: ${b.abas.join(', ')})`);
    ok(b.lancar && /Lançar extração/.test(b.novo), 'no painel da extração: botão "Lançar extração do dia" e o Novo com lançar extração');
    ok(['#/barroJaz', '#/barroMot', '#/barroCac'].every((h) => b.cad.includes(h)), 'quadro "Cadastros da extração" com jazidas, motoristas e caçambas');
    const v = await page.evaluate(async () => { JBNAV.voltar(); await T.dorme(900); return { hash: location.hash, cons: !!T.kpi('Consumo do mês') }; });
    ok(v.hash === '#/setor-barro' && v.cons, `Voltar do painel da extração volta ao painel do consumo (${v.hash})`);

    console.log('3. A maromba vira consumo sozinha, na hora (lançada em outro aparelho)');
    const antes = await page.evaluate(() => ({ hj: T.num(T.kpi('Hoje').v), mes: T.num(T.kpi('Consumo do mês').v) }));
    const pend = await page.evaluate(async ({ mes, hoje, item }) => {
      window.__srv.estado.gravarDireto('prodFab', mes + '-s3', { chave: mes + '-s3', items: { mp: item } });
      await APP.central.sincronizar().catch(() => {}); await T.dorme(1200);
      return { hj: T.kpi('Hoje'), noDado: (DATA.pmaromba || []).some((r) => r.id === 'mp') };
    }, { mes, hoje, item: maromba('mp', 30000, hoje, 'Pendente de confirmação') });
    ok(pend.noDado && T_num(pend.hj && pend.hj.v) === antes.hj, `lançamento pendente da maromba não conta no barro (hoje ${pend.hj && pend.hj.v})`);
    if (hoje !== dia1) ok(pend.hj && /espera confirmação/.test(pend.hj.s), `o cartão de hoje avisa que a maromba espera confirmação (${pend.hj && pend.hj.s})`);
    const conf = await page.evaluate(async ({ mes, item }) => {
      window.__srv.estado.gravarDireto('prodFab', mes + '-s4', { chave: mes + '-s4', items: { mh: item } });
      await APP.central.sincronizar().catch(() => {}); await T.dorme(1200);
      return { hash: location.hash, hj: T.kpi('Hoje'), cons: T.kpi('Consumo do mês') };
    }, { mes, item: maromba('mh', 50000, hoje) });
    /* 50.000 tijolos × 2,225 kg = 111,25 t × R$ 6,1663 = R$ 686,00 */
    ok(conf.hash === '#/setor-barro' && Math.abs(T_num(conf.hj && conf.hj.v) - (antes.hj + 111.25)) < 0.005 && /R\$\s686,00/.test(conf.hj.s) && /50\.000 tijolos/.test(conf.hj.s), `maromba confirmada de hoje entra sozinha: ${conf.hj && conf.hj.v} (${conf.hj && conf.hj.s})`);
    ok(Math.abs(T_num(conf.cons && conf.cons.v) - (antes.mes + 111.25)) < 0.005, `consumo do mês acumula a maromba de hoje: ${conf.cons && conf.cons.v}`);
    semErros(erros); await ctx.close(); }

  console.log('4. Parte de extração desligada');
  { const { ctx, page, erros } = await abrir(base(false));
    const a = await page.evaluate(async () => { await T.ir('#/setor-barro'); const r = { btn: !!T.botaoExtracao(), abas: T.abas(), cons: T.kpi('Consumo do mês'), mostrar: !!document.getElementById('bExtr') };
      await T.ir('#/barroExtracao'); r.ext = T.txt(); r.kp = Object.keys(T.kpis()).length; return r; });
    ok(!a.btn && !a.abas.includes('Extração do barro'), 'sem o botão nem a tela "Extração do barro"');
    ok(a.cons && a.cons.v === '222,50 t', `o painel principal é o mesmo (consumo do mês ${a.cons && a.cons.v})`);
    ok(a.mostrar, 'o administrador vê "Mostrar a parte de extração" no pé do painel');
    ok(/A parte de extração está oculta/.test(a.ext) && a.kp === 0, 'o endereço do painel da extração mostra que ela está oculta, sem números');
    semErros(erros); await ctx.close(); }

  console.log('5. Extração lançada com custo e saldo inicial');
  { const { ctx, page, erros } = await abrir(comExtracao);
    const a = await page.evaluate(async () => { await T.ir('#/setor-barro'); const r = { rot: Object.keys(T.kpis()), val: T.kpi('Valor do barro consumido'), cu: T.kpi('Custo do barro por tonelada') };
      await T.ir('#/barroExtracao'); Object.assign(r, { em: T.kpi('Extraído em'), ct: T.kpi('Custo por tonelada'), cc: T.kpi('Custo por carrada'), est: T.kpi('Estoque de barro') });
      await T.ir('#/setores'); const b = document.querySelector('[data-setor="barro"]'); const card = b && b.closest('.spot-card'); r.cartao = card ? ((card.querySelector('.spot-info') || {}).textContent || '') : ''; return r; });
    ok(!a.rot.some((l) => DA_EXTRACAO.some((x) => l.startsWith(x))), 'com extração lançada, o painel principal continua só com o consumo');
    ok(a.val && /1\.372,00/.test(a.val.v) && a.cu && /6,1663/.test(a.cu.v), 'o valor do consumo continua pelo R$/t das Configurações (a troca pelo custo real é feita lá)');
    ok(a.em && a.em.v === '120,00 t' && /10 carradas/.test(a.em.s), `extraído no mês: ${a.em && a.em.v} (${a.em && a.em.s})`);
    ok(a.ct && /15,00/.test(a.ct.v) && /custo real da extração/.test(a.ct.s), `custo real por tonelada no painel da extração (${a.ct && a.ct.v})`);
    ok(a.cc && /180,00/.test(a.cc.v), `custo por carrada real (${a.cc && a.cc.v})`);
    /* estoque: 500 + 120 − 222,5 = 397,5 t × R$ 6,1663 = R$ 2.451,10; ritmo: 222,5 t num dia com produção → ≈ 2 dias */
    ok(a.est && a.est.v === '397,50 t' && /2\.451,10/.test(a.est.s) && /dá para ≈ 2 dia/.test(a.est.s), `estoque com valor e dias no ritmo da maromba (${a.est && a.est.v} · ${a.est && a.est.s})`);
    ok(/^Consumo do estoque em/.test(a.cartao) && /extraído 120,00 t/.test(a.cartao), `cartão do setor na seleção: o consumo primeiro (${a.cartao})`);
    semErros(erros); await ctx.close(); }

  console.log('6. Celular: os dois painéis sem rolagem para o lado');
  { const { ctx, page, erros } = await abrir(base(true), 390);
    const a = await page.evaluate(async () => { const larg = () => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
      const cabe = () => [...document.querySelectorAll('#svCorpo .hero .kpi')].every((k) => { const v = k.querySelector('.v'); return !v || v.scrollWidth <= k.clientWidth; });
      await T.ir('#/setor-barro'); const r = { l1: larg(), c1: cabe(), n1: Object.keys(T.kpis()).length };
      await T.ir('#/barroExtracao'); Object.assign(r, { l2: larg(), c2: cabe(), n2: Object.keys(T.kpis()).length }); return r; });
    ok(a.l1 <= 392 && a.l2 <= 392, `sem rolagem lateral (consumo ${a.l1}px, extração ${a.l2}px)`);
    ok(a.c1 && a.c2 && a.n1 === 7 && a.n2 === 6, 'os valores cabem dentro dos cartões nos dois painéis');
    semErros(erros); await ctx.close(); }
} catch (e) { falhas++; console.log('  ✘ o teste parou: ' + (e && e.message ? e.message : e)); }
finally { await browser.close(); http.close(); }
function T_num(s) { const m = String(s || '').replace(/\./g, '').replace(',', '.').match(/-?\d+(\.\d+)?/); return m ? +m[0] : NaN; }
const ap = resultados.filter((r) => r[0] === 'ok').length;
console.log(`\nSetor do Barro em dois painéis (V143): ${ap} aprovados, ${falhas} falharam.`);
process.exit(falhas ? 1 : 0);
