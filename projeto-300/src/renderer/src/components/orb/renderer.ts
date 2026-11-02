/**
 * Desenho do orbe do 300 em canvas 2D.
 * Cada estado tem uma camada própria; as camadas fazem transição suave
 * (pesos interpolados), assim como a cor principal.
 */
import type { AssistantState } from '../../../../core/types';

export interface OrbInput {
  state: AssistantState;
  /** 0..1 */
  mic: number;
  /** 0..1 */
  speech: number;
  reduced: boolean;
}

type RGB = [number, number, number];

export const ORB_COLORS: Record<AssistantState, RGB> = {
  IDLE: [58, 134, 255],
  LISTENING: [34, 226, 255],
  THINKING: [126, 120, 255],
  SPEAKING: [80, 200, 255],
  EXECUTING: [255, 176, 46],
  ERROR: [255, 66, 88],
};

const STATES: AssistantState[] = ['IDLE', 'LISTENING', 'THINKING', 'SPEAKING', 'EXECUTING', 'ERROR'];
const TAU = Math.PI * 2;
const BAR_COUNT = 96;

interface Particle {
  angle: number;
  radius: number; // fração do raio externo
  speed: number;
  size: number;
  phase: number;
}

interface Wave {
  r: number; // fração de 0..1 do caminho
  strength: number;
}

