/**
 * Estado da interface e redutor de eventos do motor (puro, sem efeitos).
 * Efeitos (IPC, carregamentos) ficam nos hooks; aqui só se calcula o próximo estado.
 */
import type {
  AssistantState,
  ChatMessage,
  ConfirmationRequest,
  ConversationSummary,
  EngineEvent,
  JobRun,
  RiskLevel,
} from '../../../core/types';
import type { Attachment, ConnectionStatus } from '../../../shared/ipc';

export interface ToolInfo {
  callId: string;
  name: string;
  title: string;
  description: string;
  risk: RiskLevel;
  status: 'running' | 'ok' | 'erro';
  summary?: string;
  startedAt: number;
  endedAt?: number;
}

export type ActivityStatus = 'running' | 'ok' | 'erro' | 'aguardando' | 'cancelado' | 'info';

export interface ActivityItem {
  id: string;
  ts: number;
  kind: 'tool' | 'job' | 'error';
  title: string;
  detail?: string;
  status: ActivityStatus;
  risk?: RiskLevel;
}

export type ThreadItem =
  | { kind: 'msg'; key: string; message: ChatMessage; local?: 'user' | 'assistant'; attachments?: Attachment[]; failed?: string; sent?: boolean }
  | { kind: 'tool'; key: string; callId: string };

export interface Toast {
  id: number;
  tone: 'info' | 'ok' | 'erro' | 'aviso';
  title: string;
  body?: string;
  ts: number;
}

export interface AppState {
  assistant: { state: AssistantState; detail?: string; error?: string; since: number };
  conversations: ConversationSummary[];
  /** null = conversa nova ainda não criada (rascunho). */
  currentId: string | null;
  thread: ThreadItem[];
  /** Texto do 300 chegando aos poucos para a conversa atual. */
  streaming: string;
  /** Conversa com resposta em andamento. */
  activeTurn: string | null;
  /** Pedido de carga de mensagens (o hook atende e devolve thread_loaded). */
  loadRequest: { id: string; seq: number } | null;
  tools: Record<string, ToolInfo>;
  activity: ActivityItem[];
  confirmations: ConfirmationRequest[];
  transcript: { text: string; final: boolean; ts: number } | null;
  unread: Record<string, boolean>;
  connections: ConnectionStatus[];
  scheduleNames: Record<string, string>;
  toasts: Toast[];
  /** Contadores que avisam os painéis para recarregar. */
  rev: { tasks: number; memory: number; schedules: number; conversations: number };
  seq: number;
}

export type Action =
  | { type: 'engine'; event: EngineEvent; follow?: boolean; now?: number }
  | { type: 'conversations'; list: ConversationSummary[] }
  | { type: 'select'; id: string | null; load?: boolean }
  | { type: 'thread_loaded'; id: string; messages: ChatMessage[] }
  | { type: 'local_user'; conversationId: string; text: string; attachments: Attachment[]; now?: number }
  | { type: 'send_failed'; conversationId: string; error: string }
  | { type: 'remove_item'; key: string }
  | { type: 'send_ok'; conversationId: string }
  | { type: 'connections'; list: ConnectionStatus[] }
  | { type: 'schedules'; names: Record<string, string> }
  | { type: 'toast'; tone: Toast['tone']; title: string; body?: string; now?: number }
  | { type: 'dismiss_toast'; id: number }
  | { type: 'confirmation_done'; id: string }
  | { type: 'conversation_removed'; id: string }
  | { type: 'conversation_renamed'; id: string; title: string }
  | { type: 'clear_transcript' }
  | { type: 'clear_activity' }
  | { type: 'jobs'; runs: JobRun[] };

export const MAX_ACTIVITY = 120;
export const MAX_TOASTS = 5;

export function createInitialState(now: number = Date.now()): AppState {
  return {
    assistant: { state: 'IDLE', since: now },
    conversations: [],
    currentId: null,
    thread: [],
    streaming: '',
    activeTurn: null,
    loadRequest: null,
    tools: {},
    activity: [],
    confirmations: [],
    transcript: null,
    unread: {},
    connections: [],
    scheduleNames: {},
    toasts: [],
    rev: { tasks: 0, memory: 0, schedules: 0, conversations: 0 },
    seq: 0,
  };
}

/* ----------------------------------------------------------------------
 * Auxiliares de mensagem
 * -------------------------------------------------------------------- */

