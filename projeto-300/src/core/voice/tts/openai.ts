/**
 * Voz da OpenAI (gpt-4o-mini-tts): PCM 16 bits, 24 kHz, transmitido.
 * Obs.: a OpenAI anunciou o desligamento da família gpt-4o-mini-tts em
 * 06/01/2027; o modelo pode ser trocado por configuração.
 */
import OpenAI from 'openai';
import { SECRET_NAMES, type AudioChunk, type SecretStore, type TtsProvider, type TtsVoice } from '../../types';
import { VoiceError, throwIfAborted } from '../errors';
import { mapOpenAiError, openAiKeyMissing } from '../stt/openai';
import { readPcm16Stream } from './pcm-stream';

export const OPENAI_TTS_VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse', 'marin', 'cedar'] as const;
export const OPENAI_TTS_SAMPLE_RATE = 24000;

export const OPENAI_TTS_INSTRUCTIONS =
  'Fale em português do Brasil, com sotaque brasileiro natural, tom amigável e ritmo de conversa. ' +
  'Pronuncie números, datas e siglas do jeito que um brasileiro falaria.';

export interface OpenAiTtsOptions {
  secrets: SecretStore;
  model?: string | (() => string);
  voice?: string | (() => string);
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const read = (v: string | (() => string) | undefined): string => (typeof v === 'function' ? v() : (v ?? '')).trim();

/** Dica de velocidade para modelos que não aceitam o parâmetro speed. */
export function speedInstruction(speed: number): string {
  if (speed >= 1.3) return ' Fale bem mais rápido que o normal.';
  if (speed >= 1.1) return ' Fale um pouco mais rápido que o normal.';
  if (speed <= 0.75) return ' Fale bem devagar.';
  if (speed <= 0.9) return ' Fale um pouco mais devagar que o normal.';
  return '';
}

export class OpenAiTts implements TtsProvider {
  readonly id = 'openai';
  private client: { key: string; client: OpenAI } | null = null;

  constructor(private readonly opts: OpenAiTtsOptions) {}

  async voices(): Promise<TtsVoice[]> {
    return OPENAI_TTS_VOICES.map((v) => ({ id: v, label: `${v.charAt(0).toUpperCase()}${v.slice(1)} (OpenAI)`, language: 'multi' }));
  }

  private async getClient(): Promise<OpenAI> {
    const key = (await this.opts.secrets.get(SECRET_NAMES.openai))?.trim();
    if (!key) throw openAiKeyMissing('a voz');
    if (this.client?.key !== key) {
      this.client = {
        key,
        client: new OpenAI({
          apiKey: key,
          ...(this.opts.baseURL ? { baseURL: this.opts.baseURL } : {}),
          ...(this.opts.fetch ? { fetch: this.opts.fetch } : {}),
          maxRetries: 1,
          timeout: this.opts.timeoutMs ?? 60_000,
        }),
      };
    }
    return this.client.client;
  }

  async *synthesize(text: string, opts: { voice?: string; speed?: number; signal?: AbortSignal } = {}): AsyncIterable<AudioChunk> {
    throwIfAborted(opts.signal);
    const input = (text ?? '').trim().slice(0, 4096);
    if (!input) return;
    const client = await this.getClient();
    const model = read(this.opts.model) || 'gpt-4o-mini-tts';
    const voice = (opts.voice ?? '').trim() || read(this.opts.voice) || 'coral';
    const speed = Number.isFinite(opts.speed) && opts.speed! > 0 ? Math.min(4, Math.max(0.25, opts.speed!)) : 1;
    const legacy = model.startsWith('tts-1');
    let res: Response;
    try {
      res = await client.audio.speech.create(
        {
          model,
          voice,
          input,
          response_format: 'pcm',
          ...(legacy ? (speed !== 1 ? { speed } : {}) : { instructions: OPENAI_TTS_INSTRUCTIONS + speedInstruction(speed) }),
        },
        { signal: opts.signal },
      );
    } catch (e) {
      throw mapOpenAiError(e);
    }
    if (!res.body) throw new VoiceError('servico_falhou', 'A OpenAI não devolveu áudio.');
    try {
      yield* readPcm16Stream(res.body, OPENAI_TTS_SAMPLE_RATE, opts.signal);
    } catch (e) {
      throw mapOpenAiError(e);
    }
  }
}
