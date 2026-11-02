/**
 * Guarda de caminhos de arquivo.
 *
 * O 300 só pode ler/escrever dentro de pastas liberadas (Documentos, Área de
 * Trabalho, Downloads, Imagens — ou as que o dono configurar). Este guarda:
 * - normaliza o caminho e expande `~`;
 * - resolve links simbólicos do ancestral existente (não dá para escapar por
 *   link ou por `..`);
 * - compara sem diferenciar maiúsculas no Windows;
 * - entende letras de drive e recusa caminhos de rede (UNC) e de dispositivo;
 * - recusa locais críticos mesmo que estejam dentro de uma pasta liberada
 *   (pasta do Windows, Arquivos de Programas, System32, credenciais, ~/.ssh,
 *   perfis de navegador, a própria pasta de dados do app, etc.).
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import nodePath from 'node:path';

/** Erro de segurança com mensagem pronta para o dono (pt-BR). */
export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}

export type OsName = 'windows' | 'macos' | 'linux';

export interface PathGuardOptions {
  roots: string[];
  os: OsName;
  /** Locais negados mesmo dentro de uma raiz (ex.: pasta de dados do app: banco + segredos). */
  deny?: string[];
  /** Pasta do usuário (padrão: a do sistema). Útil para testes do modo Windows em outro SO. */
  home?: string;
}

export interface ResolveOptions {
  mustExist?: boolean;
  forWrite?: boolean;
}

/** Pastas padrão liberadas, a partir das pastas conhecidas da plataforma. */
export function defaultRoots(paths: { documents: string; desktop: string; downloads: string; pictures: string }): string[] {
  return [paths.documents, paths.desktop, paths.downloads, paths.pictures].filter((p): p is string => typeof p === 'string' && p.trim() !== '');
}

export class PathGuard {
  private readonly os: OsName;
  private readonly pm: typeof nodePath.win32;
  private readonly home: string;
  private readonly roots: string[];
  private readonly denies: string[];

  constructor(opts: PathGuardOptions) {
    this.os = opts.os;
    this.pm = opts.os === 'windows' ? nodePath.win32 : nodePath.posix;
    this.home = (opts.home ?? homedir()) || '';
    this.roots = opts.roots.map((r) => this.canonExisting(this.toAbsolute(r)));
    if (this.roots.length === 0) throw new SecurityError('nenhuma pasta liberada foi configurada.');
    const deny = [...(opts.deny ?? []), ...this.criticalHomePaths()];
    this.denies = deny.map((d) => {
      try {
        return this.canonExisting(this.toAbsolute(d));
      } catch {
        return this.pm.normalize(d);
      }
    });
  }

  /** Resolve um caminho pedido para um caminho absoluto real e seguro, ou lança SecurityError. */
  resolve(p: string, opts: ResolveOptions = {}): string {
    if (typeof p !== 'string' || p.trim() === '') throw new SecurityError('caminho vazio ou inválido.');
    const abs = this.toAbsolute(p);
    const real = this.canonExisting(abs);

    this.assertNotCritical(real);

    if (!this.roots.some((r) => this.within(real, r))) {
      throw new SecurityError('esse caminho está fora das pastas que o 300 pode acessar.');
    }

    const exists = this.existsSafe(real);
    if (opts.mustExist && !exists) throw new SecurityError('o arquivo ou a pasta não existe.');
    if (opts.forWrite) {
      // Para escrever, a pasta onde o arquivo vai ficar precisa existir e estar liberada.
      const parent = this.pm.dirname(real);
      if (!this.existsSafe(parent)) throw new SecurityError('a pasta de destino não existe.');
      if (!this.roots.some((r) => this.within(parent, r))) throw new SecurityError('a pasta de destino está fora das pastas liberadas.');
    }
    return real;
  }

  /** O caminho está dentro de alguma pasta liberada? (sem lançar) */
  isAllowed(p: string, opts: ResolveOptions = {}): boolean {
    try {
      this.resolve(p, opts);
      return true;
    } catch {
      return false;
    }
  }

  /* ---------------- internos ---------------- */

  private existsSafe(p: string): boolean {
    if (this.os === 'windows' && process.platform !== 'win32') return true; // não dá para checar no SO de teste
    try {
      return existsSync(p);
    } catch {
      return false;
    }
  }

  /** Normaliza, expande `~`, exige caminho absoluto, recusa UNC/dispositivo. */
  private toAbsolute(input: string): string {
    let s = String(input).trim();
    if (s === '') throw new SecurityError('caminho vazio.');
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) s = s.slice(1, -1);
    if (s === '~' || s.startsWith('~/') || s.startsWith('~\\')) {
      if (!this.home) throw new SecurityError('não foi possível descobrir a pasta do usuário.');
      s = this.home + s.slice(1);
    }
    if (s.indexOf('\0') >= 0) throw new SecurityError('o caminho contém caracteres inválidos.');