export function messageText(m: ChatMessage): string {
  let s = '';
  for (const p of m.parts) if (p.type === 'text') s += (s ? '\n' : '') + p.text;
  return s;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

function toolCallIds(m: ChatMessage): string[] {
  const ids: string[] = [];
  for (const p of m.parts) if (p.type === 'tool_call') ids.push(p.id);
  return ids;
}

function msgItem(message: ChatMessage, extra?: Partial<Extract<ThreadItem, { kind: 'msg' }>>): ThreadItem {
  return { kind: 'msg', key: message.id, message, ...extra };
}

/** Mensagens de assistente desde a última mensagem do usuário. */
function assistantSinceLastUser(thread: ThreadItem[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = thread.length - 1; i >= 0; i--) {
    const it = thread[i]!;
    if (it.kind !== 'msg') continue;
    if (it.message.role === 'user') break;
    if (it.message.role === 'assistant') out.unshift(it.message);
  }
  return out;
}

function newLocalAssistant(seq: number, text: string, now: number): ThreadItem {
  const message: ChatMessage = { id: `local-a-${seq}`, role: 'assistant', parts: [{ type: 'text', text }], createdAt: new Date(now).toISOString() };
  return { kind: 'msg', key: message.id, message, local: 'assistant' };
}

/** O motor já recebeu: mensagens provisórias do usuário deixam de mostrar "enviando…". */
function markSent(thread: ThreadItem[]): ThreadItem[] {
  if (!thread.some((it) => it.kind === 'msg' && it.local === 'user' && !it.sent && !it.failed)) return thread;
  return thread.map((it) => (it.kind === 'msg' && it.local === 'user' && !it.failed ? { ...it, sent: true } : it));
}

/** Insere/atualiza uma mensagem real na conversa atual, substituindo as provisórias. */
function upsertMessage(state: AppState, message: ChatMessage): AppState {
  let thread = state.thread.slice();
  let streaming = state.streaming;

  const existing = thread.findIndex((it) => it.kind === 'msg' && it.message.id === message.id);
  if (existing >= 0) {
    const old = thread[existing] as Extract<ThreadItem, { kind: 'msg' }>;
    thread[existing] = msgItem(message, old.attachments ? { attachments: old.attachments } : undefined);
  } else if (message.role === 'user') {
    const localIdx = thread.findIndex((it) => it.kind === 'msg' && it.local === 'user' && !it.failed);
    if (localIdx >= 0) {
      const old = thread[localIdx] as Extract<ThreadItem, { kind: 'msg' }>;
      thread[localIdx] = msgItem(message, old.attachments ? { attachments: old.attachments } : undefined);
    } else thread.push(msgItem(message));
  } else if (message.role === 'assistant') {
    const text = norm(messageText(message));
    let placed = false;
    if (text) {
      // substitui textos provisórios que esta mensagem já contém
      const next: ThreadItem[] = [];
      for (const it of thread) {
        if (it.kind === 'msg' && it.local === 'assistant' && text.includes(norm(messageText(it.message)))) {
          if (!placed) {
            next.push(msgItem(message));
            placed = true;
          }
          continue;
        }
        next.push(it);
      }
      thread = next;
    }
    if (!placed) thread.push(msgItem(message));
    streaming = '';
  } else {
    thread.push(msgItem(message));
  }

  // chamadas de ferramenta já representadas pela mensagem não precisam de linha avulsa
  const calls = new Set(toolCallIds(message));
  if (calls.size) thread = thread.filter((it) => !(it.kind === 'tool' && calls.has(it.callId)));

  return { ...state, thread, streaming };
}

function bumpConversation(list: ConversationSummary[], id: string, nowIso: string, title?: string, countDelta = 0): { list: ConversationSummary[]; known: boolean } {
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) {
    const created: ConversationSummary = { id, title: title || 'Nova conversa', createdAt: nowIso, updatedAt: nowIso, messageCount: Math.max(0, countDelta) };
    return { list: [created, ...list], known: false };
  }
  const old = list[idx]!;
  const updated: ConversationSummary = { ...old, title: title || old.title, updatedAt: nowIso, messageCount: old.messageCount + countDelta };
  return { list: [updated, ...list.slice(0, idx), ...list.slice(idx + 1)], known: true };
}

function selectConversation(state: AppState, id: string | null, load: boolean): AppState {
  const unread = { ...state.unread };
  if (id) delete unread[id];
  return {
    ...state,
    currentId: id,
    thread: [],
    streaming: '',
    unread,
    loadRequest: id && load ? { id, seq: state.seq + 1 } : null,
    seq: state.seq + 1,
  };
}

