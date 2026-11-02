/**
 * Portão de execução de ferramentas.
 *
 * Cada chamada passa por aqui antes de rodar:
 * 1. calcula o risco (de `tool.risk`, função ou constante);
 * 2. gera descrição pt-BR (de `tool.describe`, com texto padrão de reserva);
 * 3. oculta segredos da entrada para auditoria/confirmação;
 * 4. consulta a política -> allow / deny / ask;
 * 5. "ask" vira pedido ao dono pelo intermediário de confirmação;
 * 6. "lembrar na sessão" só vale para read/write;
 * 7. registra TODA decisão na auditoria (kind 'permission') e os resultados em
 *    `recordResult` (kind 'tool').
 *
 * Nunca lança com entrada hostil: qualquer erro vira negação.
 */
import type { AuditLog, PermissionPolicy, RiskLevel, SettingsAccess, ToolCallInfo, ToolGate } from '../types';
import { ConfirmationBroker } from './confirmation';
import { redactInput } from './redact';

export interface ToolGateDeps {
  policy: PermissionPolicy;
  broker: ConfirmationBroker;
  audit: AuditLog;
  settings: SettingsAccess;
}

const RISKS: readonly RiskLevel[] = ['read', 'write', 'external', 'destructive', 'financial', 'system'];

function oneLine(s: string, max = 300): string {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function shortMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  try {
    return String(e);
  } catch {
    return 'erro desconhecido';
  }
}

function toJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return '[entrada não serializável]';
  }
}

export function createToolGate(deps: ToolGateDeps): ToolGate {
  const { policy, broker, audit } = deps;

  const riskOf = (call: ToolCallInfo): RiskLevel => {
    try {
      const r = typeof call.tool.risk === 'function' ? call.tool.risk(call.input) : call.tool.risk;
      return RISKS.includes(r) ? r : 'system';
    } catch {
      return 'system'; // na dúvida, o risco mais alto (sempre pergunta)
    }
  };

  const describe = (call: ToolCallInfo): string => {
    try {
      if (call.tool.describe) {
        const d = call.tool.describe(call.input);
        if (typeof d === 'string' && d.trim() !== '') return oneLine(d);
      }
    } catch {
      /* descrição com erro: usa o texto padrão */
    }
    return `Executar a ferramenta "${call.tool.title ?? call.tool.name}".`;
  };

  const recordDecision = (
    call: ToolCallInfo,
    risk: RiskLevel,
    decision: 'allow' | 'deny' | 'approved' | 'rejected',
    redacted: unknown,
    detail: string,
  ): void => {
    try {
      audit.record({
        actor: call.actor,
        kind: 'permission',
        tool: call.tool?.name,
        risk,
        decision,
        input: toJson(redacted),
        outcome: decision === 'deny' || decision === 'rejected' ? 'bloqueado' : 'ok',
        detail: oneLine(detail, 2000),
      });
    } catch {
      /* auditoria nunca derruba a decisão */
    }
  };

  return {
    async authorize(call: ToolCallInfo, signal: AbortSignal): Promise<{ allowed: boolean; reason: string }> {
      try {
        const risk = riskOf(call);
        let redacted: unknown;
        try {
          redacted = redactInput(call.input);
        } catch {
          redacted = '[entrada não serializável]';
        }

        const verdict = policy.evaluate({
          tool: call.tool.name,
          risk,
          input: call.input,
          actor: call.actor,
          tainted: call.tainted === true,
        });

        if (verdict.decision === 'allow') {
          recordDecision(call, risk, 'allow', redacted, verdict.reason);
          return { allowed: true, reason: verdict.reason };
        }
        if (verdict.decision === 'deny') {
          recordDecision(call, risk, 'deny', redacted, verdict.reason);
          return { allowed: false, reason: verdict.reason };
        }

        // decisão "ask": pede confirmação ao dono.
        let response: { approved: boolean; remember?: 'session' };
        try {
          response = await broker.request(
            {
              tool: call.tool.name,
              title: call.tool.title ?? call.tool.name,
              description: describe(call),
              risk,
              input: redacted,
              actor: call.actor,
              tainted: call.tainted === true,
            },
            signal ? { signal } : {},
          );
        } catch {
          recordDecision(call, risk, 'rejected', redacted, 'falha ao pedir confirmação.');
          return { allowed: false, reason: 'Não consegui confirmar com você; por segurança, não fiz a ação.' };
        }

        if (response.approved === true) {
          if (response.remember === 'session' && (risk === 'read' || risk === 'write')) {
            try {
              policy.rememberForSession(call.tool.name, risk);
            } catch {
              /* lembrar é melhor-esforço */
            }
          }
          recordDecision(call, risk, 'approved', redacted, verdict.reason);
          return { allowed: true, reason: 'Aprovado por você.' };
        }

        recordDecision(call, risk, 'rejected', redacted, verdict.reason);
        return { allowed: false, reason: 'Você não autorizou esta ação.' };
      } catch (e) {
        try {
          audit.record({
            actor: call?.actor ?? 'agent',
            kind: 'security',
            tool: call?.tool?.name,
            decision: 'deny',
            outcome: 'bloqueado',
            detail: 'erro ao autorizar: ' + oneLine(shortMessage(e), 400),
          });
        } catch {
          /* ignora */
        }
        return { allowed: false, reason: 'Erro ao verificar a permissão. A ação foi bloqueada por segurança.' };
      }
    },

    recordResult(call: ToolCallInfo, outcome: 'ok' | 'erro' | 'cancelado', detail: string): void {
      try {
        let risk: RiskLevel | undefined;
        try {
          const r = typeof call.tool.risk === 'function' ? call.tool.risk(call.input) : call.tool.risk;
          risk = RISKS.includes(r) ? r : undefined;
        } catch {
          risk = undefined;
        }
        let redacted: unknown;
        try {
          redacted = redactInput(call.input);
        } catch {
          redacted = '[entrada não serializável]';
        }
        audit.record({
          actor: call.actor,
          kind: 'tool',
          tool: call.tool?.name,
          ...(risk ? { risk } : {}),
          input: toJson(redacted),
          outcome,
          detail: oneLine(detail, 2000),
        });
      } catch {
        /* auditoria nunca derruba a operação */
      }
    },
  };
}
