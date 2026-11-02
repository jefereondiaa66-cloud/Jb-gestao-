/**
 * Modelos de voz locais: catálogo com SHA-256 fixado e gerenciador de
 * download/instalação.
 *
 * Segurança do download:
 * - Só URLs fixas do GitHub (releases oficiais do sherpa-onnx).
 * - O arquivo vai para uma pasta temporária e só é aceito se o tamanho e o
 *   SHA-256 baterem com o catálogo.
 * - Na extração do .tar.bz2, nenhuma entrada pode sair da pasta de destino
 *   (caminhos absolutos, "..", barras invertidas, unidades do Windows,
 *   links simbólicos e dispositivos são recusados).
 * - A pasta final só aparece depois de tudo pronto (renomeação atômica), e
 *   uma marca de instalação registra o SHA-256 usado. Repetir não baixa de novo.
 */
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { Transform, type Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extract as tarExtract } from 'tar-stream';
import type { Logger } from '../types';
import { VoiceError, abortError, isAbortError } from './errors';

export type ModelKind = 'vad' | 'stt' | 'tts';

export interface PiperVoiceInfo {
  /** Arquivo .onnx dentro da pasta do modelo. */
  file: string;
  sampleRate: number;
  /** Nome curto mostrado ao dono. */
  name: string;
  quality: 'baixa' | 'média' | 'alta';
}

export interface ModelSpec {
  id: string;
  label: string;
  kind: ModelKind;
  url: string;
  sha256: string;
  sizeBytes: number;
  archive: 'file' | 'tar.bz2';
  /** Nome do arquivo (archive=file) ou da pasta final dentro de dir. */
  target: string;
  /** Pasta de topo dentro do .tar.bz2 (só entradas dentro dela são extraídas). */
  archiveRoot?: string;
  /** Arquivos que precisam existir depois da instalação (relativos a target). */
  files: string[];
  /** Prefixos (relativos a archiveRoot) que não precisam ser extraídos. */
  skip?: string[];
  license: string;
  voice?: PiperVoiceInfo;
}

const GH = 'https://github.com/k2-fsa/sherpa-onnx/releases/download';

/**
 * Catálogo. SHA-256 calculados em 02/11/2026 a partir de downloads destes
 * mesmos endereços (tamanhos conferidos com o Content-Length do GitHub).
 */
export const MODEL_REGISTRY: readonly ModelSpec[] = [
  {
    id: 'silero-vad',
    label: 'Detector de fala (Silero VAD)',
    kind: 'vad',
    url: `${GH}/asr-models/silero_vad.onnx`,
    sha256: '9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6',
    sizeBytes: 643_854,
    archive: 'file',
    target: 'silero_vad.onnx',
    files: [],
    license: 'MIT',
  },
  {
    id: 'nemo-pt',
    label: 'Reconhecimento de fala em português (NeMo pt)',
    kind: 'stt',
    url: `${GH}/asr-models/sherpa-onnx-nemo-stt_pt_fastconformer_hybrid_large_pc-int8.tar.bz2`,
    sha256: 'bf340af23de6e49550ee8eb83d6fc205d288aca18083a9bcec53e31b4a4f101b',
    sizeBytes: 103_316_407,
    archive: 'tar.bz2',
    target: 'sherpa-onnx-nemo-stt_pt_fastconformer_hybrid_large_pc-int8',
    archiveRoot: 'sherpa-onnx-nemo-stt_pt_fastconformer_hybrid_large_pc-int8',
    files: ['model.int8.onnx', 'tokens.txt'],
    skip: ['test_wavs/'],
    license: 'CC-BY-4.0 (família NeMo; não verificada para o modelo pt)',
  },
  piperVoice('faber', 'medium', '7add3f923ad6bc25ca8a192805fd1a64d1b3893e4611c4a9719545a825039a83', 67_183_065, 22050, 'Dados CC0'),
  piperVoice('cadu', 'medium', 'aba78157d4b89acc17ddef15a70f4b2474f4c189d4de6035002ac7fec9d5d303', 67_207_562, 22050, 'Dados CC0'),
  piperVoice('jeff', 'medium', 'da4c870fc7b20600c74261b3e1dd1c816da2ce063e18c46e1f2cd86dea88f3f0', 67_207_052, 22050, 'Dados CC0'),
  piperVoice('edresson', 'low', '670569e755cc48cda0a2f6a3ccba0698815566297069961edcd5f7daaf3d47a5', 67_081_775, 16000, 'Dados CC BY 4.0'),
  piperVoice('miro', 'high', '7f30d1c3421362a60381807543aeafd7e1cd0acbcb92c349a29908526c6f4e6f', 67_207_707, 22050, 'CC BY-NC-SA 4.0 (só uso pessoal, não comercial)'),
  piperVoice('dii', 'high', '76bdf009bb29e69b12336de833d0d219ffa558f4281330eb141e4a0569c108a2', 67_238_016, 22050, 'CC BY-NC-SA 4.0 (só uso pessoal, não comercial)'),
];

