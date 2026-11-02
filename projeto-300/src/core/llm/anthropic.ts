/**
 * Provedor Claude (Anthropic) — o cérebro padrão do 300.
 *
 * Decisões importantes (seguindo a documentação oficial da API):
 * - Pensamento adaptativo sempre (Opus 5.5 não aceita desligar) e esforço
 *   (output_config.effort) SEMPRE explícito.
 * - Nada de temperature/top_p/top_k, nada de "prefill", tool_choice sempre auto.
 * - Cache do prompt: marcador no prompt de sistema (que vem depois das
 *   ferramentas, em ordem estável) + cache automático no fim da conversa.
 * - Histórico só cresce: blocos originais (pensamento assinado, pesquisa web...)
 *   ficam em ChatMessage.native e são reenviados sem alteração.
 * - Entradas de ferramenta são lidas de forma ESTRITA (eager_input_streaming
 *   desliga a validação do servidor); JSON inválido nunca executa ferramenta.
 * - Recusa: stop_reason "refusal"; fallback no servidor ("default") quando ligado.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessage,
  BetaMessageParam,
  BetaRawMessageStreamEvent,
  BetaTextBlockParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
  MessageCreateParamsStreaming,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import type {
  ChatMessage,
  ContentPart,
  Effort,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
  LlmUsage,
  ModelCapabilities,
  StopReason,
} from '../types';
import { newId, nowIso } from '../util/ids';
import {
  cancelledError,
  type Dynamic,
  invalidToolInput,
  type InvalidToolInput,
  type KeySource,
  LlmError,
  parseRetryAfter,
  repairToolPairing,
  replayableInput,
  resolveDynamic,
  resolveKey,
  shortDetail,
  textOfParts,
} from './common';

const PROVIDER = 'anthropic';
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const BINDING_BETA = 'thinking-binding-controls-2026-08-01';

/* ======================================================================
 * Perfil de cada modelo
 * ==================================================================== */
export interface AnthropicModelProfile {
  /** thinking: {type: "adaptive"} (modelos 4.6+ e família 5). */
  adaptiveThinking: boolean;
  /** output_config.effort aceito. */
  effort: boolean;
  /** Mensagens role "system" no meio da conversa. */
  midConversationSystem: boolean;
  /** web_search_20260209 / web_fetch_20260209 (com filtragem dinâmica). */
  serverWebTools: boolean;
  /** fallbacks: "default" no servidor. */
  refusalFallback: boolean;
  /**
   * Modelos que conferem se o histórico mudou antes de aceitar blocos de
   * pensamento antigos. Mandamos "drop_block": se o dono mudar ferramentas ou
   * a personalidade no meio da conversa, a API descarta o pensamento antigo em
   * vez de recusar o pedido (o nosso histórico continua só crescendo).
   */
  thinkingBinding: boolean;
  maxOutputTokens: number;
  vision: boolean;
  pdf: boolean;
}

const MID_SYSTEM = new Set([
  'claude-opus-5-5',
  'claude-sonnet-5-5',
  'claude-haiku-5-5',
  'claude-opus-5',
  'claude-opus-4-8',
  'claude-fable-5',
  'claude-fable-5-1',
  'claude-mythos-5',
  'claude-mythos-5-1',
]);

const SERVER_WEB = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-fable-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-5-5',
  'claude-sonnet-5',
  'claude-sonnet-4-6',
]);

const FALLBACK = new Set(['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5', 'claude-fable-5', 'claude-fable-5-1', 'claude-mythos-5-1']);

const BINDING = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-fable-5-1', 'claude-mythos-5-1']);

/** Normaliza o id (remove prefixo do Bedrock, sufixo de data e "[1m]"). */
export function baseModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^(us\.|eu\.|apac\.|global\.)?anthropic\./, '')
    .replace(/\[1m\]$/, '')
    .replace(/-v\d+(:\d+)?$/, '')
    .replace(/-\d{8}$/, '');
}

