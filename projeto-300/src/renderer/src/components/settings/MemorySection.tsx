/** Memória: buscar, listar, editar, apagar e exportar o que o 300 lembra. */
import { useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../../../core/settings';
import type { MemoryItem, MemoryKind } from '../../../../core/types';
import { call } from '../../api';
import { MEMORY_KINDS, MEMORY_KIND_LABEL, errorText, formatDateTime, percent } from '../../lib/format';
import { useDialog } from '../Dialog';
import { Badge, Field, Group, Select, Spinner, TextInput } from '../controls';
import { IconDownload, IconEdit, IconPlus, IconSearch, IconTrash } from '../icons';
import type { SectionProps } from './common';

const PAGE = 30;
type KindFilter = MemoryKind | 'todas';

function MemoryEditor({ item, onSave, onCancel }: { item: Partial<MemoryItem>; onSave: (v: { content: string; tags: string[]; kind: MemoryKind; importance: number; sensitive: boolean }) => void; onCancel: () => void }) {
  const [content, setContent] = useState(item.content ?? '');
  const [tags, setTags] = useState((item.tags ?? []).join(', '));
  const [kind, setKind] = useState<MemoryKind>(item.kind ?? 'fact');
  const [importance, setImportance] = useState(item.importance ?? 0.5);
  const [sensitive, setSensitive] = useState(item.sensitive ?? false);
  const isNew = !item.id;
  return (
    <div className="mem-editor">
      <textarea className="input textarea" rows={3} value={content} onChange={(e) => setContent(e.target.value)} aria-label="Conteúdo da memória" maxLength={4000} autoFocus />
      <div className="form-grid">
        <label>
          <span>Tipo</span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)}>
            {MEMORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEMORY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Etiquetas (separadas por vírgula)</span>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
        {!isNew && (
          <label>
            <span>Importância: {percent(importance)}</span>
            <input type="range" min={0} max={1} step={0.05} value={importance} onChange={(e) => setImportance(Number(e.target.value))} style={{ ['--pct' as string]: `${importance * 100}%` }} />
          </label>
        )}
        {isNew && (
          <label className="check">
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
            <span>Assunto sensível</span>
          </label>
        )}
      </div>
      <div className="row-actions">
        <button type="button" className="btn btn-sm btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={!content.trim()}
          onClick={() =>
            onSave({
              content: content.trim(),
              tags: tags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .slice(0, 20),
              kind,
              importance,
              sensitive,
            })
          }
        >
          Salvar
        </button>
      </div>
    </div>
  );
}

function MemoryCard({ item, onEdit, onDelete }: { item: MemoryItem; onEdit: () => void; onDelete: () => void }) {
  const [reveal, setReveal] = useState(false);
  return (
    <li className="mem-card">
      <div className="mem-top">
        <Badge tone="blue">{MEMORY_KIND_LABEL[item.kind] ?? item.kind}</Badge>
        {item.sensitive && <Badge tone="amber">Sensível</Badge>}
        <span className="mem-imp" title="Importância">
          {percent(item.importance)}
        </span>
        <span className="flex-spacer" />
        <button type="button" className="icon-btn" onClick={onEdit} aria-label="Editar memória">
          <IconEdit size={14} />
        </button>
        <button type="button" className="icon-btn danger" onClick={onDelete} aria-label="Apagar memória">
          <IconTrash size={14} />
        </button>
      </div>
      {item.sensitive && !reveal ? (
        <button type="button" className="mem-hidden" onClick={() => setReveal(true)}>
          Conteúdo sensível oculto — clique para mostrar
        </button>
      ) : (
        <p className="mem-content">{item.content}</p>
      )}
      <div className="mem-meta">
        {item.tags.length > 0 && <span>{item.tags.map((t) => '#' + t).join(' ')}</span>}
        <span>Atualizada em {formatDateTime(item.updatedAt)}</span>
        <span className="mono">{item.source}</span>
      </div>
    </li>
  );
}

