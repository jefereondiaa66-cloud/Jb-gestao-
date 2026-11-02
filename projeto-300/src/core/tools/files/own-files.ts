/**
 * Registro dos arquivos que o próprio 300 criou (documentos, arquivos
 * escritos por file_write). Ao ler, um arquivo só é considerado "confiável"
 * se está neste registro E não mudou desde então (mesmo tamanho e data de
 * modificação). Qualquer outro arquivo é tratado como conteúdo externo.
 *
 * O registro fica na pasta de dados do app (fora do alcance das ferramentas).
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import type { EngineServices } from '../../types';

interface Entry {
  size: number;
  mtimeMs: number;
  at: string;
}

const MAX_ENTRIES = 3000;
const FILE_NAME = 'arquivos-do-300.json';

export class OwnFilesLedger {
  private entries = new Map<string, Entry>();
  private loaded = false;

  constructor(
    private readonly dataDir: string,
    private readonly caseInsensitive: boolean,
  ) {}

  private key(p: string): string {
    const n = nodePath.normalize(p);
    return this.caseInsensitive ? n.toLowerCase() : n;
  }

  private file(): string {
    return nodePath.join(this.dataDir, FILE_NAME);
  }

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.dataDir) return;
    try {
      const raw = JSON.parse(readFileSync(this.file(), 'utf8')) as { version?: number; files?: Record<string, Entry> };
      if (raw && typeof raw.files === 'object' && raw.files) {
        for (const [k, v] of Object.entries(raw.files)) {
          if (v && typeof v.size === 'number' && typeof v.mtimeMs === 'number') this.entries.set(k, v);
        }
      }
    } catch {
      /* sem registro ainda (ou corrompido): começa vazio */
    }
  }

  private save(): void {
    if (!this.dataDir) return;
    try {
      mkdirSync(this.dataDir, { recursive: true });
      const files: Record<string, Entry> = {};
      for (const [k, v] of this.entries) files[k] = v;
      const tmp = this.file() + '.tmp';
      writeFileSync(tmp, JSON.stringify({ version: 1, files }), 'utf8');
      renameSync(tmp, this.file());
    } catch {
      /* falha ao gravar o registro não impede a operação principal */
    }
  }

  /** Marca um arquivo como criado pelo 300 (chamar logo depois de gravar). */
  record(p: string): void {
    this.load();
    try {
      const st = statSync(p);
      if (!st.isFile()) return;
      const k = this.key(p);
      this.entries.delete(k);
      this.entries.set(k, { size: st.size, mtimeMs: Math.floor(st.mtimeMs), at: new Date().toISOString() });
      while (this.entries.size > MAX_ENTRIES) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.entries.delete(oldest);
      }
      this.save();
    } catch {
      /* arquivo sumiu: nada a registrar */
    }
  }

  /** Arquivo movido/renomeado pelo 300: o registro acompanha. */
  moved(from: string, to: string): void {
    this.load();
    const e = this.entries.get(this.key(from));
    if (!e) return;
    this.entries.delete(this.key(from));
    this.record(to);
  }

  forget(p: string): void {
    this.load();
    if (this.entries.delete(this.key(p))) this.save();
  }

  /** O arquivo foi criado pelo 300 e não foi modificado desde então? */
  isOwn(p: string): boolean {
    this.load();
    const e = this.entries.get(this.key(p));
    if (!e) return false;
    try {
      const st = statSync(p);
      return st.isFile() && st.size === e.size && Math.abs(Math.floor(st.mtimeMs) - e.mtimeMs) <= 1;
    } catch {
      return false;
    }
  }
}

const ledgers = new Map<string, OwnFilesLedger>();

/** Registro de arquivos próprios para a pasta de dados destes serviços. */
export function ownFiles(services: EngineServices): OwnFilesLedger {
  const dir = services.platform.paths.data ?? '';
  const ci = services.platform.os !== 'linux';
  const k = `${ci ? 'i' : 's'}:${dir}`;
  let l = ledgers.get(k);
  if (!l) {
    l = new OwnFilesLedger(dir, ci);
    ledgers.set(k, l);
  }
  return l;
}
