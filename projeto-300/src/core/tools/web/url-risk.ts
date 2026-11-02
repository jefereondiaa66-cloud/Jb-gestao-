/**
 * Risco de "vazamento pela URL": abrir ou buscar um endereço montado pelo
 * modelo pode mandar dados do dono para fora (ex.: https://site/?d=<segredo>),
 * principalmente depois de ler conteúdo externo malicioso. URLs simples são
 * leitura; URLs com dados longos/pessoais na consulta pedem confirmação.
 */
import net from 'node:net';
import { looksSensitive } from '../../memory/sensitive';
import { isBlockedAddress } from '../../security/net';
import type { RiskLevel } from '../../types';

export interface UrlRiskInfo {
  risk: RiskLevel;
  reasons: string[];
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s.replace(/\+/g, ' '));
  } catch {
    return s;
  }
}

export function assessUrl(raw: string): UrlRiskInfo {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { risk: 'read', reasons: [] }; // inválida: a ferramenta recusa na execução
  }
  const reasons: string[] = [];
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host) || /\.(localhost|local|internal|intranet|corp|home|lan)$/i.test(host)) {
    reasons.push('endereço da rede local');
  } else if (net.isIP(host) && isBlockedAddress(host)) {
    reasons.push('endereço IP privado/local');
  }
  const data = u.search + u.hash;
  if (data.length > 160) reasons.push('a URL carrega muitos dados na consulta');
  const decoded = safeDecode(u.pathname + ' ' + u.search + ' ' + u.hash);
  if (looksSensitive(decoded)) reasons.push('a URL parece conter dados pessoais');
  if (/[A-Za-z0-9+/_-]{60,}={0,2}/.test(u.search + u.hash)) reasons.push('a URL tem um bloco codificado longo');
  if (/\b[\w.+-]+@[\w-]+\.[\w.]+\b/.test(decoded)) reasons.push('a URL contém um e-mail');
  return { risk: reasons.length ? 'external' : 'read', reasons };
}

export function urlRisk(raw: string): RiskLevel {
  return assessUrl(raw).risk;
}
