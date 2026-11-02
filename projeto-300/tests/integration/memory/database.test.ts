import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DatabaseKeyError, openDatabase, type AppDatabase } from '@core/memory/database';
import { LATEST_SCHEMA_VERSION, MIGRATIONS, runMigrations } from '@core/memory/schema';
import { createStores } from '@core/memory/stores';
import { capturingLogger, tempDir } from './helpers';

const MARKER = 'segredo-marcador-XYZ-pão-de-queijo';

function fileBytes(path: string): Buffer {
  const parts = [path, `${path}-wal`, `${path}-shm`].filter((p) => existsSync(p)).map((p) => readFileSync(p));
  return Buffer.concat(parts);
}

describe('banco de dados (SQLCipher)', () => {
  let t: ReturnType<typeof tempDir>;
  const open: AppDatabase[] = [];
  const track = (db: AppDatabase) => (open.push(db), db);

  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => {
    for (const db of open.splice(0)) db.close();
    t.cleanup();
  });

  it('criptografa: arquivo e WAL não têm texto legível; reabre com a chave certa', async () => {
    const path = join(t.dir, 'sub', 'dados.db');
    const db = track(openDatabase({ path, key: 'minha frase secreta com acentuação ç' }));
    expect(db.encrypted).toBe(true);
    const stores = createStores(db);
    await stores.memory.add({ kind: 'fact', content: MARKER, tags: ['marcador'], importance: 0.5, source: 'teste', sensitive: false });
    await stores.conversations.append('c1', { id: 'm1', role: 'user', parts: [{ type: 'text', text: MARKER }], createdAt: new Date().toISOString() });
    // Com o banco aberto (dados ainda no WAL)
    const during = fileBytes(path);
    expect(during.includes(Buffer.from(MARKER))).toBe(false);
    expect(during.includes(Buffer.from('marcador'))).toBe(false);
    expect(during.subarray(0, 15).toString('latin1')).not.toBe('SQLite format 3');
    stores.dispose();
    db.close();
    const after = fileBytes(path);
    expect(after.length).toBeGreaterThan(0);
    expect(after.includes(Buffer.from(MARKER))).toBe(false);
    expect(after.includes(Buffer.from('CREATE TABLE'))).toBe(false);

    const again = track(openDatabase({ path, key: 'minha frase secreta com acentuação ç' }));
    const s2 = createStores(again);
    const found = await s2.memory.search({ text: 'pão de queijo' });
    expect(found.map((r) => r.item.content)).toContain(MARKER);
    s2.dispose();
  });

  it('chave errada falha com mensagem clara', () => {
    const path = join(t.dir, 'a.db');
    openDatabase({ path, key: 'certa' }).close();
    let err: unknown;
    try {
      openDatabase({ path, key: 'errada' });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DatabaseKeyError);
    expect((err as DatabaseKeyError).code).toBe('DB_KEY_MISMATCH');
    expect((err as Error).message).toMatch(/A chave do banco de dados não confere/);
  });

  it('banco criptografado sem chave é recusado', () => {
    const path = join(t.dir, 'b.db');
    openDatabase({ path, key: 'k1' }).close();
    expect(() => openDatabase({ path })).toThrow(/criptografado e nenhuma chave/);
  });

  it('chave bruta de 64 caracteres hexadecimais (sem PBKDF2) funciona e é diferente da frase', () => {
    const path = join(t.dir, 'raw.db');
    const raw = 'a'.repeat(32) + '0123456789abcdef0123456789ABCDEF';
    const db = openDatabase({ path, key: raw });
    db.db.exec("CREATE TABLE x(v); INSERT INTO x VALUES ('ok')");
    db.close();
    const db2 = track(openDatabase({ path, key: raw.toLowerCase() }));
    expect(db2.db.prepare('SELECT v FROM x').get()).toEqual({ v: 'ok' });
  });

  it('aspas e caracteres especiais na chave não quebram o PRAGMA', () => {
    const path = join(t.dir, 'q.db');
    const key = `a'b"c\\d; DROP TABLE memories; --'`;
    openDatabase({ path, key }).close();
    const db = track(openDatabase({ path, key }));
    expect(db.encrypted).toBe(true);
    expect(() => openDatabase({ path, key: `a'b"c\\d` })).toThrow(DatabaseKeyError);
  });

  it('sem chave: banco comum (cabeçalho SQLite visível)', () => {
    const path = join(t.dir, 'plain.db');
    const db = openDatabase({ path });
    expect(db.encrypted).toBe(false);
    db.close();
    expect(readFileSync(path).subarray(0, 15).toString('latin1')).toBe('SQLite format 3');
  });

  it('banco antigo sem criptografia: recusa com chave, ou criptografa quando pedido', async () => {
    const path = join(t.dir, 'antigo.db');
    const plain = openDatabase({ path });
    const st = createStores(plain);
    await st.memory.add({ kind: 'fact', content: MARKER, tags: [], importance: 0.5, source: 't', sensitive: false });
    st.dispose();
    plain.close();
    expect(() => openDatabase({ path, key: 'nova' })).toThrow(/não está criptografado/);
    const enc = openDatabase({ path, key: 'nova', encryptPlaintext: true });
    expect(enc.encrypted).toBe(true);
    const s2 = createStores(enc);
    expect((await s2.memory.list()).map((m) => m.content)).toEqual([MARKER]);
    s2.dispose();
    enc.close();
    expect(fileBytes(path).includes(Buffer.from(MARKER))).toBe(false);
    expect(() => openDatabase({ path })).toThrow(DatabaseKeyError);
  });

  it('arquivo que não é banco é recusado', () => {
    const path = join(t.dir, 'lixo.db');
    writeFileSync(path, Buffer.alloc(4096, 7));
    expect(() => openDatabase({ path })).toThrow(DatabaseKeyError);
  });

  it('configura WAL, chaves estrangeiras e busy_timeout', () => {
    const db = track(openDatabase({ path: join(t.dir, 'p.db'), key: 'k', busyTimeoutMs: 2500 }));
    expect(String(db.db.pragma('journal_mode', { simple: true }))).toBe('wal');
    expect(db.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.db.pragma('busy_timeout', { simple: true })).toBe(2500);
  });

  it('banco em memória funciona (chave ignorada)', async () => {
    const db = track(openDatabase({ path: ':memory:', key: 'qualquer' }));
    expect(db.encrypted).toBe(false);
    const st = createStores(db);
    await st.tasks.create({ title: 'teste' });
    expect(await st.tasks.list()).toHaveLength(1);
    st.dispose();
  });
});

