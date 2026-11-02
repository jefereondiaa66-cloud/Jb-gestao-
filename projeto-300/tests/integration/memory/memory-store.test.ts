import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '@core/memory/database';
import { createStores, type Stores } from '@core/memory/stores';
import type { EmbeddingProvider, MemoryItem } from '@core/types';
import { capturingLogger, FakeEmbeddings, tempDir } from './helpers';

type NewMem = Omit<MemoryItem, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>;
const mem = (content: string, extra: Partial<NewMem> = {}): NewMem => ({
  kind: 'fact',
  content,
  tags: [],
  importance: 0.5,
  source: 'teste',
  sensitive: false,
  ...extra,
});

describe('memória: CRUD e busca por texto', () => {
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

  it('adiciona, lê, altera, lista, conta, exporta e remove', async () => {
    const a = await s.memory.add(mem('O dono prefere café sem açúcar.', { kind: 'preference', tags: [' Bebida ', 'bebida', 'CAFÉ'], importance: 0.8 }));
    expect(a.id).toMatch(/^mem_/);
    expect(a.tags).toEqual(['bebida', 'café']);
    expect(a.accessCount).toBe(0);
    expect(await s.memory.get(a.id)).toEqual(a);
    const u = await s.memory.update(a.id, { content: 'O dono prefere café com pouco açúcar.', importance: 2 });
    expect(u?.content).toBe('O dono prefere café com pouco açúcar.');
    expect(u?.importance).toBe(1);
    expect(u!.updatedAt >= a.updatedAt).toBe(true);
    await s.memory.add(mem('O dono mora em Natal.'));
    expect(await s.memory.count()).toBe(2);
    expect((await s.memory.list({ kind: 'preference' })).map((m) => m.id)).toEqual([a.id]);
    expect(await s.memory.list({ limit: 1 })).toHaveLength(1);
    const exp = await s.memory.exportAll();
    expect(exp.version).toBe(1);
    expect(exp.items).toHaveLength(2);
    expect(await s.memory.remove(a.id)).toBe(true);
    expect(await s.memory.remove(a.id)).toBe(false);
    expect(await s.memory.get(a.id)).toBeNull();
    expect(await s.memory.update('nao-existe', { content: 'x' })).toBeNull();
  });

  it('valida entrada', async () => {
    await expect(s.memory.add(mem('   '))).rejects.toThrow(/conteúdo/);
    await expect(s.memory.add(mem('ok', { kind: 'invalido' as never }))).rejects.toThrow(/Tipo de memória inválido/);
    await expect(s.memory.add(mem('ok', { expiresAt: 'amanhã' }))).rejects.toThrow(/Data inválida/);
    await expect(s.memory.add(mem('x'.repeat(9000)))).rejects.toThrow(/muito longa/);
    const a = await s.memory.add(mem('id fixo', { id: 'mem_fixo' } as never));
    expect(a.id).toBe('mem_fixo');
    await expect(s.memory.add(mem('outro', { id: 'mem_fixo' } as never))).rejects.toThrow(/Já existe/);
  });

  it('acentos: "pao" encontra "pão", "sao paulo" encontra "São Paulo"', async () => {
    await s.memory.add(mem('O dono adora pão de queijo no café da manhã.'));
    await s.memory.add(mem('A irmã do dono mora em São Paulo.', { kind: 'person' }));
    await s.memory.add(mem('Reunião de orçamento toda segunda.'));
    expect((await s.memory.search({ text: 'pao' })).map((r) => r.item.content)).toEqual(['O dono adora pão de queijo no café da manhã.']);
    expect((await s.memory.search({ text: 'PÃO' }))[0]?.item.content).toMatch(/pão de queijo/);
    expect((await s.memory.search({ text: 'sao paulo' }))[0]?.item.content).toMatch(/São Paulo/);
    expect((await s.memory.search({ text: 'orcamento' }))[0]?.item.content).toMatch(/orçamento/);
    // prefixo
    expect((await s.memory.search({ text: 'queij' }))[0]?.item.content).toMatch(/queijo/);
    const r = await s.memory.search({ text: 'pao' });
    expect(r[0]!.matchedBy).toEqual(['fts']);
  });

  it('consultas hostis não quebram nem vazam sintaxe FTS', async () => {
    await s.memory.add(mem('Senha do wifi fica com o dono.'));
    await s.memory.add(mem('O dono gosta de rock.'));
    const hostile = ['" OR 1=1 --', 'NEAR(dono rock)', 'content:rock', '*', '"', "'; DROP TABLE memories; --", 'rock" OR "x', '((((', '\u0000'];
    for (const h of hostile) {
      const r = await s.memory.search({ text: h });
      expect(Array.isArray(r)).toBe(true);
    }
    expect((await s.memory.search({ text: 'rock" OR "x' }))[0]?.item.content).toMatch(/rock/);
    expect(await s.memory.count()).toBe(2);
  });

  it('sensíveis ficam fora da busca, a não ser com includeSensitive', async () => {
    await s.memory.add(mem('O CPF do dono está guardado no cofre azul.', { sensitive: true }));
    await s.memory.add(mem('O cofre azul fica no escritório.'));
    const normal = await s.memory.search({ text: 'cofre azul' });
    expect(normal.map((r) => r.item.sensitive)).toEqual([false]);
    const all = await s.memory.search({ text: 'cofre azul', includeSensitive: true });
    expect(all).toHaveLength(2);
    const browse = await s.memory.search({});
    expect(browse.every((r) => !r.item.sensitive)).toBe(true);
  });

  it('expiradas não aparecem e são removidas ao abrir', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();
    await s.memory.add(mem('Promoção de pizza vale até ontem.', { expiresAt: past }));
    await s.memory.add(mem('Promoção de pizza da semana que vem.', { expiresAt: future }));
    const r = await s.memory.search({ text: 'pizza' });
    expect(r.map((x) => x.item.content)).toEqual(['Promoção de pizza da semana que vem.']);
    expect(await s.memory.list()).toHaveLength(1);
    expect(await s.memory.count()).toBe(1);
    // nova abertura dos repositórios limpa o expirado
    const s2 = createStores(db);
    expect((await s2.memory.exportAll()).items).toHaveLength(1);
    s2.dispose();
    // remover expiração
    const item = (await s.memory.list())[0]!;
    const u = await s.memory.update(item.id, { expiresAt: '' });
    expect(u?.expiresAt).toBeUndefined();
  });

  it('atualiza estatísticas de acesso (exceto com touch: false)', async () => {
    const a = await s.memory.add(mem('O dono torce para o Vasco.'));
    const r1 = await s.memory.search({ text: 'vasco' });
    expect(r1[0]!.item.accessCount).toBe(1);
    expect(r1[0]!.item.lastAccessedAt).toBeDefined();
    await s.memory.search({ text: 'vasco' });
    expect((await s.memory.get(a.id))!.accessCount).toBe(2);
    await s.memory.search({ text: 'vasco', touch: false } as never);
    expect((await s.memory.get(a.id))!.accessCount).toBe(2);
    expect((await s.memory.get(a.id))!.updatedAt).toBe(a.updatedAt);
  });

  it('filtros por tipo e etiquetas', async () => {
    await s.memory.add(mem('Projeto Atlas usa React.', { kind: 'project', tags: ['trabalho', 'atlas'] }));
    await s.memory.add(mem('Projeto de horta em casa usa React de brincadeira.', { kind: 'project', tags: ['casa'] }));
    await s.memory.add(mem('React é uma biblioteca.', { kind: 'knowledge', tags: ['trabalho'] }));
    expect(await s.memory.search({ text: 'react', kinds: ['project'] })).toHaveLength(2);
    expect((await s.memory.search({ text: 'react', tags: ['Trabalho'] })).map((r) => r.item.kind).sort()).toEqual(['knowledge', 'project']);
    expect(await s.memory.search({ text: 'react', tags: ['trabalho', 'atlas'] })).toHaveLength(1);
    expect(await s.memory.search({ text: 'react', kinds: ['nada' as never] })).toEqual([]);
  });

  it('sem texto: recentes e importantes, marcadas como recency', async () => {
    await s.memory.add(mem('pouco importante', { importance: 0.1 }));
    await new Promise((r) => setTimeout(r, 5));
    await s.memory.add(mem('muito importante', { importance: 0.95 }));
    const r = await s.memory.search({ limit: 5 });
    expect(r[0]!.item.content).toBe('muito importante');
    expect(r.every((x) => x.matchedBy.join() === 'recency')).toBe(true);
  });

  it('texto sem nenhum resultado devolve vazio (não inventa)', async () => {
    await s.memory.add(mem('O dono gosta de jazz.'));
    expect(await s.memory.search({ text: 'futebol' })).toEqual([]);
  });

  it('memórias apagadas somem do índice de texto', async () => {
    const a = await s.memory.add(mem('Lembrete sobre girassol.'));
    expect(await s.memory.search({ text: 'girassol' })).toHaveLength(1);
    await s.memory.update(a.id, { content: 'Lembrete sobre margarida.' });
    expect(await s.memory.search({ text: 'girassol' })).toHaveLength(0);
    expect(await s.memory.search({ text: 'margarida' })).toHaveLength(1);
    await s.memory.remove(a.id);
    expect(await s.memory.search({ text: 'margarida' })).toHaveLength(0);
  });
});

