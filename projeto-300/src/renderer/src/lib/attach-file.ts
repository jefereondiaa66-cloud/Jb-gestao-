/**
 * Converte arquivos escolhidos/arrastados/colados em anexos base64.
 * Imagens grandes são reduzidas (lado máximo 1568 px, JPEG) para caber no limite do modelo.
 */
import type { Attachment } from '../../../shared/ipc';
import { LIMITS, bytesToBase64, classifyFile, displayName, fitWithin, normalizeMediaType, rejectReason, type AttachmentKind } from './attachments';

export interface PendingAttachment {
  id: string;
  kind: AttachmentKind;
  attachment: Attachment;
  /** Tamanho final em bytes. */
  size: number;
  /** data: URL para miniatura (só imagens). */
  preview?: string;
  /** Observação (ex.: "reduzida para 1568 px"). */
  note?: string;
}

let counter = 0;

async function readBytes(file: Blob): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

async function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao converter a imagem'))), type, quality);
  });
}

async function shrinkImage(file: Blob): Promise<{ bytes: Uint8Array; mediaType: string; width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  try {
    let maxSide: number = LIMITS.imageMaxSide;
    let quality = 0.88;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, maxSide);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext('2d');
      if (!g) throw new Error('sem contexto 2D');
      // fundo branco: JPEG não tem transparência
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, width, height);
      g.imageSmoothingQuality = 'high';
      g.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      if (blob.size <= LIMITS.imageBytes) return { bytes: await readBytes(blob), mediaType: 'image/jpeg', width, height };
      maxSide = Math.round(maxSide * 0.75);
      quality = Math.max(0.6, quality - 0.1);
    }
    throw new Error('a imagem continua grande demais mesmo reduzida');
  } finally {
    bitmap.close();
  }
}

async function imageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

/** Lança Error com mensagem pt-BR quando o arquivo não pode ser anexado. */
export async function fileToAttachment(file: File): Promise<PendingAttachment> {
  const name = displayName(file.name || 'arquivo');
  const reason = rejectReason(name, file.type, file.size);
  if (reason) throw new Error(reason);
  const kind = classifyFile(name, file.type)!;
  const mediaType = normalizeMediaType(name, file.type) || 'text/plain';
  const id = `anexo-${Date.now()}-${++counter}`;

  if (kind === 'image') {
    const dims = await imageSize(file);
    if (!dims) throw new Error(`Não foi possível abrir a imagem "${name}".`);
    const tooBig = file.size > LIMITS.imageBytes || Math.max(dims.width, dims.height) > LIMITS.imageMaxSide;
    if (tooBig && mediaType === 'image/gif') throw new Error(`O GIF "${name}" é grande demais (máximo ${Math.round(LIMITS.imageBytes / 1048576)} MB).`);
    if (tooBig) {
      const shrunk = await shrinkImage(file);
      const data = bytesToBase64(shrunk.bytes);
      const finalName = name.replace(/\.[a-z0-9]+$/i, '') + '.jpg';
      return {
        id,
        kind,
        attachment: { name: finalName, mediaType: shrunk.mediaType, data },
        size: shrunk.bytes.length,
        preview: `data:${shrunk.mediaType};base64,${data}`,
        note: `reduzida para ${shrunk.width}×${shrunk.height}`,
      };
    }
    const data = bytesToBase64(await readBytes(file));
    return { id, kind, attachment: { name, mediaType, data }, size: file.size, preview: `data:${mediaType};base64,${data}` };
  }

  const bytes = await readBytes(file);
  return { id, kind, attachment: { name, mediaType, data: bytesToBase64(bytes) }, size: bytes.length };
}

/** Dá nome a imagens coladas da área de transferência ("image.png" genérico). */
export function namePasted(file: File): File {
  if (file.name && file.name !== 'image.png' && file.name !== 'image.jpg') return file;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1] || 'png';
  const name = `colado-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.${ext}`;
  return new File([file], name, { type: file.type });
}
