/** Anexos de texto pelo caminho real (File do Node, sem DOM). */
import { describe, expect, it } from 'vitest';
import { fileToAttachment } from '../../../src/renderer/src/lib/attach-file';
import { classifyFile, displayName } from '../../../src/renderer/src/lib/attachments';

const longStem = 'Relatório trimestral de vendas da equipe comercial região sudeste versão final revisada';

describe('nomes longos de arquivo', () => {
  it('displayName encurta mas mantém a extensão', () => {
    const n = displayName(longStem + '.md');
    expect(n.length).toBeLessThanOrEqual(80);
    expect(n.endsWith('….md')).toBe(true);
    expect(classifyFile(n, '')).toBe('text');
  });

  it('arquivo .md de nome longo sem tipo (comum no Windows) é aceito e mantém a extensão', async () => {
    const f = new File(['# título\nconteúdo'], longStem + '.md', { type: '' });
    const a = await fileToAttachment(f);
    expect(a.kind).toBe('text');
    expect(a.attachment.name.endsWith('.md')).toBe(true);
    expect(Buffer.from(a.attachment.data, 'base64').toString('utf8')).toBe('# título\nconteúdo');
  });

  it('CSV com tipo do Excel e nome longo continua com .csv no nome enviado', async () => {
    const f = new File(['a;b\n1;2'], longStem + '.csv', { type: 'application/vnd.ms-excel' });
    const a = await fileToAttachment(f);
    expect(a.kind).toBe('text');
    expect(a.attachment.name.endsWith('.csv')).toBe(true);
  });

  it('nomes com quebras ou controles de direção do texto são limpos', () => {
    expect(displayName('a\nb\tc.txt')).toBe('a b c.txt');
    expect(displayName('fatura‮txt.exe')).not.toContain('‮');
  });

  it('tipo não aceito continua recusado', async () => {
    const f = new File(['MZ'], 'programa.exe', { type: 'application/x-msdownload' });
    await expect(fileToAttachment(f)).rejects.toThrow(/não é um tipo aceito/);
  });
});
