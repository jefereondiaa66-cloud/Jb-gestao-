/**
 * Peças comuns aos provedores de IA (Anthropic, OpenAI, Ollama):
 * erros amigáveis, marcador de entrada inválida de ferramenta,
 * reparo do pareamento chamada/resultado e utilidades de cancelamento.
 */
import type { ChatMessage, ContentPart, ToolResultContent } from '../types';

/* ======================================================================
 * Erros
 * ==================================================================== */
export type LlmErrorCode =
  | 'sem_chave'
  | 'chave_invalida'
  | 'sem_permissao'
  | 'cobranca'
  | 'limite_taxa'
  | 'sobrecarga'
  | 'rede'
  | 'tempo_esgotado'
  | 'contexto_grande'
  | 'modelo_nao_encontrado'
  | 'requisicao_invalida'
  | 'servidor'
  | 'cancelado'
  | 'desconhecido';

/** Erro de provedor com mensagem pronta para o dono (pt-BR) e código estável. */
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly provider: string;
  readonly retryAfterSec?: number;
  readonly status?: number;

  constructor(code: LlmErrorCode, message: string, opts: { provider: string; retryAfterSec?: number; status?: number; cause?: unknown }) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'LlmError';
    this.code = code;
    this.provider = opts.provider;
    if (opts.retryAfterSec !== undefined) this.retryAfterSec = opts.retryAfterSec;
    if (opts.status !== undefined) this.status = opts.status;
  }
}

export function isLlmError(e: unknown): e is LlmError {
  return e instanceof LlmError;
}

/** Erro padrão de cancelamento (stop/abort). */
export function cancelledError(provider: string): LlmError {
  return new LlmError('cancelado', 'Cancelado pelo dono.', { provider });
}

/** Lê o cabeçalho retry-after (segundos ou data HTTP). */
export function parseRetryAfter(headers: { get(name: string): string | null } | undefined | null): number | undefined {
  if (!headers) return undefined;
  const ms = headers.get('retry-after-ms');
  if (ms && /^\d+(\.\d+)?$/.test(ms.trim())) return Math.max(1, Math.ceil(Number(ms) / 1000));
  const raw = headers.get('retry-after');
  if (!raw) return undefined;
  const v = raw.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.max(1, Math.ceil(Number(v)));
  const when = Date.parse(v);
  if (!Number.isNaN(when)) return Math.max(1, Math.ceil((when - Date.now()) / 1000));
  return undefined;
}

/**
 * Envolve o fetch dos SDKs para que uma espera longa pedida pelo servidor
 * (retry-after de 429/529/5xx) NÃO vire minutos de silêncio: acima de maxSec, o
 * SDK desiste na hora (x-should-retry: false) e o dono recebe a mensagem
 * "tente de novo em cerca de N s". Esperas curtas continuam automáticas.
 */
export function limitRetryWait(base: typeof fetch, maxSec: number): typeof fetch {
  const wrapped = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const res = await base(input, init);
    if (res.status !== 429 && res.status < 500) return res;
    const wait = parseRetryAfter(res.headers);
    if (wait === undefined || wait <= maxSec) return res;
    const headers = new Headers(res.headers);
    headers.set('x-should-retry', 'false');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  };
  return wrapped as typeof fetch;
}

/** Texto curto e seguro a partir de uma mensagem de erro de terceiros. */
export function shortDetail(msg: unknown, max = 300): string {
  const s = typeof msg === 'string' ? msg : msg instanceof Error ? msg.message : '';
  const clean = s
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, '[oculto]')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

/* ======================================================================
 * Entrada de ferramenta que não é JSON válido
 * ==================================================================== */
/**
 * Quando o modelo gera argumentos que não são JSON válido, o provedor entrega
 * este marcador no lugar da entrada. O agente NUNCA executa a ferramenta com
 * ele: devolve um resultado de erro para o modelo corrigir.
 */
export interface InvalidToolInput {
  readonly __entradaInvalida: true;
  readonly raw: string;
  readonly error: string;
}

export function invalidToolInput(raw: string, error: string): InvalidToolInput {
  return { __entradaInvalida: true, raw: raw.slice(0, 20000), error: shortDetail(error, 200) };
}

export function isInvalidToolInput(x: unknown): x is InvalidToolInput {
  return typeof x === 'object' && x !== null && (x as { __entradaInvalida?: unknown }).__entradaInvalida === true;
}

/** Interpreta argumentos de ferramenta de forma ESTRITA (sem tolerância a JSON quebrado). */
export function parseToolArguments(raw: string | undefined | null): unknown {
  const text = (raw ?? '').trim();
  if (text === '') return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    return invalidToolInput(text, e instanceof Error ? e.message : String(e));
  }
}

