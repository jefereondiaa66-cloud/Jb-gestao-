/**
 * Memória persistente do 300 (SQLite + FTS5 + sqlite-vec).
 *
 * Busca híbrida: FTS (bm25) + vizinhos por vetor (quando houver embeddings)
 * + recência + importância, combinados por fusão de posições recíprocas (RRF).
 * Itens sensíveis ficam fora da busca, a menos que includeSensitive seja pedido.
 */
import type { EmbeddingProvider, Logger, MemoryItem, MemoryKind, MemoryQuery, MemorySearchResult, MemoryStore } from '../types';
import { newId, nowIso } from '../util/ids';
import type { AppDatabase, SqliteDb } from './database';
import { looksSensitive } from './sensitive';
import { buildFtsQuery, cleanText, truncate } from './text';
import { VectorIndex, type VectorIndexOptions } from './vector-index';

export const MEMORY_KINDS: readonly MemoryKind[] = ['fact', 'preference', 'project', 'task', 'knowledge', 'person', 'event', 'summary'];

export const MEMORY_LIMITS = {
  contentMax: 8000,
  tagMax: 40,
  tagsMax: 20,
  searchDefault: 8,
  searchMax: 50,
  listDefault: 100,
  listMax: 1000,
} as const;

/** Consulta com opções internas (os outros módulos podem passar só MemoryQuery). */
export interface MemorySearchOptions extends MemoryQuery {
  /** Atualiza contagem/último acesso dos resultados (padrão: true). */
  touch?: boolean;
  signal?: AbortSignal;
  /**
   * false = busca só por texto: o texto da consulta NÃO vai para o provedor de
   * embeddings (use quando ele for sensível). Texto que parece sensível
   * (documentos, senhas, saúde, finanças) nunca vai, mesmo sem esta opção.
   */
  vectors?: boolean;
}

export interface SqliteMemoryStoreOptions {
  embeddings?: EmbeddingProvider;
  logger?: Logger;
  vector?: VectorIndexOptions;
}

interface MemoryRow {
  num: number;
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string;
  importance: number;
  source: string;
  sensitive: number;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
  access_count: number;
  expires_at: string | null;
}

const RRF_K = 60;
const WEIGHTS_TEXT = { fts: 1, vector: 1, recency: 0.25, importance: 0.35 };
const WEIGHTS_BROWSE = { recency: 1, importance: 0.6 };

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

export function isMemoryKind(k: unknown): k is MemoryKind {
  return typeof k === 'string' && (MEMORY_KINDS as readonly string[]).includes(k);
}

export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const v = truncate(cleanText(t).toLowerCase().replace(/\s+/g, ' '), MEMORY_LIMITS.tagMax);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= MEMORY_LIMITS.tagsMax) break;
  }
  return out;
}

function normalizeImportance(v: unknown, fallback = 0.5): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

