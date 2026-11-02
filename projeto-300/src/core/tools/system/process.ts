/**
 * Execução de processos filhos com tempo limite, cancelamento e encerramento
 * da ÁRVORE inteira (no Windows com taskkill /T; no Linux/macOS pelo grupo de
 * processos), sem janela de console e com saída limitada em memória.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import nodePath from 'node:path';

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  signal?: AbortSignal;
  /** Máximo guardado de cada saída (começo); o fim é guardado à parte. */
  maxBytes?: number;
  /** Função de spawn alternativa (só testes). */
  spawnImpl?: typeof spawn;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
  aborted: boolean;
  /** Parte da saída foi descartada por tamanho. */
  truncated: boolean;
  durationMs: number;
  error?: string;
}

/** Guarda o começo e o fim de um fluxo grande. */
class CappedBuffer {
  private head: Buffer[] = [];
  private headLen = 0;
  private tail: Buffer = Buffer.alloc(0);
  truncated = false;

  constructor(
    private readonly headMax: number,
    private readonly tailMax: number,
  ) {}

  push(chunk: Buffer): void {
    if (this.headLen < this.headMax) {
      const room = this.headMax - this.headLen;
      const part = chunk.length <= room ? chunk : chunk.subarray(0, room);
      this.head.push(part);
      this.headLen += part.length;
      if (part.length === chunk.length) return;
      chunk = chunk.subarray(part.length);
    }
    this.truncated = true;
    const merged = Buffer.concat([this.tail, chunk]);
    this.tail = merged.length > this.tailMax ? merged.subarray(merged.length - this.tailMax) : merged;
  }

  value(): Buffer {
    if (!this.truncated) return Buffer.concat(this.head);
    return Buffer.concat([...this.head, Buffer.from('\n[… saída longa demais: parte do meio descartada …]\n', 'utf8'), this.tail]);
  }
}

export function killTree(child: ChildProcess, spawnImpl: typeof spawn = spawn): void {
  const pid = child.pid;
  if (!pid) return;
  if (process.platform === 'win32') {
    const root = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    try {
      const k = spawnImpl(nodePath.win32.join(root, 'System32', 'taskkill.exe'), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      k.on('error', () => {
        try {
          child.kill();
        } catch {
          /* ignora */
        }
      });
    } catch {
      try {
        child.kill();
      } catch {
        /* ignora */
      }
    }
    return;
  }
  try {
    process.kill(-pid, 'SIGKILL'); // grupo inteiro (o filho foi criado com detached)
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* ignora */
    }
  }
}

export function runProcess(file: string, args: string[], opts: RunOptions): Promise<RunResult> {
  const spawnImpl = opts.spawnImpl ?? spawn;
  const max = opts.maxBytes ?? 1024 * 1024;
  const started = Date.now();
  return new Promise((resolve) => {
    const out = new CappedBuffer(max, 256 * 1024);
    const err = new CappedBuffer(max, 256 * 1024);
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let spawnError: string | undefined;

    const spawnOpts: SpawnOptions = {
      cwd: opts.cwd,
      env: opts.env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32', // grupo próprio para matar a árvore
    };
    let child: ChildProcess;
    try {
      child = spawnImpl(file, args, spawnOpts);
    } catch (e) {
      resolve({ code: null, signal: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), timedOut: false, aborted: false, truncated: false, durationMs: 0, error: (e as Error).message });
      return;
    }

    const finish = (code: number | null, sig: NodeJS.Signals | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      opts.signal?.removeEventListener('abort', onAbort);
      resolve({
        code,
        signal: sig,
        stdout: out.value(),
        stderr: err.value(),
        timedOut,
        aborted,
        truncated: out.truncated || err.truncated,
        durationMs: Date.now() - started,
        ...(spawnError ? { error: spawnError } : {}),
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child, spawnImpl);
    }, opts.timeoutMs);
    const onAbort = (): void => {
      aborted = true;
      killTree(child, spawnImpl);
    };
    if (opts.signal) {
      if (opts.signal.aborted) onAbort();
      else opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    child.stdout?.on('data', (c: Buffer) => out.push(c));
    child.stderr?.on('data', (c: Buffer) => err.push(c));
    child.on('error', (e) => {
      spawnError = e.message;
      finish(null, null);
    });
    child.on('close', (code, sig) => finish(code, sig));
  });
}