export function anthropicModelProfile(model: string): AnthropicModelProfile {
  const id = baseModelId(model);
  const gen5 = /^claude-(opus|sonnet|haiku)-5(-\d+)?$/.test(id) || /^claude-(fable|mythos)-5(-\d+)?$/.test(id);
  const opus4 = /^claude-opus-4-(\d+)$/.exec(id);
  const opus4Minor = opus4 ? Number(opus4[1]) : -1;
  const modern = gen5 || opus4Minor >= 6 || id === 'claude-sonnet-4-6';
  // Modelos antigos conhecidos: sem pensamento adaptativo nem esforço.
  const legacy = /^claude-(3|instant|2)/.test(id) || /^claude-(haiku|sonnet)-4-5$/.test(id) || /^claude-(opus|sonnet)-4(-[0-5])?$/.test(id);
  // Modelo futuro desconhecido: assume a API atual, mas sem recursos opcionais arriscados.
  const unknownFuture = !modern && !legacy && id.startsWith('claude-');
  const adaptive = modern || unknownFuture;
  return {
    adaptiveThinking: adaptive,
    effort: adaptive,
    midConversationSystem: MID_SYSTEM.has(id),
    serverWebTools: SERVER_WEB.has(id),
    refusalFallback: FALLBACK.has(id),
    thinkingBinding: BINDING.has(id),
    maxOutputTokens: gen5 || opus4Minor >= 6 ? 128000 : legacy && id.startsWith('claude-3') ? 8192 : 64000,
    vision: true,
    pdf: true,
  };
}

/* ======================================================================
 * Conversão neutra -> Anthropic (pura, testável)
 * ==================================================================== */
type Seg =
  | { role: 'user'; blocks: BetaContentBlockParam[] }
  | { role: 'assistant'; blocks: BetaContentBlockParam[] }
  | { role: 'context'; text: string }
  | { role: 'system'; text: string };

/** Ids de ferramenta aceitos pela Anthropic: ^[a-zA-Z0-9_-]+$ */
export function anthropicToolId(id: string): string {
  const clean = id.replace(/[^a-zA-Z0-9_-]/g, '_');
  return clean === '' ? 'ferramenta' : clean;
}

function cloneJson<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function userBlocks(parts: ContentPart[]): BetaContentBlockParam[] {
  const out: BetaContentBlockParam[] = [];
  for (const p of parts) {
    if (p.type === 'text') {
      if (p.text.trim() !== '') out.push({ type: 'text', text: p.text });
    } else if (p.type === 'image') {
      out.push({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } });
    } else if (p.type === 'document') {
      out.push({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: p.data },
        ...(p.name ? { title: p.name.slice(0, 200) } : {}),
      });
    }
  }
  return out;
}

function toolResultBlocks(parts: ContentPart[]): BetaToolResultBlockParam[] {
  const out: BetaToolResultBlockParam[] = [];
  for (const p of parts) {
    if (p.type !== 'tool_result') continue;
    const content: Array<BetaTextBlockParam | { type: 'image'; source: { type: 'base64'; media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string } }> = [];
    for (const c of p.content) {
      if (c.type === 'text') {
        if (c.text !== '') content.push({ type: 'text', text: c.text });
      } else {
        content.push({ type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.data } });
      }
    }
    if (content.length === 0) content.push({ type: 'text', text: '(sem saída)' });
    out.push({
      type: 'tool_result',
      tool_use_id: anthropicToolId(p.toolCallId),
      content,
      ...(p.isError ? { is_error: true } : {}),
    });
  }
  return out;
}

function assistantBlocks(m: ChatMessage, model: string): BetaContentBlockParam[] {
  const n = m.native;
  if (n && n.provider === PROVIDER && n.model === model && Array.isArray(n.content) && n.content.length > 0) {
    // Reenvio fiel: mesmo provedor e mesmo modelo.
    return cloneJson(n.content as BetaContentBlockParam[]);
  }
  const out: BetaContentBlockParam[] = [];
  for (const p of m.parts) {
    if (p.type === 'text') {
      if (p.text.trim() !== '') out.push({ type: 'text', text: p.text });
    } else if (p.type === 'tool_call') {
      out.push({ type: 'tool_use', id: anthropicToolId(p.id), name: p.name, input: replayableInput(p.input) });
    }
  }
  return out;
}

const isToolResultBlock = (b: BetaContentBlockParam): boolean => b.type === 'tool_result';

