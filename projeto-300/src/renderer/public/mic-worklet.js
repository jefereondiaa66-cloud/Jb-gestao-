/*
 * Processador de áudio do microfone do 300 (roda no AudioWorkletGlobalScope).
 *
 * - Mistura os canais para mono.
 * - Converte a taxa do contexto (ex.: 48 kHz) para 16 kHz com filtro
 *   anti-aliasing (sinc janelado Blackman, mesmo algoritmo de
 *   src/renderer/src/lib/dsp/resampler.ts — os testes comparam os dois).
 * - Envia quadros Float32Array de exatamente 512 amostras pela porta.
 *
 * Mensagens aceitas: { type: 'stop' } encerra o processador.
 */
/* global sampleRate, registerProcessor, AudioWorkletProcessor */

const OUT_RATE = 16000;
const FRAME = 512;
const TABLE_RES = 64;
const QUALITY = 8;

function buildKernel(half, fc) {
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
    const r = t / half;
    const win = 0.42 + 0.5 * Math.cos(Math.PI * r) + 0.08 * Math.cos(2 * Math.PI * r);
    table[i] = 2 * fc * sinc * win;
  }
  return table;
}

class Resampler {
  constructor(inRate, outRate) {
    this.step = inRate / outRate;
    this.bypass = inRate === outRate;
    const ratio = Math.max(1, this.step);
    this.half = Math.max(4, Math.ceil(QUALITY * ratio));
    this.table = buildKernel(this.half, (0.5 / ratio) * 0.9);
    this.buf = new Float32Array(4096);
    this.len = this.bypass ? 0 : this.half;
    this.pos = this.bypass ? 0 : this.half;
  }

  // Chama emit(amostra) para cada amostra de saída (sem alocar memória).
  process(input, emit) {
    if (this.bypass) {
      for (let i = 0; i < input.length; i++) emit(input[i]);
      return;
    }
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

    const half = this.half;
    const step = this.step;
    const table = this.table;
    const buf = this.buf;
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
        const w = table[i] + (table[i + 1] - table[i]) * (x - i);
        acc += buf[base + k] * w;
        wsum += w;
      }
      emit(wsum !== 0 ? acc / wsum : 0);
      pos += step;
    }
    const keepFrom = Math.floor(pos) - half + 1;
    if (keepFrom > 0) {
      buf.copyWithin(0, keepFrom, this.len);
      this.len -= keepFrom;
      pos -= keepFrom;
    }
    this.pos = pos;
  }
}

class MicCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.resampler = new Resampler(sampleRate, OUT_RATE);
    this.frame = new Float32Array(FRAME);
    this.fill = 0;
    this.mono = new Float32Array(128);
    this.active = true;
    this.emit = (v) => {
      this.frame[this.fill++] = v;
      if (this.fill === FRAME) {
        const full = this.frame;
        this.frame = new Float32Array(FRAME);
        this.fill = 0;
        this.port.postMessage(full, [full.buffer]);
      }
    };
    this.port.onmessage = (e) => {
      if (e && e.data && e.data.type === 'stop') this.active = false;
    };
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0];
    if (!input || input.length === 0 || !input[0]) return true;
    let mono = input[0];
    if (input.length > 1) {
      const n = input[0].length;
      if (this.mono.length !== n) this.mono = new Float32Array(n);
      this.mono.fill(0);
      for (let c = 0; c < input.length; c++) {
        const ch = input[c];
        for (let i = 0; i < n; i++) this.mono[i] += ch[i] || 0;
      }
      const k = 1 / input.length;
      for (let i = 0; i < n; i++) this.mono[i] *= k;
      mono = this.mono;
    }
    this.resampler.process(mono, this.emit);
    return true;
  }
}

registerProcessor('mic-capture-300', MicCaptureProcessor);
