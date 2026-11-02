/** Rótulos e formatação em português do Brasil. */
import type { AssistantState, AuditEntry, Effort, MemoryKind, RiskLevel, TaskItem } from '../../../core/types';
import type { ConnectionStatus } from '../../../shared/ipc';

export const STATE_LABEL: Record<AssistantState, string> = {
  IDLE: 'Aguardando',
  LISTENING: 'Ouvindo',
  THINKING: 'Pensando',
  SPEAKING: 'Falando',
  EXECUTING: 'Executando',
  ERROR: 'Erro',
};

export const STATE_HINT: Record<AssistantState, string> = {
  IDLE: 'Pronto para ajudar.',
  LISTENING: 'Pode falar.',
  THINKING: 'Organizando a resposta…',
  SPEAKING: 'Respondendo em voz alta.',
  EXECUTING: 'Realizando uma ação.',
  ERROR: 'Algo deu errado.',
};

export type Tone = 'blue' | 'cyan' | 'green' | 'amber' | 'orange' | 'red' | 'violet' | 'gray';

export interface RiskInfo {
  label: string;
  explanation: string;
  tone: Tone;
}

export const RISK_INFO: Record<RiskLevel, RiskInfo> = {
  read: { label: 'Leitura', explanation: 'Só consulta informações. Nada é alterado.', tone: 'blue' },
  write: { label: 'Alteração local', explanation: 'Cria ou altera algo no seu computador. Dá para desfazer.', tone: 'cyan' },
  external: {
    label: 'Envio externo',
    explanation: 'Envia algo para fora do computador em seu nome (e-mail, mensagem, serviço on-line).',
    tone: 'amber',
  },
  destructive: { label: 'Destrutivo', explanation: 'Apaga ou sobrescreve algo. Pode não ter volta.', tone: 'red' },
  financial: { label: 'Financeiro', explanation: 'Envolve dinheiro, compras ou pagamentos.', tone: 'red' },
  system: {
    label: 'Controle do sistema',
    explanation: 'Executa comandos ou programas, ou controla o mouse e o teclado.',
    tone: 'orange',
  },
};

export const EFFORT_OPTIONS: { value: Effort; label: string }[] = [
  { value: 'low', label: 'Baixo (mais rápido)' },
  { value: 'medium', label: 'Médio' },
  { value: 'high', label: 'Alto' },
  { value: 'xhigh', label: 'Muito alto' },
  { value: 'max', label: 'Máximo (mais lento)' },
];

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  fact: 'Fato',
  preference: 'Preferência',
  project: 'Projeto',
  task: 'Tarefa',
  knowledge: 'Conhecimento',
  person: 'Pessoa',
  event: 'Evento',
  summary: 'Resumo',
};

export const MEMORY_KINDS = Object.keys(MEMORY_KIND_LABEL) as MemoryKind[];

export const PRIORITY_LABEL: Record<TaskItem['priority'], string> = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };

export const CONNECTION_LABEL: Record<ConnectionStatus['status'], string> = {
  ok: 'Conectado',
  erro: 'Com problema',
  desconectado: 'Desconectado',
  verificando: 'Verificando…',
};

export const AUDIT_KIND_LABEL: Record<AuditEntry['kind'], string> = {
  tool: 'Ferramenta',
  permission: 'Permissão',
  setting: 'Configuração',
  secret: 'Chave',
  memory: 'Memória',
  scheduler: 'Agendador',
  security: 'Segurança',
  system: 'Sistema',
};

export const AUDIT_DECISION_LABEL: Record<NonNullable<AuditEntry['decision']>, string> = {
  allow: 'Permitido',
  deny: 'Negado',
  ask: 'Perguntou',
  approved: 'Aprovado',
  rejected: 'Recusado',
  timeout: 'Expirou',
};

export const AUDIT_OUTCOME_LABEL: Record<NonNullable<AuditEntry['outcome']>, string> = {
  ok: 'OK',
  erro: 'Erro',
  bloqueado: 'Bloqueado',
  cancelado: 'Cancelado',
};

export const ACTOR_LABEL: Record<AuditEntry['actor'], string> = { user: 'Você', agent: '300', scheduler: 'Agendador' };

const pad = (n: number): string => String(n).padStart(2, '0');

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatTime(value: string | number | Date): string {
  const d = toDate(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
}

export function formatDateTime(value: string | number | Date): string {
  const d = toDate(value);
  if (!d) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "agora", "há 5 min", "ontem", "12/03". */
export function formatRelative(value: string | number | Date, now: number = Date.now()): string {
  const d = toDate(value);
  if (!d) return '';
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 45) return 'agora';
  if (diff < 3600) return `há ${Math.max(1, Math.round(diff / 60))} min`;
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return formatTime(d);
  const yesterday = new Date(now - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'ontem';
  if (d.getFullYear() === today.getFullYear()) return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Data de vencimento curta: "hoje 14:00", "amanhã", "12/03", "atrasada". */
export function formatDue(value: string, now: number = Date.now()): { text: string; overdue: boolean } {
  const d = toDate(value);
  if (!d) return { text: '', overdue: false };
  const overdue = d.getTime() < now;
  const today = new Date(now);
  const tomorrow = new Date(now + 86400000);
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
  let text: string;
  if (d.toDateString() === today.toDateString()) text = hasTime ? `hoje ${formatTime(d)}` : 'hoje';
  else if (d.toDateString() === tomorrow.toDateString()) text = hasTime ? `amanhã ${formatTime(d)}` : 'amanhã';
  else text = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  return { text, overdue };
}

/** JSON legível e limitado (para detalhes de confirmação e auditoria). */
export function prettyJson(value: unknown, maxChars = 20000): string {
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    s = String(value);
  }
  if (s.length > maxChars) s = s.slice(0, maxChars) + `\n… (${s.length - maxChars} caracteres omitidos)`;
  return s;
}

/** Mensagem de erro limpa (sem o prefixo técnico do IPC do Electron). */
export function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : 'erro desconhecido';
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(Error|TypeError|RangeError):\s*/, '') || 'erro desconhecido';
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function percent(v: number): string {
  return `${Math.round(v * 100)}%`;
}
