import { describe, expect, it } from 'vitest';
import { redactInput, redactText } from '@core/security/redact';

describe('redactInput', () => {
  it('oculta valores de campos com nome de segredo (inclusive aninhados)', () => {
    const out = redactInput({
      user: 'jeferson',
      password: 'super-secreta',
      nested: { apiKey: 'abc', api_key: 'def', Authorization: 'Bearer x', cookie: 'sid=1' },
      list: [{ token: 't1' }, { senha: 's1' }],
    }) as any;
    expect(out.user).toBe('jeferson');
    expect(out.password).toBe('[oculto]');
    expect(out.nested.apiKey).toBe('[oculto]');
    expect(out.nested.api_key).toBe('[oculto]');
    expect(out.nested.Authorization).toBe('[oculto]');
    expect(out.nested.cookie).toBe('[oculto]');
    expect(out.list[0].token).toBe('[oculto]');
    expect(out.list[1].senha).toBe('[oculto]');
  });

  it('oculta segredos embutidos em texto comum', () => {
    const out = redactInput({ msg: 'minha chave é sk-ant-api03-ABCDEFGHIJKLMNOP' }) as any;
    expect(out.msg).not.toContain('ABCDEFGHIJKLMNOP');
    expect(out.msg).toContain('[oculto]');
  });

  it('marca blobs binários/base64 longos', () => {
    const b64 = 'A'.repeat(5000);
    const out = redactInput({ image: b64 }) as any;
    expect(out.image).toMatch(/\[dados binários ~\d+ KB\]/);
  });

  it('corta textos muito longos em 2000 caracteres', () => {
    const texto = 'palavra '.repeat(1000); // > 2000, com espaços (não é binário)
    const out = redactInput({ texto }) as any;
    expect(out.texto.length).toBeLessThan(texto.length);
    expect(out.texto).toContain('caracteres]');
  });

  it('é seguro com ciclos', () => {
    const a: any = { nome: 'a' };
    a.self = a;
    const out = redactInput(a) as any;
    expect(out.nome).toBe('a');
    expect(out.self).toBe('[referência cíclica]');
  });

  it('respeita limite de profundidade', () => {
    let deep: any = { v: 1 };
    for (let i = 0; i < 50; i++) deep = { child: deep };
    const out = redactInput(deep);
    const s = JSON.stringify(out);
    expect(s).toContain('[profundidade máxima]');
  });

  it('o mesmo objeto repetido em irmãos não é falso ciclo', () => {
    const shared = { nome: 'x' };
    const out = redactInput({ a: shared, b: shared }) as any;
    expect(out.a.nome).toBe('x');
    expect(out.b.nome).toBe('x');
  });

  it('converte tipos não-JSON com segurança', () => {
    const out = redactInput({ d: new Date('2020-01-02T03:04:05.000Z'), n: 10n, buf: Buffer.alloc(2048), fn: () => 1 }) as any;
    expect(out.d).toBe('2020-01-02T03:04:05.000Z');
    expect(out.n).toBe('10');
    expect(out.buf).toMatch(/dados binários/);
    expect('fn' in out).toBe(false); // funções somem
  });

  it('é resultado serializável em JSON', () => {
    const a: any = { x: 1 };
    a.self = a;
    expect(() => JSON.stringify(redactInput(a))).not.toThrow();
  });
});

describe('redactText', () => {
  it('reaproveita a ocultação de segredos do logger', () => {
    expect(redactText('token=abcdef123456')).toContain('[oculto]');
  });
});
