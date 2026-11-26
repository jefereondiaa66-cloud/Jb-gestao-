#!/usr/bin/env node
// Teste de ponta a ponta das Despesas de Entrega (V177, Setor de Combustível) no navegador, com o programa REAL
// (saida/claude.html) e o banco central simulado (scripts/lib/servidor-falso.mjs). Dados FICTÍCIOS, só em memória.
// Parte 1 (escritório): painel, conferência (aprovar, pedir correção, rejeitar), classificação financeira automática,
// compromisso no Financeiro com código fixo (reenviar não duplica), categoria que falta vira pendência, correção com o
// antes e o depois, cancelamento, viagem com custo total (exemplo do projeto: 850 + 90 + 45 + 80 = 1.065), adiantamento
// e acerto, Controladoria sem contar duas vezes, relatórios, Configurações e nenhum erro de JavaScript.
// Parte 2 (celular do motorista): nuvem/motorista.html com o servidor imitado (login, início, lançamento em etapas,
// foto, envio sem duplicar mesmo com a conexão caindo, confirmação, histórico, correção e viagem), em tela de Android.
//
// Uso: node scripts/construir.mjs && node scripts/testar-despesas-entrega.mjs
// FOTOS=<pasta> guarda capturas das telas.
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const exigir = createRequire(import.meta.url);
const { chromium } = exigir('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FOTOS = process.env.FOTOS || '';
if (FOTOS) mkdirSync(FOTOS, { recursive: true });

const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const hashTxt = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
const chave = (d, id) => d.slice(0, 7) + '-s' + (hashTxt(id) % 8);
const agora = new Date().toISOString();
const item = (o) => ({ criadoEm: agora, criadoPor: 'u_motA', alteradoEm: agora, alteradoPor: 'u_motA', hist: [{ em: agora, por: 'u_motA', acao: 'registrou pelo celular' }], ...o });
/* o que o banco grava quando o motorista lança pelo celular (seg.desp_validar + seg.desp_mapa) */
const viagem = item({ id: 'vg_testeViagem0001', tipo: 'viagem', numero: 1, data: hoje, hora: '06:10', st: 'andamento', motoristaId: 'mt_testeA', veiculoId: 'l_cam1', destino: 'Cidade Teste', cliente: 'Cliente Teste', kmIni: 1000, origemLanc: 'motorista', hist: [{ em: agora, por: 'u_motA', acao: 'iniciou pelo celular' }] });
const desp = [
  item({ id: 'de_testeDiesel00001', tipo: 'desp', numero: 1, tipoDesp: 'combustivel', valor: 850, data: hoje, hora: '07:00', motoristaId: 'mt_testeA', veiculoId: 'l_cam1', viagemId: viagem.id, avulsa: false, litros: 140.5, km: 1180, local: 'Posto Teste', forma: 'Dinheiro', origem: 'motorista', destino: 'entregas', categoria: 'Combustível para entrega', st: 'aguardando', origemLanc: 'motorista', foto: { id: '0123456789abcdef0123456789abcdef', nome: 'comprovante.jpg', tipo: 'image/jpeg', tam: 1000 } }),
  item({ id: 'de_testeAlimento001', tipo: 'desp', numero: 2, tipoDesp: 'alimentacao', valor: 90, data: hoje, hora: '12:10', motoristaId: 'mt_testeA', veiculoId: 'l_cam1', viagemId: viagem.id, avulsa: false, local: 'Restaurante Teste', forma: 'Dinheiro', origem: 'adiantamento', destino: 'gerais', categoria: 'Alimentação', st: 'aguardando', origemLanc: 'motorista' }),
  item({ id: 'de_testePedagio0001', tipo: 'desp', numero: 3, tipoDesp: 'pedagio', valor: 45, data: hoje, hora: '08:30', motoristaId: 'mt_testeA', veiculoId: 'l_cam1', viagemId: viagem.id, avulsa: false, forma: 'Cartão', origem: 'empresa', destino: 'gerais', categoria: '', st: 'aguardando', origemLanc: 'motorista' }),
  item({ id: 'de_testeBorracha001', tipo: 'desp', numero: 4, tipoDesp: 'manutencao', valor: 80, data: hoje, hora: '15:40', motoristaId: 'mt_testeA', veiculoId: 'l_cam1', viagemId: viagem.id, avulsa: false, local: 'Borracharia Teste', destino: 'gerais', categoria: 'Manutenção', st: 'aguardando', origemLanc: 'motorista' }),
  item({ id: 'de_testeOutroMot001', tipo: 'desp', numero: 5, tipoDesp: 'alimentacao', valor: 30, data: hoje, hora: '11:00', motoristaId: 'mt_testeB', veiculoId: 'l_cam2', viagemId: '', avulsa: true, justificativa: 'Almoço antes de sair', destino: 'gerais', categoria: 'Alimentação', st: 'aguardando', origemLanc: 'motorista', criadoPor: 'u_motB' })];
const grupos = {};
[viagem, ...desp].forEach((r) => { const k = chave(r.data, r.id); (grupos[k] = grupos[k] || { chave: k, items: {} }).items[r.id] = r; });
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono Teste', papel: 'admin', ativo: true }],
  ['acesso', 'u_aprov', { id: 'u_aprov', nome: 'Aprovador Teste', papel: 'gerente', ativo: true }],
  ['locais', 'l_cam1', { id: 'l_cam1', setor: 'combustivel', nome: 'Caminhão Teste 01', tipo: 'Caminhão', identificacao: 'TST1A11', controleUso: 'Hodômetro (km)', situacao: 'Ativo', setorTrabalho: 'Entrega' }],
  ['locais', 'l_cam2', { id: 'l_cam2', setor: 'combustivel', nome: 'Caminhão Teste 02', tipo: 'Caminhão', identificacao: 'TST2B22', controleUso: 'Hodômetro (km)', situacao: 'Ativo', setorTrabalho: 'Entrega' }],
  ['despEntCad', 'cfg', { id: 'cfg', tipo: 'cfg', aprovadores: [], regras: { avulsaJustificativa: true } }],
  ['despEntCad', 'mt_testeA', { id: 'mt_testeA', tipo: 'motorista', nome: 'Motorista Teste A', situacao: 'Ativo', veiculos: ['l_cam1'] }],
  ['despEntCad', 'mt_testeB', { id: 'mt_testeB', tipo: 'motorista', nome: 'Motorista Teste B', situacao: 'Ativo', veiculos: ['l_cam2'] }],
  ...Object.values(grupos).map((g) => ['despEnt', g.chave, g])];

