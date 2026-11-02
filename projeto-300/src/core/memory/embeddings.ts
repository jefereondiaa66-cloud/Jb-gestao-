/**
 * Provedores de embeddings (vetores de significado) para a busca da memória.
 * - OpenAI: SDK oficial, text-embedding-3-small (1536 dimensões).
 * - Ollama: local, POST {ollamaUrl}/api/embed; dimensões descobertas na 1ª chamada.
 * Sem provedor (ou sem chave), a memória funciona só com busca por texto.
 */
import OpenAI from 'openai';
import type { Settings } from '../settings';
import { SECRET_NAMES, type EmbeddingProvider, type Logger, type SecretStore } from '../types';

const KNOWN_OPENAI_DIMS: Record<string, number> = {
  'text-embedding-3-small': 1536,
  'text-embedding-3-large': 3072,
  'text-embedding-ada-002': 1536,
};

/** Texto vazio é recusado pelas APIs; texto enorme estoura o limite de tokens. */
function prepareInput(t: string, maxChars: number): string {
  const s = String(t ?? '').trim();
  if (!s) return '(vazio)';
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}

function toFloat32(v: unknown, expected?: number): Float32Array {
  if (!Array.isArray(v) || !v.length) throw new Error('vetor de embedding vazio ou inválido');
  if (expected && v.length !== expected) throw new Error(`vetor com ${v.length} dimensões (esperado ${expected})`);
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const n = v[i];
    if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('vetor de embedding com valor inválido');
    out[i] = n;
  }
  return out;
}

