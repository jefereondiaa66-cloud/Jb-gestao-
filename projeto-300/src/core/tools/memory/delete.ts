import { z } from 'zod';
import type { ToolDefinition } from '../../types';
import { errorMessage, errorOutput, preview, textOutput } from './common';

const schema = z.object({
  id: z.string().min(1).max(100).describe('Id da memória a apagar (vem de memory_search).'),
});

type Input = z.infer<typeof schema>;

export const memoryDeleteTool: ToolDefinition<Input> = {
  name: 'memory_delete',
  title: 'Apagar memória',
  description: 'Apaga definitivamente uma memória (use o id de memory_search). Use quando o dono pedir para esquecer algo.',
  inputSchema: schema,
  risk: 'destructive',
  describe: (input) => `Apagar definitivamente a memória ${input.id}`,
  async execute(input, ctx) {
    try {
      const store = ctx.services.memory;
      const item = await store.get(input.id);
      if (!item) return errorOutput(`Memória não encontrada: ${input.id}`);
      const ok = await store.remove(input.id);
      if (!ok) return errorOutput(`Memória não encontrada: ${input.id}`);
      ctx.services.events.emit({ type: 'memory_changed' });
      const what = item.sensitive ? 'uma memória sensível' : `"${preview(item.content, 60)}"`;
      return textOutput(JSON.stringify({ situacao: 'apagada', id: item.id }), `Memória apagada: ${what}`);
    } catch (err) {
      return errorOutput(`Não foi possível apagar a memória: ${errorMessage(err)}`);
    }
  },
};
