#!/usr/bin/env node
// Teste do visual "Vidro claro" em teste (V154), no programa REAL, num Chromium. Nada sai para a internet.
// No Claude (saida/claude.html, com o banco central simulado):
//   1. desligado por padrão: ninguém vê nada diferente (sem a classe vis-vc)
//   2. a chave "Vidro claro (só para você)" aparece em Configurações › Aparência para o dono
//   3. ligar pela chave: entra a classe vis-vc, a preferência vidroClaro fica no usuário dele e as telas
//      abrem sem erro, com os mesmos botões de antes (o visual não esconde nada)
//   4. desligar: volta ao visual de sempre na hora
//   5. quem pode: o dono da aparência (config/aparencia → dono) e, no Claude, o dono do artifact; na nuvem, ser
//      administrador não basta
//   6. reabrir: o dono que deixou ligado abre direto no visual novo, sem piscar; se desligou em outro aparelho,
//      este acompanha
//   7. aparelho compartilhado: outra pessoa no mesmo navegador nunca fica com o visual novo, nem por um instante
// Na nuvem (a página REAL dist/index.html, com o Supabase simulado e a tela de entrada de verdade):
//   8. o dono liga pela chave e só a preferência dele é gravada; outro administrador e um usuário comum não veem
//      a chave nem o visual novo, mesmo no aparelho em que o dono deixou ligado; a tela de entrada não muda
// Dados FICTÍCIOS. Requer Playwright. Uso: node scripts/construir.mjs && node scripts/testar-vidro-claro.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const http = createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

/* roda antes de a página começar: guarda toda vez que a classe vis-vc liga ou desliga, e como ela estava
   quando a primeira tela foi desenhada. "lembrado" = este aparelho já tinha o visual novo ligado por alguém. */
const vigia = ({ lembrado }) => {
  try { if (lembrado && !sessionStorage.getItem('__jb_ja')) { localStorage.setItem('jb_vidro', lembrado); sessionStorage.setItem('__jb_ja', '1'); } } catch (e) {}
  window.__vc = { hist: [], primeira: null };
  // nesta hora a página ainda não tem <html>: por isso a vigia fica no documento inteiro
  const tem = () => !!document.documentElement && document.documentElement.classList.contains('vis-vc');
  new MutationObserver((ms) => { if (ms.some((m) => m.target === document.documentElement)) window.__vc.hist.push(tem()); }).observe(document, { attributes: true, attributeFilter: ['class'], subtree: true });
  const o = new MutationObserver(() => { const s = document.querySelector('#side'); if (s && s.children.length && window.__vc.primeira === null) { window.__vc.primeira = tem(); o.disconnect(); } });
  o.observe(document, { childList: true, subtree: true });
};
const iniciar = ({ codigo, uid, dono, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO', 'u_OUTRA'] });
  srv.estado.gravarDireto('acesso', uid, { id: uid, nome: 'Pessoa Teste', papel: 'admin', ativo: true });
  srv.estado.gravarDireto('funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção' });
  (docs || []).forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), set: async () => {}, onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: uid, name: 'Pessoa Teste', avatarUrl: '', isOwner: !!dono, canEdit: true }), id: async () => uid, isOwner: () => !!dono, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const ROTAS = ['setores', 'setor-producao', 'pmaromba', 'setor-vendas', 'setor-financeiro', 'fcentral', 'setor-lenha', 'setor-combustivel', 'setor-almox', 'setor-barro', 'setor-paletes', 'setor-control', 'jbc', 'painel', 'funcionarios', 'folha'];
const botoes = () => [...document.querySelectorAll('.conteudo button,.conteudo a.btn,main button,main a.btn')].filter((e) => e.offsetParent !== null && !e.closest('.abas-trab')).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).sort();
const temClasse = (page) => page.evaluate(() => document.documentElement.classList.contains('vis-vc'));
const lembra = (page) => page.evaluate(() => localStorage.getItem('jb_vidro'));
const nuncaLigou = (page) => page.evaluate(() => !window.__vc.hist.includes(true) && window.__vc.primeira === false);
const semPiscar = (page) => page.evaluate(() => { const h = window.__vc.hist, i = h.indexOf(true); return i >= 0 && !h.slice(i).includes(false) && window.__vc.primeira === true; });
const PREF = (uid, on) => ['data/users/' + uid, 'prefs', { lidas: {}, vidroClaro: on }];

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };

async function abrir({ uid = 'u_DONO', dono = true, docs = [], lembrado = '' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  page.erros = []; page.on('pageerror', (e) => page.erros.push(String(e && e.message)));
  await page.addInitScript(vigia, { lembrado });
  await page.addInitScript(iniciar, { codigo: servidorFalso, uid, dono, docs });
  await page.goto(base + '/saida/claude.html#/setores');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true, null, { timeout: 30000 });
  await page.waitForTimeout(1200);
  return page;
}

try {
  const page = await abrir();

  console.log('\n1. desligado por padrão');
  ok(!(await temClasse(page)) && (await nuncaLigou(page)), 'sem a classe vis-vc ao abrir');
  ok(await page.evaluate(() => typeof vidroPode === 'function' && typeof aplicarVidro === 'function' && typeof definirVidro === 'function'), 'funções do visual em teste existem');

  console.log('\n2. a chave aparece para o dono');
  ok(await page.evaluate(() => vidroPode() === true), 'o dono pode testar');
  ok(await page.evaluate(() => htmlAparencia().includes('id="vidroClaroChk"')), 'Configurações › Aparência mostra "Vidro claro (só para você)"');

  console.log('\n3. ligar');
  const antes = {};
  for (const r of ROTAS) { await page.evaluate((x) => JBNAV.ir('#/' + x), r); await page.waitForTimeout(500); antes[r] = await page.evaluate(botoes); }
  await page.evaluate(() => JBNAV.ir('#/config')); await page.waitForSelector('#vidroClaroChk', { timeout: 8000 });
  ok(await page.evaluate(() => /só para você/.test(document.querySelector('#vidroClaroChk').closest('label').textContent)), 'a chave está na tela de Configurações, com o aviso "só para você"');
  await page.click('#vidroClaroChk'); await page.waitForTimeout(600);
  ok(await temClasse(page), 'classe vis-vc ligada ao marcar a chave');
  ok(await page.evaluate(() => PREFS.vidroClaro === true), 'preferência vidroClaro ligada no usuário');
  ok(await page.evaluate(() => { const d = window.__srv.estado.docs.get('data/users/u_DONO/prefs'); return !!(d && d.dados && d.dados.vidroClaro === true); }), 'a preferência foi guardada no banco, no usuário dele');
  ok((await lembra(page)) === 'u_DONO', 'o aparelho lembra quem ligou');
  let iguais = true, dif = '';
  for (const r of ROTAS) { await page.evaluate((x) => JBNAV.ir('#/' + x), r); await page.waitForTimeout(500); const d = await page.evaluate(botoes); const falta = antes[r].filter((x) => !d.includes(x)); if (falta.length) { iguais = false; dif = r + ': ' + falta.slice(0, 3).join(', '); } }
  ok(iguais, 'as mesmas telas mostram todos os botões de antes com o visual novo (V155 acrescenta atalhos na Produção)' + (dif ? ' (diferente em ' + dif + ')' : ''));
  ok(page.erros.length === 0, 'nenhum erro de página' + (page.erros.length ? ': ' + page.erros[0] : ''));

  console.log('\n4. desligar');
  await page.evaluate(() => JBNAV.ir('#/config')); await page.waitForSelector('#vidroClaroChk', { timeout: 8000 });
  ok(await page.evaluate(() => document.querySelector('#vidroClaroChk').checked === true), 'a chave aparece marcada');
  await page.click('#vidroClaroChk'); await page.waitForTimeout(500);
  ok(!(await temClasse(page)), 'classe vis-vc desligada ao desmarcar');
  ok((await lembra(page)) === null, 'o aparelho esquece');
  ok(await page.evaluate(() => { const d = window.__srv.estado.docs.get('data/users/u_DONO/prefs'); return !!(d && d.dados && d.dados.vidroClaro === false); }), 'a preferência desligada foi guardada no banco');

  console.log('\n5. quem pode');
  const caso = (f) => page.evaluate(f);
  ok(await caso(() => { const ap = APARENCIA, own = APP.isOwner; try { APARENCIA = { dono: 'outra-pessoa' }; APP.isOwner = false; return vidroPode() === false; } finally { APARENCIA = ap; APP.isOwner = own; } }), 'Claude: quem não é o dono do artifact nem o dono da aparência não pode');
  ok(await caso(() => { const ap = APARENCIA, own = APP.isOwner; try { APARENCIA = { dono: APP.uid }; APP.isOwner = false; return vidroPode() === true; } finally { APARENCIA = ap; APP.isOwner = own; } }), 'o dono da aparência pode');
  ok(await caso(() => { const ap = APARENCIA; try { window.JB_NUVEM_API = {}; APARENCIA = { dono: 'outra-pessoa' }; PREFS = { ...PREFS, vidroClaro: true };
    const pode = vidroPode(); aplicarVidro(); return APP.isOwner === true && !pode && !document.documentElement.classList.contains('vis-vc') && !htmlAparencia().includes('vidroClaroChk'); } finally { delete window.JB_NUVEM_API; APARENCIA = ap; } }), 'nuvem: ser administrador não basta (não vê a chave e o visual não liga, mesmo com a preferência gravada)');
  ok(await caso(() => { const ap = APARENCIA; try { window.JB_NUVEM_API = {}; APARENCIA = null; return vidroPode() === false; } finally { delete window.JB_NUVEM_API; APARENCIA = ap; } }), 'nuvem: sem dono da aparência definido, ninguém pode');
  ok(await caso(async () => { const ap = APARENCIA; try { window.JB_NUVEM_API = {}; APARENCIA = { dono: 'outra-pessoa' }; await definirVidro(true); return !document.documentElement.classList.contains('vis-vc'); } finally { delete window.JB_NUVEM_API; APARENCIA = ap; } }), 'nuvem: quem não pode não liga nem chamando a função');
  ok(await caso(() => { const ap = APARENCIA; try { window.JB_NUVEM_API = {}; APARENCIA = { dono: APP.uid }; const pode = vidroPode(); aplicarVidro(); return pode && document.documentElement.classList.contains('vis-vc') && htmlAparencia().includes('vidroClaroChk'); } finally { delete window.JB_NUVEM_API; APARENCIA = ap; } }), 'nuvem: o dono da aparência vê a chave e o visual liga');
  await page.context().close();

  console.log('\n6. reabrir');
  const ligado = await abrir({ docs: [PREF('u_DONO', true)], lembrado: 'u_DONO' });
  ok((await temClasse(ligado)) && (await semPiscar(ligado)), 'o dono que deixou ligado abre a primeira tela já no visual novo, sem piscar');
  await ligado.context().close();
  const outroAparelho = await abrir({ docs: [PREF('u_DONO', true)] });
  ok(await temClasse(outroAparelho), 'em outro aparelho do dono, o visual novo liga quando a preferência chega');
  ok((await lembra(outroAparelho)) === 'u_DONO', 'e esse aparelho passa a lembrar');
  await outroAparelho.context().close();
  const desligouFora = await abrir({ docs: [PREF('u_DONO', false)], lembrado: 'u_DONO' });
  ok(!(await temClasse(desligouFora)) && (await lembra(desligouFora)) === null, 'se o dono desligou em outro aparelho, este volta ao visual de sempre');
  await desligouFora.context().close();

  console.log('\n7. aparelho compartilhado');
  const outra = await abrir({ uid: 'u_OUTRA', dono: false, docs: [PREF('u_OUTRA', true)], lembrado: 'u_DONO' });
  ok(await nuncaLigou(outra), 'outra pessoa no mesmo navegador nunca fica com o visual novo, nem por um instante (mesmo com a preferência forjada)');
  ok((await lembra(outra)) === null, 'e o aparelho esquece');
  ok(await outra.evaluate(() => !htmlAparencia().includes('vidroClaroChk')), 'ela não vê a chave em Configurações › Aparência');
  ok(outra.erros.length === 0, 'nenhum erro de página' + (outra.erros.length ? ': ' + outra.erros[0] : ''));
  await outra.context().close();

  console.log('\n8. na página real da nuvem');
  if (!existsSync(join(RAIZ, 'dist/index.html'))) { ok(false, 'dist/index.html existe (rode antes: node scripts/construir.mjs)'); }
  else {
    const PESSOAS = {
      dono: { uid: 'u_DONO', usuario: 'dono', admin: true, papel: 'admin' },
      outroAdmin: { uid: 'u_ADM2', usuario: 'outro-admin', admin: true, papel: 'admin' },
      comum: { uid: 'u_COM', usuario: 'comum', admin: false, papel: 'estoquista' },
    };
    const APAR = ['config', 'aparencia', { dono: 'u_DONO' }];
    const entrarNuvem = async (quem, { lembrado = '', docs = [] } = {}) => {
      const P = PESSOAS[quem];
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
        const url = r.request().url();
        if (/\/functions\/v1\/jb-auth\/login$/.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: 'sessao-' + quem, refresh_token: 'r', nome: quem }) });
        if (/\/functions\/v1\/jb-auth\//.test(url)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return r.abort();
      });
      const pg = await ctx.newPage();
      pg.erros = []; pg.on('pageerror', (e) => pg.erros.push(String(e && e.message)));
      await pg.addInitScript(vigia, { lembrado });
      await pg.addInitScript(({ P, docs }) => {
        const banco = new Map();
        const poe = (c, i, d) => banco.set(c + '/' + i, { colecao: c, id: i, dados: d });
        poe('acesso', P.uid, { id: P.uid, nome: 'Pessoa de teste', ativo: true, papel: P.papel, setoresVenda: [] });
        poe('funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção' });
        docs.forEach(([c, i, d]) => poe(c, i, d));
        // cada pessoa lê as configurações, o próprio acesso e as próprias preferências; o administrador lê tudo
        const le = (c, i) => P.admin || c === 'config' || (c === 'acesso' && i === P.uid) || c === 'data/users/' + P.uid;
        const visiveis = () => [...banco.values()].filter((d) => le(d.colecao, d.id)).sort((a, b) => (a.colecao + '/' + a.id < b.colecao + '/' + b.id ? -1 : 1)).map((d) => JSON.parse(JSON.stringify(d)));
        const mesclar = (a, b) => { const o = Object.assign({}, a || {}); Object.keys(b || {}).forEach((k) => { const v = b[k];
          if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = mesclar(o[k], v); else o[k] = v; }); return o; };
        window.__srv = { banco, gravacoes: [] };
        const consulta = () => { const f = { eq: [] }; const q = {
          select() { return q; }, order() { return q; },
          eq(c, v) { f.eq.push([c, v]); return q; },
          range(a, b) { return Promise.resolve({ data: visiveis().slice(a, b + 1), error: null }); },
          maybeSingle() { const c = (f.eq.find((x) => x[0] === 'colecao') || [])[1], i = (f.eq.find((x) => x[0] === 'id') || [])[1];
            const d = le(c, i) ? banco.get(c + '/' + i) : null; return Promise.resolve({ data: d ? JSON.parse(JSON.stringify(d)) : null, error: null }); } }; return q; };
        const rpc = async (nome, a) => {
          if (nome === 'jb_eu') return { data: { uid: P.uid, nome: 'Pessoa de teste', usuario: P.usuario, admin: P.admin, permissoes: {} }, error: null };
          if (nome === 'jb_compartilhados') return { data: { parciais: [], docs: [] }, error: null };
          if (nome === 'jb_atualizar' || nome === 'jb_gravar') {
            const k = a.p_colecao + '/' + a.p_id, at = banco.get(k);
            if (nome === 'jb_atualizar' && !at) return { data: null, error: { code: 'P0002', message: 'documento inexistente' } };
            window.__srv.gravacoes.push({ colecao: a.p_colecao, id: a.p_id });
            banco.set(k, { colecao: a.p_colecao, id: a.p_id, dados: nome === 'jb_gravar' ? a.p_dados : mesclar(at.dados, a.p_campos) }); return { data: 1, error: null };
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
      }, { P, docs });
      await pg.goto(base + '/dist/index.html');
      await pg.waitForSelector('#jblu', { timeout: 30000 });
      // a tela de entrada, antes de qualquer pessoa entrar
      pg.entrada = await pg.evaluate(() => { const v = document.getElementById('jbl'), c = getComputedStyle(v), b = getComputedStyle(v.querySelector('button[type=submit]')), sm = getComputedStyle(v.querySelector('small')), bd = getComputedStyle(document.body);
        return [document.documentElement.classList.contains('vis-vc'), c.backgroundColor, c.backgroundImage, b.backgroundColor, b.backgroundImage, b.borderRadius, sm.color, bd.backgroundImage].join(' | '); });
      await pg.fill('#jblu', P.usuario); await pg.fill('#jbls', 'senha-de-teste');
      await pg.click('#jbl button[type=submit]');
      await pg.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado === true, null, { timeout: 60000 });
      await pg.waitForTimeout(700);
      return pg;
    };
    const naTela = async (pg) => { await pg.evaluate(() => JBNAV.ir('#/config')); await pg.waitForTimeout(900); return pg.evaluate(() => !!document.querySelector('#vidroClaroChk')); };
    const novas = (pg, n) => pg.evaluate((k) => window.__srv.gravacoes.slice(k).map((g) => g.colecao + '/' + g.id), n);
    const quantas = (pg) => pg.evaluate(() => window.__srv.gravacoes.length);

    const dn = await entrarNuvem('dono', { docs: [APAR] });
    ok(await dn.evaluate(() => !!window.JB_NUVEM_API && window.JB_NUVEM_API.eu().admin === true && vidroPode() === true), 'dono: pode testar');
    ok(await nuncaLigou(dn), 'dono: começa no visual de sempre');
    ok(await naTela(dn), 'dono: a chave aparece em Configurações › Aparência');
    const nDn = await quantas(dn);
    await dn.click('#vidroClaroChk'); await dn.waitForTimeout(900);
    ok(await temClasse(dn), 'dono: marcou a chave e o visual novo ligou');
    ok(await dn.evaluate(() => { const d = window.__srv.banco.get('data/users/u_DONO/prefs'); return !!(d && d.dados && d.dados.vidroClaro === true); }), 'dono: a preferência ficou guardada no usuário dele');
    const gDn = await novas(dn, nDn);
    ok(gDn.length > 0 && gDn.every((g) => g === 'data/users/u_DONO/prefs'), 'dono: ligar o visual só gravou a preferência dele, nenhum outro dado' + (gDn.every((g) => g === 'data/users/u_DONO/prefs') ? '' : ' (gravou: ' + gDn.join(', ') + ')'));
    ok(await dn.evaluate(() => { const d = window.__srv.banco.get('config/aparencia'); return !!d && !JSON.stringify(d.dados).includes('vidro'); }), 'dono: o padrão de todos (config/aparencia) não recebeu o visual novo');
    ok(dn.erros.length === 0, 'dono: nenhum erro de página' + (dn.erros.length ? ': ' + dn.erros[0] : ''));
    const entradaLimpa = dn.entrada;
    await dn.context().close();

    const dn2 = await entrarNuvem('dono', { docs: [APAR, PREF('u_DONO', true)], lembrado: 'u_DONO' });
    ok(dn2.entrada === entradaLimpa, 'dono, de volta: a tela de entrada é a de sempre');
    ok((await temClasse(dn2)) && (await semPiscar(dn2)), 'dono, de volta: depois de entrar, a primeira tela já abre no visual novo, sem piscar');
    await dn2.context().close();

    const adm = await entrarNuvem('outroAdmin', { lembrado: 'u_DONO', docs: [APAR, PREF('u_ADM2', true)] });
    ok(adm.entrada === entradaLimpa, 'a tela de entrada é a mesma no aparelho em que o dono deixou o visual novo ligado');
    ok(await adm.evaluate(() => window.JB_NUVEM_API.eu().admin === true && APP.isOwner === true && vidroPode() === false), 'outro administrador: não pode');
    ok(await nuncaLigou(adm), 'outro administrador: nunca fica com o visual novo, nem por um instante');
    ok((await lembra(adm)) === null, 'outro administrador: o aparelho esquece');
    ok(!(await naTela(adm)), 'outro administrador: não vê a chave');
    const nAdm = await quantas(adm);
    const lig = await adm.evaluate(async () => { await definirVidro(true); await new Promise((r) => setTimeout(r, 700)); return document.documentElement.classList.contains('vis-vc'); });
    const gAdm = await novas(adm, nAdm);
    ok(!lig && gAdm.length === 0, 'outro administrador: não liga nem grava nada chamando a função' + (gAdm.length ? ' (gravou: ' + gAdm.join(', ') + ')' : ''));
    await adm.context().close();

    const com = await entrarNuvem('comum', { lembrado: 'u_DONO', docs: [APAR] });
    ok(await com.evaluate(() => vidroPode() === false), 'usuário comum: não pode');
    ok(await nuncaLigou(com), 'usuário comum: nunca fica com o visual novo, nem por um instante');
    ok((await lembra(com)) === null, 'usuário comum: o aparelho esquece');
    ok(await com.evaluate(() => !htmlAparencia().includes('vidroClaroChk')), 'usuário comum: não vê a chave');
    await com.context().close();
  }
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nVidro claro em teste: tudo certo.');
process.exit(falhas ? 1 : 0);
