#!/usr/bin/env node
// Teste do Setor de Fichas e Documentação (V145, estrutura inicial), no programa REAL (saida/claude.html)
// num Chromium com o banco central simulado. Nada sai para a internet. Confere, no computador e no celular:
//   1. o setor aparece no menu principal (seleção de setores), na troca de setor e na pesquisa
//   2. a página inicial mostra só os módulos de fichas (nenhum cadastrado: aviso no lugar dos cartões)
//      e as funções previstas como EM BREVE; sem painel, gráfico, indicador ou resumo
//   3. a página de uma ficha tem Últimas emitidas, Informações e Emitir ficha (em breve: não faz nada)
//   4. navegação direta, Voltar linear e aviso para endereço de ficha que não existe
//   5. com fichas de teste (só na memória do teste, nunca no programa): cartões, filtro por categoria,
//      página da ficha com as informações, pesquisa; a página de estrutura sai do caminho
//   6. nada é gravado no banco
// Uso: node scripts/construir.mjs && node scripts/testar-fichas.mjs
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

const DOCS = [['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção' }]];
const iniciar = ({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Jeferson Teste', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Jeferson Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const NOME = 'Setor de Fichas e Documentação';
const EM_BREVE = ['Emissão e impressão de fichas', 'Preenchimento de fichas', 'Digitalização por scanner ou fotografia',
  'Importação de arquivos e documentos', 'Leitura automática por OCR e inteligência artificial', 'Identificação de informações das fichas',
  'Atualização automática dos setores correspondentes', 'Histórico e armazenamento digital', 'Integração com Produção, Lenha, Combustível, Vendas e demais setores'];
const INFO = ['Identificação', 'Finalidade', 'Campos', 'Movimentos', 'Setor responsável'];

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  for (const vp of [{ nome: 'computador', ctx: { viewport: { width: 1300, height: 900 } } }, { nome: 'celular', ctx: { viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true } }]) {
    console.log(`\n${vp.nome}:`);
    const cel = vp.nome === 'celular';
    const ctx = await browser.newContext(vp.ctx);
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado === true, null, { timeout: 40000 });
    await page.waitForTimeout(400);
    const w = (ms = 350) => page.waitForTimeout(ms);
    const hash = () => page.evaluate(() => location.hash);
    const ir = async (h) => { await page.evaluate((x) => JBNAV.ir(x), h); await page.waitForFunction((x) => location.hash === x, h, { timeout: 8000 }).catch(() => {}); await w(); };
    const txt = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; }, sel);
    const conta = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
    const visivel = (sel) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }, sel);
    /* o que está no banco, menos o que o próprio programa grava sozinho em qualquer tela (contador de uso
       e conferência diária automática): esses não são dados da cerâmica */
    const SISTEMA = ['uso', 'diagnostico'];
    const foto = () => page.evaluate((S) => JSON.stringify([...window.__srv.estado.docs.values()].filter((d) => !S.includes(d.colecao)).map((d) => [d.colecao, d.id, d.versao]).sort()), SISTEMA);
    /* coleções de cada gravação enviada ao banco (a ponte manda o lote em base64) */
    const gravacoes = () => page.evaluate(() => window.__srv.estado.chamadas.filter((c) => /jbcore\.aplicar\(/.test(c.query || '')).flatMap((c) => {
      const m = /decode\('([^']+)'/.exec(c.query); if (!m) return ['?'];
      try { const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(m[1]), (x) => x.charCodeAt(0)))); return (j.ops || []).map((o) => o.colecao); } catch (e) { return ['?']; } }));
    const banco0 = await foto(); const grav0 = (await gravacoes()).length;

    console.log('1. Menu principal');
    await ir('#/setores'); await page.waitForSelector('[data-setor="fichas"]', { timeout: 15000 });
    const card = await page.evaluate(() => { const b = document.querySelector('[data-setor="fichas"]'); const c = b.closest('.spot-card');
      const ids = [...document.querySelectorAll('[data-setor]')].map((x) => x.dataset.setor);
      return { t: c.querySelector('h2').textContent.trim(), d: c.querySelector('p').textContent.trim(), info: (c.querySelector('.spot-info') || {}).textContent, depois: ids[ids.indexOf('fichas') - 1], ic: !!c.querySelector('.spot-ic svg rect') }; });
    ok(card.t === NOME && /Central das fichas, documentos e controles/.test(card.d) && card.ic, 'cartão do setor na seleção de setores, com nome, descrição e ícone próprios');
    ok(card.info === 'Nenhuma ficha cadastrada ainda', 'o cartão avisa que nenhuma ficha foi cadastrada ainda: ' + card.info);
    ok(card.depois === 'control', 'o cartão vem depois do último setor (Controladoria e Análise): depois de ' + card.depois);
    await page.click('[data-setor="fichas"]');
    await page.waitForFunction(() => location.hash === '#/setor-fichas', null, { timeout: 8000 }).catch(() => {}); await w(500);
    ok(await hash() === '#/setor-fichas', '"Entrar no setor" abre o início do setor direto');

    console.log('2. Página inicial do setor');
    const topo = await page.evaluate(() => ({ nl: (document.querySelector('#c2snome .c3-nl') || {}).textContent, nc: (document.querySelector('#c2snome .c3-nc') || {}).textContent, ic: !!document.querySelector('#c2sic svg rect') }));
    ok(topo.nl === NOME && topo.nc === 'Fichas' && topo.ic, `topo com o nome do setor (${cel ? 'no celular, "Fichas"' : 'nome completo'}) e o ícone`);
    ok(await conta('#conteudo .c2-home') === 1 && await visivel('.fd-home h1') && /^(Bom dia|Boa tarde|Boa noite), Jeferson$/.test(await txt('.fd-home h1')), 'saudação no mesmo desenho do início dos outros setores: ' + await txt('.fd-home h1'));
    ok(/• Setor de Fichas e Documentação hoje$/.test(await txt('.fd-home .c2-ola p')), 'data e nome do setor abaixo da saudação');
    ok(await txt('.fd-mods .c2-st h2') === 'Módulos' && await conta('.fd-mods .c2-tile') === 0 && await visivel('.fd-vazio'), 'seção Módulos sem nenhum cartão inventado, com o aviso no lugar');
    ok(/^Nenhuma ficha cadastrada ainda/.test(await txt('.fd-vazio .fd-vz-tx')), 'aviso: "Nenhuma ficha cadastrada ainda"');
    const painel = await conta('#conteudo .hero, #conteudo .kpi, #conteudo canvas, #conteudo .c2-nivel, #conteudo .c2-favblk, #conteudo .c2-alblk, #conteudo .pp, #conteudo .bloco, #conteudo .c2-bbusca');
    ok(painel === 0, 'sem painel, gráfico, indicador, resumo ou atalhos a mais (encontrados: ' + painel + ')');
    const breve = await page.evaluate(() => [...document.querySelectorAll('.fd-breve .fd-chips li')].map((l) => l.textContent.trim()));
    ok(JSON.stringify(breve) === JSON.stringify(EM_BREVE), 'as 9 funções previstas aparecem, com o texto da lista do dono');
    ok(/^em breve$/i.test(await txt('.fd-breve .fi-breve-tag')) && await conta('.fd-breve a, .fd-breve button') === 0, 'marcadas como EM BREVE e sem nenhum botão ou link ligado');
    ok(await conta('#conteudo .c2-acesso') === 1, 'o topo não injeta outro início por cima (uma seção de módulos só)');
    await w(150);
    ok(await page.evaluate(() => { const a = ABAS.lista.find((x) => x.k === ABAS.ativa); return a && a.titulo; }) === NOME, 'aba de trabalho com o nome do setor');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nada passa da largura da tela');
    if (cel) {
      const mob = await page.evaluate(() => [...document.querySelectorAll('#c2mob a, #c2mob button')].map((x) => x.textContent.trim()));
      ok(mob.join('|') === 'Início|Funções|Setores', 'barra de baixo do celular igual à dos outros setores: ' + mob.join(', '));
    } else {
      await page.click('[data-c2=funcoes]>button'); await w(300);
      const mega = await page.evaluate(() => ({ t: (document.querySelector('#c2mega h4') || {}).textContent, its: [...document.querySelectorAll('#c2mega .c2-mega-corpo a')].map((a) => a.textContent.trim()) }));
      ok(mega.t === 'Funções do Setor de Fichas e Documentação' && mega.its.join('|') === 'Início', 'botão Módulos do topo: as telas do setor (por enquanto, só o Início)');
      await page.keyboard.press('Escape'); await w(150);
      await page.click('[data-c2=setor]>button'); await w(300);
      ok(await page.evaluate(() => [...document.querySelectorAll('#c2setores [data-c2setor]')].some((a) => a.dataset.c2setor === 'fichas' && a.classList.contains('on'))), 'troca de setor do topo mostra o setor (marcado)');
      await page.keyboard.press('Escape'); await w(150);
    }
    const pq = await page.evaluate(() => (pqBuscar('fichas') || []).flatMap((g) => g.itens.map((i) => i.t + '→' + i.h)));
    ok(pq.includes(NOME + '→#/setor-fichas'), 'a pesquisa do topo acha o setor por "fichas"');

    console.log('3. Página de uma ficha (estrutura)');
    await page.click('.fd-vazio a.btn');
    await page.waitForFunction(() => location.hash === '#/setor-fichas/estrutura', null, { timeout: 8000 }).catch(() => {}); await w(400);
    ok(await hash() === '#/setor-fichas/estrutura', 'o botão do aviso abre a página de estrutura direto');
    ok(await txt('#conteudo .sec-cab h1') === 'Como fica a página de uma ficha' && /Nada aqui é registrado/.test(await txt('#conteudo .sec-cab p')), 'título e explicação da página');
    ok(await txt('.fd-ult h3') === 'Últimas emitidas' && /^Nenhuma ficha emitida\./.test(await txt('.fd-ult .ex-vazio')), 'Últimas emitidas: lista vazia');
    const info = await page.evaluate(() => [...document.querySelectorAll('.fd-info dl > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]));
    ok(await txt('.fd-info h3') === 'Informações' && JSON.stringify(info.map((x) => x[0])) === JSON.stringify(INFO) && info.every((x) => x[1] === 'A definir'), 'Informações: identificação, finalidade, campos, movimentos e setor responsável, todos "A definir"');
    const em = await page.evaluate(() => { const b = document.querySelector('[data-fd-emitir]'); return b && { t: b.textContent.replace(/\s+/g, ' ').trim(), d: b.getAttribute('aria-disabled'), pri: b.classList.contains('pri') }; });
    ok(em && /^Emitir ficha\s*Em breve$/i.test(em.t) && em.d === 'true' && em.pri, 'botão Emitir ficha no alto, marcado como EM BREVE');
    const antesH = await hash(); await page.click('[data-fd-emitir]', { force: true }); await w(300);   /* aria-disabled: o Playwright só clica forçando, como o dedo da pessoa */
    ok(await hash() === antesH && await conta('.modal, .gaveta, .veu') === 0 && /em breve/i.test((await page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).join(' '))) || ''), 'Emitir ficha não abre nada nem grava: só avisa que vem em breve');
    const pos = await page.evaluate(() => { const a = document.querySelector('.fd-ult').getBoundingClientRect(), b = document.querySelector('.fd-info').getBoundingClientRect(); return { lado: Math.abs(a.top - b.top) < 2 && b.left > a.right, emb: b.top >= a.bottom }; });
    ok(cel ? pos.emb : pos.lado, cel ? 'no celular as partes ficam uma abaixo da outra' : 'no computador as partes ficam lado a lado, alinhadas');

    console.log('4. Navegação');
    const voltar = async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('[data-jb-voltar]')].find((x) => !x.disabled); if (b) b.click(); }); await w(400); };
    await voltar(); const v1 = await hash(); await voltar(); const v2 = await hash();
    ok(v1 === '#/setor-fichas' && v2 === '#/setores', 'Voltar recua uma tela por clique: ' + [v1, v2].join(' → '));
    await ir('#/setor-fichas/nao-existe');
    ok(await txt('#conteudo .vazio b') === 'Ficha não encontrada' && await page.evaluate(() => !!document.querySelector('#conteudo .vazio a[href="#/setor-fichas"]')), 'endereço de ficha que não existe: aviso e caminho de volta ao início do setor');

    console.log('5. Com fichas de teste (só na memória deste teste)');
    await page.evaluate(() => { const F = window.JB_FICHAS_DOC;
      F.CATEGORIAS.push({ id: 'catA', nome: 'Categoria A', cor: 'yel' }, { id: 'catB', nome: 'Categoria B', cor: 'tea' });
      F.MODULOS.push({ id: 'ficha-teste', nome: 'Ficha de teste', cat: 'catA', desc: 'Só para o teste.', finalidade: 'Conferir a estrutura', campos: ['Data', 'Responsável'], movimentos: ['Entrada'], setor: 'Setor de Produção' },
        { id: 'ficha-teste-2', nome: 'Outra ficha de teste', cat: 'catB' }); });
    await ir('#/setores'); await page.waitForSelector('[data-setor="fichas"]');
    ok(await page.evaluate(() => (document.querySelector('[data-setor="fichas"]').closest('.spot-card').querySelector('.spot-info') || {}).textContent) === '2 fichas disponíveis', 'o cartão do setor conta as fichas');
    await page.click('[data-setor="fichas"]'); await page.waitForFunction(() => location.hash === '#/setor-fichas', null, { timeout: 8000 }).catch(() => {}); await w(500);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('.fd-mods .c2-tile')].map((t) => t.textContent.trim()));
    ok(tiles.join('|') === 'Ficha de teste|Outra ficha de teste' && await conta('.fd-vazio') === 0, 'cada ficha vira um cartão no mesmo desenho dos módulos dos outros setores');
    const chips = await page.evaluate(() => [...document.querySelectorAll('.fd-mods .c2-chip')].map((c) => c.textContent.trim()));
    ok(chips.join('|') === 'Todas|Categoria A|Categoria B', 'categorias viram filtros acima dos cartões: ' + chips.join(', '));
    await page.click('.fd-mods .c2-chip[data-fdcat="catA"]'); await w(150);
    const vis1 = await page.evaluate(() => [...document.querySelectorAll('.fd-mods .c2-tile')].filter((t) => t.offsetParent !== null).map((t) => t.textContent.trim()));
    await page.click('.fd-mods .c2-chip[data-fdcat=""]'); await w(150);
    ok(vis1.join('|') === 'Ficha de teste' && await page.evaluate(() => [...document.querySelectorAll('.fd-mods .c2-tile')].every((t) => t.offsetParent !== null)), 'filtro por categoria mostra só as fichas dela; "Todas" mostra todas');
    if (!cel) {
      await page.click('[data-c2=funcoes]>button'); await w(300);
      ok(await page.evaluate(() => [...document.querySelectorAll('#c2mega .c2-mega-corpo a')].map((a) => a.textContent.trim()).join('|')) === 'Início|Ficha de teste|Outra ficha de teste', 'botão Módulos do topo lista as fichas');
      await page.keyboard.press('Escape'); await w(150);
    }
    await page.click('.fd-mods .c2-tile[data-k="ficha-teste"]');
    await page.waitForFunction(() => location.hash === '#/setor-fichas/ficha-teste', null, { timeout: 8000 }).catch(() => {}); await w(400);
    const pf = await page.evaluate(() => ({ h1: document.querySelector('#conteudo .sec-cab h1').textContent, dd: [...document.querySelectorAll('.fd-info dd')].map((d) => d.textContent), ult: !!document.querySelector('.fd-ult .ex-vazio'), em: (document.querySelector('[data-fd-emitir]') || {}).getAttribute && document.querySelector('[data-fd-emitir]').getAttribute('aria-disabled') }));
    ok(await hash() === '#/setor-fichas/ficha-teste' && pf.h1 === 'Ficha de teste' && pf.ult && pf.em === 'true', 'clicar no cartão abre a página da ficha: últimas emitidas, informações e Emitir ficha');
    ok(JSON.stringify(pf.dd) === JSON.stringify(['Ficha de teste', 'Conferir a estrutura', 'Data, Responsável', 'Entrada', 'Setor de Produção']), 'as informações da ficha vêm do cadastro dela: ' + pf.dd.join(' / '));
    await w(150);
    ok(await page.evaluate(() => { const a = ABAS.lista.find((x) => x.k === ABAS.ativa); return a && a.titulo; }) === 'Fichas e Documentação · Ficha de teste', 'aba de trabalho com o nome da ficha');
    ok((await page.evaluate(() => (pqBuscar('ficha de teste') || []).flatMap((g) => g.itens.map((i) => i.h)))).includes('#/setor-fichas/ficha-teste'), 'a pesquisa do topo acha a ficha');
    await ir('#/setor-fichas/estrutura'); await page.waitForFunction(() => location.hash === '#/setor-fichas', null, { timeout: 8000 }).catch(() => {}); await w(300);
    ok(await hash() === '#/setor-fichas', 'com fichas cadastradas, a página de estrutura leva ao início do setor');
    await page.evaluate(() => { const F = window.JB_FICHAS_DOC; F.MODULOS.splice(0); F.CATEGORIAS.splice(0); });
    await ir('#/setores'); await page.click('[data-setor="fichas"]'); await page.waitForFunction(() => location.hash === '#/setor-fichas', null, { timeout: 8000 }).catch(() => {}); await w(400);
    ok(await conta('.fd-mods .c2-tile') === 0 && await visivel('.fd-vazio') && await conta('.fd-mods .c2-chip') === 0, 'sem as fichas de teste, volta ao aviso "Nenhuma ficha cadastrada ainda"');

    console.log('6. Banco');
    await w(600);
    const novas = (await gravacoes()).slice(grav0).filter((c) => !SISTEMA.includes(c));
    ok(await foto() === banco0 && novas.length === 0, 'nada foi gravado, alterado ou apagado no banco' + (novas.length ? ': ' + novas.join(', ') : ''));
    ok(await page.evaluate(() => JSON.stringify(window.JB_FICHAS_DOC.MODULOS) === '[]' && JSON.stringify(window.JB_FICHAS_DOC.CATEGORIAS) === '[]'), 'o programa não traz nenhuma ficha nem categoria por suposição');
    ok(erros.length === 0, 'nenhum erro de JavaScript' + (erros.length ? ': ' + [...new Set(erros)].slice(0, 3).join(' | ') : ''));
    await ctx.close();
  }
} catch (e) { console.error(e); falhas++; }
finally { await browser.close(); http.close(); }
console.log(falhas ? `\n${falhas} FALHA(S) no Setor de Fichas e Documentação` : '\nSetor de Fichas e Documentação: todos os testes passaram (computador e celular).');
process.exit(falhas ? 1 : 0);
