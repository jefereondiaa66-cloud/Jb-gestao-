/**
 * Agendamentos (lembretes, tarefas do agente, resumo diário) e o histórico
 * de execuções. A validação da expressão cron fica com o agendador; aqui
 * garantimos que o registro é coerente (cron OU runAt, ação válida).
 */
import type { JobRun, ScheduleAction, ScheduleItem, ScheduleStore } from '../types';
import { newId, nowIso } from '../util/ids';
import type { AppDatabase, SqliteDb } from './database';
import { cleanText, truncate } from './text';

const RUN_STATUSES: readonly JobRun['status'][] = ['executando', 'ok', 'falhou', 'cancelado', 'aguardando_aprovacao'];
/** Histórico de execuções mais antigo que isso é limpo ao abrir. */
const RUNS_RETENTION_DAYS = 365;
const OUTPUT_MAX = 20_000;

interface ScheduleRow {
  id: string;
  name: string;
  cron: string | null;
  run_at: string | null;
  timezone: string | null;
  action: string;
  enabled: number;
  created_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
}

interface RunRow {
  id: string;
  schedule_id: string;
  started_at: string;
  finished_at: string | null;
  status: JobRun['status'];
  output: string | null;
}

export function validateScheduleAction(a: unknown): ScheduleAction {
  const x = a as Record<string, unknown> | null;
  if (!x || typeof x !== 'object') throw new Error('Ação do agendamento ausente.');
  switch (x.type) {
    case 'lembrete': {
      const message = truncate(cleanText(String(x.message ?? '')), 2000);
      if (!message) throw new Error('O lembrete precisa de uma mensagem.');
      return { type: 'lembrete', message };
    }
    case 'tarefa_agente': {
      const prompt = truncate(cleanText(String(x.prompt ?? '')), 8000);
      if (!prompt) throw new Error('A tarefa agendada precisa de uma instrução.');
      return { type: 'tarefa_agente', prompt };
    }
    case 'resumo_diario':
      return { type: 'resumo_diario' };
    default:
      throw new Error(`Tipo de ação de agendamento inválido: ${String(x.type)}`);
  }
}

