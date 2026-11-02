import { describe, expect, it } from 'vitest';
import { attachmentsToParts, decodeText, looksLikePdf, sniffImageType } from '@core/agent';
import type { ModelCapabilities } from '@core/types';

const caps: ModelCapabilities = { vision: true, pdf: true, tools: true, serverWebSearch: false, serverWebFetch: false };
const b64 = (b: Buffer | Uint8Array) => Buffer.from(b).toString('base64');

function utf16le(text: string, bom: boolean): Buffer {
  const body = Buffer.from(text, 'utf16le');
  return bom ? Buffer.concat([Buffer.from([0xff, 0xfe]), body]) : body;
}

describe('anexos de texto no Windows', () => {
  it('UTF-16 com BOM (Bloco de Notas "Unicode", saída do PowerShell) é lido como texto, não como binário', () => {
    const text = 'Relatório de vendas\r\nJoão;São Paulo;R$ 1.234,56\r\n';
    expect(decodeText(utf16le(text, true))).toBe(text);
    const r = attachmentsToParts([{ name: 'saida.txt', mediaType: 'text/plain', data: b64(utf16le(text, true)) }], caps);
    expect(r.parts).toHaveLength(1);
    expect((r.parts[0] as { text: string }).text).toContain('João;São Paulo');
    expect(r.tainted).toBe(true);
  });

  it('UTF-16 sem BOM e UTF-16 big-endian também', () => {
    const text = 'Configuração: ação rápida';
    expect(decodeText(utf16le(text, false))).toBe(text);
    const be = Buffer.from(utf16le(text, false));
    be.swap16();
    expect(decodeText(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))).toBe(text);
  });

  it('CSV do Excel em Windows-1252 mantém os acentos (sem "�")', () => {
    // "Descrição;Preço\r\nCafé;R$ 5,00\r\n" em Windows-1252
    const bytes = Buffer.from('Descri\xe7\xe3o;Pre\xe7o\r\nCaf\xe9;R$ 5,00 \x80\r\n', 'latin1');
    const text = decodeText(bytes)!;
    expect(text).toBe('Descrição;Preço\r\nCafé;R$ 5,00 €\r\n');
    expect(text).not.toContain('�');
  });

  it('UTF-8 (com e sem BOM) continua igual', () => {
    expect(decodeText(Buffer.from('﻿olá', 'utf8'))).toBe('olá');
    expect(decodeText(Buffer.from('olá', 'utf8'))).toBe('olá');
  });

  it('binário de verdade continua recusado', () => {
    const bin = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00, 0x00, 0x01, 0x02, 0x00, 0x00]);
    expect(decodeText(bin)).toBeUndefined();
    const r = attachmentsToParts([{ name: 'programa.txt', mediaType: 'text/plain', data: b64(bin) }], caps);
    expect((r.parts[0] as { text: string }).text).toContain('binário');
    expect(r.tainted).toBe(false);
  });
});

describe('tipo real de imagens e PDFs', () => {
  it('reconhece PNG, JPEG, GIF e WebP pelos bytes', () => {
    expect(sniffImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xdb]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('GIF89a', 'latin1'))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'latin1'))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('<svg></svg>'))).toBeUndefined();
  });

  it('imagem sem tipo declarado é reconhecida; HEIC/BMP viram aviso', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16]);
    const r = attachmentsToParts(
      [
        { name: 'IMG_0001', mediaType: '', data: b64(jpeg) },
        { name: 'foto.heic', mediaType: 'image/heic', data: b64(Buffer.from('....ftypheic')) },
      ],
      caps,
    );
    expect(r.parts[0]).toMatchObject({ type: 'image', mediaType: 'image/jpeg' });
    expect((r.parts[1] as { text: string }).text).toContain('não é uma imagem PNG, JPEG, WebP ou GIF');
  });

  it('".pdf" que não é PDF vira aviso (não vai para a API)', () => {
    expect(looksLikePdf(Buffer.from('%PDF-1.7'))).toBe(true);
    const r = attachmentsToParts([{ name: 'nota.pdf', mediaType: 'application/pdf', data: b64(Buffer.from('<html>erro 404</html>')) }], caps);
    expect(r.parts[0]).toMatchObject({ type: 'text' });
    expect((r.parts[0] as { text: string }).text).toContain('não parece ser um PDF');
    expect(r.tainted).toBe(false);
  });
});

describe('nome do anexo', () => {
  it('caminho completo do Windows vira só o nome do arquivo', () => {
    const r = attachmentsToParts([{ name: 'C:\\Users\\Fulano\\Documentos\\notas.txt', mediaType: 'text/plain', data: b64(Buffer.from('oi')) }], caps);
    const text = (r.parts[0] as { text: string }).text;
    expect(text).toContain('"notas.txt"');
    expect(text).not.toContain('Fulano');
  });
});
