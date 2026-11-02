/**
 * Extração do conteúdo principal de páginas: decodifica o texto respeitando o
 * charset (sites .br antigos usam ISO-8859-1), remove scripts, estilos e texto
 * escondido (truque comum de injeção), usa o Readability sobre o linkedom e
 * converte para markdown com o turndown.
 */
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { stripInvisible } from '../../security/untrusted';

/* ---------------- charset ---------------- */

export function charsetFromContentType(ct: string): string | undefined {
  const m = /charset\s*=\s*"?([\w.:-]+)"?/i.exec(ct || '');
  return m ? m[1]!.toLowerCase() : undefined;
}

export function sniffHtmlCharset(head: Uint8Array): string | undefined {
  const ascii = new TextDecoder('latin1').decode(head.subarray(0, 4096));
  const m1 = /<meta[^>]+charset\s*=\s*["']?\s*([\w.:-]+)/i.exec(ascii);
  if (m1) return m1[1]!.toLowerCase();
  const m2 = /<meta[^>]+http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset=([\w.:-]+)/i.exec(ascii);
  return m2 ? m2[1]!.toLowerCase() : undefined;
}

function tryDecode(buf: Uint8Array, label: string, fatal = false): string | null {
  try {
    return new TextDecoder(label, { fatal }).decode(buf);
  } catch {
    return null;
  }
}

/** Corpo HTTP -> texto, na ordem: BOM, cabeçalho, <meta charset>, UTF-8 válido, Windows-1252. */
export function decodeBody(buf: Uint8Array, contentType: string, isHtml: boolean): { text: string; charset: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(buf.subarray(3)), charset: 'utf-8' };
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), charset: 'utf-16le' };
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), charset: 'utf-16be' };
  const declared = charsetFromContentType(contentType) ?? (isHtml ? sniffHtmlCharset(buf) : undefined);
  if (declared) {
    const t = tryDecode(buf, declared);
    if (t !== null) return { text: t, charset: declared };
  }
  const utf8 = tryDecode(buf, 'utf-8', true);
  if (utf8 !== null) return { text: utf8, charset: 'utf-8' };
  return { text: new TextDecoder('windows-1252').decode(buf), charset: 'windows-1252' };
}

/* ---------------- limpeza ---------------- */

const REMOVE_TAGS = ['script', 'style', 'noscript', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'svg', 'canvas', 'link', 'meta', 'base', 'dialog'];

/** Estilo inline que esconde o elemento (texto invisível ao leitor humano). */
export function isHiddenStyle(style: string): boolean {
  const s = style.toLowerCase().replace(/\s+/g, '');
  return (
    /display:none/.test(s) ||
    /visibility:(hidden|collapse)/.test(s) ||
    /(^|;)font-size:0(px|pt|em|rem|%)?(;|$|!)/.test(s) ||
    /(^|;)opacity:0(\.0+)?(;|$|!)/.test(s) ||
    /(^|;)(width|height):0(px)?(;|$|!).*overflow:hidden|overflow:hidden.*(^|;)(width|height):0(px)?(;|$|!)/.test(s) ||
    /clip:rect\(0(px)?,?0(px)?,?0(px)?,?0(px)?\)/.test(s) ||
    /text-indent:-\d{3,}/.test(s) ||
    /(left|top):-\d{4,}px/.test(s)
  );
}

type AnyElement = {
  tagName: string;
  getAttribute(n: string): string | null;
  setAttribute(n: string, v: string): void;
  removeAttribute(n: string): void;
  remove(): void;
  querySelectorAll(sel: string): Iterable<AnyElement>;
};

function cleanDocument(document: { querySelectorAll(sel: string): Iterable<AnyElement> }, baseUrl: string): void {
  for (const el of [...document.querySelectorAll(REMOVE_TAGS.join(','))]) el.remove();
  for (const el of [...document.querySelectorAll('[hidden],[aria-hidden="true"],input[type="hidden"],[style]')]) {
    if (el.getAttribute('hidden') !== null || el.getAttribute('aria-hidden') === 'true' || (el.tagName.toLowerCase() === 'input' && el.getAttribute('type') === 'hidden')) {
      el.remove();
      continue;
    }
    const style = el.getAttribute('style');
    if (style && isHiddenStyle(style)) el.remove();
  }
  // Links absolutos (o modelo precisa de URLs completas); javascript: e afins viram texto.
  for (const a of [...document.querySelectorAll('a[href]')]) {
    const href = a.getAttribute('href') ?? '';
    try {
      const abs = new URL(href, baseUrl);
      if (abs.protocol === 'http:' || abs.protocol === 'https:' || abs.protocol === 'mailto:') a.setAttribute('href', abs.href);
      else a.removeAttribute('href');
    } catch {
      a.removeAttribute('href');
    }
  }
}

