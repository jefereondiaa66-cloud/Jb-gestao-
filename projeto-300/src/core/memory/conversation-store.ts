/**
 * Conversas e mensagens. As partes (parts) e o conteúdo nativo do provedor
 * (native) são guardados como JSON e voltam exatamente iguais: o histórico
 * só cresce, nunca é editado.
 */
import type { ChatMessage, ChatRole, ContentPart, ConversationStore, ConversationSummary, Logger } from '../types';
import { newId, nowIso } from '../util/ids';
import type { AppDatabase, SqliteDb } from './database';
import { buildFtsQuery, cleanText, truncate } from './text';

const ROLES: readonly ChatRole[] = ['user', 'assistant', 'tool', 'context'];
const DEFAULT_TITLE = 'Nova conversa';
const SEARCH_TEXT_MAX = 20_000;

interface ConversationRow {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

interface MessageRow {
  id: string;
  role: ChatRole;
  parts: string;
  native: string | null;
  created_at: string;
}

const silentLogger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

function toSummary(r: ConversationRow): ConversationSummary {
  return { id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at, messageCount: r.message_count };
}

function cleanTitle(title: unknown): string {
  return truncate(cleanText(String(title ?? '')).replace(/\s+/g, ' '), 200);
}

/** Texto pesquisável: só o que o dono disse e o que o 300 respondeu (não resultados de ferramentas). */
function searchableText(role: ChatRole, parts: ContentPart[]): string {
  if (role !== 'user' && role !== 'assistant') return '';
  const texts: string[] = [];
  for (const p of parts) if (p && p.type === 'text' && typeof p.text === 'string') texts.push(p.text);
  return truncate(cleanText(texts.join('\n')), SEARCH_TEXT_MAX);
}

export class SqliteConversationStore implements ConversationStore {
  private readonly db: SqliteDb;
  private readonly logger: Logger;

  constructor(appDb: AppDatabase, opts: { logger?: Logger } = {}) {
    this.db = appDb.db;
    this.logger = opts.logger ?? silentLogger;
  }

  async create(title?: string): Promise<ConversationSummary> {
    const now = nowIso();
    const id = newId('conv');
    const t = cleanTitle(title) || DEFAULT_TITLE;
    this.db.prepare('INSERT INTO conversations (id, title, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, 0)').run(id, t, now, now);
    return { id, title: t, createdAt: now, updatedAt: now, messageCount: 0 };
  }

  async get(conversationId: string): Promise<ConversationSummary | null> {
    const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(String(conversationId)) as ConversationRow | undefined;
    return r ? toSummary(r) : null;
  }

  /**
   * Acrescenta uma mensagem. Se a conversa ainda não existir, ela é criada com
   * esse id. Repetir a mesma mensagem (mesmo id) não duplica.
   */
  async append(conversationId: string, message: ChatMessage): Promise<void> {
    const convId = String(conversationId ?? '').trim();
    if (!convId) throw new Error('Conversa sem identificador.');
    if (!message || typeof message.id !== 'string' || !message.id) throw new Error('Mensagem sem identificador.');
    if (!ROLES.includes(message.role)) throw new Error(`Papel de mensagem inválido: ${String(message.role)}`);
    if (!Array.isArray(message.parts)) throw new Error('Mensagem sem partes.');
    const partsJson = JSON.stringify(message.parts);
    const nativeJson = message.native === undefined ? null : JSON.stringify(message.native);
    const createdAt = typeof message.createdAt === 'string' && message.createdAt ? message.createdAt : nowIso();
    const text = searchableText(message.role, message.parts);
    const now = nowIso();
    const tx = this.db.transaction(() => {
      this.db
        .prepare('INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, 0)')
        .run(convId, DEFAULT_TITLE, now, now);
      const res = this.db
        .prepare(
          `INSERT OR IGNORE INTO messages (id, conversation_id, role, parts, native, search_text, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(message.id, convId, message.role, partsJson, nativeJson, text, createdAt);
      if (res.changes) {
        this.db.prepare('UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?').run(now, convId);
      }
    });
    tx.immediate();
  }

  async messages(conversationId: string): Promise<ChatMessage[]> {
    const rows = this.db
      .prepare('SELECT id, role, parts, native, created_at FROM messages WHERE conversation_id = ? ORDER BY num')
      .all(String(conversationId)) as MessageRow[];
    const out: ChatMessage[] = [];
    for (const r of rows) {
      let parts: ContentPart[];
      try {
        parts = JSON.parse(r.parts) as ContentPart[];
      } catch (err) {
        this.logger.warn('mensagem com partes corrompidas foi ignorada', { id: r.id, err: String(err) });
        continue;
      }
      const msg: ChatMessage = { id: r.id, role: r.role, parts, createdAt: r.created_at };
      if (r.native !== null) {
        try {
          msg.native = JSON.parse(r.native) as ChatMessage['native'];
        } catch {
          this.logger.warn('conteúdo nativo corrompido foi descartado', { id: r.id });
        }
      }
      out.push(msg);
    }
    return out;
  }

  async list(limit = 50): Promise<ConversationSummary[]> {
    const n = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 50, 1), 1000);
    const rows = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC, rowid DESC LIMIT ?').all(n) as ConversationRow[];
    return rows.map(toSummary);
  }

  async rename(conversationId: string, title: string): Promise<void> {
    const t = cleanTitle(title);
    if (!t) throw new Error('O título não pode ficar vazio.');
    this.db.prepare('UPDATE conversations SET title = ? WHERE id = ?').run(t, String(conversationId));
  }

  async remove(conversationId: string): Promise<void> {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(String(conversationId));
  }

  /** Busca por texto nas conversas anteriores (todas as palavras; se nada, qualquer palavra). */
  async searchText(text: string, limit = 10): Promise<{ conversationId: string; messageId: string; snippet: string; createdAt: string }[]> {
    const n = Math.min(Math.max(Number.isFinite(limit) ? Math.floor(limit) : 10, 1), 100);
    const q = truncate(cleanText(String(text ?? '')), 500);
    for (const mode of ['and', 'or'] as const) {
      const fts = buildFtsQuery(q, { mode });
      if (!fts) return [];
      try {
        const rows = this.db
          .prepare(
            `SELECT m.conversation_id AS conversationId, m.id AS messageId, m.created_at AS createdAt,
                    snippet(messages_fts, 0, '«', '»', '…', 16) AS snippet
             FROM messages_fts JOIN messages m ON m.num = messages_fts.rowid
             WHERE messages_fts MATCH ?
             ORDER BY bm25(messages_fts), m.num DESC
             LIMIT ?`,
          )
          .all(fts, n) as { conversationId: string; messageId: string; snippet: string; createdAt: string }[];
        if (rows.length || mode === 'or') return rows;
      } catch (err) {
        this.logger.warn('busca nas conversas falhou', err);
        return [];
      }
    }
    return [];
  }
}
