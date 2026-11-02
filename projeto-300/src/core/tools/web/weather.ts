/**
 * Previsão do tempo pela Open-Meteo (gratuita, sem chave): geocodificação do
 * nome da cidade e previsão atual + diária, com texto em português.
 * Dados: Open-Meteo.com (CC BY 4.0).
 */
import { z } from 'zod';
import type { ToolDefinition } from '../../types';
import { errorMessage, errorOutput, fold, preview, textOutput, withTimeout } from '../files/util';
import type { FetchLike } from './search';

export interface WeatherDeps {
  fetch?: FetchLike;
  geocodingUrl?: string;
  forecastUrl?: string;
}

export const WMO_CODES: Record<number, string> = {
  0: 'céu limpo',
  1: 'predominantemente limpo',
  2: 'parcialmente nublado',
  3: 'nublado',
  45: 'nevoeiro',
  48: 'nevoeiro com geada',
  51: 'garoa fraca',
  53: 'garoa moderada',
  55: 'garoa forte',
  56: 'garoa congelante fraca',
  57: 'garoa congelante forte',
  61: 'chuva fraca',
  63: 'chuva moderada',
  65: 'chuva forte',
  66: 'chuva congelante fraca',
  67: 'chuva congelante forte',
  71: 'neve fraca',
  73: 'neve moderada',
  75: 'neve forte',
  77: 'grãos de neve',
  80: 'pancadas de chuva fracas',
  81: 'pancadas de chuva moderadas',
  82: 'pancadas de chuva fortes',
  85: 'pancadas de neve fracas',
  86: 'pancadas de neve fortes',
  95: 'trovoadas',
  96: 'trovoadas com granizo fraco',
  99: 'trovoadas com granizo forte',
};

export function describeWeatherCode(code: unknown): string {
  const n = typeof code === 'number' ? code : Number(code);
  return WMO_CODES[n] ?? 'condição desconhecida';
}

export interface GeoPlace {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  countryCode?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
}

