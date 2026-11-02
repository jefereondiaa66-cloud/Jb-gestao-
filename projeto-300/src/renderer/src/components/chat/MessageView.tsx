/** Exibição de mensagens e atividades de ferramentas dentro da conversa. */
import { memo, type ReactNode } from 'react';
import type { ChatMessage } from '../../../../core/types';
import type { Attachment } from '../../../../shared/ipc';
import { formatBytes, displayName, base64ByteLength } from '../../lib/attachments';
import { RISK_INFO, formatTime } from '../../lib/format';
import { attachedFileName, type ThreadItem, type ToolInfo } from '../../lib/store';
import { Markdown } from '../Markdown';
import { Spinner } from '../controls';
import { IconCheck, IconFile, IconTool, IconWarning, IconX } from '../icons';

export interface ToolRowProps {
  callId: string;
  name: string;
  info?: ToolInfo;
  result?: { isError: boolean; text: string };
}

/** Nome de ferramenta legível quando não há título ("web_search" -> "Web search"). */
function humanize(name: string): string {
  const s = name.replace(/^mcp__?/, '').replace(/[_-]+/g, ' ').trim();
  return s ? s[0]!.toUpperCase() + s.slice(1) : name;
}

export function ToolRow({ name, info, result }: ToolRowProps) {
  const status = info?.status ?? (result ? (result.isError ? 'erro' : 'ok') : 'ok');
  const title = info?.title || humanize(name);
  const detail = info?.summary || info?.description || (result ? result.text.slice(0, 160) : '');
  const risk = info?.risk;
  return (
    <div className={`tool-row status-${status}`} title={detail || title}>
      <span className="tool-row-icon" aria-hidden="true">
        {status === 'running' ? <Spinner size={13} /> : status === 'erro' ? <IconX size={14} /> : <IconCheck size={14} />}
      </span>
      <IconTool size={14} className="tool-row-kind" />
      <span className="tool-row-title">{title}</span>
      {detail && <span className="tool-row-detail">{detail}</span>}
      {risk && risk !== 'read' && <span className={`tool-row-risk tone-text-${RISK_INFO[risk].tone}`}>{RISK_INFO[risk].label}</span>}
      <span className="sr-only">{status === 'running' ? 'em andamento' : status === 'erro' ? 'falhou' : 'concluída'}</span>
    </div>
  );
}

function AttachmentChips({ attachments }: { attachments: Attachment[] }) {
  return (
    <div className="msg-attachments">
      {attachments.map((a, i) =>
        a.mediaType.startsWith('image/') ? (
          <img key={i} className="msg-thumb" src={`data:${a.mediaType};base64,${a.data}`} alt={displayName(a.name)} title={displayName(a.name)} />
        ) : (
          <span key={i} className="file-chip">
            <IconFile size={14} />
            <span className="file-chip-name">{displayName(a.name)}</span>
            <span className="file-chip-size">{formatBytes(base64ByteLength(a.data))}</span>
          </span>
        ),
      )}
    </div>
  );
}

function UserContent({ message, attachments }: { message: ChatMessage; attachments?: Attachment[] }) {
  const texts: string[] = [];
  const notes: string[] = [];
  const files: Attachment[] = [];
  const named: string[] = [];
  for (const p of message.parts) {
    if (p.type === 'text') {
      const fileName = attachedFileName(p.text);
      if (fileName) named.push(fileName);
      else if (p.text.startsWith('[Anexo] ')) notes.push(p.text.slice(8));
      else texts.push(p.text);
    } else if (p.type === 'image') files.push({ name: 'imagem', mediaType: p.mediaType, data: p.data });
    else if (p.type === 'document') named.push(p.name || 'documento.pdf');
  }
  const shown = attachments ?? files;
  return (
    <>
      {shown.length > 0 && <AttachmentChips attachments={shown} />}
      {!attachments && named.length > 0 && (
        <div className="msg-attachments">
          {named.map((n, i) => (
            <span key={i} className="file-chip">
              <IconFile size={14} />
              <span className="file-chip-name">{displayName(n)}</span>
            </span>
          ))}
        </div>
      )}
      {texts.length > 0 && <div className="msg-text">{texts.join('\n')}</div>}
      {notes.map((n, i) => (
        <div key={i} className="msg-note">
          <IconWarning size={13} /> {n}
        </div>
      ))}
    </>
  );
}

export interface MessageViewProps {
  item: Extract<ThreadItem, { kind: 'msg' }>;
  tools: Record<string, ToolInfo>;
  results: Map<string, { isError: boolean; text: string }>;
  onOpenLink: (href: string) => void;
  onRetry?: (key: string, text: string, attachments: Attachment[]) => void;
}

export const MessageView = memo(function MessageView({ item, tools, results, onOpenLink, onRetry }: MessageViewProps) {
  const m = item.message;
  if (m.role === 'context' || m.role === 'tool') return null;
  const time = formatTime(m.createdAt);

  if (m.role === 'user') {
    const text = m.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
    return (
      <div className={'msg msg-user' + (item.failed ? ' is-failed' : '') + (item.local ? ' is-pending' : '')}>
        <div className="msg-bubble">
          <UserContent message={m} attachments={item.attachments} />
        </div>
        <div className="msg-meta">
          {item.failed ? (
            <span className="msg-failed">
              Não enviada: {item.failed}
              {onRetry && (
                <button type="button" className="link-btn" onClick={() => onRetry(item.key, text, item.attachments ?? [])}>
                  Tentar de novo
                </button>
              )}
            </span>
          ) : (
            <span>{item.local && !item.sent ? 'enviando…' : time}</span>
          )}
        </div>
      </div>
    );
  }

  // assistente: texto e chamadas de ferramenta na ordem em que vieram
  const blocks: ReactNode[] = [];
  let buffer = '';
  const flush = (key: string) => {
    if (buffer.trim()) blocks.push(<Markdown key={key} text={buffer} onOpenLink={onOpenLink} />);
    buffer = '';
  };
  m.parts.forEach((p, i) => {
    if (p.type === 'text') buffer += (buffer ? '\n\n' : '') + p.text;
    else if (p.type === 'tool_call') {
      flush('t' + i);
      blocks.push(<ToolRow key={'c' + i} callId={p.id} name={p.name} info={tools[p.id]} result={results.get(p.id)} />);
    }
  });
  flush('end');
  if (blocks.length === 0) return null;
  return (
    <div className="msg msg-assistant">
      <div className="msg-avatar" aria-hidden="true">
        <span />
      </div>
      <div className="msg-body">
        <div className="msg-bubble">{blocks}</div>
        <div className="msg-meta">
          <span>300 · {time}</span>
        </div>
      </div>
    </div>
  );
});

export function StreamingView({ text, onOpenLink }: { text: string; onOpenLink: (href: string) => void }) {
  return (
    <div className="msg msg-assistant is-streaming">
      <div className="msg-avatar is-live" aria-hidden="true">
        <span />
      </div>
      <div className="msg-body">
        <div className="msg-bubble">
          <Markdown text={text} onOpenLink={onOpenLink} streaming />
        </div>
      </div>
    </div>
  );
}

export function TypingView({ label }: { label: string }) {
  return (
    <div className="msg msg-assistant is-typing">
      <div className="msg-avatar is-live" aria-hidden="true">
        <span />
      </div>
      <div className="msg-body">
        <div className="msg-bubble typing">
          <span className="typing-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="typing-label">{label}</span>
        </div>
      </div>
    </div>
  );
}
