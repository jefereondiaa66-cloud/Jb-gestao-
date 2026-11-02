/** Centro da tela: orbe, estado, transcrição ao vivo e controles de voz. */
import { useEffect } from 'react';
import type { AssistantState } from '../../../core/types';
import { STATE_HINT, STATE_LABEL } from '../lib/format';
import { Orb } from './orb/Orb';
import { Toggle } from './controls';
import { IconEar, IconMic, IconMicOff } from './icons';

export interface CenterStageProps {
  state: AssistantState;
  detail?: string;
  error?: string;
  transcript: { text: string; final: boolean; ts: number } | null;
  onClearTranscript: () => void;
  levels: () => { mic: number; speech: number };
  listening: boolean;
  micOpen: boolean;
  voiceEnabled: boolean;
  wakeEnabled: boolean;
  wakeBusy: boolean;
  hotkey: string;
  onToggleListen: () => void;
  onToggleWake: (v: boolean) => void;
}

/** "CommandOrControl+Shift+Space" -> "Ctrl + Shift + Espaço". */
export function prettyHotkey(accel: string): string {
  const map: Record<string, string> = { CommandOrControl: 'Ctrl', CmdOrCtrl: 'Ctrl', Control: 'Ctrl', Ctrl: 'Ctrl', Shift: 'Shift', Alt: 'Alt', Option: 'Alt', Super: 'Win', Meta: 'Win', Space: 'Espaço', Return: 'Enter', Escape: 'Esc' };
  return accel
    .split('+')
    .map((k) => map[k] ?? k)
    .join(' + ');
}

export function CenterStage(p: CenterStageProps) {
  const { transcript, onClearTranscript } = p;
  // a transcrição final some depois de alguns segundos
  useEffect(() => {
    if (!transcript || !transcript.final) return;
    const t = setTimeout(onClearTranscript, 7000);
    return () => clearTimeout(t);
  }, [transcript, onClearTranscript]);

  const label = STATE_LABEL[p.state];
  const isError = p.state === 'ERROR';
  const hint = isError ? p.error || p.detail || STATE_HINT.ERROR : p.detail || STATE_HINT[p.state];

  return (
    <section className="stage" aria-label="Estado do 300">
      <div className="stage-orb">
        <Orb state={p.state} levels={p.levels} label={`300: ${label}`} />
      </div>

      <div className="stage-status" aria-live="polite">
        <div className={`stage-state state-${p.state.toLowerCase()}`}>
          <span className="stage-state-dot" aria-hidden="true" />
          {label}
        </div>
        <div className={'stage-hint' + (isError ? ' is-error' : '')} role={isError ? 'alert' : undefined}>
          {hint}
        </div>
      </div>

      <div className={'stage-transcript' + (transcript ? ' is-visible' : '') + (transcript && !transcript.final ? ' is-partial' : '')} aria-live="polite">
        {transcript?.text ? <>“{transcript.text}”</> : <span className="muted">&nbsp;</span>}
      </div>

      <div className="voice-dock">
        <button
          type="button"
          className={'mic-btn' + (p.listening ? ' is-active' : '') + (p.micOpen ? ' is-open' : '')}
          onClick={p.onToggleListen}
          disabled={!p.voiceEnabled}
          aria-pressed={p.listening}
          aria-label={p.listening ? 'Parar de ouvir' : 'Falar com o 300'}
          title={p.voiceEnabled ? (p.listening ? 'Parar de ouvir' : `Falar (${prettyHotkey(p.hotkey)})`) : 'A voz está desligada nas configurações'}
        >
          <span className="mic-btn-ring" aria-hidden="true" />
          {p.voiceEnabled ? <IconMic size={28} /> : <IconMicOff size={28} />}
        </button>
        <div className="voice-dock-side">
          <div className="wake-toggle">
            <IconEar size={16} />
            <span className="wake-label" id="wake-lbl">
              Palavra de ativação
            </span>
            <Toggle checked={p.wakeEnabled} onChange={p.onToggleWake} label="Palavra de ativação “300”" disabled={!p.voiceEnabled || p.wakeBusy} />
          </div>
          <span className="voice-dock-hint">
            {p.listening ? 'Ouvindo… clique para parar.' : p.wakeEnabled ? 'Diga “300” para chamar.' : 'Clique no microfone para falar.'}{' '}
            <span className="nowrap">
              Atalho: <kbd>{prettyHotkey(p.hotkey)}</kbd>
            </span>
          </span>
        </div>
      </div>
    </section>
  );
}
