/**
 * Leitor simples de markdown para gerar documentos: títulos, parágrafos,
 * listas (com níveis, numeradas ou não), negrito/itálico/código/links,
 * tabelas no estilo GitHub, citações, blocos de código e linhas divisórias.
 */

export interface Inline {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

export interface ListItem {
  level: number;
  ordered: boolean;
  inlines: Inline[];
}

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: Inline[] }
  | { type: 'paragraph'; inlines: Inline[] }
  | { type: 'list'; items: ListItem[] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][]; align: ('left' | 'center' | 'right')[] }
  | { type: 'code'; text: string }
  | { type: 'quote'; inlines: Inline[] }
  | { type: 'rule' };

/* ---------------- inline ---------------- */

const ESCAPES: Record<string, string> = { '*': '', _: '', '`': '', '[': '', ']': '', '|': '', '\\': '', '#': '', '(': '', ')': '' };
const UNESCAPE: Record<string, string> = Object.fromEntries(Object.entries(ESCAPES).map(([k, v]) => [v, k]));

function protect(s: string): string {
  return s.replace(/\\([*_`[\]|\\#()])/g, (_m, c: string) => ESCAPES[c] ?? c);
}

function restore(s: string): string {
  return s.replace(/[-]/g, (c) => UNESCAPE[c] ?? c);
}

interface InlineRule {
  re: RegExp;
  make: (m: RegExpExecArray, style: Omit<Inline, 'text'>) => Inline[];
}

const INLINE_RULES: InlineRule[] = [
  { re: /`([^`]+)`/, make: (m, st) => [{ ...st, text: m[1]!, code: true }] },
  { re: /\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/, make: (m, st) => parseInlineStyled(m[1]!, st).map((x) => ({ ...x, link: m[2]! })) },
  { re: /\*\*\*([^*]+?)\*\*\*/, make: (m, st) => parseInlineStyled(m[1]!, { ...st, bold: true, italic: true }) },
  { re: /\*\*(.+?)\*\*/, make: (m, st) => parseInlineStyled(m[1]!, { ...st, bold: true }) },
  { re: /(?<![\p{L}\p{N}_])__(.+?)__(?![\p{L}\p{N}_])/u, make: (m, st) => parseInlineStyled(m[1]!, { ...st, bold: true }) },
  { re: /\*(?!\s)([^*]+?)(?<!\s)\*/, make: (m, st) => parseInlineStyled(m[1]!, { ...st, italic: true }) },
  { re: /(?<![\p{L}\p{N}_])_(?!\s)([^_]+?)(?<!\s)_(?![\p{L}\p{N}_])/u, make: (m, st) => parseInlineStyled(m[1]!, { ...st, italic: true }) },
];

function parseInlineStyled(src: string, style: Omit<Inline, 'text'>): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    let best: { m: RegExpExecArray; rule: InlineRule } | null = null;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, rule };
    }
    if (!best) {
      out.push({ ...style, text: rest });
      break;
    }
    if (best.m.index > 0) out.push({ ...style, text: rest.slice(0, best.m.index) });
    out.push(...best.rule.make(best.m, style));
    rest = rest.slice(best.m.index + best.m[0].length);
  }
  return out;
}

/** Texto com marcações inline -> pedaços com estilo. */
export function parseInline(text: string): Inline[] {
  const parts = parseInlineStyled(protect(text), {});
  const merged: Inline[] = [];
  for (const p of parts) {
    const t = restore(p.text);
    if (!t) continue;
    const prev = merged[merged.length - 1];
    if (prev && !!prev.bold === !!p.bold && !!prev.italic === !!p.italic && !!prev.code === !!p.code && prev.link === p.link) prev.text += t;
    else merged.push({ ...p, text: t });
  }
  return merged;
}

export function inlineText(inlines: Inline[]): string {
  return inlines.map((i) => i.text).join('');
}

/* ---------------- blocos ---------------- */

const RE_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_LIST = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const RE_RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const RE_FENCE = /^\s*(```|~~~)/;
const RE_TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  let s = protect(line.trim());
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => restore(c.trim()));
}

function indentWidth(ws: string): number {
  let n = 0;
  for (const ch of ws) n += ch === '\t' ? 4 : 1;
  return n;
}

export function parseMarkdown(md: string): Block[] {
  const lines = String(md ?? '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flushPara = (): void => {
    if (!para.length) return;
    const text = para.map((l) => l.trim()).join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', inlines: parseInline(text) });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) {
      flushPara();
      continue;
    }
    if (RE_FENCE.test(line)) {
      flushPara();
      const fence = RE_FENCE.exec(line)![1]!;
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence)) code.push(lines[i++]!);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const h = RE_HEADING.exec(line);
    if (h) {
      flushPara();
      blocks.push({ type: 'heading', level: h[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, inlines: parseInline(h[2]!) });
      continue;
    }
    if (RE_RULE.test(line)) {
      flushPara();
      blocks.push({ type: 'rule' });
      continue;
    }
    if (line.includes('|') && i + 1 < lines.length && RE_TABLE_SEP.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      flushPara();
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left')) as ('left' | 'center' | 'right')[];
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) {
        rows.push(splitRow(lines[i]!).map((c) => parseInline(c)));
        i++;
      }
      i--;
      blocks.push({ type: 'table', header: header.map((c) => parseInline(c)), rows, align });
      continue;
    }
    if (/^\s{0,3}>/.test(line)) {
      flushPara();
      const q: string[] = [];
      while (i < lines.length && /^\s{0,3}>/.test(lines[i]!)) q.push(lines[i++]!.replace(/^\s{0,3}>\s?/, ''));
      i--;
      blocks.push({ type: 'quote', inlines: parseInline(q.join(' ').trim()) });
      continue;
    }
    const li = RE_LIST.exec(line);
    if (li) {
      flushPara();
      const raw: { level: number; ordered: boolean; text: string }[] = [];
      const baseIndent = indentWidth(li[1]!);
      while (i < lines.length) {
        const cur = lines[i]!;
        const m = RE_LIST.exec(cur);
        if (m && !RE_RULE.test(cur)) {
          const level = Math.max(0, Math.min(3, Math.floor((indentWidth(m[1]!) - baseIndent) / 2)));
          raw.push({ level, ordered: /\d/.test(m[2]!), text: m[3]!.trim() });
          i++;
          continue;
        }
        // Linha recuada logo após um item: continuação do texto do item.
        if (cur.trim() && /^\s{2,}/.test(cur) && raw.length) {
          raw[raw.length - 1]!.text += ' ' + cur.trim();
          i++;
          continue;
        }
        break;
      }
      i--;
      blocks.push({ type: 'list', items: raw.map((r) => ({ level: r.level, ordered: r.ordered, inlines: parseInline(r.text) })) });
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}
