#!/usr/bin/env node
// Teste de ponta a ponta do Ponto facial profissional (V126), no programa REAL (saida/claude.html) num Chromium
// com banco central simulado. A câmera é simulada (duas câmeras: traseira e da frente) e mostra rostos de verdade
// (fotos de exemplo que vêm com a biblioteca face-api). O reconhecimento roda de verdade; nada sai para a internet.
// Confere a auditoria pedida para o módulo:
//    1. a câmera traseira abre direto, em tela cheia, sem senha            8. o registro aparece no controle individual
//    2. a câmera da frente funciona                                        9. o horário gravado é o do momento do toque
//    3. a alternância entre as câmeras funciona                           10. toque repetido não duplica a marcação
//    4. funcionário cadastrado é identificado                             11. os relatórios trazem os dados certos
//    5. pessoa sem cadastro é rejeitada                                   12. as permissões por perfil funcionam
//    6. só a confirmação grava a marcação                                 13. os dados continuam depois de recarregar
//    7. a sequência entrada → intervalo → retorno → saída funciona        14. funciona em celular e em computador
// e ainda: cadastro sem foto, foto do momento em cada marcação (V127), aba Pontos do funcionário, termo de ciência, registro sem reconhecimento, tratamento (conferir e anular),
// fase de testes x registro definitivo (Diário do DP), teste de reconhecimento, senha, tela travada e câmera solta ao sair,
// e o MEI (prestador de serviços, V163): cadastro facial, marcação, sem jornada e fora do Diário do DP.
// Uso: npm install --no-save playwright @vladmandic/face-api@1.7.15 && node scripts/construir.mjs && node scripts/testar-ponto-facial.mjs
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FA = [process.env.JB_FACEAPI, join(RAIZ, 'node_modules/@vladmandic/face-api'), '/tmp/fa/node_modules/@vladmandic/face-api'].find((p) => p && existsSync(join(p, 'dist/face-api.js')));
if (!FA) { console.log('Ponto facial: biblioteca face-api não instalada (npm install --no-save @vladmandic/face-api@1.7.15). Teste não executado.'); process.exit(1); }
const TELAS = join(RAIZ, 'saida/teste-facial'); mkdirSync(TELAS, { recursive: true });

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/_fa/') ? join(FA, u.slice(5)) : join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!(p.startsWith(RAIZ) || p.startsWith(FA)) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
// o programa pede a biblioteca e os modelos ao jsDelivr: aqui eles vêm da pasta instalada
const CDN = /^https:\/\/cdn\.jsdelivr\.net\/npm\/@vladmandic\/face-api@1\.7\.15\/(.+)$/;
const rotas = async (ctx) => {
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const m = CDN.exec(r.request().url().split('?')[0]);
    const p = m && join(FA, m[1]);
    if (p && existsSync(p)) return r.fulfill({ status: 200, contentType: p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : 'application/octet-stream', body: readFileSync(p) });
    return r.abort();
  });
};

let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
/* V129: nas listas em cartões, as ações da linha ficam no menu de três pontos (a principal, em vermelho,
   continua à vista). Espera o padrão arrumar a linha e usa o botão, se estiver à vista, ou o item do menu. */
const acaoDaLinha = async (page, linha, alvo) => {
  const sel = `${linha} ${alvo}`;
  await page.waitForSelector(sel, { state: 'attached', timeout: 8000 });
  await page.waitForFunction((l) => { const tr = document.querySelector(l); return !!tr && tr.dataset.jbm === '1'; }, linha, { timeout: 4000 }).catch(() => {});
  if (await page.isVisible(sel)) { await page.click(sel); return; }
  const rot = await page.$eval(sel, (e) => (e.dataset.tip || e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' '));
  await page.click(`${linha} .jbl-m`);
  await page.click(`.dc-pop button:has-text("${rot}")`);
};
const semErros = (erros) => erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));

/* ---------- 0. os quadros da câmera: um rosto grande no meio de 640 × 480 ---------- */
let quadros;
{
  const b0 = await chromium.launch();
  const p0 = await b0.newPage();
  await p0.goto(base + '/_fa/demo/sample3.jpg');
  await p0.addScriptTag({ url: base + '/_fa/dist/face-api.js' });
  quadros = await p0.evaluate(async (base) => {
    const m = base + '/_fa/model/';
    await faceapi.tf.ready();
    await Promise.all([faceapi.nets.ssdMobilenetv1.loadFromUri(m)]);
    const out = [];
    for (const arq of ['sample3.jpg', 'sample6.jpg']) {
      const im = new Image(); im.src = base + '/_fa/demo/' + arq; await im.decode();
      const ds = (await faceapi.detectAllFaces(im, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))).sort((a, b) => a.box.x - b.box.x);
      for (const d of ds) {
        const b = d.box, lado = Math.max(b.width, b.height), H = lado / 0.5, W = H * 640 / 480;   // rosto com metade da altura do quadro
        const c = document.createElement('canvas'); c.width = 640; c.height = 480;
        const x = c.getContext('2d'); x.fillStyle = '#777'; x.fillRect(0, 0, 640, 480);
        x.drawImage(im, b.x + b.width / 2 - W / 2, b.y + b.height / 2 - H / 2, W, H, 0, 0, 640, 480);
        out.push(c.toDataURL('image/jpeg', 0.92));
      }
    }
    return out;
  }, base);
  await b0.close();
  if (quadros.length < 3) { console.log('não achei 3 rostos nas fotos de exemplo'); process.exit(1); }
}

