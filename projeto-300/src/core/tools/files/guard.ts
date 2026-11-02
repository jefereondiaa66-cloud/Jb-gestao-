/**
 * Guarda de caminhos das ferramentas: monta o PathGuard a partir das
 * configurações (pastas liberadas) e da plataforma (nega a pasta de dados do
 * 300, onde ficam banco e segredos) e entende atalhos como "Documentos/...".
 */
import nodePath from 'node:path';
import { PathGuard, SecurityError, defaultRoots } from '../../security/paths';
import type { EngineServices, PlatformServices } from '../../types';
import { fold } from './util';

export { SecurityError };

/** Extensões que executam código quando abertas (abrir = risco de sistema). */
export const EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.psm1', '.psd1', '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.msi', '.msp', '.lnk',
  '.jar', '.scr', '.com', '.hta', '.reg', '.pif', '.cpl', '.msc', '.inf', '.scf', '.url', '.application', '.appref-ms',
  '.gadget', '.settingcontent-ms', '.library-ms', '.py', '.pyw', '.sh', '.command', '.app', '.desktop', '.appimage', '.run',
  '.deb', '.rpm', '.pkg', '.dmg', '.docm', '.dotm', '.xlsm', '.xltm', '.xlam', '.pptm', '.potm', '.ppam', '.ppsm', '.sldm',
]);

export function extensionOf(p: string): string {
  // Funciona com caminhos Windows mesmo rodando em outro sistema.
  const base = p.split(/[\\/]/).pop() ?? '';
  const i = base.lastIndexOf('.');
  return i > 0 ? base.slice(i).toLowerCase().replace(/[\s.]+$/, '') : '';
}

export function isExecutablePath(p: string): boolean {
  // Pontos/espaços no fim são ignorados pelo Windows ("virus.exe." abre como .exe).
  const cleaned = String(p ?? '').replace(/[\s.]+$/, '');
  return EXECUTABLE_EXTENSIONS.has(extensionOf(cleaned));
}

function pathModule(os: PlatformServices['os']): typeof nodePath.posix {
  return os === 'windows' ? nodePath.win32 : nodePath.posix;
}

const KNOWN_FOLDERS: { names: string[]; key: 'documents' | 'desktop' | 'downloads' | 'pictures' }[] = [
  { names: ['documentos', 'documents', 'meus documentos'], key: 'documents' },
  { names: ['area de trabalho', 'desktop'], key: 'desktop' },
  { names: ['downloads', 'transferencias'], key: 'downloads' },
  { names: ['imagens', 'pictures', 'minhas imagens'], key: 'pictures' },
];

/**
 * Troca o começo "Documentos/", "Área de Trabalho\", "Downloads/" ou
 * "Imagens/" pela pasta real do usuário. Caminhos absolutos ficam como estão.
 */
export function expandKnownFolder(p: string, paths: PlatformServices['paths'], os: PlatformServices['os']): string {
  const raw = String(p ?? '').trim().replace(/^["']|["']$/g, '');
  const m = /^([^\\/:]+)(?:[\\/]+(.*))?$/s.exec(raw);
  if (!m) return raw;
  const head = fold(m[1]!);
  for (const kf of KNOWN_FOLDERS) {
    if (kf.names.includes(head)) {
      const base = paths[kf.key];
      if (!base) return raw;
      const rest = m[2] ?? '';
      return rest ? pathModule(os).join(base, ...rest.split(/[\\/]+/)) : base;
    }
  }
  return raw;
}

/** Pastas liberadas: as configuradas pelo dono ou as padrão (Documentos, Área de Trabalho, Downloads, Imagens). */
export function allowedRoots(services: EngineServices): string[] {
  const configured = services.settings.get().permissions?.fileRoots ?? [];
  const roots = configured.filter((r) => typeof r === 'string' && r.trim() !== '');
  return roots.length ? roots : defaultRoots(services.platform.paths);
}

const guardCache = new WeakMap<EngineServices, { key: string; guard: PathGuard }>();

/** PathGuard das ferramentas (reaproveitado enquanto as pastas não mudam). */
export function guardFor(services: EngineServices): PathGuard {
  const roots = allowedRoots(services);
  const deny = [services.platform.paths.data].filter((d) => typeof d === 'string' && d.trim() !== '');
  const key = JSON.stringify([services.platform.os, services.platform.paths.home, roots, deny]);
  const cached = guardCache.get(services);
  if (cached && cached.key === key) return cached.guard;
  const guard = new PathGuard({ roots, os: services.platform.os, deny, home: services.platform.paths.home });
  guardCache.set(services, { key, guard });
  return guard;
}

export interface ResolveUserPathOptions {
  mustExist?: boolean;
  forWrite?: boolean;
}

/** Caminho pedido (pelo modelo) -> caminho real seguro, ou SecurityError com mensagem pt-BR. */
export function resolveUserPath(services: EngineServices, p: string, opts: ResolveUserPathOptions = {}): string {
  const expanded = expandKnownFolder(p, services.platform.paths, services.platform.os);
  return guardFor(services).resolve(expanded, opts);
}

/** O caminho é uma das próprias pastas liberadas (não pode ser apagado/movido). */
export function isRootPath(services: EngineServices, real: string): boolean {
  const pm = pathModule(services.platform.os);
  const norm = (s: string): string => {
    const n = pm.normalize(s).replace(/[\\/]+$/, '');
    return services.platform.os === 'windows' ? n.toLowerCase() : n;
  };
  const target = norm(real);
  const guard = guardFor(services);
  return allowedRoots(services).some((r) => {
    try {
      return norm(guard.resolve(expandKnownFolder(r, services.platform.paths, services.platform.os))) === target;
    } catch {
      return norm(r) === target;
    }
  });
}

/** Texto curto de ajuda sobre caminhos, usado nas descrições das ferramentas. */
export const PATH_HINT =
  'Caminho absoluto (ex.: C:\\Users\\Nome\\Documents\\arquivo.txt) ou começando com Documentos/, Área de Trabalho/, Downloads/ ou Imagens/. ' +
  'Só funciona dentro das pastas liberadas pelo dono.';
