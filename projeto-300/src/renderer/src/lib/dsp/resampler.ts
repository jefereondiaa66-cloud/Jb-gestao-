/**
 * Reamostragem em fluxo (ex.: 48 kHz -> 16 kHz) com filtro anti-aliasing.
 *
 * Usa interpolação por sinc janelado (Blackman): cada amostra de saída é a
 * soma ponderada das amostras de entrada vizinhas, com corte abaixo da metade
 * da taxa de saída. Assim frequências que "dobrariam" (aliasing) são removidas.
 *
 * O mesmo algoritmo está em public/mic-worklet.js (o worklet não pode importar
 * módulos do bundle). Os testes conferem que os dois produzem o mesmo resultado.
 */

export const TARGET_RATE = 16000;
export const FRAME_SIZE = 512;

/** Pontos da tabela do núcleo por amostra de entrada. */
const TABLE_RES = 64;

export class StreamResampler {
  readonly inRate: number;
  readonly outRate: number;
  /** Amostras de entrada avançadas por amostra de saída. */
  private readonly step: number;
  /** Meia largura do núcleo, em amostras de entrada. */
  private readonly half: number;
  private readonly table: Float32Array;
  private readonly bypass: boolean;
  private buf: Float32Array;
  private len = 0;
  private pos = 0;

  constructor(inRate: number, outRate: number = TARGET_RATE, quality = 8) {
    if (!Number.isFinite(inRate) || inRate <= 0) throw new Error('taxa de entrada inválida');
    if (!Number.isFinite(outRate) || outRate <= 0) throw new Error('taxa de saída inválida');
    this.inRate = inRate;
    this.outRate = outRate;
    this.step = inRate / outRate;
    this.bypass = inRate === outRate;
    const ratio = Math.max(1, this.step);
    this.half = Math.max(4, Math.ceil(quality * ratio));
    // Corte em 90% do Nyquist da taxa menor (ciclos por amostra de entrada).
    const fc = (0.5 / ratio) * 0.9;
    this.table = buildKernel(this.half, fc);
    this.buf = new Float32Array(4096);
    this.reset();
  }

  /** Atraso do filtro em amostras de entrada. */
  get latencySamples(): number {
    return this.bypass ? 0 : this.half;
  }

  reset(): void {
    // Histórico inicial de zeros: a primeira saída fica centrada na primeira amostra real.
    this.buf.fill(0);
    this.len = this.bypass ? 0 : this.half;
    this.pos = this.bypass ? 0 : this.half;
  }

  /** Processa um bloco e devolve as amostras de saída produzidas (nova matriz). */
  process(input: Float32Array): Float32Array {
    if (this.bypass) return input.slice();
    this.append(input);
    const half = this.half;
    const step = this.step;
    const table = this.table;
    const buf = this.buf;
    const maxOut = Math.max(0, Math.ceil((this.len - this.pos) / step) + 1);
    const out = new Float32Array(maxOut);
    let n = 0;
    let pos = this.pos;
    while (Math.floor(pos) + half < this.len) {
      const base = Math.floor(pos);
      const frac = pos - base;
      let acc = 0;
      let wsum = 0;
      for (let k = -half + 1; k <= half; k++) {
        const a = Math.abs(k - frac);
        if (a >= half) continue;
        const x = a * TABLE_RES;
        const i = x | 0;
        const w = table[i]! + (table[i + 1]! - table[i]!) * (x - i);
        acc += buf[base + k]! * w;
        wsum += w;
      }
      out[n++] = wsum !== 0 ? acc / wsum : 0;
      pos += step;
    }
    // Descarta o que não será mais usado (mantém o histórico necessário).
    const keepFrom = Math.floor(pos) - half + 1;
    if (keepFrom > 0) {
      buf.copyWithin(0, keepFrom, this.len);
      this.len -= keepFrom;
      pos -= keepFrom;
    }
    this.pos = pos;
    return n === out.length ? out : out.slice(0, n);
  }

  private append(input: Float32Array): void {
    const need = this.len + input.length;
    if (need > this.buf.length) {
      let size = this.buf.length;
      while (size < need) size *= 2;
      const grown = new Float32Array(size);
      grown.set(this.buf.subarray(0, this.len));
      this.buf = grown;
    }
    this.buf.set(input, this.len);
    this.len = need;
  }
}

/** Núcleo sinc janelado (Blackman) tabelado para t em [0, half]. */
export function buildKernel(half: number, fc: number): Float32Array {
  const size = half * TABLE_RES + 2;
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / TABLE_RES;
    if (t >= half) {
      table[i] = 0;
      continue;
    }
    const x = 2 * fc * t;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    const r = t / half; // 0..1
    const win = 0.42 + 0.5 * Math.cos(Math.PI * r) + 0.08 * Math.cos(2 * Math.PI * r);
    table[i] = 2 * fc * sinc * win;
  }
  return table;
}

/** Junta amostras em quadros de tamanho fixo. */
export class Framer {
  readonly size: number;
  private frame: Float32Array;
  private fill = 0;

  constructor(size: number = FRAME_SIZE) {
    if (!Number.isInteger(size) || size <= 0) throw new Error('tamanho de quadro inválido');
    this.size = size;
    this.frame = new Float32Array(size);
  }

  get pending(): number {
    return this.fill;
  }

  push(samples: Float32Array): Float32Array[] {
    const frames: Float32Array[] = [];
    for (let i = 0; i < samples.length; i++) {
      this.frame[this.fill++] = samples[i]!;
      if (this.fill === this.size) {
        frames.push(this.frame);
        this.frame = new Float32Array(this.size);
        this.fill = 0;
      }
    }
    return frames;
  }

  reset(): void {
    this.frame = new Float32Array(this.size);
    this.fill = 0;
  }
}

/** Mistura canais para mono (média). */
export function downmix(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0]!;
  const len = channels[0]!.length;
  const out = new Float32Array(len);
  for (const ch of channels) for (let i = 0; i < len; i++) out[i] += ch[i] ?? 0;
  const k = 1 / channels.length;
  for (let i = 0; i < len; i++) out[i] *= k;
  return out;
}

/** Cadeia completa do microfone: mono -> 16 kHz -> quadros de 512 amostras. */
export class MicPipeline {
  private readonly resampler: StreamResampler;
  private readonly framer: Framer;

  constructor(inRate: number, outRate: number = TARGET_RATE, frameSize: number = FRAME_SIZE) {
    this.resampler = new StreamResampler(inRate, outRate);
    this.framer = new Framer(frameSize);
  }

  process(channels: Float32Array[] | Float32Array): Float32Array[] {
    const mono = Array.isArray(channels) ? downmix(channels) : channels;
    return this.framer.push(this.resampler.process(mono));
  }

  reset(): void {
    this.resampler.reset();
    this.framer.reset();
  }
}
