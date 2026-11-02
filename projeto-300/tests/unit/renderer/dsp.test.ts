import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { Framer, MicPipeline, StreamResampler, downmix } from '../../../src/renderer/src/lib/dsp/resampler';
import { LevelMeter, decayLevel, rms, rmsToLevel } from '../../../src/renderer/src/lib/dsp/level';
import { PlaybackScheduler, isValidSampleRate, pcmDuration } from '../../../src/renderer/src/lib/dsp/playback';

function sine(freq: number, rate: number, seconds: number, amp = 0.8): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function concat(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function inBlocks(signal: Float32Array, block: number, fn: (b: Float32Array) => void): void {
  for (let i = 0; i < signal.length; i += block) fn(signal.subarray(i, Math.min(signal.length, i + block)));
}

/** Amplitude de uma frequência (correlação com seno/cosseno). */
function toneAmplitude(x: Float32Array, freq: number, rate: number): number {
  let s = 0;
  let c = 0;
  for (let i = 0; i < x.length; i++) {
    const ph = (2 * Math.PI * freq * i) / rate;
    s += x[i]! * Math.sin(ph);
    c += x[i]! * Math.cos(ph);
  }
  return (2 * Math.sqrt(s * s + c * c)) / x.length;
}

describe('StreamResampler', () => {
  it('converte 48 kHz para 16 kHz com o número esperado de amostras', () => {
    const rs = new StreamResampler(48000, 16000);
    const input = sine(440, 48000, 1);
    const chunks: Float32Array[] = [];
    inBlocks(input, 128, (b) => chunks.push(rs.process(b)));
    const out = concat(chunks);
    // atraso do filtro: algumas amostras ficam retidas até chegar mais áudio
    expect(out.length).toBeGreaterThan(16000 - 16);
    expect(out.length).toBeLessThanOrEqual(16000);
  });

  it('preserva um tom dentro da banda (1 kHz) com ganho ~1', () => {
    const rs = new StreamResampler(48000, 16000);
    const out = rs.process(sine(1000, 48000, 0.5, 0.5));
    const steady = out.subarray(200, out.length - 200);
    expect(toneAmplitude(steady, 1000, 16000)).toBeGreaterThan(0.47);
    expect(toneAmplitude(steady, 1000, 16000)).toBeLessThan(0.53);
  });

  it('remove frequências acima do Nyquist de saída (anti-aliasing)', () => {
    // 11 kHz em 48 kHz viraria 5 kHz em 16 kHz sem filtro.
    const rs = new StreamResampler(48000, 16000);
    const out = rs.process(sine(11000, 48000, 0.5, 0.8));
    const steady = out.subarray(200, out.length - 200);
    const aliased = toneAmplitude(steady, 5000, 16000);
    expect(aliased).toBeLessThan(0.8 * 0.01); // atenuação > 40 dB
    expect(rms(steady)).toBeLessThan(0.02);
  });

  it('mantém DC (ganho unitário) também em 44,1 kHz', () => {
    const rs = new StreamResampler(44100, 16000);
    const dc = new Float32Array(44100).fill(0.25);
    const out = rs.process(dc);
    const steady = out.subarray(100, out.length - 50);
    for (const v of steady) expect(v).toBeCloseTo(0.25, 4);
    expect(Math.abs(out.length - 16000)).toBeLessThan(20);
  });

  it('dá o mesmo resultado em blocos ou de uma vez', () => {
    const input = sine(700, 48000, 0.3).map((v, i) => v + 0.1 * Math.sin(i * 0.37));
    const a = new StreamResampler(48000).process(input);
    const rs = new StreamResampler(48000);
    const chunks: Float32Array[] = [];
    inBlocks(input, 128, (b) => chunks.push(rs.process(b)));
    const b = concat(chunks);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < a.length; i++) expect(b[i]).toBeCloseTo(a[i]!, 5);
  });

  it('passa direto quando as taxas são iguais', () => {
    const rs = new StreamResampler(16000, 16000);
    const x = sine(300, 16000, 0.05);
    expect(Array.from(rs.process(x))).toEqual(Array.from(x));
  });

  it('recusa taxas inválidas', () => {
    expect(() => new StreamResampler(0)).toThrow();
    expect(() => new StreamResampler(Number.NaN)).toThrow();
  });
});

describe('Framer e MicPipeline', () => {
  it('emite quadros de exatamente 512 amostras na ordem certa', () => {
    const f = new Framer(512);
    const data = Float32Array.from({ length: 1300 }, (_, i) => i);
    const frames = [...f.push(data.subarray(0, 700)), ...f.push(data.subarray(700))];
    expect(frames).toHaveLength(2);
    expect(frames.every((fr) => fr.length === 512)).toBe(true);
    expect(frames[1]![0]).toBe(512);
    expect(f.pending).toBe(1300 - 1024);
  });

  it('pipeline 48 kHz estéreo -> quadros de 512 em 16 kHz', () => {
    const p = new MicPipeline(48000);
    const left = sine(500, 48000, 1);
    const right = sine(500, 48000, 1);
    const frames: Float32Array[] = [];
    for (let i = 0; i < left.length; i += 128) frames.push(...p.process([left.subarray(i, i + 128), right.subarray(i, i + 128)]));
    expect(frames.length).toBe(Math.floor(16000 / 512) - 0);
    for (const fr of frames) expect(fr.length).toBe(512);
  });

  it('downmix faz a média dos canais', () => {
    const m = downmix([Float32Array.of(1, 0.5), Float32Array.of(0, -0.5)]);
    expect(Array.from(m)).toEqual([0.5, 0]);
  });
});

