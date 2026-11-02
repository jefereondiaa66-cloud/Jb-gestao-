/** Gaveta de configurações com navegação por seções. */
import { useEffect, useRef } from 'react';
import { trapTab } from '../Dialog';
import { IconX } from '../icons';
import { Spinner } from '../controls';
import { AboutSection, AuditSection } from './AuditAboutSections';
import { BrainSection } from './BrainSection';
import { IntegrationsSection } from './IntegrationsSection';
import { KeysSection } from './KeysSection';
import { MemorySection } from './MemorySection';
import { VoiceSection } from './VoiceSection';
import { PermissionsSection, PrivacySection, SearchSection, WakeSection } from './WakePrivacySections';
import { SECTIONS, type SectionId, type SectionProps } from './common';

export interface SettingsDrawerProps extends Omit<SectionProps, 'settings'> {
  settings: SectionProps['settings'] | null;
  loadError: string | null;
  section: SectionId;
  onSection: (s: SectionId) => void;
  onClose: () => void;
}

export function SettingsDrawer(p: SettingsDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<Element | null>(null);
  useEffect(() => {
    prevFocus.current = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (prevFocus.current instanceof HTMLElement) prevFocus.current.focus();
    };
  }, []);
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [p.section]);

  const current = SECTIONS.find((s) => s.id === p.section) ?? SECTIONS[0]!;

  const render = () => {
    if (!p.settings) {
      return p.loadError ? <p className="field-error">Não foi possível carregar as configurações: {p.loadError}</p> : <Spinner size={18} label="Carregando" />;
    }
    const props: SectionProps = { ...p, settings: p.settings };
    switch (p.section) {
      case 'cerebro':
        return <BrainSection {...props} />;
      case 'chaves':
        return <KeysSection notify={p.notify} refreshConnections={p.refreshConnections} />;
      case 'voz':
        return <VoiceSection {...props} />;
      case 'ativacao':
        return <WakeSection {...props} />;
      case 'privacidade':
        return <PrivacySection {...props} />;
      case 'permissoes':
        return <PermissionsSection {...props} />;
      case 'pesquisa':
        return <SearchSection {...props} />;
      case 'integracoes':
        return <IntegrationsSection {...props} />;
      case 'memoria':
        return <MemorySection {...props} />;
      case 'auditoria':
        return <AuditSection {...props} />;
      case 'sobre':
        return <AboutSection {...props} />;
    }
  };

  return (
    <div className="overlay overlay-drawer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()} onKeyDown={trapTab}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <nav className="drawer-nav" aria-label="Seções das configurações">
          <div className="drawer-nav-title" id="drawer-title">
            Configurações
          </div>
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={'drawer-nav-item' + (s.id === p.section ? ' is-active' : '')} aria-current={s.id === p.section ? 'page' : undefined} onClick={() => p.onSection(s.id)}>
              {s.label}
            </button>
          ))}
        </nav>
        <div className="drawer-main">
          <header className="drawer-head">
            <div>
              <h2>{current.label}</h2>
              <p className="muted small">{current.hint}</p>
            </div>
            <button ref={closeRef} type="button" className="icon-btn icon-btn-lg" onClick={p.onClose} aria-label="Fechar configurações">
              <IconX size={20} />
            </button>
          </header>
          <div className="drawer-body" ref={bodyRef} key={p.section}>
            {render()}
          </div>
        </div>
      </aside>
    </div>
  );
}
