/**
 * Geração de PDF com pdf-lib e fontes padrão (Helvetica/Courier, codificação
 * WinAnsi, que cobre os acentos do português). Faz quebra de linha, títulos,
 * listas, tabelas, citações, código e numeração "Página X de Y".
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Block, Inline } from './markdown';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 56;
const MARGIN_TOP = 60;
const MARGIN_BOTTOM = 64;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const BODY_SIZE = 11;
const HEADING_SIZES = [18, 15, 13, 12, 11, 11];
const GRAY = rgb(0.45, 0.45, 0.45);
const BLACK = rgb(0.1, 0.1, 0.1);
const LINK = rgb(0.05, 0.3, 0.65);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  boldItalic: PDFFont;
  mono: PDFFont;
}

interface Seg {
  text: string;
  font: PDFFont;
  size: number;
  color: ReturnType<typeof rgb>;
}

interface Line {
  segs: Seg[];
  width: number;
}

/* ---------------- WinAnsi ---------------- */

const REPLACEMENTS: Record<string, string> = {
  '→': '->', '←': '<-', '⇒': '=>', '⇐': '<=', '↔': '<->', '≥': '>=', '≤': '<=', '≠': '!=', '≈': '~', '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x',
  '★': '*', '☆': '*', '−': '-', '′': "'", '″': '"', '\t': '    ', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '﻿': '',
  '▪': '•', '◦': '-', '●': '•', '○': 'o', '■': '•', '□': '-', '✅': 'v', '❌': 'x', '⚠': '!',
};

/** Troca caracteres fora do WinAnsi por equivalentes (ou "?"), para o pdf-lib não falhar. */
export function makeWinAnsiSanitizer(font: PDFFont): (text: string) => string {
  const supported = new Set(font.getCharacterSet());
  return (text: string): string => {
    let out = '';
    for (const ch of String(text ?? '')) {
      const cp = ch.codePointAt(0)!;
      if (supported.has(cp)) {
        out += ch;
        continue;
      }
      if (ch in REPLACEMENTS) {
        out += REPLACEMENTS[ch];
        continue;
      }
      if (cp > 0xffff || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0xfe00 && cp <= 0xfe0f)) continue; // emojis e afins: omitidos
      if (cp < 32) {
        out += ' ';
        continue;
      }
      const base = ch.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      out += base && [...base].every((c) => supported.has(c.codePointAt(0)!)) ? base : '?';
    }
    return out;
  };
}

/* ---------------- layout ---------------- */

