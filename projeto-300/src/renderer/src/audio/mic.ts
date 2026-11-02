/**
 * Captura do microfone: getUserMedia -> AudioWorklet (16 kHz, quadros de 512)
 * -> callback. O microfone só fica aberto enquanto start() estiver valendo.
 */
import { LevelMeter } from '../lib/dsp/level';
import { FRAME_SIZE } from '../lib/dsp/resampler';

export interface MicCallbacks {
  onFrame(frame: Float32Array): void;
  /** O microfone fechou sozinho (dispositivo removido, permissão revogada...). */
  onEnded(reason: string): void;
}

export const MIC_CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  video: false,
};

/** Mensagem pt-BR para falhas do microfone. */
export function micErrorMessage(err: unknown): string {
  const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'O acesso ao microfone foi negado. No Windows, veja Configurações > Privacidade e segurança > Microfone.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Nenhum microfone foi encontrado. Conecte um microfone e tente de novo.';
    case 'NotReadableError':
    case 'AbortError':
      return 'O microfone está em uso por outro programa ou não respondeu.';
    default:
      return err instanceof Error && err.message ? `Não foi possível abrir o microfone: ${err.message}` : 'Não foi possível abrir o microfone.';
  }
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;
  private readonly meter = new LevelMeter(0.6, 0.15);
  private generation = 0;
  private starting: Promise<void> | null = null;
  private startingGen = -1;

  constructor(private readonly cb: MicCallbacks) {}

  /** Microfone aberto de fato (fluxo ativo). */
  get isOpen(): boolean {
    return this.stream !== null;
  }

  /** Nível atual (0..1) suavizado. */
  get level(): number {
    return this.meter.value;
  }

  start(): Promise<void> {
    if (this.stream) return Promise.resolve();
    // abertura em andamento ainda válida: reaproveita
    if (this.starting && this.startingGen === this.generation) return this.starting;
    const gen = ++this.generation;
    const p: Promise<void> = this.open(gen).finally(() => {
      if (this.starting === p) this.starting = null;
    });
    this.starting = p;
    this.startingGen = gen;
    return p;
  }

  private async open(gen: number): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este sistema não oferece acesso ao microfone.');
    const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
    if (gen !== this.generation) {
      // stop() foi chamado enquanto abria
      for (const t of stream.getTracks()) t.stop();
      return;
    }
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      await ctx.audioWorklet.addModule(new URL('mic-worklet.js', document.baseURI).href);
      if (gen !== this.generation) throw new Error('cancelado');
      const source = ctx.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(ctx, 'mic-capture-300', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: 1, channelCountMode: 'explicit' });
      // saída muda: garante que o processador seja executado
      const sink = ctx.createGain();
      sink.gain.value = 0;
      node.port.onmessage = (e: MessageEvent) => {
        const frame = e.data;
        if (!(frame instanceof Float32Array) || frame.length !== FRAME_SIZE) return;
        this.meter.updateFromSamples(frame);
        this.cb.onFrame(frame);
      };
      source.connect(node);
      node.connect(sink);
      sink.connect(ctx.destination);
      if (ctx.state === 'suspended') await ctx.resume();
      for (const track of stream.getAudioTracks()) {
        track.addEventListener('ended', () => {
          if (this.stream === stream) {
            void this.stop();
            this.cb.onEnded('O microfone foi desconectado.');
          }
        });
      }
      this.stream = stream;
      this.ctx = ctx;
      this.node = node;
      this.source = source;
      this.sink = sink;
    } catch (err) {
      for (const t of stream.getTracks()) t.stop();
      if (ctx) void ctx.close().catch(() => undefined);
      if (gen !== this.generation) return;
      throw err;
    }
  }

  async stop(): Promise<void> {
    this.generation++;
    const { stream, ctx, node, source, sink } = this;
    this.stream = null;
    this.ctx = null;
    this.node = null;
    this.source = null;
    this.sink = null;
    this.meter.reset();
    try {
      node?.port.postMessage({ type: 'stop' });
      node && (node.port.onmessage = null);
      source?.disconnect();
      node?.disconnect();
      sink?.disconnect();
    } catch {
      /* já desconectado */
    }
    if (stream) for (const t of stream.getTracks()) t.stop();
    if (ctx) await ctx.close().catch(() => undefined);
  }
}
