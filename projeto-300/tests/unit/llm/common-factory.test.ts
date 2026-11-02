import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '@core/llm/anthropic';
import { isInvalidToolInput, LlmError, parseRetryAfter, parseToolArguments, raceAbort, repairToolPairing } from '@core/llm/common';
import { createLlmProvider, createUtilityComplete, modelForProvider, utilityModelFor } from '@core/llm/factory';
import { OllamaProvider } from '@core/llm/ollama';
import { OpenAIProvider } from '@core/llm/openai';
import { defaultSettings, mergeSettings, type Settings } from '@core/settings';
import type { ChatMessage, LlmProvider, LlmRequest, LlmStreamEvent, SecretStore, SettingsAccess } from '@core/types';

function access(s: Settings): SettingsAccess {
  return { get: () => s, update: async () => s };
}
const noSecrets: SecretStore = { get: async () => undefined, set: async () => {}, delete: async () => {}, has: async () => false, list: async () => [] };

describe('utilidades comuns', () => {
  it('parseToolArguments é estrito', () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolArguments('')).toEqual({});
    const bad = parseToolArguments('{"a":"sem fim');
    expect(isInvalidToolInput(bad)).toBe(true);
  });

  it('parseRetryAfter lê segundos e milissegundos', () => {
    expect(parseRetryAfter(new Headers({ 'retry-after': '12' }))).toBe(12);
    expect(parseRetryAfter(new Headers({ 'retry-after-ms': '1500' }))).toBe(2);
    expect(parseRetryAfter(new Headers())).toBeUndefined();
  });

  it('repairToolPairing completa e descarta de forma determinística', () => {
    const at = '';
    const h: ChatMessage[] = [
      { id: '1', role: 'user', parts: [{ type: 'text', text: 'a' }], createdAt: at },
      { id: '2', role: 'assistant', parts: [{ type: 'tool_call', id: 'c1', name: 'f', input: {} }, { type: 'tool_call', id: 'c2', name: 'g', input: {} }], createdAt: at },
      { id: '3', role: 'tool', parts: [{ type: 'tool_result', toolCallId: 'c2', content: [] }, { type: 'tool_result', toolCallId: 'x', content: [] }], createdAt: at },
      { id: '4', role: 'user', parts: [{ type: 'text', text: 'b' }], createdAt: at },
    ];
    const r = repairToolPairing(h);
    expect(r.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'user']);
    expect(r[2]!.parts.map((p) => (p as { toolCallId: string }).toolCallId)).toEqual(['c2']);
    expect(r[3]!.parts).toMatchObject([{ toolCallId: 'c1', name: 'f', isError: true }]);
    expect(JSON.stringify(repairToolPairing(h))).toBe(JSON.stringify(r));
  });

  it('raceAbort rejeita na hora mesmo se a promessa nunca termina', async () => {
    const ac = new AbortController();
    const p = raceAbort(new Promise(() => {}), ac.signal, () => new Error('parou'));
    ac.abort();
    await expect(p).rejects.toThrow('parou');
  });
});

