/**
 * Voz da ElevenLabs (Flash v2.5) por HTTP em streaming, PCM 22,05 kHz.
 * Chave: segredo "elevenlabs_api_key" (cabeçalho xi-api-key).
 */
import { SECRET_NAMES, type AudioChunk, type SecretStore, type TtsProvider, type TtsVoice } from '../../types';
import { VoiceError, abortError, httpVoiceError, isAbortError, throwIfAborted } from '../errors';
import { readPcm16Stream } from './pcm-stream';

export const ELEVENLABS_SAMPLE_RATE = 22050;

export interface ElevenLabsTtsOptions {
  secrets: SecretStore;
  /** settings.voice.elevenlabsVoiceId (vazio = escolhe uma voz da conta). */
  voiceId?: string | (() => string);
  model?: string;
  baseURL?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

interface ElevenVoice {
  voice_id?: string;
  name?: string;
  labels?: Record<string, string | undefined>;
  verified_languages?: { language?: string; accent?: string; locale?: string }[];
}

function voiceLanguage(v: ElevenVoice): string {
  const verified = v.verified_languages?.find((l) => /^pt/i.test(l.language ?? '') || /pt-br/i.test(l.locale ?? ''));
  if (verified) return /br/i.test(`${verified.locale ?? ''} ${verified.accent ?? ''}`) ? 'pt-BR' : 'pt';
  const lang = `${v.labels?.language ?? ''} ${v.labels?.accent ?? ''}`.toLowerCase();
  if (/portug|brazil|brasil|\bpt\b/.test(lang)) return /brazil|brasil|br/.test(lang) ? 'pt-BR' : 'pt';
  return v.labels?.language || 'multi';
}

export class ElevenLabsTts implements TtsProvider {
  readonly id = 'elevenlabs';
  private autoVoice: string | null = null;

  constructor(private readonly opts: ElevenLabsTtsOptions) {}

  private base(): string {
    return (this.opts.baseURL ?? 'https://api.elevenlabs.io').replace(/\/+$/, '');
  }

  private fetchImpl(): typeof fetch {
    return this.opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async key(): Promise<string> {
    const key = (await this.opts.secrets.get(SECRET_NAMES.elevenlabs))?.trim();
    if (!key) throw new VoiceError('chave_ausente', 'Para usar a voz da ElevenLabs, cadastre a chave da ElevenLabs em Configurações > Conexões.');
    return key;
  }

  private timeoutSignal(signal?: AbortSignal): AbortSignal {
    const t = AbortSignal.timeout(this.opts.timeoutMs ?? 60_000);
    return signal ? AbortSignal.any([signal, t]) : t;
  }

  async voices(signal?: AbortSignal): Promise<TtsVoice[]> {
    const key = await this.key();
    let res: Response;
    try {
      res = await this.fetchImpl()(`${this.base()}/v1/voices`, { headers: { 'xi-api-key': key, accept: 'application/json' }, signal: this.timeoutSignal(signal) });
    } catch (e) {
      if (isAbortError(e) && signal?.aborted) throw abortError();
      throw new VoiceError('servico_falhou', 'Não foi possível falar com a ElevenLabs. Confira a internet.', { cause: e });
    }
    if (!res.ok) throw httpVoiceError('ElevenLabs', res.status, await res.text().catch(() => ''));
    const data = (await res.json().catch(() => ({}))) as { voices?: ElevenVoice[] };
    return (data.voices ?? [])
      .filter((v) => typeof v.voice_id === 'string' && v.voice_id)
      .map((v) => ({ id: v.voice_id!, label: v.name || v.voice_id!, language: voiceLanguage(v) }));
  }

  /** Sem voz configurada: prefere uma voz pt-BR da conta, senão a primeira. */
  async resolveVoice(requested?: string): Promise<string> {
    const configured = (requested ?? '').trim() || (typeof this.opts.voiceId === 'function' ? this.opts.voiceId() : (this.opts.voiceId ?? '')).trim();
    if (configured) return configured;
    if (this.autoVoice) return this.autoVoice;
    const list = await this.voices();
    const pick = list.find((v) => v.language === 'pt-BR') ?? list.find((v) => v.language.startsWith('pt')) ?? list[0];
    if (!pick) throw new VoiceError('servico_falhou', 'Sua conta da ElevenLabs não tem nenhuma voz disponível.');
    this.autoVoice = pick.id;
    return pick.id;
  }

  async *synthesize(text: string, opts: { voice?: string; speed?: number; signal?: AbortSignal } = {}): AsyncIterable<AudioChunk> {
    throwIfAborted(opts.signal);
    const input = (text ?? '').trim();
    if (!input) return;
    const key = await this.key();
    const voiceId = await this.resolveVoice(opts.voice);
    const speed = Number.isFinite(opts.speed) && opts.speed! > 0 ? opts.speed! : 1;
    const body: Record<string, unknown> = {
      text: input,
      model_id: this.opts.model ?? 'eleven_flash_v2_5',
      language_code: 'pt',
    };
    // a ElevenLabs aceita velocidade entre 0,7 e 1,2
    if (Math.abs(speed - 1) > 0.01) body.voice_settings = { speed: Math.min(1.2, Math.max(0.7, speed)) };
    const url = `${this.base()}/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_${ELEVENLABS_SAMPLE_RATE}`;
    let res: Response;
    try {
      res = await this.fetchImpl()(url, {
        method: 'POST',
        headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/pcm' },
        body: JSON.stringify(body),
        signal: this.timeoutSignal(opts.signal),
      });
    } catch (e) {
      if (opts.signal?.aborted || isAbortError(e)) throw abortError();
      throw new VoiceError('servico_falhou', 'Não foi possível falar com a ElevenLabs. Confira a internet.', { cause: e });
    }
    if (!res.ok) throw httpVoiceError('ElevenLabs', res.status, await res.text().catch(() => ''));
    if (!res.body) throw new VoiceError('servico_falhou', 'A ElevenLabs não devolveu áudio.');
    try {
      yield* readPcm16Stream(res.body, ELEVENLABS_SAMPLE_RATE, opts.signal);
    } catch (e) {
      if (opts.signal?.aborted || isAbortError(e)) throw abortError();
      throw new VoiceError('servico_falhou', 'A transmissão de áudio da ElevenLabs foi interrompida.', { cause: e });
    }
  }
}
