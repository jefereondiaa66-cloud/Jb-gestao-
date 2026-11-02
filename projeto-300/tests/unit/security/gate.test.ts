import { describe, expect, it } from 'vitest';
import { EventBus } from '@core/events';
import type { EngineEvent, PermissionDecision, PermissionPolicy, PermissionQuery, RiskLevel, ToolCallInfo } from '@core/types';
import { ConfirmationBroker } from '@core/security/confirmation';
import { DefaultPermissionPolicy } from '@core/security/policy';
import { createToolGate } from '@core/security/gate';
import { fakeAudit, fakeSettings, makeTool, type FakeAudit } from './helpers';

function wire(opts: { policy?: PermissionPolicy; auditThrows?: boolean } = {}) {
  const events = new EventBus();
  const captured: EngineEvent[] = [];
  events.on((e) => captured.push(e));
  const settings = fakeSettings();
  const audit: FakeAudit = opts.auditThrows
    ? ({
        entries: [],
        record() {
          throw new Error('falha de auditoria');
        },
        list() {
          return [];
        },
      } as FakeAudit)
    : fakeAudit();
  const policy = opts.policy ?? new DefaultPermissionPolicy(settings);
  const broker = new ConfirmationBroker({ events, settings, audit });
  const gate = createToolGate({ policy, broker, audit, settings });
  return { gate, broker, audit, captured, settings, policy };
}

const call = (over: Partial<ToolCallInfo> & { risk?: RiskLevel; name?: string }): ToolCallInfo => ({
  callId: 'c1',
  tool: makeTool({ name: over.name ?? 'ferramenta', risk: over.risk ?? 'read', title: 'Ferramenta', describe: () => 'faz algo' }),
  input: over.input ?? { a: 1 },
  actor: over.actor ?? 'agent',
  tainted: over.tainted ?? false,
});

const reqEvents = (c: EngineEvent[]) => c.filter((e) => e.type === 'confirmation_request');
const sig = () => new AbortController().signal;

describe('createToolGate', () => {
  it('read: libera e audita como permission/allow', async () => {
    const { gate, audit, captured } = wire();
    const r = await gate.authorize(call({ risk: 'read' }), sig());
    expect(r.allowed).toBe(true);
    expect(reqEvents(captured)).toHaveLength(0);
    expect(audit.entries.some((e) => e.kind === 'permission' && e.decision === 'allow')).toBe(true);
    expect(audit.entries[0]!.input).toContain('"a":1');
  });

  it('write: pergunta, aprova e "lembrar" vale para a próxima na sessão', async () => {
    const { gate, broker, captured } = wire();
    const p = gate.authorize(call({ risk: 'write', name: 'salvar' }), sig());
    const id = reqEvents(captured)[0]!.request.id;
    broker.respond(id, { approved: true, remember: 'session' });
    expect((await p).allowed).toBe(true);
    // segunda chamada não gera novo pedido
    const r2 = await gate.authorize(call({ risk: 'write', name: 'salvar' }), sig());
    expect(r2.allowed).toBe(true);
    expect(reqEvents(captured)).toHaveLength(1);
  });

  it('system: aprova mas NÃO lembra (próxima pergunta de novo)', async () => {
    const { gate, broker, captured } = wire();
    const p1 = gate.authorize(call({ risk: 'system', name: 'shell' }), sig());
    broker.respond(reqEvents(captured)[0]!.request.id, { approved: true, remember: 'session' });
    expect((await p1).allowed).toBe(true);
    const p2 = gate.authorize(call({ risk: 'system', name: 'shell' }), sig());
    expect(reqEvents(captured)).toHaveLength(2);
    broker.respond(reqEvents(captured)[1]!.request.id, { approved: false });
    expect((await p2).allowed).toBe(false);
  });

  it('nega quando a política nega (sem pedir confirmação)', async () => {
    const denier: PermissionPolicy = {
      evaluate: (_q: PermissionQuery) => ({ decision: 'deny' as PermissionDecision, reason: 'não pode' }),
      rememberForSession() {},
      resetSession() {},
    };
    const { gate, audit, captured } = wire({ policy: denier });
    const r = await gate.authorize(call({ risk: 'write' }), sig());
    expect(r.allowed).toBe(false);
    expect(reqEvents(captured)).toHaveLength(0);
    expect(audit.entries.some((e) => e.decision === 'deny' && e.outcome === 'bloqueado')).toBe(true);
  });

  it('rejeição do dono bloqueia', async () => {
    const { gate, broker, captured } = wire();
    const p = gate.authorize(call({ risk: 'external' }), sig());
    broker.respond(reqEvents(captured)[0]!.request.id, { approved: false });
    const r = await p;
    expect(r.allowed).toBe(false);
  });

  it('nunca lança com entrada hostil (risk/describe que estouram, sinal abortado)', async () => {
    const hostile = makeTool({
      name: 'louca',
      risk: (() => {
        throw new Error('boom');
      }) as unknown as RiskLevel,
      describe: () => {
        throw new Error('boom descrição');
      },
    });
    const { gate } = wire();
    const ac = new AbortController();
    ac.abort(); // força o broker a negar na hora
    const r = await gate.authorize({ callId: 'x', tool: hostile, input: { x: 1 }, actor: 'agent', tainted: false }, ac.signal);
    expect(r.allowed).toBe(false);
  });

  it('entrada com ciclo não quebra a autorização', async () => {
    const cyclic: any = { nome: 'z' };
    cyclic.self = cyclic;
    const { gate, audit } = wire();
    const r = await gate.authorize(call({ risk: 'read', input: cyclic }), sig());
    expect(r.allowed).toBe(true);
    expect(() => JSON.parse(audit.entries[0]!.input!)).not.toThrow();
  });

  it('não quebra mesmo se a auditoria falhar', async () => {
    const { gate } = wire({ auditThrows: true });
    const r = await gate.authorize(call({ risk: 'read' }), sig());
    expect(r.allowed).toBe(true);
  });

  it('recordResult audita como tool', async () => {
    const { gate, audit } = wire();
    const info = call({ risk: 'write' });
    gate.recordResult(info, 'ok', 'tudo certo');
    expect(audit.entries.some((e) => e.kind === 'tool' && e.outcome === 'ok')).toBe(true);
  });
});
