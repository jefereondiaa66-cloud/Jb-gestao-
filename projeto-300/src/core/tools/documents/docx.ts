/** Geração de documentos do Word (.docx) a partir de título + markdown simples. */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { Block, Inline } from './markdown';

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6] as const;

function runs(inlines: Inline[], extra: { bold?: boolean; italics?: boolean; size?: number } = {}): (TextRun | ExternalHyperlink)[] {
  return inlines.map((i) => {
    const run = new TextRun({
      text: i.text,
      bold: extra.bold || i.bold || false,
      italics: extra.italics || i.italic || false,
      ...(extra.size ? { size: extra.size } : {}),
      ...(i.code ? { font: 'Consolas', shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } } : {}),
      ...(i.link ? { style: 'Hyperlink' } : {}),
    });
    return i.link ? new ExternalHyperlink({ link: i.link, children: [run] }) : run;
  });
}

function tableBlock(b: Extract<Block, { type: 'table' }>): Table {
  const width = Math.max(b.header.length, ...b.rows.map((r) => r.length), 1);
  const cell = (inl: Inline[] | undefined, header: boolean, col: number): TableCell =>
    new TableCell({
      children: [
        new Paragraph({
          children: runs(inl ?? [], header ? { bold: true } : {}),
          alignment: b.align[col] === 'center' ? AlignmentType.CENTER : b.align[col] === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT,
        }),
      ],
      ...(header ? { shading: { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' } } : {}),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
    });
  const row = (cells: Inline[][], header: boolean): TableRow =>
    new TableRow({ tableHeader: header, children: Array.from({ length: width }, (_, c) => cell(cells[c], header, c)) });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [row(b.header, true), ...b.rows.map((r) => row(r, false))],
  });
}

export interface DocxMeta {
  author?: string;
  description?: string;
}

export async function buildDocx(title: string, blocks: Block[], meta: DocxMeta = {}): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [];
  if (title.trim()) children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(title.trim())] }));
  let listInstance = 0;
  for (const b of blocks) {
    switch (b.type) {
      case 'heading':
        children.push(new Paragraph({ heading: HEADINGS[b.level - 1], children: runs(b.inlines) }));
        break;
      case 'paragraph':
        children.push(new Paragraph({ children: runs(b.inlines), spacing: { after: 120 } }));
        break;
      case 'list': {
        listInstance++;
        for (const it of b.items) {
          children.push(
            it.ordered
              ? new Paragraph({ numbering: { reference: 'numeracao-300', level: it.level, instance: listInstance }, children: runs(it.inlines) })
              : new Paragraph({ bullet: { level: it.level }, children: runs(it.inlines) }),
          );
        }
        break;
      }
      case 'table':
        children.push(tableBlock(b));
        children.push(new Paragraph({ children: [] }));
        break;
      case 'code':
        for (const line of b.text.split('\n')) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })],
              shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
              spacing: { after: 0 },
            }),
          );
        }
        children.push(new Paragraph({ children: [] }));
        break;
      case 'quote':
        children.push(
          new Paragraph({
            children: runs(b.inlines, { italics: true }),
            indent: { left: 567 },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'A6A6A6', space: 8 } },
          }),
        );
        break;
      case 'rule':
        children.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A6A6A6', space: 1 } } }));
        break;
    }
  }

  const doc = new Document({
    creator: meta.author ?? '300',
    lastModifiedBy: meta.author ?? '300',
    title: title.trim(),
    ...(meta.description ? { description: meta.description } : {}),
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22, language: { value: 'pt-BR' } } } },
    },
    numbering: {
      config: [
        {
          reference: 'numeracao-300',
          levels: [0, 1, 2, 3].map((level) => ({
            level,
            format: level % 2 === 0 ? LevelFormat.DECIMAL : LevelFormat.LOWER_LETTER,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ children: ['Página ', PageNumber.CURRENT, ' de ', PageNumber.TOTAL_PAGES], size: 18, color: '808080' })],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });
  return Packer.toBuffer(doc);
}
