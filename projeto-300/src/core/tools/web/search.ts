/**
 * Pesquisa na internet com provedores trocáveis: Brave Search (principal),
 * Tavily (reserva) e SearXNG (instância própria do dono). A escolha segue as
 * configurações e as chaves disponíveis; a busca nativa do Claude é usada
 * quando não há nenhuma chave e o cérebro é a Anthropic.
 */
import type { Settings } from '../../settings';
import { withTimeout } from '../files/util';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Data de publicação (AAAA-MM-DD) ou idade relativa ("há 2 dias"), quando houver. */
  date?: string;
  /** Domínio/veículo. */
  source?: string;
}

export interface SearchOptions {
  count?: number;
  kind?: 'web' | 'news';
  freshness?: 'dia' | 'semana' | 'mes' | 'ano';
  safeSearch?: boolean;
  signal?: AbortSignal;
  /** Tempo máximo desta chamada (padrão 10 s). */
  timeoutMs?: number;
}

export interface SearchResponse {
  provider: string;
  results: SearchResult[];
  /** Provedores que falharam antes (reserva automática). */
  failed?: { provider: string; reason: string }[];
}

export interface SearchProvider {
  readonly id: 'brave' | 'tavily' | 'searxng' | 'fallback';
  readonly label: string;
  search(query: string, opts?: SearchOptions): Promise<SearchResponse>;
}

export class SearchError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SearchError';
  }
}

