/**
 * Funções puras de áudio (sem dependências nativas): reamostragem, quadros,
 * nível, WAV, conversões PCM e o "plim" de confirmação da palavra de ativação.
 * Todo áudio interno é mono float32 em [-1, 1].
 */
import type { AudioChunk } from '../types';
import { VoiceError } from './errors';

/** Taxa usada por VAD, ativação e reconhecimento de fala. */
export const SAMPLE_RATE = 16000;
/** Tamanho de quadro do Silero VAD a 16 kHz (32 ms). */
export const FRAME_SIZE = 512;

/* ======================================================================
 * Reamostragem (sinc com janela de Blackman, tabela polifásica)
 * ==================================================================== */
const gcd = (a: number, b: number): number => {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) [x, y] = [y, x % y];
  return x;
};

function blackman(u: number): number {
  // u em [-1, 1]
  if (u <= -1 || u >= 1) return 0;
  return 0.42 + 0.5 * Math.cos(Math.PI * u) + 0.08 * Math.cos(2 * Math.PI * u);
}

function sinc(x: number): number {
  if (x === 0) return 1;
  const px = Math.PI * x;
  return Math.sin(px) / px;
}

function validRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= 1000 && rate <= 384000 && Math.round(rate) === rate;
}

export interface ResampleOptions {
  /** Meia largura do filtro em cruzamentos de zero (padrão 16: boa qualidade). */
  zeroCrossings?: number;
}

/**
 * Reamostra áudio mono. Usa sinc com janela (passa-baixa automático na
 * redução de taxa, evitando serrilhado). Taxas inteiras entre 1 kHz e 384 kHz.
 */
export function resample(input: Float32Array, fromRate: number, toRate: number, opts: ResampleOptions = {}): Float32Array {
  if (!validRate(fromRate) || !validRate(toRate)) {
    throw new VoiceError('audio_invalido', `Taxa de amostragem inválida (${fromRate} → ${toRate}).`);
  }
  if (input.length === 0) return new Float32Array(0);
  if (fromRate === toRate) return input.slice();

  const g = gcd(fromRate, toRate);
  const up = toRate / g; // fases distintas
  const down = fromRate / g;
  const ratio = toRate / fromRate;
  const outLen = Math.max(1, Math.floor((input.length * up) / down));
  const cutoff = Math.min(1, ratio) * 0.95; // fração do Nyquist da entrada
  const zc = Math.max(4, Math.min(64, opts.zeroCrossings ?? 16));
  const halfWidth = zc / cutoff; // em amostras de entrada
  const taps = Math.ceil(halfWidth) * 2 + 1;
  const out = new Float32Array(outLen);
  const n = input.length;

  const usePolyphase = up <= 2048;
  let table: Float32Array | null = null;
  if (usePolyphase) {
    // tabela[fase][k]: peso da amostra (base - meio + k) para a fração fase/up
    const half = Math.ceil(halfWidth);
    table = new Float32Array(up * taps);
    for (let p = 0; p < up; p++) {
      const frac = p / up;
      let sum = 0;
      for (let k = 0; k < taps; k++) {
        const d = frac - (k - half); // distância t - j
        const w = sinc(d * cutoff) * blackman(d / halfWidth);
        table[p * taps + k] = w;
        sum += w;
      }
      if (sum !== 0) for (let k = 0; k < taps; k++) table[p * taps + k]! /= sum;
    }
    for (let i = 0; i < outLen; i++) {
      const pos = i * down; // posição em unidades de 1/up amostras
      const base = Math.floor(pos / up);
      const phase = pos - base * up;
      const row = phase * taps;
      const start = base - half;
      let acc = 0;
      for (let k = 0; k < taps; k++) {
        const j = start + k;
        if (j < 0 || j >= n) continue;
        acc += input[j]! * table[row + k]!;
      }
      out[i] = acc;
    }
    return out;
  }

  // Razões "estranhas": calcula os pesos na hora.
  for (let i = 0; i < outLen; i++) {
    const t = i / ratio;
    const a = Math.ceil(t - halfWidth);
    const b = Math.floor(t + halfWidth);
    let acc = 0;
    let sum = 0;
    for (let j = a; j <= b; j++) {
      const d = t - j;
      const w = sinc(d * cutoff) * blackman(d / halfWidth);
      sum += w;
      if (j >= 0 && j < n) acc += input[j]! * w;
    }
    out[i] = sum !== 0 ? acc / sum : 0;
  }
  return out;
}

