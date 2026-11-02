/** Dublês simples para os testes de segurança (usados SOMENTE em testes). */
import { defaultSettings, mergeSettings, type Settings, type SettingsPatch } from '@core/settings';
import type { AuditEntry, AuditLog, SettingsAccess, ToolContext, ToolDefinition } from '@core/types';
import { z } from 'zod';

export interface FakeSettings extends SettingsAccess {
  set(patch: SettingsPatch): void;
}

export function fakeSettings(patch?: SettingsPatch): FakeSettings {
  let s: Settings = patch ? mergeSettings(defaultSettings(), patch) : defaultSettings();
  return {
    get: () => s,
    async update(p: SettingsPatch) {
      s = mergeSettings(s, p);
      return s;
    },
    set(p: SettingsPatch) {
      s = mergeSettings(s, p);
    },
  };
}

export interface FakeAudit extends AuditLog {
  entries: AuditEntry[];
}

export function fakeAudit(): FakeAudit {
  const entries: AuditEntry[] = [];
  return {
    entries,
    record(entry) {
      entries.push({ id: entries.length + 1, ts: new Date().toISOString(), ...entry });
    },
    list(opts = {}) {
      const filtered = opts.kind ? entries.filter((e) => e.kind === opts.kind) : entries;
      const out = [...filtered].reverse();
      return typeof opts.limit === 'number' ? out.slice(0, opts.limit) : out;
    },
  };
}

/** Cria uma ferramenta mínima para exercitar o portão. */
export function makeTool(partial: Partial<ToolDefinition> & { name: string }): ToolDefinition {
  return {
    title: partial.title ?? partial.name,
    description: partial.description ?? 'ferramenta de teste',
    inputSchema: partial.inputSchema ?? z.any(),
    risk: partial.risk ?? 'read',
    ...(partial.describe ? { describe: partial.describe } : {}),
    execute: partial.execute ?? (async () => ({ content: [] }) as Awaited<ReturnType<ToolDefinition['execute']>>),
    ...partial,
  } as ToolDefinition;
}

export type { ToolContext };
