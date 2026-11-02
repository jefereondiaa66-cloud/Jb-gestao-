/**
 * OCR local com tesseract.js (português + inglês). Os dados de idioma ficam
 * guardados em <dados>/tessdata; na primeira vez são baixados do CDN padrão
 * do tesseract.js, ou lidos de uma pasta local (langPath) se o app trouxer.
 * O trabalhador é reaproveitado e encerrado depois de um tempo sem uso.
 */
import { existsSync, mkdirSync } from 'node:fs';
import nodePath from 'node:path';

export type OcrLang = 'por' | 'eng' | 'spa';

export interface OcrResult {
  text: string;
  confidence: number;
}

interface TessWorker {
  recognize(image: Buffer): Promise<{ data: { text: string; confidence: number } }>;
  terminate(): Promise<unknown>;
}

type CreateWorker = (langs: string[], oem: number, options: Record<string, unknown>) => Promise<TessWorker>;

export interface OcrEngineOptions {
  /** Pasta de cache dos dados de idioma (ex.: <dados>/tessdata). */
  cachePath: string;
  /** Pasta local com <lang>.traineddata.gz (opcional; sem ela baixa do CDN na 1ª vez). */
  langPath?: string;
  /** Encerrar o trabalhador depois deste tempo sem uso (padrão 3 min). */
  idleMs?: number;
  /** Tempo máximo para preparar o OCR (padrão 3 min: inclui o download inicial). */
  initTimeoutMs?: number;
  /** Fábrica alternativa (só testes). */
  createWorker?: CreateWorker;
}

/** Pasta de dados de idioma embutida no app (resources/tessdata), se existir. */
export function bundledLangPath(): string | undefined {
  const res = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!res) return undefined;
  const dir = nodePath.join(res, 'tessdata');
  return existsSync(nodePath.join(dir, 'por.traineddata.gz')) ? dir : undefined;
}

export class OcrEngine {
  private worker: TessWorker | undefined;
  private workerLangs = '';
  private starting: Promise<TessWorker> | undefined;
  private idleTimer: NodeJS.Timeout | undefined;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly opts: OcrEngineOptions) {}

  private async factory(): Promise<CreateWorker> {
    if (this.opts.createWorker) return this.opts.createWorker;
    const ns = (await import('tesseract.js')) as unknown as { createWorker?: CreateWorker; default?: { createWorker: CreateWorker } };
    const fn = ns.createWorker ?? ns.default?.createWorker;
    if (!fn) throw new Error('tesseract.js indisponível');
    return fn;
  }

  private async getWorker(langs: OcrLang[]): Promise<TessWorker> {
    const key = langs.join('+');
    if (this.worker && this.workerLangs === key) return this.worker;
    if (this.worker) await this.terminate();
    if (!this.starting) {
      this.starting = (async () => {
        mkdirSync(this.opts.cachePath, { recursive: true });
        const create = await this.factory();
        const langPath = this.opts.langPath ?? bundledLangPath();
        const options: Record<string, unknown> = {
          cachePath: this.opts.cachePath,
          gzip: true,
          logger: () => undefined,
          errorHandler: () => undefined,
          ...(langPath ? { langPath } : {}),
        };
        const timeout = this.opts.initTimeoutMs ?? 180_000;
        let timer: NodeJS.Timeout | undefined;
        try {
          return await Promise.race([
            create(langs, 1, options),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('o OCR demorou demais para iniciar (baixando os dados de idioma?).')), timeout);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      })();
    }
    try {
      this.worker = await this.starting;
      this.workerLangs = key;
      return this.worker;
    } finally {
      this.starting = undefined;
    }
  }

  private touch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.terminate(), this.opts.idleMs ?? 180_000);
    this.idleTimer.unref?.();
  }

  /** Reconhece o texto de uma imagem (PNG, JPEG, BMP, WebP). Pedidos rodam em fila. */
  recognize(image: Buffer, langs: OcrLang[] = ['por', 'eng'], signal?: AbortSignal): Promise<OcrResult> {
    const run = async (): Promise<OcrResult> => {
      if (signal?.aborted) throw new Error('cancelado');
      const worker = await this.getWorker(langs);
      this.touch();
      const job = worker.recognize(image).then((r) => ({ text: String(r.data.text ?? '').trim(), confidence: Math.round(Number(r.data.confidence) || 0) }));
      if (!signal) return job;
      return Promise.race([
        job,
        new Promise<never>((_, reject) => {
          const onAbort = (): void => {
            void this.terminate(); // não dá para interromper o reconhecimento: encerra o trabalhador
            reject(new Error('cancelado'));
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  async terminate(): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    const w = this.worker;
    this.worker = undefined;
    this.workerLangs = '';
    if (w) {
      try {
        await w.terminate();
      } catch {
        /* ignora */
      }
    }
  }

  /** Encerrar ao fechar o app. */
  async dispose(): Promise<void> {
    await this.terminate();
  }
}
