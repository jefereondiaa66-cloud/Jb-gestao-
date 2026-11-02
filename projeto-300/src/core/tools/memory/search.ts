import { z } from 'zod';
import type { MemorySearchOptions } from '../../memory/memory-store';
import type { ToolDefinition } from '../../types';
import { errorMessage, errorOutput, kindSchema, memoryView, plural, preview, SENSITIVE_REVEAL_RISK, textOutput } from './common';

const schema = z.object({
  query: z.string().max(1000).describe('O que procurar (palavras ou frase). Vazio = memórias recentes e importantes.'),
  kinds: z.array(kindSchema).max(8).optional().describe('Filtrar por tipos de memória.'),
  tags: z.array(z.string().max(40)).max(10).optional().describe('Só memórias com todas estas etiquetas.'),
  limit: z.number().int().min(1).max(20).optional().describe('Quantidade máxima de resultados (padrão 8).'),
  includeSensitive: z
    .boolean()
    .optional()
    .describe('Incluir memórias sensíveis (saúde, finanças, documentos). Só use se o dono pediu essa informação; o dono precisa autorizar.'),
});

type Input = z.infer<typeof schema>;

export const memorySearchTool: ToolDefinition<Input> = {
  name: 'memory_search',
  title: 'Consultar memória',
  description:
    'Procura na memória de longo prazo do dono (fatos, preferências, projetos, pessoas, eventos). ' +
    'Use antes de responder perguntas sobre o dono ou quando um detalhe guardado puder ajudar. ' +
    'Memórias sensíveis ficam ocultas, a menos que includeSensitive seja true (pede autorização ao dono).',
  inputSchema: schema,
  risk: 'read',
  describe: (input) =>
    input.query?.trim()
      ? `Procurar na memória: "${preview(input.query, 60)}"${input.includeSensitive ? ' (inclusive informações sensíveis)' : ''}`
      : 'Ver as memórias recentes e importantes',
  async execute(input, ctx) {
    try {
      if (input.includeSensitive) {
        const ok = await ctx.confirm(
          'Consultar memórias sensíveis',
          'O 300 quer consultar memórias marcadas como sensíveis (saúde, finanças, documentos, senhas). Elas vão para o modelo de IA nesta conversa. Permitir?',
          SENSITIVE_REVEAL_RISK,
        );
        if (!ok) return textOutput('O dono não autorizou consultar memórias sensíveis. Pesquise sem elas ou pergunte ao dono.', 'Consulta sensível não autorizada');
      }
      const q: MemorySearchOptions = {
        text: input.query ?? '',
        kinds: input.kinds,
        tags: input.tags,
        limit: input.limit ?? 8,
        includeSensitive: !!input.includeSensitive,
        signal: ctx.signal,
      };
      const results = await ctx.services.memory.search(q);
      const body = {
        total: results.length,
        memorias: results.map((r) => ({ ...memoryView(r.item), encontradaPor: r.matchedBy })),
      };
      const summary = results.length ? `${plural(results.length, 'memória encontrada', 'memórias encontradas')}` : 'Nenhuma memória encontrada';
      return textOutput(JSON.stringify(body, null, 1), summary);
    } catch (err) {
      return errorOutput(`Não foi possível consultar a memória: ${errorMessage(err)}`);
    }
  },
};
