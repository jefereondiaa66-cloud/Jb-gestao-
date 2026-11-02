/** Partes comuns das ferramentas de memória. */
import { z } from 'zod';
import type { MemoryItem, MemoryKind, ToolOutput } from '../../types';

export const MEMORY_KIND_VALUES = ['fact', 'preference', 'project', 'task', 'knowledge', 'person', 'event', 'summary'] as const satisfies readonly MemoryKind[];

export const kindSchema = z.enum(MEMORY_KIND_VALUES);

export const KIND_LABELS: Record<MemoryKind, string> = {
  fact: 'fato',
  preference: 'preferência',
  project: 'projeto',
  task: 'tarefa',
  knowledge: 'conhecimento',
  person: 'pessoa',
  event: 'evento',
  summary: 'resumo',
};

export function preview(text: string, max = 80): string {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  const chars = [...t];
  return chars.length <= max ? t : chars.slice(0, max - 1).join('') + '…';
}

export function textOutput(text: string, summary: string, isError = false): ToolOutput {
  return { content: [{ type: 'text', text }], summary, ...(isError ? { isError: true } : {}) };
}

export function errorOutput(message: string): ToolOutput {
  return textOutput(message, message, true);
}

/** Forma compacta (chaves em português) para devolver ao modelo. */
export function memoryView(item: MemoryItem): Record<string, unknown> {
  const v: Record<string, unknown> = {
    id: item.id,
    tipo: item.kind,
    conteudo: item.content,
    importancia: Math.round(item.importance * 100) / 100,
    atualizadaEm: item.updatedAt,
  };
  if (item.tags.length) v.etiquetas = item.tags;
  if (item.sensitive) v.sensivel = true;
  if (item.expiresAt) v.expiraEm = item.expiresAt;
  return v;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Data ISO opcional (com validação simples). */
export const isoDateSchema = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(new Date(s).getTime()), { message: 'data inválida (use ISO 8601, ex.: 2026-12-31T18:00:00-03:00)' });

/**
 * Risco das confirmações que deixam informação sensível SAIR do banco
 * criptografado (para o modelo de IA, para um arquivo sem criptografia ou para
 * as buscas comuns/embeddings). A política sempre pergunta ao dono para
 * 'external' (nunca aprova sozinha nem "lembra na sessão"); com 'read' ou
 * 'write' a confirmação poderia ser aprovada automaticamente.
 */
export const SENSITIVE_REVEAL_RISK = 'external' as const;

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
