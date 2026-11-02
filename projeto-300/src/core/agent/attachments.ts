/**
 * Anexos do dono -> partes da mensagem.
 * - Imagens viram partes de imagem (se o modelo enxerga).
 * - PDFs viram documentos (se o modelo lê PDF) ou um aviso.
 * - Arquivos de texto entram como texto, marcados como conteúdo externo
 *   (podem ter vindo de terceiros e conter instruções escondidas).
 */
import type { Attachment } from '../../shared/ipc';
import { wrapUntrusted } from '../security/untrusted';
import type { ContentPart, ImageMediaType, ModelCapabilities } from '../types';

const IMAGE_TYPES: Record<string, ImageMediaType> = {
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/webp': 'image/webp',
  'image/gif': 'image/gif',
};

const TEXT_MEDIA = /^(text\/.+|application\/(json|xml|x-yaml|yaml|javascript|x-javascript|typescript|x-sh|x-shellscript|csv|x-ndjson|ndjson|sql|x-sql|toml|x-toml|ld\+json|xhtml\+xml|x-httpd-php|x-python|rtf))$/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|ndjson|xml|ya?ml|log|ini|cfg|conf|toml|env\.example|ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|c|h|cpp|hpp|cs|php|sh|bat|ps1|sql|html?|css|scss|vue|svelte|srt|vtt)$/i;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const MAX_TEXT_CHARS = 200_000;

export interface AttachmentResult {
  parts: ContentPart[];
  /** Algum anexo trouxe conteúdo de terceiros (texto) para a tarefa. */
  tainted: boolean;
}

function cleanBase64(data: string): string {
  const comma = data.startsWith('data:') ? data.indexOf(',') : -1;
  return (comma >= 0 ? data.slice(comma + 1) : data).replace(/\s+/g, '');
}

function safeName(name: string): string {
  const n = (name || 'arquivo').replace(/[\r\n"<>]/g, ' ').trim();
  return n.length > 120 ? n.slice(0, 120) + '…' : n || 'arquivo';
}

function note(text: string): ContentPart {
  return { type: 'text', text: `[Anexo] ${text}` };
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
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

    const imageType = IMAGE_TYPES[media];
    if (imageType) {
      if (!caps.vision) parts.push(note(`imagem "${name}" recebida, mas o modelo atual não enxerga imagens. Troque de modelo para analisá-la.`));
      else if (bytes.length > MAX_IMAGE_BYTES) parts.push(note(`imagem "${name}" é grande demais (máximo 5 MB). Reduza o tamanho e envie de novo.`));
      else parts.push({ type: 'image', mediaType: imageType, data: bytes.toString('base64') });
      continue;
    }

    if (media === 'application/pdf' || /\.pdf$/i.test(name)) {
      if (!caps.pdf) parts.push(note(`PDF "${name}" recebido, mas o modelo atual não lê PDFs diretamente. Salve o arquivo e peça para eu usar a ferramenta de documentos, ou troque de modelo.`));
      else if (bytes.length > MAX_PDF_BYTES) parts.push(note(`PDF "${name}" é grande demais (máximo 30 MB).`));
      else parts.push({ type: 'document', mediaType: 'application/pdf', data: bytes.toString('base64'), name });
      continue;
    }

    if (TEXT_MEDIA.test(media) || TEXT_EXT.test(name)) {
      if (looksBinary(bytes)) {
        parts.push(note(`"${name}" parece ser um arquivo binário e não pode ser lido como texto.`));
        continue;
      }
      let text = bytes.toString('utf8').replace(/^﻿/, '');
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
