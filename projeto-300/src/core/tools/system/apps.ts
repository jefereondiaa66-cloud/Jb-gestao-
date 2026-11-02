/**
 * Abrir programas pelo nome (open_app) e endereços no navegador (open_url).
 * No Windows: mapa curado de apps comuns (Word, Excel, Calculadora,
 * Configurações...), depois atalhos do Menu Iniciar (.lnk) e, por fim, os apps
 * da Microsoft Store (Get-StartApps). Tudo é lançado pelo Start-Process com
 * valores entre aspas simples escapadas (nada de código montado com texto livre).
 */
import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import nodePath from 'node:path';
import { z } from 'zod';
import type { EngineServices, ToolDefinition } from '../../types';
import { resolveUserPath } from '../files/guard';
import { failure } from '../files/tools-read';
import { errorMessage, errorOutput, fold, preview, textOutput } from '../files/util';
import { assessUrl, urlRisk } from '../web/url-risk';
import { buildJsonScript, decodeProcessOutput, powershellArgs, powershellPath, psQuote, PS_PRELUDE } from './powershell';
import { runProcess } from './process';

/* ======================================================================
 * Mapa de aplicativos do Windows
 * ==================================================================== */
export interface AppLaunch {
  kind: 'exe' | 'uri' | 'path' | 'appsfolder' | 'lnk';
  target: string;
}

export interface AppEntry {
  id: string;
  label: string;
  names: string[];
  launch: AppLaunch[];
  /** Terminais/shells: não aceitam arquivo/argumentos (evita contornar o run_command). */
  shell?: boolean;
}

export const WINDOWS_APPS: AppEntry[] = [
  { id: 'notepad', label: 'Bloco de Notas', names: ['notepad', 'bloco de notas', 'bloco de anotacoes', 'notas'], launch: [{ kind: 'exe', target: 'notepad.exe' }] },
  { id: 'calc', label: 'Calculadora', names: ['calculadora', 'calc', 'calculator'], launch: [{ kind: 'exe', target: 'calc.exe' }] },
  { id: 'explorer', label: 'Explorador de Arquivos', names: ['explorador', 'explorador de arquivos', 'explorer', 'arquivos', 'meu computador', 'este computador', 'windows explorer'], launch: [{ kind: 'exe', target: 'explorer.exe' }] },
  { id: 'edge', label: 'Microsoft Edge', names: ['edge', 'microsoft edge', 'navegador', 'navegador edge'], launch: [{ kind: 'exe', target: 'msedge.exe' }, { kind: 'uri', target: 'microsoft-edge:' }] },
  { id: 'chrome', label: 'Google Chrome', names: ['chrome', 'google chrome'], launch: [{ kind: 'exe', target: 'chrome.exe' }] },
  { id: 'firefox', label: 'Mozilla Firefox', names: ['firefox', 'mozilla firefox'], launch: [{ kind: 'exe', target: 'firefox.exe' }] },
  { id: 'word', label: 'Microsoft Word', names: ['word', 'microsoft word', 'winword'], launch: [{ kind: 'exe', target: 'winword.exe' }] },
  { id: 'excel', label: 'Microsoft Excel', names: ['excel', 'microsoft excel'], launch: [{ kind: 'exe', target: 'excel.exe' }] },
  { id: 'powerpoint', label: 'Microsoft PowerPoint', names: ['powerpoint', 'power point', 'microsoft powerpoint', 'ppt'], launch: [{ kind: 'exe', target: 'powerpnt.exe' }] },
  { id: 'outlook', label: 'Outlook', names: ['outlook', 'microsoft outlook', 'email', 'e-mail'], launch: [{ kind: 'exe', target: 'outlook.exe' }, { kind: 'uri', target: 'outlookmail:' }] },
  {
    id: 'vscode',
    label: 'Visual Studio Code',
    names: ['vscode', 'vs code', 'visual studio code', 'code'],
    launch: [
      { kind: 'path', target: '%LOCALAPPDATA%\\Programs\\Microsoft VS Code\\Code.exe' },
      { kind: 'path', target: '%ProgramFiles%\\Microsoft VS Code\\Code.exe' },
    ],
  },
  { id: 'spotify', label: 'Spotify', names: ['spotify'], launch: [{ kind: 'uri', target: 'spotify:' }] },
  { id: 'settings', label: 'Configurações do Windows', names: ['configuracoes', 'configuracoes do windows', 'configuracao', 'ajustes', 'settings', 'definicoes'], launch: [{ kind: 'uri', target: 'ms-settings:' }] },
  {
    id: 'terminal',
    label: 'Terminal',
    names: ['terminal', 'windows terminal', 'prompt', 'prompt de comando', 'cmd', 'powershell', 'console'],
    launch: [{ kind: 'exe', target: 'wt.exe' }, { kind: 'exe', target: 'powershell.exe' }],
    shell: true,
  },
  { id: 'paint', label: 'Paint', names: ['paint', 'mspaint'], launch: [{ kind: 'exe', target: 'mspaint.exe' }] },
  { id: 'taskmgr', label: 'Gerenciador de Tarefas', names: ['gerenciador de tarefas', 'task manager', 'taskmgr'], launch: [{ kind: 'exe', target: 'taskmgr.exe' }] },
  { id: 'control', label: 'Painel de Controle', names: ['painel de controle', 'control panel'], launch: [{ kind: 'exe', target: 'control.exe' }] },
  { id: 'whatsapp', label: 'WhatsApp', names: ['whatsapp', 'zap', 'whats'], launch: [{ kind: 'uri', target: 'whatsapp:' }] },
  { id: 'teams', label: 'Microsoft Teams', names: ['teams', 'microsoft teams'], launch: [{ kind: 'uri', target: 'msteams:' }] },
  { id: 'camera', label: 'Câmera', names: ['camera', 'app da camera'], launch: [{ kind: 'uri', target: 'microsoft.windows.camera:' }] },
  { id: 'clock', label: 'Relógio', names: ['relogio', 'alarme', 'alarmes', 'cronometro', 'timer'], launch: [{ kind: 'uri', target: 'ms-clock:' }] },
  { id: 'calendar', label: 'Calendário', names: ['calendario', 'agenda'], launch: [{ kind: 'uri', target: 'outlookcal:' }] },
  { id: 'photos', label: 'Fotos', names: ['fotos', 'photos'], launch: [{ kind: 'uri', target: 'ms-photos:' }] },
  { id: 'store', label: 'Microsoft Store', names: ['loja', 'microsoft store', 'store', 'loja da microsoft'], launch: [{ kind: 'uri', target: 'ms-windows-store:' }] },
  { id: 'snip', label: 'Ferramenta de Captura', names: ['ferramenta de captura', 'recorte', 'captura de tela', 'snipping tool'], launch: [{ kind: 'uri', target: 'ms-screenclip:' }] },
];

