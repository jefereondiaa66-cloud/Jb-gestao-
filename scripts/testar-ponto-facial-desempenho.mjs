#!/usr/bin/env node
// Medição de desempenho e estresse do Ponto facial, no programa REAL (saida/claude.html) num Chromium
// com banco central simulado e a câmera mostrando um rosto de verdade. Roda duas vezes: computador e celular.
// Mede e confere:
//   A. tempo para a câmera abrir ao travar a tela (5 vezes seguidas, travando e destravando)
//   B. tempo de cada troca de câmera (10 trocas seguidas) e se sobra câmera ligada
//   C. o reconhecimento continua fora da tela (operário) depois das trocas
//   D. tempo de cada olhada: achar (leve) e ver (código do rosto)
//   E. câmera que cai no meio (falha temporária): quanto tempo para voltar
//   F. corrida: desligar e ligar de novo enquanto a câmera ainda abre (não pode ficar tela preta)
//   G. vários avisos de "tela voltou" seguidos não podem criar dois reconhecimentos ao mesmo tempo
//   H. uso prolongado (45 s): CPU da tela, memória, travadas da tela (tarefas longas) e uma batida só
//   I. sair do módulo: nenhuma câmera fica ligada
//   J. câmera que abre e não manda imagem (ao cair e ao trocar): a tela não fica presa, abre outra câmera
//   K. batida com foto: a troca de câmera falha; o vídeo volta para a câmera que ficou e a foto sai sozinha
//   L. o operário não carregou por falha passageira da internet: roda na tela e depois volta sozinho para fora dela
//   M. o código do rosto falha sempre no operário (a olhada leve não): passa para a tela e continua reconhecendo
// Uso: npm install --no-save @vladmandic/face-api@1.7.15 && node scripts/construir.mjs && node scripts/testar-ponto-facial-desempenho.mjs
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium, devices } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const FA = [process.env.JB_FACEAPI, join(RAIZ, 'node_modules/@vladmandic/face-api'), '/tmp/fa/node_modules/@vladmandic/face-api'].find((p) => p && existsSync(join(p, 'dist/face-api.js')));
if (!FA) { console.log('Ponto facial: biblioteca face-api não instalada (npm install --no-save @vladmandic/face-api@1.7.15). Teste não executado.'); process.exit(1); }
const TMP = join(RAIZ, 'saida/teste-facial'); mkdirSync(TMP, { recursive: true });

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = u.startsWith('/_fa/') ? join(FA, u.slice(5)) : join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!(p.startsWith(RAIZ) || p.startsWith(FA)) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.jpg') ? 'image/jpeg' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
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
const ms = (x) => `${Math.round(x)} ms`;
const mediana = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const resumo = (a) => `mediana ${ms(mediana(a))}, pior ${ms(Math.max(...a))}`;
const RESULTADOS = {};

/* ---------- a câmera mostra o rosto de Ana (640 × 480) ---------- */
{
  const b0 = await chromium.launch();
  const p0 = await b0.newPage();
  await p0.goto(base + '/_fa/demo/sample3.jpg');
  await p0.addScriptTag({ url: base + '/_fa/dist/face-api.js' });
  const q = await p0.evaluate(async (base) => {
    await faceapi.nets.ssdMobilenetv1.loadFromUri(base + '/_fa/model/');
    const im = new Image(); im.src = base + '/_fa/demo/sample3.jpg'; await im.decode();
    const d = (await faceapi.detectAllFaces(im, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))).sort((a, b) => a.box.x - b.box.x)[0];
    const b = d.box, H = Math.max(b.width, b.height) / 0.5, W = H * 640 / 480;
    const c = document.createElement('canvas'); c.width = 640; c.height = 480;
    const x = c.getContext('2d'); x.fillStyle = '#777'; x.fillRect(0, 0, 640, 480);
    x.drawImage(im, b.x + b.width / 2 - W / 2, b.y + b.height / 2 - H / 2, W, H, 0, 0, 640, 480);
    return c.toDataURL('image/jpeg', 0.92).split(',')[1];
  }, base);
  await b0.close();
  writeFileSync(join(TMP, 'rosto-desempenho.jpg'), Buffer.from(q, 'base64'));
  writeFileSync(join(TMP, 'camera-desempenho.mjpeg'), Buffer.from(q, 'base64'));
}

