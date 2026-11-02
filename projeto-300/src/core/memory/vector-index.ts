/**
 * Índice de vetores das memórias (sqlite-vec, tabela vec0).
 *
 * - A tabela é criada com as dimensões do provedor de embeddings atual.
 * - meta guarda qual modelo gerou os vetores; se o modelo/dimensões mudarem,
 *   a tabela é recriada e as memórias são reprocessadas aos poucos, em segundo plano.
 * - Falha de embeddings nunca impede salvar: a busca cai para só texto.
 * - Memórias sensíveis nunca são enviadas ao provedor de embeddings.
 */
import type { EmbeddingProvider, Logger } from '../types';
import { raceSignal } from './abort';
import type { SqliteDb } from './database';

const TABLE = 'memory_vec';
const META_MODEL = 'vec.model';
const META_DIMS = 'vec.dims';
const MAX_DIMS = 8192;

export interface VectorIndexOptions {
  batchSize?: number;
  /** Distância de cosseno máxima para contar como resultado (0 = idêntico, 2 = oposto). */
  maxDistance?: number;
  /** Tempo máximo para gerar o vetor da consulta (ms). */
  queryTimeoutMs?: number;
  /** Espera antes de tentar de novo após falha (ms). */
  retryBaseMs?: number;
  /** Tempo máximo de um lote em segundo plano (ms); provedor travado não segura o índice para sempre. */
  batchTimeoutMs?: number;
}

export interface VectorHit {
  num: number;
  distance: number;
}

