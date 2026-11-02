/**
 * Voz do 300: palavra de ativação "trezentos", detector de fala, fala → texto,
 * texto → fala, interrupção e conversa contínua.
 */
export { VoiceControllerImpl, DEFAULT_TIMING, interruptionNote, isMeaningful, isStopPhrase } from './controller';
export type { VoiceControllerDeps, VoiceTiming, AskOptions } from './controller';

export {
  ModelManager,
  MODEL_REGISTRY,
  DEFAULT_MODEL_IDS,
  DEFAULT_PIPER_VOICE,
  getModelSpec,
  safeEntrySegments,
  resolveInside,
} from './models';
export type { ModelSpec, ModelKind, ModelStatus, ModelProgress, ModelManagerOptions, PiperVoiceInfo } from './models';

export * as audio from './audio';
export {
  SAMPLE_RATE,
  FRAME_SIZE,
  resample,
  encodeWav,
  decodeWav,
  generateChime,
  floatToInt16,
  int16ToFloat,
  pcm16leToFloat,
  floatToPcm16le,
  rms,
  rmsToLevel,
  FrameSplitter,
} from './audio';

export { SentenceChunker, chunkText, cleanForSpeech } from './chunker';
export type { ChunkerOptions } from './chunker';

export { SileroVad, EnergyVad, createVad } from './vad';
export type { VoiceActivityDetector, VadEvent, VadOptions } from './vad';

export { LocalWakeWord, matchWakeWord, phoneticPt, levenshtein, normalizedDistance, maxDistanceFor, stripWakeWord, foldText, WAKE_WORD } from './wake';
export type { WakeMatch, WakeMatchOptions, LocalWakeDetection, LocalWakeWordOptions, WakeRecognizer, WakeCandidate } from './wake';

export { LocalNemoStt } from './stt/local-nemo';
export { OpenAiStt } from './stt/openai';
export { LocalPiperTts } from './tts/local-piper';
export { OpenAiTts, OPENAI_TTS_VOICES } from './tts/openai';
export { ElevenLabsTts } from './tts/elevenlabs';
export { SystemTts } from './tts/system';

export { createSttFromSettings, createTtsFromSettings, createWakeFromSettings } from './factory';
export type { VoiceFactoryDeps } from './factory';

export { readVoiceConfig } from './settings-view';
export type { VoiceConfig } from './settings-view';

export { VoiceError } from './errors';
export type { VoiceErrorCode } from './errors';

export { warmUpNemo } from './native';