/**
 * Converte o histórico neutro para mensagens da API.
 * - Mensagens "context" viram role "system" quando o modelo aceita e a posição
 *   é válida (depois de uma fala do dono e antes de uma resposta, ou no fim);
 *   senão entram como bloco "<contexto>…</contexto>" na fala do dono vizinha.
 * - Vários resultados de ferramenta seguidos ficam em UMA mensagem do dono.
 */
export function toAnthropicMessages(messages: ChatMessage[], opts: { model: string; midConversationSystem?: boolean }): BetaMessageParam[] {
  const mid = opts.midConversationSystem ?? anthropicModelProfile(opts.model).midConversationSystem;
  const segs: Seg[] = [];
  for (const m of repairToolPairing(messages)) {
    if (m.role === 'user') segs.push({ role: 'user', blocks: userBlocks(m.parts) });
    else if (m.role === 'tool') {
      const blocks = toolResultBlocks(m.parts);
      if (blocks.length) segs.push({ role: 'user', blocks });
    } else if (m.role === 'assistant') {
      const blocks = assistantBlocks(m, opts.model);
      if (blocks.length) segs.push({ role: 'assistant', blocks });
    } else if (m.role === 'context') {
      const text = textOfParts(m.parts).trim();
      if (!text) continue;
      const prev = segs[segs.length - 1];
      if (prev && prev.role === 'context') prev.text += '\n\n' + text;
      else segs.push({ role: 'context', text });
    }
  }

  // Posicionamento do contexto.
  const placed: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (s.role !== 'context') {
      placed.push(s);
      continue;
    }
    const prev = placed[placed.length - 1];
    const next = segs[i + 1];
    const valid = mid && prev !== undefined && prev.role === 'user' && (next === undefined || next.role === 'assistant');
    if (valid) {
      placed.push({ role: 'system', text: s.text });
      continue;
    }
    const block: BetaTextBlockParam = { type: 'text', text: `<contexto>\n${s.text}\n</contexto>` };
    if (prev && prev.role === 'user') prev.blocks.push(block);
    else if (next && next.role === 'user') {
      let at = 0;
      while (at < next.blocks.length && isToolResultBlock(next.blocks[at]!)) at++;
      next.blocks.splice(at, 0, block);
    } else placed.push({ role: 'user', blocks: [block] });
  }

  // Junta falas seguidas do mesmo papel (a API faria o mesmo).
  const merged: Seg[] = [];
  for (const s of placed) {
    const last = merged[merged.length - 1];
    if (last && (s.role === 'user' || s.role === 'assistant') && last.role === s.role) {
      last.blocks.push(...s.blocks);
    } else merged.push(s.role === 'user' || s.role === 'assistant' ? { role: s.role, blocks: [...s.blocks] } : s);
  }
  if (merged.length && merged[0]!.role !== 'user') merged.unshift({ role: 'user', blocks: [{ type: 'text', text: '(início da conversa)' }] });

  const out: BetaMessageParam[] = [];
  for (const s of merged) {
    if (s.role === 'system') out.push({ role: 'system', content: s.text });
    else if (s.role === 'user') out.push({ role: 'user', content: s.blocks.length ? s.blocks : [{ type: 'text', text: '(mensagem vazia)' }] });
    else if (s.role === 'assistant') out.push({ role: 'assistant', content: s.blocks });
  }
  return out;
}

/* ======================================================================
 * Montagem do pedido (pura, testável)
 * ==================================================================== */
export interface AnthropicBuildOptions {
  refusalFallback: boolean;
  thinkingDisplay: 'omitted' | 'summarized';
  eagerInputStreaming: boolean;
  defaultMaxTokens: number;
}

