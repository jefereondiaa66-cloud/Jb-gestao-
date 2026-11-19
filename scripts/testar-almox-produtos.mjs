#!/usr/bin/env node
// Teste de ponta a ponta do Estoque / Produtos do almoxarifado (V140) no navegador, com o banco central
// simulado (scripts/lib/servidor-falso.mjs), um leitor de fotos falso e só dados de exemplo:
//   - cadastrar por foto: a IA preenche, o grupo novo é criado, a quantidade vira saldo, o preço vira custo
//   - o mesmo produto de novo não duplica: soma à quantidade
//   - saída: busca, marca o produto, quantidade, setor; baixa o saldo e oferece o cupom
//   - lançamentos: ver, cupom, editar e excluir; relatórios para imprimir
// Uso: node scripts/construir.mjs && node scripts/testar-almox-produtos.mjs [pasta-das-capturas]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || join(RAIZ, 'saida');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const docs = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', situacao: 'Ativo', departamento: 'Produção' }],
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
];
const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
const browser = await chromium.launch();
let falhas = 0; const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.stack || e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load|_blob/.test(m.text())) erros.push('console: ' + m.text()); });
await page.addInitScript(({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] }); docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d)); window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  /* leitor falso: devolve o que estiver em window.__resposta e guarda os pedidos */
  window.__pedidos = [];
  const leitor = { ler: async (o) => { window.__pedidos.push(o); await new Promise((r) => setTimeout(r, 120)); return { texto: JSON.stringify(window.__resposta || {}) }; } };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'leitor' ? leitor : null) };
}, { codigo: servidorFalso, docs });
await page.goto(base + '/saida/claude.html');
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
const ir = async (h, sel) => { await page.evaluate((h) => JBNAV.ir(h), h); await page.waitForTimeout(400); if (sel) await page.waitForSelector(sel, { timeout: 8000 }); };
const foto = (n) => page.screenshot({ path: join(OUT, 'produtos-' + n + '.png'), fullPage: false });
const saldo = (nome) => page.evaluate((n) => { const i = DATA.almItens.find((x) => x.nome === n); return i ? ALMOX_V52.estI(i.id).saldo : null; }, nome);
const confirmar = async () => { await page.waitForSelector('.veu .btn.perigo, .veu .btn.pri', { timeout: 5000 }); await page.locator('.veu .btn.perigo, .veu .btn.pri').last().click(); };
/* uma imagem PNG pequena (2×2) para a foto do produto */
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwnwEIGBgYGBgYGAAB/wH/1dEu9QAAAABJRU5ErkJggg==', 'base64');
try {
  // 1. o início leva para o Estoque / Produtos
  await ir('#/setor-almox', '#svCorpo');
  ok(await page.locator('#svCorpo a[href="#/almProdutos"]').count() >= 1, 'início tem o botão Estoque / Produtos');
  await ir('#/almProdutos', '#prFoto'); await foto('01-vazio');
  ok(/Nenhum produto cadastrado/.test(await page.innerText('#prL')), 'tela vazia convida a cadastrar');

  // 2. cadastrar por foto
  await page.evaluate(() => { window.__resposta = { nome: 'Rolamento 6205 2RS', marca: 'SKF', especificacao: '25 × 52 × 15 mm', refFab: '6205-2RSH', categoria: 'Peças e manutenção', grupo: 'Rolamentos', unidade: 'unidade', quantidade: 10, preco: 25, local: null, existente: null, confianca: 'alta', observacao: null }; });
  await page.click('#prFoto'); await page.waitForSelector('#fpF', { state: 'attached' });
  await page.fill('#fpT', 'tem 10 desse, marca SKF, custa 25 reais');
  await page.setInputFiles('#fpF', { name: 'foto.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('#fpNome') && document.querySelector('#fpNome').value === 'Rolamento 6205 2RS', null, { timeout: 8000 });
  ok(await page.inputValue('#fpQtd') === '10' && await page.inputValue('#fpGrp') === 'Rolamentos' && await page.inputValue('#fpCat') === 'Peças e manutenção', 'a IA preencheu nome, quantidade, grupo e categoria');
  const ped = await page.evaluate(() => window.__pedidos[0]);
  ok(ped && ped.paginas && ped.paginas.length === 1 && /tem 10 desse/.test(ped.prompt), 'a foto e a frase foram para a leitura');
  await foto('02-foto-lida');
  await page.locator('.veu [data-ok]').last().click();
  await page.waitForFunction(() => DATA.almItens.length === 1 && DATA.almAjustes.length === 1, null, { timeout: 10000 });
  ok(await saldo('Rolamento 6205 2RS') === 10, 'produto cadastrado com saldo 10');
  const it = await page.evaluate(() => { const i = DATA.almItens[0]; return { cod: i.codigo, g: ALMOX_V52.nomeGrupo(i.grupoId), marca: i.marca, ref: i.custoRef, cm: ALMOX_V52.estI(i.id).cm }; });
  ok(it.g === 'Rolamentos' && it.marca === 'SKF' && it.ref === 25 && Math.abs(it.cm - 25) < 1e-6, 'grupo novo criado, marca e custo de referência: ' + JSON.stringify(it));
  await page.waitForFunction(() => /Rolamento/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 });
  ok(await page.locator('#fpNome').count() === 1 && await page.inputValue('#fpNome') === '' && /Rolamento 6205/.test(await page.innerText('#fpFeitos')), 'a janela fica aberta e limpa para o próximo produto');

  // 3. o mesmo produto de novo: não duplica, soma
  await page.evaluate(() => { window.__resposta = { nome: 'Rolamento 6205 2RS', marca: 'SKF', categoria: 'Peças e manutenção', grupo: 'Rolamentos', unidade: 'unidade', quantidade: 5, existente: DATA.almItens[0].codigo, confianca: 'alta' }; });
  await page.fill('#fpT', 'chegaram mais 5');
  await page.setInputFiles('#fpF', { name: 'foto2.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('[name=fpModo]', { timeout: 8000 });
  ok(/já está cadastrado/.test(await page.innerText('#fpDup')), 'avisa que o produto já existe');
  await foto('03-ja-existe');
  await page.locator('.veu [data-ok]').last().click();
  await page.waitForFunction(() => DATA.almAjustes.length === 2 && /agora|atualizado/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 });
  ok(await page.evaluate(() => DATA.almItens.length) === 1 && await saldo('Rolamento 6205 2RS') === 15, 'não duplicou e somou: saldo 15');
  await page.locator('.veu [data-r]').last().click(); await page.waitForTimeout(300);

  // 4. lista com busca instantânea
  await page.fill('#prQ', 'skf'); await page.waitForTimeout(200);
  ok(await page.locator('#prL .apr-card').count() === 1, 'busca filtra na hora');
  await page.fill('#prQ', 'nada disso'); await page.waitForTimeout(200);
  ok(await page.locator('#prL .apr-card').count() === 0, 'busca sem resultado esvazia a lista');
  await page.fill('#prQ', ''); await page.waitForTimeout(200); await foto('04-lista');

  // 5. saída: pesquisa, marca e lança
  await page.click('#prSai'); await page.waitForSelector('#lpQ');
  await page.fill('#lpQ', '6205'); await page.waitForTimeout(150);
  await page.locator('[data-pk]').first().check(); await page.waitForSelector('[data-pq]');
  await page.fill('[data-pq]', '100'); await page.fill('#lpSet', 'Manutenção'); await page.fill('#lpQuem', 'Funcionário Exemplo 1');
  await page.locator('.veu [data-ok]').last().click(); await page.waitForTimeout(700);
  ok(await page.evaluate(() => DATA.almSaidas.length) === 0, 'saída maior que o saldo não é aceita');
  await page.fill('[data-pq]', ''); await page.click('[data-mais]'); await page.click('[data-mais]'); await page.click('[data-mais]'); await page.click('[data-mais]');
  ok(await page.inputValue('[data-pq]') === '4', 'botões + e − mudam a quantidade');
  await foto('05-saida');
  await page.locator('.veu [data-ok]').last().click();
  await page.waitForFunction(() => DATA.almSaidas.length === 1, null, { timeout: 10000 });
  ok(await saldo('Rolamento 6205 2RS') === 11, 'saída baixou o saldo: 15 − 4 = 11');
  await page.waitForSelector('[data-fmt="c80"]', { timeout: 5000 }); await foto('06-cupom-pergunta');
  await page.click('[data-fmt="c80"]'); await page.waitForTimeout(600);
  ok(await page.evaluate(() => location.hash) === '#/documento' && await page.locator('.cupom').count() >= 1, 'cupom de saída abre para imprimir');
  ok(/REQUISI|Requisi/.test(await page.innerText('.cupom')), 'cupom é da requisição');
  await foto('07-cupom-saida');

  // 6. entrada sem compra com preço
  await ir('#/almProdutos', '#prEnt');
  await page.evaluate(() => ALMOX_V52.lancar('entrada', DATA.almItens[0].id)); await page.waitForSelector('[data-pq]');
  await page.fill('[data-pq]', '3'); await page.locator('[data-chip="lpMot"]', { hasText: 'Sobra encontrada' }).click();
  await page.locator('.veu [data-ok]').last().click();
  await page.waitForFunction(() => DATA.almAjustes.length === 3, null, { timeout: 10000 });
  ok(await saldo('Rolamento 6205 2RS') === 14, 'entrada somou 3: saldo 14');
  await page.waitForSelector('[data-fmt="a4"]', { timeout: 5000 }); ok(/Pronto/.test(await page.locator('.veu [data-r]').last().innerText()), 'depois da entrada oferece o comprovante');
  await page.locator('.veu [data-r]').last().click(); await page.waitForTimeout(200);

  // 7. lançamentos: ver, cupom, editar, excluir
  await page.click('[data-aba="lanc"]'); await page.waitForSelector('#prLm');
  ok(await page.locator('#prLm .apr-lc').count() === 4, 'aba Lançamentos lista as 4 movimentações');
  await foto('08-lancamentos');
  const kSobra = await page.evaluate(() => [...document.querySelectorAll('#prLm .apr-lc')].findIndex((x) => /Sobra encontrada/.test(x.innerText)));
  const linha = page.locator('#prLm .apr-lc').nth(kSobra);
  await linha.locator('[data-a="editar"]').click(); await page.waitForSelector('[data-eq]');
  await page.fill('[data-eq]', '2'); await page.locator('.veu [data-ok]').last().click();
  await page.waitForFunction(() => DATA.almAjustes.some((a) => a.motivo === 'Sobra encontrada' && a.qtd === 2), null, { timeout: 10000 });
  ok(await saldo('Rolamento 6205 2RS') === 13, 'editar a entrada recalcula o saldo: 13');
  await page.locator('#prLm .apr-lc').nth(kSobra).locator('[data-a="cupom"]').click(); await page.waitForTimeout(600);
  ok(/ENTRADA|Entrada/.test(await page.innerText('.cupom').catch(() => '')), 'cupom de entrada abre');
  await foto('09-cupom-entrada');
  await ir('#/almProdutos', '#prLm');
  await page.locator('#prLm .apr-lc').nth(kSobra).locator('[data-a="excluir"]').click(); await confirmar();
  await page.waitForFunction(() => !DATA.almAjustes.some((a) => a.motivo === 'Sobra encontrada'), null, { timeout: 10000 });
  ok(await saldo('Rolamento 6205 2RS') === 11, 'excluir a entrada devolve o saldo: 11');

  // 8. relatórios
  const gerar = async () => { await page.click('#prImp'); await page.waitForTimeout(400); const g = page.locator('.veu button', { hasText: 'Gerar relatório' }); if (await g.count()) await g.last().click(); await page.waitForTimeout(600); };
  await gerar(); await foto('09b-rel-lanc');
  ok(/LANÇAMENTOS DO ESTOQUE/i.test(await page.evaluate(() => document.body.innerText)), 'relatório dos lançamentos abre para imprimir');
  await ir('#/almProdutos', '#prImp'); await page.click('[data-aba="prod"]'); await page.waitForSelector('#prL');
  await gerar();
  ok(/POSIÇÃO DO ESTOQUE/i.test(await page.evaluate(() => document.body.innerText)), 'relatório da posição do estoque abre para imprimir');
  await foto('10-relatorio');
  // 9. ficha do produto
  await ir('#/almProdutos', '#prL'); await page.locator('#prL [data-ver]').first().click(); await page.waitForSelector('.apr-kv');
  ok(/Tem agora/.test(await page.innerText('.veu')) && /11/.test(await page.innerText('.apr-fi-sd')), 'ficha do produto mostra o saldo e os lançamentos');
  await foto('11-ficha'); await page.locator('.veu [data-r]').last().click();
  // 10. celular
  await page.setViewportSize({ width: 390, height: 820 }); await ir('#/almProdutos', '#prL'); await page.waitForTimeout(300); await foto('12-celular');
  const larg = await page.evaluate(() => document.documentElement.scrollWidth); ok(larg <= 392, 'cabe na tela do celular (largura ' + larg + ')');
  await page.evaluate(() => ALMOX_V52.lancar('saida')); await page.waitForSelector('#lpQ'); await page.waitForTimeout(700); await foto('13-saida-celular'); await page.locator('.veu [data-r]').last().click();
  await page.click('#prFoto'); await page.waitForSelector('#fpNome'); await page.waitForTimeout(700); await foto('14-foto-celular'); await page.locator('.veu [data-r]').last().click();
  // tudo chegou ao banco
  await page.waitForFunction(() => APP.central.estado().pendentes === 0, null, { timeout: 15000 }).catch(() => {});
  const banco = await page.evaluate(() => { const t = {}; window.__srv.estado.docs.forEach((d, k) => { if (k.startsWith('alm/')) { const s = JSON.stringify(d.dados); for (const j of ['grupo', 'item', 'saida', 'ajuste']) t[j] = (t[j] || 0) + (s.split('"jbt":"' + j + '"').length - 1); } }); return t; });
  ok(banco.grupo === 1 && banco.item === 1 && banco.saida === 1 && banco.ajuste === 2, 'banco central recebeu tudo: ' + JSON.stringify(banco));
} catch (e) { ok(false, 'erro no roteiro: ' + (e && e.message)); await foto('zz-erro').catch(() => {}); }
const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 4).join(' | ') : ''}`);
await browser.close(); http.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
