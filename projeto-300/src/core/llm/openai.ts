/**
 * Provedor OpenAI (API Responses, a API principal do SDK oficial).
 *
 * - store: false (nada fica guardado nos servidores da OpenAI) e os itens de
 *   raciocínio voltam criptografados (include: reasoning.encrypted_content),
 *   para reenviar o histórico sem perder o raciocínio.
 * - Saída original (output items) fica em ChatMessage.native e é reenviada
 *   sem alteração para o mesmo modelo.
 * - Mensagens "context" viram mensagens role "developer".
 * - Nunca envia temperature/top_p.
 */
import OpenAI from 'openai';
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems';
import type {
  FunctionTool,
  ResponseCreateParamsStreaming,
  ResponseFunctionCallOutputItemList,
  ResponseInputContent,
  ResponseInputItem,
  ResponseOutputItem,
  Response as OpenAIResponse,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';
import type { ChatMessage, ContentPart, Effort, LlmProvider, LlmRequest, LlmStreamEvent, LlmUsage, ModelCapabilities, StopReason } from '../types';
import { newId, nowIso } from '../util/ids';
import {
  cancelledError,
  dataUrl,
  isInvalidToolInput,
  type KeySource,
  LlmError,
  parseRetryAfter,
  parseToolArguments,
  repairToolPairing,
  replayableInput,
  resolveKey,
  shortDetail,
  textOfParts,
} from './common';

const PROVIDER = 'openai';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

/* ======================================================================
 * Perfil do modelo
 * ==================================================================== */
export interface OpenAIModelProfile {
  reasoning: boolean;
  vision: boolean;
  pdf: boolean;
}

export function openAIModelProfile(model: string): OpenAIModelProfile {
  const id = model.trim().toLowerCase();
  const reasoning = /^(o\d|gpt-5|gpt-oss|codex)/.test(id);
  // Modelos antigos só de texto.
  const textOnly = /^(gpt-3\.5|gpt-4-0|gpt-4$|gpt-4-32k|davinci|babbage|o1-mini|o3-mini|gpt-oss)/.test(id);
  return { reasoning, vision: !textOnly, pdf: !textOnly };
}

/** Nosso esforço -> esforço de raciocínio da OpenAI (níveis extras viram "high", o mais seguro). */
export function openAIEffort(e: Effort | undefined): 'low' | 'medium' | 'high' {
  if (e === 'low') return 'low';
  if (e === 'medium' || e === undefined) return 'medium';
  return 'high';
}

/* ======================================================================
 * Conversão neutra -> OpenAI (pura, testável)
 * ==================================================================== */
function userContent(parts: ContentPart[]): ResponseInputContent[] {
  const out: ResponseInputContent[] = [];
  for (const p of parts) {
    if (p.type === 'text') {
      if (p.text.trim() !== '') out.push({ type: 'input_text', text: p.text });
    } else if (p.type === 'image') {
      out.push({ type: 'input_image', image_url: dataUrl(p.mediaType, p.data), detail: 'auto' });
    } else if (p.type === 'document') {
      out.push({ type: 'input_file', filename: p.name || 'documento.pdf', file_data: dataUrl('application/pdf', p.data) });
    }
  }
  return out.length ? out : [{ type: 'input_text', text: '(mensagem vazia)' }];
}

function nativeItems(m: ChatMessage, model: string): ResponseInputItem[] | null {
  const n = m.native;
  if (!n || n.provider !== PROVIDER || n.model !== model || !Array.isArray(n.content) || n.content.length === 0) return null;
  try {
    return toResponseInputItems(JSON.parse(JSON.stringify(n.content)) as ResponseOutputItem[]);
  } catch {
    return null;
  }
}

function toolOutput(p: Extract<ContentPart, { type: 'tool_result' }>): string | ResponseFunctionCallOutputItemList {
  const prefix = p.isError ? '[erro] ' : '';
  const hasImage = p.content.some((c) => c.type === 'image');
  if (!hasImage) {
    const text = p.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
    return prefix + (text === '' ? '(sem saída)' : text);
  }
  const list: ResponseFunctionCallOutputItemList = [];
  if (prefix) list.push({ type: 'input_text', text: prefix.trim() });
  for (const c of p.content) {
    if (c.type === 'text') {
      if (c.text !== '') list.push({ type: 'input_text', text: c.text });
    } else list.push({ type: 'input_image', image_url: dataUrl(c.mediaType, c.data), detail: 'auto' });
  }
  return list;
}

/** Histórico neutro -> itens de entrada da API Responses. */
export function toOpenAIInput(messages: ChatMessage[], opts: { model: string }): ResponseInputItem[] {
  const out: ResponseInputItem[] = [];
  for (const m of repairToolPairing(messages)) {
    if (m.role === 'user') {
      out.push({ type: 'message', role: 'user', content: userContent(m.parts) });
    } else if (m.role === 'context') {
      const text = textOfParts(m.parts).trim();
      if (text) out.push({ type: 'message', role: 'developer', content: text });
    } else if (m.role === 'assistant') {
      const native = nativeItems(m, opts.model);
      if (native) {
        out.push(...native);
        continue;
      }
      for (const p of m.parts) {
        if (p.type === 'text' && p.text.trim() !== '') out.push({ type: 'message', role: 'assistant', content: p.text });
        else if (p.type === 'tool_call') {
          out.push({
            type: 'function_call',
            call_id: p.id,
            name: p.name,
            arguments: isInvalidToolInput(p.input) ? p.input.raw : JSON.stringify(replayableInput(p.input)),
          });
        }
      }
    } else if (m.role === 'tool') {
      for (const p of m.parts) {
        if (p.type === 'tool_result') out.push({ type: 'function_call_output', call_id: p.toolCallId, output: toolOutput(p) });
      }
    }
  }
  return out;
}

export function buildOpenAIRequest(req: LlmRequest, opts: { defaultMaxTokens: number }): ResponseCreateParamsStreaming {
  const profile = openAIModelProfile(req.model);
  const tools: FunctionTool[] = (req.tools ?? []).map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.inputSchema,
    strict: false,
  }));
  const params: ResponseCreateParamsStreaming = {
    model: req.model,
    input: toOpenAIInput(req.messages, { model: req.model }),
    stream: true,
    store: false,
    max_output_tokens: req.maxTokens ?? opts.defaultMaxTokens,
  };
  if (req.system.trim() !== '') params.instructions = req.system;
  if (tools.length) {
    params.tools = tools;
    params.parallel_tool_calls = true;
  }
  if (profile.reasoning) {
    params.reasoning = { effort: openAIEffort(req.effort) };
    params.include = ['reasoning.encrypted_content'];
  }
  return params;
}

