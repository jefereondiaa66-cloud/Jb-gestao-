#!/usr/bin/env node
// Teste de ponta a ponta do Ponto facial (V100), no programa REAL (saida/claude.html) num Chromium
// com banco central simulado e a câmera mostrando um rosto de verdade (fotos de exemplo que vêm com a
// biblioteca face-api). O reconhecimento roda de verdade; nada sai para a internet.
// Confere:
//   1. a tela abre em #/pontoFacial, com o resumo e o botão "Travar a tela e começar"
//   2. o cadastro tira 5 fotos sozinho e guarda só os códigos (nenhuma foto do cadastro é guardada)
//   3. travar pede a senha (na primeira vez, cria) e a tela fica só com a hora e a câmera
//   4. a pessoa é reconhecida sem tocar em nada e a ENTRADA cai no Diário do DP, com a foto
//   5. não registra para outra pessoa nem bate duas vezes
//   6. senha errada não destrava; a certa destrava; nenhum endereço tira da tela travada
//   7. rosto desconhecido: depois de duas tentativas aparece "escolha seu nome"; a batida fica marcada para conferir
//   8. recarregar a página não destrava
//   9. o perfil "Celular do ponto" usa a tela, mas não cadastra rosto
// Uso: npm install --no-save playwright @vladmandic/face-api@1.7.15 && node scripts/construir.mjs && node scripts/testar-ponto-facial.mjs
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
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
const semErros = (erros) => erros.filter((m) => !/Chart|XLSX|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));

/* ---------- 0. os quadros da câmera: um rosto grande no meio de 640 × 480 ---------- */
{
  const b0 = await chromium.launch();
  const p0 = await b0.newPage();
  await p0.goto(base + '/_fa/demo/sample3.jpg');
  await p0.addScriptTag({ url: base + '/_fa/dist/face-api.js' });
  const quadros = await p0.evaluate(async (base) => {
    const m = base + '/_fa/model/';
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
        out.push(c.toDataURL('image/jpeg', 0.92).split(',')[1]);
      }
    }
    return out;
  }, base);
  await b0.close();
  if (quadros.length < 3) { console.log('não achei 3 rostos nas fotos de exemplo'); process.exit(1); }
  quadros.forEach((q, i) => writeFileSync(join(TMP, `rosto${i}.jpg`), Buffer.from(q, 'base64')));
  writeFileSync(join(TMP, 'camera.mjpeg'), Buffer.from(quadros[0], 'base64'));   // a câmera mostra o rosto 0 (Ana)
}

