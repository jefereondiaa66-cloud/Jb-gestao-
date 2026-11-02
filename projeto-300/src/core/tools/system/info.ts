/**
 * system_info: sistema operacional, processador, memória, discos, tempo
 * ligado, bateria (quando houver) e data/hora local.
 */
import { readFile, readdir, statfs } from 'node:fs/promises';
import os from 'node:os';
import { z } from 'zod';
import type { ToolDefinition } from '../../types';
import { formatBytes } from '../files/util';
import { buildJsonScript, decodeProcessOutput, powershellArgs, powershellPath } from './powershell';
import { runProcess } from './process';

export interface DiskInfo {
  name: string;
  label?: string;
  total: number;
  free: number;
}

export interface BatteryInfo {
  percent: number;
  status: string;
}

export interface SystemSnapshot {
  osName: string;
  osVersion: string;
  hostname: string;
  cpuModel: string;
  cpuCount: number;
  memTotal: number;
  memFree: number;
  uptimeSec: number;
  disks: DiskInfo[];
  battery?: BatteryInfo;
  manufacturer?: string;
  model?: string;
  now: Date;
  timeZone: string;
}

/** Códigos de Win32_Battery.BatteryStatus. */
export const WIN_BATTERY_STATUS: Record<number, string> = {
  1: 'descarregando',
  2: 'ligado na tomada',
  3: 'carga completa',
  4: 'bateria baixa',
  5: 'bateria crítica',
  6: 'carregando',
  7: 'carregando (alta)',
  8: 'carregando (baixa)',
  9: 'carregando (crítica)',
  10: 'indefinido',
  11: 'parcialmente carregada',
};

export const WINDOWS_INFO_SCRIPT = buildJsonScript(
  [
    '$os = Get-CimInstance Win32_OperatingSystem',
    '$cs = Get-CimInstance Win32_ComputerSystem',
    '$disks = @(Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | ForEach-Object { @{ name = [string]$_.DeviceID; label = [string]$_.VolumeName; total = [double]$_.Size; free = [double]$_.FreeSpace } })',
    '$bat = Get-CimInstance Win32_Battery | Select-Object -First 1',
    '$b = $null',
    'if ($bat) { $b = @{ percent = [int]$bat.EstimatedChargeRemaining; status = [int]$bat.BatteryStatus } }',
    '$__result = @{ caption = [string]$os.Caption; version = [string]$os.Version; build = [string]$os.BuildNumber; manufacturer = [string]$cs.Manufacturer; model = [string]$cs.Model; disks = $disks; battery = $b }',
  ].join('\n'),
);

/** Interpreta o JSON do script do Windows. */
export function parseWindowsInfo(json: string): { caption?: string; version?: string; build?: string; manufacturer?: string; model?: string; disks: DiskInfo[]; battery?: BatteryInfo } {
  let j: Record<string, unknown> = {};
  try {
    j = JSON.parse(json.replace(/^\uFEFF/, '')) as Record<string, unknown>;
  } catch {
    return { disks: [] };
  }
  const disksRaw = Array.isArray(j.disks) ? j.disks : j.disks ? [j.disks] : [];
  const disks: DiskInfo[] = (disksRaw as Record<string, unknown>[])
    .filter((d) => typeof d?.name === 'string' && typeof d.total === 'number')
    .map((d) => ({ name: d.name as string, ...(d.label ? { label: String(d.label) } : {}), total: d.total as number, free: Number(d.free) || 0 }));
  const b = j.battery as { percent?: unknown; status?: unknown } | null | undefined;
  const battery = b && typeof b.percent === 'number' ? { percent: b.percent, status: WIN_BATTERY_STATUS[Number(b.status)] ?? 'desconhecido' } : undefined;
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    disks,
    ...(battery ? { battery } : {}),
    ...(str(j.caption) ? { caption: str(j.caption)! } : {}),
    ...(str(j.version) ? { version: str(j.version)! } : {}),
    ...(str(j.build) ? { build: str(j.build)! } : {}),
    ...(str(j.manufacturer) ? { manufacturer: str(j.manufacturer)! } : {}),
    ...(str(j.model) ? { model: str(j.model)! } : {}),
  };
}

async function linuxBattery(): Promise<BatteryInfo | undefined> {
  try {
    const base = '/sys/class/power_supply';
    const bat = (await readdir(base)).find((d) => /^BAT/i.test(d));
    if (!bat) return undefined;
    const cap = Number((await readFile(`${base}/${bat}/capacity`, 'utf8')).trim());
    const st = (await readFile(`${base}/${bat}/status`, 'utf8')).trim().toLowerCase();
    const map: Record<string, string> = { charging: 'carregando', discharging: 'descarregando', full: 'carga completa', 'not charging': 'ligado na tomada' };
    return Number.isFinite(cap) ? { percent: cap, status: map[st] ?? st } : undefined;
  } catch {
    return undefined;
  }
}

export function parsePmset(text: string): BatteryInfo | undefined {
  const m = /(\d{1,3})%;\s*([a-z ]+);/i.exec(text);
  if (!m) return undefined;
  const map: Record<string, string> = { charging: 'carregando', discharging: 'descarregando', charged: 'carga completa', 'ac attached': 'ligado na tomada', finishing: 'terminando de carregar' };
  const st = m[2]!.trim().toLowerCase();
  return { percent: Number(m[1]), status: map[st] ?? st };
}

