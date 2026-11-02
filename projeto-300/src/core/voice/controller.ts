/**
 * Controlador da conversa por voz do 300.
 *
 * Estados internos:
 *   off          → voz parada (ativação por voz desligada)
 *   passive      → ouvindo só "trezentos" (tudo local)
 *   listening    → capturando o pedido (VAD decide o fim da fala)
 *   transcribing → transformando a fala em texto
 *   thinking     → o 300 está pensando (agente)
 *   speaking     → o 300 está falando
 *
 * Fluxo: passive → (trezentos) plim + listening → transcribing → thinking →
 * speaking → (modo contínuo) listening sem palavra de ativação → ... → passive.
 *
 * Interrupção (barge-in): enquanto pensa ou fala, uma fala do dono com pelo
 * menos ~300 ms, limiar mais alto e volume mínimo para tudo na hora (áudio,
 * resposta do modelo) e vira o novo pedido. O próximo pedido leva um aviso
 * curto de que a resposta anterior foi interrompida (o histórico nunca é
 * editado, só recebe mensagens novas).
 *
 * Privacidade: em "passive" o áudio só passa pelo detector local. O áudio só
 * vai para um serviço na nuvem se o STT configurado for de nuvem, e só
 * depois da ativação ou do botão de falar.
 */
import type { AudioOutMessage } from '../../shared/ipc';
import type { VoiceController, VoiceModelStatus } from '../engine-api';
import type {
  AssistantState,
  AudioChunk,
  EventBusLike,
  Logger,
  SecretStore,
  SettingsAccess,
  SttProvider,
  TtsProvider,
  TtsVoice,
  WakeDetection,
  WakeWordEngine,
} from '../types';
import { newId } from '../util/ids';
import { SAMPLE_RATE, generateChime, levelOf, rms, rmsToLevel, sanitize } from './audio';
import { SentenceChunker, chunkText } from './chunker';
import { VoiceError, isAbortError, voiceErrorMessage } from './errors';
import { createSttFromSettings, createTtsFromSettings, createWakeFromSettings, sttKey, ttsKey } from './factory';
import { DEFAULT_MODEL_IDS, DEFAULT_PIPER_VOICE, getModelSpec, type ModelManager } from './models';
import { readVoiceConfig, type VoiceConfig } from './settings-view';
import { createVad, type VadOptions, type VoiceActivityDetector } from './vad';
import { foldText, stripWakeWord, type LocalWakeDetection } from './wake';

export interface VoiceTiming {
  /** Sem fala depois da ativação/botão: volta a esperar (ms). */
  listenTimeoutMs: number;
  /** Fala mínima para interromper o 300 (ms). */
  bargeInMinMs: number;
  /** Nível mínimo (0..1, escala de dB) da fala que interrompe. */
  bargeInMinLevel: number;
  /** Quanto o limiar do VAD sobe enquanto o 300 fala. */
  bargeInThresholdBoost: number;
  /** Intervalo dos eventos de nível (ms) — ~15 Hz. */
  levelIntervalMs: number;
  /** Folga depois do fim calculado da fala (latência do player). */
  playbackMarginMs: number;
  /** Máximo de áudio do microfone na fila (ms). */
  maxQueuedAudioMs: number;
  /** De quanto em quanto tempo conferir mudanças nas configurações (ms). */
  settingsPollMs: number;
}

export const DEFAULT_TIMING: VoiceTiming = {
  listenTimeoutMs: 8000,
  bargeInMinMs: 300,
  bargeInMinLevel: 0.3,
  bargeInThresholdBoost: 0.2,
  levelIntervalMs: 66,
  playbackMarginMs: 150,
  maxQueuedAudioMs: 10_000,
  settingsPollMs: 500,
};

export interface AskOptions {
  signal: AbortSignal;
  onDelta(text: string): void;
}

export interface VoiceControllerDeps {
  events: EventBusLike;
  settings: SettingsAccess;
  secrets: SecretStore;
  logger: Logger;
  models: ModelManager;
  /** O motor liga ao agente com mode 'voice'. */
  ask(text: string, opts: AskOptions): Promise<{ text: string }>;
  createStt?(): SttProvider;
  createTts?(): TtsProvider;
  createWake?(): WakeWordEngine | Promise<WakeWordEngine>;
  createVad?(opts: VadOptions): VoiceActivityDetector | Promise<VoiceActivityDetector>;
  timing?: Partial<VoiceTiming>;
  clock?: { now(): number };
  fetch?: typeof fetch;
}

type Phase = 'off' | 'passive' | 'listening' | 'transcribing' | 'thinking' | 'speaking';

