/** Controles de formulário reutilizáveis (estilo do 300). */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import type { Tone } from '../lib/format';

export function Toggle({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={'switch' + (checked ? ' is-on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-knob" />
    </button>
  );
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({ value, options, onChange, label, disabled, id }: { value: T; options: Option<T>[]; onChange: (v: T) => void; label: string; disabled?: boolean; id?: string }) {
  const known = options.some((o) => o.value === value);
  return (
    <select id={id} className="select" value={value} aria-label={label} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {!known && <option value={value}>{value || '—'}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Controle deslizante: atualiza o valor na tela e grava ao soltar. */
export function Slider({
  value,
  min,
  max,
  step,
  onCommit,
  format,
  label,
  disabled,
  id,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onCommit: (v: number) => void;
  format: (v: number) => string;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  const [local, setLocal] = useState(value);
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) setLocal(value);
  }, [value]);
  const commit = () => {
    if (!dirty.current) return;
    dirty.current = false;
    if (local !== value) onCommit(local);
  };
  const pct = ((local - min) / (max - min)) * 100;
  return (
    <div className="slider">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={local}
        aria-label={label}
        aria-valuetext={format(local)}
        disabled={disabled}
        style={{ ['--pct' as string]: `${pct}%` }}
        onChange={(e) => {
          dirty.current = true;
          setLocal(Number(e.target.value));
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <output className="slider-value">{format(local)}</output>
    </div>
  );
}

/** Campo de texto que grava ao sair do campo ou com Enter. Esc desfaz. */
export function TextInput({
  value,
  onCommit,
  label,
  placeholder,
  mono,
  disabled,
  id,
  type = 'text',
  validate,
}: {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  mono?: boolean;
  disabled?: boolean;
  id?: string;
  type?: 'text' | 'url';
  validate?: (v: string) => string | null;
}) {
  const [local, setLocal] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setLocal(value);
  }, [value]);
  const commit = () => {
    editing.current = false;
    const v = local.trim();
    if (v === value) return;
    const err = validate ? validate(v) : null;
    setError(err);
    if (err) return;
    onCommit(v);
  };
  return (
    <div className="text-field">
      <input
        id={id}
        className={'input' + (mono ? ' mono' : '') + (error ? ' has-error' : '')}
        type={type}
        value={local}
        aria-label={label}
        aria-invalid={!!error}
        placeholder={placeholder}
        disabled={disabled}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => {
          editing.current = true;
          setLocal(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Escape' && (local !== value || error)) {
            // primeiro Esc desfaz a edição; o seguinte segue adiante (fecha a gaveta)
            e.stopPropagation();
            editing.current = false;
            setLocal(value);
            setError(null);
          }
        }}
      />
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}

export function TextArea({ value, onCommit, label, placeholder, rows = 3 }: { value: string; onCommit: (v: string) => void; label: string; placeholder?: string; rows?: number }) {
  const [local, setLocal] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setLocal(value);
  }, [value]);
  return (
    <textarea
      className="input textarea"
      value={local}
      rows={rows}
      aria-label={label}
      placeholder={placeholder}
      onChange={(e) => {
        editing.current = true;
        setLocal(e.target.value);
      }}
      onBlur={() => {
        editing.current = false;
        if (local !== value) onCommit(local);
      }}
    />
  );
}

/** Linha de configuração: rótulo + explicação à esquerda, controle à direita. */
export function Field({ label, hint, children, wide, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; wide?: boolean; htmlFor?: string }) {
  return (
    <div className={'field' + (wide ? ' is-wide' : '')}>
      <div className="field-text">
        {htmlFor ? (
          <label className="field-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="field-label">{label}</span>
        )}
        {hint && <span className="field-hint">{hint}</span>}
      </div>
      <div className="field-control">{children}</div>
    </div>
  );
}

/** Campo com rótulo associado automaticamente (id gerado). */
export function useFieldId(): string {
  return useId().replace(/:/g, '');
}

export function Group({ title, children, description }: { title: string; children: ReactNode; description?: ReactNode }) {
  return (
    <section className="group">
      <h3 className="group-title">{title}</h3>
      {description && <p className="group-desc">{description}</p>}
      <div className="group-body">{children}</div>
    </section>
  );
}

export function Badge({ tone = 'gray', children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge tone-${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Spinner({ size = 14, label }: { size?: number; label?: string }) {
  return <span className="spinner" style={{ width: size, height: size }} role={label ? 'status' : undefined} aria-label={label} />;
}

export function Notice({ tone = 'amber', children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`notice tone-${tone}`}>{children}</div>;
}
