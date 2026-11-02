/**
 * Markdown simplificado e seguro para as respostas do 300.
 *
 * Gera uma árvore (AST) que a interface transforma em elementos React.
 * Nunca produz HTML cru: todo texto vira nó de texto (escapado pelo React).
 * Links só são aceitos para http, https e mailto.
 *
 * Suporta: parágrafos (quebra de linha simples vira <br>), títulos, negrito,
 * itálico, tachado, código em linha, blocos de código (inclusive incompletos
 * durante a transmissão), listas (com aninhamento), citações, linha horizontal,
 * tabelas simples e links / endereços soltos.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'del'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[] }
  | { t: 'br' };

export type Align = 'left' | 'center' | 'right' | null;

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: 1 | 2 | 3 | 4 | 5 | 6; c: Inline[] }
  | { t: 'code'; lang: string; v: string; open: boolean }
  | { t: 'list'; ordered: boolean; start: number; items: Block[][] }
  | { t: 'quote'; c: Block[] }
  | { t: 'hr' }
  | { t: 'table'; align: Align[]; head: Inline[][]; rows: Inline[][][] };

const MAX_DEPTH = 8;
const MAX_INPUT = 400_000;
/** Maior texto de link aceito ("[texto](...)"). */
const MAX_LABEL = 1000;
/** Maior endereço de link procurado ("(...)"); safeHref recusa acima de 4096. */
const MAX_DEST = 2048;

/* ----------------------------------------------------------------------
 * Links
 * -------------------------------------------------------------------- */

/** Devolve o endereço normalizado se for seguro abrir (http/https/mailto), senão null. */
export function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (!url || url.length > 4096) return null;
  // Caracteres de controle ou espaços são recusados (evita truques de esquema).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s]/.test(url)) return null;
  if (!/^(https?:\/\/|mailto:)/i.test(url)) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'mailto:') return null;
    if ((u.protocol === 'http:' || u.protocol === 'https:') && !u.hostname) return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------
 * Inline
 * -------------------------------------------------------------------- */

const PUNCT = /[!-/:-@[-`{-~]/;
const isSpace = (ch: string | undefined): boolean => ch === undefined || /\s/.test(ch);
const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

function pushText(out: Inline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.t === 'text') last.v += text;
  else out.push({ t: 'text', v: text });
}

/** Procura o fechamento de um delimitador de ênfase a partir de `from`. */
function findCloser(src: string, delim: string, from: number): number {
  let i = from;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      // pula código em linha
      let n = 1;
      while (src[i + n] === '`') n++;
      const end = src.indexOf('`'.repeat(n), i + n);
      if (end < 0 || src[end + n] === '`') {
        i += n;
        continue;
      }
      i = end + n;
      continue;
    }
    if (src.startsWith(delim, i)) {
      const before = src[i - 1];
      const after = src[i + delim.length];
      if (!isSpace(before)) {
        // para "_" exige que o fechamento não esteja colado em letra (snake_case)
        if (delim[0] === '_' && isWordChar(after)) {
          i += delim.length;
          continue;
        }
        // "*" isolado não fecha se for parte de "**"
        if (delim === '*' && src[i + 1] === '*') {
          i += 2;
          continue;
        }
        return i;
      }
    }
    i++;
  }
  return -1;
}

/**
 * Casa todos os colchetes de uma vez (pilha), em tempo linear.
 * match[i] = posição do "]" que fecha o "[" em i, ou -1.
 */
function matchBrackets(src: string): Int32Array {
  const match = new Int32Array(src.length).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '[') stack.push(i);
    else if (ch === ']' && stack.length) match[stack.pop()!] = i;
  }
  return match;
}

