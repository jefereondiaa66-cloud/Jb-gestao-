/**
 * Ocultação de dados sensíveis antes de registrar (auditoria) ou de mostrar
 * num pedido de confirmação.
 *
 * `redactInput` recebe qualquer valor (entrada de ferramenta vinda do modelo),
 * faz uma cópia profunda segura (sem ciclos, com limites de tamanho) e esconde:
 * - o valor de campos cujo nome parece segredo (senha, token, api_key, cookie…);
 * - textos muito longos que parecem binário/base64 ("[dados binários ~N KB]");
 * - textos normais, cortados em 2000 caracteres.
 * O resultado é sempre seguro para JSON.
 */
import { redactSecrets } from '../util/logger';

/**
 * Decide se o NOME de um campo indica segredo. Em vez de casar a substring crua
 * (que escondia "passos", "keys" ou "hotkey" de um assistente que controla o
 * teclado — justamente o que a auditoria precisa ver), quebra o nome em palavras
 * (camelCase, _ e -) e só oculta quando uma palavra inteira é sensível. O valor
 * em si continua passando pelo detector de segredos embutidos (redactText), que
 * é a rede de segurança caso um nome escape.
 */
const SECRET_TOKENS: ReadonlySet<string> = new Set([
  'password', 'passwd', 'pwd', 'passphrase', 'senha',
  'secret', 'token', 'apikey', 'authorization', 'auth', 'bearer', 'cookie',
  'credential', 'credentials', 'key', 'privatekey', 'accesskey', 'secretkey',
  'session', 'pat',
]);

function nameTokens(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // apiKey -> api Key
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // APIKey -> API Key
    .split(/[^a-zA-Z0-9]+/) // _  -  .  etc
    .map((t) => t.toLowerCase())
    .filter((t) => t !== '');
}

export function isSecretKey(name: string): boolean {
  const n = String(name ?? '');
  for (const t of nameTokens(n)) if (SECRET_TOKENS.has(t)) return true;
  // formas coladas comuns (apikey, accesskey) sem separador nem camelCase
  const flat = n.toLowerCase().replace(/[^a-z0-9]/g, '');
  return /^(apikey|accesskey|secretkey|privatekey|sessiontoken|refreshtoken|authtoken|clientsecret)$/.test(flat);
}

const STRING_MAX = 2000;
const BINARY_MIN = 200;

export interface RedactOptions {
  maxDepth?: number;
  maxKeys?: number;
  maxArray?: number;
}

/** Marcador para blobs binários (base64, imagens, etc.). */
function binaryMarker(bytes: number): string {
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `[dados binários ~${kb} KB]`;
}

/** O texto parece binário/base64/hex ou tem muitos caracteres de controle? */
function looksBinary(s: string): boolean {
  if (/^data:[^;,]{0,120};base64,/i.test(s)) return true;
  const sample = s.slice(0, 8192);
  // Um "pedaço" longo e ininterrupto de caracteres base64/hex (sem espaços):
  // texto comum tem espaços entre palavras, então nunca forma uma sequência tão longa.
  if (/[A-Za-z0-9+/=_-]{200,}/.test(sample)) return true; // base64/base64url
  if (/[0-9a-fA-F]{200,}/.test(sample)) return true; // hex
  let np = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c < 9 || (c > 13 && c < 32) || c === 0xfffd) np++;
  }
  return sample.length > 0 && np / sample.length > 0.1;
}

/** Reaproveita a ocultação de segredos do logger e aplica limites a um texto. */
export function redactText(text: unknown): string {
  return redactSecrets(String(text ?? ''));
}

function redactString(s: string): string {
  let out = redactText(s);
  if (out.length > BINARY_MIN && looksBinary(out)) return binaryMarker(Buffer.byteLength(out, 'utf8'));
  if (out.length > STRING_MAX) out = out.slice(0, STRING_MAX) + `…[+${out.length - STRING_MAX} caracteres]`;
  return out;
}

/**
 * Atribui uma propriedade PRÓPRIA sem o perigo de "__proto__"/"constructor"
 * (um `out['__proto__'] = x` mudaria o protótipo em vez de guardar o dado,
 * perdendo o dado e abrindo brecha de "prototype pollution").
 */
function assign(out: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) return;
  Object.defineProperty(out, key, { value, enumerable: true, configurable: true, writable: true });
}

export function redactInput(value: unknown, opts: RedactOptions = {}): unknown {
  const maxDepth = opts.maxDepth ?? 12;
  const maxKeys = opts.maxKeys ?? 200;
  const maxArray = opts.maxArray ?? 500;
  const seen = new WeakSet<object>();

  const walk = (v: unknown, depth: number): unknown => {
    if (v === null) return null;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v as number) ? (v as number) : String(v);
    if (t === 'boolean') return v;
    if (t === 'bigint') return (v as bigint).toString();
    if (t === 'string') return redactString(v as string);
    if (t === 'undefined' || t === 'function' || t === 'symbol') return undefined;
    if (t !== 'object') return String(v);

    const obj = v as object;
    if (depth >= maxDepth) return '[profundidade máxima]';
    if (seen.has(obj)) return '[referência cíclica]';

    // Tipos binários conhecidos: não despejar os bytes.
    if (Buffer.isBuffer(obj)) return binaryMarker(obj.length);
    if (obj instanceof ArrayBuffer) return binaryMarker(obj.byteLength);
    if (ArrayBuffer.isView(obj)) return binaryMarker((obj as ArrayBufferView).byteLength ?? 0);
    if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? null : obj.toISOString();
    if (obj instanceof RegExp) return redactString(obj.toString());
    if (obj instanceof Error) return `${obj.name}: ${redactString(obj.message)}`;

    seen.add(obj);
    try {
      if (Array.isArray(obj)) {
        const out: unknown[] = [];
        const n = Math.min(obj.length, maxArray);
        for (let i = 0; i < n; i++) {
          const r = walk(obj[i], depth + 1);
          out.push(r === undefined ? null : r);
        }
        if (obj.length > maxArray) out.push(`[+${obj.length - maxArray} itens omitidos]`);
        return out;
      }
      if (obj instanceof Map) {
        const out: Record<string, unknown> = {};
        let i = 0;
        for (const [k, val] of obj) {
          if (i++ >= maxKeys) {
            out['__omitido__'] = `[+${obj.size - maxKeys} campos omitidos]`;
            break;
          }
          const key = String(k);
          assign(out, key, isSecretKey(key) ? '[oculto]' : walk(val, depth + 1));
        }
        return out;
      }
      if (obj instanceof Set) {
        const arr = [...obj].slice(0, maxArray).map((x) => walk(x, depth + 1));
        if (obj.size > maxArray) arr.push(`[+${obj.size - maxArray} itens omitidos]`);
        return arr;
      }

      const out: Record<string, unknown> = {};
      const keys = Object.keys(obj as Record<string, unknown>);
      const n = Math.min(keys.length, maxKeys);
      for (let i = 0; i < n; i++) {
        const k = keys[i]!;
        if (isSecretKey(k)) {
          assign(out, k, '[oculto]');
          continue;
        }
        const r = walk((obj as Record<string, unknown>)[k], depth + 1);
        if (r !== undefined) assign(out, k, r);
      }
      if (keys.length > maxKeys) out['__omitido__'] = `[+${keys.length - maxKeys} campos omitidos]`;
      return out;
    } catch {
      return '[conteúdo não serializável]';
    } finally {
      seen.delete(obj);
    }
  };

  try {
    const r = walk(value, 0);
    return r === undefined ? null : r;
  } catch {
    return '[conteúdo não serializável]';
  }
}