function addToast(state: AppState, tone: Toast['tone'], title: string, body: string | undefined, now: number): AppState {
  // evita repetir o mesmo aviso em sequência
  const last = state.toasts[state.toasts.length - 1];
  if (last && last.title === title && last.body === body && now - last.ts < 4000) return state;
  const toast: Toast = { id: state.seq + 1, tone, title, body, ts: now };
  const toasts = [...state.toasts, toast].slice(-MAX_TOASTS);
  return { ...state, toasts, seq: state.seq + 1 };
}

function pushActivity(list: ActivityItem[], item: ActivityItem): ActivityItem[] {
  const idx = list.findIndex((a) => a.id === item.id);
  if (idx >= 0) {
    const copy = list.slice();
    copy[idx] = { ...copy[idx]!, ...item };
    return copy;
  }
  return [item, ...list].slice(0, MAX_ACTIVITY);
}

const JOB_STATUS: Record<JobRun['status'], ActivityStatus> = {
  executando: 'running',
  ok: 'ok',
  falhou: 'erro',
  cancelado: 'cancelado',
  aguardando_aprovacao: 'aguardando',
};

function jobActivity(state: AppState, run: JobRun): ActivityItem {
  const name = state.scheduleNames[run.scheduleId];
  const ts = Date.parse(run.finishedAt ?? run.startedAt);
  return {
    id: 'job:' + run.id,
    ts: Number.isNaN(ts) ? Date.now() : ts,
    kind: 'job',
    title: name ? `Agendamento: ${name}` : 'Tarefa agendada',
    detail: run.output ? run.output.slice(0, 400) : undefined,
    status: JOB_STATUS[run.status] ?? 'info',
  };
}

/* ----------------------------------------------------------------------
 * Eventos do motor
 * -------------------------------------------------------------------- */