/** Normaliza o nome pedido ("o programa Word" -> "word"). */
export function normalizeAppName(name: string): string {
  let n = fold(name).replace(/[.,!?;:"']+/g, ' ').replace(/\s+/g, ' ').trim();
  n = n.replace(/^(abrir|abre|abra|inicie|iniciar)\s+/, '');
  n = n.replace(/^(o|a|os|as)\s+/, '');
  n = n.replace(/^(aplicativo|app|programa|software)\s+(do|da|de|o|a)?\s*/, '');
  n = n.replace(/\.exe$/, '');
  return n.trim();
}

export function findCuratedApp(name: string, apps: AppEntry[] = WINDOWS_APPS): AppEntry | undefined {
  const n = normalizeAppName(name);
  if (!n) return undefined;
  return apps.find((a) => a.names.includes(n) || fold(a.label) === n);
}

/** Pontuação de um atalho para o nome pedido (0 = não serve). */
export function scoreShortcut(shortcutName: string, wanted: string): number {
  const s = fold(shortcutName.replace(/\.(lnk|appref-ms)$/i, ''));
  const w = normalizeAppName(wanted);
  if (!w || /desinstal|uninstall|remove|leia-me|readme|ajuda|help|website|site/.test(s)) return 0;
  if (s === w) return 100;
  if (s.startsWith(w + ' ') || s.endsWith(' ' + w)) return 80;
  if (s.startsWith(w)) return 70;
  const words = s.split(/[\s\-_()]+/);
  if (words.includes(w)) return 60;
  if (w.length >= 4 && s.includes(w)) return 40;
  return 0;
}

/** Expande %VARIAVEIS% do Windows. */
export function expandWinEnv(p: string, env: NodeJS.ProcessEnv = process.env): string {
  return p.replace(/%([^%]+)%/g, (m, name: string) => {
    const key = Object.keys(env).find((k) => k.toLowerCase() === name.toLowerCase());
    return key && env[key] ? env[key]! : m;
  });
}

/** Script PowerShell que tenta cada forma de abrir até uma dar certo. */
export function buildLaunchScript(targets: AppLaunch[], file?: string): string {
  const items = targets.map((t) => {
    if (t.kind === 'appsfolder') return `@{ f = 'explorer.exe'; a = ${psQuote('shell:AppsFolder\\' + t.target)} }`;
    const arg = file && (t.kind === 'exe' || t.kind === 'path' || t.kind === 'lnk') ? psQuote(`"${file}"`) : '$null';
    return `@{ f = ${psQuote(t.target)}; a = ${arg} }`;
  });
  return [
    PS_PRELUDE,
    `$__targets = @(${items.join(', ')})`,
    "$__last = 'nenhuma forma de abrir funcionou'",
    'foreach ($t in $__targets) {',
    '  try {',
    '    if ($null -ne $t.a) { Start-Process -FilePath $t.f -ArgumentList $t.a -ErrorAction Stop } else { Start-Process -FilePath $t.f -ErrorAction Stop }',
    "    $__out.Write('OK:' + $t.f); exit 0",
    '  } catch { $__last = $_.Exception.Message }',
    '}',
    "$__out.Write('ERRO:' + $__last); exit 1",
  ].join('\n');
}

async function walkShortcuts(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth < 0 || out.length > 3000) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = nodePath.join(dir, e.name);
    if (e.isDirectory()) await walkShortcuts(full, depth - 1, out);
    else if (/\.(lnk|appref-ms)$/i.test(e.name)) out.push(full);
  }
}