/* ---------------- utilidades de texto ---------------- */

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', laquo: '«', raquo: '»' };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Tira marcações HTML (ex.: <strong> nos trechos da Brave) e normaliza espaços. */
export function stripTags(s: unknown): string {
  return decodeEntities(String(s ?? '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Data ISO -> AAAA-MM-DD; outros textos ficam como vieram. */
export function normalizeDate(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /\d{4}/.test(s)) return d.toISOString().slice(0, 10);
  return s.slice(0, 40);
}

function isHttpUrl(u: unknown): u is string {
  return typeof u === 'string' && /^https?:\/\//i.test(u);
}

function clampQuery(q: string): string {
  const words = q.trim().split(/\s+/).slice(0, 50).join(' ');
  return [...words].slice(0, 400).join('');
}

function dedupe(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    const key = r.url.replace(/#.*$/, '').replace(/\/$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/* ---------------- interpretação das respostas ---------------- */

interface BraveItem {
  title?: unknown;
  url?: unknown;
  description?: unknown;
  extra_snippets?: unknown;
  age?: unknown;
  page_age?: unknown;
  meta_url?: { hostname?: unknown };
  profile?: { name?: unknown; long_name?: unknown };
}

function braveItem(r: BraveItem): SearchResult | null {
  if (!isHttpUrl(r.url)) return null;
  let snippet = stripTags(r.description);
  if (Array.isArray(r.extra_snippets) && r.extra_snippets.length) {
    const extra = stripTags(r.extra_snippets[0]);
    if (extra && !snippet.includes(extra)) snippet = snippet ? `${snippet} … ${extra}` : extra;
  }
  const date = normalizeDate(r.page_age) ?? normalizeDate(r.age);
  const host = typeof r.meta_url?.hostname === 'string' ? r.meta_url.hostname.replace(/^www\./, '') : hostOf(r.url);
  return { title: stripTags(r.title) || host, url: r.url, snippet, ...(date ? { date } : {}), ...(host ? { source: host } : {}) };
}

/** Resposta da Brave (web: { web: { results }, news?: { results } }; notícias: { results }). */
export function parseBraveResponse(json: unknown, kind: 'web' | 'news' = 'web'): SearchResult[] {
  const j = (json ?? {}) as { results?: unknown; web?: { results?: unknown }; news?: { results?: unknown } };
  const pick = (v: unknown): BraveItem[] => (Array.isArray(v) ? (v as BraveItem[]) : []);
  const items = kind === 'news' ? pick(j.results) : [...pick(j.web?.results), ...(pick(j.web?.results).length ? [] : pick(j.news?.results))];
  return dedupe(items.map(braveItem).filter((x): x is SearchResult => x !== null));
}

/** Resposta da Tavily: { results: [{ title, url, content, published_date? }] }. */
export function parseTavilyResponse(json: unknown): SearchResult[] {
  const j = (json ?? {}) as { results?: unknown };
  const items = Array.isArray(j.results) ? (j.results as { title?: unknown; url?: unknown; content?: unknown; published_date?: unknown }[]) : [];
  return dedupe(
    items
      .filter((r) => isHttpUrl(r.url))
      .map((r) => {
        const url = r.url as string;
        const date = normalizeDate(r.published_date);
        const host = hostOf(url);
        return { title: stripTags(r.title) || host, url, snippet: stripTags(r.content).slice(0, 600), ...(date ? { date } : {}), ...(host ? { source: host } : {}) };
      }),
  );
}

/** Resposta do SearXNG (format=json): { results: [{ title, url, content, publishedDate }] }. */
export function parseSearxngResponse(json: unknown): SearchResult[] {
  const j = (json ?? {}) as { results?: unknown };
  const items = Array.isArray(j.results) ? (j.results as { title?: unknown; url?: unknown; content?: unknown; publishedDate?: unknown; pubdate?: unknown }[]) : [];
  return dedupe(
    items
      .filter((r) => isHttpUrl(r.url))
      .map((r) => {
        const url = r.url as string;
        const date = normalizeDate(r.publishedDate) ?? normalizeDate(r.pubdate);
        const host = hostOf(url);
        return { title: stripTags(r.title) || host, url, snippet: stripTags(r.content).slice(0, 600), ...(date ? { date } : {}), ...(host ? { source: host } : {}) };
      }),
  );
}

/* ---------------- provedores ---------------- */

async function readJson(res: Response, provider: string): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SearchError(`${provider} devolveu uma resposta que não é JSON.`, provider, res.status);
  }
}

function httpError(provider: string, status: number): SearchError {
  const why =
    status === 401 || status === 403
      ? 'chave inválida ou sem permissão'
      : status === 422 || status === 400
        ? 'pedido recusado (parâmetros)'
        : status === 429
          ? 'limite de uso atingido (muitas pesquisas)'
          : status >= 500
            ? 'serviço fora do ar'
            : `erro HTTP ${status}`;
  return new SearchError(`${provider}: ${why}.`, provider, status);
}

function wrapNetworkError(provider: string, err: unknown, signal?: AbortSignal): SearchError {
  if (err instanceof SearchError) return err;
  const e = err as Error;
  if (signal?.aborted && !(signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError')) {
    return new SearchError('pesquisa cancelada.', provider);
  }
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return new SearchError(`${provider}: demorou demais para responder.`, provider);
  return new SearchError(`${provider}: falha de conexão (${e?.message ?? String(err)}).`, provider);
}

const BRAVE_FRESHNESS = { dia: 'pd', semana: 'pw', mes: 'pm', ano: 'py' } as const;
const TIME_RANGE = { dia: 'day', semana: 'week', mes: 'month', ano: 'year' } as const;

export interface ProviderDeps {
  fetch?: FetchLike;
  baseUrl?: string;
}

export class BraveSearch implements SearchProvider {
  readonly id = 'brave' as const;
  readonly label = 'Brave Search';
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    deps: ProviderDeps = {},
  ) {
    this.fetchImpl = deps.fetch ?? ((i, init) => globalThis.fetch(i, init));
    this.baseUrl = deps.baseUrl ?? 'https://api.search.brave.com';
  }

  /** URL do pedido (exposta para testes). */
  buildUrl(query: string, opts: SearchOptions = {}): URL {
    const kind = opts.kind ?? 'web';
    const u = new URL(kind === 'news' ? '/res/v1/news/search' : '/res/v1/web/search', this.baseUrl);
    const max = kind === 'news' ? 50 : 20;
    u.searchParams.set('q', clampQuery(query));
    u.searchParams.set('count', String(Math.max(1, Math.min(max, opts.count ?? 6))));
    u.searchParams.set('country', 'BR');
    u.searchParams.set('search_lang', 'pt-br');
    u.searchParams.set('ui_lang', 'pt-BR');
    u.searchParams.set('safesearch', opts.safeSearch === false ? 'off' : 'moderate');
    if (opts.freshness) u.searchParams.set('freshness', BRAVE_FRESHNESS[opts.freshness]);
    return u;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const signal = withTimeout(opts.signal, opts.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchImpl(this.buildUrl(query, opts), {
        method: 'GET',
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey },
        signal,
      });
      if (!res.ok) throw httpError(this.label, res.status);
      const json = await readJson(res, this.label);
      return { provider: this.label, results: parseBraveResponse(json, opts.kind ?? 'web').slice(0, opts.count ?? 6) };
    } catch (err) {
      throw wrapNetworkError(this.label, err, opts.signal);
    }
  }
}

export class TavilySearch implements SearchProvider {
  readonly id = 'tavily' as const;
  readonly label = 'Tavily';
  private readonly fetchImpl: FetchLike;
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    deps: ProviderDeps = {},
  ) {
    this.fetchImpl = deps.fetch ?? ((i, init) => globalThis.fetch(i, init));
    this.baseUrl = deps.baseUrl ?? 'https://api.tavily.com';
  }

  /** Corpo do pedido (exposto para testes). */
  buildBody(query: string, opts: SearchOptions = {}): Record<string, unknown> {
    const topic = opts.kind === 'news' ? 'news' : 'general';
    return {
      query: clampQuery(query),
      search_depth: 'basic',
      topic,
      max_results: Math.max(1, Math.min(20, opts.count ?? 6)),
      include_answer: false,
      include_raw_content: false,
      include_images: false,
      ...(opts.freshness ? { time_range: TIME_RANGE[opts.freshness] } : {}),
      ...(topic === 'general' ? { country: 'brazil' } : {}),
    };
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const signal = withTimeout(opts.signal, opts.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchImpl(new URL('/search', this.baseUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(this.buildBody(query, opts)),
        signal,
      });
      if (!res.ok) throw httpError(this.label, res.status);
      const json = await readJson(res, this.label);
      return { provider: this.label, results: parseTavilyResponse(json).slice(0, opts.count ?? 6) };
    } catch (err) {
      throw wrapNetworkError(this.label, err, opts.signal);
    }
  }
}

