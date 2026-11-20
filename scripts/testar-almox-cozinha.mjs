#!/usr/bin/env node
// Teste de ponta a ponta da V146 (20/11/2026, pedido do Jeferson) no navegador, com o banco central simulado
// (scripts/lib/servidor-falso.mjs), um leitor de fotos falso e só dados de exemplo:
//   - Cozinha separada: botão próprio, estoque próprio, valor separado do almoxarifado
//   - cadastro sem código de barras; foto obrigatória no almoxarifado (opcional na cozinha); EPI e cozinha classificados
//   - lançar sem valor (entrada sem compra e compra) + filtro "Sem valor" + "Pôr valor" (completa as saídas sem valor)
//   - toda saída com a pessoa ou o setor; saída de EPI vira entrega de EPI
//   - grupos clicáveis, movimentações revisadas, requisição semanal (ver, A4 e cupom), inventário fora do almoxarifado
// Uso: node scripts/construir.mjs && node scripts/testar-almox-cozinha.mjs [pasta-das-capturas]
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
  ['funcionarios', 'f2', { id: 'f2', nome: 'Cozinheira Exemplo', situacao: 'Ativo', departamento: 'Cozinha', setor: 'Cozinha' }],
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
const foto = (n) => page.screenshot({ path: join(OUT, 'cozinha-' + n + '.png'), fullPage: false });
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
const confirmarDlg = async () => { await page.waitForSelector('.veu .btn.perigo, .veu .btn.pri', { timeout: 5000 }); await page.locator('.veu .btn.perigo, .veu .btn.pri').last().click(); };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DwnwEIGBgYGBgYGAAB/wH/1dEu9QAAAABJRU5ErkJggg==', 'base64');
const marcar = async (busca, qtd) => { await page.fill('#lpQ', busca); await page.waitForTimeout(150);
  const cb = page.locator('#lpL [data-pk]:not(:checked)').first(); const id = await cb.getAttribute('data-pk'); await cb.click();
  await page.waitForSelector(`[data-pq="${id}"]`); await page.fill(`[data-pq="${id}"]`, String(qtd)); return id; };
