#!/usr/bin/env node
// Teste de ponta a ponta do SETOR DE VENDAS simples (V110), no programa REAL (saida/claude.html)
// num Chromium, com o banco central simulado (scripts/lib/servidor-falso.mjs). Nada sai para a
// internet e só se usam dados fictícios. Confere, em computador e celular:
//   início simples (atalhos e números reais), cadastro rápido de cliente sem sair do pedido,
//   cartões de produto, cálculo, pedido confirmado e gravado no banco, janela de impressão,
//   ticket 58/80 mm (impressão e PDF), comprovante A4, reimpressão pela lista, venda direta
//   finalizada, orçamento salvo e convertido em pedido, simulação que não grava nada,
//   consulta com filtro por produto, permissões e tela sem rolagem para o lado.
// Uso: node scripts/construir.mjs && node scripts/testar-vendas.mjs
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

// dados fictícios (nenhum dado real)
const DOCS = [
  ['tiposProduto', 't1', { id: 't1', nome: 'Tijolo de vedação', setor: 'vendas', situacao: 'Ativo' }],
  ['produtos', 'p1', { id: 'p1', setor: 'vendas', nome: 'Tijolo 8 furos (teste)', codigo: 'T8', unidade: 'milheiro', precoVenda: 650, tipoId: 't1', situacao: 'Ativo', controlaEstoque: 'Não' }],
  ['produtos', 'p2', { id: 'p2', setor: 'vendas', nome: 'Tijolo 6 furos (teste)', codigo: 'T6', unidade: 'milheiro', precoVenda: 580, tipoId: 't1', situacao: 'Ativo', controlaEstoque: 'Não' }],
  ['clientes', 'c1', { id: 'c1', codigo: 'C0001', tipoPessoa: 'Jurídica', razao: 'Construtora Exemplo Teste', cnpj: '11.444.777/0001-61', cidade: 'Cidade Teste', uf: 'MA', situacao: 'Ativo' }],
  ['clientes', 'c9', { id: 'c9', codigo: 'C0009', tipoPessoa: 'Física', razao: 'Cliente Inativo Exemplo', cidade: 'Cidade Teste', situacao: 'Inativo' }],
  // faixa de quantidade: a partir de 20 milheiros, o 8 furos sai a R$ 600
  ['precos', 'r1', { id: 'r1', produtoId: 'p1', tabela: 'Geral', qtdMin: 20, preco: 600, situacao: 'Ativo' }],
];
const iniciar = ({ codigo, docs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono Teste', papel: 'admin', ativo: true });
  docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  // impressão: guarda o que iria para a impressora (o diálogo do navegador não abre no teste)
  window.__impressoes = [];
  window.print = () => { window.dispatchEvent(new Event('beforeprint')); const b = document.getElementById('printDoc'); const st = document.getElementById('tkPagina'); window.__impressoes.push({ html: b ? b.innerHTML : '', pagina: st ? st.textContent : '' }); };
};

// jsPDF: no teste a internet fica fechada; se a biblioteca estiver instalada (npm), ela é servida no lugar da CDN
let JSPDF = process.env.JB_JSPDF || null;
try { JSPDF = JSPDF || createRequire(import.meta.url).resolve('jspdf/dist/jspdf.umd.min.js'); } catch {}
const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const ir = async (page, h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(600); };
const noBanco = (page, col, id) => page.evaluate(([c, i]) => [...window.__srv.estado.docs.values()].filter((d) => d.colecao === c).map((d) => JSON.stringify(d.dados)).find((t) => t.includes('"id":"' + i + '"')) || null, [col, id]);
const semRolagemLado = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
const confirmarDialogo = async (page) => { await page.waitForSelector('.veu .modal [data-r="1"]', { timeout: 5000 }); await page.click('.veu .modal [data-r="1"]'); };

try {
  for (const vp of [{ width: 1300, height: 900, nome: 'computador' }, { width: 390, height: 820, nome: 'celular' }]) {
    console.log(`\n${vp.nome}:`);
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    if (JSPDF && existsSync(JSPDF)) await ctx.route(/jspdf(\.umd)?(\.min)?\.js$|jspdf@[^/]+\/dist\/jspdf\.umd\.min\.js$/, (r) => r.fulfill({ contentType: 'text/javascript', body: readFileSync(JSPDF, 'utf8') }));
    const page = await ctx.newPage();
    const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso, docs: DOCS });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.produtos.length >= 2 && DATA.clientes.length >= 1, null, { timeout: 30000 });

    /* ---------- 1. início simples ---------- */
    await ir(page, '#/setor-vendas');
    await page.waitForSelector('.vs-atalhos', { timeout: 10000 }).catch(() => {});
    const ini = await page.evaluate(() => ({
      atalhos: [...document.querySelectorAll('.vs-atalhos .vs-at b')].map((b) => b.textContent),
      kpis: [...document.querySelectorAll('#svCorpo .hero .kpi .l')].map((b) => b.textContent),
      abas: ABAS_V('vendas').map((a) => a.l),
      ola: !!document.querySelector('.c2-home'),
    }));
    ok(ini.atalhos.join('|') === 'Novo pedido|Nova venda|Clientes|Produtos|Orçamentos|Simulação|Relatórios|Consultar pedidos', `8 atalhos grandes: ${ini.atalhos.join(', ')}`);
    ok(ini.kpis.length === 6 && ini.kpis.includes('Vendas do dia') && ini.kpis.includes('Pedidos em aberto') && ini.kpis.includes('Orçamentos no mês'), `poucos números na tela inicial (${ini.kpis.length})`);
    ok(ini.abas.includes('Nova venda') && ini.abas.includes('Consultar pedidos') && ini.abas.includes('Simular venda') && ini.abas.includes('Painel completo') && ini.abas.indexOf('Novo pedido') < ini.abas.indexOf('Nova venda'), 'abas com nomes simples, Simulação e Painel completo');
    ok(ini.ola, 'a saudação e o cabeçalho de hoje continuam (casca nova)');
    ok(await semRolagemLado(page), 'início sem rolagem para o lado');
    await page.screenshot({ path: join(RAIZ, `saida/vendas-inicio-${vp.nome}.png`), fullPage: true });

    /* ---------- 2. novo pedido: cadastro rápido, cartões, cálculo ---------- */
    await ir(page, '#/pedido/novo');
    await page.waitForSelector('[data-vscad]', { timeout: 10000 });
    ok(await page.evaluate(() => document.querySelectorAll('#frmV>fieldset.sec').length >= 4 && !document.querySelector('#frmV legend .vs-n') && /em aberto/.test(document.querySelector('.sec-cab .sec-id p').textContent)), 'etapas numeradas (uma vez só) e explicação de pedido x venda no subtítulo');
    ok(await page.evaluate(() => /Cancelar operação/.test(document.querySelector('#cmLimpar').textContent)), 'botão "Cancelar operação"');
    await page.click('[data-vscad]');
    await page.fill('#qcNome', 'Construtora Exemplo');
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => /Parecido com cliente já cadastrado/.test(document.getElementById('qcDup').textContent)), 'cadastro rápido avisa cliente parecido (duplicidade)');
    await page.fill('#qcNome', 'Inativo Exemplo');
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => /Cliente Inativo Exemplo/.test(document.getElementById('qcDup').textContent) && !document.querySelector('#qcDup [data-usar="c9"]')), 'cliente inativo aparece como parecido, mas sem o botão "Usar este"');
    ok(await page.evaluate(() => document.getElementById('qcUf').value === ''), 'Estado começa vazio (nada é marcado sozinho)');
    await page.fill('#qcNome', 'Maria Teste da Silva');
    await page.fill('#qcDoc', '52998224725');
    await page.fill('#qcWa', '98999990000');
    await page.fill('#qcCid', 'Cidade Teste');
    ok(await page.evaluate(() => document.getElementById('qcTipo').value === 'Física'), 'CPF com 11 números marca pessoa física sozinho');
    await page.click('[data-salvar]');
    await page.waitForFunction(() => RASC_C.ped && RASC_C.ped.clienteId && CLI(RASC_C.ped.clienteId), null, { timeout: 10000 }).catch(() => {});
    const cliId = await page.evaluate(() => RASC_C.ped && RASC_C.ped.clienteId);
    const cli = await page.evaluate((id) => CLI(id), cliId);
    ok(cli && cli.razao === 'Maria Teste da Silva' && cli.cpf === '52998224725' && /^C\d{4}$/.test(cli.codigo || ''), `cliente cadastrado sem sair do pedido (código ${cli && cli.codigo})`);
    ok(!!(await noBanco(page, 'clientes', cliId)), 'cliente gravado no banco central');
    ok(await page.evaluate(() => document.getElementById('cmCli').value === RASC_C.ped.clienteId), 'cliente novo já escolhido no pedido');
    // cartões: dois produtos, quantidades
    await page.click('[data-vsp="p1"]');
    await page.waitForTimeout(150);
    await page.click('[data-vsp="p2"]');
    await page.waitForTimeout(150);
    const linhas = await page.evaluate(() => [...document.querySelectorAll('#cmItens select[data-ci="produtoId"]')].map((s) => s.value));
    ok(linhas.join(',') === 'p1,p2', `um toque no cartão inclui o produto (${linhas.join(',')})`);
    const preencherQtd = async (k, q) => { const s = `#cmItens tr[data-li="${k}"] input[data-ci="qtd"]`; await page.fill(s, String(q)); await page.dispatchEvent(s, 'change'); await page.waitForTimeout(120); };
    await preencherQtd(0, 10); await preencherQtd(1, 5);
    const calc = await page.evaluate(() => { const c = calcComV(RASC_C.ped); return { sub: c.subtotal, tot: c.total }; });
    ok(calc.sub === 9400 && calc.tot === 9400, `subtotal e total automáticos (10 × 650 + 5 × 580 = ${calc.tot})`);
    ok(await page.evaluate(() => /No pedido: 10/.test(document.querySelector('[data-vsp="p1"]').textContent)), 'cartão mostra a quantidade que está no pedido');
    // desconto dentro do permitido (o administrador pode aprovar)
    await page.selectOption('#cmDescTipo', 'valor').catch(() => {});
    await page.fill('#cmDesc', '400,00'); await page.dispatchEvent('#cmDesc', 'input'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => calcComV(RASC_C.ped).total === 9000), 'desconto de R$ 400,00 aplicado no total (R$ 9.000,00)');
    ok(await page.evaluate(() => /Salvar pedido \(sem confirmar\)/.test(document.getElementById('cmResumo').textContent)), 'botão "Salvar pedido (sem confirmar)"');
    await page.screenshot({ path: join(RAIZ, `saida/vendas-pedido-${vp.nome}.png`), fullPage: vp.nome === 'computador' });
    ok(await semRolagemLado(page), 'novo pedido sem rolagem para o lado');
    // confirmar
    await page.click('#cmEnviar');
    await confirmarDialogo(page);
    await page.waitForSelector('.vs-imp', { timeout: 12000 }).catch(() => {});
    const pedId = await page.evaluate(() => (location.hash.match(/#\/venda\/(.+)$/) || [])[1]);
    const ped = await page.evaluate((id) => VEN(id), pedId);
    ok(ped && ped.fluxo === 'pedido' && ped.total === 9000 && ped.clienteId === cliId && ped.numero >= 1, `pedido nº ${ped && ped.numero} confirmado (situação: ${ped && ped.status})`);
    ok(ped && ped.status !== 'Concluída' && ped.status !== 'Concluído', 'pedido confirmado continua em aberto (não vira venda concluída)');
    ok(!!(await noBanco(page, 'vendas', pedId)), 'pedido gravado no banco central');
    ok(await page.evaluate(() => !!document.querySelector('.vs-imp') && /Pronto/.test(document.querySelector('.vs-imp h3').textContent)), 'janela de impressão abre sozinha depois de confirmar');
    const prev = await page.evaluate(() => { const t = document.querySelector('.vs-imp .cupom'); return { cls: t.className, txt: t.textContent }; });
    ok(/w(80|58)/.test(prev.cls) && /Nº 0+\d+/.test(prev.txt) && /Maria Teste da Silva/.test(prev.txt) && /TOTAL/.test(prev.txt) && /sem valor fiscal/.test(prev.txt), 'ver antes de imprimir: cupom não fiscal com número, cliente, total e aviso de não fiscal');
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove())); await page.waitForTimeout(700);
    await page.screenshot({ path: join(RAIZ, `saida/vendas-impressao-${vp.nome}.png`) });
    // ticket 58 e 80 mm
    await page.click('.vs-imp [data-l="58"]');
    ok(await page.evaluate(() => document.querySelector('.vs-imp .cupom').classList.contains('w58')), 'troca para o papel de 58 mm');
    await page.click('.vs-imp [data-i="ticket"]');
    await page.waitForTimeout(1100);
    await page.click('.vs-imp [data-l="80"]');
    await page.click('.vs-imp [data-i="ticket"]');
    await page.waitForTimeout(1100);
    const imp = await page.evaluate(() => window.__impressoes.slice(-2));
    ok(imp.length === 2 && /size:58mm \d+mm/.test(imp[0].pagina) && /size:80mm \d+mm/.test(imp[1].pagina), `ticket impresso em 58 mm e em 80 mm (${imp.map((i) => (i.pagina.match(/size:[^;]+/) || [''])[0]).join(' · ')})`);
    ok(imp.every((i) => /cp-numero/.test(i.html) && /cupom w(58|80)/.test(i.html) && /CUPOM NÃO FISCAL/.test(i.html) && !/fvd/.test(i.html)), 'só o cupom vai para a impressora, com desenho próprio de cupom não fiscal (não é o A4 reduzido)');
    ok(await page.evaluate(() => !document.body.classList.contains('imprime-doc') && !document.getElementById('printDoc')), 'depois de imprimir, a tela volta ao normal');
    // PDF do ticket
    const temPdf = await page.waitForFunction(() => window.jspdf && window.jspdf.jsPDF, null, { timeout: 8000 }).then(() => true).catch(() => false);
    if (temPdf) {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.click('.vs-imp [data-i="pdf"]')]);
      let tam = '';
      if (dl) { const b = readFileSync(await dl.path()); const m = /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(b.toString('latin1')); tam = m ? (m[1] * 25.4 / 72).toFixed(0) + ' × ' + (m[2] * 25.4 / 72).toFixed(0) + ' mm' : ''; }
      ok(!!dl && /_ticket_80mm\.pdf$/.test(dl.suggestedFilename()) && /^80 ×/.test(tam), `ticket em PDF na largura do papel (${dl ? dl.suggestedFilename() + ', ' + tam : 'nenhum arquivo'})`);
    } else {
      await page.click('.vs-imp [data-i="pdf"]');
      ok(await page.evaluate(() => [...document.querySelectorAll('.toast')].some((t) => /biblioteca de PDF não carregou/.test(t.textContent))), 'sem a biblioteca de PDF (internet fechada): aviso claro, nada quebra');
    }
    // A4
    await page.click('.vs-imp [data-i="a4"]');
    await page.waitForSelector('#fvdDoc', { timeout: 8000 }).catch(() => {});
    const a4 = await page.evaluate(() => document.getElementById('fvdDoc') ? document.getElementById('fvdDoc').textContent : '');
    ok(/PEDIDO DE VENDA/.test(a4) && /Maria Teste da Silva/.test(a4) && /Forma prevista/.test(a4) && /sem valor fiscal/.test(a4), 'comprovante completo (A4) com cliente, produtos, pagamento e aviso de não fiscal');

    /* ---------- 3. reimpressão: tela do pedido e lista ---------- */
    await ir(page, '#/venda/' + pedId);
    await page.waitForSelector('[data-vsimp]', { timeout: 8000 }).catch(() => {});
    await page.click('.sec-cab [data-vsimp]');
    ok(await page.waitForSelector('.vs-imp', { timeout: 4000 }).then(() => true).catch(() => false), 'reimprimir pela tela do pedido');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    ok(await page.evaluate(() => !document.querySelector('.vs-imp')), 'tecla Esc fecha a janela de impressão');
    const histImp = await page.evaluate((id) => (typeof historicoHtml === 'function' ? historicoHtml('vendas', id) : ''), pedId);
    ok(!/imprimiu/.test(histImp), 'imprimir não grava nada no histórico');

    /* ---------- cartão não ocupa a linha de um produto desativado ou apagado ---------- */
    await ir(page, '#/venda/nova');
    await page.evaluate(() => { RASC_V.venda.itens = [{ produtoId: 'produto-apagado', qtd: 10, preco: 500 }]; renderTela(); });
    await page.waitForSelector('[data-vsp="p1"]', { timeout: 5000 });
    await page.click('[data-vsp="p1"]'); await page.waitForTimeout(200);
    const fant = await page.evaluate(() => RASC_V.venda.itens.map((i) => i.produtoId + ':' + i.qtd).join(','));
    ok(/^produto-apagado:10,p1:/.test(fant), `tocar no cartão não troca a linha de um produto desativado (${fant})`);
    await page.evaluate(() => { RASC_V.venda = null; });
    await ir(page, '#/setor-vendas');

    /* ---------- 4. nova venda (balcão) ---------- */
    await ir(page, '#/venda/nova');
    await page.waitForSelector('#vdCli', { timeout: 8000 });
    ok(await page.evaluate(() => /Finalizar venda/.test(document.getElementById('vdResumo').textContent)), 'botão "Finalizar venda"');
    await page.selectOption('#vdCli', '__cf');
    await page.click('[data-vsp="p2"]');
    await page.waitForTimeout(150);
    await page.fill('#vdItens tr[data-li="0"] input[data-vi="qtd"]', '2'); await page.dispatchEvent('#vdItens tr[data-li="0"] input[data-vi="qtd"]', 'input');
    await page.fill('#vdItens tr[data-li="0"] input[data-vi="preco"]', '550,00'); await page.dispatchEvent('#vdItens tr[data-li="0"] input[data-vi="preco"]', 'input');
    // escolher cliente pelo cadastro rápido ("Usar este") não pode trocar o preço combinado
    await page.click('[data-vscad]'); await page.fill('#qcNome', 'Construtora Exemplo'); await page.waitForTimeout(150);
    await page.click('#qcDup [data-usar="c1"]'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => RASC_V.venda.parteId === 'c1' && +RASC_V.venda.itens[0].preco === 550), 'Nova venda: cliente escolhido pelo cadastro rápido mantém o preço combinado (R$ 550,00)');
    await page.selectOption('#vdCli', '__cf'); await page.waitForTimeout(150);
    const conta = await page.evaluate(() => { const s = document.getElementById('vdConta'); const o = s && [...s.options].find((x) => x.value); if (o) { s.value = o.value; s.dispatchEvent(new Event('change', { bubbles: true })); } return o ? o.value : ''; });
    await page.waitForTimeout(150);
    const antes = await page.evaluate(() => DATA.vendas.length);
    await page.click('#vdOk');
    await confirmarDialogo(page);
    await page.waitForSelector('.vs-imp', { timeout: 12000 }).catch(() => {});
    const vid = await page.evaluate(() => (location.hash.match(/#\/venda\/(.+)$/) || [])[1]);
    const ven = await page.evaluate((id) => VEN(id), vid);
    ok(ven && !ven.fluxo && ven.status === 'Concluída' && ven.total === 1100 && (ven.cliente || {}).nome === 'Consumidor final', `venda direta nº ${ven && ven.numero} finalizada (${ven && ven.status}, R$ ${ven && ven.total}${conta ? '' : ', sem conta financeira'})`);
    ok(ven && ped && ven.numero === ped.numero + 1, `numeração automática e única (pedido ${ped && ped.numero}, venda ${ven && ven.numero})`);
    ok(!!(await noBanco(page, 'vendas', vid)) && (await page.evaluate(() => DATA.vendas.length)) === antes + 1, 'venda gravada no banco central (uma vez só)');
    ok(await page.evaluate(() => !!document.querySelector('.vs-imp') && location.hash.startsWith('#/venda/')), 'depois de finalizar: tela da venda e janela de impressão');
    await page.click('.vs-imp [data-fechar]');

    /* ---------- 5. simulação: não grava nada ---------- */
    const nDocs = await page.evaluate(() => [...window.__srv.estado.docs.values()].map((d) => d.colecao + '/' + d.id + ':' + d.versao).join('|'));
    await ir(page, '#/simular');
    await page.waitForSelector('.vs-sim', { timeout: 8000 });
    await page.click('[data-vsp="p1"]'); await page.waitForTimeout(100);
    await page.click('[data-vsp="p1"]'); await page.waitForTimeout(100);
    await page.click('[data-vsp="p2"]'); await page.waitForTimeout(100);
    await page.click('[data-s="mais"]'); await page.waitForTimeout(100);
    await page.fill('#smDesc', '10'); await page.dispatchEvent('#smDesc', 'input'); await page.waitForTimeout(100);
    const sim = await page.evaluate(() => document.getElementById('smRes').textContent);
    // p1: 3 × 650 = 1950; p2: 1 × 580 = 580; total 2530; 10% = 253; final 2277
    ok(/2\.277,00/.test(sim), 'simulação: quantidades, desconto simulado e valor final (R$ 2.277,00)');
    // faixa de quantidade da tabela de preço: 20 milheiros do 8 furos saem a R$ 600
    await page.fill('.vs-sim tr[data-sk="0"] [data-sq]', '20'); await page.dispatchEvent('.vs-sim tr[data-sk="0"] [data-sq]', 'input'); await page.waitForTimeout(150);
    const sim2 = await page.evaluate(() => ({ preco: document.querySelector('.vs-sim tr[data-sk="0"] [data-sp]').value, res: document.getElementById('smRes').textContent }));
    ok(sim2.preco === '600,00' && /11\.322,00/.test(sim2.res), `simulação segue a tabela por quantidade (20 × R$ ${sim2.preco}; final R$ 11.322,00)`);
    await page.screenshot({ path: join(RAIZ, `saida/vendas-simulacao-${vp.nome}.png`), fullPage: vp.nome === 'computador' });
    ok(await semRolagemLado(page), 'simulação sem rolagem para o lado');
    await page.click('[data-s="limpar"]'); await confirmarDialogo(page); await page.waitForTimeout(150);
    ok(await page.evaluate(() => !document.querySelector('.vs-sim tbody')), 'limpar e reiniciar a simulação');
    await page.waitForTimeout(400);
    const nDocs2 = await page.evaluate(() => [...window.__srv.estado.docs.values()].map((d) => d.colecao + '/' + d.id + ':' + d.versao).join('|'));
    // o autodiagnóstico diário do sistema grava sozinho (coleção "diagnostico"): fica fora da comparação
    const neg = (s) => s.split('|').filter((x) => !/^(diagnostico|uso|sinais)\//.test(x)).join('|');
    const dif = neg(nDocs2).split('|').filter((x) => !neg(nDocs).split('|').includes(x));
    ok(neg(nDocs) === neg(nDocs2), `simulação não gravou nada no banco${dif.length ? ' (mudou: ' + dif.join(', ') + ')' : ''}`);

    /* ---------- 6. orçamento a partir da simulação, salvo e convertido em pedido ---------- */
    await page.click('[data-vsp="p2"]'); await page.waitForTimeout(100);
    await page.click('[data-s="orc"]');
    await page.waitForSelector('#cmSalvar', { timeout: 8000 });
    ok(await page.evaluate(() => RASC_C.orc && RASC_C.orc.itens.length === 1 && RASC_C.orc.itens[0].produtoId === 'p2'), 'itens da simulação levados para o orçamento');
    await page.selectOption('#cmCli', 'c1'); await page.waitForTimeout(150);
    await page.evaluate(() => { const v = document.getElementById('cmVal'); if (v && !v.value) { v.value = addDias(hoje(), 10); v.dispatchEvent(new Event('input', { bubbles: true })); } });
    await page.click('#cmSalvar');
    await page.waitForFunction(() => /#\/orcamento\/(?!novo)[^/]+$/.test(location.hash), null, { timeout: 10000 }).catch(() => {});
    const oid = await page.evaluate(() => (location.hash.match(/#\/orcamento\/(.+)$/) || [])[1]);
    await page.waitForFunction((id) => ORC(id), oid, { timeout: 8000 }).catch(() => {});
    const vendasAntesOrc = await page.evaluate(() => DATA.vendas.length);
    if (!oid || oid === 'novo') console.log('    (orçamento: ' + await page.evaluate(() => location.hash + ' · ' + [...document.querySelectorAll('.toast,#cmResumo .vd-avisos li')].map((t) => t.textContent).join(' | ')) + ')');
    ok(!!(await noBanco(page, 'orcamentos', oid)) && vendasAntesOrc === antes + 1, 'orçamento gravado, sem criar venda');
    await ir(page, '#/orcamento/' + oid);
    await page.click('.sec-cab [data-vsimp]');
    const tOrc = await page.evaluate(() => document.querySelector('.vs-imp .cupom').textContent);
    ok(/ORÇAMENTO/.test(tOrc) && /Válido até/.test(tOrc), 'ticket do orçamento com validade');
    await page.click('.vs-imp [data-fechar]');
    await page.click('[data-oa="aprovado"]'); await confirmarDialogo(page).catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => { const m = document.querySelector('.veu .modal [data-ok]'); if (m) m.click(); });
    await page.waitForFunction((id) => ORC(id) && ORC(id).status === 'Aprovado', oid, { timeout: 8000 }).catch(() => {});
    await ir(page, '#/orcamento/' + oid);
    await page.click('[data-oa="converter"]').catch(() => {});
    await page.waitForTimeout(400);
    await page.evaluate(() => { const m = document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]'); if (m) m.click(); });
    await page.waitForFunction(() => /#\/venda\/[^/]+$/.test(location.hash), null, { timeout: 10000 }).catch(() => {});
    const pc = await page.evaluate(async () => { const id = (location.hash.match(/#\/venda\/(.+)$/) || [])[1]; for (let k = 0; k < 40 && !VEN(id); k++) await new Promise((r) => setTimeout(r, 150)); return VEN(id) || null; });
    ok(pc && pc.fluxo === 'pedido' && pc.clienteId === 'c1' && (pc.itens || []).map((i) => i.produtoId).join(',') === 'p2' && pc.origemOrcamento && pc.origemOrcamento.id === oid,
      `orçamento aprovado vira pedido sem redigitar (pedido nº ${pc && pc.numero}, ${pc && pc.status})`);
    ok(!!pc && !!(await noBanco(page, 'vendas', pc.id)), 'pedido convertido gravado no banco central');
    await page.waitForFunction((id) => ORC(id) && ORC(id).status === 'Convertido em pedido', oid, { timeout: 8000 }).catch(() => {});
    ok(await page.evaluate((id) => ORC(id).status === 'Convertido em pedido', oid), 'orçamento marcado como "Convertido em pedido"');

    /* ---------- 7. consulta de pedidos: filtros, ações e reimpressão ---------- */
    await ir(page, '#/vendas');
    await page.waitForTimeout(400);
    const lista = await page.evaluate(() => ({ acoes: document.querySelectorAll('#conteudo [aria-label^="Imprimir nº"]').length, filtroProd: [...document.querySelectorAll('#conteudo select')].some((s) => [...s.options].some((o) => o.value === 'Tijolo 8 furos (teste)')), linhas: document.querySelectorAll('#conteudo tbody tr').length }));
    ok(lista.acoes >= 3 && lista.filtroProd, `lista com botão de imprimir em cada linha (${lista.acoes}) e filtro por produto`);
    const filtrado = await page.evaluate(() => { const s = [...document.querySelectorAll('#conteudo select')].find((x) => [...x.options].some((o) => o.value === 'Tijolo 8 furos (teste)')); s.value = 'Tijolo 8 furos (teste)'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; });
    await page.waitForTimeout(400);
    const nFiltro = await page.evaluate(() => document.querySelectorAll('#conteudo [aria-label^="Imprimir nº"]').length);
    ok(filtrado && nFiltro === 1, `filtro por produto: só o pedido com o Tijolo 8 furos (${nFiltro})`);
    ok(await page.evaluate(() => /Produto: Tijolo 8 furos \(teste\)/.test(document.getElementById('conteudo').textContent)), 'aviso do filtro mostra o nome do produto (não o código interno)');
    await page.click('#conteudo [aria-label^="Imprimir nº"]');
    ok(await page.waitForSelector('.vs-imp', { timeout: 4000 }).then(() => true).catch(() => false), 'reimprimir pela lista de pedidos');
    await page.click('.vs-imp [data-fechar]');
    ok(await semRolagemLado(page), 'consulta sem rolagem para o lado');
    await page.screenshot({ path: join(RAIZ, `saida/vendas-consulta-${vp.nome}.png`) });

    // números do início abrem a lista filtrada com o mesmo critério
    await ir(page, '#/setor-vendas');
    const kAb = await page.evaluate(() => +document.querySelector('[data-vk="abertos"] .v').textContent);
    await page.click('.kpi[data-vk="abertos"]'); await page.waitForTimeout(500);
    const nAb = await page.evaluate(() => document.querySelectorAll('#conteudo [aria-label^="Imprimir nº"]').length);
    ok(kAb === 1 && nAb === kAb, `"Pedidos em aberto" (${kAb}) abre a lista só com eles (${nAb}); rascunho e venda de balcão ficam fora`);

    // código de registro malicioso: o botão de imprimir não executa nada que venha do banco
    const mal = "x');window.__xss=1;//";
    await page.evaluate((id) => gravar('vendas', { id, numero: 999, setor: 'vendas', data: hoje(), hora: '10:00', itens: [], total: 1, subtotal: 1, status: 'Concluída', cliente: { nome: 'Teste' }, forma: 'PIX', condicao: 'À vista', pagamentos: [], criadoEm: new Date().toISOString() }), mal);
    await page.waitForFunction((id) => !!VEN(id), mal, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => irListaV('vendas', {})); await page.waitForTimeout(500);
    await page.evaluate((id) => { const b = [...document.querySelectorAll('#conteudo [data-vsid]')].find((x) => x.dataset.vsid === id); if (b) b.click(); }, mal);
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__xss === undefined && !!document.querySelector('.vs-imp')), 'código de registro com aspas não executa nada (só abre a impressão)');
    await page.keyboard.press('Escape');

    /* ---------- 8. relatórios e cliente (histórico) ---------- */
    await ir(page, '#/relvendas');
    ok(await page.evaluate(() => /Relat/.test(document.getElementById('conteudo').textContent)), 'relatórios abrem');
    const hist = await page.evaluate((id) => situacaoCli(CLI(id)), cliId);
    ok(hist && hist.n === 1, `histórico de compras do cliente novo (${hist && hist.n} compra)`);
    await ir(page, '#/painelvendas');
    ok(await page.evaluate(() => document.querySelectorAll('#svCorpo .hero .kpi').length > 10), 'painel completo da gerência continua inteiro na aba própria');

    /* ---------- 9. permissões: o que cada perfil vê ---------- */
    const perm = await page.evaluate(() => { const p0 = APP.papel; const r = {}; for (const p of ['financeiro', 'vendedor']) { APP.papel = p; r[p] = { pedido: pode('pedido', 'e'), simular: pode('simular'), abas: ABAS_V('vendas').map((a) => a.l) }; } APP.papel = p0; return r; });
    ok(!perm.financeiro.pedido && perm.financeiro.simular && !perm.financeiro.abas.includes('Novo pedido'), 'financeiro: consulta e simula, mas não faz pedido (permissão de antes)');
    ok(perm.vendedor.pedido && perm.vendedor.abas.includes('Nova venda'), 'vendedor: faz pedido e venda');

    const relevantes = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
    ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  }
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nSetor de Vendas: tudo certo.');
process.exit(falhas ? 1 : 0);
