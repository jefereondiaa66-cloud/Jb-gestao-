import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { SECRET_NAMES } from '@core/types';
import { EncryptedFileSecretStore, EnvSecretStore, aesGcmCipher } from '@core/security/secrets';
import { SecurityError } from '@core/security/paths';

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), '300-secrets-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('EnvSecretStore', () => {
  it('lê das variáveis de ambiente mapeadas', async () => {
    const store = new EnvSecretStore({ ANTHROPIC_API_KEY: 'sk-ant-1', OPENAI_API_KEY: 'sk-oai' });
    expect(await store.get(SECRET_NAMES.anthropic)).toBe('sk-ant-1');
    expect(await store.has(SECRET_NAMES.openai)).toBe(true);
    expect(await store.has(SECRET_NAMES.tavily)).toBe(false);
    const list = await store.list();
    expect(list).toContain(SECRET_NAMES.anthropic);
    expect(list).toContain(SECRET_NAMES.openai);
  });

  it('set guarda só na memória e delete mascara o env', async () => {
    const store = new EnvSecretStore({ BRAVE_SEARCH_API_KEY: 'bsk' });
    await store.set(SECRET_NAMES.tavily, 'tvly');
    expect(await store.get(SECRET_NAMES.tavily)).toBe('tvly');
    await store.delete(SECRET_NAMES.brave);
    expect(await store.get(SECRET_NAMES.brave)).toBeUndefined();
    expect(await store.has(SECRET_NAMES.brave)).toBe(false);
  });
});

describe('aesGcmCipher', () => {
  it('ida e volta', async () => {
    const c = aesGcmCipher(randomBytes(32));
    const enc = await c.encrypt('mensagem secreta çãõ');
    expect(Buffer.isBuffer(enc)).toBe(true);
    expect(await c.decrypt(enc)).toBe('mensagem secreta çãõ');
  });

  it('exige chave de 32 bytes', () => {
    expect(() => aesGcmCipher(randomBytes(16))).toThrow(SecurityError);
  });

  it('detecta adulteração (tag GCM)', async () => {
    const c = aesGcmCipher(randomBytes(32));
    const enc = await c.encrypt('dados');
    enc[enc.length - 1] ^= 0xff; // corrompe a cifra
    await expect(c.decrypt(enc)).rejects.toBeInstanceOf(SecurityError);
  });

  it('chave errada não descriptografa', async () => {
    const enc = await aesGcmCipher(randomBytes(32)).encrypt('x');
    await expect(aesGcmCipher(randomBytes(32)).decrypt(enc)).rejects.toBeInstanceOf(SecurityError);
  });
});

describe('EncryptedFileSecretStore', () => {
  it('ida e volta, lista e remove', async () => {
    const path = join(dir, 'secrets.enc');
    const cipher = aesGcmCipher(randomBytes(32));
    const store = new EncryptedFileSecretStore({ path, cipher });
    await store.set('a_key', 'valor-a');
    await store.set('b_key', 'valor-b');
    expect(await store.get('a_key')).toBe('valor-a');
    expect((await store.list()).sort()).toEqual(['a_key', 'b_key']);
    await store.delete('a_key');
    expect(await store.has('a_key')).toBe(false);
    expect(await store.get('b_key')).toBe('valor-b');
  });

  it('persiste entre instâncias com a mesma chave', async () => {
    const path = join(dir, 'persist.enc');
    const key = randomBytes(32);
    const s1 = new EncryptedFileSecretStore({ path, cipher: aesGcmCipher(key) });
    await s1.set('token_api', 'segredo');
    const s2 = new EncryptedFileSecretStore({ path, cipher: aesGcmCipher(key) });
    expect(await s2.get('token_api')).toBe('segredo');
  });

  it('o arquivo no disco não contém o texto claro', async () => {
    const path = join(dir, 'opaco.enc');
    const store = new EncryptedFileSecretStore({ path, cipher: aesGcmCipher(randomBytes(32)) });
    await store.set('x', 'TEXTO-SUPER-SECRETO-12345');
    const raw = readFileSync(path);
    expect(raw.toString('latin1')).not.toContain('TEXTO-SUPER-SECRETO-12345');
    // permissão 0600 onde o SO suporta
    const mode = statSync(path).mode & 0o777;
    if (process.platform !== 'win32') expect(mode).toBe(0o600);
  });

  it('detecta adulteração do arquivo ao ler (mesma chave)', async () => {
    const path = join(dir, 'tamper.enc');
    const key = randomBytes(32);
    const store = new EncryptedFileSecretStore({ path, cipher: aesGcmCipher(key) });
    await store.set('x', 'y');
    const raw = readFileSync(path);
    raw[raw.length - 1] ^= 0xff;
    writeFileSync(path, raw);
    const store2 = new EncryptedFileSecretStore({ path, cipher: aesGcmCipher(key) });
    await expect(store2.get('x')).rejects.toBeInstanceOf(SecurityError);
  });

  it('arquivo inexistente começa vazio', async () => {
    const store = new EncryptedFileSecretStore({ path: join(dir, 'nao-existe.enc'), cipher: aesGcmCipher(randomBytes(32)) });
    expect(await store.list()).toEqual([]);
    expect(await store.get('x')).toBeUndefined();
  });
});