    if (this.os === 'windows') {
      let w = s.replace(/\//g, '\\');
      if (/^\\\\/.test(w)) throw new SecurityError('caminhos de rede (UNC) ou de dispositivo não são permitidos.');
      if (/^\\\\[?.]\\/.test(w)) throw new SecurityError('caminhos de dispositivo não são permitidos.');
      if (!/^[A-Za-z]:\\/.test(w)) {
        throw new SecurityError('use um caminho absoluto com a letra do drive, por exemplo C:\\Users\\...');
      }
      return nodePath.win32.resolve(w);
    }
    if (!s.startsWith('/')) throw new SecurityError('use um caminho absoluto começando com /.');
    return nodePath.posix.resolve(s);
  }

  /**
   * Resolve links simbólicos do ancestral existente mais próximo e reanexa o
   * restante inexistente. Assim, um link no caminho não escapa das pastas.
   */
  private canonExisting(abs: string): string {
    const pm = this.pm;
    let cur = abs;
    const tail: string[] = [];
    for (let i = 0; i < 4096; i++) {
      try {
        const real = realpathSync(cur);
        if (tail.length === 0) return real;
        return pm.join(real, ...tail.slice().reverse());
      } catch {
        const parent = pm.dirname(cur);
        if (parent === cur) return pm.normalize(abs);
        tail.push(pm.basename(cur));
        cur = parent;
      }
    }
    return pm.normalize(abs);
  }

  /** Forma de comparação (minúsculas no Windows, sem barra final). */
  private cmp(p: string): string {
    let c = this.pm.normalize(p).replace(/[\\/]+$/, '');
    if (this.os === 'windows') c = c.toLowerCase();
    return c;
  }

  private within(child: string, parent: string): boolean {
    const c = this.cmp(child);
    const p = this.cmp(parent);
    if (c === p) return true;
    const sep = this.os === 'windows' ? '\\' : '/';
    return c.startsWith(p + sep);
  }

  private assertNotCritical(real: string): void {
    for (const d of this.denies) {
      if (this.within(real, d)) throw new SecurityError('esse local é protegido e o 300 não pode mexer nele.');
    }
    if (this.os === 'windows') {
      const c = this.cmp(real);
      const winCritical = [
        /^[a-z]:\\windows(\\|$)/,
        /^[a-z]:\\program files( \(x86\))?(\\|$)/,
        /^[a-z]:\\programdata(\\|$)/,
        /\\appdata\\roaming\\microsoft\\(credentials|protect|crypto)(\\|$)/,
        /\\appdata\\roaming\\microsoft\\windows\\start menu\\programs\\startup(\\|$)/,
        /\\appdata\\local\\microsoft\\credentials(\\|$)/,
      ];
      if (winCritical.some((re) => re.test(c))) throw new SecurityError('esse é um local protegido do sistema; o 300 não pode mexer nele.');
    }
  }

  /** Locais críticos baseados na pasta do usuário e no sistema operacional. */
  private criticalHomePaths(): string[] {
    const pm = this.pm;
    const home = this.home;
    if (!home) return [];
    const j = (...parts: string[]): string => pm.join(home, ...parts);
    const common = [j('.ssh'), j('.aws'), j('.gnupg'), j('.config', 'gcloud'), j('.docker')];
    if (this.os === 'windows') {
      return [
        ...common,
        j('AppData', 'Local', 'Google', 'Chrome', 'User Data'),
        j('AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
        j('AppData', 'Local', 'BraveSoftware', 'Brave-Browser', 'User Data'),
        j('AppData', 'Roaming', 'Mozilla', 'Firefox', 'Profiles'),
        j('AppData', 'Roaming', 'Microsoft', 'Credentials'),
        j('AppData', 'Roaming', 'Microsoft', 'Protect'),
        j('AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup'),
      ];
    }
    if (this.os === 'macos') {
      return [
        ...common,
        j('Library', 'Keychains'),
        j('Library', 'Application Support', 'Google', 'Chrome'),
        j('Library', 'Application Support', 'Microsoft Edge'),
        j('Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'),
        j('Library', 'Application Support', 'Firefox', 'Profiles'),
      ];
    }
    return [
      ...common,
      j('.config', 'google-chrome'),
      j('.config', 'chromium'),
      j('.config', 'microsoft-edge'),
      j('.config', 'BraveSoftware'),
      j('.mozilla', 'firefox'),
    ];
  }
}
