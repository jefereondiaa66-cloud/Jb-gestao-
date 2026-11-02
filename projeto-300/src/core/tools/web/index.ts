/** Ferramentas de internet do 300: pesquisa, leitura de páginas e previsão do tempo. */
import type { SafeFetchOptions } from '../../security/net';
import type { ToolDefinition } from '../../types';
import { webFetchTool } from './fetch';
import type { FetchLike } from './search';
import { webSearchTool } from './search-tool';
import { weatherTool } from './weather';

export {
  BraveSearch,
  TavilySearch,
  SearxngSearch,
  FallbackSearch,
  SearchError,
  resolveSearchMode,
  parseBraveResponse,
  parseTavilyResponse,
  parseSearxngResponse,
  stripTags,
  decodeEntities,
} from './search';
export type { SearchProvider, SearchResult, SearchOptions, SearchResponse, SearchMode, SearchSecrets, FetchLike, ResolveSearchDeps } from './search';
export { primeSearchKeys, knownSearchKeys, hasSearchClient, formatResults, webSearchTool } from './search-tool';
export { webFetchTool, fetchDocument, quarantineRead, parseQuarantineAnswer, classifyContent, QUARANTINE_SYSTEM, DEFAULT_USER_AGENT } from './fetch';
export type { FetchedDocument, QuarantineAnswer, WebFetchToolOptions } from './fetch';
export { extractHtml, decodeBody, isHiddenStyle, tidyText, charsetFromContentType, sniffHtmlCharset } from './extract';
export type { ExtractedPage } from './extract';
export { weatherTool, parseGeocoding, parseForecast, formatForecast, pickPlace, splitPlaceQuery, describeWeatherCode } from './weather';
export { assessUrl, urlRisk } from './url-risk';

export interface WebToolsOptions {
  /** fetch para as APIs de pesquisa e clima (padrão: o global). */
  fetch?: FetchLike;
  braveBaseUrl?: string;
  tavilyBaseUrl?: string;
  /** Opções extras do safeFetch do web_fetch (ex.: { allowPrivate: true } SÓ em testes). */
  safeFetchOptions?: Partial<SafeFetchOptions>;
  userAgent?: string;
  openMeteo?: { geocodingUrl?: string; forecastUrl?: string };
}

export function webTools(opts: WebToolsOptions = {}): ToolDefinition[] {
  return [
    webSearchTool({
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.braveBaseUrl ? { braveBaseUrl: opts.braveBaseUrl } : {}),
      ...(opts.tavilyBaseUrl ? { tavilyBaseUrl: opts.tavilyBaseUrl } : {}),
    }),
    webFetchTool({ ...(opts.safeFetchOptions ? { safeFetchOptions: opts.safeFetchOptions } : {}), ...(opts.userAgent ? { userAgent: opts.userAgent } : {}) }),
    weatherTool({ ...(opts.fetch ? { fetch: opts.fetch } : {}), ...(opts.openMeteo ?? {}) }),
  ];
}
