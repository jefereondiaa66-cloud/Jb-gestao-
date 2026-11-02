/**
 * Detector de fala em fluxo contínuo (VAD).
 *
 * Recebe áudio 16 kHz em pedaços de qualquer tamanho e devolve bordas
 * (começou a falar / parou de falar) e o trecho completo de cada fala, com
 * um pouco de áudio antes do início (pré-rolagem) para não cortar a primeira
 * sílaba. Duas implementações:
 * - SileroVad: modelo Silero via sherpa-onnx (padrão, preciso).
 * - EnergyVad: limiar de energia com histerese e piso de ruído adaptativo
 *   (reserva quando o modelo Silero não está instalado).
 */
import type { Logger } from '../types';
import { FRAME_SIZE, FrameSplitter, SAMPLE_RATE, concatFloat32, rms, sanitize } from './audio';
import { VoiceError } from './errors';
import type { ModelManager } from './models';
import { loadSherpa, type SherpaVad } from './native';

export type VadEvent =
  | { type: 'speech_start'; atMs: number }
  | { type: 'speech_end'; atMs: number; segment: Float32Array; durationMs: number; truncated: boolean };

export interface VoiceActivityDetector {
  readonly kind: 'silero' | 'energy';
  /** Fala em andamento agora? */
  readonly speaking: boolean;
  accept(samples: Float32Array): VadEvent[];
  /** Cópia da fala em andamento (com pré-rolagem), ou null. */
  currentSpeech(): Float32Array | null;
  /** Duração da fala em andamento em ms (0 se não houver). */
  speechMs(): number;
  /** Encerra a fala em andamento (se houver) e devolve o evento de fim. */
  flush(): VadEvent[];
  reset(): void;
  dispose(): void;
}

export interface VadOptions {
  /** Limiar 0..1 (settings.voice.vadThreshold). */
  threshold: number;
  minSpeechMs?: number;
  minSilenceMs?: number;
  /** Fala mais longa que isso é cortada (padrão 30 s). */
  maxUtteranceSec?: number;
  /** Áudio guardado antes do início detectado (padrão 600 ms). */
  preRollMs?: number;
}

interface FrameVerdict {
  /** O detector considera que há fala neste quadro (já com histerese). */
  speaking: boolean;
  /** O detector fechou um trecho de fala neste quadro. */
  ended: boolean;
}

/** Lógica comum: quadros, tempo, pré-rolagem, buffer da fala e corte em 30 s. */
abstract class BaseVad implements VoiceActivityDetector {
  abstract readonly kind: 'silero' | 'energy';
  protected readonly minSpeechMs: number;
  protected readonly minSilenceMs: number;
  protected readonly maxSamples: number;
  private readonly preRollFrames: number;
  private readonly splitter = new FrameSplitter(FRAME_SIZE);
  private preRoll: Float32Array[] = [];
  private speech: Float32Array[] | null = null;
  private speechSamples = 0;
  private processed = 0;
  private startedAt = 0;
  private disposed = false;

  constructor(protected readonly opts: VadOptions) {
    this.minSpeechMs = opts.minSpeechMs ?? 250;
    this.minSilenceMs = opts.minSilenceMs ?? 500;
    this.maxSamples = Math.round((opts.maxUtteranceSec ?? 30) * SAMPLE_RATE);
    this.preRollFrames = Math.max(1, Math.ceil((((opts.preRollMs ?? 600) / 1000) * SAMPLE_RATE) / FRAME_SIZE));
  }

  protected abstract processFrame(frame: Float32Array): FrameVerdict;
  protected abstract resetDetector(): void;

  get speaking(): boolean {
    return this.speech !== null;
  }

  accept(samples: Float32Array): VadEvent[] {
    if (this.disposed || !(samples instanceof Float32Array) || samples.length === 0) return [];
    const events: VadEvent[] = [];
    for (const raw of this.splitter.push(sanitize(samples))) {
      const frame = raw;
      this.processed += frame.length;
      let verdict: FrameVerdict;
      try {
        verdict = this.processFrame(frame);
      } catch {
        // Quadro problemático: trata como silêncio em vez de derrubar a escuta.
        verdict = { speaking: false, ended: this.speech !== null };
      }
      if (this.speech) {
        this.speech.push(frame);
        this.speechSamples += frame.length;
        if (verdict.ended) {
          events.push(this.endSpeech(false));
        } else if (this.speechSamples >= this.maxSamples) {
          events.push(this.endSpeech(true));
          this.resetDetector();
        }
      } else if (verdict.speaking && !verdict.ended) {
        this.speech = [...this.preRoll, frame];
        this.speechSamples = this.speech.reduce((n, f) => n + f.length, 0);
        this.startedAt = this.nowMs();
        this.preRoll = [];
        events.push({ type: 'speech_start', atMs: this.startedAt });
      }
      if (!this.speech) {
        this.preRoll.push(frame);
        if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
      }
    }
    return events;
  }

  private nowMs(): number {
    return (this.processed * 1000) / SAMPLE_RATE;
  }

  private endSpeech(truncated: boolean): VadEvent {
    const parts = this.speech ?? [];
    let segment = concatFloat32(parts);
    if (!truncated) {
      // O fim só é confirmado depois do silêncio mínimo: tira o excesso de silêncio do final.
      const trim = Math.round(((Math.max(0, this.minSilenceMs - 200)) / 1000) * SAMPLE_RATE);
      if (trim > 0 && segment.length - trim > SAMPLE_RATE * 0.2) segment = segment.slice(0, segment.length - trim);
    }
    this.speech = null;
    this.speechSamples = 0;
    return { type: 'speech_end', atMs: this.nowMs(), segment, durationMs: (segment.length * 1000) / SAMPLE_RATE, truncated };
  }

