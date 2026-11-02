/*
 * Harness de capturas de tela da interface (SOMENTE DESENVOLVIMENTO).
 *
 * Serve out/renderer (gerado por `npx electron-vite build`), injeta o
 * window.api300 falso de fake-api.js e percorre os estados visuais do 300,
 * salvando PNGs em tests/e2e/ui-harness/screenshots/.
 *
 * Uso (na raiz do projeto):
 *   npx electron-vite build
 *   npx tsx tests/e2e/ui-harness/shoot.mjs
 *
 * Também confere: sem erros de console/CSP, quadros do microfone com 512
 * amostras chegando via sendAudio, Esc nega a confirmação.
 */
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSettings } from '../../../src/core/settings.ts';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../out/renderer');
const shots = join(here, 'screenshots');
mkdirSync(shots, { recursive: true });
if (!existsSync(join(root, 'index.html'))) {
  console.error('out/renderer não existe. Rode antes: npx electron-vite build');
  process.exit(1);
}

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require('playwright-core');
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  const file = resolve(root, rel || 'index.html');
  if (!(file === root || file.startsWith(root + sep)) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end('não encontrado');
    return;
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await pw.chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const problems = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function openPage(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: 'dark' });
  await ctx.grantPermissions(['microphone'], { origin: base });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${viewport.width}] console.${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${viewport.width}] pageerror: ${e.message}`));
  await page.addInitScript((d) => {
    window.__HARNESS_DATA__ = d;
  }, { settings: defaultSettings() });
  await page.addInitScript({ path: join(here, 'fake-api.js') });
  await page.goto(base);
  await page.waitForSelector('.layout');
  await wait(600);
  return { ctx, page };
}

const emit = (page, e) => page.evaluate((ev) => window.__harness.emit(ev), e);
const shot = async (page, name) => {
  await page.screenshot({ path: join(shots, name) });
  console.log('captura:', name);
};
const iso = (ms = 0) => new Date(Date.now() + ms).toISOString();

/* ------------------------------------------------------------------ */
{
  const { ctx, page } = await openPage({ width: 1440, height: 900 });

  // conversa existente
  await page.click('.chat-title-btn');
  await page.click('.conv-open >> nth=0');
  await page.waitForSelector('.msg-assistant');
  await wait(500);
  await shot(page, '01-idle.png');

  // PENSANDO: envia pelo teclado
  await page.fill('.composer-input', 'Qual a previsão do tempo para amanhã em São Paulo?');
  await page.press('.composer-input', 'Enter');
  await wait(1200);
  await shot(page, '03-thinking.png');

  // EXECUTANDO: ferramenta em andamento
  await emit(page, { type: 'assistant_delta', conversationId: 'c1', text: 'Vou pesquisar a previsão atualizada.' });
  await emit(page, { type: 'tool_start', callId: 'k1', name: 'web_search', title: 'Pesquisar na internet', description: 'Pesquisando "previsão do tempo São Paulo amanhã"', risk: 'read' });
  await emit(page, { type: 'state', state: 'EXECUTING', detail: 'Pesquisando na internet…' });
  await wait(1200);
  await shot(page, '05-executing.png');

  // FALANDO: resposta chegando e voz tocando
  await emit(page, { type: 'tool_end', callId: 'k1', name: 'web_search', ok: true, summary: '6 resultados (climatempo, inmet…)' });
  await emit(page, { type: 'state', state: 'SPEAKING' });
  await emit(page, { type: 'assistant_delta', conversationId: 'c1', text: '\n\nAmanhã em **São Paulo**: máxima de **27 °C**, mínima de 18 °C e ' });
  await emit(page, { type: 'assistant_delta', conversationId: 'c1', text: 'chance de chuva de 60% à tarde. Leve guarda-chuva!' });
  await page.evaluate(() => {
    window.__harness.levels('speech_level', true);
    window.__harness.audioOut(3, 196);
  });
  await wait(1300);
  await shot(page, '04-speaking.png');
  await page.evaluate(() => window.__harness.levels('speech_level', false));
  await emit(page, { type: 'assistant_done', conversationId: 'c1', text: 'Amanhã em São Paulo…', stopReason: 'end_turn' });
  await emit(page, { type: 'state', state: 'IDLE' });
  await page.keyboard.press('Escape'); // Esc para a fala

  // OUVINDO: botão do microfone (microfone falso do Chromium)
  await page.click('.mic-btn');
  await page.waitForSelector('.mic-indicator.is-live', { timeout: 8000 });
  await page.evaluate(() => window.__harness.levels('mic_level', true));
  await emit(page, { type: 'transcript', text: 'Me lembra de ligar para o contador amanhã às', final: false });
  await wait(1500);
  await shot(page, '02-listening.png');
  const stats = await page.evaluate(() => window.__harness.stats);
  console.log('quadros do microfone:', stats);
  if (stats.frames < 5) problems.push(`poucos quadros de microfone recebidos (${stats.frames})`);
  if (stats.badFrames > 0) problems.push(`${stats.badFrames} quadros com tamanho errado`);
  await page.evaluate(() => window.__harness.levels('mic_level', false));
  await page.click('.mic-btn'); // para de ouvir
  await wait(600);
  const micStill = await page.$('.mic-indicator.is-live');
  if (micStill) problems.push('o indicador do microfone continuou aceso depois de parar');

  // ERRO
  await emit(page, { type: 'error', message: 'Não consegui falar com o Claude: a chave de API foi recusada.' });
  await emit(page, { type: 'state', state: 'ERROR', detail: 'Não consegui falar com o Claude: a chave de API foi recusada.' });
  await wait(1100);
  await shot(page, '06-error.png');
  await emit(page, { type: 'state', state: 'IDLE' });
  await page.evaluate(() => document.querySelectorAll('.toast-close').forEach((b) => b.click()));

  // CONFIRMAÇÃO (risco de sistema, conteúdo externo)
  await emit(page, {
    type: 'confirmation_request',
    request: {
      id: 'cf1',
      tool: 'shell_run',
      title: 'Executar comando no PowerShell',
      description: 'Vou executar: Remove-Item "C:\\Users\\Usuario\\Downloads\\*.tmp" para limpar arquivos temporários da pasta Downloads.',
      risk: 'system',
      input: { command: 'Remove-Item "C:\\Users\\Usuario\\Downloads\\*.tmp"', shell: 'powershell', '<script>': 'alert(1)' },
      actor: 'agent',
      tainted: true,
      createdAt: iso(),
      expiresAt: iso(120000),
    },
  });
  await emit(page, {
    type: 'confirmation_request',
    request: { id: 'cf2', tool: 'file_write', title: 'Salvar documento', description: 'Criar "Relatório de outubro.docx" em Documentos.', risk: 'write', input: { path: 'C:\\Users\\Usuario\\Documents\\Relatório de outubro.docx' }, actor: 'agent', tainted: false, createdAt: iso(), expiresAt: iso(90000) },
  });
  await wait(900);
  await page.click('.confirm-details summary');
  await wait(300);
  await shot(page, '07-confirm-system.png');
  const focused = await page.evaluate(() => document.activeElement?.textContent);
  console.log('foco inicial na confirmação:', focused);
  await page.keyboard.press('Escape');
  await wait(700);
  const denied = await page.evaluate(() => window.__harness.log.filter((l) => l.channel === 'confirm:respond'));
  console.log('respostas de confirmação:', JSON.stringify(denied));
  if (!denied.length || denied[0].arg.response.approved !== false) problems.push('Esc não negou a confirmação');
  await shot(page, '07b-confirm-write.png');
  await page.keyboard.press('Escape');
  await wait(400);

  // CONFIGURAÇÕES
  await page.click('[aria-label="Abrir configurações"]');
  await page.waitForSelector('.drawer');
  await wait(500);
  await shot(page, '08-settings-brain.png');
  for (const [label, file] of [
    ['Chaves', '08b-settings-keys.png'],
    ['Voz', '08c-settings-voice.png'],
    ['Permissões', '08d-settings-permissions.png'],
    ['Integrações', '08e-settings-integrations.png'],
    ['Memória', '08f-settings-memory.png'],
    ['Auditoria', '08g-settings-audit.png'],
    ['Sobre', '08h-settings-about.png'],
  ]) {
    await page.click(`.drawer-nav-item:has-text("${label}")`);
    await wait(450);
    await shot(page, file);
  }
  await page.keyboard.press('Escape');
  await wait(300);
  if (await page.$('.drawer')) problems.push('Esc não fechou as configurações');
  await ctx.close();
}

/* ------------------------------------------------------------------ */
{
  // tela menor (mínimo suportado)
  const { ctx, page } = await openPage({ width: 1024, height: 700 });
  await wait(400);
  await shot(page, '09-small-empty.png');
  await page.click('.chat-title-btn');
  await wait(250);
  await shot(page, '09b-small-conversations.png');
  await page.click('.conv-open >> nth=0');
  await page.waitForSelector('.msg-assistant');
  await emit(page, { type: 'state', state: 'LISTENING' });
  await page.evaluate(() => window.__harness.levels('mic_level', true));
  await wait(1000);
  await shot(page, '09c-small-listening.png');
  await page.evaluate(() => window.__harness.levels('mic_level', false));
  await emit(page, { type: 'state', state: 'IDLE' });
  await page.click('[aria-label="Abrir configurações"]');
  await page.waitForSelector('.drawer');
  await page.click('.drawer-nav-item:has-text("Chaves")');
  await wait(400);
  await shot(page, '09d-small-settings.png');
  await page.keyboard.press('Escape');
  // horizontal overflow?
  const overflow = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight }));
  if (overflow.w > overflow.vw || overflow.h > overflow.vh) problems.push(`conteúdo maior que a janela em 1024x700: ${JSON.stringify(overflow)}`);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
{
  // "reduzir movimento" do sistema: orbe estático, sem erros
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[reduce] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[reduce] console.error: ${m.text()}`);
  });
  await page.addInitScript((d) => {
    window.__HARNESS_DATA__ = d;
  }, { settings: defaultSettings() });
  await page.addInitScript({ path: join(here, 'fake-api.js') });
  await page.goto(base);
  await page.waitForSelector('.layout');
  await emit(page, { type: 'state', state: 'THINKING' });
  await wait(900);
  await shot(page, '10-reduced-motion-thinking.png');
  await ctx.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.log('\nPROBLEMAS:\n' + problems.join('\n'));
  process.exitCode = 1;
} else {
  console.log('\nOK: nenhuma falha de console, CSP ou comportamento.');
}