/** Converte qualquer trecho para 16 kHz mono (o formato do VAD e do NeMo). */
export function toSampleRate(chunk: AudioChunk, rate = SAMPLE_RATE): Float32Array {
  return chunk.sampleRate === rate ? chunk.samples : resample(chunk.samples, chunk.sampleRate, rate);
}

/* ======================================================================
 * Quadros, concatenação, duração, nível
 * ==================================================================== */

/** Junta quadros de tamanho qualquer em quadros fixos (padrão 512 amostras). */
export class FrameSplitter {
  private buf: Float32Array;
  private fill = 0;

  constructor(readonly frameSize = FRAME_SIZE) {
    if (!Number.isInteger(frameSize) || frameSize < 1) throw new VoiceError('audio_invalido', 'Tamanho de quadro inválido.');
    this.buf = new Float32Array(frameSize);
  }

  /** Devolve os quadros completos (cópias) e guarda o resto para a próxima vez. */
  push(samples: Float32Array): Float32Array[] {
    const frames: Float32Array[] = [];
    let off = 0;
    while (off < samples.length) {
      const take = Math.min(this.frameSize - this.fill, samples.length - off);
      this.buf.set(samples.subarray(off, off + take), this.fill);
      this.fill += take;
      off += take;
      if (this.fill === this.frameSize) {
        frames.push(this.buf);
        this.buf = new Float32Array(this.frameSize);
        this.fill = 0;
      }
    }
    return frames;
  }

  /** Amostras guardadas que ainda não formam um quadro. */
  get pending(): number {
    return this.fill;
  }

  /** Completa o último quadro com silêncio (ou devolve null se vazio). */
  flush(): Float32Array | null {
    if (this.fill === 0) return null;
    const out = this.buf;
    out.fill(0, this.fill);
    this.buf = new Float32Array(this.frameSize);
    this.fill = 0;
    return out;
  }

  reset(): void {
    this.fill = 0;
  }
}

/** Divide um áudio em quadros fixos (o último é completado com zeros). */
export function splitFrames(samples: Float32Array, frameSize = FRAME_SIZE): Float32Array[] {
  const s = new FrameSplitter(frameSize);
  const frames = s.push(samples);
  const last = s.flush();
  if (last) frames.push(last);
  return frames;
}

export function concatFloat32(parts: readonly Float32Array[]): Float32Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

export function durationMs(samples: number | Float32Array, sampleRate: number): number {
  const n = typeof samples === 'number' ? samples : samples.length;
  return sampleRate > 0 ? (n * 1000) / sampleRate : 0;
}

export function silence(ms: number, sampleRate = SAMPLE_RATE): Float32Array {
  return new Float32Array(Math.max(0, Math.round((ms * sampleRate) / 1000)));
}

/** Valor RMS (ignora NaN/infinito, que viram 0). */
export function rms(samples: Float32Array, start = 0, end = samples.length): number {
  const a = Math.max(0, start);
  const b = Math.min(samples.length, end);
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) {
    const v = samples[i]!;
    if (Number.isFinite(v)) sum += v * v;
  }
  return Math.sqrt(sum / (b - a));
}

export function peak(samples: Float32Array): number {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.abs(samples[i]!);
    if (Number.isFinite(v) && v > p) p = v;
  }
  return p;
}

/** RMS -> nível 0..1 em escala de decibéis (-60 dB = 0, 0 dB = 1). */
export function rmsToLevel(value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) return 0;
  const db = 20 * Math.log10(value);
  return Math.min(1, Math.max(0, (db + 60) / 60));
}

export function levelOf(samples: Float32Array): number {
  return rmsToLevel(rms(samples));
}

/** Troca NaN/infinito por 0 e limita a [-1, 1] (protege contra áudio corrompido). */
export function sanitize(samples: Float32Array): Float32Array {
  let clean = true;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    if (!Number.isFinite(v) || v > 1 || v < -1) {
      clean = false;
      break;
    }
  }
  if (clean) return samples;
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    out[i] = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  }
  return out;
}

/* ======================================================================
 * Conversões PCM
 * ==================================================================== */
export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    const c = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
    out[i] = c < 0 ? Math.round(c * 0x8000) : Math.round(c * 0x7fff);
  }
  return out;
}