function piperVoice(name: string, quality: 'low' | 'medium' | 'high', sha256: string, sizeBytes: number, sampleRate: number, license: string): ModelSpec {
  const base = `pt_BR-${name}-${quality}`;
  const q = quality === 'low' ? 'baixa' : quality === 'medium' ? 'média' : 'alta';
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  return {
    id: base,
    label: `Voz ${display} (pt-BR, qualidade ${q})`,
    kind: 'tts',
    url: `${GH}/tts-models/vits-piper-${base}.tar.bz2`,
    sha256,
    sizeBytes,
    archive: 'tar.bz2',
    target: `vits-piper-${base}`,
    archiveRoot: `vits-piper-${base}`,
    files: [`${base}.onnx`, 'tokens.txt'],
    // O sherpa-onnx 2.x não usa o espeak-ng-data do pacote (o fonetizador traz o próprio).
    skip: ['espeak-ng-data/'],
    license,
    voice: { file: `${base}.onnx`, sampleRate, name: display, quality: q },
  };
}

export const DEFAULT_PIPER_VOICE = 'pt_BR-faber-medium';
/** Modelos baixados por padrão: VAD + reconhecimento + voz padrão (~171 MB). */
export const DEFAULT_MODEL_IDS: readonly string[] = ['silero-vad', 'nemo-pt', DEFAULT_PIPER_VOICE];

export function getModelSpec(id: string, registry: readonly ModelSpec[] = MODEL_REGISTRY): ModelSpec | undefined {
  return registry.find((m) => m.id === id);
}

export interface ModelStatus {
  id: string;
  label: string;
  kind: ModelKind;
  installed: boolean;
  sizeBytes: number;
  sizeMb: number;
  isDefault: boolean;
  license: string;
}

export type ModelProgress = (id: string, fraction: number) => void;

export interface ModelManagerOptions {
  /** Pasta onde os modelos ficam (ex.: <dados>/modelos). */
  dir: string;
  fetch?: typeof fetch;
  registry?: readonly ModelSpec[];
  logger?: Logger;
  /** Tentativas por download (padrão 3). */
  attempts?: number;
}

interface InstalledMark {
  id: string;
  sha256: string;
  installedAt: string;
}

const MAX_EXTRACTED_BYTES = 2 * 1024 * 1024 * 1024;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;

/**
 * Valida o nome de uma entrada do tar e devolve os segmentos do caminho.
 * Lança VoiceError('arquivo_inseguro') se o caminho puder sair da pasta.
 * Devolve [] para a raiz ("./").
 */
