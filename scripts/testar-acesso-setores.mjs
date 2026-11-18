#!/usr/bin/env node
// Teste da nuvem com permissões por setor (16/11/2026): abre a página REAL da nuvem (dist/index.html) num
// Chromium, com um servidor Supabase simulado que entrega a cada pessoa só o que o servidor de verdade
// entregaria (leitura por módulo + jb_compartilhados), e confere:
//   A. quem só tem o Combustível vê os terceiros que abastecem (moram na coleção do Financeiro), os
//      responsáveis do setor e o Caixa; não recebe compromisso de pessoal nem MEI; só vê os setores dele;
//      cadastra terceiro novo e o cadastro aparece; terceiro lançado por outra pessoa chega sem recarregar;
//   B. quem só tem o Almoxarifado vê os funcionários (só nome e função) e as máquinas; só vê o setor dele;
//   C. o administrador vê todos os setores e não depende da função nova.
// Dados FICTÍCIOS. Requer Playwright. Uso: node scripts/construir.mjs && node scripts/testar-acesso-setores.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

const M = '2026-11';
const balde = (itens) => ({ chave: M + '-s0', items: Object.fromEntries(itens.map((x) => [x.id, x])) });
/* banco fictício: o mesmo formato do banco central */
const BANCO = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', matricula: '001', situacao: 'Ativo', cargo: 'Forneiro', setor: 'Produção', departamento: 'Produção', admissao: '2025-01-02', formaRemuneracao: 'Diária', obs: 'observação do DP' }],
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo 2', matricula: '002', situacao: 'Ativo', cargo: 'Ajudante', setor: 'Produção', departamento: 'Produção', admissao: '2025-03-04' }],
  ['sensivel', 'f1', { id: 'f1', cpf: '000.000.000-00', salario: 1 }],
  ['locais', 'l1', { id: 'l1', nome: 'Caminhão Exemplo', setor: 'combustivel', tipo: 'Caminhão', situacao: 'Ativo' }],
  ['produtos', 'p1', { id: 'p1', nome: 'Diesel Exemplo', setor: 'combustivel', unidade: 'L', tipoItem: 'Combustível', tipoComb: 'Diesel', situacao: 'Ativo' }],
  ['fin', M + '-s0', balde([
    { id: 't1', tipo: 'terceiro', nome: 'Caçamba Exemplo', placa: 'AAA0A00', situacao: 'Ativo', data: M + '-02' },
    { id: 'r1', tipo: 'responsavel', aba: 'Óleo e combustível', nome: 'Responsável Combustível', situacao: 'Ativo', data: M + '-02' },
    { id: 'r2', tipo: 'responsavel', aba: 'Almoxarifado / Cozinha', nome: 'Responsável Almoxarifado', situacao: 'Ativo', data: M + '-02' },
    { id: 'c1', tipo: 'conta', nome: 'Caixa', tipoConta: 'Caixa', situacao: 'Ativa', saldoInicial: 1000, data: M + '-02' },
    { id: 'tt1', tipo: 'titulo', numero: 1, descricao: 'Pagamento de pessoal', categoria: 'Mão de obra da produção', setorOrigem: 'Geral (Financeiro)', valor: 10, vencimento: M + '-20', data: M + '-02' },
    { id: 'tt2', tipo: 'titulo', numero: 2, descricao: 'Combustível da entrega', categoria: 'Combustível para entrega', setorOrigem: 'Geral (Financeiro)', valor: 20, vencimento: M + '-20', data: M + '-02' },
    { id: 'm1', tipo: 'mei', nome: 'MEI Exemplo', cnpj: '00.000.000/0001-00', data: M + '-02' },
  ])],
];
/* o que o servidor de verdade libera (supabase/migrations/*seg_compartilhar_setores.sql), resumido para o teste */
const MODULO = { funcionarios: 'dp', sensivel: 'dp_sensivel', locais: 'compras', produtos: 'compras', fin: 'financeiro', acesso: 'config', alm: 'almox' };
const EXTRA = { locais: ['producao', 'almox', 'barro'] };
const LEIT_ITEM = (v) => v.tipo === 'terceiro' ? ['compras'] : v.tipo === 'responsavel' ? ({ 'Óleo e combustível': ['compras'], 'Almoxarifado / Cozinha': ['almox'] }[v.aba] || [])
  : v.tipo === 'conta' ? ['compras', 'vendas', 'almox', 'paletes', 'barro'] : v.tipo === 'titulo' && /combust/i.test(v.categoria || '') ? ['compras'] : [];
