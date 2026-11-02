/** Painel de atividade: ferramentas em execução, agendamentos e erros. */
import { useEffect, useState } from 'react';
import { formatTime, riskInfo } from '../lib/format';
import type { ActivityItem } from '../lib/store';
import { Spinner } from './controls';
import { IconCheck, IconClock, IconTool, IconWarning, IconX } from './icons';

function StatusIcon({ status }: { status: ActivityItem['status'] }) {
  switch (status) {
    case 'running':
      return <Spinner size={13} />;
    case 'ok':
      return <IconCheck size={14} />;
    case 'erro':
      return <IconX size={14} />;
    case 'aguardando':
      return <IconClock size={14} />;
    case 'cancelado':
      return <IconX size={14} />;
    default:
      return <IconWarning size={14} />;
  }
}

const STATUS_TEXT: Record<ActivityItem['status'], string> = {
  running: 'em andamento',
  ok: 'concluído',
  erro: 'falhou',
  aguardando: 'aguardando aprovação',
  cancelado: 'cancelado',
  info: '',
};

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.round((Date.now() - since) / 1000));
  return <span className="mono">{s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${s % 60}s`}</span>;
}

export function ActivityPanel({ items, onClear }: { items: ActivityItem[]; onClear: () => void }) {
  const running = items.filter((i) => i.status === 'running').length;
  return (
    <section className="panel activity" aria-label="Atividade">
      <header className="panel-head">
        <h2 className="panel-title">Atividade</h2>
        {running > 0 && <span className="panel-count is-live">{running} em andamento</span>}
        <span className="flex-spacer" />
        {items.length > 0 && (
          <button type="button" className="link-btn small" onClick={onClear}>
            Limpar
          </button>
        )}
      </header>
      <div className="panel-scroll">
        {items.length === 0 ? (
          <div className="panel-empty">As ações do 300 aparecem aqui.</div>
        ) : (
          <ul className="act-list">
            {items.map((a) => (
              <li key={a.id} className={`act status-${a.status}`}>
                <span className="act-icon" aria-hidden="true">
                  <StatusIcon status={a.status} />
                </span>
                <div className="act-main">
                  <div className="act-top">
                    {a.kind === 'job' ? <IconClock size={12} className="act-kind" /> : a.kind === 'tool' ? <IconTool size={12} className="act-kind" /> : null}
                    <span className="act-title">{a.title}</span>
                    <span className="act-time">{a.status === 'running' ? <Elapsed since={a.ts} /> : formatTime(a.ts)}</span>
                  </div>
                  {a.detail && <div className="act-detail">{a.detail}</div>}
                  <div className="act-tags">
                    {STATUS_TEXT[a.status] && <span className="act-status">{STATUS_TEXT[a.status]}</span>}
                    {a.risk && a.risk !== 'read' && <span className={`act-risk tone-text-${riskInfo(a.risk).tone}`}>{riskInfo(a.risk).label}</span>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