class PdfLayout {
  readonly pages: PDFPage[] = [];
  page!: PDFPage;
  y = 0;

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    readonly clean: (t: string) => string,
  ) {
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - MARGIN_TOP;
  }

  ensure(h: number): void {
    if (this.y - h < MARGIN_BOTTOM) this.newPage();
  }

  space(h: number): void {
    if (this.y - h < MARGIN_BOTTOM) this.newPage();
    else this.y -= h;
  }

  fontFor(i: { bold?: boolean; italic?: boolean; code?: boolean }, base: { bold?: boolean; italic?: boolean } = {}): PDFFont {
    if (i.code) return this.fonts.mono;
    const b = !!(i.bold || base.bold);
    const it = !!(i.italic || base.italic);
    return b && it ? this.fonts.boldItalic : b ? this.fonts.bold : it ? this.fonts.italic : this.fonts.regular;
  }

  segsFromInlines(inlines: Inline[], size: number, base: { bold?: boolean; italic?: boolean } = {}): Seg[] {
    const segs: Seg[] = [];
    for (const i of inlines) {
      const font = this.fontFor(i, base);
      const text = this.clean(i.text);
      if (text) segs.push({ text, font, size: i.code ? size - 1 : size, color: i.link ? LINK : BLACK });
      if (i.link && i.text.trim() !== i.link) segs.push({ text: this.clean(` (${i.link})`), font: this.fonts.regular, size: size - 1.5, color: GRAY });
    }
    return segs;
  }

  /** Quebra os pedaços em linhas que cabem na largura. */
  wrap(segs: Seg[], maxWidth: number): Line[] {
    const lines: Line[] = [];
    let cur: Line = { segs: [], width: 0 };
    const pushSeg = (s: Seg, w: number): void => {
      const last = cur.segs[cur.segs.length - 1];
      if (last && last.font === s.font && last.size === s.size && last.color === s.color) last.text += s.text;
      else cur.segs.push({ ...s });
      cur.width += w;
    };
    const breakLine = (): void => {
      // remove espaço no fim da linha
      const last = cur.segs[cur.segs.length - 1];
      if (last) {
        const trimmed = last.text.replace(/\s+$/, '');
        cur.width -= last.font.widthOfTextAtSize(last.text, last.size) - last.font.widthOfTextAtSize(trimmed, last.size);
        last.text = trimmed;
      }
      lines.push(cur);
      cur = { segs: [], width: 0 };
    };
    for (const s of segs) {
      for (const tok of s.text.split(/(\s+)/)) {
        if (!tok) continue;
        const isSpace = /^\s+$/.test(tok);
        if (isSpace && cur.segs.length === 0) continue;
        const t = isSpace ? ' ' : tok;
        const w = s.font.widthOfTextAtSize(t, s.size);
        if (!isSpace && cur.width + w > maxWidth && cur.segs.length) breakLine();
        if (!isSpace && w > maxWidth) {
          // palavra maior que a linha: corta por caracteres
          let chunk = '';
          for (const ch of t) {
            const cw = s.font.widthOfTextAtSize(chunk + ch, s.size);
            if (cur.width + cw > maxWidth && chunk) {
              pushSeg({ ...s, text: chunk }, s.font.widthOfTextAtSize(chunk, s.size));
              breakLine();
              chunk = ch;
            } else chunk += ch;
          }
          if (chunk) pushSeg({ ...s, text: chunk }, s.font.widthOfTextAtSize(chunk, s.size));
          continue;
        }
        pushSeg({ ...s, text: t }, w);
      }
    }
    if (cur.segs.length) breakLine();
    return lines;
  }

  drawLine(line: Line, x: number, baseline: number, page = this.page): void {
    let cx = x;
    for (const s of line.segs) {
      if (!s.text) continue;
      page.drawText(s.text, { x: cx, y: baseline, size: s.size, font: s.font, color: s.color });
      cx += s.font.widthOfTextAtSize(s.text, s.size);
    }
  }

  /** Escreve um parágrafo com recuo; quebra páginas quando precisa. */
  paragraph(segs: Seg[], opts: { indent?: number; size: number; after?: number; marker?: Seg; bar?: boolean }): void {
    const indent = opts.indent ?? 0;
    const lh = opts.size * 1.4;
    const lines = this.wrap(segs, CONTENT_W - indent);
    lines.forEach((line, idx) => {
      this.ensure(lh);
      const baseline = this.y - opts.size;
      if (idx === 0 && opts.marker) {
        const mw = opts.marker.font.widthOfTextAtSize(opts.marker.text, opts.marker.size);
        this.page.drawText(opts.marker.text, { x: MARGIN_X + indent - mw - 5, y: baseline, size: opts.marker.size, font: opts.marker.font, color: BLACK });
      }
      if (opts.bar) this.page.drawLine({ start: { x: MARGIN_X + indent - 9, y: this.y + 1 }, end: { x: MARGIN_X + indent - 9, y: this.y - lh + 1 }, thickness: 2, color: rgb(0.7, 0.7, 0.7) });
      this.drawLine(line, MARGIN_X + indent, baseline);
      this.y -= lh;
    });
    if (opts.after) this.space(opts.after);
  }
}

