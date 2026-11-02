/**
 * Palavra de ativação "trezentos" — 100% local.
 *
 * Como funciona: o VAD (Silero) separa cada fala; dos primeiros ~2 s de cada
 * fala, o NeMo pt local tira o texto; o texto é normalizado e a primeira
 * palavra de conteúdo (depois de "ei", "oi", "e"...) é comparada com
 * "trezentos" por semelhança fonética (ou o número "300"). Uma lista de
 * palavras parecidas (trezentas, duzentos, treze, presentes...) e regras de
 * contexto ("trezentos reais", "trezentos e cinquenta") evitam disparos falsos.
 * Nenhum áudio sai do computador nesta etapa.
 */
import type { Logger, WakeDetection, WakeWordEngine } from '../types';
import { SAMPLE_RATE } from './audio';
import type { VoiceActivityDetector } from './vad';

export const WAKE_WORD = 'trezentos';

/* ======================================================================
 * Normalização de texto e fonética do português
 * ==================================================================== */

/** Minúsculas, sem acentos. */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();
}

export interface WakeToken {
  raw: string;
  norm: string;
  start: number;
  end: number;
}

/** Palavras e números do texto, com a posição no texto original. */
export function tokenizeForWake(text: string): WakeToken[] {
  const out: WakeToken[] = [];
  const re = /[\p{L}\p{M}\p{N}]+/gu;
  const src = text.normalize('NFC');
  for (const m of src.matchAll(re)) {
    const raw = m[0];
    const start = m.index ?? 0;
    out.push({ raw, norm: foldText(raw), start, end: start + raw.length });
  }
  return out;
}

/**
 * Código fonético aproximado do pt-BR: z/s/ç/ss → s, c antes de e/i → s,
 * qu/c → k, ch → x, lh/nh, h mudo, g antes de e/i → j, letras repetidas.
 * "trezentos" → "tresentos".
 */
export function phoneticPt(word: string): string {
  let w = word.toLowerCase().replace(/ç/g, 's');
  w = foldText(w).replace(/[^a-z0-9]/g, '');
  w = w
    .replace(/ph/g, 'f')
    .replace(/[cs]h/g, 'x')
    .replace(/lh/g, 'li')
    .replace(/nh/g, 'ni')
    .replace(/qu(?=[ei])/g, 'k')
    .replace(/gu(?=[ei])/g, 'g')
    .replace(/[sx]c(?=[ei])/g, 's')
    .replace(/c(?=[ei])/g, 's')
    .replace(/[cq]/g, 'k')
    .replace(/g(?=[ei])/g, 'j')
    .replace(/z/g, 's')
    .replace(/y/g, 'i')
    .replace(/w/g, 'u')
    .replace(/h/g, '')
    .replace(/([a-z])\1+/g, '$1');
  return w;
}

/** Distância de edição de Levenshtein. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length]!;
}

/** Distância normalizada (0 = igual, 1 = nada a ver). */
export function normalizedDistance(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  return len === 0 ? 0 : levenshtein(a, b) / len;
}

const WAKE_PHONETIC = phoneticPt(WAKE_WORD);

/** Palavras que podem vir antes de "trezentos" ("ei, trezentos", "e trezentos"). */
export const WAKE_FILLERS: ReadonlySet<string> = new Set([
  'e', 'ei', 'eii', 'hei', 'hey', 'ey', 'oi', 'oie', 'o', 'oh', 'ola', 'oa', 'olar', 'alo', 'ok', 'okay', 'okei', 'ai', 'ah', 'eh', 'opa', 'ue', 'fala',
]);