export function buildAnthropicRequest(req: LlmRequest, o: AnthropicBuildOptions): MessageCreateParamsStreaming {
  const profile = anthropicModelProfile(req.model);
  const tools: BetaToolUnion[] = [];
  for (const t of req.tools ?? []) {
    tools.push({
      name: t.name,
      description: t.description,
      input_schema: t.inputSchema as { type: 'object'; [k: string]: unknown },
      ...(o.eagerInputStreaming ? { eager_input_streaming: true } : {}),
    });
  }
  // Ferramentas do servidor no fim (ordem estável). Não declarar code_execution junto.
  // Se já existe uma ferramenta local com o mesmo nome, a do servidor fica de fora (nomes não podem repetir).
  const taken = new Set((req.tools ?? []).map((t) => t.name));
  if (profile.serverWebTools && req.serverTools?.webSearch && !taken.has('web_search')) tools.push({ type: 'web_search_20260209', name: 'web_search', max_uses: 8 });
  if (profile.serverWebTools && req.serverTools?.webFetch && !taken.has('web_fetch')) tools.push({ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 });

  const effort: Effort = req.effort ?? 'medium';
  const maxTokens = Math.max(1, Math.min(req.maxTokens ?? o.defaultMaxTokens, profile.maxOutputTokens));
  const params: MessageCreateParamsStreaming = {
    model: req.model,
    max_tokens: maxTokens,
    messages: toAnthropicMessages(req.messages, { model: req.model, midConversationSystem: profile.midConversationSystem }),
    stream: true,
    // Cache automático do fim da conversa (o marcador explícito fica no sistema).
    cache_control: { type: 'ephemeral' },
  };
  if (req.system.trim() !== '') params.system = [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }];
  if (tools.length) params.tools = tools;
  const betas: string[] = [];
  if (profile.adaptiveThinking) {
    params.thinking = {
      type: 'adaptive',
      ...(o.thinkingDisplay === 'summarized' ? { display: 'summarized' as const } : {}),
      ...(profile.thinkingBinding ? { block_binding: { prefix_mismatch_behavior: 'drop_block' as const } } : {}),
    };
    if (profile.thinkingBinding) betas.push(BINDING_BETA);
  }
  if (profile.effort) params.output_config = { effort };
  if (o.refusalFallback && profile.refusalFallback) {
    params.fallbacks = 'default';
    betas.push(FALLBACK_BETA);
  }
  if (betas.length) params.betas = betas;
  return params;
}

/* ======================================================================
 * Resposta -> neutro
 * ==================================================================== */
/**
 * Depois de um fallback no meio da resposta, a documentação manda omitir os
 * blocos de pensamento, chamadas de ferramenta e ferramentas do servidor sem
 * resultado que vieram ANTES do último bloco "fallback" (texto continua).
 */
export function sanitizeFallbackContent(content: BetaContentBlock[]): BetaContentBlock[] {
  let last = -1;
  content.forEach((b, i) => {
    if (b.type === 'fallback') last = i;
  });
  if (last < 0) return content;
  const before = content.slice(0, last);
  const resultIds = new Set<string>();
  for (const b of before) {
    const id = (b as { tool_use_id?: unknown }).tool_use_id;
    if (b.type.endsWith('_tool_result') && typeof id === 'string') resultIds.add(id);
  }
  const keptServerIds = new Set<string>();
  const kept = before.filter((b) => {
    if (b.type === 'text') return true;
    if (b.type === 'server_tool_use') {
      if (resultIds.has(b.id)) {
        keptServerIds.add(b.id);
        return true;
      }
      return false;
    }
    if (b.type.endsWith('_tool_result')) {
      const id = (b as { tool_use_id?: unknown }).tool_use_id;
      return typeof id === 'string' && keptServerIds.has(id);
    }
    return false;
  });
  return [...kept, ...content.slice(last)];
}

export function dropTrailingUnpairedServerTools(content: BetaContentBlock[]): BetaContentBlock[] {
  const answered = new Set<string>();
  for (const b of content) {
    const id = (b as { tool_use_id?: unknown }).tool_use_id;
    if (b.type.endsWith('_tool_result') && typeof id === 'string') answered.add(id);
  }
  let end = content.length;
  while (end > 0) {
    const b = content[end - 1]!;
    if (b.type === 'server_tool_use' && !answered.has(b.id)) end--;
    else break;
  }
  return end === content.length ? content : content.slice(0, end);
}

function mapStopReason(r: string | null | undefined): StopReason {
  switch (r) {
    case 'tool_use':
      return 'tool_use';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    case 'pause_turn':
      return 'pause_turn';
    default:
      return 'end_turn';
  }
}