interface ListenState {
  vad: Promise<VoiceActivityDetector>;
  stripWake: boolean;
  heard: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface BargeState {
  vad: Promise<VoiceActivityDetector>;
}

interface Turn {
  id: string;
  abort: AbortController;
  chunker: SentenceChunker;
  session: SpeechSession;
  muted: boolean;
  deltaChars: number;
}

interface LevelSegment {
  startAt: number;
  stepMs: number;
  levels: Float32Array;
}

const STOP_PHRASES = new Set([
  'para', 'pare', 'parar', 'pode parar', 'para por favor', 'cancela', 'cancelar', 'pode cancelar', 'chega', 'tchau', 'tchau trezentos', 'ate logo',
  'ate mais', 'encerrar', 'encerra', 'sair', 'silencio', 'fica quieto', 'fica quieta', 'pode ir', 'obrigado era so isso', 'era so isso',
]);

const NOISE_WORDS = new Set(['hum', 'hmm', 'hm', 'uhum', 'aham', 'ah', 'eh', 'ahn', 'han', 'ham', 'ã', 'é']);

/** Normaliza para comparar frases curtas. */
const simple = (t: string) => foldText(t).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export function isStopPhrase(text: string): boolean {
  return STOP_PHRASES.has(simple(text));
}

export function isMeaningful(text: string): boolean {
  const s = simple(text);
  if (!s) return false;
  return s.split(' ').some((w) => !NOISE_WORDS.has(w));
}

/** Aviso que vai antes do próximo pedido quando o dono interrompe. */
export function interruptionNote(heard: string | null): string {
  if (heard && heard.trim()) {
    const tail = heard.trim().slice(-200);
    return (
      `[Aviso do sistema: o dono interrompeu a sua resposta anterior falando por cima. Ele ouviu só até: "${tail.length < heard.trim().length ? '…' : ''}${tail}". ` +
      'Não repita o que já foi dito; responda ao que ele disse agora.]'
    );
  }
  return '[Aviso do sistema: o dono interrompeu a sua resposta anterior antes de você começar a falar. Responda ao que ele disse agora.]';
}

/* ======================================================================
 * Sessão de fala: fila de trechos → TTS → áudio na linha do tempo
 * ==================================================================== */
interface SessionHost {
  tts(): TtsProvider;
  speed(): number;
  emitAudio(utteranceId: string, chunk: AudioChunk): { startAt: number; endAt: number };
  emitFinal(utteranceId: string): void;
  sleepUntilPlayed(signal: AbortSignal): Promise<void>;
  onSpeechStart(session: SpeechSession): void;
  onSessionEnd(session: SpeechSession): void;
  now(): number;
  logger: Logger;
}

class SpeechSession {
  readonly utteranceId = newId('fala');
  readonly abort = new AbortController();
  readonly done: Promise<void>;
  started = false;
  cancelled = false;
  failed: unknown = null;
  private texts: string[] = [];
  private closed = false;
  private wakeUp: (() => void) | null = null;
  private pieces: { text: string; startAt: number; endAt: number }[] = [];

  constructor(
    private readonly host: SessionHost,
    after: Promise<void>,
  ) {
    this.done = after.catch(() => undefined).then(() => this.run());
  }

  enqueue(text: string): void {
    if (this.closed || this.cancelled || !text.trim()) return;
    this.texts.push(text);
    this.wakeUp?.();
  }

  close(): void {
    this.closed = true;
    this.wakeUp?.();
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.abort.abort();
    this.wakeUp?.();
  }

  /** Texto que já começou a tocar até agora (aproximado pela duração do áudio). */
  heardText(now: number): string {
    const parts: string[] = [];
    for (const p of this.pieces) {
      if (p.startAt > now) break;
      if (p.endAt <= now) {
        parts.push(p.text);
        continue;
      }
      const frac = (now - p.startAt) / Math.max(1, p.endAt - p.startAt);
      const words = p.text.split(/\s+/);
      const n = Math.max(1, Math.round(words.length * frac));
      parts.push(words.slice(0, n).join(' '));
      break;
    }
    return parts.join(' ');
  }

  private async next(): Promise<string | null> {
    while (this.texts.length === 0) {
      if (this.closed || this.cancelled) return null;
      await new Promise<void>((r) => (this.wakeUp = r));
      this.wakeUp = null;
    }
    if (this.cancelled) return null;
    return this.texts.shift() ?? null;
  }

  private async run(): Promise<void> {
    try {
      for (;;) {
        const text = await this.next();
        if (text === null || this.cancelled) break;
        let piece: { text: string; startAt: number; endAt: number } | null = null;
        for await (const chunk of this.host.tts().synthesize(text, { speed: this.host.speed(), signal: this.abort.signal })) {
          if (this.cancelled) break;
          if (!chunk || !(chunk.samples instanceof Float32Array) || chunk.samples.length === 0) continue;
          const slot = this.host.emitAudio(this.utteranceId, { samples: sanitize(chunk.samples), sampleRate: chunk.sampleRate });
          if (!piece) {
            piece = { text, startAt: slot.startAt, endAt: slot.endAt };
            this.pieces.push(piece);
          }
          piece.endAt = slot.endAt;
          if (!this.started) {
            this.started = true;
            this.host.onSpeechStart(this);
          }
        }
      }
      if (!this.cancelled) {
        this.host.emitFinal(this.utteranceId);
        await this.host.sleepUntilPlayed(this.abort.signal);
      }
    } catch (e) {
      if (!this.cancelled && !isAbortError(e)) {
        this.failed = e;
        this.host.logger.warn('voz: falha ao falar', e instanceof Error ? e.message : String(e));
      }
    } finally {
      this.host.onSessionEnd(this);
    }
  }
}

/* ======================================================================
 * Controlador
 * ==================================================================== */
export class VoiceControllerImpl implements VoiceController {
  private readonly timing: VoiceTiming;
  private readonly clock: { now(): number };
  private phase: Phase = 'off';
  private lastState: { state: AssistantState; detail?: string } | null = null;
  private disposed = false;

