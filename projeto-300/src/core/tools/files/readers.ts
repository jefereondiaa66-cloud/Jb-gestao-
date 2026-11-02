/**
 * Leitura do conteúdo de arquivos para o modelo: texto (com detecção de
 * codificação), Word (.docx via mammoth), PDF (unpdf), planilhas (.xlsx via
 * exceljs e .csv), e imagens (devolvidas como imagem para a visão do modelo).
 */
import type { ImageMediaType } from '../../types';
import { extensionOf } from './guard';

/* ---------------- texto ---------------- */

/** Decodifica bytes de texto: BOM UTF-8/UTF-16, UTF-8 válido, senão Windows-1252 (arquivos antigos do Windows). */
export function decodeText(buf: Uint8Array): { text: string; encoding: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), encoding: 'utf-8 (BOM)' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be' };
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(buf), encoding: 'windows-1252' };
  }
}

/** Parece binário? (bytes nulos ou muitos caracteres de controle no começo) */
export function looksBinary(buf: Uint8Array): boolean {
  const n = Math.min(buf.length, 8192);
  if (n === 0) return false;
  if (n >= 2 && ((buf[0] === 0xff && buf[1] === 0xfe) || (buf[0] === 0xfe && buf[1] === 0xff))) return false; // UTF-16 com BOM
  let ctrl = 0;
  for (let i = 0; i < n; i++) {
    const c = buf[i]!;
    if (c === 0) return true;
    if (c < 9 || (c > 13 && c < 32)) ctrl++;
  }
  return ctrl / n > 0.1;
}

export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt', '.md', '.markdown', '.tsv', '.json', '.jsonl', '.ndjson', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts',
  '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.sql', '.yaml', '.yml', '.toml',
  '.ini', '.cfg', '.conf', '.log', '.bat', '.cmd', '.ps1', '.sh', '.srt', '.vtt', '.rtf', '.tex', '.bib', '.properties', '.vue',
  '.svelte', '.kt', '.swift', '.lua', '.r', '.m', '.pl', '.env', '.gitignore', '.editorconfig', '.svg', '.ics', '.vcf', '.eml',
]);

/* ---------------- CSV ---------------- */

/** Descobre o separador mais provável (planilhas brasileiras usam ";"). */
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10);
  const candidates = [';', ',', '\t', '|'];
  let best = ',';
  let bestScore = -1;
  for (const d of candidates) {
    const counts = sample.map((line) => {
      let n = 0;
      let inQ = false;
      for (const ch of line) {
        if (ch === '"') inQ = !inQ;
        else if (ch === d && !inQ) n++;
      }
      return n;
    });
    const nonEmpty = counts.filter((c) => c > 0);
    if (!nonEmpty.length) continue;
    // Preferir separador presente em quase todas as linhas e com contagem estável.
    const consistent = nonEmpty.filter((c) => c === nonEmpty[0]).length;
    const score = nonEmpty.length * 10 + consistent * 5 + nonEmpty[0]!;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Leitor de CSV (RFC 4180: aspas, aspas duplicadas, quebras de linha dentro de aspas). */
export function parseCsv(text: string, delimiter = detectDelimiter(text), maxRows = Number.POSITIVE_INFINITY): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/^﻿/, '');
  while (i < src.length) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
      if (ch === '\r' && src[i + 1] === '\n') i++;
      i++;
      if (rows.length >= maxRows) return { rows, truncated: i < src.length };
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, truncated: false };
}

/* ---------------- tabelas (planilhas) ---------------- */

export interface SheetSummary {
  name: string;
  totalRows: number;
  totalCols: number;
  rows: string[][];
}

function cellText(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ').trim();
}

/** Texto compacto das planilhas para o modelo (separado por tabulação). */
export function formatSheets(sheets: SheetSummary[], kind: string): string {
  const parts: string[] = [`${kind}: ${sheets.length} ${sheets.length === 1 ? 'aba' : 'abas'}.`];
  for (const s of sheets) {
    parts.push('', `## Aba "${s.name}" — ${s.totalRows} linhas × ${s.totalCols} colunas`);
    if (!s.rows.length) {
      parts.push('(vazia)');
      continue;
    }
    for (const r of s.rows) parts.push(r.map(cellText).join('\t'));
    if (s.rows.length < s.totalRows) parts.push(`[… mostrando ${s.rows.length} de ${s.totalRows} linhas]`);
  }
  return parts.join('\n');
}

function excelCellToText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('.000Z', 'Z');
  }
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    if ('result' in o || 'formula' in o || 'sharedFormula' in o) return excelCellToText(o.result);
    if (typeof o.text === 'string') return o.text;
    if (typeof o.error === 'string') return o.error;
  }
  return String(v);
}

/** Carrega o exceljs (módulo CommonJS: a exportação útil fica em "default" no ESM do Node). */
export async function loadExcelJs(): Promise<typeof import('exceljs')> {
  const ns = (await import('exceljs')) as unknown as { default?: typeof import('exceljs') } & typeof import('exceljs');
  return ns.default ?? ns;
}

