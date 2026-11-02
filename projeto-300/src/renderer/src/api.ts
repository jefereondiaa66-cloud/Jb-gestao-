/** Acesso tipado à ponte window.api300 (a interface não fala com o motor de outro jeito). */
import type { Api300, IpcArg, IpcChannel, IpcResult } from '../../shared/ipc';
import { safeHref } from './lib/markdown';

type ArgsOf<C extends IpcChannel> = [IpcArg<C>] extends [void] ? [] : undefined extends IpcArg<C> ? [arg?: IpcArg<C>] : [arg: IpcArg<C>];

export function hasApi(): boolean {
  return typeof window !== 'undefined' && typeof window.api300 === 'object' && window.api300 !== null && typeof window.api300.invoke === 'function';
}

export function api(): Api300 {
  if (!hasApi()) throw new Error('A ponte com o motor do 300 não está disponível.');
  return window.api300;
}

/** Chama um canal do motor. */
export function call<C extends IpcChannel>(channel: C, ...args: ArgsOf<C>): Promise<IpcResult<C>> {
  return api().invoke(channel, args[0] as IpcArg<C>);
}

/**
 * Botão PARAR: cancela resposta, ferramentas, fala e escuta no motor.
 * Pede as duas paradas mesmo que uma falhe; devolve o primeiro erro (ou null).
 */
export async function stopEverything(): Promise<unknown> {
  const res = await Promise.allSettled([call('chat:stop'), call('voice:stop')]);
  const failed = res.find((r): r is PromiseRejectedResult => r.status === 'rejected');
  return failed ? (failed.reason ?? new Error('falha ao parar')) : null;
}

/** Abre um endereço no navegador do sistema (só http, https e mailto). */
export async function openExternal(url: string): Promise<void> {
  const href = safeHref(url);
  if (!href) throw new Error('Endereço não permitido.');
  await call('system:openExternal', { url: href });
}
