/**
 * Provedor Ollama (modelos locais, sem internet) pela API nativa /api/chat
 * com streaming NDJSON (uma linha JSON por pedaço).
 *
 * - Ferramentas no formato de funções; imagens como base64 em "images".
 * - Mensagens "context" viram role "system".
 * - Capacidades (visão/ferramentas) vêm de /api/show quando disponível.
 * - Modelos que escrevem o raciocínio entre <think>…</think> têm esse trecho
 *   separado do texto da resposta.
 */
import type { ChatMessage, ContentPart, LlmProvider, LlmRequest, LlmStreamEvent, LlmUsage, ModelCapabilities, StopReason } from '../types';
import { newId, nowIso } from '../util/ids';
import { cancelledError, type Dynamic, LlmError, objectSchema, parseToolArguments, repairToolPairing, replayableInput, resolveDynamic, shortDetail, textOfParts } from './common';

const PROVIDER = 'ollama';

export interface OllamaToolCall {
  id?: string;
  function: { name: string; arguments: Record<string, unknown> | string; index?: number };
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  thinking?: string;
  tool_calls?: OllamaToolCall[];
  tool_name?: string;
}

interface OllamaChunk {
  model?: string;
  message?: { role?: string; content?: string; thinking?: string; tool_calls?: OllamaToolCall[] };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

/* ======================================================================
 * Conversão neutra -> Ollama (pura, testável)
 * ==================================================================== */
function partsText(parts: ContentPart[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p.type === 'text' && p.text.trim() !== '') out.push(p.text);
    else if (p.type === 'document') out.push(`[PDF "${p.name ?? 'documento'}" anexado: este modelo local não lê PDFs diretamente.]`);
  }
  return out.join('\n\n');
}

function partsImages(parts: ContentPart[]): string[] {
  return parts.filter((p): p is Extract<ContentPart, { type: 'image' }> => p.type === 'image').map((p) => p.data);
}

export function toOllamaMessages(messages: ChatMessage[], opts: { model: string; system?: string }): OllamaMessage[] {
  const out: OllamaMessage[] = [];
  if (opts.system && opts.system.trim() !== '') out.push({ role: 'system', content: opts.system });
  for (const m of repairToolPairing(messages)) {
    if (m.role === 'user') {
      const images = partsImages(m.parts);
      out.push({ role: 'user', content: partsText(m.parts) || (images.length ? '' : '(mensagem vazia)'), ...(images.length ? { images } : {}) });
    } else if (m.role === 'context') {
      const text = textOfParts(m.parts).trim();
      if (text) out.push({ role: 'system', content: text });
    } else if (m.role === 'assistant') {
      const n = m.native;
      if (n && n.provider === PROVIDER && n.model === opts.model && n.content && typeof n.content === 'object' && !Array.isArray(n.content)) {
        out.push(JSON.parse(JSON.stringify(n.content)) as OllamaMessage);
        continue;
      }
      const calls = m.parts.filter((p): p is Extract<ContentPart, { type: 'tool_call' }> => p.type === 'tool_call');
      out.push({
        role: 'assistant',
        content: textOfParts(m.parts),
        ...(calls.length ? { tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: replayableInput(c.input) } })) } : {}),
      });
    } else if (m.role === 'tool') {
      for (const p of m.parts) {
        if (p.type !== 'tool_result') continue;
        const text = p.content
          .filter((c): c is Extract<typeof c, { type: 'text' }> => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
        const images = p.content.filter((c) => c.type === 'image').map((c) => (c as { data: string }).data);
        out.push({
          role: 'tool',
          content: (p.isError ? '[erro] ' : '') + (text || '(sem saída)'),
          ...(p.name ? { tool_name: p.name } : {}),
          ...(images.length ? { images } : {}),
        });
      }
    }
  }
  return out;
}

/* ======================================================================
 * Filtro de <think>…</think> em streaming
 * ==================================================================== */
export class ThinkTagFilter {
  private buf = '';
  private inThink = false;