export class SearxngSearch implements SearchProvider {
  readonly id = 'searxng' as const;
  readonly label = 'SearXNG';
  private readonly fetchImpl: FetchLike;

  constructor(
    private readonly baseUrl: string,
    deps: ProviderDeps = {},
  ) {
    this.fetchImpl = deps.fetch ?? ((i, init) => globalThis.fetch(i, init));
  }

  buildUrl(query: string, opts: SearchOptions = {}): URL {
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : this.baseUrl + '/';
    const u = new URL('search', base);
    u.searchParams.set('q', clampQuery(query));
    u.searchParams.set('format', 'json');
    u.searchParams.set('language', 'pt-BR');
    u.searchParams.set('safesearch', opts.safeSearch === false ? '0' : '1');
    u.searchParams.set('categories', opts.kind === 'news' ? 'news' : 'general');
    if (opts.freshness) u.searchParams.set('time_range', TIME_RANGE[opts.freshness]);
    return u;
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const signal = withTimeout(opts.signal, opts.timeoutMs ?? 10_000);
    try {
      const res = await this.fetchImpl(this.buildUrl(query, opts), { method: 'GET', headers: { Accept: 'application/json' }, signal });
      if (res.status === 403) throw new SearchError('SearXNG: o formato JSON está desativado na instância (ative "json" em search.formats).', this.label, 403);
      if (!res.ok) throw httpError(this.label, res.status);
      const json = await readJson(res, this.label);
      return { provider: this.label, results: parseSearxngResponse(json).slice(0, opts.count ?? 6) };
    } catch (err) {
      throw wrapNetworkError(this.label, err, opts.signal);
    }
  }
}

/**
 * Reserva automática: tenta cada provedor em ordem; passa para o próximo em
 * erro, limite de uso (429), demora acima de 4 s ou zero resultados.
 */
export class FallbackSearch implements SearchProvider {
  readonly id = 'fallback' as const;
  readonly label: string;

  constructor(
    readonly providers: SearchProvider[],
    private readonly fastTimeoutMs = 4000,
  ) {
    if (!providers.length) throw new Error('FallbackSearch precisa de ao menos um provedor');
    this.label = providers.map((p) => p.label).join(' → ');
  }

