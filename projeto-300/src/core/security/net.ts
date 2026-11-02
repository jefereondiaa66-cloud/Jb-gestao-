/**
 * Busca HTTP segura contra SSRF.
 *
 * Toda conexão valida CADA endereço resolvido no momento de conectar (um
 * `lookup` próprio), o que impede "DNS rebinding" (o nome resolve para um IP
 * público na checagem e para um privado na conexão). Bloqueia loopback, redes
 * privadas, link-local (metadados de nuvem 169.254.169.254), CGNAT, multicast
 * e reservados, em IPv4 e IPv6 (inclusive IPv4 mapeado em IPv6). Só http/https,
 * sem credenciais na URL. Redirecionamentos são revalidados a cada salto, com
 * limite de tamanho e tempo.
 */
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { SecurityError } from './paths';

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string | string[] | number>;
  body?: string | Buffer;
  /** Tamanho máximo do corpo (padrão 5 MB). */
  maxBytes?: number;
  /** Tempo máximo total (padrão 20 s). */
  timeoutMs?: number;
  /** Máximo de redirecionamentos (padrão 5). */
  maxRedirects?: number;
  /** Permitir endereços privados/loopback (padrão false; só para testes locais). */
  allowPrivate?: boolean;
  signal?: AbortSignal;
  /** Resolvedor DNS de baixo nível (compatível com dns.lookup). Só para testes. */
  dnsLookup?: typeof dns.lookup;
}

export interface SafeFetchResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  url: string;
  contentType: string;
  body: Buffer;
}

/* ---------------- validação de IP ---------------- */

function parseV4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const o = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (o.some((x) => Number.isNaN(x) || x < 0 || x > 255)) return null;
  return o;
}

function isBlockedV4(ip: string): boolean {
  const o = parseV4(ip);
  if (!o) return true; // não parseável => bloqueia por segurança
  const [a, b, c, d] = o as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 127) return true; // loopback 127/8
  if (a === 10) return true; // 10/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 169 && b === 254) return true; // link-local / metadados
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF)
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark 198.18/15
  if (a >= 224) return true; // multicast/reservado/broadcast 224-255
  if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
  return false;
}

function v4ToHextets(v4: string): string | null {
  const o = parseV4(v4);
  if (!o) return null;
  const hi = ((o[0]! << 8) | o[1]!).toString(16);
  const lo = ((o[2]! << 8) | o[3]!).toString(16);
  return `${hi}:${lo}`;
}

function expandV6(input: string): Uint8Array | null {
  let ip = input.split('%')[0]!; // remove zona (fe80::1%eth0)
  const m = ip.match(/:((?:\d{1,3}\.){3}\d{1,3})$/);
  if (m) {
    const hx = v4ToHextets(m[1]!);
    if (!hx) return null;
    ip = ip.slice(0, ip.length - m[1]!.length) + hx;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0]!.split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1]!.split(':') : []) : [];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) return null;
  const mid = halves.length === 2 ? Array<string>(missing).fill('0') : [];
  const full = [...head, ...mid, ...tail];
  if (full.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const seg = full[i] || '0';
    if (!/^[0-9a-fA-F]{1,4}$/.test(seg)) return null;
    const h = parseInt(seg, 16);
    bytes[i * 2] = (h >> 8) & 0xff;
    bytes[i * 2 + 1] = h & 0xff;
  }
  return bytes;
}

function isBlockedV6(ip: string): boolean {
  const b = expandV6(ip);
  if (!b) return true;
  const allZeroExceptLast = b.every((x, i) => (i < 15 ? x === 0 : true));
  if (allZeroExceptLast && b[15] === 1) return true; // ::1 loopback
  if (b.every((x) => x === 0)) return true; // :: unspecified
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 (ULA)
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  // IPv4 mapeado (::ffff:a.b.c.d) ou compatível (::a.b.c.d)
  const first10Zero = b.slice(0, 10).every((x) => x === 0);
  if (first10Zero && ((b[10] === 0xff && b[11] === 0xff) || (b[10] === 0 && b[11] === 0))) {
    const v4 = `${b[12]}.${b[13]}.${b[14]}.${b[15]}`;
    return isBlockedV4(v4);
  }
  return false;
}

