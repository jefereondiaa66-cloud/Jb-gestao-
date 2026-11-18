#!/usr/bin/env node
// Teste de ponta a ponta do almoxarifado e do patrimônio (V58) no navegador, com o banco
// central simulado (scripts/lib/servidor-falso.mjs) e só dados de exemplo:
//   - grupo de materiais, cadastro de vários itens de uma vez, item com reposição
//   - custo de referência, consumo médio, ponto de reposição, curva ABC e relatórios
//   - cadastro de bens, termo de responsabilidade e inventário patrimonial completo
// Uso: node scripts/construir.mjs && node scripts/testar-almox-patrimonio.mjs [pasta-das-capturas]
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
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo 2', situacao: 'Ativo', departamento: 'Produção' }],
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
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
const page = await ctx.newPage();
const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.stack || e.message)));
page.on('console', (m) => { if (m.type() === 'error' && !/net::|Failed to load/.test(m.text())) erros.push('console: ' + m.text()); });
await page.addInitScript(({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] }); docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d)); window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
}, { codigo: servidorFalso, docs });
await page.goto(base + '/saida/claude.html');
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
const ir = async (h, sel) => { await page.evaluate((h) => { location.hash = h; }, h); await page.waitForTimeout(500); if (sel) await page.waitForSelector(sel, { timeout: 8000 }); };
const salvar = async () => { await page.evaluate(() => document.querySelector('[data-acao="salvar"]').click()); };
const fechou = () => page.waitForFunction(() => !document.querySelector('#camada .gaveta'), null, { timeout: 10000 });
const foto = (n) => page.screenshot({ path: join(OUT, n + '.png'), fullPage: false });
try {
  // 1. grupos
  await ir('#/almGrupos', '#bNovo');
  await page.click('#bNovo'); await page.waitForSelector('#frm'); await page.waitForTimeout(200);
  await page.fill('[data-k="nome"]', 'Rolamentos'); await page.selectOption('[data-k="categoria"]', 'Peças e manutenção'); await page.fill('[data-k="local"]', 'Prateleira B');
  await foto('01-grupo-novo');
  await salvar(); await fechou();
  ok(true, 'grupo cadastrado pela tela');
  const gid = await page.evaluate(() => DATA.almGrupos[0].id);
  // 2. vários itens
  await ir('#/almItens', '#bNovo');
  ok(await page.locator('text=Cadastre vários de uma vez').count() === 1, 'atalho de cadastro em lote aparece em Itens');
  await page.evaluate((g) => ALMOX_V52.variosItens(g), gid); await page.waitForSelector('#nvT');
  ok(await page.inputValue('#nvC') === 'Peças e manutenção' && await page.inputValue('#nvL') === 'Prateleira B', 'lote já vem com a categoria e o local do grupo');
  await page.fill('#nvT', 'Rolamento 6205 2RS\nRolamento 6206 2RS\n\nrolamento 6205 2rs\nRolamento 6308 ZZ');
  await foto('02-varios-itens');
  await page.click('.veu:has(#nvT) [data-ok]');
  await page.waitForTimeout(400); await foto('02b-confirmar');
  await page.locator('.veu .btn.pri').last().click();
  await page.waitForFunction(() => DATA.almItens.length === 3 && !document.querySelector('#nvT'), null, { timeout: 15000 });
  const its = await page.evaluate(() => DATA.almItens.map(i => [i.codigo, i.nome, i.grupoId, i.local, i.categoria]));
  ok(its.map(i => i[0]).sort().join() === 'PEC-001,PEC-002,PEC-003', 'códigos em sequência: ' + its.map(i => i[0]).join());
  ok(its.every(i => i[2] === gid && i[3] === 'Prateleira B'), 'itens dentro do grupo, com o local do grupo');
  // repetir o lote não duplica
  await page.evaluate((g) => ALMOX_V52.variosItens(g), gid); await page.waitForSelector('#nvT');
  await page.fill('#nvT', 'Rolamento 6205 2RS'); await page.click('.veu:has(#nvT) [data-ok]'); await page.waitForTimeout(500);
  ok(await page.evaluate(() => DATA.almItens.length) === 3, 'lote repetido não duplica item');
  await page.click('.veu:has(#nvT) [data-r]'); await page.waitForTimeout(200);
  // 3. item: novo dentro do grupo, campos novos
  await ir('#/almGrupos/' + gid, '#frm'); await page.waitForTimeout(300); await foto('03-grupo-com-itens');
  ok(await page.locator('#frm tr[data-go]').count() === 3, 'grupo mostra os 3 itens');
  await page.evaluate((g) => ALMOX_V52.novoItemGrupo(g), gid); await page.waitForSelector('#frm [data-k="nome"]'); await page.waitForTimeout(200);
  ok(await page.inputValue('[data-k="categoria"]') === 'Peças e manutenção' && await page.inputValue('[data-k="grupoId"]') === gid, 'novo item já vem no grupo e na categoria');
  await page.fill('[data-k="nome"]', 'Rolamento 6310 C3'); await page.fill('[data-k="marca"]', 'SKF'); await page.fill('[data-k="refFab"]', '7316577030276');
  await page.fill('[data-k="minimo"]', '2'); await page.fill('[data-k="maximo"]', '1'); await page.fill('[data-k="prazoRep"]', '7'); await page.fill('[data-k="custoRef"]', '85,50');
  await salvar(); await page.waitForTimeout(400);
  ok(await page.locator('[data-campo="maximo"].erro').count() === 1, 'máximo menor que o mínimo é recusado');
  await page.fill('[data-k="maximo"]', '10'); await foto('04-item-novo');
  await salvar(); await fechou();
  const novo = await page.evaluate(() => { const i = DATA.almItens.find(x => x.nome === 'Rolamento 6310 C3'); return { ...i, e: ALMOX_V52.estI(i.id), p: ALMOX_V52.repI(i) }; });
  ok(novo.codigo === 'PEC-004' && novo.custoRef === 85.5 && novo.maximo === 10, 'item salvo com código ' + novo.codigo + ', custo de referência e máximo');
  ok(novo.p.ponto === 2 && novo.p.comprar === 10, `sem saldo: ponto ${novo.p.ponto}, comprar ${novo.p.comprar}`);
  // saldo inicial por ajuste usa o custo de referência
  await page.evaluate(async (id) => { await gravar('almAjustes', { id: 'aj1', itemId: id, data: hoje(), tipo: 'entrada', qtd: 4, motivo: 'Saldo inicial', criadoEm: new Date().toISOString() }, null); }, novo.id);
  await page.waitForFunction((id) => ALMOX_V52.estI(id).saldo === 4, novo.id, { timeout: 8000 });
  const e2 = await page.evaluate((id) => ALMOX_V52.estI(id), novo.id);
  ok(e2.cm === 85.5 && e2.valor === 342, `saldo inicial sem nota vale pelo custo de referência (valor ${e2.valor})`);
  // consumo: requisição de 3 → consumo médio e ponto
  await page.evaluate(async (id) => { await gravar('almSaidas', { id: 's1', numero: 1, data: hoje(), setor: 'Maromba', itens: [{ itemId: id, qtd: 3 }], criadoEm: new Date().toISOString() }, null); }, novo.id);
  await page.waitForFunction((id) => ALMOX_V52.estI(id).saldo === 1, novo.id, { timeout: 8000 });
  const p2 = await page.evaluate((id) => ALMOX_V52.repI(DATA.almItens.find(x => x.id === id)), novo.id);
  ok(p2.mes === 1 && Math.abs(p2.ponto - 2.233) < 0.001 && p2.comprar === 9 && p2.abc === 'A', `consumo ${p2.mes}/mês, ponto ${p2.ponto}, comprar ${p2.comprar}, curva ${p2.abc}`);
  await ir('#/almEstoque', '#aeG'); await page.waitForTimeout(300); await foto('05-estoque');
  await page.selectOption('#aeS', 'Repor agora'); await page.waitForTimeout(400);
  ok(await page.locator('tr[data-go^="#/almItens/"]').count() === 1, 'filtro "Repor agora" mostra 1 item');
  await page.selectOption('#aeS', '');
  await ir('#/almRel', '#arId');
  for (const r of ['repor', 'abc', 'grupo']) { await page.selectOption('#arId', r); await page.waitForTimeout(300); ok(await page.locator('#svCorpo tbody tr').count() >= 1, 'relatório ' + r + ' com linhas'); }
  await foto('06-relatorio-grupo');
  await ir('#/almItens/' + novo.id, '#frm'); await page.waitForTimeout(300); await foto('07-item-estoque');
  await page.click('.gav-cab [data-fechar]'); await fechou();
  // 4. patrimônio
  await ir('#/patBens', '#bNovo'); await foto('08-patrimonio-vazio');
  await page.click('#bNovo'); await page.waitForSelector('#frm [data-k="nome"]'); await page.waitForTimeout(200);
  await page.selectOption('[data-k="tipo"]', 'Máquinas e equipamentos');
  ok(await page.inputValue('[data-k="vidaAnos"]') === '10', 'vida útil sugerida pelo tipo');
  await page.fill('[data-k="nome"]', 'Maromba a vácuo'); await page.fill('[data-k="marca"]', 'Bonfanti'); await page.fill('[data-k="setor"]', 'Maromba');
  await page.selectOption('[data-k="funcId"]', 'f1'); await page.fill('[data-k="aquisicao"]', '2021-11-10'); await page.fill('[data-k="valor"]', '120.000,00');
  await page.waitForTimeout(400); await foto('09-bem-novo');
  ok(/60\.000,00/.test(await page.inputValue('[data-campo="_vh"] input')), 'valor estimado hoje: ' + await page.inputValue('[data-campo="_vh"] input'));
  await salvar(); await fechou();
  await page.evaluate(async () => { for (const [n, t, s, f] of [['Caminhão basculante', 'Veículos e caminhões', 'Entrega / Frota', 'f2'], ['Computador do escritório', 'Informática e eletrônicos', 'Escritório', ''], ['Empilhadeira', 'Máquinas e equipamentos', 'Carregamento / Pátio', 'f1']]) { const st = { ...MODS.patBens.padrao(), id: novoId(), nome: n, tipo: t, setor: s, funcId: f }; const r = conferirRegistro('patBens', st); if (Object.keys(r.erros).length) throw new Error(JSON.stringify(r.erros)); await gravarRegistro('patBens', st, null, true); } });
  await page.waitForFunction(() => DATA.patBens.length === 4, null, { timeout: 8000 });
  const nums = await page.evaluate(() => DATA.patBens.map(b => b.numero).sort().join());
  ok(nums === 'PAT-0001,PAT-0002,PAT-0003,PAT-0004', 'plaquetas em sequência: ' + nums);
  await ir('#/patBens', '#bNovo'); await page.waitForTimeout(300); await foto('10-patrimonio-lista');
  // número repetido
  const dup = await page.evaluate(() => conferirRegistro('patBens', { ...MODS.patBens.padrao(), id: 'x', nome: 'Outro', tipo: 'Outros', setor: 'Fornos', numero: 'pat-0001' }).erros);
  ok(!!dup.numero, 'número de patrimônio repetido é recusado');
  // termo
  const b1 = await page.evaluate(() => DATA.patBens.find(b => b.nome === 'Maromba a vácuo').id);
  await page.evaluate((id) => ALMOX_V52.termoBem(id), b1); await page.waitForTimeout(400); await foto('11-termo');
  const txt = await page.evaluate(() => document.body.innerText);
  ok(/TERMO DE RESPONSABILIDADE/i.test(txt) && /Empilhadeira/.test(txt) && !/Caminhão basculante/.test(txt), 'termo lista só os bens da pessoa');
  // 5. inventário patrimonial
  await ir('#/patInvs', '#piNovo'); await page.click('#piNovo'); await page.waitForSelector('#piD'); await page.locator('.veu .btn.pri').last().click();
  await page.waitForFunction(() => /#\/patInv\//.test(location.hash), null, { timeout: 8000 }); await page.waitForSelector('tr[data-bem]');
  ok(await page.locator('tr[data-bem]').count() === 4, 'inventário lista os 4 bens');
  const ids = await page.evaluate(() => Object.fromEntries(DATA.patBens.map(b => [b.nome, b.id])));
  const linha = (n) => page.locator(`tr[data-bem="${ids[n]}"]`);
  await linha('Maromba a vácuo').locator('[data-pk="r"]').selectOption('ok'); await linha('Maromba a vácuo').locator('[data-pk="estado"]').selectOption('Regular');
  await linha('Empilhadeira').locator('[data-pk="r"]').selectOption('outro');
  await linha('Computador do escritório').locator('[data-pk="r"]').selectOption('nao'); await linha('Computador do escritório').locator('[data-pk="obs"]').fill('Não está na sala');
  await page.click('#piFechar'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => DATA.patInvs[0].status) === 'aberto', 'não fecha sem dizer o setor onde o bem foi encontrado');
  await linha('Empilhadeira').locator('[data-pk="setor"]').fill('Fornos');
  await page.click('#piSalvar'); await page.waitForFunction(() => Object.keys(DATA.patInvs[0].conf || {}).length === 3, null, { timeout: 8000 });
  await page.waitForTimeout(300); await foto('12-inventario-aberto');
  ok(await linha('Empilhadeira').locator('[data-pk="setor"]').inputValue() === 'Fornos', 'conferência salva continua na tela');
  await page.click('#piFechar'); await page.waitForTimeout(400); await foto('13-confirmar-fechamento');
  const conf = await page.evaluate(() => document.querySelector('.veu:last-child').innerText);
  ok(/1 bem\(ns\) ficaram sem conferir/.test(conf), 'confirmação avisa do bem sem conferir');
  await page.locator('.veu .btn.pri').last().click();
  await page.waitForFunction(() => DATA.patInvs[0].status === 'fechado', null, { timeout: 15000 });
  const fim = await page.evaluate(() => ({ inv: DATA.patInvs[0], bens: Object.fromEntries(DATA.patBens.map(b => [b.nome, { setor: b.setor, estado: b.estado, ultConf: b.ultConf || '', nl: b.naoLocalizado || '' }])) }));
  ok(fim.inv.resultado.conferidos === 3 && fim.inv.resultado.nao === 1 && fim.inv.resultado.outro === 1 && fim.inv.resultado.estado === 1 && !fim.inv.aplicando, 'resultado: ' + JSON.stringify({ ...fim.inv.resultado, linhas: undefined }));
  ok(fim.bens['Maromba a vácuo'].estado === 'Regular' && fim.bens['Empilhadeira'].setor === 'Fornos' && !!fim.bens['Computador do escritório'].nl && fim.bens['Caminhão basculante'].ultConf === '', 'bens atualizados: ' + JSON.stringify(fim.bens));
  await page.waitForTimeout(400); await foto('14-inventario-fechado');
  ok(await page.locator('tr[data-bem]').count() === 0 && await page.locator('#piFechar').count() === 0, 'inventário fechado fica travado');
  await ir('#/patBens/' + ids['Computador do escritório'], '#frm'); await page.waitForTimeout(300); await foto('15-bem-nao-localizado');
  ok(/Não localizado/.test(await page.locator('#frm').innerText()), 'bem mostra o aviso de não localizado');
  await page.click('.gav-cab [data-fechar]'); await fechou();
  const bloq = await page.evaluate((id) => preExcluirV51('patBens', DATA.patBens.find(b => b.id === id)), ids['Empilhadeira']);
  ok(!!(bloq && bloq.bloq), 'bem que passou por inventário não é excluído (só baixado)');
  ok(!!(await page.evaluate((g) => preExcluirV51('almGrupos', DATA.almGrupos.find(x => x.id === g)), gid)).bloq, 'grupo com itens não é excluído');
  // inventário do almoxarifado continua funcionando + folha
  await ir('#/setor-almox', '.almp-hero'); await page.waitForTimeout(300); await foto('16-inicio');
  ok(/não localizado/.test(await page.locator('#svCorpo').innerText()), 'início avisa do bem não localizado');
  await ir('#/almInventarios', '#ivNovo'); await page.click('#ivNovo'); await page.waitForSelector('#ivD'); await page.locator('.veu .btn.pri').last().click();
  await page.waitForSelector('#ivFolha'); await page.click('#ivFolha'); await page.waitForTimeout(300); await foto('17-folha-contagem'); await page.keyboard.press('Escape');
  await page.locator('[data-ivq]').first().fill('5'); await page.click('#ivFechar'); await page.waitForTimeout(400);
  ok(/3 item\(ns\) ficaram sem contagem/.test(await page.evaluate(() => document.querySelector('.veu:last-child').innerText)), 'inventário do almoxarifado avisa dos itens sem contagem');
  // tudo chegou ao banco
  await page.waitForFunction(() => APP.central.estado().pendentes === 0, null, { timeout: 15000 }).catch(() => {});
  const banco = await page.evaluate(() => { const t = {}; window.__srv.estado.docs.forEach((d, k) => { if (k.startsWith('alm/')) { const s = JSON.stringify(d.dados); for (const j of ['grupo', 'bem', 'invpat', 'item']) t[j] = (t[j] || 0) + (s.split('"jbt":"' + j + '"').length - 1); } }); return t; });
  ok(banco.grupo === 1 && banco.bem === 4 && banco.invpat === 1 && banco.item === 4, 'banco central recebeu tudo: ' + JSON.stringify(banco));
} catch (e) { ok(false, 'erro no roteiro: ' + (e && e.message)); await foto('zz-erro').catch(() => {}); }
const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 4).join(' | ') : ''}`);
await browser.close(); http.close();
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.'); process.exit(falhas ? 1 : 0);
