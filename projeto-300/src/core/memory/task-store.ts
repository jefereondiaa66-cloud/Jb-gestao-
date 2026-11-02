/**
 * Tarefas do dono (planejador). Concluir uma tarefa preenche completedAt;
 * reabrir limpa. Campos opcionais de texto/data aceitam '' (ou null) para limpar.
 */
import type { TaskItem, TaskStatus, TaskStore } from '../types';
import { newId, nowIso } from '../util/ids';
import type { AppDatabase, SqliteDb } from './database';
import { cleanText, truncate } from './text';

export const TASK_STATUSES: readonly TaskStatus[] = ['pendente', 'em_andamento', 'concluida', 'cancelada'];
export const TASK_PRIORITIES: readonly TaskItem['priority'][] = ['baixa', 'media', 'alta'];

interface TaskRow {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskItem['priority'];
  project: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToTask(r: TaskRow): TaskItem {
  const t: TaskItem = { id: r.id, title: r.title, status: r.status, priority: r.priority, createdAt: r.created_at, updatedAt: r.updated_at };
  if (r.notes !== null) t.notes = r.notes;
  if (r.project !== null) t.project = r.project;
  if (r.due_at !== null) t.dueAt = r.due_at;
  if (r.completed_at !== null) t.completedAt = r.completed_at;
  return t;
}

/** Data de vencimento: 'AAAA-MM-DD' fica como está (dia inteiro); data e hora vira ISO em UTC. */
export function normalizeDueDate(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T12:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw new Error(`Data inválida: ${s}`);
    return s;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida: ${s.slice(0, 40)}`);
  return d.toISOString();
}

function normalizeTimestamp(v: unknown, field: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new Error(`Data inválida em ${field}.`);
  return d.toISOString();
}

function optText(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = truncate(cleanText(String(v)), max);
  return s || null;
}

function requireTitle(v: unknown): string {
  const t = truncate(cleanText(String(v ?? '')).replace(/\s+/g, ' '), 300);
  if (!t) throw new Error('A tarefa precisa de um título.');
  return t;
}

function checkStatus(s: unknown): TaskStatus {
  if (!TASK_STATUSES.includes(s as TaskStatus)) throw new Error(`Situação de tarefa inválida: ${String(s)}`);
  return s as TaskStatus;
}

function checkPriority(p: unknown): TaskItem['priority'] {
  if (!TASK_PRIORITIES.includes(p as TaskItem['priority'])) throw new Error(`Prioridade inválida: ${String(p)}`);
  return p as TaskItem['priority'];
}

export class SqliteTaskStore implements TaskStore {
  private readonly db: SqliteDb;

  constructor(appDb: AppDatabase) {
    this.db = appDb.db;
  }

  async get(id: string): Promise<TaskItem | null> {
    const r = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(String(id)) as TaskRow | undefined;
    return r ? rowToTask(r) : null;
  }

  async create(input: Pick<TaskItem, 'title'> & Partial<Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TaskItem> {
    const id = newId('tarefa');
    const now = nowIso();
    const status = input.status !== undefined ? checkStatus(input.status) : 'pendente';
    const priority = input.priority !== undefined ? checkPriority(input.priority) : 'media';
    const completedAt = status === 'concluida' ? (normalizeTimestamp(input.completedAt, 'completedAt') ?? now) : null;
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, notes, status, priority, project, due_at, created_at, updated_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        requireTitle(input.title),
        optText(input.notes, 8000),
        status,
        priority,
        optText(input.project, 120),
        normalizeDueDate(input.dueAt),
        now,
        now,
        completedAt,
      );
    return (await this.get(id))!;
  }

  async update(id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>): Promise<TaskItem | null> {
    const row = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(String(id)) as TaskRow | undefined;
    if (!row) return null;
    const p = patch as Record<string, unknown>;
    const next: TaskRow = { ...row };
    if (p.title !== undefined) next.title = requireTitle(p.title);
    if (p.notes !== undefined) next.notes = optText(p.notes, 8000);
    if (p.project !== undefined) next.project = optText(p.project, 120);
    if (p.dueAt !== undefined) next.due_at = normalizeDueDate(p.dueAt);
    if (p.priority !== undefined) next.priority = checkPriority(p.priority);
    if (p.status !== undefined) next.status = checkStatus(p.status);
    if (p.completedAt !== undefined) next.completed_at = normalizeTimestamp(p.completedAt, 'completedAt');
    // Concluída sempre tem data de conclusão; reaberta perde a data.
    if (next.status === 'concluida' && !next.completed_at) next.completed_at = nowIso();
    if (next.status !== 'concluida') next.completed_at = null;
    next.updated_at = nowIso();
    this.db
      .prepare(
        `UPDATE tasks SET title = ?, notes = ?, status = ?, priority = ?, project = ?, due_at = ?, updated_at = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(next.title, next.notes, next.status, next.priority, next.project, next.due_at, next.updated_at, next.completed_at, row.id);
    return rowToTask(next);
  }

  async remove(id: string): Promise<boolean> {
    return this.db.prepare('DELETE FROM tasks WHERE id = ?').run(String(id)).changes > 0;
  }

  /**
   * Lista tarefas: em andamento e pendentes primeiro; dentro disso, as que
   * vencem antes, depois prioridade alta, depois as mais antigas.
   */
  async list(opts: { status?: TaskStatus; project?: string; limit?: number } = {}): Promise<TaskItem[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.status !== undefined) {
      where.push('status = ?');
      params.push(checkStatus(opts.status));
    }
    if (opts.project !== undefined && opts.project !== '') {
      where.push('project = ? COLLATE NOCASE');
      params.push(cleanText(opts.project));
    }
    const limit = Math.min(Math.max(Number.isFinite(opts.limit) ? Math.floor(opts.limit!) : 200, 1), 2000);
    const rows = this.db
      .prepare(
        `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY CASE status WHEN 'em_andamento' THEN 0 WHEN 'pendente' THEN 1 WHEN 'concluida' THEN 2 ELSE 3 END,
                  due_at IS NULL, due_at,
                  CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END,
                  created_at, rowid
         LIMIT ?`,
      )
      .all(...params, limit) as TaskRow[];
    return rows.map(rowToTask);
  }
}
