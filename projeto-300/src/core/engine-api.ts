/**
 * Interface pública do motor do 300 (o que o Electron e a CLI usam).
 * A implementação fica em engine.ts (raiz de composição).
 */
import type { Attachment, AudioOutMessage, ConnectionStatus } from '../shared/ipc';
import type { EventBus } from './events';
import type { ToolRegistry } from './tools/registry';
import type {
  ConfirmationResponse,
  EngineServices,
  JobRun,
  LlmProvider,
  Logger,
  PlatformServices,
  ScheduleItem,
  SecretStore,
  StopReason,
  SttProvider,
  TtsProvider,
  TtsVoice,
  EmbeddingProvider,
} from './types';

export interface SendInput {
  text: string;
  conversationId?: string;
  attachments?: Attachment[];
  mode?: 'text' | 'voice';
  actor?: 'user' | 'scheduler';
}

export interface SendResult {
  conversationId: string;
  text: string;
  stopReason: StopReason;
}

export interface VoiceModelStatus {
  id: string;
  label: string;
  installed: boolean;
  sizeMb: number;
}

export interface VoiceController {
  /** Áudio do microfone, 16 kHz mono float32 (quadros de qualquer tamanho). */
  pushAudio(frame: Float32Array): void;
  /** Começa a ouvir agora (sem precisar da palavra de ativação). */
  startListening(): void;
  /** Para de ouvir e de falar; volta para espera. */
  stopListening(): void;
  /** Interrompe só a fala atual do 300. */
  stopSpeaking(): void;
  setWakeEnabled(enabled: boolean): Promise<void>;
  /** Fala um texto (usa o TTS configurado). */
  speak(text: string, opts?: { signal?: AbortSignal }): Promise<void>;
  onAudioOut(listener: (msg: AudioOutMessage) => void): () => void;
  onAudioStop(listener: () => void): () => void;
  voices(): Promise<TtsVoice[]>;
  modelsStatus(): Promise<VoiceModelStatus[]>;
  downloadModels(ids?: string[], onProgress?: (id: string, fraction: number) => void): Promise<void>;
  dispose(): Promise<void>;
}

export interface SchedulerController {
  list(): Promise<ScheduleItem[]>;
  create(input: Omit<ScheduleItem, 'id' | 'createdAt' | 'lastRunAt' | 'nextRunAt'>): Promise<ScheduleItem>;
  update(id: string, patch: Partial<Omit<ScheduleItem, 'id' | 'createdAt'>>): Promise<ScheduleItem | null>;
  remove(id: string): Promise<boolean>;
  runs(limit?: number): Promise<JobRun[]>;
  start(): void;
  stop(): void;
}

export interface IntegrationsController {
  connect(service: 'google' | 'microsoft'): Promise<{ ok: boolean; detail: string }>;
  disconnect(service: 'google' | 'microsoft'): Promise<void>;
  status(): Promise<ConnectionStatus[]>;
}

export interface McpController {
  reload(): Promise<ConnectionStatus[]>;
  status(): ConnectionStatus[];
  closeAll(): Promise<void>;
}

export interface Engine {
  readonly services: EngineServices;
  readonly tools: ToolRegistry;
  readonly events: EventBus;
  readonly voice: VoiceController;
  readonly scheduler: SchedulerController;
  readonly integrations: IntegrationsController;
  readonly mcp: McpController;
  /** Envia uma mensagem ao 300 e aguarda a resposta completa (eventos trazem o andamento). */
  send(input: SendInput): Promise<SendResult>;
  /** Botão de parada geral: cancela modelo, ferramentas, fala e tarefas em segundo plano em andamento. */
  stopAll(reason?: string): void;
  respondConfirmation(id: string, response: ConfirmationResponse): void;
  newConversation(): Promise<string>;
  connections(): Promise<ConnectionStatus[]>;
  shutdown(): Promise<void>;
}

export interface EngineOptions {
  /** Pasta de dados (banco, configurações, modelos de voz). */
  dataDir: string;
  secrets: SecretStore;
  platform: PlatformServices;
  logger?: Logger;
  /** Chave do banco criptografado (vem do SecretStore/safeStorage). Vazio = sem criptografia (só testes). */
  databaseKey?: string;
  /** Substituições para testes automatizados (nunca usadas pelo aplicativo). */
  overrides?: {
    llm?: LlmProvider;
    utilityLlm?: LlmProvider;
    embeddings?: EmbeddingProvider;
    stt?: SttProvider;
    tts?: TtsProvider;
    fetch?: typeof fetch;
    /** Não iniciar agendador/MCP/voz automaticamente. */
    minimal?: boolean;
  };
}

export type CreateEngine = (opts: EngineOptions) => Promise<Engine>;
