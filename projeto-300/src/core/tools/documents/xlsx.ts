/** Geração de planilhas do Excel (.xlsx) com cabeçalho formatado, larguras, números, datas e fórmulas. */
import { loadExcelJs } from '../files/readers';

export type CellInput = string | number | boolean | null;
export type ColumnFormat = 'texto' | 'numero' | 'moeda' | 'porcentagem' | 'data' | 'data_hora';

export interface SheetInput {
  nome: string;
  colunas: string[];
  linhas: CellInput[][];
  larguras?: number[];
  formatos?: ColumnFormat[];
}

export const NUM_FORMATS: Record<Exclude<ColumnFormat, 'texto'>, string> = {
  numero: '#,##0.00',
  moeda: '"R$" #,##0.00',
  porcentagem: '0.00%',
  data: 'dd/mm/yyyy',
  data_hora: 'dd/mm/yyyy hh:mm',
};

/** Funções de fórmula que acessam a rede ou executam código: recusadas. */
const BLOCKED_FUNCS = /\b(WEBSERVICE|CALL|REGISTER(\.ID)?|EXEC|RTD|DDE|DDEAUTO|FILTERXML|IMPORTDATA|IMPORTXML|IMPORTHTML)\s*\(/i;

export function validateFormula(f: string): string | null {
  if (f.includes('|')) return 'fórmula com "|" (DDE) não é permitida';
  if (BLOCKED_FUNCS.test(f)) return 'fórmula com função que acessa a rede ou executa código não é permitida';
  if (f.length > 2000) return 'fórmula longa demais';
  return null;
}

export type ConvertedCell = { value: unknown; numFmt?: string };

/** Valor vindo do modelo -> valor da célula do exceljs. */
export function convertCell(v: CellInput): ConvertedCell {
  if (v === null || v === undefined) return { value: null };
  if (typeof v === 'number') return { value: Number.isFinite(v) ? v : null };
  if (typeof v === 'boolean') return { value: v };
  const s = String(v);
  if (s.startsWith("'")) return { value: s.slice(1) }; // apóstrofo = texto literal
  if (s.startsWith('=') && s.length > 1) {
    const bad = validateFormula(s.slice(1));
    if (bad) throw new Error(`${bad}: ${s.slice(0, 60)}`);
    return { value: { formula: s.slice(1) } };
  }
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (!Number.isNaN(d.getTime()) && d.getUTCDate() === Number(m[3])) return { value: d, numFmt: NUM_FORMATS.data };
  }
  m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) {
    // Hora "de parede" (sem fuso): o Excel mostra exatamente o que foi pedido.
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0)));
    if (!Number.isNaN(d.getTime())) return { value: d, numFmt: NUM_FORMATS.data_hora };
  }
  m = /^(-?\d+(?:[.,]\d+)?)\s*%$/.exec(s);
  if (m) return { value: Number(m[1]!.replace(',', '.')) / 100, numFmt: '0.##%' };
  return { value: s };
}

/** Nome de aba válido no Excel (até 31 caracteres, sem []:*?/\) e único. */
export function sheetName(name: string, used: Set<string>): string {
  let base = String(name ?? '')
    .replace(/[[\]:*?/\\]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base) base = 'Planilha';
  base = [...base].slice(0, 31).join('');
  let n = 2;
  let candidate = base;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`;
    candidate = [...base].slice(0, 31 - suffix.length).join('') + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function displayLength(v: unknown): number {
  if (v === null || v === undefined) return 0;
  if (v instanceof Date) return 16;
  if (typeof v === 'object') return 12; // fórmula
  return [...String(v)].length;
}

export async function buildXlsx(sheets: SheetInput[], meta: { title?: string; author?: string } = {}): Promise<Buffer> {
  const ExcelJS = await loadExcelJs();
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.author ?? '300';
  wb.lastModifiedBy = meta.author ?? '300';
  wb.created = new Date();
  wb.modified = new Date();
  if (meta.title) wb.title = meta.title;
  const used = new Set<string>();

  for (const s of sheets) {
    const ws = wb.addWorksheet(sheetName(s.nome, used), { views: [{ state: 'frozen', ySplit: s.colunas.length ? 1 : 0 }] });
    const ncols = Math.max(s.colunas.length, ...s.linhas.map((r) => r.length), 0);
    const widths = Array.from({ length: ncols }, (_, c) => displayLength(s.colunas[c]));

    if (s.colunas.length) {
      const header = ws.addRow(s.colunas);
      header.height = 20;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'thin', color: { argb: 'FF7F7F7F' } } };
      });
    }

    for (const r of s.linhas) {
      const converted = Array.from({ length: ncols }, (_, c) => convertCell((r[c] ?? null) as CellInput));
      const row = ws.addRow(converted.map((x) => x.value));
      converted.forEach((x, c) => {
        const cell = row.getCell(c + 1);
        const colFmt = s.formatos?.[c];
        if (colFmt && colFmt !== 'texto' && (typeof x.value === 'number' || x.value instanceof Date || (typeof x.value === 'object' && x.value !== null))) {
          cell.numFmt = NUM_FORMATS[colFmt];
        } else if (x.numFmt) cell.numFmt = x.numFmt;
        widths[c] = Math.max(widths[c] ?? 0, displayLength(x.value));
      });
    }

    for (let c = 0; c < ncols; c++) {
      const given = s.larguras?.[c];
      ws.getColumn(c + 1).width = given && given > 0 ? Math.min(given, 120) : Math.max(8, Math.min(60, (widths[c] ?? 8) + 2));
    }
    if (s.colunas.length && ncols > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ncols } };
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
