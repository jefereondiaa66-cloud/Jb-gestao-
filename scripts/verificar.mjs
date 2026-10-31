#!/usr/bin/env node
// Bateria de verificação do JB Gestão. Roda antes de toda publicação
// (Netlify e GitHub Actions): se qualquer item falhar, nada é publicado e
// a versão anterior continua no ar.
//
//   node scripts/verificar.mjs            tudo
//   node scripts/verificar.mjs ponte      só os testes da ponte do Claude
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { RAIZ, construir, montarNuvem, montarClaude, extrairDoClaude, ENVELOPE_CLAUDE, FIM_CLAUDE } from './construir.mjs';
import { criarServidorFalso } from './lib/servidor-falso.mjs';

const filtro = process.argv[2] || '';
const testes = [];
const teste = (grupo, nome, fn) => testes.push({ grupo, nome, fn });
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms = 3000, passo = 10) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await cond()) return true; await esperar(passo); }
  throw new Error('condição não atingida em ' + ms + ' ms');
}

/* ---------- utilidades de HTML ---------- */
function scriptsEmbutidos(html, nome) {
  const out = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs) || /type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(attrs)) continue;
    out.push({ nome: `${nome} script #${n}${/id="([^"]+)"/.test(attrs) ? ' (' + /id="([^"]+)"/.exec(attrs)[1] + ')' : ''}`, codigo: m[2] });
  }
  return out;
}
function compilar(codigo, nome) {
  try { new vm.Script(codigo, { filename: nome }); }
  catch (e) { throw new Error(`${nome}: ${e.message}`); }
}
function blocoPonte(html) {
  const m = /<script id="jb-core-ponte">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('bloco jb-core-ponte não encontrado');
  return m[1];
}

/* =====================================================================
   1. O programa
   ===================================================================== */
teste('programa', 'estrutura básica intacta', () => {
  const app = ler('app/jb-gestao.html');
  assert.ok(app.startsWith('<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n'), 'início do documento mudou');
  assert.ok(app.endsWith('</html>\n'), 'fim do documento mudou');
  for (const [marca, n] of [['<script id="spot-guarda">', 1], ['<script id="jb-core-ponte">', 1], ['async function iniciar(){', 1],
    ['APP.pronto=true', 1], ['iniciar().catch(', 1], ['function bancoLocal(){', 1], ['function assinar(){', 1]]) {
    const c = app.split(marca).length - 1;
    assert.equal(c, n, `"${marca}" aparece ${c} vez(es), esperado ${n}`);
  }
});
teste('programa', 'todo o JavaScript do programa compila', () => {
  const app = ler('app/jb-gestao.html');
  const ss = scriptsEmbutidos(app, 'app/jb-gestao.html');
  assert.ok(ss.length >= 4, 'scripts demais sumiram');
  ss.forEach((s) => compilar(s.codigo, s.nome));
});
teste('programa', 'arquivos da nuvem compilam', () => {
  compilar(ler('nuvem/jb-nuvem.js'), 'nuvem/jb-nuvem.js');
  scriptsEmbutidos(ler('nuvem/admin.html'), 'nuvem/admin.html').forEach((s) => compilar(s.codigo, s.nome));
  JSON.parse(ler('nuvem/manifest.webmanifest'));
});
teste('programa', 'nenhum segredo no que é publicado', () => {
  const textos = { app: ler('app/jb-gestao.html'), cab: ler('nuvem/cabecalho.html'), adm: ler('nuvem/admin.html'), js: ler('nuvem/jb-nuvem.js') };
  for (const [n, t] of Object.entries(textos)) {
    assert.ok(!/service_role|sb_secret_[A-Za-z0-9]|BEGIN (RSA |EC )?PRIVATE KEY|SUPABASE_SERVICE/.test(t), `${n}: parece conter chave secreta`);
    for (const jwt of t.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
      const corpo = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      assert.equal(corpo.role, 'anon', `${n}: chave com papel "${corpo.role}" (só a chave pública anon pode ir para o site)`);
    }
  }
});