async function diskOf(path: string, name: string): Promise<DiskInfo | undefined> {
  try {
    const s = await statfs(path);
    return { name, total: s.blocks * s.bsize, free: s.bavail * s.bsize };
  } catch {
    return undefined;
  }
}

export async function collectSystemInfo(platformOs: 'windows' | 'macos' | 'linux', home: string, signal?: AbortSignal): Promise<SystemSnapshot> {
  const cpus = os.cpus();
  const snap: SystemSnapshot = {
    osName: os.type(),
    osVersion: os.release(),
    hostname: os.hostname(),
    cpuModel: cpus[0]?.model?.trim() ?? 'desconhecido',
    cpuCount: cpus.length,
    memTotal: os.totalmem(),
    memFree: os.freemem(),
    uptimeSec: os.uptime(),
    disks: [],
    now: new Date(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  if (platformOs === 'windows') {
    const r = await runProcess(powershellPath(), powershellArgs(WINDOWS_INFO_SCRIPT), { timeoutMs: 15_000, ...(signal ? { signal } : {}) });
    const w = parseWindowsInfo(decodeProcessOutput(r.stdout));
    if (w.caption) snap.osName = w.caption;
    if (w.version) snap.osVersion = `${w.version}${w.build ? ` (compilação ${w.build})` : ''}`;
    if (w.manufacturer) snap.manufacturer = w.manufacturer;
    if (w.model) snap.model = w.model;
    snap.disks = w.disks;
    if (w.battery) snap.battery = w.battery;
    if (!snap.disks.length) {
      const d = await diskOf(home.slice(0, 3) || 'C:\\', home.slice(0, 2) || 'C:');
      if (d) snap.disks.push(d);
    }
    return snap;
  }
  const root = await diskOf('/', '/');
  if (root) snap.disks.push(root);
  if (home && home !== '/') {
    const h = await diskOf(home, home);
    if (h && (!root || h.total !== root.total || h.free !== root.free)) snap.disks.push(h);
  }
  if (platformOs === 'macos') {
    snap.osName = 'macOS';
    const r = await runProcess('/usr/bin/pmset', ['-g', 'batt'], { timeoutMs: 5000, ...(signal ? { signal } : {}) });
    const b = parsePmset(decodeProcessOutput(r.stdout));
    if (b) snap.battery = b;
  } else {
    try {
      const rel = await readFile('/etc/os-release', 'utf8');
      const m = /^PRETTY_NAME="?([^"\n]+)"?/m.exec(rel);
      if (m) snap.osName = m[1]!;
    } catch {
      /* sem os-release */
    }
    const b = await linuxBattery();
    if (b) snap.battery = b;
  }
  return snap;
}

function duration(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [d ? `${d} ${d === 1 ? 'dia' : 'dias'}` : '', h ? `${h} h` : '', `${m} min`].filter(Boolean);
  return parts.join(' ');
}

export function formatSystemInfo(s: SystemSnapshot): string {
  const used = s.memTotal - s.memFree;
  const lines = [
    `Sistema: ${s.osName} ${s.osVersion}`.trim(),
    s.manufacturer || s.model ? `Computador: ${[s.manufacturer, s.model].filter(Boolean).join(' ')}` : '',
    `Nome do computador: ${s.hostname}`,
    `Processador: ${s.cpuModel} (${s.cpuCount} núcleos lógicos)`,
    `Memória: ${formatBytes(used)} em uso de ${formatBytes(s.memTotal)} (${formatBytes(s.memFree)} livres)`,
    ...s.disks.map((d) => `Disco ${d.name}${d.label ? ` (${d.label})` : ''}: ${formatBytes(d.free)} livres de ${formatBytes(d.total)} (${d.total ? Math.round((1 - d.free / d.total) * 100) : 0}% usado)`),
    `Ligado há: ${duration(s.uptimeSec)}`,
    s.battery ? `Bateria: ${s.battery.percent}% (${s.battery.status})` : 'Bateria: não encontrada (computador de mesa ou sem informação)',
    `Data e hora local: ${s.now.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'short' })} (fuso ${s.timeZone})`,
  ];
  return lines.filter(Boolean).join('\n');
}

export function systemInfoTool(): ToolDefinition<Record<string, never>> {
  return {
    name: 'system_info',
    title: 'Informações do computador',
    description: 'Mostra informações do computador: sistema, processador, memória, espaço nos discos, tempo ligado, bateria e data/hora local.',
    inputSchema: z.object({}).strict() as unknown as z.ZodType<Record<string, never>>,
    risk: 'read',
    describe: () => 'Consultar informações do computador (sistema, memória, discos, bateria)',
    async execute(_input, ctx) {
      const s = await collectSystemInfo(ctx.services.platform.os, ctx.services.platform.paths.home, ctx.signal);
      return { content: [{ type: 'text', text: formatSystemInfo(s) }], summary: `Sistema: ${s.osName}` };
    },
  };
}
