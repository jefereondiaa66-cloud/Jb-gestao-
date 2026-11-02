import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ToolDefinition } from '../../types';
import { errorMessage, errorOutput, plural, SENSITIVE_REVEAL_RISK, textOutput } from './common';

const schema = z.object({
  includeSensitive: z
    .boolean()
    .optional()
    .describe('Incluir memórias sensíveis no arquivo (o arquivo fica sem criptografia; o dono precisa autorizar).'),
});

type Input = z.infer<typeof schema>;

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Pasta das exportações: <Documentos>/300/exportacoes. */
export function exportDir(documents: string): string {
  return join(documents, '300', 'exportacoes');
}

export const memoryExportTool: ToolDefinition<Input> = {
  name: 'memory_export',
  title: 'Exportar memórias',
  description:
    'Exporta as memórias do dono para um arquivo JSON na pasta Documentos/300/exportacoes e devolve o caminho. ' +
    'Por padrão, memórias sensíveis ficam de fora.',
  inputSchema: schema,
  risk: 'write',
  describe: (input) =>
    `Exportar ${input.includeSensitive ? 'todas as memórias, inclusive as sensíveis,' : 'as memórias (sem as sensíveis)'} para um arquivo JSON em Documentos/300/exportacoes`,
  available: (services) => !!services.platform?.paths?.documents,
  async execute(input, ctx) {
    try {
      const docs = ctx.services.platform.paths.documents;
      if (!docs) return errorOutput('A pasta Documentos não foi encontrada.');
      if (input.includeSensitive) {
        const ok = await ctx.confirm(
          'Exportar memórias sensíveis',
          'O arquivo exportado incluirá memórias sensíveis (saúde, finanças, documentos) SEM criptografia, na pasta Documentos (que pode ser sincronizada com a nuvem). Permitir?',
          SENSITIVE_REVEAL_RISK,
        );
        if (!ok) return textOutput('O dono não autorizou exportar memórias sensíveis. Nada foi exportado.', 'Exportação não autorizada');
      }
      const all = await ctx.services.memory.exportAll();
      const items = input.includeSensitive ? all.items : all.items.filter((i) => !i.sensitive);
      const data = { ...all, items, includesSensitive: !!input.includeSensitive };
      const dir = exportDir(docs);
      await mkdir(dir, { recursive: true });
      const base = `memorias-${stamp()}`;
      let path = '';
      for (let i = 0; i < 100; i++) {
        const candidate = join(dir, i === 0 ? `${base}.json` : `${base}-${i + 1}.json`);
        try {
          // 'wx': nunca sobrescreve um arquivo existente.
          await writeFile(candidate, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
          path = candidate;
          break;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
        }
      }
      if (!path) return errorOutput('Não foi possível criar o arquivo de exportação (nomes já usados).');
      const skipped = all.items.length - items.length;
      return textOutput(
        JSON.stringify({ situacao: 'exportado', caminho: path, memorias: items.length, sensiveisDeFora: skipped }),
        `${plural(items.length, 'memória exportada', 'memórias exportadas')} para ${path}`,
      );
    } catch (err) {
      return errorOutput(`Não foi possível exportar as memórias: ${errorMessage(err)}`);
    }
  },
};
