import { describe, expect, it } from 'vitest';
import { createEmbeddingProvider, OllamaEmbeddings, OpenAIEmbeddings } from '@core/memory/embeddings';
import { defaultSettings, mergeSettings } from '@core/settings';
import { SECRET_NAMES, type SecretStore } from '@core/types';

function secrets(map: Record<string, string> = {}): SecretStore {
  return {
    get: async (n) => map[n],
    set: async () => {},
    delete: async () => {},
    has: async (n) => n in map,
    list: async () => Object.keys(map),
  };
}

type Call = { url: string; body: any; headers: Headers };

function fakeFetch(handler: (call: Call) => Response | Promise<Response>): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const text = await req.text();
    const call = { url: req.url, body: text ? JSON.parse(text) : undefined, headers: req.headers };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return { fetch: f, calls };
}

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

describe('OpenAIEmbeddings', () => {
  it('envia o pedido certo, ordena pelo índice e divide em lotes', async () => {
    const { fetch, calls } = fakeFetch(({ body }) =>
      json({
        object: 'list',
        model: body.model,
        // devolve fora de ordem de propósito
        data: body.input
          .map((t: string, i: number) => ({ object: 'embedding', index: i, embedding: Array.from({ length: 1536 }, (_, k) => (k === 0 ? t.length : 0.001)) }))
          .reverse(),
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
    );
    const p = new OpenAIEmbeddings({ apiKey: 'sk-test-chave', fetch, batchSize: 2, maxRetries: 0 });
    expect(p.id).toBe('openai');
    expect(p.model).toBe('text-embedding-3-small');
    expect(p.dimensions).toBe(1536);
    const out = await p.embed(['a', 'bb', 'ccc', '']);
    expect(out).toHaveLength(4);
    expect(out.map((v) => v[0])).toEqual([1, 2, 3, '(vazio)'.length]);
    expect(out[0]).toBeInstanceOf(Float32Array);
    expect(out[0]!.length).toBe(1536);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toMatch(/\/embeddings$/);
    expect(calls[0]!.body).toMatchObject({ model: 'text-embedding-3-small', input: ['a', 'bb'], encoding_format: 'float' });
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer sk-test-chave');
  });

  it('erro da API vira mensagem em português', async () => {
    const { fetch } = fakeFetch(() => json({ error: { message: 'Incorrect API key', type: 'invalid_request_error' } }, 401));
    const p = new OpenAIEmbeddings({ apiKey: 'sk-errada', fetch, maxRetries: 0 });
    await expect(p.embed(['oi'])).rejects.toThrow(/Falha ao gerar embeddings na OpenAI \(HTTP 401\)/);
  });

  it('vetor com dimensão errada é recusado', async () => {
    const { fetch } = fakeFetch(() => json({ object: 'list', model: 'x', data: [{ object: 'embedding', index: 0, embedding: [1, 2, 3] }], usage: {} }));
    const p = new OpenAIEmbeddings({ apiKey: 'sk', fetch, maxRetries: 0 });
    await expect(p.embed(['oi'])).rejects.toThrow(/dimensões/);
  });

  it('modelo desconhecido descobre dimensões na primeira chamada', async () => {
    const { fetch } = fakeFetch(() => json({ object: 'list', model: 'x', data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }], usage: {} }));
    const p = new OpenAIEmbeddings({ apiKey: 'sk', model: 'modelo-novo', fetch, maxRetries: 0 });
    expect(p.dimensions).toBe(0);
    await p.embed(['oi']);
    expect(p.dimensions).toBe(4);
  });

  it('exige chave', () => {
    expect(() => new OpenAIEmbeddings({ apiKey: '' })).toThrow(/Chave/);
  });
});

