import type { Logger } from '../types';

/** Logger que oculta segredos óbvios antes de escrever. */
export function createLogger(sink: (line: string) => void = (l) => process.stderr.write(l + '\n'), level: 'debug' | 'info' | 'warn' | 'error' = 'info'): Logger {
  const order = { debug: 0, info: 1, warn: 2, error: 3 } as const;
  const write = (lvl: keyof typeof order, msg: string, extra?: unknown) => {
    if (order[lvl] < order[level]) return;
    let line = `${new Date().toISOString()} [${lvl}] ${msg}`;
    if (extra !== undefined) {
      try {
        line += ' ' + (extra instanceof Error ? `${extra.name}: ${extra.message}` : JSON.stringify(extra));
      } catch {
        line += ' [extra não serializável]';
      }
    }
    sink(redactSecrets(line));
  };
  return {
    debug: (m, e) => write('debug', m, e),
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
  };
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /sk-(proj-)?[A-Za-z0-9_-]{20,}/g,
  /AIza[0-9A-Za-z_-]{30,}/g,
  /ya29\.[0-9A-Za-z_-]{20,}/g,
  /xox[abprs]-[0-9A-Za-z-]{10,}/g,
  /gh[pousr]_[A-Za-z0-9]{30,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /(api[_-]?key|token|secret|password|senha)(["'\s:=]+)([^\s"',}]{6,})/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, ...g) => (g.length >= 3 && typeof g[1] === 'string' && typeof g[2] === 'string' && re.source.startsWith('(api') ? `${g[0]}${g[1]}[oculto]` : '[oculto]'));
  }
  return out;
}
