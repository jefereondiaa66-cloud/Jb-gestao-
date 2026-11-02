/**
 * Sessão do navegador automatizado (playwright-core): usa o Edge do sistema
 * no Windows (senão Chrome, senão um Chromium indicado), com um perfil
 * PRÓPRIO do 300 em <dados>/navegador (nunca o perfil real do dono), sem
 * downloads automáticos e bloqueando endereços da rede local.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import net from 'node:net';
import nodePath from 'node:path';
import type { BrowserContext, LaunchOptions, Page } from 'playwright-core';
import { isBlockedAddress, validatePublicUrl } from '../../security/net';
import { SecurityError } from '../../security/paths';
import { stripInvisible } from '../../security/untrusted';
import type { EngineServices } from '../../types';
import { parseAriaRefs, type ElementFacts, type RefInfo } from './risk';

export interface BrowserSessionOptions {
  /** Pasta do perfil dedicado (padrão: <dados>/navegador). */
  profileDir?: string;
  /** Executável do Chromium (testes ou instalação específica). */
  executablePath?: string;
  /** Sem janela (padrão: com janela no Windows, sem janela nos outros). */
  headless?: boolean;
  /** Libera localhost/rede local (SÓ testes). */
  allowPrivate?: boolean;
  /** Tempo máximo de navegação (padrão 30 s). */
  navigationTimeoutMs?: number;
}

/** Perfis reais de navegadores: nunca usar como perfil do 300. */
const REAL_PROFILE = /(google[\\/]chrome|microsoft[\\/]edge|chromium|bravesoftware[\\/]brave-browser|mozilla[\\/]firefox)[\\/]?(user data|profiles)?/i;

