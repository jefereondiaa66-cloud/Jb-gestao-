/** Caixa de mensagem: texto, anexos (botão, colar), enviar / parar. */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { ACCEPT_ATTR, formatBytes } from '../../lib/attachments';
import type { PendingAttachment } from '../../lib/attach-file';
import { IconClip, IconFile, IconSend, IconStop, IconX } from '../icons';
import { Spinner } from '../controls';

export interface ComposerHandle {
  focus(): void;
  setText(text: string): void;
}

export interface ComposerProps {
  busy: boolean;
  attachments: PendingAttachment[];
  processing: number;
  onAddFiles: (files: File[], pasted?: boolean) => void;
  onRemoveAttachment: (id: string) => void;
  /** Devolve true quando a mensagem foi aceita (limpa a caixa). */
  onSend: (text: string) => Promise<boolean> | boolean;
  onStop: () => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(p, ref) {
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);

  useImperativeHandle(ref, () => ({
    focus: () => taRef.current?.focus(),
    setText: (t: string) => {
      setText(t);
      requestAnimationFrame(() => {
        const ta = taRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(t.length, t.length);
      });
    },
  }));

  // altura automática (até ~8 linhas)
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  }, [text]);

  const canSend = (text.trim().length > 0 || p.attachments.length > 0) && p.processing === 0;

  const submit = async () => {
    if (p.busy || !canSend || sending.current) return;
    sending.current = true;
    try {
      const ok = await p.onSend(text.trim());
      if (ok) setText('');
    } finally {
      sending.current = false;
    }
  };

  return (
    <div className="composer">
      {(p.attachments.length > 0 || p.processing > 0) && (
        <div className="composer-attachments" aria-label="Anexos">
          {p.attachments.map((a) => (
            <div key={a.id} className="attach-chip" title={a.note ? `${a.attachment.name} (${a.note})` : a.attachment.name}>
              {a.preview ? <img src={a.preview} alt="" className="attach-thumb" /> : <IconFile size={16} />}
              <span className="attach-name">{a.attachment.name}</span>
              <span className="attach-size">{formatBytes(a.size)}</span>
              <button type="button" className="attach-remove" onClick={() => p.onRemoveAttachment(a.id)} aria-label={`Remover anexo ${a.attachment.name}`}>
                <IconX size={12} />
              </button>
            </div>
          ))}
          {p.processing > 0 && (
            <div className="attach-chip is-loading">
              <Spinner size={14} />
              <span className="attach-name">Preparando anexo…</span>
            </div>
          )}
        </div>
      )}
      <div className="composer-row">
        <button type="button" className="icon-btn composer-attach" onClick={() => fileRef.current?.click()} aria-label="Anexar arquivo (imagem, PDF ou texto)" title="Anexar arquivo">
          <IconClip size={19} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) p.onAddFiles(files);
          }}
        />
        <textarea
          ref={taRef}
          className="composer-input"
          rows={1}
          value={text}
          placeholder="Escreva para o 300…"
          aria-label="Mensagem para o 300"
          spellCheck
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf');
            if (files.length) {
              e.preventDefault();
              p.onAddFiles(files, true);
            }
          }}
        />
        {p.busy ? (
          <button type="button" className="send-btn is-stop" onClick={p.onStop} aria-label="Parar a resposta" title="Parar a resposta">
            <IconStop size={16} />
          </button>
        ) : (
          <button type="button" className="send-btn" onClick={() => void submit()} disabled={!canSend} aria-label="Enviar mensagem" title="Enviar (Enter)">
            <IconSend size={18} />
          </button>
        )}
      </div>
      <div className="composer-hint">
        <span>
          <kbd>Enter</kbd> envia · <kbd>Shift</kbd>+<kbd>Enter</kbd> nova linha
        </span>
        <span>Arraste ou cole imagens, PDF ou texto</span>
      </div>
    </div>
  );
});