const PESSOAS = {
  combustivel: { uid: 'u_COMB', admin: false, modulos: ['compras'], acesso: { papel: 'estoquista', setoresVenda: ['combustivel'] } },
  almox: { uid: 'u_ALMOX', admin: false, modulos: ['almox'], acesso: { papel: 'estoquista', setoresVenda: [] } },
  dono: { uid: 'u_DONO', admin: true, modulos: [], acesso: { papel: 'admin' } },
};

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
if (!existsSync(join(RAIZ, 'dist/index.html'))) { console.log('Rode antes: node scripts/construir.mjs'); process.exit(1); }
const browser = await chromium.launch();

async function entrarComo(quem) {
  const P = PESSOAS[quem];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const url = r.request().url();
    if (/\/functions\/v1\/jb-auth\/login$/.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'sessao-' + quem, refresh_token: 'r', nome: quem }) });
    if (/\/functions\/v1\/jb-auth\//.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return r.abort();
  });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ BANCO, P, MODULO, EXTRA, leitItem }) => {
    const LEIT_ITEM = (0, eval)('(' + leitItem + ')');
    const banco = new Map(BANCO.map(([c, i, d]) => [c + '/' + i, { colecao: c, id: i, dados: d }]));
    banco.set('acesso/' + P.uid, { colecao: 'acesso', id: P.uid, dados: Object.assign({ id: P.uid, nome: 'Pessoa de teste', ativo: true }, P.acesso) });
    const raiz = (c) => c.split('/')[0];
    const le = (c) => P.admin || P.modulos.includes(MODULO[raiz(c)]) || (EXTRA[raiz(c)] || []).some((m) => P.modulos.includes(m)) || (raiz(c) === 'acesso' && c === 'acesso');
    const visiveis = () => [...banco.values()].filter((d) => le(d.colecao) && (raiz(d.colecao) !== 'acesso' || d.id === P.uid))
      .sort((a, b) => (a.colecao + '/' + a.id < b.colecao + '/' + b.id ? -1 : 1)).map((d) => JSON.parse(JSON.stringify(d)));
    const compartilhados = () => {
      if (P.admin) return { parciais: [], docs: [] };
      const parciais = [], docs = [];
      if (!le('fin')) { parciais.push('fin');
        banco.forEach((d) => { if (d.colecao !== 'fin') return; const it = {};
          Object.entries(d.dados.items || {}).forEach(([k, v]) => { if (v && LEIT_ITEM(v).some((m) => P.modulos.includes(m))) { const c = Object.assign({}, v); if (c.tipo === 'conta') { delete c.saldoInicial; } it[k] = c; } });
          if (Object.keys(it).length) docs.push({ colecao: d.colecao, id: d.id, dados: Object.assign({}, d.dados, { items: it }) }); }); }
      if (P.modulos.includes('almox') && !le('funcionarios')) { parciais.push('funcionarios');
        banco.forEach((d) => { if (d.colecao !== 'funcionarios') return; const x = d.dados;
          docs.push({ colecao: 'funcionarios', id: d.id, dados: { id: x.id, nome: x.nome, matricula: x.matricula, situacao: x.situacao, cargo: x.cargo, setor: x.setor, departamento: x.departamento, admissao: x.admissao } }); }); }
      return { parciais, docs: JSON.parse(JSON.stringify(docs)) };
    };
    const mesclar = (a, b) => { const o = Object.assign({}, a || {}); Object.keys(b || {}).forEach((k) => { const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = mesclar(o[k], v); else o[k] = v; }); return o; };
    window.__srv = { banco, chamadas: [], gravacoes: [] };
    const consulta = () => { const f = { eq: [] }; const q = {
      select() { return q; }, order() { return q; },
      eq(c, v) { f.eq.push([c, v]); return q; },
      range(a, b) { return Promise.resolve({ data: visiveis().slice(a, b + 1), error: null }); },
      maybeSingle() { const c = (f.eq.find((x) => x[0] === 'colecao') || [])[1], i = (f.eq.find((x) => x[0] === 'id') || [])[1];
        const d = le(c) ? banco.get(c + '/' + i) : null; return Promise.resolve({ data: d ? JSON.parse(JSON.stringify(d)) : null, error: null }); } }; return q; };
    const rpc = async (nome, a) => {
      window.__srv.chamadas.push(nome);
      if (nome === 'jb_eu') return { data: { uid: P.uid, nome: 'Pessoa de teste', usuario: P.uid, admin: P.admin, permissoes: Object.fromEntries(P.modulos.map((m) => [m, { ler: true, criar: true, editar: true, excluir: false }])) }, error: null };
      if (nome === 'jb_compartilhados') return { data: compartilhados(), error: null };
      if (nome === 'jb_atualizar' || nome === 'jb_gravar') {
        const k = a.p_colecao + '/' + a.p_id, at = banco.get(k);
        const novo = nome === 'jb_gravar' ? a.p_dados : mesclar(at ? at.dados : null, a.p_campos);
        if (nome === 'jb_atualizar' && !at) return { data: null, error: { code: 'P0002', message: 'documento inexistente' } };
        window.__srv.gravacoes.push({ colecao: a.p_colecao, id: a.p_id });
        banco.set(k, { colecao: a.p_colecao, id: a.p_id, dados: novo }); return { data: 1, error: null };
      }
      if (nome === 'jb_inv') return { data: { acesso: false }, error: null };
      if (nome === 'jb_nomes') return { data: {}, error: null };
      if (nome === 'jb_sinal') return { data: { ok: true }, error: null };
      return { data: null, error: null };
    };
    const cliente = { auth: { setSession: async () => ({ error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
      from: () => consulta(), rpc,
      channel: () => { const c = { on() { return c; }, subscribe() { return c; } }; return c; },
      storage: { from: () => ({ createSignedUrls: async () => ({ data: [] }), createSignedUrl: async () => ({ data: null }), upload: async () => ({ error: null }), remove: async () => ({}) }) } };
    Object.defineProperty(window, 'supabase', { configurable: true, get() { return { createClient: () => cliente }; }, set() {} });
  }, { BANCO, P, MODULO, EXTRA, leitItem: LEIT_ITEM.toString() });
  await page.goto(base + '/dist/index.html');
  await page.waitForSelector('#jblu', { timeout: 30000 });
  await page.fill('#jblu', quem); await page.fill('#jbls', 'senha-de-teste');
  await page.click('#jbl button[type=submit]');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado === true, null, { timeout: 60000 });
  await page.waitForTimeout(600);
  const setores = async () => { await page.evaluate(() => JBNAV.subst('#/setores')); await page.waitForTimeout(400); return page.evaluate(() => [...document.querySelectorAll('[data-setor]')].map((b) => b.dataset.setor)); };
  return { page, ctx, erros, setores };
}

