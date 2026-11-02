/** Painel de conversa: lista de conversas, histórico, transmissão e caixa de mensagem. */
import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { AssistantState, ConversationSummary } from '../../../../core/types';
import type { Attachment } from '../../../../shared/ipc';
import { formatRelative } from '../../lib/format';
import { toolResultsOf, type ThreadItem, type ToolInfo } from '../../lib/store';
import type { PendingAttachment } from '../../lib/attach-file';
import { Composer, type ComposerHandle } from './Composer';
import { MessageView, StreamingView, ToolRow, TypingView } from './MessageView';
import { IconCheck, IconEdit, IconHistory, IconPlus, IconSearch, IconTrash, IconX } from '../icons';
import { Spinner } from '../controls';

export interface ChatPanelProps {
  conversations: ConversationSummary[];
  currentId: string | null;
  unread: Record<string, boolean>;
  thread: ThreadItem[];
  streaming: string;
  loading: boolean;
  busy: boolean;
  assistantState: AssistantState;
  tools: Record<string, ToolInfo>;
  attachments: PendingAttachment[];
  processing: number;
  onAddFiles: (files: File[], pasted?: boolean) => void;
  onRemoveAttachment: (id: string) => void;
  onSend: (text: string) => Promise<boolean> | boolean;
  onRetry: (key: string, text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  onSelect: (id: string | null) => void;
  onDelete: (c: ConversationSummary) => void;
  onRename: (id: string, title: string) => void;
  onOpenLink: (href: string) => void;
}

const SUGGESTIONS = ['Quais são minhas tarefas pendentes?', 'Pesquise as principais notícias de hoje', 'Me lembre de beber água daqui a 1 hora', 'Resuma este arquivo para mim'];

function ConversationList({
  conversations,
  currentId,
  unread,
  onSelect,
  onDelete,
  onRename,
  onClose,
}: Pick<ChatPanelProps, 'conversations' | 'currentId' | 'unread' | 'onSelect' | 'onDelete' | 'onRename'> & { onClose: () => void }) {
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => searchRef.current?.focus(), []);
  const list = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? conversations.filter((c) => c.title.toLowerCase().includes(f)) : conversations;
  }, [conversations, filter]);

  return (
    <div
      className="conv-list"
      role="dialog"
      aria-label="Conversas"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !editing) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="conv-list-head">
        <div className="search-box">
          <IconSearch size={15} />
          <input ref={searchRef} className="input bare" placeholder="Buscar conversa…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Buscar conversa" />
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar lista de conversas">
          <IconX size={16} />
        </button>
      </div>
      <ul className="conv-items">
        {list.length === 0 && <li className="muted small conv-empty">{filter ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}</li>}
        {list.map((c) => (
          <li key={c.id} className={'conv-item' + (c.id === currentId ? ' is-current' : '')}>
            {editing === c.id ? (
              <form
                className="conv-rename"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = title.trim();
                  if (t && t !== c.title) onRename(c.id, t.slice(0, 120));
                  setEditing(null);
                }}
              >
                <input
                  className="input"
                  value={title}
                  autoFocus
                  maxLength={120}
                  aria-label="Novo nome da conversa"
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
                <button type="submit" className="icon-btn" aria-label="Salvar nome">
                  <IconCheck size={15} />
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  className="conv-open"
                  onClick={() => {
                    onSelect(c.id);
                    onClose();
                  }}
                >
                  {unread[c.id] && <span className="unread-dot" aria-label="não lida" />}
                  <span className="conv-title">{c.title || 'Sem título'}</span>
                  <span className="conv-meta">
                    {formatRelative(c.updatedAt)} · {c.messageCount} msg
                  </span>
                </button>
                <div className="conv-actions">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Renomear conversa ${c.title}`}
                    onClick={() => {
                      setEditing(c.id);
                      setTitle(c.title);
                    }}
                  >
                    <IconEdit size={14} />
                  </button>
                  <button type="button" className="icon-btn danger" aria-label={`Apagar conversa ${c.title}`} onClick={() => onDelete(c)}>
                    <IconTrash size={14} />
                  </button>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export const ChatPanel = forwardRef<ComposerHandle, ChatPanelProps>(function ChatPanel(p, composerRef) {
  const [listOpen, setListOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const innerComposer = useRef<ComposerHandle | null>(null);

  const results = useMemo(() => toolResultsOf(p.thread), [p.thread]);
  const current = p.conversations.find((c) => c.id === p.currentId);
  const unreadCount = Object.values(p.unread).filter(Boolean).length;
  const visible = p.thread.filter((it) => it.kind === 'tool' || (it.message.role !== 'context' && it.message.role !== 'tool'));
  const empty = visible.length === 0 && !p.streaming && !p.loading;

  // rola para o fim quando chega conteúdo, se o usuário já estava no fim
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [p.thread, p.streaming, p.busy]);
  useEffect(() => {
    stick.current = true;
  }, [p.currentId]);

  const setComposer = (h: ComposerHandle | null) => {
    innerComposer.current = h;
    if (typeof composerRef === 'function') composerRef(h);
    else if (composerRef) composerRef.current = h;
  };

  const showTyping = p.busy && !p.streaming && (p.assistantState === 'THINKING' || p.assistantState === 'IDLE' || p.assistantState === 'LISTENING');

  return (
    <section
      className={'panel chat' + (dragging ? ' is-dragging' : '')}
      aria-label="Conversa"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) p.onAddFiles(files);
      }}
    >
      <header className="panel-head chat-head">
        <button type="button" className="chat-title-btn" onClick={() => setListOpen((v) => !v)} aria-expanded={listOpen} aria-label="Mostrar conversas">
          <IconHistory size={17} />
          <span className="chat-title">{current?.title || (p.currentId ? 'Conversa' : 'Nova conversa')}</span>
          {unreadCount > 0 && <span className="count-badge">{unreadCount}</span>}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            p.onSelect(null);
            setListOpen(false);
            innerComposer.current?.focus();
          }}
          aria-label="Começar nova conversa"
        >
          <IconPlus size={15} /> Nova
        </button>
      </header>

      {listOpen && (
        <ConversationList
          conversations={p.conversations}
          currentId={p.currentId}
          unread={p.unread}
          onSelect={p.onSelect}
          onDelete={p.onDelete}
          onRename={p.onRename}
          onClose={() => setListOpen(false)}
        />
      )}

      <div
        ref={scrollRef}
        className="thread"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {p.loading && (
          <div className="thread-loading">
            <Spinner size={16} /> Carregando conversa…
          </div>
        )}
        {empty && (
          <div className="thread-empty">
            <div className="thread-empty-mark" aria-hidden="true" />
            <h2>Como posso ajudar?</h2>
            <p>Escreva, fale ou arraste um arquivo. Eu peço sua confirmação antes de qualquer ação importante.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="suggestion" onClick={() => innerComposer.current?.setText(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {visible.map((it) =>
          it.kind === 'tool' ? (
            <div key={it.key} className="msg msg-tool">
              <ToolRow callId={it.callId} name={p.tools[it.callId]?.name ?? 'ferramenta'} info={p.tools[it.callId]} result={results.get(it.callId)} />
            </div>
          ) : (
            <MessageView key={it.key} item={it} tools={p.tools} results={results} onOpenLink={p.onOpenLink} onRetry={p.onRetry} />
          ),
        )}
        {p.streaming && <StreamingView text={p.streaming} onOpenLink={p.onOpenLink} />}
        {showTyping && <TypingView label="Pensando…" />}
      </div>

      <Composer
        ref={setComposer}
        busy={p.busy}
        attachments={p.attachments}
        processing={p.processing}
        onAddFiles={p.onAddFiles}
        onRemoveAttachment={p.onRemoveAttachment}
        onSend={p.onSend}
        onStop={p.onStop}
      />

      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-box">Solte os arquivos aqui para anexar</div>
        </div>
      )}
    </section>
  );
});
