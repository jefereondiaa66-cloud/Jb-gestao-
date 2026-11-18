#!/usr/bin/env node
// Teste do padrão global de filtros e de lançamentos (V129, bloco lanc-filtros-v129) no programa REAL
// (saida/claude.html), num Chromium, com o banco central simulado (scripts/lib/servidor-falso.mjs).
// Dados fictícios, só em memória. Confere:
//   - as duas datas viram o botão "Período" (calendário e atalhos) e o valor chega aos campos da tela;
//   - o par de meses vira "Competência"; "Mais filtros" guarda os filtros a mais; "Limpar" tira tudo;
//   - a fileira "Ordenar por" vira um botão "Ordenar";
//   - menu de três pontos em cada lançamento: Visualizar, Imprimir, Compartilhar, Editar e Excluir
//     (o Excluir pede a confirmação de sempre; cancelar não apaga nada);
//   - o início dos setores não muda; no celular continua sem rolagem para o lado.
// Uso: node scripts/construir.mjs && node scripts/testar-lanc-filtros.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const ir = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(700); };
const vis = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
const linhas = (page) => page.evaluate(() => document.querySelectorAll('#corpoLista table.lc > tbody > tr[data-lc]').length);
/* espera a lista ficar com n lançamentos (a tela filtra na hora; a espera só cobre computador lento) */
const esperaLinhas = (page, n) => page.waitForFunction((x) => document.querySelectorAll('#corpoLista table.lc > tbody > tr[data-lc]').length === x, n, { timeout: 6000 }).catch(() => {});
const esperaDocumento = (page) => page.waitForFunction(() => location.hash === '#/documento' && !!document.getElementById('fvdDoc'), null, { timeout: 8000 }).catch(() => {});
const itensMenu = (page) => page.evaluate(() => [...document.querySelectorAll('.dc-pop button')].map((b) => (b.firstChild ? b.firstChild.textContent : '').trim()));

/* dados fictícios, gravados pela função do próprio sistema */
async function semear() {
  const p2 = (n) => String(n).padStart(2, '0'); const h = new Date();
  const iso = (d) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  const hoje = iso(h), ant = iso(new Date(h.getFullYear(), h.getMonth() - 1, 10));
  await gravar('funcionarios', { id: 'tf1', nome: 'Pessoa Teste 1', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção' });
  for (const [id, nome] of [['tc1', 'Cliente Teste A'], ['tc2', 'Cliente Teste B']]) await gravar('clientes', { id, nome, razao: nome, setor: 'vendas', situacao: 'Ativo' });
  const venda = (id, n, cli, data, total) => ({ id, numero: n, tipoOp: 'venda', setor: 'vendas', data, clienteId: cli, cliente: { nome: cli === 'tc1' ? 'Cliente Teste A' : 'Cliente Teste B' },
    itens: [{ produtoId: 'tp1', nome: 'Tijolo teste', unidade: 'milheiro', qtd: 1, preco: total, total }], total, forma: 'Pix', condicao: 'À vista', vencimento: data, status: 'Concluída',
    pagamentos: [{ id: 'pg' + id, data, valor: total, forma: 'Pix' }] });
  await gravar('vendas', venda('tv1', 901, 'tc1', hoje, 600));
  await gravar('vendas', venda('tv2', 902, 'tc2', hoje, 700));
  await gravar('vendas', venda('tv3', 903, 'tc1', ant, 800));
  await gravar('despesas', { id: 'td1', competencia: hoje.slice(0, 7), categoria: 'Salário', descricao: 'Teste do mês', valorPrevisto: 100, valorRealizado: 0, situacao: 'Pendente' });
  await gravar('despesas', { id: 'td2', competencia: ant.slice(0, 7), categoria: 'Salário', descricao: 'Teste do mês passado', valorPrevisto: 200, valorRealizado: 200, situacao: 'Pago' });
  await gravar('horasExtras', { id: 'th1', data: hoje, funcionarioId: 'tf1', horas: 2, situacao: 'Pendente', motivo: 'Teste' });
  await gravar('fTitulos', { id: 'tt1', numero: 1, data: hoje, descricao: 'Compromisso teste', categoria: 'Serviços', setorOrigem: 'Geral (Financeiro)', beneficiarioTipo: 'Outro',
    beneficiario: 'Fornecedor Teste', beneficiarioNome: 'Fornecedor Teste', valor: 150, vencimento: hoje, pagamentos: [] });
}

async function abrir(viewport) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ codigo }) => {
    // eslint-disable-next-line no-eval
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true, null, { timeout: 30000 });
  await page.evaluate(semear);
  await page.waitForTimeout(800);
  return { ctx, page, erros };
}

