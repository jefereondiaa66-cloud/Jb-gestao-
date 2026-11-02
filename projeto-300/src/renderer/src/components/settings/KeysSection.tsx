/**
 * Chaves de API. Os valores guardados NUNCA voltam para a interface:
 * secrets:list devolve só os nomes; aqui mostramos "configurada ✓".
 */
import { useCallback, useEffect, useState } from 'react';
import { SECRET_NAMES } from '../../../../core/types';
import { call } from '../../api';
import { errorText } from '../../lib/format';
import { useDialog } from '../Dialog';
import { Group, Spinner } from '../controls';
import type { Notify } from './common';

export interface SecretDef {
  name: string;
  label: string;
  hint: string;
  /** Prefixo esperado (só aviso, não bloqueia). */
  prefix?: string;
}

export const API_KEYS: SecretDef[] = [
  { name: SECRET_NAMES.anthropic, label: 'Anthropic (Claude)', hint: 'Crie em console.anthropic.com > API Keys.', prefix: 'sk-ant-' },
  { name: SECRET_NAMES.openai, label: 'OpenAI', hint: 'Crie em platform.openai.com > API keys.', prefix: 'sk-' },
  { name: SECRET_NAMES.elevenlabs, label: 'ElevenLabs (voz)', hint: 'Em elevenlabs.io > Profile > API Key.' },
  { name: SECRET_NAMES.brave, label: 'Brave Search', hint: 'Em api-dashboard.search.brave.com.' },
  { name: SECRET_NAMES.tavily, label: 'Tavily (pesquisa)', hint: 'Em app.tavily.com.', prefix: 'tvly-' },
  { name: SECRET_NAMES.picovoice, label: 'Picovoice (palavra de ativação)', hint: 'Em console.picovoice.ai (AccessKey).' },
];

/** Linha de uma chave: salva, substitui ou remove sem nunca exibir o valor guardado. */
export function SecretRow({ def, configured, onChanged, notify }: { def: SecretDef; configured: boolean; onChanged: () => void; notify: Notify }) {
  const [editing, setEditing] = useState(!configured);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const ask = useDialog();
  const inputId = 'sec-' + def.name;

  useEffect(() => {
    setEditing(!configured);
  }, [configured]);
  // não deixa o valor digitado na memória da tela ao sair
  useEffect(() => () => setValue(''), []);

  const save = async () => {
    const v = value.trim();
    if (!v || busy) return;
    if (/\s/.test(v)) {
      notify('aviso', 'Chave inválida', 'A chave não pode ter espaços.');
      return;
    }
    if (def.prefix && !v.startsWith(def.prefix)) {
      const go = await ask({ title: 'Formato diferente do esperado', message: <>Chaves de {def.label} costumam começar com “{def.prefix}”. Salvar mesmo assim?</>, confirmLabel: 'Salvar' });
      if (!go) return;
    }
    setBusy(true);
    try {
      await call('secrets:set', { name: def.name, value: v });
      setValue('');
      setEditing(false);
      notify('ok', 'Chave salva', `${def.label} configurada com segurança.`);
      onChanged();
    } catch (e) {
      notify('erro', 'Não foi possível salvar a chave', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await ask({ title: 'Remover chave?', message: <>A chave de {def.label} será apagada deste computador. Os recursos que dependem dela deixarão de funcionar.</>, confirmLabel: 'Remover', danger: true });
    if (!ok) return;
    setBusy(true);
    try {
      await call('secrets:delete', { name: def.name });
      notify('ok', 'Chave removida', def.label);
      onChanged();
    } catch (e) {
      notify('erro', 'Não foi possível remover a chave', errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="secret-row">
      <div className="field-text">
        <label className="field-label" htmlFor={inputId}>
          {def.label}
        </label>
        <span className="field-hint">{def.hint}</span>
      </div>
      <div className="secret-control">
        {configured && !editing ? (
          <>
            <span className="secret-ok">configurada ✓</span>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(true)} disabled={busy}>
              Substituir
            </button>
            <button type="button" className="btn btn-sm btn-ghost-danger" onClick={() => void remove()} disabled={busy}>
              Remover
            </button>
          </>
        ) : (
          <form
            className="secret-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <input
              id={inputId}
              className="input mono"
              type="password"
              value={value}
              autoComplete="off"
              spellCheck={false}
              placeholder={configured ? 'Nova chave' : 'Cole a chave aqui'}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && (configured || value)) {
                  e.stopPropagation();
                  setValue('');
                  setEditing(false);
                }
              }}
            />
            <button type="submit" className="btn btn-sm btn-primary" disabled={!value.trim() || busy}>
              {busy ? <Spinner size={12} /> : 'Salvar'}
            </button>
            {configured && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  setValue('');
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

export function useSecretNames(notify: Notify): { names: Set<string> | null; reload: () => Promise<void> } {
  const [names, setNames] = useState<Set<string> | null>(null);
  const reload = useCallback(async () => {
    try {
      setNames(new Set(await call('secrets:list')));
    } catch (e) {
      setNames(new Set());
      notify('erro', 'Não foi possível ler as chaves', errorText(e));
    }
  }, [notify]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { names, reload };
}

export function KeysSection({ notify, refreshConnections }: { notify: Notify; refreshConnections: () => void }) {
  const { names, reload } = useSecretNames(notify);
  const changed = () => {
    void reload();
    refreshConnections();
  };
  return (
    <Group title="Chaves de acesso" description="Ficam guardadas de forma criptografada neste computador. Depois de salvas, nunca são mostradas de novo.">
      {names === null ? (
        <div className="panel-empty">
          <Spinner size={16} />
        </div>
      ) : (
        API_KEYS.map((d) => <SecretRow key={d.name} def={d} configured={names.has(d.name)} onChanged={changed} notify={notify} />)
      )}
    </Group>
  );
}
