/**
 * Diálogos de confirmação da própria interface (apagar, exportar...).
 * Uso: const ask = useDialog(); if (await ask({ title, message })) { ... }
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { IconWarning } from './icons';

export interface DialogOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type Ask = (opts: DialogOptions) => Promise<boolean>;

const DialogContext = createContext<Ask>(async () => false);

export function useDialog(): Ask {
  return useContext(DialogContext);
}

interface Pending extends DialogOptions {
  id: number;
  resolve: (v: boolean) => void;
}

let nextId = 0;

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Pending[]>([]);
  const ask = useCallback<Ask>((opts) => new Promise<boolean>((resolve) => setQueue((q) => [...q, { ...opts, id: ++nextId, resolve }])), []);
  const current = queue[0];
  // remove pelo próprio item: dois cliques rápidos não podem descartar o próximo diálogo da fila
  const close = (v: boolean) => {
    if (!current) return;
    current.resolve(v);
    setQueue((q) => q.filter((x) => x !== current));
  };

  // Esc fecha o diálogo mesmo com o foco fora dele (antes, fechava a gaveta que estava atrás).
  // Escuta em document (captura): o pedido de confirmação do motor, que fica por cima e
  // escuta em window, tem prioridade e interrompe a propagação.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      current.resolve(false);
      setQueue((q) => q.filter((x) => x !== current));
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [current]);

  return (
    <DialogContext.Provider value={ask}>
      {children}
      {current && <DialogView key={current.id} opts={current} onClose={close} />}
    </DialogContext.Provider>
  );
}

function DialogView({ opts, onClose }: { opts: DialogOptions; onClose: (v: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const prevFocus = useRef<Element | null>(null);
  useEffect(() => {
    prevFocus.current = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus();
    };
  }, []);
  return (
    <div
      className="overlay overlay-dialog"
      role="presentation"
      onKeyDown={trapTab}
    >
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
        <div className="dialog-head">
          {opts.danger && <IconWarning size={20} className="dialog-icon" />}
          <h2 id="dlg-title">{opts.title}</h2>
        </div>
        <div id="dlg-msg" className="dialog-msg">
          {opts.message}
        </div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="btn" onClick={() => onClose(false)}>
            {opts.cancelLabel ?? 'Cancelar'}
          </button>
          <button type="button" className={'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary')} onClick={() => onClose(true)}>
            {opts.confirmLabel ?? 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mantém o foco do Tab dentro do diálogo. */
export function trapTab(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Tab') return;
  const root = e.currentTarget;
  const focusables = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'));
  if (focusables.length === 0) return;
  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
