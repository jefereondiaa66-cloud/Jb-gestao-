/**
 * Pedido de confirmação do motor antes de uma ação com risco.
 * Segurança: "Negar" tem o foco inicial, Esc nega, "Permitir" só fica
 * clicável após um instante (evita clique acidental quando o pedido surge),
 * e "Permitir nesta sessão" só existe para riscos de leitura/escrita local.
 */
import { useEffect, useRef, useState } from 'react';
import type { ConfirmationRequest, ConfirmationResponse } from '../../../core/types';
import { ACTOR_LABEL, prettyJson, riskInfo } from '../lib/format';
import { trapTab } from './Dialog';
import { IconShield, IconWarning } from './icons';

export const ARM_DELAY_MS = 800;

export interface ConfirmModalProps {
  request: ConfirmationRequest;
  queued: number;
  onRespond: (id: string, response: ConfirmationResponse) => void;
  onExpired: (id: string) => void;
}

function useCountdown(expiresAt: string): number {
  const end = Date.parse(expiresAt);
  const [left, setLeft] = useState(() => (Number.isNaN(end) ? 0 : end - Date.now()));
  useEffect(() => {
    if (Number.isNaN(end)) return;
    const tick = () => setLeft(end - Date.now());
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [end]);
  return Number.isNaN(end) ? Number.POSITIVE_INFINITY : left;
}

function formatLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

export function ConfirmModal({ request, queued, onRespond, onExpired }: ConfirmModalProps) {
  const [remember, setRemember] = useState(false);
  const [armed, setArmed] = useState(false);
  const [sent, setSent] = useState(false);
  const denyRef = useRef<HTMLButtonElement>(null);
  const left = useCountdown(request.expiresAt);
  const expired = left <= 0;
  const risk = riskInfo(request.risk);
  const allowRemember = request.risk === 'read' || request.risk === 'write';
  const total = Math.max(1, Date.parse(request.expiresAt) - Date.parse(request.createdAt));
  const fraction = Number.isFinite(left) ? Math.max(0, Math.min(1, left / total)) : 1;

  // novo pedido: reinicia estado e foco em "Negar"; ao fechar, o foco volta para onde estava
  useEffect(() => {
    const prev = document.activeElement;
    setRemember(false);
    setSent(false);
    setArmed(false);
    denyRef.current?.focus();
    const t = setTimeout(() => setArmed(true), ARM_DELAY_MS);
    return () => {
      clearTimeout(t);
      if (prev instanceof HTMLElement && prev.isConnected && !prev.closest('.overlay-confirm')) prev.focus();
    };
  }, [request.id]);

  // expirou: o motor nega sozinho; avisamos e fechamos
  useEffect(() => {
    if (!expired || sent) return;
    const t = setTimeout(() => onExpired(request.id), 2500);
    return () => clearTimeout(t);
  }, [expired, sent, request.id, onExpired]);

  const respond = (approved: boolean) => {
    if (sent) return;
    if (approved && (!armed || expired)) return;
    setSent(true);
    onRespond(request.id, approved ? (allowRemember && remember ? { approved: true, remember: 'session' } : { approved: true }) : { approved: false });
  };

  // Esc nega, em qualquer lugar da janela (captura, antes dos outros atalhos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      respond(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const inputText = prettyJson(request.input);
  const hasInput = request.input !== undefined && request.input !== null && inputText !== '{}';

  return (
    <div className="overlay overlay-confirm" role="presentation" onKeyDown={trapTab}>
      <div className={`confirm risk-${risk.tone}`} role="alertdialog" aria-modal="true" aria-labelledby="cf-title" aria-describedby="cf-desc">
        <div className="confirm-head">
          <span className={`confirm-shield tone-${risk.tone}`} aria-hidden="true">
            <IconShield size={22} />
          </span>
          <div className="confirm-head-text">
            <span className="confirm-kicker">
              Pedido de permissão{queued > 1 ? ` · 1 de ${queued}` : ''} · {ACTOR_LABEL[request.actor] ?? request.actor}
            </span>
            <h2 id="cf-title">{request.title}</h2>
          </div>
          <div className={'confirm-timer' + (left < 15000 ? ' is-low' : '')} aria-label={expired ? 'Tempo esgotado' : `Tempo restante: ${formatLeft(left)}`}>
            <svg viewBox="0 0 36 36" aria-hidden="true">
              <circle cx="18" cy="18" r="15.5" className="timer-track" />
              <circle cx="18" cy="18" r="15.5" className="timer-bar" style={{ strokeDashoffset: `${(1 - fraction) * 97.4}` }} />
            </svg>
            <span>{expired ? '0s' : Number.isFinite(left) ? formatLeft(left) : '—'}</span>
          </div>
        </div>

        <p id="cf-desc" className="confirm-desc">
          {request.description}
        </p>

        <div className={`confirm-risk tone-${risk.tone}`}>
          <span className={`badge tone-${risk.tone}`}>{risk.label}</span>
          <span>{risk.explanation}</span>
        </div>

        {request.tainted && (
          <div className="confirm-taint" role="note">
            <IconWarning size={18} />
            <span>
              <strong>Atenção:</strong> Este pedido surgiu depois de ler conteúdo externo (internet, e-mail ou arquivo). Confira com atenção.
            </span>
          </div>
        )}

        <details className="confirm-details">
          <summary>
            Detalhes técnicos <span className="mono muted">({request.tool})</span>
          </summary>
          {hasInput ? <pre className="confirm-json">{inputText}</pre> : <p className="muted small">Sem parâmetros.</p>}
        </details>

        {expired && !sent && <div className="confirm-expired">Tempo esgotado. O pedido foi negado automaticamente.</div>}

        <div className="confirm-actions">
          {allowRemember ? (
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} disabled={expired || sent} />
              <span>Permitir nesta sessão</span>
            </label>
          ) : (
            <span className="confirm-once muted small">Esta permissão vale só para esta ação.</span>
          )}
          <div className="confirm-buttons">
            <button ref={denyRef} type="button" className="btn btn-lg" onClick={() => respond(false)} disabled={sent}>
              Negar
            </button>
            <button type="button" className={'btn btn-lg btn-allow' + (armed ? '' : ' is-arming')} onClick={() => respond(true)} disabled={!armed || expired || sent} aria-disabled={!armed || expired || sent}>
              Permitir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