/** Partes neutras a partir dos blocos (texto contíguo junto; chamadas com entrada estrita). */
export function anthropicContentToParts(content: BetaContentBlock[], invalid: Map<string, InvalidToolInput>, includeToolCalls = true): ContentPart[] {
  const parts: ContentPart[] = [];
  let text = '';
  const flush = () => {
    if (text !== '') parts.push({ type: 'text', text });
    text = '';
  };
  for (const b of content) {
    if (b.type === 'text') text += b.text;
    else if (b.type === 'tool_use' && includeToolCalls) {
      flush();
      parts.push({ type: 'tool_call', id: b.id, name: b.name, input: invalid.get(b.id) ?? b.input });
    }
  }
  flush();
  return parts;
}

/* ======================================================================
 * Erros
 * ==================================================================== */
const ERR = {
  semChave: 'A chave da API da Anthropic (Claude) não está configurada. Abra Configurações › Cérebro e cole a sua chave (começa com "sk-ant-").',
  chaveInvalida: 'A Anthropic recusou a chave da API. Confira em Configurações › Cérebro se a chave está correta e ativa.',
  semPermissao: 'A sua conta da Anthropic não tem permissão para este modelo ou recurso.',
  cobranca: 'A Anthropic recusou o pedido por um problema de cobrança ou falta de créditos na conta.',
  sobrecarga: 'Os servidores da Anthropic estão sobrecarregados agora. Tente de novo em alguns instantes.',
  rede: 'Não consegui falar com a Anthropic. Verifique a conexão com a internet.',
  tempo: 'A Anthropic demorou demais para responder. Tente de novo.',
  contexto: 'A conversa ficou grande demais para o modelo. Comece uma conversa nova (posso levar um resumo).',
  servidor: 'A Anthropic teve um erro interno. Tente de novo em instantes.',
};

/** Mensagem da API (o corpo vem como {type:"error", error:{type, message}}). */
function apiMessage(e: InstanceType<typeof Anthropic.APIError>): string {
  const body = e.error as { error?: { message?: unknown }; message?: unknown } | undefined;
  if (body && typeof body.error?.message === 'string') return body.error.message;
  if (body && typeof body.message === 'string') return body.message;
  return e.message;
}

export function mapAnthropicError(e: unknown, model: string, signal?: AbortSignal): LlmError {
  if (e instanceof LlmError) return e;
  if (signal?.aborted || e instanceof Anthropic.APIUserAbortError) return cancelledError(PROVIDER);
  const opts = (status?: number, extra?: { retryAfterSec?: number }) => ({ provider: PROVIDER, cause: e, ...(status !== undefined ? { status } : {}), ...extra });
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new LlmError('tempo_esgotado', ERR.tempo, opts());
  if (e instanceof Anthropic.APIConnectionError) return new LlmError('rede', ERR.rede, opts());
  if (e instanceof Anthropic.AuthenticationError) return new LlmError('chave_invalida', ERR.chaveInvalida, opts(401));
  if (e instanceof Anthropic.PermissionDeniedError) return new LlmError('sem_permissao', ERR.semPermissao, opts(403));
  if (e instanceof Anthropic.NotFoundError)
    return new LlmError('modelo_nao_encontrado', `O modelo "${model}" não foi encontrado ou não está liberado para a sua conta da Anthropic.`, opts(404));
  if (e instanceof Anthropic.RateLimitError) {
    const ra = parseRetryAfter(e.headers);
    const msg = `Limite de uso da Anthropic atingido (muitos pedidos em pouco tempo).${ra ? ` Tente de novo em cerca de ${ra} s.` : ' Tente de novo em instantes.'}`;
    return new LlmError('limite_taxa', msg, opts(429, ra !== undefined ? { retryAfterSec: ra } : undefined));
  }
  if (e instanceof Anthropic.APIError) {
    const status = typeof e.status === 'number' ? e.status : undefined;
    if (e.type === 'billing_error' || status === 402) return new LlmError('cobranca', ERR.cobranca, opts(status));
    if (e.type === 'overloaded_error' || status === 529) return new LlmError('sobrecarga', ERR.sobrecarga, opts(status));
    if (status === 413) return new LlmError('contexto_grande', ERR.contexto, opts(status));
    if (e.type === 'rate_limit_error') return new LlmError('limite_taxa', 'Limite de uso da Anthropic atingido. Tente de novo em instantes.', opts(status));
    if (e.type === 'timeout_error') return new LlmError('tempo_esgotado', ERR.tempo, opts(status));
    if (status !== undefined && status >= 500) return new LlmError('servidor', ERR.servidor, opts(status));
    const detail = shortDetail(apiMessage(e));
    // A API não tem um tipo próprio para "prompt longo demais": só a mensagem diz.
    if (/prompt is too long|context (window|length)|too many tokens/i.test(detail)) return new LlmError('contexto_grande', ERR.contexto, opts(status));
    return new LlmError('requisicao_invalida', `A Anthropic recusou o pedido: ${detail || 'pedido inválido'}.`, opts(status));
  }
  return new LlmError('desconhecido', `Erro inesperado ao falar com a Anthropic: ${shortDetail(e) || 'sem detalhes'}.`, opts());
}