  private wake: WakeWordEngine | null = null;
  private wakeLoading: Promise<void> | null = null;
  private wakeErrorShown = false;

  private listen: ListenState | null = null;
  private barge: BargeState | null = null;
  private turn: Turn | null = null;
  private sessions = new Set<SpeechSession>();
  private sessionChain: Promise<void> = Promise.resolve();
  private sttAbort: AbortController | null = null;
  private inConversation = false;
  private continuousListen = false;
  private interruptedNote: string | null = null;

  private sttCache: { key: string; provider: SttProvider } | null = null;
  private ttsCache: { key: string; provider: TtsProvider } | null = null;

  private queue: Float32Array[] = [];
  private queuedSamples = 0;
  private pumping: Promise<void> | null = null;
  private overflowWarned = false;
  private lastSettingsPoll = 0;

  private readonly audioOut = new Set<(m: AudioOutMessage) => void>();
  private readonly audioStop = new Set<() => void>();
  private playEndAt = 0;
  private levelSegments: LevelSegment[] = [];
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private lastMicEmit = 0;
  private micPeak = 0;

  constructor(private readonly deps: VoiceControllerDeps) {
    this.timing = { ...DEFAULT_TIMING, ...(deps.timing ?? {}) };
    this.clock = deps.clock ?? { now: () => Date.now() };
    queueMicrotask(() => {
      if (!this.disposed) void this.refreshWake().then(() => this.toRestIfIdle());
    });
  }

  /* ------------------------------------------------------------ util */
  private cfg(): VoiceConfig {
    return readVoiceConfig(this.deps.settings.get());
  }

  private now(): number {
    return this.clock.now();
  }

  private emitState(state: AssistantState, detail?: string, force = false): void {
    if (!force && this.lastState && this.lastState.state === state && this.lastState.detail === detail) return;
    this.lastState = { state, ...(detail ? { detail } : {}) };
    this.deps.events.emit({ type: 'state', state, ...(detail ? { detail } : {}) });
  }

  private setPhase(phase: Phase, detail?: string, force = false): void {
    this.phase = phase;
    switch (phase) {
      case 'off':
        this.emitState('IDLE', undefined, force);
        break;
      case 'passive':
        this.emitState('IDLE', 'Aguardando "trezentos"', force);
        break;
      case 'listening':
        this.emitState('LISTENING', detail, force);
        break;
      case 'transcribing':
        this.emitState('THINKING', detail ?? 'Entendendo o que você disse', force);
        break;
      case 'thinking':
        this.emitState('THINKING', detail, force);
        break;
      case 'speaking':
        this.emitState('SPEAKING', detail, force);
        break;
    }
    if (phase === 'thinking' || phase === 'speaking') void this.ensureBarge();
    else this.disposeBarge();
  }

  private fail(err: unknown, fallback: string): void {
    if (this.disposed) return;
    const message = voiceErrorMessage(err, fallback);
    this.deps.logger.error('voz: ' + message, err instanceof Error ? err.message : String(err));
    this.deps.events.emit({ type: 'error', message, code: err instanceof VoiceError ? `voz_${err.code}` : 'voz' });
    this.cancelTurn();
    this.sttAbort?.abort();
    this.sttAbort = null;
    this.toRest();
  }

  /* ------------------------------------------------------------ provedores */
  private factoryDeps() {
    return { settings: this.deps.settings, secrets: this.deps.secrets, models: this.deps.models, logger: this.deps.logger, ...(this.deps.fetch ? { fetch: this.deps.fetch } : {}) };
  }

  private getStt(): SttProvider {
    const key = sttKey(this.deps.settings);
    if (!this.sttCache || this.sttCache.key !== key) {
      disposeProvider(this.sttCache?.provider);
      const provider = this.deps.createStt ? this.deps.createStt() : createSttFromSettings(this.factoryDeps());
      this.sttCache = { key, provider };
    }
    return this.sttCache.provider;
  }

  private getTts(): TtsProvider {
    const key = ttsKey(this.deps.settings);
    if (!this.ttsCache || this.ttsCache.key !== key) {
      disposeProvider(this.ttsCache?.provider);
      const provider = this.deps.createTts ? this.deps.createTts() : createTtsFromSettings(this.factoryDeps());
      this.ttsCache = { key, provider };
    }
    return this.ttsCache.provider;
  }

  private makeVad(boost = 0, minSpeechMs = 250): Promise<VoiceActivityDetector> {
    const c = this.cfg();
    const opts: VadOptions = {
      threshold: Math.min(0.95, c.vadThreshold + boost),
      minSpeechMs,
      minSilenceMs: 600,
      maxUtteranceSec: 30,
      preRollMs: 600,
    };
    return Promise.resolve(this.deps.createVad ? this.deps.createVad(opts) : createVad(this.deps.models, opts, this.deps.logger));
  }

