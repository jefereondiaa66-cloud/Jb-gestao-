/**
 * Divide a resposta do 300 (que chega aos pedaços) em frases para a voz.
 *
 * - O primeiro trecho sai cedo: na primeira vírgula/pausa depois de ~40
 *   caracteres, ou no fim da primeira frase. Assim a voz começa logo.
 * - Depois, um trecho por frase (. ! ? … ; e quebras de linha).
 * - Não quebra em abreviações (Sr., Dra., etc.), decimais (3,5 / 1.000),
 *   endereços da web, siglas com pontos.
 * - Limpa o texto para fala: tira markdown e emojis, troca links por "link",
 *   não lê blocos de código.
 * - Nenhum trecho passa do limite de caracteres (corta numa vírgula ou espaço).
 */

export interface ChunkerOptions {
  /** Caracteres mínimos antes de aceitar uma vírgula como pausa no 1º trecho. */
  firstMinChars?: number;
  /** Tamanho máximo de um trecho (padrão 240). */
  maxChars?: number;
  /** Tamanho mínimo para quebrar em ";" ou ":" (padrão 20). */
  minClauseChars?: number;
}

const ABBREVIATIONS = new Set([
  'sr', 'sra', 'srs', 'sras', 'srta', 'dr', 'dra', 'drs', 'dras', 'prof', 'profa', 'profs', 'eng', 'enga', 'arq', 'adv', 'av', 'rod',
  'pça', 'pç', 'nº', 'núm', 'tel', 'cel', 'obs', 'ex', 'pp', 'pg', 'pág', 'pag', 'cap', 'vol', 'art', 'arts', 'inc', 'fig', 'séc', 'jr',
  'ltda', 'cia', 'etc', 'aprox', 'máx', 'mín', 'min', 'seg', 'vs', 'sto', 'sta', 'gen', 'sgt', 'cmte', 'exmo', 'exma', 'ilmo', 'ilma',
  'tb', 'tbm', 'depto', 'dept', 'univ', 'aux', 'cód', 'cit', 'ibid', 'fl', 'fls', 'jan', 'fev', 'abr', 'jun', 'jul', 'ago', 'nov',
]);

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>()\[\]"']+/giu;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/gu;

/** Limpa um trecho para ser falado. */
export function cleanForSpeech(text: string): string {
  let t = text;
  // blocos de código: não são lidos
  t = t.replace(/```[\s\S]*?```/g, ' (o código está na tela) ');
  t = t.replace(/```[\s\S]*$/g, ' ');
  // imagens e links markdown
  t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  t = t.replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, '$1');
  // links soltos e e-mails
  t = t.replace(URL_RE, (m) => (/[.,;:!?]$/.test(m) ? 'link' + m.slice(-1) : 'link'));
  t = t.replace(EMAIL_RE, 'endereço de e-mail');
  // HTML
  t = t.replace(/<\/?[a-z][^>]*>/gi, ' ');
  // código em linha: mantém o conteúdo
  t = t.replace(/`([^`]*)`/g, '$1');
  // títulos, citações, marcadores de lista e réguas
  t = t.replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
  t = t.replace(/^[ \t]*>[ \t]?/gm, '');
  t = t.replace(/^[ \t]*[-*+•][ \t]+/gm, '');
  t = t.replace(/^[ \t]*(\d{1,3})[.)][ \t]+/gm, '$1, ');
  t = t.replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, ' ');
  // tabelas
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, ' ');
  t = t.replace(/[ \t]*\|[ \t]*/g, ', ');
  // ênfase: **x**, __x__, *x*, _x_, ~~x~~
  t = t.replace(/(\*\*|__)(.+?)\1/g, '$2');
  t = t.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2');
  t = t.replace(/~~(.+?)~~/g, '$1');
  t = t.replace(/[*_~]{2,}/g, '');
  // emojis e símbolos gráficos
  t = t.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu, '');
  // setas e marcadores comuns
  t = t.replace(/\s*(?:->|=>|→|⇒)\s*/g, ', ');
  // espaços
  t = t.replace(/\s+/g, ' ').trim();
  // vírgulas repetidas criadas pelas trocas acima
  t = t.replace(/(?:\s*,\s*){2,}/g, ', ').replace(/^,\s*/, '').replace(/\s+([,.;:!?])/g, '$1');
  return t;
}

