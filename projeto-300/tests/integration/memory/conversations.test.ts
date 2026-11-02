import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '@core/memory/database';
import { createStores, type Stores } from '@core/memory/stores';
import type { ChatMessage } from '@core/types';

const iso = (s: number) => new Date(Date.UTC(2026, 10, 2, 10, 0, s)).toISOString();

describe('conversas', () => {
  let db: AppDatabase;
  let s: Stores;
  beforeEach(() => {
    db = openDatabase({ path: ':memory:' });
    s = createStores(db);
  });
  afterEach(() => {
    s.dispose();
    db.close();
  });

  it('partes e conteúdo nativo voltam exatamente iguais', async () => {
    const c = await s.conversations.create('  Planejamento   da semana ');
    expect(c.title).toBe('Planejamento da semana');
    const nativeContent = [
      { type: 'thinking', thinking: 'pensando…\n"aspas" e \\barras\\ e unicode ✓ 🎉', signature: 'EqQBCkgIARABGAIiQAx+/=' },
      { type: 'text', text: 'Olá!', citations: null },
      { type: 'tool_use', id: 'toolu_01', name: 'memory_search', input: { query: 'café', n: 1.5, deep: { a: [1, null, true] } } },
    ];
    const msgs: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Quais minhas tarefas? Também: pão de queijo.' }], createdAt: iso(1) },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Vou ver.' },
          { type: 'tool_call', id: 'toolu_01', name: 'memory_search', input: { query: 'café', n: 1.5, deep: { a: [1, null, true] } } },
        ],
        createdAt: iso(2),
        native: { provider: 'anthropic', model: 'claude-opus-5-5', content: nativeContent },
      },
      {
        id: 't1',
        role: 'tool',
        parts: [{ type: 'tool_result', toolCallId: 'toolu_01', name: 'memory_search', content: [{ type: 'text', text: 'segredo-do-resultado' }], isError: false }],
        createdAt: iso(3),
      },
      { id: 'x1', role: 'context', parts: [{ type: 'text', text: 'Data: 02/11/2026' }], createdAt: iso(4) },
      { id: 'i1', role: 'user', parts: [{ type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' }], createdAt: iso(5) },
    ];
    for (const m of msgs) await s.conversations.append(c.id, m);
    const back = await s.conversations.messages(c.id);
    expect(back).toStrictEqual(msgs);
    expect(JSON.stringify(back[1]!.native)).toBe(JSON.stringify(msgs[1]!.native));
    const list = await s.conversations.list();
    expect(list[0]!.id).toBe(c.id);
    expect(list[0]!.messageCount).toBe(5);
  });

  it('repetir a mesma mensagem não duplica; conversa inexistente é criada', async () => {
    const m: ChatMessage = { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'oi' }], createdAt: iso(1) };
    await s.conversations.append('conv_externa', m);
    await s.conversations.append('conv_externa', m);
    expect(await s.conversations.messages('conv_externa')).toHaveLength(1);
    expect((await s.conversations.list()).find((c) => c.id === 'conv_externa')?.messageCount).toBe(1);
    await expect(s.conversations.append('c', { ...m, role: 'sistema' as never })).rejects.toThrow(/Papel/);
  });

  it('renomeia, lista por atualização e remove em cascata (inclusive índice de texto)', async () => {
    const a = await s.conversations.create();
    expect(a.title).toBe('Nova conversa');
    const b = await s.conversations.create('B');
    await s.conversations.append(a.id, { id: 'm', role: 'user', parts: [{ type: 'text', text: 'abacaxi tropical' }], createdAt: iso(1) });
    await s.conversations.rename(b.id, 'Bê');
    await expect(s.conversations.rename(b.id, '   ')).rejects.toThrow(/vazio/);
    const list = await s.conversations.list(10);
    expect(list.map((c) => c.id)).toContain(b.id);
    expect(list.find((c) => c.id === b.id)!.title).toBe('Bê');
    expect(await s.conversations.searchText('abacaxi')).toHaveLength(1);
    await s.conversations.remove(a.id);
    expect(await s.conversations.messages(a.id)).toEqual([]);
    expect(await s.conversations.searchText('abacaxi')).toEqual([]);
    const fts = db.db.prepare("SELECT count(*) AS n FROM messages_fts WHERE messages_fts MATCH 'abacaxi'").get() as { n: number };
    expect(fts.n).toBe(0);
  });

  it('busca por texto: acentos, trechos, só falas do dono e do 300', async () => {
    const c = await s.conversations.create();
    await s.conversations.append(c.id, { id: 'u', role: 'user', parts: [{ type: 'text', text: 'Qual é a receita do pão de queijo da vovó?' }], createdAt: iso(1) });
    await s.conversations.append(c.id, { id: 'a', role: 'assistant', parts: [{ type: 'text', text: 'Polvilho, queijo minas e ovos.' }], createdAt: iso(2) });
    await s.conversations.append(c.id, {
      id: 't',
      role: 'tool',
      parts: [{ type: 'tool_result', toolCallId: 'x', content: [{ type: 'text', text: 'conteudo de ferramenta polvilho' }] }],
      createdAt: iso(3),
    });
    const r = await s.conversations.searchText('pao queijo vovo');
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ conversationId: c.id, messageId: 'u', createdAt: iso(1) });
    expect(r[0]!.snippet).toContain('«');
    const r2 = await s.conversations.searchText('polvilho');
    expect(r2.map((x) => x.messageId)).toEqual(['a']);
    // todas as palavras não batem -> cai para qualquer palavra
    expect((await s.conversations.searchText('polvilho inexistentexyz')).map((x) => x.messageId)).toEqual(['a']);
    for (const h of ['" OR *', 'NEAR(', '', '((((']) expect(Array.isArray(await s.conversations.searchText(h))).toBe(true);
  });
});