/** Um endereço IP literal deve ser bloqueado? (allowPrivate libera tudo) */
export function isBlockedAddress(address: string, allowPrivate = false): boolean {
  if (allowPrivate) return false;
  const fam = net.isIP(address);
  if (fam === 4) return isBlockedV4(address);
  if (fam === 6) return isBlockedV6(address);
  return true; // não é IP válido => bloqueia
}

/* ---------------- validação de URL ---------------- */

export function validatePublicUrl(raw: string | URL, opts: { allowPrivate?: boolean } = {}): URL {
  let u: URL;
  try {
    u = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new SecurityError('endereço (URL) inválido.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new SecurityError('só são permitidos endereços http e https.');
  if (u.username || u.password) throw new SecurityError('a URL não pode conter usuário/senha embutidos.');
  const host = u.hostname;
  if (!host) throw new SecurityError('URL sem endereço (host).');
  if (!opts.allowPrivate && /^(localhost|ip6-localhost|ip6-loopback)$/i.test(host)) throw new SecurityError('endereço local não é permitido.');
  if (!opts.allowPrivate && /\.(localhost|local|internal|intranet|corp|home|lan)$/i.test(host)) throw new SecurityError('endereço de rede interna não é permitido.');
  const lit = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (net.isIP(lit) && isBlockedAddress(lit, opts.allowPrivate ?? false)) {
    throw new SecurityError(`endereço não permitido: ${lit}`);
  }
  return u;
}

/* ---------------- lookup com validação ---------------- */

function stripScope(addr: string): string {
  return addr.split('%')[0]!;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address?: string | dns.LookupAddress[], family?: number) => void;

function makeLookup(allowPrivate: boolean, raw?: typeof dns.lookup): (hostname: string, options: dns.LookupOneOptions | dns.LookupAllOptions | dns.LookupOptions | LookupCallback, callback?: LookupCallback) => void {
  const base = raw ?? dns.lookup;
  return (hostname, options, callback) => {
    let cb: LookupCallback;
    let opts: dns.LookupOptions;
    if (typeof options === 'function') {
      cb = options as LookupCallback;
      opts = {};
    } else {
      cb = callback as LookupCallback;
      opts = options as dns.LookupOptions;
    }
    const wantAll = !!(opts && (opts as dns.LookupAllOptions).all);
    (base as unknown as (h: string, o: dns.LookupAllOptions, c: (e: NodeJS.ErrnoException | null, a: dns.LookupAddress[]) => void) => void)(
      hostname,
      { ...(opts as object), all: true, verbatim: true },
      (err, addresses) => {
        if (err) return cb(err);
        const list = Array.isArray(addresses) ? addresses : [];
        if (list.length === 0) return cb(new SecurityError(`não foi possível resolver o endereço: ${hostname}`));
        for (const a of list) {
          if (isBlockedAddress(a.address, allowPrivate)) {
            return cb(new SecurityError(`o endereço ${hostname} resolveu para um IP bloqueado (${a.address}).`));
          }
        }
        if (wantAll) return cb(null, list);
        cb(null, list[0]!.address, list[0]!.family);
      },
    );
  };
}

/* ---------------- requisição ---------------- */

function normalizeHeaders(headers?: Record<string, string | string[] | number>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!headers) return out;
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (key === 'content-length' || key === 'host') continue; // o node define
    out[key] = Array.isArray(v) ? v.map(String) : String(v);
  }
  return out;
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

interface DoRequestArgs {
  url: URL;
  method: string;
  headers?: Record<string, string | string[] | number>;
  body?: string | Buffer;
  lookup: ReturnType<typeof makeLookup>;
  timeoutMs: number;
  allowPrivate: boolean;
  signal?: AbortSignal;
}

function doRequest(args: DoRequestArgs): Promise<{ req: http.ClientRequest; res: http.IncomingMessage }> {
  const { url, method, headers, body, lookup, timeoutMs, allowPrivate, signal } = args;
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const reqOpts: https.RequestOptions = {
      method,
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      headers: normalizeHeaders(headers),
      lookup: lookup as unknown as https.RequestOptions['lookup'],
      agent: false, // sem reaproveitar socket: o lookup roda a cada conexão
      setHost: true,
    };
    let settled = false;
    const fail = (e: Error): void => {
      if (settled) return;
      settled = true;
      reject(e);
    };
    const req = mod.request(reqOpts, (res) => {
      if (settled) {
        res.destroy();
        return;
      }
      settled = true;
      resolve({ req, res });
    });
    req.on('error', (e) => fail(e instanceof SecurityError ? e : new SecurityError(`falha na conexão: ${String((e as Error).message || e)}`)));
    // Defesa extra: confere o endereço realmente conectado.
    req.on('socket', (socket) => {
      const check = (): void => {
        const addr = socket.remoteAddress;
        if (addr && isBlockedAddress(stripScope(addr), allowPrivate)) {
          req.destroy(new SecurityError(`conexão a endereço bloqueado: ${addr}`));
        }
      };
      if (socket.connecting) socket.once('connect', check);
      else check();
    });
    if (signal) {
      if (signal.aborted) req.destroy(new SecurityError('requisição cancelada.'));
      else signal.addEventListener('abort', () => req.destroy(new SecurityError('requisição cancelada.')), { once: true });
    }
    req.setTimeout(timeoutMs, () => req.destroy(new SecurityError('tempo limite da requisição esgotado.')));
    if (body !== undefined && method !== 'GET' && method !== 'HEAD') req.write(body);
    req.end();
  });
}

