#!/usr/bin/env node
// Teste de ponta a ponta da V148 (20/11/2026, pedido do Jeferson) no navegador, com o banco central simulado
// (scripts/lib/servidor-falso.mjs), um leitor de fotos falso e só dados de exemplo:
//   - Limpeza separada, igual à Cozinha: botão próprio (início, módulos e menu), estoque próprio, valor separado
//   - Estoque / Produtos fica sem a limpeza (e sem a cozinha); nada muda nos registros (a separação é pela categoria)
//   - cadastro na Limpeza com a categoria já certa e a foto opcional; o que a leitura identifica como limpeza vai para lá
//   - classificação pelo nome (sem pegar "eletrodo" nem "multiuso" de outra coisa)
//   - entrada, saída, ficha, movimentações, saldo em tabela e requisição semanal com a limpeza
// Uso: node scripts/construir.mjs && node scripts/testar-almox-limpeza.mjs [pasta-das-capturas]
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = process.argv[2] || join(RAIZ, 'saida');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const docs = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção' }],
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
  const leitor = { ler: async () => { await new Promise((r) => setTimeout(r, 120)); return { texto: JSON.stringify(window.__resposta || {}) }; } };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'leitor' ? leitor : null) };
  /* guarda os avisos que passaram pela tela (eles somem sozinhos em 3 s) */
  window.__avisos = []; new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.classList && n.classList.contains('toast')) window.__avisos.push(n.textContent); }))).observe(document, { childList: true, subtree: true });
}, { codigo: servidorFalso, docs });
await page.goto(base + '/saida/claude.html');
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
const ir = async (h, sel) => { await page.evaluate((h) => JBNAV.ir(h), h); await page.waitForTimeout(400); if (sel) await page.waitForSelector(sel, { timeout: 8000 }); };
const foto = (n) => page.screenshot({ path: join(OUT, 'limpeza-' + n + '.png'), fullPage: false });
const it = (nome) => page.evaluate((n) => { const i = DATA.almItens.find((x) => x.nome === n); return i ? { ...i, saldo: ALMOX_V52.estI(i.id).saldo, cm: ALMOX_V52.estI(i.id).cm, sv: ALM_V146.semValorI(i) } : null; }, nome);
/* o que foi gravado chega à tela um instante depois da gravação: espera o saldo aparecer */
const esperaSaldo = (nome, q) => page.waitForFunction(([n, q]) => { const i = DATA.almItens.find((x) => x.nome === n); return !!i && ALMOX_V52.estI(i.id).saldo === q; }, [nome, q], { timeout: 10000 }).catch(() => {});
const textoTela = () => page.evaluate(() => (document.querySelector('#svCorpo') || document.body).innerText);
/* o JB ignora um segundo clique no mesmo tipo de botão em menos de 0,7 s (proteção contra clique duplo) */
let ultOk = 0;
const okModal = async () => { const f = 800 - (Date.now() - ultOk); if (f > 0) await page.waitForTimeout(f); await page.locator('.veu [data-ok]').last().click(); ultOk = Date.now(); };
const fecharModal = async () => { const b = page.locator('.veu [data-r]'); if (await b.count()) await b.last().click(); await page.waitForTimeout(200); };
/* depois de lançar, o JB pergunta se quer imprimir o comprovante (abre logo depois de gravar) */
const fecharComprovante = async () => { await page.waitForSelector('.veu [data-fmt="c80"]', { timeout: 4000 }).catch(() => {}); await page.waitForTimeout(150); const b = page.locator('.veu [data-r]'); while (await b.count()) { await b.last().click(); await page.waitForTimeout(250); } };
const marcar = async (busca, qtd) => { await page.fill('#lpQ', busca); await page.waitForTimeout(150);
  const cb = page.locator('#lpL [data-pk]:not(:checked)').first(); const id = await cb.getAttribute('data-pk'); await cb.click();
  await page.waitForSelector(`[data-pq="${id}"]`); await page.fill(`[data-pq="${id}"]`, String(qtd)); return id; };
