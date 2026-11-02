import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defaultSettings, mergeSettings } from '@core/settings';
import { ToolRegistry, toJsonSchema } from '@core/tools/registry';
import { redactSecrets } from '@core/util/logger';

describe('configurações', () => {
  it('padrões completos e seguros', () => {
    const s = defaultSettings();
    expect(s.brain.provider).toBe('anthropic');
    expect(s.brain.model).toBe('claude-opus-5-5');
    expect(s.wake.enabled).toBe(false);
    expect(s.permissions.autoApproveWrites).toBe(false);
    expect(s.voice.bargeIn).toBe(true);
  });
  it('mescla parcial sem perder padrões', () => {
    const s = mergeSettings(defaultSettings(), { voice: { volume: 0.3 }, persona: { userName: 'Jeferson' } });
    expect(s.voice.volume).toBe(0.3);
    expect(s.voice.speed).toBe(1);
    expect(s.persona.userName).toBe('Jeferson');
  });
  it('rejeita valores inválidos', () => {
    expect(() => mergeSettings(defaultSettings(), { voice: { volume: 5 } })).toThrow();
  });
});

describe('registro de ferramentas', () => {
  it('gera JSON Schema de objeto e ordena por nome', () => {
    const r = new ToolRegistry();
    const mk = (name: string) => ({ name, title: name, description: 'x', inputSchema: z.object({ q: z.string().describe('consulta') }), risk: 'read' as const, execute: async () => ({ content: [] }) });
    r.register(mk('b_tool'));
    r.register(mk('a_tool'));
    const specs = r.specs();
    expect(specs.map((s) => s.name)).toEqual(['a_tool', 'b_tool']);
    expect(specs[0].inputSchema.type).toBe('object');
    expect(() => r.register(mk('a_tool'))).toThrow();
    expect(() => r.register(mk('Inválido'))).toThrow();
    expect(toJsonSchema(z.object({}))).toMatchObject({ type: 'object' });
  });
});

describe('ocultação de segredos', () => {
  it('oculta chaves conhecidas', () => {
    const t = redactSecrets('chave sk-ant-api03-abcdefghijklmnop e api_key=supersecreto123');
    expect(t).not.toContain('abcdefghijklmnop');
    expect(t).not.toContain('supersecreto123');
  });
});