/** Palavras parecidas que NUNCA ativam (comparadas sem acento). */
export const WAKE_CONFUSABLES: ReadonlySet<string> = new Set([
  'trezentas', 'trezentésimo', 'trezentesimo', 'trezentesima', 'duzentos', 'duzentas', 'treze', 'trinta', 'tres', 'trem', 'trens',
  'presente', 'presentes', 'presenta', 'presidente', 'presidentes', 'tremendo', 'tremendos', 'tremenda', 'tremendas', 'tenso', 'tensos',
  'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos', 'trezena', 'dezenas', 'dezena', 'trigentos',
  'prezados', 'prezado', 'tridentes', 'tridente', 'torrentes', 'torrente', 'trezentinhos', 'centavos', 'centavo', 'contentes', 'contente',
  'trazendo', 'tecendo', 'tremem', 'pretendo', 'pretende',
]);

/** Depois de "trezentos", estas palavras indicam quantidade, não chamado. */
const NUMERIC_FOLLOWERS: ReadonlySet<string> = new Set([
  'reais', 'real', 'mil', 'milhao', 'milhoes', 'bilhoes', 'metros', 'metro', 'gramas', 'grama', 'quilos', 'quilo', 'kg', 'km', 'litros', 'litro',
  'pessoas', 'por', 'cento', 'dolares', 'dolar', 'euros', 'euro', 'anos', 'dias', 'meses', 'vezes', 'unidades', 'pecas', 'paginas', 'mais', 'menos',
  'graus', 'minutos', 'segundos', 'horas', 'km/h', 'centavos', 'pontos', 'votos', 'alunos', 'casas', 'carros', 'reis',
]);

const NUMBER_WORDS: ReadonlySet<string> = new Set([
  'um', 'uma', 'dois', 'duas', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quatorze',
  'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa',
  'meio', 'meia',
]);

export interface WakeMatch {
  matched: boolean;
  /** 1 = idêntico; cai com a distância fonética. */
  score: number;
  /** Texto que veio depois da palavra de ativação ("que horas são?"). */
  remainder: string;
  /** Palavra que foi comparada (sem acento). */
  token?: string;
  /** Motivo da decisão (diagnóstico, pt-BR curto). */
  reason: string;
}

export interface WakeMatchOptions {
  /** 0..1: maior aceita pronúncias mais distantes (settings.wake.sensitivity). */
  sensitivity?: number;
}

/**
 * Quantas letras (no código fonético de "trezentos", 9 letras) podem mudar
 * para a sensibilidade: <0,15 → 0; <0,35 → 1; <0,8 → 2 (padrão 0,5); senão 3.
 */
export function maxEditsFor(sensitivity = 0.5): number {
  const s = Number.isFinite(sensitivity) ? Math.min(1, Math.max(0, sensitivity)) : 0.5;
  return s < 0.15 ? 0 : s < 0.35 ? 1 : s < 0.8 ? 2 : 3;
}

/** Distância normalizada máxima aceita para a sensibilidade. */
export function maxDistanceFor(sensitivity = 0.5): number {
  return maxEditsFor(sensitivity) / WAKE_PHONETIC.length + 0.01;
}

/**
 * "trezentos" termina em "-os": exigir esse final separa as variações do
 * reconhecedor ("tezentos", "treentos", "tesendos") das palavras parecidas
 * no feminino/plural ("trezentas", "presentes", "tresentes").
 */
function hasWakeEnding(folded: string): boolean {
  return /(?:os|us|o)$/.test(folded);
}

let confusableCache: Set<string> | null = null;
/** Códigos fonéticos das palavras parecidas ("tresentas" = "trezentas"). */
function confusableCodes(): ReadonlySet<string> {
  if (!confusableCache) confusableCache = new Set([...WAKE_CONFUSABLES].map((w) => phoneticPt(w)));
  return confusableCache;
}

