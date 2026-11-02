import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import {
  anthropicContentToParts,
  anthropicModelProfile,
  anthropicToolId,
  buildAnthropicRequest,
  mapAnthropicError,
  sanitizeFallbackContent,
  toAnthropicMessages,
} from '@core/llm/anthropic';
import { invalidToolInput, INTERRUPTED_TOOL_TEXT } from '@core/llm/common';
import type { ChatMessage, LlmRequest } from '@core/types';

const at = '2026-11-02T00:00:00.000Z';
const user = (text: string, extra: ChatMessage['parts'] = []): ChatMessage => ({ id: 'u' + text, role: 'user', parts: [...extra, { type: 'text', text }], createdAt: at });
const ctx = (text: string): ChatMessage => ({ id: 'c' + text, role: 'context', parts: [{ type: 'text', text }], createdAt: at });
const asst = (parts: ChatMessage['parts'], native?: ChatMessage['native']): ChatMessage => ({ id: 'a', role: 'assistant', parts, createdAt: at, ...(native ? { native } : {}) });
const tool = (results: { id: string; text: string; isError?: boolean }[]): ChatMessage => ({
  id: 't',
  role: 'tool',
  createdAt: at,
  parts: results.map((r) => ({ type: 'tool_result', toolCallId: r.id, name: 'f', content: [{ type: 'text', text: r.text }], ...(r.isError ? { isError: true } : {}) })),
});

const OPUS = 'claude-opus-5-5';
const OLD = 'claude-sonnet-4-5';

describe('perfil de modelo', () => {
  it('Opus 5.5: adaptativo, esforço, system no meio, ferramentas web, fallback', () => {
    expect(anthropicModelProfile(OPUS)).toMatchObject({ adaptiveThinking: true, effort: true, midConversationSystem: true, serverWebTools: true, refusalFallback: true, maxOutputTokens: 128000 });
  });
  it('Haiku 5.5: system no meio, sem fallback e sem ferramentas web 20260209', () => {
    expect(anthropicModelProfile('claude-haiku-5-5')).toMatchObject({ adaptiveThinking: true, midConversationSystem: true, serverWebTools: false, refusalFallback: false });
  });
  it('Sonnet 5 não aceita system no meio; modelos antigos não têm pensamento adaptativo', () => {
    expect(anthropicModelProfile('claude-sonnet-5').midConversationSystem).toBe(false);
    expect(anthropicModelProfile(OLD)).toMatchObject({ adaptiveThinking: false, effort: false, midConversationSystem: false });
    expect(anthropicModelProfile('claude-haiku-4-5-20251001').adaptiveThinking).toBe(false);
    expect(anthropicModelProfile('anthropic.claude-opus-5-5').midConversationSystem).toBe(true);
  });
});

