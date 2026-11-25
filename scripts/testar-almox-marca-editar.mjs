#!/usr/bin/env node
// Teste de ponta a ponta da V172 (pedido do Jeferson, 25/11/2026) no navegador, com o banco central simulado
// (scripts/lib/servidor-falso.mjs), um leitor de fotos falso e só dados de exemplo:
//   - marca diferente é outro produto: mesmo nome e mesma marca soma no que existe; marca nova vira produto novo,
//     separado, no mesmo grupo; produto antigo sem marca pergunta (somar grava a marca); vários com o mesmo nome e
//     sem marca lida: a pessoa escolhe qual
//   - entrada por nota: a linha que cita uma marca conhecida não se liga ao item de outra marca
//   - o mesmo nome com outra marca no Setor de Combustível vira produto com a marca no nome
//   - editar o lançamento por completo (Estoque / Produtos, Cozinha e Limpeza): quantidade, zerar para tirar,
//     valor, embalagens, foto e dados do produto; o saldo nunca fica negativo; tocar no cartão abre o lançamento
// Uso: node scripts/construir.mjs && node scripts/testar-almox-marca-editar.mjs [pasta-das-capturas]
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
  window.__pedidos = [];
  const leitor = { ler: async (o) => { window.__pedidos.push(o); await new Promise((r) => setTimeout(r, 120)); return { texto: JSON.stringify(window.__resposta || {}) }; } };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'leitor' ? leitor : null) };
}, { codigo: servidorFalso, docs });
await page.goto(base + '/saida/claude.html');
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
const ir = async (h, sel) => { await page.evaluate((h) => JBNAV.ir(h), h); await page.waitForTimeout(400); if (sel) await page.waitForSelector(sel, { timeout: 8000 }); };
const foto = (n) => page.screenshot({ path: join(OUT, 'marca-' + n + '.png'), fullPage: false });
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwnwEIGBgYGBgYGAAB/wH/1dEu9QAAAABJRU5ErkJggg==', 'base64');
const itens = (nome) => page.evaluate((n) => DATA.almItens.filter((i) => i.nome === n).map((i) => ({ id: i.id, marca: i.marca || '', g: ALMOX_V52.nomeGrupo(i.grupoId), saldo: ALMOX_V52.estI(i.id).saldo, foto: i.foto && i.foto.id, esp: i.especificacao || '', local: i.local || '' })), nome);
const um = async (nome, marca) => (await itens(nome)).find((i) => i.marca === marca);
/* lê uma foto com a resposta dada e espera a IA preencher (a janela do cadastro já aberta) */
const ler = async (resp, frase) => {
  await page.evaluate((r) => { window.__resposta = r; }, resp);
  await page.fill('#fpT', frase || '');
  await page.setInputFiles('#fpF', { name: 'foto.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction((n) => document.querySelector('#fpNome').value === n && /Pronto|dúvida/.test(document.querySelector('#fpSt').textContent), resp.nome, { timeout: 8000 });
};
/* toque no botão pela página (o aviso flutuante no canto pode cobrir o botão na tela grande do teste). O programa ignora
   um segundo toque no mesmo botão de gravar em menos de 0,7 s (proteção contra clique duplo): espera um pouco antes. */
const salvar = async () => { await page.waitForTimeout(750); await page.evaluate(() => { const b = [...document.querySelectorAll('.veu .modal [data-ok]')].pop(); b.click(); }); };
const pronto = () => page.waitForTimeout(150); /* a janela põe o cursor no 1º campo 40 ms depois de abrir */
const semEditor = () => page.waitForFunction(() => !document.querySelector('.apr-ed'), null, { timeout: 10000 });
const feito = async () => { try { await page.waitForFunction(() => /^Salvo/.test((document.querySelector('#fpSt') || {}).textContent || ''), null, { timeout: 10000 }); } catch (e) {
  console.log('DIAG', await page.evaluate(() => ({ st: (document.querySelector('#fpSt') || {}).textContent, ok: (document.querySelector('.veu [data-ok]') || {}).disabled, veus: document.querySelectorAll('.veu').length, toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent), itens: DATA.almItens.length, ajustes: DATA.almAjustes.length, radios: [...document.querySelectorAll('#fpDup [name=fpModo]')].map((r) => r.value + ':' + r.checked).join(','), pend: APP.central && APP.central.estado && APP.central.estado() })));
  throw e; } };
try {
  await ir('#/almProdutos', '#prFoto');
  await page.click('#prFoto'); await page.waitForSelector('#fpF', { state: 'attached' });

  console.log('1. Marca diferente é outro produto (cadastro por foto)');
  const ROL = 'Rolamento 6205 2RS';
  await ler({ nome: ROL, marca: 'SKF', categoria: 'Peças e manutenção', grupo: 'Rolamentos', unidade: 'unidade', quantidade: 10, confianca: 'alta' }, 'tem 10 desse, marca SKF');
  ok(await page.locator('#fpDup [name=fpModo]').count() === 0, 'produto que ainda não existe: sem aviso');
  await salvar(); await feito();
  ok((await itens(ROL)).length === 1 && (await um(ROL, 'SKF')).saldo === 10, 'SKF cadastrado com 10');

  await ler({ nome: ROL, marca: 'SKF', categoria: 'Peças e manutenção', grupo: 'Rolamentos', unidade: 'unidade', quantidade: 5, confianca: 'alta' }, 'chegaram mais 5');
  ok(/já está cadastrado/.test(await page.innerText('#fpDup')) && await page.locator('#fpDup [name=fpModo][value=somar]:checked').count() === 1, 'mesmo nome e mesma marca: avisa e já marca “Somar”');
  await salvar(); await feito();
  ok((await itens(ROL)).length === 1 && (await um(ROL, 'SKF')).saldo === 15, 'somou no mesmo produto: 15, sem duplicar');

  /* a IA até diz que é o SKF, mas a marca lida é outra: é produto novo, no grupo do SKF */
  const codSKF = await page.evaluate((n) => DATA.almItens.find((i) => i.nome === n).codigo, ROL);
  await ler({ nome: ROL, marca: 'NSK', categoria: 'Peças e manutenção', grupo: 'Rolamentos de esfera', unidade: 'unidade', quantidade: 4, existente: codSKF, confianca: 'alta' }, 'tem 4, marca NSK');
  ok(/Marca nova/.test(await page.innerText('#fpDup')) && await page.locator('#fpDup [name=fpModo][value=novo]:checked').count() === 1, 'marca nova: avisa e já marca “Cadastrar como produto novo”');
  ok(await page.inputValue('#fpGrp') === 'Rolamentos', 'o grupo do produto novo é o mesmo do outro (Rolamentos)');
  await foto('01-marca-nova');
  await salvar(); await feito();
  const nsk = await um(ROL, 'NSK'), skf = await um(ROL, 'SKF');
  ok(nsk && nsk.saldo === 4 && nsk.g === 'Rolamentos' && skf.saldo === 15, 'NSK é outro produto, com 4, no grupo Rolamentos; SKF continua com 15: ' + JSON.stringify([nsk, skf]));
  ok(await page.evaluate(() => DATA.almGrupos.length) === 1, 'nenhum grupo repetido foi criado');
  const nomes = await page.evaluate((id) => [ALMOX_V52.nomeItem(ALMOX_V52.ITEM(id)), ALMOX_V52.rotItem(ALMOX_V52.ITEM(id))], nsk.id);
  ok(nomes[0] === ROL + ' · NSK' && /· NSK$/.test(nomes[1]), 'com dois do mesmo nome, a marca vai junto: ' + nomes[0]);

  /* a marca não foi lida e há dois com o mesmo nome: a pessoa escolhe */
  await ler({ nome: ROL, marca: null, categoria: 'Peças e manutenção', grupo: 'Rolamentos', unidade: 'unidade', quantidade: 2, confianca: 'alta' }, 'tem 2');
  ok(/Já existem 2 produtos/.test(await page.innerText('#fpDup')) && await page.locator('#fpDup [name=fpModo]:checked').count() === 0, 'sem marca e dois com o mesmo nome: pergunta qual é, sem marcar nada');
  const nAj = await page.evaluate(() => DATA.almAjustes.length);
  await salvar(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => DATA.almAjustes.length) === nAj && (await itens(ROL)).length === 2, 'sem escolher, não grava');
  await page.check(`#fpDup [name=fpModo][value=somar][data-alvo="${nsk.id}"]`);
  await salvar(); await feito();
  ok((await um(ROL, 'NSK')).saldo === 6 && (await um(ROL, 'SKF')).saldo === 15, 'escolheu o NSK: somou 2 nele (6)');

  /* produto antigo sem marca: pergunta; somar grava a marca nele */
  const LUVA = 'Luva de raspa cano longo';
  await page.evaluate((n) => gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: 'it_luva', codigo: 'EPI-090', nome: n, categoria: 'EPI', unidade: 'par' }, null, true), LUVA);
  await page.waitForFunction(() => DATA.almItens.some((i) => i.id === 'it_luva'));
  await ler({ nome: LUVA, marca: 'Danny', categoria: 'EPI', grupo: 'Luvas', unidade: 'par', quantidade: 6, confianca: 'alta' }, 'tem 6 pares');
  ok(/ainda sem marca/.test(await page.innerText('#fpDup')) && await page.locator('#fpDup [name=fpModo][value=somar]:checked').count() === 1, 'o de lá sem marca: pergunta, com “Somar” marcado');
  await salvar(); await feito();
  const lv = await itens(LUVA);
  ok(lv.length === 1 && lv[0].marca === 'Danny' && lv[0].saldo === 6, 'somou no mesmo e gravou a marca Danny nele');

  /* trocar a marca na tela atualiza o aviso */
  await ler({ nome: ROL, marca: 'SKF', categoria: 'Peças e manutenção', grupo: 'Rolamentos', unidade: 'unidade', quantidade: 1, confianca: 'alta' }, 'tem 1');
  await page.fill('#fpMarca', 'Timken');
  ok(/Marca nova/.test(await page.innerText('#fpDup')) && await page.locator('#fpDup [name=fpModo][value=novo]:checked').count() === 1, 'escrever outra marca na tela muda o aviso para “Marca nova”');
  await page.fill('#fpMarca', 'SKF');
  ok(/já está cadastrado/.test(await page.innerText('#fpDup')), 'voltando para SKF, é o mesmo produto de novo');
  await page.locator('.veu [data-r]').last().click(); await page.waitForTimeout(300);

  const val = await page.evaluate((n) => {
    const e = (m) => Object.values(conferirRegistro('almItens', { ...MODS.almItens.padrao(), id: 'x', nome: n, categoria: 'Peças e manutenção', marca: m }).erros).join(' ');
    return [e('SKF'), e('Timken')];
  }, ROL);
  ok(/mesma marca/.test(val[0]) && !/Já existe/.test(val[1]), 'o cadastro só barra o mesmo nome com a mesma marca: ' + val[0]);

  console.log('2. Entrada por nota: a linha que cita a marca liga ao item dela');
  const vin = await page.evaluate(() => ['ROLAMENTO 6205 2RS NSK', 'ROLAMENTO 6205 2RS SKF', 'ROLAMENTO 6205 2RS DANNY', 'LUVA DE RASPA CANO LONGO DANNY'].map((d) => { const r = LANC_IA_V65.vincular({ desc: d, cod: '' }, ''); const i = ALMOX_V52.ITEM(r.id); return i ? i.marca : r.como; }));
  ok(vin.join() === 'NSK,SKF,novo,Danny', 'NSK → NSK, SKF → SKF, marca de outro produto → item novo, luva Danny → luva: ' + vin.join());

  console.log('3. Setor de Combustível: o mesmo nome de outra marca leva a marca no nome');
  const cmb = await page.evaluate(async () => {
    const CAT = JB_ESTOQUE.CAT; const p0 = DATA.produtos.length;
    await gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: 'it_o1', nome: 'Óleo 15W40 Teste', marca: 'Lubrax', categoria: CAT, unidade: 'litro' }, null, true);
    const t0 = Date.now(); while (!DATA.produtos.some((p) => p.almItemId === 'it_o1') && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 100));
    await gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: 'it_o2', nome: 'Óleo 15W40 Teste', marca: 'Mobil', categoria: CAT, unidade: 'litro' }, null, true);
    const t1 = Date.now(); while (!DATA.produtos.some((p) => p.almItemId === 'it_o2') && Date.now() - t1 < 6000) await new Promise((r) => setTimeout(r, 100));
    const n = (id) => (DATA.produtos.find((p) => p.almItemId === id) || {}).nome;
    return [n('it_o1'), n('it_o2'), DATA.produtos.length - p0];
  });
  ok(cmb[0] === 'Óleo 15W40 Teste' && cmb[1] === 'Óleo 15W40 Teste Mobil' && cmb[2] === 2, 'dois produtos no Combustível, o segundo com a marca: ' + cmb.join(' | '));

  console.log('4. Editar o lançamento por completo');
  await page.evaluate(() => { APP.assets = { upload: async (f) => ({ id: 'blob_teste_1', contentType: 'image/jpeg', sizeBytes: f.size }) }; });
  await ir('#/almProdutos', '#prFoto'); await page.click('[data-aba="lanc"]'); await page.waitForSelector('#prLm');
  /* tocar no cartão do saldo inicial do NSK abre a edição completa */
  const kNsk = await page.evaluate(() => [...document.querySelectorAll('#prLm .apr-lc')].findIndex((x) => /Saldo inicial/.test(x.innerText) && /4 un Rolamento 6205 2RS · NSK/.test(x.innerText)));
  ok(kNsk >= 0, 'o lançamento do NSK aparece com a marca na lista');
  await page.locator('#prLm .apr-lc').nth(kNsk).locator('[data-abre]').click(); await page.waitForSelector('#eQ0'); await pronto();
  ok(await page.locator('.apr-ed-pr[open]').count() === 1 && await page.locator('[data-ef="0"]').count() === 1 && await page.locator('#eP0').count() === 1, 'tocar no cartão abre a edição: quantidade, valor, foto e dados do produto');
  await foto('02-editar');
  await page.fill('#eQ0', '3'); await page.fill('#eP0', '30'); await page.fill('#eEs0', '25 × 52 × 15 mm'); await page.fill('#eLo0', 'Prateleira B');
  await page.setInputFiles('[data-ef="0"]', { name: 'nova.png', mimeType: 'image/png', buffer: png });
  await salvar();
  await page.waitForFunction((id) => { const i = ALMOX_V52.ITEM(id); const a = DATA.almAjustes.find((x) => x.itemId === id && /Saldo inicial/.test(x.motivo));
    return i && i.foto && i.foto.id === 'blob_teste_1' && i.local === 'Prateleira B' && a && a.qtd === 3 && !document.querySelector('#eQ0'); }, nsk.id, { timeout: 10000 });
  const e1 = await page.evaluate((id) => { const a = DATA.almAjustes.find((x) => x.itemId === id && /Saldo inicial/.test(x.motivo)); const i = ALMOX_V52.ITEM(id); return { q: a.qtd, p: a.precoUnit, esp: i.especificacao, saldo: ALMOX_V52.estI(id).saldo, ref: i.custoRef }; }, nsk.id);
  ok(e1.q === 3 && e1.p === 30 && e1.esp === '25 × 52 × 15 mm' && e1.saldo === 5 && e1.ref === 30, 'quantidade, valor, especificação, local e foto salvos; saldo 6 → 5: ' + JSON.stringify(e1));

  /* zerar tira a quantidade daquele lançamento; o produto continua */
  const aj2 = await page.evaluate((id) => DATA.almAjustes.find((x) => x.itemId === id && /Entrada pelo cadastro/.test(x.motivo)).id, nsk.id);
  await page.evaluate((id) => ALMOX_V52.editarLanc(DATA.almAjustes.find((x) => x.id === id)), aj2); await page.waitForSelector('#eQ0'); await pronto();
  await page.fill('#eQ0', '0'); await salvar();
  await page.waitForSelector('.veu .btn.perigo[data-r="1"]', { timeout: 5000 }); await page.evaluate(() => [...document.querySelectorAll('.veu .btn.perigo[data-r="1"]')].pop().click());
  await page.waitForFunction((id) => !DATA.almAjustes.some((x) => x.id === id), aj2, { timeout: 10000 }); await semEditor();
  ok((await um(ROL, 'NSK')).saldo === 3 && (await itens(ROL)).length === 2, 'zerar tirou os 2 daquele lançamento (saldo 3); o produto continua cadastrado');

  /* o saldo nunca fica negativo */
  await page.evaluate((id) => gravarRegistro('almAjustes', { ...MODS.almAjustes.padrao(), id: 'aj_sai1', itemId: id, tipo: 'saida', qtd: 3, motivo: 'Teste de saída', data: hoje() }, null, true), nsk.id);
  await page.waitForFunction((id) => ALMOX_V52.estI(id).saldo === 0, nsk.id, { timeout: 10000 });
  const ajIni = await page.evaluate((id) => DATA.almAjustes.find((x) => x.itemId === id && /Saldo inicial/.test(x.motivo)).id, nsk.id);
  await page.evaluate((id) => ALMOX_V52.editarLanc(DATA.almAjustes.find((x) => x.id === id)), ajIni); await page.waitForSelector('#eQ0'); await pronto();
  await page.fill('#eQ0', '1'); await salvar(); await page.waitForTimeout(600);
  ok(await page.evaluate((id) => DATA.almAjustes.find((x) => x.id === id).qtd, ajIni) === 3 && await page.locator('#eQ0').count() === 1, 'diminuir a entrada que já saiu é barrado (a janela fica aberta)');
  await page.fill('#eQ0', '0'); await salvar(); await page.waitForTimeout(600);
  ok(await page.evaluate((id) => DATA.almAjustes.some((x) => x.id === id), ajIni) && await page.locator('.veu .btn.perigo[data-r="1"]').count() === 0, 'zerar a entrada que já saiu também é barrado');
  /* trocar a marca para uma que já existe com o mesmo nome é barrado */
  await page.fill('#eQ0', '3'); await page.fill('#eMa0', 'SKF'); await salvar(); await page.waitForTimeout(600);
  ok((await um(ROL, 'NSK')) && (await itens(ROL)).length === 2, 'mudar a marca para SKF (já existe) é barrado');
  await page.locator('.veu [data-r]').last().click(); await semEditor();

  /* a saída por ajuste também se edita */
  await page.evaluate(() => ALMOX_V52.editarLanc(DATA.almAjustes.find((x) => x.id === 'aj_sai1'))); await page.waitForSelector('#eQ0'); await pronto();
  ok(await page.locator('#eP0').count() === 0, 'na saída não aparece valor');
  await page.fill('#eQ0', '2'); await page.fill('#eaM', 'Teste de saída corrigida'); await salvar();
  await page.waitForFunction(() => DATA.almAjustes.find((x) => x.id === 'aj_sai1').qtd === 2, null, { timeout: 10000 }); await semEditor();
  ok((await um(ROL, 'NSK')).saldo === 1, 'saída de 3 corrigida para 2: saldo 1');

  /* excluir o lançamento pela própria janela de edição */
  await page.evaluate(() => ALMOX_V52.editarLanc(DATA.almAjustes.find((x) => x.id === 'aj_sai1'))); await page.waitForSelector('[data-exaj]');
  ok(/Excluir lançamento/.test(await page.innerText('[data-exaj]')), 'a janela de edição tem o botão “Excluir lançamento”');
  await page.evaluate(() => document.querySelector('[data-exaj]').click());
  await page.waitForSelector('.veu .btn.perigo[data-r="1"]', { timeout: 5000 }); await page.evaluate(() => [...document.querySelectorAll('.veu .btn.perigo[data-r="1"]')].pop().click());
  await page.waitForFunction(() => !DATA.almAjustes.some((x) => x.id === 'aj_sai1') && !document.querySelector('[data-exaj]'), null, { timeout: 10000 }).catch(async (e) => {
    console.log('DIAGEX', await page.evaluate(() => ({ existe: DATA.almAjustes.some((x) => x.id === 'aj_sai1'), janela: !!document.querySelector('[data-exaj]'), veus: [...document.querySelectorAll('.veu')].map((v) => v.innerText.slice(0, 80).replace(/\s+/g, ' ')), toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent) }))); throw e; });
  ok((await um(ROL, 'NSK')).saldo === 3, 'confirmou, excluiu e fechou a janela: saldo volta a 3');

  /* embalagens: tinta em galões */
  const TINTA = 'Tinta acrílica branca';
  await page.click('#prFoto'); await page.waitForSelector('#fpF', { state: 'attached' });
  await ler({ nome: TINTA, marca: 'Coral', categoria: 'Peças e manutenção', grupo: 'Tintas', unidade: 'litro', embalagens: 2, tipoEmbalagem: 'galão', conteudoEmbalagem: 18, quantidade: 36, confianca: 'alta' }, 'tem 2 galões');
  await salvar(); await feito(); await page.locator('.veu [data-r]').last().click(); await page.waitForTimeout(300);
  const ajT = await page.evaluate((n) => { const i = DATA.almItens.find((x) => x.nome === n); const a = DATA.almAjustes.find((x) => x.itemId === i.id); return { id: a.id, emb: a.embalagem, q: a.qtd }; }, TINTA);
  ok(ajT.q === 36 && ajT.emb === '2 galões de 18 L', 'tinta cadastrada: 2 galões de 18 L = 36 L');
  await page.evaluate((id) => ALMOX_V52.editarLanc(DATA.almAjustes.find((x) => x.id === id)), ajT.id); await page.waitForSelector('#eN0'); await pronto();
  ok(await page.inputValue('#eN0') === '2' && await page.inputValue('#eT0') === 'galão' && await page.inputValue('#eC0') === '18', 'a edição abre com as embalagens: 2 × galão × 18');
  await page.fill('#eN0', '3');
  const conta3 = await page.evaluate(() => ({ q: [...document.querySelectorAll('#eQ0')].map((x) => x.value), r: [...document.querySelectorAll('#eR0')].map((x) => x.textContent), n: [...document.querySelectorAll('#eN0')].map((x) => x.value), veus: [...document.querySelectorAll('.veu')].map((v) => v.innerText.slice(0, 50).replace(/\s+/g, ' ')) }));
  ok(conta3.q[0] === '54' && /3 × 18 L = 54 L/.test(conta3.r[0]), 'mudar para 3 galões refaz a conta: 54 L' + (conta3.q[0] === '54' ? '' : ' ' + JSON.stringify(conta3)));
  await salvar();
  await page.waitForFunction((id) => DATA.almAjustes.find((x) => x.id === id).qtd === 54, ajT.id, { timeout: 10000 }); await semEditor();
  ok(await page.evaluate((id) => DATA.almAjustes.find((x) => x.id === id).embalagem, ajT.id) === '3 galões de 18 L', 'embalagem gravada: 3 galões de 18 L');

  console.log('5. Ficha do produto, Cozinha e Limpeza');
  await ir('#/almProdutos', '#prFoto'); await page.click('[data-aba="prod"]'); await page.waitForSelector('#prL');
  await page.fill('#prQ', 'NSK'); await page.waitForTimeout(250);
  await page.locator('#prL [data-ver]').first().click(); await page.waitForSelector('.apr-kv');
  ok(/Trocar foto/.test(await page.innerText('.veu')) && await page.locator('.veu [data-edaj]').count() >= 1, 'a ficha tem “Trocar foto” e “Editar” nos lançamentos');
  await page.locator('.veu [data-edaj]').first().click(); await page.waitForSelector('#eQ0'); await pronto();
  ok(await page.locator('#eQ0').count() === 1, 'o “Editar” da ficha abre a edição completa');
  await page.locator('.veu [data-r]').last().click(); await page.waitForTimeout(300);
  for (const [rota, sc, cat, nome] of [['#/almCozinha', 'coz', 'Cozinha', 'Arroz tipo 1 5 kg'], ['#/almLimpeza', 'lim', 'Limpeza', 'Detergente neutro 500 ml']]) {
    await page.evaluate(({ id, cat, nome }) => gravarRegistro('almItens', { ...MODS.almItens.padrao(), id, nome, categoria: cat, unidade: 'unidade' }, null, true), { id: 'it_' + sc, cat, nome });
    await page.waitForFunction((id) => !!ALMOX_V52.ITEM(id), 'it_' + sc);
    await page.evaluate((id) => gravarRegistro('almAjustes', { ...MODS.almAjustes.padrao(), id: 'aj_' + id, itemId: id, tipo: 'entrada', qtd: 5, motivo: 'Saldo inicial', data: hoje() }, null, true), 'it_' + sc);
    await ir(rota, '#prFoto'); await page.click('[data-aba="lanc"]'); await page.waitForSelector('#prLm .apr-lc [data-abre]');
    await page.locator('#prLm .apr-lc [data-abre]').first().click(); await page.waitForSelector('#eQ0'); await pronto();
    await page.fill('#eQ0', '4'); await page.fill('#eMa0', 'Marca Teste'); await salvar();
    await page.waitForFunction((id) => ALMOX_V52.estI(id).saldo === 4 && ALMOX_V52.ITEM(id).marca === 'Marca Teste', 'it_' + sc, { timeout: 10000 }).catch(async (e) => {
      console.log('DIAGCZ', await page.evaluate((id) => ({ saldo: ALMOX_V52.estI(id).saldo, marca: ALMOX_V52.ITEM(id).marca, eds: [...document.querySelectorAll('.veu')].map((v) => v.innerText.slice(0, 60).replace(/\s+/g, ' ')), toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent), aj: DATA.almAjustes.filter((x) => x.itemId === id).map((x) => x.qtd + ':' + x.motivo) }), 'it_' + sc)); throw e; });
    await semEditor();
    ok(true, cat + ': tocar no lançamento abre a edição completa; quantidade e marca salvas');
  }
  await foto('03-limpeza');

  console.log('6. Editar e Excluir no cartão do produto (V174)');
  await ir('#/almProdutos', '#prFoto'); await page.click('[data-aba="prod"]'); await page.waitForSelector('#prL');
  const cartao = (nome) => page.locator('#prL .apr-card', { hasText: nome });
  const busca = async (q) => { await page.fill('#prQ', q); await page.waitForTimeout(250); };
  await busca('');
  ok(await page.locator('#prL .apr-card [data-edp]').count() >= 3 && await page.locator('#prL .apr-card [data-exp]').count() >= 3, 'todo cartão tem Editar e Excluir ao lado de Saída e Entrada');
  await foto('05-cartao-editar-excluir');
  /* um lançamento só: Editar abre direto a edição completa */
  await busca('Luva'); await cartao(LUVA).locator('[data-edp]').click(); await page.waitForSelector('#eQ0'); await pronto();
  ok(await page.inputValue('#eQ0') === '6' && await page.locator('.apr-ed-pr').count() === 1, 'Luva (um lançamento): Editar abre direto a edição completa');
  await page.locator('.veu [data-r]').last().click(); await semEditor();
  /* um lançamento só: Excluir tira o lançamento e o produto */
  await cartao(LUVA).locator('[data-exp]').click(); await page.waitForSelector('.veu .btn.perigo[data-r="1"]');
  ok(/e o produto .*saem do estoque/.test(await page.innerText('.veu .modal')), 'a confirmação diz que o lançamento e o produto saem do estoque');
  await page.evaluate(() => [...document.querySelectorAll('.veu .btn.perigo[data-r="1"]')].pop().click());
  await page.waitForFunction(() => !ALMOX_V52.ITEM('it_luva') && !DATA.almAjustes.some((a) => a.itemId === 'it_luva'), null, { timeout: 10000 });
  await busca('Luva'); ok(await cartao(LUVA).count() === 0, 'a luva saiu do estoque (lançamento e produto)');
  /* mais de um lançamento: Editar e Excluir mostram a lista para escolher */
  await busca('SKF'); await cartao(ROL).locator('[data-edp]').click(); await page.waitForSelector('.apr-ll');
  ok(await page.locator('.apr-ll .apr-ll-i').count() === 2, 'SKF (dois lançamentos): Editar mostra a lista para escolher');
  await page.locator('.apr-ll [data-lle]').first().click(); await page.waitForSelector('#eQ0'); await pronto();
  ok(await page.locator('#eQ0').count() === 1, 'escolher na lista abre a edição completa');
  await page.locator('.veu [data-r]').last().click(); await semEditor();
  await cartao(ROL).locator('[data-exp]').click(); await page.waitForSelector('.apr-ll');
  const kCinco = await page.evaluate(() => [...document.querySelectorAll('.apr-ll .apr-ll-i')].findIndex((x) => /\+5 un/.test(x.innerText)));
  await page.locator('.apr-ll .apr-ll-i').nth(kCinco).locator('[data-llx]').click(); await page.waitForSelector('.veu .btn.perigo[data-r="1"]');
  ok(/continua cadastrado/.test(await page.evaluate(() => [...document.querySelectorAll('.veu .modal')].pop().innerText)), 'excluir pela lista avisa que o produto continua');
  await page.evaluate(() => [...document.querySelectorAll('.veu .btn.perigo[data-r="1"]')].pop().click());
  await page.waitForFunction((n) => { const i = DATA.almItens.find((x) => x.nome === n && x.marca === 'SKF'); return i && ALMOX_V52.estI(i.id).saldo === 10; }, ROL, { timeout: 10000 });
  ok((await um(ROL, 'SKF')).saldo === 10 && (await itens(ROL)).length === 2, 'excluiu só a entrada de 5: SKF com 10, produto continua');
  await page.waitForFunction(() => !document.querySelector('.apr-ll'), null, { timeout: 5000 });
  ok(true, 'depois de excluir, a lista fecha e volta para os produtos');
  /* produto ligado ao Combustível não é apagado */
  await busca('15W40'); const nO = await page.evaluate(() => DATA.almItens.length);
  await cartao('Óleo 15W40 Teste').first().locator('[data-exp]').click(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => DATA.almItens.length) === nO && /Combustível/.test(await page.innerText('#toasts')), 'produto ligado ao Combustível: Excluir não apaga e avisa');
  await busca('');

  /* celular */
  await page.setViewportSize({ width: 390, height: 820 });
  await ir('#/almProdutos', '#prFoto'); await page.click('[data-aba="prod"]'); await page.waitForSelector('#prL'); await page.waitForTimeout(300);
  await page.evaluate(() => { const c = document.querySelector('#prL .apr-card'); if (c) c.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); }); await page.waitForTimeout(250);
  await foto('06-cartao-celular');
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 392, 'os botões do cartão cabem no celular');
  await page.evaluate((id) => ALMOX_V52.editarLanc(DATA.almAjustes.find((x) => x.id === id)), ajT.id); await page.waitForSelector('#eN0'); await pronto(); await page.waitForTimeout(400);
  await foto('04-editar-celular');
  const larg = await page.evaluate(() => { const m = document.querySelector('.veu .modal'); return m ? m.scrollWidth - m.clientWidth : 99; });
  ok(larg <= 1, 'a edição cabe na tela do celular');
  await page.locator('.veu [data-r]').last().click();

  await page.waitForFunction(() => APP.central.estado().pendentes === 0, null, { timeout: 15000 }).catch(() => {});
  const log = await page.evaluate(() => { let n = 0; window.__srv.estado.docs.forEach((d, k) => { if (k.startsWith('log/')) n += (JSON.stringify(d.dados).match(/"modulo":"almAjustes"/g) || []).length; }); return n; });
  ok(log >= 5, 'as mudanças ficaram no histórico (' + log + ' registros de lançamentos)');
} catch (e) { ok(false, 'erro no roteiro: ' + (e && e.message)); await foto('zz-erro').catch(() => {}); }
const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 4).join(' | ') : ''}`);
await browser.close(); http.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