function remainderAfter(text: string, end: number): string {
  return text
    .normalize('NFC')
    .slice(end)
    .replace(/^[\s,.;:!?…\-–—"'”“)]+/u, '')
    .trim();
}

/** Decide se o texto começa chamando o 300. */
export function matchWakeWord(text: string, opts: WakeMatchOptions = {}): WakeMatch {
  const no = (reason: string, token?: string): WakeMatch => ({ matched: false, score: 0, remainder: '', reason, ...(token ? { token } : {}) });
  const tokens = tokenizeForWake(text ?? '');
  if (tokens.length === 0) return no('sem fala');
  let i = 0;
  while (i < tokens.length && i < 2 && WAKE_FILLERS.has(tokens[i]!.norm)) i++;
  if (i >= tokens.length) return no('só interjeições');
  const first = tokens[i]!;
  const maxDist = maxDistanceFor(opts.sensitivity);

  const contextBlocks = (afterIndex: number): string | null => {
    const next = tokens[afterIndex + 1];
    if (!next) return null;
    if (/^\d/.test(next.norm)) return 'seguido de número';
    if (NUMERIC_FOLLOWERS.has(next.norm)) return `quantidade ("${next.norm}")`;
    if (next.norm === 'e') {
      const after = tokens[afterIndex + 2];
      if (after && (NUMBER_WORDS.has(after.norm) || /^\d/.test(after.norm))) return 'número composto';
    }
    return null;
  };

  const accept = (lastIndex: number, dist: number, token: string): WakeMatch => {
    const blocked = contextBlocks(lastIndex);
    if (blocked) return no(blocked, token);
    return { matched: true, score: Math.max(0, 1 - dist), remainder: remainderAfter(text, tokens[lastIndex]!.end), token, reason: dist === 0 ? 'exata' : 'aproximada' };
  };

  // O número escrito ("300", "300,").
  if (first.norm === '300') return accept(i, 0, '300');
  if (/^\d/.test(first.norm)) return no('outro número', first.norm);

  const code = phoneticPt(first.norm);
  if (WAKE_CONFUSABLES.has(first.norm) || confusableCodes().has(code)) return no('palavra parecida', first.norm);
  const dist = normalizedDistance(code, WAKE_PHONETIC);
  if (code.length >= 5 && dist <= maxDist) {
    if (!hasWakeEnding(first.norm)) return no('final diferente de "-os"', first.norm);
    return accept(i, dist, first.norm);
  }

  // O reconhecedor às vezes separa a palavra ("tre zentos", "t ezentos").
  const second = tokens[i + 1];
  if (second && !WAKE_CONFUSABLES.has(second.norm) && !NUMERIC_FOLLOWERS.has(second.norm) && first.norm.length <= 4 && hasWakeEnding(second.norm)) {
    const joinedNorm = first.norm + second.norm;
    const joined = phoneticPt(joinedNorm);
    const d2 = levenshtein(joined, WAKE_PHONETIC);
    // pedaço sem sentido ("t", "tre"): mesma tolerância; palavra de verdade ("três"): no máximo 1 letra
    const fragment = first.norm.length <= 2 || !/[aeiou]/.test(first.norm) || first.norm === 'tre';
    const limit = fragment ? Math.round(maxDist * WAKE_PHONETIC.length) : Math.min(1, Math.round(maxDist * WAKE_PHONETIC.length));
    if (d2 <= limit && !confusableCodes().has(joined)) return accept(i + 1, d2 / Math.max(joined.length, WAKE_PHONETIC.length), joinedNorm);
  }
  return no('não é a palavra de ativação', first.norm);
}

/* ======================================================================
 * Motor de ativação local (VAD + reconhecimento dos primeiros ~2 s)
 * ==================================================================== */
export interface WakeRecognizer {
  decode(samples: Float32Array, sampleRate?: number): Promise<{ text: string }>;
}

export interface LocalWakeDetection extends WakeDetection {
  /** A pessoa ainda está falando (o comando continua depois da ativação). */
  ongoing: boolean;
  /** Texto reconhecido no trecho analisado. */
  text: string;
}

export interface WakeCandidate {
  text: string;
  match: WakeMatch;
  ongoing: boolean;
  decodeMs: number;
}

export interface LocalWakeWordOptions {
  vad: VoiceActivityDetector;
  recognizer: WakeRecognizer;
  /** settings.wake.sensitivity (lido a cada decisão). */
  sensitivity?: number | (() => number);
  /** Segundos de fala analisados (padrão 2,0). */
  windowSec?: number;
  /** Pré-rolagem do VAD em ms (para o tamanho da janela; padrão 400). */
  preRollMs?: number;
  logger?: Logger;
  onCandidate?: (c: WakeCandidate) => void;
  /** Liberado no dispose() (ex.: devolve o NeMo compartilhado). */
  release?: () => void;
}

export class LocalWakeWord implements WakeWordEngine {
  readonly id = 'local';
  private checked = false;
  private disposed = false;
  private readonly windowSamples: number;

  constructor(private readonly opts: LocalWakeWordOptions) {
    const speechSec = Math.min(4, Math.max(0.8, opts.windowSec ?? 2.0));
    this.windowSamples = Math.round((speechSec + (opts.preRollMs ?? 400) / 1000) * SAMPLE_RATE);
  }

  private sensitivity(): number {
    const s = this.opts.sensitivity;
    return typeof s === 'function' ? s() : (s ?? 0.5);
  }

  accept(samples: Float32Array): Promise<LocalWakeDetection | null> | null {
    if (this.disposed) return null;
    const pending: { audio: Float32Array; ongoing: boolean }[] = [];
    for (const ev of this.opts.vad.accept(samples)) {
      if (ev.type === 'speech_start') {
        this.checked = false;
      } else {
        if (!this.checked && ev.segment.length > 0) pending.push({ audio: ev.segment, ongoing: false });
        this.checked = false;
      }
    }
    const vad = this.opts.vad;
    if (vad.speaking && !this.checked && (vad.speechMs() * SAMPLE_RATE) / 1000 >= this.windowSamples) {
      this.checked = true;
      const cur = vad.currentSpeech();
      if (cur) pending.push({ audio: cur, ongoing: true });
    }
    if (pending.length === 0) return null;
    return this.evaluateAll(pending);
  }

  private async evaluateAll(items: { audio: Float32Array; ongoing: boolean }[]): Promise<LocalWakeDetection | null> {
    for (const it of items) {
      const det = await this.evaluate(it.audio, it.ongoing);
      if (det) return det;
    }
    return null;
  }

  /** Analisa um trecho de fala (público para testes e diagnóstico). */
  async evaluate(audio: Float32Array, ongoing: boolean): Promise<LocalWakeDetection | null> {
    if (this.disposed) return null;
    const window = audio.length > this.windowSamples ? audio.subarray(0, this.windowSamples) : audio;
    const t0 = Date.now();
    let text = '';
    try {
      text = (await this.opts.recognizer.decode(window, SAMPLE_RATE)).text;
    } catch (e) {
      this.opts.logger?.warn('ativação: falha ao reconhecer trecho', e instanceof Error ? e.message : String(e));
      return null;
    }
    const match = matchWakeWord(text, { sensitivity: this.sensitivity() });
    this.opts.onCandidate?.({ text, match, ongoing, decodeMs: Date.now() - t0 });
    if (!match.matched || this.disposed) return null;
    let remainder = match.remainder;
    let fullText = text;
    if (!ongoing && audio.length > window.length) {
      // A fala terminou mas era maior que a janela: transcreve tudo para pegar o comando.
      try {
        fullText = (await this.opts.recognizer.decode(audio, SAMPLE_RATE)).text;
        const m2 = matchWakeWord(fullText, { sensitivity: 1 });
        if (m2.matched) remainder = m2.remainder;
      } catch {
        /* fica com o restante parcial */
      }
    }
    return {
      engine: this.id,
      score: match.score,
      ongoing,
      text: fullText,
      audio,
      ...(ongoing ? {} : remainder ? { remainder } : {}),
    };
  }

  reset(): void {
    this.checked = false;
    this.opts.vad.reset();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.opts.vad.dispose();
    this.opts.release?.();
  }
}

/** Tira a palavra de ativação do começo de uma transcrição completa ("Trezentos, abre..." → "abre..."). */
export function stripWakeWord(text: string): string {
  const m = matchWakeWord(text, { sensitivity: 1 });
  return m.matched ? m.remainder : text.trim();
}