/** Atalhos do Menu Iniciar (do usuário e de todos os usuários). */
export async function findStartMenuShortcut(name: string, env: NodeJS.ProcessEnv = process.env): Promise<string | undefined> {
  const dirs = [
    env.APPDATA ? nodePath.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    env.ProgramData || env.PROGRAMDATA ? nodePath.join((env.ProgramData || env.PROGRAMDATA)!, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
  ].filter(Boolean);
  const all: string[] = [];
  for (const d of dirs) await walkShortcuts(d, 4, all);
  let best: { p: string; s: number } | undefined;
  for (const p of all) {
    const s = scoreShortcut(nodePath.basename(p), name);
    if (s > 0 && (!best || s > best.s || (s === best.s && p.length < best.p.length))) best = { p, s };
  }
  return best?.p;
}

/** Apps da Microsoft Store/instalados (Get-StartApps) com o melhor nome. */
async function findStartApp(name: string, signal: AbortSignal): Promise<{ name: string; appId: string } | undefined> {
  const script = buildJsonScript('$__result = @(Get-StartApps | Select-Object Name, AppID)');
  const r = await runProcess(powershellPath(), powershellArgs(script), { timeoutMs: 20_000, signal });
  if (r.code !== 0) return undefined;
  let list: { Name?: string; AppID?: string }[] = [];
  try {
    const parsed = JSON.parse(decodeProcessOutput(r.stdout)) as unknown;
    list = Array.isArray(parsed) ? (parsed as typeof list) : parsed ? [parsed as (typeof list)[number]] : [];
  } catch {
    return undefined;
  }
  let best: { name: string; appId: string; s: number } | undefined;
  for (const a of list) {
    if (!a?.Name || !a.AppID) continue;
    const s = scoreShortcut(a.Name, name);
    if (s > 0 && (!best || s > best.s)) best = { name: a.Name, appId: a.AppID, s };
  }
  return best ? { name: best.name, appId: best.appId } : undefined;
}

async function launchWindows(targets: AppLaunch[], file: string | undefined, signal: AbortSignal): Promise<{ ok: boolean; detail: string }> {
  const r = await runProcess(powershellPath(), powershellArgs(buildLaunchScript(targets, file)), { timeoutMs: 30_000, signal });
  const out = decodeProcessOutput(r.stdout).trim();
  if (r.code === 0 && out.startsWith('OK:')) return { ok: true, detail: out.slice(3) };
  return { ok: false, detail: out.startsWith('ERRO:') ? out.slice(5) : out || r.error || 'falha ao abrir' };
}

/* ---------------- Linux: arquivos .desktop ---------------- */

export function parseDesktopEntry(text: string): { name: string; names: string[]; hidden: boolean } {
  const names: string[] = [];
  let name = '';
  let hidden = false;
  let inMain = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('[')) {
      inMain = line === '[Desktop Entry]';
      continue;
    }
    if (!inMain) continue;
    const m = /^([A-Za-z]+)(\[[^\]]+\])?\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    const [, key, locale, value] = m;
    if (key === 'Name' && !locale) name = value!;
    if ((key === 'Name' || key === 'GenericName' || key === 'Keywords') && value) names.push(...value!.split(';').filter(Boolean));
    if ((key === 'NoDisplay' || key === 'Hidden') && value === 'true') hidden = true;
  }
  return { name, names, hidden };
}