  /* ------------------------------------------------------------ palavra de ativação */
  private async refreshWake(): Promise<void> {
    if (this.disposed) return;
    const c = this.cfg();
    const want = c.enabled && c.wakeEnabled;
    if (!want) {
      this.disposeWake();
      if (this.phase === 'passive') this.setPhase('off');
      return;
    }
    if (this.wake) return;
    if (this.wakeLoading) return this.wakeLoading;
    this.wakeLoading = (async () => {
      try {
        const w = await (this.deps.createWake ? this.deps.createWake() : createWakeFromSettings(this.factoryDeps()));
        const still = this.cfg();
        if (this.disposed || !still.enabled || !still.wakeEnabled) {
          w.dispose();
          return;
        }
        this.wake = w;
        this.wakeErrorShown = false;
        if (this.phase === 'off') this.setPhase('passive');
      } catch (e) {
        if (!this.wakeErrorShown) {
          this.wakeErrorShown = true;
          const message = voiceErrorMessage(e, 'Não foi possível ligar a palavra de ativação.');
          this.deps.logger.warn('voz: ativação indisponível', e instanceof Error ? e.message : String(e));
          this.deps.events.emit({ type: 'error', message, code: e instanceof VoiceError ? `voz_${e.code}` : 'voz' });
        }
        if (this.phase === 'passive') this.setPhase('off');
      } finally {
        this.wakeLoading = null;
      }
    })();
    return this.wakeLoading;
  }

  private disposeWake(): void {
    const w = this.wake;
    this.wake = null;
    if (w) {
      try {
        w.dispose();
      } catch {
        /* ignora */
      }
    }
  }

  private wakeActive(): boolean {
    const c = this.cfg();
    return c.enabled && c.wakeEnabled;
  }

  /* ------------------------------------------------------------ entrada de áudio */
  pushAudio(frame: Float32Array): void {
    try {
      if (this.disposed || !(frame instanceof Float32Array) || frame.length === 0) return;
      const clean = sanitize(frame);
      this.emitMicLevel(clean);
      const now = this.now();
      if (now - this.lastSettingsPoll >= this.timing.settingsPollMs) {
        this.lastSettingsPoll = now;
        this.pollSettings();
      }
      if (this.phase === 'off' || this.phase === 'transcribing') return;
      this.queue.push(clean);
      this.queuedSamples += clean.length;
      const max = (this.timing.maxQueuedAudioMs * SAMPLE_RATE) / 1000;
      while (this.queuedSamples > max && this.queue.length > 1) {
        const dropped = this.queue.shift()!;
        this.queuedSamples -= dropped.length;
        if (!this.overflowWarned) {
          this.overflowWarned = true;
          this.deps.logger.warn('voz: processamento atrasado; descartando áudio antigo do microfone');
        }
      }
      if (!this.pumping) this.pumping = this.pump();
    } catch (e) {
      this.deps.logger.warn('voz: quadro de áudio ignorado', e instanceof Error ? e.message : String(e));
    }
  }

  /** Espera a fila do microfone esvaziar (útil em testes e diagnóstico). */
  async drainAudio(): Promise<void> {
    while (this.pumping) await this.pumping;
  }

  private async pump(): Promise<void> {
    try {
      while (this.queue.length > 0 && !this.disposed) {
        const frame = this.queue.shift()!;
        this.queuedSamples -= frame.length;
        try {
          await this.processFrame(frame);
        } catch (e) {
          this.fail(e, 'Tive um problema ao ouvir. Tente de novo.');
        }
      }
      this.overflowWarned = false;
    } finally {
      this.pumping = null;
    }
  }

  private async processFrame(frame: Float32Array): Promise<void> {
    switch (this.phase) {
      case 'passive':
        return this.feedWake(frame);
      case 'listening':
        return this.feedListen(frame);
      case 'thinking':
      case 'speaking':
        if (this.cfg().bargeIn) return this.feedBarge(frame);
        return;
      default:
        return;
    }
  }

  private pollSettings(): void {
    const want = this.wakeActive();
    if (want && !this.wake && !this.wakeLoading && !this.wakeErrorShown) void this.refreshWake();
    if (!want && this.wake) void this.refreshWake();
    if (!this.cfg().enabled && this.phase !== 'off') this.stopListening();
  }

  private emitMicLevel(frame: Float32Array): void {
    this.micPeak = Math.max(this.micPeak, rms(frame));
    const now = this.now();
    if (now - this.lastMicEmit < this.timing.levelIntervalMs) return;
    this.lastMicEmit = now;
    const level = rmsToLevel(this.micPeak);
    this.micPeak = 0;
    this.deps.events.emit({ type: 'mic_level', level });
  }

  private async feedWake(frame: Float32Array): Promise<void> {
    const wake = this.wake;
    if (!wake) return;
    let det: WakeDetection | null;
    try {
      const r = wake.accept(frame);
      det = r instanceof Promise ? await r : r;
    } catch (e) {
      this.deps.logger.warn('voz: detector de ativação falhou num trecho', e instanceof Error ? e.message : String(e));
      return;
    }
    if (det && this.phase === 'passive' && this.wake === wake) await this.onWake(det);
  }

