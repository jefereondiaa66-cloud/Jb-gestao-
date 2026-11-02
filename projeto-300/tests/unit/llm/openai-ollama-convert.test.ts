import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';
import { invalidToolInput, isInvalidToolInput } from '@core/llm/common';
import { buildOpenAIRequest, mapOpenAIError, openAIEffort, openAIOutputToParts, toOpenAIInput } from '@core/llm/openai';
import { ThinkTagFilter, toOllamaMessages } from '@core/llm/ollama';
import type { ChatMessage } from '@core/types';

const at = '2026-11-02T00:00:00.000Z';
const msg = (role: ChatMessage['role'], parts: ChatMessage['parts'], native?: ChatMessage['native']): ChatMessage => ({ id: role, role, parts, createdAt: at, ...(native ? { native } : {}) });

const history: ChatMessage[] = [
  msg('user', [{ type: 'image', mediaType: 'image/jpeg', data: 'IMG' }, { type: 'document', mediaType: 'application/pdf', data: 'PDF', name: 'a.pdf' }, { type: 'text', text: 'veja' }]),
  msg('context', [{ type: 'text', text: 'Data: hoje' }]),
  msg('assistant', [
    { type: 'text', text: 'Vou ver.' },
    { type: 'tool_call', id: 'call_1', name: 'ler', input: { p: 'x' } },
    { type: 'tool_call', id: 'call_2', name: 'ler', input: invalidToolInput('{"p":', 'quebrado') },
  ]),
  msg('tool', [
    { type: 'tool_result', toolCallId: 'call_1', name: 'ler', content: [{ type: 'text', text: 'conteúdo' }, { type: 'image', mediaType: 'image/png', data: 'PNG' }] },
    { type: 'tool_result', toolCallId: 'call_2', name: 'ler', content: [{ type: 'text', text: 'json inválido' }], isError: true },
  ]),
];

describe('OpenAI: conversão', () => {
  it('fala, contexto (developer), chamadas e resultados', () => {
    const items = toOpenAIInput(history, { model: 'gpt-5.1' });
    expect(items).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'data:image/jpeg;base64,IMG', detail: 'auto' },
          { type: 'input_file', filename: 'a.pdf', file_data: 'data:application/pdf;base64,PDF' },
          { type: 'input_text', text: 'veja' },
        ],
      },
      { type: 'message', role: 'developer', content: 'Data: hoje' },
      { type: 'message', role: 'assistant', content: 'Vou ver.' },
      { type: 'function_call', call_id: 'call_1', name: 'ler', arguments: '{"p":"x"}' },
      { type: 'function_call', call_id: 'call_2', name: 'ler', arguments: '{"p":' },
      {
        type: 'function_call_output',
        call_id: 'call_1',
        output: [
          { type: 'input_text', text: 'conteúdo' },
          { type: 'input_image', image_url: 'data:image/png;base64,PNG', detail: 'auto' },
        ],
      },
      { type: 'function_call_output', call_id: 'call_2', output: '[erro] json inválido' },
    ]);
  });

  it('reenvia os itens nativos (raciocínio criptografado) para o mesmo modelo', () => {
    const native = [
      { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'ENC' },
      { type: 'message', id: 'msg_1', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'Oi', annotations: [] }] },
    ];
    const h = [msg('user', [{ type: 'text', text: 'oi' }]), msg('assistant', [{ type: 'text', text: 'Oi' }], { provider: 'openai', model: 'gpt-5.1', content: native })];
    expect(toOpenAIInput(h, { model: 'gpt-5.1' }).slice(1)).toEqual(native);
    expect(toOpenAIInput(h, { model: 'gpt-4.1' }).slice(1)).toEqual([{ type: 'message', role: 'assistant', content: 'Oi' }]);
  });

  it('pedido: store false, raciocínio criptografado, sem temperature', () => {
    const p = buildOpenAIRequest({ model: 'gpt-5.1', system: 'S', messages: history, effort: 'xhigh', tools: [{ name: 'ler', description: 'd', inputSchema: { type: 'object' } }] }, { defaultMaxTokens: 1000 });
    expect(p).toMatchObject({ model: 'gpt-5.1', instructions: 'S', stream: true, store: false, max_output_tokens: 1000, reasoning: { effort: 'high' }, include: ['reasoning.encrypted_content'] });
    expect(p.tools).toEqual([{ type: 'function', name: 'ler', description: 'd', parameters: { type: 'object' }, strict: false }]);
    expect(p).not.toHaveProperty('temperature');
    expect(p).not.toHaveProperty('top_p');
    const old = buildOpenAIRequest({ model: 'gpt-4o', system: '', messages: [] }, { defaultMaxTokens: 10 });
    expect(old).not.toHaveProperty('reasoning');
    expect(old).not.toHaveProperty('instructions');
    expect(openAIEffort('low')).toBe('low');
    expect(openAIEffort('max')).toBe('high');
  });

  it('saída -> partes, com argumentos lidos de forma estrita', () => {
    const { parts, refusal } = openAIOutputToParts([
      { type: 'message', id: 'm', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'A', annotations: [] }, { type: 'output_text', text: 'B', annotations: [] }] },
      { type: 'function_call', call_id: 'c1', name: 'f', arguments: '{"x":1}' },
      { type: 'function_call', call_id: 'c2', name: 'f', arguments: '{"x":' },
    ] as never);
    expect(refusal).toBe('');
    expect(parts[0]).toEqual({ type: 'text', text: 'AB' });
    expect(parts[1]).toEqual({ type: 'tool_call', id: 'c1', name: 'f', input: { x: 1 } });
    expect(isInvalidToolInput((parts[2] as { input: unknown }).input)).toBe(true);
  });

  it('erros tipados', () => {
    const h = new Headers({ 'retry-after': '3' });
    expect(mapOpenAIError(new OpenAI.AuthenticationError(401, { message: 'bad key' }, undefined, h), 'gpt-5.1')).toMatchObject({ code: 'chave_invalida' });
    expect(mapOpenAIError(new OpenAI.RateLimitError(429, { message: 'slow', code: 'rate_limit_exceeded' }, undefined, h), 'gpt-5.1')).toMatchObject({ code: 'limite_taxa', retryAfterSec: 3 });
    expect(mapOpenAIError(new OpenAI.RateLimitError(429, { message: 'quota', code: 'insufficient_quota' }, undefined, h), 'gpt-5.1')).toMatchObject({ code: 'cobranca' });
    expect(mapOpenAIError(new OpenAI.BadRequestError(400, { message: 'too long', code: 'context_length_exceeded' }, undefined, h), 'gpt-5.1')).toMatchObject({ code: 'contexto_grande' });
    expect(mapOpenAIError(new OpenAI.APIConnectionError({ message: 'x' }), 'gpt-5.1')).toMatchObject({ code: 'rede' });
    expect(mapOpenAIError(new OpenAI.APIUserAbortError(), 'gpt-5.1')).toMatchObject({ code: 'cancelado' });
  });
});

