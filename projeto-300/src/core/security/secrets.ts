/**
 * Guardas de segredos (chaves de API, tokens).
 *
 * - `EnvSecretStore`: lê de variáveis de ambiente (CLI/dev). `set` guarda só na
 *   memória do processo (não escreve no sistema).
 * - `EncryptedFileSecretStore`: guarda um mapa JSON criptografado inteiro, em
 *   arquivo, com escrita atômica e permissão 0600. O Electron pluga o
 *   `safeStorage`; na CLI usa-se `aesGcmCipher`.
 * - `aesGcmCipher`: AES-256-GCM (IV aleatório + tag de autenticação). Detecta
 *   adulteração (a decriptação falha se o arquivo for mexido).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { SECRET_NAMES, type SecretStore } from '../types';
import { SecurityError } from './paths';

/* ---------------- EnvSecretStore ---------------- */

/** Mapa nome-guardado -> variável de ambiente. */
const ENV_MAP: Record<string, string> = {
  [SECRET_NAMES.anthropic]: 'ANTHROPIC_API_KEY',
  [SECRET_NAMES.openai]: 'OPENAI_API_KEY',
  [SECRET_NAMES.elevenlabs]: 'ELEVENLABS_API_KEY',
  [SECRET_NAMES.brave]: 'BRAVE_SEARCH_API_KEY',
  [SECRET_NAMES.tavily]: 'TAVILY_API_KEY',
  [SECRET_NAMES.picovoice]: 'PICOVOICE_ACCESS_KEY',
};

function envVarFor(name: string): string {
  return ENV_MAP[name] ?? name.toUpperCase();
}

export class EnvSecretStore implements SecretStore {
  private readonly mem = new Map<string, string>();
  private readonly deleted = new Set<string>();

  constructor(private readonly env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env) {}

  async get(name: string): Promise<string | undefined> {
    if (this.mem.has(name)) return this.mem.get(name);
    if (this.deleted.has(name)) return undefined;
    const v = this.env[envVarFor(name)];
    return v && v.trim() !== '' ? v : undefined;
  }

  async set(name: string, value: string): Promise<void> {
    this.mem.set(name, value);
    this.deleted.delete(name);
  }

  async delete(name: string): Promise<void> {
    this.mem.delete(name);
    this.deleted.add(name);
  }

  async has(name: string): Promise<boolean> {
    return (await this.get(name)) !== undefined;
  }

  async list(): Promise<string[]> {
    const names = new Set<string>();
    for (const k of this.mem.keys()) names.add(k);
    for (const [name, envVar] of Object.entries(ENV_MAP)) {
      if (this.deleted.has(name)) continue;
      const v = this.env[envVar];
      if (v && v.trim() !== '') names.add(name);
    }
    return [...names].sort();
  }
}

/* ---------------- Cipher ---------------- */

export interface SecretCipher {
  encrypt(plain: string): Promise<Buffer>;
  decrypt(data: Buffer): Promise<string>;
}

const GCM_VERSION = 1;
const IV_LEN = 12;
const TAG_LEN = 16;

/** AES-256-GCM com IV aleatório e tag de autenticação. Formato: [ver][iv(12)][tag(16)][cifra]. */
export function aesGcmCipher(masterKey: Buffer): SecretCipher {
  if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
    throw new SecurityError('a chave mestra precisa ter 32 bytes (AES-256).');
  }
  return {
    async encrypt(plain: string): Promise<Buffer> {
      const iv = randomBytes(IV_LEN);
      const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
      const enc = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([Buffer.from([GCM_VERSION]), iv, tag, enc]);
    },
    async decrypt(data: Buffer): Promise<string> {
      if (!Buffer.isBuffer(data) || data.length < 1 + IV_LEN + TAG_LEN) throw new SecurityError('dados criptografados inválidos.');
      if (data[0] !== GCM_VERSION) throw new SecurityError('formato de criptografia não reconhecido.');
      const iv = data.subarray(1, 1 + IV_LEN);
      const tag = data.subarray(1 + IV_LEN, 1 + IV_LEN + TAG_LEN);
      const enc = data.subarray(1 + IV_LEN + TAG_LEN);
      try {
        const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
      } catch {
        throw new SecurityError('não foi possível descriptografar (dados corrompidos ou chave errada).');
      }
    },
  };
}

/* ---------------- EncryptedFileSecretStore ---------------- */

export interface EncryptedFileSecretStoreOptions {
  path: string;
  cipher: SecretCipher;
}

export class EncryptedFileSecretStore implements SecretStore {
  private readonly path: string;
  private readonly cipher: SecretCipher;
  private cache: Record<string, string> | null = null;
  private chain: Promise<unknown> = Promise.resolve();

  constructor(opts: EncryptedFileSecretStoreOptions) {
    this.path = opts.path;
    this.cipher = opts.cipher;
  }

  /** Serializa operações para não corromper o arquivo com escritas concorrentes. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(fn, fn);
    this.chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private async load(): Promise<Record<string, string>> {
    if (this.cache) return this.cache;
    let raw: Buffer;
    try {
      raw = await readFile(this.path);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        this.cache = {};
        return this.cache;
      }
      throw e;
    }
    if (raw.length === 0) {
      this.cache = {};
      return this.cache;
    }
    const json = await this.cipher.decrypt(raw); // lança SecurityError se adulterado
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new SecurityError('o arquivo de segredos está corrompido.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SecurityError('o arquivo de segredos está corrompido.');
    const map: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (typeof v === 'string') map[k] = v;
    this.cache = map;
    return map;
  }

  private async persist(map: Record<string, string>): Promise<void> {
    const enc = await this.cipher.encrypt(JSON.stringify(map));
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp-${randomBytes(6).toString('hex')}`;
    try {
      await writeFile(tmp, enc, { mode: 0o600 });
      try {
        await chmod(tmp, 0o600);
      } catch {
        /* alguns SOs ignoram chmod */
      }
      await rename(tmp, this.path);
      try {
        await chmod(this.path, 0o600);
      } catch {
        /* idem */
      }
    } catch (e) {
      try {
        await unlink(tmp);
      } catch {
        /* temp já pode ter sumido */
      }
      throw e;
    }
    this.cache = map;
  }

  get(name: string): Promise<string | undefined> {
    return this.run(async () => {
      const map = await this.load();
      return map[name];
    });
  }

  set(name: string, value: string): Promise<void> {
    return this.run(async () => {
      const map = { ...(await this.load()) };
      map[name] = value;
      await this.persist(map);
    });
  }

  delete(name: string): Promise<void> {
    return this.run(async () => {
      const map = { ...(await this.load()) };
      if (name in map) {
        delete map[name];
        await this.persist(map);
      }
    });
  }

  has(name: string): Promise<boolean> {
    return this.run(async () => {
      const map = await this.load();
      return Object.prototype.hasOwnProperty.call(map, name);
    });
  }

  list(): Promise<string[]> {
    return this.run(async () => {
      const map = await this.load();
      return Object.keys(map).sort();
    });
  }
}
