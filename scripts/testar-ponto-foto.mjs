#!/usr/bin/env node
// Teste de ponta a ponta do Ponto com foto (V78), no programa REAL (saida/claude.html) num
// Chromium com câmera simulada, banco central simulado e anexos simulados. Nada sai para a internet.
// Confere:
//   1. a tela abre pelo endereço #/pontoFoto e lista os empregados ativos (sem prestador)
//   2. tocar no nome abre a câmera, conta 3-2-1, tira a foto sozinha e grava a ENTRADA no Diário
//      do DP, com a foto ligada à marcação e o código fixo do dia; a foto é pequena
//   3. a mesma pessoa não bate de novo em menos de 2 minutos
//   4. a próxima batida grava só o que muda: o que o DP alterou no registro continua lá
//   5. jornada sem intervalo sugere a saída; turno da noite fecha a jornada de ontem
//   6. o Espelho de ponto mostra a câmera ao lado do horário e "Fotos do dia" mostra a foto
//   7. o perfil "Celular do ponto" só enxerga esta tela e volta para ela de qualquer endereço
//   8. sem câmera: oferece "Tirar foto" e "Registrar sem foto" (fica marcado sem foto)
// Uso: node scripts/construir.mjs && node scripts/testar-ponto-foto.mjs
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

// f1: jornada com intervalo · f2: jornada sem intervalo · f3: turno da noite · f4: prestador · f5: desligado
const FUNCS = [
  { id: 'f1', nome: 'Ana Teste Souza', matricula: '101', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', entrada: '07:00', saida: '17:00', intervalo: 60 },
  { id: 'f2', nome: 'Bruno Teste Lima', matricula: '102', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', entrada: '07:00', saida: '13:00', intervalo: 0 },
  { id: 'f3', nome: 'Carla Teste Dias', matricula: '103', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Forno' },
  { id: 'f4', nome: 'Diego Prestador', matricula: '104', situacao: 'Ativo', tipoContratacao: 'Prestador de serviços autônomo (pessoa física)', setor: 'Manutenção' },
  { id: 'f5', nome: 'Elton Desligado', matricula: '105', situacao: 'Desligado', tipoContratacao: 'CLT', setor: 'Produção' },
];

const iniciar = ({ codigo, funcs, semCamera }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
  funcs.forEach((f) => srv.estado.gravarDireto('funcionarios', f.id, f));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.__arquivos = [];
  const assets = { upload: async (f) => { const id = 'pf' + String(window.__arquivos.length).padStart(30, '0'); window.__arquivos.push({ id, nome: f.name, tam: f.size, tipo: f.type }); return { id, url: '/_blob/' + id, sizeBytes: f.size, contentType: f.type }; } };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'assets' ? assets : null) };
  if (semCamera) {
    const negar = async () => { const e = new Error('Permission denied'); e.name = 'NotAllowedError'; throw e; };
    try { Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: negar, configurable: true }); } catch (e) { /* sem mediaDevices: a tela já trata */ }
  }
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const browser = await chromium.launch({ args:['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
async function abrir(semCamera) {
  const ctx = await browser.newContext({ permissions: ['camera'] });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  // no Claude, "/_blob/<id>" é servido pelo próprio artifact: aqui, uma imagem mínima no lugar
  await ctx.route(/^http:\/\/127\.0\.0\.1:\d+\/_blob\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, funcs: FUNCS, semCamera });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.funcionarios.length >= 5, null, { timeout: 30000 });
  return { ctx, page, erros };
}
const semErros = (erros) => erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));

