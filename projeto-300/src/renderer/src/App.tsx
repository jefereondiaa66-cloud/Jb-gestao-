/** Raiz da interface do 300: estado global, eventos do motor, áudio e layout. */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ConfirmationResponse, ConversationSummary } from '../../core/types';
import type { Attachment } from '../../shared/ipc';
import { api, call, openExternal, stopEverything } from './api';
import { AudioPlayer } from './audio/player';
import { ActivityPanel } from './components/ActivityPanel';
import { CenterStage } from './components/CenterStage';
import { ChatPanel } from './components/chat/ChatPanel';
import type { ComposerHandle } from './components/chat/Composer';
import { ConfirmModal } from './components/ConfirmModal';
import { DialogProvider, useDialog } from './components/Dialog';
import { SettingsDrawer } from './components/settings/SettingsDrawer';
import type { SectionId } from './components/settings/common';
import { TasksPanel } from './components/TasksPanel';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { useSettings } from './hooks/useSettings';
import { useVoice } from './hooks/useVoice';
import { LIMITS } from './lib/attachments';
import { fileToAttachment, namePasted, type PendingAttachment } from './lib/attach-file';
import { decayLevel } from './lib/dsp/level';
import { STATE_LABEL, errorText } from './lib/format';
import { createInitialState, reducer, type Toast } from './lib/store';

type Notify = (tone: Toast['tone'], title: string, body?: string) => void;

