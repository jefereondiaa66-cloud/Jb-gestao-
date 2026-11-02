/**
 * Contratos centrais do 300.
 *
 * Este arquivo é a "constituição" entre os módulos: núcleo de IA, memória,
 * ferramentas, segurança, voz, agendador e interface. Módulos conversam
 * apenas por estes tipos, para que cada um possa ser trocado sem reconstruir
 * o resto (ex.: trocar Claude por OpenAI ou Ollama, trocar o motor de voz).
 *
 * Regra: o núcleo (src/core) NÃO importa nada do Electron. Tudo que depende
 * do sistema (segredos, janelas, notificações) chega por interfaces aqui.
 */
import type { z } from 'zod';

/* ======================================================================
 * Estados visuais do assistente
 * ==================================================================== */
export type AssistantState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'EXECUTING' | 'ERROR';

/* ======================================================================
 * Conteúdo de mensagens (neutro em relação ao provedor)
 * ==================================================================== */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

export type ToolResultContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; data: string /* base64 sem prefixo data: */ };

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: ImageMediaType; data: string }
  | { type: 'document'; mediaType: 'application/pdf'; data: string; name?: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; toolCallId: string; name?: string; content: ToolResultContent[]; isError?: boolean };

/**
 * Papéis:
 * - user: o dono falando/digitando.
 * - assistant: resposta do 300 (texto e/ou chamadas de ferramenta).
 * - tool: resultados de ferramentas (cada parte é um tool_result).
 * - context: contexto do operador injetado no meio da conversa (data/hora,
 *   memórias relevantes, estado da tela). Nunca vem de conteúdo externo.
 *   Adaptadores convertem: Anthropic -> mensagem role "system" no meio da
 *   conversa; OpenAI -> role "developer"; Ollama -> role "system".
 */
export type ChatRole = 'user' | 'assistant' | 'tool' | 'context';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  parts: ContentPart[];
  createdAt: string; // ISO 8601
  /**
   * Conteúdo original devolvido pelo provedor (ex.: blocos de "thinking"
   * assinados do Claude). Deve ser reenviado SEM alteração quando o mesmo
   * provedor+modelo continuar a conversa (histórico só cresce, nunca é editado).
   */
  native?: { provider: string; model: string; content: unknown };
}

/* ======================================================================
 * Provedores de IA (cérebro trocável)
 * ==================================================================== */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

/** JSON Schema simples (gerado a partir do zod com z.toJSONSchema). */
export type JsonSchema = Record<string, unknown>;

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface LlmRequest {
  model: string;
  /** Prompt estável (personalidade + regras). Mantido idêntico entre turnos para aproveitar cache. */
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** Ferramentas nativas do provedor (ex.: web_search/web_fetch do Claude). Ignoradas se não houver suporte. */
  serverTools?: { webSearch?: boolean; webFetch?: boolean };
  maxTokens?: number;
  effort?: Effort;
  signal?: AbortSignal;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  serverToolUses?: Record<string, number>;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'pause_turn' | 'stop' | 'cancelled' | 'error';

export type LlmStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; text: string }
  | { type: 'tool_call'; call: { id: string; name: string; input: unknown } }
  | { type: 'server_tool'; name: string; detail: string }
  | { type: 'citation'; url: string; title?: string }
  | { type: 'done'; message: ChatMessage; stopReason: StopReason; usage?: LlmUsage; refusalCategory?: string | null };

export interface ModelCapabilities {
  vision: boolean;
  pdf: boolean;
  tools: boolean;
  serverWebSearch: boolean;
  serverWebFetch: boolean;
}

export interface LlmProvider {
  readonly id: string; // 'anthropic' | 'openai' | 'ollama' | ...
  readonly label: string;
  capabilities(model: string): ModelCapabilities;
  /** Transmite a resposta. Deve respeitar req.signal (cancelamento imediato). */
  stream(req: LlmRequest): AsyncIterable<LlmStreamEvent>;
  listModels?(): Promise<string[]>;
  /** Testa credenciais/conectividade sem custo relevante. */
  healthCheck?(): Promise<{ ok: boolean; detail: string }>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], signal?: AbortSignal): Promise<Float32Array[]>;
}

/* ======================================================================
 * Ferramentas, riscos e permissões
 * ==================================================================== */
/**
 * Níveis de risco:
 * - read: só lê (pesquisar, consultar memória, ler arquivo permitido).
 * - write: altera algo local e reversível (criar documento, salvar memória, mover arquivo para pasta permitida).
 * - external: envia algo para fora (e-mail, mensagem, publicar, chamar serviço de terceiros em nome do dono).
 * - destructive: apaga/sobrescreve ou é difícil de desfazer.
 * - financial: envolve dinheiro, compras, pagamentos.
 * - system: executa comandos/programas ou controla mouse e teclado.
 */
