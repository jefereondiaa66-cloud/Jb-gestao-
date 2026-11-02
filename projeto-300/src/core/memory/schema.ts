/**
 * Esquema do banco e migrações (PRAGMA user_version).
 * Regra: migrações só se acrescentam; cada uma roda inteira numa transação.
 * A tabela de vetores (vec0) NÃO entra aqui: ela depende do provedor de
 * embeddings e da extensão sqlite-vec, e é gerida por vector-index.ts.
 */
import type Database from 'better-sqlite3-multiple-ciphers';

type Db = Database.Database;

export interface Migration {
  version: number;
  description: string;
  up(db: Db): void;
}

const FTS_TOKENIZER = `tokenize='unicode61 remove_diacritics 2'`;

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'estrutura inicial: memória, conversas, tarefas, agendamentos e auditoria',
    up(db) {
      db.exec(`
        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE memories (
          num INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL CHECK (kind IN ('fact','preference','project','task','knowledge','person','event','summary')),
          content TEXT NOT NULL,
          tags TEXT NOT NULL DEFAULT '[]',
          importance REAL NOT NULL DEFAULT 0.5 CHECK (importance >= 0 AND importance <= 1),
          source TEXT NOT NULL DEFAULT 'usuario',
          sensitive INTEGER NOT NULL DEFAULT 0 CHECK (sensitive IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_accessed_at TEXT,
          access_count INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT,
          embedding_sig TEXT
        );
        CREATE INDEX memories_kind ON memories(kind);
        CREATE INDEX memories_updated ON memories(updated_at);
        CREATE INDEX memories_expires ON memories(expires_at) WHERE expires_at IS NOT NULL;

        CREATE VIRTUAL TABLE memories_fts USING fts5(
          content, tags,
          content='memories', content_rowid='num',
          ${FTS_TOKENIZER}
        );
        CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts(rowid, content, tags) VALUES (new.num, new.content, new.tags);
        END;
        CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.num, old.content, old.tags);
        END;
        CREATE TRIGGER memories_au AFTER UPDATE OF content, tags ON memories BEGIN
          INSERT INTO memories_fts(memories_fts, rowid, content, tags) VALUES ('delete', old.num, old.content, old.tags);
          INSERT INTO memories_fts(rowid, content, tags) VALUES (new.num, new.content, new.tags);
        END;

        CREATE TABLE conversations (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          message_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX conversations_updated ON conversations(updated_at);

        CREATE TABLE messages (
          num INTEGER PRIMARY KEY AUTOINCREMENT,
          id TEXT NOT NULL,
          conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','context')),
          parts TEXT NOT NULL,
          native TEXT,
          search_text TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          UNIQUE (conversation_id, id)
        );
        CREATE INDEX messages_conversation ON messages(conversation_id, num);

        CREATE VIRTUAL TABLE messages_fts USING fts5(
          search_text,
          content='messages', content_rowid='num',
          ${FTS_TOKENIZER}
        );
        CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
          INSERT INTO messages_fts(rowid, search_text) VALUES (new.num, new.search_text);
        END;
        CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, search_text) VALUES ('delete', old.num, old.search_text);
        END;
        CREATE TRIGGER messages_au AFTER UPDATE OF search_text ON messages BEGIN
          INSERT INTO messages_fts(messages_fts, rowid, search_text) VALUES ('delete', old.num, old.search_text);
          INSERT INTO messages_fts(rowid, search_text) VALUES (new.num, new.search_text);
        END;

        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          notes TEXT,
          status TEXT NOT NULL CHECK (status IN ('pendente','em_andamento','concluida','cancelada')),
          priority TEXT NOT NULL CHECK (priority IN ('baixa','media','alta')),
          project TEXT,
          due_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT
        );
        CREATE INDEX tasks_status ON tasks(status);
        CREATE INDEX tasks_project ON tasks(project);

        CREATE TABLE schedules (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          cron TEXT,
          run_at TEXT,
          timezone TEXT,
          action TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          created_at TEXT NOT NULL,
          last_run_at TEXT,
          next_run_at TEXT
        );

        CREATE TABLE job_runs (
          id TEXT PRIMARY KEY,
          schedule_id TEXT NOT NULL,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL CHECK (status IN ('executando','ok','falhou','cancelado','aguardando_aprovacao')),
          output TEXT
        );
        CREATE INDEX job_runs_schedule ON job_runs(schedule_id, started_at);
        CREATE INDEX job_runs_started ON job_runs(started_at);

        CREATE TABLE audit (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL,
          actor TEXT NOT NULL,
          kind TEXT NOT NULL,
          tool TEXT,
          risk TEXT,
          decision TEXT,
          input TEXT,
          outcome TEXT,
          detail TEXT
        );
        CREATE INDEX audit_ts ON audit(ts);
        CREATE INDEX audit_kind ON audit(kind, id);

        -- Auditoria só aceita acréscimos: nada pode ser alterado, e só se apaga
        -- o que tem mais de 365 dias (limpeza automática).
        CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN
          SELECT RAISE(ABORT, 'a auditoria não pode ser alterada');
        END;
        CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit
          WHEN old.ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-365 days')
        BEGIN
          SELECT RAISE(ABORT, 'a auditoria não pode ser apagada');
        END;
      `);
    },
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** Aplica as migrações pendentes. Idempotente: rodar de novo não muda nada. */
export function runMigrations(db: Db, migrations: Migration[] = MIGRATIONS): number {
  const current = Number(db.pragma('user_version', { simple: true })) || 0;
  const latest = migrations.length ? migrations[migrations.length - 1]!.version : 0;
  if (current > latest) {
    throw new Error(`O banco de dados é de uma versão mais nova do 300 (esquema ${current}; esta versão conhece até ${latest}). Atualize o programa.`);
  }
  for (const m of migrations) {
    if (m.version <= current) continue;
    const apply = db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${Math.floor(m.version)}`);
    });
    apply.immediate();
  }
  return Number(db.pragma('user_version', { simple: true })) || 0;
}
