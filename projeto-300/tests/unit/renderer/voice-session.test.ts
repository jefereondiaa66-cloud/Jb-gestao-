import { describe, expect, it } from 'vitest';
import { START_GRACE_MS, VoiceSessionTracker } from '../../../src/renderer/src/lib/voice-session';

describe('VoiceSessionTracker', () => {
  it('ciclo normal: ouvir, pensar, falar e voltar a aguardar encerra a sessão', () => {
    const t = new VoiceSessionTracker();
    t.begin(0);
    expect(t.onEngineState('LISTENING', 100, true)).toEqual({ kind: 'none' });
    expect(t.onEngineState('THINKING', 2000, true)).toEqual({ kind: 'none' });
    expect(t.onEngineState('SPEAKING', 3000, true)).toEqual({ kind: 'none' });
    expect(t.isActive).toBe(true);
    expect(t.onEngineState('IDLE', 5000, true)).toEqual({ kind: 'end' });
    expect(t.isActive).toBe(false);
  });

  it('modo contínuo: volta a ouvir depois de falar e a sessão continua', () => {
    const t = new VoiceSessionTracker();
    t.begin(0);
    t.onEngineState('LISTENING', 10, true);
    t.onEngineState('SPEAKING', 3000, true);
    t.onEngineState('LISTENING', 6000, true);
    expect(t.isActive).toBe(true);
  });

  it('"Aguardando" antigo logo depois de começar não encerra se o motor passar a ouvir', () => {
    const t = new VoiceSessionTracker();
    t.begin(0);
    const a = t.onEngineState('IDLE', 50, true);
    expect(a).toEqual({ kind: 'recheck', afterMs: START_GRACE_MS - 50 });
    t.onEngineState('LISTENING', 200, true);
    expect(t.recheck(START_GRACE_MS + 10)).toBe(false);
    expect(t.isActive).toBe(true);
  });

  it('motor que volta a aguardar sem nunca ouvir encerra a sessão ao fim da carência (antes ficava aberta para sempre)', () => {
    const t = new VoiceSessionTracker();
    t.begin(0);
    expect(t.onEngineState('ERROR', 300, true).kind).toBe('recheck');
    expect(t.recheck(1000)).toBe(false); // ainda na carência
    expect(t.recheck(START_GRACE_MS + 1)).toBe(true);
    expect(t.isActive).toBe(false);
  });

  it('ativação que termina rápido (sem fala) encerra na hora, mesmo dentro da carência', () => {
    const t = new VoiceSessionTracker();
    t.begin(0);
    t.onEngineState('LISTENING', 20, true);
    expect(t.onEngineState('IDLE', 400, true)).toEqual({ kind: 'end' });
  });

  it('motor começando a ouvir sozinho abre sessão só com a voz ligada', () => {
    const off = new VoiceSessionTracker();
    expect(off.onEngineState('LISTENING', 0, false)).toEqual({ kind: 'none' });
    expect(off.isActive).toBe(false);
    const on = new VoiceSessionTracker();
    expect(on.onEngineState('LISTENING', 0, true)).toEqual({ kind: 'begin' });
    expect(on.isActive).toBe(true);
  });

  it('estados sem sessão ativa não fazem nada', () => {
    const t = new VoiceSessionTracker();
    expect(t.onEngineState('IDLE', 0, true)).toEqual({ kind: 'none' });
    expect(t.onEngineState('THINKING', 0, true)).toEqual({ kind: 'none' });
    expect(t.recheck(10_000)).toBe(false);
  });
});