describe('conversão neutra -> Anthropic', () => {
  it('fala do dono com imagem e PDF', () => {
    const msgs = toAnthropicMessages(
      [user('o que é isto?', [{ type: 'image', mediaType: 'image/png', data: 'AAA' }, { type: 'document', mediaType: 'application/pdf', data: 'BBB', name: 'nota.pdf' }])],
      { model: OPUS },
    );
    expect(msgs).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } },
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'BBB' }, title: 'nota.pdf' },
          { type: 'text', text: 'o que é isto?' },
        ],
      },
    ]);
  });

  it('contexto vira role "system" depois da fala do dono (modelo que aceita)', () => {
    const msgs = toAnthropicMessages([user('oi'), ctx('Data: hoje'), asst([{ type: 'text', text: 'olá' }]), user('e aí'), ctx('Data: agora')], { model: OPUS });
    expect(msgs.map((m) => m.role)).toEqual(['user', 'system', 'assistant', 'user', 'system']);
    expect(msgs[1]).toEqual({ role: 'system', content: 'Data: hoje' });
  });

  it('modelo sem suporte: contexto entra como <contexto> na fala do dono', () => {
    const msgs = toAnthropicMessages([user('oi'), ctx('Data: hoje')], { model: OLD });
    expect(msgs).toEqual([{ role: 'user', content: [{ type: 'text', text: 'oi' }, { type: 'text', text: '<contexto>\nData: hoje\n</contexto>' }] }]);
  });

  it('posição inválida (seguido de outra fala do dono) também mescla', () => {
    const msgs = toAnthropicMessages([user('a'), ctx('C1'), user('b'), ctx('C2')], { model: OPUS });
    expect(msgs.map((m) => m.role)).toEqual(['user', 'system']);
    expect(msgs[0]!.content).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: '<contexto>\nC1\n</contexto>' },
      { type: 'text', text: 'b' },
    ]);
    // contexto no início (sem fala anterior) entra na próxima fala
    const first = toAnthropicMessages([ctx('Resumo'), user('oi')], { model: OPUS });
    expect(first).toEqual([{ role: 'user', content: [{ type: 'text', text: '<contexto>\nResumo\n</contexto>' }, { type: 'text', text: 'oi' }] }]);
  });

  it('resultados de ferramenta seguidos ficam em UMA mensagem, antes do texto', () => {
    const msgs = toAnthropicMessages(
      [
        user('faça'),
        asst([
          { type: 'tool_call', id: 'c1', name: 'f', input: { a: 1 } },
          { type: 'tool_call', id: 'c2', name: 'f', input: { a: 2 } },
        ]),
        tool([{ id: 'c1', text: 'r1' }]),
        tool([{ id: 'c2', text: 'r2', isError: true }]),
        user('e agora?'),
      ],
      { model: OPUS },
    );
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1]!.content).toEqual([
      { type: 'tool_use', id: 'c1', name: 'f', input: { a: 1 } },
      { type: 'tool_use', id: 'c2', name: 'f', input: { a: 2 } },
    ]);
    expect(msgs[2]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'c1', content: [{ type: 'text', text: 'r1' }] },
      { type: 'tool_result', tool_use_id: 'c2', content: [{ type: 'text', text: 'r2' }], is_error: true },
      { type: 'text', text: 'e agora?' },
    ]);
  });

  it('reenvia os blocos nativos (pensamento assinado) sem alteração para o mesmo modelo', () => {
    const native = [
      { type: 'thinking', thinking: '', signature: 'SIG123' },
      { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'x' } },
      { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://a', title: 'A', encrypted_content: 'E', page_age: null }] },
      { type: 'text', text: 'Resposta', citations: [{ type: 'web_search_result_location', url: 'https://a', title: 'A', encrypted_index: 'I', cited_text: 'c' }] },
    ];
    const m = asst([{ type: 'text', text: 'Resposta' }], { provider: 'anthropic', model: OPUS, content: native });
    const same = toAnthropicMessages([user('q'), m], { model: OPUS });
    expect(same[1]!.content).toEqual(native);
    // outro modelo: só as partes neutras (sem pensamento)
    const other = toAnthropicMessages([user('q'), m], { model: 'claude-sonnet-5-5' });
    expect(other[1]!.content).toEqual([{ type: 'text', text: 'Resposta' }]);
  });

  it('repara chamadas sem resultado e descarta resultados órfãos', () => {
    const msgs = toAnthropicMessages(
      [user('a'), tool([{ id: 'zz', text: 'órfão' }]), asst([{ type: 'tool_call', id: 'c1', name: 'f', input: {} }]), user('b')],
      { model: OPUS },
    );
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[2]!.content).toEqual([
      { type: 'tool_result', tool_use_id: 'c1', content: [{ type: 'text', text: INTERRUPTED_TOOL_TEXT }], is_error: true },
      { type: 'text', text: 'b' },
    ]);
  });

  it('ids e entradas inválidas ficam aceitáveis para a API', () => {
    expect(anthropicToolId('call.abc:1')).toBe('call_abc_1');
    const msgs = toAnthropicMessages([user('a'), asst([{ type: 'tool_call', id: 'call.1', name: 'f', input: invalidToolInput('{x', 'erro') }]), tool([{ id: 'call.1', text: 'erro' }])], { model: OPUS });
    expect(msgs[1]!.content).toEqual([{ type: 'tool_use', id: 'call_1', name: 'f', input: {} }]);
    expect((msgs[2]!.content as { tool_use_id: string }[])[0]!.tool_use_id).toBe('call_1');
  });

  it('primeira mensagem sempre é do dono e não há blocos de texto vazios', () => {
    const msgs = toAnthropicMessages([asst([{ type: 'text', text: 'oi' }, { type: 'text', text: '  ' }])], { model: OPUS });
    expect(msgs[0]!.role).toBe('user');
    expect(msgs[1]!.content).toEqual([{ type: 'text', text: 'oi' }]);
  });

  it('é determinística (mesmo histórico -> mesmos bytes)', () => {
    const h = [user('a'), ctx('c'), asst([{ type: 'tool_call', id: 'c1', name: 'f', input: { b: 1, a: 2 } }]), tool([{ id: 'c1', text: 'r' }])];
    expect(JSON.stringify(toAnthropicMessages(h, { model: OPUS }))).toBe(JSON.stringify(toAnthropicMessages(JSON.parse(JSON.stringify(h)), { model: OPUS })));
  });
});