const FUNCS = [
  { id: 'f1', nome: 'Ana Teste Souza', matricula: '101', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', entrada: '07:00', saida: '17:00', intervalo: 60 },
  { id: 'f2', nome: 'Bruna Teste Lima', matricula: '102', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção' },
  { id: 'f3', nome: 'Carla Teste Dias', matricula: '103', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Forno' },
  { id: 'f4', nome: 'Diego Prestador', matricula: '104', situacao: 'Ativo', tipoContratacao: 'Prestador de serviços autônomo (pessoa física)', setor: 'Manutenção' },
  { id: 'f5', nome: 'Elton Desligado', matricula: '105', situacao: 'Desligado', tipoContratacao: 'CLT', setor: 'Produção' },
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
};
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + join(TMP, 'camera.mjpeg'), '--autoplay-policy=no-user-gesture-required'] });
try {
  const ctx = await browser.newContext({ permissions: ['camera'], viewport: { width: 412, height: 860 } });
  await rotas(ctx);
  await ctx.route(/^http:\/\/127\.0\.0\.1:\d+\/_blob\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  await page.addInitScript(iniciar, { codigo: servidorFalso, funcs: FUNCS });
  const abrir = async () => {
    await page.goto(base + '/saida/claude.html');
    await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.funcionarios.length >= 5, null, { timeout: 30000 });
  };
  await abrir();
  const H = await page.evaluate(() => hoje());

  /* ---------- 1. a tela ---------- */
  await page.evaluate(() => { location.hash = '#/pontoFacial'; });
  await page.waitForSelector('#fcTravar', { timeout: 10000 });
  await page.waitForFunction(() => /0 de 3/.test(document.getElementById('fcResumo').textContent), null, { timeout: 10000 });
  ok(true, 'a tela abre com o resumo (0 de 3 com rosto) e o botão "Travar a tela e começar"');
  ok(await page.evaluate(() => AREAS_MS.find((x) => x.g === 'Ponto e lançamentos').A.some((x) => x.m === 'pontoFacial') && MITENS.filter((m) => m.m === 'pontoFacial').length === 1), 'item "Ponto facial" no menu do DP, uma vez só');
  ok(await page.evaluate(() => /Cadastrar rosto do ponto/.test(atalhosFunc(F('f1'))) && !/rosto/.test(atalhosFunc(F('f4'))) && !/rosto/.test(atalhosFunc(F('f5')))), 'ficha do funcionário: atalho "Cadastrar rosto do ponto" (não para prestador nem desligado)');

  /* ---------- 2. cadastro ---------- */
  ok(await page.evaluate(() => { const A = AREAS_MS.find((x) => x.g === 'Ponto e lançamentos').A; return A.findIndex((x) => x.m === 'cadastrarRosto') === A.findIndex((x) => x.m === 'pontoFacial') + 1 && MITENS.filter((m) => m.m === 'cadastrarRosto' && m.l === 'Cadastrar rosto').length === 1; }), 'item "Cadastrar rosto" no menu do ponto, logo depois de "Ponto facial"');
  await page.click('a[href="#/cadastrarRosto"]');
  await page.waitForSelector('#fcLista [data-fc-cad="f1"]', { timeout: 10000 });
  ok((await page.$$eval('#fcLista [data-fc-cad]', (b) => b.map((x) => x.dataset.fcCad))).join() === 'f1,f2,f3', 'lista só os empregados ativos');
  await page.screenshot({ path: join(RAIZ, 'saida/tela-cadastrar-rosto.png') });
  const t0 = Date.now();
  await page.click('#fcLista [data-fc-cad="f1"] .fc-txt b');   // tocar no nome abre o cadastro
  await page.waitForSelector('.fc-cad video', { timeout: 5000 });
  await page.waitForSelector('.fc-cad.pf-res-ok', { timeout: 180000 });
  const r2 = await page.evaluate(() => { const d = window.__srv.estado.docs.get('rostos/f1'); return { d: d && d.dados, arq: window.__arquivos.length, tela: document.querySelector('.fc-cad').textContent }; });
  ok(!!(r2.d && r2.d.cods && r2.d.cods.length === 5 && r2.d.cods.every((c) => typeof c === 'string' && c.length === 344)), `5 fotos tiradas sozinhas e 5 códigos no banco (${Math.round((Date.now() - t0) / 1000)} s)`);
  ok(r2.arq === 0 && !JSON.stringify(r2.d).includes('data:image'), 'nenhuma foto do cadastro é guardada, só os códigos');
  ok(/Rosto cadastrado/.test(r2.tela), 'avisa "Rosto cadastrado"');
  await page.click('#fcFim');
  await page.waitForFunction(() => !document.querySelector('.fc-cad') && /Rosto cadastrado · 5 fotos/.test(document.getElementById('fcLista').textContent), null, { timeout: 8000 });
  ok(true, 'a lista mostra "Rosto cadastrado · 5 fotos"');
  // a segunda pessoa (Bruna) recebe o código de outro rosto; mede as distâncias de verdade
  const r2b = await page.evaluate(async (base) => {
    const P = PONTO_FACIAL_V100, img = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
    const a = await P.ver(await img(base + '/saida/teste-facial/rosto0.jpg'), true), b = await P.ver(await img(base + '/saida/teste-facial/rosto1.jpg'), true), c = await P.ver(await img(base + '/saida/teste-facial/rosto2.jpg'), true);
    const ida = P.decodificar(P.codificar(a.desc));
    await APP.db.doc('rostos/f2').set({ id: 'f2', funcionarioId: 'f2', cods: [P.codificar(b.desc)], fotos: 1 });
    await new Promise((r) => setTimeout(r, 600));
    return { ab: P.dist(a.desc, b.desc), ac: P.dist(a.desc, c.desc), bc: P.dist(b.desc, c.desc), ida: P.dist(a.desc, ida), mA: P.comparar(a.desc), mB: P.comparar(b.desc), mC: P.comparar(c.desc), lim: P.limites };
  }, base);
  ok(r2b.ida < 0.001, `o código guardado é fiel ao rosto (diferença ${r2b.ida.toFixed(5)})`);
  ok(r2b.ab > 0.55 && r2b.ac > 0.55 && r2b.bc > 0.55, `pessoas diferentes ficam longe (${r2b.ab.toFixed(2)}, ${r2b.ac.toFixed(2)}, ${r2b.bc.toFixed(2)}; limite ${r2b.lim.LIMITE})`);
  ok(r2b.mA.fid === 'f1' && r2b.mA.d < 0.3 && r2b.mB.fid === 'f2', `cada rosto cadastrado acha a própria pessoa (Ana ${r2b.mA.d.toFixed(2)})`);
  ok(r2b.mC.fid === null, `rosto sem cadastro não é confundido com ninguém (mais perto: ${r2b.mC.d.toFixed(2)})`);

  /* ---------- 3. travar ---------- */
  await page.evaluate(() => { location.hash = '#/pontoFacial'; });
  await page.waitForSelector('#fcTravar');
  await page.waitForFunction(() => /2 de 3/.test(document.getElementById('fcResumo').textContent));
  await page.click('#fcTravar');
  await page.waitForSelector('.fc-dlg input');
  ok((await page.$$('.fc-dlg input')).length === 2 && /Crie a senha/.test(await page.textContent('.fc-dlg')), 'primeira vez: pede para criar a senha (duas vezes)');
  await page.fill('.fc-dlg input[data-i="0"]', '1234'); await page.fill('.fc-dlg input[data-i="1"]', '1235');
  await page.click('.fc-dlg .fc-ok');
  await page.waitForFunction(() => /não são iguais/.test(document.querySelector('.fc-dlg .fc-er').textContent));
  ok(!(await page.$('.fc-tela')), 'senhas diferentes: não trava');
  await page.fill('.fc-dlg input[data-i="0"]', '1234'); await page.fill('.fc-dlg input[data-i="1"]', '1234');
  await page.click('.fc-dlg .fc-ok');
  await page.waitForSelector('.fc-tela', { timeout: 8000 });
  const r3 = await page.evaluate(() => { const s = window.__srv.estado.docs.get('rostos/_senha'); return { s: s && s.dados, trava: localStorage.getItem('jb-ponto-facial-travada'), botoes: [...document.querySelectorAll('.fc-tela button')].filter((b) => !b.hidden).map((b) => b.textContent.trim()), hora: document.getElementById('fcHora').textContent }; });
  ok(!!(r3.s && r3.s.hash && r3.s.hash.length === 64 && !JSON.stringify(r3.s).includes('1234')), 'a senha vai para o banco embaralhada (nunca a senha em si)');
  ok(!!r3.trava && r3.botoes.join() === 'Destravar' && /\d{2}:\d{2}/.test(r3.hora), `tela travada: só a hora, a câmera e "Destravar" (${r3.botoes.join(', ')})`);

  /* ---------- 4 e 5. reconhece e registra sozinho ---------- */
  await page.waitForFunction((H) => DATA.diario.some((x) => x.funcionarioId === 'f1' && x.data === H && x.entrada), H, { timeout: 120000 });
  await page.waitForSelector('#fcRes:not([hidden])', { timeout: 5000 });
  const r4 = await page.evaluate((H) => ({ r: DATA.diario.find((x) => x.funcionarioId === 'f1' && x.data === H), outros: DATA.diario.filter((x) => x.funcionarioId !== 'f1').length, arq: window.__arquivos, tela: document.getElementById('fcRes').textContent, classe: document.getElementById('fcRes').className }), H);
  const m4 = r4.r.fotosPonto && r4.r.fotosPonto.entrada;
  ok(/^\d{2}:\d{2}$/.test(r4.r.entrada) && r4.r.tipo === 'Presença normal', `sem tocar em nada: entrada de Ana no Diário do DP (${r4.r.entrada})`);
  ok(!!(m4 && m4.origem === 'Ponto facial' && m4.rosto && m4.rosto.d < 0.3 && !m4.conferir), `marcada como reconhecida pelo rosto (distância ${m4 && m4.rosto && m4.rosto.d})`);
  ok(!!(m4 && m4.id && r4.arq.length === 1 && r4.arq[0].tam < 80000), `a foto da batida foi guardada (${r4.arq[0] && Math.round(r4.arq[0].tam / 1024)} KB)`);
  ok(/Ana Teste Souza/.test(r4.tela) && /Entrada registrada/.test(r4.tela) && r4.classe === 'fc-res', 'a tela mostra o nome, "Entrada registrada" e a hora, em verde');
  ok(r4.outros === 0, 'ninguém mais teve batida (não confunde com a Bruna)');
  await page.screenshot({ path: join(RAIZ, 'saida/tela-ponto-facial-ok.png') });
  await page.waitForSelector('#fcRes', { state: 'hidden', timeout: 8000 });
  await page.screenshot({ path: join(RAIZ, 'saida/tela-ponto-facial.png') });
  await page.waitForTimeout(19000);   // continua na frente da câmera
  const r5 = await page.evaluate((H) => { const r = DATA.diario.find((x) => x.funcionarioId === 'f1' && x.data === H); return { r, n: DATA.diario.length, arq: window.__arquivos.length }; }, H);
  ok(r5.n === 1 && !r5.r.saidaIntervalo && !r5.r.saida && r5.arq === 1, 'a mesma pessoa parada na frente não bate de novo');

  /* ---------- 6. travada de verdade ---------- */
  await page.evaluate(() => { location.hash = '#/ponto'; });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => location.hash === '#/pontoFacial' && !!document.querySelector('.fc-tela')), 'trocar o endereço não tira da tela travada');
  await page.click('#fcSair');
  await page.waitForSelector('.fc-dlg input');
  await page.fill('.fc-dlg input', '0000'); await page.click('.fc-dlg .fc-ok');
  await page.waitForFunction(() => /Senha errada/.test(document.querySelector('.fc-dlg .fc-er').textContent));
  ok(!!(await page.$('.fc-tela')), 'senha errada: continua travada');
  await page.fill('.fc-dlg input', '1234'); await page.click('.fc-dlg .fc-ok');
  await page.waitForSelector('.fc-tela', { state: 'detached', timeout: 5000 });
  ok(await page.evaluate(() => !localStorage.getItem('jb-ponto-facial-travada') && !!document.getElementById('fcTravar')), 'senha certa: destrava e volta para a tela inicial');

  /* ---------- 7. rosto desconhecido ---------- */
  await page.evaluate(async () => { await APP.db.doc('rostos/f1').delete(); await new Promise((r) => setTimeout(r, 600)); });
  await page.waitForFunction(() => /1 de 3/.test(document.getElementById('fcResumo').textContent));
  await page.click('#fcTravar');
  await page.waitForSelector('.fc-dlg input');
  ok((await page.$$('.fc-dlg input')).length === 1 && /Travar a tela/.test(await page.textContent('.fc-dlg')), 'nos outros dias: pede a senha para travar');
  await page.fill('.fc-dlg input', '1234'); await page.click('.fc-dlg .fc-ok');
  await page.waitForSelector('.fc-tela');
  ok(await page.evaluate(() => document.getElementById('fcNome').hidden), 'o botão de escolher o nome começa escondido');
  await page.waitForFunction(() => { const b = document.getElementById('fcNome'); return b && !b.hidden; }, null, { timeout: 120000 });
  const r7a = await page.evaluate(() => ({ falhas: PONTO_FACIAL_V100.estado().falhas, n: DATA.diario.length }));
  ok(r7a.falhas >= 2 && r7a.n === 1, 'não reconheceu duas vezes: aparece "escolha seu nome" e nada é registrado sozinho');
  await page.waitForSelector('#fcRes', { state: 'hidden', timeout: 8000 });
  await page.click('#fcNome');
  await page.waitForSelector('.fc-nomes [data-fc-f="f3"]');
  ok((await page.$$eval('.fc-nomes [data-fc-f]', (b) => b.map((x) => x.dataset.fcF))).join() === 'f1,f2,f3', 'a lista de nomes aparece por cima, ainda travada');
  await page.click('.fc-nomes [data-fc-f="f3"]');
  await page.waitForSelector('.pf-cam.pf-res-ok', { timeout: 20000 });
  const r7 = await page.evaluate((H) => { const r = DATA.diario.find((x) => x.funcionarioId === 'f3' && x.data === H); return { r, travada: !!document.querySelector('.fc-tela') }; }, H);
  const m7 = r7.r && r7.r.fotosPonto && r7.r.fotosPonto.entrada;
  ok(!!(r7.r && r7.r.entrada && m7 && m7.conferir === true && /tocou no nome/.test(m7.origem) && !m7.rosto), 'batida pelo nome fica marcada para o DP conferir');
  ok(r7.travada, 'continua travada depois da batida pelo nome');
  await page.click('.pf-cam [data-pf="sair"]').catch(() => {});
  await page.waitForSelector('.pf-cam', { state: 'detached', timeout: 8000 });

  /* ---------- 8. recarregar não destrava ---------- */
  await abrir();
  await page.waitForSelector('.fc-tela', { timeout: 15000 });
  ok(await page.evaluate(() => location.hash === '#/pontoFacial'), 'recarregar a página: volta travada, na tela do ponto');
  await page.click('#fcSair');
  await page.waitForSelector('.fc-dlg input');
  await page.fill('.fc-dlg input', '9999'); await page.click('.fc-dlg .fc-ok');
  await page.waitForFunction(() => /Senha errada/.test(document.querySelector('.fc-dlg .fc-er').textContent));
  await page.fill('.fc-dlg input', '1234'); await page.click('.fc-dlg .fc-ok');
  await page.waitForSelector('.fc-tela', { state: 'detached', timeout: 5000 });
  ok(true, 'depois de recarregar, só a senha destrava (mesmo sem a senha do banco na mão)');

  /* ---------- 9. perfil "Celular do ponto" ---------- */
  const r9 = await page.evaluate(async () => {
    APP.papel = 'celularPonto'; location.hash = '#/pontoFacial'; renderCasca(); renderTela();
    await new Promise((r) => setTimeout(r, 300));
    const r = { h1: location.hash, travar: !!document.getElementById('fcTravar'), cadastrar: !!document.querySelector('a[href="#/cadastrarRosto"]'), senha: !!document.getElementById('fcSenhaBt'), fotos: !!document.getElementById('fcFotos') };
    location.hash = '#/cadastrarRosto'; await new Promise((r) => setTimeout(r, 400)); r.h2 = location.hash; r.lista = !!document.getElementById('fcLista');
    location.hash = '#/folha'; await new Promise((r) => setTimeout(r, 300)); r.h3 = location.hash;
    r.atalho = /rosto/.test(atalhosFunc(F('f1')));
    APP.papel = 'admin'; renderCasca(); renderTela();
    return r;
  });
  ok(r9.h1 === '#/pontoFacial' && r9.travar, 'o celular da parede abre o ponto facial e pode travar a tela');
  ok(!r9.cadastrar && !r9.senha && !r9.fotos && !r9.lista && /^#\/ponto(Facial|Foto)$/.test(r9.h2) && !r9.atalho, 'mas não cadastra rosto, não troca a senha e não vê as fotos');
  ok(r9.h3 === '#/pontoFoto', `de outro endereço volta para o ponto (${r9.h3})`);
  ok(semErros(erros).length === 0, `sem erros de JavaScript${semErros(erros).length ? ': ' + semErros(erros).slice(0, 3).join(' | ') : ''}`);
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'celular da parede (412 px): a tela cabe sem rolar para o lado');
  await ctx.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nPonto facial: tudo certo.');
process.exit(falhas ? 1 : 0);
