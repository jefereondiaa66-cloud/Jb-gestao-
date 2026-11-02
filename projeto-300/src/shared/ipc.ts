/**
 * Contrato de comunicação entre a interface (renderer) e o processo principal.
 * O preload expõe somente `window.api300` com estas operações tipadas.
 * Nenhum acesso direto a Node/Electron chega à interface.
 */
import type {
  AuditEntry,
  ChatMessage,
  ConfirmationResponse,
  ConversationSummary,
  EngineEvent,
  JobRun,
  MemoryItem,
  MemoryKind,
  MemorySearchResult,
  ScheduleItem,
  TaskItem,
} from '../core/types';
import type { Settings, SettingsPatch } from '../core/settings';

export interface Attachment {
  name: string;
  mediaType: string; // image/png, image/jpeg, application/pdf, text/plain...
  data: string; // base64
}

export interface ConnectionStatus {
  service: string; // 'anthropic' | 'openai' | 'ollama' | 'google' | 'microsoft' | 'busca' | 'mcp:<id>' | 'voz-local'
  label: string;
  status: 'ok' | 'erro' | 'desconectado' | 'verificando';
  detail?: string;
}

export interface SystemInfo {
  version: string;
  platform: 'windows' | 'macos' | 'linux';
  dataDir: string;
  secretsEncrypted: boolean;
  databaseEncrypted: boolean;
  voiceModels: { id: string; label: string; installed: boolean; sizeMb: number }[];
}

/** Mapa de canais invoke: nome -> [argumento, retorno]. */
export interface IpcInvokeMap {
  'chat:send': [{ text: string; conversationId?: string; attachments?: Attachment[]; mode?: 'text' | 'voice' }, { conversationId: string }];
  'chat:stop': [void, void];
  'chat:new': [void, { conversationId: string }];
  'chat:list': [{ limit?: number } | void, ConversationSummary[]];
  'chat:messages': [{ conversationId: string }, ChatMessage[]];
  'chat:delete': [{ conversationId: string }, void];
  'chat:rename': [{ conversationId: string; title: string }, void];

  'confirm:respond': [{ id: string; response: ConfirmationResponse }, void];

  'voice:start': [void, void]; // começa a ouvir agora (botão do microfone / atalho)
  'voice:stop': [void, void]; // para de ouvir e de falar
  'voice:stopSpeaking': [void, void];
  'voice:setWake': [{ enabled: boolean }, void];
  'voice:voices': [void, { id: string; label: string; language: string }[]];
  'voice:test': [{ text?: string } | void, void];
  'voice:downloadModels': [{ ids?: string[] } | void, void];

  'settings:get': [void, Settings];
  'settings:update': [SettingsPatch, Settings];
  'secrets:set': [{ name: string; value: string }, void];
  'secrets:delete': [{ name: string }, void];
  'secrets:list': [void, string[]];

  'memory:search': [{ text: string; limit?: number }, MemorySearchResult[]];
  'memory:list': [{ kind?: MemoryKind; limit?: number; offset?: number } | void, MemoryItem[]];
  'memory:add': [{ kind: MemoryKind; content: string; tags?: string[]; sensitive?: boolean }, MemoryItem];
  'memory:update': [{ id: string; content?: string; tags?: string[]; kind?: MemoryKind; importance?: number }, MemoryItem | null];
  'memory:delete': [{ id: string }, boolean];
  'memory:export': [void, string]; // JSON

  'tasks:list': [{ status?: TaskItem['status'] } | void, TaskItem[]];
  'tasks:create': [{ title: string; notes?: string; dueAt?: string; priority?: TaskItem['priority']; project?: string }, TaskItem];
  'tasks:update': [{ id: string; patch: Partial<Omit<TaskItem, 'id' | 'createdAt'>> }, TaskItem | null];
  'tasks:delete': [{ id: string }, boolean];

  'schedules:list': [void, ScheduleItem[]];
  'schedules:create': [Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunAt' | 'nextRunAt'>, ScheduleItem];
  'schedules:update': [{ id: string; patch: Partial<Omit<ScheduleItem, 'id' | 'createdAt'>> }, ScheduleItem | null];
  'schedules:delete': [{ id: string }, boolean];
  'schedules:runs': [{ limit?: number } | void, JobRun[]];

  'audit:list': [{ limit?: number; kind?: AuditEntry['kind'] } | void, AuditEntry[]];

  'system:info': [void, SystemInfo];
  'system:connections': [void, ConnectionStatus[]];
  'system:openExternal': [{ url: string }, void];
  'system:setAutoStart': [{ enabled: boolean }, void];

  'integrations:connect': [{ service: 'google' | 'microsoft' }, { ok: boolean; detail: string }];
  'integrations:disconnect': [{ service: 'google' | 'microsoft' }, void];
  'mcp:reload': [void, ConnectionStatus[]];
}

export type IpcChannel = keyof IpcInvokeMap;
export type IpcArg<C extends IpcChannel> = IpcInvokeMap[C][0];
export type IpcResult<C extends IpcChannel> = IpcInvokeMap[C][1];

/** Áudio de saída (voz do 300) enviado ao renderer para tocar. */
export interface AudioOutMessage {
  utteranceId: string;
  /** PCM float32 mono. */
  samples: Float32Array;
  sampleRate: number;
  final: boolean;
}

/** API exposta em window.api300 pelo preload. */
export interface Api300 {
  invoke<C extends IpcChannel>(channel: C, arg: IpcArg<C>): Promise<IpcResult<C>>;
  /** Eventos do motor (estado, mensagens, ferramentas, confirmações...). */
  onEvent(listener: (event: EngineEvent) => void): () => void;
  /** Áudio do microfone já em 16 kHz mono float32 (quadros de 512 amostras). */
  sendAudio(frame: Float32Array): void;
  /** Voz do 300 para tocar. */
  onAudioOut(listener: (msg: AudioOutMessage) => void): () => void;
  /** Pedido para parar o áudio imediatamente (interrupção). */
  onAudioStop(listener: () => void): () => void;
  /** Ações vindas do sistema (atalho global, bandeja). */
  onCommand(listener: (cmd: 'focus-input' | 'toggle-listen' | 'stop-all' | 'open-settings') => void): () => void;
}

export const IPC_EVENT_CHANNEL = '300:event';
export const IPC_AUDIO_IN_CHANNEL = '300:audio-in';
export const IPC_AUDIO_OUT_CHANNEL = '300:audio-out';
export const IPC_AUDIO_STOP_CHANNEL = '300:audio-stop';
export const IPC_COMMAND_CHANNEL = '300:command';

/** Lista de canais permitidos (o preload rejeita qualquer outro). */
export const IPC_CHANNELS: IpcChannel[] = [
  'chat:send', 'chat:stop', 'chat:new', 'chat:list', 'chat:messages', 'chat:delete', 'chat:rename',
  'confirm:respond',
  'voice:start', 'voice:stop', 'voice:stopSpeaking', 'voice:setWake', 'voice:voices', 'voice:test', 'voice:downloadModels',
  'settings:get', 'settings:update', 'secrets:set', 'secrets:delete', 'secrets:list',
  'memory:search', 'memory:list', 'memory:add', 'memory:update', 'memory:delete', 'memory:export',
  'tasks:list', 'tasks:create', 'tasks:update', 'tasks:delete',
  'schedules:list', 'schedules:create', 'schedules:update', 'schedules:delete', 'schedules:runs',
  'audit:list',
  'system:info', 'system:connections', 'system:openExternal', 'system:setAutoStart',
  'integrations:connect', 'integrations:disconnect', 'mcp:reload',
];