async function findDesktopEntry(name: string, home: string): Promise<{ id: string; label: string } | undefined> {
  const dirs = ['/usr/share/applications', '/usr/local/share/applications', nodePath.join(home, '.local', 'share', 'applications'), '/var/lib/flatpak/exports/share/applications'];
  let best: { id: string; label: string; s: number } | undefined;
  for (const d of dirs) {
    let files: string[] = [];
    try {
      files = (await readdir(d)).filter((f) => f.endsWith('.desktop'));
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const info = parseDesktopEntry(await readFile(nodePath.join(d, f), 'utf8'));
        if (info.hidden) continue;
        const s = Math.max(0, ...info.names.map((n) => scoreShortcut(n, name)));
        if (s > 0 && (!best || s > best.s)) best = { id: f, label: info.name || f, s };
      } catch {
        /* ignora arquivo ilegível */
      }
    }
  }
  return best ? { id: best.id, label: best.label } : undefined;
}

/* ======================================================================
 * open_app
 * ==================================================================== */
const appSchema = z.object({
  nome: z.string().min(1).max(120).describe('Nome do programa: "Word", "Excel", "Bloco de Notas", "Calculadora", "Configurações", "Spotify", "VS Code"...'),
  arquivo: z.string().max(2000).optional().describe('Opcional: arquivo (dentro das pastas liberadas) para abrir nesse programa.'),
});
type AppInput = z.infer<typeof appSchema>;