export function MemorySection({ settings, update, notify, memoryRev }: SectionProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');
  const [kind, setKind] = useState<KindFilter>('todas');
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ask = useDialog();

  const load = useCallback(
    async (offset = 0) => {
      try {
        let list: MemoryItem[];
        if (active) {
          const res = await call('memory:search', { text: active, limit: 50 });
          list = res.map((r) => r.item).filter((m) => kind === 'todas' || m.kind === kind);
          setMore(false);
        } else {
          list = await call('memory:list', { kind: kind === 'todas' ? undefined : kind, limit: PAGE, offset });
          setMore(list.length === PAGE);
        }
        setItems((prev) => (offset > 0 && prev ? [...prev, ...list] : list));
      } catch (e) {
        setItems((prev) => prev ?? []);
        notify('erro', 'Não foi possível carregar a memória', errorText(e));
      }
    },
    [active, kind, notify],
  );

  useEffect(() => {
    void load(0);
  }, [load, memoryRev]);

  const save = async (id: string, v: { content: string; tags: string[]; kind: MemoryKind; importance: number }) => {
    try {
      const updated = await call('memory:update', { id, content: v.content, tags: v.tags, kind: v.kind, importance: v.importance });
      if (updated) setItems((list) => list?.map((m) => (m.id === id ? updated : m)) ?? list);
      setEditing(null);
    } catch (e) {
      notify('erro', 'Não foi possível salvar a memória', errorText(e));
    }
  };

  const create = async (v: { content: string; tags: string[]; kind: MemoryKind; sensitive: boolean }) => {
    try {
      const created = await call('memory:add', { content: v.content, tags: v.tags, kind: v.kind, sensitive: v.sensitive });
      setItems((list) => [created, ...(list ?? [])]);
      setAdding(false);
    } catch (e) {
      notify('erro', 'Não foi possível adicionar a memória', errorText(e));
    }
  };

  const remove = async (m: MemoryItem) => {
    const ok = await ask({
      title: 'Apagar memória?',
      message: (
        <>
          O 300 vai esquecer isto:
          <blockquote className="dialog-quote">{m.sensitive ? 'Conteúdo sensível' : m.content.slice(0, 300)}</blockquote>
          Não dá para desfazer.
        </>
      ),
      confirmLabel: 'Apagar',
      danger: true,
    });
    if (!ok) return;
    try {
      await call('memory:delete', { id: m.id });
      setItems((list) => list?.filter((x) => x.id !== m.id) ?? list);
    } catch (e) {
      notify('erro', 'Não foi possível apagar a memória', errorText(e));
    }
  };

  const exportAll = async () => {
    const ok = await ask({
      title: 'Exportar memórias?',
      message: 'Será criado um arquivo JSON SEM criptografia com tudo o que o 300 lembra, inclusive assuntos sensíveis. Guarde-o em local seguro.',
      confirmLabel: 'Exportar',
    });
    if (!ok) return;
    setExporting(true);
    try {
      const json = await call('memory:export');
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const d = new Date();
      a.href = url;
      a.download = `memorias-300-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      notify('erro', 'Não foi possível exportar', errorText(e));
    } finally {
      setExporting(false);
    }
  };

  const emb = settings.embeddings;
  type EmbProvider = Settings['embeddings']['provider'];

  return (
    <>
      <Group title="Memórias">
        <div className="mem-toolbar">
          <form
            className="search-box grow"
            onSubmit={(e) => {
              e.preventDefault();
              setActive(query.trim());
            }}
          >
            <IconSearch size={15} />
            <input className="input bare" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar na memória…" aria-label="Buscar na memória" />
            {active && (
              <button
                type="button"
                className="link-btn small"
                onClick={() => {
                  setQuery('');
                  setActive('');
                }}
              >
                Limpar
              </button>
            )}
          </form>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as KindFilter)} aria-label="Filtrar por tipo">
            <option value="todas">Todos os tipos</option>
            {MEMORY_KINDS.map((k) => (
              <option key={k} value={k}>
                {MEMORY_KIND_LABEL[k]}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)} disabled={adding}>
            <IconPlus size={14} /> Adicionar
          </button>
          <button type="button" className="btn btn-sm" onClick={() => void exportAll()} disabled={exporting}>
            {exporting ? <Spinner size={12} /> : <IconDownload size={14} />} Exportar
          </button>
        </div>
        {adding && <MemoryEditor item={{}} onCancel={() => setAdding(false)} onSave={(v) => void create(v)} />}
        {items === null ? (
          <div className="panel-empty">
            <Spinner size={16} />
          </div>
        ) : items.length === 0 ? (
          <p className="muted small">{active ? 'Nada encontrado.' : 'O 300 ainda não guardou memórias.'}</p>
        ) : (
          <ul className="mem-list">
            {items.map((m) =>
              editing === m.id ? (
                <li key={m.id} className="mem-card is-editing">
                  <MemoryEditor item={m} onCancel={() => setEditing(null)} onSave={(v) => void save(m.id, v)} />
                </li>
              ) : (
                <MemoryCard key={m.id} item={m} onEdit={() => setEditing(m.id)} onDelete={() => void remove(m)} />
              ),
            )}
          </ul>
        )}
        {more && (
          <div className="row-actions">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => void load(items?.length ?? 0)}>
              Carregar mais
            </button>
          </div>
        )}
      </Group>
      <Group title="Busca por significado" description="Encontra memórias parecidas mesmo com palavras diferentes (embeddings).">
        <Field label="Provedor">
          <Select<EmbProvider>
            label="Provedor de embeddings"
            value={emb.provider}
            options={[
              { value: 'none', label: 'Desligado (só texto)' },
              { value: 'openai', label: 'OpenAI' },
              { value: 'ollama', label: 'Ollama (local)' },
            ]}
            onChange={(v) => void update({ embeddings: { provider: v } })}
          />
        </Field>
        {emb.provider === 'openai' && (
          <Field label="Modelo OpenAI">
            <TextInput label="Modelo de embeddings OpenAI" mono value={emb.openaiModel} onCommit={(v) => void update({ embeddings: { openaiModel: v } })} />
          </Field>
        )}
        {emb.provider === 'ollama' && (
          <Field label="Modelo Ollama">
            <TextInput label="Modelo de embeddings Ollama" mono value={emb.ollamaModel} onCommit={(v) => void update({ embeddings: { ollamaModel: v } })} />
          </Field>
        )}
      </Group>
    </>
  );
}
