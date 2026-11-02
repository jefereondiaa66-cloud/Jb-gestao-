/**
 * Renderiza o markdown simplificado como elementos React (sem HTML cru).
 * Links abrem no navegador do sistema pelo callback onOpenLink.
 */
import { memo, useMemo, useState, type ReactNode } from 'react';
import { parseMarkdown, type Block, type Inline } from '../lib/markdown';

export interface MarkdownProps {
  text: string;
  onOpenLink: (href: string) => void;
  /** Mostra um cursor piscando no fim (texto em transmissão). */
  streaming?: boolean;
}

function renderInline(nodes: Inline[], onOpenLink: (href: string) => void, keyPrefix: string): ReactNode[] {
  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;
    switch (n.t) {
      case 'text':
        return n.v;
      case 'br':
        return <br key={key} />;
      case 'code':
        return (
          <code key={key} className="md-code-inline">
            {n.v}
          </code>
        );
      case 'strong':
        return <strong key={key}>{renderInline(n.c, onOpenLink, key + '.')}</strong>;
      case 'em':
        return <em key={key}>{renderInline(n.c, onOpenLink, key + '.')}</em>;
      case 'del':
        return <del key={key}>{renderInline(n.c, onOpenLink, key + '.')}</del>;
      case 'link':
        return (
          <a
            key={key}
            href={n.href}
            title={n.href}
            rel="noreferrer noopener"
            className="md-link"
            onClick={(e) => {
              e.preventDefault();
              onOpenLink(n.href);
            }}
            onAuxClick={(e) => e.preventDefault()}
          >
            {renderInline(n.c, onOpenLink, key + '.')}
          </a>
        );
    }
    return null;
  });
}

function CodeBlock({ lang, code, open }: { lang: string; code: string; open: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined,
    );
  };
  return (
    <div className={'md-pre' + (open ? ' is-open' : '')}>
      <div className="md-pre-head">
        <span className="md-pre-lang">{lang || 'código'}</span>
        <button type="button" className="md-pre-copy" onClick={copy} aria-label="Copiar código">
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** caret: cursor de transmissão, colocado no fim do último bloco de texto. */
function renderBlocks(blocks: Block[], onOpenLink: (href: string) => void, keyPrefix: string, tight = false, caret?: ReactNode): ReactNode[] {
  return blocks.map((b, i) => {
    const key = `${keyPrefix}${i}`;
    const tail = caret && i === blocks.length - 1 ? caret : null;
    const node = renderBlock(b, key, onOpenLink, tight, tail);
    // blocos sem lugar para o cursor (código, tabela, linha) recebem o cursor depois
    if (tail && (b.t === 'code' || b.t === 'table' || b.t === 'hr')) return [node, <span key={key + 'c'}>{tail}</span>];
    return node;
  });
}

function renderBlock(b: Block, key: string, onOpenLink: (href: string) => void, tight: boolean, tail: ReactNode): ReactNode {
  switch (b.t) {
    case 'p':
      return tight ? (
        <span key={key} className="md-tight">
          {renderInline(b.c, onOpenLink, key + '.')}
          {tail}
        </span>
      ) : (
        <p key={key}>
          {renderInline(b.c, onOpenLink, key + '.')}
          {tail}
        </p>
      );
    case 'h': {
      // títulos ficam discretos dentro do balão (h3..h6)
      const level = Math.min(6, Math.max(3, b.level + 2));
      const content = (
        <>
          {renderInline(b.c, onOpenLink, key + '.')}
          {tail}
        </>
      );
      if (level === 3) return <h3 key={key} className="md-h">{content}</h3>;
      if (level === 4) return <h4 key={key} className="md-h">{content}</h4>;
      if (level === 5) return <h5 key={key} className="md-h">{content}</h5>;
      return <h6 key={key} className="md-h">{content}</h6>;
    }
    case 'code':
      return <CodeBlock key={key} lang={b.lang} code={b.v} open={b.open} />;
    case 'hr':
      return <hr key={key} />;
    case 'quote':
      return <blockquote key={key}>{renderBlocks(b.c, onOpenLink, key + '.', false, tail)}</blockquote>;
    case 'list': {
      const items = b.items.map((it, j) => {
        const itemTail = j === b.items.length - 1 ? tail : undefined;
        // item simples (um parágrafo, talvez com sublista) fica sem margens de parágrafo
        const isTight = it.length > 0 && it[0]!.t === 'p' && it.slice(1).every((x) => x.t === 'list');
        return <li key={`${key}.${j}`}>{renderBlocks(it, onOpenLink, `${key}.${j}.`, isTight, itemTail)}</li>;
      });
      return b.ordered ? (
        <ol key={key} start={b.start !== 1 ? b.start : undefined}>
          {items}
        </ol>
      ) : (
        <ul key={key}>{items}</ul>
      );
    }
    case 'table':
      return (
        <div key={key} className="md-table-wrap">
          <table>
            <thead>
              <tr>
                {b.head.map((c, j) => (
                  <th key={j} style={b.align[j] ? { textAlign: b.align[j]! } : undefined}>
                    {renderInline(c, onOpenLink, `${key}.h${j}.`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((c, j) => (
                    <td key={j} style={b.align[j] ? { textAlign: b.align[j]! } : undefined}>
                      {renderInline(c, onOpenLink, `${key}.${r}.${j}.`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
  return null;
}

export const Markdown = memo(function Markdown({ text, onOpenLink, streaming }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const caret = streaming ? <span className="md-caret" aria-hidden="true" /> : undefined;
  return (
    <div className={'md' + (streaming ? ' is-streaming' : '')}>
      {renderBlocks(blocks, onOpenLink, 'b', false, caret)}
      {caret && blocks.length === 0 && caret}
    </div>
  );
});
