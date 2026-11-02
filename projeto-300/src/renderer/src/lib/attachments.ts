/**
 * Regras dos anexos (imagens, PDF e texto) — parte pura, testável no Node.
 * Os limites acompanham o núcleo (src/core/agent/attachments.ts).
 */

export type AttachmentKind = 'image' | 'pdf' | 'text';

export const LIMITS = {
  /** Imagem final enviada ao modelo (o núcleo recusa acima de 5 MB). */
  imageBytes: 4.5 * 1024 * 1024,
  /** Imagem de origem aceita para redução. */
  imageSourceBytes: 40 * 1024 * 1024,
  /** Maior lado da imagem enviada (recomendação dos modelos de visão). */
  imageMaxSide: 1568,
  pdfBytes: 30 * 1024 * 1024,
  textBytes: 2 * 1024 * 1024,
  count: 10,
} as const;

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/pjpeg', 'image/webp', 'image/gif']);
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|ndjson|xml|ya?ml|log|ini|cfg|conf|toml|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bat|ps1|sql|html?|css|scss|vue|svelte|srt|vtt)$/i;
const TEXT_MEDIA = /^(text\/.+|application\/(json|xml|x-yaml|yaml|javascript|x-javascript|typescript|x-sh|x-shellscript|csv|x-ndjson|ndjson|sql|x-sql|toml|x-toml|ld\+json))$/i;
const IMAGE_EXT: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

/** Valor do atributo accept do seletor de arquivos. */
export const ACCEPT_ATTR =
  'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.markdown,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.log,.ini,.toml,.txt,.ts,.tsx,.js,.py,.sql,.html,.css';

const extOf = (name: string): string => {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1]!.toLowerCase() : '';
};

/** Normaliza o tipo informado pelo navegador (às vezes vazio no Windows). */
export function normalizeMediaType(name: string, type: string): string {
  const t = (type || '').toLowerCase().split(';')[0]!.trim();
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg';
  if (t) return t;
  const ext = extOf(name);
  if (IMAGE_EXT[ext]) return IMAGE_EXT[ext]!;
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'md' || ext === 'markdown') return 'text/markdown';
  if (ext === 'csv') return 'text/csv';
  if (ext === 'json') return 'application/json';
  if (TEXT_EXT.test(name)) return 'text/plain';
  return '';
}

export function classifyFile(name: string, type: string): AttachmentKind | null {
  const media = normalizeMediaType(name, type);
  if (IMAGE_TYPES.has(media)) return 'image';
  if (media === 'application/pdf') return 'pdf';
  if (TEXT_MEDIA.test(media) || TEXT_EXT.test(name)) return 'text';
  return null;
}

/** Motivo (pt-BR) para recusar o arquivo, ou null se estiver dentro dos limites. */
export function rejectReason(name: string, type: string, size: number): string | null {
  const kind = classifyFile(name, type);
  if (!kind) return `"${name}" não é um tipo aceito. Envie imagens (PNG, JPG, WEBP, GIF), PDF ou arquivos de texto.`;
  if (size <= 0) return `"${name}" está vazio.`;
  if (kind === 'image' && size > LIMITS.imageSourceBytes) return `A imagem "${name}" é grande demais (máximo ${formatBytes(LIMITS.imageSourceBytes)}).`;
  if (kind === 'pdf' && size > LIMITS.pdfBytes) return `O PDF "${name}" é grande demais (máximo ${formatBytes(LIMITS.pdfBytes)}).`;
  if (kind === 'text' && size > LIMITS.textBytes) return `O arquivo "${name}" é grande demais (máximo ${formatBytes(LIMITS.textBytes)}).`;
  return null;
}

/** Converte bytes em base64 sem estourar a pilha (em blocos). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK) as unknown as number[]);
  }
  return btoa(binary);
}

/** Tamanho em bytes representado por uma string base64. */
export function base64ByteLength(b64: string): number {
  const clean = b64.replace(/\s+/g, '');
  if (!clean) return 0;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - pad;
}

/** Dimensões que cabem em `maxSide` mantendo a proporção. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number; scaled: boolean } {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const longest = Math.max(w, h);
  if (longest <= maxSide) return { width: w, height: h, scaled: false };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

export function formatBytes(n: number): string {
  if (!(n > 0)) return '0 B';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toLocaleString('pt-BR', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[u]}`;
}

/** Nome seguro para exibição (sem quebras e limitado). */
export function displayName(name: string): string {
  const n = (name || 'arquivo').replace(/[\r\n\t]/g, ' ').trim() || 'arquivo';
  return n.length > 80 ? n.slice(0, 77) + '…' : n;
}