/* ======================================================================
 * Provedor
 * ==================================================================== */
export interface AnthropicProviderOptions {
  /** Chave da API (texto ou função lida a cada uso — ex.: do SecretStore). */
  apiKey: KeySource;
  /** Endereço da API (testes usam um servidor local). Padrão: api.anthropic.com. */
  baseURL?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  /** Fallback do servidor quando o modelo recusa (settings.brain.refusalFallback). */
  refusalFallback?: Dynamic<boolean>;
  /** "summarized" devolve resumos do raciocínio (settings.ui.showThinking). */
  thinkingDisplay?: Dynamic<'omitted' | 'summarized'>;
  /** Padrão true. Desligue só se a URL não for a API real da Anthropic e ela rejeitar o campo. */
  eagerInputStreaming?: boolean;
  defaultMaxTokens?: number;
  /** Quantas vezes continuar automaticamente um "pause_turn" (padrão 5). */
  maxPauseContinuations?: number;
}

interface Accum {
  message: BetaMessage | null;
  content: BetaContentBlock[];
  bufs: Map<number, string>;
  /** Recebeu message_stop (resposta completa). */
  stopped: boolean;
}

export class AnthropicProvider implements LlmProvider {
  readonly id = PROVIDER;
  readonly label = 'Claude (Anthropic)';
  private cached?: { key: string; client: Anthropic };

  constructor(private readonly opts: AnthropicProviderOptions) {}

  capabilities(model: string): ModelCapabilities {
    const p = anthropicModelProfile(model);
    return { vision: p.vision, pdf: p.pdf, tools: true, serverWebSearch: p.serverWebTools, serverWebFetch: p.serverWebTools };
  }

