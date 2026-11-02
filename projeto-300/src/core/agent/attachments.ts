/**
 * Anexos do dono -> partes da mensagem.
 * - Imagens viram partes de imagem (se o modelo enxerga). O tipo real é lido
 *   dos primeiros bytes: um .png que na verdade é JPEG (comum no Windows)
 *   faria a API recusar o pedido e travaria a conversa inteira.
 * - PDFs viram documentos (se o modelo lê PDF) ou um aviso.
 * - Arquivos de texto entram como texto, marcados como conteúdo externo
 *   (podem ter vindo de terceiros e conter instruções escondidas). Aceita
 *   UTF-8, UTF-16 (Bloco de Notas/PowerShell) e Windows-1252 (Excel em pt-BR).
 * - Qualquer anexo legível (texto, PDF ou imagem) pode trazer instruções
 *   escondidas, então "contamina" a tarefa.
 */
import type { Attachment } from '../../shared/ipc';
import { wrapUntrusted } from '../security/untrusted';
import type { ContentPart, ImageMediaType, ModelCapabilities } from '../types';

const IMAGE_EXT = /\.(png|jpe?g|jfif|webp|gif)$/i;

const TEXT_MEDIA = /^(text\/.+|application\/(json|xml|x-yaml|yaml|javascript|x-javascript|typescript|x-sh|x-shellscript|csv|x-ndjson|ndjson|sql|x-sql|toml|x-toml|ld\+json|xhtml\+xml|x-httpd-php|x-python|rtf))$/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|ndjson|xml|ya?ml|log|ini|cfg|conf|toml|env\.example|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bat|ps1|sql|html?|css|scss|vue|svelte|srt|vtt)$/i;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;

export interface AttachmentResult {
  parts: ContentPart[];
  /** Algum anexo trouxe conteúdo de terceiros (texto, PDF ou imagem) para a tarefa. */
  tainted: boolean;
}

function cleanBase64(data: string): string {
  const comma = data.startsWith('data:') ? data.indexOf(',') : -1;
  return (comma >= 0 ? data.slice(comma + 1) : data).replace(/\s+/g, '');
}

function safeName(name: string): string {
  // Só o nome do arquivo: um caminho completo (C:\Users\fulano\...) não precisa ir para o modelo.
  const base = (name || '').split(/[\\/]/).filter(Boolean).pop() ?? '';
  const n = (base || 'arquivo').replace(/[\r\n"<>]/g, ' ').trim();
  return n.length > 120 ? n.slice(0, 120) + '…' : n || 'arquivo';
}

function note(text: string): ContentPart {
  return { type: 'text', text: `[Anexo] ${text}` };
}

/** Tipo real da imagem pelos primeiros bytes (assinatura do formato). */
export function sniffImageType(bytes: Uint8Array): ImageMediaType | undefined {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // RIFF
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 // WEBP
  )
    return 'image/webp';
  return undefined;
}

/** Começa com "%PDF-" (pode ter alguns bytes de lixo antes, como permite a especificação). */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString('latin1');
  return head.includes('%PDF-');
}

/**
 * Decodifica texto de arquivo do jeito que ele foi salvo:
 * BOM UTF-8/UTF-16, UTF-16 sem BOM (muitos zeros alternados), UTF-8 válido
 * ou, se não for UTF-8 válido, Windows-1252 (padrão de muitos programas no Windows em pt-BR).
 * Retorna undefined se parecer binário.
 */
export function decodeText(bytes: Uint8Array): string | undefined {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return safeDecode('utf-8', b.subarray(3));
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return safeDecode('utf-16le', b.subarray(2));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return safeDecode('utf-16be', b.subarray(2));

  const n = Math.min(b.length, 8000);
  let zerosEven = 0;
  let zerosOdd = 0;
  for (let i = 0; i < n; i++) {
    if (b[i] === 0) {
      if (i % 2 === 0) zerosEven++;
      else zerosOdd++;
    }
  }
  const half = Math.max(1, Math.floor(n / 2));
  // UTF-16 sem BOM: texto latino tem um zero em quase todo par de bytes, sempre do mesmo lado.
  if (zerosOdd / half > 0.3 && zerosEven / half < 0.05) return safeDecode('utf-16le', b);
  if (zerosEven / half > 0.3 && zerosOdd / half < 0.05) return safeDecode('utf-16be', b);
  if (zerosEven + zerosOdd > 0) return undefined; // binário

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b);
  } catch {
    return safeDecode('windows-1252', b);
  }
}

