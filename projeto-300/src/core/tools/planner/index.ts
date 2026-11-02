/** Ferramentas do planejador (tarefas do dono). */
import { z } from 'zod';
import { normalizeDueDate } from '../../memory/task-store';
import type { TaskItem, TaskStatus, ToolDefinition, ToolOutput } from '../../types';

const STATUS_VALUES = ['pendente', 'em_andamento', 'concluida', 'cancelada'] as const satisfies readonly TaskStatus[];
const PRIORITY_VALUES = ['baixa', 'media', 'alta'] as const satisfies readonly TaskItem['priority'][];

const STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: 'pendente',
  em_andamento: 'em andamento',
  concluida: 'concluída',
  cancelada: 'cancelada',
};

const dueSchema = z
  .string()
  .max(40)
  .refine((s) => {
    try {
      normalizeDueDate(s);
      return true;
    } catch {
      return false;
    }
  }, { message: 'data inválida (use AAAA-MM-DD ou data e hora ISO 8601)' });

function preview(text: string, max = 80): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length <= max ? t : chars.slice(0, max - 1).join('') + '…';
}

function out(text: string, summary: string, isError = false): ToolOutput {
  return { content: [{ type: 'text', text }], summary, ...(isError ? { isError: true } : {}) };
}

function fail(prefix: string, err: unknown): ToolOutput {
  const msg = `${prefix}: ${err instanceof Error ? err.message : String(err)}`;
  return out(msg, msg, true);
}

function notFound(id: string): ToolOutput {
  const msg = `Tarefa não encontrada: ${id}`;
  return out(msg, msg, true);
}

/* ---------------- task_create ---------------- */
const createSchema = z.object({
  title: z.string().min(1).max(300).describe('O que precisa ser feito.'),
  notes: z.string().max(4000).optional().describe('Detalhes.'),
  priority: z.enum(PRIORITY_VALUES).optional().describe('baixa, media ou alta (padrão media).'),
  project: z.string().max(120).optional().describe('Projeto ou área (opcional).'),
  dueAt: dueSchema.optional().describe('Prazo: AAAA-MM-DD (dia inteiro) ou data e hora ISO 8601.'),
});

export const taskCreateTool: ToolDefinition<z.infer<typeof createSchema>> = {
  name: 'task_create',
  title: 'Criar tarefa',
  description: 'Cria uma tarefa na lista do dono (com prazo, prioridade e projeto opcionais).',
  inputSchema: createSchema,
  risk: 'write',
  describe: (i) => `Criar a tarefa "${preview(i.title, 80)}"${i.dueAt ? ` com prazo ${i.dueAt}` : ''}`,
  async execute(input, ctx) {
    try {
      const task = await ctx.services.tasks.create({
        title: input.title,
        notes: input.notes,
        priority: input.priority ?? 'media',
        project: input.project,
        dueAt: input.dueAt,
      });
      ctx.services.events.emit({ type: 'tasks_changed' });
      return out(JSON.stringify({ situacao: 'criada', tarefa: task }, null, 1), `Tarefa criada: ${preview(task.title, 60)}`);
    } catch (err) {
      return fail('Não foi possível criar a tarefa', err);
    }
  },
};

/* ---------------- task_list ---------------- */
const listSchema = z.object({
  status: z
    .enum(['abertas', 'todas', ...STATUS_VALUES])
    .optional()
    .describe('abertas (pendentes e em andamento, padrão), todas, pendente, em_andamento, concluida ou cancelada.'),
  project: z.string().max(120).optional().describe('Só tarefas deste projeto.'),
  limit: z.number().int().min(1).max(100).optional().describe('Máximo de tarefas (padrão 30).'),
});

export const taskListTool: ToolDefinition<z.infer<typeof listSchema>> = {
  name: 'task_list',
  title: 'Ver tarefas',
  description: 'Lista as tarefas do dono. Por padrão mostra as abertas (pendentes e em andamento), ordenadas por prazo e prioridade.',
  inputSchema: listSchema,
  risk: 'read',
  describe: (i) => `Ver tarefas (${i.status ?? 'abertas'}${i.project ? `, projeto ${i.project}` : ''})`,
  async execute(input, ctx) {
    try {
      const limit = input.limit ?? 30;
      const status = input.status ?? 'abertas';
      const store = ctx.services.tasks;
      let tasks: TaskItem[];
      if (status === 'abertas') {
        const [doing, todo] = await Promise.all([
          store.list({ status: 'em_andamento', project: input.project, limit }),
          store.list({ status: 'pendente', project: input.project, limit }),
        ]);
        tasks = [...doing, ...todo].slice(0, limit);
      } else if (status === 'todas') {
        tasks = await store.list({ project: input.project, limit });
      } else {
        tasks = await store.list({ status, project: input.project, limit });
      }
      const summary = tasks.length ? `${tasks.length} tarefa${tasks.length === 1 ? '' : 's'}` : 'Nenhuma tarefa';
      return out(JSON.stringify({ total: tasks.length, tarefas: tasks }, null, 1), summary);
    } catch (err) {
      return fail('Não foi possível listar as tarefas', err);
    }
  },
};