export async function readXlsxSummary(buf: Buffer, maxRowsPerSheet = 60, maxSheets = 12): Promise<SheetSummary[]> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const out: SheetSummary[] = [];
  for (const ws of wb.worksheets.slice(0, maxSheets)) {
    const rows: string[][] = [];
    const totalCols = ws.actualColumnCount || ws.columnCount || 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (rows.length >= maxRowsPerSheet) return;
      const cells: string[] = [];
      const last = Math.min(Math.max(row.cellCount, 1), 60);
      for (let c = 1; c <= last; c++) cells.push(excelCellToText(row.getCell(c).value));
      rows.push(cells);
    });
    out.push({ name: ws.name, totalRows: ws.actualRowCount || ws.rowCount || rows.length, totalCols, rows });
  }
  return out;
}

export function csvSummary(text: string, name: string, maxRows = 80): SheetSummary {
  const all = parseCsv(text);
  const rows = all.rows.filter((r) => r.some((c) => c.trim() !== ''));
  const totalCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return { name, totalRows: rows.length, totalCols, rows: rows.slice(0, maxRows) };
}

/* ---------------- Word e PDF ---------------- */

export async function readDocxText(buf: Buffer): Promise<string> {
  const ns = (await import('mammoth')) as unknown as { default?: typeof import('mammoth') } & typeof import('mammoth');
  const mammoth = ns.default ?? ns;
  const r = await mammoth.extractRawText({ buffer: buf });
  return String(r.value ?? '').replace(/\n{3,}/g, '\n\n').trim();
}

export async function readPdfPages(data: Uint8Array): Promise<{ pages: string[]; totalPages: number }> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const r = await extractText(pdf, { mergePages: false });
    const pages = (Array.isArray(r.text) ? r.text : [String(r.text)]).map((t) => t.replace(/[ \t]+\n/g, '\n').trim());
    return { pages, totalPages: r.totalPages };
  } finally {
    try {
      await pdf.loadingTask.destroy();
    } catch {
      /* ignora */
    }
  }
}

export function formatPdfPages(pages: string[]): string {
  return pages.map((t, i) => `--- Página ${i + 1} ---\n${t || '(sem texto: pode ser imagem escaneada; use ocr_image numa captura)'}`).join('\n\n');
}

/* ---------------- imagens ---------------- */

export interface ImageInfo {
  mediaType: ImageMediaType;
  width: number;
  height: number;
}

/** Tipo e dimensões de PNG, JPEG, GIF e WebP lendo só o cabeçalho. */
export function imageInfo(buf: Uint8Array): ImageInfo | null {
  const b = buf;
  const u16be = (o: number): number => (b[o]! << 8) | b[o + 1]!;
  const u16le = (o: number): number => b[o]! | (b[o + 1]! << 8);
  const u32be = (o: number): number => ((b[o]! << 24) >>> 0) + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
  if (b.length >= 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mediaType: 'image/png', width: u32be(16), height: u32be(20) };
  }
  if (b.length >= 10 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    return { mediaType: 'image/gif', width: u16le(6), height: u16le(8) };
  }
  if (b.length >= 30 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) {
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (chunk === 'VP8X') return { mediaType: 'image/webp', width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)) };
    if (chunk === 'VP8L') {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      return { mediaType: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8 ') return { mediaType: 'image/webp', width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
    return { mediaType: 'image/webp', width: 0, height: 0 };
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) {
        o++;
        continue;
      }
      const marker = b[o + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        o += 2;
        continue;
      }
      const len = u16be(o + 2);
      // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mediaType: 'image/jpeg', height: u16be(o + 5), width: u16be(o + 7) };
      }
      if (len < 2) break;
      o += 2 + len;
    }
    return { mediaType: 'image/jpeg', width: 0, height: 0 };
  }
  return null;
}

/** Limites da visão dos modelos (Claude: 5 MB por imagem em base64 e lado até 8000 px). */
export const IMAGE_MAX_BYTES = 3_750_000;
export const IMAGE_MAX_SIDE = 8000;

export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(['.png', '.jpg', '.jpeg', '.jpe', '.jfif', '.gif', '.webp']);

/* ---------------- despacho por tipo ---------------- */

export type FileKind = 'docx' | 'pdf' | 'xlsx' | 'csv' | 'image' | 'text' | 'unsupported';

export function kindOfFile(p: string, head?: Uint8Array): FileKind {
  const ext = extensionOf(p);
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.xlsx' || ext === '.xlsm') return 'xlsx';
  if (ext === '.csv') return 'csv';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (head) {
    if (head.length >= 5 && String.fromCharCode(...head.subarray(0, 5)) === '%PDF-') return 'pdf';
    if (imageInfo(head)) return 'image';
    if (!looksBinary(head)) return 'text';
  }
  return 'unsupported';
}