const TIPOS_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TIPOS_MIME[(p.match(/\.[a-z]+$/) || [''])[0]] || 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
let falhas = 0, total = 0;
const ok = (c, m) => { total++; console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
try {
  /* ======================= Parte 1: escritório ======================= */
  console.log('Despesas de entrega · escritório (programa real, banco simulado)');
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono Teste', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 200)); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      banco: (col) => { const out = []; window.__srv.estado.docs.forEach((d) => { if (d.colecao !== col) return; if (d.dados && d.dados.items) Object.entries(d.dados.items).forEach(([id, v]) => { if (v) out.push({ ...v, id }); }); else out.push({ ...d.dados, id: d.id }); }); return out; },
      janela: async () => { await T.esperar(() => document.querySelector('.veu .modal')); return document.querySelector('.veu .modal'); },
      ok: async () => { const b = document.querySelector('.veu .modal [data-ok]'); b.click(); await T.esperar(() => !document.querySelector('.veu .modal') || !b.isConnected, 10000); await T.dorme(150); },
      campo: (id, v) => { const el = document.querySelector('.veu .modal #' + id); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(350); },
      ir: async (h, sel) => { location.hash = h; await T.esperar(() => document.querySelector(sel || '#svCorpo .de-sub')); await T.dorme(150); },
      D: (id) => T.banco('despEnt').find((x) => x.id === id),
      fin: () => T.banco('fin').filter((x) => x.tipo === 'titulo'),
    };
  });
  const foto = async (nome) => { if (FOTOS) await page.screenshot({ path: join(FOTOS, nome), fullPage: true }); };

  /* 0. o módulo aparece à vista no início do Setor de Combustível (cartão em Módulos) e no menu Módulos */
  const p0 = await page.evaluate(async () => { location.hash = '#/setor-combustivel'; await T.dorme(1200);
    const vis = [...document.querySelectorAll('a[href="#/despEnt"]')].filter((a) => (a.offsetWidth || a.offsetHeight) && /Despesas de entrega/.test(a.textContent)).length;
    const b = [...document.querySelectorAll('button,a')].find((x) => /Módulos/.test(x.textContent) && x.offsetWidth); if (b) b.click(); await T.dorme(500);
    const mega = /Despesas de entrega/.test((document.querySelector('.c2-mega') || {}).innerText || ''); document.body.click(); await T.dorme(200); return { vis, mega }; });
  ok(p0.vis >= 1 && p0.mega, `início do Setor de Combustível mostra "Despesas de entrega" à vista (${p0.vis}) e no menu Módulos`);
  /* 1. painel */
  const p1 = await page.evaluate(async () => {
    await T.ir('#/despEnt', '.de-hero');
    const t = document.querySelector('#svCorpo').innerText;
    return { aguard: document.querySelectorAll('#svCorpo tr[data-de]').length, aba: [...document.querySelectorAll('.sv-abas a')].some((a) => /Despesas de entrega/.test(a.textContent)),
      pend: window.LEMBRETES_V61().filter((x) => x.mod === 'despEnt').map((x) => x.titulo + ' ' + x.det).join(' | '), kpi: [...document.querySelectorAll('.de-hero .kpi .v')].map((x) => x.textContent), menu: [...document.querySelectorAll('a[href="#/despEnt"]')].some((a) => /Despesas de entrega/.test(a.textContent)) };
  });
  ok(p1.aguard === 5, `painel mostra os 5 lançamentos aguardando conferência (${p1.aguard})`);
  ok(p1.aba && p1.menu, 'Despesas de entrega na barra do Setor de Combustível e no menu do setor');
  ok(/2 tipos sem categoria no Financeiro/.test(p1.pend) && /Pedágio, Hospedagem/.test(p1.pend) && /5 despesas de entrega esperando conferência/.test(p1.pend), 'botão PENDÊNCIAS: 5 despesas a conferir e pedágio e hospedagem sem categoria (para o administrador)');
  ok(/^R\$\s1\.095,00$/.test(p1.kpi[1]) && /^R\$\s850,00$/.test(p1.kpi[2]), `indicadores do dia: despesas ${p1.kpi[1]}, combustível ${p1.kpi[2]}`);
  await foto('desp-01-painel.png');

  /* 2. aprovar o diesel (dinheiro do motorista): vira UM compromisso no Financeiro, categoria Combustível para entrega */
  const p2 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.aprovar('de_testeDiesel00001'); await T.janela();
    const origemPadrao = document.querySelector('.veu .modal #apO').value; await T.ok(); await T.sincronizado();
    const d = T.D('de_testeDiesel00001'); const t = T.fin().find((x) => x.id === 'ft_de_testeDiesel00001');
    return { origemPadrao, st: d.st, fin: d.fin && d.fin.id, t: t && { cat: t.categoria, mod: t.moduloFin, set: t.setorOrigem, v: t.valor, desp: t.despEntId, benef: t.beneficiarioNome || t.beneficiario, mot: t.motorista, anexo: !!(t.anexo && t.anexo.id) },
      n: T.fin().length, sit: DESP_ENTREGA_V177.situ(DESP_ENTREGA_V177 && DATA.deLanc.find((x) => x.id === 'de_testeDiesel00001')).t, hist: (d.hist || []).map((h) => h.acao).join(' > '),
      central: window.CPG_FIN ? CPG_FIN.moduloDe(FINANCEIRO_SETOR.obrigacoes().find((o) => o.ref === 't:ft_de_testeDiesel00001')) : '' };
  });
  ok(p2.origemPadrao === 'motorista', 'a janela de aprovação já vem com o que o motorista informou (dinheiro dele)');
  ok(p2.st === 'aprovado' && p2.fin === 'ft_de_testeDiesel00001', 'diesel aprovado e ligado ao compromisso de código fixo ft_<lançamento>');
  ok(p2.t && p2.t.cat === 'Combustível para entrega' && p2.t.mod === 'comb' && p2.t.set === 'Setor de Combustível' && p2.t.v === 850 && p2.t.desp === 'de_testeDiesel00001', `classificação automática: ${p2.t && p2.t.cat} · módulo ${p2.t && p2.t.mod} · ${p2.t && p2.t.v}`);
  ok(p2.t && p2.t.benef === 'Motorista Teste A' && p2.t.mot === 'Motorista Teste A' && p2.t.anexo, 'reembolso ao motorista, com o nome dele e a foto do comprovante no compromisso');
  ok(p2.central === 'comb', `na Central de Pagamentos o abastecimento cai em Combustível (${p2.central})`);
  ok(/aprovou > enviou ao Financeiro/.test(p2.hist), 'histórico: registrou › aprovou › enviou ao Financeiro');

  /* 3. reenviar não duplica */
  const p3 = await page.evaluate(async () => { const n0 = T.fin().length; await DESP_ENTREGA_V177.reenviar('de_testeDiesel00001'); await DESP_ENTREGA_V177.enviarFin(DATA.deLanc.find((x) => x.id === 'de_testeDiesel00001')); await T.sincronizado(); return { n0, n1: T.fin().length }; });
  ok(p3.n1 === p3.n0, `reenviar ao Financeiro não duplica (${p3.n0} → ${p3.n1} compromisso)`);

  /* 4. alimentação paga com o adiantamento: aprovada, sem conta a pagar nova */
  const p4 = await page.evaluate(async () => {
    const n0 = T.fin().length; DESP_ENTREGA_V177.aprovar('de_testeAlimento001'); await T.janela(); await T.ok(); await T.sincronizado();
    const d = DATA.deLanc.find((x) => x.id === 'de_testeAlimento001'); return { st: d.st, sit: DESP_ENTREGA_V177.situ(d).t, n: T.fin().length - n0, cat: d.categoria };
  });
  ok(p4.st === 'aprovado' && p4.n === 0 && /adiantamento/.test(p4.sit), `alimentação paga com o adiantamento: "${p4.sit}", nenhum compromisso novo`);

  /* 5. pedágio sem categoria: aprova, vira pendência; o administrador configura; enviar cria o compromisso */
  const p5 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.aprovar('de_testePedagio0001'); await T.janela();
    const aviso = /não existe no Financeiro/.test(document.querySelector('.veu .modal').textContent); await T.ok(); await T.sincronizado();
    const a = DESP_ENTREGA_V177.situ(DATA.deLanc.find((x) => x.id === 'de_testePedagio0001')).t; const n0 = T.fin().length;
    await T.ir('#/deCfg', '.de-mapa'); const pendCfg = /2 tipos sem categoria válida/i.test(document.querySelector('#svCorpo').innerText) && document.querySelectorAll('.de-mapa .tag.at').length === 2;
    const s = document.querySelector('[data-mc="pedagio"]'); s.value = 'Fretes'; document.querySelector('.de-smapa').click(); await T.sincronizado();
    const cfg = T.banco('despEntCad').find((x) => x.id === 'cfg');
    await DESP_ENTREGA_V177.reenviar('de_testePedagio0001'); await T.sincronizado();
    const t = T.fin().find((x) => x.id === 'ft_de_testePedagio0001');
    return { aviso, a, pendCfg, mapa: cfg.mapa && cfg.mapa.pedagio, t: t && { cat: t.categoria, mod: t.moduloFin, benef: t.beneficiarioNome || t.beneficiario }, n: T.fin().length - n0, itemCat: T.D('de_testePedagio0001').categoria };
  });
  ok(p5.aviso && /falta categoria/.test(p5.a), `pedágio aprovado sem categoria fica como pendência ("${p5.a}") e nada é criado no Financeiro`);
  ok(p5.pendCfg, 'Configurações mostra os 2 tipos pendentes (sempre à vista, com a marca "pendente")');
  ok(p5.mapa && p5.mapa.categoria === 'Fretes' && p5.mapa.destino === 'gerais', 'administrador configurou a categoria do pedágio (Configurações › Classificação financeira)');
  ok(p5.t && p5.t.cat === 'Fretes' && p5.t.mod === 'gerais' && p5.n === 1, `depois de configurar, "Enviar ao Financeiro" criou o compromisso em Despesas gerais (${p5.t && p5.t.cat})`);
  ok(p5.itemCat === '', 'o lançamento guarda a categoria que recebeu (vazia): o mapeamento novo não reescreve o histórico');

  /* 6. borracharia: pedir correção, motorista corrige (o banco volta para aguardando), aprovar com conta da empresa */
  const p6 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.decidir('de_testeBorracha001', 'correcao'); await T.janela(); T.campo('dcM', 'A foto do cupom não chegou'); await T.ok(); await T.sincronizado();
    const st1 = T.D('de_testeBorracha001').st;
    /* o motorista corrige pelo celular (jb_mot_corrigir): o banco grava a foto e volta para "aguardando" */
    const at = T.D('de_testeBorracha001');
    const docId = [...window.__srv.estado.docs.values()].find((d) => d.colecao === 'despEnt' && d.dados.items && d.dados.items['de_testeBorracha001']).id;
    const dd = JSON.parse(JSON.stringify(window.__srv.estado.docs.get('despEnt/' + docId).dados));
    dd.items['de_testeBorracha001'] = { ...at, st: 'aguardando', foto: { id: 'fedcba9876543210fedcba9876543210', nome: 'comprovante.jpg', tipo: 'image/jpeg', tam: 900 }, origem: 'empresa', forma: 'Faturado', alteradoEm: new Date().toISOString(), hist: [...at.hist, { em: new Date().toISOString(), por: 'u_motA', acao: 'corrigiu pelo celular', antes: { foto: null } }] };
    window.__srv.estado.gravarDireto('despEnt', docId, dd);
    try { JB_CORE_PONTE.api.sincronizar(); } catch (e) {}
    await T.esperar(() => (DATA.deLanc.find((x) => x.id === 'de_testeBorracha001') || {}).st === 'aguardando', 30000);
    const viuNovo = DESP_ENTREGA_V177.situ(DATA.deLanc.find((x) => x.id === 'de_testeBorracha001')).k;
    DESP_ENTREGA_V177.aprovar('de_testeBorracha001'); await T.janela(); T.campo('apV', '2099-12-31'); await T.ok(); await T.sincronizado();
    const t = T.fin().find((x) => x.id === 'ft_de_testeBorracha001');
    return { st1, viuNovo, st2: T.D('de_testeBorracha001').st, t: t && { cat: t.categoria, venc: t.vencimento, benef: t.beneficiarioNome || t.beneficiario, mod: t.moduloFin } };
  });
  ok(p6.st1 === 'correcao', 'pedido de correção: o lançamento fica "Correção pedida ao motorista"');
  ok(p6.viuNovo === 'aguardando', 'a correção feita no celular chega à tela do escritório (volta para "Aguardando conferência")');
  ok(p6.st2 === 'aprovado' && p6.t && p6.t.cat === 'Manutenção' && p6.t.venc === '2099-12-31' && p6.t.benef === 'Borracharia Teste' && p6.t.mod === 'gerais', `corrigido pelo motorista e aprovado: conta da empresa para "${p6.t && p6.t.benef}", vence ${p6.t && p6.t.venc}`);

  /* 7. rejeitar o do outro motorista */
  const p7 = await page.evaluate(async () => { DESP_ENTREGA_V177.decidir('de_testeOutroMot001', 'rejeitar'); await T.janela(); T.campo('dcM', 'Despesa não autorizada'); await T.ok(); await T.sincronizado();
    const d = T.D('de_testeOutroMot001'); return { st: d.st, motivo: (d.hist.find((h) => h.acao === 'rejeitou') || {}).motivo, fin: T.fin().some((x) => x.despEntId === 'de_testeOutroMot001') }; });
  ok(p7.st === 'rejeitado' && p7.motivo === 'Despesa não autorizada' && !p7.fin, 'rejeitar guarda o motivo e não vai ao Financeiro');

  /* 8. custo da viagem: exemplo do projeto 850 + 90 + 45 + 80 = 1.065, sem duplicar o que foi ao Financeiro */
  const p8 = await page.evaluate(async () => {
    const v = DATA.deViag.find((x) => x.id === 'vg_testeViagem0001'); const c = DESP_ENTREGA_V177.contasViagem(v);
    await T.ir('#/deViag/vg_testeViagem0001', '.de-tot'); const tela = document.querySelector('.de-tot').innerText;
    const D = DESP_ENTREGA_V177.relViagem('vg_testeViagem0001');
    return { total: c.total, comb: c.comb, outras: c.outras, porTipo: c.porTipo, tela, secoes: D.blocos.filter((b) => b.tipo === 'secao').map((b) => b.titulo), foot: (D.blocos.find((b) => b.titulo === 'Custo por categoria') || {}).tabela.foot };
  });
  ok(p8.total === 1065 && p8.comb === 850 && p8.outras === 215, `custo total gerencial da viagem R$ ${p8.total} (combustível ${p8.comb} + outras ${p8.outras})`);
  ok(p8.porTipo.alimentacao === 90 && p8.porTipo.pedagio === 45 && p8.porTipo.manutencao === 80, 'alimentação lançada em Despesas pagas gerais continua no custo da viagem');
  ok(/R\$\s1\.065,00/.test(p8.tela) && p8.foot && /^R\$\s1\.065,00$/.test(p8.foot[2]), 'tela e relatório da viagem mostram R$ 1.065,00 (Dados · Despesas · Custo por categoria)');
  await foto('desp-02-viagem.png');

  /* 9. Controladoria: conta cada despesa aprovada uma vez, pela data do gasto; o compromisso gerado não entra de novo */
  const p9 = await page.evaluate(() => {
    const R = CONTROLADORIA.setoresMes(hoje().slice(0, 7)); const det = (k) => (R.det[k] || []).filter((x) => /Despesas de entrega/.test(x.o)).map((x) => x.v);
    const fin = Object.values(R.det).flat().filter((x) => x.o === 'Setor Financeiro' && /Despesa de entrega/.test(x.t)).length;
    return { fretes: det('fretes'), cif: det('cifOutros'), frota: det('frotaPecas'), fin };
  });
  ok(p9.fretes.slice().sort((a, b) => a - b).join(',') === '45,850' && p9.cif.join(',') === '90' && p9.frota.join(',') === '80' && p9.fin === 0,
    `Controladoria: fretes ${p9.fretes.join('+')}, alimentação ${p9.cif.join('')}, peças da frota ${p9.frota.join('')}; compromissos do Financeiro não contados de novo (${p9.fin})`);

  /* 10. adiantamento (movimentação própria) e acerto: recebido 500, aceitas 90 (alimentação), devolver 410 */
  const p10 = await page.evaluate(async () => {
    await T.ir('#/deCfg', '.de-mapa'); document.querySelector('[data-mca]').value = 'Outras despesas'; document.querySelector('.de-smapa').click(); await T.sincronizado();
    DESP_ENTREGA_V177.registrarAdiant('vg_testeViagem0001'); await T.janela(); T.campo('adV', '500,00'); await T.ok(); await T.sincronizado();
    const t = T.fin().find((x) => x.id === 'fa_vg_testeViagem0001');
    const R = CONTROLADORIA.setoresMes(hoje().slice(0, 7)); const contou = Object.values(R.det).flat().some((x) => /Adiantamento de viagem/.test(x.t || ''));
    DESP_ENTREGA_V177.fazerAcerto('vg_testeViagem0001'); await T.janela(); const txt = document.querySelector('.veu .modal').innerText; await T.ok(); await T.sincronizado();
    const v = T.D('vg_testeViagem0001');
    return { t: t && { v: t.valor, mod: t.moduloFin, cat: t.categoria, adt: t.despEntAdiant }, contou, txt, ac: v.acerto, st: v.st };
  });
  ok(p10.t && p10.t.v === 500 && p10.t.mod === 'outros' && p10.t.adt === 'vg_testeViagem0001', 'adiantamento vira compromisso a pagar ao motorista (Outros pagamentos), não despesa');
  ok(!p10.contou, 'o adiantamento não entra como despesa na Controladoria');
  ok(/500,00/.test(p10.txt) && /90,00/.test(p10.txt) && /Saldo a devolver/i.test(p10.txt) && /410,00/.test(p10.txt), 'acerto mostra recebido R$ 500, aceitas R$ 90 e saldo a devolver R$ 410');
  ok(p10.ac && p10.ac.recebido === 500 && p10.ac.aceitas === 90 && p10.ac.saldo === 410 && p10.ac.devolucao && p10.ac.devolucao.valor === 410 && p10.st === 'concluida', 'acerto gravado na viagem (devolução de R$ 410) e a viagem fica concluída');

  /* 11. correção por quem aprova: antes e depois no histórico; o compromisso acompanha */
  const p11 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.corrigir('de_testeDiesel00001'); await T.janela(); T.campo('crV', '800,00'); T.campo('crM', 'Valor certo do cupom'); await T.ok(); await T.sincronizado();
    const d = T.D('de_testeDiesel00001'); const h = d.hist.find((x) => x.acao === 'corrigiu'); const t = T.fin().find((x) => x.id === 'ft_de_testeDiesel00001');
    return { v: d.valor, antes: h && h.antes && h.antes.valor, motivo: h && h.motivo, tv: t && t.valor };
  });
  ok(p11.v === 800 && p11.antes === 850 && p11.motivo === 'Valor certo do cupom' && p11.tv === 800, 'correção do aprovado: R$ 850 → R$ 800, o antes fica no histórico e o Financeiro acompanha');

  /* 12. cancelar: o lançamento fica, o compromisso do Financeiro é cancelado (sem pagamento) */
  const p12 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.cancelar('de_testePedagio0001'); await T.janela(); T.campo('ccM', 'Lançado em dobro'); await T.ok(); await T.sincronizado();
    const d = T.D('de_testePedagio0001'); const t = T.fin().find((x) => x.id === 'ft_de_testePedagio0001'); return { st: d && d.st, existe: !!d, canc: !!(t && t.cancelado) };
  });
  ok(p12.existe && p12.st === 'cancelado' && p12.canc, 'cancelar não apaga: lançamento cancelado e compromisso do Financeiro cancelado junto');

  /* 13. lançamento pelo escritório, com número e situação */
  const p13 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.lancarEscritorio({}); await T.janela(); T.campo('leM', 'mt_testeB'); T.campo('leT', 'hospedagem'); T.campo('leV', '120,00'); T.campo('leJ', 'Pernoite na estrada');
    await T.ok(); await T.sincronizado();
    const d = T.banco('despEnt').find((x) => x.tipo === 'desp' && x.origemLanc === 'escritorio'); return d && { st: d.st, n: d.numero, cat: d.categoria, dest: d.destino, v: d.valor };
  });
  ok(p13 && p13.st === 'aguardando' && p13.n === 6 && p13.dest === 'gerais' && p13.v === 120, `lançamento do escritório nº ${p13 && p13.n}: aguardando conferência`);

  /* 14. apagar é recusado no programa (o banco também recusa) */
  const p14 = await page.evaluate(async () => { try { await apagar('despEnt', DATA.deLanc[0]); return 'apagou'; } catch (e) { return e.clMsg || e.message; } });
  ok(/não são apagados/.test(p14), 'apagar lançamento é recusado (use Cancelar)');

  /* 15. relatório do período e lista */
  const p15 = await page.evaluate(async () => {
    DESP_ENTREGA_V177.UI.de = ''; DESP_ENTREGA_V177.UI.ate = '';
    const D = DESP_ENTREGA_V177.relPeriodo(); await T.ir('#/deLanc', '.de-tot'); const linhas = document.querySelectorAll('#svCorpo tr[data-de]').length;
    return { secoes: D.blocos.filter((b) => b.tipo === 'secao').map((b) => b.titulo), linhas, ind: (D.blocos.find((b) => b.tipo === 'indicadores') || {}).itens };
  });
  ok(p15.secoes.length === 6 && /combustível separado/.test(p15.secoes[0]) && p15.linhas === 6, `relatório do período: ${p15.secoes.join(' · ')}`);
  await foto('desp-03-lancamentos.png');

  /* 16. detalhe, configurações e celular (tela estreita) sem erro */
  const p16 = await page.evaluate(async () => {
    await T.ir('#/deLanc/de_testeDiesel00001', '.de-hist'); const det = document.querySelector('#svCorpo').innerText;
    await T.ir('#/deCfg', '.de-mapa'); const cfg = document.querySelector('#svCorpo').innerText;
    return { det: /Despesa nº 1/.test(det) && /Corrigiu/.test(det) && /Antes: Valor R\$\s850,00/.test(det), cfg: /Motoristas/.test(cfg) && /Acesso dos motoristas/.test(cfg) && /motorista\.html/.test(cfg) && /Quem aprova/.test(cfg) && /Regras do lançamento/.test(cfg) };
  });
  ok(p16.det, 'detalhe do lançamento com o histórico e o valor de antes');
  ok(p16.cfg, 'Configurações: motoristas, acesso pelo celular, caminhões, classificação, regras e quem aprova');
  await foto('desp-04-config.png');
  await page.setViewportSize({ width: 390, height: 860 }); await page.evaluate(async () => { await T.ir('#/despEnt', '.de-hero'); }); await foto('desp-05-painel-celular.png');
  ok(erros.length === 0, 'sem erros de JavaScript' + (erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''));
  await ctx.close();

  /* ======================= Parte 2: celular do motorista ======================= */
  console.log('Despesas de entrega · celular do motorista (nuvem/motorista.html, servidor imitado)');
  const supa = exigir.resolve('@supabase/supabase-js/dist/umd/supabase.js');
  const m = await browser.newContext({ viewport: { width: 393, height: 851 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const SB = 'https://kdsaslmlvjllgzbzsnxt.supabase.co';
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: '00000000-0000-4000-8000-00000000a001', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600, session_id: '00000000-0000-4000-8000-00000000b001' }) + '.assinatura';
  const S = { lancar: [], viagem: [], corrigir: [], uploads: [], quedaLancar: 1, desp: [], numero: 6, viagens: [{ id: 'vg_celViagem00000001', numero: 7, data: hoje, hora: '06:00', st: 'andamento', destino: 'Cidade Teste', veiculoId: 'l_cam1', kmIni: 1000 }] };
  const eu = () => ({ motorista: { id: 'mt_testeA', nome: 'Motorista Teste A' }, veiculos: [{ id: 'l_cam1', nome: 'Caminhão Teste 01', placa: 'TST1A11', modelo: 'Modelo Teste', tipo: 'Caminhão' }], viagens: S.viagens.filter((v) => ['planejada', 'andamento'].includes(v.st)),
    tema: { p: 'azulclaro', m: 'claro' }, regras: { exigirViagem: false, avulsaJustificativa: true, motoristaAbreViagem: true, ajustarData: true, fotoObrigatoria: false, pedirKm: true, diasAtras: 7 }, hoje, hora: '10:00' });
  const resumo = (d) => ({ ...d, viagemNumero: d.viagemId ? 7 : undefined, viagemDestino: d.viagemId ? 'Cidade Teste' : undefined, veiculoNome: 'Caminhão Teste 01', veiculoPlaca: 'TST1A11', destino: ['combustivel', 'arla'].includes(d.tipoDesp) ? 'entregas' : 'gerais', categoria: ['combustivel', 'arla'].includes(d.tipoDesp) ? 'Combustível para entrega' : 'Alimentação' });
  await m.route('**/*', async (r) => {
    const u = r.request().url(), met = r.request().method();
    if (u.startsWith(base)) return r.continue();
    if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(supa, 'utf8') });
    if (!u.startsWith(SB)) return r.abort();
    let corpo = {}; try { corpo = JSON.parse(r.request().postData() || '{}'); } catch (e) { corpo = {}; }   /* o envio da foto não é JSON */
    const json = (o, st) => r.fulfill({ status: st || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.endsWith('/functions/v1/jb-auth/login')) return corpo.usuario === 'teste.mota' && corpo.senha === 'SenhaTeste123' ? json({ access_token: jwt, refresh_token: 'rt-teste', expires_at: Math.floor(Date.now() / 1000) + 3600, usuario: 'teste.mota', nome: 'Motorista Teste A', trocarSenha: false }) : json({ erro: 'credenciais', mensagem: 'Usuário ou senha incorretos.' }, 401);
    if (u.endsWith('/functions/v1/jb-auth/logout')) return json({ ok: true });
    if (u.includes('/auth/v1/user')) return json({ id: '00000000-0000-4000-8000-00000000a001', aud: 'authenticated', role: 'authenticated', email: 'teste.mota@jbgestao.invalid' });
    if (u.includes('/rest/v1/rpc/jb_mot_eu')) return json(eu());
    if (u.includes('/rest/v1/rpc/jb_mot_lista')) return json({ despesas: S.desp.map(resumo).slice().reverse(), viagens: S.viagens, desde: hoje });
    if (u.includes('/rest/v1/rpc/jb_mot_lancar')) {
      const p = corpo.p; S.lancar.push(p.id);
      if (S.quedaLancar > 0) { S.quedaLancar--; return r.abort('internetdisconnected'); }   /* a conexão cai no primeiro envio */
      const ja = S.desp.find((d) => d.id === p.id); if (ja) return json({ ...resumo(ja), repetida: true });
      if (!(p.valor > 0)) return json({ code: '22023', message: 'Informe o valor da despesa (maior que zero).' }, 400);
      const d = { ...p, numero: ++S.numero, st: 'aguardando', criadoEm: new Date().toISOString() }; S.desp.push(d); return json({ ...resumo(d), repetida: false });
    }
    if (u.includes('/rest/v1/rpc/jb_mot_corrigir')) { const p = corpo.p; S.corrigir.push(p); const d = S.desp.find((x) => x.id === p.id); Object.assign(d, p.campos, { st: 'aguardando' }); return json(resumo(d)); }
    if (u.includes('/rest/v1/rpc/jb_mot_pedir_correcao')) { const d = S.desp.find((x) => x.id === corpo.p.id); d.pedidoCorrecao = { texto: corpo.p.texto, st: 'aberto' }; return json(resumo(d)); }
    if (u.includes('/rest/v1/rpc/jb_mot_viagem')) { const p = corpo.p; S.viagem.push(p); const v = S.viagens.find((x) => x.id === p.id); if (p.acao === 'encerrar' && v) { v.st = 'concluida'; v.kmFim = p.km; } else if (p.acao === 'iniciar' && !v) S.viagens.push({ id: p.id, numero: 8, data: hoje, st: 'andamento', destino: p.destino, veiculoId: 'l_cam1', kmIni: p.km }); return json(v || S.viagens[S.viagens.length - 1]); }
    if (/\/storage\/v1\/object\/anexos\//.test(u) && met === 'POST') { S.uploads.push(u.split('/').pop()); return json({ Key: 'anexos/' + u.split('/').pop(), Id: 'x' }); }
    if (/\/storage\/v1\/object\/sign\/anexos\//.test(u)) return json({ signedURL: '/object/sign/anexos/' + u.split('/').pop() + '?token=t' });
    if (/\/storage\/v1\/object\/sign\//.test(u) && met === 'GET') return r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
    return json({ message: 'não previsto no teste: ' + u }, 404);
  });
  const c = await m.newPage(); const errC = [];
  c.on('pageerror', (e) => errC.push(String(e && e.message))); c.on('dialog', (d) => d.accept());
  const fotoC = async (nome) => { if (FOTOS) await c.screenshot({ path: join(FOTOS, nome), fullPage: false }); };
  await c.goto(base + '/dist/motorista.html');
  await c.waitForSelector('#eU');
  await fotoC('mot-01-entrada.png');
  await c.fill('#eU', 'teste.mota'); await c.fill('#eS', 'errada'); await c.click('button[type=submit]');
  await c.waitForSelector('.msg:not([hidden])'); const msgErro = await c.textContent('.msg');
  ok(/incorretos/.test(msgErro), 'senha errada: mensagem clara e continua na entrada');
  await c.fill('#eS', 'SenhaTeste123'); await c.click('button[type=submit]');
  await c.waitForSelector('.atalhos');
  const ini = await c.evaluate(() => ({ t: document.body.innerText, nav: getComputedStyle(document.querySelector('.nav')).display, brasa: getComputedStyle(document.documentElement).getPropertyValue('--brasa').trim(), sess: !!sessionStorage.getItem('jb_mot_sessao'), local: Object.keys(localStorage).filter((k) => /token|sessao|senha/i.test(k)) }));
  ok(/Olá, Motorista/.test(ini.t) && /TST1A11/.test(ini.t) && /Viagem em andamento/i.test(ini.t) && /Viagem nº 7/.test(ini.t), 'início: nome, caminhão (placa) e viagem ativa');
  ok(/Abastecimento/.test(ini.t) && /Arla 32/.test(ini.t) && /Pedágio/.test(ini.t) && /Hospedagem/.test(ini.t) && /Troca de óleo/.test(ini.t), 'atalhos grandes para cada tipo de despesa');
  ok(ini.nav !== 'none' && /^#0[0-9A-F]{5}$/i.test(ini.brasa), `barra de baixo e cores do tema do sistema (destaque ${ini.brasa})`);
  ok(ini.sess && ini.local.length === 0, 'sessão só nesta aba (nada de senha ou token no localStorage)');
  await fotoC('mot-02-inicio.png');
  /* novo abastecimento: valor, litros e km → onde → pagamento → foto → conferir → enviar */
  await c.click('[data-acao="nova"][data-tipo="combustivel"]'); await c.waitForSelector('#fValor');
  await c.click('[data-acao="seguir"]'); await c.waitForSelector('.cmp.erro');
  ok(/Informe o valor/.test(await c.textContent('.cmp.erro .msg')), 'valor em branco: aviso junto ao campo');
  await c.click('#fValor'); await c.keyboard.type('45678'); const vtxt = await c.inputValue('#fValor');
  ok(vtxt === '456,78', `valor digitado só com números vira ${vtxt}`);
  await c.fill('#fLitros', '76,5'); await c.fill('#fKm', '1250'); await c.dispatchEvent('#fLitros', 'input'); await c.dispatchEvent('#fKm', 'input');
  await fotoC('mot-03-valor.png');
  await c.click('[data-acao="seguir"]'); await c.waitForSelector('#fLocal');
  const viaSel = await c.getAttribute('[data-viagem-op="vg_celViagem00000001"]', 'aria-pressed');
  ok(viaSel === 'true', 'a viagem ativa já vem escolhida');
  await c.fill('#fLocal', 'Posto Teste'); await c.dispatchEvent('#fLocal', 'input');
  await c.click('[data-acao="seguir"]'); await c.waitForSelector('[data-forma]');
  await c.click('[data-forma="Dinheiro"]'); await c.click('[data-origem="adiantamento"]');
  await fotoC('mot-04-pagamento.png');
  await c.click('[data-acao="seguir"]'); await c.waitForSelector('[data-arquivo]', { state: 'attached' });
  /* foto do cupom pela galeria (arquivo de imagem): diminui e envia na hora */
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await c.setInputFiles('input[data-arquivo]:not([capture])', { name: 'cupom.png', mimeType: 'image/png', buffer: png });
  await c.waitForFunction(() => /Foto pronta/.test(document.body.innerText), null, { timeout: 8000 });
  ok(S.uploads.length === 1 && /^[0-9a-f]{32}$/.test(S.uploads[0]), 'foto do comprovante enviada (código de 32 caracteres) com prévia');
  await fotoC('mot-05-conferir.png');
  /* envio: a conexão cai no primeiro; os dados ficam; o segundo vai com o MESMO código (não duplica) */
  await c.click('[data-acao="enviar"]'); await c.waitForSelector('.aviso.pe');
  const avisoRede = await c.textContent('.aviso.pe'); const rasc = await c.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jb_mot_rascunho:')).length);
  ok(/Sem conexão/.test(avisoRede) && rasc === 1, 'sem conexão: avisa e o lançamento fica guardado neste celular');
  await c.click('[data-acao="enviar"]'); await c.waitForSelector('.conf');
  const conf = await c.evaluate(() => document.body.innerText);
  ok(S.lancar.length === 2 && S.lancar[0] === S.lancar[1] && S.desp.length === 1, `reenviado com o mesmo código (${S.lancar.length} envios, ${S.desp.length} lançamento)`);
  ok(/Despesa registrada/.test(conf) && /nº 7/.test(conf) && /456,78/.test(conf) && /Combustível · Despesas com entregas/.test(conf) && /Aguardando conferência/.test(conf) && /Viagem/.test(conf), 'confirmação: número, valor, categoria, viagem e situação');
  ok(S.desp[0].litros === 76.5 && S.desp[0].km === 1250 && S.desp[0].foto && S.desp[0].origem === 'adiantamento' && S.desp[0].viagemId === 'vg_celViagem00000001', 'enviado com litros, km, foto, de onde saiu o dinheiro e a viagem');
  const rasc2 = await c.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('jb_mot_rascunho:')).length);
  ok(rasc2 === 0, 'depois de enviar, o rascunho some do celular');
  await fotoC('mot-06-confirmacao.png');
  /* despesa sem viagem precisa de motivo */
  await c.click('[data-acao="nova"]'); await c.waitForSelector('[data-acao="tipo"]'); await c.click('[data-acao="tipo"][data-tipo="alimentacao"]');
  await c.click('#fValor'); await c.keyboard.type('2500'); await c.click('[data-acao="seguir"]'); await c.waitForSelector('#fLocal');
  await c.click('[data-viagem-op=""]'); await c.waitForSelector('#fJust'); await c.click('[data-acao="seguir"]'); await c.waitForSelector('.cmp.erro');
  ok(/motivo/.test(await c.textContent('.cmp.erro .msg')), 'sem viagem: pede o motivo antes de seguir');
  /* o "voltar" do celular volta uma etapa, e o que foi digitado continua */
  await c.goBack(); await c.waitForSelector('#fValor'); const vb = await c.inputValue('#fValor');
  ok(vb === '25,00', `voltar do Android volta uma etapa com o valor preenchido (${vb})`);
  await c.goBack(); await c.waitForSelector('[data-acao="tipo"]');
  ok(true, 'voltar de novo: tela de escolher o tipo (o lançamento é um passo só do histórico)');
  await c.goBack(); await c.waitForSelector('.topo [data-acao="sair"]');
  ok(/Lançamento não enviado/i.test(await c.textContent('main')) && /Alimentação/.test(await c.textContent('main')), 'saindo do lançamento, o que foi preenchido fica guardado e aparece no início (Continuar ou Descartar)');
  /* histórico e correção */
  await c.click('.nav [data-nav="historico"]'); await c.waitForSelector('.item');
  await c.click('.item'); await c.waitForSelector('[data-acao="corrigir"]');
  await fotoC('mot-07-detalhe.png');
  await c.click('[data-acao="corrigir"]'); await c.waitForSelector('#fValor');
  await c.fill('#fValor', ''); await c.click('#fValor'); await c.keyboard.type('44000');
  for (let i = 0; i < 3; i++) { await c.click('[data-acao="seguir"]'); await c.waitForTimeout(150); }
  await c.waitForSelector('#fMotivo'); await c.fill('#fMotivo', 'Valor do cupom'); await c.dispatchEvent('#fMotivo', 'input');
  await c.click('[data-acao="enviar"]'); await c.waitForSelector('.conf');
  ok(S.corrigir.length === 1 && S.corrigir[0].id === S.desp[0].id && S.corrigir[0].campos.valor === 440 && S.corrigir[0].motivo === 'Valor do cupom', 'corrigir antes da conferência: mesmo lançamento, valor novo e o motivo');
  /* viagem: encerrar com km */
  await c.click('main [data-nav="inicio"]'); await c.waitForSelector('[data-acao="encerrar"]'); await c.click('[data-acao="encerrar"]');
  await c.waitForSelector('.janela #jKm'); await c.fill('.janela #jKm', '900'); await c.click('.janela [data-ok]'); await c.waitForSelector('.janela .msg-j:not([hidden])');
  ok(/menor que o da saída/.test(await c.textContent('.janela .msg-j')), 'km da chegada menor que o da saída: recusa com mensagem clara');
  await c.fill('.janela #jKm', '1420'); await c.click('.janela [data-ok]'); await c.waitForFunction(() => !document.querySelector('.veu'));
  ok(S.viagem.some((p) => p.acao === 'encerrar' && p.km === 1420), 'viagem encerrada com o km do painel');
  /* sair: a sessão some da aba */
  await c.click('[data-acao="sair"]'); await c.waitForSelector('#eU');
  ok(await c.evaluate(() => !sessionStorage.getItem('jb_mot_sessao')), 'sair: a sessão some deste celular');
  ok(errC.length === 0, 'celular sem erros de JavaScript' + (errC.length ? ': ' + errC.slice(0, 3).join(' | ') : ''));
  await m.close();
} catch (e) { falhas++; console.log('  ✘ o teste parou: ' + (e && e.stack || e)); }
finally { await browser.close(); http.close(); }
console.log(`\nDespesas de entrega: ${Math.max(0, total - falhas)} de ${total} aprovados${falhas ? ', ' + falhas + ' falharam' : ''}.`);
process.exit(falhas ? 1 : 0);