  async search(query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
    const failed: { provider: string; reason: string }[] = [];
    for (let i = 0; i < this.providers.length; i++) {
      const p = this.providers[i]!;
      const last = i === this.providers.length - 1;
      if (opts.signal?.aborted) throw new SearchError('pesquisa cancelada.', p.label);
      try {
        const r = await p.search(query, { ...opts, timeoutMs: last ? (opts.timeoutMs ?? 10_000) : this.fastTimeoutMs });
        if (r.results.length === 0 && !last) {
          failed.push({ provider: p.label, reason: 'nenhum resultado' });
          continue;
        }
        return { ...r, ...(failed.length ? { failed } : {}) };
      } catch (err) {
        if (opts.signal?.aborted) throw err;
        failed.push({ provider: p.label, reason: err instanceof Error ? err.message : String(err) });
        if (last) {
          throw new SearchError(`Nenhum serviço de pesquisa respondeu: ${failed.map((f) => f.reason).join(' | ')}`, this.label);
        }
      }
    }
    return { provider: this.label, results: [], failed };
  }
}

/* ---------------- escolha do modo ---------------- */

export interface SearchSecrets {
  brave?: string;
  tavily?: string;
}

export interface SearchMode {
  /** Cliente de pesquisa do próprio 300 (null = nenhum disponível). */
  client: SearchProvider | null;
  /** Usar a pesquisa nativa do Claude (serverTools.webSearch) em vez de um cliente próprio. */
  useNativeClaude: boolean;
}

export interface ResolveSearchDeps {
  fetch?: FetchLike;
  braveBaseUrl?: string;
  tavilyBaseUrl?: string;
}

function validSearxUrl(u: string | undefined): string | null {
  if (!u || !u.trim()) return null;
  try {
    const p = new URL(u.trim());
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : null;
  } catch {
    return null;
  }
}

/**
 * Decide como pesquisar:
 * - 'auto': Brave (com Tavily e SearXNG de reserva) se houver chave; senão Tavily;
 *   senão a pesquisa nativa do Claude quando o cérebro é a Anthropic; senão SearXNG; senão nada.
 * - escolha explícita: usada se estiver configurada; senão cai no modo automático.
 */
export function resolveSearchMode(settings: Settings, secrets: SearchSecrets, brainProvider: string, deps: ResolveSearchDeps = {}): SearchMode {
  const s = settings.search;
  const choice = s?.provider ?? 'auto';
  const nativeOk = brainProvider === 'anthropic' && settings.brain?.useServerWebTools !== false;
  const brave = secrets.brave?.trim() ? new BraveSearch(secrets.brave.trim(), { ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.braveBaseUrl ? { baseUrl: deps.braveBaseUrl } : {}) }) : null;
  const tavily = secrets.tavily?.trim() ? new TavilySearch(secrets.tavily.trim(), { ...(deps.fetch ? { fetch: deps.fetch } : {}), ...(deps.tavilyBaseUrl ? { baseUrl: deps.tavilyBaseUrl } : {}) }) : null;
  const searxUrl = validSearxUrl(s?.searxngUrl);
  const searx = searxUrl ? new SearxngSearch(searxUrl, deps.fetch ? { fetch: deps.fetch } : {}) : null;

  const chain = (...ps: (SearchProvider | null)[]): SearchProvider | null => {
    const list = ps.filter((p): p is SearchProvider => p !== null);
    if (!list.length) return null;
    return list.length === 1 ? list[0]! : new FallbackSearch(list);
  };
  const auto = (): SearchMode => {
    if (brave || tavily) return { client: chain(brave, tavily, searx), useNativeClaude: false };
    if (nativeOk) return { client: null, useNativeClaude: true };
    if (searx) return { client: searx, useNativeClaude: false };
    return { client: null, useNativeClaude: false };
  };

  switch (choice) {
    case 'brave':
      return brave ? { client: chain(brave, tavily, searx), useNativeClaude: false } : auto();
    case 'tavily':
      return tavily ? { client: chain(tavily, brave, searx), useNativeClaude: false } : auto();
    case 'searxng':
      return searx ? { client: searx, useNativeClaude: false } : auto();
    case 'anthropic':
      return nativeOk ? { client: null, useNativeClaude: true } : auto();
    default:
      return auto();
  }
}