  private async client(): Promise<Anthropic> {
    const key = await resolveKey(this.opts.apiKey);
    if (!key) throw new LlmError('sem_chave', ERR.semChave, { provider: PROVIDER });
    if (this.cached && this.cached.key === key) return this.cached.client;
    const client = new Anthropic({
      apiKey: key,
      // Endereço explícito: variáveis de ambiente não conseguem desviar o tráfego.
      baseURL: this.opts.baseURL ?? DEFAULT_BASE_URL,
      maxRetries: this.opts.maxRetries ?? 2,
      timeout: this.opts.timeoutMs ?? 10 * 60 * 1000,
      ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
    });
    this.cached = { key, client };
    return client;
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const signal = req.signal;
    if (signal?.aborted) throw cancelledError(PROVIDER);
    let client: Anthropic;
    try {
      client = await this.client();
    } catch (e) {
      throw mapAnthropicError(e, req.model, signal);
    }
    const params = buildAnthropicRequest(req, {
      refusalFallback: resolveDynamic(this.opts.refusalFallback ?? true),
      thinkingDisplay: resolveDynamic(this.opts.thinkingDisplay ?? 'omitted'),
      eagerInputStreaming: this.opts.eagerInputStreaming ?? true,
      defaultMaxTokens: this.opts.defaultMaxTokens ?? 32000,
    });
    const maxCont = this.opts.maxPauseContinuations ?? 5;

    const all: BetaContentBlock[] = [];
    const invalid = new Map<string, InvalidToolInput>();
    const usage: LlmUsage = {};
    let stopRaw: string | null = null;
    let stopDetails: BetaMessage['stop_details'] = null;
    let messages = params.messages;

    for (let cont = 0; ; cont++) {
      const acc: Accum = { message: null, content: [], bufs: new Map(), stopped: false };
      const names = new Map<number, string>();
      let stream: Awaited<ReturnType<typeof client.beta.messages.create>> | undefined;
      let finished = false;
      try {
        stream = await client.beta.messages.create({ ...params, messages }, signal ? { signal } : undefined);
        for await (const ev of stream as AsyncIterable<BetaRawMessageStreamEvent>) {
          for (const out of this.accumulate(acc, ev, names, invalid)) yield out;
        }
        // O SDK encerra o laço em silêncio quando o sinal é abortado: confere aqui.
        if (signal?.aborted) throw cancelledError(PROVIDER);
        if (!acc.stopped) throw new LlmError('rede', 'A conexão com a Anthropic caiu no meio da resposta. Tente de novo.', { provider: PROVIDER });
        finished = true;
      } catch (e) {
        throw mapAnthropicError(e, req.model, signal);
      } finally {
        if (!finished && stream && 'controller' in stream) (stream as { controller: AbortController }).controller.abort();
      }
      if (!acc.message) throw new LlmError('servidor', 'A Anthropic encerrou a resposta sem conteúdo. Tente de novo.', { provider: PROVIDER });
      const msg = acc.message;
      const content = acc.content.filter((b): b is BetaContentBlock => b !== undefined && b !== null);
      all.push(...content);
      addUsage(usage, msg.usage);
      stopRaw = msg.stop_reason;
      stopDetails = msg.stop_details;
      if (stopRaw === 'pause_turn' && cont < maxCont) {
        // A pesquisa do servidor pausou: reenvia o turno para ele continuar (sem "continue" extra).
        messages = [...messages, { role: 'assistant', content: cloneJson(content) as BetaContentBlockParam[] }];
        continue;
      }
      break;
    }

    const stopReason = mapStopReason(stopRaw);
    let content = cloneJson(sanitizeFallbackContent(all));
    // Limite de continuações atingido: não deixa uma pesquisa do servidor sem resultado no fim
    // (o próximo pedido seria inválido).
    if (stopReason === 'pause_turn') content = dropTrailingUnpairedServerTools(content);
    const includeCalls = stopReason !== 'refusal';
    const parts = anthropicContentToParts(content, invalid, includeCalls);
    if (includeCalls) {
      for (const p of parts) if (p.type === 'tool_call') yield { type: 'tool_call', call: { id: p.id, name: p.name, input: p.input } };
    }
    const message: ChatMessage = {
      id: newId('msg'),
      role: 'assistant',
      parts,
      createdAt: nowIso(),
      native: { provider: PROVIDER, model: req.model, content },
    };
    yield {
      type: 'done',
      message,
      stopReason,
      usage,
      refusalCategory: stopReason === 'refusal' ? (stopDetails?.category ?? null) : null,
    };
  }