export function int16ToFloat(samples: Int16Array): Float32Array {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i]! / 0x8000;
  return out;
}

/** Bytes PCM 16 bits little-endian -> float32 (qualquer alinhamento de memória). */
export function pcm16leToFloat(bytes: Uint8Array): Float32Array {
  const n = bytes.length >> 1;
  const out = new Float32Array(n);
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

/** float32 -> bytes PCM 16 bits little-endian. */
export function floatToPcm16le(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  const ints = floatToInt16(samples);
  for (let i = 0; i < ints.length; i++) view.setInt16(i * 2, ints[i]!, true);
  return out;
}

/**
 * Decodificador incremental de PCM16 em pedaços de rede: guarda o byte
 * ímpar que sobrar entre um pedaço e outro.
 */
export class Pcm16Decoder {
  private carry: number | null = null;

  push(chunk: Uint8Array): Float32Array {
    if (chunk.length === 0) return new Float32Array(0);
    let bytes = chunk;
    if (this.carry !== null) {
      const merged = new Uint8Array(chunk.length + 1);
      merged[0] = this.carry;
      merged.set(chunk, 1);
      bytes = merged;
      this.carry = null;
    }
    if (bytes.length % 2 === 1) {
      this.carry = bytes[bytes.length - 1]!;
      bytes = bytes.subarray(0, bytes.length - 1);
    }
    return pcm16leToFloat(bytes);
  }

  /** Há um byte solto esperando o par? */
  get hasCarry(): boolean {
    return this.carry !== null;
  }
}

/* ======================================================================
 * WAV
 * ==================================================================== */
export type WavFormat = 'pcm16' | 'float32';

export function encodeWav(samples: Float32Array, sampleRate: number, format: WavFormat = 'pcm16'): Uint8Array {
  if (!validRate(sampleRate)) throw new VoiceError('audio_invalido', `Taxa de amostragem inválida (${sampleRate}).`);
  const bytesPerSample = format === 'pcm16' ? 2 : 4;
  const dataSize = samples.length * bytesPerSample;
  const buf = new Uint8Array(44 + dataSize);
  const v = new DataView(buf.buffer);
  const ascii = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) buf[off + i] = s.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, format === 'pcm16' ? 1 : 3, true);
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * bytesPerSample, true);
  v.setUint16(32, bytesPerSample, true);
  v.setUint16(34, bytesPerSample * 8, true);
  ascii(36, 'data');
  v.setUint32(40, dataSize, true);
  if (format === 'pcm16') {
    buf.set(floatToPcm16le(samples), 44);
  } else {
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      v.setFloat32(44 + i * 4, Number.isFinite(s) ? s : 0, true);
    }
  }
  return buf;
}

export interface DecodedWav {
  samples: Float32Array; // mono (média dos canais)
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  format: 'pcm' | 'float';
}

