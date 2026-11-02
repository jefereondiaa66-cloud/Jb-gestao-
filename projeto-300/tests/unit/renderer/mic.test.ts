/**
 * MicCapture com dublês (somente teste) de getUserMedia, AudioContext e
 * AudioWorkletNode. Foco: o microfone nunca fica aberto depois de stop(),
 * mesmo quando stop() chega no meio da abertura.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MicCapture } from '../../../src/renderer/src/audio/mic';

class FakeTrack {
  stopped = false;
  private listeners: Record<string, (() => void)[]> = {};
  stop(): void {
    this.stopped = true;
  }
  addEventListener(type: string, fn: () => void): void {
    (this.listeners[type] ??= []).push(fn);
  }
  fire(type: string): void {
    for (const fn of this.listeners[type] ?? []) fn();
  }
}

class FakeStream {
  readonly track = new FakeTrack();
  getTracks(): FakeTrack[] {
    return [this.track];
  }
  getAudioTracks(): FakeTrack[] {
    return [this.track];
  }
}

const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

let resumeGate: { promise: Promise<void>; resolve: () => void } | null = null;
const contexts: FakeContext[] = [];
const workletNodes: FakeWorkletNode[] = [];

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  closed = false;
  destination = {};
  audioWorklet = { addModule: vi.fn(async () => undefined) };
  constructor() {
    contexts.push(this);
  }
  createMediaStreamSource() {
    return node();
  }
  createGain() {
    return { ...node(), gain: { value: 1 } };
  }
  resume(): Promise<void> {
    if (resumeGate) return resumeGate.promise.then(() => void (this.state = 'running'));
    this.state = 'running';
    return Promise.resolve();
  }
  async close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
  }
}

class FakeWorkletNode {
  port = { onmessage: null as ((e: { data: unknown }) => void) | null, postMessage: vi.fn() };
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    workletNodes.push(this);
  }
  emit(data: unknown): void {
    this.port.onmessage?.({ data });
  }
}

let streams: FakeStream[] = [];

function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  streams = [];
  contexts.length = 0;
  workletNodes.length = 0;
  resumeGate = null;
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        const s = new FakeStream();
        streams.push(s);
        return s;
      }),
    },
  });
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
  vi.stubGlobal('document', { baseURI: 'http://localhost/' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('MicCapture', () => {
  it('abre, repassa só quadros de 512 amostras e fecha tudo no stop', async () => {
    const frames: Float32Array[] = [];
    const mic = new MicCapture({ onFrame: (f) => frames.push(f), onEnded: () => undefined });
    await mic.start();
    expect(mic.isOpen).toBe(true);
    workletNodes[0]!.emit(new Float32Array(512).fill(0.1));
    workletNodes[0]!.emit(new Float32Array(100));
    workletNodes[0]!.emit('lixo');
    expect(frames).toHaveLength(1);
    expect(mic.level).toBeGreaterThan(0);
    await mic.stop();
    expect(mic.isOpen).toBe(false);
    expect(streams[0]!.track.stopped).toBe(true);
    expect(contexts[0]!.closed).toBe(true);
    workletNodes[0]!.emit(new Float32Array(512));
    expect(frames).toHaveLength(1);
  });

  it('stop() durante a liberação do áudio não deixa o microfone aberto', async () => {
    resumeGate = gate();
    const frames: Float32Array[] = [];
    const mic = new MicCapture({ onFrame: (f) => frames.push(f), onEnded: () => undefined });
    const opening = mic.start();
    // espera chegar no ctx.resume() pendente
    for (let i = 0; i < 10 && contexts.length === 0; i++) await flush();
    await flush();
    expect(contexts).toHaveLength(1);
    await mic.stop();
    // fecha o fluxo na hora, sem esperar o resume
    expect(streams[0]!.track.stopped).toBe(true);
    expect(contexts[0]!.closed).toBe(true);
    // quadros que ainda chegarem do processador antigo são descartados
    workletNodes[0]?.emit(new Float32Array(512));
    resumeGate.resolve();
    await opening;
    expect(mic.isOpen).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it('stop() resolve mesmo se a liberação do áudio nunca terminar', async () => {
    resumeGate = gate(); // nunca resolvido
    const mic = new MicCapture({ onFrame: () => undefined, onEnded: () => undefined });
    void mic.start();
    for (let i = 0; i < 10 && contexts.length === 0; i++) await flush();
    await flush();
    await mic.stop();
    expect(streams[0]!.track.stopped).toBe(true);
    expect(mic.isOpen).toBe(false);
  });

  it('stop() antes de o getUserMedia responder descarta o fluxo', async () => {
    const mic = new MicCapture({ onFrame: () => undefined, onEnded: () => undefined });
    const opening = mic.start();
    await mic.stop();
    await opening;
    expect(mic.isOpen).toBe(false);
    expect(streams[0]!.track.stopped).toBe(true);
  });

  it('dispositivo removido avisa e fecha', async () => {
    const ended: string[] = [];
    const mic = new MicCapture({ onFrame: () => undefined, onEnded: (r) => ended.push(r) });
    await mic.start();
    streams[0]!.track.fire('ended');
    expect(ended).toHaveLength(1);
    expect(mic.isOpen).toBe(false);
  });

  it('nova abertura depois de um stop funciona', async () => {
    const mic = new MicCapture({ onFrame: () => undefined, onEnded: () => undefined });
    await mic.start();
    await mic.stop();
    await mic.start();
    expect(mic.isOpen).toBe(true);
    expect(streams).toHaveLength(2);
    expect(streams[1]!.track.stopped).toBe(false);
    await mic.stop();
  });
});
