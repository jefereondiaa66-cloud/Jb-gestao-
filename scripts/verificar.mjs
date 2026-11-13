#!/usr/bin/env node
// Bateria de verificação do JB Gestão. Roda antes de toda publicação
// (Netlify e GitHub Actions): se qualquer item falhar, nada é publicado e
// a versão anterior continua no ar.
//
//   node scripts/verificar.mjs            tudo
//   node scripts/verificar.mjs ponte      só os testes da ponte do Claude
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { RAIZ, construir, montarNuvem, montarClaude, extrairDoClaude, metaSite, ENVELOPE_CLAUDE, FIM_CLAUDE } from './construir.mjs';
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
    assert.match(v.site, /^[0-9a-f]{12}$/);
    assert.equal(nuvem, montarNuvem(app, metaSite(v.site) + cab));
    assert.equal(nuvem.replace(metaSite(v.site) + cab, ''), app, 'a nuvem deve ser o programa + cabeçalho (com a versão do site), sem nenhuma outra diferença');
    assert.ok(nuvem.indexOf('name="jb-site"') < nuvem.indexOf('jb-nuvem.js'), 'a versão do site precisa vir antes do adaptador da nuvem');
    const adm = readFileSync(join(tmp, 'dist/admin.html'), 'utf8');
    assert.equal(adm.replace(metaSite(v.site), ''), ler('nuvem/admin.html'), 'o admin.html só ganha a versão do site');
    assert.ok(claude.startsWith(ENVELOPE_CLAUDE) && claude.endsWith(FIM_CLAUDE));
    assert.equal(extrairDoClaude(claude), app, 'ida e volta Claude ⇄ repositório perde algo');
    assert.equal(montarClaude(extrairDoClaude(claude)), claude);
    for (const f of ['jb-nuvem.js', 'admin.html', 'manifest.webmanifest', 'icone.svg', 'icone-180.png', 'icone-192.png', 'icone-512.png', 'icone-maskable-512.png', 'entrada-celular.jpg', 'entrada-computador.jpg', '_headers', 'versao.json'])
      readFileSync(join(tmp, 'dist', f));
    const vj = JSON.parse(readFileSync(join(tmp, 'dist/versao.json'), 'utf8'));
    assert.equal(vj.versao, v.versao); assert.equal(vj.site, v.site); assert.match(vj.programa_sha256, /^[0-9a-f]{64}$/);
    assert.ok(nuvem.indexOf('jb-nuvem.js') < nuvem.indexOf('<script id="spot-guarda">'), 'o adaptador da nuvem precisa carregar antes do programa');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