/** Chromium baixado pelo Playwright (PLAYWRIGHT_BROWSERS_PATH ou /opt/pw-browsers), o mais novo. */
export function findPlaywrightChromium(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const roots = [env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers', env.HOME ? nodePath.join(env.HOME, '.cache', 'ms-playwright') : undefined].filter((x): x is string => !!x);
  for (const root of roots) {
    let dirs: string[] = [];
    try {
      dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d));
    } catch {
      continue;
    }
    dirs.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-win/chrome.exe', 'chrome-win64/chrome.exe']) {
        const p = nodePath.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

/** Ordem de tentativas para abrir o navegador. */
export function launchCandidates(opts: { executablePath?: string; env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {}): LaunchOptions[] {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const out: LaunchOptions[] = [];
  if (opts.executablePath) out.push({ executablePath: opts.executablePath });
  if (env.PW_CHROMIUM_PATH) out.push({ executablePath: env.PW_CHROMIUM_PATH });
  if (platform === 'win32') out.push({ channel: 'msedge' }, { channel: 'chrome' });
  else if (platform === 'darwin') out.push({ channel: 'chrome' }, { channel: 'msedge' });
  else {
    out.push({ channel: 'chrome' });
    const pw = findPlaywrightChromium(env);
    if (pw) out.push({ executablePath: pw });
    for (const p of ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome']) if (existsSync(p)) out.push({ executablePath: p });
  }
  return out;
}

/** O endereço de uma requisição da página deve ser bloqueado (rede local)? */
export function isPrivateRequestUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') return false;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|ip6-localhost|ip6-loopback)$/i.test(host) || /\.(localhost|local|internal|intranet|lan|home|corp)$/i.test(host)) return true;
  return net.isIP(host) ? isBlockedAddress(host) : false;
}

export class BrowserSession {
  private context: BrowserContext | undefined;
  private page: Page | undefined;
  private launching: Promise<Page> | undefined;
  private refs = new Map<string, RefInfo>();
  private refsUrl = '';

  constructor(private readonly opts: BrowserSessionOptions = {}) {}

  get isOpen(): boolean {
    return !!this.page && !this.page.isClosed();
  }

  get allowPrivate(): boolean {
    return this.opts.allowPrivate === true;
  }

  private profileFor(services: EngineServices): string {
    const dir = this.opts.profileDir ?? nodePath.join(services.platform.paths.data, 'navegador');
    if (REAL_PROFILE.test(dir)) throw new SecurityError('o 300 só usa um perfil de navegador próprio, nunca o seu perfil pessoal.');
    return dir;
  }

  private async launch(services: EngineServices): Promise<Page> {
    const { chromium } = await import('playwright-core');
    const profile = this.profileFor(services);
    mkdirSync(profile, { recursive: true });
    const headless = this.opts.headless ?? process.platform !== 'win32';
    const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
    const errors: string[] = [];
    for (const cand of launchCandidates(this.opts.executablePath ? { executablePath: this.opts.executablePath } : {})) {
      try {
        const ctx = await chromium.launchPersistentContext(profile, {
          ...cand,
          headless,
          acceptDownloads: false,
          locale: 'pt-BR',
          viewport: headless ? { width: 1280, height: 860 } : null,
          // Sandbox ligado (no Linux como root o Chromium não aceita).
          chromiumSandbox: !(process.platform === 'linux' && asRoot),
          args: ['--no-first-run', '--no-default-browser-check', '--disable-sync'],
          timeout: 45_000,
        });
        await this.installGuards(ctx);
        this.context = ctx;
        ctx.on('close', () => {
          this.context = undefined;
          this.page = undefined;
          this.refs.clear();
        });
        const page = ctx.pages()[0] ?? (await ctx.newPage());
        page.setDefaultTimeout(15_000);
        page.setDefaultNavigationTimeout(this.opts.navigationTimeoutMs ?? 30_000);
        this.page = page;
        return page;
      } catch (e) {
        errors.push(`${cand.channel ?? cand.executablePath}: ${(e as Error).message.split('\n')[0]}`);
      }
    }
    throw new Error(`não encontrei um navegador compatível (Edge/Chrome). Detalhes: ${errors.join(' | ')}`);
  }

  /** Bloqueia rede local e janelas abertas pela página (pop-ups ficam na mesma aba). */
  private async installGuards(ctx: BrowserContext): Promise<void> {
    if (!this.allowPrivate) {
      await ctx.route('**/*', async (route) => {
        if (isPrivateRequestUrl(route.request().url())) await route.abort('blockedbyclient');
        else await route.fallback();
      });
    }
    ctx.on('page', (p) => {
      // Abas novas abertas pela página: fecha e segue na aba principal.
      if (this.page && p !== this.page) {
        const url = p.url();
        void p.close().catch(() => undefined);
        if (url && url !== 'about:blank') void this.page.goto(url).catch(() => undefined);
      }
    });
  }

  async ensurePage(services: EngineServices): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!this.launching) this.launching = this.launch(services).finally(() => (this.launching = undefined));
    return this.launching;
  }

  currentUrl(): string {
    return this.page && !this.page.isClosed() ? this.page.url() : '';
  }

  /** Abre um endereço público. */
  async open(services: EngineServices, url: string, signal?: AbortSignal): Promise<{ title: string; url: string }> {
    const u = validatePublicUrl(url, { allowPrivate: this.allowPrivate });
    const page = await this.ensurePage(services);
    this.refs.clear();
    await page.goto(u.href, { waitUntil: 'domcontentloaded', ...(signal ? { signal } : {}) });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => undefined);
    return { title: await page.title().catch(() => ''), url: page.url() };
  }

  private requirePage(): Page {
    if (!this.page || this.page.isClosed()) throw new Error('o navegador não está aberto; use browser_open primeiro.');
    return this.page;
  }

  /** Retrato da página com referências [ref=eN] para clicar/digitar. */
  async snapshot(signal?: AbortSignal): Promise<{ title: string; url: string; text: string; refCount: number }> {
    const page = this.requirePage();
    const raw = await page.ariaSnapshot({ mode: 'ai', timeout: 15_000, ...(signal ? { signal } : {}) });
    const text = stripInvisible(raw);
    this.refs = parseAriaRefs(text);
    this.refsUrl = page.url();
    return { title: await page.title().catch(() => ''), url: page.url(), text, refCount: this.refs.size };
  }

  /** O que se sabe do elemento pelo último retrato (síncrono, usado no cálculo de risco). */
  describeRef(ref: string): RefInfo | undefined {
    return this.refs.get(ref);
  }

  /** URL em que o último retrato foi tirado. */
  get snapshotUrl(): string {
    return this.refsUrl;
  }

  async html(): Promise<{ html: string; url: string }> {
    const page = this.requirePage();
    return { html: await page.content(), url: page.url() };
  }

  /** Fatos do elemento real na página (tipo, texto, formulário...). */
  async elementFacts(ref: string): Promise<ElementFacts> {
    const page = this.requirePage();
    const loc = page.getByRef(ref);
    const facts = await loc.evaluate((el: Element) => {
      const e = el as HTMLElement & { type?: string; form?: HTMLFormElement | null; autocomplete?: string; placeholder?: string; href?: string; name?: string };
      const form = e.closest('form');
      return {
        tag: e.tagName.toLowerCase(),
        type: (e.getAttribute('type') ?? '').toLowerCase(),
        role: e.getAttribute('role') ?? '',
        text: (e.innerText || e.textContent || (e as unknown as { value?: string }).value || '').trim().slice(0, 200),
        id: e.id || e.getAttribute('name') || '',
        autocomplete: e.getAttribute('autocomplete') ?? '',
        ariaLabel: e.getAttribute('aria-label') ?? '',
        placeholder: e.getAttribute('placeholder') ?? '',
        href: e.getAttribute('href') ?? '',
        inForm: !!form,
        formAction: form ? form.action : '',
      };
    }, undefined, { timeout: 10_000 });
    const editable = await loc.isEditable({ timeout: 3000 }).catch(() => false);
    const info = this.refs.get(ref);
    return { ...facts, ...(info ? { name: info.name, role: facts.role || info.role } : {}), editable };
  }

  async click(ref: string, signal?: AbortSignal): Promise<void> {
    const page = this.requirePage();
    await page.getByRef(ref).click({ timeout: 10_000, ...(signal ? { signal } : {}) });
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
    this.refs.clear(); // a página pode ter mudado: refs antigas não valem mais
  }

  async type(ref: string, text: string, submit: boolean, signal?: AbortSignal): Promise<void> {
    const page = this.requirePage();
    const loc = page.getByRef(ref);
    await loc.fill(text, { timeout: 10_000, ...(signal ? { signal } : {}) });
    if (submit) {
      await loc.press('Enter', { timeout: 10_000 });
      await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
      this.refs.clear();
    }
  }

  async screenshot(): Promise<Buffer> {
    const page = this.requirePage();
    return page.screenshot({ type: 'jpeg', quality: 70, fullPage: false, timeout: 15_000 });
  }

  /** Fecha o navegador (o perfil fica guardado para a próxima vez). */
  async close(): Promise<void> {
    const ctx = this.context;
    this.context = undefined;
    this.page = undefined;
    this.refs.clear();
    if (ctx) await ctx.close().catch(() => undefined);
  }

  async dispose(): Promise<void> {
    await this.close();
  }
}
