import { randomUUID } from 'node:crypto';

export const newId = (prefix = ''): string => (prefix ? `${prefix}_` : '') + randomUUID();
export const nowIso = (): string => new Date().toISOString();
