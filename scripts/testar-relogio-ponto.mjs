#!/usr/bin/env node
// Teste de ponta a ponta do Relógio de digital (V79), no programa REAL (saida/claude.html) num
// Chromium com banco central simulado. Nada sai para a internet (a biblioteca de Excel vem do
// pacote "xlsx" instalado localmente; sem ele, os casos de Excel são pulados com aviso).
// Confere:
//   1. a tela abre em #/relogioPonto, está no menu do DP e o número no relógio começa pela matrícula
//   2. arquivo de texto do relógio (número + data e hora, sem cabeçalho): batidas viram entrada,
//      intervalo, volta e saída; batida repetida conta uma vez; número desconhecido fica de fora
//   3. gravar leva os dias para o Diário do DP e o banco central, com a marca "Relógio de digital"
//   4. importar o mesmo arquivo de novo não grava nada
//   5. horário diferente do que o DP lançou fica como está; o que falta é completado
//   6. CSV com cabeçalho e data dd/mm/aaaa; ligar um número a um funcionário guarda a ligação
//   7. Excel: lista de batidas e grade do mês (horas coladas na célula, período que vira o mês)
// Uso: node scripts/construir.mjs && node scripts/testar-relogio-ponto.mjs
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
let XLSX_JS = null;
try { XLSX_JS = readFileSync(req.resolve('xlsx/dist/xlsx.full.min.js'), 'utf8'); } catch (e) { /* sem o pacote: pula o Excel */ }
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

const FUNCS = [
  { id: 'f1', nome: 'Ana Teste Souza', matricula: '101', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', entrada: '07:00', saida: '17:00', intervalo: 60 },
  { id: 'f2', nome: 'Bruno Teste Lima', matricula: '0102', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Produção', entrada: '07:00', saida: '13:00', intervalo: 0 },
  { id: 'f3', nome: 'Carla Teste Dias', matricula: '103', situacao: 'Ativo', tipoContratacao: 'CLT', setor: 'Forno' },
  { id: 'f4', nome: 'Diego Prestador', matricula: '104', situacao: 'Ativo', tipoContratacao: 'Prestador de serviços autônomo (pessoa física)', setor: 'Manutenção' },
];

const iniciar = ({ codigo, funcs }) => {
  const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
  const srv = criar({ admins: ['u_DONO'] });
  srv.estado.gravarDireto('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });
  funcs.forEach((f) => srv.estado.gravarDireto('funcionarios', f.id, f));
  window.__srv = srv;
  const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
  const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
  window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
};

const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const semErros = (erros) => erros.filter((m) => !/Chart|jspdf|jsPDF|Failed to fetch|NetworkError|net::/.test(m));

const ctx = await browser.newContext();
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
if (XLSX_JS) await ctx.route(/xlsx(@|\/)0\.18\.5.*xlsx\.full\.min\.js/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: XLSX_JS }));
const page = await ctx.newPage();
const erros = [];
page.on('pageerror', (e) => erros.push(String(e && e.message)));
await page.addInitScript(iniciar, { codigo: servidorFalso, funcs: FUNCS });
await page.goto(base + '/saida/claude.html');
await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado && DATA.funcionarios.length >= 4, null, { timeout: 30000 });