teste('programa', 'Setor Fiscal: chamarF usa a função jb-fiscal (nuvem e ponte) e erro incerto nunca vira "nada enviado"', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('async function chamarF('), f = app.indexOf('async function statusServicoF(');
  assert.ok(i > 0 && f > i, 'chamarF não encontrado');
  assert.match(app.slice(i, f), /const via = transporteF\(\);/, 'chamarF precisa usar a ligação nova primeiro');
  assert.match(app.slice(i, f), /if \(TRANSMITE_F\.has\(tool\)\)[^\n]*throw e; \}\n  const m = await mcpF\(\);/, 'o conector antigo nunca pode transmitir (emitir, cancelar, inutilizar)');
  const e1 = app.indexOf('async function emitirTravadaF('), e2 = app.indexOf('async function consultarNotaF(');
  assert.ok(e1 > 0 && e2 > e1, 'emitirTravadaF não encontrado');
  const emitir = app.slice(e1, e2);
  assert.ok(!/mcpF|callTool|FISC\.mcp/.test(emitir), 'emitirTravadaF não pode usar o conector MCP antigo');
  assert.match(emitir, /const lg = ligacaoF\(\);\n  if \(!lg\.via \|\| lg\.motivo\) return \{ ok: false, parar: true/, 'emitirTravadaF para antes de numerar quando a ligação recusaria');
  assert.ok(emitir.indexOf('ligacaoF()') < emitir.indexOf('reservarNumeroF('), 'a ligação é conferida antes de reservar o número');
  const nada = /const NADA_ENVIADO = new Set\(\[([^\]]*)\]\)/.exec(app);
  assert.ok(nada, 'lista NADA_ENVIADO não encontrada');
  for (const c of ['sem_resposta', 'prazo_fiscal', 'rede', 'upstream_error', 'server_unavailable']) assert.ok(!nada[1].includes("'" + c + "'"), c + ' é incerto: não pode estar em NADA_ENVIADO');
  for (const c of ['desligado', 'recusado_banco']) assert.ok(nada[1].includes("'" + c + "'"), c + ' garante que nada foi enviado');
  assert.ok(!/Cloudflare|Nuvem Fiscal ou ACBr/.test(app), 'texto antigo do conector "JB Fiscal" da Cloudflare');
  const nv = ler('nuvem/jb-nuvem.js');
  assert.match(nv, /functions\/v1\/jb-fiscal/); assert.match(nv, /fiscal: fiscal,/);
});
teste('programa', 'leitura por foto aos poucos (V109): programa, adaptador da nuvem e função do servidor falam a mesma língua', () => {
  const app = ler('app/jb-gestao.html'), nv = ler('nuvem/jb-nuvem.js');
  // o pacote que vai para o Netlify não leva a pasta supabase/: a função é conferida só no repositório
  if (existsSync(join(RAIZ, 'supabase/functions/jb-ler-documento/index.ts'))) {
    const fn = ler('supabase/functions/jb-ler-documento/index.ts');
    assert.match(fn, /corpo\.fluxo !== true/, 'a função só responde aos poucos quando pedido (programa antigo continua recebendo a resposta inteira)');
    assert.match(fn, /application\/x-ndjson/); assert.match(fn, /t: "fim"/); assert.match(fn, /t: "erro"/);
    assert.match(fn, /req\.method === "GET"/, 'a função precisa aceitar o GET que só a acorda');
    assert.match(fn, /cancel\(\) \{ parar\(\); \}/, 'cancelar na tela precisa interromper o pedido à IA');
  }
  assert.match(nv, /envio\.fluxo = true/); assert.match(nv, /ndjson/); assert.match(nv, /o\.t === 'fim' \|\| o\.t === 'erro'/);
  assert.match(nv, /A leitura foi interrompida antes de terminar/, 'resposta sem o fim não pode valer como leitura');
  assert.match(app, /lt\.ler\(\{prompt,paginas\},sinal,typeof aoAndar==='function'\?aoAndar:undefined\)/, 'o programa precisa pedir o andamento ao adaptador');
  assert.ok(!/de 20 segundos a alguns minutos/.test(app), 'texto antigo de espera da leitura');
  assert.equal(app.split('em UMA linha só').length - 1, 2, 'os dois pedidos de leitura (documentos e combustível) pedem a resposta enxuta');
});
teste('programa', 'ponto com foto: câmera liberada só para o próprio site e perfil "Celular do ponto" no painel', () => {
  const h = ler('nuvem/_headers');
  assert.match(h, /Permissions-Policy:[^\n]*camera=\(self\)/, 'o celular do ponto precisa da câmera: nuvem/_headers deve ter camera=(self)');
  assert.match(h, /Permissions-Policy:[^\n]*microphone=\(\)/, 'o microfone continua bloqueado');
  const app = ler('app/jb-gestao.html');
  assert.equal(app.split('<script id="ponto-foto-v78">').length - 1, 1, 'bloco do ponto com foto ausente ou repetido');
  assert.match(ler('nuvem/admin.html'), /\['celularPonto', 'Celular do ponto/, 'o painel de usuários precisa oferecer o perfil "Celular do ponto"');
  assert.match(ler('nuvem/jb-nuvem.js'), /createSignedUrls\(/, 'a nuvem precisa trocar as imagens "/_blob/" por endereço temporário');
});
teste('programa', 'ponto facial: bloco presente, depois do ponto com foto, com a coleção "rostos" registrada no banco', () => {
  const app = ler('app/jb-gestao.html');
  assert.equal(app.split('<script id="ponto-facial-v100">').length - 1, 1, 'bloco do ponto facial ausente ou repetido');
  assert.ok(app.indexOf('<script id="ponto-foto-v78">') < app.indexOf('<script id="ponto-facial-v100">'), 'o ponto facial usa o ponto com foto: precisa vir depois dele');
  assert.match(app, /cdn\.jsdelivr\.net\/npm\/@vladmandic\/face-api@\d+\.\d+\.\d+\//, 'a biblioteca do reconhecimento precisa ter a versão fixa');
  const fc = /<script id="ponto-facial-v100">([\s\S]*?)<\/script>/.exec(app)[1];
  assert.ok(!/toDataURL|assets\.upload/.test(fc.slice(fc.indexOf('cadastro do rosto ='), fc.indexOf('as telas: início'))), 'o cadastro do rosto não pode guardar foto, só os códigos');
  // o pacote que vai para o Netlify não leva a pasta supabase/: a migração é conferida só no repositório
  if (existsSync(join(RAIZ, 'supabase/migrations'))) assert.match(ler('supabase/migrations/20261112120000_seg_rostos.sql'), /values \('rostos', 'dp', false, 'dados', true\)/, 'a coleção "rostos" precisa estar em seg.colecoes, no módulo do DP');
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

/* ---------- serviço fiscal pela ponte (jbcore.fiscal + jbcore.resposta) ---------- */
const CFG_FISCAL = { cfg: { prazoFiscal: 1500, esperaFiscal: 10 } };
const SRV_FISCAL = () => criarServidorFalso({ admins: ['u_ADMIN'], fiscal: (acao, args) => acao === 'consultar_nfe'
  ? { status: 200, corpo: { encontrado: true, documento: { id: args.id, status: 'autorizado' } } }
  : { status: 503, corpo: { erro: { tipo: 'configuracao', mensagem: 'Produção bloqueada (simulado).' } } } });
teste('ponte', 'serviço fiscal: pede pelo banco, espera a resposta e devolve o mesmo formato da nuvem', () => cenario(async ({ amb, srv }) => {
  const { api } = await ligar(amb, srv, CFG_FISCAL);
  const r = await api.fiscal('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n1-t1' });
  const simples = (v) => JSON.parse(JSON.stringify(v));   // objetos criados dentro do vm têm outro protótipo
  assert.deepEqual(simples(r), { encontrado: true, documento: { id: 'jb-n1-t1', status: 'autorizado' } });
  const p = srv.estado.fiscal.pedidos[0];
  assert.deepEqual([p.acao, p.args, p.uid], ['consultar_nfe', { ambiente: 'homologacao', id: 'jb-n1-t1' }, 'u_ADMIN']);
  assert.ok(srv.estado.chamadas.filter((c) => /jbcore\.resposta\(/.test(c.query)).length >= 2, 'pergunta pela resposta até ela chegar');
  const recusa = await api.fiscal('emitir_nfe', { ambiente: 'producao' });
  assert.deepEqual(simples(recusa), { erro: { tipo: 'configuracao', mensagem: 'Produção bloqueada (simulado).' } }, 'recusa do serviço volta como {erro}');
  assert.equal(api.estado().modo, 'central');
}, { srv: SRV_FISCAL() }));
teste('ponte', 'serviço fiscal: recusa do banco = nada enviado; sem resposta = incerto (nunca "nada enviado")', async () => {
  const admins = ['u_ADMIN'];
  await cenario(async ({ amb, srv }) => {
    const { api } = await ligar(amb, srv, CFG_FISCAL);
    admins.length = 0;                                                     // deixou de ser administrador
    await assert.rejects(api.fiscal('emitir_nfe', {}), (e) => e.code === 'recusado_banco' && /administradores/.test(e.message));
    assert.equal(srv.estado.fiscal.pedidos.length, 0);
    admins.push('u_ADMIN');
    await assert.rejects(api.fiscal('emitir_nfe', {}), (e) => e.code === 'sem_resposta');        // pg_net: tempo esgotado
    srv.estado.fiscal.esperas = 1e9;                                       // a resposta nunca chega
    await assert.rejects(api.fiscal('emitir_nfe', {}), (e) => e.code === 'prazo_fiscal');
    srv.estado.fiscal.esperas = 1;
    const p = api.fiscal('emitir_nfe', {});
    await ate(() => srv.estado.fiscal.pedidos.length === 3);
    srv.estado.falhas.permanente = 'server_not_connected';                 // o conector cai depois do pedido feito
    await assert.rejects(p, (e) => e.code === 'prazo_fiscal', 'depois do pedido registrado, nenhuma falha pode dizer que nada foi enviado');
  }, { srv: criarServidorFalso({ admins, fiscal: () => ({ erro: 'Timeout of 90000 ms reached' }) }) });
});
teste('ponte', 'serviço fiscal fora do modo central: recusa sem pedir nada ao banco', () => cenario(async ({ amb, srv }) => {
  const { api } = await ligar(amb, srv, { uid: 'u_OUTRO' });
  await assert.rejects(api.fiscal('status_servico', { ambiente: 'homologacao' }), (e) => e.code === 'desligado');
  assert.equal(srv.estado.fiscal.pedidos.length, 0);
}));

/* ---------- Setor Fiscal do programa: por onde cada pedido vai (chamarF de verdade, num contexto isolado) ---------- */
function ligacaoFiscal(janela) {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('const FISC = {'), f = app.indexOf('async function statusServicoF(');
  assert.ok(i > 0 && f > i, 'trecho da ligação fiscal não encontrado');
  const g = { window: janela, Error, Set, Object, String, Promise, JSON, Array };
  vm.createContext(g);
  vm.runInContext("const SERVIDOR_FISCAL = 'JB Fiscal';\n" + app.slice(i, f) + '\nglobalThis.__f = { chamarF, ligacaoF, NADA_ENVIADO };', g, { filename: 'ligacao-fiscal' });
  return g.__f;
}
function conectorAntigo() {   // o conector MCP "JB Fiscal": anota cada chamada
  const chamadas = [];
  return { chamadas, claude: { use: async (n) => (n === 'mcp' ? { callTool: async (...a) => { chamadas.push(a.slice(0, 2)); return { structuredContent: { ok: true } }; } } : null) } };
}
const TRANSMITEM = [['emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-x-t1' }], ['cancelar_nfe', { ambiente: 'homologacao', id: 'jb-x-t1', justificativa: 'x'.repeat(20) }],
  ['inutilizar_numeracao', { ambiente: 'homologacao', serie: 1, numero_inicial: 5, numero_final: 5 }]];
teste('programa', 'Setor Fiscal no Claude: com a ponte, tudo vai por ela; o conector antigo nunca é usado', async () => {
  const antigo = conectorAntigo();
  const amb = ambiente();
  try {
    const ponte = carregarPonte(amb);                         // ainda não ligada ao banco central
    const F = ligacaoFiscal({ JB_CORE_PONTE: ponte, claude: antigo.claude });
    assert.match(F.ligacaoF().motivo, /banco central/, 'fora do modo central, a emissão para antes de numerar');
    for (const [acao, args] of [...TRANSMITEM, ['consultar_nfe', { ambiente: 'homologacao', id: 'jb-x-t1' }], ['status_servico', { ambiente: 'homologacao' }], ['consultar_cep', { cep: '65680000' }]]) {
      await assert.rejects(F.chamarF(acao, args), (e) => e.code === 'desligado' && F.NADA_ENVIADO.has(e.code), acao + ': a ponte recusa (nada enviado)');
    }
    const semFiscal = ligacaoFiscal({ JB_CORE_PONTE: { api: { estado: () => ({ modo: 'central' }) } }, claude: antigo.claude });
    await assert.rejects(semFiscal.chamarF('emitir_nfe', {}), (e) => e.code === 'desligado', 'ponte sem o serviço fiscal: recusa, sem conector');
    assert.ok(semFiscal.ligacaoF().motivo);
    assert.equal(antigo.chamadas.length, 0, 'o conector "JB Fiscal" não pode ser chamado quando a ponte existe');
  } finally { amb.limpar(); }
  await cenario(async ({ amb: a2, srv }) => {
    const { ponte } = await ligar(a2, srv, CFG_FISCAL);       // administrador, banco central ligado
    const F = ligacaoFiscal({ JB_CORE_PONTE: ponte, claude: antigo.claude });
    assert.equal(F.ligacaoF().motivo, '');
    const r = await F.chamarF('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n1-t1' });
    assert.equal(r.documento.status, 'autorizado');
    await assert.rejects(F.chamarF('emitir_nfe', { ambiente: 'producao' }), (e) => e.code === 'tool_error' && e.erro.tipo === 'configuracao');
    assert.deepEqual(srv.estado.fiscal.pedidos.map((p) => p.acao), ['consultar_nfe', 'emitir_nfe']);
    assert.equal(antigo.chamadas.length, 0);
  }, { srv: SRV_FISCAL() });
});
teste('programa', 'Setor Fiscal na nuvem e sem ligação nenhuma: o conector antigo nunca transmite', async () => {
  const antigo = conectorAntigo();
  const pedidos = [];
  const nuvem = ligacaoFiscal({ JB_NUVEM_API: { fiscal: async (a) => { pedidos.push(a); return { ok: true }; } }, JB_CORE_PONTE: { api: { fiscal: async () => { throw new Error('não era para a ponte'); }, estado: () => ({ modo: 'central' }) } }, claude: antigo.claude });
  for (const [acao, args] of TRANSMITEM) assert.deepEqual({ ...(await nuvem.chamarF(acao, args)) }, { ok: true });
  assert.deepEqual(pedidos, ['emitir_nfe', 'cancelar_nfe', 'inutilizar_numeracao'], 'na nuvem vai pela função jb-fiscal');
  const velha = ligacaoFiscal({ JB_NUVEM_API: {}, claude: antigo.claude });   // adaptador da nuvem desatualizado
  await assert.rejects(velha.chamarF('emitir_nfe', {}), (e) => e.code === 'desligado' && /Atualize a página/.test(e.message));
  const nada = ligacaoFiscal({ claude: antigo.claude });                        // nem nuvem nem ponte
  for (const [acao, args] of TRANSMITEM) await assert.rejects(nada.chamarF(acao, args), (e) => e.code === 'sem_mcp' && nada.NADA_ENVIADO.has(e.code), acao);
  assert.equal(antigo.chamadas.length, 0, 'emitir, cancelar e inutilizar nunca passam pelo conector antigo');
  assert.ok(nada.ligacaoF().motivo, 'sem ligação, a emissão para antes de numerar');
  await nada.chamarF('consultar_cep', { cep: '65680000' });                     // só consulta, por compatibilidade
  assert.deepEqual(antigo.chamadas, [['JB Fiscal', 'consultar_cep']]);
});
teste('programa', 'Setor Fiscal: consulta nunca apaga o protocolo já gravado na nota', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('function mesclarSefazF('), f = app.indexOf('/** Aplica a resposta oficial do provedor/SEFAZ à nota.');
  assert.ok(i > 0 && f > i, 'mesclarSefazF não encontrado');
  const a1 = app.indexOf('async function aplicarDocumentoF('), a2 = app.indexOf('async function vincularVendaF(');
  const aplicar = app.slice(a1, a2);
  assert.match(aplicar, /const sefaz = mesclarSefazF\(n\.sefaz, novo\);/);
  assert.ok(!/\.\.\.\(n\.sefaz \|\| \{\}\), \.\.\.sefaz/.test(aplicar), 'a mescla antiga apagava o protocolo com null');
  const g = { Object };
  vm.createContext(g);
  vm.runInContext(app.slice(i, f) + '\nglobalThis.mesclar = mesclarSefazF;', g);
  const gravado = { provedorId: 'jb-n1-t1', chave: '2'.repeat(44), protocolo: '121260000012345', codigo: 100, motivo: 'Autorizado o uso da NF-e', mensagem: null, dataRecebimento: '2026-11-08T10:00:05-03:00', dataEmissao: '2026-11-08T10:00:00-03:00', valorTotal: 1400, statusProvedor: 'autorizado', digest: 'abc=', atualizadoEm: 'antes' };
  const vazio = { provedorId: 'jb-n1-t1', chave: null, protocolo: null, codigo: 135, motivo: null, mensagem: 'aviso novo', dataRecebimento: null, dataEmissao: null, valorTotal: null, statusProvedor: 'cancelado', digest: null, atualizadoEm: 'agora' };
  const m = JSON.parse(JSON.stringify(g.mesclar(gravado, vazio)));
  assert.deepEqual(m, { ...gravado, codigo: 135, mensagem: 'aviso novo', statusProvedor: 'cancelado', atualizadoEm: 'agora' });
  assert.equal(JSON.parse(JSON.stringify(g.mesclar(gravado, { ...vazio, mensagem: null }))).mensagem, null, 'o aviso é sempre o da resposta nova');
  const outra = { ...vazio, provedorId: 'jb-n1-t2' };
  assert.deepEqual(JSON.parse(JSON.stringify(g.mesclar(gravado, outra))), outra, 'outra referência é outro documento');
  assert.deepEqual(JSON.parse(JSON.stringify(g.mesclar(null, vazio))), vazio);
});

/* =====================================================================
   4. JB Fiscal (Focus NFe): tradução e idempotência, sem rede (scripts/testar-fiscal.mjs)
   O pacote que o publicador (jb-publicar) manda ao Netlify não leva supabase/: aí o grupo é pulado
   (o GitHub e o Netlify ligado ao repositório rodam tudo).
   ===================================================================== */
const temFiscal = existsSync(join(RAIZ, 'supabase/functions/jb-fiscal/nucleo.js'));
if (temFiscal) {
  const { TESTES } = await import('./testar-fiscal.mjs');
  TESTES.forEach((x) => teste('fiscal', x.nome, x.fn));
} else console.log('  – [fiscal] pulado: este pacote não tem supabase/functions/jb-fiscal');

/* Resumo diário no WhatsApp: contas, parâmetros do modelo e corpo do envio, sem rede (mesma regra do pacote sem supabase/) */
if (existsSync(join(RAIZ, 'supabase/functions/jb-whatsapp/nucleo.js'))) {
  const { TESTES: TW } = await import('./testar-whatsapp.mjs');
  TW.forEach((x) => teste('whatsapp', x.nome, x.fn));
} else console.log('  – [whatsapp] pulado: este pacote não tem supabase/functions/jb-whatsapp');

/* ---------- execução ---------- */
/* ---------- Centro de Inventário ---------- */
teste('inventario', 'programa: módulo presente e ligado à ponte do Claude pela função própria', () => {
  const app = ler('app/jb-gestao.html');
  for (const id of ['inv-estilos', 'inv-qr-gerador', 'inv-qr-leitor', 'inv-centro']) assert.ok(app.includes(`id="${id}"`), id);
  assert.ok(app.includes("inv.api_ponte("), 'a ponte chama inv.api_ponte');
  assert.ok(app.includes("JB_NUVEM_API.rpc('jb_inv'"), 'a nuvem chama jb_inv');
  assert.ok(!/localStorage\.setItem\([^)]*inv_(bens|dados)/.test(app), 'dados do inventário não ficam no navegador');
});
/* ---------- identidade documental (V111): um só lugar para logo, cabeçalho e rodapé de todos os documentos ---------- */
teste('documentos', 'identidade central: configuração única, logo sem imagem fixa nos geradores e padrão em todos os formatos', () => {
  const app = ler('app/jb-gestao.html');
  for (const f of ['function idDocs()', 'function carimboDoc(', 'function metaDoc(', 'function linhaInstDoc()', 'function rodInstDoc()', 'function htmlIdDocs(', 'function previaIdDocs(', 'function tituloFormalDoc(', 'function logoDocSrc()']) assert.ok(app.includes(f), 'falta ' + f);
  assert.ok(app.includes("sec('Identidade visual e documentos'"), 'seção nas Configurações');
  // a logo dos documentos vem só da configuração central (CFG.marcaImg) ou da logo oficial embutida; nenhum gerador traz imagem própria
  const fora = app.replace(/var LOGO_CC='data:image[^']+'/, '').split('\n').filter((l) => /addImage\(\s*'data:image|<img[^>]+class="fvd-logo"[^>]+src="data:image/.test(l));
  assert.equal(fora.length, 0, 'imagem fixa em gerador de documento');
  // tela, PDF e Word usam as mesmas peças centrais
  const trecho = (ini, fim) => { const i = app.indexOf(ini); assert.ok(i >= 0, ini); return app.slice(i, app.indexOf(fim, i + ini.length)); };
  const html = trecho('function htmlDoc(D,opc){', '\n/* ---------- PDF, no mesmo desenho'), pdf = trecho('function pdfDoc(D){', '\nconst nomeArqDoc='), word = trecho('function wordDoc(D){', '\nasync function baixarWordDoc');
  for (const [n, t] of [['tela', html], ['PDF', pdf], ['Word', word]]) for (const peca of ['carimboDoc(D)', 'metaDoc(D)', 'sobreTituloDoc(D)', 'rodapeDoc(D)', 'linhaCabDoc(D)']) assert.ok(t.includes(peca), n + ' sem ' + peca);
  // documentos com desenho próprio também passam pelo cabeçalho e rodapé centrais
  assert.ok(/function faixaPdf\(p,e,tit,sub\)\{[^\n]*\n return cabPdfCC\(/.test(app), 'inventário usa o cabeçalho central');
  assert.ok(trecho('function fichaFeriasPDF(fid){', '\n}\n').includes('cabPdfCC(') && trecho('function fichaFeriasPDF(fid){', '\n}\n').includes('rodPdfCC('), 'ficha de férias usa as peças centrais');
  // impressão: página A4 numerada só para a folha de documento; ticket térmico e etiquetas continuam com a página própria
  assert.ok(app.includes('#printDoc.folha{page:jbdoc}') && !/#printDoc\{page:jbdoc\}/.test(app), 'página A4 só para a folha');
  assert.ok(app.includes('counter(page) " de " counter(pages)'), 'numeração de páginas na impressão');
});
teste('documentos', 'nomenclatura: títulos formais sem mudar os dados', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('const TITULOS_FORMAIS=['), j = app.indexOf('const CAB_FORMAL=', i);
  assert.ok(i > 0 && j > i);
  const { tituloFormalDoc } = new Function(app.slice(i, j) + ';return {tituloFormalDoc};')();
  assert.equal(tituloFormalDoc('Contas a pagar'), 'Relatório de Contas a Pagar');
  assert.equal(tituloFormalDoc('Custo da lenha mês a mês'), 'Demonstrativo Mensal do Custo da Lenha');
  assert.equal(tituloFormalDoc('1. Vendas por período · 01/11/2026 a 30/11/2026'), 'Relatório de vendas por período · 01/11/2026 a 30/11/2026');
  assert.equal(tituloFormalDoc('Relatório de contratos'), 'Relatório de contratos', 'o que já é formal não muda');
  assert.equal(tituloFormalDoc('Espelho de ponto (gerencial) · Fulano · 11/2026'), 'Espelho de Ponto (gerencial) · Fulano · 11/2026');
});
/* o pacote do publicador da nuvem não leva supabase/migrations: aí esta conferência fica para o repositório (GitHub Actions e antes do commit) */
if (existsSync(join(RAIZ, 'supabase/migrations/20261108233000_inv_01_centro_inventario.sql'))) teste('inventario', 'banco: só a função conferida é exposta, e só para usuário logado; histórico imutável', () => {
  const m = ler('supabase/migrations/20261108233000_inv_01_centro_inventario.sql');
  assert.ok(/revoke all on function public\.jb_inv\(text,jsonb\) from public,anon/.test(m));
  assert.ok(/grant execute on function public\.jb_inv\(text,jsonb\) to authenticated/.test(m));
  assert.ok(!/grant[^;]+schema inv/i.test(m), 'esquema inv não pode ser liberado');
  for (const t of ['auditoria', 'movimentacoes', 'leituras']) assert.ok(m.includes(`create trigger imutavel before update or delete on inv.${t}`), t);
  assert.ok(m.includes('unique (empresa_id,codigo_patrimonial)'), 'código único por empresa');
  assert.ok(existsSync(join(RAIZ, 'supabase/migrations/20261108233000_inv_01_centro_inventario.down.sql')), 'reversão descrita');
});

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