/* ---------------- markdown ---------------- */

type TdNode = { querySelectorAll?(sel: string): ArrayLike<{ textContent: string | null; tagName?: string }>; textContent?: string | null };

function tableToMarkdown(node: TdNode): string {
  const rowsEls = node.querySelectorAll ? Array.from(node.querySelectorAll('tr') as ArrayLike<TdNode>) : [];
  const rows: string[][] = [];
  for (const tr of rowsEls.slice(0, 60)) {
    const cells = tr.querySelectorAll ? Array.from(tr.querySelectorAll('th,td')) : [];
    const vals = cells.map((c) => String(c.textContent ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'));
    if (vals.some((v) => v !== '')) rows.push(vals);
  }
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  if (width === 1) return '\n\n' + rows.map((r) => r[0]).join('\n') + '\n\n';
  const pad = (r: string[]): string[] => [...r, ...Array<string>(width - r.length).fill('')];
  const lines = [`| ${pad(rows[0]!).join(' | ')} |`, `| ${Array<string>(width).fill('---').join(' | ')} |`, ...rows.slice(1).map((r) => `| ${pad(r).join(' | ')} |`)];
  const more = rowsEls.length > 60 ? `\n[… tabela com ${rowsEls.length} linhas; mostrando 60]` : '';
  return '\n\n' + lines.join('\n') + more + '\n\n';
}

function makeTurndown(): TurndownService {
  const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*', hr: '---' });
  td.remove(['script', 'style', 'noscript', 'iframe', 'img', 'picture', 'video', 'audio', 'button', 'select', 'input', 'textarea'] as TurndownService.Filter);
  td.addRule('tabela', {
    filter: 'table',
    replacement: (_content, node) => tableToMarkdown(node as unknown as TdNode),
  });
  return td;
}

/** Limpeza final do texto: invisíveis (contrabando Unicode), NFKC e linhas em branco demais. */
export function tidyText(s: string): string {
  return stripInvisible(s.normalize('NFKC'))
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ExtractedPage {
  title: string;
  markdown: string;
  byline?: string;
  published?: string;
  siteName?: string;
  lang?: string;
  /** Usou o Readability (artigo) ou a página inteira limpa. */
  mode: 'artigo' | 'pagina';
}

/** HTML -> conteúdo principal em markdown. */
export function extractHtml(html: string, baseUrl: string): ExtractedPage {
  const { document } = parseHTML(html);
  const doc = document as unknown as Document & { querySelectorAll(sel: string): Iterable<AnyElement> };
  const rawTitle = String(doc.querySelector('title')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  cleanDocument(doc, baseUrl);
  const td = makeTurndown();

  let article: ReturnType<Readability['parse']> = null;
  try {
    article = new Readability(doc as unknown as Document, { charThreshold: 200, keepClasses: false }).parse();
  } catch {
    article = null;
  }
  if (article && (article.textContent ?? '').trim().length >= 200 && article.content) {
    const md = tidyText(td.turndown(article.content));
    return {
      title: (article.title || rawTitle || '').trim(),
      markdown: md,
      ...(article.byline ? { byline: article.byline.trim() } : {}),
      ...(article.publishedTime ? { published: article.publishedTime } : {}),
      ...(article.siteName ? { siteName: article.siteName.trim() } : {}),
      ...(article.lang ? { lang: article.lang } : {}),
      mode: 'artigo',
    };
  }

  // Página que não é artigo (lista, loja, portal): usa o corpo limpo sem menus/rodapés.
  const again = parseHTML(html).document as unknown as Document & { querySelectorAll(sel: string): Iterable<AnyElement> };
  cleanDocument(again, baseUrl);
  for (const el of [...again.querySelectorAll('nav,footer,aside,[role="navigation"],[role="banner"],[role="contentinfo"],form[role="search"]')]) el.remove();
  const body = again.querySelector('main') ?? again.querySelector('body');
  const md = tidyText(td.turndown(String((body as unknown as { innerHTML?: string })?.innerHTML ?? '')));
  return { title: rawTitle, markdown: md, mode: 'pagina' };
}