const D = (n) => `2026-10-${String(n).padStart(2, '0')}`;
const arquivo = (name, texto) => ({ name, mimeType: 'text/plain', buffer: Buffer.from(texto, 'utf8') });
async function escolher(f) {
  await page.setInputFiles('#rpArq', f);
  await page.waitForFunction(() => document.querySelector('.rp-res') || /Não encontrei|Não foi possível/.test(document.body.textContent), null, { timeout: 10000 });
}
async function gravarTudo() {
  await page.click('#rpGravar');
  await page.click('.veu .modal button.pri');
  await page.waitForFunction(() => /dia\(s\) gravados no ponto/.test((document.querySelector('.aviso.ok') || {}).textContent || ''), null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const doDia = (fid, data) => page.evaluate(([fid, data]) => {
  const r = DATA.diario.filter((x) => x.funcionarioId === fid && x.data === data);
  const b = window.__srv.estado.docs.get('diario/' + data);
  const it = b && b.dados.items && Object.values(b.dados.items).filter((x) => x && x.funcionarioId === fid);
  return { r, it };
}, [fid, data]);

try {
  /* ---------- 1. a tela ---------- */
  await page.evaluate(() => { location.hash = '#/relogioPonto'; });
  await page.waitForSelector('#rpArq', { state: 'attached', timeout: 10000 });
  const nums = await page.$$eval('input[data-rp-f]', (i) => i.map((x) => x.dataset.rpF + '=' + x.value).join(','));
  ok(nums === 'f1=101,f2=102,f3=103', `número no relógio começa pela matrícula, sem zeros à esquerda e sem prestador (${nums})`);
  ok(await page.evaluate(() => AREAS_MS.find((x) => x.g === 'Ponto e lançamentos').A.some((x) => x.m === 'relogioPonto')), 'item "Relógio de digital" no menu do DP');
  await page.evaluate(() => { location.hash = '#/ponto'; });
  await page.waitForSelector('[data-rp-ir]', { timeout: 5000 });
  ok(true, 'botão "Relógio de digital" no Espelho de ponto');
  await page.evaluate(() => { location.hash = '#/relogioPonto'; });
  await page.waitForSelector('#rpArq', { state: 'attached' });

  /* ---------- 2. texto do relógio, sem cabeçalho ---------- */
  const txt = [
    `   101\t${D(1)} 07:01:12\t1\t0\t1\t0`,
    `   101\t${D(1)} 07:01:50\t1\t0\t1\t0`,      // repetida (menos de 2 min)
    `   101\t${D(1)} 11:02:00\t1\t1\t1\t0`,
    `   101\t${D(1)} 12:58:10\t1\t0\t1\t0`,
    `   101\t${D(1)} 17:03:00\t1\t1\t1\t0`,
    `   102\t${D(1)} 06:55:00\t1\t0\t1\t0`,
    `   102\t${D(1)} 13:01:00\t1\t1\t1\t0`,
    `   101\t${D(2)} 07:10:00\t1\t0\t1\t0`,
    `   999\t${D(2)} 07:20:00\t1\t0\t1\t0`,
  ].join('\r\n');
  await escolher(arquivo('1_attlog.dat', txt));
  const tela2 = await page.textContent('.painel:has(#rpArq)');
  ok(/lista de batidas/.test(tela2) && /9<\/b> batidas|9 batidas/.test(tela2.replace(/\s+/g, ' ')), 'lê o arquivo como lista de batidas (9 batidas)');
  ok(await page.$('select[data-rp-num="999"]') !== null, 'número 999 sem funcionário aparece para ligar');
  ok(/3 dia\(s\)|Gravar 3 dia/.test(await page.textContent('#rpGravar')), `3 dias para gravar (${await page.textContent('#rpGravar')})`);
  ok(/repetida/.test(tela2), 'avisa a batida repetida');
  if (process.env.FOTO) { await page.screenshot({ path: process.env.FOTO + '/rp-desktop.png', fullPage: true }); await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: process.env.FOTO + '/rp-celular.png', fullPage: true }); await page.setViewportSize({ width: 1280, height: 720 }); }

  /* ---------- 3. gravar ---------- */
  await gravarTudo();
  const a1 = await doDia('f1', D(1)), b1 = await doDia('f2', D(1)), a2 = await doDia('f1', D(2));
  const x = a1.r[0] || {};
  ok(a1.r.length === 1 && x.entrada === '07:01' && x.saidaIntervalo === '11:02' && x.retornoIntervalo === '12:58' && x.saida === '17:03', `Ana 01/10: entrada, intervalo, volta e saída (${[x.entrada, x.saidaIntervalo, x.retornoIntervalo, x.saida].join(' ')})`);
  ok(x.tipo === 'Presença normal' && x.statusAjuste === 'Não se aplica' && x.id === 'pt20261001f1', 'mesmo formato e código do dia do ponto com foto');
  ok(!!(x.relogioPonto && x.relogioPonto.entrada && x.relogioPonto.entrada.origem === 'Relógio de digital' && x.relogioPonto.entrada.arquivo === '1_attlog.dat'), 'cada horário leva a marca do relógio e do arquivo');
  ok(a1.it && a1.it.length === 1 && a1.it[0].saida === '17:03', 'chegou ao banco central');
  const y = b1.r[0] || {};
  ok(y.entrada === '06:55' && y.saida === '13:01' && !y.saidaIntervalo, 'duas batidas no dia viram entrada e saída');
  ok(a2.r.length === 1 && a2.r[0].entrada === '07:10' && !a2.r[0].saida, 'uma batida só vira só a entrada');

  /* ---------- 4. o mesmo arquivo de novo ---------- */
  await page.click('#rpLimpar');
  await escolher(arquivo('1_attlog.dat', txt));
  ok(/Gravar 0 dia/.test(await page.textContent('#rpGravar')) && await page.$eval('#rpGravar', (b) => b.disabled), 'importar o mesmo arquivo de novo não grava nada');
  ok(/Nada novo para gravar/.test(await page.textContent('.painel:has(#rpArq)')), 'mostra "Nada novo para gravar"');

  /* ---------- 5. o que o DP lançou fica ---------- */
  await page.evaluate(async (d) => {
    await gravar('diario', { id: 'dp1', data: d, funcionarioId: 'f3', setor: 'Forno', tipo: 'Presença normal', statusAjuste: 'Não se aplica', entrada: '06:30', obs: 'Lançado pelo DP' }, null);
    await new Promise((ok) => { const t = setInterval(() => { if (DATA.diario.some((x) => x.id === 'dp1')) { clearInterval(t); ok(); } }, 30); });
  }, D(5));
  await page.click('#rpLimpar');
  await escolher(arquivo('dia5.txt', `103\t${D(5)} 06:45:00\n103\t${D(5)} 15:00:00\n`));
  ok(/Diferente do ponto|Completa o dia/.test(await page.textContent('.painel:has(#rpArq)')), 'mostra que o dia já tinha lançamento');
  await gravarTudo();
  const c5 = (await doDia('f3', D(5))).r;
  ok(c5.length === 1 && c5[0].entrada === '06:30' && c5[0].saida === '15:00' && c5[0].obs === 'Lançado pelo DP', `entrada do DP mantida, saída completada, anotação intacta (${c5.map((r) => r.entrada + '-' + r.saida).join()})`);

  /* ---------- 6. CSV com cabeçalho e ligação de número ---------- */
  await page.click('#rpLimpar');
  const csv = 'Nº;Nome;Data;Hora\r\n999;CARLA;06/10/2026;07:00\r\n999;CARLA;06/10/2026;16:00\r\n101;ANA;06/10/2026;07:05\r\n';
  await escolher({ name: 'registros.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'latin1') });
  const lig = await page.evaluate(() => { const b = document.querySelector('.painel:has(#rpArq)').textContent; return /Ligado pelo nome/.test(b) || !document.querySelector('select[data-rp-num="999"]'); });
  ok(lig, 'número desconhecido com nome igual ao início do nome no JB é ligado pelo nome');
  await gravarTudo();
  const c6 = (await doDia('f3', D(6))).r[0] || {};
  ok(c6.entrada === '07:00' && c6.saida === '16:00', `CSV com cabeçalho e data dd/mm/aaaa gravado (${c6.entrada}-${c6.saida})`);
  await page.click('#rpLimpar');
  await escolher(arquivo('outro.txt', `555\t${D(7)} 07:00:00\n555\t${D(7)} 17:00:00\n`));
  await page.selectOption('select[data-rp-num="555"]', 'f2');
  await page.waitForFunction(() => /Gravar 1 dia/.test((document.getElementById('rpGravar') || {}).textContent || ''));
  await gravarTudo();
  const c7 = (await doDia('f2', D(7))).r[0] || {};
  const salvo = await page.evaluate(() => CFG.relogioPonto && CFG.relogioPonto.ids && CFG.relogioPonto.ids.f2);
  ok(c7.entrada === '07:00' && salvo === '555', `ligação escolhida grava o dia e fica salva (Bruno = nº ${salvo})`);
  ok(await page.evaluate(() => (CFG.relogioPonto.hist || []).length >= 4), 'cada importação entra em "Últimas importações"');

  /* ---------- 7. Excel ---------- */
  if (!XLSX_JS) console.log('  · pacote "xlsx" não instalado: casos de Excel pulados');
  else {
    const xl = await page.evaluate(async () => {
      await garantirBibliotecas();
      const mk = (aoa, nome) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), nome); return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xls' })); };
      const R = window.RELOGIO_PONTO_V79;
      const ler = async (u8, nome) => R.interpretar(await R.lerArquivo(new File([u8], nome)));
      // lista com data de verdade do Excel
      // data e hora como o Excel guarda (número de série com formato de data); new Date() no aoa_to_sheet
      // sai com segundos a menos no fuso de São Paulo (detalhe da biblioteca ao escrever, não do relógio)
      const serie = (d, h, m) => ({ t: 'n', v: 46295 + d + (h * 3600 + m * 60) / 86400, z: 'yyyy-mm-dd hh:mm:ss' });   // 46295 + 1 = 01/10/2026
      const l = await ler(mk([['No', 'Mchn', 'EnNo', 'Name', 'Mode', 'DateTime'], [1, 1, 103, 'CARLA', 0, serie(8, 7, 4)], [2, 1, 103, 'CARLA', 0, serie(8, 17, 2)]], 'Registros'), 'AGLog.xls');
      // grade do mês: 26/10 a 04/11, horas coladas, com aba de resumo antes
      const dias = [26, 27, 28, 29, 30, 31, 1, 2, 3, 4];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Attendance Statistic'], ['ID', 'Name', 'Work'], [101, 'Ana', '08:00']]), 'Estatística');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Attendance Record Report'], ['Att. Time:', '2026-10-26 ~ 2026-11-04'], dias, ['ID:', 101, 'Name:', 'Ana'], ['07:0011:0013:0017:00', '', '', '', '', '', '06:58\n17:05']]), 'Registro');
      const g = await ler(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })), 'relatorio.xlsx');
      return { l: l && { f: l.formato, b: l.bat }, g: g && { f: g.formato, b: g.bat, mes: g.mes } };
    });
    ok(xl.l && xl.l.f === 'lista de batidas' && xl.l.b.length === 2 && xl.l.b[0].num === '103' && xl.l.b[0].data === D(8) && xl.l.b[0].hora === '07:04' && xl.l.b[1].hora === '17:02',
      `Excel em lista: pega o "EnNo" (não o "No"), data e hora do Excel sem fuso (${xl.l && xl.l.b.map((b) => b.num + ' ' + b.data + ' ' + b.hora).join(', ')})`);
    const g = xl.g || { b: [] };
    const d26 = g.b.filter((b) => b.data === '2026-10-26').map((b) => b.hora).join(' '), d01 = g.b.filter((b) => b.data === '2026-11-01').map((b) => b.hora).join(' ');
    ok(g.f === 'grade do mês' && d26 === '07:00 11:00 13:00 17:00' && d01 === '06:58 17:05' && g.b.every((b) => b.num === '101'),
      `Excel em grade: ignora a aba de resumo, separa horas coladas e vira o mês no dia 1 (26/10: ${d26} · 01/11: ${d01})`);
  }

  ok(semErros(erros).length === 0, 'sem erros de JavaScript' + (semErros(erros).length ? ': ' + semErros(erros).join(' | ') : ''));
} catch (e) {
  falhas++;
  console.log('  ✘ o teste parou: ' + (e && e.stack || e));
} finally {
  await browser.close();
  http.close();
}
console.log(falhas ? `\nRelógio de digital: ${falhas} falha(s).` : '\nRelógio de digital: tudo certo.');
process.exit(falhas ? 1 : 0);
