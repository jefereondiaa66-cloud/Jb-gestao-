import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '@core/memory/database';
import { createStores, type Stores } from '@core/memory/stores';
import { capturingLogger, tempDir } from './helpers';

describe('tarefas', () => {
  let db: AppDatabase;
  let s: Stores;
  beforeEach(() => {
    db = openDatabase({ path: ':memory:' });
    s = createStores(db);
  });
  afterEach(() => {
    s.dispose();
    db.close();
  });

  it('CRUD com conclusão automática e ordenação', async () => {
    const a = await s.tasks.create({ title: 'Pagar conta de luz', dueAt: '2026-11-10', priority: 'alta' });
    expect(a).toMatchObject({ status: 'pendente', priority: 'alta', dueAt: '2026-11-10' });
    expect(a.completedAt).toBeUndefined();
    const b = await s.tasks.create({ title: 'Ligar para o contador', dueAt: '2026-11-05T14:30:00-03:00', project: 'Empresa' });
    expect(b.dueAt).toBe('2026-11-05T17:30:00.000Z');
    expect(b.priority).toBe('media');
    const c = await s.tasks.create({ title: 'Ler livro', notes: 'capítulo 3' });
    const doing = await s.tasks.update(c.id, { status: 'em_andamento' });
    expect(doing?.status).toBe('em_andamento');
    expect((await s.tasks.list()).map((t) => t.id)).toEqual([c.id, b.id, a.id]);
    const done = await s.tasks.update(a.id, { status: 'concluida' });
    expect(done?.completedAt).toBeDefined();
    expect((await s.tasks.list({ status: 'concluida' })).map((t) => t.id)).toEqual([a.id]);
    const reopened = await s.tasks.update(a.id, { status: 'pendente' });
    expect(reopened?.completedAt).toBeUndefined();
    // '' limpa campos opcionais
    const cleared = await s.tasks.update(b.id, { dueAt: '', project: '', notes: '' });
    expect(cleared?.dueAt).toBeUndefined();
    expect(cleared?.project).toBeUndefined();
    expect((await s.tasks.list({ project: 'empresa' })).length).toBe(0);
    expect(await s.tasks.update('nada', { title: 'x' })).toBeNull();
    expect(await s.tasks.remove(c.id)).toBe(true);
    expect(await s.tasks.remove(c.id)).toBe(false);
    expect(await s.tasks.list()).toHaveLength(2);
  });

  it('valida dados', async () => {
    await expect(s.tasks.create({ title: '  ' })).rejects.toThrow(/título/);
    await expect(s.tasks.create({ title: 'x', dueAt: '2026-02-30' })).rejects.toThrow(/Data inválida/);
    await expect(s.tasks.create({ title: 'x', status: 'feito' as never })).rejects.toThrow(/Situação/);
    await expect(s.tasks.create({ title: 'x', priority: 'urgente' as never })).rejects.toThrow(/Prioridade/);
  });
});

describe('agendamentos', () => {
  let db: AppDatabase;
  let s: Stores;
  beforeEach(() => {
    db = openDatabase({ path: ':memory:' });
    s = createStores(db);
  });
  afterEach(() => {
    s.dispose();
    db.close();
  });

  it('CRUD de agendamentos e execuções', async () => {
    const a = await s.schedules.create({ name: 'Resumo da manhã', cron: '0 8 * * 1-5', timezone: 'America/Sao_Paulo', action: { type: 'resumo_diario' }, enabled: true });
    expect(a).toMatchObject({ name: 'Resumo da manhã', cron: '0 8 * * 1-5', enabled: true, action: { type: 'resumo_diario' } });
    const b = await s.schedules.create({
      name: 'Remédio',
      runAt: '2026-11-03T09:00:00-03:00',
      action: { type: 'lembrete', message: 'Tomar remédio' },
      enabled: true,
      nextRunAt: '2026-11-03T12:00:00.000Z',
    });
    expect(b.runAt).toBe('2026-11-03T12:00:00.000Z');
    expect(b.nextRunAt).toBe('2026-11-03T12:00:00.000Z');
    expect((await s.schedules.list()).map((x) => x.id)).toEqual([a.id, b.id]);
    const upd = await s.schedules.update(a.id, { enabled: false, lastRunAt: '2026-11-02T11:00:00.000Z', action: { type: 'tarefa_agente', prompt: 'Resumir e-mails' } });
    expect(upd).toMatchObject({ enabled: false, lastRunAt: '2026-11-02T11:00:00.000Z', action: { type: 'tarefa_agente', prompt: 'Resumir e-mails' } });
    // trocar cron por data única
    const sw = await s.schedules.update(a.id, { runAt: '2026-12-01T10:00:00Z' });
    expect(sw?.cron).toBeUndefined();
    expect(sw?.runAt).toBe('2026-12-01T10:00:00.000Z');
    expect(await s.schedules.get(a.id)).toEqual(sw);

    await s.schedules.addRun({ id: 'r1', scheduleId: b.id, startedAt: '2026-11-03T12:00:00.000Z', status: 'executando' });
    await s.schedules.addRun({ id: 'r2', scheduleId: a.id, startedAt: '2026-11-03T13:00:00.000Z', status: 'aguardando_aprovacao' });
    await s.schedules.updateRun('r1', { status: 'ok', finishedAt: '2026-11-03T12:00:05.000Z', output: 'Lembrete enviado' });
    const runs = await s.schedules.runs();
    expect(runs.map((r) => r.id)).toEqual(['r2', 'r1']);
    expect(runs[1]).toEqual({ id: 'r1', scheduleId: b.id, startedAt: '2026-11-03T12:00:00.000Z', finishedAt: '2026-11-03T12:00:05.000Z', status: 'ok', output: 'Lembrete enviado' });
    expect((await s.schedules.runs({ scheduleId: b.id })).map((r) => r.id)).toEqual(['r1']);
    expect(await s.schedules.remove(b.id)).toBe(true);
    expect(await s.schedules.runs({ scheduleId: b.id })).toEqual([]);
    expect(await s.schedules.remove(b.id)).toBe(false);
  });

  it('valida agendamentos', async () => {
    await expect(s.schedules.create({ name: 'x', action: { type: 'resumo_diario' }, enabled: true })).rejects.toThrow(/cron ou uma data/);
    await expect(s.schedules.create({ name: 'x', cron: '* * * * *', runAt: '2026-01-01', action: { type: 'resumo_diario' }, enabled: true })).rejects.toThrow(/não os dois/);
    await expect(s.schedules.create({ name: 'x', cron: '* * * * *', action: { type: 'lembrete', message: '' }, enabled: true })).rejects.toThrow(/mensagem/);
    await expect(s.schedules.create({ name: 'x', cron: '* * * * *', action: { type: 'apagar_tudo' } as never, enabled: true })).rejects.toThrow(/inválido/);
    await expect(s.schedules.addRun({ id: 'r', scheduleId: 's', startedAt: new Date().toISOString(), status: 'talvez' as never })).rejects.toThrow(/inválida/);
  });
});

