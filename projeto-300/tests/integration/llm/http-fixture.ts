/**
 * Servidor HTTP local para exercitar o caminho REAL dos SDKs (fetch, SSE,
 * NDJSON, erros) sem internet. Só para testes.
 */
import { createServer, type IncomingHttpHeaders, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: any;
}

export type Handler = (req: RecordedRequest, res: ServerResponse, index: number) => void | Promise<void>;

export interface TestServer {
  url: string;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

export async function startServer(handler: Handler): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const open = new Set<ServerResponse>();
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        /* corpo não-JSON */
      }
      const rec: RecordedRequest = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body };
      requests.push(rec);
      open.add(res);
      res.on('close', () => open.delete(res));
      Promise.resolve(handler(rec, res, requests.length - 1)).catch((e: unknown) => {
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        for (const r of open) r.destroy();
        server.close(() => resolve());
      }),
  };
}

export interface SseEvent {
  event?: string;
  data: unknown;
}

/** Escreve eventos SSE (event:/data:) e fecha, ou mantém aberto. */
export async function writeSse(res: ServerResponse, events: SseEvent[], opts: { delayMs?: number; keepOpen?: boolean; headers?: Record<string, string> } = {}): Promise<void> {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', ...opts.headers });
  for (const e of events) {
    if (res.destroyed) return;
    const lines = (e.event ? `event: ${e.event}\n` : '') + `data: ${typeof e.data === 'string' ? e.data : JSON.stringify(e.data)}\n\n`;
    res.write(lines);
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
  }
  if (!opts.keepOpen) res.end();
}

export function writeNdjson(res: ServerResponse, lines: unknown[], opts: { splitEvery?: number } = {}): void {
  res.writeHead(200, { 'content-type': 'application/x-ndjson' });
  const text = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
  // Envia em pedaços arbitrários para testar a montagem das linhas.
  const step = opts.splitEvery ?? text.length;
  for (let i = 0; i < text.length; i += step) res.write(text.slice(i, i + step));
  res.end();
}

export function writeJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/* ---------------- construtores de eventos da Anthropic ---------------- */
export const anth = {
  start: (model = 'claude-opus-5-5', usage: Record<string, unknown> = {}): SseEvent => ({
    event: 'message_start',
    data: {
      type: 'message_start',
      message: {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        stop_details: null,
        container: null,
        context_management: null,
        diagnostics: null,
        usage: { input_tokens: 120, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 100, server_tool_use: null, ...usage },
      },
    },
  }),
  blockStart: (index: number, block: Record<string, unknown>): SseEvent => ({ event: 'content_block_start', data: { type: 'content_block_start', index, content_block: block } }),
  delta: (index: number, delta: Record<string, unknown>): SseEvent => ({ event: 'content_block_delta', data: { type: 'content_block_delta', index, delta } }),
  text: (index: number, text: string): SseEvent => anth.delta(index, { type: 'text_delta', text }),
  json: (index: number, partial: string): SseEvent => anth.delta(index, { type: 'input_json_delta', partial_json: partial }),
  blockStop: (index: number): SseEvent => ({ event: 'content_block_stop', data: { type: 'content_block_stop', index } }),
  messageDelta: (stop_reason: string, extra: Record<string, unknown> = {}, usage: Record<string, unknown> = {}): SseEvent => ({
    event: 'message_delta',
    data: { type: 'message_delta', delta: { stop_reason, stop_sequence: null, ...extra }, usage: { output_tokens: 42, ...usage }, context_management: null },
  }),
  stop: (): SseEvent => ({ event: 'message_stop', data: { type: 'message_stop' } }),
};

/** Resposta de texto simples. */
export function anthText(text: string, model = 'claude-opus-5-5'): SseEvent[] {
  return [anth.start(model), anth.blockStart(0, { type: 'text', text: '', citations: null }), anth.text(0, text), anth.blockStop(0), anth.messageDelta('end_turn'), anth.stop()];
}
