/**
 * Ferramenta web_search e o "cache" de quais chaves de pesquisa existem
 * (o available() das ferramentas é síncrono e o cofre de segredos é assíncrono).
 */
import { z } from 'zod';
import { looksSensitive } from '../../memory/sensitive';
import { SECRET_NAMES, type EngineServices, type SecretStore, type ToolDefinition } from '../../types';
import { errorMessage, errorOutput, preview, textOutput } from '../files/util';
import { resolveSearchMode, type ResolveSearchDeps, type SearchResponse, type SearchResult } from './search';

/* ---------------- chaves conhecidas (para available) ---------------- */

interface KeyState {
  brave: boolean;
  tavily: boolean;
  at: number;
  pending?: Promise<void>;
}

const keyStates = new WeakMap<SecretStore, KeyState>();
const KEY_TTL_MS = 15_000;

async function refreshKeys(secrets: SecretStore): Promise<KeyState> {
  const [brave, tavily] = await Promise.all([secrets.has(SECRET_NAMES.brave).catch(() => false), secrets.has(SECRET_NAMES.tavily).catch(() => false)]);
  const st: KeyState = { brave, tavily, at: Date.now() };
  keyStates.set(secrets, st);
  return st;
}

/**
 * Atualiza o que se sabe sobre as chaves de pesquisa. O integrador chama na
 * partida e depois de salvar/apagar segredos, para o web_search aparecer na hora.
 */
export async function primeSearchKeys(services: Pick<EngineServices, 'secrets'>): Promise<{ brave: boolean; tavily: boolean }> {
  const st = await refreshKeys(services.secrets);
  return { brave: st.brave, tavily: st.tavily };
}

/** Situação conhecida das chaves (dispara atualização em segundo plano se estiver velha). */
export function knownSearchKeys(services: Pick<EngineServices, 'secrets'>): { brave: boolean; tavily: boolean } | null {
  const st = keyStates.get(services.secrets);
  if (!st || Date.now() - st.at > KEY_TTL_MS) {
    if (!st?.pending) {
      const pending = refreshKeys(services.secrets)
        .then(() => undefined)
        .catch(() => undefined);
      if (st) st.pending = pending;
      else keyStates.set(services.secrets, { brave: false, tavily: false, at: 0, pending });
    }
  }
  const cur = keyStates.get(services.secrets);
  return cur && cur.at > 0 ? { brave: cur.brave, tavily: cur.tavily } : null;
}

/** Existe um cliente de pesquisa próprio com a configuração e as chaves atuais? */
export function hasSearchClient(services: EngineServices): boolean {
  const keys = knownSearchKeys(services) ?? { brave: false, tavily: false };
  const settings = services.settings.get();
  const mode = resolveSearchMode(settings, { ...(keys.brave ? { brave: 'x' } : {}), ...(keys.tavily ? { tavily: 'x' } : {}) }, settings.brain?.provider ?? '');
  return mode.client !== null;
}

/* ---------------- formatação ---------------- */

export function formatResults(query: string, r: SearchResponse): string {
  const head = `Resultados da pesquisa "${query}" (fonte: ${r.provider}; ${r.results.length} ${r.results.length === 1 ? 'resultado' : 'resultados'}):`;
  const failed = r.failed?.length ? `\n(Reserva automática: ${r.failed.map((f) => `${f.provider} — ${f.reason}`).join('; ')})` : '';
  const items = r.results.map((x: SearchResult, i) => {
    const meta = [x.source ? `Site: ${x.source}` : '', x.date ? `Data: ${x.date}` : ''].filter(Boolean).join(' · ');
    return `[${i + 1}] ${x.title}\nURL: ${x.url}${meta ? `\n${meta}` : ''}${x.snippet ? `\nTrecho: ${x.snippet}` : ''}`;
  });
  const tail = '\nCite as fontes pelo número e pela URL. Para detalhes, leia a página com web_fetch.';
  return `${head}${failed}\n\n${items.join('\n\n')}\n${tail}`;
}

/* ---------------- ferramenta ---------------- */

const schema = z.object({
  consulta: z.string().min(1).max(400).describe('O que pesquisar (de preferência em português, específico, sem dados pessoais do dono).'),
  quantidade: z.number().int().min(1).max(20).optional().describe('Quantos resultados (padrão da configuração, normalmente 6).'),
  tipo: z.enum(['web', 'noticias']).optional().describe('"noticias" para notícias recentes; padrão "web".'),
  periodo: z.enum(['dia', 'semana', 'mes', 'ano']).optional().describe('Limitar a resultados recentes (último dia, semana, mês ou ano).'),
});
type Input = z.infer<typeof schema>;

export function webSearchTool(deps: ResolveSearchDeps = {}): ToolDefinition<Input> {
  return {
    name: 'web_search',
    title: 'Pesquisar na internet',
    description:
      'Pesquisa na internet (resultados do Brasil em português) e devolve títulos, URLs, trechos e datas. Use para fatos atuais, preços, notícias, ' +
      'horários, versões e qualquer coisa que possa ter mudado. Não coloque dados pessoais do dono na consulta. Os resultados são conteúdo externo.',
    inputSchema: schema,
    // Consulta com dados pessoais sai do computador: pede confirmação.
    risk: (i) => (looksSensitive(i.consulta) ? 'external' : 'read'),
    describe: (i) =>
      `Pesquisar na internet: "${preview(i.consulta, 120)}"${i.tipo === 'noticias' ? ' (notícias)' : ''}` +
      (looksSensitive(i.consulta) ? ' — atenção: a consulta parece conter dados pessoais e vai para o serviço de busca' : ''),
    available: (services) => hasSearchClient(services),
    async execute(input, ctx) {
      const services = ctx.services;
      const settings = services.settings.get();
      let brave: string | undefined;
      let tavily: string | undefined;
      try {
        [brave, tavily] = await Promise.all([services.secrets.get(SECRET_NAMES.brave), services.secrets.get(SECRET_NAMES.tavily)]);
      } catch (err) {
        return errorOutput(`Não consegui ler as chaves de pesquisa: ${errorMessage(err)}`);
      }
      const mode = resolveSearchMode(settings, { ...(brave ? { brave } : {}), ...(tavily ? { tavily } : {}) }, settings.brain?.provider ?? '', deps);
      if (!mode.client) {
        return errorOutput(
          'Nenhum serviço de pesquisa está configurado. O dono pode cadastrar a chave da Brave Search ou da Tavily em Configurações > Chaves' +
            (mode.useNativeClaude ? ' (por enquanto, a pesquisa nativa do Claude pode ser usada).' : '.'),
        );
      }
      try {
        const r = await mode.client.search(input.consulta, {
          count: input.quantidade ?? settings.search?.maxResults ?? 6,
          kind: input.tipo === 'noticias' ? 'news' : 'web',
          ...(input.periodo ? { freshness: input.periodo } : {}),
          safeSearch: settings.search?.safeSearch !== false,
          signal: ctx.signal,
        });
        if (!r.results.length) return textOutput(`Nenhum resultado para "${input.consulta}" (fonte: ${r.provider}). Tente outras palavras.`, 'Nenhum resultado');
        return textOutput(formatResults(input.consulta, r), `${r.results.length} resultados (${r.provider})`, { untrusted: { source: `pesquisa na web (${r.provider})` } });
      } catch (err) {
        if (ctx.signal.aborted) return errorOutput('Pesquisa cancelada.');
        return errorOutput(`A pesquisa falhou: ${errorMessage(err)}`);
      }
    },
  };
}
