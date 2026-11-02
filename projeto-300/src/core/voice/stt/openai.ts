/**
 * Transcrição pela OpenAI (gpt-4o-mini-transcribe por padrão). Só é usada
 * depois da palavra de ativação ou do botão de falar, e só manda o trecho
 * da fala (WAV 16 kHz).
 */
import OpenAI, { toFile } from 'openai';
import { SECRET_NAMES, type AudioChunk, type SecretStore, type SttProvider } from '../../types';
import { SAMPLE_RATE, encodeWav, sanitize, toSampleRate } from '../audio';
import { VoiceError, abortError, httpVoiceError, isAbortError, throwIfAborted } from '../errors';

export interface OpenAiSttOptions {
  secrets: SecretStore;
  /** Modelo (lido a cada chamada; padrão gpt-4o-mini-transcribe). */
  model?: string | (() => string);
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export const STT_PROMPT_HINT = 'Conversa em português do Brasil com o assistente Trezentos (300).';

export function openAiKeyMissing(what: string): VoiceError {
  return new VoiceError('chave_ausente', `Para usar ${what} da OpenAI, cadastre a chave da OpenAI em Configurações > Conexões.`);
}

/** Converte erros do SDK da OpenAI em erros pt-BR. */
export function mapOpenAiError(e: unknown): Error {
  if (isAbortError(e)) return abortError();
  if (e instanceof VoiceError) return e;
  if (e instanceof OpenAI.APIError && typeof e.status === 'number') return httpVoiceError('OpenAI', e.status, e.message);
  if (e instanceof OpenAI.APIConnectionError) return new VoiceError('servico_falhou', 'Não foi possível falar com a OpenAI. Confira a internet.', { cause: e });
  return new VoiceError('servico_falhou', 'A OpenAI não conseguiu processar o áudio.', { cause: e });
}

export class OpenAiStt implements SttProvider {
  readonly id = 'openai';
  private client: { key: string; client: OpenAI } | null = null;

  constructor(private readonly opts: OpenAiSttOptions) {}

  private model(): string {
    const m = typeof this.opts.model === 'function' ? this.opts.model() : this.opts.model;
    return m && m.trim() ? m.trim() : 'gpt-4o-mini-transcribe';
  }

  private async getClient(): Promise<OpenAI> {
    const key = (await this.opts.secrets.get(SECRET_NAMES.openai))?.trim();
    if (!key) throw openAiKeyMissing('a transcrição');
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

  async transcribe(audio: AudioChunk, opts: { language?: string; prompt?: string; signal?: AbortSignal } = {}): Promise<{ text: string; language?: string }> {
    throwIfAborted(opts.signal);
    if (!audio || !(audio.samples instanceof Float32Array)) throw new VoiceError('audio_invalido', 'Áudio inválido para transcrever.');
    const samples = sanitize(toSampleRate(audio, SAMPLE_RATE));
    if (samples.length < SAMPLE_RATE * 0.1) return { text: '', language: 'pt' };
    const client = await this.getClient();
    const wav = encodeWav(samples, SAMPLE_RATE, 'pcm16');
    const language = (opts.language ?? 'pt').slice(0, 2).toLowerCase();
    const prompt = [STT_PROMPT_HINT, opts.prompt?.trim()].filter(Boolean).join(' ').slice(0, 800);
    try {
      const file = await toFile(Buffer.from(wav.buffer, wav.byteOffset, wav.byteLength), 'fala.wav', { type: 'audio/wav' });
      const res = await client.audio.transcriptions.create({ file, model: this.model(), language, prompt, response_format: 'json' }, { signal: opts.signal });
      const text = typeof res?.text === 'string' ? res.text : '';
      return { text: text.replace(/\s+/g, ' ').trim(), language };
    } catch (e) {
      throw mapOpenAiError(e);
    }
  }
}
