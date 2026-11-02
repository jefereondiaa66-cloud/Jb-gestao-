/**
 * Regras da sessão de voz local (parte pura, testável no Node).
 *
 * A sessão começa no botão do microfone, no atalho, na palavra de ativação
 * ou quando o motor passa a ouvir sozinho; termina quando o motor volta para
 * "Aguardando"/"Erro". Um "Aguardando" que chega logo depois de começar pode
 * ser um evento antigo (corrida): nesse caso espera-se um pouco e confere de
 * novo, em vez de ignorar para sempre (o que deixaria o microfone aberto).
 */
import type { AssistantState } from '../../../core/types';

/** Tempo em que um "Aguardando" logo após começar a ouvir pode ser evento antigo. */
export const START_GRACE_MS = 1500;

/** O que o hook deve fazer depois de um estado do motor. */
export type SessionAction = { kind: 'none' } | { kind: 'begin' } | { kind: 'end' } | { kind: 'recheck'; afterMs: number };

export class VoiceSessionTracker {
  private active = false;
  private startedAt = 0;
  /** O motor já confirmou que está ouvindo nesta sessão. */
  private acked = false;
  private last: AssistantState = 'IDLE';

  get isActive(): boolean {
    return this.active;
  }

  begin(now: number): void {
    this.active = true;
    this.startedAt = now;
    this.acked = false;
  }

  end(): void {
    this.active = false;
    this.acked = false;
  }

  /** allowBegin: a voz está ligada (o motor pode abrir uma sessão sozinho). */
  onEngineState(state: AssistantState, now: number, allowBegin: boolean): SessionAction {
    this.last = state;
    if (state === 'LISTENING') {
      if (this.active) {
        this.acked = true;
        return { kind: 'none' };
      }
      if (!allowBegin) return { kind: 'none' };
      this.begin(now);
      this.acked = true;
      return { kind: 'begin' };
    }
    if (!this.active || (state !== 'IDLE' && state !== 'ERROR')) return { kind: 'none' };
    const left = this.startedAt + START_GRACE_MS - now;
    if (this.acked || left <= 0) {
      this.end();
      return { kind: 'end' };
    }
    return { kind: 'recheck', afterMs: left };
  }

  /** Fim da carência: encerra se o motor continua parado sem ter começado a ouvir. */
  recheck(now: number): boolean {
    if (!this.active || this.acked) return false;
    if (this.last !== 'IDLE' && this.last !== 'ERROR') return false;
    if (now < this.startedAt + START_GRACE_MS) return false;
    this.end();
    return true;
  }
}
