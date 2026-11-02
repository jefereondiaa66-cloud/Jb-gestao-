/** Painel de tarefas: adicionar rápido, concluir, prioridade e apagar. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TaskItem } from '../../../core/types';
import { call } from '../api';
import { PRIORITY_LABEL, errorText, formatDue } from '../lib/format';
import { useDialog } from './Dialog';
import { Spinner } from './controls';
import { IconCheck, IconPlus, IconTrash } from './icons';

const PRIORITY_ORDER: Record<TaskItem['priority'], number> = { alta: 0, media: 1, baixa: 2 };
const NEXT_PRIORITY: Record<TaskItem['priority'], TaskItem['priority']> = { baixa: 'media', media: 'alta', alta: 'baixa' };

export function TasksPanel({ rev, notify }: { rev: number; notify: (title: string, body?: string) => void }) {
  const [tasks, setTasks] = useState<TaskItem[] | null>(null);
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const ask = useDialog();

  const load = useCallback(async () => {
    try {
      setTasks(await call('tasks:list'));
    } catch (e) {
      setTasks((t) => t ?? []);
      notify('Não foi possível carregar as tarefas', errorText(e));
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load, rev]);

  const { open, done } = useMemo(() => {
    const all = tasks ?? [];
    const open = all
      .filter((t) => t.status === 'pendente' || t.status === 'em_andamento')
      .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9') || b.createdAt.localeCompare(a.createdAt));
    const done = all.filter((t) => t.status === 'concluida').sort((a, b) => (b.completedAt ?? b.updatedAt).localeCompare(a.completedAt ?? a.updatedAt));
    return { open, done };
  }, [tasks]);

  const patch = async (t: TaskItem, p: Partial<Omit<TaskItem, 'id' | 'createdAt'>>) => {
    // atualização otimista
    setTasks((list) => list?.map((x) => (x.id === t.id ? { ...x, ...p } : x)) ?? list);
    try {
      const updated = await call('tasks:update', { id: t.id, patch: p });
      if (updated) setTasks((list) => list?.map((x) => (x.id === t.id ? updated : x)) ?? list);
    } catch (e) {
      notify('Não foi possível atualizar a tarefa', errorText(e));
      void load();
    }
  };

  const add = async () => {
    const t = title.trim();
    if (!t || adding) return;
    setAdding(true);
    try {
      const created = await call('tasks:create', { title: t.slice(0, 300) });
      setTasks((list) => [created, ...(list ?? []).filter((x) => x.id !== created.id)]);
      setTitle('');
    } catch (e) {
      notify('Não foi possível criar a tarefa', errorText(e));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (t: TaskItem) => {
    const ok = await ask({ title: 'Apagar tarefa?', message: <>A tarefa “{t.title}” será apagada.</>, confirmLabel: 'Apagar', danger: true });
    if (!ok) return;
    try {
      await call('tasks:delete', { id: t.id });
      setTasks((list) => list?.filter((x) => x.id !== t.id) ?? list);
    } catch (e) {
      notify('Não foi possível apagar a tarefa', errorText(e));
    }
  };

  const toggle = (t: TaskItem) => {
    const completing = t.status !== 'concluida';
    void patch(t, completing ? { status: 'concluida', completedAt: new Date().toISOString() } : { status: 'pendente', completedAt: undefined });
  };

  const row = (t: TaskItem) => {
    const due = t.dueAt ? formatDue(t.dueAt) : null;
    const isDone = t.status === 'concluida';
    return (
      <li key={t.id} className={'task' + (isDone ? ' is-done' : '')}>
        <button type="button" className={'task-check' + (isDone ? ' is-checked' : '')} role="checkbox" aria-checked={isDone} aria-label={isDone ? `Reabrir: ${t.title}` : `Concluir: ${t.title}`} onClick={() => toggle(t)}>
          {isDone && <IconCheck size={12} />}
        </button>
        <div className="task-main">
          <span className="task-title">{t.title}</span>
          <span className="task-meta">
            {t.status === 'em_andamento' && <span className="tone-text-cyan">em andamento</span>}
            {due && <span className={due.overdue && !isDone ? 'tone-text-red' : ''}>{due.overdue && !isDone ? `atrasada · ${due.text}` : due.text}</span>}
            {t.project && <span>{t.project}</span>}
          </span>
        </div>
        {!isDone && (
          <button type="button" className={`prio prio-${t.priority}`} onClick={() => void patch(t, { priority: NEXT_PRIORITY[t.priority] })} title={`Prioridade ${PRIORITY_LABEL[t.priority]} (clique para mudar)`} aria-label={`Prioridade ${PRIORITY_LABEL[t.priority]}. Clique para mudar.`}>
            <span aria-hidden="true" />
          </button>
        )}
        <button type="button" className="icon-btn danger task-del" onClick={() => void remove(t)} aria-label={`Apagar tarefa ${t.title}`}>
          <IconTrash size={14} />
        </button>
      </li>
    );
  };

  return (
    <section className="panel tasks" aria-label="Tarefas">
      <header className="panel-head">
        <h2 className="panel-title">Tarefas</h2>
        {tasks && <span className="panel-count">{open.length}</span>}
      </header>
      <form
        className="task-add"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nova tarefa…" aria-label="Nova tarefa" maxLength={300} />
        <button type="submit" className="icon-btn icon-btn-solid" disabled={!title.trim() || adding} aria-label="Adicionar tarefa">
          {adding ? <Spinner size={14} /> : <IconPlus size={16} />}
        </button>
      </form>
      <div className="panel-scroll">
        {tasks === null ? (
          <div className="panel-empty">
            <Spinner size={16} />
          </div>
        ) : open.length === 0 && done.length === 0 ? (
          <div className="panel-empty">Nenhuma tarefa. Adicione acima ou peça ao 300.</div>
        ) : (
          <>
            <ul className="task-list">{open.map(row)}</ul>
            {open.length === 0 && <div className="panel-empty small">Tudo em dia.</div>}
            {done.length > 0 && (
              <>
                <button type="button" className="link-btn task-done-toggle" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                  {showDone ? 'Ocultar concluídas' : `Mostrar concluídas (${done.length})`}
                </button>
                {showDone && <ul className="task-list">{done.slice(0, 50).map(row)}</ul>}
              </>
            )}
          </>
        )}
      </div>
    </section>
  );
}