function collectBody(res: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    res.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        res.destroy();
        reject(new SecurityError(`a resposta passou do tamanho máximo (${Math.round(maxBytes / 1024)} KB).`));
        return;
      }
      chunks.push(chunk);
    });
    res.on('end', () => resolve(Buffer.concat(chunks)));
    res.on('error', (e) => reject(e instanceof SecurityError ? e : new SecurityError(`erro ao ler a resposta: ${String((e as Error).message || e)}`)));
  });
}

export async function safeFetch(rawUrl: string | URL, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxRedirects = opts.maxRedirects ?? 5;
  const allowPrivate = opts.allowPrivate ?? false;
  let method = (opts.method ?? 'GET').toUpperCase();
  let body = opts.body;
  let current = validatePublicUrl(rawUrl, { allowPrivate });
  const lookup = makeLookup(allowPrivate, opts.dnsLookup);
  const deadline = Date.now() + timeoutMs;
  let redirects = 0;

  for (;;) {
    if (opts.signal?.aborted) throw new SecurityError('requisição cancelada.');
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new SecurityError('tempo limite da requisição esgotado.');

    const { req, res } = await doRequest({
      url: current,
      method,
      ...(opts.headers !== undefined ? { headers: opts.headers } : {}),
      ...(body !== undefined ? { body } : {}),
      lookup,
      timeoutMs: remaining,
      allowPrivate,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });

    const status = res.statusCode ?? 0;
    const location = res.headers.location;
    if (isRedirect(status) && location) {
      res.resume();
      res.destroy();
      req.destroy();
      if (redirects >= maxRedirects) throw new SecurityError('número máximo de redirecionamentos excedido.');
      redirects++;
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        throw new SecurityError('redirecionamento com endereço inválido.');
      }
      current = validatePublicUrl(next, { allowPrivate });
      if (status === 303 || ((status === 301 || status === 302) && method !== 'GET' && method !== 'HEAD')) {
        method = 'GET';
        body = undefined;
      }
      continue;
    }

    const buf = await collectBody(res, maxBytes);
    return {
      status,
      headers: res.headers,
      url: current.href,
      contentType: String(res.headers['content-type'] ?? ''),
      body: buf,
    };
  }
}
