#!/usr/bin/env node
// Teste de ponta a ponta do Setor da Lenha V111 (caminhões, tipos por fornecedor, estoque por local,
// "Levar lenha para a fábrica" e "Lançar lenha"), no programa REAL (saida/claude.html) num Chromium com
// banco central simulado. Nada sai para a internet. Só dados fictícios (ZZ…).
// Uso: node scripts/construir.mjs && node scripts/testar-lenha-locais.mjs
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
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const iniciar = ({ codigo }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'Dono' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const perto = (a, b) => Math.abs(a - b) < 1e-6;

try {
  for (const vp of [{ width: 1280, height: 860, nome: 'computador' }, { width: 390, height: 800, nome: 'celular' }]) {
    console.log(`\n${vp.nome} (${vp.width} px):`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
    const ir = async (h, ms = 700) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(ms); };
    const foto = (n) => page.screenshot({ path: join(RAIZ, `saida/lenha-${vp.nome}-${n}.png`), fullPage: true });
    const aceitar = async () => { await page.waitForSelector('body>.veu .modal [data-r="1"]', { timeout: 5000 }); await page.click('body>.veu .modal [data-r="1"]'); await page.waitForTimeout(900); };
    const toasts = () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent));
    const S = () => page.evaluate(() => { const s = LENHA_V111.saldosLocais(); return { total: s.total, chao: s.chao, fora: (s.L.fora || { q: 0 }).q, cl: (s.L.fora || { cl: {} }).cl, temIni: s.temIni }; });
    const custo = () => page.evaluate(() => JSON.stringify(LENHA_V50.calcLenha().rows.map((r) => [r.m, r.ini, r.val, r.cq, r.cv, r.cm, r.qq, r.custo, r.fim, r.vf])));
    const aPagar = () => page.evaluate(() => round2(DATA.compras.filter((c) => c.setor === 'lenha' && !cancV(c)).reduce((a, c) => a + finVenda(c).saldo, 0)));
    const estoura = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);

    /* ---------- dados fictícios, gravados pelas funções do próprio sistema ---------- */
    await page.evaluate(async () => {
      const agora = new Date().toISOString(); const c = { criadoEm: agora, criadoPor: 'u_DONO', alteradoEm: agora, alteradoPor: 'u_DONO' };
      await gravar('produtos', { id: 'zzp1', setor: 'lenha', nome: 'ZZ Lenha', unidade: 'm³', controlaEstoque: 'Sim', situacao: 'Ativo', ...c }, null);
      await gravar('produtos', { id: 'zzd1', setor: 'combustivel', nome: 'ZZ Diesel', unidade: 'L', tipoComb: 'Diesel', controlaEstoque: 'Sim', situacao: 'Ativo', ...c }, null);
      await gravar('fornecedores', { id: 'zzf1', setor: 'lenha', tipoPessoa: 'Física', nome: 'ZZ Fornecedor Um', situacao: 'Ativo', ...c }, null);
      await gravar('fornecedores', { id: 'zzf2', setor: 'lenha', tipoPessoa: 'Física', nome: 'ZZ Fornecedor Dois', situacao: 'Ativo', ...c }, null);
      await gravar('fornecedores', { id: 'zzfc', setor: 'combustivel', tipoPessoa: 'Jurídica', nome: 'ZZ Posto', situacao: 'Ativo', ...c }, null);
      await gravar('locais', { id: 'zzl1', setor: 'lenha', nome: 'ZZ Forno 1', tipo: 'Forno', situacao: 'Ativo', ...c }, null);
      await gravar('estoqueMov', { id: 'zzm1', setor: 'lenha', tipo: 'Entrada', produtoId: 'zzp1', quantidade: 500, delta: 500, anterior: 0, atual: 500, unidade: 'm³', data: hoje(), hora: '08:00', motivo: 'ZZ estoque inicial', valorEntrada: 25000, ...c }, null);
      /* compra antiga, de antes da versão: sem tipo e sem local */
      await gravar('compras', { id: 'zzc0', tipoOp: 'compra', numero: 1, setor: 'lenha', data: hoje(), hora: '08:30', fornecedorId: 'zzf2', fornecedor: { nome: 'ZZ Fornecedor Dois', doc: '' },
        itens: [{ produtoId: 'zzp1', nome: 'ZZ Lenha', unidade: 'm³', qtd: 20, preco: 50, total: 1000, baixaEstoque: true, anterior: 500, atual: 520 }], subtotal: 1000, desconto: 0, frete: 0, outros: 0, total: 1000,
        forma: 'Dinheiro', condicao: 'A prazo', vencimento: hoje(), pagamentos: [], status: 'Concluída', fiscal: { status: 'Pendente' }, ...c }, null);
    });
    await page.waitForFunction(() => DATA.produtos.some((p) => p.id === 'zzp1') && DATA.compras.some((c) => c.id === 'zzc0') && DATA.estoqueMov.some((m) => m.id === 'zzm1') && DATA.fornecedores.length >= 3, null, { timeout: 10000 });

    let s = await S();
    ok(perto(s.total, 520) && perto(s.chao, 520) && perto(s.fora, 0) && !s.temIni, 'estoque antigo: tudo no chão da fábrica, total igual ao da aba Estoque (520 m³)');
    const custo0 = await custo(); const pagar0 = await aPagar();
    ok(pagar0 === 1000, 'contas a pagar de antes: R$ 1.000,00');

    /* ---------- início do setor e abas ---------- */
    await ir('#/setor-lenha');
    ok(await page.evaluate(() => !!document.querySelector('#lx111ini a[href="#/lenhaLancar"]') && !!document.querySelector('#lx111ini a[href="#/lenhaLevar"]')), 'início da Lenha: botões "Lançar lenha" e "Levar lenha para a fábrica"');
    ok(await page.evaluate(() => { const a = ABAS_V('lenha').map((x) => x.r); return ['#/lenhaLancar', '#/lenhaLevar', '#/lenhaLocais', '#/lenhaClasses', '#/lenhaDepositos', '#/compras', '#/estoque', '#/lcusto', '#/ldiag', '#/formasPag', '#/produtos', '#/locais'].every((r) => a.includes(r)); }), 'abas novas entram e as antigas continuam');
    ok(await page.evaluate(() => !ABAS_V('combustivel').some((x) => /lenha/i.test(x.r))), 'Setor de Combustível não ganha aba da lenha');

    /* ---------- fornecedor: caminhão e tipos com preço ---------- */
    await ir('#/fornecedores');
    await page.evaluate(() => LENHA_V111.editarForn('zzf1'));
    await page.waitForSelector('#fx111 .fx-l');
    await page.fill('#fx111 .fx-l [data-c=nome]', 'ZZ Truck');
    await page.fill('#fx111 .fx-l [data-c=comp]', '6');
    await page.fill('#fx111 .fx-l [data-c=larg]', '2.4');
    await page.fill('#fx111 .fx-l [data-c=alt]', '2');
    ok((await page.textContent('#fx111 .fx-l [data-m3]')).includes('28,8'), 'caminhão 6 × 2,4 × 2 calcula 28,8 m³ sozinho');
    await page.fill('#fx111 [data-pr="Grossa"]', '55,00');
    ok(await page.isChecked('#fx111 [data-cl="Grossa"]'), 'digitar o preço marca o tipo');
    await foto('fornecedor');
    await page.click('body>.veu .modal [data-ok]'); await page.waitForTimeout(900);
    const f1 = await page.evaluate(() => DATA.fornecedores.find((f) => f.id === 'zzf1'));
    ok(f1.caminhoes && f1.caminhoes.length === 1 && f1.caminhoes[0].nome === 'ZZ Truck' && f1.lenhaClasses[0].classe === 'Grossa' && f1.lenhaClasses[0].preco === 55 && f1.nome === 'ZZ Fornecedor Um' && f1.situacao === 'Ativo', 'fornecedor gravado com caminhão e tipo; o resto do cadastro igual');

    /* ---------- Lançar lenha ---------- */
    await ir('#/lenhaLancar');
    ok(await page.evaluate(() => !!document.querySelector('#lxForn') && !!document.querySelector('#lxOk')), 'tela Lançar lenha abre');
    await page.selectOption('#lxForn', 'zzf1'); await page.waitForTimeout(300);
    let d = await page.evaluate(() => { const x = RASC_V.compra; return { cam: x.lenhaCam, q: x.itens[0].qtd, cl: x.lenhaClasse, p: x.itens[0].preco, prod: x.itens[0].produtoId }; });
    ok(!!d.cam && perto(d.q, 28.8) && d.cl === 'Grossa' && d.p === 55 && d.prod === 'zzp1', 'ao escolher o fornecedor: caminhão, 28,8 m³, tipo Grossa e R$ 55,00 já vêm preenchidos');
    await page.fill('#lxAlt', '1.5'); await page.waitForTimeout(150);
    ok(perto(await page.evaluate(() => RASC_V.compra.itens[0].qtd), 21.6), 'mudar a altura da carga do dia recalcula o m³ (21,6)');
    await page.click('#lxOk'); await page.waitForTimeout(300);
    ok((await toasts()).some((t) => /já foi pago ou se fica a pagar/.test(t)), 'sem escolher o pagamento, não salva');
    await page.click('[data-pag="prazo"]'); await page.waitForTimeout(200);
    await page.click('#lxOk'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => /para onde foi a lenha/i.test(document.querySelector('#lxFim').textContent)), 'sem o destino, não salva e avisa');
    await page.click('[data-dep="fora"]'); await page.waitForTimeout(200);
    await page.check('#lxSemVenc'); await page.waitForTimeout(200);
    ok((await page.textContent('#lxFim')).includes('1.188,00'), 'total calculado antes de salvar: 21,6 × 55 = R$ 1.188,00');
    await foto('lancar');
    ok(!(await estoura()), 'Lançar lenha não estoura a largura da tela');
    await page.click('#lxOk'); await aceitar(); await page.waitForTimeout(600);
    const c1 = await page.evaluate(() => DATA.compras.filter((c) => c.setor === 'lenha' && c.id !== 'zzc0').sort((a, b) => b.numero - a.numero)[0]);
    ok(c1 && c1.lenhaLocal === 'fora' && c1.lenhaClasse === 'Grossa' && c1.itens[0].lenhaClasse === 'Grossa' && c1.lenhaMedicao && c1.lenhaMedicao.caminhao === 'ZZ Truck' && perto(c1.lenhaMedicao.alt, 1.5) && perto(c1.lenhaMedicao.m3, 21.6) && c1.total === 1188, 'compra gravada com tipo, destino, caminhão e medidas');
    ok(c1.tipoOp === 'compra' && c1.status === 'Concluída' && c1.condicao === 'A prazo' && c1.vencimento === '' && c1.pagamentos.length === 0 && c1.numero === 2 && c1.itens[0].baixaEstoque === true, 'compra no formato de sempre: a prazo, sem vencimento, número em sequência');
    ok(await page.evaluate(() => DATA.compras.filter((c) => c.setor === 'lenha').length === 2), 'lançou uma vez só (nada em dobro)');
    ok((await aPagar()) === 2188, 'conta a pagar nasceu: R$ 1.000,00 + R$ 1.188,00');
    ok(await page.evaluate(() => lerRota().mod === 'lenhaLancar' && !!document.querySelector('.lx-ult')), 'volta para Lançar lenha mostrando o que acabou de lançar');
    s = await S();
    ok(perto(s.total, 541.6) && perto(s.fora, 21.6) && perto(s.chao, 520), 'estoque: total 541,6 · de fora 21,6 · chão 520');

    /* repetir o último, agora direto no chão da fábrica */
    await page.selectOption('#lxForn', 'zzf1'); await page.waitForTimeout(300);
    await page.click('#lxRep'); await page.waitForTimeout(300);
    d = await page.evaluate(() => { const x = RASC_V.compra; return { q: x.itens[0].qtd, cl: x.lenhaClasse, p: x.itens[0].preco, dep: x.lenhaLocal, pag: x.lxPag, sv: x.semVenc, alt: x.lenhaAlt }; });
    ok(perto(d.q, 21.6) && d.cl === 'Grossa' && d.p === 55 && d.dep === 'fora' && d.pag === 'prazo' && d.sv === true && perto(d.alt, 1.5), '"Repetir último lançamento" copia quantidade, tipo, preço, destino e pagamento');
    await page.click('[data-dep="chao"]'); await page.waitForTimeout(200);
    await page.click('#lxOk'); await page.waitForTimeout(400);
    const txtConf = await page.evaluate(() => { const m = document.querySelector('body>.veu .modal'); return m ? m.textContent : ''; });
    ok(/compra repetida/i.test(txtConf), 'aviso de possível compra repetida continua aparecendo');
    await aceitar(); await page.waitForTimeout(600);
    s = await S();
    ok(perto(s.total, 563.2) && perto(s.fora, 21.6) && perto(s.chao, 541.6), 'compra que ficou no chão da fábrica: total 563,2 · de fora 21,6 · chão 541,6');

    /* ---------- Levar lenha para a fábrica ---------- */
    const custo1 = await custo(); const pagar1 = await aPagar();
    await ir('#/lenhaLevar');
    await page.click('[data-modo="viagens"]'); await page.waitForTimeout(200);
    await page.fill('#tvVia', '2'); await page.fill('#tvM3v', '5'); await page.fill('#tvQuem', 'ZZ Tratorista');
    await page.click('[data-cl="Grossa"]'); await page.waitForTimeout(200);
    ok((await page.textContent('#tvRes')).includes('10 m³'), '2 viagens × 5 m³ = 10 m³');
    await foto('levar');
    ok(!(await estoura()), 'Levar lenha não estoura a largura da tela');
    await page.click('#tvOk'); await aceitar();
    s = await S();
    ok(perto(s.total, 563.2) && perto(s.fora, 11.6) && perto(s.chao, 551.6), 'levada: baixa 10 no estoque de fora e entra 10 no chão; total igual');
    ok((await custo()) === custo1 && (await aPagar()) === pagar1, 'levada não muda o custo médio mês a mês nem as contas a pagar');
    ok(await page.evaluate(() => DATA.estoqueMov.length === 1 && DATA.consumos.length === 0), 'levada não cria movimentação de estoque nem consumo');
    await page.click('[data-modo="m3"]'); await page.waitForTimeout(200);
    await page.fill('#tvQ', '50'); await page.fill('#tvQuem', 'ZZ Tratorista');
    await page.click('#tvOk'); await page.waitForTimeout(400);
    ok((await toasts()).some((t) => /só há 11,6 m³/.test(t)) && perto((await S()).fora, 11.6), 'não deixa tirar mais do que há no local e avisa o saldo');

    /* ---------- saldo inicial por local (administrador) ---------- */
    await ir('#/lenhaLocais');
    await page.click('#llIni'); await page.waitForSelector('[data-si="fora"]');
    await page.fill('[data-si="fora"][data-cl=""]', '9999');
    await page.click('body>.veu .modal [data-ok]'); await page.waitForTimeout(400);
    ok((await toasts()).some((t) => /total do estoque não pode mudar/.test(t)), 'saldo inicial maior que o estoque é recusado');
    await page.fill('[data-si="fora"][data-cl=""]', '100');
    await page.waitForTimeout(800); // o programa ignora dois cliques seguidos no mesmo botão (menos de 0,7 s)
    await page.click('body>.veu .modal [data-ok]'); await page.waitForTimeout(900);
    s = await S();
    ok(perto(s.total, 563.2) && perto(s.fora, 111.6) && perto(s.chao, 451.6) && s.temIni, 'saldo inicial: 100 m³ passam a constar no estoque de fora; total igual (563,2)');
    ok((await custo()) === custo1 && (await aPagar()) === pagar1, 'saldo inicial não muda custo nem contas a pagar');
    await foto('locais');
    ok(!(await estoura()), 'Estoque por local não estoura a largura da tela');

    /* ---------- queima sai do chão da fábrica ---------- */
    await page.evaluate(async () => { await gravarRegistro('consumos', { id: novoId(), setor: 'lenha', produtoId: 'zzp1', localId: 'zzl1', quantidade: 30, data: hoje(), hora: '10:00' }, null, true); });
    await page.waitForFunction(() => DATA.consumos.length === 1, null, { timeout: 8000 });
    s = await S();
    ok(perto(s.total, 533.2) && perto(s.fora, 111.6) && perto(s.chao, 421.6), 'queima de 30 m³: sai do chão da fábrica; estoque de fora não muda');

    /* ---------- compra antiga e telas que já existiam ---------- */
    const c0 = await page.evaluate(() => JSON.stringify(DATA.compras.find((c) => c.id === 'zzc0')));
    ok(!/lenhaLocal|lenhaClasse/.test(c0), 'compra antiga não foi tocada (sem tipo e sem local)');
    await ir('#/compra/zzc0');
    ok(await page.evaluate(() => /Tipo não informado/.test(document.querySelector('#lx111det').textContent) && /Local não informado/.test(document.querySelector('#lx111det').textContent)), 'compra antiga aparece como "Tipo não informado" e "Local não informado"');
    await ir('#/compra/' + c1.id);
    ok(await page.evaluate(() => /Grossa/.test(document.querySelector('#lx111det').textContent) && /ZZ Truck/.test(document.querySelector('#lx111det').textContent)), 'tela da compra mostra tipo, destino e medição');
    await ir('#/estoque');
    ok(await page.evaluate(() => !!document.querySelector('#lx111est') && /533,2/.test(document.querySelector('#lx111est').textContent)), 'aba Estoque: quadro "Lenha por local" com o mesmo total');
    await foto('estoque');
    await ir('#/ldiag');
    ok(await page.evaluate(() => { const t = document.querySelector('#lx111diag'); return !!t && /Grossa/.test(t.textContent) && /Tipo não informado/.test(t.textContent); }), 'Diagnóstico das compras: quadro por tipo de lenha');
    for (const h of ['#/compras', '#/fornecedores', '#/lenhaClasses', '#/lenhaDepositos', '#/lcusto', '#/pagar', '#/consumos', '#/produtos', '#/relvendas', '#/setor-lenha']) { await ir(h, 450); }
    ok(true, 'telas do setor abrem uma a uma');

    /* ---------- Nova compra (tela de sempre) ---------- */
    await page.evaluate(() => { RASC_V.compra = null; });
    await ir('#/compra/nova');
    ok(await page.evaluate(() => !!document.querySelector('#lx111 #lx111dep') && !!document.querySelector('#vdForma') && !!document.querySelector('#vdItens')), 'Nova compra continua existindo, com o quadro novo da lenha');
    await page.selectOption('#vdCli', 'zzf1'); await page.waitForTimeout(250);
    await page.selectOption('#lx111cam', { index: 1 }); await page.waitForTimeout(350);
    await page.selectOption('#lx111cl', 'Grossa'); await page.waitForTimeout(350);
    d = await page.evaluate(() => { const x = RASC_V.compra; return { q: x.itens[0].qtd, p: x.itens[0].preco, prod: x.itens[0].produtoId }; });
    ok(perto(d.q, 28.8) && d.p === 55 && d.prod === 'zzp1', 'Nova compra: caminhão preenche o m³ e o tipo preenche o preço');
    ok(await page.evaluate(() => conferirOpV(OP.compra, RASC_V.compra).erros.some((e) => /para onde foi a lenha/i.test(e))), 'Nova compra: destino é obrigatório');
    await foto('nova-compra');

    /* ---------- V113 · Corrigir lançamento: tipo, caminhão com medidas e destino ---------- */
    await page.evaluate(() => { RASC_V.compra = null; });
    const abrirCorr = async (id) => { await page.evaluate((i) => corrigirCompraLenhaV76(i), id); await page.waitForSelector('body>.veu .modal #lcCl', { timeout: 5000 }); };
    const salvarCorr = async () => { await page.click('body>.veu .modal [data-ok]'); await page.waitForTimeout(900); };
    const fecharCorr = async () => { if (await page.$('body>.veu .modal [data-r="0"]')) { await page.click('body>.veu .modal [data-r="0"]'); await page.waitForTimeout(200); } };
    const C = (id) => page.evaluate((i) => DATA.compras.find((c) => c.id === i), id);
    /* compra antiga (sem tipo, sem local, sem medição) é completada */
    await abrirCorr('zzc0');
    ok(await page.evaluate(() => ['lcCl', 'lcDep', 'lcCam', 'lcComp', 'lcLarg', 'lcAlt'].every((i) => !!document.querySelector('body>.veu .modal #' + i))), 'Corrigir lançamento: tipo, destino, caminhão e medidas aparecem');
    await page.fill('#lcComp', '5'); await page.fill('#lcLarg', '2'); await page.waitForTimeout(100);
    await salvarCorr();
    ok((await toasts()).some((t) => /comprimento, largura e altura/.test(t)), 'medida pela metade não salva');
    await page.fill('#lcAlt', '2.5'); await page.waitForTimeout(150);
    ok(perto(+(await page.inputValue('body>.veu .modal [data-q="0"]')), 25), 'medidas 5 × 2 × 2,5 levam 25 m³ para a quantidade');
    await page.selectOption('#lcCl', 'Fina'); await page.selectOption('#lcDep', 'chao');
    await foto('corrigir');
    ok(!(await estoura()), 'janela de correção não estoura a largura da tela');
    await salvarCorr();
    let cz = await C('zzc0');
    ok(cz.lenhaClasse === 'Fina' && cz.itens[0].lenhaClasse === 'Fina' && cz.lenhaLocal === 'chao' && cz.lenhaMedicao && perto(cz.lenhaMedicao.m3, 25) && cz.lenhaMedicao.caminhao === '' && perto(cz.itens[0].qtd, 25) && cz.total === 1250 && perto(cz.itens[0].atual, 525), 'compra antiga corrigida: tipo, destino, medidas, 25 m³ e total R$ 1.250,00');
    ok(await page.evaluate(() => { const l = DATA.log.filter((x) => x.recId === 'zzc0' && x.acao === 'corrigiu o lançamento').pop(); const t = JSON.stringify(l || {}); return /Tipo da lenha/.test(t) && /Foi para/.test(t) && /Medição do caminhão/.test(t); }), 'histórico da correção guarda tipo, destino e medição');
    /* compra com caminhão: trocar o caminhão traz as medidas dele; o tipo traz o preço do fornecedor */
    await abrirCorr(c1.id);
    ok(await page.evaluate(() => document.querySelector('#lcCam').value !== '' && document.querySelector('#lcCl').value === 'Grossa' && document.querySelector('#lcDep').value === 'fora' && +document.querySelector('#lcAlt').value === 1.5), 'abre com o caminhão, o tipo, o destino e a altura que foram lançados');
    await page.fill('#lcAlt', '1'); await page.waitForTimeout(150);
    ok(perto(+(await page.inputValue('body>.veu .modal [data-q="0"]')), 14.4), 'mudar a altura recalcula o m³ (14,4)');
    await salvarCorr();
    cz = await C(c1.id);
    ok(perto(cz.itens[0].qtd, 14.4) && perto(cz.lenhaMedicao.alt, 1) && cz.lenhaMedicao.caminhao === 'ZZ Truck' && cz.lenhaLocal === 'fora' && cz.lenhaClasse === 'Grossa' && cz.total === 792, 'correção da altura grava 14,4 m³ e R$ 792,00, sem mexer no resto');
    const foraAntes = s.fora; s = await S();
    ok(perto(foraAntes - s.fora, 7.2), 'estoque de fora acompanha a correção (7,2 m³ a menos)');
    /* já levaram lenha do estoque de fora: não deixa tirar a compra de lá */
    await page.evaluate(async (q) => { const a = new Date().toISOString(); await gravar('lenhaMov', { id: 'zzmv9', tipo: 'transferencia', de: 'fora', para: 'chao', quantidade: q, classe: 'Grossa', data: hoje(), criadoEm: a, criadoPor: 'u_DONO', alteradoEm: a, alteradoPor: 'u_DONO' }, null); if (!DATA.lenhaMov.some((x) => x.id === 'zzmv9')) DATA.lenhaMov = [...DATA.lenhaMov, { id: 'zzmv9', tipo: 'transferencia', de: 'fora', para: 'chao', quantidade: q, classe: 'Grossa', data: hoje() }]; }, +(s.fora - 5).toFixed(3));
    await page.waitForTimeout(300);
    await abrirCorr(c1.id);
    await page.selectOption('#lcDep', 'chao');
    await salvarCorr();
    ok((await toasts()).some((t) => /já foi levada/.test(t)) && (await C(c1.id)).lenhaLocal === 'fora', 'não deixa mudar o destino quando a lenha já saiu do estoque de fora');
    await fecharCorr();
    /* sem mudar nada, não grava */
    await abrirCorr(c1.id); await salvarCorr();
    ok((await toasts()).some((t) => /Nada foi alterado/.test(t)), 'abrir e salvar sem mudar nada não grava correção');
    await fecharCorr();
    await page.evaluate(async () => { const m = DATA.lenhaMov.find((x) => x.id === 'zzmv9'); if (m) { await gravar('lenhaMov', { ...m, cancelado: true }, m); DATA.lenhaMov = DATA.lenhaMov.map((x) => x.id === 'zzmv9' ? { ...x, cancelado: true } : x); } });

    /* ---------- outros setores não mudam ---------- */
    await page.evaluate(() => { RASC_V.compra = null; SV = 'combustivel'; if (typeof marcarSetor === 'function') marcarSetor('combustivel'); });
    await ir('#/setor-combustivel'); await ir('#/compra/nova');
    ok(await page.evaluate(() => !document.querySelector('#lx111') && RASC_V.compra && RASC_V.compra.setor === 'combustivel' && !conferirOpV(OP.compra, RASC_V.compra).erros.some((e) => /lenha/i.test(e))), 'compra de combustível: sem quadro da lenha e sem exigir destino');
    await ir('#/compras');
    ok(await page.evaluate(() => !MODS.compras.cols.some((c) => c.k === '_cl111') && !MODS.compras.filtros.some((f) => f.k === '_cl111')), 'lista de compras do combustível sem as colunas da lenha');

    ok((await custo()) !== custo0, 'custo mês a mês acompanha só as compras e a queima novas (controle do teste)');
    ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
} finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
