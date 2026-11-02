/**
 * Componentes renderizados no servidor (renderToStaticMarkup): sem DOM, sem efeitos.
 * window.api300 falso (somente teste) onde a ponte é necessária.
 */
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmationRequest } from '../../../src/core/types';
import type { McpServerConfig } from '../../../src/core/settings';
import { stopEverything } from '../../../src/renderer/src/api';
import { ActivityPanel } from '../../../src/renderer/src/components/ActivityPanel';
import { ConfirmModal } from '../../../src/renderer/src/components/ConfirmModal';
import { ErrorBoundary } from '../../../src/renderer/src/components/ErrorBoundary';
import { ToolRow } from '../../../src/renderer/src/components/chat/MessageView';
import { SettingsDrawer } from '../../../src/renderer/src/components/settings/SettingsDrawer';
import { mcpRunsNewCommand } from '../../../src/renderer/src/components/settings/common';
import { riskInfo } from '../../../src/renderer/src/lib/format';

afterEach(() => {
  vi.unstubAllGlobals();
});

function request(over: Partial<ConfirmationRequest> = {}): ConfirmationRequest {
  const now = Date.now();
  return {
    id: 'c1',
    tool: 'apagar_arquivo',
    title: 'Apagar arquivo',
    description: 'Apagar C:\\Users\\voce\\Documentos\\nota.txt',
    risk: 'destructive',
    input: { caminho: '<script>alert(1)</script>' },
    actor: 'agent',
    tainted: false,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 120_000).toISOString(),
    ...over,
  };
}

const modal = (r: ConfirmationRequest) => renderToStaticMarkup(createElement(ConfirmModal, { request: r, queued: 1, onRespond: () => undefined, onExpired: () => undefined }));

describe('ConfirmModal', () => {
  it('risco destrutivo: sem "Permitir nesta sessão", Permitir começa desarmado e a entrada é escapada', () => {
    const html = modal(request());
    expect(html).not.toContain('Permitir nesta sessão');
    expect(html).toContain('Esta permissão vale só para esta ação.');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Permitir<\/button>/);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('pedido contaminado mostra o aviso', () => {
    expect(modal(request({ tainted: true }))).toContain('Este pedido surgiu depois de ler conteúdo externo (internet, e-mail ou arquivo). Confira com atenção.');
    expect(modal(request({ tainted: false }))).not.toContain('Este pedido surgiu depois');
  });

  it('"Permitir nesta sessão" só para leitura e escrita', () => {
    expect(modal(request({ risk: 'write' }))).toContain('Permitir nesta sessão');
    expect(modal(request({ risk: 'read' }))).toContain('Permitir nesta sessão');
    for (const risk of ['external', 'financial', 'system'] as const) expect(modal(request({ risk }))).not.toContain('Permitir nesta sessão');
  });

  it('risco desconhecido vira "Risco desconhecido" e nunca oferece lembrar', () => {
    const html = modal(request({ risk: 'qualquer' as never }));
    expect(html).toContain('Risco desconhecido');
    expect(html).not.toContain('Permitir nesta sessão');
  });
});

describe('valores inesperados de risco não derrubam a tela', () => {
  it('riskInfo', () => {
    expect(riskInfo('system').label).toBe('Controle do sistema');
    expect(riskInfo('constructor').label).toBe('Risco desconhecido');
    expect(riskInfo(undefined).label).toBe('Risco desconhecido');
  });

  it('painel de atividade e linha de ferramenta', () => {
    const items = [{ id: 'tool:1', ts: Date.now(), kind: 'tool' as const, title: 'Algo', status: 'ok' as const, risk: 'estranho' as never }];
    expect(renderToStaticMarkup(createElement(ActivityPanel, { items, onClear: () => undefined }))).toContain('Risco desconhecido');
    const info = { callId: '1', name: 'x', title: 'X', description: '', risk: 'estranho' as never, status: 'ok' as const, startedAt: 0 };
    expect(renderToStaticMarkup(createElement(ToolRow, { callId: '1', name: 'x', info }))).toContain('Risco desconhecido');
  });
});

describe('PARAR sempre ao alcance', () => {
  it('a gaveta de configurações (que cobre a barra superior) tem o botão PARAR', () => {
    const onStopAll = vi.fn();
    const html = renderToStaticMarkup(
      createElement(SettingsDrawer, {
        settings: null,
        loadError: null,
        update: async () => null,
        notify: () => undefined,
        connections: [],
        refreshConnections: () => undefined,
        memoryRev: 0,
        setWake: async () => undefined,
        reloadSettings: async () => null,
        section: 'cerebro',
        onSection: () => undefined,
        onClose: () => undefined,
        onStopAll,
      }),
    );
    expect(html).toContain('PARAR');
    expect(html).toContain('aria-label="Parar tudo: resposta, ferramentas, fala e escuta"');
  });

  it('a tela de falha da interface também tem PARAR quando a ponte existe', () => {
    vi.stubGlobal('window', { api300: { invoke: vi.fn(async () => undefined) } });
    const eb = new ErrorBoundary({ children: null });
    eb.state = { error: new Error('quebrou'), stopMsg: null };
    const html = renderToStaticMarkup(eb.render() as ReactElement);
    expect(html).toContain('PARAR');
    expect(html).toContain('quebrou');
  });

  it('stopEverything pede as duas paradas mesmo se uma falhar', async () => {
    const calls: string[] = [];
    const invoke = vi.fn(async (channel: string) => {
      calls.push(channel);
      if (channel === 'chat:stop') throw new Error("Error invoking remote method 'chat:stop': falhou");
    });
    vi.stubGlobal('window', { api300: { invoke } });
    const failed = await stopEverything();
    expect(calls.sort()).toEqual(['chat:stop', 'voice:stop']);
    expect(failed).toBeInstanceOf(Error);
    invoke.mockImplementation(async (channel: string) => void calls.push(channel));
    expect(await stopEverything()).toBeNull();
  });
});

describe('servidores MCP', () => {
  const base: McpServerConfig = { id: 'arq', name: 'Arquivos', transport: 'stdio', command: 'npx', args: ['-y', 'pacote'], env: {}, enabled: true, risk: 'external' };

  it('pede confirmação quando o programa executado muda', () => {
    expect(mcpRunsNewCommand(undefined, base)).toBe(true);
    expect(mcpRunsNewCommand(base, { ...base })).toBe(false);
    expect(mcpRunsNewCommand(base, { ...base, name: 'Outro nome', enabled: false })).toBe(false);
    expect(mcpRunsNewCommand(base, { ...base, command: 'powershell' })).toBe(true);
    expect(mcpRunsNewCommand(base, { ...base, args: ['-y', 'outro-pacote'] })).toBe(true);
    expect(mcpRunsNewCommand({ ...base, transport: 'http', url: 'https://x.com/mcp' }, base)).toBe(true);
    expect(mcpRunsNewCommand(base, { ...base, transport: 'http', url: 'https://x.com/mcp' })).toBe(false);
  });
});