describe('migrações', () => {
  let t: ReturnType<typeof tempDir>;
  beforeEach(() => {
    t = tempDir();
  });
  afterEach(() => t.cleanup());

  it('são idempotentes e registram a versão', () => {
    const path = join(t.dir, 'm.db');
    const db = openDatabase({ path, key: 'k' });
    expect(db.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(runMigrations(db.db)).toBe(LATEST_SCHEMA_VERSION);
    expect(runMigrations(db.db)).toBe(LATEST_SCHEMA_VERSION);
    const tables = (db.db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table') ORDER BY name").all() as { name: string }[]).map((r) => r.name);
    for (const name of ['meta', 'memories', 'memories_fts', 'conversations', 'messages', 'messages_fts', 'tasks', 'schedules', 'job_runs', 'audit']) {
      expect(tables).toContain(name);
    }
    db.close();
    const again = openDatabase({ path, key: 'k' });
    expect(again.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    again.close();
  });

  it('cada migração roda em transação: falha no meio não deixa nada pela metade', () => {
    const db = openDatabase({ path: ':memory:', vectorExtensionPath: null });
    const bad = [
      ...MIGRATIONS,
      {
        version: LATEST_SCHEMA_VERSION + 1,
        description: 'quebrada',
        up(d: typeof db.db) {
          d.exec('CREATE TABLE nova_tabela (x)');
          d.exec('ISSO NÃO É SQL');
        },
      },
    ];
    expect(() => runMigrations(db.db, bad)).toThrow();
    expect(db.db.pragma('user_version', { simple: true })).toBe(LATEST_SCHEMA_VERSION);
    expect(db.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'nova_tabela'").get()).toBeUndefined();
    db.close();
  });

  it('recusa banco de versão mais nova', () => {
    const path = join(t.dir, 'n.db');
    const db = openDatabase({ path });
    db.db.pragma(`user_version = ${LATEST_SCHEMA_VERSION + 5}`);
    db.close();
    expect(() => openDatabase({ path })).toThrow(/versão mais nova/);
  });
});

describe('extensão de vetores', () => {
  it('carrega o sqlite-vec quando disponível', () => {
    const db = openDatabase({ path: ':memory:' });
    expect(db.vectorAvailable).toBe(true);
    expect(db.vectorVersion).toMatch(/^v\d/);
    db.close();
  });

  it('falha ao carregar não derruba o banco (segue sem vetores)', async () => {
    const logger = capturingLogger();
    const db = openDatabase({ path: ':memory:', vectorExtensionPath: '/caminho/que/nao/existe/vec0.so', logger });
    expect(db.vectorAvailable).toBe(false);
    expect(logger.lines.some((l) => l.level === 'warn' && /vetores indispon/.test(l.msg))).toBe(true);
    const st = createStores(db);
    await st.memory.add({ kind: 'fact', content: 'funciona sem vetores', tags: [], importance: 0.5, source: 't', sensitive: false });
    expect(await st.memory.search({ text: 'vetores' })).toHaveLength(1);
    st.dispose();
    db.close();
  });
});