/* =====================================================================
   2. Construção (os dois envelopes do mesmo programa)
   ===================================================================== */
teste('construcao', 'nuvem e Claude levam exatamente o mesmo programa', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jb-'));
  try {
    const v = construir(tmp);
    const app = ler('app/jb-gestao.html'), cab = ler('nuvem/cabecalho.html');
    const nuvem = readFileSync(join(tmp, 'dist/index.html'), 'utf8');
    const claude = readFileSync(join(tmp, 'saida/claude.html'), 'utf8');
    assert.equal(nuvem, montarNuvem(app, cab));
    assert.equal(nuvem.replace(cab, ''), app, 'a nuvem deve ser o programa + cabeçalho, sem nenhuma outra diferença');
    assert.ok(claude.startsWith(ENVELOPE_CLAUDE) && claude.endsWith(FIM_CLAUDE));
    assert.equal(extrairDoClaude(claude), app, 'ida e volta Claude ⇄ repositório perde algo');
    assert.equal(montarClaude(extrairDoClaude(claude)), claude);
    for (const f of ['jb-nuvem.js', 'admin.html', 'manifest.webmanifest', 'icone.svg', '_headers', 'versao.json'])
      readFileSync(join(tmp, 'dist', f));
    const vj = JSON.parse(readFileSync(join(tmp, 'dist/versao.json'), 'utf8'));
    assert.equal(vj.versao, v.versao); assert.match(vj.programa_sha256, /^[0-9a-f]{64}$/);
    assert.ok(nuvem.indexOf('jb-nuvem.js') < nuvem.indexOf('<script id="spot-guarda">'), 'o adaptador da nuvem precisa carregar antes do programa');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
teste('construcao', 'TESTE F: publicação com erro é barrada e a versão anterior continua válida', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jb-f-'));
  try {
    for (const d of ['app', 'nuvem', 'scripts']) cpSync(join(RAIZ, d), join(tmp, d), { recursive: true });
    const bom = ler('app/jb-gestao.html');
    // versão "quebrada": um erro de digitação dentro da função de iniciar
    const ruim = bom.replace('async function iniciar(){', 'async function iniciar(){ let quebrado = ;');
    writeFileSync(join(tmp, 'app/jb-gestao.html'), ruim);
    assert.throws(() => scriptsEmbutidos(ruim, 'versão nova').forEach((s) => compilar(s.codigo, s.nome)), /SyntaxError|Unexpected/);
    // recuperação: voltar ao arquivo anterior (é o que "git revert" faz) devolve uma versão que passa
    writeFileSync(join(tmp, 'app/jb-gestao.html'), bom);
    scriptsEmbutidos(readFileSync(join(tmp, 'app/jb-gestao.html'), 'utf8'), 'versão restaurada').forEach((s) => compilar(s.codigo, s.nome));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* =====================================================================
   3. Ponte do Claude com o banco central (com servidor falso)
   ===================================================================== */
function ambiente() {
  const armazenado = new Map(), timers = new Set(), ouvintesDoc = [];
  let encerrado = false;   // depois do teste, nenhum relógio novo da ponte é aceito
  const elem = () => ({ style: {}, setAttribute() {}, addEventListener() {}, remove() {}, appendChild() {}, querySelector: () => elem(), textContent: '', innerHTML: '', href: '' });
  const toasts = [];
  const g = {
    console, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Error, RegExp, Uint8Array, TextEncoder, TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: globalThis.crypto,
    setTimeout: (f, ms) => { if (encerrado) return 0; const t = setTimeout(f, ms); timers.add(t); return t; },
    clearTimeout: (t) => clearTimeout(t),
    setInterval: (f, ms) => { if (encerrado) return 0; const t = setInterval(f, ms); timers.add(t); return t; },
    addEventListener: () => {},
    location: { reload() {} },
    localStorage: { getItem: (k) => (armazenado.has(k) ? armazenado.get(k) : null), setItem: (k, v) => armazenado.set(k, String(v)), removeItem: (k) => armazenado.delete(k) },
    document: { hidden: false, body: elem(), documentElement: elem(), addEventListener: (t, f) => ouvintesDoc.push([t, f]), getElementById: () => null, createElement: () => elem() },
    toast: (m, t) => toasts.push([t, m]),
  };
  g.window = g;
  return { g, armazenado, toasts, limpar: () => { encerrado = true; timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); } };
}
function carregarPonte(amb, ajustes) {
  vm.createContext(amb.g);
  vm.runInContext(blocoPonte(ler('app/jb-gestao.html')), amb.g, { filename: 'jb-core-ponte' });
  Object.assign(amb.g.JB_CORE_PONTE.CFG, { intervalo: 30, intervaloOculto: 30, esperaGravacao: 150, esperaSemCache: 400, prazoConexao: 1500, sinal: 0 }, ajustes || {});
  return amb.g.JB_CORE_PONTE;
}
function bancoReserva(inicial) {   // imita o banco do artifact (somente o necessário)
  const docs = new Map(Object.entries(inicial || {}));
  const snap = (p) => ({ id: p.split('/').pop(), exists: docs.has(p), data: () => docs.get(p) });
  return {
    doc: (p) => ({ get: async () => snap(p), onSnapshot: (cb) => { setTimeout(() => cb(snap(p)), 0); return () => {}; } }),
    collection: (c) => { const q = { where: () => q, get: async () => ({ docs: [...docs.keys()].filter((k) => k.startsWith(c + '/')).map(snap) }), onSnapshot: (cb) => { q.get().then(cb); return () => {}; } }; return q; },
  };
}
async function cenario(fn, opcoes = {}) {
  const amb = opcoes.amb || ambiente();
  const srv = opcoes.srv || criarServidorFalso({ admins: ['u_ADMIN'] });
  try { return await fn({ amb, srv }); } finally { amb.limpar(); }
}
async function ligar(amb, srv, extra = {}) {
  const ponte = carregarPonte(amb, extra.cfg);
  const r = await ponte.conectar({ mcp: 'mcp' in extra ? extra.mcp : srv.mcp, uid: extra.uid || 'u_ADMIN', reserva: extra.reserva || bancoReserva() });
  return { ponte, db: r.db, api: r.api };
}

teste('ponte', 'abre o banco central e entrega os dados no formato do sistema', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('funcionarios', 'f1', { nome: 'Ana', setor: 'Produção' });
  srv.estado.gravarDireto('config', 'empresa', { empresa: { razao: 'Teste' } });
  const { db, api } = await ligar(amb, srv);
  assert.equal(api.estado().modo, 'central');
  const g = await db.doc('funcionarios/f1').get();
  assert.ok(g.exists); assert.equal(g.data().nome, 'Ana');
  const s = await db.collection('funcionarios').get();
  assert.equal(s.size, 1);
  let visto = null; db.doc('config/empresa').onSnapshot((x) => { visto = x; });
  await ate(() => visto && visto.exists);
}));
teste('ponte', 'lê o banco em várias páginas sem perder registros', () => cenario(async ({ amb, srv }) => {
  const grande = 'x'.repeat(4000);
  for (let i = 0; i < 60; i++) srv.estado.gravarDireto('compras', 'c' + String(i).padStart(3, '0'), { texto: grande, n: i });
  const { db } = await ligar(amb, srv, { cfg: { pagina: 20000 } });
  const s = await db.collection('compras').get();
  assert.equal(s.size, 60);
  assert.ok(srv.estado.chamadas.filter((c) => /instantaneo_pagina/.test(c.query)).length >= 10, 'deveria ter lido em várias páginas');
}));
teste('ponte', 'TESTE B: funcionário cadastrado no Claude é gravado no banco central', () => cenario(async ({ amb, srv }) => {
  const { db } = await ligar(amb, srv);
  await db.doc('funcionarios/novo1').set({ nome: 'Carlos', cargo: 'Forneiro', admissao: '2026-10-30' });
  await ate(() => srv.estado.docs.has('funcionarios/novo1'));
  assert.equal(srv.estado.docs.get('funcionarios/novo1').dados.nome, 'Carlos');
  assert.equal(srv.estado.contarAplicadas(), 1);
}));
teste('ponte', 'TESTE C: despesa lançada (documento agrupado) chega ao banco e aos relatórios', () => cenario(async ({ amb, srv }) => {
  const { db } = await ligar(amb, srv);
  let relatorio = [];
  db.collection('despesas').where('chave', '>=', '2026-09').onSnapshot((s) => {
    relatorio = []; s.docs.forEach((d) => Object.values(d.data().items || {}).forEach((x) => x && relatorio.push(x)));
  });
  // o mesmo caminho do sistema (bucketPut0): tenta atualizar; se o bloco não existe, cria
  async function lancar(chave, id, val) {
    const ref = db.doc('despesas/' + chave);
    try { await ref.update({ items: { [id]: val } }); }
    catch (e) {
      assert.equal(e.code, 'invalid_argument');
      const g = await ref.get();
      if (!g.exists) await ref.set({ chave, items: { [id]: val } }); else await ref.update({ items: { [id]: val } });
    }
  }
  await lancar('2026-10-s3', 'd1', { id: 'd1', competencia: '2026-10', valor: 150.5, descricao: 'Lenha' });
  await lancar('2026-10-s3', 'd2', { id: 'd2', competencia: '2026-10', valor: 80, descricao: 'Diesel' });
  await ate(() => relatorio.length === 2);
  await ate(() => srv.estado.docs.has('despesas/2026-10-s3') && Object.keys(srv.estado.docs.get('despesas/2026-10-s3').dados.items).length === 2);
  assert.equal(relatorio.reduce((s, x) => s + x.valor, 0), 230.5);
}));
teste('ponte', 'TESTE D: alteração feita na nuvem aparece no Claude, e a do Claude chega na nuvem', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo 8 furos', preco: 1.1 });
  const { db } = await ligar(amb, srv);
  let preco = null; db.doc('produtos/p1').onSnapshot((s) => { preco = s.exists ? s.data().preco : null; });
  await ate(() => preco === 1.1);
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo 8 furos', preco: 1.25 });     // alguém altera na nuvem
  await ate(() => preco === 1.25);
  await db.doc('produtos/p1').update({ preco: 1.3 });                                     // e o Claude altera de volta
  await ate(() => srv.estado.docs.get('produtos/p1').dados.preco === 1.3);
  assert.equal(srv.estado.docs.get('produtos/p1').dados.nome, 'Tijolo 8 furos', 'a mescla não pode apagar outros campos');
  srv.estado.apagarDireto('produtos', 'p1');                                                // exclusão na nuvem
  await ate(() => preco === null);
}));
teste('ponte', 'conferência completa só redesenha o que mudou e a página parada consulta menos', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo', preco: 1 });
  srv.estado.gravarDireto('clientes', 'c1', { nome: 'Construtora X' });
  const { db, api } = await ligar(amb, srv, { cfg: { intervalo: 100000 } });
  let nProd = 0, nCli = 0;
  db.collection('produtos').onSnapshot(() => { nProd++; });
  db.collection('clientes').onSnapshot(() => { nCli++; });
  await ate(() => nProd === 1 && nCli === 1);
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo', preco: 2 });
  await api.sincronizar();
  await ate(() => nProd === 2);
  await esperar(50);
  assert.equal(nCli, 1, 'clientes não mudou: não pode redesenhar');
  await api.sincronizar(); await esperar(50);
  assert.equal(nProd, 2, 'sem mudança nenhuma: não pode redesenhar');
  const ponte = amb.g.JB_CORE_PONTE.CFG;
  assert.ok(ponte.intervalo >= 1 && ponte.ocioso > 0, 'ritmo com regra de ociosidade');
  const original = ler('app/jb-gestao.html');
  const cfg = /intervalo: (\d+), intervaloOculto: ([^,]+), ocioso: ([^,]+), conferencia: ([^,]+),/.exec(original);
  assert.ok(cfg, 'ritmo da ponte não encontrado');
  assert.ok(+cfg[1] >= 30000, 'consulta de mudanças não pode ser mais rápida que 30 s');
  assert.ok(eval(cfg[2]) >= 5 * 60 * 1000 && eval(cfg[4]) >= 30 * 60 * 1000, 'aba escondida/parada e conferência precisam ser econômicas');
}));
teste('ponte', 'TESTE E: resposta perdida no meio da gravação não duplica o registro', () => cenario(async ({ amb, srv }) => {
  const { db, api } = await ligar(amb, srv);
  srv.estado.falhas.depois = 1;        // o banco grava, mas a resposta não chega
  const p = db.doc('vendas/v1').set({ cliente: 'Construtora X', total: 900 });
  await ate(() => api.estado().pendentes === 0, 8000);
  await p;
  assert.equal(srv.estado.docs.get('vendas/v1').versao, 1, 'o documento só pode ter sido gravado uma vez');
  assert.equal(srv.estado.contarAplicadas(), 1);
  const envios = srv.estado.chamadas.filter((c) => /jbcore\.aplicar/.test(c.query)).length;
  assert.ok(envios >= 2, 'deveria ter reenviado a mesma operação');
}));
teste('ponte', 'TESTE E: sem conexão, o lançamento fica guardado e sobe ao reabrir, uma vez só', async () => {
  const amb = ambiente(), srv = criarServidorFalso({ admins: ['u_ADMIN'] });
  try {
    const a = await ligar(amb, srv);
    srv.estado.falhas.permanente = 'server_unavailable';            // a internet cai
    await a.db.doc('fin/2026-10-s1').set({ chave: '2026-10-s1', items: { t1: { valor: 500 } } });   // a tela não trava
    assert.equal(a.api.estado().pendentes, 1);
    const guardado = JSON.parse(amb.armazenado.get('jbcore_fila_v1:u_ADMIN'));
    assert.equal(guardado.length, 1, 'a operação precisa estar guardada no navegador');
    amb.limpar();
    // página fechada e aberta de novo, já com internet
    srv.estado.falhas.permanente = null;
    const amb2 = ambiente(); for (const [k, v] of amb.armazenado) amb2.armazenado.set(k, v);
    try {
      const b = await ligar(amb2, srv);
      await ate(() => b.api.estado().pendentes === 0, 4000);
      assert.equal(srv.estado.docs.get('fin/2026-10-s1').dados.items.t1.valor, 500);
      assert.equal(srv.estado.contarAplicadas(), 1);
      assert.ok(!amb2.armazenado.has('jbcore_fila_v1:u_ADMIN'), 'a fila deve ser limpa depois de confirmada');
    } finally { amb2.limpar(); }
  } finally { amb.limpar(); }
});
teste('ponte', 'atualizar documento que não existe é recusado e não cria nada', () => cenario(async ({ amb, srv }) => {
  const { db } = await ligar(amb, srv);
  await assert.rejects(db.doc('horasExtras/2026-10-s1').update({ items: { h: 1 } }), (e) => e.code === 'invalid_argument');
  assert.ok(!srv.estado.docs.has('horasExtras/2026-10-s1'));
}));
teste('ponte', 'exclusão chega ao banco e repetir a exclusão não dá erro', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('clientes', 'k1', { nome: 'Cliente' });
  const { db } = await ligar(amb, srv);
  await db.doc('clientes/k1').delete();
  await ate(() => !srv.estado.docs.has('clientes/k1'));
  await db.doc('clientes/k1').delete();
  assert.equal((await db.doc('clientes/k1').get()).exists, false);
}));
teste('ponte', 'conflito: gravação sobre versão que mudou fica marcada', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('locais', 'l1', { nome: 'Galpão' });
  const { db, api } = await ligar(amb, srv, { cfg: { intervalo: 100000 } });   // sem puxar mudanças no meio
  srv.estado.gravarDireto('locais', 'l1', { nome: 'Galpão 2' });                // a nuvem muda; o Claude ainda não viu
  await db.doc('locais/l1').set({ nome: 'Galpão A' });
  await ate(() => api.estado().pendentes === 0);
  assert.equal(api.estado().conflitos, 1);
  const op = [...srv.estado.operacoes.values()].pop();
  assert.equal(op.conflito, true);
}));
teste('ponte', 'quem não é administrador fica só consultando (nunca grava numa cópia separada)', () => cenario(async ({ amb, srv }) => {
  const reserva = bancoReserva({ 'funcionarios/a': { nome: 'Antigo' } });
  const { db, api } = await ligar(amb, srv, { uid: 'u_OUTRO', reserva });
  assert.equal(api.estado().modo, 'reserva');
  assert.match(api.estado().motivo, /administradores/);
  assert.equal((await db.doc('funcionarios/a').get()).data().nome, 'Antigo');
  await assert.rejects(db.doc('funcionarios/b').set({ nome: 'X' }), (e) => e.code === 'permission_denied');
  assert.equal(srv.estado.contarAplicadas(), 0);
}));
teste('ponte', 'sem conector (ou conector negado) abre só para consulta com o motivo certo', () => cenario(async ({ amb, srv }) => {
  const r1 = await ligar(amb, srv, { mcp: null });
  assert.equal(r1.api.estado().modo, 'reserva');
  const amb2 = ambiente();
  try {
    const negado = { callTool: async () => { const e = new Error('x'); e.code = 'server_not_connected'; throw e; } };
    const r2 = await ligar(amb2, srv, { mcp: negado });
    assert.match(r2.api.estado().motivo, /conector Supabase não está ligado/);
  } finally { amb2.limpar(); }
}));
teste('ponte', 'banco que não responde a tempo não trava a abertura do sistema', () => cenario(async ({ amb, srv }) => {
  const lento = { callTool: () => new Promise(() => {}) };
  const t0 = Date.now();
  const { api } = await ligar(amb, srv, { mcp: lento, cfg: { prazoConexao: 300 } });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(api.estado().modo, 'reserva');
}));
teste('ponte', 'envia sinal de vida ao banco para o painel', () => cenario(async ({ amb, srv }) => {
  await ligar(amb, srv);
  await ate(() => srv.estado.sinais.length > 0);
  assert.equal(srv.estado.sinais[0].origem, 'claude');
}));

/* ---------- execução ---------- */
const escolhidos = testes.filter((t) => !filtro || t.grupo === filtro);
let ok = 0, falhou = 0;
const inicio = Date.now();
for (const t of escolhidos) {
  try { await t.fn(); ok++; console.log(`  ✔ [${t.grupo}] ${t.nome}`); }
  catch (e) { falhou++; console.log(`  ✘ [${t.grupo}] ${t.nome}\n      ${String(e && (e.stack || e.message) || e).split('\n').slice(0, 4).join('\n      ')}`); }
}
console.log(`\n${ok} de ${escolhidos.length} verificações passaram (${((Date.now() - inicio) / 1000).toFixed(1)} s).`);
if (falhou) console.log('PUBLICAÇÃO BLOQUEADA: corrija os itens marcados com ✘.');
process.exit(falhou ? 1 : 0);