/** O ponto em text[i] termina uma frase? (i aponta para ".") */
function periodEndsSentence(text: string, i: number): boolean {
  const before = text.slice(0, i);
  const wordMatch = before.match(/([\p{L}\p{N}ºª]+)$/u);
  const word = wordMatch ? wordMatch[1]! : '';
  if (!word) return true;
  const lower = word.toLowerCase();
  // marcador de lista no começo da linha ("1. Primeiro")
  if (/(?:^|\n)[ \t]*\d{1,3}$/.test(before)) return false;
  // número seguido de ponto no fim da frase ("custa 300. Depois") é fim de frase
  if (/^\d+$/.test(word)) return true;
  // sigla com pontos (E.U.A., p.ex.)
  if (/(?:^|[\s(])(?:\p{L}\.)+\p{L}{1,3}$/u.test(before) && word.length <= 3) return false;
  // inicial de nome ("J. Silva")
  if (/^\p{Lu}$/u.test(word)) return false;
  if (ABBREVIATIONS.has(lower)) {
    // "etc." costuma fechar frases: só quebra se a próxima palavra começar com maiúscula.
    if (lower === 'etc') {
      const after = text.slice(i + 1).trimStart();
      return /^[\p{Lu}"“(]/u.test(after);
    }
    return false;
  }
  return true;
}

interface Boundary {
  /** Índice logo depois do fim do trecho. */
  end: number;
  kind: 'sentence' | 'clause' | 'comma' | 'newline';
}

/** Procura a primeira fronteira de frase confirmada (precisa de espaço depois). */
function findBoundary(text: string, from: number, final: boolean, opts: Required<ChunkerOptions>, first: boolean): Boundary | null {
  let inCodeFence = false;
  let fenceStart = -1;
  let urlEnd = -1;
  for (let i = from; i < text.length; i++) {
    if (text.startsWith('```', i)) {
      inCodeFence = !inCodeFence;
      if (inCodeFence) fenceStart = i;
      i += 2;
      continue;
    }
    if (inCodeFence) continue;
    // pula URLs inteiras (pontos dentro delas não são fim de frase)
    if (i > urlEnd && (text.startsWith('http://', i) || text.startsWith('https://', i) || text.startsWith('www.', i))) {
      const m = /^[^\s<>()"']+/.exec(text.slice(i));
      if (m) {
        // pontuação final da URL ainda pode fechar a frase
        let len = m[0].length;
        while (len > 0 && /[.,;:!?]/.test(m[0][len - 1]!)) len--;
        urlEnd = i + len - 1;
        i = urlEnd;
        continue;
      }
    }
    const ch = text[i]!;
    const next = text[i + 1];
    const hasSpaceAfter = next === undefined ? final : /\s/.test(next);
    if (ch === '\n') {
      if (text.slice(from, i).trim().length > 0) return { end: i + 1, kind: 'newline' };
      continue;
    }
    if (ch === '.' || ch === '!' || ch === '?' || ch === '…') {
      // reticências e "?!": consome a sequência
      let j = i;
      while (j + 1 < text.length && /[.!?…]/.test(text[j + 1]!)) j++;
      // aspas/parênteses de fechamento depois da pontuação
      let k = j;
      while (k + 1 < text.length && /["'”’)\]»]/.test(text[k + 1]!)) k++;
      const after = text[k + 1];
      const spaced = after === undefined ? final : /\s/.test(after);
      if (!spaced) {
        if (after === undefined) return null; // ainda não dá para saber
        i = k;
        continue;
      }
      if (ch === '.' && j === i && !periodEndsSentence(text, i)) {
        i = k;
        continue;
      }
      return { end: k + 1, kind: 'sentence' };
    }
    if ((ch === ';' || ch === ':') && hasSpaceAfter) {
      if (text.slice(from, i).trim().length >= opts.minClauseChars) return { end: i + 1, kind: 'clause' };
      continue;
    }
    if (first && (ch === ',' || ch === '—' || ch === '–') && hasSpaceAfter) {
      // vírgula decimal ("3,5") não tem espaço depois, então não chega aqui
      if (text.slice(from, i).trim().length >= opts.firstMinChars) return { end: i + 1, kind: 'comma' };
    }
  }
  if (inCodeFence && fenceStart >= 0) return null;
  return null;
}

/** Corta um texto longo demais numa pausa natural antes do limite. */
function splitLong(text: string, maxChars: number): [string, string] {
  if (text.length <= maxChars) return [text, ''];
  const window = text.slice(0, maxChars);
  const cut = Math.max(window.lastIndexOf(', '), window.lastIndexOf('; '), window.lastIndexOf(': '), window.lastIndexOf(' — '));
  let at = cut > maxChars * 0.4 ? cut + 1 : window.lastIndexOf(' ');
  if (at < maxChars * 0.3) at = maxChars; // palavra enorme: corta no limite
  return [text.slice(0, at).trim(), text.slice(at).trimStart()];
}

export class SentenceChunker {
  private buf = '';
  private emitted = 0;
  private readonly opts: Required<ChunkerOptions>;

  constructor(opts: ChunkerOptions = {}) {
    this.opts = {
      firstMinChars: opts.firstMinChars ?? 40,
      maxChars: Math.max(40, opts.maxChars ?? 240),
      minClauseChars: opts.minClauseChars ?? 20,
    };
  }

  /** Recebe mais texto e devolve os trechos já prontos para falar. */
  push(delta: string): string[] {
    if (delta) this.buf += delta;
    return this.drain(false);
  }

  /** Fim da resposta: devolve o que sobrou. */
  flush(): string[] {
    const out = this.drain(true);
    const rest = this.buf;
    this.buf = '';
    if (rest.trim()) {
      const tail = this.finalize(rest);
      this.emitted += tail.length;
      out.push(...tail);
    }
    return out;
  }

  /** Quantos trechos já foram entregues. */
  get count(): number {
    return this.emitted;
  }

  reset(): void {
    this.buf = '';
    this.emitted = 0;
  }

  private drain(final: boolean): string[] {
    const out: string[] = [];
    for (;;) {
      const b = findBoundary(this.buf, 0, final, this.opts, this.emitted === 0 && out.length === 0);
      if (!b) {
        // sem fronteira: se passou do limite (e não está dentro de código), corta numa pausa
        if (this.buf.length > this.opts.maxChars * 1.5 && !this.insideOpenFence()) {
          const [head, tail] = splitLong(this.buf, this.opts.maxChars);
          this.buf = tail;
          out.push(...this.finalize(head));
          continue;
        }
        break;
      }
      const piece = this.buf.slice(0, b.end);
      this.buf = this.buf.slice(b.end);
      out.push(...this.finalize(piece));
    }
    this.emitted += out.length;
    return out;
  }

  private insideOpenFence(): boolean {
    return (this.buf.match(/```/g)?.length ?? 0) % 2 === 1;
  }

  private finalize(raw: string): string[] {
    let clean = cleanForSpeech(raw);
    if (!clean || !/[\p{L}\p{N}]/u.test(clean)) return [];
    const out: string[] = [];
    while (clean.length > this.opts.maxChars) {
      const [head, tail] = splitLong(clean, this.opts.maxChars);
      if (head) out.push(head);
      clean = tail;
    }
    if (clean) out.push(clean);
    return out;
  }
}

/** Divide um texto completo (sem streaming) em trechos para a voz. */
export function chunkText(text: string, opts?: ChunkerOptions): string[] {
  const c = new SentenceChunker(opts);
  return [...c.push(text), ...c.flush()];
}
