/** Fila assíncrona simples: um produtor empurra, um consumidor lê com for await. */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private waiters: { resolve: (r: IteratorResult<T>) => void; reject: (e: unknown) => void }[] = [];
  private ended = false;
  private error: unknown = null;

  push(item: T): void {
    if (this.ended) return;
    const w = this.waiters.shift();
    if (w) w.resolve({ value: item, done: false });
    else this.items.push(item);
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    for (const w of this.waiters.splice(0)) w.resolve({ value: undefined as never, done: true });
  }

  fail(err: unknown): void {
    if (this.ended) return;
    this.error = err ?? new Error('falha');
    this.ended = true;
    for (const w of this.waiters.splice(0)) w.reject(this.error);
  }

  get size(): number {
    return this.items.length;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.error) return Promise.reject(this.error);
        if (this.ended) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise<IteratorResult<T>>((resolve, reject) => this.waiters.push({ resolve, reject }));
      },
      return: () => {
        this.ended = true;
        this.items = [];
        return Promise.resolve({ value: undefined as never, done: true });
      },
    };
  }
}

/** Espera a promessa, mas desiste quando o sinal dispara. */
export function raceAbort<T>(p: Promise<T>, signal: AbortSignal | undefined, makeError: () => Error): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) {
    p.catch(() => undefined);
    return Promise.reject(makeError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(makeError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
