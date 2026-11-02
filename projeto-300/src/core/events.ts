import type { EngineEvent, EventBusLike } from './types';

/** Barramento de eventos simples e síncrono. Um ouvinte com erro não derruba os outros. */
export class EventBus implements EventBusLike {
  private listeners = new Set<(e: EngineEvent) => void>();

  emit(event: EngineEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(event);
      } catch {
        /* ouvinte com falha é ignorado */
      }
    }
  }

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Espera o primeiro evento que satisfaz a condição (útil em testes). */
  waitFor<T extends EngineEvent>(pred: (e: EngineEvent) => e is T, timeoutMs = 5000): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(new Error('evento não chegou em ' + timeoutMs + ' ms'));
      }, timeoutMs);
      const off = this.on((e) => {
        if (pred(e)) {
          clearTimeout(timer);
          off();
          resolve(e);
        }
      });
    });
  }
}
