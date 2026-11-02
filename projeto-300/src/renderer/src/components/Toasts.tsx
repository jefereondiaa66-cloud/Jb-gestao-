/** Avisos flutuantes (notificações do motor, erros, confirmações de ação). */
import { useEffect } from 'react';
import type { Toast } from '../lib/store';
import { IconCheck, IconWarning, IconX } from './icons';

const DURATION: Record<Toast['tone'], number> = { info: 6000, ok: 4000, aviso: 9000, erro: 10000 };

function ToastView({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(toast.id), DURATION[toast.tone]);
    return () => clearTimeout(t);
  }, [toast.id, toast.tone, onDismiss]);
  return (
    <div className={`toast tone-${toast.tone}`} role={toast.tone === 'erro' ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        {toast.tone === 'ok' ? <IconCheck size={16} /> : toast.tone === 'info' ? <span className="toast-dot" /> : <IconWarning size={16} />}
      </span>
      <div className="toast-text">
        <div className="toast-title">{toast.title}</div>
        {toast.body && <div className="toast-body">{toast.body}</div>}
      </div>
      <button type="button" className="icon-btn toast-close" onClick={() => onDismiss(toast.id)} aria-label="Fechar aviso">
        <IconX size={14} />
      </button>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <ToastView key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
