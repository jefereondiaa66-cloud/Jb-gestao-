/**
 * Dublês de teste para o agente: provedor roteirizado, serviços em memória e portão.
 * (Usados SOMENTE em testes.)
 */
import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@core/settings';
import { EventBus } from '@core/events';
import { LlmError } from '@core/llm/common';
import type {
  ChatMessage,
  ConversationStore,
  ConversationSummary,
  EngineEvent,
  EngineServices,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
  Logger,
  MemorySearchResult,
  MemoryStore,
  ModelCapabilities,
  StopReason,
  ToolCallInfo,
  ToolGate,
} from '@core/types';

/* ---------------- provedor roteirizado ---------------- */
export type StepFn = (req: LlmRequest) => AsyncGenerator<LlmStreamEvent>;

export interface RecordedRequest extends Omit<LlmRequest, 'messages' | 'signal'> {
  messages: ChatMessage[];
}

let seq = 0;
export function assistantMsg(parts: ChatMessage['parts'], native?: ChatMessage['native']): ChatMessage {
  return { id: `a${++seq}`, role: 'assistant', parts, createdAt: new Date().toISOString(), ...(native ? { native } : {}) };
}

export function textStep(text: string, chunks = 2): StepFn {
  return async function* () {
    const size = Math.max(1, Math.ceil(text.length / chunks));
    for (let i = 0; i < text.length; i += size) yield { type: 'text_delta', text: text.slice(i, i + size) };
    yield { type: 'done', message: assistantMsg([{ type: 'text', text }], { provider: 'fake', model: 'fake-1', content: [{ raw: text }] }), stopReason: 'end_turn' };
  };
}

export function toolStep(calls: { id: string; name: string; input: unknown }[], text = '', stopReason: StopReason = 'tool_use'): StepFn {
  return async function* () {
    if (text) yield { type: 'text_delta', text };
    for (const c of calls) yield { type: 'tool_call', call: c };
    const parts: ChatMessage['parts'] = [...(text ? [{ type: 'text' as const, text }] : []), ...calls.map((c) => ({ type: 'tool_call' as const, ...c }))];
    yield { type: 'done', message: assistantMsg(parts, { provider: 'fake', model: 'fake-1', content: [{ calls }] }), stopReason };
  };
}

export function eventsStep(events: LlmStreamEvent[]): StepFn {
  return async function* () {
    for (const e of events) yield e;
  };
}

/** Emite um texto e fica esperando até ser cancelado (simula streaming longo). */
export function hangingStep(text = 'Começando'): StepFn {
  return async function* (req) {
    yield { type: 'text_delta', text };
    await new Promise<void>((_, reject) => {
      if (req.signal?.aborted) reject(new LlmError('cancelado', 'Cancelado pelo dono.', { provider: 'fake' }));
      req.signal?.addEventListener('abort', () => reject(new LlmError('cancelado', 'Cancelado pelo dono.', { provider: 'fake' })), { once: true });
    });
  };
}

export function errorStep(err: Error): StepFn {
  // eslint-disable-next-line require-yield
  return async function* () {
    throw err;
  };
}

export class ScriptedProvider implements LlmProvider {
  readonly id: string;
  readonly label = 'Roteirizado';
  readonly requests: RecordedRequest[] = [];
  private i = 0;

  constructor(
    private readonly steps: StepFn[],
    private readonly caps: Partial<ModelCapabilities> = {},
    id = 'anthropic',
  ) {
    this.id = id;
  }

  capabilities(): ModelCapabilities {
    return { vision: true, pdf: true, tools: true, serverWebSearch: false, serverWebFetch: false, ...this.caps };
  }

  stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const { signal: _s, messages, ...rest } = req;
    this.requests.push({ ...rest, messages: JSON.parse(JSON.stringify(messages)) as ChatMessage[] });
    const step = this.steps[this.i++];
    if (!step) throw new Error(`roteiro acabou (pedido ${this.i})`);
    return step(req);
  }
}

/* ---------------- serviços em memória ---------------- */
export class MemConversations implements ConversationStore {
  readonly data = new Map<string, { summary: ConversationSummary; messages: ChatMessage[] }>();
  readonly renames: { id: string; title: string }[] = [];
  private n = 0;

