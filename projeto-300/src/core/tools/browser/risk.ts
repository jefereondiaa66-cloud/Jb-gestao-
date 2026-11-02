/**
 * Regras puras do navegador: leitura das referências (refs) do retrato de
 * acessibilidade, risco de cada clique (enviar/comprar/pagar pedem confirmação
 * com o nível certo) e detecção de campos de senha/cartão (nunca digitados).
 */
import type { RiskLevel } from '../../types';
import { fold } from '../files/util';

export interface RefInfo {
  ref: string;
  role: string;
  name: string;
}

/**
 * Lê as linhas do retrato "ai" do Playwright, como:
 *   - button "Finalizar compra" [ref=e8]
 *   - link "Ver mais" [ref=e9] [cursor=pointer]:
 */
export function parseAriaRefs(snapshot: string): Map<string, RefInfo> {
  const map = new Map<string, RefInfo>();
  const re = /^\s*-\s+([A-Za-z]+)(?:\s+"((?:[^"\\]|\\.)*)")?[^\n]*?\[ref=([A-Za-z0-9]+)\]/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(snapshot))) {
    const name = (m[2] ?? '').replace(/\\(.)/g, '$1');
    map.set(m[3]!, { ref: m[3]!, role: m[1]!.toLowerCase(), name });
  }
  return map;
}

/** Fatos do elemento real (lidos da página antes de agir). */
export interface ElementFacts {
  tag?: string;
  type?: string;
  role?: string;
  name?: string;
  text?: string;
  id?: string;
  autocomplete?: string;
  ariaLabel?: string;
  placeholder?: string;
  href?: string;
  inForm?: boolean;
  formAction?: string;
  editable?: boolean;
}

const FINANCIAL =
  /\b(pagar|pague|pagamento|pagamentos|checkout|check out|pix|cartao|cartoes|boleto|comprar|compre|compra agora|finalizar (a )?compra|fechar (o )?pedido|confirmar (o )?pagamento|assinar (o )?plano|assinatura|transferir|transferencia|doar|doacao|payment|pay|pay now|buy|buy now|purchase|place order|order now|subscribe|donate|checkout now|add funds|recarregar|recarga)\b/;
const EXTERNAL =
  /\b(enviar|envie|submit|send|confirmar|confirme|finalizar|concluir|assinar|publicar|postar|post|tweet|compartilhar|share|responder|reply|aceitar|accept|agree|concordo|cadastrar|registrar|sign up|signup|inscrever|salvar|save|excluir|delete|remover|apagar|login|log in|sign in|entrar|continuar|avancar|proximo|next|agendar|reservar|book)\b/;
const CHECKOUT_URL = /(checkout|pagamento|payment|carrinho|\/cart\b|\/pedido|\/order|billing|cobranca|\/pay\b|\/pix)/i;

/** Risco de clicar num elemento: financeiro > externo > escrita. */
export function classifyClick(el: ElementFacts & { role?: string; name?: string }, pageUrl = ''): RiskLevel {
  const words = fold([el.name, el.text, el.ariaLabel, el.id, el.formAction].filter(Boolean).join(' ')).slice(0, 600);
  const role = (el.role ?? '').toLowerCase();
  const tag = (el.tag ?? '').toLowerCase();
  const type = (el.type ?? '').toLowerCase();
  const isButtonish = role === 'button' || tag === 'button' || type === 'submit' || type === 'image' || role === 'menuitem';
  const submits = type === 'submit' || type === 'image' || (tag === 'button' && (type === '' || type === 'submit') && !!el.inForm);
  if (FINANCIAL.test(words)) return 'financial';
  if (isButtonish && CHECKOUT_URL.test(pageUrl)) return 'financial';
  if (submits || EXTERNAL.test(words)) return 'external';
  return 'write';
}

const SENSITIVE_FIELD = /(senha|password|passwd|passcode|\bpwd\b|\bpin\b|cvv|cvc|codigo de seguranca|security code|card ?number|numero do cartao|cartao de credito|credit card|\btoken\b|\botp\b|codigo de verificacao|2fa)/;

/** Campo de senha, código ou cartão: o 300 nunca digita. */
export function isSensitiveField(el: ElementFacts): boolean {
  const type = (el.type ?? '').toLowerCase();
  if (type === 'password') return true;
  const ac = (el.autocomplete ?? '').toLowerCase();
  if (/password|one-time-code|cc-/.test(ac)) return true;
  const words = fold([el.name, el.id, el.ariaLabel, el.placeholder].filter(Boolean).join(' '));
  return SENSITIVE_FIELD.test(words);
}

export const RISK_LABEL: Record<RiskLevel, string> = {
  read: 'leitura',
  write: 'ação na página',
  external: 'envia algo para fora',
  destructive: 'apaga algo',
  financial: 'envolve dinheiro',
  system: 'controla o computador',
};

const ORDER: RiskLevel[] = ['read', 'write', 'external', 'destructive', 'financial', 'system'];

export function higherRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}