function isoOrNull(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida em ${field}.`);
  return d.toISOString();
}

function optStr(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = truncate(cleanText(String(v)), max);
  return s || null;
}

function rowToSchedule(r: ScheduleRow): ScheduleItem {
  const s: ScheduleItem = {
    id: r.id,
    name: r.name,
    action: JSON.parse(r.action) as ScheduleAction,
    enabled: r.enabled === 1,
    createdAt: r.created_at,
  };
  if (r.cron !== null) s.cron = r.cron;
  if (r.run_at !== null) s.runAt = r.run_at;
  if (r.timezone !== null) s.timezone = r.timezone;
  if (r.last_run_at !== null) s.lastRunAt = r.last_run_at;
  if (r.next_run_at !== null) s.nextRunAt = r.next_run_at;
  return s;
}

function rowToRun(r: RunRow): JobRun {
  const j: JobRun = { id: r.id, scheduleId: r.schedule_id, startedAt: r.started_at, status: r.status };
  if (r.finished_at !== null) j.finishedAt = r.finished_at;
  if (r.output !== null) j.output = r.output;
  return j;
}

function checkRunStatus(s: unknown): JobRun['status'] {
  if (!RUN_STATUSES.includes(s as JobRun['status'])) throw new Error(`Situação de execução inválida: ${String(s)}`);
  return s as JobRun['status'];
}

export class SqliteScheduleStore implements ScheduleStore {
  private readonly db: SqliteDb;

  constructor(appDb: AppDatabase) {
    this.db = appDb.db;
    this.db
      .prepare(`DELETE FROM job_runs WHERE started_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)`)
      .run(`-${RUNS_RETENTION_DAYS} days`);
  }

  async list(): Promise<ScheduleItem[]> {
    const rows = this.db.prepare('SELECT * FROM schedules ORDER BY created_at, rowid').all() as ScheduleRow[];
    return rows.map(rowToSchedule);
  }

  async get(id: string): Promise<ScheduleItem | null> {
    const r = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(String(id)) as ScheduleRow | undefined;
    return r ? rowToSchedule(r) : null;
  }

  async create(input: Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunAt' | 'nextRunAt'> & { nextRunAt?: string }): Promise<ScheduleItem> {
    const name = truncate(cleanText(String(input.name ?? '')).replace(/\s+/g, ' '), 200);
    if (!name) throw new Error('O agendamento precisa de um nome.');
    const cron = optStr(input.cron, 200);
    const runAt = isoOrNull(input.runAt, 'runAt');
    if (!cron && !runAt) throw new Error('Informe uma expressão cron ou uma data e hora única.');
    if (cron && runAt) throw new Error('Use cron OU data e hora única, não os dois.');
    const action = validateScheduleAction(input.action);
    const id = newId('agenda');
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO schedules (id, name, cron, run_at, timezone, action, enabled, created_at, last_run_at, next_run_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(id, name, cron, runAt, optStr(input.timezone, 100), JSON.stringify(action), input.enabled === false ? 0 : 1, now, isoOrNull(input.nextRunAt, 'nextRunAt'));
    return (await this.get(id))!;
  }

  async update(id: string, patch: Partial<Omit<ScheduleItem, 'id' | 'createdAt'>>): Promise<ScheduleItem | null> {
    const row = this.db.prepare('SELECT * FROM schedules WHERE id = ?').get(String(id)) as ScheduleRow | undefined;
    if (!row) return null;
    const p = patch as Record<string, unknown>;
    const next: ScheduleRow = { ...row };
    if (p.name !== undefined) {
      const name = truncate(cleanText(String(p.name ?? '')).replace(/\s+/g, ' '), 200);
      if (!name) throw new Error('O agendamento precisa de um nome.');
      next.name = name;
    }
    if (p.cron !== undefined) next.cron = optStr(p.cron, 200);
    if (p.runAt !== undefined) next.run_at = isoOrNull(p.runAt, 'runAt');
    // Trocar um pelo outro: o novo valor vence.
    if (p.cron !== undefined && next.cron && p.runAt === undefined) next.run_at = null;
    if (p.runAt !== undefined && next.run_at && p.cron === undefined) next.cron = null;
    if (!next.cron && !next.run_at) throw new Error('Informe uma expressão cron ou uma data e hora única.');
    if (next.cron && next.run_at) throw new Error('Use cron OU data e hora única, não os dois.');
    if (p.timezone !== undefined) next.timezone = optStr(p.timezone, 100);
    if (p.action !== undefined) next.action = JSON.stringify(validateScheduleAction(p.action));
    if (p.enabled !== undefined) next.enabled = p.enabled ? 1 : 0;
    if (p.lastRunAt !== undefined) next.last_run_at = isoOrNull(p.lastRunAt, 'lastRunAt');
    if (p.nextRunAt !== undefined) next.next_run_at = isoOrNull(p.nextRunAt, 'nextRunAt');
    this.db
      .prepare(
        `UPDATE schedules SET name = ?, cron = ?, run_at = ?, timezone = ?, action = ?, enabled = ?, last_run_at = ?, next_run_at = ?
         WHERE id = ?`,
      )
      .run(next.name, next.cron, next.run_at, next.timezone, next.action, next.enabled, next.last_run_at, next.next_run_at, row.id);
    return rowToSchedule(next);
  }

  /** Remove o agendamento e o histórico de execuções dele. */
  async remove(id: string): Promise<boolean> {
    let changed = 0;
    this.db.transaction(() => {
      changed = this.db.prepare('DELETE FROM schedules WHERE id = ?').run(String(id)).changes;
      if (changed) this.db.prepare('DELETE FROM job_runs WHERE schedule_id = ?').run(String(id));
    })();
    return changed > 0;
  }

  async addRun(run: JobRun): Promise<void> {
    if (!run || typeof run.id !== 'string' || !run.id) throw new Error('Execução sem identificador.');
    if (typeof run.scheduleId !== 'string' || !run.scheduleId) throw new Error('Execução sem agendamento.');
    this.db
      .prepare('INSERT INTO job_runs (id, schedule_id, started_at, finished_at, status, output) VALUES (?, ?, ?, ?, ?, ?)')
      .run(
        run.id,
        run.scheduleId,
        isoOrNull(run.startedAt, 'startedAt') ?? nowIso(),
        isoOrNull(run.finishedAt, 'finishedAt'),
        checkRunStatus(run.status),
        run.output === undefined ? null : truncate(String(run.output), OUTPUT_MAX),
      );
  }

  async updateRun(id: string, patch: Partial<Omit<JobRun, 'id' | 'scheduleId'>>): Promise<void> {
    const row = this.db.prepare('SELECT * FROM job_runs WHERE id = ?').get(String(id)) as RunRow | undefined;
    if (!row) return;
    const next: RunRow = { ...row };
    if (patch.startedAt !== undefined) next.started_at = isoOrNull(patch.startedAt, 'startedAt') ?? row.started_at;
    if (patch.finishedAt !== undefined) next.finished_at = isoOrNull(patch.finishedAt, 'finishedAt');
    if (patch.status !== undefined) next.status = checkRunStatus(patch.status);
    if (patch.output !== undefined) next.output = patch.output === null ? null : truncate(String(patch.output), OUTPUT_MAX);
    this.db
      .prepare('UPDATE job_runs SET started_at = ?, finished_at = ?, status = ?, output = ? WHERE id = ?')
      .run(next.started_at, next.finished_at, next.status, next.output, row.id);
  }

  async runs(opts: { limit?: number; scheduleId?: string } = {}): Promise<JobRun[]> {
    const limit = Math.min(Math.max(Number.isFinite(opts.limit) ? Math.floor(opts.limit!) : 50, 1), 1000);
    const rows = (
      opts.scheduleId
        ? this.db.prepare('SELECT * FROM job_runs WHERE schedule_id = ? ORDER BY started_at DESC, rowid DESC LIMIT ?').all(opts.scheduleId, limit)
        : this.db.prepare('SELECT * FROM job_runs ORDER BY started_at DESC, rowid DESC LIMIT ?').all(limit)
    ) as RunRow[];
    return rows.map(rowToRun);
  }
}
