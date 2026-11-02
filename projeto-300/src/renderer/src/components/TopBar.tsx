/** Barra superior: marca, conexões, indicador do microfone, configurações e PARAR. */
import { useEffect, useRef, useState } from 'react';
import type { ConnectionStatus } from '../../../shared/ipc';
import { CONNECTION_LABEL } from '../lib/format';
import { IconGear, IconMic, IconRefresh, IconStop } from './icons';
import { Spinner } from './controls';

export interface TopBarProps {
  connections: ConnectionStatus[];
  refreshingConnections: boolean;
  onRefreshConnections: () => void;
  micOpen: boolean;
  onOpenSettings: () => void;
  onStopAll: () => void;
  stopHint?: string;
}

const STATUS_TONE: Record<ConnectionStatus['status'], string> = { ok: 'green', erro: 'red', desconectado: 'gray', verificando: 'amber' };

export function Brand() {
  return (
    <div className="brand" aria-label="300">
      <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" className="brand-ring" />
        <circle cx="20" cy="20" r="12.5" className="brand-ring2" />
        <circle cx="20" cy="20" r="6" className="brand-core" />
      </svg>
      <div className="brand-text">
        <span className="brand-name">300</span>
        <span className="brand-sub">assistente pessoal</span>
      </div>
    </div>
  );
}

function ConnectionsMenu({ connections, refreshing, onRefresh }: { connections: ConnectionStatus[]; refreshing: boolean; onRefresh: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const ok = connections.filter((c) => c.status === 'ok').length;
  const bad = connections.filter((c) => c.status === 'erro').length;
  const summary = connections.length === 0 ? 'Sem informações' : bad > 0 ? `${bad} com problema` : `${ok} de ${connections.length} ativas`;

  return (
    <div className="conn" ref={ref}>
      <button type="button" className={'conn-btn' + (bad ? ' has-error' : '')} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((v) => !v)} title="Estado das conexões">
        <span className="conn-dots" aria-hidden="true">
          {connections.slice(0, 8).map((c) => (
            <span key={c.service} className={`dot tone-${STATUS_TONE[c.status]}`} />
          ))}
          {connections.length === 0 && <span className="dot tone-gray" />}
        </span>
        <span className="conn-label">Conexões</span>
        <span className="conn-summary">{summary}</span>
      </button>
      {open && (
        <div className="conn-pop" role="dialog" aria-label="Conexões">
          <div className="conn-pop-head">
            <span>Conexões</span>
            <button type="button" className="icon-btn" onClick={onRefresh} aria-label="Verificar conexões agora" disabled={refreshing}>
              {refreshing ? <Spinner size={14} /> : <IconRefresh size={16} />}
            </button>
          </div>
          {connections.length === 0 ? (
            <p className="muted small">Nenhuma conexão informada pelo motor ainda.</p>
          ) : (
            <ul className="conn-list">
              {connections.map((c) => (
                <li key={c.service} className="conn-item">
                  <span className={`dot tone-${STATUS_TONE[c.status]}`} aria-hidden="true" />
                  <div className="conn-item-text">
                    <span className="conn-item-label">{c.label || c.service}</span>
                    {c.detail && <span className="conn-item-detail">{c.detail}</span>}
                  </div>
                  <span className={`conn-item-status tone-text-${STATUS_TONE[c.status]}`}>{CONNECTION_LABEL[c.status]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function TopBar(p: TopBarProps) {
  return (
    <header className="topbar">
      <Brand />
      <ConnectionsMenu connections={p.connections} refreshing={p.refreshingConnections} onRefresh={p.onRefreshConnections} />
      <div className="topbar-right">
        <div className={'mic-indicator' + (p.micOpen ? ' is-live' : '')} role="status" aria-live="polite" title={p.micOpen ? 'O microfone está aberto' : 'O microfone está fechado'}>
          <IconMic size={15} />
          <span>{p.micOpen ? 'Microfone ativo' : 'Microfone fechado'}</span>
          {p.micOpen && <span className="mic-indicator-dot" aria-hidden="true" />}
        </div>
        <button type="button" className="icon-btn icon-btn-lg" onClick={p.onOpenSettings} aria-label="Abrir configurações" title="Configurações">
          <IconGear size={20} />
        </button>
        <button type="button" className="kill" onClick={p.onStopAll} aria-label="Parar tudo: resposta, ferramentas, fala e escuta" title={p.stopHint ?? 'Parar tudo'}>
          <IconStop size={16} />
          <span>PARAR</span>
        </button>
      </div>
    </header>
  );
}
