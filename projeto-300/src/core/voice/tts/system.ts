/**
 * Voz de reserva do Windows (SAPI, System.Speech) pelo Windows PowerShell 5.1.
 *
 * - O script vai codificado em -EncodedCommand (UTF-16LE em base64) e o texto
 *   vai em base64 UTF-8 numa variável de ambiente: nada de aspas para escapar,
 *   e acentos chegam inteiros.
 * - O áudio sai como PCM 16 bits mono 22,05 kHz direto no stdout binário.
 * - Prefere uma voz pt-BR instalada (ex.: "Microsoft Maria Desktop").
 */
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { join } from 'node:path';
import type { AudioChunk, TtsProvider, TtsVoice } from '../../types';
import { buildSafeEnv } from '../../security';
import { pcm16leToFloat } from '../audio';
import { VoiceError, abortError, throwIfAborted } from '../errors';

export const SYSTEM_TTS_SAMPLE_RATE = 22050;

/** Converte a velocidade (0,5..2) na escala de -10..10 do SAPI (±10 ≈ 3x). */
export function speedToSapiRate(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return 0;
  const r = Math.round((10 * Math.log(speed)) / Math.log(3));
  return Math.max(-10, Math.min(10, r));
}

/** Codifica um script para -EncodedCommand (UTF-16LE + base64). */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export const toBase64Utf8 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');

/** Script que fala o texto de $env:TRES_TEXTO e escreve PCM bruto no stdout. */
export function buildSpeakScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    'Add-Type -AssemblyName System.Speech',
    '$texto = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:TRES_TEXTO))',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try {',
    '  $escolhida = $null',
    '  if ($env:TRES_VOZ) {',
    '    $nome = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:TRES_VOZ))',
    '    $escolhida = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Name -eq $nome } | Select-Object -First 1',
    '  }',
    '  if (-not $escolhida) {',
    "    $escolhida = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'pt-BR' } | Select-Object -First 1",
    '  }',
    '  if ($escolhida) { $s.SelectVoice($escolhida.VoiceInfo.Name) }',
    '  $s.Rate = [int]$env:TRES_TAXA',
    '  $s.Volume = 100',
    '  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo([int]$env:TRES_HZ, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)',
    '  $ms = New-Object System.IO.MemoryStream',
    '  $s.SetOutputToAudioStream($ms, $fmt)',
    '  $s.Speak($texto)',
    '  $s.SetOutputToNull()',
    '  $bytes = $ms.ToArray()',
    '  $saida = [System.Console]::OpenStandardOutput()',
    '  $saida.Write($bytes, 0, $bytes.Length)',
    '  $saida.Flush()',
    '} finally {',
    '  $s.Dispose()',
    '}',
  ].join('\r\n');
}

/** Script que lista as vozes instaladas em JSON (UTF-8). */
export function buildVoicesScript(): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$ProgressPreference = 'SilentlyContinue'",
    '[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)',
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    'try {',
    '  $lista = @($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {',
    '    [pscustomobject]@{ nome = $_.VoiceInfo.Name; cultura = $_.VoiceInfo.Culture.Name; genero = [string]$_.VoiceInfo.Gender }',
    '  })',
    '  [Console]::Out.Write((ConvertTo-Json -InputObject $lista -Compress))',
    '} finally {',
    '  $s.Dispose()',
    '}',
  ].join('\r\n');
}

/** Lê a saída JSON do script de vozes. */
export function parseVoicesJson(stdout: string): TtsVoice[] {
  const text = stdout.replace(/^\uFEFF/, '').trim();
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const list = Array.isArray(data) ? data : [data];
  const out: TtsVoice[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { nome?: unknown; cultura?: unknown; genero?: unknown };
    if (typeof o.nome !== 'string' || !o.nome.trim()) continue;
    const culture = typeof o.cultura === 'string' ? o.cultura : '';
    const gender = o.genero === 'Female' ? 'feminina' : o.genero === 'Male' ? 'masculina' : '';
    out.push({ id: o.nome, label: `${o.nome}${culture ? ` (${culture}${gender ? `, ${gender}` : ''})` : ''}`, language: culture || 'desconhecido' });
  }
  return out;
}

/** Melhor voz pt-BR da lista (Maria, depois qualquer pt-BR, depois qualquer pt). */
export function pickPtBrVoice(voices: readonly TtsVoice[]): string | undefined {
  return (
    voices.find((v) => v.language === 'pt-BR' && /maria/i.test(v.id))?.id ??
    voices.find((v) => v.language === 'pt-BR')?.id ??
    voices.find((v) => v.language.toLowerCase().startsWith('pt'))?.id
  );
}

