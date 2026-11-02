/**
 * Carregamento preguiçoso dos módulos nativos de voz (sherpa-onnx-node e
 * piper-phonemize-node) e instâncias compartilhadas dos modelos pesados.
 *
 * - Os módulos só são carregados quando a voz local é usada: se o binário
 *   nativo faltar, o resto do 300 continua funcionando.
 * - O modelo NeMo (≈130 MB na memória) é carregado UMA vez e dividido entre a
 *   palavra de ativação e a transcrição local; as decodificações são feitas
 *   uma por vez (fila), sem bloquear o processo (decodeAsync).
 * - No Electron, buffers externos derrubam o processo (V8 memory cage):
 *   sempre pedimos cópias (enableExternalBuffer: false).
 */
import { VoiceError } from './errors';

/* ---------------- tipos mínimos do sherpa-onnx-node 2.0.1 ---------------- */
export interface SherpaOfflineStream {
  acceptWaveform(w: { samples: Float32Array; sampleRate: number }): void;
}

export interface SherpaRecognizerResult {
  text: string;
  tokens?: string[];
  timestamps?: number[];
  lang?: string;
}

export interface SherpaOfflineRecognizer {
  createStream(): SherpaOfflineStream;
  decode(stream: SherpaOfflineStream): void;
  decodeAsync?(stream: SherpaOfflineStream): Promise<SherpaRecognizerResult>;
  getResult(stream: SherpaOfflineStream): SherpaRecognizerResult;
}

export interface SherpaGeneratedAudio {
  samples: Float32Array;
  sampleRate: number;
}

export interface SherpaTtsRequest {
  text: string;
  sid: number;
  speed: number;
  enableExternalBuffer?: boolean;
  generationConfig?: { phonemeCodepoints?: number[][]; speed?: number; sid?: number; silenceScale?: number };
  onProgress?: (info: { samples: Float32Array; progress: number }) => number | boolean | void;
}

export interface SherpaOfflineTts {
  readonly sampleRate: number;
  readonly numSpeakers: number;
  generateAsync(req: SherpaTtsRequest): Promise<SherpaGeneratedAudio>;
}

export interface SherpaVadConfig {
  sileroVad: {
    model: string;
    threshold: number;
    minSpeechDuration: number;
    minSilenceDuration: number;
    windowSize: number;
    maxSpeechDuration?: number;
  };
  sampleRate: number;
  debug: boolean;
  numThreads: number;
}

export interface SherpaVad {
  acceptWaveform(samples: Float32Array): void;
  isEmpty(): boolean;
  isDetected(): boolean;
  front(enableExternalBuffer?: boolean): { start: number; samples: Float32Array };
  pop(): void;
  clear(): void;
  reset(): void;
  flush(): void;
}

export interface SherpaModule {
  OfflineRecognizer: {
    new (config: unknown): SherpaOfflineRecognizer;
    createAsync?(config: unknown): Promise<SherpaOfflineRecognizer>;
  };
  OfflineTts: {
    new (config: unknown): SherpaOfflineTts;
    createAsync?(config: unknown): Promise<SherpaOfflineTts>;
  };
  Vad: new (config: SherpaVadConfig, bufferSizeInSeconds: number) => SherpaVad;
  version?: string;
}

export interface PiperPhonemizeModule {
  phonemize(text: string, voice?: string): number[][] | null;
  phonemizeToString?(text: string, voice?: string): string[] | null;
}

/* ---------------- carregadores ---------------- */
async function importCjs<T>(name: string): Promise<T> {
  // Especificador não literal: o empacotador não tenta embutir o módulo nativo;
  // ele é resolvido em tempo de execução a partir do node_modules.
  const spec: string = name;
  const mod = (await import(/* @vite-ignore */ spec)) as { default?: T } & T;
  return (mod.default ?? mod) as T;
}

let sherpaPromise: Promise<SherpaModule> | null = null;
let piperPromise: Promise<PiperPhonemizeModule> | null = null;

/** Carrega o sherpa-onnx-node (uma vez). Falha com mensagem pt-BR se o binário faltar. */
export function loadSherpa(): Promise<SherpaModule> {
  if (!sherpaPromise) {
    sherpaPromise = importCjs<SherpaModule>('sherpa-onnx-node').catch((e: unknown) => {
      sherpaPromise = null;
      throw new VoiceError('motor_falhou', 'Não foi possível carregar o motor de voz local (sherpa-onnx). Reinstale o 300.', { cause: e });
    });
  }
  return sherpaPromise;
}

/** Carrega o fonetizador das vozes Piper (espeak-ng). */
export function loadPiperPhonemize(): Promise<PiperPhonemizeModule> {
  if (!piperPromise) {
    piperPromise = importCjs<PiperPhonemizeModule>('piper-phonemize-node').catch((e: unknown) => {
      piperPromise = null;
      throw new VoiceError('motor_falhou', 'Não foi possível carregar o fonetizador das vozes locais (piper-phonemize). Reinstale o 300.', { cause: e });
    });
  }
  return piperPromise;
}