export type RiskLevel = 'read' | 'write' | 'external' | 'destructive' | 'financial' | 'system';

export type Actor = 'user' | 'agent' | 'scheduler';

export interface ToolOutput {
  content: ToolResultContent[];
  isError?: boolean;
  /** Marque quando o conteúdo veio de fonte externa não confiável (web, e-mail, arquivo de terceiros). */
  untrusted?: { source: string };
  /** Resumo curto em pt-BR para o painel de atividades e auditoria. */
  summary?: string;
}

export interface ConfirmationRequest {
  id: string;
  tool: string;
  title: string; // pt-BR, ex.: "Apagar arquivo"
  description: string; // pt-BR, o que exatamente será feito
  risk: RiskLevel;
  input: unknown; // já com segredos ocultados
  actor: Actor;
  /** Conteúdo externo não confiável já entrou nesta tarefa (possível injeção de instruções). */
  tainted: boolean;
  createdAt: string;
  expiresAt: string;
}

export interface ConfirmationResponse {
  approved: boolean;
  /** "session": não perguntar de novo nesta sessão para esta ferramenta (só vale para riscos read/write). */
  remember?: 'session';
}

export type ConfirmationHandler = (req: ConfirmationRequest) => Promise<ConfirmationResponse>;

export interface ToolContext {
  signal: AbortSignal;
  actor: Actor;
  conversationId?: string;
  /** Pede confirmação explícita ao dono (além da checagem automática da política). */
  confirm(title: string, description: string, risk: RiskLevel): Promise<boolean>;
  log(message: string): void;
  services: EngineServices;
}

export interface ToolDefinition<I = any> {
  name: string; // snake_case, estável (vai para o modelo)
  title: string; // rótulo pt-BR para a interface
  description: string; // descrição para o modelo (inglês ou pt-BR; seja específico)
  inputSchema: z.ZodType<I>;
  risk: RiskLevel | ((input: I) => RiskLevel);
  /** Frase pt-BR que descreve a ação concreta (usada no pedido de confirmação). */
  describe?(input: I): string;
  /** A ferramenta está disponível neste sistema/configuração? */
  available?(services: EngineServices): boolean;
  execute(input: I, ctx: ToolContext): Promise<ToolOutput>;
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface PermissionQuery {
  tool: string;
  risk: RiskLevel;
  input: unknown;
  actor: Actor;
  tainted: boolean;
}

/** Portão de execução de ferramentas: política + confirmação do dono + auditoria. */
export interface ToolCallInfo {
  callId: string;
  tool: ToolDefinition;
  input: unknown;
  actor: Actor;
  /** Conteúdo externo não confiável já entrou nesta tarefa. */
  tainted: boolean;
  conversationId?: string;
}

export interface ToolGate {
  authorize(call: ToolCallInfo, signal: AbortSignal): Promise<{ allowed: boolean; reason: string }>;
  recordResult(call: ToolCallInfo, outcome: 'ok' | 'erro' | 'cancelado', detail: string): void;
}

export interface PermissionPolicy {
  evaluate(q: PermissionQuery): { decision: PermissionDecision; reason: string };
  rememberForSession(tool: string, risk: RiskLevel): void;
  resetSession(): void;
}

/* ======================================================================
 * Memória
 * ==================================================================== */
export type MemoryKind = 'fact' | 'preference' | 'project' | 'task' | 'knowledge' | 'person' | 'event' | 'summary';

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  tags: string[];
  importance: number; // 0..1
  source: string; // 'conversa:<id>' | 'usuario' | 'extração' | ...
  sensitive: boolean;
  createdAt: string;
  updatedAt: string;
  lastAccessedAt?: string;
  accessCount: number;
  expiresAt?: string;
}

export interface MemoryQuery {
  text?: string;
  kinds?: MemoryKind[];
  tags?: string[];
  limit?: number;
  includeSensitive?: boolean;
}

export interface MemorySearchResult {
  item: MemoryItem;
  score: number;
  matchedBy: ('fts' | 'vector' | 'recency')[];
}

