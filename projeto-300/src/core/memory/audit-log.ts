/**
 * Registro de auditoria: só acréscimo. Não existe API para alterar ou apagar;
 * o próprio banco recusa UPDATE/DELETE (gatilhos), exceto a limpeza automática
 * de registros com mais de 365 dias, feita ao abrir.
 */
import type { Actor, AuditEntry, AuditLog, Logger, RiskLevel } from '../types';
import { redactSecrets } from '../util/logger';
import { nowIso } from '../util/ids';
import type { AppDatabase, SqliteDb } from './database';

export const AUDIT_RETENTION_DAYS = 365;
const INPUT_MAX = 4000;
const DETAIL_MAX = 2000;

const ACTORS: readonly Actor[] = ['user', 'agent', 'scheduler'];
const KINDS: readonly AuditEntry['kind'][] = ['tool', 'permission', 'setting', 'secret', 'memory', 'scheduler', 'security', 'system'];
const RISKS: readonly RiskLevel[] = ['read', 'write', 'external', 'destructive', 'financial', 'system'];
const DECISIONS: readonly NonNullable<AuditEntry['decision']>[] = ['allow', 'deny', 'ask', 'approved', 'rejected', 'timeout'];
const OUTCOMES: readonly NonNullable<AuditEntry['outcome']>[] = ['ok', 'erro', 'bloqueado', 'cancelado'];

interface AuditRow {
  id: number;
  ts: string;
  actor: Actor;
  kind: AuditEntry['kind'];
  tool: string | null;
  risk: RiskLevel | null;
  decision: AuditEntry['decision'] | null;
  input: string | null;
  outcome: AuditEntry['outcome'] | null;
  detail: string | null;
}

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

function clip(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = redactSecrets(String(v));
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return allowed.includes(v as T) ? (v as T) : null;
}

function rowToEntry(r: AuditRow): AuditEntry {
  const e: AuditEntry = { id: r.id, ts: r.ts, actor: r.actor, kind: r.kind };
  if (r.tool !== null) e.tool = r.tool;
  if (r.risk !== null) e.risk = r.risk;
  if (r.decision !== null) e.decision = r.decision;
  if (r.input !== null) e.input = r.input;
  if (r.outcome !== null) e.outcome = r.outcome;
  if (r.detail !== null) e.detail = r.detail;
  return e;
}

export class SqliteAuditLog implements AuditLog {
  private readonly db: SqliteDb;
  private readonly logger: Logger;
  private readonly insert;

  constructor(appDb: AppDatabase, opts: { logger?: Logger } = {}) {
    this.db = appDb.db;
    this.logger = opts.logger ?? silentLogger;
    this.insert = this.db.prepare(
      'INSERT INTO audit (ts, actor, kind, tool, risk, decision, input, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    this.prune();
  }

  /** Remove registros com mais de 365 dias. Retorna quantos saíram. */
  prune(): number {
    try {
      const res = this.db
        .prepare(`DELETE FROM audit WHERE ts < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`)
        .run(`-${AUDIT_RETENTION_DAYS} days`);
      if (res.changes) this.logger.info('auditoria: registros antigos removidos', { n: res.changes });
      return res.changes;
    } catch (err) {
      this.logger.error('auditoria: falha na limpeza de registros antigos', err);
      return 0;
    }
  }

  record(entry: Omit<AuditEntry, 'id' | 'ts'>): void {
    try {
      this.insert.run(
        nowIso(),
        oneOf(entry.actor, ACTORS) ?? 'agent',
        oneOf(entry.kind, KINDS) ?? 'system',
        clip(entry.tool, 200),
        oneOf(entry.risk, RISKS),
        oneOf(entry.decision, DECISIONS),
        clip(entry.input, INPUT_MAX),
        oneOf(entry.outcome, OUTCOMES),
        clip(entry.detail, DETAIL_MAX),
      );
    } catch (err) {
      // Auditoria nunca derruba a ação, mas a falha fica visível no log.
      this.logger.error('auditoria: falha ao registrar', err);
    }
  }

  list(opts: { limit?: number; kind?: AuditEntry['kind'] } = {}): AuditEntry[] {
    const limit = Math.min(Math.max(Number.isFinite(opts.limit) ? Math.floor(opts.limit!) : 200, 1), 5000);
    const rows = (
      opts.kind
        ? this.db.prepare('SELECT * FROM audit WHERE kind = ? ORDER BY id DESC LIMIT ?').all(opts.kind, limit)
        : this.db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').all(limit)
    ) as AuditRow[];
    return rows.map(rowToEntry);
  }
}
