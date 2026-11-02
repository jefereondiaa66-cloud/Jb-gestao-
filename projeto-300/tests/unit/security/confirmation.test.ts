import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '@core/events';
import type { EngineEvent } from '@core/types';
import { ConfirmationBroker } from '@core/security/confirmation';
import { fakeAudit, fakeSettings } from './helpers';

function setup(timeoutSec = 10) {
  const events = new EventBus();
  const settings = fakeSettings({ permissions: { confirmationTimeoutSec: timeoutSec } });
  const audit = fakeAudit();
  const captured: EngineEvent[] = [];
  events.on((e) => captured.push(e));
  const broker = new ConfirmationBroker({ events, settings, audit });
  return { broker, audit, captured };
}

const reqEvent = (e: EngineEvent): e is Extract<EngineEvent, { type: 'confirmation_request' }> => e.type === 'confirmation_request';
const resolvedEvent = (e: EngineEvent): e is Extract<EngineEvent, { type: 'confirmation_resolved' }> => e.type === 'confirmation_resolved';

describe('ConfirmationBroker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('emite o pedido e resolve quando a interface responde (aprovado)', async () => {
    const { broker, captured } = setup();
    const p = broker.request({ tool: 'apagar', title: 'Apagar arquivo', description: 'apaga x', risk: 'destructive' });
    const ev = captured.find(reqEvent)!;
    expect(ev.request.title).toBe('Apagar arquivo');
    expect(broker.pending()).toHaveLength(1);
    broker.respond(ev.request.id, { approved: true, remember: 'session' });
    const r = await p;
    expect(r.approved).toBe(true);
    expect(r.remember).toBe('session');
    expect(broker.pending()).toHaveLength(0);
    expect(captured.some((e) => resolvedEvent(e) && e.approved)).toBe(true);
  });

  it('resolve negado quando a interface recusa', async () => {
    const { broker, captured } = setup();
    const p = broker.request({ tool: 't' });
    const id = captured.find(reqEvent)!.request.id;
    broker.respond(id, { approved: false });
    expect((await p).approved).toBe(false);
  });

  it('expira após o tempo e nega (auditado como timeout)', async () => {
    const { broker, audit } = setup(10);
    const p = broker.request({ tool: 'externo', risk: 'external' });
    vi.advanceTimersByTime(10_000);
    const r = await p;
    expect(r.approved).toBe(false);
    expect(audit.entries.some((e) => e.decision === 'timeout' && e.kind === 'permission')).toBe(true);
  });

  it('AbortSignal nega imediatamente', async () => {
    const { broker } = setup();
    const ac = new AbortController();
    const p = broker.request({ tool: 't' }, { signal: ac.signal });
    ac.abort();
    expect((await p).approved).toBe(false);
  });

  it('sinal já abortado nega sem travar', async () => {
    const { broker } = setup();
    const ac = new AbortController();
    ac.abort();
    const r = await broker.request({ tool: 't' }, { signal: ac.signal });
    expect(r.approved).toBe(false);
  });

  it('respond com id desconhecido é ignorado com segurança', () => {
    const { broker } = setup();
    expect(() => broker.respond('inexistente', { approved: true })).not.toThrow();
  });

  it('respond duplicado não muda o resultado nem trava', async () => {
    const { broker, captured } = setup();
    const p = broker.request({ tool: 't' });
    const id = captured.find(reqEvent)!.request.id;
    broker.respond(id, { approved: true });
    broker.respond(id, { approved: false }); // ignorado (já resolvido)
    expect((await p).approved).toBe(true);
  });

  it('cancelAll nega todos os pendentes', async () => {
    const { broker } = setup();
    const p1 = broker.request({ tool: 'a' });
    const p2 = broker.request({ tool: 'b' });
    expect(broker.pending()).toHaveLength(2);
    broker.cancelAll();
    expect((await p1).approved).toBe(false);
    expect((await p2).approved).toBe(false);
    expect(broker.pending()).toHaveLength(0);
  });
});