  private async onWake(det: WakeDetection): Promise<void> {
    this.deps.events.emit({ type: 'wake', engine: det.engine, score: det.score, ...(det.remainder ? { text: det.remainder } : {}) });
    this.wake?.reset();
    this.inConversation = true;
    if (this.cfg().chime) this.playChime();
    const local = det as Partial<LocalWakeDetection>;
    if (local.ongoing && det.audio && det.audio.length > 0) {
      // ainda falando: continua capturando a mesma fala e depois tira o "trezentos"
      await this.enterListening({ prefix: det.audio, stripWake: true, timeoutMs: this.timing.listenTimeoutMs });
      return;
    }
    const remainder = det.remainder?.trim() ?? '';
    if (remainder) {
      if (this.cfg().sttProvider !== 'local' && det.audio && det.audio.length > 0) {
        // STT de nuvem escolhido: transcreve de novo (melhor qualidade), com o texto local como reserva
        void this.handleUtterance(det.audio, true, remainder);
      } else {
        this.acceptTranscript(remainder);
      }
      return;
    }
    await this.enterListening({ timeoutMs: this.timing.listenTimeoutMs });
  }

  private playChime(): void {
    const samples = generateChime({ sampleRate: 24000 });
    const id = newId('plim');
    this.emitAudio(id, { samples, sampleRate: 24000 });
    this.emitFinal(id);
  }

  /* ------------------------------------------------------------ escuta do pedido */
  private async enterListening(o: { prefix?: Float32Array; stripWake?: boolean; timeoutMs: number; continuous?: boolean }): Promise<void> {
    if (this.disposed) return;
    this.disposeListen();
    this.inConversation = true;
    this.continuousListen = !!o.continuous;
    const l: ListenState = { vad: this.makeVad(), stripWake: !!o.stripWake, heard: false, timer: null };
    l.vad.catch((e: unknown) => {
      if (this.listen === l) this.fail(e, 'Não consegui ligar o detector de fala.');
    });
    this.listen = l;
    this.setPhase('listening', o.continuous ? 'Pode falar' : 'Ouvindo');
    if (o.prefix && o.prefix.length > 0) {
      let vad: VoiceActivityDetector;
      try {
        vad = await l.vad;
      } catch {
        return;
      }
      if (this.listen !== l) return;
      for (const ev of vad.accept(o.prefix)) {
        if (ev.type === 'speech_start') l.heard = true;
        else {
          this.onUtteranceEnd(l, ev.segment);
          return;
        }
      }
      if (vad.speaking) l.heard = true;
    }
    if (!l.heard) l.timer = setTimeout(() => this.onListenTimeout(l), o.timeoutMs);
  }

  private async feedListen(frame: Float32Array): Promise<void> {
    const l = this.listen;
    if (!l) return;
    let vad: VoiceActivityDetector;
    try {
      vad = await l.vad;
    } catch {
      return;
    }
    if (this.listen !== l) return;
    for (const ev of vad.accept(frame)) {
      if (ev.type === 'speech_start') {
        l.heard = true;
        if (l.timer) clearTimeout(l.timer);
        l.timer = null;
      } else {
        this.onUtteranceEnd(l, ev.segment);
        return;
      }
    }
  }

  private onListenTimeout(l: ListenState): void {
    if (this.listen !== l || l.heard || this.disposed) return;
    this.deps.logger.info(this.continuousListen ? 'voz: fim da conversa contínua (silêncio)' : 'voz: nenhuma fala depois da ativação');
    this.toRest();
  }

  private onUtteranceEnd(l: ListenState, segment: Float32Array): void {
    this.listen = null;
    if (l.timer) clearTimeout(l.timer);
    void l.vad.then((v) => v.dispose()).catch(() => undefined);
    void this.handleUtterance(segment, l.stripWake);
  }

  private disposeListen(): void {
    const l = this.listen;
    this.listen = null;
    if (!l) return;
    if (l.timer) clearTimeout(l.timer);
    void l.vad.then((v) => v.dispose()).catch(() => undefined);
  }

  /* ------------------------------------------------------------ transcrição */
  private async handleUtterance(audio: Float32Array, stripWake: boolean, fallbackText?: string): Promise<void> {
    if (this.disposed) return;
    this.sttAbort?.abort();
    const ctrl = new AbortController();
    this.sttAbort = ctrl;
    this.setPhase('transcribing');
    let text = '';
    try {
      const r = await this.getStt().transcribe({ samples: audio, sampleRate: SAMPLE_RATE }, { language: 'pt', prompt: 'Trezentos', signal: ctrl.signal });
      text = r.text ?? '';
    } catch (e) {
      if (ctrl.signal.aborted || isAbortError(e) || this.sttAbort !== ctrl) return;
      if (!fallbackText) {
        this.sttAbort = null;
        this.fail(e, 'Não consegui entender o áudio. Tente de novo.');
        return;
      }
      this.deps.logger.warn('voz: transcrição falhou; usando o texto local', e instanceof Error ? e.message : String(e));
    }
    if (this.sttAbort !== ctrl || this.disposed) return;
    this.sttAbort = null;
    if (stripWake) text = stripWakeWord(text);
    if (!text.trim() && fallbackText) text = fallbackText;
    this.acceptTranscript(text.trim());
  }

