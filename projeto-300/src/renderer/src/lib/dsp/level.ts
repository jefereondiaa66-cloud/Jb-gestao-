/** Medidor de nível de áudio (para a animação do orbe e indicadores). */

export function rms(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / n);
}

/**
 * Converte RMS linear em nível 0..1 numa escala em decibéis:
 * floorDb (silêncio) -> 0, ceilDb (voz forte) -> 1.
 */
export function rmsToLevel(value: number, floorDb = -58, ceilDb = -14): number {
  if (!(value > 0)) return 0;
  const db = 20 * Math.log10(value);
  if (db <= floorDb) return 0;
  if (db >= ceilDb) return 1;
  return (db - floorDb) / (ceilDb - floorDb);
}

/** Suavização com ataque rápido e liberação lenta (cada update = um quadro). */
export class LevelMeter {
  private v = 0;

  constructor(
    private readonly attack = 0.55,
    private readonly release = 0.12,
  ) {}

  get value(): number {
    return this.v;
  }

  update(instant: number): number {
    const x = Number.isFinite(instant) ? Math.min(1, Math.max(0, instant)) : 0;
    const k = x > this.v ? this.attack : this.release;
    this.v += (x - this.v) * k;
    if (this.v < 1e-4) this.v = 0;
    return this.v;
  }

  /** Aplica a medição de um bloco de amostras. */
  updateFromSamples(samples: ArrayLike<number>): number {
    return this.update(rmsToLevel(rms(samples)));
  }

  reset(): void {
    this.v = 0;
  }
}

/** Decaimento exponencial de um nível no tempo (para valores vindos por evento). */
export function decayLevel(level: number, elapsedSec: number, halfLifeSec = 0.18): number {
  if (!(level > 0) || !(elapsedSec > 0)) return Math.max(0, level || 0);
  return level * Math.pow(0.5, elapsedSec / halfLifeSec);
}
