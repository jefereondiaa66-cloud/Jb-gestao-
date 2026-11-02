/**
 * Intermediário de confirmação.
 *
 * Quando a política decide "perguntar", o portão chama `request`, que emite o
 * evento `confirmation_request` para a interface e devolve uma promessa. A
 * interface responde com `confirm:respond` -> `respond(id, resposta)`. Se
 * ninguém responder dentro do tempo configurado, ou se a tarefa for cancelada
 * (AbortSignal), a resposta vira "negado".
 */
import type { AuditLog, ConfirmationRequest, ConfirmationResponse, EventBusLike, RiskLevel, SettingsAccess } from '../types';
import { newId, nowIso } from '../util/ids';

export interface ConfirmationBrokerDeps {
  events: EventBusLike;
  settings: SettingsAccess;
  audit: AuditLog;
}

/** Campos que quem pede pode preencher (o resto é gerado aqui). */
export type ConfirmationRequestInput = Partial<Omit<ConfirmationRequest, 'createdAt' | 'expiresAt'>>;

export interface RequestOptions {
  signal?: AbortSignal;
}

interface Pending {
  request: ConfirmationRequest;
  settle: (response: ConfirmationResponse, how: 'respond' | 'timeout' | 'abort' | 'cancel') => void;
}

export class ConfirmationBroker {
  private readonly pendingMap = new Map<string, Pending>();

  constructor(private readonly deps: ConfirmationBrokerDeps) {}

  request(partial: ConfirmationRequestInput, opts: RequestOptions = {}): Promise<ConfirmationResponse> {
    const id = partial.id ?? newId('confirm');
    const timeoutSec = this.timeoutSec();
    const createdAt = nowIso();
    const request: ConfirmationRequest = {
      id,
      tool: partial.tool ?? 'desconhecida',
      title: partial.title ?? 'Confirmar ação',
      description: partial.description ?? 'Confirmar esta ação?',
      risk: (partial.risk as RiskLevel) ?? 'system',
      input: partial.input,
      actor: partial.actor ?? 'agent',
      tainted: partial.tainted ?? false,
      createdAt,
      expiresAt: new Date(Date.now() + timeoutSec * 1000).toISOString(),
    };

    return new Promise<ConfirmationResponse>((resolve) => {
      let done = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let onAbort: (() => void) | undefined;

      const settle = (response: ConfirmationResponse, how: 'respond' | 'timeout' | 'abort' | 'cancel'): void => {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (onAbort && opts.signal) opts.signal.removeEventListener('abort', onAbort);
        this.pendingMap.delete(id);
        if (how === 'timeout') this.auditDenied(request, 'timeout', 'o pedido de confirmação expirou (tempo esgotado).');
        else if (how === 'abort') this.auditDenied(request, 'rejected', 'tarefa cancelada antes da resposta.');
        else if (how === 'cancel') this.auditDenied(request, 'rejected', 'pedido de confirmação cancelado.');
        this.deps.events.emit({ type: 'confirmation_resolved', id, approved: response.approved === true });
        resolve(response);
      };

      // Cancelamento imediato.
      if (opts.signal?.aborted) {
        this.pendingMap.set(id, { request, settle });
        this.deps.events.emit({ type: 'confirmation_request', request });
        settle({ approved: false }, 'abort');
        return;
      }

      this.pendingMap.set(id, { request, settle });
      this.deps.events.emit({ type: 'confirmation_request', request });

      timer = setTimeout(() => settle({ approved: false }, 'timeout'), timeoutSec * 1000);
      if (typeof (timer as { unref?: () => void }).unref === 'function') (timer as { unref: () => void }).unref();

      if (opts.signal) {
        onAbort = () => settle({ approved: false }, 'abort');
        opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  /** A interface responde a um pedido. Id desconhecido/expirado é ignorado em silêncio. */
  respond(id: string, response: ConfirmationResponse): void {
    const p = this.pendingMap.get(id);
    if (!p) return;
    const approved = response?.approved === true;
    const remember = response?.remember === 'session' ? ('session' as const) : undefined;
    p.settle(remember ? { approved, remember } : { approved }, 'respond');
  }

  /** Pedidos ainda aguardando resposta. */
  pending(): ConfirmationRequest[] {
    return [...this.pendingMap.values()].map((p) => p.request);
  }

  /** Nega todos os pedidos pendentes (ex.: botão de parada geral). */
  cancelAll(): void {
    for (const p of [...this.pendingMap.values()]) p.settle({ approved: false }, 'cancel');
  }

  private timeoutSec(): number {
    const v = this.deps.settings.get().permissions.confirmationTimeoutSec;
    return Number.isFinite(v) && v > 0 ? v : 120;
  }

  private auditDenied(request: ConfirmationRequest, decision: 'timeout' | 'rejected', detail: string): void {
    try {
      this.deps.audit.record({
        actor: request.actor,
        kind: 'permission',
        tool: request.tool,
        risk: request.risk,
        decision,
        outcome: 'bloqueado',
        detail,
      });
    } catch {
      /* auditoria nunca derruba a operação */
    }
  }
}