export function safeEntrySegments(name: string): string[] {
  const unsafe = () => new VoiceError('arquivo_inseguro', `O pacote do modelo tem um caminho perigoso ("${name.slice(0, 80)}"). A instalação foi cancelada.`);
  if (typeof name !== 'string' || name.includes('\0') || name.includes('\\')) throw unsafe();
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw unsafe();
  const segments = name.split('/').filter((s) => s !== '' && s !== '.');
  for (const s of segments) {
    if (s === '..' || s.includes(':') || WINDOWS_RESERVED.test(s) || /[<>"|?*\x00-\x1f]/.test(s)) throw unsafe();
  }
  return segments;
}

/** Junta os segmentos à raiz e confere que o resultado continua dentro dela. */
export function resolveInside(root: string, segments: readonly string[]): string {
  const base = resolve(root);
  const full = resolve(base, ...segments);
  if (full !== base && !full.startsWith(base + sep)) {
    throw new VoiceError('arquivo_inseguro', 'O pacote do modelo tentou gravar fora da pasta de destino. A instalação foi cancelada.');
  }
  return full;
}

interface Bz2Factory {
  (): Transform;
}

let bz2Promise: Promise<Bz2Factory> | null = null;
function loadBz2(): Promise<Bz2Factory> {
  if (!bz2Promise) {
    const spec: string = 'unbzip2-stream';
    bz2Promise = import(/* @vite-ignore */ spec).then((m: { default?: Bz2Factory } & Bz2Factory) => m.default ?? m);
  }
  return bz2Promise;
}

export class ModelManager {
  readonly dir: string;
  private readonly registry: readonly ModelSpec[];
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: Logger;
  private readonly attempts: number;
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(opts: ModelManagerOptions) {
    if (!opts.dir || !isAbsolute(resolve(opts.dir))) throw new VoiceError('modelo_ausente', 'Pasta de modelos inválida.');
    this.dir = resolve(opts.dir);
    this.registry = opts.registry ?? MODEL_REGISTRY;
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.logger = opts.logger;
    this.attempts = Math.max(1, opts.attempts ?? 3);
  }

  specs(): readonly ModelSpec[] {
    return this.registry;
  }

  spec(id: string): ModelSpec {
    const s = getModelSpec(id, this.registry);
    if (!s) throw new VoiceError('modelo_ausente', `Modelo de voz desconhecido: ${id}.`);
    return s;
  }

  /** Caminho final do modelo (arquivo ou pasta). */
  pathOf(id: string): string {
    return join(this.dir, this.spec(id).target);
  }

  /** Caminho de um arquivo dentro da pasta do modelo. */
  filePath(id: string, file: string): string {
    return resolveInside(this.pathOf(id), safeEntrySegments(file));
  }

  private markPath(id: string): string {
    return join(this.dir, '.instalados', `${id}.json`);
  }

  isInstalled(id: string): boolean {
    const spec = getModelSpec(id, this.registry);
    if (!spec) return false;
    try {
      const mark = JSON.parse(readFileSync(this.markPath(id), 'utf8')) as InstalledMark;
      if (mark.sha256 !== spec.sha256) return false;
      const target = join(this.dir, spec.target);
      if (!existsSync(target)) return false;
      return spec.files.every((f) => existsSync(join(target, f)));
    } catch {
      return false;
    }
  }

  async status(): Promise<ModelStatus[]> {
    return this.registry.map((s) => ({
      id: s.id,
      label: s.label,
      kind: s.kind,
      installed: this.isInstalled(s.id),
      sizeBytes: s.sizeBytes,
      sizeMb: Math.round((s.sizeBytes / 1048576) * 10) / 10,
      isDefault: DEFAULT_MODEL_IDS.includes(s.id),
      license: s.license,
    }));
  }

  /** Instala os modelos que faltam (os já instalados são pulados). */
  async ensure(ids: readonly string[], onProgress?: ModelProgress, signal?: AbortSignal): Promise<void> {
    const unique = [...new Set(ids)];
    for (const id of unique) this.spec(id); // falha cedo se algum id não existir
    for (const id of unique) {
      if (signal?.aborted) throw abortError();
      if (this.isInstalled(id)) {
        onProgress?.(id, 1);
        continue;
      }
      let job = this.inflight.get(id);
      if (!job) {
        job = this.install(this.spec(id), onProgress, signal).finally(() => this.inflight.delete(id));
        this.inflight.set(id, job);
      }
      await job;
    }
  }

  async remove(id: string): Promise<void> {
    const spec = this.spec(id);
    await rm(this.markPath(id), { force: true });
    await rm(join(this.dir, spec.target), { recursive: true, force: true });
  }

  private async install(spec: ModelSpec, onProgress: ModelProgress | undefined, signal: AbortSignal | undefined): Promise<void> {
    const tmpDir = join(this.dir, '.tmp');
    await mkdir(tmpDir, { recursive: true });
    const token = randomBytes(6).toString('hex');
    const tmpFile = join(tmpDir, `${spec.id}-${token}.part`);
    const report = (f: number) => {
      try {
        onProgress?.(spec.id, Math.max(0, Math.min(1, f)));
      } catch {
        /* quem escuta o progresso não pode derrubar a instalação */
      }
    };
    const downloadShare = spec.archive === 'file' ? 0.98 : 0.8;
    try {
      this.logger?.info(`baixando modelo de voz ${spec.id}`);
      await this.downloadVerified(spec, tmpFile, (f) => report(f * downloadShare), signal);
      const finalPath = join(this.dir, spec.target);
      if (spec.archive === 'file') {
        await this.swapInto(tmpFile, finalPath);
      } else {
        const staging = join(tmpDir, `${spec.id}-${token}`);
        await mkdir(staging, { recursive: true });
        try {
          await this.extractTarBz2(spec, tmpFile, staging, (f) => report(downloadShare + f * (1 - downloadShare - 0.01)), signal);
          const root = spec.archiveRoot ? resolveInside(staging, safeEntrySegments(spec.archiveRoot)) : staging;
          for (const f of spec.files) {
            if (!existsSync(join(root, f))) {
              throw new VoiceError('arquivo_corrompido', `O pacote de ${spec.label} não tem o arquivo ${f}.`);
            }
          }
          await this.swapInto(root, finalPath);
        } finally {
          await rm(staging, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      await this.writeMark(spec);
      report(1);
      this.logger?.info(`modelo de voz ${spec.id} instalado`);
    } catch (e) {
      if (isAbortError(e) || signal?.aborted) throw abortError();
      throw e;
    } finally {
      await rm(tmpFile, { force: true }).catch(() => undefined);
    }
  }

  /** Troca o destino de forma atômica (o antigo só é apagado depois). */
  private async swapInto(source: string, finalPath: string): Promise<void> {
    await mkdir(dirname(finalPath), { recursive: true });
    let old: string | null = null;
    if (existsSync(finalPath)) {
      old = `${finalPath}.antigo-${randomBytes(4).toString('hex')}`;
      await rename(finalPath, old);
    }
    try {
      await rename(source, finalPath);
    } catch (e) {
      if (old) await rename(old, finalPath).catch(() => undefined);
      throw new VoiceError('download_falhou', 'Não foi possível guardar o modelo na pasta de destino.', { cause: e });
    }
    if (old) await rm(old, { recursive: true, force: true }).catch(() => undefined);
  }

  private async writeMark(spec: ModelSpec): Promise<void> {
    const mark: InstalledMark = { id: spec.id, sha256: spec.sha256, installedAt: new Date().toISOString() };
    const p = this.markPath(spec.id);
    await mkdir(dirname(p), { recursive: true });
    const tmp = `${p}.${randomBytes(4).toString('hex')}.tmp`;
    await writeFile(tmp, JSON.stringify(mark, null, 2), 'utf8');
    await rename(tmp, p);
  }

  private async downloadVerified(spec: ModelSpec, dest: string, onFraction: (f: number) => void, signal?: AbortSignal): Promise<void> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      if (signal?.aborted) throw abortError();
      try {
        await this.downloadOnce(spec, dest, onFraction, signal);
        return;
      } catch (e) {
        if (isAbortError(e) || signal?.aborted) throw abortError();
        lastError = e;
        const retryable = !(e instanceof VoiceError) || e.code === 'download_falhou' || e.code === 'arquivo_corrompido';
        this.logger?.warn(`download do modelo ${spec.id} falhou (tentativa ${attempt})`, e instanceof Error ? e.message : String(e));
        if (!retryable || attempt === this.attempts) break;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
    if (lastError instanceof VoiceError) throw lastError;
    throw new VoiceError('download_falhou', `Não foi possível baixar ${spec.label}. Confira a internet e tente de novo.`, { cause: lastError });
  }

  private async downloadOnce(spec: ModelSpec, dest: string, onFraction: (f: number) => void, signal?: AbortSignal): Promise<void> {
    const res = await this.fetchImpl(spec.url, { redirect: 'follow', signal, headers: { 'user-agent': 'assistente-300' } });
    if (!res.ok || !res.body) {
      throw new VoiceError('download_falhou', `Não foi possível baixar ${spec.label} (resposta ${res.status}).`);
    }
    const hash = createHash('sha256');
    const fh = await open(dest, 'w');
    let received = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || value.length === 0) continue;
        received += value.length;
        if (received > spec.sizeBytes) {
          await reader.cancel().catch(() => undefined);
          throw new VoiceError('arquivo_corrompido', `O arquivo de ${spec.label} veio maior que o esperado. Ele foi descartado.`);
        }
        hash.update(value);
        await fh.write(value);
        onFraction(received / spec.sizeBytes);
      }
    } finally {
      await fh.close();
    }
    if (received !== spec.sizeBytes) {
      throw new VoiceError('arquivo_corrompido', `O download de ${spec.label} veio incompleto (${received} de ${spec.sizeBytes} bytes).`);
    }
    const digest = hash.digest('hex');
    if (digest !== spec.sha256) {
      throw new VoiceError('arquivo_corrompido', `O arquivo de ${spec.label} não confere com a assinatura esperada (SHA-256). Ele foi descartado por segurança.`);
    }
  }

  private async extractTarBz2(spec: ModelSpec, file: string, staging: string, onFraction: (f: number) => void, signal?: AbortSignal): Promise<void> {
    const bz2 = await loadBz2();
    const total = (await stat(file)).size || 1;
    let read = 0;
    let extracted = 0;
    const rootSegs = spec.archiveRoot ? safeEntrySegments(spec.archiveRoot) : [];
    const skips = (spec.skip ?? []).map((s) => safeEntrySegments(s));

    const counter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        read += chunk.length;
        onFraction(read / total);
        cb(null, chunk);
      },
    });
    const extract = tarExtract();
    extract.on('entry', (header, stream, next) => {
      const done = (err?: unknown) => {
        if (err) next(err instanceof Error ? err : new Error(String(err)));
        else next();
      };
      void (async () => {
        if (signal?.aborted) throw abortError();
        const segs = safeEntrySegments(header.name);
        const type = header.type ?? 'file';
        if (type === 'symlink' || type === 'link' || type === 'character-device' || type === 'block-device' || type === 'fifo') {
          throw new VoiceError('arquivo_inseguro', `O pacote de ${spec.label} contém um atalho ou dispositivo ("${header.name.slice(0, 80)}"), o que não é permitido.`);
        }
        const target = resolveInside(staging, segs); // valida mesmo o que será ignorado
        const inRoot = rootSegs.every((s, i) => segs[i] === s);
        const rel = segs.slice(rootSegs.length);
        const skipped = !inRoot || skips.some((sk) => sk.every((s, i) => rel[i] === s));
        if (skipped || (type !== 'file' && type !== 'contiguous-file' && type !== 'directory')) {
          stream.resume();
          await new Promise<void>((r, j) => {
            stream.on('end', () => r());
            stream.on('error', j);
          });
          return;
        }
        if (type === 'directory') {
          await mkdir(target, { recursive: true });
          stream.resume();
          await new Promise<void>((r, j) => {
            stream.on('end', () => r());
            stream.on('error', j);
          });
          return;
        }
        extracted += header.size ?? 0;
        if (extracted > MAX_EXTRACTED_BYTES) throw new VoiceError('arquivo_inseguro', `O pacote de ${spec.label} é grande demais.`);
        await mkdir(dirname(target), { recursive: true });
        await pipeline(stream, createWriteStream(target, { mode: 0o644 }));
      })().then(
        () => done(),
        (e: unknown) => {
          stream.resume();
          done(e);
        },
      );
    });

    const input = createReadStream(file);
    const decompress = bz2();
    const onAbort = () => {
      const err = abortError();
      input.destroy(err);
      extract.destroy(err);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      await new Promise<void>((resolvePromise, reject) => {
        let settled = false;
        const fail = (e: unknown) => {
          if (settled) return;
          settled = true;
          input.destroy();
          reject(e instanceof VoiceError ? e : new VoiceError('arquivo_corrompido', `Não foi possível abrir o pacote de ${spec.label}.`, { cause: e }));
        };
        input.on('error', fail);
        counter.on('error', fail);
        (decompress as unknown as Readable).on('error', fail);
        extract.on('error', fail);
        extract.on('finish', () => {
          if (settled) return;
          settled = true;
          resolvePromise();
        });
        input.pipe(counter).pipe(decompress as unknown as Writable & Readable).pipe(extract);
      });
    } finally {
      signal?.removeEventListener('abort', onAbort);
    }
    if (signal?.aborted) throw abortError();
  }
}

/** Lista o conteúdo de uma pasta de modelo (diagnóstico). */
export async function listModelFiles(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}