/** Itens de saída -> partes neutras. */
export function openAIOutputToParts(output: ResponseOutputItem[]): { parts: ContentPart[]; refusal: string } {
  const parts: ContentPart[] = [];
  let refusal = '';
  let text = '';
  const flush = () => {
    if (text !== '') parts.push({ type: 'text', text });
    text = '';
  };
  for (const item of output) {
    if (item.type === 'message') {
      for (const c of item.content) {
        if (c.type === 'output_text') text += c.text;
        else if (c.type === 'refusal') refusal += c.refusal;
      }
    } else if (item.type === 'function_call') {
      flush();
      parts.push({ type: 'tool_call', id: item.call_id, name: item.name, input: parseToolArguments(item.arguments) });
    }
  }
  flush();
  return { parts, refusal };
}

/* ======================================================================
 * Erros
 * ==================================================================== */
const ERR = {
  semChave: 'A chave da API da OpenAI não está configurada. Abra Configurações › Cérebro e cole a sua chave (começa com "sk-").',
  chaveInvalida: 'A OpenAI recusou a chave da API. Confira em Configurações › Cérebro se a chave está correta e ativa.',
  semPermissao: 'A sua conta da OpenAI não tem permissão para este modelo ou recurso.',
  cobranca: 'A conta da OpenAI está sem créditos ou com problema de cobrança.',
  sobrecarga: 'Os servidores da OpenAI estão sobrecarregados agora. Tente de novo em instantes.',
  rede: 'Não consegui falar com a OpenAI. Verifique a conexão com a internet.',
  tempo: 'A OpenAI demorou demais para responder. Tente de novo.',
  contexto: 'A conversa ficou grande demais para o modelo. Comece uma conversa nova (posso levar um resumo).',
  servidor: 'A OpenAI teve um erro interno. Tente de novo em instantes.',
};