  async create(title?: string): Promise<ConversationSummary> {
    const id = `conv${++this.n}`;
    const now = new Date().toISOString();
    const summary = { id, title: title ?? '', createdAt: now, updatedAt: now, messageCount: 0 };
    this.data.set(id, { summary, messages: [] });
    return { ...summary };
  }
  async append(id: string, message: ChatMessage): Promise<void> {
    const c = this.data.get(id);
    if (!c) throw new Error('conversa não existe: ' + id);
    c.messages.push(JSON.parse(JSON.stringify(message)) as ChatMessage);
    c.summary.messageCount++;
  }
  async messages(id: string): Promise<ChatMessage[]> {
    return (this.data.get(id)?.messages ?? []).map((m) => JSON.parse(JSON.stringify(m)) as ChatMessage);
  }
  async list(): Promise<ConversationSummary[]> {
    return [...this.data.values()].map((c) => c.summary);
  }
  async rename(id: string, title: string): Promise<void> {
    this.renames.push({ id, title });
    const c = this.data.get(id);
    if (c) c.summary.title = title;
  }
  async remove(id: string): Promise<void> {
    this.data.delete(id);
  }
  async searchText(): Promise<{ conversationId: string; messageId: string; snippet: string; createdAt: string }[]> {
    return [];
  }
  /** Semeia uma conversa com mensagens já existentes. */
  seed(messages: ChatMessage[]): string {
    const id = `conv${++this.n}`;
    const now = new Date().toISOString();
    this.data.set(id, { summary: { id, title: 'antiga', createdAt: now, updatedAt: now, messageCount: messages.length }, messages: [...messages] });
    return id;
  }
}

export function memoryStore(search: () => Promise<MemorySearchResult[]>): MemoryStore {
  const nope = async () => {
    throw new Error('não usado');
  };
  return {
    add: nope,
    update: nope,
    remove: nope,
    get: nope,
    list: async () => [],
    search,
    exportAll: nope,
    count: async () => 0,
  } as unknown as MemoryStore;
}

export function memoryResult(id: string, content: string): MemorySearchResult {
  const now = '2026-10-01T10:00:00.000Z';
  return {
    item: { id, kind: 'preference', content, tags: [], importance: 0.5, source: 'usuario', sensitive: false, createdAt: now, updatedAt: now, accessCount: 0 },
    score: 1,
    matchedBy: ['fts'],
  };
}

export interface TestEnv {
  services: EngineServices;
  events: EventBus;
  conversations: MemConversations;
  emitted: EngineEvent[];
  logs: string[];
  setSettings(p: SettingsPatch): void;
}

export function createEnv(opts: { settings?: SettingsPatch; memories?: () => Promise<MemorySearchResult[]>; utility?: EngineServices['utilityComplete'] } = {}): TestEnv {
  let settings: Settings = mergeSettings(defaultSettings(), opts.settings ?? {});
  const events = new EventBus();
  const emitted: EngineEvent[] = [];
  events.on((e) => emitted.push(e));
  const logs: string[] = [];
  const logger: Logger = {
    debug: (m) => logs.push('debug ' + m),
    info: (m) => logs.push('info ' + m),
    warn: (m) => logs.push('warn ' + m),
    error: (m) => logs.push('error ' + m),
  };
  const conversations = new MemConversations();
  const services: EngineServices = {
    settings: {
      get: () => settings,
      update: async (p) => {
        settings = mergeSettings(settings, p);
        return settings;
      },
    },
    secrets: { get: async () => undefined, set: async () => {}, delete: async () => {}, has: async () => false, list: async () => [] },
    platform: {
      os: 'windows',
      notify: () => {},
      openExternal: async () => {},
      openPath: async () => '',
      paths: { home: '/h', documents: '/h/d', desktop: '/h/a', downloads: '/h/b', pictures: '/h/p', data: '/h/x', temp: '/tmp' },
    },
    memory: memoryStore(opts.memories ?? (async () => [])),
    conversations,
    tasks: {} as EngineServices['tasks'],
    schedules: {} as EngineServices['schedules'],
    audit: { record: () => {}, list: () => [] },
    logger,
    events,
    ...(opts.utility ? { utilityComplete: opts.utility } : {}),
    extras: {},
  };
  return {
    services,
    events,
    conversations,
    emitted,
    logs,
    setSettings: (p) => {
      settings = mergeSettings(settings, p);
    },
  };
}

/* ---------------- portão ---------------- */
export class FakeGate implements ToolGate {
  readonly authorized: { callId: string; tool: string; tainted: boolean; input: unknown; title: string }[] = [];
  readonly recorded: { tool: string; outcome: string; detail: string }[] = [];
  constructor(private readonly policy: (call: ToolCallInfo) => { allowed: boolean; reason: string } | Promise<{ allowed: boolean; reason: string }> = () => ({ allowed: true, reason: 'ok' })) {}

  async authorize(call: ToolCallInfo): Promise<{ allowed: boolean; reason: string }> {
    this.authorized.push({ callId: call.callId, tool: call.tool.name, tainted: call.tainted, input: call.input, title: call.tool.title });
    return this.policy(call);
  }
  recordResult(call: ToolCallInfo, outcome: 'ok' | 'erro' | 'cancelado', detail: string): void {
    this.recorded.push({ tool: call.tool.name, outcome, detail });
  }
}

export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

export async function waitUntil(pred: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('condição não aconteceu a tempo');
    await tick(5);
  }
}
