/** Ferramentas de sistema do 300: abrir sites e programas, comandos, informações e automação de janelas do Windows. */
import type { ToolDefinition } from '../../types';
import { openAppTool, openUrlTool } from './apps';
import { systemInfoTool } from './info';
import { runCommandTool } from './run-command';
import { UiaWorker } from './uia-worker';
import { windowsUiTool } from './windows-ui';

export { openAppTool, openUrlTool, WINDOWS_APPS, findCuratedApp, normalizeAppName, scoreShortcut, buildLaunchScript, expandWinEnv, parseDesktopEntry, validateOpenUrl, findStartMenuShortcut } from './apps';
export type { AppEntry, AppLaunch } from './apps';
export { runCommandTool, describeRunCommand, elevationReason, formatRunResult, shellKindFor, RUN_DEFAULT_TIMEOUT_S, RUN_MAX_TIMEOUT_S, RUN_OUTPUT_MAX_CHARS } from './run-command';
export { systemInfoTool, collectSystemInfo, formatSystemInfo, parseWindowsInfo, parsePmset, WINDOWS_INFO_SCRIPT, WIN_BATTERY_STATUS } from './info';
export type { SystemSnapshot, DiskInfo, BatteryInfo } from './info';
export { UiaWorker, UIA_WORKER_SCRIPT, UIA_CONTROL_TYPES, encodeRequest, parseWorkerLine, uiaWorkerArgs } from './uia-worker';
export type { UiaOp, UiaWorkerOptions, WorkerMessage } from './uia-worker';
export { windowsUiTool, windowsUiRisk, describeWindowsUi, formatWindows, formatControls } from './windows-ui';
export {
  encodePowerShell,
  decodePowerShell,
  powershellArgs,
  powershellPath,
  buildRunScript,
  buildJsonScript,
  parseClixml,
  decodeProcessOutput,
  psQuote,
  commandLineLength,
  PS_BASE_ARGS,
  PS_PRELUDE,
  WINDOWS_CMDLINE_MAX,
} from './powershell';
export { runProcess, killTree } from './process';
export type { RunOptions, RunResult } from './process';

export interface SystemToolsOptions {
  /** Trabalhador de UI Automation (o integrador cria e chama dispose() ao fechar). */
  uia?: UiaWorker;
}

export function systemTools(opts: SystemToolsOptions = {}): ToolDefinition[] {
  const uia = opts.uia ?? new UiaWorker();
  return [openUrlTool(), openAppTool(), runCommandTool(), systemInfoTool(), windowsUiTool(uia)];
}