function tableBlock(L: PdfLayout, b: Extract<Block, { type: 'table' }>): void {
  const ncols = Math.max(b.header.length, ...b.rows.map((r) => r.length), 1);
  const colW = CONTENT_W / ncols;
  const size = ncols > 5 ? 8.5 : 9.5;
  const pad = 4;
  const lh = size * 1.3;
  const maxLines = Math.floor((PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - 2 * pad) / lh) - 2;
  const prep = (cells: Inline[][], header: boolean): { lines: Line[][]; h: number } => {
    const lines = Array.from({ length: ncols }, (_, c) => {
      const wrapped = L.wrap(L.segsFromInlines(cells[c] ?? [], size, header ? { bold: true } : {}), colW - 2 * pad);
      return wrapped.slice(0, maxLines);
    });
    const h = Math.max(1, ...lines.map((l) => l.length)) * lh + 2 * pad;
    return { lines, h };
  };
  const drawRow = (row: { lines: Line[][]; h: number }, header: boolean): void => {
    const top = L.y;
    if (header) L.page.drawRectangle({ x: MARGIN_X, y: top - row.h, width: CONTENT_W, height: row.h, color: rgb(0.85, 0.89, 0.95) });
    for (let c = 0; c < ncols; c++) {
      const x = MARGIN_X + c * colW;
      L.page.drawRectangle({ x, y: top - row.h, width: colW, height: row.h, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      row.lines[c]!.forEach((line, i) => {
        const align = b.align[c];
        const free = colW - 2 * pad - line.width;
        const dx = align === 'right' ? free : align === 'center' ? free / 2 : 0;
        L.drawLine(line, x + pad + Math.max(0, dx), top - pad - size - i * lh + 1.5);
      });
    }
    L.y -= row.h;
  };
  const header = prep(b.header, true);
  L.ensure(header.h + lh * 2);
  drawRow(header, true);
  for (const r of b.rows) {
    const row = prep(r, false);
    if (L.y - row.h < MARGIN_BOTTOM) {
      L.newPage();
      drawRow(header, true); // repete o cabeçalho na nova página
    }
    drawRow(row, false);
  }
  L.space(10);
}

function codeBlock(L: PdfLayout, text: string): void {
  const size = 9;
  const lh = size * 1.35;
  const font = L.fonts.mono;
  const charW = font.widthOfTextAtSize('M', size);
  const perLine = Math.max(10, Math.floor((CONTENT_W - 12) / charW));
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const clean = L.clean(raw);
    if (!clean) lines.push('');
    for (let i = 0; i < clean.length; i += perLine) lines.push(clean.slice(i, i + perLine));
  }
  for (const line of lines) {
    L.ensure(lh);
    L.page.drawRectangle({ x: MARGIN_X, y: L.y - lh, width: CONTENT_W, height: lh, color: rgb(0.95, 0.95, 0.95) });
    if (line) L.page.drawText(line, { x: MARGIN_X + 6, y: L.y - size - 1, size, font, color: BLACK });
    L.y -= lh;
  }
  L.space(8);
}

export interface PdfMeta {
  author?: string;
  subject?: string;
}

export async function buildPdf(title: string, blocks: Block[], meta: PdfMeta = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
  const clean = makeWinAnsiSanitizer(fonts.regular);
  const L = new PdfLayout(doc, fonts, clean);

  if (title.trim()) {
    L.paragraph([{ text: clean(title.trim()), font: fonts.bold, size: 20, color: BLACK }], { size: 20, after: 4 });
    L.page.drawLine({ start: { x: MARGIN_X, y: L.y }, end: { x: PAGE_W - MARGIN_X, y: L.y }, thickness: 1, color: rgb(0.12, 0.31, 0.47) });
    L.space(14);
  }

  for (const b of blocks) {
    switch (b.type) {
      case 'heading': {
        const size = HEADING_SIZES[b.level - 1] ?? BODY_SIZE;
        L.space(size * 0.6);
        L.ensure(size * 1.4 + BODY_SIZE * 2.8); // título não fica sozinho no fim da página
        L.paragraph(L.segsFromInlines(b.inlines, size, { bold: true }), { size, after: 4 });
        break;
      }
      case 'paragraph':
        L.paragraph(L.segsFromInlines(b.inlines, BODY_SIZE), { size: BODY_SIZE, after: 6 });
        break;
      case 'list': {
        const counters = [0, 0, 0, 0];
        for (const it of b.items) {
          counters[it.level] = (counters[it.level] ?? 0) + 1;
          for (let k = it.level + 1; k < counters.length; k++) counters[k] = 0;
          const marker = it.ordered ? `${it.level % 2 === 0 ? counters[it.level] : String.fromCharCode(96 + Math.min(26, counters[it.level]!))}.` : it.level === 0 ? '•' : '-';
          L.paragraph(L.segsFromInlines(it.inlines, BODY_SIZE), {
            size: BODY_SIZE,
            indent: 18 * (it.level + 1),
            marker: { text: marker, font: fonts.regular, size: BODY_SIZE, color: BLACK },
            after: 2,
          });
        }
        L.space(5);
        break;
      }
      case 'table':
        tableBlock(L, b);
        break;
      case 'code':
        codeBlock(L, b.text);
        break;
      case 'quote':
        L.paragraph(L.segsFromInlines(b.inlines, BODY_SIZE, { italic: true }), { size: BODY_SIZE, indent: 18, bar: true, after: 6 });
        break;
      case 'rule':
        L.space(6);
        L.page.drawLine({ start: { x: MARGIN_X, y: L.y }, end: { x: PAGE_W - MARGIN_X, y: L.y }, thickness: 0.6, color: rgb(0.65, 0.65, 0.65) });
        L.space(10);
        break;
    }
  }

  const total = L.pages.length;
  L.pages.forEach((p, i) => {
    const label = `Página ${i + 1} de ${total}`;
    const w = fonts.regular.widthOfTextAtSize(label, 9);
    p.drawText(label, { x: (PAGE_W - w) / 2, y: 30, size: 9, font: fonts.regular, color: GRAY });
  });

  const t = clean(title.trim());
  if (t) doc.setTitle(t);
  doc.setAuthor(meta.author ?? '300');
  doc.setCreator('300 — assistente pessoal');
  doc.setProducer('300 (pdf-lib)');
  doc.setLanguage('pt-BR');
  if (meta.subject) doc.setSubject(meta.subject);
  doc.setCreationDate(new Date());
  doc.setModificationDate(new Date());
  return doc.save();
}
