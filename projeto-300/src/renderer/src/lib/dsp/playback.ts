/**
 * Matemática do agendamento de áudio sem lacunas (gapless).
 * Cada pedaço de PCM é agendado para começar exatamente quando o anterior termina.
 * Se a fila esvaziou (o relógio passou do fim), recomeça com uma pequena folga.
 */

export const MIN_SAMPLE_RATE = 3000;
export const MAX_SAMPLE_RATE = 384000;

export function isValidSampleRate(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MIN_SAMPLE_RATE && rate <= MAX_SAMPLE_RATE;
}

export function pcmDuration(sampleCount: number, sampleRate: number): number {
  if (!isValidSampleRate(sampleRate) || !(sampleCount > 0)) return 0;
  return sampleCount / sampleRate;
}

export interface ScheduledSlot {
  startAt: number;
  endAt: number;
  /** true quando houve recomeço (fila vazia ou primeiro pedaço). */
  restarted: boolean;
}

export class PlaybackScheduler {
  private next = 0;

  /** @param leadSec folga ao (re)começar, para o áudio não ser agendado no passado. */
  constructor(private readonly leadSec = 0.04) {}

  schedule(now: number, durationSec: number): ScheduledSlot {
    const duration = Math.max(0, Number.isFinite(durationSec) ? durationSec : 0);
    const restarted = !(this.next > now);
    const startAt = restarted ? now + this.leadSec : this.next;
    this.next = startAt + duration;
    return { startAt, endAt: this.next, restarted };
  }

  /** Segundos de áudio ainda agendados a partir de agora. */
  remaining(now: number): number {
    return Math.max(0, this.next - now);
  }

  isPlaying(now: number): boolean {
    return this.next > now;
  }

  /** Fim do áudio agendado (0 = nada agendado). */
  get endTime(): number {
    return this.next;
  }

  reset(): void {
    this.next = 0;
  }
}
