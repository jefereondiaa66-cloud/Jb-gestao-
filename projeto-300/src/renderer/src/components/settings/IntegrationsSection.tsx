/** Integrações: Google, Microsoft e servidores MCP. */
import { useState, type ReactNode } from 'react';
import type { McpServerConfig } from '../../../../core/settings';
import { SECRET_NAMES, type RiskLevel } from '../../../../core/types';
import { call } from '../../api';
import { CONNECTION_LABEL, errorText, riskInfo } from '../../lib/format';
import { useDialog } from '../Dialog';
import { Badge, Field, Group, Notice, Select, Spinner, TextInput, Toggle } from '../controls';
import { IconEdit, IconPlus, IconRefresh, IconTrash } from '../icons';
import { isHttpUrl, mcpRunsNewCommand, statusOf, type SectionProps } from './common';
import { SecretRow, useSecretNames } from './KeysSection';

const RISKS: RiskLevel[] = ['read', 'write', 'external', 'destructive', 'financial', 'system'];
const STATUS_TONE = { ok: 'green', erro: 'red', desconectado: 'gray', verificando: 'amber' } as const;

function ServiceBlock({
  service,
  title,
  clientId,
  onClientId,
  extra,
  props,
}: {
  service: 'google' | 'microsoft';
  title: string;
  clientId: string;
  onClientId: (v: string) => void;
  extra?: ReactNode;
  props: SectionProps;
}) {
  const [busy, setBusy] = useState(false);
  const ask = useDialog();
  const st = statusOf(props.connections, service);
  const connect = async () => {
    setBusy(true);
    try {
      const r = await call('integrations:connect', { service });
      props.notify(r.ok ? 'ok' : 'erro', r.ok ? `${title} conectado` : `Não foi possível conectar ao ${title}`, r.detail);
    } catch (e) {
      props.notify('erro', `Não foi possível conectar ao ${title}`, errorText(e));
    } finally {
      setBusy(false);
      props.refreshConnections();
    }
  };
  const disconnect = async () => {
    const ok = await ask({ title: `Desconectar ${title}?`, message: 'O 300 perderá o acesso à sua conta até você conectar de novo.', confirmLabel: 'Desconectar', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await call('integrations:disconnect', { service });
      props.notify('ok', `${title} desconectado`);
    } catch (e) {
      props.notify('erro', `Não foi possível desconectar`, errorText(e));
    } finally {
      setBusy(false);
      props.refreshConnections();
    }
  };
  return (
    <Group title={title}>
      <Field label="Situação">
        <span className="status-line">
          <span className={`dot tone-${st ? STATUS_TONE[st.status] : 'gray'}`} />
          {st ? CONNECTION_LABEL[st.status] : 'Desconectado'}
          {st?.detail && <span className="muted small"> · {st.detail}</span>}
        </span>
      </Field>
      <Field label="ID do cliente OAuth" hint="Do aplicativo do tipo “Desktop” criado no console do provedor.">
        <TextInput label={`ID do cliente ${title}`} mono value={clientId} placeholder="Cole o ID do cliente" onCommit={onClientId} />
      </Field>
      {extra}
      <div className="row-actions">
        <button type="button" className="btn btn-sm btn-primary" onClick={() => void connect()} disabled={busy || !clientId}>
          {busy ? <Spinner size={12} /> : null} Conectar
        </button>
        <button type="button" className="btn btn-sm btn-ghost-danger" onClick={() => void disconnect()} disabled={busy || st?.status !== 'ok'}>
          Desconectar
        </button>
      </div>
    </Group>
  );
}

const EMPTY: McpServerConfig = { id: '', name: '', transport: 'stdio', command: '', args: [], env: {}, url: '', enabled: true, risk: 'external' };

function McpEditor({ initial, existingIds, onSave, onCancel }: { initial: McpServerConfig; existingIds: string[]; onSave: (s: McpServerConfig) => void; onCancel: () => void }) {
  const [s, setS] = useState<McpServerConfig>({ ...initial });
  const [argsText, setArgsText] = useState(initial.args.join('\n'));
  const [err, setErr] = useState<string | null>(null);
  const isNew = !initial.id;
  const set = <K extends keyof McpServerConfig>(k: K, v: McpServerConfig[K]) => setS((x) => ({ ...x, [k]: v }));

  const save = () => {
    const id = s.id.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)) return setErr('O identificador deve ter só letras minúsculas, números, - ou _ (até 40).');
    if (isNew && existingIds.includes(id)) return setErr('Já existe um servidor com esse identificador.');
    if (!s.name.trim()) return setErr('Informe um nome.');
    if (s.transport === 'stdio' && !s.command?.trim()) return setErr('Informe o comando que inicia o servidor.');
    if (s.transport === 'http' && !isHttpUrl(s.url ?? '')) return setErr('Informe um endereço http:// ou https:// válido.');
    const args = argsText
      .split('\n')
      .map((a) => a.trim())
      .filter(Boolean);
    onSave({ ...s, id, name: s.name.trim(), command: s.command?.trim() || undefined, url: s.url?.trim() || undefined, args });
  };

  return (
    <div className="mcp-editor">
      <div className="form-grid">
        <label>
          <span>Identificador</span>
          <input className="input mono" value={s.id} disabled={!isNew} onChange={(e) => set('id', e.target.value.toLowerCase())} placeholder="ex.: arquivos" />
        </label>
        <label>
          <span>Nome</span>
          <input className="input" value={s.name} onChange={(e) => set('name', e.target.value)} placeholder="ex.: Sistema de arquivos" />
        </label>
        <label>
          <span>Transporte</span>
          <select className="select" value={s.transport} onChange={(e) => set('transport', e.target.value as McpServerConfig['transport'])}>
            <option value="stdio">Programa local (stdio)</option>
            <option value="http">Servidor HTTP</option>
          </select>
        </label>
        <label>
          <span>Risco das ferramentas</span>
          <select className="select" value={s.risk} onChange={(e) => set('risk', e.target.value as RiskLevel)}>
            {RISKS.map((r) => (
              <option key={r} value={r}>
                {riskInfo(r).label}
              </option>
            ))}
          </select>
        </label>
        {s.transport === 'stdio' ? (
          <>
            <label className="span-2">
              <span>Comando</span>
              <input className="input mono" value={s.command ?? ''} onChange={(e) => set('command', e.target.value)} placeholder="ex.: npx" spellCheck={false} />
            </label>
            <label className="span-2">
              <span>Argumentos (um por linha)</span>
              <textarea className="input textarea mono" rows={3} value={argsText} onChange={(e) => setArgsText(e.target.value)} placeholder={'-y\n@modelcontextprotocol/server-filesystem\nC:\\Users\\voce\\Documentos'} spellCheck={false} />
            </label>
          </>
        ) : (
          <label className="span-2">
            <span>Endereço</span>
            <input className="input mono" value={s.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://exemplo.com/mcp" spellCheck={false} />
          </label>
        )}
      </div>
      {(s.risk === 'read' || s.risk === 'write') && <Notice tone="amber">Com risco “{riskInfo(s.risk).label}”, as ferramentas deste servidor podem rodar sem pedir confirmação. Use só com servidores que você confia.</Notice>}
      {err && <span className="field-error">{err}</span>}
      <div className="row-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="btn btn-sm btn-primary" onClick={save}>
          Salvar servidor
        </button>
      </div>
    </div>
  );
}

