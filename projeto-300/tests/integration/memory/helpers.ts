/** Dublês e utilidades SÓ para testes da memória. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventBus } from '@core/events';
import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@core/settings';
import type { EmbeddingProvider, EngineEvent, EngineServices, Logger, PermissionPolicy, RiskLevel, SecretStore, ToolContext } from '@core/types';
import { foldText } from '@core/memory/text';
import type { Stores } from '@core/memory/stores';

export function tempDir(prefix = '300-mem-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export interface CapturingLogger extends Logger {
  lines: { level: string; msg: string; extra?: unknown }[];
}

export function capturingLogger(): CapturingLogger {
  const lines: CapturingLogger['lines'] = [];
  const mk = (level: string) => (msg: string, extra?: unknown) => {
    lines.push({ level, msg, extra });
  };
  return { lines, debug: mk('debug'), info: mk('info'), warn: mk('warn'), error: mk('error') };
}

/**
 * Embeddings determinísticos: saco de palavras com sinônimos mapeados para o
 * mesmo "conceito", espalhado por hash em N dimensões e normalizado.
 */
export class FakeEmbeddings implements EmbeddingProvider {
  readonly id: string;
  readonly model: string;
  readonly dimensions: number;
  calls = 0;
  textsSeen: string[] = [];
  failing = false;
  private readonly synonyms: Record<string, string>;

  constructor(opts: { id?: string; model?: string; dimensions?: number; synonyms?: Record<string, string> } = {}) {
    this.id = opts.id ?? 'fake';
    this.model = opts.model ?? 'fake-v1';
    this.dimensions = opts.dimensions ?? 64;
    this.synonyms = opts.synonyms ?? {
      cao: 'canino',
      cachorro: 'canino',
      cachorrinho: 'canino',
      dog: 'canino',
      automovel: 'carro',
      veiculo: 'carro',
      carro: 'carro',
    };
  }

  private vec(text: string): Float32Array {
    const v = new Float32Array(this.dimensions);
    const words = foldText(text).match(/[\p{L}\p{N}]+/gu) ?? [];
    for (const w of words) {
      const c = this.synonyms[w] ?? w;
      let h = 2166136261;
      for (let i = 0; i < c.length; i++) h = Math.imul(h ^ c.charCodeAt(i), 16777619) >>> 0;
      v[h % this.dimensions]! += 1;
    }
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < v.length; i++) v[i]! /= n;
    if (!words.length) v[0] = 1;
    return v;
  }

  async embed(texts: string[]): Promise<Float32Array[]> {
    this.calls++;
    this.textsSeen.push(...texts);
    if (this.failing) throw new Error('falha simulada de embeddings');
    return texts.map((t) => this.vec(t));
  }
}

export function memorySecrets(initial: Record<string, string> = {}): SecretStore {
  const m = new Map(Object.entries(initial));
  return {
    async get(n) {
      return m.get(n);
    },
    async set(n, v) {
      m.set(n, v);
    },
    async delete(n) {
      m.delete(n);
    },
    async has(n) {
      return m.has(n);
    },
    async list() {
      return [...m.keys()];
    },
  };
}

export interface TestServices extends EngineServices {
  emitted: EngineEvent[];
  logger: CapturingLogger;
}

export function makeServices(
  stores: Stores,
  opts: { documents?: string; settings?: SettingsPatch; utilityComplete?: EngineServices['utilityComplete'] } = {},
): TestServices {
  let settings: Settings = mergeSettings(defaultSettings(), opts.settings ?? {});
  const events = new EventBus();
  const emitted: EngineEvent[] = [];
  events.on((e) => emitted.push(e));
  const logger = capturingLogger();
  const docs = opts.documents ?? tmpdir();
  return {
    emitted,
    settings: {
      get: () => settings,
      update: async (patch) => (settings = mergeSettings(settings, patch)),
    },
    secrets: memorySecrets(),
    platform: {
      os: 'linux',
      notify() {},
      async openExternal() {},
      async openPath() {
        return '';
      },
      paths: { home: docs, documents: docs, desktop: docs, downloads: docs, pictures: docs, data: docs, temp: docs },
    },
    memory: stores.memory,
    conversations: stores.conversations,
    tasks: stores.tasks,
    schedules: stores.schedules,
    audit: stores.audit,
    logger,
    events,
    utilityComplete: opts.utilityComplete,
    extras: {},
  };
}

export function makeCtx(
  services: EngineServices,
  opts: { approve?: boolean; conversationId?: string; policy?: PermissionPolicy; tool?: string } = {},
): ToolContext & { confirms: string[]; risks: RiskLevel[]; autoApproved: string[] } {
  const confirms: string[] = [];
  const risks: RiskLevel[] = [];
  const autoApproved: string[] = [];
  return {
    confirms,
    risks,
    autoApproved,
    signal: new AbortController().signal,
    actor: 'agent',
    conversationId: opts.conversationId,
    async confirm(title, _description, risk) {
      // Com política: igual ao motor (a política pode aprovar sozinha, sem perguntar ao dono).
      if (opts.policy && opts.policy.evaluate({ tool: opts.tool ?? 'ferramenta', risk, input: {}, actor: 'agent', tainted: false }).decision === 'allow') {
        autoApproved.push(title);
        return true;
      }
      confirms.push(title);
      risks.push(risk);
      return opts.approve ?? true;
    },
    log() {},
    services,
  };
}
