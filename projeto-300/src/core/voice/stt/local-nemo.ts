/**
 * Transcrição local com o NeMo pt (sherpa-onnx). Nada sai do computador.
 * A decodificação é assíncrona (decodeAsync do sherpa-onnx 2.0.1) e roda
 * fora da thread principal do Node; trechos de até 30 s levam poucos
 * décimos de segundo.
 */
import type { AudioChunk, SttProvider } from '../../types';
import { SAMPLE_RATE, concatFloat32, sanitize, silence, toSampleRate } from '../audio';
import { raceAbort } from '../async-queue';
import { VoiceError, abortError, throwIfAborted } from '../errors';
import type { ModelManager } from '../models';
import { acquireNemo, type SharedRecognizer } from '../native';

export interface LocalNemoSttOptions {
  models: Pick<ModelManager, 'isInstalled' | 'filePath'>;
  numThreads?: number;
}

export const NEMO_MODEL_ID = 'nemo-pt';

export function nemoMissingError(): VoiceError {
  return new VoiceError('modelo_ausente', 'O reconhecimento de fala local ainda não foi baixado. Abra Configurações > Voz e baixe os modelos de voz.');
}

/** Organiza a saída do reconhecedor (espaços, pontuação solta). */
export function tidyTranscript(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

export class LocalNemoStt implements SttProvider {
  readonly id = 'local';
  private shared: SharedRecognizer | null = null;

  constructor(private readonly opts: LocalNemoSttOptions) {}

  /** Reconhecedor compartilhado (o mesmo da palavra de ativação). */
  recognizer(): SharedRecognizer {
    if (!this.opts.models.isInstalled(NEMO_MODEL_ID)) throw nemoMissingError();
    if (!this.shared) {
      this.shared = acquireNemo({
        model: this.opts.models.filePath(NEMO_MODEL_ID, 'model.int8.onnx'),
        tokens: this.opts.models.filePath(NEMO_MODEL_ID, 'tokens.txt'),
        numThreads: this.opts.numThreads ?? 2,
      });
    }
    return this.shared;
  }

  async transcribe(audio: AudioChunk, opts: { language?: string; prompt?: string; signal?: AbortSignal } = {}): Promise<{ text: string; language?: string }> {
    throwIfAborted(opts.signal);
    if (!audio || !(audio.samples instanceof Float32Array)) throw new VoiceError('audio_invalido', 'Áudio inválido para transcrever.');
    const rec = this.recognizer();
    const samples = sanitize(toSampleRate(audio, SAMPLE_RATE));
    if (samples.length < SAMPLE_RATE * 0.1) return { text: '', language: 'pt' };
    // um pouco de silêncio nas pontas ajuda o modelo a não engolir sílabas
    const padded = concatFloat32([silence(150), samples, silence(150)]);
    const r = await raceAbort(rec.decode(padded, SAMPLE_RATE), opts.signal, abortError);
    return { text: tidyTranscript(r.text), language: 'pt' };
  }

  dispose(): void {
    this.shared?.release();
    this.shared = null;
  }
}