try {
  // 0. dados de exemplo: um material do almoxarifado, um alimento e três produtos de limpeza
  await page.evaluate(async () => {
    const mk = (o) => gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: novoId(), ...o }, null, true);
    await mk({ nome: 'Rolamento 6205 2RS', categoria: 'Peças e manutenção', unidade: 'unidade' });
    await mk({ nome: 'Arroz tipo 1 5 kg', categoria: 'Cozinha', tipoCoz: 'Mercearia', unidade: 'pacote' });
    await mk({ nome: 'Detergente neutro 500 ml', categoria: 'Limpeza', unidade: 'unidade' });
    await mk({ nome: 'Vassoura de piaçava', categoria: 'Limpeza', unidade: 'unidade' });
    await mk({ nome: 'Esponja de louça', categoria: 'Limpeza', unidade: 'unidade' });
  });
  await page.waitForFunction(() => DATA.almItens.length === 5, null, { timeout: 10000 });

  // 1. início: o terceiro botão e o valor da limpeza separado
  await ir('#/setor-almox', '.almp-hero');
  ok(await page.locator('#svCorpo .acoes a[href="#/almLimpeza"]').count() === 1 && await page.locator('#svCorpo .acoes a[href="#/almCozinha"]').count() === 1 && await page.locator('#svCorpo .acoes a[href="#/almProdutos"]').count() === 1, 'início tem os três botões: Estoque / Produtos, Cozinha e Limpeza');
  let tx = await textoTela();
  ok(/Estoque do almoxarifado/.test(tx) && /Estoque da cozinha/.test(tx) && /Estoque da limpeza/.test(tx), 'início mostra o valor do almoxarifado, o da cozinha e o da limpeza separados');
  ok(await page.locator('#svCorpo a[href="#/almLimpeza"]').count() >= 2, 'a Limpeza também está nos módulos do setor');
  await page.waitForTimeout(400); await foto('01-inicio');

  // 2. cada estoque com os seus produtos
  await ir('#/almProdutos', '#prL'); tx = await page.innerText('#prL');
  ok(/Rolamento/.test(tx) && !/Detergente|Vassoura|Esponja|Arroz/.test(tx), 'Estoque / Produtos não mostra a limpeza nem a cozinha');
  ok(await page.locator('#prG option[value="c:Limpeza"], #prG option[value="c:Cozinha"]').count() === 0 && await page.locator('#prG option[value="c:Ferramentas"]').count() === 1, 'o filtro de categoria do Estoque / Produtos não oferece Limpeza nem Cozinha');
  await ir('#/almCozinha', '#prL'); tx = await page.innerText('#prL');
  ok(/Arroz/.test(tx) && !/Detergente|Vassoura|Rolamento/.test(tx), 'a Cozinha não mostra a limpeza');
  await ir('#/almLimpeza', '#prL'); tx = await page.innerText('#prL');
  ok(/Detergente/.test(tx) && /Vassoura/.test(tx) && /Esponja/.test(tx) && !/Rolamento|Arroz/.test(tx), 'a Limpeza mostra só os produtos de limpeza');
  ok((await page.innerText('#svCorpo .sec-cab h1')).trim() === 'Limpeza', 'a tela chama Limpeza');

  // 3. entrada na limpeza: com preço e sem preço
  await page.click('#prEnt'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250);
  ok(/Lançar entrada na limpeza/.test(await page.innerText('.veu')), 'a entrada da tela é a da limpeza');
  await page.fill('#lpQ', 'rolamento'); await page.waitForTimeout(200);
  ok(await page.locator('#lpL [data-pk]').count() === 0, 'a lista de lançar na limpeza só tem produto de limpeza');
  const idDet = await marcar('detergente', 12); await page.fill(`[data-pp="${idDet}"]`, '3.5');
  await marcar('vassoura', 4);
  await page.locator('[data-chip="lpMot"]', { hasText: 'Saldo inicial' }).click();
  await okModal(); await page.waitForFunction(() => DATA.almAjustes.length === 2, null, { timeout: 10000 }); await fecharComprovante();
  await esperaSaldo('Detergente neutro 500 ml', 12); await esperaSaldo('Vassoura de piaçava', 4);
  await ir('#/almLimpeza', '.apr-res'); tx = await page.innerText('.apr-res');
  ok(/R\$\s*42,00/.test(tx) && /Valor do estoque da limpeza/i.test(tx), 'valor do estoque da limpeza: 12 × R$ 3,50 = R$ 42,00');
  ok(/2\s*Sem valor/i.test(await page.innerText('[data-sv]')), 'a limpeza conta os seus produtos sem valor (vassoura e esponja)');
  await page.waitForTimeout(300); await foto('02-limpeza');

  // 4. cadastro dentro da Limpeza: categoria já certa e foto opcional
  await page.click('#prFoto'); await page.waitForSelector('#fpNome'); await page.waitForTimeout(250);
  ok(/Cadastrar produto de limpeza/.test(await page.innerText('.veu')) && await page.inputValue('#fpCat') === 'Limpeza' && await page.locator('#fpTipo').count() === 0, 'na Limpeza a categoria já é Limpeza (sem o tipo da cozinha)');
  await page.fill('#fpNome', 'Água sanitária 1 L'); await page.fill('#fpQtd', '5'); await foto('03-cadastro'); await okModal();
  await page.waitForFunction(() => /Água sanitária/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 }); await fecharModal();
  await esperaSaldo('Água sanitária 1 L', 5);
  const ag = await it('Água sanitária 1 L');
  ok(ag && ag.categoria === 'Limpeza' && ag.saldo === 5 && /^LIM-/.test(ag.codigo || ''), 'na Limpeza a foto é opcional: água sanitária cadastrada sem foto, com código LIM');

  // 5. cadastro pelo Estoque / Produtos: o que a leitura identifica como limpeza vai para a Limpeza
  await ir('#/almProdutos', '#prFoto'); await page.click('#prFoto'); await page.waitForSelector('#fpNome'); await page.waitForTimeout(250);
  await page.evaluate(() => { window.__resposta = { nome: 'Desinfetante pinho 2 L', categoria: 'Limpeza', grupo: 'Desinfetantes', unidade: 'unidade', quantidade: 3, confianca: 'alta' }; });
  await page.fill('#fpT', 'desinfetante, tem 3'); await page.click('#fpLer');
  await page.waitForFunction(() => document.querySelector('#fpNome').value === 'Desinfetante pinho 2 L', null, { timeout: 8000 });
  ok(await page.inputValue('#fpCat') === 'Limpeza', 'a leitura classificou o desinfetante como Limpeza');
  await okModal(); await page.waitForFunction(() => /Desinfetante pinho/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 }); await fecharModal();
  await esperaSaldo('Desinfetante pinho 2 L', 3);
  ok((await it('Desinfetante pinho 2 L')).categoria === 'Limpeza' && (await page.evaluate(() => window.__avisos.some((t) => /Foi para a Limpeza/.test(t)))), 'salvo sem exigir foto e com o aviso "Foi para a Limpeza"');
  tx = await page.innerText('#prL'); ok(!/Desinfetante/.test(tx), 'o desinfetante não fica no Estoque / Produtos');
  ok(await page.evaluate(() => { const c = ALM_V146.catAuto; return c('Sabão em pó 1 kg', '') === 'Limpeza' && c('Saco de lixo 100 L', '') === 'Limpeza' && c('Papel higiênico 30 m', '') === 'Limpeza' && c('Eletrodo de solda', '') === '' && c('Silicone acético multiuso 250 ml', '') === '' && c('Balde para construção 12 L', '') === '' && c('Arroz tipo 1', '') === 'Cozinha' && c('Luva de raspa', 'Limpeza') === 'EPI'; }), 'classificação pelo nome: sabão, saco de lixo e papel higiênico são limpeza; eletrodo, silicone multiuso e balde de obra não');

  // 6. grupos da limpeza e saída
  await ir('#/almLimpeza', '[data-aba="grp"]'); await page.click('[data-aba="grp"]'); await page.waitForSelector('.apr-gc');
  ok(await page.locator('.apr-gc', { hasText: 'Desinfetantes' }).count() === 1 && await page.locator('.apr-gc', { hasText: 'Sem grupo' }).count() === 1, 'a aba Grupos da limpeza mostra os grupos dela');
  await page.locator('.apr-gc', { hasText: 'Desinfetantes' }).click(); await page.waitForSelector('#prL');
  ok(await page.locator('#prL .apr-card').count() === 1 && /Desinfetante/.test(await page.innerText('#prL')), 'tocar no grupo mostra tudo daquele grupo');
  await page.click('[data-xg]'); await page.waitForTimeout(200);
  await page.click('#prSai'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250);
  ok(/Lançar saída da limpeza/.test(await page.innerText('.veu')), 'a saída da tela é a da limpeza');
  await marcar('detergente', 2); await page.fill('#lpQuem', ''); await page.fill('#lpSet', 'Refeitório'); await foto('04-saida'); await okModal();
  await page.waitForFunction(() => DATA.almSaidas.length === 1, null, { timeout: 10000 }); await fecharComprovante();
  await esperaSaldo('Detergente neutro 500 ml', 10);
  ok(await page.evaluate(() => DATA.almSaidas[0].setor === 'Refeitório' && DATA.almSaidas[0].itens[0].custoUnit === 3.5) && (await it('Detergente neutro 500 ml')).saldo === 10, 'saída de 2 detergentes para o Refeitório: saldo 10, pelo custo de R$ 3,50');

  // 7. ficha, movimentações, saldo em tabela e requisição semanal
  await ir('#/almLimpeza', '#prL'); await page.locator('#prL [data-ver]', { hasText: 'Detergente' }).first().click(); await page.waitForSelector('.apr-kv');
  ok(/Estoque\s*Limpeza/i.test(await page.innerText('.apr-kv')), 'a ficha do produto diz que o estoque é a Limpeza');
  await fecharModal();
  await ir('#/almMov', '[data-mvgr]'); await page.click('[data-mvesc="lim"]');   /* V151: tela nova das movimentações */ await page.waitForTimeout(300);
  tx = await page.innerText('#svCorpo table'); ok(/Detergente/.test(tx) && /Vassoura/.test(tx) && !/Rolamento|Arroz/.test(tx), 'o botão Limpeza das movimentações mostra só a limpeza');
  await page.click('[data-mvesc=""]');
  await ir('#/almEstoque', '#aeQ'); tx = await textoTela();
  ok(/Valor do almoxarifado/i.test(tx) && /Valor da cozinha/i.test(tx) && /Valor da limpeza/i.test(tx), 'saldo em tabela separa os três valores');
  await page.click('[data-ue="lim"]'); await page.waitForTimeout(300);
  tx = await page.innerText('#svCorpo table'); ok(/Detergente/.test(tx) && !/Rolamento|Arroz/.test(tx), 'o botão Limpeza do saldo em tabela mostra só a limpeza');
  await page.click('[data-ue=""]');
  await page.evaluate(() => JBNAV.ir('#/almReqSemana/' + ALM_V146.segDe(hoje()))); await page.waitForSelector('.apr-rs-g');
  tx = await textoTela(); ok(/Refeitório/.test(tx) && /Detergente/.test(tx), 'a requisição da semana traz a saída da limpeza no destino dela');

  // 8. celular
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [h, n] of [['#/almLimpeza', '05-limpeza-celular'], ['#/setor-almox', '06-inicio-celular']]) {
    await ir(h, '#svCorpo'); await page.waitForTimeout(500); await foto(n);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth); ok(larg <= 392, n + ': cabe na tela do celular (largura ' + larg + ')');
  }
  // tudo chegou ao banco, sem mudar a categoria de nenhum produto que já existia
  await page.waitForFunction(() => APP.central.estado().pendentes === 0, null, { timeout: 15000 }).catch(() => {});
  const banco = await page.evaluate(() => { const t = {}; window.__srv.estado.docs.forEach((d, k) => { if (k.startsWith('alm/')) { const s = JSON.stringify(d.dados); for (const j of ['item', 'saida', 'ajuste']) t[j] = (t[j] || 0) + (s.split('"jbt":"' + j + '"').length - 1); } }); return t; });
  ok(banco.item === 7 && banco.saida === 1 && banco.ajuste === 4, 'banco central recebeu tudo: ' + JSON.stringify(banco));
  ok(await page.evaluate(() => DATA.almItens.find((i) => i.nome === 'Rolamento 6205 2RS').categoria === 'Peças e manutenção' && DATA.almItens.find((i) => i.nome === 'Arroz tipo 1 5 kg').categoria === 'Cozinha'), 'os produtos que já existiam continuam com a categoria que tinham');
} catch (e) { ok(false, 'erro no roteiro: ' + (e && e.message)); await foto('zz-erro').catch(() => {}); }
const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 4).join(' | ') : ''}`);
await browser.close(); http.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