/** Divide em lotes respeitando quantidade de itens e tamanho total. */
function batches(texts: string[], maxItems: number, maxChars: number): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  let size = 0;
  for (const t of texts) {
    if (cur.length && (cur.length >= maxItems || size + t.length > maxChars)) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(t);
    size += t.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface OpenAIEmbeddingsOptions {
  apiKey: string;
  model?: string;
  /** Força dimensões (só modelos text-embedding-3 aceitam). */
  dimensions?: number;
  baseURL?: string;
  fetch?: typeof fetch;
  batchSize?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export class OpenAIEmbeddings implements EmbeddingProvider {
  readonly id = 'openai';
  readonly model: string;
  private dims: number;
  private readonly forcedDims?: number;
  private readonly client: OpenAI;
  private readonly batchSize: number;

  constructor(opts: OpenAIEmbeddingsOptions) {
    if (!opts.apiKey) throw new Error('Chave da OpenAI ausente.');
    this.model = opts.model || 'text-embedding-3-small';
    this.forcedDims = opts.dimensions && opts.dimensions > 0 ? Math.floor(opts.dimensions) : undefined;
    this.dims = this.forcedDims ?? KNOWN_OPENAI_DIMS[this.model] ?? 0;
    this.batchSize = Math.min(Math.max(opts.batchSize ?? 96, 1), 2048);
    this.client = new OpenAI({
      apiKey: opts.apiKey,
      baseURL: opts.baseURL,
      fetch: opts.fetch,
      timeout: opts.timeoutMs ?? 60_000,
      maxRetries: opts.maxRetries ?? 2,
    });
  }

  /** 0 enquanto não se sabe (modelo desconhecido antes da 1ª chamada). */
  get dimensions(): number {
    return this.dims;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (!texts.length) return [];
    const inputs = texts.map((t) => prepareInput(t, 6000));
    const out: Float32Array[] = [];
    for (const batch of batches(inputs, this.batchSize, 200_000)) {
      if (signal?.aborted) throw signal.reason ?? new Error('cancelado');
      let res: OpenAI.Embeddings.CreateEmbeddingResponse;
      try {
        res = await this.client.embeddings.create(
          { model: this.model, input: batch, encoding_format: 'float', ...(this.forcedDims ? { dimensions: this.forcedDims } : {}) },
          { signal },
        );
      } catch (err) {
        if (signal?.aborted) throw err;
        const status = (err as { status?: number }).status;
        throw new Error(`Falha ao gerar embeddings na OpenAI${status ? ` (HTTP ${status})` : ''}: ${(err as Error).message ?? String(err)}`);
      }
      const data = [...(res.data ?? [])].sort((a, b) => a.index - b.index);
      if (data.length !== batch.length) throw new Error('A OpenAI devolveu uma quantidade diferente de vetores.');
      for (const d of data) {
        const v = toFloat32(d.embedding, this.dims || undefined);
        if (!this.dims) this.dims = v.length;
        out.push(v);
      }
    }
    return out;
  }
}

export interface OllamaEmbeddingsOptions {
  url?: string;
  model: string;
  fetch?: typeof fetch;
  batchSize?: number;
  timeoutMs?: number;
}

export class OllamaEmbeddings implements EmbeddingProvider {
  readonly id = 'ollama';
  readonly model: string;
  private dims = 0;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly batchSize: number;
  private readonly timeoutMs: number;

  constructor(opts: OllamaEmbeddingsOptions) {
    if (!opts.model) throw new Error('Modelo de embeddings do Ollama não configurado.');
    const base = (opts.url || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
    let u: URL;
    try {
      u = new URL(base);
    } catch {
      throw new Error(`Endereço do Ollama inválido: ${base}`);
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('O endereço do Ollama precisa começar com http:// ou https://');
    this.endpoint = `${base}/api/embed`;
    this.model = opts.model;
    this.fetchImpl = opts.fetch ?? fetch;
    this.batchSize = Math.min(Math.max(opts.batchSize ?? 32, 1), 512);
    this.timeoutMs = opts.timeoutMs ?? 120_000;
  }

  /** 0 até a primeira chamada bem-sucedida. */
  get dimensions(): number {
    return this.dims;
  }

  async embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]> {
    if (!texts.length) return [];
    const inputs = texts.map((t) => prepareInput(t, 8000));
    const out: Float32Array[] = [];
    for (const batch of batches(inputs, this.batchSize, 400_000)) {
      const signals = [AbortSignal.timeout(this.timeoutMs)];
      if (signal) signals.push(signal);
      let res: Response;
      try {
        res = await this.fetchImpl(this.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model: this.model, input: batch, truncate: true }),
          signal: AbortSignal.any(signals),
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new Error(`Não foi possível falar com o Ollama em ${this.endpoint}: ${(err as Error).message ?? String(err)}`);
      }
      if (!res.ok) {
        let body = '';
        try {
          body = (await res.text()).slice(0, 300);
        } catch {
          /* corpo ilegível */
        }
        throw new Error(`O Ollama recusou o pedido de embeddings (HTTP ${res.status})${body ? `: ${body}` : ''}`);
      }
      let json: { embeddings?: unknown };
      try {
        json = (await res.json()) as { embeddings?: unknown };
      } catch {
        throw new Error('O Ollama devolveu uma resposta que não é JSON.');
      }
      const list = json.embeddings;
      if (!Array.isArray(list) || list.length !== batch.length) throw new Error('O Ollama devolveu uma quantidade diferente de vetores.');
      for (const v of list) {
        const f = toFloat32(v, this.dims || undefined);
        if (!this.dims) this.dims = f.length;
        out.push(f);
      }
    }
    return out;
  }
}

/**
 * Cria o provedor conforme as configurações. Devolve undefined quando o
 * provedor é 'none', falta a chave ou a configuração é inválida (ex.: endereço
 * do Ollama sem http://): a memória segue só com texto e o motor não deixa de
 * iniciar por causa de um erro de digitação nas configurações.
 */
export async function createEmbeddingProvider(
  settings: Settings,
  secrets: SecretStore,
  fetchImpl?: typeof fetch,
  logger?: Logger,
): Promise<EmbeddingProvider | undefined> {
  const cfg = settings.embeddings;
  try {
    switch (cfg.provider) {
      case 'openai': {
        const key = (await secrets.get(SECRET_NAMES.openai))?.trim();
        if (!key) {
          logger?.warn('embeddings da OpenAI configurados, mas falta a chave da OpenAI; usando só busca por texto');
          return undefined;
        }
        return new OpenAIEmbeddings({ apiKey: key, model: cfg.openaiModel, fetch: fetchImpl });
      }
      case 'ollama':
        return new OllamaEmbeddings({ url: settings.brain.ollamaUrl, model: cfg.ollamaModel, fetch: fetchImpl });
      default:
        return undefined;
    }
  } catch (err) {
    logger?.warn('embeddings indisponíveis (configuração inválida); usando só busca por texto', err instanceof Error ? err.message : String(err));
    return undefined;
  }
}
