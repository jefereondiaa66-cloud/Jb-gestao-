/** Cancelamento que não depende da boa vontade de quem foi chamado. */

/**
 * Espera a promessa, mas desiste quando o sinal dispara, mesmo que a função
 * chamada (provedor de embeddings, modelo utilitário) ignore o cancelamento.
 * Assim uma chamada travada nunca segura a fila para sempre.
 */
export function raceSignal<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    p.catch(() => undefined);
    return Promise.reject(signal.reason ?? new Error('cancelado'));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason ?? new Error('cancelado'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}