function vecCount(db: AppDatabase): number {
  return (db.db.prepare('SELECT count(*) AS n FROM memory_vec').get() as { n: number }).n;
}

describe('memória: vetores e busca híbrida', () => {
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());

  it('busca por significado (sinônimo) via vetores', async () => {
    const db = openDatabase({ path: join(t.dir, 'v.db'), key: 'k' });
    const emb = new FakeEmbeddings();
    const s = createStores(db, { embeddings: emb });
    await s.memory.add(mem('O dono tem um cão chamado Rex.', { kind: 'person' }));
    await s.memory.add(mem('O dono comprou um carro vermelho.'));
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(2);
    const r = await s.memory.search({ text: 'cachorro' });
    expect(r[0]?.item.content).toMatch(/cão chamado Rex/);
    expect(r[0]?.matchedBy).toEqual(['vector']);
    expect(r.some((x) => /carro/.test(x.item.content))).toBe(false); // distância alta fica de fora
    s.dispose();
    db.close();
  });

  it('ranking híbrido: texto + vetor fica acima de só texto', async () => {
    const db = openDatabase({ path: ':memory:' });
    const s = createStores(db, { embeddings: new FakeEmbeddings() });
    // "cachorro" aparece nas duas; só a primeira também é parecida no vetor (cão/cachorro)
    const onlyFts = await s.memory.add(mem('Ração de cachorro na promoção do mercado do bairro com cupom de desconto e entrega grátis amanhã.'));
    const both = await s.memory.add(mem('O cachorro do dono é um cão muito calmo.'));
    await s.memory.whenEmbeddingsIdle();
    const r = await s.memory.search({ text: 'cachorro cão' });
    expect(r[0]!.item.id).toBe(both.id);
    expect(r[0]!.matchedBy).toEqual(['fts', 'vector']);
    expect(r.find((x) => x.item.id === onlyFts.id)?.matchedBy).toContain('fts');
    expect(r[0]!.score).toBeGreaterThan(r.find((x) => x.item.id === onlyFts.id)!.score);
    s.dispose();
    db.close();
  });

  it('memórias sensíveis nunca vão para o provedor de embeddings', async () => {
    const db = openDatabase({ path: ':memory:' });
    const emb = new FakeEmbeddings();
    const s = createStores(db, { embeddings: emb });
    const a = await s.memory.add(mem('Diagnóstico médico confidencial do dono.', { sensitive: true }));
    await s.memory.add(mem('O dono gosta de pescar.'));
    await s.memory.whenEmbeddingsIdle();
    expect(emb.textsSeen.some((x) => /confidencial/.test(x))).toBe(false);
    expect(vecCount(db)).toBe(1);
    // Ao virar sensível, o vetor sai
    const b = (await s.memory.search({ text: 'pescar' }))[0]!.item;
    await s.memory.update(b.id, { sensitive: true });
    expect(vecCount(db)).toBe(0);
    // Ao deixar de ser sensível, volta a ter vetor
    await s.memory.update(a.id, { sensitive: false });
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(1);
    s.dispose();
    db.close();
  });

  it('alteração de conteúdo gera novo vetor; remoção apaga o vetor', async () => {
    const db = openDatabase({ path: ':memory:' });
    const emb = new FakeEmbeddings();
    const s = createStores(db, { embeddings: emb });
    const a = await s.memory.add(mem('O dono tem um carro azul.'));
    await s.memory.whenEmbeddingsIdle();
    await s.memory.update(a.id, { content: 'O dono tem um cachorro preto.' });
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(1);
    expect((await s.memory.search({ text: 'cão' }))[0]?.item.id).toBe(a.id);
    await s.memory.remove(a.id);
    expect(vecCount(db)).toBe(0);
    s.dispose();
    db.close();
  });

  it('falha de embeddings: salvar continua funcionando e a busca cai para texto', async () => {
    const db = openDatabase({ path: ':memory:' });
    const emb = new FakeEmbeddings();
    emb.failing = true;
    const logger = capturingLogger();
    const s = createStores(db, { embeddings: emb, logger, vector: { retryBaseMs: 60_000 } });
    const a = await s.memory.add(mem('O dono estuda violão às terças.'));
    await s.memory.whenEmbeddingsIdle();
    expect(await s.memory.get(a.id)).not.toBeNull();
    const r = await s.memory.search({ text: 'violao' });
    expect(r[0]?.item.id).toBe(a.id);
    expect(r[0]?.matchedBy).toEqual(['fts']);
    expect(logger.lines.some((l) => l.level === 'warn' && /embeddings falharam/.test(l.msg))).toBe(true);
    expect(logger.lines.some((l) => l.level === 'warn' && /busca por vetores falhou/.test(l.msg))).toBe(true);
    // Provedor volta: troca de provedor reprocessa
    emb.failing = false;
    s.memory.setEmbeddingProvider(emb);
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(1);
    s.dispose();
    db.close();
  });

  it('depois de uma falha, espera antes de tentar de novo (não insiste a cada memória nova)', async () => {
    const db = openDatabase({ path: ':memory:' });
    const emb = new FakeEmbeddings();
    emb.failing = true;
    const s = createStores(db, { embeddings: emb, vector: { retryBaseMs: 60_000 } });
    await s.memory.add(mem('Primeira memória.'));
    await s.memory.whenEmbeddingsIdle();
    expect(emb.calls).toBe(1);
    await s.memory.add(mem('Segunda memória.'));
    await s.memory.add(mem('Terceira memória.'));
    await s.memory.whenEmbeddingsIdle();
    expect(emb.calls).toBe(1);
    expect(s.memory.vectors.pendingCount()).toBe(3);
    s.dispose();
    db.close();
  });

  it('troca de modelo/dimensões recria o índice e reprocessa aos poucos', async () => {
    const path = join(t.dir, 'troca.db');
    const db = openDatabase({ path, key: 'k' });
    const s = createStores(db, { embeddings: new FakeEmbeddings({ model: 'v1', dimensions: 64 }), vector: { batchSize: 2 } });
    for (let i = 0; i < 5; i++) await s.memory.add(mem(`Memória número ${i} sobre carro.`));
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(5);
    s.dispose();
    db.close();

    const db2 = openDatabase({ path, key: 'k' });
    const emb2 = new FakeEmbeddings({ model: 'v2', dimensions: 32 });
    const s2 = createStores(db2, { embeddings: emb2, vector: { batchSize: 2 } });
    await s2.memory.whenEmbeddingsIdle();
    expect(emb2.calls).toBe(3); // 5 memórias em lotes de 2
    expect(vecCount(db2)).toBe(5);
    const meta = Object.fromEntries((db2.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    expect(meta['vec.model']).toBe('fake:v2');
    expect(meta['vec.dims']).toBe('32');
    expect((await s2.memory.search({ text: 'automóvel' })).length).toBeGreaterThan(0);
    s2.dispose();
    db2.close();

    // Mesmo modelo de novo: nada a reprocessar
    const db3 = openDatabase({ path, key: 'k' });
    const emb3 = new FakeEmbeddings({ model: 'v2', dimensions: 32 });
    const s3 = createStores(db3, { embeddings: emb3 });
    await s3.memory.whenEmbeddingsIdle();
    expect(emb3.calls).toBe(0);
    s3.dispose();
    db3.close();
  });

  it('vetores órfãos (memória apagada ou marcada sensível sem a extensão carregada) são limpos depois', async () => {
    const path = join(t.dir, 'orfaos.db');
    const db = openDatabase({ path, key: 'k' });
    const s = createStores(db, { embeddings: new FakeEmbeddings() });
    const a = await s.memory.add(mem('Memória que será apagada sem vetores.'));
    await s.memory.add(mem('Memória que fica.'));
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(2);
    s.dispose();
    db.close();

    const noVec = openDatabase({ path, key: 'k', vectorExtensionPath: null });
    const s2 = createStores(noVec, { embeddings: new FakeEmbeddings() });
    expect(await s2.memory.remove(a.id)).toBe(true);
    expect(await s2.memory.count()).toBe(1);
    // Marcada como sensível sem a extensão: o vetor antigo não pode ficar no índice.
    const keep = (await s2.memory.list())[0]!;
    await s2.memory.update(keep.id, { sensitive: true });
    s2.dispose();
    noVec.close();

    const db3 = openDatabase({ path, key: 'k' });
    const emb = new FakeEmbeddings();
    const s3 = createStores(db3, { embeddings: emb });
    await s3.memory.whenEmbeddingsIdle();
    expect(vecCount(db3)).toBe(0);
    expect(emb.calls).toBe(0);
    expect(await s3.memory.count()).toBe(1);
    s3.dispose();
    db3.close();
  });

  it('dimensões desconhecidas são descobertas no primeiro embedding', async () => {
    const db = openDatabase({ path: ':memory:' });
    const inner = new FakeEmbeddings({ dimensions: 48 });
    let dims = 0;
    const lazy: EmbeddingProvider = {
      id: 'lazy',
      model: 'auto',
      get dimensions() {
        return dims;
      },
      async embed(texts) {
        const v = await inner.embed(texts);
        dims = 48;
        return v;
      },
    };
    const s = createStores(db, { embeddings: lazy });
    await s.memory.add(mem('O dono tem um cachorro.'));
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(1);
    expect(inner.calls).toBe(1); // o primeiro lote é aproveitado
    expect((await s.memory.search({ text: 'cão' }))[0]?.matchedBy).toEqual(['vector']);
    s.dispose();
    db.close();
  });

  it('consulta com texto sensível (ou vectors: false) não vai para o provedor de embeddings', async () => {
    const db = openDatabase({ path: ':memory:' });
    const emb = new FakeEmbeddings();
    const s = createStores(db, { embeddings: emb });
    await s.memory.add(mem('O dono tem um cão chamado Rex.'));
    await s.memory.whenEmbeddingsIdle();
    emb.textsSeen = [];
    // Documento, senha e saúde na consulta: só busca por texto
    await s.memory.search({ text: 'meu CPF é 529.982.247-25, e o cão?' });
    await s.memory.search({ text: 'qual a senha do banco do cachorro' });
    await s.memory.search({ text: 'remédio do cachorro', includeSensitive: true });
    expect(emb.textsSeen).toEqual([]);
    // Pedido explícito de não usar vetores
    const r = await s.memory.search({ text: 'cachorro', vectors: false });
    expect(emb.textsSeen).toEqual([]);
    expect(r).toEqual([]); // "cachorro" só seria achado por significado
    // Consulta comum continua usando vetores
    expect((await s.memory.search({ text: 'cachorro' }))[0]?.matchedBy).toEqual(['vector']);
    expect(emb.textsSeen).toEqual(['cachorro']);
    s.dispose();
    db.close();
  });

  it('provedor travado que ignora o cancelamento não trava a busca nem o índice', async () => {
    const db = openDatabase({ path: ':memory:' });
    const logger = capturingLogger();
    let calls = 0;
    const stuck: EmbeddingProvider = {
      id: 'travado',
      model: 'x',
      dimensions: 64,
      embed() {
        calls++;
        return new Promise<Float32Array[]>(() => {}); // nunca responde e ignora o sinal
      },
    };
    const s = createStores(db, { embeddings: stuck, logger, vector: { queryTimeoutMs: 50, batchTimeoutMs: 50, retryBaseMs: 60_000 } });
    const a = await s.memory.add(mem('O dono estuda violão às terças.'));
    await s.memory.whenEmbeddingsIdle(); // antes: esperava para sempre
    expect(calls).toBe(1);
    const t0 = Date.now();
    const r = await s.memory.search({ text: 'violao' });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r[0]?.item.id).toBe(a.id);
    expect(r[0]?.matchedBy).toEqual(['fts']);
    // Trocar para um provedor que funciona libera o índice
    s.memory.setEmbeddingProvider(new FakeEmbeddings());
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(1);
    s.dispose();
    db.close();
  });

  it('modelo que muda de dimensões com o mesmo nome: índice é recriado e reprocessado', async () => {
    const path = join(t.dir, 'dims.db');
    // Provedor tipo Ollama: dimensões só são conhecidas depois da primeira chamada.
    const lazy = (dims: number): EmbeddingProvider & { inner: FakeEmbeddings } => {
      const inner = new FakeEmbeddings({ dimensions: dims });
      let known = 0;
      return {
        inner,
        id: 'ollama',
        model: 'modelo-local',
        get dimensions() {
          return known;
        },
        async embed(texts) {
          const v = await inner.embed(texts);
          known = dims;
          return v;
        },
      };
    };
    const db = openDatabase({ path, key: 'k' });
    const s = createStores(db, { embeddings: lazy(48) });
    await s.memory.add(mem('O dono tem um cão chamado Rex.'));
    await s.memory.add(mem('O dono comprou um carro vermelho.'));
    await s.memory.whenEmbeddingsIdle();
    s.dispose();
    db.close();

    const db2 = openDatabase({ path, key: 'k' });
    const p2 = lazy(32);
    const logger = capturingLogger();
    const s2 = createStores(db2, { embeddings: p2, logger });
    await s2.memory.whenEmbeddingsIdle();
    expect(p2.inner.calls).toBe(0); // nada pendente: o índice antigo (48) parecia compatível
    await s2.memory.search({ text: 'cachorro' }); // a consulta revela 32 dimensões
    await s2.memory.whenEmbeddingsIdle();
    expect(logger.lines.some((l) => /mudou de dimens/.test(l.msg))).toBe(true);
    expect(vecCount(db2)).toBe(2);
    const meta = Object.fromEntries((db2.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    expect(meta['vec.dims']).toBe('32');
    expect((await s2.memory.search({ text: 'cachorro' }))[0]?.item.content).toMatch(/cão chamado Rex/); // antes: vetores mudos para sempre
    s2.dispose();
    db2.close();
  });

  it('troca de provedor no meio de um lote: nada do provedor antigo é gravado', async () => {
    const db = openDatabase({ path: ':memory:' });
    const slowInner = new FakeEmbeddings({ id: 'lento', model: 'a', dimensions: 64 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: EmbeddingProvider = {
      id: 'lento',
      model: 'a',
      dimensions: 64,
      async embed(texts) {
        await gate; // segura o lote (e ignora o cancelamento de propósito)
        return slowInner.embed(texts);
      },
    };
    const s = createStores(db, { embeddings: slow, vector: { batchTimeoutMs: 60_000 } });
    await s.memory.add(mem('O dono tem um cão chamado Rex.'));
    await new Promise((r) => setTimeout(r, 10)); // lote do provedor lento começou
    const fast = new FakeEmbeddings({ id: 'rapido', model: 'b', dimensions: 32 });
    s.memory.setEmbeddingProvider(fast);
    release();
    await s.memory.whenEmbeddingsIdle();
    expect(vecCount(db)).toBe(1);
    const meta = Object.fromEntries((db.db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((r) => [r.key, r.value]));
    expect(meta['vec.model']).toBe('rapido:b');
    expect(meta['vec.dims']).toBe('32');
    const sig = (db.db.prepare('SELECT embedding_sig AS s FROM memories').get() as { s: string }).s;
    expect(sig).toBe('rapido:b:32');
    expect((await s.memory.search({ text: 'cachorro' }))[0]?.matchedBy).toEqual(['vector']);
    s.dispose();
    db.close();
  });

  it('busca com sinal já cancelado não trava e cai para texto', async () => {
    const db = openDatabase({ path: ':memory:' });
    const s = createStores(db, { embeddings: new FakeEmbeddings() });
    const a = await s.memory.add(mem('O dono estuda violão às terças.'));
    await s.memory.whenEmbeddingsIdle();
    const ac = new AbortController();
    ac.abort(new Error('parado'));
    const r = await s.memory.search({ text: 'violao', signal: ac.signal });
    expect(r.map((x) => x.item.id)).toEqual([a.id]);
    expect(r[0]!.matchedBy).toEqual(['fts']);
    s.dispose();
    db.close();
  });

  it('sem nada vetorizado ainda, a consulta não chama o provedor à toa', async () => {
    const db = openDatabase({ path: ':memory:' });
    let calls = 0;
    const lazy: EmbeddingProvider = {
      id: 'lazy',
      model: 'auto',
      dimensions: 0,
      async embed(texts) {
        calls++;
        return texts.map(() => new Float32Array([1, 0, 0]));
      },
    };
    const s = createStores(db, { embeddings: lazy });
    await s.memory.whenEmbeddingsIdle();
    expect(await s.memory.search({ text: 'qualquer coisa' })).toEqual([]);
    expect(calls).toBe(0);
    s.dispose();
    db.close();
  });

  it('sem extensão de vetores: tudo funciona só com texto', async () => {
    const db = openDatabase({ path: ':memory:', vectorExtensionPath: null });
    const emb = new FakeEmbeddings();
    const s = createStores(db, { embeddings: emb });
    await s.memory.add(mem('O dono tem um cão.'));
    await s.memory.whenEmbeddingsIdle();
    expect(emb.calls).toBe(0);
    expect((await s.memory.search({ text: 'cão' }))[0]?.matchedBy).toEqual(['fts']);
    expect(await s.memory.search({ text: 'cachorro' })).toEqual([]);
    s.dispose();
    db.close();
  });
});
