/**
 * Configurações do 300 (sem segredos: chaves de API ficam no SecretStore).
 * O esquema zod define os padrões; arquivos antigos são completados com eles.
 */
import { z } from 'zod';

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;

export const McpServerSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  transport: z.enum(['stdio', 'http']),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  url: z.string().optional(),
  enabled: z.boolean().default(true),
  /** Risco atribuído a todas as ferramentas deste servidor (padrão: externo = sempre pergunta). */
  risk: z.enum(['read', 'write', 'external', 'destructive', 'financial', 'system']).default('external'),
});
export type McpServerConfig = z.infer<typeof McpServerSchema>;

export const SettingsSchema = z.object({
  version: z.literal(1).default(1),
  persona: z
    .object({
      name: z.string().default('300'),
      userName: z.string().default(''),
      language: z.string().default('pt-BR'),
      /** 0 = sério, 1 = bem-humorado. */
      humor: z.number().min(0).max(1).default(0.6),
      extraInstructions: z.string().default(''),
    })
    .prefault({}),
  brain: z
    .object({
      provider: z.enum(['anthropic', 'openai', 'ollama']).default('anthropic'),
      model: z.string().default('claude-opus-5-5'),
      effortChat: z.enum(EFFORTS).default('medium'),
      effortVoice: z.enum(EFFORTS).default('low'),
      /** Modelo barato para tarefas internas (resumos, extração de memória). */
      utilityProvider: z.enum(['anthropic', 'openai', 'ollama']).default('anthropic'),
      utilityModel: z.string().default('claude-haiku-5-5'),
      openaiModel: z.string().default('gpt-5.1'),
      ollamaUrl: z.string().default('http://127.0.0.1:11434'),
      ollamaModel: z.string().default('qwen3:8b'),
      /** Usa as ferramentas nativas de pesquisa/leitura web do provedor quando existirem (Claude). */
      useServerWebTools: z.boolean().default(true),
      maxToolSteps: z.number().int().min(1).max(50).default(12),
      /** Fallback automático do servidor quando o modelo recusa (Claude). */
      refusalFallback: z.boolean().default(true),
    })
    .prefault({}),
  embeddings: z
    .object({
      provider: z.enum(['none', 'openai', 'ollama']).default('none'),
      openaiModel: z.string().default('text-embedding-3-small'),
      ollamaModel: z.string().default('embeddinggemma'),
    })
    .prefault({}),
  voice: z
    .object({
      enabled: z.boolean().default(true),
      sttProvider: z.enum(['local', 'openai']).default('local'),
      sttModel: z.string().default('gpt-4o-mini-transcribe'),
      localSttModel: z.enum(['whisper-tiny', 'whisper-base', 'whisper-small']).default('whisper-base'),
      ttsProvider: z.enum(['local', 'openai', 'elevenlabs', 'system']).default('local'),
      ttsVoice: z.string().default(''),
      volume: z.number().min(0).max(1).default(0.9),
      speed: z.number().min(0.5).max(2).default(1),
      /** Depois de responder, continua ouvindo sem precisar da palavra de ativação. */
      continuousMode: z.boolean().default(true),
      /** Segundos de silêncio para encerrar o modo contínuo. */
      continuousTimeoutSec: z.number().min(3).max(120).default(12),
      /** Interromper a fala do 300 quando o dono começar a falar. */
      bargeIn: z.boolean().default(true),
      /** Limiar do detector de fala (0..1). */
      vadThreshold: z.number().min(0.1).max(0.95).default(0.5),
      noiseReduction: z.boolean().default(true),
    })
    .prefault({}),
  wake: z
    .object({
      /** Desligado até o dono ativar (privacidade por padrão). */
      enabled: z.boolean().default(false),
      engine: z.enum(['local', 'porcupine']).default('local'),
      /** 0..1: maior = dispara com mais facilidade (mais falsos positivos). */
      sensitivity: z.number().min(0).max(1).default(0.5),
      porcupineKeywordPath: z.string().default(''),
      porcupineModelPath: z.string().default(''),
      hotkey: z.string().default('CommandOrControl+Shift+Space'),
      chime: z.boolean().default(true),
    })
    .prefault({}),
  privacy: z
    .object({
      backgroundMode: z.boolean().default(true),
      autoStart: z.boolean().default(false),
      storeConversations: z.boolean().default(true),
      memoryAutoExtract: z.boolean().default(true),
      /** Memórias sensíveis (saúde, finanças, documentos) só com pedido explícito. */
      sensitiveRequiresExplicit: z.boolean().default(true),
      cameraAllowed: z.boolean().default(false),
      screenCaptureAllowed: z.boolean().default(true),
    })
    .prefault({}),
  search: z
    .object({
      provider: z.enum(['auto', 'anthropic', 'brave', 'tavily', 'searxng']).default('auto'),
      searxngUrl: z.string().default(''),
      maxResults: z.number().int().min(1).max(20).default(6),
      safeSearch: z.boolean().default(true),
    })
    .prefault({}),
  permissions: z
    .object({
      /** Pastas onde o 300 pode ler/escrever arquivos. Vazio = Documentos, Área de Trabalho e Downloads. */
      fileRoots: z.array(z.string()).default([]),
      /** Escritas locais reversíveis sem perguntar (fora isso, sempre pergunta). */
      autoApproveWrites: z.boolean().default(false),
      shellEnabled: z.boolean().default(true),
      computerControlEnabled: z.boolean().default(true),
      browserAutomationEnabled: z.boolean().default(true),
      /** Segundos para o pedido de confirmação expirar (expirado = negado). */
      confirmationTimeoutSec: z.number().int().min(10).max(600).default(120),
    })
    .prefault({}),
  integrations: z
    .object({
      googleClientId: z.string().default(''),
      microsoftClientId: z.string().default(''),
      mcpServers: z.array(McpServerSchema).default([]),
    })
    .prefault({}),
  ui: z
    .object({
      startMinimized: z.boolean().default(false),
      showThinking: z.boolean().default(false),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

type DeepPartial<T> = T extends (infer U)[] ? U[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
export type SettingsPatch = DeepPartial<Settings>;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

/** Mescla profunda de objetos simples (arrays são substituídos). */
export function mergeSettings(base: Settings, patch: SettingsPatch): Settings {
  const merge = (a: any, b: any): any => {
    if (b === undefined) return a;
    if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
    const out: any = { ...(a ?? {}) };
    for (const k of Object.keys(b)) out[k] = merge(a?.[k], b[k]);
    return out;
  };
  return SettingsSchema.parse(merge(base, patch));
}