export function openAppTool(): ToolDefinition<AppInput> {
  return {
    name: 'open_app',
    title: 'Abrir programa',
    description:
      'Abre um programa do computador pelo nome (Word, Excel, PowerPoint, Outlook, Edge, Chrome, Bloco de Notas, Calculadora, Explorador, ' +
      'Configurações, Spotify, VS Code, Terminal...), procurando também no Menu Iniciar. Opcionalmente abre um arquivo nele. Pede confirmação.',
    inputSchema: appSchema,
    risk: 'system',
    describe: (i) => {
      const entry = findCuratedApp(i.nome);
      return `Abrir o programa ${entry?.label ?? `"${preview(i.nome, 60)}"`}${i.arquivo ? ` com o arquivo ${preview(i.arquivo, 120)}` : ''}`;
    },
    async execute(input, ctx) {
      const services: EngineServices = ctx.services;
      const os = services.platform.os;
      let file: string | undefined;
      const entry = os === 'windows' ? findCuratedApp(input.nome) : undefined;
      if (input.arquivo) {
        if (entry?.shell) return errorOutput('Terminais não abrem arquivos por aqui. Para executar algo, use run_command (o dono confirma).');
        try {
          file = resolveUserPath(services, input.arquivo, { mustExist: true });
          await stat(file);
        } catch (err) {
          return failure('Não posso usar esse arquivo', err);
        }
      }
      try {
        if (os === 'windows') {
          const tried: string[] = [];
          if (entry) {
            const targets = entry.launch
              .map((t) => (t.kind === 'path' ? { ...t, target: expandWinEnv(t.target) } : t))
              .filter((t) => t.kind !== 'path' || existsSync(t.target));
            if (targets.length) {
              const r = await launchWindows(targets, file, ctx.signal);
              if (r.ok) return textOutput(`Abri o ${entry.label}${file ? ` com ${file}` : ''}.`, `Aberto: ${entry.label}`);
              tried.push(r.detail);
            }
          }
          const lnk = await findStartMenuShortcut(entry?.label ?? input.nome);
          if (lnk) {
            const r = await launchWindows([{ kind: 'lnk', target: lnk }], file, ctx.signal);
            const label = nodePath.win32.basename(lnk).replace(/\.(lnk|appref-ms)$/i, '');
            if (r.ok) return textOutput(`Abri o ${label} (atalho do Menu Iniciar)${file ? ` com ${file}` : ''}.`, `Aberto: ${label}`);
            tried.push(r.detail);
          }
          if (!file) {
            const app = await findStartApp(entry?.label ?? input.nome, ctx.signal);
            if (app) {
              const r = await launchWindows([{ kind: 'appsfolder', target: app.appId }], undefined, ctx.signal);
              if (r.ok) return textOutput(`Abri o ${app.name}.`, `Aberto: ${app.name}`);
              tried.push(r.detail);
            }
          }
          return errorOutput(`Não encontrei ou não consegui abrir o programa "${input.nome}".${tried.length ? ` Detalhe: ${tried[tried.length - 1]}` : ' Ele está instalado?'}`);
        }
        if (os === 'macos') {
          const r = await runProcess('/usr/bin/open', ['-a', input.nome, ...(file ? [file] : [])], { timeoutMs: 20_000, signal: ctx.signal });
          if (r.code === 0) return textOutput(`Abri o ${input.nome}.`, `Aberto: ${input.nome}`);
          return errorOutput(`Não consegui abrir o programa "${input.nome}": ${decodeProcessOutput(r.stderr).trim() || r.error || 'não encontrado'}`);
        }
        const de = await findDesktopEntry(input.nome, services.platform.paths.home);
        if (!de) return errorOutput(`Não encontrei o programa "${input.nome}" entre os aplicativos instalados.`);
        const r = await runProcess('gtk-launch', [de.id, ...(file ? [file] : [])], { timeoutMs: 20_000, signal: ctx.signal });
        if (r.code === 0) return textOutput(`Abri o ${de.label}.`, `Aberto: ${de.label}`);
        return errorOutput(`Não consegui abrir "${de.label}": ${decodeProcessOutput(r.stderr).trim() || r.error || 'falha ao iniciar'}`);
      } catch (err) {
        if (ctx.signal.aborted) return errorOutput('Cancelado.');
        return errorOutput(`Não consegui abrir o programa: ${errorMessage(err)}`);
      }
    },
  };
}

/* ======================================================================
 * open_url
 * ==================================================================== */
const urlSchema = z.object({
  url: z.string().min(8).max(4000).describe('Endereço http(s) completo para abrir no navegador padrão do dono.'),
});

/** Só http/https, sem usuário/senha embutidos. */
export function validateOpenUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error('endereço inválido.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('só abro endereços http e https.');
  if (u.username || u.password) throw new Error('a URL não pode conter usuário/senha embutidos.');
  if (!u.hostname) throw new Error('URL sem endereço.');
  return u;
}

export function openUrlTool(): ToolDefinition<z.infer<typeof urlSchema>> {
  return {
    name: 'open_url',
    title: 'Abrir site',
    description:
      'Abre um endereço http(s) no navegador padrão do dono (para ele ver). Para ler o conteúdo de uma página use web_fetch. ' +
      'Endereços da rede local ou com dados pessoais na URL pedem confirmação.',
    inputSchema: urlSchema,
    risk: (i) => urlRisk(i.url),
    describe: (i) => {
      const a = assessUrl(i.url);
      return `Abrir no navegador: ${preview(i.url, 180)}${a.reasons.length ? ` — atenção: ${a.reasons.join('; ')}` : ''}`;
    },
    async execute(input, ctx) {
      try {
        const u = validateOpenUrl(input.url);
        await ctx.services.platform.openExternal(u.href);
        return textOutput(`Abri ${u.href} no navegador.`, `Site aberto: ${u.hostname}`);
      } catch (err) {
        return errorOutput(`Não consegui abrir o endereço: ${errorMessage(err)}`);
      }
    },
  };
}