/** Caminho do Windows PowerShell 5.1 (evita pegar outro powershell.exe do PATH). */
export function windowsPowerShellPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.SystemRoot || env.SYSTEMROOT || env.windir || 'C:\\Windows';
  return join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe').replace(/\//g, '\\');
}

export function powerShellArgs(script: string): string[] {
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePowerShell(script)];
}

type SpawnFn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface SystemTtsOptions {
  /** settings.voice.ttsVoice (nome da voz do Windows; vazio = pt-BR automática). */
  voice?: string | (() => string);
  platform?: NodeJS.Platform;
  powershellPath?: string;
  spawn?: SpawnFn;
  timeoutMs?: number;
}

interface RunResult {
  stdout: Buffer;
  stderr: string;
}

export class SystemTts implements TtsProvider {
  readonly id = 'system';
  private voiceCache: TtsVoice[] | null = null;

  constructor(private readonly opts: SystemTtsOptions = {}) {}

  private get isWindows(): boolean {
    return (this.opts.platform ?? process.platform) === 'win32';
  }

  private run(script: string, extraEnv: Record<string, string>, signal?: AbortSignal): Promise<RunResult> {
    const spawnFn: SpawnFn = this.opts.spawn ?? (nodeSpawn as SpawnFn);
    const exe = this.opts.powershellPath ?? windowsPowerShellPath();
    return new Promise<RunResult>((resolve, reject) => {
      if (signal?.aborted) return reject(abortError());
      let child: ChildProcess;
      try {
        child = spawnFn(exe, powerShellArgs(script), {
          env: { ...buildSafeEnv(process.env), ...extraEnv },
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        return reject(new VoiceError('motor_falhou', 'Não foi possível abrir o PowerShell para usar a voz do Windows.', { cause: e }));
      }
      const out: Buffer[] = [];
      let err = '';
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        fn();
      };
      const onAbort = () => {
        child.kill();
        finish(() => reject(abortError()));
      };
      const timer = setTimeout(() => {
        child.kill();
        finish(() => reject(new VoiceError('motor_falhou', 'A voz do Windows demorou demais para responder.')));
      }, this.opts.timeoutMs ?? 60_000);
      signal?.addEventListener('abort', onAbort, { once: true });
      child.stdout?.on('data', (d: Buffer) => out.push(d));
      child.stderr?.on('data', (d: Buffer) => {
        if (err.length < 4000) err += d.toString('utf8');
      });
      child.on('error', (e) => finish(() => reject(new VoiceError('motor_falhou', 'Não foi possível abrir o PowerShell para usar a voz do Windows.', { cause: e }))));
      child.on('close', (code) => {
        finish(() => {
          if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
          else reject(new VoiceError('motor_falhou', `A voz do Windows falhou${err.trim() ? `: ${err.trim().split(/\r?\n/)[0]!.slice(0, 160)}` : '.'}`));
        });
      });
    });
  }

  async voices(signal?: AbortSignal): Promise<TtsVoice[]> {
    if (!this.isWindows) return [];
    if (this.voiceCache) return this.voiceCache;
    const r = await this.run(buildVoicesScript(), {}, signal);
    this.voiceCache = parseVoicesJson(r.stdout.toString('utf8'));
    return this.voiceCache;
  }

  async *synthesize(text: string, opts: { voice?: string; speed?: number; signal?: AbortSignal } = {}): AsyncIterable<AudioChunk> {
    throwIfAborted(opts.signal);
    if (!this.isWindows) throw new VoiceError('sem_suporte', 'A voz do Windows só funciona no Windows. Escolha outra voz nas configurações.');
    const input = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!input) return;
    const voice = (opts.voice ?? '').trim() || (typeof this.opts.voice === 'function' ? this.opts.voice() : (this.opts.voice ?? '')).trim();
    const env: Record<string, string> = {
      TRES_TEXTO: toBase64Utf8(input),
      TRES_TAXA: String(speedToSapiRate(opts.speed ?? 1)),
      TRES_HZ: String(SYSTEM_TTS_SAMPLE_RATE),
      ...(voice ? { TRES_VOZ: toBase64Utf8(voice) } : {}),
    };
    const r = await this.run(buildSpeakScript(), env, opts.signal);
    const bytes = new Uint8Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength);
    if (bytes.length < 2) throw new VoiceError('motor_falhou', 'A voz do Windows não gerou áudio. Confira se há vozes instaladas no Windows.');
    yield { samples: pcm16leToFloat(bytes), sampleRate: SYSTEM_TTS_SAMPLE_RATE };
  }
}
