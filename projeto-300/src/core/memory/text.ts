/**
 * Utilidades de texto para a busca: normalização, termos, consulta FTS5
 * segura e similaridade simples (para evitar memórias duplicadas).
 */
import { stripInvisible } from '../security/untrusted';

/** Palavras muito comuns (português e um pouco de inglês) que não ajudam na busca. */
const STOPWORDS = new Set(
  (
    'a o e os as um uma uns umas de do da dos das em no na nos nas ao aos à às pelo pela pelos pelas por para pra pro pras pros ' +
    'com sem que qual quais quem como onde quando porque se ou mas nem ja já nao não sim eh é ser era foi sao são esta está estao estão ' +
    'isso isto aquilo esse essa este aquele aquela eu tu voce você ele ela nos nós vos eles elas me te lhe lhes meu minha meus minhas ' +
    'teu tua seu sua seus suas nosso nossa mais menos muito muita bem tambem também la lá aqui ai aí so só sobre entre ate até ' +
    'the of to and or is are was in on at for with a an it this that'
  )
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => foldText(w)),
);

/**
 * Palavras comuns que mudam o sentido da frase ("café sem açúcar" x "café com
 * açúcar", "não gosta"). Ficam de fora da busca, mas CONTAM ao comparar duas
 * memórias: senão uma contradição pareceria duplicata.
 */
const POLARITY = new Set(
  ['nao', 'nem', 'nunca', 'jamais', 'sem', 'com', 'mais', 'menos', 'muito', 'muita', 'not', 'never', 'without', 'with'].map((w) => foldText(w)),
);

const TERM_RE = /[\p{L}\p{N}\p{M}]+/gu;
const MAX_TERMS = 24;
const MAX_TERM_LEN = 64;

/** Minúsculas, sem acentos, NFC. Usado para comparar termos ("pão" == "pao"). */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

/** Limpa texto que será guardado: tira caracteres invisíveis, normaliza (NFC) e apara. */
export function cleanText(text: string): string {
  return stripInvisible(String(text ?? ''))
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/** Todos os termos (letras/números), sem acentos e sem repetição, na ordem em que aparecem. */
function uniqueTerms(text: string): string[] {
  const raw = cleanText(text).match(TERM_RE) ?? [];
  const seen = new Set<string>();
  const all: string[] = [];
  for (const r of raw) {
    const t = foldText(r).slice(0, MAX_TERM_LEN);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    all.push(t);
  }
  return all;
}

/** Termos de busca (letras/números), já sem acentos e sem repetição. */
export function searchTerms(text: string, opts: { dropStopwords?: boolean } = {}): string[] {
  const all = uniqueTerms(text);
  if (opts.dropStopwords === false) return all.slice(0, MAX_TERMS);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  // Se só sobrou palavra comum, usa o que tiver (ex.: busca por "ela").
  return (meaningful.length ? meaningful : all).slice(0, MAX_TERMS);
}

/**
 * Monta uma consulta FTS5 segura a partir de texto livre do usuário/modelo.
 * Cada termo vira uma cadeia entre aspas (operadores como OR, NEAR, *, ^, :
 * e parênteses perdem o efeito). Termos com 3+ letras usam prefixo ("pao"*).
 * Retorna null se não houver termo útil.
 */
export function buildFtsQuery(text: string, opts: { mode?: 'and' | 'or'; prefix?: boolean } = {}): string | null {
  const terms = searchTerms(text);
  if (!terms.length) return null;
  const prefix = opts.prefix ?? true;
  const parts = terms.map((t) => {
    const quoted = `"${t.replace(/"/g, '""')}"`;
    return prefix && [...t].length >= 3 ? `${quoted}*` : quoted;
  });
  return parts.join(opts.mode === 'and' ? ' AND ' : ' OR ');
}

/** Termos para comparar memórias: sem palavras comuns, mas com as que mudam o sentido (não, sem, com...). */
function similarityTerms(text: string): Set<string> {
  const all = uniqueTerms(text);
  const kept = all.filter((t) => !STOPWORDS.has(t) || POLARITY.has(t));
  return new Set(kept.length ? kept : all);
}

/** Similaridade entre dois textos (0..1) por conjunto de termos, mais a cobertura do primeiro pelo segundo. */
export function textSimilarity(a: string, b: string): { jaccard: number; containsA: number } {
  const ta = similarityTerms(a);
  const tb = similarityTerms(b);
  if (!ta.size || !tb.size) return { jaccard: 0, containsA: 0 };
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return { jaccard: union ? inter / union : 0, containsA: inter / ta.size };
}

/** Corta texto longo sem quebrar no meio de um caractere composto. */
export function truncate(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max - 1)).join('') + '…';
}