function onEngine(state: AppState, e: EngineEvent, follow: boolean, now: number): AppState {
  const nowIso = new Date(now).toISOString();
  switch (e.type) {
    case 'state': {
      const error = e.state === 'ERROR' ? e.detail || state.assistant.error : undefined;
      // de volta à espera: nenhuma resposta continua em andamento
      const ended = e.state === 'IDLE' || e.state === 'ERROR';
      // transcrição parcial perde o sentido quando deixa de ouvir
      const transcript = state.transcript && !state.transcript.final && e.state !== 'LISTENING' ? null : state.transcript;
      return {
        ...state,
        transcript,
        assistant: { state: e.state, detail: e.detail, error, since: e.state === state.assistant.state ? state.assistant.since : now },
        activeTurn: ended ? null : state.activeTurn,
      };
    }

    case 'conversation': {
      const { list, known } = bumpConversation(state.conversations, e.conversationId, nowIso, e.title);
      let next: AppState = { ...state, conversations: list, rev: known ? state.rev : { ...state.rev, conversations: state.rev.conversations + 1 } };
      if (follow && state.currentId !== e.conversationId) next = selectConversation(next, e.conversationId, known);
      return next;
    }

    case 'message': {
      const { list, known } = bumpConversation(state.conversations, e.conversationId, nowIso, undefined, e.message.role === 'context' ? 0 : 1);
      let next: AppState = { ...state, conversations: list, rev: known ? state.rev : { ...state.rev, conversations: state.rev.conversations + 1 } };
      if (e.conversationId !== state.currentId) {
        if (follow) {
          next = selectConversation(next, e.conversationId, true);
          return { ...next, activeTurn: e.message.role === 'user' ? e.conversationId : next.activeTurn };
        }
        if (e.message.role !== 'context' && e.message.role !== 'tool') next = { ...next, unread: { ...next.unread, [e.conversationId]: true } };
        return next;
      }
      next = upsertMessage(next, e.message);
      if (e.message.role === 'user') next = { ...next, activeTurn: e.conversationId };
      return next;
    }

    case 'assistant_delta': {
      if (e.conversationId === state.currentId) return { ...state, thread: markSent(state.thread), streaming: state.streaming + e.text, activeTurn: e.conversationId };
      if (follow) {
        const next = selectConversation(state, e.conversationId, true);
        return { ...next, streaming: e.text, activeTurn: e.conversationId };
      }
      return { ...state, unread: { ...state.unread, [e.conversationId]: true } };
    }

    case 'assistant_done': {
      if (e.conversationId !== state.currentId) {
        return { ...state, activeTurn: state.activeTurn === e.conversationId ? null : state.activeTurn, unread: { ...state.unread, [e.conversationId]: true } };
      }
      let thread = markSent(state.thread);
      let seq = state.seq;
      const pending = state.streaming.trim();
      if (pending) {
        seq++;
        thread = [...thread, newLocalAssistant(seq, state.streaming, now)];
      } else if (e.text.trim() && assistantSinceLastUser(thread).every((m) => !norm(messageText(m)))) {
        seq++;
        thread = [...thread, newLocalAssistant(seq, e.text, now)];
      }
      return { ...state, thread, seq, streaming: '', activeTurn: null };
    }

    case 'tool_start': {
      const info: ToolInfo = { callId: e.callId, name: e.name, title: e.title || e.name, description: e.description, risk: e.risk, status: 'running', startedAt: now };
      let next: AppState = {
        ...state,
        tools: { ...state.tools, [e.callId]: info },
        activity: pushActivity(state.activity, { id: 'tool:' + e.callId, ts: now, kind: 'tool', title: info.title, detail: e.description, status: 'running', risk: e.risk }),
      };
      if (state.activeTurn && state.activeTurn === state.currentId) {
        let thread = next.thread;
        let seq = next.seq;
        if (next.streaming.trim()) {
          seq++;
          thread = [...thread, newLocalAssistant(seq, next.streaming, now)];
        }
        const represented = thread.some((it) => it.kind === 'msg' && it.message.parts.some((p) => p.type === 'tool_call' && p.id === e.callId));
        if (!represented && !thread.some((it) => it.kind === 'tool' && it.callId === e.callId)) thread = [...thread, { kind: 'tool', key: 'tool-' + e.callId, callId: e.callId }];
        next = { ...next, thread, seq, streaming: '' };
      }
      return next;
    }

    case 'tool_end': {
      const old = state.tools[e.callId];
      const info: ToolInfo = old
        ? { ...old, status: e.ok ? 'ok' : 'erro', summary: e.summary, endedAt: now }
        : { callId: e.callId, name: e.name, title: e.name, description: '', risk: 'read', status: e.ok ? 'ok' : 'erro', summary: e.summary, startedAt: now, endedAt: now };
      const prev = state.activity.find((a) => a.id === 'tool:' + e.callId);
      return {
        ...state,
        tools: { ...state.tools, [e.callId]: info },
        activity: pushActivity(state.activity, {
          id: 'tool:' + e.callId,
          ts: prev?.ts ?? now,
          kind: 'tool',
          title: info.title,
          detail: e.summary || info.description,
          status: e.ok ? 'ok' : 'erro',
          risk: info.risk,
        }),
      };
    }

    case 'confirmation_request':
      if (state.confirmations.some((c) => c.id === e.request.id)) return state;
      return { ...state, confirmations: [...state.confirmations, e.request] };

    case 'confirmation_resolved':
      return { ...state, confirmations: state.confirmations.filter((c) => c.id !== e.id) };

    case 'transcript':
      return { ...state, transcript: { text: e.text, final: e.final, ts: now } };

    case 'notification':
      return addToast(state, 'info', e.title, e.body, now);

    case 'tasks_changed':
      return { ...state, rev: { ...state.rev, tasks: state.rev.tasks + 1 } };
    case 'memory_changed':
      return { ...state, rev: { ...state.rev, memory: state.rev.memory + 1 } };
    case 'schedule_changed':
      return { ...state, rev: { ...state.rev, schedules: state.rev.schedules + 1 } };

    case 'job':
      return { ...state, activity: pushActivity(state.activity, jobActivity(state, e.run)) };

    case 'connection': {
      const idx = state.connections.findIndex((c) => c.service === e.service);
      const label = idx >= 0 ? state.connections[idx]!.label : e.service;
      const item: ConnectionStatus = { service: e.service, label, status: e.status, detail: e.detail };
      const connections = idx >= 0 ? state.connections.map((c, i) => (i === idx ? item : c)) : [...state.connections, item];
      return { ...state, connections };
    }

    case 'error': {
      const withToast = addToast(state, 'erro', 'Erro', e.message, now);
      return {
        ...withToast,
        assistant: { ...withToast.assistant, error: e.message },
        activity: pushActivity(withToast.activity, { id: `err:${now}:${withToast.seq}`, ts: now, kind: 'error', title: 'Erro', detail: e.message, status: 'erro' }),
      };
    }

    // níveis de áudio e ativação são tratados fora do redutor (alta frequência)
    case 'mic_level':
    case 'speech_level':
    case 'wake':
      return state;
  }
  return state;
}