  /** Acumula um evento SSE e devolve os eventos neutros correspondentes. */
  private *accumulate(acc: Accum, ev: BetaRawMessageStreamEvent, names: Map<number, string>, invalid: Map<string, InvalidToolInput>): Generator<LlmStreamEvent> {
    switch (ev.type) {
      case 'message_start':
        acc.message = cloneJson(ev.message);
        acc.content = [];
        return;
      case 'content_block_start': {
        const block = cloneJson(ev.content_block) as BetaContentBlock;
        acc.content[ev.index] = block;
        if (block.type === 'tool_use' || block.type === 'server_tool_use' || block.type === 'mcp_tool_use') {
          acc.bufs.set(ev.index, '');
          names.set(ev.index, block.name);
        }
        return;
      }
      case 'content_block_delta': {
        const block = acc.content[ev.index];
        const d = ev.delta;
        if (d.type === 'text_delta') {
          if (block && block.type === 'text') block.text += d.text;
          if (d.text) yield { type: 'text_delta', text: d.text };
        } else if (d.type === 'thinking_delta') {
          if (block && block.type === 'thinking') block.thinking += d.thinking;
          if (d.thinking) yield { type: 'thinking_delta', text: d.thinking };
        } else if (d.type === 'signature_delta') {
          if (block && block.type === 'thinking') block.signature = d.signature;
        } else if (d.type === 'input_json_delta') {
          acc.bufs.set(ev.index, (acc.bufs.get(ev.index) ?? '') + d.partial_json);
        } else if (d.type === 'citations_delta') {
          if (block && block.type === 'text') block.citations = [...(block.citations ?? []), d.citation];
          if (d.citation.type === 'web_search_result_location') {
            yield { type: 'citation', url: d.citation.url, ...(d.citation.title ? { title: d.citation.title } : {}) };
          }
        } else if (d.type === 'compaction_delta') {
          if (block && block.type === 'compaction') {
            const upd = block as unknown as Record<string, unknown>;
            upd.content = d.content;
            if ('encrypted_content' in d) upd.encrypted_content = (d as { encrypted_content?: unknown }).encrypted_content;
          }
        }
        return;
      }
      case 'content_block_stop': {
        const block = acc.content[ev.index];
        const raw = acc.bufs.get(ev.index);
        if (!block || raw === undefined) return;
        acc.bufs.delete(ev.index);
        if (block.type !== 'tool_use' && block.type !== 'server_tool_use' && block.type !== 'mcp_tool_use') return;
        if (raw.trim() !== '') {
          try {
            const parsed = JSON.parse(raw) as unknown;
            (block as { input: unknown }).input = parsed;
          } catch (err) {
            // JSON inválido: a ferramenta não será executada; o modelo recebe o erro.
            (block as { input: unknown }).input = {};
            if (block.type === 'tool_use') invalid.set(block.id, invalidToolInput(raw, err instanceof Error ? err.message : String(err)));
          }
        }
        if (block.type === 'server_tool_use') {
          const input = (block.input ?? {}) as Record<string, unknown>;
          const detail = typeof input.query === 'string' ? input.query : typeof input.url === 'string' ? input.url : '';
          yield { type: 'server_tool', name: names.get(ev.index) ?? block.name, detail };
        }
        return;
      }
      case 'message_delta': {
        const m = acc.message;
        if (!m) return;
        m.stop_reason = ev.delta.stop_reason;
        m.stop_sequence = ev.delta.stop_sequence ?? null;
        m.stop_details = ev.delta.stop_details ?? null;
        const u = ev.usage;
        m.usage.output_tokens = u.output_tokens;
        if (u.input_tokens != null) m.usage.input_tokens = u.input_tokens;
        if (u.cache_creation_input_tokens != null) m.usage.cache_creation_input_tokens = u.cache_creation_input_tokens;
        if (u.cache_read_input_tokens != null) m.usage.cache_read_input_tokens = u.cache_read_input_tokens;
        if (u.server_tool_use != null) m.usage.server_tool_use = u.server_tool_use;
        return;
      }
      case 'message_stop':
        if (acc.message) acc.message.content = acc.content;
        acc.stopped = true;
        return;
      default:
        return;
    }
  }

  async listModels(): Promise<string[]> {
    const client = await this.client().catch((e: unknown) => {
      throw mapAnthropicError(e, '');
    });
    const ids: string[] = [];
    try {
      for await (const m of client.models.list({ limit: 100 })) ids.push(m.id);
    } catch (e) {
      throw mapAnthropicError(e, '');
    }
    return ids;
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = await this.client();
      const page = await client.models.list({ limit: 1 });
      return { ok: true, detail: page.data.length ? 'Conectado à Anthropic.' : 'Conectado à Anthropic (nenhum modelo listado).' };
    } catch (e) {
      return { ok: false, detail: mapAnthropicError(e, '').message };
    }
  }
}

function addUsage(u: LlmUsage, m: BetaMessage['usage']): void {
  u.inputTokens = (u.inputTokens ?? 0) + (m.input_tokens ?? 0);
  u.outputTokens = (u.outputTokens ?? 0) + (m.output_tokens ?? 0);
  if (m.cache_read_input_tokens != null) u.cacheReadTokens = (u.cacheReadTokens ?? 0) + m.cache_read_input_tokens;
  if (m.cache_creation_input_tokens != null) u.cacheWriteTokens = (u.cacheWriteTokens ?? 0) + m.cache_creation_input_tokens;
  const s = m.server_tool_use;
  if (s) {
    const prev = u.serverToolUses ?? {};
    u.serverToolUses = {
      ...prev,
      web_search: (prev.web_search ?? 0) + (s.web_search_requests ?? 0),
      web_fetch: (prev.web_fetch ?? 0) + (s.web_fetch_requests ?? 0),
    };
  }
}
