import { describe, expect, it } from 'vitest';
import { buildFtsQuery, cleanText, foldText, searchTerms, textSimilarity } from '@core/memory/text';
import { toUnpackedPath } from '@core/memory/database';

describe('texto e consulta FTS', () => {
  it('remove acentos para comparar', () => {
    expect(foldText('Pão AÇÚCAR Coração')).toBe('pao acucar coracao');
  });

  it('extrai termos sem palavras comuns e sem repetição', () => {
    expect(searchTerms('Qual é o nome do meu cachorro? O cachorro!')).toEqual(['nome', 'cachorro']);
    // Só palavras comuns: usa o que tiver
    expect(searchTerms('ela')).toEqual(['ela']);
  });

  it('cada termo vira cadeia entre aspas com prefixo', () => {
    expect(buildFtsQuery('pão de queijo')).toBe('"pao"* OR "queijo"*');
    expect(buildFtsQuery('café com leite', { mode: 'and' })).toBe('"cafe"* AND "leite"*');
    expect(buildFtsQuery('ir ao rio')).toBe('"ir" OR "rio"*');
  });

  it('entrada hostil não injeta operadores FTS', () => {
    const hostile = [
      '" OR 1=1 --',
      'NEAR(a b, 5)',
      'content:segredo',
      '*',
      '^inicio',
      '"aspas sem fim',
      ')))(((',
      'a AND NOT b',
      '{content tags}: x',
      '-x +y',
      "'; DROP TABLE memories; --",
      '\u0000\u0001\u202e invisível',
    ];
    for (const h of hostile) {
      const q = buildFtsQuery(h);
      if (q === null) continue;
      // Só termos entre aspas, ligados por OR, opcionalmente com * no fim
      expect(q).toMatch(/^"[\p{L}\p{N}]+"\*?( OR "[\p{L}\p{N}]+"\*?)*$/u);
    }
    expect(buildFtsQuery('***')).toBeNull();
    expect(buildFtsQuery('')).toBeNull();
  });

  it('limita quantidade e tamanho de termos', () => {
    const many = Array.from({ length: 100 }, (_, i) => `palavra${i}`).join(' ');
    expect(searchTerms(many)).toHaveLength(24);
    expect(searchTerms('x'.repeat(500))[0]).toHaveLength(64);
  });

  it('limpa caracteres invisíveis e de controle', () => {
    expect(cleanText('  a\u200bb\u0007c\r\nd  ')).toBe('abc\nd');
  });

  it('similaridade por termos', () => {
    expect(textSimilarity('O dono gosta de café', 'o dono GOSTA de cafe').jaccard).toBe(1);
    const s = textSimilarity('O dono tem um cachorro', 'O dono tem um cachorro chamado Rex');
    expect(s.containsA).toBe(1);
    expect(s.jaccard).toBeLessThan(1);
  });

  it('similaridade: palavras que mudam o sentido contam (contradição não é duplicata)', () => {
    // Antes, "sem", "com" e "não" eram descartadas como palavras comuns e a contradição parecia igual.
    expect(textSimilarity('O dono prefere café sem açúcar.', 'O dono prefere café com açúcar.').jaccard).toBeLessThan(0.85);
    expect(textSimilarity('O dono gosta de café.', 'O dono não gosta de café.').jaccard).toBeLessThan(0.85);
    expect(textSimilarity('O dono mora em Natal.', 'O dono não mora mais em Natal.').jaccard).toBeLessThan(0.85);
    // Paráfrase com as mesmas palavras de sentido continua igual
    expect(textSimilarity('O dono prefere chá de hortelã.', 'o dono prefere CHA de hortela').jaccard).toBe(1);
    // Textos longos: a comparação usa todos os termos, não só os 24 primeiros
    const base = Array.from({ length: 30 }, (_, i) => `palavra${i}`).join(' ');
    expect(textSimilarity(base + ' final', base + ' diferente').jaccard).toBeLessThan(1);
  });
});

describe('caminho da extensão em app empacotado', () => {
  it('troca app.asar por app.asar.unpacked', () => {
    expect(toUnpackedPath('C:\\Programas\\300\\resources\\app.asar\\node_modules\\sqlite-vec-windows-x64\\vec0.dll')).toBe(
      'C:\\Programas\\300\\resources\\app.asar.unpacked\\node_modules\\sqlite-vec-windows-x64\\vec0.dll',
    );
    expect(toUnpackedPath('/opt/300/resources/app.asar/node_modules/sqlite-vec-linux-x64/vec0.so')).toBe(
      '/opt/300/resources/app.asar.unpacked/node_modules/sqlite-vec-linux-x64/vec0.so',
    );
  });
  it('não mexe em caminho já desempacotado ou fora do asar', () => {
    const p = '/opt/300/resources/app.asar.unpacked/node_modules/x/vec0.so';
    expect(toUnpackedPath(p)).toBe(p);
    expect(toUnpackedPath('/home/u/proj/node_modules/sqlite-vec-linux-x64/vec0.so')).toBe('/home/u/proj/node_modules/sqlite-vec-linux-x64/vec0.so');
    expect(toUnpackedPath('/home/u/my-app.asar-files/vec0.so')).toBe('/home/u/my-app.asar-files/vec0.so');
  });
});
