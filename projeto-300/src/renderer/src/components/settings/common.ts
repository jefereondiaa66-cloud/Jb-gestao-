import type { Settings, SettingsPatch } from '../../../../core/settings';
import type { ConnectionStatus } from '../../../../shared/ipc';

export type Notify = (tone: 'info' | 'ok' | 'erro' | 'aviso', title: string, body?: string) => void;

export interface SectionProps {
  settings: Settings;
  update: (patch: SettingsPatch) => Promise<Settings | null>;
  notify: Notify;
  connections: ConnectionStatus[];
  refreshConnections: () => void;
  memoryRev: number;
  /** Liga/desliga a palavra de ativação (aplica no motor e salva). */
  setWake: (enabled: boolean) => Promise<void>;
  /** Relê as configurações do motor (quando outra operação as alterou). */
  reloadSettings: () => Promise<unknown>;
}

export type SectionId = 'cerebro' | 'chaves' | 'voz' | 'ativacao' | 'privacidade' | 'permissoes' | 'pesquisa' | 'integracoes' | 'memoria' | 'auditoria' | 'sobre';

export const SECTIONS: { id: SectionId; label: string; hint: string }[] = [
  { id: 'cerebro', label: 'Cérebro', hint: 'Modelo de IA e esforço' },
  { id: 'chaves', label: 'Chaves', hint: 'Chaves de acesso aos serviços' },
  { id: 'voz', label: 'Voz', hint: 'Fala, escuta e modelos locais' },
  { id: 'ativacao', label: 'Ativação', hint: 'Palavra “300” e atalho' },
  { id: 'privacidade', label: 'Privacidade', hint: 'O que é guardado e permitido' },
  { id: 'permissoes', label: 'Permissões', hint: 'Pastas, comandos e controle' },
  { id: 'pesquisa', label: 'Pesquisa', hint: 'Busca na internet' },
  { id: 'integracoes', label: 'Integrações', hint: 'Google, Microsoft e MCP' },
  { id: 'memoria', label: 'Memória', hint: 'O que o 300 lembra' },
  { id: 'auditoria', label: 'Auditoria', hint: 'Registro de ações' },
  { id: 'sobre', label: 'Sobre', hint: 'Versão e dados' },
];

export function statusOf(connections: ConnectionStatus[], service: string): ConnectionStatus | undefined {
  return connections.find((c) => c.service === service);
}

/** Caminho absoluto (Windows, rede ou Unix). */
export function isAbsolutePath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\[^\\]+\\[^\\]+/.test(p) || p.startsWith('/');
}

/** Raiz de disco ou pasta inteira do usuário (acesso amplo demais). */
export function isBroadPath(p: string): boolean {
  const n = p.replace(/[\\/]+$/, '');
  return /^[a-zA-Z]:$/.test(n) || n === '' || /^[a-zA-Z]:[\\/]Users$/i.test(n) || /^[a-zA-Z]:[\\/]Users[\\/][^\\/]+$/i.test(n) || n === '/home' || /^\/home\/[^/]+$/.test(n) || /^\/Users\/[^/]+$/.test(n);
}

export function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}
