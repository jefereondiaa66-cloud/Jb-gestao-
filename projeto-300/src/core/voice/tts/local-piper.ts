/**
 * Voz local Piper pt-BR (sherpa-onnx 2.x + piper-phonemize).
 *
 * O sherpa-onnx 2.x não traz mais o espeak-ng: os fonemas vêm do
 * piper-phonemize-node e são passados como phonemeCodepoints. O áudio sai
 * frase a frase (callback de progresso do generateAsync), então a primeira
 * frase começa a tocar antes de o trecho inteiro ficar pronto.
 */
import { readFileSync } from 'node:fs';
import type { AudioChunk, TtsProvider, TtsVoice } from '../../types';
import { AsyncQueue } from '../async-queue';
import { VoiceError, abortError, throwIfAborted } from '../errors';
import { DEFAULT_PIPER_VOICE, type ModelManager } from '../models';
import { getPiperEngine, loadPiperPhonemize } from '../native';

export interface LocalPiperTtsOptions {
  models: Pick<ModelManager, 'isInstalled' | 'filePath' | 'specs'>;
  /** Voz padrão (settings.voice.localTtsVoice), lida a cada fala. */
  defaultVoice?: string | (() => string);
  numThreads?: number;
}

/** Aplica o phoneme_map do arquivo .onnx.json da voz (como o Piper original faz). */
export function applyPhonemeMap(sentences: number[][], map: Record<string, string[]> | undefined): number[][] {
  if (!map || Object.keys(map).length === 0) return sentences;
  const table = new Map<number, number[]>();
  for (const [from, to] of Object.entries(map)) {
    const cp = from.codePointAt(0);
    if (cp === undefined || [...from].length !== 1 || !Array.isArray(to)) continue;
    table.set(cp, to.flatMap((t) => [...t].map((c) => c.codePointAt(0)!)));
  }
  return sentences.map((s) => s.flatMap((cp) => table.get(cp) ?? [cp]));
}

/** Lê o tokens.txt da voz ("<símbolo> <id>" por linha) e devolve os códigos aceitos. */
export function parseTokenSymbols(content: string): Set<number> {
  const set = new Set<number>();
  for (const raw of content.split(/\r?\n/)) {
    if (!raw) continue;
    const sp = raw.lastIndexOf(' ');
    if (sp <= 0) continue;
    const sym = raw.slice(0, sp);
    const chars = [...sym];
    if (chars.length === 1) set.add(chars[0]!.codePointAt(0)!);
  }
  return set;
}

/** Tira fonemas que a voz não conhece (o sherpa pularia com um aviso a cada frase). */
export function filterKnownPhonemes(sentences: number[][], known: Set<number> | null): number[][] {
  if (!known || known.size === 0) return sentences;
  return sentences.map((s) => s.filter((cp) => known.has(cp))).filter((s) => s.length > 0);
}

/** Texto -> fonemas por frase (só frases não vazias). */
export async function phonemizePtBr(text: string): Promise<number[][]> {
  const pp = await loadPiperPhonemize();
  let out: number[][] | null;
  try {
    out = pp.phonemize(text, 'pt-br');
  } catch (e) {
    throw new VoiceError('motor_falhou', 'Não foi possível preparar o texto para a voz local.', { cause: e });
  }
  return (out ?? []).filter((s) => Array.isArray(s) && s.length > 0);
}

export class LocalPiperTts implements TtsProvider {
  readonly id = 'local';
  private readonly phonemeMaps = new Map<string, Record<string, string[]> | undefined>();
  private readonly knownSymbols = new Map<string, Set<number> | null>();

  constructor(private readonly opts: LocalPiperTtsOptions) {}

  private piperSpecs() {
    return this.opts.models.specs().filter((s) => s.kind === 'tts' && s.voice);
  }

  async voices(): Promise<TtsVoice[]> {
    return this.piperSpecs()
      .filter((s) => this.opts.models.isInstalled(s.id))
      .map((s) => ({ id: s.id, label: s.label, language: 'pt-BR' }));
  }