const FUNCS = [
  { id: 'f1', nome: 'Ana Teste Souza', matricula: '101', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', entrada: '07:00', saida: '17:00', intervalo: 60 },
  { id: 'f2', nome: 'Bruna Teste Lima', matricula: '102', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção' },
  { id: 'f3', nome: 'Carla Teste Dias', matricula: '103', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Forno' },
];
const iniciar = ({ codigo, funcs }) => {
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
  /* contadores: todas as câmeras abertas, tarefas longas da tela e as olhadas (cada olhada tira um retrato do vídeo) */
  window.__streams = []; window.__longas = []; window.__olhadas = 0;
  const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (c) => { const s = await g(c); window.__streams.push(s); return s; };
  window.__vivas = () => window.__streams.reduce((n, s) => n + s.getVideoTracks().filter((t) => t.readyState === 'live').length, 0);
  const e = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);   // o aparelho de teste passa a mostrar duas câmeras
  navigator.mediaDevices.enumerateDevices = async () => { const d = await e(); const v = d.find((x) => x.kind === 'videoinput'); return v ? d.concat([{ kind: 'videoinput', deviceId: v.deviceId, label: 'camera 0, facing back', groupId: '' }]) : d; };
  const cib = window.createImageBitmap; window.createImageBitmap = function () { window.__olhadas++; return cib.apply(this, arguments); };
  try { new PerformanceObserver((l) => l.getEntries().forEach((x) => window.__longas.push(x.duration))).observe({ type: 'longtask', buffered: true }); } catch (x) {}
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

async function cenario(nome, opcoes) {
  console.log(`\n== ${nome} ==`);
  const R = (RESULTADOS[nome] = {});
  const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + join(TMP, 'camera-desempenho.mjpeg'), '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  try {
    const ctx = await browser.newContext({ ...opcoes, permissions: ['camera'] });
    await rotas(ctx);
    await ctx.route(/^http:\/\/127\.0\.0\.1:\d+\/_blob\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page); await cdp.send('Performance.enable');
    const metricas = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    const erros = [];
    page.on('pageerror', (e) => erros.push(String(e && e.message)));
    await page.addInitScript(iniciar, { codigo: servidorFalso, funcs: FUNCS });
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.funcionarios.length >= 3, null, { timeout: 30000 });
    const H = await page.evaluate(() => hoje());

    /* rosto de Ana cadastrado direto (o cadastro em si já é conferido em testar-ponto-facial.mjs) e a senha criada */
    const tIA = Date.now();
    await page.evaluate(async (base) => {
      const P = PONTO_FACIAL_V100; const i = new Image(); i.src = base + '/saida/teste-facial/rosto-desempenho.jpg'; await i.decode();
      const v = await P.ver(i); await APP.db.doc('rostos/f1').set({ id: 'f1', funcionarioId: 'f1', cods: [P.codificar(v.desc)], fotos: 1 });
    }, base);
    R.iaCarga = Date.now() - tIA;
    console.log(`  · reconhecimento carregado e primeiro rosto codificado em ${ms(R.iaCarga)} (modo: ${await page.evaluate(() => PONTO_FACIAL_V100.modo())})`);
    await page.evaluate(() => { location.hash = '#/pontoFacial'; });
    await page.waitForSelector('#fcTravar');
    await page.waitForFunction(() => /1 de 3/.test(document.getElementById('fcResumo').textContent), null, { timeout: 10000 });

    const senha = async () => { await page.waitForSelector('.fc-dlg input'); const n = (await page.$$('.fc-dlg input')).length; for (let i = 0; i < n; i++) await page.fill(`.fc-dlg input[data-i="${i}"]`, '1234'); await page.click('.fc-dlg .fc-ok'); };
    const imagemViva = () => page.waitForFunction(() => { const v = document.querySelector('.fc-video video'); return v && v.videoWidth > 0 && v.readyState >= 2 && v.srcObject && v.srcObject.getVideoTracks().some((t) => t.readyState === 'live'); }, null, { timeout: 20000, polling: 16 });

    /* A. abrir a tela travada 5 vezes */
    const abrir = [];
    for (let i = 0; i < 5; i++) {
      await page.click('#fcTravar'); await page.waitForSelector('.fc-dlg input');
      const n = (await page.$$('.fc-dlg input')).length; for (let j = 0; j < n; j++) await page.fill(`.fc-dlg input[data-i="${j}"]`, '1234');
      const t0 = Date.now(); await page.click('.fc-dlg .fc-ok');
      await imagemViva(); abrir.push(Date.now() - t0);
      if (i === 0) {   // na primeira vez, espera a batida de Ana (reconhecimento de ponta a ponta)
        const t1 = Date.now();
        await page.waitForFunction((H) => DATA.diario.some((x) => x.funcionarioId === 'f1' && x.data === H && x.entrada), H, { timeout: 60000 });
        R.batida = Date.now() - t0; console.log(`  · da senha à batida de Ana registrada sozinha: ${ms(R.batida)} (depois da imagem: ${ms(Date.now() - t1)})`);
      }
      if (i < 4) { await page.click('#fcSair'); await senha(); await page.waitForSelector('.fc-tela', { state: 'detached' }); }
    }
    R.abrir = abrir; console.log(`  · A. câmera com imagem ao travar (5×): ${abrir.map(ms).join(', ')} → ${resumo(abrir)}`);
    ok(mediana(abrir) < 2000, `A. a câmera abre com imagem em menos de 2 s (${resumo(abrir)})`);

    /* B. 10 trocas de câmera */
    const trocas = [];
    for (let i = 0; i < 10; i++) {
      const antes = await page.evaluate(() => document.getElementById('fcCam').textContent);
      const t0 = Date.now(); await page.click('#fcCam');
      await page.waitForFunction((a) => document.getElementById('fcCam').textContent !== a, antes, { timeout: 20000, polling: 16 });
      await imagemViva(); trocas.push(Date.now() - t0);
    }
    await page.waitForTimeout(400);
    const vivasB = await page.evaluate(() => window.__vivas());
    R.trocas = trocas; console.log(`  · B. troca de câmera (10×): ${trocas.map(ms).join(', ')} → ${resumo(trocas)}`);
    ok(Math.max(...trocas) < 2000, `B. cada troca de câmera leva menos de 2 s (${resumo(trocas)})`);
    ok(vivasB === 1, `B. depois de 10 trocas só uma câmera ligada (${vivasB})`);
    /* troca dupla (dois toques seguidos) */
    await page.evaluate(() => { const b = document.getElementById('fcCam'); b.click(); b.click(); });
    await page.waitForTimeout(1500); await imagemViva();
    const vivasB2 = await page.evaluate(() => window.__vivas());
    ok(vivasB2 === 1, `B. dois toques seguidos no botão: continua uma câmera só, com imagem (${vivasB2})`);

    /* C. o operário continua depois das trocas */
    await page.waitForTimeout(2500);
    const modoC = await page.evaluate(() => PONTO_FACIAL_V100.modo());
    R.modoDepoisTrocas = modoC;
    ok(modoC === 'operario', `C. depois das trocas o reconhecimento continua fora da tela (modo: ${modoC})`);
    /* num celular de verdade a câmera nova leva um instante para mandar imagem: olhar nesse instante não pode derrubar o operário */
    const modoC2 = await page.evaluate(async () => { const P = PONTO_FACIAL_V100, v = document.createElement('video'); let r = 'ok'; try { r = await Promise.race([P.achar(v).then(() => 'ok'), new Promise((x) => setTimeout(() => x('travou 15 s'), 15000))]); } catch (e) { r = 'erro'; } return P.modo() + ' / ' + r; });
    ok(/^operario/.test(modoC2), `C. olhar um vídeo ainda sem imagem não tira o reconhecimento de fora da tela (${modoC2})`);

    /* D. tempo de cada olhada no vídeo ao vivo */
    const D = await page.evaluate(async () => {
      const P = PONTO_FACIAL_V100, v = document.querySelector('.fc-video video'), a = [], b = [];
      for (let i = 0; i < 12; i++) { let t = performance.now(); await P.achar(v); a.push(performance.now() - t); t = performance.now(); await P.ver(v); b.push(performance.now() - t); }
      return { a: a.slice(2), b: b.slice(2) };
    });
    R.achar = D.a; R.ver = D.b;
    console.log(`  · D. olhada leve (achar): ${resumo(D.a)} · código do rosto (ver): ${resumo(D.b)}`);

    /* E. a câmera cai no meio */
    const tE = await page.evaluate(async () => {
      const v = document.querySelector('.fc-video video'); const t0 = performance.now();
      v.srcObject.getVideoTracks().forEach((t) => { t.stop(); t.dispatchEvent(new Event('ended')); });   // como quando o aparelho corta a câmera
      while (performance.now() - t0 < 15000) { await new Promise((r) => setTimeout(r, 16)); if (v.videoWidth && v.readyState >= 2 && v.srcObject && v.srcObject.getVideoTracks().some((t) => t.readyState === 'live')) return performance.now() - t0; }
      return -1;
    });
    R.volta = tE; console.log(`  · E. câmera caiu: voltou com imagem em ${ms(tE)}`);
    ok(tE > 0 && tE < 3000, `E. câmera que cai volta sozinha em menos de 3 s (${ms(tE)})`);

    /* F. desligar e ligar de novo enquanto a câmera ainda abre */
    const F = await page.evaluate(async () => {
      const P = PONTO_FOTO_V78, r = [];
      for (let i = 0; i < 3; i++) {
        P.desligarCamera(0);
        const p1 = P.ligarCamera().catch(() => null); P.desligarCamera(0); const st = await P.ligarCamera().catch((e) => null); await p1;
        await new Promise((x) => setTimeout(x, 300));
        r.push(!!(st && st.getVideoTracks().some((t) => t.readyState === 'live')));
      }
      return { r, vivas: window.__vivas() };
    });
    ok(F.r.every(Boolean), `F. ligar logo depois de desligar (câmera ainda abrindo): a câmera fica com imagem (${F.r.join(', ')})`);
    ok(F.vivas <= 1, `F. nenhuma câmera sobra ligada (${F.vivas})`);
    await imagemViva();

    /* G. vários avisos de "a tela voltou" seguidos: não podem rodar dois reconhecimentos ao mesmo tempo */
    await page.evaluate(async () => { await APP.db.doc('rostos/f1').delete(); const P = PONTO_FACIAL_V100; const v = document.querySelector('.fc-video video'); const x = await P.ver(v); await APP.db.doc('rostos/f2').set({ id: 'f2', funcionarioId: 'f2', cods: [P.codificar(x.desc.map((n, i) => n + (i % 2 ? 0.08 : -0.08)))], fotos: 1 }); });
    await page.waitForTimeout(1500);
    const taxa = async (spam) => page.evaluate(async (spam) => {
      const a = window.__olhadas, t0 = performance.now(); let id = null;
      if (spam) id = setInterval(() => document.dispatchEvent(new Event('visibilitychange')), 300);
      await new Promise((r) => setTimeout(r, 6000)); clearInterval(id);
      return (window.__olhadas - a) / ((performance.now() - t0) / 1000);
    }, spam);
    const g0 = await taxa(false), g1 = await taxa(true);
    R.olhadasPorSeg = [g0, g1];
    console.log(`  · G. olhadas por segundo: normal ${g0.toFixed(1)} · com avisos seguidos ${g1.toFixed(1)}`);
    ok(g1 <= g0 * 1.5 + 1, `G. avisos seguidos não multiplicam o reconhecimento (${g0.toFixed(1)} → ${g1.toFixed(1)} por segundo)`);
    await page.evaluate(async () => { await APP.db.doc('rostos/f2').delete(); });

    /* J. a câmera abre mas não manda imagem (acontece em celular com a câmera presa por outro aplicativo) */
    const semImagem = (n) => page.evaluate((n) => {
      const md = navigator.mediaDevices; window.__gumReal = window.__gumReal || md.getUserMedia; let k = n;
      md.getUserMedia = async (c) => { if (k-- > 0) { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const s = cv.captureStream(0); window.__streams.push(s); return s; } return window.__gumReal(c); };
    }, n);
    const real = () => page.evaluate(() => { if (window.__gumReal) navigator.mediaDevices.getUserMedia = window.__gumReal; });
    await semImagem(1);
    const tJ = await page.evaluate(async () => {
      const v = document.querySelector('.fc-video video'); const t0 = performance.now();
      v.srcObject.getVideoTracks().forEach((t) => { t.stop(); t.dispatchEvent(new Event('ended')); });
      while (performance.now() - t0 < 25000) { await new Promise((r) => setTimeout(r, 50)); const tr = v.srcObject && v.srcObject.getVideoTracks()[0]; if (tr && tr.readyState === 'live' && !('canvas' in tr) && v.videoWidth > 2 && v.readyState >= 2) return performance.now() - t0; }
      return -1;
    });
    await real();
    R.semImagem = tJ; console.log(`  · J. a câmera voltou sem imagem: outra câmera com imagem em ${ms(tJ)}`);
    ok(tJ > 0 && tJ < 12000, `J. câmera que abre sem imagem não prende a tela: em ${ms(tJ)} já abriu outra com imagem`);
    await imagemViva();
    await semImagem(1);
    const J2 = await page.evaluate(async () => {
      const b = document.getElementById('fcCam'); const t0 = performance.now(); b.click();
      await new Promise((r) => setTimeout(r, 100));
      while (b.disabled && performance.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 50));
      return { solto: !b.disabled, ms: performance.now() - t0 };
    });
    await real();
    ok(J2.solto && J2.ms < 10000, `J. troca para uma câmera sem imagem: o botão volta em ${ms(J2.ms)} (não fica preso em "Trocando a câmera…")`);
    await imagemViva();
    const vivasJ = await page.evaluate(() => window.__vivas());
    ok(vivasJ === 1, `J. depois disso, uma câmera só ligada (${vivasJ})`);

    /* K. batida com foto: a outra câmera está ocupada e a troca falha */
    const K1 = await page.evaluate(async () => {
      const P = PONTO_FOTO_V78, md = navigator.mediaDevices, g = md.getUserMedia;
      P.abrirBatida('f2', { origem: 'teste de desempenho' });
      const t0 = performance.now(), conta = () => document.querySelector('#pfConta');
      while (!(conta() && /\d/.test(conta().textContent)) && performance.now() - t0 < 15000) await new Promise((r) => setTimeout(r, 30));
      const alvo = P.ladoCam() === 'user' ? 'environment' : 'user';
      md.getUserMedia = async (c) => { if (JSON.stringify(c).includes(alvo)) throw new DOMException('a outra câmera está ocupada', 'NotReadableError'); return g(c); };
      document.querySelector('.pf-cam [data-pf="trocar"]').click();
      const t1 = performance.now(), fim = () => document.querySelector('.pf-cam.pf-res-ok,.pf-cam.pf-res-erro');
      while (!fim() && performance.now() - t1 < 20000) await new Promise((r) => setTimeout(r, 50));
      md.getUserMedia = g;
      const r = fim();
      return { ok: !!(r && r.classList.contains('pf-res-ok')), ms: performance.now() - t1, txt: r ? r.textContent.replace(/\s+/g, ' ').slice(0, 120) : (document.querySelector('#pfMsg') || {}).textContent || '' };
    });
    ok(K1.ok, `K. batida com foto: a troca falhou, a imagem voltou e a foto saiu sozinha em ${ms(K1.ms)}${K1.ok ? '' : ' — ' + K1.txt}`);
    await page.waitForSelector('.pf-cam', { state: 'detached', timeout: 15000 });
    await imagemViva();
    const vivasK = await page.evaluate(() => window.__vivas());
    ok(vivasK === 1, `K. depois da batida com foto, uma câmera só ligada (${vivasK})`);

    /* H. uso prolongado com a pessoa na frente: 45 s */
    await page.evaluate(async (base) => { const P = PONTO_FACIAL_V100; const i = new Image(); i.src = base + '/saida/teste-facial/rosto-desempenho.jpg'; await i.decode(); const v = await P.ver(i); await APP.db.doc('rostos/f1').set({ id: 'f1', funcionarioId: 'f1', cods: [P.codificar(v.desc)], fotos: 1 }); }, base);
    await page.evaluate(() => { window.__longas.length = 0; });
    const m0 = await metricas(); const h0 = await page.evaluate(() => (performance.memory || {}).usedJSHeapSize || 0);
    const T = 45000; await page.waitForTimeout(T);
    const m1 = await metricas(); const h1 = await page.evaluate(() => (performance.memory || {}).usedJSHeapSize || 0);
    const longas = await page.evaluate(() => window.__longas.slice());
    const H1 = await page.evaluate((H) => ({ n: DATA.diario.filter((x) => x.funcionarioId === 'f1' && x.data === H).length, arq: window.__arquivos.length, vivas: window.__vivas() }), H);
    R.cpu = (m1.TaskDuration - m0.TaskDuration) / (T / 1000); R.script = (m1.ScriptDuration - m0.ScriptDuration) / (T / 1000);
    R.heap = [h0, h1]; R.longas = longas;
    console.log(`  · H. 45 s: CPU da tela ${(R.cpu * 100).toFixed(1)}% (JavaScript ${(R.script * 100).toFixed(1)}%), memória ${(h0 / 1048576).toFixed(1)} → ${(h1 / 1048576).toFixed(1)} MB, travadas da tela ${longas.length} (maior ${ms(Math.max(0, ...longas))})`);
    ok(H1.n === 1, `H. uma batida só para a mesma pessoa (registros de Ana hoje: ${H1.n})`);
    ok(H1.vivas === 1, `H. uma câmera só ligada durante o uso (${H1.vivas})`);
    ok(h1 < h0 * 1.5 + 8 * 1048576, 'H. a memória não cresce sem parar');

    /* I. sair do módulo */
    await page.click('#fcSair'); await senha(); await page.waitForSelector('.fc-tela', { state: 'detached' });
    await page.evaluate(() => { location.hash = '#/inicio'; });
    await page.waitForTimeout(800);
    const vivasI = await page.evaluate(() => window.__vivas());
    ok(vivasI === 0, `I. destravou e saiu do ponto: nenhuma câmera ligada (${vivasI})`);

    /* L. o operário não carregou (a internet falhou na hora) e a tela carregou: depois ele volta sozinho para fora da tela */
    let falhouLib = 0;
    const rotaLib = (r) => (falhouLib++ ? r.fallback() : r.abort('internetdisconnected'));
    await ctx.route(/face-api\.js(\?|$)/, rotaLib);
    const p2 = await ctx.newPage(); const e2 = [];
    p2.on('pageerror', (e) => e2.push(String(e && e.message)));
    await p2.addInitScript(iniciar, { codigo: servidorFalso, funcs: FUNCS });
    await p2.goto(base + '/saida/claude.html');
    await p2.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });
    const L = await p2.evaluate(async (base) => {
      const P = PONTO_FACIAL_V100; await P.carregarIA(); const m1 = P.modo();
      const i = new Image(); i.src = base + '/saida/teste-facial/rosto-desempenho.jpg'; await i.decode();
      const marcado = P._voltarJa(); await P.achar(i);
      const t0 = performance.now(); while (P.modo() !== 'operario' && performance.now() - t0 < 60000) await new Promise((r) => setTimeout(r, 100));
      const v = await P.ver(i);
      return { m1, marcado, m2: P.modo(), ms: performance.now() - t0, desc: !!(v && v.desc), voltas: P.medidas().voltasOperario };
    }, base);
    await ctx.unroute(/face-api\.js(\?|$)/, rotaLib);
    R.voltaOperario = L;
    ok(L.m1 === 'tela' && L.marcado, `L. o operário não carregou por falha da internet: o reconhecimento roda na tela (${L.m1}) e fica marcado para tentar de novo (${L.marcado})`);
    ok(L.m2 === 'operario' && L.desc, `L. na nova tentativa o reconhecimento volta para fora da tela e funciona (${L.m2}, em ${ms(L.ms)})`);

    /* M. o código do rosto falha sempre no operário, mas a olhada leve funciona: antes ficava mudo para sempre */
    const M = await p2.evaluate(async (base) => {
      const P = PONTO_FACIAL_V100; const i = new Image(); i.src = base + '/saida/teste-facial/rosto-desempenho.jpg'; await i.decode();
      const pm = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (m, t) { if (m && m.t === 'ver') m = { ...m, img: null }; return pm.call(this, m, t); };
      let n = 0; while (P.modo() === 'operario' && n < 8) { await P.achar(i); await P.ver(i); n++; }
      Worker.prototype.postMessage = pm;
      const v = await P.ver(i);
      return { modo: P.modo(), n, desc: !!(v && v.desc) };
    }, base);
    ok(M.modo === 'tela' && M.desc, `M. o código do rosto falha sempre no operário: passa para a tela e continua reconhecendo (${M.modo} depois de ${M.n} tentativas)`);
    await p2.close();
    ok(e2.length === 0, `L/M. sem erros de JavaScript${e2.length ? ': ' + e2.slice(0, 3).join(' | ') : ''}`);
    ok(erros.length === 0, `sem erros de JavaScript${erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''}`);
    await ctx.close();
  } finally { await browser.close(); }
}

try {
  const so = process.argv[2] || '';   // node scripts/testar-ponto-facial-desempenho.mjs celular → só um aparelho
  if (!so || so === 'computador') await cenario('computador', { viewport: { width: 1280, height: 800 } });
  if (!so || so === 'celular') await cenario('celular', { ...devices['Pixel 7'] });
} finally { http.close(); }
writeFileSync(join(RAIZ, 'saida/desempenho-ponto-facial.json'), JSON.stringify(RESULTADOS, null, 1));
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nDesempenho do ponto facial: tudo certo.');
process.exit(falhas ? 1 : 0);
