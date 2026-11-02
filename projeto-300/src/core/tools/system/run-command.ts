/**
 * run_command: executa um comando no PowerShell 5.1 (Windows) ou no sh
 * (Linux/macOS). Sempre pede confirmação (risco "system"), recusa comandos
 * bloqueados pela classificação de segurança, nunca roda como administrador,
 * usa um ambiente sem segredos e roda dentro das pastas liberadas.
 */
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { buildSafeEnv, classifyCommand, type ShellKind } from '../../security/commands';
import type { EngineServices, ToolDefinition } from '../../types';
import { allowedRoots, resolveUserPath } from '../files/guard';
import { failure } from '../files/tools-read';
import { clampHeadTail, errorOutput, preview, textOutput } from '../files/util';
import { WINDOWS_CMDLINE_MAX, buildRunScript, commandLineLength, decodeProcessOutput, parseClixml, powershellArgs, powershellPath } from './powershell';
import { runProcess, type RunResult } from './process';

export const RUN_DEFAULT_TIMEOUT_S = 60;
export const RUN_MAX_TIMEOUT_S = 300;
export const RUN_OUTPUT_MAX_CHARS = 20_000;

export function shellKindFor(os: EngineServices['platform']['os'] | NodeJS.Platform): ShellKind {
  return os === 'windows' || os === 'win32' ? 'powershell' : 'sh';
}