try {
  console.log('A. Combustível sem o módulo Financeiro');
  {
    const { page, ctx, erros, setores } = await entrarComo('combustivel');
    const t = await page.evaluate(() => (DATA.cTerceiros || []).map((x) => x.nome));
    ok(t.length === 1 && t[0] === 'Caçamba Exemplo', 'os terceiros cadastrados aparecem (antes a lista vinha vazia): ' + JSON.stringify(t));
    ok(await page.evaluate(() => (DATA.responsaveis || []).some((r) => r.nome === 'Responsável Combustível') && !(DATA.responsaveis || []).some((r) => r.nome === 'Responsável Almoxarifado')), 'responsável do Combustível aparece; o do Almoxarifado não');
    ok(await page.evaluate(() => (DATA.fContas || []).some((c) => c.nome === 'Caixa' && !('saldoInicial' in c))), 'o Caixa aparece para pagar na hora, sem o saldo inicial');
    const fin = await page.evaluate(() => DATA.fin.map((x) => x.tipo + ':' + (x.categoria || x.nome || '')));
    ok(!fin.some((x) => /^mei:|Mão de obra/.test(x)) && fin.some((x) => /Combustível para entrega/.test(x)), 'chega a despesa com combustível; pagamento de pessoal e MEI não chegam: ' + JSON.stringify(fin));
    ok(await page.evaluate(() => !DATA.funcionarios.length && !DATA.sensivel.length), 'nada do Departamento Pessoal');
    const s = await setores();
    ok(s.includes('combustivel') && !s.includes('financeiro') && !s.includes('almox') && !s.includes('dp'), 'só aparecem os setores que ele usa: ' + JSON.stringify(s));
    await page.evaluate(() => { const b = document.querySelector('[data-setor="combustivel"]'); if (b) b.click(); }); await page.waitForTimeout(500);
    await page.evaluate(() => JBNAV.ir('#/cTerceiros')); await page.waitForTimeout(600);
    ok(await page.evaluate(() => /Caçamba Exemplo/.test(document.querySelector('#conteudo') ? document.querySelector('#conteudo').innerText : '')), 'a tela "Terceiros que abastecem" mostra o terceiro cadastrado');
    // cadastrar terceiro novo pelo próprio programa
    const novo = await page.evaluate(async () => { try { const st = { ...MODS.cTerceiros.padrao(), id: 'tNovo', nome: 'Caminhão-pipa Exemplo' };
      const r = await gravarRegistro('cTerceiros', st, null, true); return r && r.nome; } catch (e) { return 'ERRO ' + (e && e.message); } });
    await page.waitForTimeout(2500);
    ok(novo === 'Caminhão-pipa Exemplo' && await page.evaluate(() => window.__srv.gravacoes.some((g) => g.colecao === 'fin')), 'cadastrar terceiro novo grava no banco: ' + novo);
    ok(await page.evaluate(() => (DATA.cTerceiros || []).filter((x) => /Caminhão-pipa Exemplo/.test(x.nome)).length === 1), 'o terceiro novo aparece uma vez só na lista');
    // terceiro lançado por outra pessoa (sem tempo real para coleção parcial): chega na conferência
    await page.evaluate(() => { const d = window.__srv.banco.get('fin/2026-11-s0'); d.dados.items.tOutro = { id: 'tOutro', tipo: 'terceiro', nome: 'Caçamba de Outro Lançador', situacao: 'Ativo', data: '2026-11-05' }; });
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(800);
    ok(await page.evaluate(() => (DATA.cTerceiros || []).some((x) => x.nome === 'Caçamba de Outro Lançador')), 'terceiro cadastrado em outro computador aparece sem recarregar a página');
    ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + [...new Set(erros)].slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  console.log('B. Almoxarifado sem o DP e sem Compras');
  {
    const { page, ctx, erros, setores } = await entrarComo('almox');
    const f = await page.evaluate(() => DATA.funcionarios.map((x) => Object.keys(x).sort().join(',')));
    ok(f.length === 2 && f.every((k) => !/obs|formaRemuneracao/.test(k)), 'os funcionários aparecem só com nome e função (para EPI, empréstimo e requisição): ' + f[0]);
    ok(await page.evaluate(() => !DATA.sensivel.length), 'CPF e salário (dados sensíveis) não chegam');
    ok(await page.evaluate(() => DATA.locais.some((l) => l.nome === 'Caminhão Exemplo')), 'as máquinas aparecem para a requisição');
    ok(await page.evaluate(() => (DATA.fResp || []).some((r) => r.nome === 'Responsável Almoxarifado') && !(DATA.cTerceiros || []).length), 'responsável do Almoxarifado aparece; terceiros do Combustível não');
    const s = await setores();
    ok(s.includes('almox') && !s.includes('combustivel') && !s.includes('lenha') && !s.includes('financeiro'), 'só aparece o setor dele: ' + JSON.stringify(s));
    ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + [...new Set(erros)].slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }

  console.log('C. Administrador');
  {
    const { page, ctx, erros, setores } = await entrarComo('dono');
    const s = await setores();
    ok(['dp', 'vendas', 'lenha', 'combustivel', 'producao', 'financeiro', 'almox', 'paletes'].every((x) => s.includes(x)), 'vê todos os setores: ' + JSON.stringify(s));
    ok(await page.evaluate(() => DATA.fin.length === 7 && DATA.funcionarios.length === 2), 'recebe tudo direto do banco (sem filtro)');
    ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + [...new Set(erros)].slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\nAcesso por setor: ${falhas} falha(s).` : '\nAcesso por setor: tudo certo.');
process.exit(falhas ? 1 : 0);
