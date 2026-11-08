#!/usr/bin/env node
// Teste de ponta a ponta no navegador: abre o programa REAL (saida/claude.html)
// num Chromium, como se estivesse dentro do Claude, com o banco central
// simulado (scripts/lib/servidor-falso.mjs), e confere:
//   - o sistema abre no modo "banco central" sem erros de JavaScript
//   - os dados do banco aparecem nas telas (DATA)
//   - um cadastro feito pela função do próprio sistema chega ao banco
//   - uma alteração feita "na nuvem" aparece no sistema aberto
//   - a versão da nuvem (dist/index.html) abre na tela de login
// Requer Playwright. Uso: node scripts/construir.mjs && node scripts/testar-navegador.mjs [pasta-com-dados.json]
// A pasta opcional tem arquivos <colecao>/<id>.json para semear o banco simulado
// (nunca use dados reais num ambiente compartilhado).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';
import { traduzirInfNFe } from '../supabase/functions/jb-fiscal/nucleo.js';

// require: acha o Playwright instalado no projeto ou globalmente
const { chromium } = createRequire(import.meta.url)('playwright');
const semente = process.argv[2];
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

function lerSemente(dir) {
  const out = [];
  (function andar(d) {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) andar(p);
      else if (f.endsWith('.json')) { const r = relative(dir, p).split(sep).join('/'); out.push([r.slice(0, r.lastIndexOf('/')), f.slice(0, -5), JSON.parse(readFileSync(p, 'utf8'))]); }
    }
  })(dir);
  return out;
}
const docs = semente ? lerSemente(semente) : [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo 1', situacao: 'Ativo', departamento: 'Produção' }],
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo 2', situacao: 'Ativo', departamento: 'Produção' }],
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
];