const FUNCS = [
  { id: 'f1', nome: 'Ana Teste Souza', matricula: '101', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', cargo: 'Forneira', jornadaId: 'j1' },   // jornada própria, todos os dias: o teste não depende do dia da semana
  { id: 'f2', nome: 'Bruna Teste Lima', matricula: '102', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção' },
  { id: 'f3', nome: 'Carla Teste Dias', matricula: '103', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Forno' },
  { id: 'f4', nome: 'Diego Prestador', matricula: '104', situacao: 'Ativo', tipoContratacao: 'Prestador de serviços autônomo (pessoa física)', setor: 'Manutenção' },
  { id: 'f5', nome: 'Elton Desligado', matricula: '105', situacao: 'Desligado', tipoContratacao: 'CLT', setor: 'Produção' },
];
/* o banco simulado e a câmera simulada: duas câmeras (traseira e da frente), com o rosto que o teste escolher */
const iniciar = ({ codigo, funcs, quadros }) => {
  if (!sessionStorage.getItem('__docs')) sessionStorage.setItem('__docs', '[]');
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  /* o "banco" atravessa o recarregar da página (como o banco de verdade) */
  const guardados = JSON.parse(sessionStorage.getItem('__docs'));
  if (guardados.length) guardados.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
  else { srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }); funcs.forEach((f) => srv.estado.gravarDireto('funcionarios', f.id, f));
    const dia = { e: '07:00', s: '17:00', i: 60 }; srv.estado.gravarDireto('config', 'empresa', { jornadas: [{ id: 'j1', nome: 'Fábrica', dias: { 0: dia, 1: dia, 2: dia, 3: dia, 4: dia, 5: dia, 6: dia } }] }); }
  setInterval(() => { try { sessionStorage.setItem('__docs', JSON.stringify(Array.from(srv.estado.docs.values()).map((d) => [d.colecao, d.id, d.dados]))); } catch (e) {} }, 300);
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: i === 'u_DONO' ? 'Dono' : '' }])) };
  window.__arquivos = [];
  const assets = { upload: async (f) => { window.__arquivos.push(f.name); return { id: 'x' + window.__arquivos.length, url: '/_blob/x', sizeBytes: f.size, contentType: f.type }; } };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'assets' ? assets : null) };

  const CAM = window.__cam = { rosto: 0, pedidos: [], vivas: new Set(), uma: false, negar: false, imgs: [] };
  const prontas = Promise.all(quadros.map((u, i) => { const im = new Image(); im.src = u; CAM.imgs[i] = im; return im.decode(); }));
  const nova = (lado) => {
    const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d'); let n = 0;
    const pintar = () => { const r = CAM.rosto;
      if (r === 'escuro') { x.fillStyle = '#060606'; x.fillRect(0, 0, 640, 480); } else if (r === 'vazio') { x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, 640, 480); } else x.drawImage(CAM.imgs[r], 0, 0, 640, 480);
      x.fillStyle = 'rgb(' + (n++ % 200) + ',90,90)'; x.fillRect(0, 0, 3, 3); };
    pintar(); const tm = setInterval(pintar, 80);
    const st = c.captureStream(12), t = st.getVideoTracks()[0], gs = t.getSettings.bind(t), parar = t.stop.bind(t);
    t.getSettings = () => ({ ...gs(), facingMode: lado, deviceId: lado === 'environment' ? 'cam-tras' : 'cam-frente' });
    t.stop = () => { clearInterval(tm); CAM.vivas.delete(t); parar(); };
    CAM.vivas.add(t); return st;
  };
  navigator.mediaDevices.getUserMedia = async (c) => {
    await prontas; const v = (c && c.video) || {}; let lado = 'user';
    if (v.deviceId && v.deviceId.exact) lado = v.deviceId.exact === 'cam-frente' ? 'user' : 'environment';
    else if (v.facingMode) lado = v.facingMode.exact || v.facingMode.ideal || v.facingMode;
    if (CAM.uma) lado = 'environment';
    CAM.pedidos.push(lado);
    if (CAM.negar) throw new DOMException('negado', 'NotAllowedError');
    return nova(lado);
  };
  navigator.mediaDevices.enumerateDevices = async () => (CAM.uma ? [{ kind: 'videoinput', deviceId: 'cam-tras', label: 'camera 0, facing back' }]
    : [{ kind: 'videoinput', deviceId: 'cam-tras', label: 'camera 0, facing back' }, { kind: 'videoinput', deviceId: 'cam-frente', label: 'camera 1, facing front' }]);
};

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  await rotas(ctx);
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, funcs: FUNCS, quadros });
  const abrir = async () => {
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.funcionarios.length >= 5, null, { timeout: 30000 });
  };
  await abrir();
  await page.waitForTimeout(1200);
  ok(await page.evaluate(() => window.__cam.pedidos.length === 0 && !document.querySelector('.pz') && lerRota().mod !== 'pontoFacial'), 'entrar no sistema não abre a câmera nem leva para o ponto');
  /* a câmera só abre com um toque: no botão "Abrir a câmera" ou num atalho que leva ao ponto facial */
  const abrirPonto = async (hash = '#/pontoFacial') => {
    await page.evaluate((h) => { location.hash = h; }, hash);
    await page.waitForSelector('#pzReabrir', { timeout: 10000 });
    await page.click('#pzReabrir');
    await page.waitForSelector('.pz video', { timeout: 8000 });
  };
  /* relógio do teste: "hoje às 07:02" (a hora do ponto é a do sistema; o teste só a desloca para conferir a jornada) */
  const relogio = (hm) => page.evaluate((hm) => { const [h, m] = hm.split(':').map(Number), d = new Date(); d.setHours(h, m, 5, 0); JB_PONTO.relogio.dif = d.getTime() - Date.now(); }, hm);
  await relogio('07:02');
  const H = await page.evaluate(() => isoDe(JB_PONTO.agora()));
  await page.waitForFunction(() => (CFG.jornadas || []).some((j) => j.id === 'j1'), null, { timeout: 10000 });
  const previstoH = await page.evaluate((H) => { const e = esperadoDia(F('f1'), H); return e ? e.min : 0; }, H);   // em feriado o sistema não prevê jornada
  if (!previstoH) console.log('    (hoje é feriado no cadastro do sistema: sem jornada prevista para o dia)');
  const marcs = () => page.evaluate(() => Array.from(window.__srv.estado.docs.values()).filter((d) => d.colecao === 'pontoMarcacoes').flatMap((d) => Object.values(d.dados.items || {})).sort((a, b) => String(a.em).localeCompare(String(b.em))));
  const eventos = (tipo) => page.evaluate((tipo) => Array.from(window.__srv.estado.docs.values()).filter((d) => d.colecao === 'pontoEventos').flatMap((d) => Object.values(d.dados.items || {})).filter((e) => !tipo || e.tipo === tipo), tipo);
  const diario = () => page.evaluate(() => Array.from(window.__srv.estado.docs.values()).filter((d) => d.colecao === 'diario').flatMap((d) => Object.values(d.dados.items || {})));
  const rosto = (r) => page.evaluate((r) => { window.__cam.rosto = r; }, r);
  const st = () => page.evaluate(() => (document.getElementById('pzSt') || {}).textContent || '');
  const cartao = (nome, ms = 120000) => page.waitForFunction((nome) => { const c = document.getElementById('pzCard'); return c && !c.hidden && c.textContent.includes(nome); }, nome, { timeout: ms });
  const semPainel = () => page.waitForFunction(() => { const p = document.getElementById('pzRes'); return !p || p.hidden; }, null, { timeout: 15000 });

  /* ---------- 1. limpeza: o que saiu e o que ficou no menu ---------- */
  const r1 = await page.evaluate(() => ({ itens: MITENS.filter((m) => /ponto|rosto|relogio/i.test(m.m)).map((m) => m.m + ':' + m.l), telas: ['pontoFoto', 'relogioPonto'].filter((t) => TELAS_V[t]), velhos: [typeof PONTO_FOTO_V78, typeof PONTO_FACIAL_V100, typeof RELOGIO_PONTO_V79].join() }));
  ok(r1.itens.includes('pontoFacial:Ponto facial') && r1.itens.includes('pontoGestao:Gestão do ponto') && r1.itens.includes('ponto:Espelho de ponto'), `menu do ponto: Ponto facial, Gestão do ponto e Espelho de ponto (${r1.itens.join(', ')})`);
  ok(!r1.itens.some((i) => /pontoFoto|relogioPonto|cadastrarRosto/.test(i)) && !r1.telas.length && r1.velhos === 'undefined,undefined,undefined', 'saíram: Ponto com foto, Fotos do dia, Relógio de digital e a tela separada de cadastrar rosto');
  ok(await page.evaluate(() => /Fazer o cadastro facial/.test(atalhosFunc(F('f1'))) && /Fazer o cadastro facial/.test(atalhosFunc(F('f4'))) && !/cadastro facial/.test(atalhosFunc(F('f5')))), 'ficha do funcionário: atalho do cadastro facial, também para o prestador de serviços (MEI, V163); não para desligado');

  /* ---------- 2. cadastro facial pela área administrativa ---------- */
  await page.evaluate(() => { location.hash = '#/pontoGestao/funcionarios'; });
  await page.waitForSelector('#pgTabRostos [data-rosto="f1"]', { timeout: 15000 });
  ok((await page.$$eval('#pgTabRostos [data-rosto]', (b) => b.map((x) => x.dataset.rosto))).join() === 'f1,f2,f3,f4', 'cadastro facial lista os ativos do DP, inclusive o prestador de serviços (MEI, V163), sem o desligado: não há segunda base de funcionários');
  const t0 = Date.now();
  await acaoDaLinha(page, '[data-rosto="f1"]', '[data-a="cadastrar"]');
  await page.waitForSelector('#pzTermoOk', { timeout: 5000 });
  await page.click('.modal [data-r="1"]');
  ok(!(await page.$('.pz-cad')), 'sem o termo de ciência (LGPD) marcado, o cadastro não começa');
  await page.check('#pzTermoOk'); await page.waitForTimeout(800); await page.click('.modal [data-r="1"]');   // o sistema ignora um segundo clique em menos de 0,7 s
  await page.waitForSelector('.pz-cad video', { timeout: 5000 });
  await page.waitForFunction(() => JB_PONTO.pronta() && JB_PONTO.camera().ligada, null, { timeout: 120000 });
  ok(await page.evaluate(() => window.__cam.pedidos[0] === 'environment' && JB_PONTO.camera().lado === 'environment'), 'o cadastro abre na câmera traseira');
  const modoIA = await page.evaluate(() => JB_PONTO.modoIA());
  console.log(`    (reconhecimento rodando em: ${modoIA === 'operario' ? 'operário, fora da tela' : 'na própria tela, sem placa de vídeo no operário'})`);
  await page.waitForFunction(() => /Cadastro facial concluído/.test((document.querySelector('.pz-cad') || {}).textContent || ''), null, { timeout: 240000 });
  const r2 = await page.evaluate(() => { const d = window.__srv.estado.docs.get('rostos/f1'); return { d: d && d.dados, arq: window.__arquivos.length }; });
  ok(!!(r2.d && r2.d.cods && r2.d.cods.length === 5 && r2.d.cods.every((c) => typeof c === 'string' && c.length === 344) && r2.d.ativo === true && r2.d.termo && r2.d.termo.em), `5 capturas automáticas viram 5 códigos no banco, com o termo registrado (${Math.round((Date.now() - t0) / 1000)} s)`);
  ok(r2.arq === 0 && !JSON.stringify(r2.d).includes('data:image'), 'nenhuma foto é guardada no cadastro, só os códigos numéricos');
  await page.click('#pzFim');
  await page.waitForFunction(() => !document.querySelector('.pz-cad') && /Cadastrado/.test(document.querySelector('[data-rosto="f1"]').textContent), null, { timeout: 8000 });
  ok(await page.evaluate(() => !JB_PONTO.camera().ligada && window.__cam.vivas.size === 0), 'fechou o cadastro: a câmera é desligada');
  // a segunda pessoa (Bruna) recebe o código de outro rosto; mede as distâncias de verdade
  const r2b = await page.evaluate(async (qs) => {
    const P = JB_PONTO, img = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
    const a = await P.ver(await img(qs[0])), b = await P.ver(await img(qs[1])), c = await P.ver(await img(qs[2]));
    await APP.db.doc('rostos/f2').set({ id: 'f2', funcionarioId: 'f2', cods: [P.codificar(b.desc)], fotos: 1 });   // formato dos cadastros antigos: sem "ativo" e sem termo
    await new Promise((r) => setTimeout(r, 600));
    return { ab: P.dist(a.desc, b.desc), ac: P.dist(a.desc, c.desc), bc: P.dist(b.desc, c.desc), mA: P.comparar(a.desc), mB: P.comparar(b.desc), mC: P.comparar(c.desc), lim: P.limites() };
  }, quadros);
  ok(r2b.ab > 0.55 && r2b.ac > 0.55 && r2b.bc > 0.55, `pessoas diferentes ficam longe uma da outra (${r2b.ab.toFixed(2)}, ${r2b.ac.toFixed(2)}, ${r2b.bc.toFixed(2)}; limite ${r2b.lim.LIMITE})`);
  ok(r2b.mA.fid === 'f1' && r2b.mA.d < 0.3 && r2b.mB.fid === 'f2', `cada rosto cadastrado acha a própria pessoa, inclusive cadastro no formato antigo (Ana ${r2b.mA.d.toFixed(2)})`);
  ok(r2b.mC.fid === null, `rosto sem cadastro não é associado a ninguém (o mais parecido fica a ${r2b.mC.d.toFixed(2)})`);

  /* ---------- 3. a tela do funcionário: câmera direto, em tela cheia, traseira ---------- */
  await rosto('vazio');
  await page.evaluate(() => { window.__cam.pedidos.length = 0; location.hash = '#/pontoFacial'; });
  await page.waitForSelector('#pzReabrir', { timeout: 8000 });
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => !document.querySelector('.pz') && window.__cam.pedidos.length === 0 && /Abrir a câmera/.test(document.getElementById('pzVolta').textContent)), 'chegar na tela do ponto pelo endereço não abre a câmera: aparece o botão "Abrir a câmera"');
  await page.click('#pzReabrir');
  await page.waitForSelector('.pz video', { timeout: 8000 });
  await page.waitForFunction(() => JB_PONTO.camera().ligada && document.querySelector('.pz video').videoWidth > 0, null, { timeout: 20000 });
  const r3 = await page.evaluate(() => { const v = document.querySelector('.pz video').getBoundingClientRect(); return { cobre: v.width >= innerWidth && v.height >= innerHeight, lado: JB_PONTO.camera().lado, ped: window.__cam.pedidos[0], dlg: !!document.querySelector('.pz-dlg'), esp: document.querySelector('.pz').classList.contains('pz-frente'), fase: document.getElementById('pzFase').textContent, graf: document.querySelectorAll('.pz table,.pz canvas').length, marca: document.querySelector('.pz-marca').textContent }; });
  ok(r3.cobre && !r3.dlg, 'AUDITORIA 1 · a câmera abre direto ao entrar, ocupando a tela inteira, sem senha e sem lista de nomes');
  ok(r3.lado === 'environment' && r3.ped === 'environment' && !r3.esp, 'AUDITORIA 1 · a câmera traseira é a padrão (imagem sem espelho)');
  ok(/Fase de testes/.test(r3.fase) && r3.graf === 0 && /JB GESTÃO/.test(r3.marca), 'a tela do funcionário só tem a câmera, a hora e o aviso de fase de testes (sem tabela nem gráfico)');
  await page.waitForFunction(() => /Procurando rosto/.test(document.getElementById('pzSt').textContent), null, { timeout: 60000 });
  ok(/Posicione seu rosto diante da câmera/.test(await page.textContent('#pzSub')), 'sem ninguém: "Procurando rosto…" e "Posicione seu rosto diante da câmera para identificação."');
  await rosto('escuro');
  await page.waitForFunction(() => /Iluminação insuficiente/.test(document.getElementById('pzSt').textContent), null, { timeout: 30000 });
  ok(true, 'imagem escura: "Iluminação insuficiente."');
  await page.screenshot({ path: join(TELAS, 'ponto-1-procurando.png') });

  /* ---------- 4. identifica, mostra e espera: nada é gravado antes do toque ---------- */
  // o relógio do teste anda: em máquina lenta o cadastro facial leva mais de um minuto e 07:02 virava 07:03
  await relogio('07:02');
  await rosto(0);
  await cartao('Ana Teste Souza');
  const r4 = await page.evaluate(() => { const c = document.getElementById('pzCard'), b = document.getElementById('pzConf').getBoundingClientRect(); return { txt: c.textContent, tipo: document.getElementById('pzTipo').textContent, hora: document.getElementById('pzAgora').textContent, st: document.getElementById('pzSt').textContent, botao: b.bottom <= innerHeight && b.width > 200, aro: document.querySelector('.pz').dataset.aro }; });
  ok(/Funcionário identificado!/.test(r4.txt) && /Matrícula 101/.test(r4.txt) && /CONFIRMAR MARCAÇÃO/.test(r4.txt), 'AUDITORIA 4 · funcionário cadastrado é identificado sozinho: "Funcionário identificado!", nome e matrícula');
  ok(r4.tipo === 'Entrada' && r4.hora === '07:02' && /Confirme sua marcação/.test(r4.st) && r4.aro === 'achou', `mostra o horário (${r4.hora}), o tipo (${r4.tipo}) e "Rosto identificado. Confirme sua marcação."`);
  ok(r4.botao, 'o botão CONFIRMAR MARCAÇÃO cabe na tela do celular');
  await page.screenshot({ path: join(TELAS, 'ponto-2-identificado-celular.png') });
  await page.waitForTimeout(1500);
  ok((await marcs()).length === 0, 'AUDITORIA 6 · identificar não registra: sem o toque, nenhuma marcação é gravada');
  await page.click('#pzCard [data-c="nao"]');
  ok(await page.evaluate(() => document.getElementById('pzCard').hidden) && (await marcs()).length === 0, '"Não sou eu" tira o nome da tela e não grava nada');
  await cartao('Ana Teste Souza', 60000);

  /* ---------- 5. confirmar grava uma vez só ---------- */
  await relogio('07:02');
  await page.evaluate(() => { const b = document.getElementById('pzConf'); b.click(); b.click(); b.click(); });   // três toques seguidos
  await page.waitForFunction(() => /Marcação registrada com sucesso!/.test(document.getElementById('pzRes').textContent) && !document.getElementById('pzRes').hidden, null, { timeout: 20000 });
  await page.screenshot({ path: join(TELAS, 'ponto-3-registrada.png') });
  let ms = await marcs();
  ok(ms.length === 1 && ms[0].funcionarioId === 'f1' && ms[0].k === 'entrada' && ms[0].origem === 'facial', 'AUDITORIA 6 · a confirmação grava a marcação: entrada da Ana, origem facial');
  ok(ms.length === 1, 'AUDITORIA 10 · três toques seguidos no botão geram uma marcação só');
  ok(ms[0].hora === '07:02' && ms[0].data === H && Math.abs(Date.parse(ms[0].em) - (await page.evaluate(() => JB_PONTO.agora().getTime()))) < 60000, `AUDITORIA 9 · o horário gravado é o do toque (${ms[0].hora}, ${ms[0].data})`);
  ok(ms[0].conf && ms[0].conf.d < 0.48 && ms[0].conf.pct > 20 && ms[0].fase === 'teste' && ms[0].camera === 'traseira' && !('foto' in ms[0]) && !JSON.stringify(ms[0]).includes('data:image'), `a marcação guarda a confiança (${ms[0].conf && ms[0].conf.pct}%), a fase e a câmera, e nenhuma foto`);
  ok((await diario()).length === 0, 'fase de testes: a marcação não entra no Diário do DP (não se confunde com o registro oficial)');
  await page.waitForFunction(() => Array.from(window.__srv.estado.docs.values()).some((d) => d.colecao === 'pontoEventos' && Object.values(d.dados.items || {}).some((e) => e.tipo === 'foto')), null, { timeout: 10000 });
  const fo = (await eventos('foto'))[0], arq = await page.evaluate(() => window.__arquivos.slice());
  ok(arq.length === 1 && arq[0] === 'ponto-' + ms[0].id + '.jpg' && fo.marcacaoId === ms[0].id && fo.funcionarioId === 'f1' && fo.foto.id === 'x1' && fo.foto.tam > 800, `V127 · a foto do momento vai para o armazenamento depois da marcação, ligada a ela e ao funcionário (${fo.foto.tam} bytes)`);
  await semPainel();
  // a mesma pessoa continua na frente: não grava de novo e, passada a espera, avisa
  await page.waitForFunction(() => /Já existe uma marcação neste horário/.test(document.getElementById('pzRes').textContent) && !document.getElementById('pzRes').hidden, null, { timeout: 60000 });
  ok((await marcs()).length === 1, 'AUDITORIA 10 · a mesma pessoa de novo em seguida: "Já existe uma marcação neste horário." e nada é gravado');

  /* ---------- 6. câmeras: alternar, uma câmera só, reiniciar e permissão negada ---------- */
  await rosto('vazio'); await semPainel();
  await page.evaluate(() => { window.__cam.pedidos.length = 0; });
  await page.click('#pzCam');
  await page.waitForFunction(() => JB_PONTO.camera().lado === 'user' && JB_PONTO.camera().ligada && document.querySelector('.pz').classList.contains('pz-frente'), null, { timeout: 15000 });
  ok(await page.evaluate(() => window.__cam.pedidos.includes('user') && window.__cam.vivas.size === 1), 'AUDITORIA 2 e 3 · o botão discreto alterna para a câmera da frente (imagem espelhada) e solta a traseira');
  await rosto(0);
  await page.evaluate(() => { JB_PONTO.relogio.dif += 0; });
  await page.waitForFunction(() => /Já existe uma marcação|Marcação registrada/.test(document.getElementById('pzRes').textContent + document.getElementById('pzSt').textContent), null, { timeout: 90000 });
  ok(true, 'AUDITORIA 2 · a câmera da frente também identifica o funcionário');
  await rosto('vazio'); await semPainel();
  await page.click('#pzCam');
  await page.waitForFunction(() => JB_PONTO.camera().lado === 'environment' && JB_PONTO.camera().ligada && !document.querySelector('.pz').classList.contains('pz-frente'), null, { timeout: 15000 });
  ok(true, 'AUDITORIA 3 · alterna de volta para a traseira');
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="reiniciar"]');
  await page.waitForFunction(() => JB_PONTO.camera().ligada && window.__cam.vivas.size === 1 && document.querySelector('.pz video').videoWidth > 0, null, { timeout: 15000 });
  ok(true, 'Menu › Reiniciar a câmera: solta e abre de novo');

  /* ---------- 7. pessoa sem cadastro é rejeitada ---------- */
  await rosto(2);
  await page.waitForFunction(() => /Funcionário não identificado/.test(document.getElementById('pzSt').textContent), null, { timeout: 120000 });
  const r7 = await page.evaluate(() => ({ sub: document.getElementById('pzSub').textContent, card: document.getElementById('pzCard').hidden }));
  ok(r7.card && /Não conseguimos identificar seu rosto. Tente novamente/.test(r7.sub) && (await marcs()).length === 1, 'AUDITORIA 5 · pessoa sem cadastro: "Funcionário não identificado.", sem nome na tela e sem marcação');
  await page.waitForFunction(() => Array.from(window.__srv.estado.docs.values()).some((d) => d.colecao === 'pontoEventos' && Object.values(d.dados.items || {}).some((e) => e.tipo === 'falha' && e.motivo === 'nao_identificado')), null, { timeout: 10000 });
  ok(true, 'a falha de identificação fica registrada para o relatório de falhas');

  /* ---------- 8. sequência da jornada: intervalo (facial), retorno (sem reconhecimento) e saída (facial) ---------- */
  await rosto('vazio'); await relogio('12:01');
  await page.waitForTimeout(13000);   // a espera de quem acabou de marcar (12 s)
  await rosto(0);
  await cartao('Ana Teste Souza');
  ok((await page.textContent('#pzTipo')) === 'Saída para intervalo' && /Trocar/.test(await page.textContent('#pzCard')), 'AUDITORIA 7 · depois da entrada, às 12:01 da jornada dela (07:00 às 17:00), sugere "Saída para intervalo" e deixa trocar');
  await relogio('12:01');
  await page.click('#pzConf');
  await page.waitForFunction(() => /Marcação registrada com sucesso!/.test(document.getElementById('pzRes').textContent) && !document.getElementById('pzRes').hidden, null, { timeout: 20000 });
  // retorno pelo registro sem reconhecimento (alternativa), autorizado por quem está logado como responsável
  await rosto('vazio'); await relogio('13:00'); await semPainel();
  await page.click('#pzManual');
  await page.waitForSelector('.pz-lista [data-f="f1"]', { timeout: 5000 });
  ok((await page.$$eval('.pz-lista [data-f]', (b) => b.map((x) => x.dataset.f))).join() === 'f1,f2,f3,f4' && /Diego Prestador.*Prestador de serviços/.test(await page.textContent('.pz-lista [data-f="f4"]')), 'registro sem reconhecimento: lista os ativos do DP (empregados e o prestador, com "Prestador de serviços"), com motivo');
  await page.selectOption('.pz-lista select', 'camera');
  await page.click('.pz-lista [data-f="f1"]');
  await cartao('Ana Teste Souza', 8000);
  ok(await page.evaluate(() => { const r = JB_PONTO.estado().pronto.resta; return r > 30000 && r <= 45000; }), 'o cartão do registro sem reconhecimento some sozinho em 45 s sem toque (ninguém confirma por engano depois)');
  ok(/Registro sem reconhecimento/.test(await page.textContent('#pzCard')) && (await page.textContent('#pzTipo')) === 'Retorno do intervalo', 'AUDITORIA 7 · em seguida sugere "Retorno do intervalo"; o registro manual também pede a confirmação');
  await relogio('13:00');
  await page.click('#pzConf');
  await page.waitForFunction(() => /Marcação registrada com sucesso!/.test(document.getElementById('pzRes').textContent) && /responsável vai conferir/.test(document.getElementById('pzRes').textContent), null, { timeout: 20000 });
  await relogio('17:05'); await semPainel();
  await page.waitForTimeout(13000);
  await rosto(0);
  await cartao('Ana Teste Souza');
  ok((await page.textContent('#pzTipo')) === 'Saída', 'AUDITORIA 7 · por último, "Saída"');
  await relogio('17:05');
  await page.click('#pzConf');
  await page.waitForFunction(() => /Marcação registrada com sucesso!/.test(document.getElementById('pzRes').textContent) && /17:05/.test(document.getElementById('pzRes').textContent), null, { timeout: 20000 });
  ms = await marcs();
  ok(ms.map((m) => m.k + ' ' + m.hora + ' ' + m.origem).join(' | ') === 'entrada 07:02 facial | saidaIntervalo 12:01 facial | retornoIntervalo 13:00 manual | saida 17:05 facial', `as quatro marcações na ordem, cada uma com a hora do toque (${ms.map((m) => m.hora).join(', ')})`);
  ok(new Set(ms.map((m) => m.id)).size === 4 && ms[2].motivo === 'camera', 'cada marcação é um registro próprio; a manual guarda o motivo');
  const r8 = await page.evaluate(() => JB_PONTO.conferir('f1', JB_PONTO.agora()));
  ok(!r8.ok && r8.cod === 'duplicada', 'jornada completa: não aceita outra marcação em seguida');
  await relogio('17:30');
  ok(await page.evaluate(() => { const c = JB_PONTO.conferir('f1', JB_PONTO.agora()); return !c.ok && c.cod === 'completa'; }), 'o sistema não cria nem completa marcação sozinho: com as quatro feitas, o dia está completo');
  // quem não tem jornada na ficha (Bruna): sequência padrão, sem inventar horário
  ok(await page.evaluate(() => { const c = JB_PONTO.conferir('f2', JB_PONTO.agora()); return c.ok && c.op.join() === 'entrada'; }), 'funcionária sem jornada na ficha: começa pela entrada (nada é inventado)');

  /* ---------- 9. sair da tela solta a câmera ---------- */
  await rosto('vazio'); await semPainel();
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="gestao"]');
  await page.waitForSelector('#pgTabHoje', { timeout: 10000 });
  ok(await page.evaluate(() => !document.querySelector('.pz') && !JB_PONTO.camera().ligada && window.__cam.vivas.size === 0 && !JB_PONTO.aberto()), 'Menu › Gestão do ponto: fecha a tela e desliga a câmera (nenhum recurso preso)');

  /* ---------- 10. controle do dia e controle individual ---------- */
  const r10 = await page.evaluate(() => { const L = (id) => { const tr = document.querySelector('#pgTabHoje tr[data-id="' + id + '"]'); return tr ? Array.from(tr.cells).map((c) => c.textContent.trim().replace(/\s+/g, ' ')) : null; }; return { ana: L('f1'), bruna: L('f2'), resumo: document.querySelector('.resumo').textContent, fase: document.querySelector('#pgCorpo .aviso').textContent }; });
  ok(!!r10.ana && /Ana Teste Souza.*Matrícula 101.*Produção/.test(r10.ana[0]) && r10.ana[1] === 'Cadastrado' && r10.ana[2] === '07:02' && r10.ana[3] === '12:01' && /^13:00/.test(r10.ana[4]) && r10.ana[5] === '17:05' && r10.ana[6] === '4' && /Saída 17:05/.test(r10.ana[7]) && r10.ana[8] === 'Jornada encerrada',
    `AUDITORIA 8 · controle do dia: nome, matrícula, setor, cadastro facial, entrada, intervalo, retorno, saída, 4 marcações, última e situação (${r10.ana && r10.ana.slice(1).join(' · ')})`);
  ok(!!r10.bruna && r10.bruna[6] === '0' && /Ainda não marcou|Sem jornada/.test(r10.bruna[8]) && /Fase de testes/.test(r10.fase), 'quem não marcou aparece sem horário; a tela avisa que é fase de testes');
  await page.screenshot({ path: join(TELAS, 'gestao-1-controle-celular.png'), fullPage: true });
  await page.click('#pgTabHoje tr[data-id="f1"] td:nth-child(3)');
  await page.waitForSelector('#pgPontos .pg-dia', { timeout: 8000 });
  const rp = await page.evaluate((H) => { const d = document.querySelector('#pgPontos .pg-dia[data-dia="' + H + '"]'), mk = Array.from(d.querySelectorAll('.pg-mk')); return { aba: document.getElementById('pgCorpo').dataset.aba, txt: mk.map((x) => x.textContent.replace(/\s+/g, ' ').trim()), fotos: mk.map((x) => (x.querySelector('img.pg-ft') || { getAttribute: () => '' }).getAttribute('src')), cab: d.querySelector('.pg-dia-c').textContent, resumo: document.querySelector('#pgCorpo .resumo').textContent, nome: document.querySelector('#pgCorpo .pg-pessoa').textContent }; }, H);
  ok(rp.aba === 'pontos' && /Ana Teste Souza/.test(rp.nome) && /^Entrada ?07:02:\d\d/.test(rp.txt[0]) && /^Intervalo ?12:01:\d\d/.test(rp.txt[1]) && /^Volta ?13:00:\d\d.*manual/.test(rp.txt[2]) && /^Saída ?17:05:\d\d/.test(rp.txt[3]) && /09:04/.test(rp.cab), `V127 · Pontos do funcionário: tocar na pessoa abre os pontos dela, dia a dia, com a hora de cada marcação (${rp.txt.join(' | ')})`);
  ok(rp.fotos.filter((x) => /^\/_blob\/x\d+$/.test(x)).length === 4 && new Set(rp.fotos).size === 4 && (await page.evaluate(() => window.__arquivos.length)) === 4, 'V127 · cada marcação aparece com a própria foto, inclusive a registrada sem reconhecimento');
  await page.screenshot({ path: join(TELAS, 'gestao-3-pontos-do-funcionario.png'), fullPage: true });
  await page.click('#pgPontos .pg-dia .pg-mk');
  await page.waitForSelector('.modal .pg-fotoG');
  ok(/Foto do momento/.test(await page.textContent('.pg-comp')) && /Guardada/.test(await page.textContent('.pg-comp')), 'V127 · tocar na marcação abre o comprovante com a foto maior');
  await page.click('.modal [data-r="0"]');
  await page.click('[data-a="trocarFunc"]');
  await page.waitForSelector('#pgListaPontos .pg-fc[data-id="f2"]');
  ok((await page.$$eval('#pgListaPontos .pg-fc', (b) => b.map((x) => x.dataset.id))).join() === 'f1,f2,f3,f4' && /Marcações no mês4/.test(await page.textContent('#pgListaPontos .pg-fc[data-id="f1"]')), 'V127 · a aba lista os funcionários em cartões, com a entrada e a saída de hoje e as marcações do mês');
  await page.click('#pgListaPontos .pg-fc[data-id="f1"]');
  await page.waitForSelector('#pgPontos .pg-dia');
  await page.evaluate(() => { location.hash = '#/pontoGestao/historico'; });
  await page.waitForSelector('#pgTabMarc', { timeout: 8000 });
  const r10b = await page.evaluate(() => ({ dias: document.querySelector('#pgTabDias tbody tr').textContent.replace(/\s+/g, ' '), linhas: document.querySelectorAll('#pgTabMarc tbody tr').length, pend: document.querySelector('#pgTabMarc').textContent.includes('Pendente de tratamento') }));
  ok(r10b.linhas === 4 && /07:02.*12:01.*13:00.*17:05.*09:04/.test(r10b.dias) && r10b.pend, `AUDITORIA 8 · histórico individual: o dia calculado (trabalhado 09:04) e as 4 marcações originais; a manual está "Pendente de tratamento"`);

  /* ---------- 11. tratamento: conferir e anular, com justificativa; a original fica ---------- */
  const idManual = ms[2].id, idSaida = ms[3].id;
  await acaoDaLinha(page, `#pgTabMarc tr[data-marc="${idManual}"]`, '[data-a="tratar"]');
  await page.waitForSelector('#pgTrA'); await page.click('.modal [data-r="1"]');
  await page.waitForFunction((id) => /Conferida/.test(document.querySelector(`#pgTabMarc tr[data-marc="${id}"]`).textContent), idManual, { timeout: 8000 });
  ok(true, 'tratar › conferir: a marcação manual passa a "Conferida"');
  await acaoDaLinha(page, `#pgTabMarc tr[data-marc="${idSaida}"]`, '[data-a="tratar"]');
  await page.waitForSelector('#pgTrA'); await page.selectOption('#pgTrA', 'anulada'); await page.click('.modal [data-r="1"]');
  ok(!!(await page.$('#pgTrA')), 'anular sem justificativa não é aceito');
  await page.fill('#pgTrJ', 'Marcada por engano no teste'); await page.waitForTimeout(800); await page.click('.modal [data-r="1"]');
  await page.waitForFunction((id) => /Anulada/.test(document.querySelector(`#pgTabMarc tr[data-marc="${id}"]`).textContent), idSaida, { timeout: 8000 });
  const r11 = await page.evaluate(() => { const c = JB_PONTO.conferir('f1', JB_PONTO.agora()); return { ok: c.ok, op: c.op }; });
  const ms11 = await marcs(), tr11 = await eventos('tratamento');
  ok(ms11.length === 4 && JSON.stringify(ms11[3]) === JSON.stringify(ms[3]) && tr11.length === 2 && tr11.some((e) => e.acao === 'anulada' && e.justificativa === 'Marcada por engano no teste' && e.uid === 'u_DONO'), 'a marcação original continua igual no banco; o tratamento fica à parte, com justificativa e responsável');
  ok(r11.ok && r11.op.join() === 'saida', 'com a saída anulada, a pessoa pode marcar a saída de novo');
  await acaoDaLinha(page, `#pgTabMarc tr[data-marc="${idManual}"]`, '[data-a="comprovante"]');
  await page.waitForSelector('.pg-comp');
  ok(/Ana Teste Souza.*matrícula 101/.test(await page.textContent('.pg-comp')) && /controle interno/.test(await page.textContent('.modal')), 'comprovante da marcação disponível (identifica empregador e trabalhador; avisa que é de controle interno)');
  await page.click('.modal [data-r="0"]');

  /* ---------- 12. relatórios com dados reais ---------- */
  const r12 = await page.evaluate((H) => { const R = (k, f) => JB_PONTO.relatorio(k, H.slice(0, 7), f); const m = R('mensal').rows.find((x) => x.nome === 'Ana Teste Souza');
    return { m, es: R('entsai').rows.length, esp: R('espelho', 'f1').rows.find((x) => x.data === H), atr: R('atrasos').rows.length, pend: R('pendentes').rows.map((x) => x.pend), alt: R('alteracoes').rows.length, fal: R('falhas').rows.length, bruna: R('mensal').rows.find((x) => x.nome === 'Bruna Teste Lima') }; }, H);
  ok(!!r12.m && r12.m.dias === 1 && r12.m.atraso === 0 && r12.m.inc === 0 && r12.es === 4, `AUDITORIA 11 · relatório mensal: Ana com 1 dia e sem atraso (07:02 está na tolerância); entradas e saídas com as 4 marcações`);
  ok(!!r12.esp && r12.esp.entrada === '07:02' && r12.esp.saidaIntervalo === '12:01' && r12.esp.retornoIntervalo === '13:00' && r12.esp.saida === '' && r12.esp.previsto === previstoH, 'AUDITORIA 11 · espelho individual: mostra só o que vale (a saída anulada saiu) e o previsto vem da jornada da ficha');
  ok(r12.alt >= 3 && r12.fal >= 1 && r12.bruna && r12.bruna.dias === 0 && r12.bruna.previsto === 0 && r12.bruna.aus === 0, 'histórico de alterações e falhas de identificação têm os fatos do teste; quem não tem jornada na ficha não ganha previsto nem ausência inventados');
  await page.evaluate(() => { location.hash = '#/pontoGestao/relatorios'; });
  await page.waitForSelector('#pgTabRel', { timeout: 8000 });
  ok((await page.$$eval('#pgCorpo select[data-f="rel"] option', (o) => o.map((x) => x.textContent))).join('|') === 'Relatório mensal de funcionários|Espelho de ponto individual|Entradas e saídas|Atrasos|Horas extras (além da jornada)|Ausências|Marcações pendentes de tratamento|Histórico de alterações|Falhas de identificação', 'os nove relatórios pedidos estão na tela, com Visualizar, PDF e Excel');
  await page.selectOption('#pgCorpo select[data-f="rel"]', 'espelho');
  await page.waitForFunction(() => /07:02/.test((document.getElementById('pgTabRel') || {}).textContent || ''), null, { timeout: 8000 });
  ok(true, 'o espelho individual abre na tela com os horários reais');

  /* ---------- 13. implantação: teste de reconhecimento (não registra) ---------- */
  await page.evaluate(() => { location.hash = '#/pontoGestao/implantacao'; });
  await page.waitForSelector('#pgCorpo .pg-sec', { timeout: 8000 });
  ok(/Fase atual: testes e acompanhamento/.test(await page.textContent('#pgCorpo')) && /O que falta para a implantação definitiva/.test(await page.textContent('#pgCorpo')) && /não é um REP-P|ainda não é um REP-P/.test(await page.textContent('#pgCorpo')), 'implantação: mostra a fase, o que falta e avisa que não é um REP-P registrado');
  const nAntes = (await marcs()).length;
  await rosto(0);
  await page.click('a[href="#/pontoFacial/teste"]');
  await page.waitForSelector('.pz video');
  await cartao('Ana Teste Souza');
  ok(/Teste: rosto identificado/.test(await page.textContent('#pzCard')) && /nada é registrado/.test(await page.textContent('#pzFase')) && await page.evaluate(() => document.getElementById('pzManual').hidden), 'modo de teste: identifica e pergunta se acertou, com aviso de que nada é registrado');
  await page.click('#pzCard [data-c="acerto"]');
  await page.waitForFunction(() => Array.from(window.__srv.estado.docs.values()).some((d) => d.colecao === 'pontoEventos' && Object.values(d.dados.items || {}).some((e) => e.tipo === 'teste' && e.resultado === 'acerto' && e.funcionarioId === 'f1')), null, { timeout: 8000 });
  ok((await marcs()).length === nAntes, 'o teste fica no histórico dos testes e não cria marcação');
  await rosto('vazio');
  await page.evaluate(() => { location.hash = '#/pontoGestao/implantacao'; });
  await page.waitForSelector('#pgTabTestes', { timeout: 8000 });
  ok(/Acertou/.test(await page.textContent('#pgTabTestes')) && /100%/.test(await page.textContent('#pgCorpo .resumo')), 'histórico dos testes e taxa de acerto na aba Implantação');

  /* ---------- 14. configurações, senha e tela travada ---------- */
  await page.evaluate(() => { location.hash = '#/pontoGestao/config'; });
  await page.waitForSelector('[data-cfg="rigor"]', { timeout: 8000 });
  ok(/não é um registrador eletrônico de ponto homologado/.test(await page.textContent('#pgCorpo')), 'configurações: quadro "Situação legal" diz que o sistema não é homologado');
  await page.click('[data-a="senha"]');
  await page.waitForSelector('.pz-dlg input');
  await page.fill('.pz-dlg input[data-i="0"]', '4321'); await page.fill('.pz-dlg input[data-i="1"]', '4321'); await page.click('.pz-dlg .pz-okb');
  await page.waitForFunction(() => JB_PONTO.senha() && window.__srv.estado.docs.has('rostos/_senha'), null, { timeout: 8000 });
  const r14 = await page.evaluate(() => window.__srv.estado.docs.get('rostos/_senha').dados);
  ok(r14.hash.length === 64 && !JSON.stringify(r14).includes('4321'), 'a senha do ponto vai para o banco embaralhada, nunca em texto');
  await abrirPonto();
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="travar"]');
  await page.waitForSelector('.pz-dlg input'); await page.fill('.pz-dlg input', '4321'); await page.click('.pz-dlg .pz-okb');
  await page.waitForFunction(() => JB_PONTO.travada(), null, { timeout: 8000 });
  await page.evaluate(() => { location.hash = '#/funcionarios'; });
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => lerRota().mod === 'pontoFacial' && !!document.querySelector('.pz') && JB_PONTO.travada()), 'tela travada: nenhum endereço tira da câmera do ponto');
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="sair"]');
  await page.waitForSelector('.pz-dlg input'); await page.fill('.pz-dlg input', '0000'); await page.click('.pz-dlg .pz-okb');
  await page.waitForFunction(() => /Senha errada/.test(document.querySelector('.pz-dlg .pz-er').textContent));
  ok(await page.evaluate(() => JB_PONTO.travada()), 'senha errada não destrava');
  await page.click('.pz-dlg [data-r="0"]');

  /* ---------- 15. recarregar: os dados continuam e a trava também ---------- */
  await page.waitForTimeout(500);
  await abrir();
  await page.waitForSelector('#pzReabrir', { timeout: 15000 });
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => JB_PONTO.travada() && lerRota().mod === 'pontoFacial' && !document.querySelector('.pz') && window.__cam.pedidos.length === 0 && /travada/.test(document.getElementById('pzVolta').textContent)), 'AUDITORIA 13 · recarregar a página não destrava a tela, e a câmera fica fechada até alguém tocar em "Abrir a câmera"');
  await page.evaluate(() => { location.hash = '#/funcionarios'; }); await page.waitForTimeout(700);
  ok(await page.evaluate(() => lerRota().mod === 'pontoFacial'), 'travada e com a câmera fechada, continua sem sair da tela do ponto');
  await relogio('17:40');
  const r15 = await page.evaluate((H) => new Promise((res) => { const t = setInterval(() => { if (DATA.pontoMarcacoes.length >= 4 && JB_PONTO.estado().rostos) { clearInterval(t); const s = JB_PONTO.estadoDia('f1', H); res({ n: DATA.pontoMarcacoes.length, s: [s.entrada, s.saidaIntervalo, s.retornoIntervalo, s.saida], rostos: JB_PONTO.rostos().length, ev: DATA.pontoEventos.length }); } }, 200); }), H);
  ok(r15.n === 4 && r15.s.join() === '07:02,12:01,13:00,' && r15.rostos === 2 && r15.ev >= 5, `AUDITORIA 13 · depois de reiniciar, marcações (${r15.n}), tratamentos, cadastros faciais (${r15.rostos}) e eventos continuam lá`);
  await page.click('#pzReabrir'); await page.waitForSelector('.pz video');
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="destravar"]');
  await page.waitForSelector('.pz-dlg input'); await page.fill('.pz-dlg input', '4321'); await page.click('.pz-dlg .pz-okb');
  await page.waitForFunction(() => !JB_PONTO.travada(), null, { timeout: 8000 });
  ok(await page.evaluate(() => localStorage.getItem('jb-ponto-travada-v126') === null), 'a senha certa destrava');

  /* ---------- 16. registro definitivo: a marcação entra no Diário do DP, sem duplicar ---------- */
  await page.evaluate(() => { location.hash = '#/pontoGestao/implantacao'; });
  await page.waitForSelector('[data-a="fase"]', { timeout: 8000 });
  await page.click('[data-a="fase"]');
  await page.waitForSelector('.modal [data-r="1"]'); await page.click('.modal [data-r="1"]');
  await page.waitForFunction(() => JB_PONTO.oficial(), null, { timeout: 8000 });
  await relogio('08:10'); await rosto(1);
  await abrirPonto();
  ok(await page.evaluate(() => document.getElementById('pzFase').hidden), 'registro definitivo: some o aviso de fase de testes da tela do funcionário');
  await cartao('Bruna Teste Lima');
  await relogio('08:10');
  await page.click('#pzConf');
  await page.waitForFunction(() => /Marcação registrada com sucesso!/.test(document.getElementById('pzRes').textContent) && !document.getElementById('pzRes').hidden, null, { timeout: 20000 });
  await page.waitForFunction(() => Array.from(window.__srv.estado.docs.values()).some((d) => d.colecao === 'diario'), null, { timeout: 8000 });
  const d16 = await diario(), m16 = (await marcs()).filter((m) => m.funcionarioId === 'f2');
  ok(d16.length === 1 && d16[0].funcionarioId === 'f2' && d16[0].entrada === '08:10' && d16[0].tipo === 'Presença normal' && d16[0].pontoIds.entrada === m16[0].id && m16[0].fase === 'oficial', 'registro definitivo: a entrada da Bruna entra no Diário do DP ligada à marcação original (integração com espelho e folha preservada)');
  ok(await page.evaluate((H) => JB_PONTO.lancarNoDiario('f2', H).then((x) => x === false), H) && (await diario()).length === 1, 'lançar de novo no Diário não duplica nada');
  ok(await page.evaluate((H) => { const e = espelho('f2', H.slice(0, 7)).find((x) => x.data === H); return e && e.entrada === '08:10'; }, H), 'o Espelho de ponto do DP mostra a entrada lançada');
  ok(d16.every((x) => x.funcionarioId !== 'f1'), 'as marcações feitas na fase de testes (Ana) não entram no Diário depois da virada');

  /* ---------- 16b. V163 · MEI (prestador de serviços): cadastro facial, marcação, nada no Diário do DP e sem jornada ---------- */
  await rosto('vazio'); await semPainel();
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="gestao"]');
  await page.waitForSelector('#pgTabHoje', { timeout: 10000 });
  const tm16 = await page.evaluate(() => ({ p: JB_PONTO.termo('f4'), e: JB_PONTO.termo('f1'), prest: JB_PONTO.prestador('f4'), clt: JB_PONTO.prestador('f1') }));
  ok(tm16.prest && !tm16.clt && /registro da minha presença \(entrada e saída\)/.test(tm16.p) && /terminar a prestação de serviços/.test(tm16.p) && /Assinatura do\(a\) prestador\(a\) de serviços/.test(tm16.p)
    && /no registro de ponto\./.test(tm16.e) && /eu deixar a empresa/.test(tm16.e) && /Assinatura do\(a\) trabalhador\(a\)/.test(tm16.e), 'V163 · o termo de ciência do MEI fala em prestação de serviços e registro de presença; o do empregado não muda');
  await page.evaluate(() => { location.hash = '#/pontoGestao/funcionarios'; });
  await page.waitForSelector('#pgTabRostos [data-rosto="f4"]', { timeout: 8000 });
  await acaoDaLinha(page, '[data-rosto="f4"]', '[data-a="cadastrar"]');
  await page.waitForSelector('#pzTermoOk', { timeout: 5000 });
  ok(/Diego Prestador leu e assinou o termo/.test(await page.textContent('.modal')), 'V163 · o cadastro facial do MEI começa (pede o termo de ciência), em vez de recusar');
  await page.click('.modal [data-r="0"]');
  // o código do rosto do MEI entra direto (as 5 capturas de verdade já foram testadas com a Ana); é o rosto que antes ficava sem cadastro
  const r16b = await page.evaluate(async (q) => { const P = JB_PONTO, i = new Image(); i.src = q; await i.decode(); const v = await P.ver(i);
    await APP.db.doc('rostos/f4').set({ id: 'f4', funcionarioId: 'f4', cods: [P.codificar(v.desc)], fotos: 1, ativo: true, termo: { em: new Date().toISOString(), por: 'u_DONO' } });
    await new Promise((r) => setTimeout(r, 800)); return P.comparar(v.desc); }, quadros[2]);
  ok(r16b.fid === 'f4', 'V163 · o rosto do MEI entra no reconhecimento');
  await relogio('08:20'); await rosto(2);
  await abrirPonto();
  await cartao('Diego Prestador');
  ok(/Prestador identificado!/.test(await page.textContent('#pzCard')) && /Matrícula 104/.test(await page.textContent('#pzCard')) && (await page.textContent('#pzTipo')) === 'Entrada', 'V163 · a câmera identifica o MEI sozinha: "Prestador identificado!", nome, matrícula e "Entrada"');
  await relogio('08:20');
  await page.click('#pzConf');
  await page.waitForFunction(() => /Marcação registrada com sucesso!/.test(document.getElementById('pzRes').textContent) && /Diego/.test(document.getElementById('pzRes').textContent) && !document.getElementById('pzRes').hidden, null, { timeout: 20000 });
  await rosto('vazio'); await semPainel();
  const m16b = (await marcs()).filter((m) => m.funcionarioId === 'f4');
  ok(m16b.length === 1 && m16b[0].k === 'entrada' && m16b[0].hora === '08:20' && m16b[0].origem === 'facial' && m16b[0].fase === 'oficial', 'V163 · o MEI bate o ponto facial: a entrada é gravada como marcação original, igual à dos empregados');
  // a saída do fim do dia (sem reconhecimento), para conferir as horas
  await page.evaluate(async (H) => { await JB_PONTO.registrarMarcacao('f4', 'saida', { data: H }, new Date(H + 'T18:30:00'), { origem: 'manual', motivo: 'camera' }); }, H);
  await page.waitForTimeout(800);
  ok((await diario()).length === 1 && (await diario()).every((x) => x.funcionarioId !== 'f4') && (await page.evaluate((H) => JB_PONTO.lancarNoDiario('f4', H).then((x) => x === false), H)) && (await page.evaluate(() => !JB_PONTO.foraDoDiario().some((d) => d.fid === 'f4'))),
    'V163 · no registro definitivo, as marcações do MEI não vão para o Diário do DP (nem pelo "Lançar agora"): ficam fora do espelho do DP, das horas extras e da folha');
  const r16c = await page.evaluate((H) => { const x = JB_PONTO.diaCalc(F('f4'), H), R = (k, f) => JB_PONTO.relatorio(k, H.slice(0, 7), f), e = R('espelho', 'f4');
    return { trab: x.c && x.c.trab, atraso: x.c && x.c.atraso, extra: x.c && x.c.extra, esp: x.esp, m: R('mensal').rows.find((r) => r.nome === 'Diego Prestador'), extras: R('extras').rows.some((r) => r.nome === 'Diego Prestador'), aus: R('ausencias').rows.some((r) => r.nome === 'Diego Prestador'), et: e.titulo, ec: e.cols.map((c) => c.k).join() }; }, H);
  ok(r16c.trab === 610 && r16c.atraso === 0 && r16c.extra === 0 && r16c.esp === null && !!r16c.m && r16c.m.dias === 1 && r16c.m.trab === 610 && r16c.m.extra === 0 && r16c.m.previsto === 0 && r16c.m.aus === 0 && !r16c.extras && !r16c.aus,
    `V163 · MEI sem jornada: as horas do dia contam (${r16c.trab} min), sem atraso, hora além da jornada nem ausência, e ele fica fora dos relatórios de horas extras e de ausências`);
  ok(/^Registro de presença \(prestador de serviços\) · Diego Prestador/.test(r16c.et) && !/previsto|atraso|extra|noturno/.test(r16c.ec), 'V163 · o espelho do MEI sai como "Registro de presença", sem as colunas da jornada');
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="gestao"]');
  await page.waitForSelector('#pgTabHoje tr[data-id="f4"]', { timeout: 10000 });
  const r16d = await page.evaluate(() => Array.from(document.querySelector('#pgTabHoje tr[data-id="f4"]').cells).map((c) => c.textContent.trim().replace(/\s+/g, ' ')));
  ok(/Diego Prestador.*Prestador de serviços/.test(r16d[0]) && r16d[1] === 'Cadastrado' && r16d[2] === '08:20' && /^18:30/.test(r16d[5]) && r16d[6] === '2' && r16d[8] === 'Jornada encerrada', `V163 · Controle do dia: o MEI aparece com "Prestador de serviços", o cadastro facial e os horários (${r16d.slice(1).join(' · ')})`);
  await page.click('#pgTabHoje tr[data-id="f4"] td:nth-child(3)');
  await page.waitForSelector('#pgPontos .pg-dia', { timeout: 8000 });
  const r16e = await page.evaluate(() => ({ resumo: document.querySelector('#pgCorpo .resumo').textContent, cab: document.querySelector('#pgCorpo .painel').textContent }));
  ok(/Horas registradas/.test(r16e.resumo) && /10:10/.test(r16e.resumo) && !/Atrasos|Além da jornada|Ausências/.test(r16e.resumo) && /Prestador de serviços: sem jornada/.test(r16e.cab), 'V163 · Pontos do funcionário do MEI: dias e horas registradas, sem atrasos, horas além da jornada nem ausências');
  await page.evaluate(() => { location.hash = '#/pontoGestao/historico'; });
  await page.waitForSelector('#pgTabMarc', { timeout: 8000 });
  await acaoDaLinha(page, `#pgTabMarc tr[data-marc="${m16b[0].id}"]`, '[data-a="comprovante"]');
  await page.waitForSelector('.pg-comp');
  const cp16 = await page.textContent('.pg-comp');
  ok(/Contratante/.test(cp16) && /Prestador de serviços.*Diego Prestador/.test(cp16) && !/Empregador|Trabalhador/.test(cp16), 'V163 · comprovante da marcação do MEI: "Contratante" e "Prestador de serviços", não "empregador" e "trabalhador"');
  await page.click('.modal [data-r="0"]');
  await page.evaluate(() => { location.hash = '#/pontoGestao/implantacao'; });
  await page.waitForSelector('#pgCorpo .pg-sec', { timeout: 8000 });
  ok(/[^\d]2 funcionários? sem jornada|[^\d]2 funcionário\(s\) sem jornada/.test(await page.textContent('#pgCorpo')), 'V163 · implantação: o MEI não conta como "funcionário sem jornada" (só a Bruna e a Carla)');
  await abrirPonto();

  /* ---------- 17. permissões por perfil ---------- */
  await rosto('vazio'); await semPainel();
  const r17 = await page.evaluate(async () => {
    const ver = () => ({ cam: pode('pontoFacial', 'e'), gest: pode('pontoGestao'), esp: pode('ponto'), func: pode('funcionarios'), folha: pode('folha') });
    const o = {}; const papel = APP.papel, dono = APP.isOwner;
    APP.isOwner = false;
    APP.papel = 'celularPonto'; o.cel = ver();
    APP.papel = 'respPonto'; o.resp = ver();
    APP.papel = 'consulta'; o.cons = ver();
    APP.papel = papel; APP.isOwner = dono; return o; });
  ok(r17.cel.cam && !r17.cel.gest && !r17.cel.func && !r17.cel.folha, 'AUDITORIA 12 · perfil "Celular do ponto": só a câmera; não vê gestão, fichas nem folha');
  ok(r17.resp.cam && r17.resp.gest && !r17.resp.esp && !r17.resp.folha && !r17.resp.func, 'AUDITORIA 12 · perfil "Responsável pelo ponto": câmera e gestão do ponto; não vê fichas, folha nem as outras telas do DP');
  ok(!r17.cons.cam && !r17.cons.gest, 'AUDITORIA 12 · usuário de consulta não registra ponto nem abre a gestão');
  // no aparelho do ponto, o registro sem reconhecimento pede a senha da responsável
  await page.evaluate(() => { APP.isOwner = false; APP.papel = 'celularPonto'; renderCasca(); });
  await page.click('#pzManual');
  await page.waitForSelector('.pz-dlg input', { timeout: 5000 });
  ok(/Só a responsável pelo ponto autoriza/.test(await page.textContent('.pz-dlg')), 'AUDITORIA 12 · no celular do ponto, o registro sem reconhecimento pede a senha da responsável');
  await page.fill('.pz-dlg input', '1111'); await page.click('.pz-dlg .pz-okb');
  await page.waitForFunction(() => /Senha errada/.test(document.querySelector('.pz-dlg .pz-er').textContent));
  await page.click('.pz-dlg [data-r="0"]');
  ok(!(await page.$('.pz-lista')), 'senha errada: a lista de nomes não abre');
  await page.click('#pzMenu');
  const m17 = await page.$$eval('.pz-folha [data-m]', (b) => b.map((x) => x.dataset.m));
  ok(!m17.includes('gestao') && !m17.includes('sair'), `o celular do ponto não tem "Gestão" nem "Sair" no menu (${m17.join(', ')})`);
  await page.click('.pz-folha [data-m="fechar"]');
  await page.evaluate(() => { location.hash = '#/pontoGestao'; });
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => lerRota().mod === 'pontoFacial' && !document.getElementById('pgCorpo')), 'o celular do ponto não consegue abrir a gestão nem pelo endereço');
  await page.evaluate(() => { APP.papel = 'respPonto'; renderCasca(); location.hash = '#/pontoGestao/config'; });
  await page.waitForSelector('.pg-abas', { timeout: 8000 });
  ok(await page.evaluate(() => !document.querySelector('.pg-abas a[href$="/config"]') && document.getElementById('pgCorpo').dataset.aba === 'hoje' && !!document.querySelector('.pg-abas a[href$="/funcionarios"]')), 'a responsável acompanha tudo, mas não vê as configurações técnicas');
  await page.evaluate(() => { APP.papel = 'admin'; APP.isOwner = true; renderCasca(); location.hash = '#/pontoGestao/auditoria'; });
  await page.waitForSelector('#pgTabAtiv', { timeout: 8000 });
  const a17 = await page.textContent('#pgTabAtiv');
  ok(/Cadastro facial feito: Ana Teste Souza/.test(a17) && /Marcação anulada/.test(a17) && /registro definitivo/.test(a17) && /Senha do ponto/.test(a17), 'auditoria: cadastro facial, tratamento, troca de fase e senha ficam no registro de atividades, com quem fez');
  const sx = await eventos('acesso');
  console.log(`    (tentativas de senha errada registradas: ${sx.length}; o registro acontece na 5ª seguida)`);

  /* ---------- 18. cadastro facial: desativar tira do reconhecimento ---------- */
  await page.evaluate(() => { location.hash = '#/pontoGestao/funcionarios'; });
  await page.waitForSelector('[data-rosto="f2"] [data-a="desativar"]', { timeout: 8000 });
  await acaoDaLinha(page, '[data-rosto="f2"]', '[data-a="desativar"]');
  await page.waitForSelector('.modal [data-r="1"]'); await page.click('.modal [data-r="1"]');
  await page.waitForFunction(() => /Desativado/.test(document.querySelector('[data-rosto="f2"]').textContent), null, { timeout: 8000 });
  ok(await page.evaluate(async (q) => { const i = new Image(); i.src = q; await i.decode(); const b = await JB_PONTO.ver(i); return JB_PONTO.comparar(b.desc).fid === null; }, quadros[1]), 'reconhecimento desativado: a pessoa deixa de ser identificada, sem apagar o cadastro');

  /* ---------- 19. aparelho com uma câmera só e câmera negada ---------- */
  await page.evaluate(() => { window.__cam.uma = true; });
  await abrirPonto();
  await page.waitForFunction(() => JB_PONTO.camera().ligada && JB_PONTO.camera().cameras === 1 && document.getElementById('pzCam').hidden, null, { timeout: 15000 });
  ok(true, 'aparelho com uma câmera só: usa a que existe e esconde o botão de alternar');
  await page.evaluate(() => { window.__cam.negar = true; });
  await page.click('#pzMenu'); await page.click('.pz-folha [data-m="reiniciar"]');
  await page.waitForFunction(() => /A câmera não abriu/.test(document.getElementById('pzRes').textContent) && !document.getElementById('pzRes').hidden, null, { timeout: 20000 });
  const r19 = await page.textContent('#pzRes');
  ok(/permissão da câmera não foi dada/.test(r19) && /Tentar de novo/.test(r19) && /Registrar sem reconhecimento/.test(r19) && !/NotAllowedError|undefined|null/.test(r19), 'câmera negada: mensagem clara, sem erro técnico, com "Tentar de novo" e a alternativa');
  await page.evaluate(() => { window.__cam.negar = false; window.__cam.uma = false; });
  await page.click('#pzRes [data-b="0"]');
  await page.waitForFunction(() => JB_PONTO.camera().ligada, null, { timeout: 15000 });
  ok(true, '"Tentar de novo" reabre a câmera');

  /* ---------- 20. outros aparelhos: computador e celular deitado ---------- */
  await rosto('vazio');
  await page.evaluate(() => { location.hash = '#/pontoGestao'; });
  await page.waitForSelector('#pgTabHoje');
  for (const [nome, w, h] of [['computador', 1366, 768], ['tablet-deitado', 1024, 600], ['celular-deitado', 780, 360]]) {
    await page.setViewportSize({ width: w, height: h });
    await relogio('09:00'); await rosto(0);
    await abrirPonto('#/pontoFacial/teste');
    await cartao('Ana Teste Souza');
    const g = await page.evaluate(() => { const c = document.querySelector('#pzCard .pz-conf').getBoundingClientRect(), n = document.querySelector('#pzCard .pz-nome').getBoundingClientRect(), v = document.querySelector('.pz video').getBoundingClientRect(), t = document.querySelector('.pz-topo').getBoundingClientRect(); return { cabe: c.top >= t.bottom - 4 && c.bottom <= innerHeight && c.right <= innerWidth && n.top >= 0, cobre: v.width >= innerWidth && v.height >= innerHeight, rola: document.documentElement.scrollWidth > innerWidth }; });
    ok(g.cabe && g.cobre && !g.rola, `AUDITORIA 14 · ${nome} (${w} × ${h}): câmera na tela inteira e o cartão com o botão cabem sem rolar`);
    await page.screenshot({ path: join(TELAS, `ponto-4-${nome}.png`) });
    await page.evaluate(() => { location.hash = '#/pontoGestao'; });
    await page.waitForSelector('#pgTabHoje');
    if (nome === 'computador') await page.screenshot({ path: join(TELAS, 'gestao-2-controle-computador.png') });
  }
  ok(await page.evaluate(() => window.__cam.vivas.size === 0), 'no fim, nenhuma câmera ficou ligada');

  /* ---------- 21. regras da jornada em casos incomuns (sem gravar nada) e trava da versão antiga ---------- */
  const r21 = await page.evaluate(async (H) => {
    const P = JB_PONTO, f = F('f3'), jd = f.jornadaId, cj = CFG.jornadas.slice(), d = (iso, hm) => { const x = new Date(iso + 'T00:00:00'); const [h, m] = hm.split(':').map(Number); x.setHours(h, m, 0, 0); return x; };
    const am = isoDe(new Date(d(H, '12:00').getTime() + 864e5)), dia = (e, s) => ({ e, s, i: 60 }), todos = (x) => ({ 0: x, 1: x, 2: x, 3: x, 4: x, 5: x, 6: x });
    CFG.jornadas = cj.concat([{ id: 'jn', nome: 'Noite', dias: todos(dia('22:00', '06:00')) }, { id: 'jt', nome: 'Tarde', dias: todos(dia('13:00', '22:00')) }]);
    const o = { feriado: !esperadoDia(F('f1'), H) || !esperadoDia(F('f1'), am) };
    /* esqueceu o dia todo e só marcou às 17:00 (vira "Entrada"); no outro dia às 07:00 tem de ser a entrada do dia novo */
    await P.registrarMarcacao('f3', 'entrada', { data: H }, d(H, '17:00'), { origem: 'manual', motivo: 'camera' });
    await new Promise((r) => setTimeout(r, 700));
    f.jornadaId = 'j1'; const a1 = P.alvo('f3', d(am, '07:00')); o.diurno = a1.data === am && a1.op.join() === 'entrada';
    f.jornadaId = undefined; const a2 = P.conferir('f3', d(am, '07:00')); o.semJornada = a2.ok && a2.data === H && a2.escolhas.some((e) => e.k === 'entrada' && e.data === am);
    /* turno da noite (22:00 às 06:00): às 02:30 ainda é a jornada de ontem; no intervalo sugere intervalo, perto do fim sugere saída */
    f.jornadaId = 'jn'; const st = { funcionarioId: 'f3', data: H, entrada: '22:05', saidaIntervalo: '', retornoIntervalo: '', saida: '', em: {}, m: {} };
    o.noiteIntervalo = P.opcoes(st, 'f3', d(am, '02:31'))[0] === 'saidaIntervalo'; o.noiteSaida = P.opcoes(st, 'f3', d(am, '05:40'))[0] === 'saida';
    /* turno da tarde (13:00 às 22:00): pausa às 18:01 é intervalo, não saída */
    f.jornadaId = 'jt'; o.tarde = P.opcoes({ ...st, entrada: '13:00' }, 'f3', d(H, '18:01'))[0] === 'saidaIntervalo';
    f.jornadaId = jd; CFG.jornadas = cj; return o; }, H);
  if (r21.feriado) console.log('    (feriado no cadastro: conferências de jornada puladas)');
  else {
    ok(r21.diurno, 'quem só marcou no fim do dia não fica preso na jornada de ontem: na manhã seguinte o sistema oferece a Entrada do dia novo');
    ok(r21.semJornada, 'sem jornada na ficha, a jornada de ontem ainda aberta continua, mas "Entrada (hoje)" aparece como alternativa no cartão');
    ok(r21.noiteIntervalo && r21.noiteSaida && r21.tarde, 'turno da noite e da tarde: no meio da jornada sugere o intervalo; perto do fim, a saída');
  }
  await page.evaluate(() => { localStorage.setItem('jb-ponto-facial-travada', JSON.stringify({ em: '2026-11-12T10:00:00Z', sal: 'a', hash: 'b' })); });
  await page.waitForTimeout(500);
  await abrir();
  await page.waitForTimeout(1500);
  ok(await page.evaluate(() => lerRota().mod !== 'pontoFacial' && !document.querySelector('.pz') && window.__cam.pedidos.length === 0 && localStorage.getItem('jb-ponto-facial-travada') === null && !JB_PONTO.travada()), 'aparelho que ficou travado na versão ANTIGA entra normalmente: sem câmera aberta e sem ficar preso na tela do ponto');

  const med = await page.evaluate(() => JB_PONTO.medidas());
  const media = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
  console.log(`    (tempos neste computador, sem placa de vídeo de verdade: olhada leve ${media(med.achar)} ms, código do rosto ${media(med.ver)} ms, do rosto na tela até o nome ${media(med.identificar)} ms)`);
  const es = semErros(erros);
  ok(es.length === 0, 'nenhum erro de programa durante o teste' + (es.length ? ': ' + es.slice(0, 3).join(' | ') : ''));
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\nPonto facial: ${falhas} conferência(s) falharam.` : '\nPonto facial: todas as conferências passaram.');
process.exit(falhas ? 1 : 0);