function McpServers(props: SectionProps) {
  const servers = props.settings.integrations.mcpServers;
  const [editing, setEditing] = useState<McpServerConfig | null>(null);
  const [reloading, setReloading] = useState(false);
  const ask = useDialog();

  const persist = async (list: McpServerConfig[]) => {
    const res = await props.update({ integrations: { mcpServers: list } });
    if (!res) return false;
    setReloading(true);
    try {
      await call('mcp:reload');
    } catch (e) {
      props.notify('erro', 'Não foi possível recarregar os servidores MCP', errorText(e));
    } finally {
      setReloading(false);
      props.refreshConnections();
    }
    return true;
  };

  const save = async (s: McpServerConfig) => {
    const prev = servers.find((x) => x.id === s.id);
    const exists = !!prev;
    if (mcpRunsNewCommand(prev, s)) {
      const cmd = [s.command, ...s.args].join(' ');
      const ok = await ask({
        title: exists ? 'Alterar o programa do servidor?' : 'Adicionar servidor local?',
        message: (
          <>
            Este servidor vai executar no seu computador o comando:
            <pre className="dialog-code">{cmd}</pre>
            Adicione só programas que você confia.
          </>
        ),
        confirmLabel: exists ? 'Salvar' : 'Adicionar',
        danger: true,
      });
      if (!ok) return;
    }
    const list = exists ? servers.map((x) => (x.id === s.id ? s : x)) : [...servers, s];
    if (await persist(list)) setEditing(null);
  };

  const remove = async (s: McpServerConfig) => {
    const ok = await ask({ title: 'Remover servidor MCP?', message: <>O servidor “{s.name}” e suas ferramentas serão removidos.</>, confirmLabel: 'Remover', danger: true });
    if (ok) await persist(servers.filter((x) => x.id !== s.id));
  };

  return (
    <Group title="Servidores MCP" description="Ferramentas extras de outros programas (Model Context Protocol). Servidores locais executam programas no seu computador.">
      {servers.length === 0 && !editing && <p className="muted small">Nenhum servidor configurado.</p>}
      <ul className="mcp-list">
        {servers.map((s) => {
          const st = statusOf(props.connections, 'mcp:' + s.id);
          return (
            <li key={s.id} className="mcp-item">
              <span className={`dot tone-${st ? STATUS_TONE[st.status] : 'gray'}`} title={st ? CONNECTION_LABEL[st.status] : 'Sem estado'} />
              <div className="mcp-main">
                <span className="mcp-name">{s.name}</span>
                <span className="mcp-meta mono">{s.transport === 'stdio' ? [s.command, ...s.args].join(' ') : s.url}</span>
                {st?.detail && <span className="mcp-meta">{st.detail}</span>}
              </div>
              <Badge tone={riskInfo(s.risk).tone}>{riskInfo(s.risk).label}</Badge>
              <Toggle label={`Servidor ${s.name} ligado`} checked={s.enabled} onChange={(v) => void persist(servers.map((x) => (x.id === s.id ? { ...x, enabled: v } : x)))} />
              <button type="button" className="icon-btn" onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`}>
                <IconEdit size={14} />
              </button>
              <button type="button" className="icon-btn danger" onClick={() => void remove(s)} aria-label={`Remover ${s.name}`}>
                <IconTrash size={14} />
              </button>
            </li>
          );
        })}
      </ul>
      {editing ? (
        <McpEditor key={editing.id || 'novo'} initial={editing} existingIds={servers.map((s) => s.id)} onSave={(s) => void save(s)} onCancel={() => setEditing(null)} />
      ) : (
        <div className="row-actions">
          <button type="button" className="btn btn-sm" onClick={() => setEditing({ ...EMPTY })}>
            <IconPlus size={14} /> Adicionar servidor
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            disabled={reloading}
            onClick={async () => {
              setReloading(true);
              try {
                await call('mcp:reload');
              } catch (e) {
                props.notify('erro', 'Não foi possível recarregar', errorText(e));
              } finally {
                setReloading(false);
                props.refreshConnections();
              }
            }}
          >
            {reloading ? <Spinner size={12} /> : <IconRefresh size={14} />} Recarregar
          </button>
        </div>
      )}
    </Group>
  );
}

export function IntegrationsSection(props: SectionProps) {
  const it = props.settings.integrations;
  const { names, reload } = useSecretNames(props.notify);
  return (
    <>
      <ServiceBlock
        service="google"
        title="Google"
        clientId={it.googleClientId}
        onClientId={(v) => void props.update({ integrations: { googleClientId: v } })}
        props={props}
        extra={
          names && (
            <SecretRow
              def={{ name: SECRET_NAMES.googleClientSecret, label: 'Segredo do cliente Google', hint: 'Guardado criptografado; nunca é mostrado de novo.' }}
              configured={names.has(SECRET_NAMES.googleClientSecret)}
              onChanged={() => void reload()}
              notify={props.notify}
            />
          )
        }
      />
      <ServiceBlock service="microsoft" title="Microsoft" clientId={it.microsoftClientId} onClientId={(v) => void props.update({ integrations: { microsoftClientId: v } })} props={props} />
      <McpServers {...props} />
    </>
  );
}
