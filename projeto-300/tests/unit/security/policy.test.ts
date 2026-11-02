import { describe, expect, it } from 'vitest';
import type { Actor, PermissionQuery, RiskLevel } from '@core/types';
import { DefaultPermissionPolicy } from '@core/security/policy';
import { fakeSettings } from './helpers';

const q = (risk: RiskLevel, actor: Actor, tainted = false, tool = 'ferramenta_x'): PermissionQuery => ({ tool, risk, input: {}, actor, tainted });

describe('DefaultPermissionPolicy — matriz', () => {
  it('read sempre libera (user, agent, scheduler)', () => {
    const p = new DefaultPermissionPolicy(fakeSettings());
    for (const actor of ['user', 'agent', 'scheduler'] as Actor[]) {
      expect(p.evaluate(q('read', actor)).decision).toBe('allow');
    }
  });

  it('write pergunta por padrão', () => {
    const p = new DefaultPermissionPolicy(fakeSettings());
    expect(p.evaluate(q('write', 'agent')).decision).toBe('ask');
  });

  it('write libera com autoApproveWrites e sem contaminação', () => {
    const p = new DefaultPermissionPolicy(fakeSettings({ permissions: { autoApproveWrites: true } }));
    expect(p.evaluate(q('write', 'agent', false)).decision).toBe('allow');
  });

  it('write com autoApprove mas contaminado ainda pergunta', () => {
    const p = new DefaultPermissionPolicy(fakeSettings({ permissions: { autoApproveWrites: true } }));
    expect(p.evaluate(q('write', 'agent', true)).decision).toBe('ask');
  });

  it('external/destructive/financial/system SEMPRE perguntam (mesmo autoApprove)', () => {
    const p = new DefaultPermissionPolicy(fakeSettings({ permissions: { autoApproveWrites: true } }));
    for (const risk of ['external', 'destructive', 'financial', 'system'] as RiskLevel[]) {
      expect(p.evaluate(q(risk, 'agent')).decision).toBe('ask');
    }
  });

  it('scheduler: só leitura é automática; o resto pergunta', () => {
    const p = new DefaultPermissionPolicy(fakeSettings({ permissions: { autoApproveWrites: true } }));
    expect(p.evaluate(q('read', 'scheduler')).decision).toBe('allow');
    for (const risk of ['write', 'external', 'destructive', 'financial', 'system'] as RiskLevel[]) {
      expect(p.evaluate(q(risk, 'scheduler')).decision).toBe('ask');
    }
  });

  it('rememberForSession vale para write', () => {
    const p = new DefaultPermissionPolicy(fakeSettings());
    expect(p.evaluate(q('write', 'agent')).decision).toBe('ask');
    p.rememberForSession('ferramenta_x', 'write');
    expect(p.evaluate(q('write', 'agent')).decision).toBe('allow');
    // mesmo contaminado, o "lembrar" vale
    expect(p.evaluate(q('write', 'agent', true)).decision).toBe('allow');
    // outra ferramenta continua perguntando
    expect(p.evaluate(q('write', 'agent', false, 'outra')).decision).toBe('ask');
  });

  it('rememberForSession é ignorado para riscos altos', () => {
    const p = new DefaultPermissionPolicy(fakeSettings());
    p.rememberForSession('ferramenta_x', 'system');
    p.rememberForSession('ferramenta_x', 'external');
    expect(p.evaluate(q('system', 'agent')).decision).toBe('ask');
    expect(p.evaluate(q('external', 'agent')).decision).toBe('ask');
  });

  it('resetSession esquece o que foi lembrado', () => {
    const p = new DefaultPermissionPolicy(fakeSettings());
    p.rememberForSession('ferramenta_x', 'write');
    expect(p.evaluate(q('write', 'agent')).decision).toBe('allow');
    p.resetSession();
    expect(p.evaluate(q('write', 'agent')).decision).toBe('ask');
  });

  it('as razões são textos em pt-BR', () => {
    const p = new DefaultPermissionPolicy(fakeSettings());
    expect(p.evaluate(q('system', 'agent')).reason).toMatch(/confirma/i);
    expect(p.evaluate(q('read', 'agent')).reason.length).toBeGreaterThan(0);
  });
});
