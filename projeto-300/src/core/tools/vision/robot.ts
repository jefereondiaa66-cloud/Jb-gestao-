/**
 * Mouse e teclado com robotjs: validação dos passos, tradução de teclas
 * (nomes em português -> robotjs), conversão de coordenadas da captura de tela
 * para a tela real e execução passo a passo, cancelável entre os passos.
 */
import { createRequire } from 'node:module';
import { z } from 'zod';
import { fold, sleep } from '../files/util';

/** Parte do robotjs que usamos (permite dublê nos testes). */
export interface RobotLike {
  moveMouse(x: number, y: number): void;
  mouseClick(button?: string, double?: boolean): void;
  scrollMouse(x: number, y: number): void;
  keyTap(key: string, modifier?: string | string[]): void;
  typeString(text: string): void;
  unicodeTap?(value: number): void;
  getScreenSize(): { width: number; height: number };
  getDisplays?(): { x: number; y: number; width: number; height: number }[];
  setMouseDelay?(ms: number): void;
  setKeyboardDelay?(ms: number): void;
}

let cached: { robot?: RobotLike; error?: string } | undefined;

/** Carrega o robotjs (módulo nativo) uma vez; devolve o erro em pt-BR se não der. */
export function loadRobot(): { robot?: RobotLike; error?: string } {
  if (cached) return cached;
  if (process.platform === 'linux' && !process.env.DISPLAY) {
    cached = { error: 'sem tela gráfica (X11) disponível para controlar o mouse e o teclado.' };
    return cached;
  }
  try {
    const req = createRequire(import.meta.url);
    const mod = req('robotjs') as RobotLike & { default?: RobotLike };
    const robot = (typeof mod.moveMouse === 'function' ? mod : mod.default) as RobotLike;
    if (!robot || typeof robot.moveMouse !== 'function') throw new Error('módulo inválido');
    cached = { robot };
  } catch (e) {
    cached = { error: `não consegui carregar o controle de mouse/teclado (robotjs): ${(e as Error).message}` };
  }
  return cached;
}

/** Só para testes: troca o robô carregado. */
export function setRobotForTests(robot: RobotLike | undefined, error?: string): void {
  cached = robot ? { robot } : error ? { error } : undefined;
}

/* ---------------- teclas ---------------- */

const KEY_ALIASES: Record<string, string> = {
  enter: 'enter', entrar: 'enter', return: 'enter', confirmar: 'enter',
  tab: 'tab', tabulacao: 'tab',
  esc: 'escape', escape: 'escape', sair: 'escape',
  espaco: 'space', space: 'space', 'barra de espaco': 'space',
  backspace: 'backspace', apagar: 'backspace', voltar: 'backspace',
  delete: 'delete', del: 'delete', excluir: 'delete', deletar: 'delete',
  cima: 'up', 'seta para cima': 'up', 'seta cima': 'up', up: 'up',
  baixo: 'down', 'seta para baixo': 'down', 'seta baixo': 'down', down: 'down',
  esquerda: 'left', 'seta para esquerda': 'left', 'seta esquerda': 'left', left: 'left',
  direita: 'right', 'seta para direita': 'right', 'seta direita': 'right', right: 'right',
  home: 'home', inicio: 'home', end: 'end', fim: 'end',
  pageup: 'pageup', 'page up': 'pageup', 'pagina acima': 'pageup',
  pagedown: 'pagedown', 'page down': 'pagedown', 'pagina abaixo': 'pagedown',
  printscreen: 'printscreen', print: 'printscreen', 'print screen': 'printscreen',
  insert: 'insert', ins: 'insert', capslock: 'capslock', 'caps lock': 'capslock', menu: 'menu',
  win: 'command', windows: 'command', 'tecla windows': 'command', super: 'command', command: 'command', cmd: 'command',
  'volume mais': 'audio_vol_up', 'aumentar volume': 'audio_vol_up', 'volume menos': 'audio_vol_down', 'diminuir volume': 'audio_vol_down',
  mudo: 'audio_mute', mute: 'audio_mute', 'play/pausa': 'audio_play', play: 'audio_play', pausa: 'audio_pause', pausar: 'audio_pause',
  'proxima faixa': 'audio_next', proxima: 'audio_next', 'faixa anterior': 'audio_prev', anterior: 'audio_prev',
};