/** Pedidos de elevação (administrador/root) são sempre recusados. */
export function elevationReason(command: string): string | null {
  const c = String(command ?? '').replace(/[`^]/g, '');
  if (/-verb\s+['"]?runas\b/i.test(c) || /\brunas(\.exe)?\s/i.test(c)) return 'pede para rodar como administrador (runas)';
  if (/(^|[;&|(\n])\s*(sudo|gsudo|doas|pkexec|su)(\s|$)/i.test(c)) return 'pede privilégios de administrador (sudo/su)';
  if (/\bstart-process\b[^\n]*\b-credential\b/i.test(c)) return 'tenta rodar com outra conta de usuário';
  return null;
}

const schema = z.object({
  comando: z
    .string()
    .min(1)
    .max(8000)
    .describe('Comando completo. No Windows é PowerShell 5.1 (ex.: Get-ChildItem, Get-Process, ipconfig); no Linux/macOS é sh. Um comando por chamada; prefira comandos que só consultam.')
    .superRefine((cmd, ctx) => {
      const c = classifyCommand(cmd, shellKindFor(process.platform));
      if (c.level === 'bloqueado') {
        ctx.addIssue({ code: 'custom', message: `comando bloqueado por segurança (${c.reasons.join('; ')}). Não tente contornar; explique ao dono.` });
      }
      const elev = elevationReason(cmd);
      if (elev) ctx.addIssue({ code: 'custom', message: `o 300 nunca executa comandos como administrador: ${elev}.` });
    }),
  pasta: z.string().max(2000).optional().describe('Pasta de trabalho (dentro das pastas liberadas). Padrão: Documentos.'),
  tempoLimite: z.number().int().min(1).max(RUN_MAX_TIMEOUT_S).optional().describe(`Tempo máximo em segundos (padrão ${RUN_DEFAULT_TIMEOUT_S}, máximo ${RUN_MAX_TIMEOUT_S}).`),
  motivo: z.string().max(300).optional().describe('Por que este comando é necessário (aparece no pedido de confirmação).'),
});
type Input = z.infer<typeof schema>;

export function describeRunCommand(i: Input, os: EngineServices['platform']['os'] | NodeJS.Platform = process.platform): string {
  const shell = shellKindFor(os);
  const c = classifyCommand(i.comando, shell);
  const warn =
    c.level === 'bloqueado'
      ? `BLOQUEADO (${c.reasons.join('; ')}) — não será executado. `
      : c.level === 'perigoso'
        ? `⚠ ATENÇÃO: ${c.reasons.join('; ')}. `
        : '';
  const why = i.motivo ? ` Motivo: ${preview(i.motivo, 120)}.` : '';
  const where = i.pasta ? ` (na pasta ${preview(i.pasta, 80)})` : '';
  return `${warn}Executar no ${shell === 'powershell' ? 'PowerShell' : 'terminal'}${where}: ${i.comando}${why}`;
}

function defaultCwd(services: EngineServices): string {
  const docs = services.platform.paths.documents;
  try {
    return resolveUserPath(services, docs, { mustExist: true });
  } catch {
    return allowedRoots(services)[0] ?? docs;
  }
}

/** Texto final para o modelo (código de saída, duração, saída e erros). */
export function formatRunResult(r: RunResult, opts: { shell: ShellKind; cwd: string; timeoutS: number }): { text: string; ok: boolean; summary: string } {
  const stdout = decodeProcessOutput(r.stdout).trimEnd();
  const rawErr = decodeProcessOutput(r.stderr);
  const stderr = (opts.shell === 'powershell' ? parseClixml(rawErr) : rawErr).trimEnd();
  const status = r.error
    ? `não iniciou (${r.error})`
    : r.timedOut
      ? `interrompido: passou do tempo limite de ${opts.timeoutS} s`
      : r.aborted
        ? 'cancelado pelo dono'
        : r.code === 0
          ? '0 (sucesso)'
          : `${r.code ?? r.signal ?? '?'} (falhou)`;
  const ok = !r.error && !r.timedOut && !r.aborted && r.code === 0;
  const secs = (r.durationMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  let body = '';
  if (stdout) body += `Saída:\n${stdout}\n`;
  if (stderr) body += `${body ? '\n' : ''}Erros:\n${stderr}\n`;
  if (!body) body = '(o comando não mostrou nada)\n';
  const clamped = clampHeadTail(body, RUN_OUTPUT_MAX_CHARS);
  const text = `Comando (${opts.shell === 'powershell' ? 'PowerShell' : 'sh'}) em ${opts.cwd}\nResultado: ${status} · ${secs} s\n\n${clamped.text}${r.truncated ? '\n[parte da saída foi descartada por ser grande demais]' : ''}`;
  const summary = ok ? `Comando executado (${secs} s)` : `Comando: ${status}`;
  return { text, ok, summary };
}

export function runCommandTool(): ToolDefinition<Input> {
  return {
    name: 'run_command',
    title: 'Executar comando',
    description:
      'Executa um comando no PowerShell do Windows (ou no terminal no Linux/macOS) e devolve a saída. SEMPRE pede confirmação ao dono, mostrando o comando. ' +
      'Comandos destrutivos graves são recusados; nunca roda como administrador; não use para o que outra ferramenta faz (arquivos, abrir programas). ' +
      `Tempo limite padrão ${RUN_DEFAULT_TIMEOUT_S} s (máx. ${RUN_MAX_TIMEOUT_S} s); saída cortada em ${RUN_OUTPUT_MAX_CHARS.toLocaleString('pt-BR')} caracteres.`,
    inputSchema: schema,
    risk: 'system',
    describe: (i) => describeRunCommand(i),
    available: (services) => services.settings.get().permissions?.shellEnabled !== false,
    async execute(input, ctx) {
      const services = ctx.services;
      if (services.settings.get().permissions?.shellEnabled === false) return errorOutput('A execução de comandos está desativada nas configurações.');
      const shell = shellKindFor(services.platform.os);
      const c = classifyCommand(input.comando, shell);
      if (c.level === 'bloqueado') return errorOutput(`Comando bloqueado por segurança: ${c.reasons.join('; ')}.`);
      const elev = elevationReason(input.comando);
      if (elev) return errorOutput(`O 300 nunca executa comandos como administrador (${elev}).`);

      let cwd: string;
      try {
        cwd = input.pasta ? resolveUserPath(services, input.pasta, { mustExist: true }) : defaultCwd(services);
        if (!(await stat(cwd)).isDirectory()) return errorOutput('A pasta de trabalho indicada não é uma pasta.');
      } catch (err) {
        return failure('Pasta de trabalho inválida', err);
      }

      const timeoutS = Math.min(RUN_MAX_TIMEOUT_S, input.tempoLimite ?? RUN_DEFAULT_TIMEOUT_S);
      const env = buildSafeEnv(process.env);
      let result: RunResult;
      if (shell === 'powershell') {
        const exe = powershellPath();
        const args = powershellArgs(buildRunScript(input.comando));
        if (commandLineLength(exe, args) > WINDOWS_CMDLINE_MAX) return errorOutput('O comando é longo demais para o Windows. Divida em partes menores ou use um arquivo de script.');
        result = await runProcess(exe, args, { cwd, env, timeoutMs: timeoutS * 1000, signal: ctx.signal });
      } else {
        result = await runProcess('/bin/sh', ['-c', input.comando], { cwd, env, timeoutMs: timeoutS * 1000, signal: ctx.signal });
      }
      const f = formatRunResult(result, { shell, cwd, timeoutS });
      return textOutput(f.text, f.summary, { ...(f.ok ? {} : { isError: true }), untrusted: { source: 'saída de comando do sistema' } });
    },
  };
}