const AUTOLINK = /^(?:https?:\/\/|www\.)[^\s<>"'`]+/i;

function trimAutolink(url: string): string {
  // tira pontuação final e parênteses desbalanceados
  let u = url;
  for (;;) {
    const last = u[u.length - 1];
    if (!last) break;
    if (/[.,;:!?*_~'"]/.test(last)) {
      u = u.slice(0, -1);
      continue;
    }
    if (last === ')') {
      const open = (u.match(/\(/g) ?? []).length;
      const close = (u.match(/\)/g) ?? []).length;
      if (close > open) {
        u = u.slice(0, -1);
        continue;
      }
    }
    break;
  }
  return u;
}

export function parseInline(src: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  if (depth > MAX_DEPTH) {
    pushText(out, src);
    return out;
  }
  let i = 0;
  let text = '';
  const flush = () => {
    pushText(out, text);
    text = '';
  };
  // Delimitador -> posição a partir da qual já se sabe que não há fechamento.
  // Sem isso, cada "*" sem par varreria o resto do texto (custo quadrático,
  // e o texto em transmissão é reprocessado a cada pedaço que chega).
  const noCloser = new Map<string, number>();
  let brackets: Int32Array | null = null;
  let noDestBefore = -1;

  while (i < src.length) {
    const ch = src[i]!;

    // escape
    if (ch === '\\' && i + 1 < src.length && PUNCT.test(src[i + 1]!)) {
      text += src[i + 1];
      i += 2;
      continue;
    }

    // quebra de linha
    if (ch === '\n') {
      text = trimEndSpaces(text);
      flush();
      out.push({ t: 'br' });
      i++;
      while (src[i] === ' ') i++;
      continue;
    }

    // código em linha
    if (ch === '`') {
      let n = 1;
      while (src[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      const end = src.indexOf(fence, i + n);
      if (end >= 0 && src[end + n] !== '`') {
        let code = src.slice(i + n, end).replace(/\n/g, ' ');
        if (code.length > 1 && code.startsWith(' ') && code.endsWith(' ') && code.trim()) code = code.slice(1, -1);
        flush();
        out.push({ t: 'code', v: code });
        i = end + n;
        continue;
      }
      text += fence;
      i += n;
      continue;
    }

    // negrito / itálico / tachado
    if (ch === '*' || ch === '_' || ch === '~') {
      const double = src[i + 1] === ch;
      const prev = src[i - 1];
      if (ch === '~' && !double) {
        text += ch;
        i++;
        continue;
      }
      const delim = double ? ch + ch : ch;
      const next = src[i + delim.length];
      const opens = !isSpace(next) && !(ch === '_' && isWordChar(prev));
      if (opens) {
        const from = i + delim.length;
        const known = noCloser.get(delim);
        const close = known !== undefined && from >= known ? -1 : findCloser(src, delim, from);
        if (close < 0 && (known === undefined || from < known)) noCloser.set(delim, from);
        if (close > from) {
          flush();
          const inner = parseInline(src.slice(i + delim.length, close), depth + 1);
          if (ch === '~') out.push({ t: 'del', c: inner });
          else if (double) out.push({ t: 'strong', c: inner });
          else out.push({ t: 'em', c: inner });
          i = close + delim.length;
          continue;
        }
      }
      text += delim;
      i += delim.length;
      continue;
    }

    // [texto](endereço)
    if (ch === '[') {
      brackets ??= matchBrackets(src);
      const end = brackets[i]!;
      if (end > i && end - i <= MAX_LABEL && src[end + 1] === '(' && end + 2 >= noDestBefore) {
        const found = findLinkDestEnd(src, end + 2);
        if (found.cleanUntil >= 0) noDestBefore = found.cleanUntil;
        const closeParen = found.end;
        if (closeParen > 0) {
          const inside = src.slice(end + 2, closeParen).trim();
          const dest = inside.replace(/\s+("[^"]*"|'[^']*')$/, '').replace(/^<(.*)>$/, '$1');
          const label = src.slice(i + 1, end);
          const href = safeHref(dest);
          flush();
          if (href) out.push({ t: 'link', href, c: parseInline(label, depth + 1) });
          else for (const n of parseInline(label, depth + 1)) out.push(n);
          i = closeParen + 1;
          continue;
        }
      }
      text += ch;
      i++;
      continue;
    }

    // <https://...>
    if (ch === '<') {
      const m = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i));
      if (m) {
        const href = safeHref(m[1]!);
        if (href) {
          flush();
          out.push({ t: 'link', href, c: [{ t: 'text', v: m[1]! }] });
          i += m[0].length;
          continue;
        }
      }
      text += ch;
      i++;
      continue;
    }

    // endereço solto
    if ((ch === 'h' || ch === 'w' || ch === 'H' || ch === 'W') && !isWordChar(src[i - 1])) {
      const m = AUTOLINK.exec(src.slice(i));
      if (m) {
        const raw = trimAutolink(m[0]);
        const href = safeHref(/^www\./i.test(raw) ? 'https://' + raw : raw);
        if (href && raw.length > 4) {
          flush();
          out.push({ t: 'link', href, c: [{ t: 'text', v: raw }] });
          i += raw.length;
          continue;
        }
      }
    }

    text += ch;
    i++;
  }
  flush();
  return out;
}

/**
 * Fim do destino "(...)" de um link (end = -1 quando não há).
 * Na falha, cleanUntil diz até onde o trecho não tem ")" nem escapes: qualquer
 * busca que comece antes disso também falha (evita repetir a varredura).
 */
function findLinkDestEnd(src: string, from: number): { end: number; cleanUntil: number } {
  let depth = 0;
  let clean = true;
  const limit = Math.min(src.length, from + MAX_DEST);
  for (let i = from; i < limit; i++) {
    const ch = src[i];
    if (ch === '\\') {
      clean = false;
      i++;
      continue;
    }
    if (ch === '\n') return { end: -1, cleanUntil: clean ? i : -1 };
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return { end: i, cleanUntil: -1 };
      depth--;
      clean = false;
    }
  }
  // parou no limite (não no fim do texto): uma busca posterior pode ir mais longe
  return { end: -1, cleanUntil: clean && limit === src.length ? limit : -1 };
}

/* ----------------------------------------------------------------------
 * Blocos
 * -------------------------------------------------------------------- */

// Expressões sem retrocesso explosivo: as partes variáveis (título, info da
// cerca, separador de tabela) são tratadas em código, em tempo linear.
const FENCE_START_RE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING_START_RE = /^ {0,3}(#{1,6})(?=[ \t]|$)/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}> ?(.*)$/;
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const TABLE_CELL_SEP_RE = /^:?-+:?$/;

/** Tira espaços do fim (sem expressão regular: / +$/ é quadrática em sequências longas). */
function trimEndSpaces(s: string): string {
  let end = s.length;
  while (end > 0 && s.charCodeAt(end - 1) === 32) end--;
  return end === s.length ? s : s.slice(0, end);
}

/** Abertura de bloco de código: marcador e linguagem, ou null. */
function parseFence(line: string): { marker: string; lang: string } | null {
  const m = FENCE_START_RE.exec(line);
  if (!m) return null;
  const info = line.slice(m[0].length);
  if (info.includes('`')) return null;
  const t = info.trim();
  const sp = t.search(/\s/);
  return { marker: m[1]!, lang: (sp < 0 ? t : t.slice(0, sp)).slice(0, 32) };
}

/** Título "# texto #": nível, texto e se há algo depois dos "#" (só assim interrompe parágrafo). */
function parseHeading(line: string): { level: 1 | 2 | 3 | 4 | 5 | 6; text: string; hasText: boolean } | null {
  const m = HEADING_START_RE.exec(line);
  if (!m) return null;
  let rest = line.slice(m[0].length).trim();
  // sequência final de "#" só é removida quando separada por espaço (ou sozinha)
  let j = rest.length;
  while (j > 0 && rest[j - 1] === '#') j--;
  if (j < rest.length && (j === 0 || rest[j - 1] === ' ')) rest = rest.slice(0, j).trim();
  return { level: m[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, text: rest, hasText: m[0].length < line.length };
}

/** Linha separadora de tabela: |:---|---:| */
function isTableSep(line: string): boolean {
  let s = line.trim();
  if (!s.includes('-')) return false;
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').every((c) => TABLE_CELL_SEP_RE.test(c.trim()));
}

const leadingSpaces = (line: string): number => line.length - line.replace(/^ +/, '').length;
const isBlank = (line: string | undefined): boolean => line === undefined || line.trim() === '';

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '`') inCode = !inCode;
    if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function isTableStart(lines: string[], i: number): boolean {
  const head = lines[i];
  const sep = lines[i + 1];
  if (!head || !sep || !head.includes('|')) return false;
  if (!isTableSep(sep)) return false;
  const cols = splitRow(head).length;
  return cols >= 1 && splitRow(sep).length === cols;
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]!;
  if (parseFence(line) || HR_RE.test(line) || QUOTE_RE.test(line)) return true;
  if (parseHeading(line)?.hasText) return true;
  const l = LIST_RE.exec(line);
  if (l && l[3] !== undefined && leadingSpaces(line) <= 3) {
    // lista numerada só interrompe parágrafo se começar em 1
    if (/^\d/.test(l[2]!)) return parseInt(l[2]!, 10) === 1;
    return true;
  }
  return isTableStart(lines, i);
}

export function parseMarkdown(src: string): Block[] {
  const text = (src.length > MAX_INPUT ? src.slice(0, MAX_INPUT) : src).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
  return parseBlocks(text.split('\n'), 0);
}

function parseBlocks(lines: string[], depth: number): Block[] {
  const blocks: Block[] = [];
  if (depth > MAX_DEPTH) {
    const joined = lines.join('\n').trim();
    if (joined) blocks.push({ t: 'p', c: [{ t: 'text', v: joined }] });
    return blocks;
  }
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }

    // bloco de código
    const fence = parseFence(line);
    if (fence) {
      const marker = fence.marker;
      const indent = leadingSpaces(line);
      const body: string[] = [];
      let j = i + 1;
      let closed = false;
      for (; j < lines.length; j++) {
        const l = lines[j]!;
        const trimmed = l.trim();
        if (trimmed.startsWith(marker[0]!.repeat(marker.length)) && /^(`+|~+)$/.test(trimmed) && trimmed[0] === marker[0]) {
          closed = true;
          break;
        }
        body.push(indent > 0 ? l.replace(new RegExp(`^ {0,${indent}}`), '') : l);
      }
      blocks.push({ t: 'code', lang: fence.lang, v: body.join('\n'), open: !closed });
      i = closed ? j + 1 : j;
      continue;
    }

    // título
    const h = parseHeading(line);
    if (h) {
      blocks.push({ t: 'h', level: h.level, c: parseInline(h.text, depth) });
      i++;
      continue;
    }

    // linha horizontal
    if (HR_RE.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }

    // citação
    if (QUOTE_RE.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && !isBlank(lines[i])) {
        const q = QUOTE_RE.exec(lines[i]!);
        if (q) inner.push(q[1]!);
        else if (inner.length && !startsBlock(lines, i)) inner.push(lines[i]!); // continuação preguiçosa
        else break;
        i++;
      }
      blocks.push({ t: 'quote', c: parseBlocks(inner, depth + 1) });
      continue;
    }

    // lista
    const lm = LIST_RE.exec(line);
    if (lm && leadingSpaces(line) <= 3 && lm[3] !== undefined) {
      const res = parseList(lines, i, depth);
      blocks.push(res.block);
      i = res.next;
      continue;
    }

    // tabela
    if (isTableStart(lines, i)) {
      const head = splitRow(line);
      const align: Align[] = splitRow(lines[i + 1]!).map((c) => {
        const l = c.startsWith(':');
        const r = c.endsWith(':');
        return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
      });
      const rows: Inline[][][] = [];
      let j = i + 2;
      while (j < lines.length && !isBlank(lines[j]) && lines[j]!.includes('|')) {
        const cells = splitRow(lines[j]!);
        const row: Inline[][] = [];
        for (let c = 0; c < head.length; c++) row.push(parseInline(cells[c] ?? '', depth));
        rows.push(row);
        j++;
      }
      blocks.push({ t: 'table', align, head: head.map((c) => parseInline(c, depth)), rows });
      i = j;
      continue;
    }

    // parágrafo
    const para: string[] = [line.trim()];
    i++;
    while (i < lines.length && !isBlank(lines[i]) && !startsBlock(lines, i)) {
      para.push(lines[i]!.trim());
      i++;
    }
    blocks.push({ t: 'p', c: parseInline(para.join('\n'), depth) });
  }
  return blocks;
}

function parseList(lines: string[], start: number, depth: number): { block: Block; next: number } {
  const first = LIST_RE.exec(lines[start]!)!;
  const baseIndent = first[1]!.length;
  const ordered = /^\d/.test(first[2]!);
  const startNum = ordered ? parseInt(first[2]!, 10) : 1;
  const items: string[][] = [];
  let cur: string[] = [];
  let contentIndent = 0;
  let i = start;
  let prevBlank = false;

  while (i < lines.length) {
    const line = lines[i]!;
    const m = LIST_RE.exec(line);
    const lead = leadingSpaces(line);
    const sameKind = m ? /^\d/.test(m[2]!) === ordered : false;

    if (m && lead <= baseIndent + 1 && lead >= baseIndent - 1 && m[3] !== undefined) {
      if (!sameKind) break; // outro tipo de lista: novo bloco
      if (items.length || cur.length) items.push(cur);
      cur = [m[3]!];
      contentIndent = lead + m[2]!.length + 1;
      prevBlank = false;
      i++;
      continue;
    }
    if (isBlank(line)) {
      // continua só se a próxima linha não vazia pertencer à lista
      let j = i + 1;
      while (j < lines.length && isBlank(lines[j])) j++;
      if (j >= lines.length) break;
      const nextLead = leadingSpaces(lines[j]!);
      const nm = LIST_RE.exec(lines[j]!);
      const continues = nextLead >= contentIndent || (nm && nextLead <= baseIndent + 1 && /^\d/.test(nm[2]!) === ordered);
      if (!continues) break;
      for (; i < j; i++) cur.push('');
      prevBlank = true;
      continue;
    }
    if (lead >= contentIndent || (m && lead > baseIndent)) {
      cur.push(line.slice(Math.min(lead, contentIndent)));
      prevBlank = false;
      i++;
      continue;
    }
    // continuação preguiçosa de parágrafo
    if (!prevBlank && !startsBlock(lines, i)) {
      cur.push(line.trim());
      i++;
      continue;
    }
    break;
  }
  items.push(cur);
  return {
    block: { t: 'list', ordered, start: startNum, items: items.map((it) => parseBlocks(it, depth + 1)) },
    next: i,
  };
}

/** Texto puro de uma árvore inline (para leitores de tela, títulos etc.). */
export function inlineText(nodes: Inline[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.t === 'text' || n.t === 'code') s += n.v;
    else if (n.t === 'br') s += '\n';
    else s += inlineText(n.c);
  }
  return s;
}