function safeDecode(encoding: string, b: Uint8Array): string | undefined {
  try {
    const text = new TextDecoder(encoding).decode(b);
    // Texto "decodificado" cheio de caracteres de controle é binário disfarçado.
    const ctrl = (text.slice(0, 4000).match(/[\u0000-\u0008\u000e-\u001f]/g) ?? []).length;
    return ctrl > 8 ? undefined : text;
  } catch {
    return undefined;
  }
}

export function attachmentsToParts(attachments: Attachment[] | undefined, caps: ModelCapabilities): AttachmentResult {
  const parts: ContentPart[] = [];
  let tainted = false;
  for (const a of attachments ?? []) {
    const name = safeName(a.name);
    const media = (a.mediaType || '').toLowerCase().split(';')[0]!.trim();
    const b64 = cleanBase64(a.data || '');
    let bytes: Buffer;
    try {
      bytes = Buffer.from(b64, 'base64');
    } catch {
      parts.push(note(`"${name}" não pôde ser lido (dados inválidos).`));
      continue;
    }
    if (bytes.length === 0) {
      parts.push(note(`"${name}" está vazio.`));
      continue;
    }

    const genericMedia = media === '' || media === 'application/octet-stream';
    const declaredImage = media.startsWith('image/') || (genericMedia && IMAGE_EXT.test(name));
    const sniffed = sniffImageType(bytes);
    if (declaredImage || (sniffed !== undefined && genericMedia)) {
      if (!sniffed) {
        parts.push(note(`"${name}" não é uma imagem PNG, JPEG, WebP ou GIF válida. Converta para um desses formatos e envie de novo.`));
        continue;
      }
      if (!caps.vision) parts.push(note(`imagem "${name}" recebida, mas o modelo atual não enxerga imagens. Troque de modelo para analisá-la.`));
      else if (bytes.length > MAX_IMAGE_BYTES) parts.push(note(`imagem "${name}" é grande demais (máximo 5 MB). Reduza o tamanho e envie de novo.`));
      else {
        // O tipo real (pelos bytes) vale mais que o nome ou a extensão do arquivo.
        parts.push({ type: 'image', mediaType: sniffed, data: bytes.toString('base64') });
        tainted = true;
      }
      continue;
    }

    if (media === 'application/pdf' || /\.pdf$/i.test(name)) {
      if (!looksLikePdf(bytes)) parts.push(note(`"${name}" não parece ser um PDF válido.`));
      else if (!caps.pdf) parts.push(note(`PDF "${name}" recebido, mas o modelo atual não lê PDFs diretamente. Salve o arquivo e peça para eu usar a ferramenta de documentos, ou troque de modelo.`));
      else if (bytes.length > MAX_PDF_BYTES) parts.push(note(`PDF "${name}" é grande demais (máximo 30 MB).`));
      else {
        parts.push({ type: 'document', mediaType: 'application/pdf', data: bytes.toString('base64'), name });
        tainted = true;
      }
      continue;
    }

    if (TEXT_MEDIA.test(media) || TEXT_EXT.test(name)) {
      const decoded = decodeText(bytes);
      if (decoded === undefined) {
        parts.push(note(`"${name}" parece ser um arquivo binário e não pode ser lido como texto.`));
        continue;
      }
      let text = decoded.replace(/^﻿/, '');
      let cut = '';
      if (text.length > MAX_TEXT_CHARS) {
        cut = `\n[arquivo cortado: ${text.length - MAX_TEXT_CHARS} caracteres omitidos]`;
        text = text.slice(0, MAX_TEXT_CHARS);
      }
      parts.push({ type: 'text', text: `Arquivo anexado "${name}":\n${wrapUntrusted(text + cut, `anexo: ${name}`)}` });
      tainted = true;
      continue;
    }

    parts.push(note(`"${name}" (${media || 'tipo desconhecido'}) não pode ser lido diretamente. Se ele estiver salvo no computador, posso tentar com as ferramentas de arquivos.`));
  }
  return { parts, tainted };
}
