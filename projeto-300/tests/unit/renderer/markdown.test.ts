import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Markdown } from '../../../src/renderer/src/components/Markdown';
import { inlineText, parseInline, parseMarkdown, safeHref } from '../../../src/renderer/src/lib/markdown';

const html = (text: string, streaming = false) => renderToStaticMarkup(createElement(Markdown, { text, onOpenLink: () => undefined, streaming }));

describe('safeHref', () => {
  it('aceita só http, https e mailto', () => {
    expect(safeHref('https://exemplo.com/a?b=1')).toBe('https://exemplo.com/a?b=1');
    expect(safeHref('http://exemplo.com')).toBe('http://exemplo.com/');
    expect(safeHref('mailto:fulano@exemplo.com')).toBe('mailto:fulano@exemplo.com');
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JAVASCRIPT:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<b>x</b>')).toBeNull();
    expect(safeHref('file:///C:/Windows')).toBeNull();
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref(' https://a.com/ x')).toBeNull();
    expect(safeHref('https://user:senha@a.com')).toBeNull();
    expect(safeHref('//a.com')).toBeNull();
  });
});

describe('parseInline', () => {
  it('negrito, itálico, código e tachado', () => {
    const nodes = parseInline('**forte** e *leve* e `x < y` e ~~velho~~');
    expect(nodes.map((n) => n.t)).toEqual(['strong', 'text', 'em', 'text', 'code', 'text', 'del']);
    expect(inlineText(nodes)).toBe('forte e leve e x < y e velho');
  });

  it('não confunde snake_case com itálico', () => {
    const nodes = parseInline('use a variavel minha_var_aqui agora');
    expect(nodes).toEqual([{ t: 'text', v: 'use a variavel minha_var_aqui agora' }]);
  });

  it('asteriscos soltos ficam como texto', () => {
    expect(inlineText(parseInline('2 * 3 * 4'))).toBe('2 * 3 * 4');
    expect(parseInline('2 * 3 * 4').every((n) => n.t === 'text')).toBe(true);
    expect(inlineText(parseInline('**incompleto'))).toBe('**incompleto');
  });

  it('links seguros viram link; inseguros viram texto', () => {
    const ok = parseInline('veja [o site](https://exemplo.com) agora');
    expect(ok[1]).toEqual({ t: 'link', href: 'https://exemplo.com/', c: [{ t: 'text', v: 'o site' }] });
    const bad = parseInline('[clique](javascript:alert(1))');
    expect(bad.some((n) => n.t === 'link')).toBe(false);
    expect(inlineText(bad)).toBe('clique');
  });

  it('endereços soltos sem a pontuação final', () => {
    const nodes = parseInline('Acesse https://exemplo.com/pagina. Depois (www.teste.com.br).');
    const links = nodes.filter((n) => n.t === 'link');
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ href: 'https://exemplo.com/pagina' });
    expect(links[1]).toMatchObject({ href: 'https://www.teste.com.br/' });
  });

  it('escapes e quebras de linha', () => {
    expect(inlineText(parseInline('\\*não itálico\\*'))).toBe('*não itálico*');
    expect(parseInline('a\nb').map((n) => n.t)).toEqual(['text', 'br', 'text']);
  });
});

describe('parseMarkdown', () => {
  it('parágrafos, títulos e linha horizontal', () => {
    const b = parseMarkdown('# Título\n\nPrimeiro\nsegundo\n\n---\n\nFim');
    expect(b.map((x) => x.t)).toEqual(['h', 'p', 'hr', 'p']);
    expect(b[0]).toMatchObject({ level: 1 });
  });

  it('blocos de código, inclusive incompletos (transmissão)', () => {
    const done = parseMarkdown('Antes\n```ts\nconst a = 1;\n**não é negrito**\n```\nDepois');
    expect(done[1]).toEqual({ t: 'code', lang: 'ts', v: 'const a = 1;\n**não é negrito**', open: false });
    const open = parseMarkdown('```python\nprint("oi")');
    expect(open[0]).toMatchObject({ t: 'code', lang: 'python', v: 'print("oi")', open: true });
  });

  it('listas com marcadores, numeradas e aninhadas', () => {
    const b = parseMarkdown('- um\n- dois\n  - dois.a\n- três\n\n3. c\n4. d');
    expect(b).toHaveLength(2);
    const ul = b[0]!;
    expect(ul).toMatchObject({ t: 'list', ordered: false });
    if (ul.t !== 'list') throw new Error();
    expect(ul.items).toHaveLength(3);
    expect(ul.items[1]!.map((x) => x.t)).toEqual(['p', 'list']);
    const ol = b[1]!;
    expect(ol).toMatchObject({ t: 'list', ordered: true, start: 3 });
  });

  it('lista numerada com sublista em dois espaços', () => {
    const b = parseMarkdown('1. Primeiro\n  - detalhe\n2. Segundo');
    expect(b).toHaveLength(1);
    if (b[0]!.t !== 'list') throw new Error();
    expect(b[0]!.items).toHaveLength(2);
    expect(b[0]!.items[0]!.map((x) => x.t)).toEqual(['p', 'list']);
  });

  it('tabelas', () => {
    const b = parseMarkdown('| Nome | Valor |\n|:-----|------:|\n| a | 1 |\n| b `|` | 2 |');
    expect(b[0]).toMatchObject({ t: 'table', align: ['left', 'right'] });
    if (b[0]!.t !== 'table') throw new Error();
    expect(b[0]!.rows).toHaveLength(2);
    expect(inlineText(b[0]!.rows[1]![0]!)).toBe('b |');
  });

  it('citações', () => {
    const b = parseMarkdown('> cuidado\n> com isso\n\nok');
    expect(b[0]).toMatchObject({ t: 'quote' });
    expect(b[1]).toMatchObject({ t: 'p' });
  });

  it('aguenta entrada patológica sem travar', () => {
    const evil = '['.repeat(5000) + '*'.repeat(5000) + '`'.repeat(3000);
    const t0 = Date.now();
    parseMarkdown(evil);
    parseMarkdown('> '.repeat(200) + 'x');
    parseMarkdown('- '.repeat(300) + 'x');
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('<Markdown> (elementos React, sem HTML cru)', () => {
  it('escapa HTML e scripts', () => {
    const out = html('<script>alert(1)</script> <img src=x onerror=alert(1)> **ok**');
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;script&gt;');
    expect(out).toContain('<strong>ok</strong>');
  });

  it('não gera links para esquemas perigosos', () => {
    const out = html('[x](javascript:alert(1)) [y](https://ok.com)');
    expect(out).not.toContain('javascript:');
    expect(out).toContain('href="https://ok.com/"');
  });

  it('renderiza código, listas e tabela', () => {
    const out = html('```js\nlet a = "<b>";\n```\n\n- a\n- b\n\n| x |\n|---|\n| 1 |');
    expect(out).toContain('<pre><code>let a = &quot;&lt;b&gt;&quot;;</code></pre>');
    expect(out).toContain('<ul><li>');
    expect(out).toContain('<table>');
  });

  it('mostra cursor durante a transmissão', () => {
    expect(html('Olá', true)).toContain('md-caret');
    expect(html('Olá', false)).not.toContain('md-caret');
  });
});