  push(chunk: string): { text: string; thinking: string } {
    this.buf += chunk;
    let text = '';
    let thinking = '';
    for (;;) {
      const tag = this.inThink ? '</think>' : '<think>';
      const at = this.buf.indexOf(tag);
      if (at >= 0) {
        if (this.inThink) thinking += this.buf.slice(0, at);
        else text += this.buf.slice(0, at);
        this.buf = this.buf.slice(at + tag.length);
        this.inThink = !this.inThink;
        continue;
      }
      // Guarda um possível começo de marcador partido entre pedaços.
      let keep = 0;
      for (let k = Math.min(tag.length - 1, this.buf.length); k > 0; k--) {
        if (tag.startsWith(this.buf.slice(-k))) {
          keep = k;
          break;
        }
      }
      const emit = this.buf.slice(0, this.buf.length - keep);
      if (this.inThink) thinking += emit;
      else text += emit;
      this.buf = this.buf.slice(this.buf.length - keep);
      break;
    }
    return { text, thinking };
  }

  flush(): { text: string; thinking: string } {
    const rest = this.buf;
    this.buf = '';
    return this.inThink ? { text: '', thinking: rest } : { text: rest, thinking: '' };
  }
}

/* ======================================================================
 * Provedor
 * ==================================================================== */
export interface OllamaProviderOptions {
  /** URL base (settings.brain.ollamaUrl), lida a cada pedido. */
  baseUrl: Dynamic<string>;
  fetch?: typeof fetch;
  /** Enviar "think" (raciocínio) ao Ollama. Indefinido = padrão do modelo. */
  think?: boolean;
  /** Tamanho do contexto pedido ao Ollama (o padrão do Ollama é pequeno). */
  numCtx?: number;
  keepAlive?: string;
  defaultMaxTokens?: number;
}

const VISION_HINT = /llava|vision|[-_:]vl\b|vl[:-]|gemma3|qwen2\.5vl|qwen3-vl|minicpm-v|moondream|bakllava|llama4|mistral-small3\.[12]|granite3\.2-vision/i;

