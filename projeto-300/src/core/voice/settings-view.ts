/**
 * Leitura defensiva das configurações de voz. Algumas chaves ainda vão
 * entrar no esquema (localTtsVoice, openaiTtsVoice, elevenlabsVoiceId,
 * brain.voiceModel); aqui elas têm valores padrão seguros.
 */
import type { Settings } from '../settings';
import { DEFAULT_PIPER_VOICE } from './models';

export interface VoiceConfig {
  enabled: boolean;
  sttProvider: 'local' | 'openai';
  sttModel: string;
  localSttModel: 'nemo-pt';
  ttsProvider: 'local' | 'openai' | 'elevenlabs' | 'system';
  ttsVoice: string;
  localTtsVoice: string;
  openaiTtsVoice: string;
  openaiTtsModel: string;
  elevenlabsVoiceId: string;
  speed: number;
  continuousMode: boolean;
  continuousTimeoutSec: number;
  bargeIn: boolean;
  vadThreshold: number;
  wakeEnabled: boolean;
  wakeSensitivity: number;
  chime: boolean;
}

const str = (v: unknown, fallback: string): string => (typeof v === 'string' && v.trim() ? v.trim() : fallback);
const num = (v: unknown, fallback: number, min: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

export function readVoiceConfig(settings: Settings): VoiceConfig {
  const v = (settings?.voice ?? {}) as Partial<Settings['voice']> & Record<string, unknown>;
  const w = (settings?.wake ?? {}) as Partial<Settings['wake']> & Record<string, unknown>;
  const ttsProvider = v.ttsProvider === 'openai' || v.ttsProvider === 'elevenlabs' || v.ttsProvider === 'system' ? v.ttsProvider : 'local';
  return {
    enabled: bool(v.enabled, true),
    sttProvider: v.sttProvider === 'openai' ? 'openai' : 'local',
    sttModel: str(v.sttModel, 'gpt-4o-mini-transcribe'),
    localSttModel: 'nemo-pt',
    ttsProvider,
    ttsVoice: str(v.ttsVoice, ''),
    localTtsVoice: str(v.localTtsVoice, DEFAULT_PIPER_VOICE),
    openaiTtsVoice: str(v.openaiTtsVoice, 'coral'),
    openaiTtsModel: str(v.openaiTtsModel, 'gpt-4o-mini-tts'),
    elevenlabsVoiceId: str(v.elevenlabsVoiceId, ''),
    speed: num(v.speed, 1, 0.5, 2),
    continuousMode: bool(v.continuousMode, true),
    continuousTimeoutSec: num(v.continuousTimeoutSec, 12, 3, 120),
    bargeIn: bool(v.bargeIn, true),
    vadThreshold: num(v.vadThreshold, 0.5, 0.1, 0.95),
    wakeEnabled: bool(w.enabled, false),
    wakeSensitivity: num(w.sensitivity, 0.5, 0, 1),
    chime: bool(w.chime, true),
  };
}
