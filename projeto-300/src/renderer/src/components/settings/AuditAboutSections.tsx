/** Auditoria (registro de ações) e Sobre (versão, dados, criptografia). */
import { useCallback, useEffect, useState } from 'react';
import type { AuditEntry } from '../../../../core/types';
import type { SystemInfo } from '../../../../shared/ipc';
import { call } from '../../api';
import { ACTOR_LABEL, AUDIT_DECISION_LABEL, AUDIT_KIND_LABEL, AUDIT_OUTCOME_LABEL, errorText, formatDateTime, riskInfo } from '../../lib/format';
import { Group, Spinner } from '../controls';
import { IconCheck, IconCopy, IconRefresh, IconWarning } from '../icons';
import type { SectionProps } from './common';

type KindFilter = AuditEntry['kind'] | 'todos';

export function AuditSection({ notify }: SectionProps) {
  const [kind, setKind] = useState<KindFilter>('todos');
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await call('audit:list', { limit: 300, kind: kind === 'todos' ? undefined : kind }));
    } catch (e) {
      setRows((r) => r ?? []);
      notify('erro', 'Não foi possível ler a auditoria', errorText(e));
    } finally {
      setLoading(false);
    }
  }, [kind, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Group title="Registro de ações" description="Tudo o que o 300 fez ou tentou fazer, com as decisões de permissão. Segredos são ocultados.">
      <div className="mem-toolbar">
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Filtrar por tipo">
          <option value="todos">Todos os tipos</option>
          {(Object.keys(AUDIT_KIND_LABEL) as AuditEntry['kind'][]).map((k) => (
            <option key={k} value={k}>
              {AUDIT_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? <Spinner size={12} /> : <IconRefresh size={14} />} Atualizar
        </button>
        <span className="muted small">{rows ? `${rows.length} registros` : ''}</span>
      </div>
      {rows === null ? (
        <div className="panel-empty">
          <Spinner size={16} />
        </div>
      ) : rows.length === 0 ? (
        <p className="muted small">Nenhum registro.</p>
      ) : (
        <div className="audit-wrap">
          <table className="audit">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>O quê</th>
                <th>Risco</th>
                <th>Decisão</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const [date, time] = formatDateTime(r.ts).split(' ');
                return (
                  <tr key={r.id}>
                    <td className="mono nowrap">
                      <span className="audit-date">{date}</span>
                      <span className="audit-sub">{time}</span>
                    </td>
                    <td>{ACTOR_LABEL[r.actor] ?? r.actor}</td>
                    <td>
                      {AUDIT_KIND_LABEL[r.kind] ?? r.kind}
                      {r.tool && <span className="audit-sub mono">{r.tool}</span>}
                    </td>
                    <td>{r.risk ? <span className={`tone-text-${riskInfo(r.risk).tone}`}>{riskInfo(r.risk).label}</span> : '—'}</td>
                    <td>
                      {r.decision ? AUDIT_DECISION_LABEL[r.decision] ?? r.decision : '—'}
                      {r.outcome && <span className={'audit-sub' + (r.outcome === 'erro' || r.outcome === 'bloqueado' ? ' tone-text-red' : '')}>{AUDIT_OUTCOME_LABEL[r.outcome] ?? r.outcome}</span>}
                    </td>
                    <td className="audit-detail">
                      {r.detail && <span>{r.detail}</span>}
                      {r.input && (
                        <details>
                          <summary>entrada</summary>
                          <pre className="mono">{r.input}</pre>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Group>
  );
}

const PLATFORM_LABEL: Record<SystemInfo['platform'], string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

export function AboutSection({ notify }: SectionProps) {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    call('system:info').then(setInfo, (e) => setError(errorText(e)));
  }, []);

  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => notify('ok', 'Copiado'),
      () => notify('erro', 'Não foi possível copiar'),
    );
  };

  if (error) return <p className="field-error">Não foi possível obter as informações: {error}</p>;
  if (!info) return <Spinner size={16} />;

  const enc = (ok: boolean, what: string) => (
    <span className={'enc ' + (ok ? 'tone-text-green' : 'tone-text-amber')}>
      {ok ? <IconCheck size={14} /> : <IconWarning size={14} />} {ok ? `${what} criptografado` : `${what} sem criptografia`}
    </span>
  );

  return (
    <>
      <div className="about-hero">
        <div className="about-mark" aria-hidden="true" />
        <div>
          <div className="about-name">300</div>
          <div className="muted">Assistente pessoal de inteligência artificial</div>
        </div>
      </div>
      <Group title="Sistema">
        <dl className="about-list">
          <dt>Versão</dt>
          <dd className="mono">{info.version}</dd>
          <dt>Sistema</dt>
          <dd>{PLATFORM_LABEL[info.platform] ?? info.platform}</dd>
          <dt>Pasta de dados</dt>
          <dd className="about-path">
            <span className="mono">{info.dataDir}</span>
            <button type="button" className="icon-btn" onClick={() => copy(info.dataDir)} aria-label="Copiar caminho da pasta de dados">
              <IconCopy size={14} />
            </button>
          </dd>
          <dt>Banco de dados</dt>
          <dd>{enc(info.databaseEncrypted, 'Banco')}</dd>
          <dt>Chaves</dt>
          <dd>{enc(info.secretsEncrypted, 'Cofre de chaves')}</dd>
          <dt>Modelos de voz</dt>
          <dd>
            {info.voiceModels.filter((m) => m.installed).length} de {info.voiceModels.length} instalados
          </dd>
        </dl>
        {(!info.databaseEncrypted || !info.secretsEncrypted) && (
          <p className="notice tone-amber">Parte dos dados não está criptografada. Verifique se a proteção de dados do Windows está disponível nesta conta.</p>
        )}
      </Group>
    </>
  );
}
