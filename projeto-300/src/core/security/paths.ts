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
import { existsSync, lstatSync, realpathSync } from 'node:fs';
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
    if (this.os === 'windows') this.assertSafeWindowsNames(abs);
    const real = this.canonExisting(abs);
    // O caminho real também precisa ter nomes válidos (ex.: um link para "C:\\Windows.").
    if (this.os === 'windows') this.assertSafeWindowsNames(real, true);

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

  /** Modo Windows simulado em outro SO (só testes): o disco real não pode ser consultado. */
  private get simulated(): boolean {
    return this.os === 'windows' && process.platform !== 'win32';
  }

  /** realpath do sistema; no Windows usa a versão nativa (expande nomes curtos 8.3 e corrige maiúsculas). */
  private realpath(p: string): string {
    if (this.simulated) throw new Error('simulado');
    return process.platform === 'win32' ? realpathSync.native(p) : realpathSync(p);
  }

  /**
   * Recusa nomes que o Windows interpreta de forma especial e que permitiriam
   * driblar as comparações: fluxos alternativos ("a.txt:oculto"), ponto ou
   * espaço no fim ("Windows." = "Windows"), nomes curtos 8.3 ("PROGRA~1"),
   * nomes de dispositivo (CON, NUL, COM1...) e caracteres curinga.
   */
  private assertSafeWindowsNames(abs: string, resolved = false): void {
    const rest = abs.replace(/^[A-Za-z]:\\?/, '');
    if (rest.startsWith('\\') && !resolved) throw new SecurityError('caminhos de rede (UNC) ou de dispositivo não são permitidos.');
    for (const seg of rest.split('\\')) {
      if (seg === '' || seg === '.' || seg === '..') continue;
      if (seg.includes(':')) throw new SecurityError('o caminho tem ":" no meio (fluxo alternativo de arquivo); isso não é permitido.');
      if (/[<>"|?*\u0000-\u001f]/.test(seg)) throw new SecurityError('o caminho tem caracteres que o Windows não aceita.');
      if (/[. ]$/.test(seg)) throw new SecurityError('nomes que terminam com ponto ou espaço não são permitidos no Windows.');
      if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$)(\..*)?$/i.test(seg.trim())) {
        throw new SecurityError('nomes reservados de dispositivo do Windows (CON, NUL, COM1...) não são permitidos.');
      }
      if (!resolved && /~\d/.test(seg)) throw new SecurityError('use o nome completo da pasta ou arquivo (nomes curtos como "PROGRA~1" não são aceitos).');
    }
  }

  private existsSafe(p: string): boolean {
    if (this.simulated) return true; // não dá para checar no SO de teste
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
      let real: string | undefined;
      try {
        real = this.realpath(cur);
      } catch {
        real = undefined;
      }
      if (real !== undefined) {
        if (tail.length === 0) return real;
        return pm.join(real, ...tail.slice().reverse());
      }
      // O item existe mas o realpath falhou: link quebrado (apontando para um
      // lugar que ainda não existe), laço de links ou sem permissão. Escrever
      // por um link quebrado criaria o arquivo FORA da pasta liberada.
      if (!this.simulated && this.lexists(cur)) {
        throw new SecurityError('o caminho passa por um atalho (link) quebrado ou inacessível; por segurança, não uso esse caminho.');
      }
      const parent = pm.dirname(cur);
      if (parent === cur) return pm.normalize(abs);
      tail.push(pm.basename(cur));
      cur = parent;
    }
    return pm.normalize(abs);
  }

  /** O item existe (sem seguir links)? */
  private lexists(p: string): boolean {
    try {
      lstatSync(p);
      return true;
    } catch {
      return false;
    }
  }

  /** Forma de comparação (minúsculas no Windows, sem barra final). */
  private cmp(p: string): string {
    let c = this.pm.normalize(p).replace(/[\\/]+$/, '');
    if (this.os === 'windows') c = c.toLowerCase();
    return c;
  }

  private within(child: string, parent: string, ignoreCase = false): boolean {
    let c = this.cmp(child);
    let p = this.cmp(parent);
    if (ignoreCase) {
      c = c.toLowerCase();
      p = p.toLowerCase();
    }
    if (c === p) return true;
    const sep = this.os === 'windows' ? '\\' : '/';
    return c.startsWith(p + sep);
  }

  private assertNotCritical(real: string): void {
    // Locais negados são comparados SEM diferenciar maiúsculas em todos os
    // sistemas: no macOS o disco costuma não diferenciar ("~/.SSH" = "~/.ssh").
    for (const d of this.denies) {
      if (this.within(real, d, true)) throw new SecurityError('esse local é protegido e o 300 não pode mexer nele.');
    }
    if (this.os === 'windows') {
      const c = this.cmp(real).toLowerCase();
      const winCritical = [
        /^[a-z]:\\windows(\\|$)/,
        /^[a-z]:\\program files( \(x86\))?(\\|$)/,
        /^[a-z]:\\programdata(\\|$)/,
        /^[a-z]:\\(\$recycle\.bin|system volume information|recovery|boot|\$windows\.~bt|\$windows\.~ws)(\\|$)/,
        /^[a-z]:\\(pagefile|hiberfil|swapfile)\.sys$/,
        /^[a-z]:\\(bootmgr|bootnxt)$/,
        /\\appdata\\roaming\\microsoft\\(credentials|protect|crypto|vault|systemcertificates)(\\|$)/,
        /\\appdata\\local\\microsoft\\(credentials|vault)(\\|$)/,
        /\\appdata\\roaming\\microsoft\\windows\\start menu\\programs\\startup(\\|$)/,
        /\\appdata\\local\\(google\\chrome|microsoft\\edge|bravesoftware\\brave-browser|vivaldi|chromium)\\user data(\\|$)/,
        /\\appdata\\roaming\\(mozilla\\firefox|opera software|thunderbird)(\\|$)/,
        /^[a-z]:\\users\\[^\\]+\\ntuser\.(dat|ini|pol)/,
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
    const common = [
      j('.ssh'),
      j('.aws'),
      j('.azure'),
      j('.kube'),
      j('.gnupg'),
      j('.config', 'gcloud'),
      j('.docker'),
      j('.netrc'),
      j('_netrc'),
      j('.git-credentials'),
      j('.pgpass'),
      j('.password-store'),
    ];
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
      j('.local', 'share', 'keyrings'),
    ];
  }
}