describe('auditoria (só acréscimo)', () => {
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());

  it('registra, lista e oculta segredos', () => {
    const db = openDatabase({ path: ':memory:' });
    const s = createStores(db);
    s.audit.record({ actor: 'agent', kind: 'tool', tool: 'memory_save', risk: 'write', decision: 'allow', outcome: 'ok', input: '{"api_key":"sk-proj-abcdefghijklmnopqrstuvwxyz123456"}' });
    s.audit.record({ actor: 'user', kind: 'setting', detail: 'mudou a voz' });
    s.audit.record({ actor: 'hacker' as never, kind: 'qualquer' as never, detail: 'x'.repeat(5000) });
    const all = s.audit.list();
    expect(all).toHaveLength(3);
    expect(all[0]!.actor).toBe('agent');
    expect(all[0]!.kind).toBe('system');
    expect(all[0]!.detail!.length).toBeLessThanOrEqual(2000);
    expect(all[2]!.input).not.toContain('sk-proj-abcdefghijklmnop');
    expect(s.audit.list({ kind: 'setting' }).map((e) => e.detail)).toEqual(['mudou a voz']);
    expect(s.audit.list({ limit: 1 })).toHaveLength(1);
    expect(all[0]!.id).toBeGreaterThan(all[1]!.id);
    s.dispose();
    db.close();
  });

  it('não há API de alteração; o banco recusa UPDATE e DELETE de registros recentes', () => {
    const db = openDatabase({ path: ':memory:' });
    const s = createStores(db);
    const audit = s.audit as unknown as Record<string, unknown>;
    expect(audit.update).toBeUndefined();
    expect(audit.delete).toBeUndefined();
    expect(audit.remove).toBeUndefined();
    s.audit.record({ actor: 'agent', kind: 'security', detail: 'tentativa' });
    expect(() => db.db.prepare("UPDATE audit SET detail = 'adulterado'").run()).toThrow(/não pode ser alterada/);
    expect(() => db.db.prepare('DELETE FROM audit').run()).toThrow(/não pode ser apagada/);
    expect(s.audit.list()[0]!.detail).toBe('tentativa');
    s.dispose();
    db.close();
  });

  it('ao abrir, remove registros com mais de 365 dias', () => {
    const path = join(t.dir, 'audit.db');
    const db = openDatabase({ path, key: 'k' });
    const s = createStores(db);
    const ins = db.db.prepare("INSERT INTO audit (ts, actor, kind, detail) VALUES (?, 'agent', 'system', ?)");
    ins.run(new Date(Date.now() - 400 * 86_400_000).toISOString(), 'velho');
    ins.run(new Date(Date.now() - 300 * 86_400_000).toISOString(), 'recente');
    s.audit.record({ actor: 'agent', kind: 'system', detail: 'agora' });
    s.dispose();
    db.close();
    const logger = capturingLogger();
    const db2 = openDatabase({ path, key: 'k' });
    const s2 = createStores(db2, { logger });
    expect(s2.audit.list().map((e) => e.detail).sort()).toEqual(['agora', 'recente']);
    expect(logger.lines.some((l) => /registros antigos removidos/.test(l.msg))).toBe(true);
    s2.dispose();
    db2.close();
  });
});