/** Fila simples: executa tarefas uma de cada vez, na ordem. */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

/* ---------------- NeMo pt compartilhado ---------------- */
export interface NemoDecodeResult {
  text: string;
  tokens: string[];
  timestamps: number[];
}

export interface SharedRecognizer {
  readonly key: string;
  /** Decodifica áudio 16 kHz mono. */
  decode(samples: Float32Array, sampleRate?: number): Promise<NemoDecodeResult>;
  release(): void;
}

interface RecognizerEntry {
  promise: Promise<SherpaOfflineRecognizer>;
  queue: SerialQueue;
  refs: number;
}

const recognizers = new Map<string, RecognizerEntry>();

export interface NemoPaths {
  model: string;
  tokens: string;
  numThreads?: number;
}

async function createRecognizer(p: NemoPaths): Promise<SherpaOfflineRecognizer> {
  const sherpa = await loadSherpa();
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { nemoCtc: { model: p.model }, tokens: p.tokens, numThreads: p.numThreads ?? 2, provider: 'cpu', debug: 0 },
  };
  try {
    return sherpa.OfflineRecognizer.createAsync ? await sherpa.OfflineRecognizer.createAsync(config) : new sherpa.OfflineRecognizer(config);
  } catch (e) {
    throw new VoiceError('motor_falhou', 'Não foi possível abrir o modelo de reconhecimento de fala. Tente baixar os modelos de novo.', { cause: e });
  }
}

/**
 * Obtém o reconhecedor NeMo compartilhado para estes arquivos. Cada chamada
 * deve ter um release() correspondente; o modelo fica na memória enquanto
 * houver alguém usando.
 */
export function acquireNemo(p: NemoPaths): SharedRecognizer {
  const key = `${p.model}|${p.tokens}|${p.numThreads ?? 2}`;
  let entry = recognizers.get(key);
  if (!entry) {
    const created: RecognizerEntry = { promise: createRecognizer(p), queue: new SerialQueue(), refs: 0 };
    created.promise.catch(() => {
      if (recognizers.get(key) === created) recognizers.delete(key);
    });
    recognizers.set(key, created);
    entry = created;
  }
  entry.refs++;
  const e = entry;
  let released = false;
  return {
    key,
    decode: (samples, sampleRate = 16000) =>
      e.queue.run(async () => {
        const rec = await e.promise;
        const stream = rec.createStream();
        stream.acceptWaveform({ samples, sampleRate });
        let r: SherpaRecognizerResult;
        if (typeof rec.decodeAsync === 'function') {
          r = await rec.decodeAsync(stream);
        } else {
          // Versões sem decodeAsync: decodificação curta e síncrona.
          rec.decode(stream);
          r = rec.getResult(stream);
        }
        return { text: (r.text ?? '').trim(), tokens: r.tokens ?? [], timestamps: r.timestamps ?? [] };
      }),
    release: () => {
      if (released) return;
      released = true;
      e.refs--;
      // O addon libera a memória quando o objeto JS é coletado; basta esquecer a referência.
      if (e.refs <= 0 && recognizers.get(key) === e) recognizers.delete(key);
    },
  };
}

/** Pré-carrega o modelo (para a primeira frase não demorar). */
export async function warmUpNemo(p: NemoPaths): Promise<void> {
  const r = acquireNemo(p);
  try {
    await r.decode(new Float32Array(1600));
  } finally {
    r.release();
  }
}

/* ---------------- Piper compartilhado ---------------- */
interface TtsEntry {
  promise: Promise<SherpaOfflineTts>;
  queue: SerialQueue;
}

const ttsEngines = new Map<string, TtsEntry>();

export interface PiperPaths {
  model: string;
  tokens: string;
  numThreads?: number;
}

export function getPiperEngine(p: PiperPaths): { engine: Promise<SherpaOfflineTts>; queue: SerialQueue } {
  const key = `${p.model}|${p.tokens}|${p.numThreads ?? 2}`;
  let entry = ttsEngines.get(key);
  if (!entry) {
    const created: TtsEntry = {
      promise: (async () => {
        const sherpa = await loadSherpa();
        const config = { model: { vits: { model: p.model, tokens: p.tokens }, numThreads: p.numThreads ?? 2, provider: 'cpu', debug: false }, maxNumSentences: 1 };
        try {
          return sherpa.OfflineTts.createAsync ? await sherpa.OfflineTts.createAsync(config) : new sherpa.OfflineTts(config);
        } catch (e) {
          throw new VoiceError('motor_falhou', 'Não foi possível abrir a voz local. Tente baixar a voz de novo.', { cause: e });
        }
      })(),
      queue: new SerialQueue(),
    };
    created.promise.catch(() => {
      if (ttsEngines.get(key) === created) ttsEngines.delete(key);
    });
    ttsEngines.set(key, created);
    entry = created;
  }
  return { engine: entry.promise, queue: entry.queue };
}

/** Esquece as vozes carregadas (libera memória quando o coletor passar). */
export function releasePiperEngines(): void {
  ttsEngines.clear();
}