  currentSpeech(): Float32Array | null {
    return this.speech ? concatFloat32(this.speech) : null;
  }

  speechMs(): number {
    return this.speech ? (this.speechSamples * 1000) / SAMPLE_RATE : 0;
  }

  flush(): VadEvent[] {
    // o divisor fica vazio depois do flush, então o quadro completado passa direto
    const tail = this.splitter.flush();
    const events = tail ? this.accept(tail) : [];
    if (this.speech) events.push(this.endSpeech(false));
    this.resetDetector();
    return events;
  }

  reset(): void {
    this.splitter.reset();
    this.preRoll = [];
    this.speech = null;
    this.speechSamples = 0;
    this.resetDetector();
  }

  dispose(): void {
    this.disposed = true;
    this.preRoll = [];
    this.speech = null;
  }
}

/** VAD Silero (sherpa-onnx). */
export class SileroVad extends BaseVad {
  readonly kind = 'silero' as const;

  private constructor(
    opts: VadOptions,
    private readonly vad: SherpaVad,
  ) {
    super(opts);
  }

  static async create(modelPath: string, opts: VadOptions): Promise<SileroVad> {
    const sherpa = await loadSherpa();
    const threshold = clampThreshold(opts.threshold);
    try {
      const vad = new sherpa.Vad(
        {
          sileroVad: {
            model: modelPath,
            threshold,
            minSpeechDuration: (opts.minSpeechMs ?? 250) / 1000,
            minSilenceDuration: (opts.minSilenceMs ?? 500) / 1000,
            windowSize: FRAME_SIZE,
            // nosso corte de 30 s vem antes do corte interno
            maxSpeechDuration: (opts.maxUtteranceSec ?? 30) + 5,
          },
          sampleRate: SAMPLE_RATE,
          debug: false,
          numThreads: 1,
        },
        30,
      );
      return new SileroVad({ ...opts, threshold }, vad);
    } catch (e) {
      throw new VoiceError('motor_falhou', 'Não foi possível iniciar o detector de fala (Silero). Tente baixar os modelos de novo.', { cause: e });
    }
  }

  protected processFrame(frame: Float32Array): FrameVerdict {
    this.vad.acceptWaveform(frame);
    let ended = false;
    while (!this.vad.isEmpty()) {
      // false = cópia do buffer (obrigatório no Electron)
      this.vad.front(false);
      this.vad.pop();
      ended = true;
    }
    return { speaking: this.vad.isDetected(), ended };
  }

  protected resetDetector(): void {
    try {
      this.vad.reset();
    } catch {
      /* ignora */
    }
  }
}

/**
 * VAD por energia com histerese e piso de ruído adaptativo. Mais simples que
 * o Silero (confunde ruído alto com fala), mas não precisa de modelo.
 */
export class EnergyVad extends BaseVad {
  readonly kind = 'energy' as const;
  private noiseDb = -70;
  private above = 0;
  private below = 0;
  private active = false;

  constructor(opts: VadOptions) {
    super(opts);
  }

  /** Limiar em dBFS a partir do limiar 0..1 (0,5 → -38 dBFS). */
  private startDb(): number {
    return -58 + 40 * clampThreshold(this.opts.threshold);
  }

  protected processFrame(frame: Float32Array): FrameVerdict {
    const r = rms(frame);
    const db = r > 0 ? 20 * Math.log10(r) : -120;
    const frameMs = (frame.length * 1000) / SAMPLE_RATE;
    const on = Math.max(this.startDb(), this.noiseDb + 12);
    const off = on - 6;
    let ended = false;
    if (!this.active) {
      if (db >= on) {
        this.above += frameMs;
        if (this.above >= this.minSpeechMs) {
          this.active = true;
          this.below = 0;
        }
      } else {
        this.above = Math.max(0, this.above - frameMs);
        // piso de ruído: sobe devagar, desce rápido
        const alpha = db > this.noiseDb ? 0.02 : 0.2;
        this.noiseDb = Math.max(-90, Math.min(-25, this.noiseDb + alpha * (db - this.noiseDb)));
      }
    } else if (db < off) {
      this.below += frameMs;
      if (this.below >= this.minSilenceMs) {
        this.active = false;
        this.above = 0;
        this.below = 0;
        ended = true;
      }
    } else {
      this.below = 0;
    }
    return { speaking: this.active, ended };
  }

  protected resetDetector(): void {
    this.active = false;
    this.above = 0;
    this.below = 0;
  }
}

function clampThreshold(t: number): number {
  return Number.isFinite(t) ? Math.min(0.95, Math.max(0.1, t)) : 0.5;
}

/** Cria o melhor VAD disponível: Silero se instalado, senão o de energia. */
export async function createVad(models: Pick<ModelManager, 'isInstalled' | 'pathOf'> | null, opts: VadOptions, logger?: Logger): Promise<VoiceActivityDetector> {
  if (models?.isInstalled('silero-vad')) {
    try {
      return await SileroVad.create(models.pathOf('silero-vad'), opts);
    } catch (e) {
      logger?.warn('VAD Silero indisponível; usando detector por energia', e instanceof Error ? e.message : String(e));
    }
  }
  return new EnergyVad(opts);
}