describe('montagem do pedido', () => {
  const base: LlmRequest = {
    model: OPUS,
    system: 'Você é o 300.',
    messages: [user('oi')],
    tools: [{ name: 'buscar', description: 'busca', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }],
    serverTools: { webSearch: true, webFetch: true },
    effort: 'high',
  };
  const opts = { refusalFallback: true, thinkingDisplay: 'omitted' as const, eagerInputStreaming: true, defaultMaxTokens: 32000 };

  it('Opus 5.5: adaptativo, esforço explícito, cache, eager, web e fallback', () => {
    const p = buildAnthropicRequest(base, opts);
    expect(p.thinking).toEqual({ type: 'adaptive', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(p.output_config).toEqual({ effort: 'high' });
    expect(p.system).toEqual([{ type: 'text', text: 'Você é o 300.', cache_control: { type: 'ephemeral' } }]);
    expect(p.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.tools).toEqual([
      { name: 'buscar', description: 'busca', input_schema: { type: 'object', properties: { q: { type: 'string' } } }, eager_input_streaming: true },
      { type: 'web_search_20260209', name: 'web_search', max_uses: 8 },
      { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
    ]);
    expect(p.fallbacks).toBe('default');
    expect(p.betas).toEqual(['thinking-binding-controls-2026-08-01', 'server-side-fallback-2026-07-01']);
    expect(p.max_tokens).toBe(32000);
    expect(p.stream).toBe(true);
    for (const k of ['temperature', 'top_p', 'top_k', 'tool_choice']) expect(p).not.toHaveProperty(k);
  });

  it('esforço padrão é explícito (medium) e max_tokens respeita o limite do modelo', () => {
    const p = buildAnthropicRequest({ ...base, effort: undefined, maxTokens: 999999 }, opts);
    expect(p.output_config).toEqual({ effort: 'medium' });
    expect(p.max_tokens).toBe(128000);
  });

  it('Haiku 5.5: sem ferramentas web 20260209 e sem fallback', () => {
    const p = buildAnthropicRequest({ ...base, model: 'claude-haiku-5-5' }, opts);
    expect(p.tools?.map((t) => (t as { name?: string }).name)).toEqual(['buscar']);
    expect(p).not.toHaveProperty('fallbacks');
    expect(p.betas).toEqual(['thinking-binding-controls-2026-08-01']);
  });

  it('Opus 5 (sem checagem de histórico): sem block_binding', () => {
    const p = buildAnthropicRequest({ ...base, model: 'claude-opus-5' }, opts);
    expect(p.thinking).toEqual({ type: 'adaptive' });
    expect(p.betas).toEqual(['server-side-fallback-2026-07-01']);
  });

  it('ferramenta local com nome de ferramenta do servidor: a do servidor fica de fora', () => {
    const p = buildAnthropicRequest({ ...base, tools: [{ name: 'web_search', description: 'busca local', inputSchema: { type: 'object' } }] }, opts);
    expect(p.tools?.map((t) => (t as { name?: string }).name)).toEqual(['web_search', 'web_fetch']);
    expect((p.tools?.[0] as { type?: string }).type).toBeUndefined();
  });

  it('fallback desligado e resumo do raciocínio ligado', () => {
    const p = buildAnthropicRequest(base, { ...opts, refusalFallback: false, thinkingDisplay: 'summarized' });
    expect(p).not.toHaveProperty('fallbacks');
    expect(p.thinking).toEqual({ type: 'adaptive', display: 'summarized', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
    expect(p.betas).toEqual(['thinking-binding-controls-2026-08-01']);
  });

  it('modelo antigo: sem thinking/effort', () => {
    const p = buildAnthropicRequest({ ...base, model: OLD }, opts);
    expect(p).not.toHaveProperty('thinking');
    expect(p).not.toHaveProperty('output_config');
    expect(p).not.toHaveProperty('betas');
  });
});

describe('resposta -> neutro', () => {
  it('omite pensamento/chamadas antes do último fallback e mantém texto', () => {
    const content = [
      { type: 'thinking', thinking: '', signature: 's1' },
      { type: 'text', text: 'Parte 1 ', citations: null },
      { type: 'tool_use', id: 'toolu_x', name: 'f', input: {} },
      { type: 'server_tool_use', id: 'srv1', name: 'web_search', input: {} },
      { type: 'fallback', from: { model: OPUS }, to: { model: 'claude-opus-5' }, trigger: { type: 'refusal' } },
      { type: 'thinking', thinking: '', signature: 's2' },
      { type: 'text', text: 'parte 2', citations: null },
      { type: 'tool_use', id: 'toolu_y', name: 'g', input: { a: 1 } },
    ] as never[];
    const clean = sanitizeFallbackContent(content);
    expect(clean.map((b: { type: string }) => b.type)).toEqual(['text', 'fallback', 'thinking', 'text', 'tool_use']);
    const parts = anthropicContentToParts(clean, new Map());
    expect(parts).toEqual([
      { type: 'text', text: 'Parte 1 parte 2' },
      { type: 'tool_call', id: 'toolu_y', name: 'g', input: { a: 1 } },
    ]);
  });

  it('marcador de entrada inválida substitui a entrada tolerante', () => {
    const mark = invalidToolInput('{"a":', 'fim inesperado');
    const parts = anthropicContentToParts([{ type: 'tool_use', id: 't1', name: 'f', input: { a: null } }] as never[], new Map([['t1', mark]]));
    expect(parts).toEqual([{ type: 'tool_call', id: 't1', name: 'f', input: mark }]);
  });
});

describe('erros tipados -> mensagens em pt-BR', () => {
  const h = (o: Record<string, string> = {}) => new Headers(o);
  it('chave inválida, limite com retry-after, sobrecarga, rede, contexto e modelo', () => {
    expect(mapAnthropicError(new Anthropic.AuthenticationError(401, {}, 'invalid x-api-key', h()), OPUS)).toMatchObject({ code: 'chave_invalida' });
    const rl = mapAnthropicError(new Anthropic.RateLimitError(429, {}, 'rate', h({ 'retry-after': '7' })), OPUS);
    expect(rl).toMatchObject({ code: 'limite_taxa', retryAfterSec: 7 });
    expect(rl.message).toContain('7 s');
    expect(mapAnthropicError(new Anthropic.InternalServerError(529, {}, 'Overloaded', h(), 'overloaded_error'), OPUS)).toMatchObject({ code: 'sobrecarga' });
    expect(mapAnthropicError(new Anthropic.APIConnectionError({ message: 'ECONNRESET' }), OPUS)).toMatchObject({ code: 'rede' });
    expect(mapAnthropicError(new Anthropic.APIConnectionTimeoutError(), OPUS)).toMatchObject({ code: 'tempo_esgotado' });
    expect(mapAnthropicError(new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'prompt is too long: 1200000 tokens > 1000000 maximum' } }, undefined, h(), 'invalid_request_error'), OPUS)).toMatchObject({
      code: 'contexto_grande',
    });
    expect(mapAnthropicError(new Anthropic.NotFoundError(404, {}, 'model: x', h()), 'claude-x').message).toContain('claude-x');
    expect(mapAnthropicError(new Anthropic.APIUserAbortError(), OPUS)).toMatchObject({ code: 'cancelado' });
    const bad = mapAnthropicError(new Anthropic.BadRequestError(400, { type: 'error', error: { type: 'invalid_request_error', message: 'messages.0: sk-ant-api03-SEGREDO123456 inválido' } }, undefined, h()), OPUS);
    expect(bad.code).toBe('requisicao_invalida');
    expect(bad.message).toContain('messages.0');
    expect(bad.message).not.toContain('SEGREDO');
  });
});
