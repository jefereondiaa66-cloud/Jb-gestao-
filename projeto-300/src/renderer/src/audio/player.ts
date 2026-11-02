/**
 * Toca a voz do 300: pedaços PCM float32 agendados sem lacunas num AudioContext.
 * stop() corta tudo na hora (interrupção / barge-in).
 */
import type { AudioOutMessage } from '../../../shared/ipc';
import { LevelMeter, rms, rmsToLevel } from '../lib/dsp/level';
import { PlaybackScheduler, isValidSampleRate } from '../lib/dsp/playback';

export class AudioPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private timeData: Float32Array<ArrayBuffer> | null = null;
  private readonly scheduler = new PlaybackScheduler(0.05);
  private readonly sources = new Set<AudioBufferSourceNode>();
  private readonly meter = new LevelMeter(0.5, 0.14);
  private volume = 0.9;
  private disposed = false;

  setVolume(v: number): void {
    this.volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.9;
    if (this.ctx && this.gain) this.gain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.gain = gain;
    this.analyser = analyser;
    this.timeData = new Float32Array(analyser.fftSize);
    return ctx;
  }

  enqueue(msg: AudioOutMessage): void {
    if (this.disposed) return;
    const samples = msg.samples;
    if (!(samples instanceof Float32Array) || samples.length === 0) return;
    if (!isValidSampleRate(msg.sampleRate)) return;
    const ctx = this.ensure();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    const buffer = ctx.createBuffer(1, samples.length, msg.sampleRate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.gain!);
    const slot = this.scheduler.schedule(ctx.currentTime, buffer.duration);
    src.onended = () => {
      this.sources.delete(src);
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
    };
    this.sources.add(src);
    src.start(slot.startAt);
  }

  /** Para todo o áudio imediatamente. */
  stop(): void {
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {
        /* já parado */
      }
      try {
        s.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.sources.clear();
    this.scheduler.reset();
    this.meter.reset();
  }

  get isPlaying(): boolean {
    return this.sources.size > 0 && !!this.ctx && this.scheduler.isPlaying(this.ctx.currentTime);
  }

  /** Nível de saída atual (0..1) para a animação. */
  level(): number {
    if (!this.analyser || !this.timeData || this.sources.size === 0) return this.meter.update(0);
    this.analyser.getFloatTimeDomainData(this.timeData);
    return this.meter.update(rmsToLevel(rms(this.timeData)));
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
    const ctx = this.ctx;
    this.ctx = null;
    this.gain = null;
    this.analyser = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
