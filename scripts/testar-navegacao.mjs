#!/usr/bin/env node
// Teste da navegação central (JBNAV) no navegador: abre o programa REAL (saida/claude.html)
// num Chromium com o banco simulado e confere, com cliques de verdade:
//   A navegação linear · B limite do histórico · C alternância de setores · D janelas e gavetas
//   E abas internas · F cliques repetidos · G atualizar a página · H Voltar do navegador/celular
//   + formulário não salvo, redirecionamentos e uma varredura de TODAS as telas de TODOS os setores.
// Roda em três ambientes: computador, celular e página embutida que não deixa gravar o histórico.
// Requer Playwright. Uso: node scripts/construir.mjs && node scripts/testar-navegacao.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const docs = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', situacao: 'Ativo', departamento: 'Produção', setor:'Produção' }],
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo 2', situacao: 'Ativo', departamento: 'Produção', setor:'Produção' }],
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
];
async function abrir(opc = {}) {
  const http = createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
    if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript' });
    res.end(readFileSync(p));
  });
  await new Promise((r) => http.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${http.address().port}`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext(opc.mobile ? { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true } : { viewport: { width: 1280, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  if (opc.semEstado) await page.addInitScript(() => { history.replaceState = history.pushState = function () { throw new DOMException('bloqueado', 'SecurityError'); }; });
  const pronto = () => page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado === true, null, { timeout: 40000 });
  await page.goto(base + '/saida/claude.html' + (opc.hash || ''));
  await pronto();
  const hash = () => page.evaluate(() => location.hash);
  const espera = (ms = 250) => page.waitForTimeout(ms);
  return { page, browser, erros, base, hash, espera, pronto, fim: async () => { await browser.close(); http.close(); } };
}

async function roteiro(opc) {
const t = await abrir(opc); const { page } = t;
const est = () => page.evaluate(() => JBNAV.estado());
const hash = () => page.evaluate(() => location.hash);
const w = (ms = 320) => page.waitForTimeout(ms);
const clicaEl = async (sel) => { const n = await page.evaluate((s) => { const e = [...document.querySelectorAll(s)].find(x => x.offsetParent !== null) || document.querySelector(s); if (!e) return 0; e.click(); return 1; }, sel); await w(); return n; };
const voltar = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('[data-jb-voltar]')].find(x => x.offsetParent !== null) || document.querySelector('[data-jb-voltar]'); if (b && !b.disabled) b.click(); }); await w(); };
const desligado = () => page.evaluate(() => { const l = [...document.querySelectorAll('[data-jb-voltar]')]; return l.length > 0 && l.every(b => b.disabled); });
const ir = async (h) => { await page.evaluate((h) => JBNAV.ir(h), h); await w(); };
const ativa = async () => { const e = await est(); return e.pilha.slice(0, e.i + 1); };

console.log('Teste A · navegação linear (6 telas, botão Voltar do cabeçalho)');
await clicaEl('[data-setor="dp"]'); await ir('#/funcionarios');
ok(await clicaEl('#conteudo a[href="#/ficha/f1"]') === 1, 'abriu a ficha pelo link da lista');
await ir('#/folha'); await ir('#/ferias');
const caminho = await ativa(); console.log('    caminho:', caminho.join(' → '));
ok(caminho.length === 6 && new Set(caminho).size === 6, 'cada tela entrou uma vez na pilha');
const visto = []; for (let k = caminho.length - 2; k >= 0; k--) { await voltar(); visto.push(await hash()); }
ok(JSON.stringify(visto) === JSON.stringify(caminho.slice(0, -1).reverse()), 'cada clique voltou exatamente uma tela, na ordem inversa: ' + visto.join(' → '));

console.log('Teste B · limite do histórico');
ok(await desligado(), 'no começo o botão Voltar fica desligado');
const h0 = await hash(); for (let k = 0; k < 4; k++) await voltar(); await page.evaluate(() => { for (let i = 0; i < 4; i++) JBNAV.voltar(); }); await w(700);
ok(await hash() === h0 && (await est()).i === 0, 'insistir no Voltar não reabre tela antiga, não inventa destino e não dá voltas');
await clicaEl('[data-setor="dp"]'); ok((await est()).i === 1 && await hash() === '#/painel', 'depois do limite, uma sequência nova começa normalmente');
await voltar();

console.log('Teste · sem alternância entre duas telas');
await clicaEl('[data-setor="vendas"]'); const casa = await hash(); await ir('#/vendas'); await ir('#/clientes');
for (let k = 0; k < 3; k++) { await clicaEl('[data-aba-k="#/vendas"]'); await clicaEl('[data-aba-k="#/clientes"]'); }
let e = await est(); ok((await ativa()).join() === ['#/setores', casa, '#/vendas', '#/clientes'].join(), 'ir e vir entre duas telas (abas do topo) não empilha repetição: ' + (await ativa()).length + ' posições');
await ir('#/ficha/naoexiste'); const iAntes = (await est()).i;
const voltaLista = async () => { const n = await page.evaluate(() => { const a = [...document.querySelectorAll('#conteudo a[href="#/funcionarios"]')].find(x => /^Voltar/.test(x.textContent.trim())); if (!a) return 0; a.click(); return 1; }); await w(700); return n; };
ok(await voltaLista() === 1, 'tela com link "Voltar à lista"'); await ir('#/folha'); await ir('#/ficha/naoexiste'); await voltaLista();
e = await est(); ok(await hash() === '#/funcionarios' && e.i === iAntes, 'link de retorno com destino desce a pilha até a tela (não cria posição nova)');
while (!(await desligado())) await voltar();

console.log('Teste C · alternância de setores');
await clicaEl('[data-setor="lenha"]'); const l0 = await hash(); await ir('#/compras'); await ir('#/fornecedores');
await clicaEl('a[href="#/setores"]'); await clicaEl('[data-setor="financeiro"]'); await ir('#/fpagar');
const pc = await ativa(); console.log('    pilha:', pc.join(' → '));
const seq = []; for (let k = 0; k < pc.length + 3 && !(await desligado()); k++) { await voltar(); seq.push(await hash()); }
ok(JSON.stringify(seq) === JSON.stringify(pc.slice(0, -1).reverse()) && (await est()).i === 0 && seq.includes(l0), 'o retorno passa pelo segundo setor, depois pelo primeiro, e para nos Setores');

console.log('Teste D · janelas, gavetas e confirmações');
await clicaEl('[data-setor="dp"]'); await ir('#/funcionarios'); const base = (await ativa()).join();
for (let k = 0; k < 3; k++) { await ir('#/funcionarios/f1'); ok(!!(await page.$('#camada .gaveta, #camada .veu')), 'janela do registro abriu'); await voltar(); await w(300); }
ok((await ativa()).join() === base && await hash() === '#/funcionarios' && !(await page.$('#camada .veu')), 'abrir e fechar a janela 3 vezes deixa o histórico igual (Voltar fecha a janela, não troca de tela)');
await ir('#/funcionarios/f1'); await page.goBack(); await w(600); ok(await hash() === '#/funcionarios' && !(await page.$('#camada .veu')) && (await ativa()).join() === base, 'Voltar do navegador fecha a janela do registro');
await page.evaluate(() => { window.__r = 'aberto'; confirmar('Teste', 'janela de teste').then(v => window.__r = v); }); await w();
await page.goBack().catch(() => {}); await w(800);
ok(await page.evaluate(() => window.__r) === false && await hash() === '#/funcionarios' && !(await page.$('.modal')), 'Voltar do navegador com confirmação aberta: fecha a confirmação e continua na tela');
await page.evaluate(() => { confirmar('Teste 2', 'outra janela').then(v => window.__r2 = v); }); await w(); await voltar();
ok(await page.evaluate(() => window.__r2) === false && await hash() === '#/funcionarios', 'Voltar do sistema com confirmação aberta: fecha a confirmação primeiro');
ok((await ativa()).join() === base, 'depois de duas confirmações o histórico principal continua igual');

console.log('Teste E · abas e subabas internas');
await ir('#/lancar'); const antes = (await est()).pilha.length;
const nAbas = await page.evaluate(() => { const l = [...document.querySelectorAll('#conteudo [data-la]')]; l.forEach(b => b.click()); return l.length; }); await w();
ok(nAbas > 0 && (await est()).pilha.length === antes, `trocar ${nAbas} abas internas não cria posição no histórico`);

console.log('Teste F · cliques repetidos');
const i0 = (await est()).i;
await page.evaluate(() => { const b = [...document.querySelectorAll('[data-jb-voltar]')].find(x => !x.disabled); b.click(); b.click(); b.click(); }); await w(800);
ok((await est()).i === i0 - 1, 'três cliques seguidos no Voltar recuam uma tela só');
await page.evaluate(() => { const a = document.querySelector('#conteudo a[href="#/admissoes"]'); a.click(); a.click(); a.click(); }); await w(500);
e = await est(); ok(e.pilha.filter(x => x === '#/admissoes').length === 1 && await hash() === '#/admissoes', 'três cliques seguidos num link abrem a tela uma vez só');

console.log('Teste G · atualizar a página');
const antesF5 = await est(); await page.reload(); await t.pronto(); await w(600); e = await est();
ok(e.i === antesF5.i && e.pilha.join() === antesF5.pilha.join() && await hash() === '#/admissoes', 'F5 mantém a tela e a pilha');
const s2 = []; while (!(await desligado()) && s2.length < 12) { await voltar(); s2.push(await hash()); }
ok(s2.at(-1) === '#/setores' && new Set(s2).size === s2.length, 'depois do F5 o Voltar continua linear até o começo: ' + s2.join(' → '));

console.log('Teste H · Voltar do navegador / celular');
await clicaEl('[data-setor="vendas"]'); await ir('#/vendas'); await ir('#/estoque');
const s3 = []; for (let k = 0; k < 3; k++) { await page.goBack(); await w(380); s3.push(await hash()); }
ok(s3.join() === ['#/vendas', casa, '#/setores'].join() && (await est()).i === 0 && await desligado(), 'botão do navegador/celular anda na mesma pilha: ' + s3.join(' → '));
await page.goForward(); await w(380); await voltar(); ok(await hash() === '#/setores', 'Voltar interno e do navegador misturados não se contradizem');

console.log('Formulário não salvo e redirecionamentos');
await clicaEl('[data-setor="vendas"]'); await ir('#/vendas'); await ir('#/orcamento/novo');
const loc = page.locator('#conteudo textarea:visible, #conteudo input[type=text]:visible, #conteudo input[type=number]:visible, #conteudo input:not([type]):visible').first();
if (await loc.count()) { await loc.fill('1'); await w(200); ok((await est()).sujo, 'digitar no formulário marca "não salvo"');
  await voltar(); ok(!!(await page.$('.modal')) && await hash() === '#/orcamento/novo', 'Voltar com digitação não salva pede confirmação');
  await clicaEl('.modal [data-r="0"]'); ok(await hash() === '#/orcamento/novo' && await loc.inputValue() === '1', 'ficar na tela mantém o que foi digitado');
  await page.goBack(); await w(700); ok(!!(await page.$('.modal')) && await loc.inputValue() === '1', 'Voltar do navegador também pede confirmação, sem apagar o formulário'); await clicaEl('.modal [data-r="1"]'); await w(500);
  ok(await hash() === '#/vendas', 'confirmar a saída volta uma tela'); } else ok(false, 'campo do formulário não encontrado');
await ir('#/orcamento/novo'); await ir('#/clientes');
ok(!(await ativa()).includes('#/orcamento/novo'), 'sair do formulário por ação da tela substitui a posição (o Voltar não cai no formulário vazio)');
ok(t.erros.length === 0, 'nenhum erro de JavaScript' + (t.erros.length ? ': ' + [...new Set(t.erros)].slice(0, 3).join(' | ') : ''));
await t.fim();
}
async function varredura(opc) {
const t = await abrir(opc); const { page } = t;
const est = () => page.evaluate(() => JBNAV.estado()); const hash = () => page.evaluate(() => location.hash);
const w = (ms = 170) => page.waitForTimeout(ms);
const desligado = () => page.evaluate(() => { const l = [...document.querySelectorAll('[data-jb-voltar]')]; return l.length > 0 && l.every(b => b.disabled); });
const setores = await page.evaluate(() => [...document.querySelectorAll('[data-setor]')].map(b => b.dataset.setor));
let total = 0;
for (const s of setores) {
  await page.evaluate((s) => document.querySelector(`[data-setor="${s}"]`).click(), s); await w(350);
  const entrada = await hash();
  // as telas do setor: todos os links da tela inicial dele; no Setor Pessoal, também o menu inteiro
  const alvos = await page.evaluate(() => {
    const l = [...document.querySelectorAll('#conteudo a[href^="#/"]')].map(a => a.getAttribute('href'));
    if (location.hash === '#/painel' && typeof MITENS !== 'undefined') MITENS.forEach(x => { if (x.m && !x.f && !x.a && !x.r) l.push('#/' + x.m); });
    return [...new Set(l)].filter(h => h !== location.hash && h !== '#/setores' && !/\/(novo|nova)(\/|$)/.test(h));
  });
  for (const h of alvos) {
    await page.evaluate((h) => { const a = [...document.querySelectorAll('#conteudo a[href^="#/"]')].find(x => x.getAttribute('href') === h && x.offsetParent !== null); if (a) a.click(); else JBNAV.ir(h); }, h);
    await w();
  }
  const e = await est(); const pilha = e.pilha.slice(0, e.i + 1); total += pilha.length;
  const rep = pilha.some((x, i) => i && x === pilha[i - 1]);
  const volta = []; let guarda = 0;
  while (!(await desligado()) && guarda++ < pilha.length + 5) {
    await page.evaluate(() => { const b = [...document.querySelectorAll('[data-jb-voltar]')].find(x => !x.disabled); if (b) b.click(); }); await w(230); volta.push(await hash());
  }
  // posição que é a janela de um registro (#/tela/id): ao voltar nela o Voltar fecha a janela primeiro (fica na lista) e só depois recua
  const mods = await page.evaluate(() => Object.keys(MODS));
  const esperado = []; pilha.slice(0, -1).reverse().forEach((x, i, l) => { esperado.push(x); const p = x.replace(/^#\//, '').split('/'); if (p[1] && mods.includes(p[0]) && l[i + 1] !== '#/' + p[0]) esperado.push('#/' + p[0]); });
  const linear = JSON.stringify(volta) === JSON.stringify(esperado);
  ok(linear && !rep && (await est()).i === 0 && await hash() === '#/setores', `${s}: entrada ${entrada}, ${alvos.length} telas abertas, ${pilha.length} posições; Voltar ${volta.length}× até Setores, uma por clique`);
  if (rep) console.log('     repetida:', pilha.filter((x, i) => i && x === pilha[i - 1]).join(' '));
  if (!linear) console.log('     esperado', esperado.join(' '), '\n     obtido  ', volta.join(' '));
  if (await hash() !== '#/setores') { await page.evaluate(() => JBNAV.subst('#/setores')); await w(400); }
}
ok(t.erros.length === 0, 'nenhum erro de JavaScript em ' + total + ' telas' + (t.erros.length ? ': ' + [...new Set(t.erros)].slice(0, 4).join(' | ') : ''));
await t.fim();
}
let falhas = 0; const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
for (const [nome, opc] of [['computador', {}], ['celular', { mobile: true }], ['página embutida sem histórico gravável', { semEstado: true }]]) {
  console.log(`\n===== ${nome} =====`);
  await roteiro(opc);
  console.log('Varredura · todas as telas de todos os setores');
  await varredura(opc);
}
console.log(falhas ? `\n${falhas} FALHA(S) na navegação` : '\nNavegação: todos os testes passaram nos três ambientes.');
process.exit(falhas ? 1 : 0);