function toBlob(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export class VectorIndex {
  private provider?: EmbeddingProvider;
  private sig?: string; // "<id>:<modelo>"
  private dims = 0; // dimensões da tabela atual (0 = ainda não criada)
  private generation = 0;
  private running = false;
  private again = false;
  private immediate = false;
  private timer?: ReturnType<typeof setTimeout>;
  private failures = 0;
  private disposed = false;
  private abort = new AbortController();
  private waiters: (() => void)[] = [];
  private queryCache = new Map<string, Float32Array>();
  /** Geração em que a consulta já recriou o índice (no máximo uma vez por provedor). */
  private queryResetGen = -1;
  private readonly batchSize: number;
  private readonly maxDistance: number;
  private readonly queryTimeoutMs: number;
  private readonly retryBaseMs: number;
  private readonly batchTimeoutMs: number;

  constructor(
    private readonly db: SqliteDb,
    readonly extensionAvailable: boolean,
    private readonly logger: Logger,
    opts: VectorIndexOptions = {},
  ) {
    this.batchSize = Math.min(Math.max(opts.batchSize ?? 32, 1), 256);
    this.maxDistance = opts.maxDistance ?? 0.75;
    this.queryTimeoutMs = opts.queryTimeoutMs ?? 10_000;
    this.retryBaseMs = opts.retryBaseMs ?? 30_000;
    this.batchTimeoutMs = opts.batchTimeoutMs ?? 180_000;
  }

  /** Há provedor e extensão: vetores podem ser usados. */
  get enabled(): boolean {
    return this.extensionAvailable && !!this.provider && !this.disposed;
  }

  get currentProvider(): EmbeddingProvider | undefined {
    return this.provider;
  }

  /** Assinatura gravada nas memórias já vetorizadas (modelo + dimensões). */
  private rowSig(): string | undefined {
    return this.sig && this.dims ? `${this.sig}:${this.dims}` : undefined;
  }

  private tableExists(): boolean {
    const row = this.db.prepare(`SELECT 1 AS ok FROM sqlite_master WHERE name = ?`).get(TABLE);
    return !!row;
  }

  private meta(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  private setMeta(key: string, value: string): void {
    this.db.prepare('INSERT INTO meta(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }

  /** Troca (ou remove) o provedor de embeddings. Recria o índice se o modelo mudou. */
  setProvider(provider: EmbeddingProvider | undefined): void {
    if (this.disposed) return;
    this.generation++;
    this.abort.abort();
    this.abort = new AbortController();
    this.queryCache.clear();
    this.failures = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
      this.immediate = false;
    }
    this.provider = provider;
    this.sig = provider ? `${provider.id}:${provider.model}` : undefined;
    this.dims = 0;
    if (!provider || !this.extensionAvailable) {
      this.notifyIdle();
      return;
    }
    try {
      const storedSig = this.meta(META_MODEL);
      const storedDims = Number(this.meta(META_DIMS) ?? 0);
      const exists = this.tableExists();
      const want = provider.dimensions > 0 ? Math.floor(provider.dimensions) : 0;
      if (exists && storedSig === this.sig && storedDims > 0 && (want === 0 || want === storedDims)) {
        this.dims = storedDims;
        this.cleanOrphans();
      } else if (want > 0) {
        this.resetTable(want);
      }
      // want === 0 e sem tabela compatível: as dimensões vêm do primeiro embedding.
    } catch (err) {
      this.logger.warn('índice de vetores: falha ao preparar; usando só busca por texto', err);
      this.provider = undefined;
      this.sig = undefined;
      return;
    }
    this.schedule(0);
  }

  private resetTable(dims: number): void {
    if (!Number.isInteger(dims) || dims < 1 || dims > MAX_DIMS) throw new Error(`dimensões de embedding inválidas: ${dims}`);
    const tx = this.db.transaction(() => {
      this.db.exec(`DROP TABLE IF EXISTS ${TABLE}`);
      this.db.exec(`CREATE VIRTUAL TABLE ${TABLE} USING vec0(embedding float[${dims}] distance_metric=cosine)`);
      this.db.prepare('UPDATE memories SET embedding_sig = NULL WHERE embedding_sig IS NOT NULL').run();
      this.setMeta(META_MODEL, this.sig ?? '');
      this.setMeta(META_DIMS, String(dims));
    });
    tx.immediate();
    this.dims = dims;
    // Vetores de consulta guardados têm o tamanho antigo: não servem mais.
    this.queryCache.clear();
    this.logger.info('índice de vetores recriado', { model: this.sig, dims });
  }

  /**
   * Vetores que não deveriam existir: memórias apagadas ou marcadas como
   * sensíveis enquanto a extensão estava indisponível.
   */
  private cleanOrphans(): void {
    const res = this.db.prepare(`DELETE FROM ${TABLE} WHERE rowid NOT IN (SELECT num FROM memories WHERE sensitive = 0)`).run();
    if (res.changes) this.logger.debug('índice de vetores: órfãos removidos', { n: res.changes });
  }

  /** Remove o vetor de uma memória (apagada, alterada ou marcada como sensível). */
  remove(num: number): void {
    if (!this.extensionAvailable) return;
    try {
      if (!this.dims && !this.tableExists()) return;
      this.db.prepare(`DELETE FROM ${TABLE} WHERE rowid = ?`).run(BigInt(num));
    } catch (err) {
      this.logger.warn('índice de vetores: falha ao remover vetor', err);
    }
  }

  /** Avisa que há memórias novas/alteradas para vetorizar. */
  markDirty(): void {
    if (this.enabled) this.schedule(0);
  }

  private schedule(delayMs: number): void {
    if (!this.enabled) return;
    if (this.running) {
      this.again = true;
      return;
    }
    if (this.timer) {
      // Já agendado, ou esperando nova tentativa após falha (não insiste antes da hora).
      if (delayMs > 0 || this.immediate || this.failures > 0) return;
      clearTimeout(this.timer);
    }
    this.immediate = delayMs === 0;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.immediate = false;
      void this.run();
    }, delayMs);
    this.timer.unref?.();
  }

  private pending(limit: number): { num: number; content: string }[] {
    const sig = this.rowSig();
    return this.db
      .prepare(
        `SELECT num, content FROM memories
         WHERE sensitive = 0 AND (embedding_sig IS NULL OR embedding_sig <> ?)
         ORDER BY num LIMIT ?`,
      )
      .all(sig ?? '', limit) as { num: number; content: string }[];
  }

  private async run(): Promise<void> {
    if (this.running) return;
    if (!this.enabled) {
      this.notifyIdle();
      return;
    }
    this.running = true;
    let resetsThisRun = 0;
    try {
      while (this.enabled) {
        const provider = this.provider!;
        const gen = this.generation;
        const rows = this.pending(this.batchSize);
        if (!rows.length) break;
        let vectors: Float32Array[];
        try {
          const batchSignal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.batchTimeoutMs)]);
          vectors = await raceSignal(
            provider.embed(
              rows.map((r) => r.content),
              batchSignal,
            ),
            batchSignal,
          );
        } catch (err) {
          if (gen !== this.generation || this.disposed) continue;
          this.failures++;
          const wait = this.backoff();
          this.logger.warn(`embeddings falharam; busca segue só por texto (nova tentativa em ${Math.round(wait / 1000)} s)`, err);
          this.retryLater(wait);
          return;
        }
        if (gen !== this.generation || this.disposed) continue; // provedor trocado no meio
        if (!Array.isArray(vectors) || vectors.length !== rows.length) {
          this.failures++;
          this.logger.warn('embeddings: resposta com quantidade errada de vetores; ignorando lote');
          this.retryLater(this.backoff());
          return;
        }
        const len = vectors[0]?.length ?? 0;
        if (!len || vectors.some((v) => !(v instanceof Float32Array) || v.length !== len || !v.every(Number.isFinite))) {
          this.failures++;
          this.logger.warn('embeddings: vetores inválidos; ignorando lote');
          this.retryLater(this.backoff());
          return;
        }
        if (len !== this.dims) {
          if (resetsThisRun++ > 0) {
            this.logger.warn('embeddings: dimensões instáveis; vetores desativados até reiniciar');
            this.provider = undefined;
            break;
          }
          // Primeiro vetor deste modelo (ou modelo trocou de tamanho): recria a tabela e aproveita o lote.
          this.resetTable(len);
        }
        this.failures = 0;
        this.store(rows, vectors);
      }
    } catch (err) {
      this.logger.warn('índice de vetores: erro no processamento em segundo plano', err);
    } finally {
      this.running = false;
      if (this.again) {
        this.again = false;
        this.schedule(0);
      }
      this.notifyIdle();
    }
  }

  private backoff(): number {
    return Math.min(this.retryBaseMs * 2 ** Math.max(0, this.failures - 1), 10 * 60_000);
  }

  /** Encerra a execução atual e agenda nova tentativa mais tarde (sem ser atropelada por pedidos imediatos). */
  private retryLater(wait: number): void {
    this.running = false;
    this.again = false;
    this.schedule(wait);
  }

  private store(rows: { num: number; content: string }[], vectors: Float32Array[]): void {
    const sig = this.rowSig()!;
    const mark = this.db.prepare('UPDATE memories SET embedding_sig = ? WHERE num = ? AND content = ? AND sensitive = 0');
    const del = this.db.prepare(`DELETE FROM ${TABLE} WHERE rowid = ?`);
    const ins = this.db.prepare(`INSERT INTO ${TABLE}(rowid, embedding) VALUES (?, ?)`);
    const tx = this.db.transaction(() => {
      rows.forEach((r, i) => {
        // Só grava se a memória ainda existe com o mesmo texto (pode ter mudado durante a chamada).
        if (mark.run(sig, r.num, r.content).changes !== 1) return;
        del.run(BigInt(r.num));
        ins.run(BigInt(r.num), toBlob(vectors[i]!));
      });
    });
    tx.immediate();
  }

  private notifyIdle(): void {
    if (this.running || this.immediate) return;
    const w = this.waiters;
    this.waiters = [];
    for (const fn of w) fn();
  }

  /** Espera o processamento imediato terminar (não espera novas tentativas agendadas para depois). */
  async whenIdle(): Promise<void> {
    while (this.running || this.immediate) {
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }

  /** Quantas memórias ainda esperam vetor. */
  pendingCount(): number {
    if (!this.enabled) return 0;
    const row = this.db
      .prepare(`SELECT count(*) AS n FROM memories WHERE sensitive = 0 AND (embedding_sig IS NULL OR embedding_sig <> ?)`)
      .get(this.rowSig() ?? '') as { n: number };
    return row.n;
  }

  private async embedQuery(text: string, signal?: AbortSignal): Promise<Float32Array | undefined> {
    const provider = this.provider;
    if (!provider) return undefined;
    const key = `${this.sig}\u0000${text}`;
    const hit = this.queryCache.get(key);
    if (hit) {
      this.queryCache.delete(key);
      this.queryCache.set(key, hit);
      return hit;
    }
    const signals = [AbortSignal.timeout(this.queryTimeoutMs), this.abort.signal];
    if (signal) signals.push(signal);
    const all = AbortSignal.any(signals);
    const [v] = await raceSignal(provider.embed([text], all), all);
    if (!(v instanceof Float32Array) || !v.length) return undefined;
    this.queryCache.set(key, v);
    if (this.queryCache.size > 64) this.queryCache.delete(this.queryCache.keys().next().value!);
    return v;
  }

  /** Vizinhos mais próximos do texto. Nunca lança: em falha, devolve [] e registra aviso. */
  async query(text: string, k: number, signal?: AbortSignal): Promise<VectorHit[]> {
    // Sem tabela ainda (dimensões desconhecidas, nada vetorizado): não há o que achar, nem por que enviar o texto.
    if (!this.enabled || !text.trim() || !this.dims) return [];
    const gen = this.generation;
    const provider = this.provider;
    try {
      const v = await this.embedQuery(text, signal);
      if (!v || !this.enabled || gen !== this.generation || !this.dims) return [];
      if (v.length !== this.dims) {
        if (provider === this.provider && provider?.dimensions === v.length && !this.running && this.queryResetGen !== gen) {
          // O modelo passou a gerar vetores de outro tamanho com o mesmo nome (ex.: trocado no Ollama): recria e reprocessa.
          this.queryResetGen = gen;
          this.logger.warn('embeddings: o modelo mudou de dimensões; recriando o índice de vetores', { antes: this.dims, agora: v.length });
          this.resetTable(v.length);
          this.schedule(0);
        } else {
          this.logger.warn('embeddings: dimensão da consulta difere do índice; busca só por texto');
        }
        return [];
      }
      const kk = Math.min(Math.max(Math.floor(k), 1), 1000);
      const rows = this.db
        .prepare(`SELECT rowid AS num, distance FROM ${TABLE} WHERE embedding MATCH ? AND k = ? ORDER BY distance`)
        .all(toBlob(v), kk) as { num: number | bigint; distance: number }[];
      return rows.map((r) => ({ num: Number(r.num), distance: r.distance })).filter((r) => r.distance <= this.maxDistance);
    } catch (err) {
      this.logger.warn('busca por vetores falhou; usando só texto', err);
      return [];
    }
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.abort.abort();
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.immediate = false;
    this.notifyIdle();
  }
}
