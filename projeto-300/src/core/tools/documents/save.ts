/**
 * Onde e com que nome os documentos são salvos: <Documentos>/300/, com nome
 * seguro para o Windows e sem nunca substituir um arquivo existente
 * ("Relatório.docx", "Relatório (2).docx", ...).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import type { EngineServices } from '../../types';
import { allowedRoots, guardFor, resolveUserPath } from '../files/guard';
import { ownFiles } from '../files/own-files';

/** Nome de arquivo seguro (sem extensão) a partir de um título. */
export function safeBaseName(title: string, fallback = 'documento'): string {
  let s = String(title ?? '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  s = [...s].slice(0, 80).join('');
  s = s.replace(/[\s.]+$/, '').replace(/^[\s.]+/, '');
  if (!s) s = fallback;
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(s)) s = `_${s}`;
  return s;
}

/** Tira uma extensão repetida do nome pedido ("relatorio.docx" + .docx). */
export function stripExtension(name: string, ext: string): string {
  return name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, -ext.length) : name;
}

/** Pasta de saída dos documentos (<Documentos>/300, ou a primeira pasta liberada). */
export async function outputDir(services: EngineServices): Promise<string> {
  const pm = services.platform.os === 'windows' ? nodePath.win32 : nodePath.posix;
  let base: string;
  try {
    base = resolveUserPath(services, services.platform.paths.documents);
  } catch {
    base = resolveUserPath(services, allowedRoots(services)[0] ?? services.platform.paths.documents);
  }
  const dir = pm.join(base, '300');
  await mkdir(dir, { recursive: true });
  return guardFor(services).resolve(dir, { mustExist: true });
}

/** Grava sem substituir: tenta "nome.ext", "nome (2).ext"... (flag wx evita corrida). */
export async function writeUnique(dir: string, base: string, ext: string, data: Uint8Array | Buffer, pm: typeof nodePath.posix = nodePath): Promise<string> {
  for (let n = 1; n <= 500; n++) {
    const name = n === 1 ? `${base}${ext}` : `${base} (${n})${ext}`;
    const full = pm.join(dir, name);
    try {
      await writeFile(full, data, { flag: 'wx' });
      return full;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw err;
    }
  }
  throw new Error('já existem arquivos demais com esse nome; escolha outro nome.');
}

/** Salva um documento gerado pelo 300 e o registra como arquivo próprio. */
export async function saveDocument(services: EngineServices, name: string, ext: string, data: Uint8Array | Buffer): Promise<string> {
  const pm = services.platform.os === 'windows' ? nodePath.win32 : nodePath.posix;
  const dir = await outputDir(services);
  const base = safeBaseName(stripExtension(name, ext));
  const full = await writeUnique(dir, base, ext, data, pm);
  guardFor(services).resolve(full, { mustExist: true });
  ownFiles(services).record(full);
  return full;
}