// servidor local só para entregar os arquivos construídos
const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  /* ---------- versão do Claude ---------- */
  const ctx = await browser.newContext();
  // bibliotecas externas (gráficos, planilhas, PDF) e fontes não são necessárias para o teste
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(({ codigo, docs }) => {
    // eslint-disable-next-line no-eval
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    // serviço fiscal simulado (o que a função jb-fiscal devolve para "status_servico")
    const fiscal = (acao) => acao === 'status_servico'
      ? { status: 200, corpo: { servico: 'JB Fiscal', versao: '1.0', provedor: 'Focus NFe', api: 'v2', ambiente: 'homologacao', voce: { nome: 'Dono', papel: 'administrador' },
        cnpj_emitente: null, credenciais_configuradas: true, producao_liberada: false, empresa: { ok: false, erro: { mensagem: 'sem CNPJ_EMITENTE (simulado)' } },
        certificado: { ok: false, erro: { mensagem: 'simulado' } }, config_nfe: { ok: true, dados: { CRT: '1', ambiente: 'homologação' } }, sefaz: { ok: null, erro: { mensagem: 'não consultada' } } } }
      : { status: 503, corpo: { erro: { tipo: 'configuracao', mensagem: 'simulado' } } };
    const srv = criar({ admins: ['u_DONO'], fiscal });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true, null, { timeout: 30000 });
  const e1 = await page.evaluate(() => ({ modo: APP.central && APP.central.estado().modo, uid: APP.uid, func: DATA.funcionarios.length }));
  ok(e1.modo === 'central', `abriu no modo banco central (modo: ${e1.modo})`);
  const esperado = docs.filter((d) => d[0] === 'funcionarios').length;
  await page.waitForFunction((n) => DATA.funcionarios.length === n, esperado, { timeout: 15000 }).catch(() => {});
  const nf = await page.evaluate(() => DATA.funcionarios.length);
  ok(nf === esperado, `funcionários na tela: ${nf} de ${esperado}`);
  const sinc = await page.evaluate(() => { const el = document.getElementById('sinc'); return el ? el.textContent : null; });
  ok(sinc === null || /Sincronizado|Salvando/.test(sinc), `indicador de sincronização: ${sinc}`);

  // cadastro pela função do próprio sistema
  await page.evaluate(() => gravar('funcionarios', { id: 'teste-nav-1', nome: 'Cadastro pelo Navegador', situacao: 'Ativo', departamento: 'Produção' }));
  await page.waitForFunction(() => window.__srv.estado.docs.has('funcionarios/teste-nav-1') && APP.central.estado().pendentes === 0, null, { timeout: 15000 }).catch(() => {});
  const noBanco = await page.evaluate(() => { const d = window.__srv.estado.docs.get('funcionarios/teste-nav-1'); return d && d.dados.nome; });
  ok(noBanco === 'Cadastro pelo Navegador', 'cadastro feito no sistema chegou ao banco central');

  // alteração feita "na nuvem"
  await page.evaluate(() => window.__srv.estado.gravarDireto('funcionarios', 'teste-nav-2', { id: 'teste-nav-2', nome: 'Cadastrado na Nuvem', situacao: 'Ativo', departamento: 'Produção' }));
  // a ponte busca mudanças a cada 30 s com alguém usando a página
  await page.waitForFunction(() => DATA.funcionarios.some((f) => f.id === 'teste-nav-2'), null, { timeout: 40000 }).catch(() => {});
  ok(await page.evaluate(() => DATA.funcionarios.some((f) => f.id === 'teste-nav-2')), 'cadastro feito na nuvem apareceu no sistema aberto');
  /* ---------- Setor Fiscal ---------- */
  // a nota montada pelo próprio programa (montarInfNFe) passa pela tradução para a Focus NFe sem pendência
  const notaF = await page.evaluate(() => {
    const F = window.JB_FISCAL;
    DATA.fiscalCfg.push({ id: 'geral', emitente: { cnpj: '11222333000181', crt: '1', uf: 'MA', cMun: '2107902', xMun: 'Passagem Franca', razao: 'Exemplo' }, natOp: 'VENDA DE PRODUCAO DO ESTABELECIMENTO',
      perfis: [{ id: 'pfTeste', nome: 'Tijolo (teste)', cfopInterno: '5101', cfopInterestadual: '6101', origem: '0', icms: { csosn: '102' }, pis: { cst: '49' }, cofins: { cst: '49' }, ipi: { modo: 'nao' }, baseIncluiFrete: 'Sim', ibscbs: { calcular: 'Sim' }, conferidoEm: '2026-11-08' }],
      ibscbs: { ativo: 'Não' }, serie: { homologacao: '1', producao: '1' } });
    DATA.produtos.push({ id: 'prodTeste', nome: 'Tijolo 8 furos (teste)', codigo: 'TIJ8', ncm: '69041000', unNF: 'MIL', perfilFiscal: 'pfTeste' });
    const n = { id: 'nTeste', ambiente: 'homologacao', natOp: 'VENDA DE PRODUCAO DO ESTABELECIMENTO', consumidorFinal: '1', indPres: '1', modFrete: '0', frete: '100', desconto: '', seguro: '', outras: '',
      dest: { tipoPessoa: 'Jurídica', nome: 'Construtora Exemplo', cnpj: '11444777000161', indIEDest: '9', email: '', fone: '', end: { CEP: '65680000', xLgr: 'Rua A', nro: '1', xCpl: '', xBairro: 'Centro', cMun: '2107902', xMun: 'Passagem Franca', UF: 'MA' } },
      itens: [{ produtoId: 'prodTeste', qtd: '2', vUn: '650', desc: '' }], pag: { tPag: '17', condicao: 'À vista', parcelas: [] }, infCpl: 'Pedido de teste.' };
    const c = F.calcularNota(n);
    const pend = F.validarNota(n, c).filter((p) => p.nivel === 'erro').map((p) => p.msg);
    const inf = F.montarInfNFe(n, c, 12, '1', '2026-11-08T10:00:00-03:00');
    DATA.fiscalCfg.splice(DATA.fiscalCfg.findIndex((x) => x.id === 'geral'), 1);
    DATA.produtos.splice(DATA.produtos.findIndex((x) => x.id === 'prodTeste'), 1);
    return { inf, pend };
  });
  const tr = traduzirInfNFe(notaF.inf);
  ok(notaF.pend.length === 0 && tr.problemas.length === 0 && tr.focus.items.length === 1 && tr.focus.valor_total === 1400,
    `nota do programa (montarInfNFe) traduzida para a Focus NFe sem pendência${notaF.pend.length || tr.problemas.length ? ': ' + JSON.stringify([notaF.pend, tr.problemas]).slice(0, 300) : ''}`);
  // a tela "Serviço" do Setor Fiscal chama o serviço pela ponte (jbcore.fiscal) e mostra a resposta
  await page.evaluate(() => { location.hash = '#/setor-fiscal/servico'; });
  await page.waitForSelector('#svVer', { timeout: 15000 }).catch(() => {});
  await page.click('#svVer').catch(() => {});
  await page.waitForFunction(() => /Focus NFe · API v2/.test((document.getElementById('svCorpo') || {}).textContent || ''), null, { timeout: 15000 }).catch(() => {});
  const sv = await page.evaluate(() => ({ texto: /Focus NFe · API v2/.test((document.getElementById('svCorpo') || {}).textContent || ''), pedidos: window.__srv.estado.fiscal.pedidos.map((p) => [p.acao, p.uid]) }));
  ok(sv.texto && sv.pedidos.some((p) => p[0] === 'status_servico' && p[1] === 'u_DONO'), `Setor Fiscal › Serviço verificou a Focus NFe pela ponte (pedidos: ${JSON.stringify(sv.pedidos)})`);

  const relevantes = erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await page.screenshot({ path: join(RAIZ, 'saida/tela-claude.png') });
  await ctx.close();

  /* ---------- versão da nuvem ---------- */
  const ctx2 = await browser.newContext();
  await ctx2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const p2 = await ctx2.newPage();
  const erros2 = []; p2.on('pageerror', (e) => erros2.push(String(e && e.message)));
  await p2.goto(base + '/dist/index.html');
  await p2.waitForSelector('#jbl', { timeout: 15000 }).catch(() => {});
  ok(await p2.$('#jbl') !== null, 'versão da nuvem abre na tela de login');
  ok(await p2.evaluate(() => !(window.JB_CORE_PONTE && window.JB_CORE_PONTE.api.estado().modo === 'central')), 'na nuvem a ponte do Claude fica desligada');
  ok(await p2.evaluate(() => !!window.JB_NUVEM_API && typeof window.JB_NUVEM_API.fiscal === 'function'), 'na nuvem o Setor Fiscal tem a ligação com a função jb-fiscal');
  await ctx2.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nTeste no navegador: tudo certo.');
process.exit(falhas ? 1 : 0);