function errorFromCode(code: string | null | undefined, message: string, cause: unknown): LlmError {
  const base = { provider: PROVIDER, cause };
  switch (code) {
    case 'rate_limit_exceeded':
      return new LlmError('limite_taxa', 'Limite de uso da OpenAI atingido. Tente de novo em instantes.', base);
    case 'insufficient_quota':
      return new LlmError('cobranca', ERR.cobranca, base);
    case 'context_length_exceeded':
      return new LlmError('contexto_grande', ERR.contexto, base);
    case 'server_error':
      return new LlmError('servidor', ERR.servidor, base);
    case 'invalid_api_key':
      return new LlmError('chave_invalida', ERR.chaveInvalida, base);
    default:
      return new LlmError('requisicao_invalida', `A OpenAI recusou o pedido: ${shortDetail(message) || 'pedido inválido'}.`, base);
  }
}

export function mapOpenAIError(e: unknown, model: string, signal?: AbortSignal): LlmError {
  if (e instanceof LlmError) return e;
  if (signal?.aborted || e instanceof OpenAI.APIUserAbortError) return cancelledError(PROVIDER);
  const o = (status?: number, extra?: { retryAfterSec?: number }) => ({ provider: PROVIDER, cause: e, ...(status !== undefined ? { status } : {}), ...extra });
  if (e instanceof OpenAI.APIConnectionTimeoutError) return new LlmError('tempo_esgotado', ERR.tempo, o());
  if (e instanceof OpenAI.APIConnectionError) return new LlmError('rede', ERR.rede, o());
  if (e instanceof OpenAI.AuthenticationError) return new LlmError('chave_invalida', ERR.chaveInvalida, o(401));
  if (e instanceof OpenAI.PermissionDeniedError) return new LlmError('sem_permissao', ERR.semPermissao, o(403));
  if (e instanceof OpenAI.NotFoundError) return new LlmError('modelo_nao_encontrado', `O modelo "${model}" não foi encontrado ou não está liberado para a sua conta da OpenAI.`, o(404));
  if (e instanceof OpenAI.RateLimitError) {
    if (e.code === 'insufficient_quota') return new LlmError('cobranca', ERR.cobranca, o(429));
    const ra = parseRetryAfter(e.headers);
    const msg = `Limite de uso da OpenAI atingido.${ra ? ` Tente de novo em cerca de ${ra} s.` : ' Tente de novo em instantes.'}`;
    return new LlmError('limite_taxa', msg, o(429, ra !== undefined ? { retryAfterSec: ra } : undefined));
  }
  if (e instanceof OpenAI.APIError) {
    const status = typeof e.status === 'number' ? e.status : undefined;
    if (e.code === 'context_length_exceeded') return new LlmError('contexto_grande', ERR.contexto, o(status));
    if (status === 503) return new LlmError('sobrecarga', ERR.sobrecarga, o(status));
    if (status !== undefined && status >= 500) return new LlmError('servidor', ERR.servidor, o(status));
    if (status === undefined && e.code) return errorFromCode(e.code, e.message, e);
    return new LlmError('requisicao_invalida', `A OpenAI recusou o pedido: ${shortDetail(e.message) || 'pedido inválido'}.`, o(status));
  }
  return new LlmError('desconhecido', `Erro inesperado ao falar com a OpenAI: ${shortDetail(e) || 'sem detalhes'}.`, o());
}

/* ======================================================================
 * Provedor
 * ==================================================================== */
export interface OpenAIProviderOptions {
  apiKey: KeySource;
  /** Padrão https://api.openai.com/v1 (testes usam um servidor local). */
  baseURL?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  defaultMaxTokens?: number;
}

export class OpenAIProvider implements LlmProvider {
  readonly id = PROVIDER;
  readonly label = 'OpenAI';
  private cached?: { key: string; client: OpenAI };

  constructor(private readonly opts: OpenAIProviderOptions) {}

  capabilities(model: string): ModelCapabilities {
    const p = openAIModelProfile(model);
    return { vision: p.vision, pdf: p.pdf, tools: true, serverWebSearch: false, serverWebFetch: false };
  }