/** Entrada para reenviar ao provedor (o marcador vira objeto vazio). */
export function replayableInput(input: unknown): Record<string, unknown> {
  if (isInvalidToolInput(input)) return {};
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) return input as Record<string, unknown>;
  return { value: input };
}

/* ======================================================================
 * Pareamento chamada de ferramenta -> resultado
 * ==================================================================== */
export const INTERRUPTED_TOOL_TEXT = 'Ferramenta não executada: a tarefa foi interrompida antes do resultado.';

/**
 * Garante que toda chamada de ferramenta de uma resposta do assistente tenha
 * resultado logo depois (antes da próxima fala do dono ou do assistente) e
 * descarta resultados órfãos. Puro e determinístico: o mesmo histórico gera
 * sempre o mesmo resultado (importante para o cache do prompt).
 */
export function repairToolPairing(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let pending: Map<string, string> | null = null;
  const answered = new Set<string>();

  const flush = () => {
    if (pending) {
      const missing = [...pending].filter(([id]) => !answered.has(id));
      if (missing.length) {
        out.push({
          id: `reparo_${missing[0]![0]}`,
          role: 'tool',
          createdAt: '',
          parts: missing.map(([id, name]) => ({
            type: 'tool_result' as const,
            toolCallId: id,
            name,
            content: [{ type: 'text' as const, text: INTERRUPTED_TOOL_TEXT }],
            isError: true,
          })),
        });
      }
    }
    pending = null;
    answered.clear();
  };

  for (const m of messages) {
    if (m.role === 'tool') {
      const keep = m.parts.filter(
        (p): p is Extract<ContentPart, { type: 'tool_result' }> =>
          p.type === 'tool_result' && pending !== null && pending.has(p.toolCallId) && !answered.has(p.toolCallId),
      );
      for (const p of keep) answered.add(p.toolCallId);
      if (keep.length) out.push(keep.length === m.parts.length ? m : { ...m, parts: keep });
      continue;
    }
    flush();
    if (m.role === 'assistant') {
      const calls = m.parts.filter((p): p is Extract<ContentPart, { type: 'tool_call' }> => p.type === 'tool_call');
      if (calls.length) pending = new Map(calls.map((c) => [c.id, c.name]));
    }
    out.push(m);
  }
  flush();
  return out;
}

/* ======================================================================
 * Utilidades
 * ==================================================================== */
export function textOfParts(parts: ContentPart[]): string {
  return parts
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

export function textOfToolContent(content: ToolResultContent[]): string {
  return content
    .filter((c): c is Extract<ToolResultContent, { type: 'text' }> => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}

/**
 * As APIs exigem que o esquema de entrada de uma ferramenta seja um objeto JSON
 * ("type": "object"). Esquemas vindos de fora (ex.: servidores MCP) às vezes
 * omitem o "type"; um só esquema assim faria TODOS os pedidos falharem.
 */
export function objectSchema(schema: unknown): Record<string, unknown> {
  const s = typeof schema === 'object' && schema !== null && !Array.isArray(schema) ? (schema as Record<string, unknown>) : {};
  if (s.type === 'object') return s;
  if (s.type === undefined) return { ...s, type: 'object', ...(s.properties === undefined ? { properties: {} } : {}) };
  // Mesmo formato do registro de ferramentas para entradas que não são objeto.
  return { type: 'object', properties: { value: s }, required: ['value'] };
}

/** Rejeita imediatamente quando o sinal é abortado, mesmo que a promessa ignore o sinal. */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined, onAbort: () => Error): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) {
    p.catch(() => undefined);
    return Promise.reject(onAbort());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(onAbort());
    signal.addEventListener('abort', abort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', abort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(e);
      },
    );
  });
}

/** Resolve uma opção que pode ser valor fixo ou função (lida a cada uso). */
export type Dynamic<T> = T | (() => T);
export function resolveDynamic<T>(v: Dynamic<T>): T {
  return typeof v === 'function' ? (v as () => T)() : v;
}

/** Fonte de chave: texto fixo ou função assíncrona (lida no momento do uso, nunca guardada em log). */
export type KeySource = string | (() => Promise<string | undefined> | string | undefined);
export async function resolveKey(src: KeySource | undefined): Promise<string | undefined> {
  if (src === undefined) return undefined;
  const v = typeof src === 'function' ? await src() : src;
  const t = (v ?? '').trim();
  return t === '' ? undefined : t;
}

/** Converte data URL/base64 para o formato que cada API espera. */
export function dataUrl(mediaType: string, base64: string): string {
  return `data:${mediaType};base64,${base64}`;
}
