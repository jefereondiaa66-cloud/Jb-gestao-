/**
 * Política de permissões padrão do 300.
 *
 * Regras (conservadoras por padrão):
 * - read: sempre liberado (não altera nada).
 * - write: liberado só se o dono ativou "aprovar escritas automaticamente" E a
 *   tarefa não está contaminada por conteúdo externo; ou se o dono escolheu
 *   "não perguntar de novo nesta sessão" para a ferramenta. Senão, pergunta.
 * - external/destructive/financial/system: SEMPRE pergunta (nunca automático,
 *   nunca "lembrar na sessão").
 * - ator "scheduler" (tarefas em segundo plano): read libera; o resto pergunta.
 */
import type { PermissionDecision, PermissionPolicy, PermissionQuery, RiskLevel, SettingsAccess } from '../types';

const REASONS = {
  read: 'Leitura (não altera nada): liberado.',
  writeAuto: 'Escrita local reversível liberada nas configurações.',
  writeRemembered: 'Você pediu para não perguntar de novo nesta sessão para esta ferramenta.',
  writeAsk: 'Escrita de arquivo/dados: preciso da sua confirmação.',
  external: 'Isso envia informação para fora: preciso da sua confirmação.',
  destructive: 'Isso apaga ou sobrescreve e é difícil de desfazer: preciso da sua confirmação.',
  financial: 'Isso envolve dinheiro/pagamento: preciso da sua confirmação.',
  system: 'Isso executa comandos ou controla o computador: preciso da sua confirmação.',
  schedulerRead: 'Leitura em tarefa automática: liberado.',
  schedulerAsk: 'Tarefa automática em segundo plano: só faço isso com a sua confirmação.',
  unknown: 'Risco não reconhecido: por segurança, preciso da sua confirmação.',
} as const;

const REMEMBERABLE: ReadonlySet<RiskLevel> = new Set<RiskLevel>(['read', 'write']);

export class DefaultPermissionPolicy implements PermissionPolicy {
  /** ferramenta -> riscos lembrados nesta sessão (só read/write). */
  private readonly remembered = new Map<string, Set<RiskLevel>>();

  constructor(private readonly settings: SettingsAccess) {}

  evaluate(q: PermissionQuery): { decision: PermissionDecision; reason: string } {
    const risk = q.risk;

    // Tarefas em segundo plano: só leitura é automática.
    if (q.actor === 'scheduler') {
      if (risk === 'read') return { decision: 'allow', reason: REASONS.schedulerRead };
      return { decision: 'ask', reason: REASONS.schedulerAsk };
    }

    switch (risk) {
      case 'read':
        return { decision: 'allow', reason: REASONS.read };
      case 'write': {
        if (this.isRemembered(q.tool, 'write')) return { decision: 'allow', reason: REASONS.writeRemembered };
        const perms = this.settings.get().permissions;
        if (perms.autoApproveWrites && !q.tainted) return { decision: 'allow', reason: REASONS.writeAuto };
        return { decision: 'ask', reason: REASONS.writeAsk };
      }
      case 'external':
        return { decision: 'ask', reason: REASONS.external };
      case 'destructive':
        return { decision: 'ask', reason: REASONS.destructive };
      case 'financial':
        return { decision: 'ask', reason: REASONS.financial };
      case 'system':
        return { decision: 'ask', reason: REASONS.system };
      default:
        return { decision: 'ask', reason: REASONS.unknown };
    }
  }

  rememberForSession(tool: string, risk: RiskLevel): void {
    if (!REMEMBERABLE.has(risk)) return; // external/destructive/financial/system nunca são lembrados
    let set = this.remembered.get(tool);
    if (!set) {
      set = new Set<RiskLevel>();
      this.remembered.set(tool, set);
    }
    set.add(risk);
  }

  resetSession(): void {
    this.remembered.clear();
  }

  private isRemembered(tool: string, risk: RiskLevel): boolean {
    return this.remembered.get(tool)?.has(risk) ?? false;
  }
}