/** Nome de tecla (pt-BR ou inglês) -> nome do robotjs; null se desconhecida. */
export function mapKey(name: string): string | null {
  const raw = String(name ?? '').trim();
  if (!raw) return null;
  if ([...raw].length === 1) {
    const ch = raw.toLowerCase();
    return /^[a-z0-9`\-=[\]\\;',./]$/.test(ch) ? ch : null;
  }
  const n = fold(raw).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(n)) return n;
  if (/^numpad [0-9]$/.test(n)) return n.replace(' ', '_');
  return KEY_ALIASES[n] ?? null;
}

const MODIFIERS: Record<string, string> = { ctrl: 'control', control: 'control', alt: 'alt', shift: 'shift', win: 'command', windows: 'command', cmd: 'command', command: 'command' };

export function mapModifiers(mods: string[] | undefined): string[] {
  return [...new Set((mods ?? []).map((m) => MODIFIERS[fold(m)]).filter((m): m is string => !!m))];
}

/* ---------------- passos ---------------- */

export const STEP_ACTIONS = ['mover', 'clicar', 'clique_duplo', 'clique_direito', 'rolar', 'digitar', 'tecla'] as const;

export const stepSchema = z
  .object({
    acao: z.enum(STEP_ACTIONS).describe('mover | clicar | clique_duplo | clique_direito | rolar | digitar | tecla'),
    x: z.number().int().min(0).max(20000).optional().describe('Coordenada X na ÚLTIMA captura de tela (pixels da imagem).'),
    y: z.number().int().min(0).max(20000).optional().describe('Coordenada Y na ÚLTIMA captura de tela (pixels da imagem).'),
    texto: z.string().max(2000).optional().describe('Texto para "digitar" (quebras de linha viram Enter).'),
    tecla: z.string().max(40).optional().describe('Tecla para "tecla": enter, tab, esc, espaço, backspace, delete, setas (cima/baixo/esquerda/direita), home, end, f1..f12, uma letra/número...'),
    modificadores: z.array(z.enum(['ctrl', 'alt', 'shift', 'win'])).max(3).optional().describe('Teclas seguradas junto (ex.: ["ctrl"] + tecla "c" = copiar).'),
    quantidade: z.number().int().min(-30).max(30).optional().describe('"rolar": quantos "cliques" da rodinha (positivo = para baixo, negativo = para cima).'),
  })
  .superRefine((s, ctx) => {
    const needXY = s.acao === 'mover' || s.acao === 'clicar' || s.acao === 'clique_duplo' || s.acao === 'clique_direito';
    if (needXY && (s.x === undefined || s.y === undefined)) ctx.addIssue({ code: 'custom', message: `"${s.acao}" precisa de x e y.` });
    if (s.acao === 'rolar' && !s.quantidade) ctx.addIssue({ code: 'custom', message: '"rolar" precisa de "quantidade" diferente de zero.' });
    if (s.acao === 'digitar' && !s.texto) ctx.addIssue({ code: 'custom', message: '"digitar" precisa de "texto".' });
    if (s.acao === 'tecla') {
      if (!s.tecla) ctx.addIssue({ code: 'custom', message: '"tecla" precisa do nome da tecla.' });
      else if (!mapKey(s.tecla)) ctx.addIssue({ code: 'custom', message: `tecla desconhecida: "${s.tecla}".` });
    }
  });

export type Step = z.infer<typeof stepSchema>;

const MOD_LABEL: Record<string, string> = { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', win: 'Windows' };

export function describeStep(s: Step): string {
  const at = s.x !== undefined && s.y !== undefined ? ` em (${s.x}, ${s.y})` : '';
  switch (s.acao) {
    case 'mover':
      return `mover o mouse para (${s.x}, ${s.y})`;
    case 'clicar':
      return `clicar${at}`;
    case 'clique_duplo':
      return `clique duplo${at}`;
    case 'clique_direito':
      return `clique com o botão direito${at}`;
    case 'rolar':
      return `rolar ${Math.abs(s.quantidade ?? 0)} para ${(s.quantidade ?? 0) > 0 ? 'baixo' : 'cima'}${at}`;
    case 'digitar': {
      const t = String(s.texto ?? '');
      return `digitar "${t.length > 120 ? t.slice(0, 119) + '…' : t}"`;
    }
    case 'tecla': {
      const mods = (s.modificadores ?? []).map((m) => MOD_LABEL[m] ?? m);
      return `pressionar ${[...mods, String(s.tecla)].join('+')}`;
    }
  }
}

export function describeSteps(steps: Step[]): string {
  return steps.map((s, i) => `${i + 1}) ${describeStep(s)}`).join('; ');
}

/* ---------------- coordenadas ---------------- */

export interface ScreenGeometry {
  width: number;
  height: number;
  displays?: { x: number; y: number; width: number; height: number }[];
}

/** Converte (x, y) da imagem da captura para a tela real (as escalas podem diferir por DPI/redução). */
export function mapPoint(x: number, y: number, screen: ScreenGeometry, shot?: { width: number; height: number }): { x: number; y: number } {
  if (shot && shot.width > 0 && shot.height > 0 && (shot.width !== screen.width || shot.height !== screen.height)) {
    return { x: Math.round((x * screen.width) / shot.width), y: Math.round((y * screen.height) / shot.height) };
  }
  return { x: Math.round(x), y: Math.round(y) };
}

export function pointOnScreen(p: { x: number; y: number }, screen: ScreenGeometry): boolean {
  if (screen.displays?.length) return screen.displays.some((d) => p.x >= d.x && p.y >= d.y && p.x < d.x + d.width && p.y < d.y + d.height);
  return p.x >= 0 && p.y >= 0 && p.x < screen.width && p.y < screen.height;
}

export interface PlannedStep {
  step: Step;
  point?: { x: number; y: number };
}

/** Valida TODOS os passos antes de executar qualquer um. */
export function planSteps(steps: Step[], screen: ScreenGeometry, shot?: { width: number; height: number }): { plan: PlannedStep[]; errors: string[] } {
  const errors: string[] = [];
  const plan = steps.map((step, i) => {
    if (step.x === undefined || step.y === undefined) return { step };
    if (shot && (step.x >= shot.width || step.y >= shot.height)) {
      errors.push(`passo ${i + 1}: (${step.x}, ${step.y}) fica fora da última captura (${shot.width}×${shot.height}).`);
      return { step };
    }
    const point = mapPoint(step.x, step.y, screen, shot);
    if (!pointOnScreen(point, screen)) errors.push(`passo ${i + 1}: (${step.x}, ${step.y}) fica fora da tela (${screen.width}×${screen.height}).`);
    return { step, point };
  });
  return { plan, errors };
}

/** Digita texto: quebras de linha viram Enter, tabulação vira Tab; caracteres fora do BMP no Windows vão como pares substitutos. */
export function typeText(robot: RobotLike, text: string, platform: NodeJS.Platform = process.platform): void {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, li) => {
    if (li > 0) robot.keyTap('enter');
    const parts = line.split('\t');
    parts.forEach((part, pi) => {
      if (pi > 0) robot.keyTap('tab');
      let buf = '';
      for (const ch of part) {
        const cp = ch.codePointAt(0)!;
        if (cp > 0xffff) {
          if (buf) {
            robot.typeString(buf);
            buf = '';
          }
          if (robot.unicodeTap) {
            if (platform === 'win32') {
              robot.unicodeTap(ch.charCodeAt(0));
              robot.unicodeTap(ch.charCodeAt(1));
            } else robot.unicodeTap(cp);
          }
        } else buf += ch;
      }
      if (buf) robot.typeString(buf);
    });
  });
}

function scrollUnit(platform: NodeJS.Platform = process.platform): number {
  return platform === 'win32' ? 120 : platform === 'darwin' ? 40 : 1;
}

export async function runSteps(robot: RobotLike, plan: PlannedStep[], opts: { signal?: AbortSignal; delayMs?: number; onStep?: (i: number) => void } = {}): Promise<number> {
  robot.setMouseDelay?.(8);
  robot.setKeyboardDelay?.(6);
  let done = 0;
  for (let i = 0; i < plan.length; i++) {
    if (opts.signal?.aborted) break;
    const { step, point } = plan[i]!;
    opts.onStep?.(i);
    switch (step.acao) {
      case 'mover':
        robot.moveMouse(point!.x, point!.y);
        break;
      case 'clicar':
        robot.moveMouse(point!.x, point!.y);
        robot.mouseClick('left', false);
        break;
      case 'clique_duplo':
        robot.moveMouse(point!.x, point!.y);
        robot.mouseClick('left', true);
        break;
      case 'clique_direito':
        robot.moveMouse(point!.x, point!.y);
        robot.mouseClick('right', false);
        break;
      case 'rolar':
        if (point) robot.moveMouse(point.x, point.y);
        // robotjs: y POSITIVO rola para CIMA; unidade: Windows 120 por "clique" da rodinha, macOS pixels, X11 cliques.
        robot.scrollMouse(0, -(step.quantidade ?? 0) * scrollUnit());
        break;
      case 'digitar':
        typeText(robot, step.texto ?? '');
        break;
      case 'tecla': {
        const key = mapKey(step.tecla ?? '');
        if (!key) throw new Error(`tecla desconhecida: ${step.tecla}`);
        const mods = mapModifiers(step.modificadores);
        if (mods.length) robot.keyTap(key, mods);
        else robot.keyTap(key);
        break;
      }
    }
    done++;
    if (i < plan.length - 1) {
      try {
        await sleep(opts.delayMs ?? 150, opts.signal);
      } catch {
        break; // cancelado entre passos
      }
    }
  }
  return done;
}
