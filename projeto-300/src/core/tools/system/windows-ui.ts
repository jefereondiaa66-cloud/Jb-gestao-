/**
 * windows_ui: controle de programas do Windows pela UI Automation (sem
 * clicar em coordenadas): listar janelas, focar uma janela, listar os
 * controles (botões, campos...) e acionar/preencher um controle pelo nome ou
 * automationId.
 */
import { z } from 'zod';
import type { RiskLevel, ToolDefinition } from '../../types';
import { errorMessage, errorOutput, preview, textOutput } from '../files/util';
import { UIA_CONTROL_TYPES, type UiaOp, type UiaWorker } from './uia-worker';

const ACTIONS = ['list_windows', 'focus_window', 'list_controls', 'invoke_control', 'set_text'] as const;

const schema = z
  .object({
    acao: z
      .enum(ACTIONS)
      .describe('list_windows: janelas abertas; focus_window: trazer janela para frente; list_controls: controles de uma janela; invoke_control: clicar/acionar um controle; set_text: preencher um campo.'),
    janela: z.number().int().optional().describe('Número da janela (campo "janela" devolvido por list_windows). Ou use "titulo".'),
    titulo: z.string().max(200).optional().describe('Parte do título da janela (alternativa a "janela").'),
    nome: z.string().max(300).optional().describe('Nome do controle (como aparece em list_controls). Prefira automationId quando houver.'),
    automationId: z.string().max(300).optional().describe('automationId do controle (mais estável que o nome, que vem traduzido).'),
    tipo: z.enum(UIA_CONTROL_TYPES).optional().describe('Tipo do controle para desempatar (ex.: Button, Edit, MenuItem).'),
    texto: z.string().max(5000).optional().describe('Texto para set_text.'),
    max: z.number().int().min(1).max(500).optional().describe('list_controls: máximo de controles (padrão 200).'),
  })
  .superRefine((v, ctx) => {
    const needsWindow = v.acao !== 'list_windows';
    if (needsWindow && v.janela === undefined && !v.titulo?.trim()) ctx.addIssue({ code: 'custom', message: 'informe "janela" ou "titulo".' });
    if ((v.acao === 'invoke_control' || v.acao === 'set_text') && !v.nome?.trim() && !v.automationId?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'informe "nome" ou "automationId" do controle.' });
    }
    if (v.acao === 'set_text' && v.texto === undefined) ctx.addIssue({ code: 'custom', message: 'informe "texto".' });
  });
type Input = z.infer<typeof schema>;

export function windowsUiRisk(i: Input): RiskLevel {
  return i.acao === 'list_windows' || i.acao === 'list_controls' ? 'read' : 'system';
}

export function describeWindowsUi(i: Input): string {
  const win = i.titulo ? `"${preview(i.titulo, 60)}"` : i.janela !== undefined ? `nº ${i.janela}` : '';
  const ctl = i.automationId ? `automationId "${preview(i.automationId, 60)}"` : i.nome ? `"${preview(i.nome, 60)}"` : '';
  switch (i.acao) {
    case 'list_windows':
      return 'Listar as janelas abertas';
    case 'focus_window':
      return `Trazer para a frente a janela ${win}`;
    case 'list_controls':
      return `Listar os controles da janela ${win}`;
    case 'invoke_control':
      return `Clicar/acionar o controle ${ctl}${i.tipo ? ` (${i.tipo})` : ''} na janela ${win}`;
    case 'set_text':
      return `Escrever "${preview(i.texto ?? '', 120)}" no campo ${ctl} da janela ${win}`;
  }
}

function argsFor(i: Input): Record<string, unknown> {
  const a: Record<string, unknown> = {};
  if (i.janela !== undefined) a.janela = i.janela;
  if (i.titulo) a.titulo = i.titulo;
  if (i.nome) a.nome = i.nome;
  if (i.automationId) a.automationId = i.automationId;
  if (i.tipo) a.tipo = i.tipo;
  if (i.texto !== undefined) a.texto = i.texto;
  if (i.max) a.max = i.max;
  return a;
}