function normalizeDate(v: unknown, field: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida em ${field}: ${String(v).slice(0, 40)}`);
  return d.toISOString();
}

function normalizeContent(v: unknown): string {
  const c = cleanText(String(v ?? ''));
  if (!c) throw new Error('A memória precisa de um conteúdo.');
  if ([...c].length > MEMORY_LIMITS.contentMax) throw new Error(`Memória muito longa (máximo de ${MEMORY_LIMITS.contentMax} caracteres).`);
  return c;
}

function rowToItem(r: MemoryRow): MemoryItem {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(r.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    /* etiquetas corrompidas viram lista vazia */
  }
  const item: MemoryItem = {
    id: r.id,
    kind: r.kind,
    content: r.content,
    tags,
    importance: r.importance,
    source: r.source,
    sensitive: r.sensitive === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    accessCount: r.access_count,
  };
  if (r.last_accessed_at) item.lastAccessedAt = r.last_accessed_at;
  if (r.expires_at) item.expiresAt = r.expires_at;
  return item;
}

export class SqliteMemoryStore implements MemoryStore {
  readonly vectors: VectorIndex;
  private readonly db: SqliteDb;
  private readonly logger: Logger;

  constructor(appDb: AppDatabase, opts: SqliteMemoryStoreOptions = {}) {
    this.db = appDb.db;
    this.logger = opts.logger ?? silentLogger;
    this.vectors = new VectorIndex(this.db, appDb.vectorAvailable, this.logger, opts.vector);
    if (opts.embeddings) this.vectors.setProvider(opts.embeddings);
  }

  /** Troca o provedor de embeddings (ex.: o dono mudou a configuração). undefined = só texto. */
  setEmbeddingProvider(provider: EmbeddingProvider | undefined): void {
    this.vectors.setProvider(provider);
  }

  /** Espera os embeddings pendentes deste momento serem gerados (útil ao fechar e em testes). */
  whenEmbeddingsIdle(): Promise<void> {
    return this.vectors.whenIdle();
  }

  dispose(): void {
    this.vectors.dispose();
  }

  private rowById(id: string): MemoryRow | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE id = ?').get(String(id)) as MemoryRow | undefined;
  }

  async add(input: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'> & { id?: string }): Promise<MemoryItem> {
    const id = input.id ? cleanText(input.id).slice(0, 100) : newId('mem');
    if (!id) throw new Error('Identificador de memória inválido.');
    const kind = input.kind ?? 'fact';
    if (!isMemoryKind(kind)) throw new Error(`Tipo de memória inválido: ${String(kind)}`);
    const content = normalizeContent(input.content);
    const tags = normalizeTags(input.tags);
    const importance = normalizeImportance(input.importance);
    const source = truncate(cleanText(input.source ?? '') || 'usuario', 200);
    const expiresAt = normalizeDate(input.expiresAt, 'expiresAt');
    const lastAccessedAt = normalizeDate(input.lastAccessedAt, 'lastAccessedAt');
    const now = nowIso();
    try {
      this.db
        .prepare(
          `INSERT INTO memories (id, kind, content, tags, importance, source, sensitive, created_at, updated_at, last_accessed_at, access_count, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        )
        .run(id, kind, content, JSON.stringify(tags), importance, source, input.sensitive ? 1 : 0, now, now, lastAccessedAt ?? null, expiresAt ?? null);
    } catch (err) {
      if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') throw new Error('Já existe uma memória com este identificador.');
      throw err;
    }
    if (!input.sensitive) this.vectors.markDirty();
    return rowToItem(this.rowById(id)!);
  }

  async update(
    id: string,
    patch: Partial<Pick<MemoryItem, 'content' | 'tags' | 'importance' | 'kind' | 'sensitive' | 'expiresAt'>>,
  ): Promise<MemoryItem | null> {
    const row = this.rowById(id);
    if (!row) return null;
    const sets: string[] = [];
    const params: unknown[] = [];
    let contentChanged = false;
    if (patch.content !== undefined) {
      const c = normalizeContent(patch.content);
      if (c !== row.content) {
        sets.push('content = ?', 'embedding_sig = NULL');
        params.push(c);
        contentChanged = true;
      }
    }
    if (patch.tags !== undefined) {
      sets.push('tags = ?');
      params.push(JSON.stringify(normalizeTags(patch.tags)));
    }
    if (patch.importance !== undefined) {
      sets.push('importance = ?');
      params.push(normalizeImportance(patch.importance, row.importance));
    }
    if (patch.kind !== undefined) {
      if (!isMemoryKind(patch.kind)) throw new Error(`Tipo de memória inválido: ${String(patch.kind)}`);
      sets.push('kind = ?');
      params.push(patch.kind);
    }
    let becameSensitive = false;
    if (patch.sensitive !== undefined) {
      const s = patch.sensitive ? 1 : 0;
      if (s !== row.sensitive) {
        sets.push('sensitive = ?', 'embedding_sig = NULL');
        params.push(s);
        becameSensitive = s === 1;
      }
    }
    if (patch.expiresAt !== undefined) {
      // '' (ou null vindo de fora) remove a data de expiração.
      sets.push('expires_at = ?');
      params.push(normalizeDate(patch.expiresAt, 'expiresAt') ?? null);
    }
    if (!sets.length) return rowToItem(row);
    sets.push('updated_at = ?');
    params.push(nowIso());
    const uniqueSets = [...new Set(sets)];
    // embedding_sig = NULL pode aparecer duas vezes; os parâmetros só existem para os "?".
    this.db.prepare(`UPDATE memories SET ${uniqueSets.join(', ')} WHERE num = ?`).run(...params, row.num);
    if (contentChanged || becameSensitive) this.vectors.remove(row.num);
    const sensitiveNow = patch.sensitive !== undefined ? !!patch.sensitive : row.sensitive === 1;
    if (!sensitiveNow && (contentChanged || patch.sensitive !== undefined)) this.vectors.markDirty();
    return rowToItem(this.rowById(id)!);
  }

  async remove(id: string): Promise<boolean> {
    const row = this.rowById(id);
    if (!row) return false;
    const res = this.db.prepare('DELETE FROM memories WHERE num = ?').run(row.num);
    this.vectors.remove(row.num);
    return res.changes > 0;
  }

  async get(id: string): Promise<MemoryItem | null> {
    const row = this.rowById(id);
    return row ? rowToItem(row) : null;
  }

  async list(opts: { kind?: MemoryKind; limit?: number; offset?: number } = {}): Promise<MemoryItem[]> {
    const limit = clampInt(opts.limit, MEMORY_LIMITS.listDefault, 1, MEMORY_LIMITS.listMax);
    const offset = clampInt(opts.offset, 0, 0, Number.MAX_SAFE_INTEGER);
    const params: unknown[] = [nowIso()];
    let where = '(expires_at IS NULL OR expires_at > ?)';
    if (opts.kind !== undefined) {
      if (!isMemoryKind(opts.kind)) return [];
      where += ' AND kind = ?';
      params.push(opts.kind);
    }
    const rows = this.db
      .prepare(`SELECT * FROM memories WHERE ${where} ORDER BY updated_at DESC, num DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as MemoryRow[];
    return rows.map(rowToItem);
  }

  async count(): Promise<number> {
    const row = this.db.prepare('SELECT count(*) AS n FROM memories WHERE expires_at IS NULL OR expires_at > ?').get(nowIso()) as { n: number };
    return row.n;
  }

  async exportAll(): Promise<{ version: 1; exportedAt: string; items: MemoryItem[] }> {
    const rows = this.db.prepare('SELECT * FROM memories ORDER BY created_at, num').all() as MemoryRow[];
    return { version: 1, exportedAt: nowIso(), items: rows.map(rowToItem) };
  }

  /** Apaga memórias cuja data de expiração já passou. Retorna quantas saíram. */
  purgeExpired(now = nowIso()): number {
    const rows = this.db.prepare('SELECT num FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ?').all(now) as { num: number }[];
    if (!rows.length) return 0;
    const del = this.db.prepare('DELETE FROM memories WHERE num = ?');
    this.db.transaction(() => {
      for (const r of rows) del.run(r.num);
    })();
    for (const r of rows) this.vectors.remove(r.num);
    this.logger.info('memórias expiradas removidas', { n: rows.length });
    return rows.length;
  }

  private filterSql(q: MemoryQuery, now: string): { sql: string; params: unknown[] } | null {
    const where = ['(m.expires_at IS NULL OR m.expires_at > ?)'];
    const params: unknown[] = [now];
    if (!q.includeSensitive) where.push('m.sensitive = 0');
    if (q.kinds && q.kinds.length) {
      const kinds = [...new Set(q.kinds.filter(isMemoryKind))];
      if (!kinds.length) return null;
      where.push(`m.kind IN (${kinds.map(() => '?').join(', ')})`);
      params.push(...kinds);
    }
    if (q.tags && q.tags.length) {
      for (const t of normalizeTags(q.tags)) {
        where.push('EXISTS (SELECT 1 FROM json_each(m.tags) WHERE json_each.value = ?)');
        params.push(t);
      }
    }
    return { sql: where.join(' AND '), params };
  }

  private rowsByNum(nums: number[]): Map<number, MemoryRow> {
    const out = new Map<number, MemoryRow>();
    for (let i = 0; i < nums.length; i += 500) {
      const chunk = nums.slice(i, i + 500);
      const rows = this.db.prepare(`SELECT * FROM memories WHERE num IN (${chunk.map(() => '?').join(', ')})`).all(...chunk) as MemoryRow[];
      for (const r of rows) out.set(r.num, r);
    }
    return out;
  }

  async search(q: MemorySearchOptions = {}): Promise<MemorySearchResult[]> {
    const limit = clampInt(q.limit, MEMORY_LIMITS.searchDefault, 1, MEMORY_LIMITS.searchMax);
    const now = nowIso();
    const filter = this.filterSql(q, now);
    if (!filter) return [];
    const text = truncate(cleanText(q.text ?? ''), 1000);
    const pool = Math.max(limit * 5, 40);

    let results: MemorySearchResult[];
    let nums: number[];
    const ftsQuery = text ? buildFtsQuery(text, { mode: 'or' }) : null;
    // O texto da consulta só vai ao provedor de embeddings se não for sensível.
    const useVectors = !!text && q.vectors !== false && this.vectors.enabled && !looksSensitive(text);

    if (!text || (!ftsQuery && !useVectors)) {
      // Sem texto útil: memórias recentes e importantes.
      const byRecency = this.db
        .prepare(`SELECT m.num FROM memories m WHERE ${filter.sql} ORDER BY m.updated_at DESC, m.num DESC LIMIT ?`)
        .all(...filter.params, pool) as { num: number }[];
      const byImportance = this.db
        .prepare(`SELECT m.num FROM memories m WHERE ${filter.sql} ORDER BY m.importance DESC, m.updated_at DESC LIMIT ?`)
        .all(...filter.params, pool) as { num: number }[];
      const scores = new Map<number, number>();
      byRecency.forEach((r, i) => scores.set(r.num, (scores.get(r.num) ?? 0) + WEIGHTS_BROWSE.recency / (RRF_K + i + 1)));
      byImportance.forEach((r, i) => scores.set(r.num, (scores.get(r.num) ?? 0) + WEIGHTS_BROWSE.importance / (RRF_K + i + 1)));
      nums = [...scores.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).slice(0, limit).map(([n]) => n);
      const rows = this.rowsByNum(nums);
      results = nums.filter((n) => rows.has(n)).map((n) => ({ item: rowToItem(rows.get(n)!), score: scores.get(n)!, matchedBy: ['recency'] }));
    } else {
      const ftsNums: number[] = [];
      if (ftsQuery) {
        try {
          const rows = this.db
            .prepare(
              `SELECT m.num FROM memories_fts f JOIN memories m ON m.num = f.rowid
               WHERE memories_fts MATCH ? AND ${filter.sql}
               ORDER BY bm25(memories_fts, 1.0, 0.4) LIMIT ?`,
            )
            .all(ftsQuery, ...filter.params, pool) as { num: number }[];
          for (const r of rows) ftsNums.push(r.num);
        } catch (err) {
          this.logger.warn('busca por texto falhou', err);
        }
      }
      const vecNums: number[] = [];
      if (useVectors) {
        const hits = await this.vectors.query(text, pool * 2, q.signal);
        if (hits.length) {
          const allowed = new Set<number>();
          const ids = hits.map((h) => h.num);
          for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const rows = this.db
              .prepare(`SELECT m.num FROM memories m WHERE m.num IN (${chunk.map(() => '?').join(', ')}) AND ${filter.sql}`)
              .all(...chunk, ...filter.params) as { num: number }[];
            for (const r of rows) allowed.add(r.num);
          }
          for (const h of hits) if (allowed.has(h.num) && vecNums.length < pool) vecNums.push(h.num);
        }
      }
      const candidates = [...new Set([...ftsNums, ...vecNums])];
      if (!candidates.length) return [];
      const rows = this.rowsByNum(candidates);
      const present = candidates.filter((n) => rows.has(n));
      const ftsRank = new Map(ftsNums.map((n, i) => [n, i + 1]));
      const vecRank = new Map(vecNums.map((n, i) => [n, i + 1]));
      const recRank = rankBy(present, (n) => rows.get(n)!.updated_at, 'desc');
      const impRank = rankBy(present, (n) => rows.get(n)!.importance, 'desc');
      const scored = present.map((n) => {
        let s = 0;
        const by: MemorySearchResult['matchedBy'] = [];
        const fr = ftsRank.get(n);
        const vr = vecRank.get(n);
        if (fr) {
          s += WEIGHTS_TEXT.fts / (RRF_K + fr);
          by.push('fts');
        }
        if (vr) {
          s += WEIGHTS_TEXT.vector / (RRF_K + vr);
          by.push('vector');
        }
        s += WEIGHTS_TEXT.recency / (RRF_K + recRank.get(n)!);
        s += WEIGHTS_TEXT.importance / (RRF_K + impRank.get(n)!);
        return { n, s, by };
      });
      scored.sort((a, b) => b.s - a.s || b.n - a.n);
      const top = scored.slice(0, limit);
      nums = top.map((t) => t.n);
      results = top.map((t) => ({ item: rowToItem(rows.get(t.n)!), score: t.s, matchedBy: t.by }));
    }

    if (q.touch !== false && results.length) {
      const ts = nowIso();
      const upd = this.db.prepare('UPDATE memories SET access_count = access_count + 1, last_accessed_at = ? WHERE num = ?');
      this.db.transaction(() => {
        for (const n of nums) upd.run(ts, n);
      })();
      for (const r of results) {
        r.item.accessCount += 1;
        r.item.lastAccessedAt = ts;
      }
    }
    return results;
  }
}

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback;
  return Math.min(max, Math.max(min, n));
}

function rankBy<T extends string | number>(nums: number[], key: (n: number) => T, dir: 'asc' | 'desc'): Map<number, number> {
  const sorted = [...nums].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const c = ka < kb ? -1 : ka > kb ? 1 : 0;
    return dir === 'desc' ? -c || b - a : c || a - b;
  });
  return new Map(sorted.map((n, i) => [n, i + 1]));
}