/** Só letras, números e pontuação simples (nomes vêm de fora). */
function cleanName(s: unknown): string {
  return String(s ?? '')
    .replace(/[^\p{L}\p{N}\s.,'()-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function parseGeocoding(json: unknown): GeoPlace[] {
  const j = (json ?? {}) as { results?: unknown };
  if (!Array.isArray(j.results)) return [];
  return (j.results as Record<string, unknown>[])
    .filter((r) => typeof r.latitude === 'number' && typeof r.longitude === 'number')
    .map((r) => ({
      name: cleanName(r.name),
      latitude: r.latitude as number,
      longitude: r.longitude as number,
      ...(r.country ? { country: cleanName(r.country) } : {}),
      ...(typeof r.country_code === 'string' ? { countryCode: r.country_code.toUpperCase().slice(0, 2) } : {}),
      ...(r.admin1 ? { admin1: cleanName(r.admin1) } : {}),
      ...(typeof r.timezone === 'string' ? { timezone: r.timezone } : {}),
      ...(typeof r.population === 'number' ? { population: r.population } : {}),
    }));
}

/** "Lisboa, Portugal" -> nome "Lisboa" e dica "portugal" (estado/país). */
export function splitPlaceQuery(q: string): { name: string; hint: string } {
  const parts = q.split(/[,–-]/).map((p) => p.trim()).filter(Boolean);
  return { name: parts[0] ?? q.trim(), hint: fold(parts.slice(1).join(' ')) };
}

const UF: Record<string, string> = {
  ac: 'acre', al: 'alagoas', ap: 'amapa', am: 'amazonas', ba: 'bahia', ce: 'ceara', df: 'distrito federal', es: 'espirito santo', go: 'goias',
  ma: 'maranhao', mt: 'mato grosso', ms: 'mato grosso do sul', mg: 'minas gerais', pa: 'para', pb: 'paraiba', pr: 'parana', pe: 'pernambuco',
  pi: 'piaui', rj: 'rio de janeiro', rn: 'rio grande do norte', rs: 'rio grande do sul', ro: 'rondonia', rr: 'roraima', sc: 'santa catarina',
  sp: 'sao paulo', se: 'sergipe', to: 'tocantins',
};

/** Escolhe o lugar: respeita a dica (estado/país); sem dica, prefere o Brasil. */
export function pickPlace(places: GeoPlace[], hint: string): GeoPlace | undefined {
  if (!places.length) return undefined;
  if (hint) {
    const h = UF[hint] ?? hint;
    const m = places.find((p) => [p.admin1, p.country, p.countryCode].some((x) => x && (fold(x) === h || fold(x).includes(h) || h.includes(fold(x)))));
    if (m) return m;
  }
  return places.find((p) => p.countryCode === 'BR') ?? places[0];
}

export interface ForecastDay {
  date: string;
  code: number;
  max: number;
  min: number;
  rainProb?: number;
  rainSum?: number;
}

export interface Forecast {
  current?: { temp: number; feels?: number; humidity?: number; wind?: number; code: number; precipitation?: number };
  days: ForecastDay[];
}

export function parseForecast(json: unknown): Forecast {
  const j = (json ?? {}) as { current?: Record<string, unknown>; daily?: Record<string, unknown[]> };
  const c = j.current;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const out: Forecast = { days: [] };
  if (c && num(c.temperature_2m) !== undefined) {
    out.current = {
      temp: num(c.temperature_2m)!,
      code: num(c.weather_code) ?? -1,
      ...(num(c.apparent_temperature) !== undefined ? { feels: num(c.apparent_temperature)! } : {}),
      ...(num(c.relative_humidity_2m) !== undefined ? { humidity: num(c.relative_humidity_2m)! } : {}),
      ...(num(c.wind_speed_10m) !== undefined ? { wind: num(c.wind_speed_10m)! } : {}),
      ...(num(c.precipitation) !== undefined ? { precipitation: num(c.precipitation)! } : {}),
    };
  }
  const d = j.daily ?? {};
  const dates = Array.isArray(d.time) ? d.time : [];
  for (let i = 0; i < dates.length; i++) {
    const max = num(d.temperature_2m_max?.[i]);
    const min = num(d.temperature_2m_min?.[i]);
    if (typeof dates[i] !== 'string' || max === undefined || min === undefined) continue;
    const rp = num(d.precipitation_probability_max?.[i]);
    const rs = num(d.precipitation_sum?.[i]);
    out.days.push({ date: dates[i] as string, code: num(d.weather_code?.[i]) ?? -1, max, min, ...(rp !== undefined ? { rainProb: rp } : {}), ...(rs !== undefined ? { rainSum: rs } : {}) });
  }
  return out;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function fmt(n: number, digits = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function formatForecast(place: GeoPlace, f: Forecast, today = new Date()): string {
  const where = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
  const lines = [`Previsão do tempo para ${where}:`];
  if (f.current) {
    const c = f.current;
    const parts = [`${fmt(c.temp)} °C`];
    if (c.feels !== undefined) parts.push(`sensação de ${fmt(c.feels)} °C`);
    parts.push(describeWeatherCode(c.code));
    if (c.humidity !== undefined) parts.push(`umidade ${fmt(c.humidity)}%`);
    if (c.wind !== undefined) parts.push(`vento ${fmt(c.wind)} km/h`);
    lines.push(`Agora: ${parts.join(', ')}.`);
  }
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (const d of f.days) {
    const [y, m, dd] = d.date.split('-').map(Number) as [number, number, number];
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
    const label = d.date === todayIso ? 'Hoje' : wd ? wd[0]!.toUpperCase() + wd.slice(1) : d.date;
    const rain = d.rainProb !== undefined ? `, chance de chuva ${fmt(d.rainProb)}%${d.rainSum ? ` (${fmt(d.rainSum, 1)} mm)` : ''}` : '';
    lines.push(`${label} (${String(dd).padStart(2, '0')}/${String(m).padStart(2, '0')}): mínima ${fmt(d.min)} °C, máxima ${fmt(d.max)} °C, ${describeWeatherCode(d.code)}${rain}.`);
  }
  lines.push('', 'Dados: Open-Meteo.com (CC BY 4.0).');
  return lines.join('\n');
}

const schema = z.object({
  cidade: z.string().min(2).max(120).describe('Cidade, opcionalmente com estado ou país: "Campinas", "Santa Maria, RS", "Lisboa, Portugal".'),
  dias: z.number().int().min(1).max(7).optional().describe('Quantos dias de previsão (padrão 3).'),
});

export function weatherTool(deps: WeatherDeps = {}): ToolDefinition<z.infer<typeof schema>> {
  const fetchImpl: FetchLike = deps.fetch ?? ((i, init) => globalThis.fetch(i, init));
  const geoBase = deps.geocodingUrl ?? 'https://geocoding-api.open-meteo.com/v1/search';
  const fcBase = deps.forecastUrl ?? 'https://api.open-meteo.com/v1/forecast';

  async function getJson(url: URL, signal: AbortSignal): Promise<unknown> {
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: withTimeout(signal, 10_000) });
    if (!res.ok) throw new Error(`serviço de clima respondeu ${res.status}`);
    return (await res.json()) as unknown;
  }

  return {
    name: 'weather_forecast',
    title: 'Previsão do tempo',
    description: 'Previsão do tempo atual e dos próximos dias para uma cidade (Open-Meteo, sem custo). Prefira esta ferramenta a pesquisar clima na web.',
    inputSchema: schema,
    risk: 'read',
    describe: (i) => `Consultar a previsão do tempo para ${preview(i.cidade, 80)}`,
    async execute(input, ctx) {
      try {
        const { name, hint } = splitPlaceQuery(input.cidade);
        const g = new URL(geoBase);
        g.searchParams.set('name', name);
        g.searchParams.set('count', '10');
        g.searchParams.set('language', 'pt');
        g.searchParams.set('format', 'json');
        const place = pickPlace(parseGeocoding(await getJson(g, ctx.signal)), hint);
        if (!place) return errorOutput(`Não encontrei a cidade "${input.cidade}". Confira o nome (pode incluir o estado, ex.: "Santa Maria, RS").`);
        const f = new URL(fcBase);
        f.searchParams.set('latitude', String(place.latitude));
        f.searchParams.set('longitude', String(place.longitude));
        f.searchParams.set('current', 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m');
        f.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum');
        f.searchParams.set('timezone', 'auto');
        f.searchParams.set('forecast_days', String(input.dias ?? 3));
        const forecast = parseForecast(await getJson(f, ctx.signal));
        if (!forecast.current && !forecast.days.length) return errorOutput('O serviço de clima não devolveu dados para esse lugar.');
        return textOutput(formatForecast(place, forecast), `Previsão para ${place.name}`, { untrusted: { source: 'Open-Meteo' } });
      } catch (err) {
        if (ctx.signal.aborted) return errorOutput('Consulta cancelada.');
        return errorOutput(`Não consegui consultar a previsão do tempo: ${errorMessage(err)}`);
      }
    },
  };
}