describe('public/mic-worklet.js', () => {
  function loadWorklet(rate: number) {
    const src = readFileSync(resolve(__dirname, '../../../src/renderer/public/mic-worklet.js'), 'utf8');
    const posted: Float32Array[] = [];
    let Proc: (new () => { process(inputs: Float32Array[][]): boolean; port: { onmessage: ((e: { data: unknown }) => void) | null } }) | null = null;
    class FakeProcessor {
      port = {
        onmessage: null as ((e: { data: unknown }) => void) | null,
        postMessage: (m: Float32Array) => posted.push(m),
      };
    }
    const ctx = vm.createContext({
      sampleRate: rate,
      AudioWorkletProcessor: FakeProcessor,
      registerProcessor: (name: string, cls: typeof Proc) => {
        expect(name).toBe('mic-capture-300');
        Proc = cls;
      },
      Float32Array,
      Math,
    });
    vm.runInContext(src, ctx);
    expect(Proc).not.toBeNull();
    return { proc: new Proc!(), posted };
  }

  it('produz os mesmos quadros que o módulo TypeScript', () => {
    const { proc, posted } = loadWorklet(48000);
    const input = sine(1234, 48000, 0.6).map((v, i) => v * 0.7 + 0.05 * Math.sin(i * 0.011));
    const ref = new MicPipeline(48000);
    const expected: Float32Array[] = [];
    for (let i = 0; i < input.length; i += 128) {
      const block = input.slice(i, i + 128);
      expect(proc.process([[block]])).toBe(true);
      expected.push(...ref.process(block));
    }
    expect(posted.length).toBe(expected.length);
    expect(posted.length).toBeGreaterThan(15);
    for (let f = 0; f < posted.length; f++) {
      expect(posted[f]!.length).toBe(512);
      for (let i = 0; i < 512; i += 7) expect(posted[f]![i]).toBeCloseTo(expected[f]![i]!, 5);
    }
  });

  it('mistura estéreo e para quando recebe stop', () => {
    const { proc, posted } = loadWorklet(44100);
    const l = new Float32Array(128).fill(0.4);
    const r = new Float32Array(128).fill(0.2);
    for (let i = 0; i < 400; i++) proc.process([[l, r]]);
    expect(posted.length).toBeGreaterThan(0);
    expect(posted[posted.length - 1]![300]).toBeCloseTo(0.3, 4);
    proc.port.onmessage?.({ data: { type: 'stop' } });
    expect(proc.process([[l, r]])).toBe(false);
  });

  it('ignora entrada vazia sem travar', () => {
    const { proc, posted } = loadWorklet(48000);
    expect(proc.process([])).toBe(true);
    expect(proc.process([[]])).toBe(true);
    expect(posted).toHaveLength(0);
  });
});

describe('nível de áudio', () => {
  it('rms e escala em dB', () => {
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(Float32Array.of(0.5, -0.5))).toBeCloseTo(0.5);
    expect(rmsToLevel(0)).toBe(0);
    expect(rmsToLevel(1e-5)).toBe(0);
    expect(rmsToLevel(1)).toBe(1);
    const mid = rmsToLevel(Math.pow(10, -36 / 20));
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('LevelMeter sobe rápido e desce devagar', () => {
    const m = new LevelMeter(0.5, 0.1);
    m.update(1);
    const up = m.value;
    expect(up).toBeCloseTo(0.5);
    m.update(0);
    expect(m.value).toBeCloseTo(0.45);
    m.update(Number.NaN);
    expect(m.value).toBeLessThan(0.45);
    m.reset();
    expect(m.value).toBe(0);
  });

  it('decayLevel reduz pela meia-vida', () => {
    expect(decayLevel(0.8, 0.18, 0.18)).toBeCloseTo(0.4);
    expect(decayLevel(0.8, 0)).toBe(0.8);
    expect(decayLevel(-1, 1)).toBe(0);
  });
});

describe('PlaybackScheduler', () => {
  it('agenda pedaços em sequência sem lacunas', () => {
    const s = new PlaybackScheduler(0.05);
    const a = s.schedule(10, 0.5);
    expect(a.startAt).toBeCloseTo(10.05);
    expect(a.restarted).toBe(true);
    const b = s.schedule(10.1, 0.25);
    expect(b.startAt).toBeCloseTo(a.endAt);
    expect(b.restarted).toBe(false);
    const c = s.schedule(10.3, 1);
    expect(c.startAt).toBeCloseTo(10.8);
    expect(s.remaining(10.8)).toBeCloseTo(1);
    expect(s.isPlaying(11)).toBe(true);
  });

  it('recomeça com folga depois que a fila esvazia', () => {
    const s = new PlaybackScheduler(0.04);
    s.schedule(0, 0.2);
    const late = s.schedule(5, 0.2);
    expect(late.restarted).toBe(true);
    expect(late.startAt).toBeCloseTo(5.04);
  });

  it('reset esquece o que estava agendado (interrupção)', () => {
    const s = new PlaybackScheduler(0.04);
    s.schedule(1, 10);
    s.reset();
    expect(s.isPlaying(1.5)).toBe(false);
    expect(s.schedule(1.5, 1).startAt).toBeCloseTo(1.54);
  });

  it('duração e validação de taxa', () => {
    expect(pcmDuration(24000, 24000)).toBe(1);
    expect(pcmDuration(100, 0)).toBe(0);
    expect(isValidSampleRate(22050)).toBe(true);
    expect(isValidSampleRate(10)).toBe(false);
  });
});