export class OllamaProvider implements LlmProvider {
  readonly id = PROVIDER;
  readonly label = 'Ollama (local)';
  private caps = new Map<string, ModelCapabilities>();
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: OllamaProviderOptions) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private base(): string {
    const raw = resolveDynamic(this.opts.baseUrl).trim() || 'http://127.0.0.1:11434';
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      throw new LlmError('requisicao_invalida', `O endereço do Ollama "${raw}" não é válido. Corrija em Configurações › Cérebro.`, { provider: PROVIDER });
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new LlmError('requisicao_invalida', 'O endereço do Ollama precisa começar com http:// ou https://.', { provider: PROVIDER });
    }
    return u.toString().replace(/\/+$/, '');
  }

  capabilities(model: string): ModelCapabilities {
    const c = this.caps.get(model);
    if (c) return c;
    const vision = VISION_HINT.test(model);
    return { vision, pdf: false, tools: true, serverWebSearch: false, serverWebFetch: false };
  }

  /** Consulta /api/show e guarda as capacidades reais do modelo. */
  async refreshCapabilities(model: string, signal?: AbortSignal): Promise<ModelCapabilities> {
    const res = await this.fetchImpl(`${this.base()}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: signal ?? AbortSignal.timeout(5000),
    });
    if (!res.ok) throw await this.httpError(res, model);
    const data = (await res.json()) as { capabilities?: unknown };
    const list = Array.isArray(data.capabilities) ? data.capabilities.filter((x): x is string => typeof x === 'string') : null;
    const caps: ModelCapabilities = list
      ? { vision: list.includes('vision'), pdf: false, tools: list.includes('tools'), serverWebSearch: false, serverWebFetch: false }
      : this.capabilities(model);
    this.caps.set(model, caps);
    return caps;
  }

  private networkError(e: unknown): LlmError {
    let where = 'o endereço configurado';
    try {
      where = this.base();
    } catch {
      /* endereço inválido já reportado em outro lugar */
    }
    return new LlmError('rede', `Não consegui falar com o Ollama em ${where}. Ele está aberto? (Instale em ollama.com e deixe-o rodando.)`, {
      provider: PROVIDER,
      cause: e,
    });
  }

  private async httpError(res: Response, model: string): Promise<LlmError> {
    let detail = '';
    try {
      const body = await res.text();
      try {
        const j = JSON.parse(body) as { error?: unknown };
        detail = typeof j.error === 'string' ? j.error : body;
      } catch {
        detail = body;
      }
    } catch {
      /* corpo ilegível */
    }
    return this.errorFromText(res.status, detail, model);
  }

  private errorFromText(status: number | undefined, detail: string, model: string): LlmError {
    const d = shortDetail(detail);
    const base = { provider: PROVIDER, ...(status !== undefined ? { status } : {}) };
    // O Ollama só devolve texto: a mensagem é a única pista.
    if (status === 404 || /model\s+['"]?[^'"\s]*['"]?\s+not found|try pulling/i.test(d)) {
      return new LlmError('modelo_nao_encontrado', `O modelo "${model}" não está instalado no Ollama. Instale com: ollama pull ${model}`, base);
    }
    if (/does not support tools/i.test(d)) return new LlmError('requisicao_invalida', `O modelo local "${model}" não aceita ferramentas. Escolha outro modelo em Configurações › Cérebro.`, base);
    if (/does not support thinking/i.test(d)) return new LlmError('requisicao_invalida', `O modelo local "${model}" não aceita o modo de raciocínio.`, base);
    if (/context|too long|exceeds/i.test(d)) return new LlmError('contexto_grande', 'A conversa ficou grande demais para o modelo local. Comece uma conversa nova.', base);
    if (status !== undefined && status >= 500) return new LlmError('servidor', `O Ollama teve um erro: ${d || 'erro interno'}.`, base);
    return new LlmError('requisicao_invalida', `O Ollama recusou o pedido: ${d || 'pedido inválido'}.`, base);
  }

  async *stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
    const signal = req.signal;
    if (signal?.aborted) throw cancelledError(PROVIDER);
    const base = this.base();
    if (!this.caps.has(req.model)) {
      try {
        // stop() também interrompe esta consulta (não espera os 4 s).
        const t = AbortSignal.timeout(4000);
        await this.refreshCapabilities(req.model, signal ? AbortSignal.any([signal, t]) : t);
      } catch {
        /* sem /api/show: segue com a estimativa pelo nome */
      }
      if (signal?.aborted) throw cancelledError(PROVIDER);
    }
    const caps = this.capabilities(req.model);
    const tools = caps.tools && req.tools?.length
      ? req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: objectSchema(t.inputSchema) } }))
      : undefined;
    const body: Record<string, unknown> = {
      model: req.model,
      messages: toOllamaMessages(req.messages, { model: req.model, system: req.system }),
      stream: true,
      options: { num_ctx: this.opts.numCtx ?? 16384, num_predict: req.maxTokens ?? this.opts.defaultMaxTokens ?? 8192 },
    };
    if (tools) body.tools = tools;
    if (this.opts.think !== undefined) body.think = this.opts.think;
    if (this.opts.keepAlive) body.keep_alive = this.opts.keepAlive;

    let res: Response;
    try {
      res = await this.fetchImpl(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      });
    } catch (e) {
      if (signal?.aborted) throw cancelledError(PROVIDER);
      throw this.networkError(e);
    }
    if (!res.ok) throw await this.httpError(res, req.model);
    if (!res.body) throw new LlmError('servidor', 'O Ollama respondeu sem conteúdo.', { provider: PROVIDER });

    const filter = new ThinkTagFilter();
    let content = '';
    let thinking = '';
    const calls: OllamaToolCall[] = [];
    let doneReason: string | undefined;
    let sawDone = false;
    const usage: LlmUsage = {};
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let finished = false;

    const handle = function* (this: OllamaProvider, line: string): Generator<LlmStreamEvent> {
      const t = line.trim();
      if (!t) return;
      let chunk: OllamaChunk;
      try {
        chunk = JSON.parse(t) as OllamaChunk;
      } catch {
        return;
      }
      if (chunk.error) throw this.errorFromText(undefined, chunk.error, req.model);
      const msg = chunk.message;
      if (msg?.thinking) {
        thinking += msg.thinking;
        yield { type: 'thinking_delta', text: msg.thinking };
      }
      if (msg?.content) {
        const f = filter.push(msg.content);
        if (f.thinking) {
          thinking += f.thinking;
          yield { type: 'thinking_delta', text: f.thinking };
        }
        if (f.text) {
          content += f.text;
          yield { type: 'text_delta', text: f.text };
        }
      }
      if (msg?.tool_calls?.length) calls.push(...msg.tool_calls);
      if (chunk.done) {
        sawDone = true;
        doneReason = chunk.done_reason;
        if (typeof chunk.prompt_eval_count === 'number') usage.inputTokens = chunk.prompt_eval_count;
        if (typeof chunk.eval_count === 'number') usage.outputTokens = chunk.eval_count;
      }
    }.bind(this);

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, nl);
          pending = pending.slice(nl + 1);
          yield* handle(line);
        }
      }
      pending += decoder.decode();
      if (pending.trim()) yield* handle(pending);
      if (signal?.aborted) throw cancelledError(PROVIDER);
      if (doneReason === undefined && !sawDone) throw new LlmError('rede', 'A conexão com o Ollama caiu no meio da resposta. Tente de novo.', { provider: PROVIDER });
      const rest = filter.flush();
      if (rest.thinking) {
        thinking += rest.thinking;
        yield { type: 'thinking_delta', text: rest.thinking };
      }
      if (rest.text) {
        content += rest.text;
        yield { type: 'text_delta', text: rest.text };
      }
      finished = true;
    } catch (e) {
      if (signal?.aborted) throw cancelledError(PROVIDER);
      if (e instanceof LlmError) throw e;
      throw this.networkError(e);
    } finally {
      if (!finished) {
        try {
          await reader.cancel();
        } catch {
          /* já fechado */
        }
      }
    }

    const normalizedCalls: OllamaToolCall[] = calls.map((c) => ({ ...c, id: c.id ?? newId('call') }));
    const parts: ContentPart[] = [];
    if (content !== '') parts.push({ type: 'text', text: content });
    for (const c of normalizedCalls) {
      const args = c.function.arguments;
      const input = typeof args === 'string' ? parseToolArguments(args) : (args ?? {});
      parts.push({ type: 'tool_call', id: c.id!, name: c.function.name, input });
    }
    for (const p of parts) if (p.type === 'tool_call') yield { type: 'tool_call', call: { id: p.id, name: p.name, input: p.input } };
    let stopReason: StopReason = 'end_turn';
    if (normalizedCalls.length) stopReason = 'tool_use';
    else if (doneReason === 'length') stopReason = 'max_tokens';
    const native: OllamaMessage = {
      role: 'assistant',
      content,
      ...(thinking ? { thinking } : {}),
      ...(normalizedCalls.length ? { tool_calls: normalizedCalls } : {}),
    };
    const message: ChatMessage = { id: newId('msg'), role: 'assistant', parts, createdAt: nowIso(), native: { provider: PROVIDER, model: req.model, content: native } };
    yield { type: 'done', message, stopReason, usage };
  }

  async listModels(): Promise<string[]> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base()}/api/tags`, { signal: AbortSignal.timeout(8000) });
    } catch (e) {
      if (e instanceof LlmError) throw e;
      throw this.networkError(e);
    }
    if (!res.ok) throw await this.httpError(res, '');
    const data = (await res.json()) as { models?: { name?: unknown; model?: unknown }[] };
    return (data.models ?? [])
      .map((m) => (typeof m.name === 'string' ? m.name : typeof m.model === 'string' ? m.model : ''))
      .filter((n) => n !== '')
      .sort();
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await this.fetchImpl(`${this.base()}/api/version`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return { ok: false, detail: (await this.httpError(res, '')).message };
      const data = (await res.json()) as { version?: unknown };
      return { ok: true, detail: `Ollama ${typeof data.version === 'string' ? data.version : ''} conectado.`.replace('  ', ' ') };
    } catch (e) {
      return { ok: false, detail: e instanceof LlmError ? e.message : this.networkError(e).message };
    }
  }
}
