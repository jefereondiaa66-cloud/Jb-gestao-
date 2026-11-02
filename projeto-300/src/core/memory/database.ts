/**
 * Banco de dados local do 300: SQLite com criptografia SQLCipher
 * (better-sqlite3-multiple-ciphers), FTS5 e, quando possível, sqlite-vec.
 *
 * A chave nunca é interpolada como texto livre no SQL: ela vira hexadecimal
 * (só 0-9a-f), então não há como "escapar" do PRAGMA.
 */
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3-multiple-ciphers';
import { getLoadablePath } from 'sqlite-vec';
import type { Logger } from '../types';
import { LATEST_SCHEMA_VERSION, runMigrations } from './schema';

export type SqliteDb = Database.Database;

export interface OpenDatabaseOptions {
  /** Caminho do arquivo ou ':memory:'. */
  path: string;
  /** Chave de criptografia. Vazio/ausente = banco sem criptografia (só testes). */
  key?: string;
  logger?: Logger;
  /**
   * Se existir um banco antigo SEM criptografia e uma chave for informada,
   * criptografa o arquivo no lugar (padrão: false = recusa com erro claro).
   */
  encryptPlaintext?: boolean;
  /**
   * Caminho da extensão sqlite-vec. undefined = usa o pacote 'sqlite-vec';
   * null = não carrega vetores (busca só por texto).
   */
  vectorExtensionPath?: string | null;
  /** Tempo de espera por bloqueio (ms). */
  busyTimeoutMs?: number;
}

export interface AppDatabase {
  readonly db: SqliteDb;
  readonly path: string;
  readonly encrypted: boolean;
  /** sqlite-vec carregado? Se false, a memória usa só busca por texto. */
  readonly vectorAvailable: boolean;
  readonly vectorVersion?: string;
  readonly schemaVersion: number;
  readonly open: boolean;
  close(): void;
}

export class DatabaseKeyError extends Error {
  readonly code: 'DB_KEY_MISMATCH' | 'DB_KEY_MISSING' | 'DB_NOT_ENCRYPTED';
  constructor(code: DatabaseKeyError['code'], message: string) {
    super(message);
    this.name = 'DatabaseKeyError';
    this.code = code;
  }
}

const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'latin1');
const RAW_KEY = /^[0-9a-fA-F]{64}$/;

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

/** Em app empacotado, binários nativos ficam em app.asar.unpacked (não dá para carregar de dentro do .asar). */
export function toUnpackedPath(p: string): string {
  return p.replace(/([\\/])app\.asar(?=[\\/])/, '$1app.asar.unpacked');
}

type FileState = 'missing' | 'empty' | 'plain' | 'encrypted';

function fileState(path: string): FileState {
  if (!existsSync(path)) return 'missing';
  const size = statSync(path).size;
  if (size === 0) return 'empty';
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = readSync(fd, buf, 0, 16, 0);
    return n === 16 && buf.equals(SQLITE_HEADER) ? 'plain' : 'encrypted';
  } finally {
    closeSync(fd);
  }
}

/** Converte a chave em PRAGMA seguro. 64 hex = chave bruta de 256 bits; senão, frase passa pelo PBKDF2 do SQLCipher. */
function keyPragma(key: string, rekey = false): string {
  if (RAW_KEY.test(key)) return `${rekey ? 'rekey' : 'key'}="x'${key.toLowerCase()}'"`;
  const hex = Buffer.from(key, 'utf8').toString('hex');
  return `${rekey ? 'hexrekey' : 'hexkey'}='${hex}'`;
}

function applyCipher(db: SqliteDb, key: string, rekey = false): void {
  db.pragma(`cipher='sqlcipher'`);
  db.pragma('legacy=4');
  const res = db.pragma(keyPragma(key, rekey)) as { ok?: string }[] | undefined;
  const first = Array.isArray(res) ? res[0] : undefined;
  if (first && typeof first === 'object' && 'ok' in first && first.ok !== 'ok') {
    throw new Error(`não foi possível aplicar a chave do banco: ${String(first.ok)}`);
  }
}

function isNotADb(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | undefined;
  return e?.code === 'SQLITE_NOTADB' || /file is not a database/i.test(e?.message ?? '');
}

