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
      if (end < 0) {
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

function findBracketEnd(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
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
      text = text.replace(/ +$/, '');
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
        const close = findCloser(src, delim, i + delim.length);
        if (close > i + delim.length) {
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
      const end = findBracketEnd(src, i);
      if (end > i && src[end + 1] === '(') {
        const closeParen = findLinkDestEnd(src, end + 2);
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

function findLinkDestEnd(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const ch = src[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '\n') return -1;
    if (ch === '(') depth++;
    else if (ch === ')') {
      if (depth === 0) return i;
      depth--;
    }
  }
  return -1;
}

/* ----------------------------------------------------------------------
 * Blocos
 * -------------------------------------------------------------------- */

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const HEADING_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const HR_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE_RE = /^ {0,3}> ?(.*)$/;
const LIST_RE = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const TABLE_SEP_RE = /^ *\|? *:?-{1,}:? *(\| *:?-{1,}:? *)*\|? *$/;

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
  if (!TABLE_SEP_RE.test(sep) || !sep.includes('-')) return false;
  const cols = splitRow(head).length;
  return cols >= 1 && splitRow(sep).length === cols;
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]!;
  if (FENCE_RE.test(line) || HR_RE.test(line) || QUOTE_RE.test(line)) return true;
  const h = HEADING_RE.exec(line);
  if (h && h[2] !== undefined) return true;
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
    const fence = FENCE_RE.exec(line);
    if (fence) {
      const marker = fence[1]!;
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
      blocks.push({ t: 'code', lang: (fence[2] ?? '').slice(0, 32), v: body.join('\n'), open: !closed });
      i = closed ? j + 1 : j;
      continue;
    }

    // título
    const h = HEADING_RE.exec(line);
    if (h) {
      blocks.push({ t: 'h', level: h[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, c: parseInline((h[2] ?? '').trim(), depth) });
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
      cur.push('');
      prevBlank = true;
      i++;
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
