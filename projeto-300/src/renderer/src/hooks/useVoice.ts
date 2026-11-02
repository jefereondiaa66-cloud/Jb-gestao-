/**
 * Sessão de voz e microfone.
 * O microfone só abre quando necessário: palavra de ativação ligada, ou uma
 * sessão de escuta em andamento (botão do microfone, ativação, modo contínuo).
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { AssistantState } from '../../../core/types';
import { api, call } from '../api';
import { MicCapture, micErrorMessage } from '../audio/mic';
import { errorText } from '../lib/format';

export interface VoiceApi {
  micOpen: boolean;
  session: boolean;
  /** Ref com o estado da sessão (para seguir a conversa da voz). */
  sessionRef: RefObject<boolean>;
  start(): Promise<void>;
  stop(): Promise<void>;
  toggle(): Promise<void>;
  /** Encerra a sessão local sem chamar o motor (usado pelo botão PARAR). */
  endSession(): void;
  micLevel(): number;
  onEngineState(state: AssistantState): void;
  onWake(): void;
}

type Notify = (tone: 'erro' | 'aviso' | 'info', title: string, body?: string) => void;

/** Tempo em que um "Aguardando" logo após começar a ouvir é ignorado (corrida de eventos). */
const START_GRACE_MS = 1500;

export function useVoice(opts: { voiceEnabled: boolean; wakeEnabled: boolean; assistantState: AssistantState; notify: Notify; onStopAudio: () => void }): VoiceApi {
  const { voiceEnabled, wakeEnabled, assistantState } = opts;
  const notifyRef = useRef(opts.notify);
  notifyRef.current = opts.notify;
  const stopAudioRef = useRef(opts.onStopAudio);
  stopAudioRef.current = opts.onStopAudio;

  const [session, setSession] = useState(false);
  const sessionRef = useRef(false);
  const sessionStart = useRef(0);
  const [micOpen, setMicOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const setSessionState = useCallback((v: boolean) => {
    sessionRef.current = v;
    if (v) sessionStart.current = Date.now();
    setSession(v);
  }, []);

  const micRef = useRef<MicCapture | null>(null);
  if (!micRef.current) {
    micRef.current = new MicCapture({
      onFrame: (frame) => {
        try {
          api().sendAudio(frame);
        } catch {
          /* ponte indisponível */
        }
      },
      onEnded: (reason) => {
        setMicOpen(false);
        setSessionState(false);
        notifyRef.current('aviso', 'Microfone desligado', reason);
      },
    });
  }

  const needed = voiceEnabled && (wakeEnabled || session);

  useEffect(() => {
    const mic = micRef.current!;
    let cancelled = false;
    if (needed) {
      mic.start().then(
        () => {
          if (!cancelled) setMicOpen(mic.isOpen);
        },
        (err) => {
          if (cancelled) return;
          setMicOpen(false);
          sessionRef.current = false;
          setSession(false);
          notifyRef.current('erro', 'Microfone indisponível', micErrorMessage(err));
        },
      );
    } else {
      void mic.stop().then(() => {
        if (!cancelled) setMicOpen(false);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [needed, attempt]);

  // fecha o microfone ao sair
  useEffect(() => {
    const mic = micRef.current!;
    return () => {
      void mic.stop();
    };
  }, []);

  const start = useCallback(async () => {
    if (!voiceEnabled) {
      notifyRef.current('aviso', 'A voz está desligada', 'Ative em Configurações > Voz.');
      return;
    }
    setSessionState(true);
    setAttempt((a) => a + 1);
    try {
      await call('voice:start');
    } catch (e) {
      setSessionState(false);
      notifyRef.current('erro', 'Não foi possível começar a ouvir', errorText(e));
    }
  }, [voiceEnabled, setSessionState]);

  const stop = useCallback(async () => {
    setSessionState(false);
    stopAudioRef.current();
    try {
      await call('voice:stop');
    } catch (e) {
      notifyRef.current('erro', 'Não foi possível parar a voz', errorText(e));
    }
  }, [setSessionState]);

  const listening = session || assistantState === 'LISTENING';
  const toggle = useCallback(() => (listening ? stop() : start()), [listening, start, stop]);

  const endSession = useCallback(() => setSessionState(false), [setSessionState]);

  const onEngineState = useCallback(
    (s: AssistantState) => {
      if (s === 'LISTENING' && voiceEnabled) {
        if (!sessionRef.current) setSessionState(true);
        return;
      }
      if ((s === 'IDLE' || s === 'ERROR') && sessionRef.current && Date.now() - sessionStart.current > START_GRACE_MS) setSessionState(false);
    },
    [voiceEnabled, setSessionState],
  );

  const onWake = useCallback(() => {
    if (voiceEnabled) setSessionState(true);
  }, [voiceEnabled, setSessionState]);

  const micLevel = useCallback(() => micRef.current?.level ?? 0, []);

  return { micOpen, session, sessionRef, start, stop, toggle, endSession, micLevel, onEngineState, onWake };
}
