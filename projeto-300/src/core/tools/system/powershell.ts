/**
 * Montagem de chamadas ao Windows PowerShell 5.1 sem bugs de aspas:
 * - o script vai em -EncodedCommand (UTF-16LE em base64, montado por nós);
 * - o código do comando do dono/modelo vai DENTRO do script como base64
 *   UTF-8 e é executado com [ScriptBlock]::Create (nada é concatenado);
 * - a saída é escrita por um StreamWriter UTF-8 próprio (acentos corretos),
 *   com [Console]::OutputEncoding em UTF-8 para programas nativos.
 */
import { existsSync } from 'node:fs';
import nodePath from 'node:path';

/** Argumentos fixos: sem perfil, sem interação, sem logo. Nunca elevado. */
export const PS_BASE_ARGS: readonly string[] = ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass'];

/** Limite do Windows para a linha de comando (CreateProcess): 32.767 caracteres. */
export const WINDOWS_CMDLINE_MAX = 32_000;

/** Script -> base64 de UTF-16LE (formato exigido por -EncodedCommand). */
export function encodePowerShell(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

export function decodePowerShell(encoded: string): string {
  return Buffer.from(encoded, 'base64').toString('utf16le');
}

/** Caminho absoluto do powershell.exe 5.1 (evita pegar um "powershell.exe" plantado na pasta atual). */
export function powershellPath(env: NodeJS.ProcessEnv = process.env): string {
  const root = env.SystemRoot || env.SYSTEMROOT || env.windir || 'C:\\Windows';
  const full = nodePath.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  if (process.platform !== 'win32') return full;
  return existsSync(full) ? full : 'powershell.exe';
}

export function powershellArgs(script: string): string[] {
  return [...PS_BASE_ARGS, '-EncodedCommand', encodePowerShell(script)];
}

/** Comprimento aproximado da linha de comando final. */
export function commandLineLength(exe: string, args: string[]): number {
  return exe.length + 3 + args.reduce((n, a) => n + a.length + 3, 0);
}

/** Literal de string do PowerShell entre aspas simples (só '' precisa de escape). */
export function psQuote(s: string): string {
  return "'" + String(s).replace(/['‘’‚‛]/g, (m) => m + m) + "'";
}

/** Início comum: preferências e UTF-8 na saída. */
export const PS_PRELUDE = [
  "$ErrorActionPreference = 'Continue'",
  "$ProgressPreference = 'SilentlyContinue'",
  '$__utf8 = New-Object System.Text.UTF8Encoding($false)',
  'try { [Console]::OutputEncoding = $__utf8 } catch {}',
  '$OutputEncoding = $__utf8',
  '$__out = New-Object System.IO.StreamWriter([Console]::OpenStandardOutput(), $__utf8)',
  '$__out.AutoFlush = $true',
].join('\n');

/**
 * Script que executa um comando PowerShell arbitrário do dono, juntando todas
 * as saídas (inclusive erros e Write-Host) num texto UTF-8 e devolvendo o
 * código de saída: 0 ok; código do programa nativo; 1 se houve erro.
 */
export function buildRunScript(command: string): string {
  const b64 = Buffer.from(command, 'utf8').toString('base64');
  return [
    PS_PRELUDE,
    `$__code = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}'))`,
    'try { $__sb = [ScriptBlock]::Create($__code) } catch { $__out.WriteLine("Erro de sintaxe no comando: " + $_.Exception.Message); exit 2 }',
    '$__errBefore = $Error.Count',
    '$global:LASTEXITCODE = 0',
    '$__failed = $false',
    'try {',
    '  & $__sb *>&1 | Out-String -Stream -Width 250 | ForEach-Object { $__out.WriteLine($_) }',
    '} catch {',
    '  $__out.WriteLine("ERRO: " + $_.Exception.Message)',
    '  $__failed = $true',
    '}',
    '$__out.Flush()',
    'if ($global:LASTEXITCODE -is [int] -and $global:LASTEXITCODE -ne 0) { exit $global:LASTEXITCODE }',
    'if ($__failed -or $Error.Count -gt $__errBefore) { exit 1 }',
    'exit 0',
  ].join('\n');
}

/** Script curto que só escreve um objeto em JSON UTF-8 (para consultas do sistema). */
export function buildJsonScript(body: string): string {
  return [PS_PRELUDE, "$ErrorActionPreference = 'SilentlyContinue'", body, '$__out.Write((ConvertTo-Json -InputObject $__result -Compress -Depth 6))', '$__out.Flush()'].join('\n');
}

/* ---------------- CLIXML (erros que o PowerShell manda serializados) ---------------- */

function decodeXmlText(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&');
}

/**
 * Com -EncodedCommand e a saída redirecionada, o PowerShell 5.1 pode mandar
 * erros/avisos para o stderr em CLIXML ("#< CLIXML <Objs ...>"). Converte em texto.
 */
export function parseClixml(stderr: string): string {
  const s = String(stderr ?? '');
  const idx = s.indexOf('#< CLIXML');
  if (idx < 0) return s.trim();
  const before = s.slice(0, idx).trim();
  const xml = s.slice(idx + '#< CLIXML'.length);
  const parts: string[] = [];
  const re = /<S S="(Error|Warning|Verbose|Debug|Information)">([\s\S]*?)<\/S>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const kind = m[1]!;
    const text = decodeXmlText(m[2]!);
    parts.push(kind === 'Error' ? text : `[${kind === 'Warning' ? 'aviso' : kind.toLowerCase()}] ${text}`);
  }
  const joined = parts.join('').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return [before, joined].filter(Boolean).join('\n');
}

/** Saída de processo (bytes) -> texto, sem BOM e com quebras de linha normalizadas. */
export function decodeProcessOutput(buf: Buffer): string {
  return new TextDecoder('utf-8').decode(buf).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
}