try {
  // 0. dados de exemplo
  await page.evaluate(async () => {
    const mk = (o) => gravarRegistro('almItens', { ...MODS.almItens.padrao(), id: novoId(), ...o }, null, true);
    const g = await gravarRegistro('almGrupos', { ...MODS.almGrupos.padrao(), id: novoId(), nome: 'Rolamentos', categoria: 'Peças e manutenção' }, null, true);
    await mk({ nome: 'Rolamento 6205 2RS', categoria: 'Peças e manutenção', unidade: 'unidade', grupoId: g.id });
    await mk({ nome: 'Luva de raspa cano longo', categoria: 'EPI', unidade: 'par' });
    await mk({ nome: 'Detergente neutro 500 ml', categoria: 'Limpeza', unidade: 'unidade' });
    await mk({ nome: 'Arroz tipo 1 5 kg', categoria: 'Cozinha', tipoCoz: 'Mercearia', unidade: 'pacote' });
    await mk({ nome: 'Feijão carioca 1 kg', categoria: 'Cozinha', tipoCoz: 'Mercearia', unidade: 'pacote' });
    await gravar('almFornecedores', { id: 'fx1', nome: 'Mercadinho Exemplo', ativo: true, criadoEm: new Date().toISOString() }, null);
  });
  await page.waitForFunction(() => DATA.almItens.length === 5 && DATA.almFornecedores.length === 1, null, { timeout: 10000 });

  // 1. início: botão da Cozinha, valor separado, nada de inventário no almoxarifado
  await ir('#/setor-almox', '.almp-hero');
  ok(await page.locator('#svCorpo .acoes a[href="#/almCozinha"]').count() === 1 && await page.locator('#svCorpo .acoes a[href="#/almProdutos"]').count() === 1, 'início tem o botão Cozinha ao lado do Estoque / Produtos');
  let tx = await textoTela();
  ok(/Estoque do almoxarifado/.test(tx) && /Estoque da cozinha/.test(tx), 'início mostra o valor do almoxarifado e o da cozinha separados');
  ok(await page.locator('#svCorpo a[href="#/almCozinha"]').count() >= 2, 'a Cozinha também está nos módulos do setor');
  ok(await page.locator('#svCorpo a[href="#/almInventarios"], #svCorpo a[href^="#/almInv/"]').count() === 0, 'o módulo Inventários saiu do almoxarifado');
  await foto('01-inicio');

  // 2. cada estoque com os seus produtos
  await ir('#/almProdutos', '#prL'); tx = await page.innerText('#prL');
  ok(/Rolamento/.test(tx) && !/Arroz|Feijão/.test(tx), 'Estoque / Produtos não mostra a cozinha');
  await ir('#/almCozinha', '#prL'); tx = await page.innerText('#prL');
  ok(/Arroz/.test(tx) && /Feijão/.test(tx) && !/Rolamento|Luva/.test(tx), 'a Cozinha mostra só os produtos da cozinha');

  // 3. entrada sem compra: com preço e sem preço (fica sem valor)
  await ir('#/almProdutos', '#prEnt'); await page.click('#prEnt'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250);
  ok(/Sem o preço\?/.test(await page.innerText('.veu')), 'a entrada avisa que dá para lançar sem o preço');
  const idRol = await marcar('rolamento', 10); await page.fill(`[data-pp="${idRol}"]`, '25');
  await marcar('luva', 20); await marcar('detergente', 6);
  await page.locator('[data-chip="lpMot"]', { hasText: 'Saldo inicial' }).click();
  await okModal(); await page.waitForFunction(() => DATA.almAjustes.length === 3, null, { timeout: 10000 }); await fecharComprovante();
  ok((await it('Luva de raspa cano longo')).sv && (await it('Detergente neutro 500 ml')).sv && !(await it('Rolamento 6205 2RS')).sv, 'sem preço o produto fica "sem valor"; com preço, não');
  await ir('#/almProdutos', '[data-sv]');
  ok(/2\s*Sem valor/i.test(await page.innerText('[data-sv]')), 'o quadro "Sem valor" conta 2 produtos');
  await page.click('[data-sv]'); await page.waitForTimeout(300);
  ok(await page.locator('#prL .apr-card').count() === 2 && await page.locator('#prL [data-pv]').count() === 2, 'tocar em "Sem valor" lista os 2, cada um com "Pôr valor"');
  await foto('02-sem-valor');
  await page.click('[data-xs]'); await page.waitForTimeout(300);

  // 4. toda saída: pessoa ou setor
  await page.click('#prSai'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250);
  await marcar('detergente', 2); await page.fill('#lpSet', ''); await page.fill('#lpQuem', '');
  await okModal(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => DATA.almSaidas.length) === 0, 'saída sem a pessoa e sem o setor não é aceita');
  await page.fill('#lpSet', 'Limpeza'); await okModal();
  await page.waitForFunction(() => DATA.almSaidas.length === 1, null, { timeout: 10000 }); await fecharComprovante();
  ok(await page.evaluate(() => DATA.almSaidas[0].setor === 'Limpeza' && DATA.almSaidas[0].itens[0].custoUnit === 0), 'saída só com o setor; o detergente saiu sem valor');
  await page.click('#prSai'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250); await marcar('rolamento', 1);
  await page.fill('#lpSet', ''); await page.fill('#lpQuem', 'Funcionário Exemplo 1'); await page.dispatchEvent('#lpQuem', 'change'); await page.fill('#lpSet', '');
  await okModal(); await page.waitForFunction(() => DATA.almSaidas.length === 2, null, { timeout: 10000 }); await fecharComprovante();
  ok(await page.evaluate(() => { const s = DATA.almSaidas.find((x) => x.solicitante === 'Funcionário Exemplo 1'); return !!s && s.setor === 'Produção'; }), 'saída só com a pessoa: o setor vem do cadastro do funcionário');

  // 5. saída de EPI vai para a Entrega de EPI
  await page.click('#prSai'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250); await marcar('luva', 2);
  ok(await page.locator('#lpEpi:not([hidden])').count() === 1, 'marcar um EPI mostra que ele vai para a Entrega de EPI');
  await page.fill('#lpQuem', 'Fulano de Fora'); await page.fill('#lpSet', 'Produção'); await okModal(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => DATA.almEpis.length) === 0, 'EPI sem funcionário da lista não é aceito');
  await page.fill('#lpQuem', 'Funcionário Exemplo 1'); await foto('03-saida-epi'); await okModal();
  await page.waitForFunction(() => DATA.almEpis.length === 1, null, { timeout: 10000 }); await fecharComprovante();
  ok(await page.evaluate(() => DATA.almEpis[0].funcId === 'f1' && DATA.almEpis[0].qtd === 2 && DATA.almSaidas.length === 2), 'a saída da luva virou entrega de EPI para o funcionário (sem requisição)');
  await esperaSaldo('Luva de raspa cano longo', 18);
  ok((await it('Luva de raspa cano longo')).saldo === 18, 'o saldo da luva baixou: 20 − 2 = 18');

  // 6. pôr o valor depois: vira custo do produto e completa a saída que saiu sem valor
  await ir('#/almProdutos', '#prL'); await page.locator('[data-pv]').first().waitFor();
  const alvo = await page.evaluate(() => { const b = [...document.querySelectorAll('[data-pv]')].find((x) => /Detergente/.test(x.closest('.apr-card').innerText)); return b ? b.dataset.pv : ''; });
  await page.click(`[data-pv="${alvo}"]`); await page.waitForSelector('[data-vl]'); await page.waitForTimeout(250); await page.fill('[data-vl]', '5,00'); await foto('04-por-valor'); await okModal();
  await page.waitForFunction(() => DATA.almSaidas.some((s) => s.setor === 'Limpeza' && s.itens[0].custoUnit === 5), null, { timeout: 10000 });
  const det = await it('Detergente neutro 500 ml');
  ok(!det.sv && det.cm === 5 && await page.evaluate(() => DATA.almSaidas.find((s) => s.setor === 'Limpeza').itens[0].custoTotal === 10), 'valor posto: o detergente vale R$ 5,00 e a saída sem valor ficou R$ 10,00');

  // 7. cadastro por foto: sem código de barras, foto obrigatória no almoxarifado, EPI e cozinha pela leitura
  await ir('#/almProdutos', '#prFoto'); await page.click('#prFoto'); await page.waitForSelector('#fpNome'); await page.waitForTimeout(250);
  ok(await page.locator('#fpRef').count() === 0 && !/código de barras/i.test(await page.innerText('.veu')), 'o cadastro não tem mais o campo de código de barras');
  await page.evaluate(() => { window.__resposta = { nome: 'Luva nitrílica verde', categoria: 'Produtos em geral', grupo: 'Luvas', unidade: 'par', quantidade: 5, confianca: 'alta' }; });
  await page.fill('#fpT', 'luva nitrílica, tem 5'); await page.click('#fpLer');
  await page.waitForFunction(() => document.querySelector('#fpNome').value === 'Luva nitrílica verde', null, { timeout: 8000 });
  ok(await page.inputValue('#fpCat') === 'EPI', 'a leitura classificou a luva como EPI sozinha (a IA tinha dito "Produtos em geral")');
  await okModal(); await page.waitForTimeout(600);
  ok(!(await it('Luva nitrílica verde')), 'material do almoxarifado sem foto não é cadastrado');
  await page.setInputFiles('#fpF', { name: 'luva.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(900);
  await okModal(); await page.waitForFunction(() => /Luva nitrílica/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 });
  await esperaSaldo('Luva nitrílica verde', 5);
  const lv = await it('Luva nitrílica verde'); if (!(lv && lv.categoria === 'EPI' && lv.saldo === 5)) console.log('   ', JSON.stringify(lv));
  ok(lv.categoria === 'EPI' && lv.saldo === 5 && !lv.refFab, 'com a foto: cadastrada como EPI, com 5 em estoque e sem código de barras');
  await page.evaluate(() => { window.__resposta = { nome: 'Óleo de soja 900 ml', categoria: 'Cozinha', unidade: 'unidade', quantidade: 6, confianca: 'alta' }; });
  await page.fill('#fpT', 'óleo de soja, tem 6'); await page.setInputFiles('#fpF', { name: 'oleo.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('#fpNome').value === 'Óleo de soja 900 ml', null, { timeout: 8000 });
  await okModal(); await page.waitForFunction(() => /Óleo de soja/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 }); await fecharModal();
  await esperaSaldo('Óleo de soja 900 ml', 6);
  ok((await it('Óleo de soja 900 ml')).categoria === 'Cozinha', 'o que a leitura identifica como cozinha vai para a Cozinha');
  await ir('#/almCozinha', '#prL'); ok(/Óleo de soja/.test(await page.innerText('#prL')), 'o óleo aparece na Cozinha');
  await page.click('#prFoto'); await page.waitForSelector('#fpTipo'); await page.waitForTimeout(250);
  ok(await page.inputValue('#fpCat') === 'Cozinha', 'na Cozinha a categoria já é Cozinha, com o tipo da cozinha');
  await page.fill('#fpNome', 'Café torrado 500 g'); await page.selectOption('#fpTipo', 'Mercearia'); await page.fill('#fpQtd', '3'); await okModal();
  await page.waitForFunction(() => /Café torrado/.test((document.querySelector('#fpFeitos') || {}).textContent || ''), null, { timeout: 10000 }); await fecharModal();
  await esperaSaldo('Café torrado 500 g', 3);
  const cf = await it('Café torrado 500 g'); if (!(cf && cf.categoria === 'Cozinha' && cf.tipoCoz === 'Mercearia' && cf.saldo === 3)) console.log('   ', JSON.stringify(cf && { categoria: cf.categoria, tipoCoz: cf.tipoCoz, saldo: cf.saldo }));
  ok(cf.categoria === 'Cozinha' && cf.tipoCoz === 'Mercearia' && cf.saldo === 3, 'na Cozinha a foto é opcional: café cadastrado sem foto, com o tipo');

  // 8. compra (Nova entrada) sem preço
  await ir('#/almEntrada/nova', '#eForn'); await page.selectOption('#eForn', 'fx1');
  const feijao = await page.evaluate(() => DATA.almItens.find((i) => i.nome === 'Feijão carioca 1 kg').id);
  /* a linha usa a caixa de pesquisa de itens por cima do select: escolhe pelo select escondido */
  await page.evaluate((id) => { const x = document.querySelector('[data-li="0"] [data-ei="itemId"]'); x.value = id; x.dispatchEvent(new Event('change', { bubbles: true })); }, feijao); await page.waitForTimeout(300);
  await page.fill('[data-li="0"] [data-ei="qtd"]', '10'); await page.waitForTimeout(200);
  ok(/sem valor/i.test(await page.innerText('#eResumo')), 'a compra sem preço avisa que o item fica sem valor');
  await foto('05-compra-sem-preco');
  await page.click('#eOk'); await confirmarDlg();
  await page.waitForFunction(() => DATA.almEntradas.length === 1 && /^#\/almEntrada\/(?!nova)/.test(location.hash), null, { timeout: 15000 }); await page.waitForTimeout(300);
  ok(await page.evaluate(() => DATA.almEntradas[0].itens[0].preco === null && DATA.almEntradas[0].total === 0), 'compra gravada com o item sem preço (preço a pôr depois) e total zero');
  await esperaSaldo('Feijão carioca 1 kg', 10);
  const fj = await it('Feijão carioca 1 kg'); ok(fj.saldo === 10 && fj.sv, 'o feijão entrou no estoque (10) e está sem valor');
  await ir('#/almCozinha', '[data-aba="lanc"]'); await page.click('[data-aba="lanc"]'); await page.waitForSelector('#prTm');
  await page.selectOption('#prTm', 'semvalor'); await page.waitForTimeout(300);
  ok(await page.locator('#prLm .apr-lc').count() >= 1 && /Mercadinho Exemplo/.test(await page.innerText('#prLm')) && await page.locator('#prLm [data-a="valor"]').count() >= 1, 'filtro "Sem valor" dos lançamentos mostra a compra com "Pôr valor"');
  await foto('06-lancamentos-sem-valor');
  await page.selectOption('#prTm', ''); await page.click('[data-aba="prod"]');

  // 9. saída da cozinha
  await ir('#/almCozinha', '#prSai'); await page.waitForTimeout(300); await foto('06b-cozinha'); await page.click('#prSai'); await page.waitForSelector('#lpQ'); await page.waitForTimeout(250);
  ok(await page.inputValue('#lpSet') === 'Cozinha', 'a saída da cozinha já vem com o setor Cozinha');
  await marcar('feijão', 2); await page.fill('#lpQuem', 'Cozinheira Exemplo'); await okModal();
  await page.waitForFunction(() => DATA.almSaidas.some((s) => s.setor === 'Cozinha'), null, { timeout: 10000 }); await fecharComprovante();

  // 10. grupos clicáveis
  await ir('#/almProdutos', '[data-aba="grp"]'); await page.click('[data-aba="grp"]'); await page.waitForSelector('.apr-gc');
  ok(await page.locator('.apr-gc', { hasText: 'Rolamentos' }).count() === 1 && await page.locator('.apr-gc', { hasText: 'Luvas' }).count() === 1, 'a aba Grupos mostra os grupos (o grupo Luvas nasceu no cadastro por foto)');
  await foto('07-grupos');
  await page.locator('.apr-gc', { hasText: 'Rolamentos' }).click(); await page.waitForSelector('#prL');
  ok(await page.locator('#prL .apr-card').count() === 1 && /Rolamento/.test(await page.innerText('#prL')) && await page.locator('[data-xg]').count() === 1, 'tocar no grupo mostra tudo daquele grupo');
  await page.click('[data-xg]'); await page.waitForTimeout(200);

  // 11. movimentações
  await ir('#/almMov', '#amT'); tx = await textoTela();
  ok(/Entrada sem compra/.test(tx) && /Entrada \(compra\)/.test(tx) && /Saída \(requisição\)/.test(tx) && /EPI entregue/.test(tx), 'movimentações mostram compra, entrada sem compra, requisição e EPI entregue');
  ok(/para Funcionário Exemplo 1/.test(tx), 'a saída mostra para quem foi');
  await page.selectOption('#amT', '+'); await page.waitForTimeout(300);
  ok(!/Saída \(requisição\)|EPI entregue/.test(await page.innerText('#svCorpo table')), '"Todas as entradas" só mostra entradas');
  await page.selectOption('#amT', ''); await page.click('[data-um="coz"]'); await page.waitForTimeout(300);
  tx = await page.innerText('#svCorpo table'); ok(/Feijão/.test(tx) && !/Rolamento|Luva/.test(tx), 'o botão Cozinha das movimentações mostra só a cozinha');
  await foto('08-movimentacoes'); await page.click('[data-um=""]');

  // 12. saldo em tabela: almoxarifado x cozinha, sem botão de inventário
  await ir('#/almEstoque', '#aeQ'); tx = await textoTela();
  ok(/Valor do almoxarifado/i.test(tx) && /Valor da cozinha/i.test(tx) && await page.locator('#svCorpo a[href="#/almInventarios"]').count() === 0, 'saldo em tabela separa os valores e não leva mais ao inventário');

  // 13. requisição semanal
  await ir('#/almSaidas', '.apr-abas-l'); ok(await page.locator('.apr-abas-l a[href="#/almReqSemana"]').count() === 1, 'requisições: aba para as semanais');
  await ir('#/almReqSemana', '.apr-rs'); ok(await page.locator('.apr-rs').count() >= 1 && /Em andamento/.test(await page.innerText('.apr-rs')), 'a semana atual aparece em andamento');
  await foto('09-req-semanais');
  await page.locator('.apr-rs').first().click(); await page.waitForSelector('.apr-rs-g');
  tx = await textoTela();
  ok(/Cozinha/.test(tx) && /Limpeza/.test(tx) && /Produção/.test(tx) && /Entrega de EPI/.test(tx), 'a requisição da semana separa cozinha, cada setor e EPI');
  ok(/Cozinheira Exemplo/.test(tx) && /Funcionário Exemplo 1/.test(tx), 'cada saída da semana mostra para quem foi');
  await foto('10-req-semanal');
  await page.click('[data-rs="ver"]'); await page.waitForTimeout(700);
  ok(/REQUISIÇÃO SEMANAL/i.test(await page.evaluate(() => document.body.innerText)), 'a requisição semanal abre para visualizar e imprimir (A4)');
  await foto('11-req-semanal-a4');
  await page.evaluate(() => JBNAV.voltar()); await page.waitForSelector('[data-rs="cupom"]'); await page.click('[data-rs="cupom"]'); await page.waitForTimeout(700);
  ok(await page.locator('.cupom').count() >= 1, 'a requisição semanal sai também no cupom');
  await foto('12-req-semanal-cupom');

  // 14. celular
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [h, n] of [['#/almCozinha', '13-cozinha-celular'], ['#/almReqSemana', '14-semanas-celular']]) {
    await ir(h, '#svCorpo'); await page.waitForTimeout(400); await foto(n);
    const larg = await page.evaluate(() => document.documentElement.scrollWidth); ok(larg <= 392, n + ': cabe na tela do celular (largura ' + larg + ')');
  }
  await page.evaluate(() => JBNAV.ir('#/almReqSemana/' + ALM_V146.segDe(hoje()))); await page.waitForSelector('.apr-rs-g'); await page.waitForTimeout(300); await foto('15-semana-celular');
  ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 392, 'detalhe da semana cabe no celular');
  // tudo chegou ao banco
  await page.waitForFunction(() => APP.central.estado().pendentes === 0, null, { timeout: 15000 }).catch(() => {});
  const banco = await page.evaluate(() => { const t = {}; window.__srv.estado.docs.forEach((d, k) => { if (k.startsWith('alm/')) { const s = JSON.stringify(d.dados); for (const j of ['item', 'saida', 'ajuste', 'epi', 'entrada']) t[j] = (t[j] || 0) + (s.split('"jbt":"' + j + '"').length - 1); } }); return t; });
  ok(banco.item === 8 && banco.saida === 3 && banco.epi === 1 && banco.entrada === 1, 'banco central recebeu tudo: ' + JSON.stringify(banco));
} catch (e) { ok(false, 'erro no roteiro: ' + (e && e.message)); await foto('zz-erro').catch(() => {}); }
const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 4).join(' | ') : ''}`);
await browser.close(); http.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