describe('Ollama: conversão', () => {
  it('sistema primeiro, contexto como system, imagens e ferramentas', () => {
    const out = toOllamaMessages(history, { model: 'qwen3:8b', system: 'S' });
    expect(out).toEqual([
      { role: 'system', content: 'S' },
      { role: 'user', content: '[PDF "a.pdf" anexado: este modelo local não lê PDFs diretamente.]\n\nveja', images: ['IMG'] },
      { role: 'system', content: 'Data: hoje' },
      {
        role: 'assistant',
        content: 'Vou ver.',
        tool_calls: [{ function: { name: 'ler', arguments: { p: 'x' } } }, { function: { name: 'ler', arguments: {} } }],
      },
      { role: 'tool', content: 'conteúdo', tool_name: 'ler', images: ['PNG'] },
      { role: 'tool', content: '[erro] json inválido', tool_name: 'ler' },
    ]);
  });

  it('reenvia a mensagem nativa do mesmo modelo', () => {
    const native = { role: 'assistant', content: 'oi', thinking: 'pensei', tool_calls: [{ id: 'call_9', function: { name: 'f', arguments: { a: 1 } } }] };
    const h = [msg('user', [{ type: 'text', text: 'q' }]), msg('assistant', [{ type: 'text', text: 'oi' }, { type: 'tool_call', id: 'call_9', name: 'f', input: { a: 1 } }], { provider: 'ollama', model: 'qwen3:8b', content: native })];
    const out = toOllamaMessages(h, { model: 'qwen3:8b' });
    expect(out[1]).toEqual(native);
    expect(out[2]).toMatchObject({ role: 'tool', content: expect.stringContaining('não executada') });
  });

  it('separa <think>…</think> mesmo partido entre pedaços', () => {
    const f = new ThinkTagFilter();
    const chunks = ['<thi', 'nk>raciocí', 'nio</th', 'ink>Respos', 'ta <', 'b>ok'];
    let text = '';
    let thinking = '';
    for (const c of chunks) {
      const r = f.push(c);
      text += r.text;
      thinking += r.thinking;
    }
    const end = f.flush();
    text += end.text;
    thinking += end.thinking;
    expect(thinking).toBe('raciocínio');
    expect(text).toBe('Resposta <b>ok');
  });
});
