/**
 * Fábricas dos provedores de voz a partir das configurações. Os provedores
 * leem modelo/voz a cada chamada, então só precisam ser recriados quando o
 * TIPO de provedor muda (local ↔ nuvem).
 */
import type { Logger, SecretStore, SettingsAccess, SttProvider, TtsProvider, WakeWordEngine } from '../types';
import { VoiceError } from './errors';
import type { ModelManager } from './models';
import { readVoiceConfig } from './settings-view';
import { LocalNemoStt, nemoMissingError } from './stt/local-nemo';
import { OpenAiStt } from './stt/openai';
import { ElevenLabsTts } from './tts/elevenlabs';
import { LocalPiperTts } from './tts/local-piper';
import { OpenAiTts } from './tts/openai';
import { SystemTts } from './tts/system';
import { SileroVad } from './vad';
import { LocalWakeWord, type WakeCandidate } from './wake';

export interface VoiceFactoryDeps {
  settings: SettingsAccess;
  secrets: SecretStore;
  models: ModelManager;
  logger?: Logger;
  fetch?: typeof fetch;
  /** Endereços alternativos (testes ou proxy). */
  baseUrls?: { openai?: string; elevenlabs?: string };
  numThreads?: number;
}

const cfg = (d: VoiceFactoryDeps) => readVoiceConfig(d.settings.get());

export function createSttFromSettings(d: VoiceFactoryDeps): SttProvider {
  if (cfg(d).sttProvider === 'openai') {
    return new OpenAiStt({ secrets: d.secrets, model: () => cfg(d).sttModel, ...(d.baseUrls?.openai ? { baseURL: d.baseUrls.openai } : {}), ...(d.fetch ? { fetch: d.fetch } : {}) });
  }
  return new LocalNemoStt({ models: d.models, numThreads: d.numThreads ?? 2 });
}

export function createTtsFromSettings(d: VoiceFactoryDeps): TtsProvider {
  switch (cfg(d).ttsProvider) {
    case 'openai':
      return new OpenAiTts({
        secrets: d.secrets,
        model: () => cfg(d).openaiTtsModel,
        voice: () => cfg(d).openaiTtsVoice,
        ...(d.baseUrls?.openai ? { baseURL: d.baseUrls.openai } : {}),
        ...(d.fetch ? { fetch: d.fetch } : {}),
      });
    case 'elevenlabs':
      return new ElevenLabsTts({
        secrets: d.secrets,
        voiceId: () => cfg(d).elevenlabsVoiceId,
        ...(d.baseUrls?.elevenlabs ? { baseURL: d.baseUrls.elevenlabs } : {}),
        ...(d.fetch ? { fetch: d.fetch } : {}),
      });
    case 'system':
      return new SystemTts({ voice: () => cfg(d).ttsVoice });
    default:
      return new LocalPiperTts({ models: d.models, defaultVoice: () => cfg(d).localTtsVoice || cfg(d).ttsVoice, numThreads: d.numThreads ?? 2 });
  }
}

/** Chave que muda quando é preciso recriar o STT. */
export function sttKey(settings: SettingsAccess): string {
  return readVoiceConfig(settings.get()).sttProvider;
}

/** Chave que muda quando é preciso recriar o TTS. */
export function ttsKey(settings: SettingsAccess): string {
  return readVoiceConfig(settings.get()).ttsProvider;
}

export function wakeMissingModelsError(): VoiceError {
  return new VoiceError('modelo_ausente', 'Para usar a palavra de ativação "trezentos", baixe os modelos de voz em Configurações > Voz.');
}

/**
 * Cria o detector local de "trezentos" (VAD Silero + NeMo pt). O NeMo é o
 * mesmo da transcrição local (carregado uma vez só).
 */
export async function createWakeFromSettings(d: VoiceFactoryDeps & { onCandidate?: (c: WakeCandidate) => void }): Promise<WakeWordEngine> {
  if (!d.models.isInstalled('silero-vad') || !d.models.isInstalled('nemo-pt')) throw wakeMissingModelsError();
  const stt = new LocalNemoStt({ models: d.models, numThreads: d.numThreads ?? 2 });
  let rec: ReturnType<LocalNemoStt['recognizer']>;
  try {
    rec = stt.recognizer();
  } catch {
    throw nemoMissingError();
  }
  const preRollMs = 400;
  // Para a ativação só serve o Silero: o detector por energia dispararia o NeMo com qualquer ruído.
  let vad: SileroVad;
  try {
    vad = await SileroVad.create(d.models.pathOf('silero-vad'), { threshold: cfg(d).vadThreshold, minSpeechMs: 250, minSilenceMs: 500, preRollMs, maxUtteranceSec: 30 });
  } catch (e) {
    stt.dispose();
    throw e;
  }
  return new LocalWakeWord({
    vad,
    recognizer: rec,
    sensitivity: () => cfg(d).wakeSensitivity,
    preRollMs,
    windowSec: 2.0,
    ...(d.logger ? { logger: d.logger } : {}),
    ...(d.onCandidate ? { onCandidate: d.onCandidate } : {}),
    release: () => stt.dispose(),
  });
}
