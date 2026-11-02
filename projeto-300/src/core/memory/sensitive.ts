/**
 * Detecção conservadora de conteúdo sensível (documentos, finanças, saúde,
 * senhas, intimidade). Na dúvida, marca como sensível: o custo é só a memória
 * não aparecer em buscas comuns sem pedido explícito.
 */
import { foldText } from './text';

function digitsOf(s: string): number[] {
  return [...s.replace(/\D/g, '')].map(Number);
}

export function isValidCpf(s: string): boolean {
  const d = digitsOf(s);
  if (d.length !== 11 || d.every((x) => x === d[0])) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i]! * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === d[9] && calc(10) === d[10];
}

export function isValidCnpj(s: string): boolean {
  const d = digitsOf(s);
  if (d.length !== 14 || d.every((x) => x === d[0])) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i]! * w[i]!;
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === d[12] && calc(13) === d[13];
}

export function passesLuhn(s: string): boolean {
  const d = digitsOf(s);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let x = d[d.length - 1 - i]!;
    if (i % 2 === 1) {
      x *= 2;
      if (x > 9) x -= 9;
    }
    sum += x;
  }
  return sum % 10 === 0;
}

const KEYWORDS: RegExp[] = [
  // credenciais
  /\b(senha|senhas|password|passcode|pin|cvv|cvc|codigo de seguranca|token de acesso|chave de api|api key|segredo|2fa|codigo de verificacao)\b/,
  // documentos
  /\b(cpf|cnpj|rg|cnh|passaporte|titulo de eleitor|pis|pasep|nis|certidao|carteira de identidade|numero da identidade|carteira de trabalho)\b/,
  // finanças
  /\b(conta bancaria|conta corrente|poupanca|agencia bancaria|agencia e conta|agencia do banco|saldo|salario|renda|divida|dividas|emprestimo|financiamento|cartao de credito|cartao de debito|chave pix|pix|fatura|investimento|investimentos|imposto de renda|boleto)\b/,
  // dados bancários com número ("agência 1234, conta 56789-0")
  /\b(agencia|conta)\W{0,4}\d{3,}/,
  // saúde
  /\b(diagnostico|doenca|doente|remedio|remedios|medicamento|medicamentos|tratamento medico|tratamento de saude|em tratamento|fazendo tratamento|terapia|terapeuta|psiquiatra|psicologo|psicologa|depressao|ansiedade|cancer|hiv|diabetes|gravidez|gravida|cirurgia|exame de sangue|laudo|internacao|hospital|plano de saude|alergia|alergico|alergica)\b/,
  // intimidade
  /\b(sexual|sexo|intimo|intima|orientacao sexual|religiao|partido politico)\b/,
];

const SECRETISH: RegExp[] = [
  /sk-[A-Za-z0-9_-]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
];

/** Diz se o texto parece conter informação sensível. */
export function looksSensitive(text: string): boolean {
  const raw = String(text ?? '');
  if (SECRETISH.some((re) => re.test(raw))) return true;
  for (const m of raw.matchAll(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g)) if (isValidCpf(m[0])) return true;
  for (const m of raw.matchAll(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g)) if (isValidCnpj(m[0])) return true;
  for (const m of raw.matchAll(/\d(?:[ -]?\d){12,18}/g)) if (passesLuhn(m[0])) return true;
  const folded = foldText(raw);
  return KEYWORDS.some((re) => re.test(folded));
}

/*
 * Pedidos de "lembrar". Palavras inteiras (\p{L} = letra), para que "lembrete",
 * "salvei", "guarda-chuva", "registrado" ou "não esqueci" NÃO contem como pedido.
 */
const REMEMBER_CUES: RegExp[] = [
  // imperativo: "lembre que...", "guarde isso", "anota aí", "quero que você memorize"
  /(?<![\p{L}\p{N}])(lembre-se|lembre|lembrese|guarde|guarda|anote|anota|memorize|memoriza|salve|salva|registre|registra|grave|grava)(?![\p{L}\p{N}-])/u,
  // "lembra que..." (mas não "você lembra...?" / "ele se lembra", que não são pedidos)
  /(?<!(?:voce|vc|tu|ele|ela)\s+(?:se\s+)?)(?<![\p{L}\p{N}])lembra(?![\p{L}\p{N}-])/u,
  // pedido com infinitivo: "pode anotar que...", "poderia guardar..." (não "pode me lembrar amanhã", que é lembrete)
  /(?<![\p{L}\p{N}])(pode|poderia|podes|consegue|favor)\s+(lembrar|guardar|anotar|memorizar|salvar|registrar|gravar)(?![\p{L}\p{N}])/u,
  // "não esqueça", "não se esqueça", "não esquece"
  /(?<![\p{L}\p{N}])nao\s+(se\s+)?esquec(a|e|am)(?![\p{L}\p{N}])/u,
  // "coloca isso na memória"
  /(?<![\p{L}\p{N}])(coloque|coloca|ponha|poe|bota|adicione|adiciona|inclua|inclui)\s+(isso\s+|isto\s+)?(na|em)\s+(sua\s+)?memoria(?![\p{L}\p{N}])/u,
  // inglês
  /(?<![\p{L}\p{N}])(remember (that|this|my)|please remember|save this|note that|keep in mind|don'?t forget|do not forget)(?![\p{L}\p{N}])/u,
];

/** O dono pediu claramente para lembrar/guardar algo? (checagem extra além do que o modelo disse) */
export function hasRememberCue(userText: string): boolean {
  const t = foldText(String(userText ?? ''));
  return REMEMBER_CUES.some((re) => re.test(t));
}
