import { z } from 'zod';
import { looksSensitive } from '../../memory/sensitive';
import type { MemoryItem, ToolDefinition } from '../../types';
import { errorMessage, errorOutput, isoDateSchema, kindSchema, memoryView, preview, SENSITIVE_REVEAL_RISK, textOutput } from './common';

const schema = z.object({
  id: z.string().min(1).max(100).describe('Id da memória (vem de memory_search).'),
  content: z.string().min(1).max(4000).optional().describe('Novo texto da memória.'),
  kind: kindSchema.optional(),
  tags: z.array(z.string().max(40)).max(10).optional().describe('Substitui as etiquetas.'),
  importance: z.number().min(0).max(1).optional(),
  sensitive: z.boolean().optional(),
  expiresAt: isoDateSchema.nullable().optional().describe('Nova data de expiração ISO; null remove a expiração.'),
});

type Input = z.infer<typeof schema>;

export const memoryUpdateTool: ToolDefinition<Input> = {
  name: 'memory_update',
  title: 'Alterar memória',
  description:
    'Corrige ou atualiza uma memória existente (use o id retornado por memory_search). ' +
    'Prefira atualizar a criar uma memória duplicada quando a informação mudou.',
  inputSchema: schema,
  risk: 'write',
  describe: (input) => (input.content ? `Alterar a memória ${input.id} para: "${preview(input.content, 80)}"` : `Alterar a memória ${input.id}`),
  async execute(input, ctx) {
    try {
      const store = ctx.services.memory;
      const current = await store.get(input.id);
      if (!current) return errorOutput(`Memória não encontrada: ${input.id}`);
      const patch: Partial<Pick<MemoryItem, 'content' | 'tags' | 'importance' | 'kind' | 'sensitive' | 'expiresAt'>> = {};
      if (input.content !== undefined) patch.content = input.content;
      if (input.kind !== undefined) patch.kind = input.kind;
      if (input.tags !== undefined) patch.tags = input.tags;
      if (input.importance !== undefined) patch.importance = input.importance;
      if (input.expiresAt !== undefined) patch.expiresAt = input.expiresAt ?? ''; // '' remove a expiração
      let sensitive = input.sensitive ?? current.sensitive;
      if (patch.content && !sensitive && looksSensitive(patch.content)) sensitive = true;
      if (sensitive !== current.sensitive) patch.sensitive = sensitive;
      if (!Object.keys(patch).length) return textOutput('Nada para alterar.', 'Nenhuma alteração');

      const requiresExplicit = ctx.services.settings.get().privacy.sensitiveRequiresExplicit;
      if (current.sensitive && patch.sensitive === false) {
        const ok = await ctx.confirm(
          'Deixar de tratar como sensível',
          `A memória "${preview(current.content, 100)}" deixará de ser sensível: poderá aparecer em buscas comuns e ir para o modelo de IA e para o serviço de embeddings. Permitir?`,
          SENSITIVE_REVEAL_RISK,
        );
        if (!ok) return textOutput('O dono não autorizou. A memória continua sensível.', 'Alteração não autorizada');
      } else if (!current.sensitive && patch.sensitive === true && requiresExplicit) {
        const ok = await ctx.confirm(
          'Guardar informação sensível',
          `A memória passará a conter informação sensível: "${preview(patch.content ?? current.content, 120)}". Permitir?`,
          'write',
        );
        if (!ok) return textOutput('O dono não autorizou guardar informação sensível. Nada foi alterado.', 'Alteração não autorizada');
      }

      const updated = await store.update(input.id, patch);
      if (!updated) return errorOutput(`Memória não encontrada: ${input.id}`);
      ctx.services.events.emit({ type: 'memory_changed' });
      return textOutput(JSON.stringify({ situacao: 'alterada', memoria: memoryView(updated) }, null, 1), 'Memória alterada');
    } catch (err) {
      return errorOutput(`Não foi possível alterar a memória: ${errorMessage(err)}`);
    }
  },
};