function verifyReadable(db: SqliteDb): void {
  db.prepare('SELECT count(*) AS n FROM sqlite_master').get();
}

export function openDatabase(opts: OpenDatabaseOptions): AppDatabase {
  const logger = opts.logger ?? silentLogger;
  const memory = opts.path === ':memory:';
  const path = memory ? ':memory:' : resolve(opts.path);
  const key = opts.key ?? '';
  const busy = opts.busyTimeoutMs ?? 5000;
  let encrypted = false;

  if (!memory) {
    mkdirSync(dirname(path), { recursive: true });
    const state = fileState(path);
    if (state === 'encrypted' && !key) {
      throw new DatabaseKeyError('DB_KEY_MISSING', 'O banco de dados está criptografado e nenhuma chave foi informada.');
    }
    if (state === 'plain' && key) {
      if (!opts.encryptPlaintext) {
        throw new DatabaseKeyError(
          'DB_NOT_ENCRYPTED',
          'O banco de dados existente não está criptografado. Abra com a opção de criptografar o arquivo ou mova-o para outra pasta.',
        );
      }
      encryptInPlace(path, key, logger);
    }
  }

  const db = new Database(path, { timeout: busy });
  try {
    if (key && !memory) {
      applyCipher(db, key);
      try {
        verifyReadable(db);
      } catch (err) {
        if (isNotADb(err)) throw new DatabaseKeyError('DB_KEY_MISMATCH', 'A chave do banco de dados não confere. Os dados não puderam ser abertos.');
        throw err;
      }
      encrypted = true;
    } else {
      if (key && memory) logger.debug('banco em memória: criptografia não se aplica');
      try {
        verifyReadable(db);
      } catch (err) {
        if (isNotADb(err)) throw new DatabaseKeyError('DB_KEY_MISSING', 'O arquivo não é um banco de dados válido ou está criptografado com outra chave.');
        throw err;
      }
    }

    if (!memory) {
      const mode = String(db.pragma('journal_mode = WAL', { simple: true }));
      if (mode.toLowerCase() !== 'wal') logger.warn('banco: modo WAL indisponível', { mode });
      db.pragma('synchronous = NORMAL');
    }
    db.pragma('foreign_keys = ON');
    db.pragma(`busy_timeout = ${Math.max(0, Math.floor(busy))}`);
    // Dados temporários (ordenações, índices) ficam na memória, nunca em arquivo sem criptografia.
    db.pragma('temp_store = MEMORY');

    const vec = loadVector(db, opts.vectorExtensionPath, logger);
    runMigrations(db);
    const schemaVersion = Number(db.pragma('user_version', { simple: true }));

    return {
      db,
      path,
      encrypted,
      vectorAvailable: vec.ok,
      vectorVersion: vec.version,
      schemaVersion,
      get open() {
        return db.open;
      },
      close() {
        if (!db.open) return;
        try {
          if (!memory) db.pragma('wal_checkpoint(TRUNCATE)');
        } catch {
          /* fechamento segue mesmo se o checkpoint falhar */
        }
        db.close();
      },
    };
  } catch (err) {
    try {
      db.close();
    } catch {
      /* já fechado */
    }
    throw err;
  }
}

function loadVector(db: SqliteDb, override: string | null | undefined, logger: Logger): { ok: boolean; version?: string } {
  if (override === null) return { ok: false };
  try {
    const p = toUnpackedPath(override ?? getLoadablePath());
    db.loadExtension(p);
    const row = db.prepare('SELECT vec_version() AS v').get() as { v?: string } | undefined;
    return { ok: true, version: row?.v };
  } catch (err) {
    logger.warn('busca por vetores indisponível (sqlite-vec não carregou); usando só busca por texto', err);
    return { ok: false };
  }
}

/** Criptografa um banco antigo sem criptografia (no lugar, em transação do próprio SQLCipher). */
function encryptInPlace(path: string, key: string, logger: Logger): void {
  const db = new Database(path);
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.pragma('journal_mode = DELETE');
    applyCipher(db, key, true);
  } finally {
    db.close();
  }
  logger.info('banco de dados antigo foi criptografado');
}

export { LATEST_SCHEMA_VERSION };