/** Lê WAV PCM (8/16/24/32 bits) ou float (32/64 bits), inclusive WAVE_FORMAT_EXTENSIBLE. */
export function decodeWav(input: Uint8Array): DecodedWav {
  const bad = (why: string) => new VoiceError('audio_invalido', `Arquivo WAV inválido: ${why}.`);
  if (input.length < 12) throw bad('muito curto');
  const v = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const tag = (off: number) => String.fromCharCode(input[off]!, input[off + 1]!, input[off + 2]!, input[off + 3]!);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw bad('cabeçalho RIFF/WAVE ausente');

  let off = 12;
  let fmt: { code: number; channels: number; rate: number; bits: number; align: number } | null = null;
  let data: Uint8Array | null = null;
  while (off + 8 <= input.length) {
    const id = tag(off);
    const size = v.getUint32(off + 4, true);
    const body = off + 8;
    const avail = Math.min(size, input.length - body);
    if (id === 'fmt ') {
      if (avail < 16) throw bad('bloco fmt curto');
      let code = v.getUint16(body, true);
      const channels = v.getUint16(body + 2, true);
      const rate = v.getUint32(body + 4, true);
      const align = v.getUint16(body + 12, true);
      const bits = v.getUint16(body + 14, true);
      if (code === 0xfffe && avail >= 26) code = v.getUint16(body + 24, true); // subformato
      fmt = { code, channels, rate, bits, align };
    } else if (id === 'data') {
      data = input.subarray(body, body + avail);
      if (fmt) break;
    }
    if (size === 0xffffffff) break; // tamanho desconhecido (gravação em andamento)
    off = body + size + (size % 2); // blocos têm alinhamento par
  }
  if (!fmt) throw bad('bloco fmt ausente');
  if (!data) throw bad('bloco data ausente');
  const { code, channels, rate, bits } = fmt;
  if (channels < 1 || channels > 16) throw bad('número de canais');
  if (!(rate > 0)) throw bad('taxa de amostragem');
  const bytes = bits / 8;
  if (!Number.isInteger(bytes) || bytes < 1) throw bad('bits por amostra');
  const frameBytes = bytes * channels;
  const frames = Math.floor(data.length / frameBytes);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out = new Float32Array(frames);
  const read = (pos: number): number => {
    if (code === 3) {
      if (bits === 32) return dv.getFloat32(pos, true);
      if (bits === 64) return dv.getFloat64(pos, true);
      throw bad('float com bits não suportados');
    }
    if (code !== 1) throw bad(`formato ${code} não suportado (use PCM ou float)`);
    switch (bits) {
      case 8:
        return (dv.getUint8(pos) - 128) / 128;
      case 16:
        return dv.getInt16(pos, true) / 0x8000;
      case 24: {
        const b0 = dv.getUint8(pos);
        const b1 = dv.getUint8(pos + 1);
        const b2 = dv.getInt8(pos + 2);
        return ((b2 << 16) | (b1 << 8) | b0) / 0x800000;
      }
      case 32:
        return dv.getInt32(pos, true) / 0x80000000;
      default:
        throw bad('bits por amostra não suportados');
    }
  };
  for (let f = 0; f < frames; f++) {
    let acc = 0;
    for (let c = 0; c < channels; c++) acc += read(f * frameBytes + c * bytes);
    const s = acc / channels;
    out[f] = Number.isFinite(s) ? s : 0;
  }
  return { samples: out, sampleRate: rate, channels, bitsPerSample: bits, format: code === 3 ? 'float' : 'pcm' };
}

/* ======================================================================
 * Sons sintéticos
 * ==================================================================== */
export interface ChimeOptions {
  sampleRate?: number;
  /** Frequências das duas notas (padrão: mi e si, um intervalo de quinta). */
  frequencies?: [number, number];
  /** Volume de pico (0..1). */
  volume?: number;
  /** Duração de cada nota em ms. */
  noteMs?: number;
}

/** "Plim" curto de duas notas com envelope suave (confirma que o 300 ouviu). */
export function generateChime(opts: ChimeOptions = {}): Float32Array {
  const rate = opts.sampleRate ?? 24000;
  const [f1, f2] = opts.frequencies ?? [659.25, 987.77];
  const volume = Math.max(0, Math.min(1, opts.volume ?? 0.28));
  const noteMs = Math.max(40, opts.noteMs ?? 120);
  const noteLen = Math.round((noteMs * rate) / 1000);
  const gap = Math.round(noteLen * 0.65); // a 2ª nota começa antes da 1ª acabar
  const tail = Math.round(0.08 * rate);
  const total = gap + noteLen + tail;
  const out = new Float32Array(total);
  const attack = Math.round(0.008 * rate);
  const tone = (start: number, freq: number, gain: number) => {
    const len = noteLen + tail;
    for (let i = 0; i < len && start + i < total; i++) {
      const t = i / rate;
      const env = i < attack ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attack) : Math.exp(-(i - attack) / (0.055 * rate));
      // fundamental + um pouco de harmônico para soar como "sino"
      const s = Math.sin(2 * Math.PI * freq * t) + 0.18 * Math.sin(4 * Math.PI * freq * t);
      out[start + i]! += (gain * env * s) / 1.18;
    }
  };
  tone(0, f1, volume * 0.85);
  tone(gap, f2, volume);
  // fade-out final para não estalar
  const fade = Math.min(Math.round(0.01 * rate), total);
  for (let i = 0; i < fade; i++) out[total - 1 - i]! *= i / fade;
  return out;
}

/** Onda senoidal simples (útil para testes e calibração). */
export function sine(freq: number, ms: number, sampleRate = SAMPLE_RATE, amplitude = 0.5): Float32Array {
  const n = Math.max(0, Math.round((ms * sampleRate) / 1000));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}