describe('fábrica', () => {
  const s = defaultSettings();

  it('cria cada provedor', () => {
    const deps = { secrets: noSecrets, settings: access(s) };
    expect(createLlmProvider('anthropic', deps)).toBeInstanceOf(AnthropicProvider);
    expect(createLlmProvider('openai', deps)).toBeInstanceOf(OpenAIProvider);
    expect(createLlmProvider('ollama', deps)).toBeInstanceOf(OllamaProvider);
  });

  it('sem chave: erro claro dizendo onde configurar', async () => {
    const p = createLlmProvider('anthropic', { secrets: noSecrets, settings: access(s) });
    const it = p.stream({ model: 'claude-opus-5-5', system: 's', messages: [] })[Symbol.asyncIterator]();
    const err = await it.next().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('sem_chave');
    expect((err as LlmError).message).toContain('Configurações › Cérebro');
    const o = createLlmProvider('openai', { secrets: noSecrets, settings: access(s) });
    const err2 = await o.stream({ model: 'gpt-5.1', system: 's', messages: [] })[Symbol.asyncIterator]().next().catch((e: unknown) => e);
    expect((err2 as LlmError).message).toContain('OpenAI');
  });

  it('modelo por provedor e modelo utilitário', () => {
    expect(modelForProvider(s, 'anthropic')).toBe('claude-opus-5-5');
    expect(modelForProvider(s, 'openai')).toBe('gpt-5.1');
    expect(modelForProvider(s, 'ollama')).toBe('qwen3:8b');
    expect(utilityModelFor(s)).toEqual({ kind: 'anthropic', model: 'claude-haiku-5-5' });
    expect(utilityModelFor(mergeSettings(s, { brain: { utilityProvider: 'openai' } }))).toEqual({ kind: 'openai', model: 'gpt-5.1' });
    expect(utilityModelFor(mergeSettings(s, { brain: { utilityProvider: 'ollama' } }))).toEqual({ kind: 'ollama', model: 'qwen3:8b' });
    expect(utilityModelFor(mergeSettings(s, { brain: { utilityProvider: 'ollama', utilityModel: 'llama3.2:3b' } }))).toEqual({ kind: 'ollama', model: 'llama3.2:3b' });
  });

  it('utilityComplete: esforço baixo, sem ferramentas, com imagens', async () => {
    const seen: LlmRequest[] = [];
    const fake: LlmProvider = {
      id: 'anthropic',
      label: 'fake',
      capabilities: () => ({ vision: true, pdf: true, tools: true, serverWebSearch: true, serverWebFetch: true }),
      async *stream(req: LlmRequest): AsyncIterable<LlmStreamEvent> {
        seen.push(req);
        yield { type: 'text_delta', text: 'Res' };
        yield { type: 'done', message: { id: 'm', role: 'assistant', parts: [{ type: 'text', text: ' Resumo pronto ' }], createdAt: '' }, stopReason: 'end_turn' };
      },
    };
    const uc = createUtilityComplete({ secrets: noSecrets, settings: access(s), provider: fake });
    const out = await uc('resuma', { images: [{ mediaType: 'image/png', data: 'AAA' }], maxTokens: 100 });
    expect(out).toBe('Resumo pronto');
    const r = seen[0]!;
    expect(r.model).toBe('claude-haiku-5-5');
    expect(r.effort).toBe('low');
    expect(r.tools).toBeUndefined();
    expect(r.serverTools).toBeUndefined();
    expect(r.maxTokens).toBe(100);
    expect(r.messages[0]!.parts).toEqual([{ type: 'text', text: 'resuma' }, { type: 'image', mediaType: 'image/png', data: 'AAA' }]);
  });

  it('utilityComplete: recusa vira erro', async () => {
    const fake: LlmProvider = {
      id: 'anthropic',
      label: 'fake',
      capabilities: () => ({ vision: false, pdf: false, tools: false, serverWebSearch: false, serverWebFetch: false }),
      async *stream(): AsyncIterable<LlmStreamEvent> {
        yield { type: 'done', message: { id: 'm', role: 'assistant', parts: [], createdAt: '' }, stopReason: 'refusal' };
      },
    };
    const uc = createUtilityComplete({ secrets: noSecrets, settings: access(s), provider: fake });
    await expect(uc('x')).rejects.toThrow('recusou');
    await expect(uc('x', { images: [{ mediaType: 'image/png', data: 'A' }] })).rejects.toThrow('não enxerga imagens');
  });
});

describe('esquemas de ferramenta vindos de fora', () => {
  it('esquema sem "type" (comum em servidores MCP) vira objeto em todos os provedores', async () => {
    const { objectSchema } = await import('@core/llm/common');
    const { buildAnthropicRequest } = await import('@core/llm/anthropic');
    const { buildOpenAIRequest } = await import('@core/llm/openai');
    expect(objectSchema({})).toEqual({ type: 'object', properties: {} });
    expect(objectSchema({ properties: { a: { type: 'string' } } })).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
    expect(objectSchema({ type: 'string' })).toEqual({ type: 'object', properties: { value: { type: 'string' } }, required: ['value'] });
    const obj = { type: 'object', properties: { a: { type: 'number' } } };
    expect(objectSchema(obj)).toBe(obj);
    const tools = [{ name: 'mcp_x', description: 'd', inputSchema: {} }];
    const a = buildAnthropicRequest({ model: 'claude-opus-5-5', system: '', messages: [], tools }, { refusalFallback: false, thinkingDisplay: 'omitted', eagerInputStreaming: true, defaultMaxTokens: 1000 });
    expect((a.tools![0] as { input_schema: unknown }).input_schema).toEqual({ type: 'object', properties: {} });
    const o = buildOpenAIRequest({ model: 'gpt-5.1', system: '', messages: [], tools }, { defaultMaxTokens: 1000 });
    expect((o.tools![0] as { parameters: unknown }).parameters).toEqual({ type: 'object', properties: {} });
  });
});