  private async client(): Promise<OpenAI> {
    const key = await resolveKey(this.opts.apiKey);
    if (!key) throw new LlmError('sem_chave', ERR.semChave, { provider: PROVIDER });
    if (this.cached && this.cached.key === key) return this.cached.client;
    const client = new OpenAI({
      apiKey: key,
      baseURL: this.opts.baseURL ?? DEFAULT_BASE_URL,
      organization: null,
      project: null,
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
    let client: OpenAI;
    try {
      client = await this.client();
    } catch (e) {
      throw mapOpenAIError(e, req.model, signal);
    }
    const params = buildOpenAIRequest(req, { defaultMaxTokens: this.opts.defaultMaxTokens ?? 32000 });
    const items: ResponseOutputItem[] = [];
    let final: OpenAIResponse | null = null;
    let finished = false;
    let stream: AsyncIterable<ResponseStreamEvent> & { controller?: AbortController } | undefined;
    try {
      stream = await client.responses.create(params, signal ? { signal } : undefined);
      for await (const ev of stream) {
        switch (ev.type) {
          case 'response.output_text.delta':
            if (ev.delta) yield { type: 'text_delta', text: ev.delta };
            break;
          case 'response.reasoning_summary_text.delta':
            if (ev.delta) yield { type: 'thinking_delta', text: ev.delta };
            break;
          case 'response.output_text.annotation.added': {
            const a = ev.annotation as { type?: string; url?: string; title?: string } | null;
            if (a && a.type === 'url_citation' && typeof a.url === 'string') yield { type: 'citation', url: a.url, ...(a.title ? { title: a.title } : {}) };
            break;
          }
          case 'response.output_item.done':
            items[ev.output_index] = ev.item;
            break;
          case 'response.completed':
          case 'response.incomplete':
            final = ev.response;
            break;
          case 'response.failed':
            throw errorFromCode(ev.response.error?.code, ev.response.error?.message ?? 'falha', ev);
          case 'error':
            throw errorFromCode(ev.code, ev.message, ev);
          default:
            break;
        }
      }
      // O SDK pode encerrar o laço em silêncio quando o sinal é abortado.
      if (signal?.aborted) throw cancelledError(PROVIDER);
      if (!final) throw new LlmError('rede', 'A conexão com a OpenAI caiu no meio da resposta. Tente de novo.', { provider: PROVIDER });
      finished = true;
    } catch (e) {
      throw mapOpenAIError(e, req.model, signal);
    } finally {
      if (!finished && stream?.controller) stream.controller.abort();
    }

    const output = JSON.parse(JSON.stringify(final?.output?.length ? final.output : items.filter(Boolean))) as ResponseOutputItem[];
    const { parts, refusal } = openAIOutputToParts(output);
    const reason = final?.incomplete_details?.reason;
    let stopReason: StopReason = 'end_turn';
    if (refusal || reason === 'content_filter') stopReason = 'refusal';
    else if (reason === 'max_output_tokens') stopReason = 'max_tokens';
    else if (parts.some((p) => p.type === 'tool_call')) stopReason = 'tool_use';

    const finalParts = stopReason === 'refusal' ? parts.filter((p) => p.type !== 'tool_call') : parts;
    if (stopReason !== 'refusal') {
      for (const p of finalParts) if (p.type === 'tool_call') yield { type: 'tool_call', call: { id: p.id, name: p.name, input: p.input } };
    }
    const usage: LlmUsage = {};
    if (final?.usage) {
      usage.inputTokens = final.usage.input_tokens;
      usage.outputTokens = final.usage.output_tokens;
      const cached = final.usage.input_tokens_details?.cached_tokens;
      if (typeof cached === 'number') usage.cacheReadTokens = cached;
    }
    const message: ChatMessage = {
      id: newId('msg'),
      role: 'assistant',
      parts: finalParts,
      createdAt: nowIso(),
      native: { provider: PROVIDER, model: req.model, content: output },
    };
    yield { type: 'done', message, stopReason, usage, refusalCategory: stopReason === 'refusal' ? (refusal ? 'modelo' : 'content_filter') : null };
  }

  async listModels(): Promise<string[]> {
    try {
      const client = await this.client();
      const ids: string[] = [];
      for await (const m of client.models.list()) if (/^(gpt|o\d|chatgpt)/.test(m.id)) ids.push(m.id);
      return ids.sort();
    } catch (e) {
      throw mapOpenAIError(e, '');
    }
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const client = await this.client();
      await client.models.list();
      return { ok: true, detail: 'Conectado à OpenAI.' };
    } catch (e) {
      return { ok: false, detail: mapOpenAIError(e, '').message };
    }
  }
}
