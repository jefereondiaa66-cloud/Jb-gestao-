/**
 * Utilidades comuns às ferramentas de arquivos, web, sistema, navegador,
 * documentos e visão (saídas padronizadas, cortes de texto, formatação).
 */
import type { ToolOutput } from '../../types';

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name;
  try {
    return String(err);
  } catch {
    return 'erro desconhecido';
  }
}

export function textOutput(text: string, summary: string, extra: Partial<ToolOutput> = {}): ToolOutput {
  return { content: [{ type: 'text', text }], summary, ...extra };
}

export function errorOutput(message: string): ToolOutput {
  return { content: [{ type: 'text', text: message }], summary: oneLine(message, 200), isError: true };
}

/** Texto numa linha só, com limite (para resumos e descrições). */
export function oneLine(text: string, max = 200): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length <= max ? t : chars.slice(0, max - 1).join('') + '…';
}

/** Prévia curta entre aspas para descrições de confirmação. */
export function preview(text: string, max = 80): string {
  return oneLine(text, max);
}

/**
 * Corta um texto longo e diz quanto ficou de fora. `start` permite continuar
 * a leitura de onde parou.
 */
export function sliceText(text: string, maxChars: number, start = 0): { text: string; truncated: boolean; total: number; next: number } {
  const total = text.length;
  const from = Math.max(0, Math.min(start, total));
  const to = Math.min(total, from + Math.max(1, maxChars));
  return { text: text.slice(from, to), truncated: to < total || from > 0, total, next: to };
}

/** Mantém começo e fim (erros costumam aparecer no final da saída). */
export function clampHeadTail(text: string, maxChars: number): { text: string; omitted: number } {
  if (text.length <= maxChars) return { text, omitted: 0 };
  const head = Math.floor(maxChars * 0.7);
  const tail = maxChars - head;
  const omitted = text.length - head - tail;
  return { text: text.slice(0, head) + `\n[… ${omitted} caracteres omitidos …]\n` + text.slice(text.length - tail), omitted };
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '?';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

/** Data/hora local em pt-BR (ex.: 02/11/2026 14:30). */
export function formatDateTime(d: Date | number | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Minúsculas e sem acentos, para comparações tolerantes. */
export function fold(text: string): string {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
}

/** Combina o sinal da ferramenta com um tempo limite próprio. */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}

/** Espera cancelável. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('cancelado'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new Error('cancelado'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