export function reducer(state: AppState, action: Action): AppState {
  const now = 'now' in action && action.now !== undefined ? action.now : Date.now();
  switch (action.type) {
    case 'engine':
      return onEngine(state, action.event, !!action.follow, now);

    case 'conversations':
      return { ...state, conversations: action.list };

    case 'select':
      return selectConversation(state, action.id, action.load !== false);

    case 'thread_loaded': {
      if (action.id !== state.currentId) return state;
      const ids = new Set(action.messages.map((m) => m.id));
      const base: ThreadItem[] = action.messages.map((m) => msgItem(m));
      // mantém o que chegou por evento durante a carga
      let merged: AppState = { ...state, thread: base, loadRequest: null };
      for (const it of state.thread) {
        if (it.kind === 'tool') merged = { ...merged, thread: [...merged.thread, it] };
        else if (it.local) merged = { ...merged, thread: [...merged.thread, it] };
        else if (!ids.has(it.message.id)) merged = upsertMessage(merged, it.message);
      }
      return { ...merged, streaming: state.streaming };
    }

    case 'local_user': {
      let next = state.currentId === action.conversationId ? state : selectConversation(state, action.conversationId, false);
      const seq = next.seq + 1;
      const parts: ChatMessage['parts'] = action.text ? [{ type: 'text', text: action.text }] : [];
      const message: ChatMessage = { id: `local-u-${seq}`, role: 'user', parts, createdAt: new Date(now).toISOString() };
      next = {
        ...next,
        seq,
        thread: [...next.thread, { kind: 'msg', key: message.id, message, local: 'user', attachments: action.attachments.length ? action.attachments : undefined }],
        activeTurn: action.conversationId,
      };
      const { list } = bumpConversation(next.conversations, action.conversationId, new Date(now).toISOString());
      return { ...next, conversations: list };
    }

    case 'send_failed': {
      if (action.conversationId !== state.currentId) return addToast(state, 'erro', 'Mensagem não enviada', action.error, now);
      const thread = state.thread.slice();
      for (let i = thread.length - 1; i >= 0; i--) {
        const it = thread[i]!;
        if (it.kind === 'msg' && it.local === 'user' && !it.failed) {
          thread[i] = { ...it, failed: action.error };
          break;
        }
      }
      return { ...state, thread, activeTurn: state.activeTurn === action.conversationId ? null : state.activeTurn, streaming: '' };
    }

    case 'send_ok':
      return action.conversationId === state.currentId ? { ...state, thread: markSent(state.thread) } : state;

    case 'remove_item':
      return { ...state, thread: state.thread.filter((it) => it.key !== action.key) };

    case 'connections':
      // a lista completa do motor é a referência
      return { ...state, connections: action.list };

    case 'schedules':
      return { ...state, scheduleNames: action.names };

    case 'jobs': {
      let activity = state.activity;
      for (const run of action.runs) if (!activity.some((a) => a.id === 'job:' + run.id)) activity = pushActivity(activity, jobActivity(state, run));
      activity = activity.slice().sort((a, b) => b.ts - a.ts);
      return { ...state, activity };
    }

    case 'toast':
      return addToast(state, action.tone, action.title, action.body, now);

    case 'dismiss_toast':
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };

    case 'confirmation_done':
      return { ...state, confirmations: state.confirmations.filter((c) => c.id !== action.id) };

    case 'conversation_removed': {
      const conversations = state.conversations.filter((c) => c.id !== action.id);
      const base = { ...state, conversations };
      return state.currentId === action.id ? selectConversation(base, null, false) : base;
    }

    case 'conversation_renamed':
      return { ...state, conversations: state.conversations.map((c) => (c.id === action.id ? { ...c, title: action.title } : c)) };

    case 'clear_transcript':
      return state.transcript ? { ...state, transcript: null } : state;

    case 'clear_activity':
      return { ...state, activity: state.activity.filter((a) => a.status === 'running' || a.status === 'aguardando') };
  }
  return state;
}

/* ----------------------------------------------------------------------
 * Apoio à exibição da conversa
 * -------------------------------------------------------------------- */

/** Resultado das ferramentas presentes no histórico (por id da chamada). */
export function toolResultsOf(thread: ThreadItem[]): Map<string, { isError: boolean; text: string }> {
  const map = new Map<string, { isError: boolean; text: string }>();
  for (const it of thread) {
    if (it.kind !== 'msg') continue;
    for (const p of it.message.parts) {
      if (p.type !== 'tool_result') continue;
      const text = p.content.map((c) => (c.type === 'text' ? c.text : '[imagem]')).join(' ');
      map.set(p.toolCallId, { isError: !!p.isError, text });
    }
  }
  return map;
}

/** Anexo de texto incluído pelo núcleo ("Arquivo anexado "nome": ..."). */
export function attachedFileName(text: string): string | null {
  const m = /^Arquivo anexado "([^"\n]{1,200})":\n/.exec(text);
  return m && text.includes('<conteudo_externo') ? m[1]! : null;
}