/* ---------------- task_update ---------------- */
const updateSchema = z.object({
  id: z.string().min(1).max(100).describe('Id da tarefa (vem de task_list).'),
  title: z.string().min(1).max(300).optional(),
  notes: z.string().max(4000).nullable().optional().describe('null apaga as notas.'),
  priority: z.enum(PRIORITY_VALUES).optional(),
  project: z.string().max(120).nullable().optional().describe('null tira do projeto.'),
  dueAt: dueSchema.nullable().optional().describe('Novo prazo; null remove o prazo.'),
  status: z.enum(STATUS_VALUES).optional(),
});

export const taskUpdateTool: ToolDefinition<z.infer<typeof updateSchema>> = {
  name: 'task_update',
  title: 'Alterar tarefa',
  description: 'Altera uma tarefa existente (título, notas, prioridade, projeto, prazo ou situação).',
  inputSchema: updateSchema,
  risk: 'write',
  describe: (i) => `Alterar a tarefa ${i.id}${i.status ? ` (situação: ${STATUS_LABELS[i.status]})` : ''}`,
  async execute(input, ctx) {
    try {
      const patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>> = {};
      if (input.title !== undefined) patch.title = input.title;
      // '' limpa o campo (o repositório entende '' como "remover").
      if (input.notes !== undefined) patch.notes = input.notes ?? '';
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.project !== undefined) patch.project = input.project ?? '';
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt ?? '';
      if (input.status !== undefined) patch.status = input.status;
      if (!Object.keys(patch).length) return out('Nada para alterar.', 'Nenhuma alteração');
      const task = await ctx.services.tasks.update(input.id, patch);
      if (!task) return notFound(input.id);
      ctx.services.events.emit({ type: 'tasks_changed' });
      return out(JSON.stringify({ situacao: 'alterada', tarefa: task }, null, 1), `Tarefa alterada: ${preview(task.title, 60)}`);
    } catch (err) {
      return fail('Não foi possível alterar a tarefa', err);
    }
  },
};

/* ---------------- task_complete ---------------- */
const completeSchema = z.object({
  id: z.string().min(1).max(100).describe('Id da tarefa concluída.'),
});

export const taskCompleteTool: ToolDefinition<z.infer<typeof completeSchema>> = {
  name: 'task_complete',
  title: 'Concluir tarefa',
  description: 'Marca uma tarefa como concluída.',
  inputSchema: completeSchema,
  risk: 'write',
  describe: (i) => `Marcar a tarefa ${i.id} como concluída`,
  async execute(input, ctx) {
    try {
      const task = await ctx.services.tasks.update(input.id, { status: 'concluida' });
      if (!task) return notFound(input.id);
      ctx.services.events.emit({ type: 'tasks_changed' });
      return out(JSON.stringify({ situacao: 'concluida', tarefa: task }, null, 1), `Tarefa concluída: ${preview(task.title, 60)}`);
    } catch (err) {
      return fail('Não foi possível concluir a tarefa', err);
    }
  },
};

/* ---------------- task_delete ---------------- */
const deleteSchema = z.object({
  id: z.string().min(1).max(100).describe('Id da tarefa a apagar.'),
});

export const taskDeleteTool: ToolDefinition<z.infer<typeof deleteSchema>> = {
  name: 'task_delete',
  title: 'Apagar tarefa',
  description: 'Apaga definitivamente uma tarefa. Para tarefas feitas, prefira task_complete.',
  inputSchema: deleteSchema,
  risk: 'destructive',
  describe: (i) => `Apagar definitivamente a tarefa ${i.id}`,
  async execute(input, ctx) {
    try {
      const store = ctx.services.tasks;
      // O repositório SQLite tem get(); outros podem não ter (então procura na lista).
      const getter = (store as { get?: (id: string) => Promise<TaskItem | null> }).get;
      const existing = getter ? await getter.call(store, input.id) : (await store.list({ limit: 2000 })).find((t) => t.id === input.id);
      const ok = await store.remove(input.id);
      if (!ok) return notFound(input.id);
      ctx.services.events.emit({ type: 'tasks_changed' });
      const title = existing ? `: ${preview(existing.title, 60)}` : '';
      return out(JSON.stringify({ situacao: 'apagada', id: input.id }), `Tarefa apagada${title}`);
    } catch (err) {
      return fail('Não foi possível apagar a tarefa', err);
    }
  },
};

export function plannerTools(): ToolDefinition[] {
  return [taskCreateTool, taskListTool, taskUpdateTool, taskCompleteTool, taskDeleteTool];
}
