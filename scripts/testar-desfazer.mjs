#!/usr/bin/env node
// Teste de ponta a ponta do DESFAZER e REFAZER, no programa REAL (saida/claude.html) num Chromium com
// banco central simulado. Nada sai para a internet. Só dados fictícios.
// Uso: node scripts/construir.mjs && node scripts/testar-desfazer.mjs
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

const DOCS = [['funcionarios', 'f1', { id: 'f1', nome: 'Ana Teste Souza', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção' }]];
const iniciar = ({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: 'Dono' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const ir = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(600); };
// uma ação do usuário: clique seguido da gravação, como no programa
const acao = (page, fn, arg) => page.evaluate(async ({ f, a }) => {
  document.dispatchEvent(new Event('pointerdown'));
  await (0, eval)('(' + f + ')')(a);
  await window.JB_DESFAZER.assentar();
}, { f: fn.toString(), a: arg });
const noBanco = (page, c, i) => page.evaluate(([x, y]) => { const r = window.__srv.estado.docs.get(x + '/' + y); return r ? r.dados : null; }, [c, i]);
const itensDe = (page, c) => page.evaluate((x) => { const o = {}; window.__srv.estado.docs.forEach((r, k) => { if (k.startsWith(x + '/')) Object.entries(r.dados.items || {}).forEach(([i, v]) => { if (v) o[i] = v; }); }); return o; }, c);
const aceitar = async (page) => { await page.waitForSelector('body>.veu .modal [data-r="1"]', { timeout: 4000 }); await page.click('body>.veu .modal [data-r="1"]'); await page.waitForTimeout(350); };
const espera = (page, ms = 500) => page.waitForTimeout(ms);
const bt = (page, d) => page.evaluate((x) => { const b = [...document.querySelectorAll(`.jbh button[data-jbh="${x}"]`)].find((e) => e.offsetParent !== null); return b ? { dis: b.disabled, tip: b.getAttribute('aria-label') } : null; }, d);
const pilha = (page) => page.evaluate(() => { const p = window.JB_DESFAZER.pilhas(); return { u: p.undo.map((e) => e.desc), r: p.redo.map((e) => e.desc), bloq: p.undo.filter((e) => e.bloq).length, ctx: p.contexto, campos: p.campos }; });

try {
  for (const vp of [{ width: 1300, height: 800, nome: 'computador' }, { width: 390, height: 800, nome: 'celular' }, { width: 360, height: 700, nome: 'celular pequeno' }]) {
    console.log(`\n${vp.nome}:`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });

    for (const h of ['#/setores', '#/painel', '#/vales', '#/setor-lenha']) {
      await ir(page, h);
      const u = await bt(page, 'u'), r = await bt(page, 'r');
      ok(u && r, `os dois botões aparecem em ${h}`);
      ok(u && u.dis && r && r.dis, `sem ação disponível, ficam desabilitados em ${h}`);
    }
    await page.screenshot({ path: join(RAIZ, `saida/desfazer-${vp.nome.replace(' ', '-')}.png`), clip: { x: 0, y: 0, width: vp.width, height: 120 } });
    for (const h of ['#/setor-lenha', '#/painel', '#/setores']) {
      await ir(page, h);
      const estoura = await page.evaluate(() => { const t = document.getElementById('top'); const r = t.getBoundingClientRect(); return t.scrollWidth > t.clientWidth + 1 || [...t.children].some((e) => e.offsetParent && e.getBoundingClientRect().right > r.right + 1); });
      ok(!estoura, `a barra superior não estoura em ${h}`);
    }

    if (vp.nome === 'computador') {
      // navegar não vira ação
      for (const h of ['#/painel', '#/folha', '#/setor-lenha', '#/setores', '#/config', '#/alertas']) { await page.evaluate(() => document.dispatchEvent(new Event('pointerdown'))); await ir(page, h); }
      await espera(page, 900);
      ok((await pilha(page)).u.length === 0, 'navegar pelas telas não entra no histórico');

      // registro simples: incluir, desfazer, refazer
      await ir(page, '#/painel');
      await acao(page, () => gravar('alteracoes', { id: 'a1', funcionarioId: 'f1', tipo: 'Teste', valor: 1 }, null));
      ok(!!(await noBanco(page, 'alteracoes', 'a1')), 'gravou no banco');
      ok((await pilha(page)).u.length === 1, 'a ação entrou no histórico');
      ok(!(await bt(page, 'u')).dis, 'Desfazer fica disponível');
      await page.keyboard.press('Control+z'); await espera(page, 700);
      ok(!(await noBanco(page, 'alteracoes', 'a1')), 'Ctrl+Z desfaz: registro saiu do banco');
      ok(!(await bt(page, 'r')).dis, 'Refazer fica disponível');
      await page.keyboard.press('Control+y'); await espera(page, 700);
      ok(!!(await noBanco(page, 'alteracoes', 'a1')), 'Ctrl+Y refaz: registro voltou');
      await page.click('.jbh button[data-jbh="u"]'); await espera(page, 700);
      ok(!(await noBanco(page, 'alteracoes', 'a1')), 'o botão Desfazer funciona igual ao atalho');
      await page.click('.jbh button[data-jbh="r"]'); await espera(page, 700);
      const a1 = await noBanco(page, 'alteracoes', 'a1');
      ok(a1 && a1.valor === 1, 'o botão Refazer funciona igual ao atalho');

      // edição volta exatamente ao que era, inclusive campo que não existia
      await acao(page, (o) => gravar('alteracoes', { ...o, valor: 2, novoCampo: 'x' }, o), a1);
      await page.keyboard.press('Control+z'); await espera(page, 700);
      const volta = await noBanco(page, 'alteracoes', 'a1');
      ok(volta.valor === 1 && volta.novoCampo == null, 'editar e desfazer devolve o estado anterior exato');
      await acao(page, () => gravar('alteracoes', { id: 'a2', funcionarioId: 'f1', tipo: 'Nova' }, null));
      ok((await pilha(page)).r.length === 0, 'ação nova limpa o Refazer do setor');
      await page.keyboard.press('Control+z'); await espera(page, 700);

      // documento agrupado: só o item da ação volta, o da outra pessoa fica
      await acao(page, () => gravar('vales', { id: 'v1', funcionarioId: 'f1', data: '2026-11-03', valor: 50, situacao: 'Lançado' }, null));
      await ir(page, '#/vales'); // reinicia o gesto: o que vem agora é "de outra pessoa"
      await page.evaluate(() => gravar('vales', { id: 'v2', funcionarioId: 'f1', data: '2026-11-04', valor: 70, situacao: 'Lançado' }, null));
      await espera(page, 900);
      ok((await pilha(page)).u.filter((d) => /Vales|vale/i.test(d)).length === 1, 'a gravação sem clique do usuário não entra no histórico');
      await page.keyboard.press('Control+z'); await espera(page, 800);
      let its = await itensDe(page, 'vales');
      ok(!its.v1 && its.v2 && its.v2.valor === 70, 'documento agrupado: desfaz só o item da ação, sem tocar no item da outra pessoa');
      await page.keyboard.press('Control+y'); await espera(page, 800);
      its = await itensDe(page, 'vales');
      ok(its.v1 && its.v2, 'documento agrupado: refazer devolve o item');

      // conflito: outra pessoa alterou depois
      await page.evaluate(() => { const o = DATA.vales.find((x) => x.id === 'v1'); window.__v1 = o; });
      await ir(page, '#/painel');
      await page.evaluate(() => { const o = window.__v1; return gravar('vales', { ...o, valor: 999 }, o); }); await espera(page, 300);
      await ir(page, '#/vales');
      await page.keyboard.press('Control+z'); await page.waitForSelector('body>.veu .modal', { timeout: 4000 });
      ok(/alterado depois/.test(await page.textContent('body>.veu .modal')), 'registro alterado por outra pessoa: avisa e não desfaz');
      ok((await itensDe(page, 'vales')).v1.valor === 999, 'a alteração da outra pessoa fica preservada');
      await aceitar(page);

      // ação importante pede confirmação
      await ir(page, '#/painel');
      await acao(page, () => gravar('funcionarios', { id: 'f9', nome: 'Pessoa Nova', situacao: 'Ativo', tipoContratacao: 'CLT' }, null));
      await page.keyboard.press('Control+z'); await page.waitForSelector('body>.veu .modal', { timeout: 4000 });
      ok(/Desfazer esta ação/.test(await page.textContent('body>.veu .modal')), 'operação importante pede confirmação');
      ok(!!(await noBanco(page, 'funcionarios', 'f9')), 'antes de confirmar, nada muda');
      ok(await bt(page, 'u').then((b) => b.dis), 'com a confirmação aberta, os botões ficam bloqueados');
      await page.click('body>.veu .modal [data-r="0"]'); await espera(page, 350);
      ok(!!(await noBanco(page, 'funcionarios', 'f9')), 'cancelar a confirmação não desfaz');

      // cadastro em uso não some
      await ir(page, '#/vales'); // reinicia o gesto: o lançamento é de outra pessoa
      await page.evaluate(() => gravar('alteracoes', { id: 'a9', funcionarioId: 'f9', tipo: 'Depende' }, null)); await espera(page, 300);
      await page.keyboard.press('Control+z'); await page.waitForSelector('body>.veu .modal', { timeout: 4000 });
      ok(/já é usado/.test(await page.textContent('body>.veu .modal')), 'cadastro já usado em outro lançamento não é apagado');
      ok(!!(await noBanco(page, 'funcionarios', 'f9')), 'o cadastro continua no banco');
      await page.click('body>.veu .modal [data-r="0"]'); await espera(page, 350);

      // nota fiscal não volta
      await ir(page, '#/setores');
      await acao(page, () => gravar('nfe', { id: 'n1', status: 'autorizada', ambiente: 'homologacao', data: '2026-11-07', numero: 12, serie: 1, envio: { tentativas: [] }, itens: [], dest: { end: {} }, historico: [] }, null));
      ok((await pilha(page)).bloq === 1, 'nota fiscal fica marcada como não reversível');
      await page.keyboard.press('Control+z'); await page.waitForSelector('body>.veu .modal', { timeout: 4000 });
      ok(/nota fiscal/.test(await page.textContent('body>.veu .modal')), 'avisa que a nota fiscal não volta');
      await aceitar(page);
      ok(!!(await itensDe(page, 'nfe')).n1, 'a nota continua no banco');

      // lançamento travado
      await ir(page, '#/painel');
      await acao(page, () => gravar('alteracoes', { id: 'a5', funcionarioId: 'f1', tipo: 'X', travado: true }, null));
      await page.evaluate(() => { window.__uid = APP.uid; APP.uid = 'u_OUTRO'; });
      await page.keyboard.press('Control+z'); await page.waitForSelector('body>.veu .modal', { timeout: 4000 });
      ok(/travado/.test(await page.textContent('body>.veu .modal')), 'lançamento travado só volta com Jeferson ou Bayron');
      await aceitar(page);
      await page.evaluate(() => { APP.uid = window.__uid; });
      ok(!!(await noBanco(page, 'alteracoes', 'a5')), 'o travado continua no banco');

      // folha fechada
      await acao(page, () => gravar('despesas', { id: 'd1', competencia: '2026-09', categoria: 'Teste', valor: 10 }, null));
      await ir(page, '#/folha');
      await page.evaluate(() => gravar('folhas', { id: '2026-09', mes: '2026-09', situacao: 'Fechada', itens: [] }, null)); await espera(page, 300);
      await page.keyboard.press('Control+z'); await page.waitForSelector('body>.veu .modal', { timeout: 4000 });
      ok(/já foi fechada/.test(await page.textContent('body>.veu .modal')), 'lançamento de folha já fechada não volta sem reabrir');
      await aceitar(page);

      // por setor
      await ir(page, '#/setor-lenha');
      const sCtx = (await pilha(page)).ctx;
      await acao(page, () => gravar('clientes', { id: 'c1', nome: 'Cliente Teste' }, null));
      await ir(page, '#/painel');
      const antesU = (await pilha(page)).u.length;
      await page.keyboard.press('Control+z'); await espera(page, 700);
      ok(!!(await noBanco(page, 'clientes', 'c1')), `ação do ${sCtx} não é desfeita a partir do Setor Pessoal`);
      if (await page.$('body>.veu .modal')) { await page.click('body>.veu .modal [data-r="0"]'); await espera(page, 350); } // aqui aparece a ação anterior do Setor Pessoal
      await ir(page, '#/setor-lenha');
      await page.keyboard.press('Control+z'); await espera(page, 700);
      ok(!(await noBanco(page, 'clientes', 'c1')), 'no próprio setor, desfaz normalmente');
      ok(antesU >= 1, 'as ações de cada setor ficam separadas');

      // formulário real: digitar, desfazer, refazer, salvar pela tela
      await ir(page, '#/vales/novo');
      await page.waitForTimeout(400);
      const campo = await page.evaluate(() => { const i = [...document.querySelectorAll('#camada textarea, #conteudo textarea, #camada .cmp input[type=text], #conteudo .cmp input[type=text]')].find((e) => e.offsetParent && !e.readOnly && !e.disabled && !e.dataset.masc); if (!i) return null; i.id = i.id || 'campoT'; return '#' + i.id; });
      ok(!!campo, 'abriu um formulário real');
      if (campo) {
        await page.click(campo);
        await page.keyboard.type('primeiro', { delay: 5 });
        await page.waitForTimeout(1400);
        await page.keyboard.type(' segundo', { delay: 5 });
        await page.waitForTimeout(200);
        ok(!(await bt(page, 'u')).dis, 'com texto digitado, Desfazer fica disponível');
        await page.keyboard.press('Control+z'); await espera(page, 300);
        ok((await page.inputValue(campo)) === 'primeiro', 'Ctrl+Z volta o último trecho digitado');
        await page.keyboard.press('Control+y'); await espera(page, 300);
        ok((await page.inputValue(campo)) === 'primeiro segundo', 'Ctrl+Y devolve o trecho');
        ok(!!(await page.$('#camada .gav-cab .jbh')), 'os botões aparecem no cabeçalho do formulário em gaveta');
        await page.screenshot({ path: join(RAIZ, 'saida/desfazer-gaveta.png'), clip: { x: 500, y: 0, width: 800, height: 240 } });
        await page.click('#camada .jbh button[data-jbh="u"]'); await espera(page, 300);
        await page.click('#camada .jbh button[data-jbh="u"]'); await espera(page, 300);
        ok((await page.inputValue(campo)) === '', 'os botões voltam o preenchimento até o início');
        const masc = await page.$('[data-masc="moeda"]');
        if (masc) {
          await masc.click(); await page.keyboard.type('1234', { delay: 5 }); await page.keyboard.press('Tab'); await espera(page, 250);
          const fmt = await masc.inputValue();
          ok(fmt !== '' && !(await bt(page, 'u')).dis, `campo com máscara entra no histórico (${fmt})`);
          await page.click('#camada .jbh button[data-jbh="u"]'); await espera(page, 300);
          ok((await masc.inputValue()) === '', 'campo com máscara volta ao valor de antes');
          await page.click('#camada .jbh button[data-jbh="r"]'); await espera(page, 300);
          ok((await masc.inputValue()) === fmt, 'campo com máscara refaz com o valor formatado');
        }
      }

      // fluxo completo pela tela: preencher, Salvar e desfazer
      if (await page.$('body>.veu .modal')) await aceitar(page);
      await ir(page, '#/painel'); if (await page.$('body>.veu .modal')) await aceitar(page);
      await espera(page, 400);
      await ir(page, '#/vales/novo');
      await page.waitForSelector('#c_funcionarioId', { timeout: 5000 }).catch(() => {});
      await page.selectOption('#c_funcionarioId', 'f1').catch(() => {});
      await page.click('#c_valor'); await page.keyboard.type('12345', { delay: 5 }); await page.keyboard.press('Tab');
      const n1 = (await pilha(page)).u.length, itensAntes = Object.keys(await itensDe(page, 'vales')).length;
      await page.click('#camada [data-acao="salvar"], #camada .gav-pe .btn.pri'); await espera(page, 1800);
      if (await page.$('body>.veu .modal')) { await aceitar(page); await espera(page, 1500); }
      const pp = await pilha(page);
      ok(Object.keys(await itensDe(page, 'vales')).length === itensAntes + 1, 'Salvar pela tela gravou o vale');
      ok(pp.u.length === n1 + 1, `salvar pela tela vira UMA ação no histórico (${pp.u[pp.u.length - 1]})`);
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.keyboard.press('Control+z'); await espera(page, 900);
      ok(Object.keys(await itensDe(page, 'vales')).length === itensAntes, 'desfazer tira o vale salvo pela tela');
      await page.keyboard.press('Control+y'); await espera(page, 900);
      ok(Object.keys(await itensDe(page, 'vales')).length === itensAntes + 1, 'refazer devolve o vale salvo pela tela');

      // campo de pesquisa e Ctrl+Z: nunca desfaz registro salvo
      await ir(page, '#/painel');
      if (await page.$('body>.veu .modal')) await aceitar(page); // saiu do formulário sem salvar
      await espera(page, 400);
      await acao(page, () => gravar('alteracoes', { id: 'a7', funcionarioId: 'f1', tipo: 'Busca' }, null));
      await page.evaluate(() => { const i = document.createElement('input'); i.id = 'tBusca'; i.type = 'search'; document.getElementById('conteudo').prepend(i); i.focus(); });
      await page.keyboard.press('Control+z'); await espera(page, 600);
      ok(!!(await noBanco(page, 'alteracoes', 'a7')), 'com o cursor num campo de pesquisa, Ctrl+Z não apaga registro salvo');
      await page.evaluate(() => { document.getElementById('tBusca').remove(); document.activeElement.blur(); });

      // histórico oficial
      const logs = await page.evaluate(() => { const o = []; window.__srv.estado.docs.forEach((r, k) => { if (k.startsWith('log/')) Object.values(r.dados.items || {}).forEach((x) => { if (x) o.push(x.acao); }); }); return o; });
      ok(logs.includes('desfez') && logs.includes('refez'), 'desfazer e refazer ficam anotados no histórico oficial');

      // lista
      await page.dispatchEvent('#top .jbh', 'contextmenu', { button: 2 }); await espera(page, 200);
      ok(await page.evaluate(() => !document.getElementById('jbhPainel').hidden && document.querySelectorAll('#jbhPainel .pd-it').length > 0), 'o histórico organizado abre e lista as ações');
      ok(await page.evaluate(() => document.querySelectorAll('#jbhPainel .pd-g').length >= 2), 'o histórico vem separado por setor');
      await page.screenshot({ path: join(RAIZ, 'saida/desfazer-historico.png') });
      await page.keyboard.press('Escape');
      ok(await page.evaluate(() => document.getElementById('jbhPainel').hidden), 'Esc fecha o histórico');

      // layout anterior
      await page.evaluate(() => { const b = document.querySelector('[data-c2antiga]'); if (b) b.click(); }); await espera(page, 500);
      await ir(page, '#/painel');
      ok(await page.evaluate(() => { const b = document.querySelector('#top .jbh-antigo'); return !!b && !!b.offsetParent; }), 'no layout anterior, os botões ficam na barra do Setor Pessoal');
      await ir(page, '#/setor-lenha');
      ok(await page.evaluate(() => { const b = document.querySelector('.spot-cab .jbh-spot'); return !!b && !!b.offsetParent; }), 'no layout anterior, os botões ficam no cabeçalho dos setores');
      await page.evaluate(() => { const b = document.querySelector('.c2-volta'); if (b) b.click(); }); await espera(page, 500);

      // sobrevive a recarregar a página
      const n0 = (await pilha(page)).u.length;
      await page.reload();
      await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
      await page.waitForTimeout(600);
      ok(n0 > 0 && (await pilha(page)).u.length === n0, 'o histórico continua depois de recarregar a página');
    }
    const rel = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
    ok(rel.length === 0, `sem erros de JavaScript${rel.length ? ': ' + rel.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} falha(s).` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