const rgba = (c: RGB, a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lighten = (c: RGB, k: number): RGB => mix(c, [255, 255, 255], k);

/** Ruído suave determinístico (soma de senos). */
function noise(i: number, t: number): number {
  return 0.5 + 0.25 * Math.sin(i * 1.7 + t * 3.1) + 0.15 * Math.sin(i * 0.63 - t * 2.3) + 0.1 * Math.sin(i * 3.9 + t * 5.3);
}

export class OrbRenderer {
  private color: RGB = [...ORB_COLORS.IDLE];
  private weights: Record<AssistantState, number> = { IDLE: 1, LISTENING: 0, THINKING: 0, SPEAKING: 0, EXECUTING: 0, ERROR: 0 };
  private mic = 0;
  private speech = 0;
  private bars = new Float32Array(BAR_COUNT);
  private particles: Particle[] = [];
  private waves: Wave[] = [];
  private waveClock = 0;
  private spin = 0;
  private time = 0;

  constructor(seed = 7) {
    let s = seed;
    const rnd = () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
    for (let i = 0; i < 70; i++) {
      this.particles.push({
        angle: rnd() * TAU,
        radius: 0.52 + rnd() * 0.44,
        speed: (0.04 + rnd() * 0.12) * (rnd() < 0.5 ? -1 : 1),
        size: 0.6 + rnd() * 1.4,
        phase: rnd() * TAU,
      });
    }
  }

  /** Avança a simulação e desenha. dt em segundos. */
  draw(g: CanvasRenderingContext2D, size: number, dt: number, input: OrbInput): void {
    const reduced = input.reduced;
    const step = Math.min(0.1, Math.max(0, dt));
    if (!reduced) this.time += step;
    const t = this.time;

    // transições
    const kColor = reduced ? 1 : 1 - Math.exp(-step * 5);
    this.color = mix(this.color, ORB_COLORS[input.state], kColor);
    for (const s of STATES) {
      const target = s === input.state ? 1 : 0;
      this.weights[s] += (target - this.weights[s]) * (reduced ? 1 : 1 - Math.exp(-step * 6));
    }
    const kLevel = reduced ? 1 : 1 - Math.exp(-step * 18);
    this.mic += (Math.max(0, Math.min(1, input.mic)) - this.mic) * kLevel;
    this.speech += (Math.max(0, Math.min(1, input.speech)) - this.speech) * kLevel;

    const w = this.weights;
    const spinSpeed = 0.06 + w.THINKING * 0.5 + w.EXECUTING * 0.3;
    if (!reduced) this.spin += spinSpeed * step;

    const c = size / 2;
    const R = size * 0.17; // núcleo
    const R1 = size * 0.31; // anel interno
    const R2 = size * 0.41; // anel externo (HUD)
    const color = this.color;

    // tremulação do erro
    let flicker = 1;
    if (w.ERROR > 0.01 && !reduced) {
      const n = Math.sin(Math.floor(t * 17) * 12.9898) * 43758.5453;
      const r = n - Math.floor(n);
      flicker = 1 - w.ERROR * (r < 0.22 ? 0.55 : r < 0.4 ? 0.2 : 0);
    }

    g.clearRect(0, 0, size, size);
    g.save();
    g.globalAlpha = flicker;

    // brilho ambiente
    const ambient = g.createRadialGradient(c, c, R * 0.4, c, c, size * 0.5);
    ambient.addColorStop(0, rgba(color, 0.26 + this.speech * 0.12 * w.SPEAKING));
    ambient.addColorStop(0.45, rgba(color, 0.08));
    ambient.addColorStop(1, rgba(color, 0));
    g.fillStyle = ambient;
    g.fillRect(0, 0, size, size);

    this.drawHud(g, c, R2, color, t, reduced);
    if (!reduced) this.drawParticles(g, c, R2, color, step, w.THINKING, w.EXECUTING);

    // camadas por estado
    if (w.IDLE > 0.01) this.drawIdle(g, c, R1, color, t, w.IDLE);
    if (w.LISTENING > 0.01) this.drawListening(g, c, R, R2, color, t, w.LISTENING, reduced);
    if (w.THINKING > 0.01) this.drawThinking(g, c, R1, color, t, w.THINKING, reduced);
    if (w.SPEAKING > 0.01) this.drawSpeaking(g, c, R, R2, color, step, w.SPEAKING, reduced);
    if (w.EXECUTING > 0.01) this.drawExecuting(g, c, R1, color, t, w.EXECUTING, reduced);
    if (w.ERROR > 0.01) this.drawError(g, c, R1, color, t, w.ERROR);

    // núcleo
    const breath = reduced ? 0 : Math.sin(t * 1.1) * 0.035 * w.IDLE;
    const think = reduced ? 0 : Math.sin(t * 4) * 0.02 * w.THINKING;
    const scale = 1 + breath + think + this.mic * 0.2 * w.LISTENING + this.speech * 0.26 * w.SPEAKING;
    this.drawCore(g, c, R * scale, color, t, reduced);

    g.restore();
  }

  private drawHud(g: CanvasRenderingContext2D, c: number, R2: number, color: RGB, t: number, reduced: boolean): void {
    g.save();
    g.translate(c, c);
    // círculo fino
    g.strokeStyle = rgba(color, 0.22);
    g.lineWidth = 1;
    g.beginPath();
    g.arc(0, 0, R2, 0, TAU);
    g.stroke();
    g.strokeStyle = rgba(color, 0.09);
    g.beginPath();
    g.arc(0, 0, R2 * 1.1, 0, TAU);
    g.stroke();

    // marcações
    g.rotate(this.spin * 0.35);
    const ticks = 120;
    for (let i = 0; i < ticks; i++) {
      const major = i % 10 === 0;
      const mid = i % 5 === 0;
      const len = major ? R2 * 0.06 : mid ? R2 * 0.035 : R2 * 0.018;
      const a = (i / ticks) * TAU;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      g.strokeStyle = rgba(color, major ? 0.55 : mid ? 0.32 : 0.16);
      g.lineWidth = major ? 1.6 : 1;
      g.beginPath();
      g.moveTo(cos * (R2 + 3), sin * (R2 + 3));
      g.lineTo(cos * (R2 + 3 + len), sin * (R2 + 3 + len));
      g.stroke();
    }

    // segmentos girando ao contrário
    g.rotate(-this.spin * 0.9);
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    for (let k = 0; k < 4; k++) {
      const start = (k / 4) * TAU + (reduced ? 0 : Math.sin(t * 0.3 + k) * 0.05);
      g.strokeStyle = rgba(lighten(color, 0.2), 0.5);
      g.beginPath();
      g.arc(0, 0, R2 * 1.1, start, start + 0.32);
      g.stroke();
    }
    g.restore();
  }

  private drawParticles(g: CanvasRenderingContext2D, c: number, R2: number, color: RGB, step: number, thinking: number, executing: number): void {
    const boost = 1 + thinking * 3 + executing * 1.5;
    g.save();
    for (const p of this.particles) {
      p.angle += p.speed * step * boost;
      const wobble = Math.sin(this.time * 0.8 + p.phase) * 0.03;
      const r = R2 * (p.radius + wobble);
      const x = c + Math.cos(p.angle) * r;
      const y = c + Math.sin(p.angle) * r;
      const a = 0.18 + 0.32 * (0.5 + 0.5 * Math.sin(this.time * 1.3 + p.phase));
      g.fillStyle = rgba(lighten(color, 0.35), a);
      g.beginPath();
      g.arc(x, y, p.size, 0, TAU);
      g.fill();
    }
    g.restore();
  }

  private drawIdle(g: CanvasRenderingContext2D, c: number, R1: number, color: RGB, t: number, wgt: number): void {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    g.save();
    g.strokeStyle = rgba(color, (0.18 + pulse * 0.22) * wgt);
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(c, c, R1 * (0.96 + pulse * 0.04), 0, TAU);
    g.stroke();
    g.setLineDash([2, 6]);
    g.strokeStyle = rgba(color, 0.25 * wgt);
    g.beginPath();
    g.arc(c, c, R1 * 0.8, 0, TAU);
    g.stroke();
    g.restore();
  }

  private drawListening(g: CanvasRenderingContext2D, c: number, R: number, R2: number, color: RGB, t: number, wgt: number, reduced: boolean): void {
    const level = this.mic;
    const inner = R * 1.45;
    const maxLen = (R2 * 0.92 - inner) * 0.95;
    g.save();
    g.translate(c, c);
    g.lineCap = 'round';
    g.lineWidth = 2;
    for (let i = 0; i < BAR_COUNT; i++) {
      const n = reduced ? 0.6 : noise(i, t);
      const target = 0.06 + level * (0.35 + 0.65 * n);
      this.bars[i] += (target - this.bars[i]!) * 0.35;
      const len = 3 + maxLen * this.bars[i]!;
      const a = (i / BAR_COUNT) * TAU - Math.PI / 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      g.strokeStyle = rgba(lighten(color, 0.15 + this.bars[i]! * 0.4), (0.35 + this.bars[i]! * 0.6) * wgt);
      g.beginPath();
      g.moveTo(cos * inner, sin * inner);
      g.lineTo(cos * (inner + len), sin * (inner + len));
      g.stroke();
    }
    // anel de captação
    g.strokeStyle = rgba(color, (0.35 + level * 0.5) * wgt);
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(0, 0, inner - 6, 0, TAU);
    g.stroke();
    g.restore();
  }

  private drawThinking(g: CanvasRenderingContext2D, c: number, R1: number, color: RGB, t: number, wgt: number, reduced: boolean): void {
    const arcs = [
      { r: R1 * 1.0, speed: 1.6, len: 1.9, width: 3 },
      { r: R1 * 0.86, speed: -1.15, len: 1.1, width: 2 },
      { r: R1 * 1.14, speed: 2.4, len: 0.8, width: 1.6 },
      { r: R1 * 0.72, speed: -2.9, len: 2.6, width: 1.2 },
    ];
    g.save();
    g.translate(c, c);
    g.lineCap = 'round';
    g.shadowColor = rgba(color, 0.8 * wgt);
    g.shadowBlur = 12;
    for (let i = 0; i < arcs.length; i++) {
      const a = arcs[i]!;
      const start = reduced ? i * 1.3 : t * a.speed + i * 1.3;
      const len = a.len * (reduced ? 1 : 0.8 + 0.2 * Math.sin(t * 1.7 + i));
      g.strokeStyle = rgba(lighten(color, 0.25), (0.85 - i * 0.12) * wgt);
      g.lineWidth = a.width;
      g.beginPath();
      g.arc(0, 0, a.r, start, start + len);
      g.stroke();
      // arco espelhado mais fraco
      g.strokeStyle = rgba(color, 0.3 * wgt);
      g.beginPath();
      g.arc(0, 0, a.r, start + Math.PI, start + Math.PI + len * 0.5);
      g.stroke();
    }
    g.restore();
  }

  private drawSpeaking(g: CanvasRenderingContext2D, c: number, R: number, R2: number, color: RGB, step: number, wgt: number, reduced: boolean): void {
    const level = this.speech;
    if (!reduced) {
      this.waveClock += step * (1.2 + level * 5);
      if (this.waveClock >= 1 && this.waves.length < 8) {
        this.waveClock = 0;
        this.waves.push({ r: 0, strength: 0.35 + level * 0.65 });
      }
      for (const wv of this.waves) wv.r += step * (0.55 + level * 0.6);
      this.waves = this.waves.filter((wv) => wv.r < 1);
    }
    g.save();
    const from = R * 1.15;
    const to = R2 * 1.02;
    for (const wv of this.waves) {
      const r = from + (to - from) * wv.r;
      g.strokeStyle = rgba(lighten(color, 0.3), (1 - wv.r) * 0.55 * wv.strength * wgt);
      g.lineWidth = 1 + 2.5 * (1 - wv.r) * wv.strength;
      g.beginPath();
      g.arc(c, c, r, 0, TAU);
      g.stroke();
    }
    // anel que pulsa com a voz
    g.strokeStyle = rgba(lighten(color, 0.4), (0.4 + level * 0.6) * wgt);
    g.lineWidth = 2 + level * 3;
    g.shadowColor = rgba(color, 0.9 * wgt);
    g.shadowBlur = 10 + level * 20;
    g.beginPath();
    g.arc(c, c, R * (1.32 + level * 0.3), 0, TAU);
    g.stroke();
    g.restore();
  }

  private drawExecuting(g: CanvasRenderingContext2D, c: number, R1: number, color: RGB, t: number, wgt: number, reduced: boolean): void {
    g.save();
    g.translate(c, c);
    // trilho
    g.strokeStyle = rgba(color, 0.18 * wgt);
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, R1, 0, TAU);
    g.stroke();
    // progresso indeterminado
    const start = reduced ? -Math.PI / 2 : t * 2.2;
    const len = reduced ? Math.PI * 0.6 : TAU * (0.18 + 0.14 * (1 + Math.sin(t * 1.6)));
    g.strokeStyle = rgba(lighten(color, 0.2), 0.95 * wgt);
    g.lineWidth = 4;
    g.lineCap = 'round';
    g.shadowColor = rgba(color, 0.9 * wgt);
    g.shadowBlur = 14;
    g.beginPath();
    g.arc(0, 0, R1, start, start + len);
    g.stroke();
    g.shadowBlur = 0;
    // satélites em órbita
    for (let k = 0; k < 3; k++) {
      const a = (reduced ? 0 : t * 1.5) + (k * TAU) / 3;
      const r = R1 * 1.18;
      g.fillStyle = rgba(lighten(color, 0.4), 0.9 * wgt);
      g.beginPath();
      g.arc(Math.cos(a) * r, Math.sin(a) * r, 3.2, 0, TAU);
      g.fill();
      g.strokeStyle = rgba(color, 0.25 * wgt);
      g.lineWidth = 1;
      g.beginPath();
      g.arc(0, 0, r, a - 0.5, a);
      g.stroke();
    }
    // tracejado interno girando
    g.setLineDash([3, 9]);
    g.rotate(reduced ? 0 : -t * 0.8);
    g.strokeStyle = rgba(color, 0.45 * wgt);
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(0, 0, R1 * 0.82, 0, TAU);
    g.stroke();
    g.restore();
  }

  private drawError(g: CanvasRenderingContext2D, c: number, R1: number, color: RGB, t: number, wgt: number): void {
    g.save();
    g.translate(c, c);
    g.setLineDash([10, 6]);
    g.strokeStyle = rgba(color, 0.6 * wgt);
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, R1, 0, TAU);
    g.stroke();
    g.setLineDash([]);
    // fatias "com defeito"
    const n = Math.floor(t * 9);
    for (let k = 0; k < 3; k++) {
      const h = Math.sin((n + k) * 78.233) * 43758.5453;
      const r = h - Math.floor(h);
      const a = r * TAU;
      g.strokeStyle = rgba(lighten(color, 0.3), (0.3 + r * 0.5) * wgt);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, R1 * (1.05 + r * 0.12), a, a + 0.25 + r * 0.3);
      g.stroke();
    }
    g.restore();
  }

  private drawCore(g: CanvasRenderingContext2D, c: number, r: number, color: RGB, t: number, reduced: boolean): void {
    g.save();
    // halo
    const halo = g.createRadialGradient(c, c, r * 0.6, c, c, r * 1.9);
    halo.addColorStop(0, rgba(color, 0.4));
    halo.addColorStop(1, rgba(color, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(c, c, r * 1.9, 0, TAU);
    g.fill();

    // esfera
    const sphere = g.createRadialGradient(c - r * 0.25, c - r * 0.3, r * 0.05, c, c, r);
    sphere.addColorStop(0, rgba(lighten(color, 0.85), 0.98));
    sphere.addColorStop(0.35, rgba(lighten(color, 0.35), 0.92));
    sphere.addColorStop(0.75, rgba(color, 0.75));
    sphere.addColorStop(1, rgba(mix(color, [0, 0, 0], 0.5), 0.55));
    g.fillStyle = sphere;
    g.beginPath();
    g.arc(c, c, r, 0, TAU);
    g.fill();

    // íris: anéis finos internos girando
    g.translate(c, c);
    g.rotate(reduced ? 0 : t * 0.25);
    g.strokeStyle = 'rgba(255,255,255,0.22)';
    g.lineWidth = 1;
    for (let k = 1; k <= 3; k++) {
      g.beginPath();
      g.arc(0, 0, r * (0.25 * k), k * 0.6, k * 0.6 + Math.PI * 1.4);
      g.stroke();
    }
    // borda luminosa
    g.rotate(reduced ? 0 : -t * 0.5);
    g.strokeStyle = rgba(lighten(color, 0.6), 0.75);
    g.lineWidth = 1.6;
    g.shadowColor = rgba(color, 1);
    g.shadowBlur = 16;
    g.beginPath();
    g.arc(0, 0, r, 0, TAU);
    g.stroke();
    g.restore();
  }
}