describe('OllamaEmbeddings', () => {
  it('POST /api/embed, dimensões detectadas na primeira chamada', async () => {
    const { fetch, calls } = fakeFetch(({ body }) => json({ model: body.model, embeddings: body.input.map((t: string) => [t.length, 0.5, 0.25]) }));
    const p = new OllamaEmbeddings({ url: 'http://127.0.0.1:11434/', model: 'embeddinggemma', fetch });
    expect(p.dimensions).toBe(0);
    const out = await p.embed(['um', 'dois']);
    expect(p.dimensions).toBe(3);
    expect(Array.from(out[1]!)).toEqual([4, 0.5, 0.25]);
    expect(calls[0]!.url).toBe('http://127.0.0.1:11434/api/embed');
    expect(calls[0]!.body).toEqual({ model: 'embeddinggemma', input: ['um', 'dois'], truncate: true });
  });

  it('erros claros', async () => {
    const http = fakeFetch(() => new Response('model "x" not found', { status: 404 }));
    await expect(new OllamaEmbeddings({ model: 'x', fetch: http.fetch }).embed(['a'])).rejects.toThrow(/HTTP 404.*not found/);
    const bad = fakeFetch(() => json({ embeddings: [] }));
    await expect(new OllamaEmbeddings({ model: 'x', fetch: bad.fetch }).embed(['a'])).rejects.toThrow(/quantidade diferente/);
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    await expect(new OllamaEmbeddings({ model: 'x', fetch: down }).embed(['a'])).rejects.toThrow(/Não foi possível falar com o Ollama/);
    expect(() => new OllamaEmbeddings({ model: 'x', url: 'file:///etc' })).toThrow(/http/);
    expect(() => new OllamaEmbeddings({ model: '' })).toThrow(/Modelo/);
  });

  it('respeita cancelamento', async () => {
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(init.signal!.reason)))) as typeof fetch;
    const ac = new AbortController();
    const p = new OllamaEmbeddings({ model: 'x', fetch: slow }).embed(['a'], ac.signal);
    ac.abort(new Error('parado'));
    await expect(p).rejects.toThrow(/parado/);
  });
});

describe('createEmbeddingProvider', () => {
  it('none -> sem provedor', async () => {
    expect(await createEmbeddingProvider(defaultSettings(), secrets())).toBeUndefined();
  });
  it('openai sem chave -> sem provedor; com chave -> OpenAI', async () => {
    const st = mergeSettings(defaultSettings(), { embeddings: { provider: 'openai' } });
    expect(await createEmbeddingProvider(st, secrets())).toBeUndefined();
    const p = await createEmbeddingProvider(st, secrets({ [SECRET_NAMES.openai]: 'sk-x' }));
    expect(p).toBeInstanceOf(OpenAIEmbeddings);
    expect(p!.dimensions).toBe(1536);
  });
  it('configuração inválida ou cofre com falha: sem provedor e com aviso (não derruba o motor)', async () => {
    const warns: string[] = [];
    const logger = { debug() {}, info() {}, error() {}, warn: (m: string) => void warns.push(m) };
    const badUrl = mergeSettings(defaultSettings(), { embeddings: { provider: 'ollama' }, brain: { ollamaUrl: 'localhost:11434' } });
    await expect(createEmbeddingProvider(badUrl, secrets(), undefined, logger)).resolves.toBeUndefined();
    const noModel = mergeSettings(defaultSettings(), { embeddings: { provider: 'ollama', ollamaModel: '' } });
    await expect(createEmbeddingProvider(noModel, secrets(), undefined, logger)).resolves.toBeUndefined();
    const broken: SecretStore = { ...secrets(), get: async () => Promise.reject(new Error('cofre indisponível')) };
    const openai = mergeSettings(defaultSettings(), { embeddings: { provider: 'openai' } });
    await expect(createEmbeddingProvider(openai, broken, undefined, logger)).resolves.toBeUndefined();
    expect(warns.length).toBe(3);
    // Sem logger também não lança
    await expect(createEmbeddingProvider(badUrl, secrets())).resolves.toBeUndefined();
  });

  it('ollama usa endereço e modelo das configurações', async () => {
    const { fetch, calls } = fakeFetch(() => json({ embeddings: [[1, 2]] }));
    const st = mergeSettings(defaultSettings(), { embeddings: { provider: 'ollama', ollamaModel: 'nomic-embed-text' }, brain: { ollamaUrl: 'http://localhost:9999' } });
    const p = await createEmbeddingProvider(st, secrets(), fetch);
    expect(p).toBeInstanceOf(OllamaEmbeddings);
    expect(p!.model).toBe('nomic-embed-text');
    await p!.embed(['a']);
    expect(calls[0]!.url).toBe('http://localhost:9999/api/embed');
  });
});