interface WindowInfo {
  janela: number;
  titulo: string;
  processo?: string;
  minimizada?: boolean;
}

interface ControlInfo {
  nome?: string;
  tipo?: string;
  automationId?: string;
  habilitado?: boolean;
  acoes?: string[];
  nivel?: number;
}

export function formatWindows(list: unknown): string {
  const arr = (Array.isArray(list) ? list : []) as WindowInfo[];
  if (!arr.length) return 'Nenhuma janela aberta com título.';
  return `${arr.length} janelas abertas:\n` + arr.map((w) => `- janela ${w.janela}: "${w.titulo}"${w.processo ? ` (${w.processo})` : ''}${w.minimizada ? ' [minimizada]' : ''}`).join('\n');
}

export function formatControls(list: unknown): string {
  const arr = (Array.isArray(list) ? list : []) as ControlInfo[];
  if (!arr.length) return 'Nenhum controle encontrado nessa janela.';
  const lines = arr.map((c) => {
    const indent = '  '.repeat(Math.max(0, (c.nivel ?? 1) - 1));
    const id = c.automationId ? ` [automationId=${c.automationId}]` : '';
    const acts = c.acoes?.length ? ` {${c.acoes.join(', ')}}` : '';
    return `${indent}- ${c.tipo ?? '?'} "${c.nome ?? ''}"${id}${c.habilitado === false ? ' (desabilitado)' : ''}${acts}`;
  });
  return `${arr.length} controles (tipo "nome" [automationId] {ações possíveis}):\n${lines.join('\n')}`;
}

export function windowsUiTool(worker: UiaWorker): ToolDefinition<Input> {
  return {
    name: 'windows_ui',
    title: 'Controlar janela do Windows',
    description:
      'Controla programas do Windows pela automação de interface (UI Automation), sem clicar às cegas: list_windows, focus_window, list_controls ' +
      '(botões, campos, menus com nome, tipo e automationId), invoke_control (clicar/acionar) e set_text (preencher campo). ' +
      'Prefira isto a computer_action. Nomes vêm traduzidos (pt-BR); prefira automationId. Ações que mudam algo pedem confirmação.',
    inputSchema: schema,
    risk: windowsUiRisk,
    describe: describeWindowsUi,
    available: (services) => services.platform.os === 'windows' && services.settings.get().permissions?.computerControlEnabled !== false,
    async execute(input, ctx) {
      if (ctx.services.platform.os !== 'windows') return errorOutput('A automação de janelas só existe no Windows.');
      if (ctx.services.settings.get().permissions?.computerControlEnabled === false) return errorOutput('O controle do computador está desativado nas configurações.');
      try {
        const result = await worker.request(input.acao as UiaOp, argsFor(input), ctx.signal);
        const source = { untrusted: { source: 'interface de programas do Windows' } };
        switch (input.acao) {
          case 'list_windows':
            return textOutput(formatWindows(result), `${Array.isArray(result) ? result.length : 0} janelas`, source);
          case 'list_controls':
            return textOutput(formatControls(result), `${Array.isArray(result) ? result.length : 0} controles`, source);
          case 'focus_window': {
            const r = result as { titulo?: string };
            return textOutput(`Janela em primeiro plano: "${r?.titulo ?? ''}".`, 'Janela focada', source);
          }
          default: {
            const r = result as { feito?: string; nome?: string };
            return textOutput(`Pronto: ${r?.feito ?? 'feito'} — controle "${r?.nome ?? input.nome ?? input.automationId ?? ''}".`, `Controle: ${r?.feito ?? 'feito'}`, source);
          }
        }
      } catch (err) {
        if (ctx.signal.aborted) return errorOutput('Cancelado.');
        return errorOutput(`A automação do Windows falhou: ${errorMessage(err)}`);
      }
    },
  };
}