export interface MemoryStore {
  add(input: Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'> & { id?: string }): Promise<MemoryItem>;
  update(id: string, patch: Partial<Pick<MemoryItem, 'content' | 'tags' | 'importance' | 'kind' | 'sensitive' | 'expiresAt'>>): Promise<MemoryItem | null>;
  remove(id: string): Promise<boolean>;
  get(id: string): Promise<MemoryItem | null>;
  list(opts?: { kind?: MemoryKind; limit?: number; offset?: number }): Promise<MemoryItem[]>;
  search(q: MemoryQuery): Promise<MemorySearchResult[]>;
  exportAll(): Promise<{ version: 1; exportedAt: string; items: MemoryItem[] }>;
  count(): Promise<number>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ConversationStore {
  create(title?: string): Promise<ConversationSummary>;
  append(conversationId: string, message: ChatMessage): Promise<void>;
  messages(conversationId: string): Promise<ChatMessage[]>;
  list(limit?: number): Promise<ConversationSummary[]>;
  rename(conversationId: string, title: string): Promise<void>;
  remove(conversationId: string): Promise<void>;
  searchText(text: string, limit?: number): Promise<{ conversationId: string; messageId: string; snippet: string; createdAt: string }[]>;
}

/* ======================================================================
 * Tarefas, agendamentos e auditoria
 * ==================================================================== */
export type TaskStatus = 'pendente' | 'em_andamento' | 'concluida' | 'cancelada';

export interface TaskItem {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: 'baixa' | 'media' | 'alta';
  project?: string;
  dueAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface TaskStore {
  create(input: Pick<TaskItem, 'title'> & Partial<Omit<TaskItem, 'id' | 'createdAt' | 'updatedAt'>>): Promise<TaskItem>;
  update(id: string, patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>>): Promise<TaskItem | null>;
  remove(id: string): Promise<boolean>;
  list(opts?: { status?: TaskStatus; project?: string; limit?: number }): Promise<TaskItem[]>;
}

export type ScheduleAction =
  | { type: 'lembrete'; message: string }
  | { type: 'tarefa_agente'; prompt: string }
  | { type: 'resumo_diario' };

export interface ScheduleItem {
  id: string;
  name: string;
  /** Expressão cron (5 campos) OU data/hora única ISO em runAt. */
  cron?: string;
  runAt?: string;
  timezone?: string;
  action: ScheduleAction;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
}

export interface JobRun {
  id: string;
  scheduleId: string;
  startedAt: string;
  finishedAt?: string;
  status: 'executando' | 'ok' | 'falhou' | 'cancelado' | 'aguardando_aprovacao';
  output?: string;
}

export interface ScheduleStore {
  list(): Promise<ScheduleItem[]>;
  get(id: string): Promise<ScheduleItem | null>;
  create(input: Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunAt' | 'nextRunAt'> & { nextRunAt?: string }): Promise<ScheduleItem>;
  update(id: string, patch: Partial<Omit<ScheduleItem, 'id' | 'createdAt'>>): Promise<ScheduleItem | null>;
  remove(id: string): Promise<boolean>;
  addRun(run: JobRun): Promise<void>;
  updateRun(id: string, patch: Partial<Omit<JobRun, 'id' | 'scheduleId'>>): Promise<void>;
  runs(opts?: { limit?: number; scheduleId?: string }): Promise<JobRun[]>;
}

export interface AuditEntry {
  id: number;
  ts: string;
  actor: Actor;
  kind: 'tool' | 'permission' | 'setting' | 'secret' | 'memory' | 'scheduler' | 'security' | 'system';
  tool?: string;
  risk?: RiskLevel;
  decision?: 'allow' | 'deny' | 'ask' | 'approved' | 'rejected' | 'timeout';
  input?: string; // JSON já com segredos ocultados e truncado
  outcome?: 'ok' | 'erro' | 'bloqueado' | 'cancelado';
  detail?: string;
}

export interface AuditLog {
  record(entry: Omit<AuditEntry, 'id' | 'ts'>): void;
  list(opts?: { limit?: number; kind?: AuditEntry['kind'] }): AuditEntry[];
}

/* ======================================================================
 * Segredos e plataforma (implementados pelo Electron ou pela CLI)
 * ==================================================================== */
export interface SecretStore {
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
  has(name: string): Promise<boolean>;
  /** Nomes guardados (nunca os valores). */
  list(): Promise<string[]>;
}

/** Nomes padronizados de segredos. */
export const SECRET_NAMES = {
  anthropic: 'anthropic_api_key',
  openai: 'openai_api_key',
  elevenlabs: 'elevenlabs_api_key',
  brave: 'brave_search_api_key',
  tavily: 'tavily_api_key',
  picovoice: 'picovoice_access_key',
  googleClientSecret: 'google_client_secret',
  googleTokens: 'google_oauth_tokens',
  microsoftTokens: 'microsoft_msal_cache',
  dbKey: 'database_key',
} as const;

export interface PlatformServices {
  os: 'windows' | 'macos' | 'linux';
  /** Notificação do sistema. */
  notify(title: string, body: string): void;
  /** Abre URL no navegador padrão (só http/https/mailto). */
  openExternal(url: string): Promise<void>;
  /** Abre arquivo/pasta/programa com o aplicativo padrão. */
  openPath(path: string): Promise<string>; // '' = ok, senão mensagem de erro
  /** Captura de tela (PNG base64) — undefined se indisponível. */
  captureScreen?(): Promise<{ data: string; width: number; height: number } | undefined>;
  /** Move para a lixeira em vez de apagar definitivamente. */
  trashItem?(path: string): Promise<void>;
  /** Pastas conhecidas do usuário. */
  paths: { home: string; documents: string; desktop: string; downloads: string; pictures: string; data: string; temp: string };
}

/* ======================================================================
 * Serviços disponíveis para ferramentas (injeção de dependências)
 * ==================================================================== */
export interface Logger {
  debug(msg: string, extra?: unknown): void;
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
}

export interface EngineServices {
  settings: SettingsAccess;
  secrets: SecretStore;
  platform: PlatformServices;
  memory: MemoryStore;
  conversations: ConversationStore;
  tasks: TaskStore;
  schedules: ScheduleStore;
  audit: AuditLog;
  logger: Logger;
  events: EventBusLike;
  /** Provedor de embeddings atual (pode faltar: então a memória usa só busca por texto). */
  embeddings?: EmbeddingProvider;
  /** Chamada simples ao modelo utilitário (resumos, extração). */
  utilityComplete?(prompt: string, opts?: { system?: string; maxTokens?: number; signal?: AbortSignal; images?: { mediaType: ImageMediaType; data: string }[] }): Promise<string>;
  /** Serviços opcionais registrados por outros módulos (scheduler, integrações, navegador...). */
  extras: Record<string, unknown>;
}

/** Acesso às configurações (o tipo concreto Settings está em settings.ts). */
export interface SettingsAccess {
  get(): import('./settings').Settings;
  update(patch: import('./settings').SettingsPatch): Promise<import('./settings').Settings>;
}

/* ======================================================================
 * Eventos do motor (núcleo -> interface)
 * ==================================================================== */
export type EngineEvent =
  | { type: 'state'; state: AssistantState; detail?: string }
  | { type: 'conversation'; conversationId: string; title?: string }
  | { type: 'message'; conversationId: string; message: ChatMessage }
  | { type: 'assistant_delta'; conversationId: string; text: string }
  | { type: 'assistant_done'; conversationId: string; text: string; stopReason: StopReason }
  | { type: 'tool_start'; callId: string; name: string; title: string; description: string; risk: RiskLevel }
  | { type: 'tool_end'; callId: string; name: string; ok: boolean; summary: string }
  | { type: 'confirmation_request'; request: ConfirmationRequest }
  | { type: 'confirmation_resolved'; id: string; approved: boolean }
  | { type: 'transcript'; text: string; final: boolean }
  | { type: 'wake'; engine: string; text?: string; score?: number }
  | { type: 'mic_level'; level: number } // 0..1
  | { type: 'speech_level'; level: number } // 0..1 (voz do 300)
  | { type: 'notification'; title: string; body: string }
  | { type: 'tasks_changed' }
  | { type: 'memory_changed' }
  | { type: 'schedule_changed' }
  | { type: 'job'; run: JobRun }
  | { type: 'connection'; service: string; status: 'ok' | 'erro' | 'desconectado' | 'verificando'; detail?: string }
  | { type: 'error'; message: string; code?: string };

export interface EventBusLike {
  emit(event: EngineEvent): void;
  on(listener: (event: EngineEvent) => void): () => void;
}

/* ======================================================================
 * Voz
 * ==================================================================== */
/** Áudio PCM mono float32 em [-1, 1]. */
export interface AudioChunk {
  samples: Float32Array;
  sampleRate: number;
}

export interface SttProvider {
  readonly id: string;
  /** Transcreve um trecho de fala completo (após o VAD). */
  transcribe(audio: AudioChunk, opts?: { language?: string; prompt?: string; signal?: AbortSignal }): Promise<{ text: string; language?: string }>;
}

export interface TtsVoice {
  id: string;
  label: string;
  language: string;
}

export interface TtsProvider {
  readonly id: string;
  voices(): Promise<TtsVoice[]>;
  /** Sintetiza uma frase. Pode transmitir vários pedaços de áudio. */
  synthesize(text: string, opts: { voice?: string; speed?: number; signal?: AbortSignal }): AsyncIterable<AudioChunk>;
}

export interface WakeWordEngine {
  readonly id: string;
  /** Recebe áudio contínuo (16 kHz). Retorna detecção quando a palavra de ativação é ouvida. */
  accept(samples: Float32Array): Promise<WakeDetection | null> | WakeDetection | null;
  reset(): void;
  dispose(): void;
}

export interface WakeDetection {
  engine: string;
  score: number;
  /** Texto que veio junto da ativação (ex.: "300, abre o navegador" -> "abre o navegador"). */
  remainder?: string;
  /** Áudio da fala que continha a ativação (para transcrever o restante, se necessário). */
  audio?: Float32Array;
}
