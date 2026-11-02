import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PathGuard, SecurityError, defaultRoots } from '@core/security/paths';

let base: string;
let docs: string;
let outside: string;

beforeAll(() => {
  base = realpathSync(mkdtempSync(join(tmpdir(), '300-paths-')));
  docs = join(base, 'docs');
  outside = join(base, 'fora');
  mkdirSync(docs, { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(docs, 'a.txt'), 'oi');
  writeFileSync(join(outside, 'segredo.txt'), 'x');
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('PathGuard (posix)', () => {
  const guard = () => new PathGuard({ roots: [docs], os: 'linux', home: join(base, 'home') });

  it('libera arquivo dentro da raiz', () => {
    expect(guard().resolve(join(docs, 'a.txt'), { mustExist: true })).toBe(join(docs, 'a.txt'));
  });

  it('recusa travessia com ..', () => {
    expect(() => guard().resolve(join(docs, '..', 'fora', 'segredo.txt'))).toThrow(SecurityError);
  });

  it('recusa caminho absoluto fora da raiz', () => {
    expect(() => guard().resolve('/etc/passwd')).toThrow(SecurityError);
  });

  it('recusa caminho relativo', () => {
    expect(() => guard().resolve('a.txt')).toThrow(SecurityError);
  });

  it('mustExist falha para inexistente', () => {
    expect(() => guard().resolve(join(docs, 'nao-existe.txt'), { mustExist: true })).toThrow(SecurityError);
  });

  it('bloqueia escape por link simbólico (diretório)', () => {
    const link = join(docs, 'link-para-fora');
    try {
      symlinkSync(outside, link, 'dir');
    } catch {
      return; // ambiente sem symlink
    }
    expect(() => guard().resolve(join(link, 'segredo.txt'))).toThrow(SecurityError);
    // também para arquivo novo a ser escrito através do link
    expect(() => guard().resolve(join(link, 'novo.txt'), { forWrite: true })).toThrow(SecurityError);
  });

  it('bloqueia link simbólico de arquivo apontando para fora', () => {
    const link = join(docs, 'atalho.txt');
    try {
      symlinkSync(join(outside, 'segredo.txt'), link, 'file');
    } catch {
      return;
    }
    expect(() => guard().resolve(link)).toThrow(SecurityError);
  });

  it('nega local da lista deny mesmo dentro da raiz', () => {
    const appData = join(docs, 'app');
    mkdirSync(appData, { recursive: true });
    const g = new PathGuard({ roots: [docs], os: 'linux', deny: [appData], home: join(base, 'home') });
    expect(() => g.resolve(join(appData, 'segredos.db'))).toThrow(SecurityError);
    expect(g.resolve(join(docs, 'a.txt'))).toBe(join(docs, 'a.txt'));
  });

  it('nega ~/.ssh mesmo quando a casa é a raiz', () => {
    const home = join(base, 'home2');
    mkdirSync(join(home, '.ssh'), { recursive: true });
    mkdirSync(join(home, 'documentos'), { recursive: true });
    const g = new PathGuard({ roots: [home], os: 'linux', home });
    expect(() => g.resolve(join(home, '.ssh', 'id_rsa'))).toThrow(SecurityError);
    expect(() => g.resolve('~/.ssh/id_rsa')).toThrow(SecurityError);
    expect(g.resolve(join(home, 'documentos', 'nota.txt'))).toBe(join(home, 'documentos', 'nota.txt'));
  });
});

describe('PathGuard (windows, simulado)', () => {
  const home = 'C:\\Users\\alice';
  const guardC = () => new PathGuard({ roots: ['C:\\'], os: 'windows', home });
  const guardDocs = () => new PathGuard({ roots: ['C:\\Users\\alice\\Documents'], os: 'windows', home });

  it('normaliza e compara sem diferenciar maiúsculas', () => {
    const g = guardDocs();
    expect(g.resolve('c:\\users\\ALICE\\documents\\A.TXT').toLowerCase()).toBe('c:\\users\\alice\\documents\\a.txt');
  });

  it('expande ~ no Windows', () => {
    expect(guardDocs().resolve('~\\Documents\\nota.txt').toLowerCase()).toBe('c:\\users\\alice\\documents\\nota.txt');
  });

  it('recusa travessia para System32', () => {
    expect(() => guardDocs().resolve('C:\\Users\\alice\\Documents\\..\\..\\..\\Windows\\System32\\drivers')).toThrow(SecurityError);
  });

  it('recusa caminhos UNC e de dispositivo', () => {
    const g = guardC();
    expect(() => g.resolve('\\\\servidor\\compartilhamento\\x')).toThrow(SecurityError);
    expect(() => g.resolve('\\\\?\\C:\\Windows')).toThrow(SecurityError);
    expect(() => g.resolve('\\\\.\\PhysicalDrive0')).toThrow(SecurityError);
  });

  it('recusa caminho relativo ao drive', () => {
    expect(() => guardC().resolve('C:foo')).toThrow(SecurityError);
  });

  it('nega pasta do Windows, Arquivos de Programas e ProgramData', () => {
    const g = guardC();
    expect(() => g.resolve('C:\\Windows\\System32\\cmd.exe')).toThrow(SecurityError);
    expect(() => g.resolve('C:\\Program Files\\app\\x.dll')).toThrow(SecurityError);
    expect(() => g.resolve('C:\\Program Files (x86)\\app\\x.dll')).toThrow(SecurityError);
    expect(() => g.resolve('C:\\ProgramData\\x')).toThrow(SecurityError);
  });

  it('nega perfis de navegador e pasta de inicialização', () => {
    const g = guardC();
    expect(() => g.resolve('C:\\Users\\alice\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Login Data')).toThrow(SecurityError);
    expect(() => g.resolve('C:\\Users\\alice\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\x.lnk')).toThrow(SecurityError);
    expect(() => g.resolve('C:\\Users\\alice\\AppData\\Roaming\\Microsoft\\Credentials\\x')).toThrow(SecurityError);
  });

  it('libera documento comum dentro do drive', () => {
    expect(guardC().resolve('C:\\Users\\alice\\Documents\\relatorio.docx').toLowerCase()).toBe('c:\\users\\alice\\documents\\relatorio.docx');
  });
});

describe('defaultRoots', () => {
  it('monta a lista de pastas conhecidas', () => {
    const roots = defaultRoots({ documents: '/d', desktop: '/a', downloads: '/dl', pictures: '/p' });
    expect(roots).toEqual(['/d', '/a', '/dl', '/p']);
  });
  it('ignora vazios', () => {
    expect(defaultRoots({ documents: '/d', desktop: '', downloads: '/dl', pictures: '' })).toEqual(['/d', '/dl']);
  });
});