try {
  /* ---------------- computador ---------------- */
  console.log('Computador');
  const { ctx, page, erros } = await abrir({ width: 1280, height: 800 });

  // Vendas: Período, Limpar, Mais filtros, Ordenar e menu de três pontos
  await ir(page, '#/vendas');
  await page.waitForSelector('#conteudo .jbf-per', { timeout: 10000 });
  ok(await vis(page, '#conteudo .jbf-per') && !(await vis(page, '#conteudo [data-f="data_de"]')) && !(await vis(page, '#conteudo [data-f="data_ate"]')), 'Vendas: as duas datas viraram o botão Período');
  ok(await linhas(page) === 3, `Vendas: 3 lançamentos na lista (${await linhas(page)})`);
  ok(await page.evaluate(() => [...document.querySelectorAll('#corpoLista tbody tr[data-lc]')].every((tr) => tr.querySelector('.jbl-m'))), 'Vendas: cada lançamento tem o menu de três pontos');
  ok(await page.evaluate(() => { const t = document.querySelector('#corpoLista table.lc'); return !!t && t.classList.contains('jbl-ord') && getComputedStyle(t.tHead).display === 'none'; }) && await vis(page, '#conteudo .jbf-ord'), 'Vendas: a fileira "Ordenar por" virou o botão Ordenar');

  await page.click('#conteudo .jbf-per');
  ok(await vis(page, '.jbf-pop'), 'Período: o calendário abre');
  await page.click('.jbf-pop .jbf-pre button:has-text("Este mês")');
  await esperaLinhas(page, 2);
  ok(!(await vis(page, '.jbf-pop')) && await linhas(page) === 2, `Período "Este mês": ${await linhas(page)} de 3 vendas (a do mês passado sai)`);
  ok(/\d\d\/\d\d a \d\d\/\d\d\/\d{4}/.test(await page.textContent('#conteudo .jbf-per')), 'Período: o botão mostra as datas escolhidas');
  ok(await vis(page, '#conteudo .jbf-lim'), 'Limpar aparece com filtro ligado');

  const ant = await page.evaluate(() => DATA.vendas.find((v) => v.id === 'tv3').data);
  await page.click('#conteudo .jbf-per');
  await page.click('.jbf-pop [data-nav="-1"]');
  await page.click(`.jbf-pop [data-d="${ant}"]`);
  await page.click(`.jbf-pop [data-d="${ant}"]`);
  await page.click('.jbf-pop .ok');
  await esperaLinhas(page, 1);
  ok(await linhas(page) === 1, `Período escolhido dia a dia no calendário: só a venda daquele dia (${await linhas(page)})`);
  await page.click('#conteudo .jbf-lim');
  await esperaLinhas(page, 3);
  ok(await linhas(page) === 3 && /todos/.test(await page.textContent('#conteudo .jbf-per')) && !(await vis(page, '#conteudo .jbf-lim')), 'Limpar tira os filtros e some');

  const maisVisiveis = () => page.evaluate(() => [...document.querySelectorAll('#conteudo .jbf .jbf-x')].filter((e) => e.getClientRects().length).length);
  const antes = await maisVisiveis();
  await page.click('#conteudo .jbf-mais');
  const depois = await maisVisiveis();
  await page.click('#conteudo .jbf-mais');
  ok(antes === 0 && depois > 0 && await maisVisiveis() === 0, `Mais filtros: ${depois} filtro(s) a mais aparecem só quando pedidos`);

  await page.click('#conteudo .jbf-ord');
  ok(await vis(page, '.dc-pop') && (await itensMenu(page)).some((x) => /^Cliente/.test(x)), 'Ordenar: abre a lista de colunas');
  await page.click('.dc-pop button:has-text("Cliente")');
  await page.waitForFunction(() => /Cliente/.test(document.querySelector('#conteudo .jbf-ord').textContent), null, { timeout: 6000 }).catch(() => {});
  ok(/Cliente/.test(await page.textContent('#conteudo .jbf-ord')), 'Ordenar: a lista passa a ser pela coluna escolhida');

  await page.click('#corpoLista tbody tr[data-lc] .jbl-m');
  const it = await itensMenu(page);
  ok(['Visualizar', 'Imprimir ou reimprimir', 'Compartilhar', 'Editar'].every((x) => it.includes(x)), `Vendas: menu com ${it.join(', ')}`);
  ok(!(await vis(page, '#corpoLista [aria-label^="Imprimir nº"]')), 'Vendas: os ícones da linha foram para o menu (sem botão repetido)');
  await page.click('#corpoLista tbody tr[data-lc] .jbl-m');
  ok(!(await vis(page, '.dc-pop')), 'tocar de novo nos três pontos fecha o menu');
  await page.click('#corpoLista tbody tr[data-lc] .jbl-m');
  await page.click('.dc-pop button:has-text("Visualizar")');
  await esperaDocumento(page);
  ok(await page.evaluate(() => location.hash === '#/documento' && !!document.getElementById('fvdDoc')), 'Visualizar abre o documento do lançamento');

  // Despesas com pessoal: Competência
  await ir(page, '#/despesas');
  await page.waitForSelector('#conteudo .jbf-comp', { timeout: 10000 });
  ok(!(await vis(page, '#conteudo [data-f="_mes_de"]')) && !(await vis(page, '#conteudo [data-f="_mes_ate"]')), 'Despesas: o par de meses virou o botão Competência');
  const nDesp = await linhas(page);
  await page.click('#conteudo .jbf-comp');
  ok(await vis(page, '.jbf-pop .jbf-gm'), 'Competência: abre a grade de meses');
  await page.click('.jbf-pop .jbf-pre button:has-text("Mês passado")');
  await esperaLinhas(page, 1);
  ok(nDesp === 2 && await linhas(page) === 1, `Competência "Mês passado": ${await linhas(page)} de ${nDesp}`);

  // Horas extras: Excluir com a confirmação de sempre
  await ir(page, '#/horasExtras');
  await page.waitForSelector('#corpoLista tbody tr[data-lc] .jbl-m', { timeout: 10000 });
  await page.click('#corpoLista tbody tr[data-lc] .jbl-m');
  const temExc = (await itensMenu(page)).includes('Excluir');
  ok(temExc, 'Horas extras: menu com Excluir (para quem pode editar)');
  if (temExc) {
    await page.click('.dc-pop button.perigo');
    const dlg = await page.waitForSelector('.veu .modal [data-r="0"]', { timeout: 8000 }).then(() => true).catch(() => false);
    ok(dlg && /Tem certeza/.test(await page.textContent('.veu .modal')), 'Excluir pede a confirmação de sempre antes de apagar');
    if (dlg) await page.click('.veu .modal [data-r="0"]');
    await page.waitForTimeout(400);
    ok(await page.evaluate(() => DATA.horasExtras.some((r) => r.id === 'th1')), 'cancelar a confirmação não apaga nada');
    await page.evaluate(() => { const b = document.querySelector('#camada [data-fechar]'); if (b) b.click(); });
    await page.waitForTimeout(300);
  }

  // Contas a pagar (barra .fi-filtros): Período, Mais filtros e menu
  await ir(page, '#/fpagar');
  await page.waitForSelector('#conteudo .jbf-per', { timeout: 10000 });
  ok(!(await vis(page, '#fpMes')) && !(await vis(page, '#fpDe')) && !(await vis(page, '#fpAte')), 'Contas a pagar: mês e datas dentro do botão Período');
  ok(await vis(page, '#conteudo .jbf-mais') && await page.evaluate(() => [...document.querySelectorAll('#conteudo .fi-filtros .jbf-x')].every((e) => !e.getClientRects().length)), 'Contas a pagar: filtros a mais guardados em "Mais filtros"');
  await page.click('#conteudo .jbf-per');
  await page.click('.jbf-pop .jbf-pre button:has-text("Este mês")');
  await page.waitForFunction(() => { const de = document.getElementById('fpDe'); return !!de && !!de.value; }, null, { timeout: 6000 }).catch(() => {});
  ok(await page.evaluate(() => { const h = new Date(); const m = h.getFullYear() + '-' + String(h.getMonth() + 1).padStart(2, '0'); const de = document.getElementById('fpDe'), ate = document.getElementById('fpAte'); return !!de && de.value === m + '-01' && !!ate && ate.value.startsWith(m); }), 'Contas a pagar: o Período escolhido chega aos campos da tela');
  await page.waitForSelector('#conteudo tr[data-oref] .jbl-m', { timeout: 8000 });
  await page.click('#conteudo tr[data-oref] .jbl-m');
  const it2 = await itensMenu(page);
  ok(['Visualizar', 'Imprimir', 'Compartilhar'].every((x) => it2.includes(x)), `Contas a pagar: menu com ${it2.join(', ')}`);
  await page.click('.dc-pop button:has-text("Visualizar")');
  await esperaDocumento(page);
  ok(await page.evaluate(() => location.hash === '#/documento' && !!document.getElementById('fvdDoc')), 'Contas a pagar: Visualizar abre o documento do compromisso');

  // trocar de tela fecha menu e calendário
  await ir(page, '#/vendas');
  await page.waitForSelector('#corpoLista .jbl-m', { timeout: 8000 });
  await page.click('#corpoLista tbody tr[data-lc] .jbl-m');
  await ir(page, '#/clientes');
  ok(!(await vis(page, '.dc-pop')) && !(await vis(page, '.jbf-pop')), 'trocar de tela fecha o menu aberto');

  // início do setor: sem mudança
  await ir(page, '#/setor-vendas');
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => !!document.querySelector('#conteudo .c2-home') && !document.querySelector('#conteudo .jbl-m, #conteudo .jbf-bt, #conteudo .jbl-ob')), 'início do setor continua como estava (sem botões novos)');

  const relevantes = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();

  /* ---------------- celular ---------------- */
  console.log('Celular');
  const m = await abrir({ width: 390, height: 800 });
  await ir(m.page, '#/vendas');
  await m.page.waitForSelector('#corpoLista .jbl-m', { timeout: 10000 });
  ok(await vis(m.page, '#corpoLista tbody tr[data-lc] .jbl-m'), 'celular: três pontos em cada lançamento');
  await m.page.click('#conteudo .lc-fbt');
  ok(await vis(m.page, '#conteudo .jbf-per'), 'celular: o Período fica junto dos filtros');
  await m.page.click('#conteudo .jbf-per');
  ok(await vis(m.page, '.jbf-pop'), 'celular: o calendário abre embaixo, na largura da tela');
  await m.page.click('.jbf-pop .jbf-pre button:has-text("Este mês")');
  await esperaLinhas(m.page, 2);
  ok(await linhas(m.page) === 2, `celular: Período aplicado (${await linhas(m.page)} de 3)`);
  ok(await m.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'celular: sem rolagem para o lado');
  const rel2 = m.erros.filter((x) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(x));
  ok(rel2.length === 0, `celular: sem erros de JavaScript${rel2.length ? ': ' + rel2.slice(0, 3).join(' | ') : ''}`);
  await m.ctx.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nFiltros e lançamentos (V129): tudo certo.');
process.exit(falhas ? 1 : 0);