try {
  const { ctx, page, erros } = await abrir(false);
  const H = await page.evaluate(() => hoje());

  /* ---------- 1. a tela ---------- */
  await page.evaluate(() => { location.hash = '#/pontoFoto'; });
  await page.waitForSelector('#pfLista [data-pf-f]', { timeout: 10000 });
  const nomes = await page.$$eval('#pfLista [data-pf-f]', (b) => b.map((x) => x.dataset.pfF));
  ok(nomes.join(',') === 'f1,f2,f3', `lista só os empregados ativos (${nomes.join(', ')})`);
  ok(await page.evaluate(() => document.body.classList.contains('modo-setor')), 'tela cheia do sistema, sem menu (modo setor)');
  ok(await page.evaluate(() => /\d{2}:\d{2}/.test(document.getElementById('pfHora').textContent)), 'mostra a hora');
  await page.fill('#pfBusca', '102');
  ok((await page.$$eval('#pfLista [data-pf-f]', (b) => b.map((x) => x.dataset.pfF))).join() === 'f2', 'busca pela matrícula');
  await page.fill('#pfBusca', 'ana souza');
  ok((await page.$$eval('#pfLista [data-pf-f]', (b) => b.map((x) => x.dataset.pfF))).join() === 'f1', 'busca pelo nome: cada palavra conta, sem precisar do nome do meio');
  await page.fill('#pfBusca', '');
  ok(await page.evaluate(() => [...document.querySelectorAll('.dir-aba,.ms-aba,a,button')].some((a) => /Ponto com foto/.test(a.textContent)) || AREAS_MS.find((x) => x.g === 'Ponto e lançamentos').A.some((x) => x.m === 'pontoFoto')), 'item "Ponto com foto" no menu do DP (Ponto e lançamentos)');
  ok(await page.evaluate(() => { const A = AREAS_MS.find((x) => x.g === 'Ponto e lançamentos').A; return A.findIndex((x) => x.m === 'pontoFoto') === A.findIndex((x) => x.m === 'ponto') + 1; }), 'logo depois do Espelho de ponto');

  /* ---------- 2. a batida com foto ---------- */
  await page.click('#pfLista [data-pf-f="f1"]');
  await page.waitForSelector('.pf-cam #pfTipo', { timeout: 5000 });
  ok(await page.textContent('#pfTipo') === 'Entrada', 'tocar no nome: vai registrar Entrada');
  ok(await page.waitForFunction(() => /^[123]$/.test((document.getElementById('pfConta') || {}).textContent || ''), null, { timeout: 8000 }).then(() => true, () => false), 'câmera abriu e a contagem 3-2-1 começou');
  await page.waitForSelector('.pf-cam.pf-res-ok', { timeout: 15000 });
  const r1 = await page.evaluate((H) => {
    const r = DATA.diario.find((x) => x.funcionarioId === 'f1' && x.data === H);
    const srv = window.__srv.estado.docs.get('diario/' + H);
    const it = srv && srv.dados.items && Object.values(srv.dados.items).find((x) => x.funcionarioId === 'f1');
    return { r, it, arq: window.__arquivos, tela: document.querySelector('.pf-cam').textContent };
  }, H);
  ok(!!(r1.r && /^\d{2}:\d{2}$/.test(r1.r.entrada)), `entrada gravada no Diário do DP (${r1.r && r1.r.entrada})`);
  ok(!!(r1.it && r1.it.entrada === r1.r.entrada), 'chegou ao banco central');
  ok(r1.r && r1.r.id === 'pt' + H.replace(/-/g, '') + 'f1', 'registro com o código fixo do dia (duas batidas juntas não duplicam)');
  ok(r1.r && r1.r.tipo === 'Presença normal' && r1.r.statusAjuste === 'Não se aplica', 'mesmo formato do "Registrar marcação agora"');
  ok(r1.arq.length === 1 && r1.arq[0].tipo === 'image/jpeg' && r1.arq[0].tam < 60000, `uma foto JPEG pequena guardada (${r1.arq[0] && Math.round(r1.arq[0].tam / 1024)} KB)`);
  ok(!!(r1.r && r1.r.fotosPonto && r1.r.fotosPonto.entrada && r1.r.fotosPonto.entrada.id === r1.arq[0].id && r1.r.fotosPonto.entrada.em), 'a foto fica ligada à marcação de entrada, com carimbo de hora');
  ok(/Entrada registrada/.test(r1.tela) && /Ana Teste Souza/.test(r1.tela), 'confirmação na tela com nome e tipo de batida');
  await page.waitForSelector('.pf-cam', { state: 'detached', timeout: 7000 });
  ok(true, 'a confirmação fecha sozinha e volta para a lista');
  ok(await page.evaluate(() => /Entrada \d{2}:\d{2}/.test(document.querySelector('#pfLista [data-pf-f="f1"]').textContent)), 'a lista mostra o que a pessoa já bateu hoje');

  /* ---------- 3. de novo em menos de 2 minutos ---------- */
  await page.click('#pfLista [data-pf-f="f1"]');
  await page.waitForSelector('.pf-cam.pf-res-erro', { timeout: 5000 });
  ok(/menos de 2 minutos/.test(await page.textContent('.pf-cam')), 'bater de novo em menos de 2 minutos é recusado');
  ok(await page.evaluate(() => window.__arquivos.length) === 1, 'nenhuma foto nova foi tirada');
  await page.click('.pf-cam [data-pf="sair"]');

  /* ---------- 4. a próxima batida grava só o que muda ---------- */
  const r4 = await page.evaluate(async (H) => {
    const P = window.PONTO_FOTO_V78;
    const r = DATA.diario.find((x) => x.funcionarioId === 'f1' && x.data === H);
    await gravar('diario', { ...r, obs: 'Anotação do DP' }, r);              // o DP mexe no registro
    await new Promise((ok) => { const t = setInterval(() => { if (DATA.diario.find((x) => x.id === r.id).obs) { clearInterval(t); ok(); } }, 30); });
    const daqui = new Date(Date.now() + 3 * 60000);
    const c = P.conferir('f1', daqui);
    const sug = c.ok && c.op[0];
    const res = await P.gravarBatida('f1', 'saidaIntervalo', { ...c, ant: r }, daqui, { id: 'pfINTERVALO000000000000000000000', tam: 1 });  // registro antigo, sem a anotação
    await new Promise((ok) => { const t = setInterval(() => { const x = DATA.diario.find((y) => y.id === r.id); if (x.saidaIntervalo) { clearInterval(t); ok(); } }, 30); });
    await new Promise((ok) => setTimeout(ok, 300));
    const srv = window.__srv.estado.docs.get('diario/' + H).dados.items[r.id];
    return { sug, res, srv, quantos: DATA.diario.filter((x) => x.funcionarioId === 'f1' && x.data === H).length };
  }, H);
  ok(r4.sug === 'saidaIntervalo', 'jornada com intervalo: depois da entrada sugere a saída para o intervalo');
  ok(r4.srv && r4.srv.obs === 'Anotação do DP', 'a anotação que o DP fez no meio do dia continua lá');
  ok(r4.srv && r4.srv.entrada && r4.srv.saidaIntervalo && r4.srv.fotosPonto.entrada && r4.srv.fotosPonto.saidaIntervalo, 'entrada, intervalo e as duas fotos no mesmo registro');
  ok(r4.quantos === 1, 'um registro só no dia');

  /* ---------- 5. sem intervalo e turno da noite ---------- */
  const r5 = await page.evaluate(async (H) => {
    const P = window.PONTO_FOTO_V78;
    const sem = P.opcoes({ entrada: '07:00', data: H }, 'f2', H);
    const ontem = addDias(H, -1);
    await gravar('diario', { id: 'noite1', data: ontem, funcionarioId: 'f3', tipo: 'Presença normal', statusAjuste: 'Não se aplica', entrada: '22:00' }, null);
    await new Promise((ok) => { const t = setInterval(() => { if (DATA.diario.some((x) => x.id === 'noite1')) { clearInterval(t); ok(); } }, 30); });
    const madrugada = dt(H); madrugada.setHours(2, 30, 0, 0);
    const c = P.conferir('f3', madrugada);
    const dia = dt(H); dia.setHours(23, 0, 0, 0);
    const c2 = P.conferir('f3', dia);   // 25 h depois: já é outra jornada
    return { sem, c: { ok: c.ok, data: c.data, op: c.op }, ontem, c2: { data: c2.data, op: c2.op } };
  }, H);
  ok(r5.sem[0] === 'saida' && r5.sem.includes('saidaIntervalo'), 'jornada sem intervalo: sugere a saída e deixa trocar para intervalo');
  ok(r5.c.ok && r5.c.data === r5.ontem && r5.c.op[0] === 'saidaIntervalo', 'turno da noite: de madrugada continua a jornada que começou ontem');
  ok(r5.c2.data === H && r5.c2.op[0] === 'entrada', 'depois de 16 h sem saída, a batida começa uma jornada nova');

  /* ---------- 5b. correções da revisão ---------- */
  const r5b = await page.evaluate(async (H) => {
    const P = window.PONTO_FOTO_V78;
    const as = (h) => { const d = dt(H); const [a, b] = h.split(':').map(Number); d.setHours(a, b, 0, 0); return d; };
    const almoco = P.opcoes({ entrada: '07:00', data: H }, 'f1', H, as('11:05'));
    const fimDia = P.opcoes({ entrada: '07:00', data: H }, 'f1', H, as('17:02'));
    const semRetorno = P.opcoes({ entrada: '07:00', saidaIntervalo: '11:00', data: H }, 'f1', H, as('16:00'));
    // foto antiga não fica presa: o DP apaga a entrada da Bruna e a nova batida sai sem foto
    await gravar('diario', { id: 'velho1', data: H, funcionarioId: 'f3', tipo: 'Presença normal', statusAjuste: 'Não se aplica', entrada: '', fotosPonto: { entrada: { em: new Date(Date.now() - 3600e3).toISOString(), id: 'FOTO_DE_OUTRA_PESSOA_000000000000', tam: 99, onde: 'claude' } } }, null);
    await new Promise((ok) => { const t = setInterval(() => { if (DATA.diario.some((x) => x.id === 'velho1')) { clearInterval(t); ok(); } }, 30); });
    const ant = DATA.diario.find((x) => x.id === 'velho1');
    const c = P.conferir('f3', new Date());
    await P.gravarBatida('f3', 'entrada', { ...c, data: H, ant }, new Date(), null);
    await new Promise((ok) => setTimeout(ok, 400));
    const fp = window.__srv.estado.docs.get('diario/' + H).dados.items.velho1.fotosPonto.entrada;
    // registro apagado no meio: a batida devolve o registro inteiro, com tipo
    const apagado = { ...ant, id: 'apagado1', entrada: '06:00' };
    await P.gravarBatida('f3', 'saidaIntervalo', { data: H, ant: apagado }, new Date(Date.now() + 5 * 60000), null);
    await new Promise((ok) => setTimeout(ok, 400));
    const ap = window.__srv.estado.docs.get('diario/' + H).dados.items.apagado1;
    // a pesquisa (Ctrl K) mostra o item uma vez só
    const pq = typeof pqEntradas === 'function' ? pqEntradas().filter((e) => e.t === 'Ponto com foto').length : 1;
    return { almoco, fimDia, semRetorno, fp, apTipo: ap && ap.tipo, pq };
  }, H);
  ok(r5b.almoco[0] === 'saidaIntervalo', 'só com a entrada, perto do almoço: sugere a saída para o intervalo');
  ok(r5b.fimDia[0] === 'saida' && r5b.fimDia.includes('saidaIntervalo'), 'só com a entrada, no fim do dia: sugere a saída (quem não bateu o almoço)');
  ok(r5b.semRetorno.join() === 'retornoIntervalo,saida', 'saiu para o intervalo: dá para marcar a saída sem voltar');
  ok(r5b.fp && r5b.fp.id === null && r5b.fp.semFoto === true, 'batida sem foto não herda a foto antiga da marcação');
  ok(r5b.apTipo === 'Presença normal', 'batida sobre registro apagado no meio volta com o tipo (não vira item sem tipo)');
  ok(r5b.pq === 1, `pesquisa (Ctrl K) mostra "Ponto com foto" uma vez só (${r5b.pq})`);

  // cancelar e tocar em outro nome enquanto a câmera abre: ao sair da tela, nenhuma câmera fica ligada
  await page.click('#pfLista [data-pf-f="f2"]');
  await page.click('.pf-cam [data-pf="sair"]');
  await page.click('#pfLista [data-pf-f="f2"]');
  await page.waitForSelector('.pf-cam [data-pf="sair"]');
  await page.click('.pf-cam [data-pf="sair"]');
  await page.evaluate(() => { location.hash = '#/ponto'; });
  await page.waitForTimeout(1500);
  const cam = await page.evaluate(() => window.PONTO_FOTO_V78.camera());
  ok(!cam.ligada && !cam.abrindo, 'cancelar e tocar de novo: ao sair da tela a câmera desliga');

  /* ---------- 6. Espelho de ponto e Fotos do dia ---------- */
  await page.evaluate(() => { UIP.func = 'f1'; UIP.mes = hoje().slice(0, 7); location.hash = '#/ponto'; });
  await page.waitForSelector('table.espelho', { timeout: 10000 });
  ok(await page.evaluate(() => document.querySelectorAll('table.espelho a.pf-mini[href^="/_blob/"]').length) === 2, 'Espelho de ponto: câmera ao lado da entrada e do intervalo');
  ok(await page.evaluate(() => !!document.querySelector('.cab .acoes [data-pf-ir]')), 'Espelho de ponto: botão "Ponto com foto"');
  await page.click('.cab .acoes [data-pf-fotos]');
  await page.waitForSelector('.pf-modal', { timeout: 5000 });
  await page.waitForFunction(() => [...document.querySelectorAll('.pf-modal img[data-pf-img]')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 5000 }).catch(() => {});
  const r6 = await page.evaluate(() => { const ana = [...document.querySelectorAll('.pf-modal .pf-fp')].find((c) => /Ana Teste Souza/.test(c.textContent));
    return { ana: !!ana, fotos: ana ? [...ana.querySelectorAll('img[data-pf-img]')].filter((i) => i.complete && i.naturalWidth > 0).length : 0, semFoto: /Sem foto/.test(document.querySelector('.pf-modal').textContent) }; });
  ok(r6.ana && r6.fotos === 2, `"Fotos do dia" mostra as fotos de quem bateu (Ana: ${r6.fotos} fotos)`);
  ok(r6.semFoto, '"Fotos do dia" avisa a batida que ficou sem foto');
  await page.click('.pf-modal [data-r]');

  /* ---------- 7. perfil "Celular do ponto" ---------- */
  const r7 = await page.evaluate(async () => {
    const rotas = Object.keys(PERM).filter((k) => PERM[k] && ((PERM[k].v || []).includes('celularPonto') || (PERM[k].e || []).includes('celularPonto')));
    APP.papel = 'celularPonto';
    location.hash = '#/setores';
    await new Promise((ok) => setTimeout(ok, 600));
    const h1 = location.hash;
    location.hash = '#/painel';
    await new Promise((ok) => setTimeout(ok, 600));
    const h2 = location.hash;
    const r = { rotas, h1, h2, nome: PAPEIS.celularPonto, voltar: !!document.querySelector('#pfRaiz a[href="#/ponto"]'), fotos: !!document.getElementById('pfFotos'), classe: document.body.classList.contains('pf-celular') };
    // Controle Central: Setor Pessoal suspenso para o celular
    const pol0 = CONTROLE_CENTRAL.pol, dono0 = APP.isOwner;
    CONTROLE_CENTRAL.pol = () => ({ ...pol0(), setoresSuspensos: ['dp'], concessoes: {} }); APP.isOwner = false;
    renderTela();
    r.suspenso = /indisponível/.test(document.getElementById('conteudo').textContent) && !document.getElementById('pfLista');
    CONTROLE_CENTRAL.pol = pol0; APP.isOwner = dono0;
    APP.papel = 'admin'; renderCasca(); renderTela();
    r.voltou = !!document.getElementById('pfFotos');   // a tela se remonta com o perfil novo
    // quem perdeu o Espelho de ponto (Controle Central) perde também o ponto com foto
    const v0 = PERM.ponto.v; PERM.ponto.v = v0.filter((x) => x !== 'admin');
    renderTela();
    r.semEspelho = /indisponível/.test(document.getElementById('conteudo').textContent);
    PERM.ponto.v = v0; renderTela();
    r.classeDepois = document.body.classList.contains('pf-celular');
    return r;
  });
  ok(r7.classe && !r7.classeDepois, 'no celular da parede somem os botões "Sair" e "Atualizar agora" da nuvem');
  ok(r7.suspenso, 'Setor Pessoal suspenso no Controle Central: o celular para de bater');
  ok(r7.semEspelho, 'quem perdeu o Espelho de ponto no Controle Central perde também o ponto com foto');
  ok(r7.voltou, 'trocar o perfil com a tela aberta remonta a tela');
  ok(r7.rotas.join() === 'pontoFoto', `o perfil só tem a tela do ponto com foto (${r7.rotas.join(', ')})`);
  ok(r7.h1 === '#/pontoFoto' && r7.h2 === '#/pontoFoto', 'de qualquer endereço volta para a tela do ponto');
  ok(r7.nome === 'Celular do ponto', 'perfil "Celular do ponto" aparece para o administrador escolher');
  ok(!r7.voltar && !r7.fotos, 'no celular não aparecem o Espelho nem as fotos de outras pessoas');
  ok(semErros(erros).length === 0, `sem erros de JavaScript${semErros(erros).length ? ': ' + semErros(erros).slice(0, 3).join(' | ') : ''}`);
  // o celular da parede, em pé (412 e 360 px de largura)
  for (const w of [412, 360]) {
    await page.setViewportSize({ width: w, height: 860 });
    await page.evaluate(() => { APP.papel = 'celularPonto'; location.hash = '#/pontoFoto'; renderCasca(); renderTela(); });
    await page.waitForSelector('#pfLista [data-pf-f]');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `celular da parede (${w} px): a tela cabe sem rolar para o lado`);
    if (w === 412) await page.screenshot({ path: join(RAIZ, 'saida/tela-ponto-foto.png') });
  }
  await page.evaluate(() => { APP.papel = 'admin'; renderCasca(); renderTela(); });
  await ctx.close();

  /* ---------- 8. sem câmera ---------- */
  const s = await abrir(true);
  await s.page.evaluate(() => { location.hash = '#/pontoFoto'; });
  await s.page.waitForSelector('#pfLista [data-pf-f]', { timeout: 10000 });
  await s.page.click('#pfLista [data-pf-f="f2"]');
  await s.page.waitForSelector('.pf-cam [data-pf-arq]', { state: 'attached', timeout: 8000 });
  ok(/permissão da câmera foi negada/.test(await s.page.textContent('.pf-cam')), 'câmera negada: explica o motivo');
  ok(await s.page.evaluate(() => !!document.querySelector('.pf-cam input[type=file][capture="user"]')), 'oferece "Tirar foto" com a câmera do celular');
  await s.page.click('.pf-cam [data-pf="semfoto"]');
  await s.page.waitForSelector('.pf-cam.pf-res-ok', { timeout: 10000 });
  const r8 = await s.page.evaluate(() => DATA.diario.find((x) => x.funcionarioId === 'f2' && x.data === hoje()));
  ok(!!(r8 && r8.entrada && r8.fotosPonto && r8.fotosPonto.entrada && r8.fotosPonto.entrada.semFoto === true), '"Registrar sem foto" grava a entrada marcada como sem foto');
  ok(semErros(s.erros).length === 0, `sem erros de JavaScript (sem câmera)${semErros(s.erros).length ? ': ' + semErros(s.erros).slice(0, 3).join(' | ') : ''}`);
  await s.ctx.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nPonto com foto: tudo certo.');
process.exit(falhas ? 1 : 0);