function AppInner() {
  const [state, dispatch] = useReducer(reducer, undefined, () => createInitialState());
  const stateRef = useRef(state);
  stateRef.current = state;
  const ask = useDialog();

  const notify = useCallback<Notify>((tone, title, body) => dispatch({ type: 'toast', tone, title, body }), []);
  const notifyError = useCallback((title: string, body: string) => notify('erro', title, body), [notify]);
  const notifyPanel = useCallback((title: string, body?: string) => notify('erro', title, body), [notify]);

  const settingsApi = useSettings(notifyError);
  const settings = settingsApi.settings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [section, setSection] = useState<SectionId>('cerebro');
  const settingsOpenRef = useRef(settingsOpen);
  settingsOpenRef.current = settingsOpen;

  /* ---------------- áudio de saída (voz do 300) ---------------- */
  const playerRef = useRef<AudioPlayer | null>(null);
  const volume = settings?.voice.volume ?? 0.9;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  useEffect(() => {
    const player = new AudioPlayer();
    player.setVolume(volumeRef.current);
    playerRef.current = player;
    const offOut = api().onAudioOut((msg) => player.enqueue(msg));
    const offStop = api().onAudioStop(() => player.stop());
    return () => {
      offOut();
      offStop();
      player.dispose();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, []);
  useEffect(() => {
    playerRef.current?.setVolume(volume);
  }, [volume]);
  const stopAudio = useCallback(() => playerRef.current?.stop(), []);

  /* ---------------- voz / microfone ---------------- */
  const voice = useVoice({
    voiceEnabled: settings?.voice.enabled ?? false,
    wakeEnabled: settings?.wake.enabled ?? false,
    assistantState: state.assistant.state,
    notify,
    onStopAudio: stopAudio,
  });
  const voiceRef = useRef(voice);
  voiceRef.current = voice;

  const evLevels = useRef({ mic: 0, micAt: 0, speech: 0, speechAt: 0 });
  const levels = useCallback(() => {
    const now = performance.now();
    const e = evLevels.current;
    const micEv = decayLevel(e.mic, (now - e.micAt) / 1000);
    const speechEv = decayLevel(e.speech, (now - e.speechAt) / 1000);
    return { mic: Math.max(voiceRef.current.micLevel(), micEv), speech: Math.max(playerRef.current?.level() ?? 0, speechEv) };
  }, []);

  /* ---------------- conexões ---------------- */
  const [refreshingConn, setRefreshingConn] = useState(false);
  const refreshConnections = useCallback(async () => {
    setRefreshingConn(true);
    try {
      dispatch({ type: 'connections', list: await call('system:connections') });
    } catch {
      /* mantém o último estado conhecido */
    } finally {
      setRefreshingConn(false);
    }
  }, []);
  useEffect(() => {
    void refreshConnections();
    const t = setInterval(() => void refreshConnections(), 30_000);
    return () => clearInterval(t);
  }, [refreshConnections]);
  const connTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------------- eventos do motor ---------------- */
  useEffect(() => {
    const off = api().onEvent((e) => {
      switch (e.type) {
        case 'mic_level':
          evLevels.current.mic = e.level;
          evLevels.current.micAt = performance.now();
          return;
        case 'speech_level':
          evLevels.current.speech = e.level;
          evLevels.current.speechAt = performance.now();
          return;
        case 'wake':
          voiceRef.current.onWake();
          return;
        case 'state':
          voiceRef.current.onEngineState(e.state);
          break;
        case 'connection':
          if (connTimer.current) clearTimeout(connTimer.current);
          connTimer.current = setTimeout(() => void refreshConnections(), 1500);
          break;
      }
      dispatch({ type: 'engine', event: e, follow: !!voiceRef.current.sessionRef.current });
    });
    return () => {
      off();
      if (connTimer.current) clearTimeout(connTimer.current);
    };
  }, [refreshConnections]);

  /* ---------------- conversas ---------------- */
  const loadConversations = useCallback(async () => {
    try {
      dispatch({ type: 'conversations', list: await call('chat:list', { limit: 100 }) });
    } catch (e) {
      notify('erro', 'Não foi possível carregar as conversas', errorText(e));
    }
  }, [notify]);
  useEffect(() => {
    void loadConversations();
  }, [loadConversations, state.rev.conversations]);

  useEffect(() => {
    const req = state.loadRequest;
    if (!req) return;
    let alive = true;
    call('chat:messages', { conversationId: req.id }).then(
      (messages) => {
        if (alive) dispatch({ type: 'thread_loaded', id: req.id, messages });
      },
      (err) => {
        if (!alive) return;
        dispatch({ type: 'thread_loaded', id: req.id, messages: [] });
        notify('erro', 'Não foi possível abrir a conversa', errorText(err));
      },
    );
    return () => {
      alive = false;
    };
  }, [state.loadRequest, notify]);

  /* ---------------- agendamentos (nomes para o painel de atividade) ---------------- */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const [list, runs] = await Promise.allSettled([call('schedules:list'), call('schedules:runs', { limit: 10 })]);
      if (!alive) return;
      if (list.status === 'fulfilled') dispatch({ type: 'schedules', names: Object.fromEntries(list.value.map((s) => [s.id, s.name])) });
      if (runs.status === 'fulfilled') dispatch({ type: 'jobs', runs: runs.value });
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (state.rev.schedules === 0) return;
    call('schedules:list').then(
      (list) => dispatch({ type: 'schedules', names: Object.fromEntries(list.map((s) => [s.id, s.name])) }),
      () => undefined,
    );
  }, [state.rev.schedules]);

  /* ---------------- anexos e envio ---------------- */
  const composerRef = useRef<ComposerHandle>(null);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;
  const [processing, setProcessing] = useState(0);
  const [pendingSends, setPendingSends] = useState(0);
  /** Anexos ainda sendo preparados (contam no limite: duas soltadas rápidas não podem passar de 10). */
  const inflight = useRef(0);

  const addFiles = useCallback(
    async (files: File[], pasted?: boolean) => {
      const room = LIMITS.count - attachmentsRef.current.length - inflight.current;
      if (room <= 0) {
        notify('aviso', 'Limite de anexos', `No máximo ${LIMITS.count} anexos por mensagem.`);
        return;
      }
      const list = files.slice(0, room);
      if (files.length > room) notify('aviso', 'Limite de anexos', `Só ${room} ${room === 1 ? 'arquivo foi adicionado' : 'arquivos foram adicionados'} (máximo ${LIMITS.count}).`);
      inflight.current += list.length;
      setProcessing((n) => n + list.length);
      for (const f of list) {
        try {
          const a = await fileToAttachment(pasted ? namePasted(f) : f);
          setAttachments((prev) => [...prev, a]);
          attachmentsRef.current = [...attachmentsRef.current, a];
        } catch (e) {
          notify('aviso', 'Anexo recusado', errorText(e));
        } finally {
          inflight.current--;
          setProcessing((n) => n - 1);
        }
      }
    },
    [notify],
  );

  const sendWith = useCallback(
    async (text: string, atts: Attachment[]): Promise<boolean> => {
      if (!text && atts.length === 0) return false;
      let convId = stateRef.current.currentId;
      if (!convId) {
        try {
          convId = (await call('chat:new')).conversationId;
          dispatch({ type: 'select', id: convId, load: false });
        } catch (e) {
          notify('erro', 'Não foi possível criar a conversa', errorText(e));
          return false;
        }
      }
      const id = convId;
      dispatch({ type: 'local_user', conversationId: id, text, attachments: atts });
      setPendingSends((n) => n + 1);
      call('chat:send', { text, conversationId: id, attachments: atts.length ? atts : undefined, mode: 'text' })
        .then(
          () => dispatch({ type: 'send_ok', conversationId: id }),
          (e) => dispatch({ type: 'send_failed', conversationId: id, error: errorText(e) }),
        )
        .finally(() => {
          setPendingSends((n) => Math.max(0, n - 1));
          void loadConversations();
        });
      return true;
    },
    [notify, loadConversations],
  );

  const send = useCallback(
    async (text: string) => {
      const atts = attachmentsRef.current.map((a) => a.attachment);
      const ok = await sendWith(text, atts);
      if (ok) setAttachments([]);
      return ok;
    },
    [sendWith],
  );

  const stopResponse = useCallback(() => {
    stopAudio();
    call('chat:stop').catch((e) => notify('erro', 'Não foi possível parar', errorText(e)));
  }, [stopAudio, notify]);

  const stopAll = useCallback(async () => {
    stopAudio();
    voiceRef.current.endSession();
    const failed = await stopEverything();
    if (failed) notify('erro', 'Falha ao parar', errorText(failed));
    else notify('info', 'Tudo parado', 'Resposta, ferramentas, fala e escuta foram interrompidas.');
  }, [stopAudio, notify]);
  const stopAllRef = useRef(stopAll);
  stopAllRef.current = stopAll;

  const selectConversation = useCallback((id: string | null) => dispatch({ type: 'select', id }), []);

  const deleteConversation = useCallback(
    async (c: ConversationSummary) => {
      const ok = await ask({ title: 'Apagar conversa?', message: <>“{c.title || 'Sem título'}” e todas as suas mensagens serão apagadas. Não dá para desfazer.</>, confirmLabel: 'Apagar', danger: true });
      if (!ok) return;
      try {
        await call('chat:delete', { conversationId: c.id });
        dispatch({ type: 'conversation_removed', id: c.id });
      } catch (e) {
        notify('erro', 'Não foi possível apagar a conversa', errorText(e));
      }
    },
    [ask, notify],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      try {
        await call('chat:rename', { conversationId: id, title });
        dispatch({ type: 'conversation_renamed', id, title });
      } catch (e) {
        notify('erro', 'Não foi possível renomear', errorText(e));
      }
    },
    [notify],
  );

  const openLink = useCallback(
    (href: string) => {
      openExternal(href).catch((e) => notify('erro', 'Não foi possível abrir o link', errorText(e)));
    },
    [notify],
  );

  /* ---------------- palavra de ativação ---------------- */
  const [wakeBusy, setWakeBusy] = useState(false);
  const setWake = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        const ok = await ask({
          title: 'Ligar a palavra de ativação?',
          message: 'O microfone ficará aberto enquanto o 300 estiver rodando, esperando você dizer “300”. O áudio é analisado neste computador e o indicador “Microfone ativo” fica aceso.',
          confirmLabel: 'Ligar',
        });
        if (!ok) return;
      }
      setWakeBusy(true);
      try {
        await call('voice:setWake', { enabled });
        // o processo principal pode já ter salvo; só grava se ainda estiver diferente
        const s = await settingsApi.reload();
        if (!s || s.wake.enabled !== enabled) await settingsApi.update({ wake: { enabled } });
      } catch (e) {
        notify('erro', 'Não foi possível alterar a palavra de ativação', errorText(e));
      } finally {
        setWakeBusy(false);
      }
    },
    [ask, notify, settingsApi],
  );

  /* ---------------- comandos do sistema e teclado ---------------- */
  useEffect(
    () =>
      api().onCommand((cmd) => {
        switch (cmd) {
          case 'focus-input':
            composerRef.current?.focus();
            break;
          case 'toggle-listen':
            void voiceRef.current.toggle();
            break;
          case 'stop-all':
            void stopAllRef.current();
            break;
          case 'open-settings':
            setSettingsOpen(true);
            break;
        }
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (settingsOpenRef.current) {
        setSettingsOpen(false);
        return;
      }
      // Esc: para a fala do 300
      stopAudio();
      call('voice:stopSpeaking').catch(() => undefined);
    };
    // soltar arquivo ou link fora da área de conversa não pode abrir/navegar a janela
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'file'));
    const block = (e: DragEvent) => {
      if (e.defaultPrevented) return; // a área de conversa já tratou
      const files = !!e.dataTransfer?.types.includes('Files');
      if (files || !editable(e.target)) {
        e.preventDefault();
        if (e.type === 'dragover' && e.dataTransfer) e.dataTransfer.dropEffect = 'none';
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dragover', block);
    window.addEventListener('drop', block);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dragover', block);
      window.removeEventListener('drop', block);
    };
  }, [stopAudio]);

  /* ---------------- confirmações ---------------- */
  const respond = useCallback(
    (id: string, response: ConfirmationResponse) => {
      dispatch({ type: 'confirmation_done', id });
      call('confirm:respond', { id, response }).catch((e) => notify('erro', 'Não foi possível enviar a resposta', errorText(e)));
    },
    [notify],
  );
  const expired = useCallback(
    (id: string) => {
      dispatch({ type: 'confirmation_done', id });
      // reforça a negação (o motor também nega sozinho ao expirar)
      call('confirm:respond', { id, response: { approved: false } }).catch(() => undefined);
    },
    [],
  );

  const dismissToast = useCallback((id: number) => dispatch({ type: 'dismiss_toast', id }), []);
  const clearTranscript = useCallback(() => dispatch({ type: 'clear_transcript' }), []);
  const clearActivity = useCallback(() => dispatch({ type: 'clear_activity' }), []);

  const st = state.assistant.state;
  const busy = pendingSends > 0 || (state.activeTurn !== null && state.activeTurn === state.currentId);
  const listening = voice.session || st === 'LISTENING';
  const confirmation = state.confirmations[0];

  return (
    <div className="app" data-state={st.toLowerCase()}>
      <div className="app-bg" aria-hidden="true" />
      <div className="app-shell" inert={settingsOpen || !!confirmation}>
        <TopBar
          connections={state.connections}
          refreshingConnections={refreshingConn}
          onRefreshConnections={() => void refreshConnections()}
          micOpen={voice.micOpen}
          onOpenSettings={() => setSettingsOpen(true)}
          onStopAll={() => void stopAll()}
        />
        <main className="layout">
          <div className="col col-left">
            <TasksPanel rev={state.rev.tasks} notify={notifyPanel} />
            <ActivityPanel items={state.activity} onClear={clearActivity} />
          </div>
          <div className="col col-center">
            <CenterStage
              state={st}
              detail={state.assistant.detail}
              error={state.assistant.error}
              transcript={state.transcript}
              onClearTranscript={clearTranscript}
              levels={levels}
              listening={listening}
              micOpen={voice.micOpen}
              voiceEnabled={settings?.voice.enabled ?? false}
              wakeEnabled={settings?.wake.enabled ?? false}
              wakeBusy={wakeBusy || !settings}
              hotkey={settings?.wake.hotkey ?? 'CommandOrControl+Shift+Space'}
              onToggleListen={() => void voice.toggle()}
              onToggleWake={(v) => void setWake(v)}
            />
          </div>
          <div className="col col-right">
            <ChatPanel
              ref={composerRef}
              conversations={state.conversations}
              currentId={state.currentId}
              unread={state.unread}
              thread={state.thread}
              streaming={state.streaming}
              loading={state.loadRequest !== null}
              busy={busy}
              assistantState={st}
              tools={state.tools}
              attachments={attachments}
              processing={processing}
              onAddFiles={(files, pasted) => void addFiles(files, pasted)}
              onRemoveAttachment={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              onSend={send}
              onRetry={(key, text, atts) => {
                dispatch({ type: 'remove_item', key });
                void sendWith(text, atts);
              }}
              onStop={stopResponse}
              onSelect={selectConversation}
              onDelete={(c) => void deleteConversation(c)}
              onRename={(id, title) => void renameConversation(id, title)}
              onOpenLink={openLink}
            />
          </div>
        </main>
      </div>

      {settingsOpen && (
        <div inert={!!confirmation}>
          <SettingsDrawer
            settings={settings}
            loadError={settingsApi.loadError}
            update={settingsApi.update}
            reloadSettings={settingsApi.reload}
            notify={notify}
            connections={state.connections}
            refreshConnections={() => void refreshConnections()}
            memoryRev={state.rev.memory}
            setWake={setWake}
            section={section}
            onSection={setSection}
            onClose={() => setSettingsOpen(false)}
            onStopAll={() => void stopAll()}
          />
        </div>
      )}

      <Toasts toasts={state.toasts} onDismiss={dismissToast} />

      {confirmation && <ConfirmModal key={confirmation.id} request={confirmation} queued={state.confirmations.length} onRespond={respond} onExpired={expired} />}

      <span className="sr-only" aria-live="assertive">
        {confirmation ? `Pedido de permissão: ${confirmation.title}` : ''}
      </span>
      <span className="sr-only">{`Estado: ${STATE_LABEL[st]}`}</span>
    </div>
  );
}

export function App() {
  return (
    <DialogProvider>
      <AppInner />
    </DialogProvider>
  );
}
