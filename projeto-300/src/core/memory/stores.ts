/**
 * Fábrica dos repositórios persistentes sobre um banco já aberto.
 * Ao abrir: remove memórias expiradas, limpa auditoria com mais de 365 dias
 * e histórico de execuções antigo.
 */
import type { EmbeddingProvider, Logger } from '../types';
import { SqliteAuditLog } from './audit-log';
import { SqliteConversationStore } from './conversation-store';
import type { AppDatabase } from './database';
import { SqliteMemoryStore } from './memory-store';
import { SqliteScheduleStore } from './schedule-store';
import { SqliteTaskStore } from './task-store';
import type { VectorIndexOptions } from './vector-index';

export interface CreateStoresOptions {
  embeddings?: EmbeddingProvider;
  logger?: Logger;
  /** Ajustes do índice de vetores (lote, distância máxima, tempo limite). */
  vector?: VectorIndexOptions;
}

export interface Stores {
  memory: SqliteMemoryStore;
  conversations: SqliteConversationStore;
  tasks: SqliteTaskStore;
  schedules: SqliteScheduleStore;
  audit: SqliteAuditLog;
  /** Para o trabalho em segundo plano (embeddings). Chame antes de fechar o banco. */
  dispose(): void;
}

export function createStores(appDb: AppDatabase, opts: CreateStoresOptions = {}): Stores {
  const logger = opts.logger;
  const memory = new SqliteMemoryStore(appDb, { embeddings: opts.embeddings, logger, vector: opts.vector });
  try {
    memory.purgeExpired();
  } catch (err) {
    logger?.warn('memória: falha ao remover itens expirados', err);
  }
  return {
    memory,
    conversations: new SqliteConversationStore(appDb, { logger }),
    tasks: new SqliteTaskStore(appDb),
    schedules: new SqliteScheduleStore(appDb),
    audit: new SqliteAuditLog(appDb, { logger }),
    dispose() {
      memory.dispose();
    },
  };
}
