import { z } from 'zod';
import type { MemorySearchOptions } from '../../memory/memory-store';
import { looksSensitive } from '../../memory/sensitive';
import { textSimilarity } from '../../memory/text';
import type { ToolDefinition } from '../../types';
import { errorMessage, errorOutput, isoDateSchema, KIND_LABELS, kindSchema, memoryView, preview, textOutput } from './common';

const schema = z.object({
  content: z
    .string()
    .min(1)
    .max(4000)
    .describe('A informação a guardar, numa frase completa e independente (ex.: "O dono prefere reuniões pela manhã.").'),
  kind: kindSchema.optional().describe('Tipo: fact, preference, project, task, knowledge, person, event ou summary (padrão fact).'),
  tags: z.array(z.string().max(40)).max(10).optional().describe('Etiquetas curtas para organizar.'),
  importance: z.number().min(0).max(1).optional().describe('Importância de 0 a 1 (padrão 0.6).'),
  sensitive: z.boolean().optional().describe('true para saúde, finanças, documentos, senhas, intimidade ou dados de terceiros.'),
  expiresAt: isoDateSchema.optional().describe('Data/hora ISO em que a memória deixa de valer (opcional).'),
});

type Input = z.infer<typeof schema>;

export const memorySaveTool: ToolDefinition<Input> = {
  name: 'memory_save',
  title: 'Guardar na memória',
  description:
    'Guarda uma informação duradoura sobre o dono na memória de longo prazo. Use quando o dono pedir para lembrar algo ' +
    'ou quando surgir um fato/preferência claramente útil no futuro. Não guarde conversa trivial. ' +
    'Informações sensíveis só com pedido explícito do dono (ele precisa autorizar).',
  inputSchema: schema,
  risk: 'write',
  describe: (input) => `Guardar na memória: "${preview(input.content, 80)}"`,
  async execute(input, ctx) {
    try {
      const services = ctx.services;
      const sensitive = !!input.sensitive || looksSensitive(input.content);
      if (sensitive && services.settings.get().privacy.sensitiveRequiresExplicit) {
        const ok = await ctx.confirm(
          'Guardar informação sensível',
          `O 300 quer guardar uma informação sensível na memória: "${preview(input.content, 120)}". Permitir?`,
          'write',
        );
        if (!ok) return textOutput('O dono não autorizou guardar esta informação sensível. Nada foi salvo.', 'Memória sensível não autorizada');
      }
      const kind = input.kind ?? 'fact';
      const importance = input.importance ?? 0.6;

      // Já existe praticamente a mesma memória? Reforça em vez de duplicar.
      // Conteúdo sensível é comparado só por texto (nunca vai ao provedor de embeddings).
      const dupQuery: MemorySearchOptions = { text: input.content, limit: 3, includeSensitive: true, touch: false, signal: ctx.signal, vectors: !sensitive };
      const similar = await services.memory.search(dupQuery);
      const dup = similar.find((r) => textSimilarity(r.item.content, input.content).jaccard >= 0.9);
      if (dup) {
        const patch: Parameters<typeof services.memory.update>[1] = {};
        if (importance > dup.item.importance) patch.importance = importance;
        if (sensitive && !dup.item.sensitive) patch.sensitive = true;
        if (input.tags?.length) patch.tags = [...new Set([...dup.item.tags, ...input.tags])];
        const item = Object.keys(patch).length ? ((await services.memory.update(dup.item.id, patch)) ?? dup.item) : dup.item;
        if (Object.keys(patch).length) services.events.emit({ type: 'memory_changed' });
        return textOutput(
          JSON.stringify({ situacao: 'ja_existia', memoria: memoryView(item) }, null, 1),
          'Essa informação já estava na memória',
        );
      }

      const item = await services.memory.add({
        kind,
        content: input.content,
        tags: input.tags ?? [],
        importance,
        source: ctx.conversationId ? `conversa:${ctx.conversationId}` : 'usuario',
        sensitive,
        expiresAt: input.expiresAt,
      });
      services.events.emit({ type: 'memory_changed' });
      return textOutput(
        JSON.stringify({ situacao: 'guardada', memoria: memoryView(item) }, null, 1),
        `Memória guardada (${KIND_LABELS[item.kind]})`,
      );
    } catch (err) {
      return errorOutput(`Não foi possível guardar na memória: ${errorMessage(err)}`);
    }
  },
};
