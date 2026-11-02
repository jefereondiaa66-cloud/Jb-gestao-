/**
 * Caminho real do SDK da OpenAI (SSE) e do Ollama (NDJSON) contra servidores locais.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { isInvalidToolInput, LlmError } from '@core/llm/common';
import { OllamaProvider } from '@core/llm/ollama';
import { OpenAIProvider } from '@core/llm/openai';
import type { ChatMessage, LlmRequest, LlmStreamEvent } from '@core/types';
import { startServer, writeJson, writeNdjson, writeSse, type SseEvent, type TestServer } from './http-fixture';

let server: TestServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

async function collect(it: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const out: LlmStreamEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const history: ChatMessage[] = [
  { id: 'u', role: 'user', parts: [{ type: 'image', mediaType: 'image/png', data: 'PNG' }, { type: 'text', text: 'some 1 e 2' }], createdAt: '' },
  { id: 'c', role: 'context', parts: [{ type: 'text', text: 'Data: hoje' }], createdAt: '' },
];

const req = (model: string, extra: Partial<LlmRequest> = {}): LlmRequest => ({
  model,
  system: 'Você é o 300.',
  messages: history,
  tools: [{ name: 'somar', description: 'soma', inputSchema: { type: 'object', properties: { a: { type: 'number' } } } }],
  effort: 'low',
  ...extra,
});

const ev = (type: string, data: Record<string, unknown>, seq: number): SseEvent => ({ event: type, data: { type, sequence_number: seq, ...data } });

const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'ENC' };
const message = { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Olá, dono.', annotations: [] }] };
const call = { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'somar', arguments: '{"a":1}', status: 'completed' };
const baseResponse = { id: 'resp_1', object: 'response', created_at: 1, model: 'gpt-5.1', status: 'completed', output: [], error: null, incomplete_details: null, tools: [], parallel_tool_calls: true };

function openaiStream(output: unknown[], final: 'response.completed' | 'response.incomplete' = 'response.completed', incomplete: unknown = null): SseEvent[] {
  return [
    ev('response.created', { response: { ...baseResponse, status: 'in_progress' } }, 0),
    ev('response.output_item.done', { output_index: 0, item: reasoning }, 1),
    ev('response.output_text.delta', { item_id: 'msg_1', output_index: 1, content_index: 0, delta: 'Olá, ', logprobs: [] }, 2),
    ev('response.output_text.delta', { item_id: 'msg_1', output_index: 1, content_index: 0, delta: 'dono.', logprobs: [] }, 3),
    ev('response.output_text.annotation.added', { item_id: 'msg_1', output_index: 1, content_index: 0, annotation_index: 0, annotation: { type: 'url_citation', url: 'https://ex.com', title: 'Ex', start_index: 0, end_index: 2 } }, 4),
    ev('response.output_item.done', { output_index: 1, item: message }, 5),
    ev('response.function_call_arguments.delta', { item_id: 'fc_1', output_index: 2, delta: '{"a":1}' }, 6),
    ev('response.output_item.done', { output_index: 2, item: call }, 7),
    ev(final, { response: { ...baseResponse, status: final === 'response.completed' ? 'completed' : 'incomplete', incomplete_details: incomplete, output, usage: { input_tokens: 10, input_tokens_details: { cached_tokens: 4 }, output_tokens: 20, output_tokens_details: { reasoning_tokens: 5 }, total_tokens: 30 } } }, 8),
  ];
}

describe('OpenAIProvider (SSE real, API Responses)', () => {
  it('texto, citação, chamada de função e itens nativos', async () => {
    server = await startServer((_r, res) => writeSse(res, openaiStream([reasoning, message, call])));
    const p = new OpenAIProvider({ apiKey: 'sk-test-openai', baseURL: `${server.url}/v1`, maxRetries: 0 });
    const events = await collect(p.stream(req('gpt-5.1')));
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text)).toEqual(['Olá, ', 'dono.']);
    expect(events.find((e) => e.type === 'citation')).toEqual({ type: 'citation', url: 'https://ex.com', title: 'Ex' });
    expect(events.find((e) => e.type === 'tool_call')).toEqual({ type: 'tool_call', call: { id: 'call_1', name: 'somar', input: { a: 1 } } });
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('tool_use');
    expect(done.usage).toEqual({ inputTokens: 10, outputTokens: 20, cacheReadTokens: 4 });
    expect(done.message.parts).toEqual([
      { type: 'text', text: 'Olá, dono.' },
      { type: 'tool_call', id: 'call_1', name: 'somar', input: { a: 1 } },
    ]);
    expect(done.message.native).toEqual({ provider: 'openai', model: 'gpt-5.1', content: [reasoning, message, call] });

    const r = server.requests[0]!;
    expect(r.url).toBe('/v1/responses');
    expect(r.headers.authorization).toBe('Bearer sk-test-openai');
    expect(r.body).toMatchObject({ model: 'gpt-5.1', instructions: 'Você é o 300.', stream: true, store: false, reasoning: { effort: 'low' }, include: ['reasoning.encrypted_content'] });
    expect(r.body.input).toEqual([
      { type: 'message', role: 'user', content: [{ type: 'input_image', image_url: 'data:image/png;base64,PNG', detail: 'auto' }, { type: 'input_text', text: 'some 1 e 2' }] },
      { type: 'message', role: 'developer', content: 'Data: hoje' },
    ]);
    expect(r.body.tools).toEqual([{ type: 'function', name: 'somar', description: 'soma', parameters: { type: 'object', properties: { a: { type: 'number' } } }, strict: false }]);
    expect(r.body).not.toHaveProperty('temperature');
  });

  it('reenvia os itens nativos no próximo pedido', async () => {
    server = await startServer((_r, res) => writeSse(res, openaiStream([message])));
    const p = new OpenAIProvider({ apiKey: 'sk-test-openai', baseURL: `${server.url}/v1`, maxRetries: 0 });
    const prev: ChatMessage = { id: 'a', role: 'assistant', parts: [{ type: 'tool_call', id: 'call_1', name: 'somar', input: { a: 1 } }], createdAt: '', native: { provider: 'openai', model: 'gpt-5.1', content: [reasoning, call] } };
    const tool: ChatMessage = { id: 't', role: 'tool', parts: [{ type: 'tool_result', toolCallId: 'call_1', name: 'somar', content: [{ type: 'text', text: '1' }] }], createdAt: '' };
    await collect(p.stream(req('gpt-5.1', { messages: [...history, prev, tool] })));
    expect(server.requests[0]!.body.input.slice(2)).toEqual([reasoning, call, { type: 'function_call_output', call_id: 'call_1', output: '1' }]);
  });

  it('argumentos inválidos viram marcador; resposta incompleta vira max_tokens', async () => {
    const bad = { ...call, arguments: '{"a":' };
    server = await startServer((_r, res) => writeSse(res, openaiStream([bad], 'response.incomplete', { reason: 'max_output_tokens' })));
    const p = new OpenAIProvider({ apiKey: 'sk-test-openai', baseURL: `${server.url}/v1`, maxRetries: 0 });
    const done = (await collect(p.stream(req('gpt-5.1')))).at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('max_tokens');
    expect(isInvalidToolInput((done.message.parts[0] as { input: unknown }).input)).toBe(true);
  });

  it('erros: chave inválida (HTTP) e evento error no meio do stream', async () => {
    server = await startServer((_r, res) => writeJson(res, 401, { error: { message: 'Incorrect API key', type: 'invalid_request_error', code: 'invalid_api_key', param: null } }));
    const p = new OpenAIProvider({ apiKey: 'sk-test-openai', baseURL: `${server.url}/v1`, maxRetries: 0 });
    const e1 = await collect(p.stream(req('gpt-5.1'))).catch((e: unknown) => e);
    expect((e1 as LlmError).code).toBe('chave_invalida');
    await server.close();
    server = await startServer((_r, res) => writeSse(res, [ev('error', { code: 'rate_limit_exceeded', message: 'slow', param: null }, 0)]));
    const p2 = new OpenAIProvider({ apiKey: 'sk-test-openai', baseURL: `${server.url}/v1`, maxRetries: 0 });
    const e2 = await collect(p2.stream(req('gpt-5.1'))).catch((e: unknown) => e);
    expect(e2).toBeInstanceOf(LlmError);
    expect((e2 as LlmError).code).toBe('limite_taxa');
  });

  it('cancelamento no meio do stream', async () => {
    server = await startServer((_r, res) => writeSse(res, openaiStream([message]).slice(0, 3), { keepOpen: true }));
    const p = new OpenAIProvider({ apiKey: 'sk-test-openai', baseURL: `${server.url}/v1`, maxRetries: 0 });
    const ac = new AbortController();
    const err = await (async () => {
      for await (const e of p.stream(req('gpt-5.1', { signal: ac.signal }))) if (e.type === 'text_delta') ac.abort();
    })().catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('cancelado');
  });
});

describe('OllamaProvider (NDJSON real)', () => {
  it('capacidades via /api/show, texto em pedaços, <think> e chamadas de ferramenta', async () => {
    server = await startServer((r, res) => {
      if (r.url === '/api/show') return writeJson(res, 200, { capabilities: ['completion', 'tools', 'vision'] });
      if (r.url === '/api/chat')
        return writeNdjson(
          res,
          [
            { model: 'qwen3:8b', message: { role: 'assistant', content: '<think>vou ' }, done: false },
            { model: 'qwen3:8b', message: { role: 'assistant', content: 'somar</think>Vou somar.' }, done: false },
            { model: 'qwen3:8b', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'somar', arguments: { a: 1 } } }] }, done: false },
            { model: 'qwen3:8b', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', prompt_eval_count: 33, eval_count: 7 },
          ],
          { splitEvery: 17 },
        );
      return writeJson(res, 404, { error: 'not found' });
    });
    const p = new OllamaProvider({ baseUrl: () => server!.url });
    const events = await collect(p.stream(req('qwen3:8b', { maxTokens: 500 })));
    expect(events.filter((e) => e.type === 'thinking_delta').map((e) => (e as { text: string }).text).join('')).toBe('vou somar');
    expect(events.filter((e) => e.type === 'text_delta').map((e) => (e as { text: string }).text).join('')).toBe('Vou somar.');
    const done = events.at(-1) as Extract<LlmStreamEvent, { type: 'done' }>;
    expect(done.stopReason).toBe('tool_use');
    expect(done.usage).toEqual({ inputTokens: 33, outputTokens: 7 });
    expect(done.message.parts[0]).toEqual({ type: 'text', text: 'Vou somar.' });
    expect(done.message.parts[1]).toMatchObject({ type: 'tool_call', name: 'somar', input: { a: 1 } });
    expect(p.capabilities('qwen3:8b')).toMatchObject({ vision: true, tools: true, pdf: false });

    const chat = server.requests.find((r) => r.url === '/api/chat')!.body;
    expect(chat).toMatchObject({ model: 'qwen3:8b', stream: true, options: { num_predict: 500, num_ctx: 16384 } });
    expect(chat.messages).toEqual([
      { role: 'system', content: 'Você é o 300.' },
      { role: 'user', content: 'some 1 e 2', images: ['PNG'] },
      { role: 'system', content: 'Data: hoje' },
    ]);
    expect(chat.tools).toEqual([{ type: 'function', function: { name: 'somar', description: 'soma', parameters: { type: 'object', properties: { a: { type: 'number' } } } } }]);
  });

  it('modelo sem ferramentas (segundo /api/show) não recebe tools', async () => {
    server = await startServer((r, res) => {
      if (r.url === '/api/show') return writeJson(res, 200, { capabilities: ['completion'] });
      return writeNdjson(res, [{ message: { role: 'assistant', content: 'oi' }, done: true, done_reason: 'stop' }]);
    });
    const p = new OllamaProvider({ baseUrl: server.url });
    await collect(p.stream(req('gemma:2b')));
    expect(server.requests.find((r) => r.url === '/api/chat')!.body).not.toHaveProperty('tools');
  });

  it('listModels (/api/tags), healthCheck (/api/version) e erros', async () => {
    server = await startServer((r, res) => {
      if (r.url === '/api/tags') return writeJson(res, 200, { models: [{ name: 'qwen3:8b' }, { name: 'llama3.2:3b' }] });
      if (r.url === '/api/version') return writeJson(res, 200, { version: '0.12.0' });
      if (r.url === '/api/show') return writeJson(res, 404, { error: "model 'nao-existe' not found" });
      if (r.url === '/api/chat') return writeJson(res, 404, { error: "model 'nao-existe' not found, try pulling it first" });
      return writeJson(res, 404, {});
    });
    const p = new OllamaProvider({ baseUrl: server.url });
    expect(await p.listModels()).toEqual(['llama3.2:3b', 'qwen3:8b']);
    expect(await p.healthCheck()).toEqual({ ok: true, detail: 'Ollama 0.12.0 conectado.' });
    const err = await collect(p.stream(req('nao-existe'))).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('modelo_nao_encontrado');
    expect((err as LlmError).message).toContain('ollama pull nao-existe');
    const url = server.url;
    await server.close();
    server = undefined;
    const off = new OllamaProvider({ baseUrl: url });
    const e2 = await collect(off.stream(req('qwen3:8b'))).catch((e: unknown) => e);
    expect((e2 as LlmError).code).toBe('rede');
    expect((await off.healthCheck()).ok).toBe(false);
    const bad = new OllamaProvider({ baseUrl: 'file:///etc' });
    expect(((await collect(bad.stream(req('x'))).catch((e: unknown) => e)) as LlmError).message).toContain('http://');
  });

  it('erro no meio do stream e cancelamento', async () => {
    server = await startServer((r, res) => {
      if (r.url === '/api/show') return writeJson(res, 200, { capabilities: ['completion', 'tools'] });
      return writeNdjson(res, [{ message: { role: 'assistant', content: 'a' }, done: false }, { error: 'out of memory' }]);
    });
    const p = new OllamaProvider({ baseUrl: server.url });
    const err = await collect(p.stream(req('qwen3:8b'))).catch((e: unknown) => e);
    expect((err as LlmError).message).toContain('out of memory');
    await server.close();

    server = await startServer((r, res) => {
      if (r.url === '/api/show') return writeJson(res, 200, { capabilities: ['completion'] });
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ message: { role: 'assistant', content: 'Começo' }, done: false }) + '\n');
      // fica aberto
    });
    const p2 = new OllamaProvider({ baseUrl: server.url });
    const ac = new AbortController();
    const t0 = Date.now();
    const e2 = await (async () => {
      for await (const e of p2.stream(req('qwen3:8b', { signal: ac.signal }))) if (e.type === 'text_delta') ac.abort();
    })().catch((e: unknown) => e);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect((e2 as LlmError).code).toBe('cancelado');
  });
});