  /** Escolhe a voz: a pedida, a padrão das configurações, ou a primeira instalada. */
  resolveVoice(requested?: string): string {
    const installed = this.piperSpecs().filter((s) => this.opts.models.isInstalled(s.id));
    const want = [requested, typeof this.opts.defaultVoice === 'function' ? this.opts.defaultVoice() : this.opts.defaultVoice, DEFAULT_PIPER_VOICE];
    for (const w of want) {
      if (w && installed.some((s) => s.id === w)) return w;
    }
    if (installed[0]) return installed[0].id;
    throw new VoiceError('modelo_ausente', 'Nenhuma voz local foi baixada ainda. Abra Configurações > Voz e baixe os modelos de voz.');
  }

  private phonemeMap(id: string, file: string): Record<string, string[]> | undefined {
    if (this.phonemeMaps.has(id)) return this.phonemeMaps.get(id);
    let map: Record<string, string[]> | undefined;
    try {
      const json = JSON.parse(readFileSync(this.opts.models.filePath(id, `${file}.json`), 'utf8')) as { phoneme_map?: Record<string, string[]> };
      map = json.phoneme_map && typeof json.phoneme_map === 'object' ? json.phoneme_map : undefined;
    } catch {
      map = undefined; // sem .json: usa os fonemas como vierem
    }
    this.phonemeMaps.set(id, map);
    return map;
  }

  private symbols(id: string): Set<number> | null {
    if (this.knownSymbols.has(id)) return this.knownSymbols.get(id)!;
    let set: Set<number> | null = null;
    try {
      set = parseTokenSymbols(readFileSync(this.opts.models.filePath(id, 'tokens.txt'), 'utf8'));
    } catch {
      set = null;
    }
    this.knownSymbols.set(id, set);
    return set;
  }

  async *synthesize(text: string, opts: { voice?: string; speed?: number; signal?: AbortSignal } = {}): AsyncIterable<AudioChunk> {
    const signal = opts.signal;
    throwIfAborted(signal);
    const clean = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    const id = this.resolveVoice(opts.voice);
    const spec = this.piperSpecs().find((s) => s.id === id)!;
    const file = spec.voice!.file;
    const speed = Number.isFinite(opts.speed) && opts.speed! > 0 ? Math.min(2, Math.max(0.5, opts.speed!)) : 1;
    const phonemes = filterKnownPhonemes(applyPhonemeMap(await phonemizePtBr(clean), this.phonemeMap(id, file)), this.symbols(id));
    if (phonemes.length === 0) return;
    const { engine, queue } = getPiperEngine({
      model: this.opts.models.filePath(id, file),
      tokens: this.opts.models.filePath(id, 'tokens.txt'),
      numThreads: this.opts.numThreads ?? 2,
    });
    const tts = await engine;
    throwIfAborted(signal);
    const out = new AsyncQueue<AudioChunk>();
    let pieces = 0;
    void queue
      .run(async () => {
        if (signal?.aborted) return null;
        return tts.generateAsync({
          text: clean,
          sid: 0,
          speed,
          enableExternalBuffer: false,
          generationConfig: { phonemeCodepoints: phonemes, speed, sid: 0, silenceScale: 0.2 },
          onProgress: (info) => {
            if (signal?.aborted) return 0; // pede para o sherpa parar
            if (info?.samples && info.samples.length > 0) {
              pieces++;
              out.push({ samples: new Float32Array(info.samples), sampleRate: tts.sampleRate });
            }
            return 1;
          },
        });
      })
      .then(
        (result) => {
          // Sem callbacks de progresso: entrega o áudio inteiro de uma vez.
          if (pieces === 0 && result && result.samples.length > 0 && !signal?.aborted) {
            out.push({ samples: new Float32Array(result.samples), sampleRate: result.sampleRate || tts.sampleRate });
          }
          out.end();
        },
        (e: unknown) => out.fail(new VoiceError('motor_falhou', 'A voz local falhou ao falar este trecho.', { cause: e })),
      );
    for await (const chunk of out) {
      if (signal?.aborted) throw abortError();
      yield chunk;
    }
    throwIfAborted(signal);
  }
}