  private acceptTranscript(text: string): void {
    if (!isMeaningful(text)) {
      this.afterEmpty();
      return;
    }
    this.deps.events.emit({ type: 'transcript', text, final: true });
    if (isStopPhrase(text)) {
      this.deps.logger.info('voz: o dono encerrou a conversa');
      this.toRest();
      return;
    }
    void this.startTurn(text);
  }

  private afterEmpty(): void {
    const c = this.cfg();
    if (this.inConversation && c.continuousMode) void this.enterListening({ timeoutMs: c.continuousTimeoutSec * 1000, continuous: true });
    else this.toRest();
  }

  /* ------------------------------------------------------------ turno (agente + fala) */
  private sessionHost(): SessionHost {
    return {
      tts: () => this.getTts(),
      speed: () => this.cfg().speed,
      emitAudio: (id, chunk) => this.emitAudio(id, chunk),
      emitFinal: (id) => this.emitFinal(id),
      sleepUntilPlayed: (signal) => this.sleepUntilPlayed(signal),
      onSpeechStart: (s) => this.onSpeechStart(s),
      onSessionEnd: (s) => this.onSessionEnd(s),
      now: () => this.now(),
      logger: this.deps.logger,
    };
  }

  private newSession(): SpeechSession {
    const s = new SpeechSession(this.sessionHost(), this.sessionChain);
    this.sessions.add(s);
    this.sessionChain = s.done;
    return s;
  }

  private async startTurn(text: string): Promise<void> {
    if (this.disposed) return;
    this.cancelTurn();
    const turn: Turn = {
      id: newId('turno'),
      abort: new AbortController(),
      chunker: new SentenceChunker(),
      session: this.newSession(),
      muted: false,
      deltaChars: 0,
    };
    this.turn = turn;
    this.inConversation = true;
    this.setPhase('thinking');
    const note = this.interruptedNote;
    this.interruptedNote = null;
    const prompt = note ? `${note}\n\n${text}` : text;
    let answer = '';
    try {
      const res = await this.deps.ask(prompt, {
        signal: turn.abort.signal,
        onDelta: (d: string) => {
          if (typeof d !== 'string' || !d || turn.muted || turn.abort.signal.aborted) return;
          turn.deltaChars += d.length;
          for (const c of turn.chunker.push(d)) turn.session.enqueue(c);
        },
      });
      answer = typeof res?.text === 'string' ? res.text : '';
    } catch (e) {
      if (turn.abort.signal.aborted || isAbortError(e) || this.turn !== turn) return;
      this.fail(e, 'Não consegui responder agora. Tente de novo.');
      return;
    }
    if (turn.abort.signal.aborted || this.turn !== turn) return;
    if (!turn.muted) {
      for (const c of turn.chunker.flush()) turn.session.enqueue(c);
      // provedor sem streaming: fala a resposta inteira
      if (turn.deltaChars === 0 && answer.trim()) for (const c of chunkText(answer)) turn.session.enqueue(c);
    }
    turn.session.close();
    // o agente avisa "IDLE" ao terminar; se ainda estamos falando, a interface precisa saber
    if (this.phase === 'speaking') this.setPhase('speaking', undefined, true);
    await turn.session.done;
    if (this.turn !== turn) return;
    this.turn = null;
    if (turn.session.failed) {
      this.fail(turn.session.failed, 'Não consegui falar a resposta (ela está na tela).');
      return;
    }
    this.settle();
  }

  private onSpeechStart(session: SpeechSession): void {
    if (session.cancelled || this.disposed) return;
    if (this.phase === 'listening' || this.phase === 'transcribing') this.disposeListen();
    this.setPhase('speaking', undefined, this.phase !== 'speaking');
    this.startLevelTimer();
  }

  private onSessionEnd(session: SpeechSession): void {
    this.sessions.delete(session);
    if (this.disposed) return;
    // sessões de turno são encerradas pelo próprio turno
    if (this.turn?.session === session) {
      if (this.phase === 'speaking' && session.cancelled) this.setPhase('thinking', 'Respondendo na tela');
      return;
    }
    if (session.failed) {
      this.fail(session.failed, 'Não consegui falar agora.');
      return;
    }
    if (this.sessions.size === 0 && this.phase === 'speaking') this.settle();
  }

  /** Decide o próximo estado quando nada mais está acontecendo. */
  private settle(): void {
    if (this.disposed) return;
    if (this.turn) {
      this.setPhase(this.sessions.size > 0 && this.turn.session.started && !this.turn.session.cancelled ? 'speaking' : 'thinking');
      return;
    }
    if (this.sessions.size > 0) return;
    const c = this.cfg();
    if (this.inConversation && c.continuousMode && c.enabled) {
      void this.enterListening({ timeoutMs: c.continuousTimeoutSec * 1000, continuous: true });
    } else {
      this.toRest();
    }
  }

  /** Cancela o turno e as falas em andamento (o "plim" sozinho não é cortado). */
  private cancelTurn(): void {
    const t = this.turn;
    this.turn = null;
    const hadSpeech = !!t || this.sessions.size > 0;
    if (t) {
      t.muted = true;
      t.abort.abort();
      t.session.cancel();
    }
    for (const s of [...this.sessions]) s.cancel();
    if (hadSpeech) this.stopAudio();
  }

