/** Ferramentas de documentos do 300: Word, Excel e PDF salvos em Documentos/300. */
import { z } from 'zod';
import type { ToolDefinition } from '../../types';
import { failure } from '../files/tools-read';
import { formatBytes, plural, preview, textOutput } from '../files/util';
import { buildDocx } from './docx';
import { parseMarkdown } from './markdown';
import { buildPdf } from './pdf';
import { saveDocument } from './save';
import { buildXlsx, type SheetInput } from './xlsx';

export { parseMarkdown, parseInline, inlineText } from './markdown';
export type { Block, Inline, ListItem } from './markdown';
export { buildDocx } from './docx';
export { buildXlsx, convertCell, sheetName, validateFormula, NUM_FORMATS } from './xlsx';
export type { SheetInput, CellInput, ColumnFormat } from './xlsx';
export { buildPdf, makeWinAnsiSanitizer } from './pdf';
export { safeBaseName, stripExtension, writeUnique, outputDir, saveDocument } from './save';

const SAVE_HINT = 'O arquivo é salvo em Documentos\\300 (nunca substitui um existente: se o nome já existir, ganha " (2)").';

/* ---------------- create_docx ---------------- */
const docxSchema = z.object({
  titulo: z.string().min(1).max(300).describe('Título do documento (vai no topo e no nome do arquivo).'),
  conteudo: z
    .string()
    .max(300_000)
    .describe('Conteúdo em markdown simples: # títulos, parágrafos, listas (- ou 1.), **negrito**, *itálico*, `código`, [links](https://...), tabelas | a | b |, > citações.'),
  nomeArquivo: z.string().max(120).optional().describe('Nome do arquivo sem pasta (padrão: o título).'),
});

export const createDocxTool: ToolDefinition<z.infer<typeof docxSchema>> = {
  name: 'create_docx',
  title: 'Criar documento Word',
  description: `Cria um documento do Word (.docx) com título e conteúdo em markdown simples (títulos, listas, negrito, itálico, tabelas). ${SAVE_HINT} Devolve o caminho salvo.`,
  inputSchema: docxSchema,
  risk: 'write',
  describe: (i) => `Criar o documento Word "${preview(i.nomeArquivo || i.titulo, 80)}.docx" em Documentos\\300 (${plural(i.conteudo.length, 'caractere', 'caracteres')})`,
  async execute(input, ctx) {
    try {
      const blocks = parseMarkdown(input.conteudo);
      const buf = await buildDocx(input.titulo, blocks);
      const path = await saveDocument(ctx.services, input.nomeArquivo || input.titulo, '.docx', buf);
      return textOutput(`Documento Word criado: ${path} (${formatBytes(buf.length)}). Para abrir, use open_path com esse caminho.`, `Documento criado: ${preview(input.titulo, 60)}`);
    } catch (err) {
      return failure('Não consegui criar o documento', err);
    }
  },
};

/* ---------------- create_xlsx ---------------- */
const cell = z.union([z.string().max(32_000), z.number(), z.boolean(), z.null()]);
const sheetSchema = z.object({
  nome: z.string().max(100).describe('Nome da aba.'),
  colunas: z.array(z.string().max(200)).max(100).describe('Títulos das colunas (linha de cabeçalho).'),
  linhas: z
    .array(z.array(cell).max(100))
    .max(10_000)
    .describe('Linhas de dados. Números como número; datas como "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM"; fórmulas começando com "=" e com nomes de função em inglês (ex.: "=SUM(B2:B10)"; o Excel mostra traduzido); "15%" vira porcentagem; texto começando com apóstrofo fica como texto.'),
  larguras: z.array(z.number().min(1).max(120)).max(100).optional().describe('Largura de cada coluna (em caracteres). Padrão: automática.'),
  formatos: z
    .array(z.enum(['texto', 'numero', 'moeda', 'porcentagem', 'data', 'data_hora']))
    .max(100)
    .optional()
    .describe('Formato de cada coluna (moeda = R$ 1.234,56; numero = 2 casas; porcentagem; data).'),
});

const xlsxSchema = z.object({
  titulo: z.string().min(1).max(200).describe('Título da planilha (nome do arquivo).'),
  planilhas: z.array(sheetSchema).min(1).max(20).describe('Abas da planilha.'),
  nomeArquivo: z.string().max(120).optional().describe('Nome do arquivo sem pasta (padrão: o título).'),
});

export const createXlsxTool: ToolDefinition<z.infer<typeof xlsxSchema>> = {
  name: 'create_xlsx',
  title: 'Criar planilha Excel',
  description:
    'Cria uma planilha do Excel (.xlsx) com uma ou mais abas: cabeçalho destacado e congelado, filtro, larguras automáticas, números, datas, porcentagens e fórmulas ' +
    `(nomes de funções em inglês, ex.: =SUM, =AVERAGE, =IF). ${SAVE_HINT} Devolve o caminho salvo.`,
  inputSchema: xlsxSchema,
  risk: 'write',
  describe: (i) => {
    const rows = i.planilhas.reduce((n, s) => n + s.linhas.length, 0);
    return `Criar a planilha Excel "${preview(i.nomeArquivo || i.titulo, 80)}.xlsx" em Documentos\\300 (${plural(i.planilhas.length, 'aba', 'abas')}, ${plural(rows, 'linha', 'linhas')})`;
  },
  async execute(input, ctx) {
    try {
      const buf = await buildXlsx(input.planilhas as SheetInput[], { title: input.titulo });
      const path = await saveDocument(ctx.services, input.nomeArquivo || input.titulo, '.xlsx', buf);
      return textOutput(`Planilha criada: ${path} (${formatBytes(buf.length)}). Para abrir, use open_path com esse caminho.`, `Planilha criada: ${preview(input.titulo, 60)}`);
    } catch (err) {
      return failure('Não consegui criar a planilha', err);
    }
  },
};

/* ---------------- create_pdf ---------------- */
const pdfSchema = z.object({
  titulo: z.string().min(1).max(300).describe('Título do PDF (vai no topo e no nome do arquivo).'),
  conteudo: z.string().max(300_000).describe('Conteúdo em markdown simples (títulos, parágrafos, listas, negrito, itálico, tabelas, citações).'),
  nomeArquivo: z.string().max(120).optional().describe('Nome do arquivo sem pasta (padrão: o título).'),
});

export const createPdfTool: ToolDefinition<z.infer<typeof pdfSchema>> = {
  name: 'create_pdf',
  title: 'Criar PDF',
  description: `Cria um PDF (A4) com título, texto formatado a partir de markdown simples, tabelas e numeração de páginas. ${SAVE_HINT} Devolve o caminho salvo.`,
  inputSchema: pdfSchema,
  risk: 'write',
  describe: (i) => `Criar o PDF "${preview(i.nomeArquivo || i.titulo, 80)}.pdf" em Documentos\\300 (${plural(i.conteudo.length, 'caractere', 'caracteres')})`,
  async execute(input, ctx) {
    try {
      const bytes = await buildPdf(input.titulo, parseMarkdown(input.conteudo));
      const path = await saveDocument(ctx.services, input.nomeArquivo || input.titulo, '.pdf', bytes);
      return textOutput(`PDF criado: ${path} (${formatBytes(bytes.length)}). Para abrir, use open_path com esse caminho.`, `PDF criado: ${preview(input.titulo, 60)}`);
    } catch (err) {
      return failure('Não consegui criar o PDF', err);
    }
  },
};

export function documentTools(): ToolDefinition[] {
  return [createDocxTool, createXlsxTool, createPdfTool];
}
