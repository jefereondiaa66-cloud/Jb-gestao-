/**
 * Caminho real do SDK da Anthropic contra um servidor SSE local.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Agent } from '@core/agent';
import { AnthropicProvider } from '@core/llm/anthropic';
import { isInvalidToolInput, LlmError } from '@core/llm/common';
import { ToolRegistry } from '@core/tools/registry';
import type { ChatMessage, LlmRequest, LlmStreamEvent } from '@core/types';
import { createEnv, FakeGate } from '../../unit/agent/fakes';
import { anth, anthText, startServer, writeJson, writeSse, type SseEvent, type TestServer } from './http-fixture';

const KEY = 'sk-ant-test-0000000000000000';
let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

const userMsg = (text: string): ChatMessage => ({ id: 'u1', role: 'user', parts: [{ type: 'text', text }], createdAt: '2026-11-02T00:00:00Z' });

async function collect(it: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const out: LlmStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

function provider(url: string, extra: Partial<ConstructorParameters<typeof AnthropicProvider>[0]> = {}) {
  return new AnthropicProvider({ apiKey: KEY, baseURL: url, maxRetries: 0, ...extra });
}

const toolUseStream: SseEvent[] = [
  anth.start(),
  anth.blockStart(0, { type: 'thinking', thinking: '', signature: '' }),
  anth.delta(0, { type: 'thinking_delta', thinking: 'Preciso ' }),
  anth.delta(0, { type: 'thinking_delta', thinking: 'somar.' }),
  anth.delta(0, { type: 'signature_delta', signature: 'SIG-abc' }),
  anth.blockStop(0),
  anth.blockStart(1, { type: 'text', text: '', citations: null }),
  anth.text(1, 'Vou '),
  anth.text(1, 'somar.'),
  anth.blockStop(1),
  anth.blockStart(2, { type: 'tool_use', id: 'toolu_01', name: 'somar', input: {} }),
  anth.json(2, '{"a": 1,'),
  anth.json(2, ' "b": 2}'),
  anth.blockStop(2),
  anth.messageDelta('tool_use'),
  anth.stop(),
];

const baseReq = (url: string): LlmRequest => ({
  model: 'claude-opus-5-5',
  system: 'Você é o 300.',
  messages: [userMsg('some 1 e 2'), { id: 'c', role: 'context', parts: [{ type: 'text', text: 'Data: hoje' }], createdAt: '' }],
  tools: [{ name: 'somar', description: 'soma', inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a'] } }],
  serverTools: { webSearch: true, webFetch: true },
  effort: 'high',
  signal: new AbortController().signal,
});

describe('AnthropicProvider (SSE real)', () => {
  it('pensamento + texto + tool_use com input_json_delta', async () => {
    server = await startServer((_req, res) => writeSse(res, toolUseStream));
    const events = await collect(provider(server.url).stream(baseReq(server.url)));
    expect(events.filter((e) => e.type === 'thinking_delta').map((e) => (e as { text: string }).text).join('')).toBe('Preciso somar.');
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text)).toEqual(['Vou ', 'somar.']);
    expect(events.find((e) => e.type === 'tool_call')).toEqual({ type: 'tool_call', call: { id: 'toolu_01', name: 'somar', input: { a: 1, b: 2 } } });
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.type).toBe('done');
    expect(done.stopReason).toBe('tool_use');
    expect(done.usage).toMatchObject({ inputTokens: 120, outputTokens: 42, cacheReadTokens: 100 });
    expect(done.message.parts).toEqual([
      { type: 'text', text: 'Vou somar.' },
      { type: 'tool_call', id: 'toolu_01', name: 'somar', input: { a: 1, b: 2 } },
    ]);
    expect(done.message.native).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      content: [
        { type: 'thinking', thinking: 'Preciso somar.', signature: 'SIG-abc' },
        { type: 'text', text: 'Vou somar.', citations: null },
        { type: 'tool_use', id: 'toolu_01', name: 'somar', input: { a: 1, b: 2 } },
      ],
    });

    // O que foi enviado à API
    const r = server.requests[0]!;
    expect(r.method).toBe('POST');
    expect(r.url).toMatch(/^\/v1\/messages/);
    expect(JSON.stringify(r.headers)).toContain(KEY);
    expect(String(r.headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
    expect(String(r.headers['anthropic-beta'])).toContain('thinking-binding-controls-2026-08-01');
    const b = r.body;
    expect(b).toMatchObject({
      model: 'claude-opus-5-5',
      stream: true,
      thinking: { type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } },
      output_config: { effort: 'high' },
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: [{ type: 'text', text: 'Você é o 300.', cache_control: { type: 'ephemeral' } }],
    });
    expect(b.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'some 1 e 2' }] },
      { role: 'system', content: 'Data: hoje' },
    ]);
    expect(b.tools[0]).toMatchObject({ name: 'somar', eager_input_streaming: true });
    expect(b.tools.slice(1)).toEqual([
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
    ]);
    for (const k of ['temperature', 'top_p', 'top_k', 'tool_choice', 'betas']) expect(b).not.toHaveProperty(k);
  });

  it('JSON inválido na entrada da ferramenta vira marcador (nunca executa)', async () => {
    server = await startServer((_req, res) =>
      writeSse(res, [
        anth.start(),
        anth.blockStart(0, { type: 'tool_use', id: 'toolu_x', name: 'somar', input: {} }),
        anth.json(0, '{"a": 1, "b": "sem fim'),
        anth.blockStop(0),
        anth.messageDelta('tool_use'),
        anth.stop(),
      ]),
    );
    const events = await collect(provider(server.url).stream(baseReq(server.url)));
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    const call = done.message.parts[0] as { input: unknown };
    expect(isInvalidToolInput(call.input)).toBe(true);
    // o bloco nativo fica com um objeto (a API exige objeto ao reenviar)
    expect((done.message.native!.content as { input: unknown }[])[0]!.input).toEqual({});
  });

  it('pause_turn: continua sozinho e junta o conteúdo', async () => {
    const first: SseEvent[] = [
      anth.start(),
      anth.blockStart(0, { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} }),
      anth.json(0, '{"query": "tempo em SP"}'),
      anth.blockStop(0),
      anth.blockStart(1, {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_1',
        content: [{ type: 'web_search_result', url: 'https://tempo.example/sp', title: 'Tempo SP', encrypted_content: 'ENC', page_age: null }],
      }),
      anth.blockStop(1),
      anth.messageDelta('pause_turn', {}, { server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } }),
      anth.stop(),
    ];
    const second: SseEvent[] = [
      anth.start(),
      anth.blockStart(0, { type: 'text', text: '', citations: null }),
      anth.delta(0, { type: 'citations_delta', citation: { type: 'web_search_result_location', url: 'https://tempo.example/sp', title: 'Tempo SP', encrypted_index: 'X', cited_text: 'chuva' } }),
      anth.text(0, 'Vai chover.'),
      anth.blockStop(0),
      anth.messageDelta('end_turn'),
      anth.stop(),
    ];
    server = await startServer((_req, res, i) => writeSse(res, i === 0 ? first : second));
    const events = await collect(provider(server.url).stream(baseReq(server.url)));
    expect(events.find((e) => e.type === 'server_tool')).toEqual({ type: 'server_tool', name: 'web_search', detail: 'tempo em SP' });
    expect(events.find((e) => e.type === 'citation')).toEqual({ type: 'citation', url: 'https://tempo.example/sp', title: 'Tempo SP' });
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('end_turn');
    expect((done.message.native!.content as { type: string }[]).map((b) => b.type)).toEqual(['server_tool_use', 'web_search_tool_result', 'text']);
    expect(done.usage?.serverToolUses).toEqual({ web_search: 1, web_fetch: 0 });
    expect(server.requests).toHaveLength(2);
    const msgs = server.requests[1]!.body.messages;
    expect(msgs.at(-1).role).toBe('assistant');
    expect(msgs.at(-1).content.map((b: { type: string }) => b.type)).toEqual(['server_tool_use', 'web_search_tool_result']);
    expect(msgs.at(-1).content[0].input).toEqual({ query: 'tempo em SP' });
  });

  it('pause_turn além do limite: não deixa pesquisa sem resultado no fim', async () => {
    const paused: SseEvent[] = [
      anth.start(),
      anth.blockStart(0, { type: 'text', text: '', citations: null }),
      anth.text(0, 'Pesquisando...'),
      anth.blockStop(0),
      anth.blockStart(1, { type: 'server_tool_use', id: 'srvtoolu_9', name: 'web_search', input: {} }),
      anth.json(1, '{"query": "x"}'),
      anth.blockStop(1),
      anth.messageDelta('pause_turn'),
      anth.stop(),
    ];
    server = await startServer((_req, res) => writeSse(res, paused));
    const events = await collect(provider(server.url, { maxPauseContinuations: 1 }).stream(baseReq(server.url)));
    expect(server.requests).toHaveLength(2);
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('pause_turn');
    const types = (done.message.native!.content as { type: string }[]).map((b) => b.type);
    expect(types).toEqual(['text', 'server_tool_use', 'text']);
  });

  it('recusa: stop_reason refusal, categoria e nenhuma chamada de ferramenta', async () => {
    server = await startServer((_req, res) =>
      writeSse(res, [
        anth.start(),
        anth.blockStart(0, { type: 'text', text: '', citations: null }),
        anth.text(0, 'Claro, o exploit'),
        anth.blockStop(0),
        anth.blockStart(1, { type: 'tool_use', id: 'toolu_r', name: 'somar', input: {} }),
        anth.json(1, '{"a":'),
        anth.messageDelta('refusal', { stop_details: { type: 'refusal', category: 'cyber', explanation: null, fallback_credit_token: null, fallback_has_prefill_claim: null, recommended_model: null } }),
        anth.stop(),
      ]),
    );
    const events = await collect(provider(server.url).stream(baseReq(server.url)));
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('refusal');
    expect(done.refusalCategory).toBe('cyber');
    expect(done.message.parts.some((p) => p.type === 'tool_call')).toBe(false);
    expect(events.some((e) => e.type === 'tool_call')).toBe(false);
  });

  it('fallback no meio: tira pensamento/chamadas antes do bloco fallback', async () => {
    server = await startServer((_req, res) =>
      writeSse(res, [
        anth.start(),
        anth.blockStart(0, { type: 'thinking', thinking: '', signature: '' }),
        anth.delta(0, { type: 'signature_delta', signature: 'S1' }),
        anth.blockStop(0),
        anth.blockStart(1, { type: 'text', text: '', citations: null }),
        anth.text(1, 'Parte A. '),
        anth.blockStop(1),
        anth.blockStart(2, { type: 'fallback', from: { model: 'claude-opus-5-5' }, to: { model: 'claude-opus-5' }, trigger: { type: 'refusal', category: 'cyber' } }),
        anth.blockStop(2),
        anth.blockStart(3, { type: 'text', text: '', citations: null }),
        anth.text(3, 'Parte B.'),
        anth.blockStop(3),
        anth.messageDelta('end_turn'),
        anth.stop(),
      ]),
    );
    const events = await collect(provider(server.url).stream(baseReq(server.url)));
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect((done.message.native!.content as { type: string }[]).map((b) => b.type)).toEqual(['text', 'fallback', 'text']);
    expect(done.message.parts).toEqual([{ type: 'text', text: 'Parte A. Parte B.' }]);
  });

  it('fallback desligado: sem beta e sem campo fallbacks', async () => {
    server = await startServer((_req, res) => writeSse(res, anthText('oi')));
    await collect(provider(server.url, { refusalFallback: () => false }).stream(baseReq(server.url)));
    expect(server.requests[0]!.body).not.toHaveProperty('fallbacks');
    expect(String(server.requests[0]!.headers['anthropic-beta'])).not.toContain('server-side-fallback');
  });

  it('erros HTTP tipados viram mensagens amigáveis', async () => {
    const cases: [number, unknown, Record<string, string>, string][] = [
      [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, {}, 'chave_invalida'],
      [429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } }, { 'retry-after': '5' }, 'limite_taxa'],
      [529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, {}, 'sobrecarga'],
      [400, { type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 2000000 tokens > 1000000 maximum' } }, {}, 'contexto_grande'],
      [402, { type: 'error', error: { type: 'billing_error', message: 'credit balance too low' } }, {}, 'cobranca'],
    ];
    for (const [status, body, headers, code] of cases) {
      server = await startServer((_req, res) => writeJson(res, status, body, headers));
      const err = await collect(provider(server.url).stream(baseReq(server.url))).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(LlmError);
      expect((err as LlmError).code).toBe(code);
      if (code === 'limite_taxa') expect((err as LlmError).retryAfterSec).toBe(5);
      await server.close();
      server = undefined;
    }
  });

  it('erro no meio do stream (evento error) e conexão recusada', async () => {
    server = await startServer((_req, res) =>
      writeSse(res, [anth.start(), { event: 'error', data: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } }]),
    );
    const err = await collect(provider(server.url).stream(baseReq(server.url))).catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('sobrecarga');
    const url = server.url;
    await server.close();
    server = undefined;
    const err2 = await collect(provider(url).stream(baseReq(url))).catch((e: unknown) => e);
    expect((err2 as LlmError).code).toBe('rede');
  });

  it('conexão que cai antes de message_stop é erro, não resposta pela metade', async () => {
    server = await startServer((_req, res) => writeSse(res, [anth.start(), anth.blockStart(0, { type: 'text', text: '', citations: null }), anth.text(0, 'meia')]));
    const err = await collect(provider(server.url).stream(baseReq(server.url))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('rede');
  });

  it('cancelamento no meio do stream é imediato', async () => {
    server = await startServer((_req, res) => writeSse(res, [anth.start(), anth.blockStart(0, { type: 'text', text: '', citations: null }), anth.text(0, 'Era uma vez')], { keepOpen: true }));
    const ac = new AbortController();
    const req = { ...baseReq(server.url), signal: ac.signal };
    const seen: LlmStreamEvent[] = [];
    const t0 = Date.now();
    const err = await (async () => {
      for await (const e of provider(server!.url).stream(req)) {
        seen.push(e);
        if (e.type === 'text_delta') ac.abort();
      }
    })().catch((e: unknown) => e);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect((err as LlmError).code).toBe('cancelado');
    expect(seen.some((e) => e.type === 'done')).toBe(false);
  });

  it('healthCheck e listModels usam /v1/models', async () => {
    server = await startServer((req, res) => {
      if (req.url?.startsWith('/v1/models')) return writeJson(res, 200, { data: [{ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' });
      return writeJson(res, 404, {});
    });
    const p = provider(server.url);
    expect(await p.healthCheck()).toEqual({ ok: true, detail: 'Conectado à Anthropic.' });
    expect(await p.listModels()).toEqual(['claude-opus-5-5']);
  });
});

describe('Agente + AnthropicProvider (ponta a ponta com SSE)', () => {
  it('laço com ferramenta: reenvia o pensamento assinado sem mudança e o resultado na fala do dono', async () => {
    server = await startServer((_req, res, i) => writeSse(res, i === 0 ? toolUseStream : anthText('Dá 3.')));
    const env = createEnv();
    const registry = new ToolRegistry();
    registry.register({
      name: 'somar',
      title: 'Somar',
      description: 'Soma dois números',
      inputSchema: z.object({ a: z.number(), b: z.number() }),
      risk: 'read',
      execute: async (i: { a: number; b: number }) => ({ content: [{ type: 'text', text: String(i.a + i.b) }] }),
    });
    const p = provider(server.url);
    const agent = new Agent({ services: env.services, registry, gate: new FakeGate(), events: env.events, getProvider: () => p, options: { now: () => new Date('2026-11-02T17:35:00Z'), timezone: 'America/Sao_Paulo' } });
    const res = await agent.run({ text: 'some 1 e 2' });
    expect(res.stopReason).toBe('end_turn');
    expect(res.text).toBe('Vou somar.\n\nDá 3.');
    expect(server.requests).toHaveLength(2);
    const second = server.requests[1]!.body;
    expect(second.messages.map((m: { role: string }) => m.role)).toEqual(['user', 'system', 'assistant', 'user']);
    expect(second.messages[1].content).toContain('2 de novembro de 2026');
    expect(second.messages[2].content).toEqual([
      { type: 'thinking', thinking: 'Preciso somar.', signature: 'SIG-abc' },
      { type: 'text', text: 'Vou somar.', citations: null },
      { type: 'tool_use', id: 'toolu_01', name: 'somar', input: { a: 1, b: 2 } },
    ]);
    expect(second.messages[3].content).toEqual([{ type: 'tool_result', tool_use_id: 'toolu_01', content: [{ type: 'text', text: '3' }] }]);
    // prefixo idêntico entre pedidos (cache e assinaturas de pensamento)
    const first = server.requests[0]!.body;
    expect(JSON.stringify(second.system)).toBe(JSON.stringify(first.system));
    expect(JSON.stringify(second.tools)).toBe(JSON.stringify(first.tools));
    expect(JSON.stringify(second.messages.slice(0, 2))).toBe(JSON.stringify(first.messages));
  });
});