  private toRest(): void {
    if (this.disposed) return;
    this.inConversation = false;
    this.continuousListen = false;
    this.disposeListen();
    this.disposeBarge();
    if (this.wakeActive() && (this.wake || this.wakeLoading || !this.wakeErrorShown)) {
      this.wake?.reset();
      this.setPhase('passive');
      if (!this.wake && !this.wakeLoading) void this.refreshWake();
    } else {
      this.setPhase('off');
    }
  }

  private toRestIfIdle(): void {
    if (this.phase === 'off' || this.phase === 'passive') this.toRest();
  }

  /* ------------------------------------------------------------ interrupção */
  private async ensureBarge(): Promise<void> {
    if (this.barge || this.disposed || !this.cfg().bargeIn) return;
    const b: BargeState = { vad: this.makeVad(this.timing.bargeInThresholdBoost, this.timing.bargeInMinMs) };
    b.vad.catch((e: unknown) => this.deps.logger.warn('voz: detector de interrupção indisponível', e instanceof Error ? e.message : String(e)));
    this.barge = b;
  }

  private disposeBarge(): void {
    const b = this.barge;
    this.barge = null;
    if (b) void b.vad.then((v) => v.dispose()).catch(() => undefined);
  }

  private async feedBarge(frame: Float32Array): Promise<void> {
    const b = this.barge;
    if (!b) return;
    let vad: VoiceActivityDetector;
    try {
      vad = await b.vad;
    } catch {
      return;
    }
    if (this.barge !== b) return;
    vad.accept(frame);
    if (!vad.speaking) return;
    const cur = vad.currentSpeech();
    if (!cur) return;
    const n = Math.round((this.timing.bargeInMinMs * SAMPLE_RATE) / 1000);
    const tail = cur.subarray(Math.max(0, cur.length - n));
    if (levelOf(tail) < this.timing.bargeInMinLevel) return; // eco baixo ou ruído: ignora
    await this.bargeIn(cur);
  }

  private async bargeIn(prefix: Float32Array): Promise<void> {
    const turn = this.turn;
    let note: string | null = null;
    if (turn) note = interruptionNote(turn.session.started ? turn.session.heardText(this.now()) : null);
    this.deps.logger.info('voz: o dono interrompeu');
    this.cancelTurn();
    this.disposeBarge();
    if (note) this.interruptedNote = note;
    await this.enterListening({ prefix, timeoutMs: this.timing.listenTimeoutMs });
  }

  /* ------------------------------------------------------------ saída de áudio */
  private emitAudio(utteranceId: string, chunk: AudioChunk): { startAt: number; endAt: number } {
    const now = this.now();
    const dur = (chunk.samples.length * 1000) / chunk.sampleRate;
    const startAt = Math.max(now, this.playEndAt);
    const endAt = startAt + dur;
    this.playEndAt = endAt;
    this.pushLevels(startAt, chunk);
    const msg: AudioOutMessage = { utteranceId, samples: chunk.samples, sampleRate: chunk.sampleRate, final: false };
    for (const l of [...this.audioOut]) {
      try {
        l(msg);
      } catch {
        /* ouvinte com falha é ignorado */
      }
    }
    return { startAt, endAt };
  }

  private emitFinal(utteranceId: string): void {
    const msg: AudioOutMessage = { utteranceId, samples: new Float32Array(0), sampleRate: 24000, final: true };
    for (const l of [...this.audioOut]) {
      try {
        l(msg);
      } catch {
        /* ignora */
      }
    }
  }

  private sleepUntilPlayed(signal: AbortSignal): Promise<void> {
    return new Promise<void>((resolve) => {
      const wait = this.playEndAt + this.timing.playbackMarginMs - this.now();
      if (wait <= 0 || signal.aborted) return resolve();
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, wait);
      const onAbort = () => {
        clearTimeout(t);
        resolve();
      };
      signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private stopAudio(): void {
    const wasPlaying = this.playEndAt > this.now() || this.levelTimer !== null;
    this.playEndAt = this.now();
    this.levelSegments = [];
    if (this.levelTimer) {
      clearInterval(this.levelTimer);
      this.levelTimer = null;
    }
    if (wasPlaying) {
      this.deps.events.emit({ type: 'speech_level', level: 0 });
      for (const l of [...this.audioStop]) {
        try {
          l();
        } catch {
          /* ignora */
        }
      }
    }
  }

  private pushLevels(startAt: number, chunk: AudioChunk): void {
    const stepMs = this.timing.levelIntervalMs;
    const step = Math.max(1, Math.round((chunk.sampleRate * stepMs) / 1000));
    const n = Math.ceil(chunk.samples.length / step);
    const levels = new Float32Array(n);
    for (let i = 0; i < n; i++) levels[i] = rmsToLevel(rms(chunk.samples, i * step, (i + 1) * step));
    this.levelSegments.push({ startAt, stepMs: (step * 1000) / chunk.sampleRate, levels });
  }

  private levelAt(t: number): number {
    while (this.levelSegments.length > 0) {
      const s = this.levelSegments[0]!;
      if (t >= s.startAt + s.levels.length * s.stepMs) this.levelSegments.shift();
      else break;
    }
    const s = this.levelSegments[0];
    if (!s || t < s.startAt) return 0;
    return s.levels[Math.min(s.levels.length - 1, Math.floor((t - s.startAt) / s.stepMs))] ?? 0;
  }

  private startLevelTimer(): void {
    if (this.levelTimer) return;
    this.levelTimer = setInterval(() => {
      const now = this.now();
      if (now > this.playEndAt + this.timing.playbackMarginMs) {
        if (this.levelTimer) clearInterval(this.levelTimer);
        this.levelTimer = null;
        this.deps.events.emit({ type: 'speech_level', level: 0 });
        return;
      }
      this.deps.events.emit({ type: 'speech_level', level: this.levelAt(now) });
    }, this.timing.levelIntervalMs);
  }

  /* ------------------------------------------------------------ API pública */
  startListening(): void {
    if (this.disposed) return;
    const c = this.cfg();
    if (!c.enabled) {
      this.deps.events.emit({ type: 'error', message: 'A voz está desligada nas configurações.', code: 'voz_desligada' });
      return;
    }
    this.cancelTurn();
    this.sttAbort?.abort();
    this.sttAbort = null;
    void this.enterListening({ timeoutMs: this.timing.listenTimeoutMs });
  }

  stopListening(): void {
    if (this.disposed) return;
    this.cancelTurn();
    this.sttAbort?.abort();
    this.sttAbort = null;
    this.interruptedNote = null;
    this.toRest();
  }

  stopSpeaking(): void {
    if (this.disposed) return;
    const turn = this.turn;
    if (turn) {
      turn.muted = true;
      turn.session.cancel();
    }
    for (const s of [...this.sessions]) s.cancel();
    this.stopAudio();
    if (turn) this.setPhase('thinking', 'Respondendo na tela');
  }

  async setWakeEnabled(enabled: boolean): Promise<void> {
    if (this.disposed) return;
    await this.deps.settings.update({ wake: { enabled } });
    this.wakeErrorShown = false;
    await this.refreshWake();
    if (this.phase === 'off' || this.phase === 'passive') this.toRest();
  }

  async speak(text: string, opts: { signal?: AbortSignal } = {}): Promise<void> {
    if (this.disposed || !this.cfg().enabled) return;
    const chunks = chunkText(text ?? '');
    if (chunks.length === 0 || opts.signal?.aborted) return;
    const session = this.newSession();
    const onAbort = () => session.cancel();
    opts.signal?.addEventListener('abort', onAbort, { once: true });
    for (const c of chunks) session.enqueue(c);
    session.close();
    try {
      await session.done;
    } finally {
      opts.signal?.removeEventListener('abort', onAbort);
    }
    if (session.failed) throw session.failed instanceof Error ? session.failed : new VoiceError('motor_falhou', 'Não consegui falar agora.');
  }

  onAudioOut(listener: (msg: AudioOutMessage) => void): () => void {
    this.audioOut.add(listener);
    return () => this.audioOut.delete(listener);
  }

  onAudioStop(listener: () => void): () => void {
    this.audioStop.add(listener);
    return () => this.audioStop.delete(listener);
  }

  async voices(): Promise<TtsVoice[]> {
    return this.getTts().voices();
  }

  async modelsStatus(): Promise<VoiceModelStatus[]> {
    return (await this.deps.models.status()).map((s) => ({ id: s.id, label: s.label, installed: s.installed, sizeMb: s.sizeMb }));
  }

  /** Modelos padrão para a configuração atual: VAD, NeMo e a voz local escolhida. */
  defaultModelIds(): string[] {
    const voice = this.cfg().localTtsVoice;
    const ids = DEFAULT_MODEL_IDS.filter((id) => getModelSpec(id)?.kind !== 'tts');
    ids.push(getModelSpec(voice)?.kind === 'tts' ? voice : DEFAULT_PIPER_VOICE);
    return ids;
  }

  async downloadModels(ids?: string[], onProgress?: (id: string, fraction: number) => void): Promise<void> {
    const list = ids && ids.length > 0 ? ids : this.defaultModelIds();
    await this.deps.models.ensure(list, onProgress);
    // recria o que depende dos modelos
    disposeProvider(this.sttCache?.provider);
    disposeProvider(this.ttsCache?.provider);
    this.sttCache = null;
    this.ttsCache = null;
    this.wakeErrorShown = false;
    if (this.wakeActive() && !this.wake) {
      await this.refreshWake();
      if (this.phase === 'off' || this.phase === 'passive') this.toRest();
    }
  }

  /** Estado interno atual (diagnóstico e testes). */
  get currentPhase(): Phase {
    return this.phase;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.cancelTurn();
    this.sttAbort?.abort();
    this.disposed = true;
    this.disposeListen();
    this.disposeBarge();
    this.disposeWake();
    if (this.levelTimer) clearInterval(this.levelTimer);
    this.levelTimer = null;
    this.queue = [];
    disposeProvider(this.sttCache?.provider);
    disposeProvider(this.ttsCache?.provider);
    this.sttCache = null;
    this.ttsCache = null;
    this.audioOut.clear();
    this.audioStop.clear();
  }
}

function disposeProvider(p: unknown): void {
  const d = (p as { dispose?: () => void } | undefined)?.dispose;
  if (typeof d === 'function') {
    try {
      d.call(p);
    } catch {
      /* ignora */
    }
  }
}
