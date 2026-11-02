/**
 * Orquestrador do 300: recebe a fala do dono, conversa com o cérebro (LLM),
 * executa ferramentas com segurança e guarda tudo no histórico.
 *
 * Garantias:
 * - Histórico só cresce (nada é editado). Uma resposta pela metade nunca é
 *   salva; se uma resposta com chamadas de ferramenta foi salva, os
 *   resultados correspondentes também são (mesmo "cancelado pelo dono").
 * - Entrada de ferramenta é validada pelo esquema zod antes de rodar.
 * - Toda ferramenta passa pelo portão (política + confirmação + auditoria).
 * - Conteúdo externo é embrulhado como dado e "contamina" a tarefa: as
 *   próximas chamadas chegam ao portão com tainted = true. Como esse conteúdo
 *   continua no histórico (o modelo segue lendo), a conversa inteira fica
 *   contaminada a partir dali, também nos turnos seguintes.
 * - stop()/abort cancela o modelo e as ferramentas na hora.
 */
import { z } from 'zod';
import type { SendInput, SendResult } from '../engine-api';
import { isInvalidToolInput, isLlmError, LlmError, raceAbort, shortDetail, textOfParts } from '../llm/common';
import { modelForProvider } from '../llm/factory';
import { buildSystemPrompt, buildTurnContext } from '../persona';
import { stripInvisible, wrapUntrusted } from '../security/untrusted';
import type { ToolRegistry } from '../tools/registry';
import type {
  Actor,
  AssistantState,
  ChatMessage,
  ContentPart,
  EngineServices,
  EventBusLike,
  LlmProvider,
  LlmRequest,
  LlmStreamEvent,
  MemorySearchResult,
  RiskLevel,
  StopReason,
  ToolCallInfo,
  ToolContext,
  ToolDefinition,
  ToolGate,
  ToolOutput,
  ToolResultContent,
} from '../types';
import { newId, nowIso } from '../util/ids';
import { attachmentsToParts, MAX_IMAGE_BYTES, sniffImageType } from './attachments';

type ToolCallPart = Extract<ContentPart, { type: 'tool_call' }>;
type ToolResultPart = Extract<ContentPart, { type: 'tool_result' }>;
type DoneEvent = Extract<LlmStreamEvent, { type: 'done' }>;

export interface TurnCompleteInfo {
  conversationId: string;
  userText: string;
  assistantText: string;
  mode: 'text' | 'voice';
}

export interface AgentOptions {
  /** Tempo máximo de cada ferramenta (padrão 120 s). */
  toolTimeoutMs?: number;
  /** Tamanho (caracteres de texto) a partir do qual a conversa recomeça com um resumo (padrão 600 mil). */
  rolloverChars?: number;
  /** Total de imagens/PDFs (base64) a partir do qual a conversa recomeça com um resumo (padrão 20 MB). */
  rolloverBinaryBytes?: number;
  /** Tempo máximo da busca de memórias antes de seguir sem elas (padrão 5 s). */
  memoryTimeoutMs?: number;
  /** Limite de texto por resultado de ferramenta (padrão 100 mil caracteres). */
  maxToolOutputChars?: number;
  /** Fuso horário do dono (padrão: o do sistema). */
  timezone?: string;
  /** Relógio (testes). */
  now?: () => Date;
}

export interface AgentDeps {
  services: EngineServices;
  registry: ToolRegistry;
  gate: ToolGate;
  events: EventBusLike;
  getProvider(): LlmProvider;
  onTurnComplete?(info: TurnCompleteInfo): void;
  options?: AgentOptions;
}

export type AgentRunInput = SendInput & { signal?: AbortSignal };

/** Textos fixos mostrados ao dono. */
export const AGENT_TEXT = {
  cancelled: 'Cancelado pelo dono.',
  refusal: 'Não posso ajudar com esse pedido. Se achar que entendi errado, explique de outro jeito.',
  stepLimit: (n: number) => `Parei aqui: cheguei ao limite de ${n} etapas de ferramentas nesta tarefa. Se quiser, peça para eu continuar de onde parei.`,
  notRunStepLimit: 'Ferramenta não executada: limite de etapas desta tarefa atingido.',
  truncatedInput: 'Ferramenta não executada: a entrada foi cortada pelo limite de tamanho da resposta. Tente de novo com uma entrada menor (por exemplo, divida em partes).',
  interrupted: 'Ferramenta não executada: o aplicativo foi interrompido antes do resultado.',
  truncatedAnswer: '(A resposta foi cortada pelo limite de tamanho. Se quiser, peça para eu continuar.)',
} as const;

class ToolCancelled extends Error {}
class ToolTimedOut extends Error {}

interface Turn {
  conversationId: string;
  history: ChatMessage[];
  tainted: boolean;
  shown: string;
  citations: Map<string, string | undefined>;
  actor: Actor;
  mode: 'text' | 'voice';
  signal: AbortSignal;
  /** Reserva a conversa (nova ou continuação) para esta tarefa: outras tarefas nela esperam a vez. */
  claim(conversationId: string): void;
}

const RESULT_PREVIEW = 160;

export class Agent {
  private readonly active = new Set<AbortController>();
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly opts: Required<Omit<AgentOptions, 'timezone' | 'now'>> & Pick<AgentOptions, 'timezone'> & { now: () => Date };

  constructor(private readonly deps: AgentDeps) {
    const o = deps.options ?? {};
    this.opts = {
      toolTimeoutMs: o.toolTimeoutMs ?? 120_000,
      rolloverChars: o.rolloverChars ?? 600_000,
      rolloverBinaryBytes: o.rolloverBinaryBytes ?? 20 * 1024 * 1024,
      memoryTimeoutMs: o.memoryTimeoutMs ?? 5_000,
      maxToolOutputChars: o.maxToolOutputChars ?? 100_000,
      now: o.now ?? (() => new Date()),
      ...(o.timezone ? { timezone: o.timezone } : {}),
    };
  }

  /** Há alguma tarefa em andamento? */
  get busy(): boolean {
    return this.active.size > 0;
  }

  /** Cancela tudo que estiver em andamento (modelo e ferramentas). */
  stop(reason: string = AGENT_TEXT.cancelled): void {
    for (const c of [...this.active]) c.abort(new ToolCancelled(reason));
  }

  async run(input: AgentRunInput): Promise<SendResult> {
    const ctrl = new AbortController();
    this.active.add(ctrl);
    const signal = input.signal ? AbortSignal.any([input.signal, ctrl.signal]) : ctrl.signal;
    // Uma tarefa por conversa de cada vez (o histórico precisa ficar em ordem). Vale também para a
    // conversa que esta tarefa cria ou abre ao recomeçar: quem chegar depois nela espera a vez.
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const held = new Map<string, Promise<unknown>>();
    const claim = (id: string): Promise<unknown> => {
      const prev = this.queues.get(id);
      if (held.has(id)) return Promise.resolve();
      // A vez só passa adiante quando esta tarefa E as anteriores terminarem.
      const slot = prev ? Promise.all([prev.catch(() => undefined), mine]) : mine;
      this.queues.set(id, slot);
      held.set(id, slot);
      return prev ? prev.catch(() => undefined) : Promise.resolve();
    };
    try {
      const id = input.conversationId;
      if (id) {
        const wait = claim(id);
        await raceAbort(wait, signal, () => new ToolCancelled(AGENT_TEXT.cancelled)).catch(() => undefined);
        // Cancelada ainda na fila: nem começou, então não mexe no estado mostrado (outra tarefa pode estar rodando).
        if (signal.aborted) return { conversationId: id, text: '', stopReason: 'cancelled' };
      }
      return await this.runTurn(input, signal, (cid) => void claim(cid));
    } finally {
      release();
      for (const [id, slot] of held) if (this.queues.get(id) === slot) this.queues.delete(id);
      this.active.delete(ctrl);
    }
  }

  /* ==================================================================
   * Turno
   * ================================================================ */
  private async runTurn(input: AgentRunInput, signal: AbortSignal, claim: (conversationId: string) => void): Promise<SendResult> {
    const { services } = this.deps;
    const mode = input.mode ?? 'text';
    const actor: Actor = input.actor === 'scheduler' ? 'scheduler' : 'agent';
    const userText = input.text ?? '';
    let conversationId = input.conversationId ?? '';
    const turn: Turn = { conversationId, history: [], tainted: false, shown: '', citations: new Map(), actor, mode, signal, claim };

    this.emitState('THINKING');
    try {
      if (signal.aborted) return this.finishCancelled(turn);
      const settings = services.settings.get();
      const provider = this.deps.getProvider();
      const model = modelForProvider(settings, provider.id);
      const caps = provider.capabilities(model);

      // 1) Conversa
      if (conversationId) turn.history = [...(await services.conversations.messages(conversationId))];
      else {
        const c = await services.conversations.create();
        conversationId = c.id;
        claim(conversationId);
        this.deps.events.emit({ type: 'conversation', conversationId, ...(c.title ? { title: c.title } : {}) });
      }
      turn.conversationId = conversationId;
      await this.repairTail(turn);
      const big = historyChars(turn.history) > this.opts.rolloverChars || historyBinaryBytes(turn.history) > this.opts.rolloverBinaryBytes;
      if (big) await this.rollover(turn);
      // Conteúdo externo de turnos anteriores continua no contexto do modelo: a tarefa já começa contaminada.
      if (historyTainted(turn.history)) turn.tainted = true;
      const firstExchange = !turn.history.some((m) => m.role === 'user');

      // 2) Fala do dono
      const att = attachmentsToParts(input.attachments, caps);
      if (att.tainted) turn.tainted = true;
      const parts: ContentPart[] = [...att.parts];
      if (userText.trim() !== '') parts.push({ type: 'text', text: userText });
      if (parts.length === 0) parts.push({ type: 'text', text: '(mensagem vazia)' });
      const userMessage: ChatMessage = { id: newId('msg'), role: 'user', parts, createdAt: nowIso() };
      await this.persist(turn, userMessage);

      // 3) Contexto do turno (data/hora, memórias, modo)
      const memories = await this.searchMemories(userText, signal);
      if (signal.aborted) return this.finishCancelled(turn);
      const contextText = buildTurnContext({
        now: this.opts.now(),
        ...(this.opts.timezone ? { timezone: this.opts.timezone } : {}),
        mode,
        memories,
        userName: settings.persona.userName,
        os: services.platform.os,
      });
      const contextMessage: ChatMessage = { id: newId('ctx'), role: 'context', parts: [{ type: 'text', text: contextText }], createdAt: nowIso() };
      await this.persist(turn, contextMessage, false);

      // 4) Laço modelo -> ferramentas
      const system = buildSystemPrompt(settings);
      const effort = mode === 'voice' ? settings.brain.effortVoice : settings.brain.effortChat;
      const tools = caps.tools ? this.deps.registry.specs(services) : [];
      const serverTools =
        settings.brain.useServerWebTools && (caps.serverWebSearch || caps.serverWebFetch)
          ? { webSearch: caps.serverWebSearch, webFetch: caps.serverWebFetch }
          : undefined;
      const maxSteps = settings.brain.maxToolSteps;
      let steps = 0;
      // Enquanto nenhuma resposta deste turno foi salva, dá para recomeçar numa conversa nova se o modelo disser que ficou grande demais.
      // Se este turno já recomeçou, recomeçar de novo só perderia o resumo (o excesso está na própria fala do dono).
      let canRollover = !big;

      for (;;) {
        if (signal.aborted) return this.finishCancelled(turn);
        this.emitState('THINKING');
        const req: LlmRequest = {
          model,
          system,
          messages: turn.history,
          ...(tools.length ? { tools } : {}),
          ...(serverTools ? { serverTools } : {}),
          effort,
          signal,
        };
        const shownBefore = turn.shown;
        let done: DoneEvent | undefined;
        try {
          done = await this.streamStep(provider, req, turn);
        } catch (e) {
          if (canRollover && !signal.aborted && isLlmError(e) && e.code === 'contexto_grande') {
            // Conversa grande demais para o modelo: recomeça com um resumo e repete a fala do dono.
            canRollover = false;
            turn.history = turn.history.slice(0, -2);
            await this.rollover(turn);
            await this.persist(turn, { ...userMessage, id: newId('msg') }, false);
            await this.persist(turn, { ...contextMessage, id: newId('ctx') }, false);
            continue;
          }
          throw e;
        }
        if (!done || signal.aborted) return this.finishCancelled(turn);
        canRollover = false;

        if (done.stopReason === 'refusal') {
          // Saída parcial recusada é descartada; fica só um aviso no histórico.
          turn.shown = joinText(shownBefore, AGENT_TEXT.refusal);
          await this.persist(turn, { id: newId('msg'), role: 'assistant', parts: [{ type: 'text', text: AGENT_TEXT.refusal }], createdAt: nowIso() });
          return this.finish(turn, userText, 'refusal', firstExchange);
        }

        const message = done.message;
        const calls = message.parts.filter((p): p is ToolCallPart => p.type === 'tool_call');
        if (calls.length === 0) {
          if (done.stopReason === 'max_tokens') {
            // Sem aviso, o dono veria uma resposta cortada (ou nada, se o limite acabou no raciocínio).
            const note = AGENT_TEXT.truncatedAnswer;
            this.emitBlock(turn, note);
            message.parts = [...message.parts, { type: 'text', text: (textOfParts(message.parts) ? '\n\n' : '') + note }];
          }
          const sources = mode === 'text' ? formatSources(turn.citations, turn.shown) : '';
          if (sources) {
            message.parts = [...message.parts, { type: 'text', text: sources }];
            this.emitDelta(turn, sources);
          }
          if (hasContent(message)) await this.persist(turn, message);
          const stop: StopReason = done.stopReason === 'pause_turn' ? 'end_turn' : done.stopReason;
          return this.finish(turn, userText, stop, firstExchange);
        }

        // Resposta com chamadas de ferramenta: salva e responde TODAS.
        await this.persist(turn, message);
        if (steps >= maxSteps) {
          await this.persist(turn, toolMessage(calls.map((c) => errorResult(c, AGENT_TEXT.notRunStepLimit))));
          const msg = AGENT_TEXT.stepLimit(maxSteps);
          this.emitBlock(turn, msg);
          await this.persist(turn, { id: newId('msg'), role: 'assistant', parts: [{ type: 'text', text: msg }], createdAt: nowIso() });
          return this.finish(turn, userText, 'stop', firstExchange);
        }
        steps++;
        if (done.stopReason === 'max_tokens') {
          await this.persist(turn, toolMessage(calls.map((c) => errorResult(c, AGENT_TEXT.truncatedInput))));
          continue;
        }
        this.emitState('EXECUTING');
        const results = await this.runTools(calls, turn);
        await this.persist(turn, toolMessage(results));
        if (signal.aborted) return this.finishCancelled(turn);
      }
    } catch (e) {
      if (signal.aborted || (isLlmError(e) && e.code === 'cancelado')) return this.finishCancelled(turn);
      return this.finishError(turn, e);
    }
  }

  /** Uma chamada ao modelo. Retorna undefined se cancelado no meio. */
  private async streamStep(provider: LlmProvider, req: LlmRequest, turn: Turn): Promise<DoneEvent | undefined> {
    let done: DoneEvent | undefined;
    let first = true;
    const it = provider.stream(req)[Symbol.asyncIterator]();
    try {
      for (;;) {
        // Cancelamento imediato mesmo se o provedor demorar para notar o sinal.
        const r = await raceAbort(it.next(), turn.signal, () => new LlmError('cancelado', AGENT_TEXT.cancelled, { provider: provider.id }));
        if (r.done) break;
        const ev = r.value;
        if (turn.signal.aborted) return undefined;
        if (ev.type === 'done') {
          done = ev;
          continue;
        }
        this.onStreamEvent(ev, turn, first);
        if (ev.type === 'text_delta' && ev.text) first = false;
      }
    } catch (e) {
      if (turn.signal.aborted) return undefined;
      throw e;
    } finally {
      // Fecha o fluxo (o provedor encerra a conexão) sem esperar.
      void Promise.resolve()
        .then(() => it.return?.())
        .catch(() => undefined);
    }
    if (turn.signal.aborted) return undefined;
    if (!done) throw new LlmError('servidor', 'O modelo encerrou a resposta sem concluir. Tente de novo.', { provider: provider.id });
    return done;
  }

  private onStreamEvent(ev: Exclude<LlmStreamEvent, DoneEvent>, turn: Turn, first: boolean): void {
    switch (ev.type) {
      case 'text_delta':
        if (!ev.text) break;
        if (first && turn.shown !== '' && !/\s$/.test(turn.shown)) this.emitDelta(turn, '\n\n');
        this.emitDelta(turn, ev.text);
        break;
      case 'server_tool': {
        // Pesquisa/leitura na web feita pelo servidor do provedor: conteúdo externo entrou na tarefa.
        turn.tainted = true;
        const callId = newId('srv');
        const title = serverToolTitle(ev.name);
        const detail = oneLine(ev.detail, 200);
        this.deps.events.emit({ type: 'tool_start', callId, name: ev.name, title, description: detail || title, risk: 'read' });
        this.deps.events.emit({ type: 'tool_end', callId, name: ev.name, ok: true, summary: detail ? `${title}: ${detail}` : title });
        break;
      }
      case 'citation':
        if (/^https?:\/\//i.test(ev.url) && !turn.citations.has(ev.url)) turn.citations.set(ev.url, ev.title);
        break;
      default:
        break;
    }
  }

  /* ==================================================================
   * Ferramentas
   * ================================================================ */
  private async runTools(calls: ToolCallPart[], turn: Turn): Promise<ToolResultPart[]> {
    const results: ToolResultPart[] = [];
    for (const call of calls) {
      if (turn.signal.aborted) {
        results.push(errorResult(call, AGENT_TEXT.cancelled));
        continue;
      }
      try {
        results.push(await this.runOneTool(call, turn));
      } catch (e) {
        // Falha inesperada do próprio agente/portão: a chamada ainda precisa de resultado.
        this.deps.services.logger.error(`falha ao tratar a ferramenta ${call.name}`, shortDetail(e));
        results.push(errorResult(call, turn.signal.aborted ? AGENT_TEXT.cancelled : `Erro interno ao tratar a ferramenta: ${shortDetail(e) || 'desconhecido'}`));
      }
    }
    return results;
  }

  private async runOneTool(call: ToolCallPart, turn: Turn): Promise<ToolResultPart> {
    const { registry, services, gate, events } = this.deps;
    const tool = registry.get(call.name);
    const available = tool ? safeAvailable(tool, services) : false;
    if (!tool || !available) {
      const names = registry.list(services).map((t) => t.name).sort();
      const list = names.length > 60 ? names.slice(0, 60).join(', ') + ', …' : names.join(', ');
      const msg = tool
        ? `A ferramenta "${call.name}" não está disponível agora (desativada nas configurações ou sem o serviço necessário).`
        : `A ferramenta "${call.name}" não existe. Use apenas as ferramentas disponíveis${list ? `: ${list}` : ''}.`;
      this.toolEvents(call, oneLine(call.name, 64), msg, 'read', false, tool ? 'Indisponível' : 'Ferramenta desconhecida');
      return errorResult(call, msg);
    }

    if (isInvalidToolInput(call.input)) {
      const msg = `Entrada inválida (não é JSON válido): ${JSON.stringify({ INVALID_JSON: call.input.raw })}. Gere a chamada de novo com JSON correto.`;
      this.toolEvents(call, tool.title, tool.title, 'read', false, 'Entrada inválida');
      return errorResult(call, msg);
    }

    const parsed = tool.inputSchema.safeParse(call.input);
    if (!parsed.success) {
      const msg = `Entrada inválida para "${call.name}":\n${z.prettifyError(parsed.error)}\nCorrija os campos e chame de novo.`;
      this.toolEvents(call, tool.title, tool.title, 'read', false, 'Entrada inválida');
      return errorResult(call, msg);
    }
    const input: unknown = parsed.data;
    let risk: RiskLevel;
    try {
      risk = registry.riskOf(tool, input);
    } catch {
      risk = 'system'; // na dúvida, o risco mais alto que exige confirmação
    }
    const description = safeDescribe(tool, input);
    events.emit({ type: 'tool_start', callId: call.id, name: call.name, title: tool.title, description, risk });

    const info: ToolCallInfo = {
      callId: call.id,
      tool,
      input,
      actor: turn.actor,
      tainted: turn.tainted,
      conversationId: turn.conversationId,
    };

    // Portão: política + confirmação do dono.
    let auth: { allowed: boolean; reason: string };
    try {
      auth = await raceAbort(gate.authorize(info, turn.signal), turn.signal, () => new ToolCancelled(AGENT_TEXT.cancelled));
    } catch (e) {
      if (turn.signal.aborted) {
        events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok: false, summary: 'Cancelado' });
        return errorResult(call, AGENT_TEXT.cancelled);
      }
      const msg = `Não consegui verificar a permissão para "${tool.title}" (${shortDetail(e)}). A ação não foi feita.`;
      events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok: false, summary: 'Permissão não verificada' });
      return errorResult(call, msg);
    }
    if (!auth.allowed) {
      const reason = oneLine(auth.reason || 'negado', 300);
      events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok: false, summary: `Não autorizado: ${reason}` });
      return errorResult(
        call,
        `Ação não autorizada: ${reason}. A ferramenta não foi executada. Não tente fazer o mesmo por outro caminho; explique ao dono e pergunte como ele prefere seguir.`,
      );
    }

    // Execução com cancelamento imediato e tempo máximo.
    // O tempo esperando o dono responder a uma confirmação (ctx.confirm) não conta:
    // o pedido de confirmação já tem o próprio prazo.
    const timeout = new AbortController();
    const deadline = pausableTimer(this.opts.toolTimeoutMs, () => timeout.abort(new ToolTimedOut('tempo esgotado')));
    const toolSignal = AbortSignal.any([turn.signal, timeout.signal]);
    const ctx: ToolContext = {
      signal: toolSignal,
      actor: turn.actor,
      conversationId: turn.conversationId,
      confirm: async (title, desc, r) => {
        deadline.pause();
        try {
          return await this.confirmFromTool(tool, title, desc, r, turn, toolSignal);
        } finally {
          deadline.resume();
        }
      },
      log: (m) => services.logger.info(`[ferramenta ${call.name}] ${m}`),
      services,
    };
    try {
      let output: ToolOutput;
      try {
        output = await raceAbort(Promise.resolve().then(() => tool.execute(input, ctx)), toolSignal, () =>
          turn.signal.aborted ? new ToolCancelled(AGENT_TEXT.cancelled) : new ToolTimedOut('tempo esgotado'),
        );
      } catch (e) {
        if (turn.signal.aborted) {
          this.record(info, 'cancelado', 'Cancelado pelo dono');
          events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok: false, summary: 'Cancelado' });
          return errorResult(call, AGENT_TEXT.cancelled);
        }
        if (timeout.signal.aborted) {
          const secs = Math.round(this.opts.toolTimeoutMs / 1000);
          this.record(info, 'erro', `Tempo esgotado (${secs} s)`);
          events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok: false, summary: `Tempo esgotado (${secs} s)` });
          return errorResult(call, `Tempo esgotado: "${tool.title}" passou de ${secs} segundos e foi interrompida.`);
        }
        const detail = shortDetail(e) || 'erro desconhecido';
        this.record(info, 'erro', detail);
        events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok: false, summary: `Erro: ${detail}` });
        return errorResult(call, `Erro ao executar "${tool.title}": ${detail}`);
      }

      const result = this.toResult(call, output, turn);
      const ok = !result.isError;
      const summary = oneLine(output?.summary ?? '', 300) || (ok ? previewOf(result.content) || 'Concluído' : 'Falhou');
      this.record(info, ok ? 'ok' : 'erro', summary);
      events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok, summary });
      return result;
    } finally {
      deadline.clear();
    }
  }

  /** Auditoria do resultado; uma falha aqui não pode derrubar o turno. */
  private record(info: ToolCallInfo, outcome: 'ok' | 'erro' | 'cancelado', detail: string): void {
    try {
      this.deps.gate.recordResult(info, outcome, detail);
    } catch (e) {
      this.deps.services.logger.warn('falha ao registrar resultado da ferramenta', shortDetail(e));
    }
  }

  /** Saída da ferramenta -> resultado (corta excesso; embrulha conteúdo externo). */
  private toResult(call: ToolCallPart, output: ToolOutput, turn: Turn): ToolResultPart {
    const limit = this.opts.maxToolOutputChars;
    const texts: string[] = [];
    const images: ToolResultContent[] = [];
    const dropped: string[] = [];
    for (const c of Array.isArray(output?.content) ? output.content : []) {
      if (c && c.type === 'text' && typeof c.text === 'string') texts.push(c.text);
      else if (c && c.type === 'image' && typeof c.data === 'string') {
        // Imagem com tipo errado ou grande demais faria a API recusar este e todos os próximos pedidos da conversa.
        const img = checkToolImage(c.data);
        if (typeof img === 'string') dropped.push(img);
        else images.push(img);
      }
    }
    let text = texts.join('\n');
    if (text.length > limit) text = text.slice(0, limit) + `\n[saída cortada: ${text.length - limit} caracteres omitidos]`;
    if (dropped.length) text = (text ? text + '\n' : '') + dropped.map((d) => `[${d}]`).join('\n');
    const content: ToolResultContent[] = [];
    if (output?.untrusted) {
      turn.tainted = true;
      content.push({ type: 'text', text: wrapUntrusted(text, output.untrusted.source || call.name) });
    } else if (text !== '') content.push({ type: 'text', text });
    content.push(...images);
    if (content.length === 0) content.push({ type: 'text', text: '(sem saída)' });
    return { type: 'tool_result', toolCallId: call.id, name: call.name, content, ...(output?.isError ? { isError: true } : {}) };
  }

  /** ctx.confirm: confirmação explícita pedida pela própria ferramenta, pelo mesmo portão. */
  private async confirmFromTool(tool: ToolDefinition, title: string, description: string, risk: RiskLevel, turn: Turn, signal: AbortSignal): Promise<boolean> {
    const synthetic: ToolDefinition = { ...tool, title, risk, describe: () => description };
    const info: ToolCallInfo = {
      callId: newId('confirma'),
      tool: synthetic,
      input: { acao: description },
      actor: turn.actor,
      tainted: turn.tainted,
      conversationId: turn.conversationId,
    };
    try {
      const r = await raceAbort(this.deps.gate.authorize(info, signal), signal, () => new ToolCancelled(AGENT_TEXT.cancelled));
      return r.allowed === true;
    } catch {
      return false;
    }
  }

  private toolEvents(call: ToolCallPart, title: string, description: string, risk: RiskLevel, ok: boolean, summary: string): void {
    this.deps.events.emit({ type: 'tool_start', callId: call.id, name: call.name, title, description: oneLine(description, 200), risk });
    this.deps.events.emit({ type: 'tool_end', callId: call.id, name: call.name, ok, summary });
  }

  /* ==================================================================
   * Histórico
   * ================================================================ */
  private async persist(turn: Turn, message: ChatMessage, emit = true): Promise<void> {
    await this.deps.services.conversations.append(turn.conversationId, message);
    turn.history.push(message);
    if (emit) this.deps.events.emit({ type: 'message', conversationId: turn.conversationId, message });
  }

  /** Se o app caiu entre salvar chamadas de ferramenta e os resultados, completa o histórico (só acrescenta). */
  private async repairTail(turn: Turn): Promise<void> {
    const h = turn.history;
    let last = -1;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i]!.role === 'assistant') {
        last = i;
        break;
      }
      if (h[i]!.role === 'user') return;
    }
    if (last < 0) return;
    const calls = h[last]!.parts.filter((p): p is ToolCallPart => p.type === 'tool_call');
    if (!calls.length) return;
    const answered = new Set<string>();
    for (const m of h.slice(last + 1)) if (m.role === 'tool') for (const p of m.parts) if (p.type === 'tool_result') answered.add(p.toolCallId);
    const missing = calls.filter((c) => !answered.has(c.id));
    if (missing.length) await this.persist(turn, toolMessage(missing.map((c) => errorResult(c, AGENT_TEXT.interrupted))), false);
  }

  /** Conversa enorme: começa outra, com um resumo, sem editar a antiga. */
  private async rollover(turn: Turn): Promise<void> {
    const { services, events } = this.deps;
    const oldId = turn.conversationId;
    const transcript = transcriptOf(turn.history, 120_000);
    let summary = '';
    if (services.utilityComplete) {
      try {
        summary = await services.utilityComplete(
          'Resuma a conversa abaixo para ela continuar numa conversa nova. Guarde: pedidos e preferências do dono, decisões, tarefas pendentes, ' +
            'fatos importantes, nomes, números e datas. Não invente nada. No máximo 400 palavras.\n\n<conversa>\n' +
            transcript +
            '\n</conversa>',
          { maxTokens: 6000, signal: AbortSignal.any([turn.signal, AbortSignal.timeout(120_000)]) },
        );
      } catch (e) {
        services.logger.warn('resumo para nova conversa falhou; usando trecho final', shortDetail(e));
      }
    }
    if (!summary.trim()) summary = transcriptOf(turn.history, 8_000);
    const created = await services.conversations.create('Continuação da conversa anterior');
    turn.conversationId = created.id;
    turn.claim(created.id);
    turn.history = [];
    // O resumo pode conter trechos de conteúdo externo: entra como dado.
    turn.tainted = true;
    const seed: ChatMessage = {
      id: newId('ctx'),
      role: 'context',
      createdAt: nowIso(),
      parts: [
        {
          type: 'text',
          text: `Esta conversa continua a anterior (${oldId}), que ficou longa demais. Resumo do que já foi tratado:\n${wrapUntrusted(summary.trim(), 'resumo da conversa anterior')}`,
        },
      ],
    };
    await this.persist(turn, seed, false);
    events.emit({ type: 'conversation', conversationId: created.id, title: created.title || 'Continuação da conversa anterior' });
  }

  private async searchMemories(text: string, signal: AbortSignal): Promise<MemorySearchResult[]> {
    if (!text.trim()) return [];
    const { memory, logger } = this.deps.services;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('tempo esgotado')), this.opts.memoryTimeoutMs);
      });
      // stop() não espera a busca terminar.
      const search = Promise.race([Promise.resolve().then(() => memory.search({ text, limit: 6 })), timeout]);
      const res = await raceAbort(search, signal, () => new ToolCancelled(AGENT_TEXT.cancelled));
      return Array.isArray(res) ? res.slice(0, 6) : [];
    } catch (e) {
      if (signal.aborted) return [];
      logger.warn('memória indisponível neste turno', shortDetail(e));
      return [];
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /* ==================================================================
   * Finalização e eventos
   * ================================================================ */
  private finish(turn: Turn, userText: string, stopReason: StopReason, firstExchange: boolean): SendResult {
    const text = turn.shown;
    this.deps.events.emit({ type: 'assistant_done', conversationId: turn.conversationId, text, stopReason });
    this.emitState('IDLE');
    if (firstExchange && text.trim() && stopReason !== 'refusal') this.autoTitle(turn.conversationId, userText, text);
    try {
      this.deps.onTurnComplete?.({ conversationId: turn.conversationId, userText, assistantText: text, mode: turn.mode });
    } catch (e) {
      this.deps.services.logger.warn('onTurnComplete falhou', shortDetail(e));
    }
    return { conversationId: turn.conversationId, text, stopReason };
  }

  private finishCancelled(turn: Turn): SendResult {
    if (turn.conversationId) this.deps.events.emit({ type: 'assistant_done', conversationId: turn.conversationId, text: turn.shown, stopReason: 'cancelled' });
    this.emitState('IDLE');
    return { conversationId: turn.conversationId, text: turn.shown, stopReason: 'cancelled' };
  }

  private finishError(turn: Turn, e: unknown): SendResult {
    const message = isLlmError(e) ? e.message : `Algo deu errado: ${shortDetail(e) || 'erro desconhecido'}.`;
    const code = isLlmError(e) ? e.code : 'erro_interno';
    this.deps.services.logger.error('falha no turno do agente', e instanceof Error ? e : shortDetail(e));
    if (turn.conversationId) this.deps.events.emit({ type: 'assistant_done', conversationId: turn.conversationId, text: turn.shown, stopReason: 'error' });
    this.emitState('ERROR', message);
    this.deps.events.emit({ type: 'error', message, code });
    return { conversationId: turn.conversationId, text: message, stopReason: 'error' };
  }

  private autoTitle(conversationId: string, userText: string, assistantText: string): void {
    const { services, events } = this.deps;
    const uc = services.utilityComplete;
    if (!uc) return;
    void (async () => {
      try {
        const raw = await uc(
          'Crie um título curto (no máximo 6 palavras) em português para esta conversa. Responda só com o título, sem aspas e sem ponto final.\n\n<conversa>\nDono: ' +
            cut(userText, 1500) +
            '\n300: ' +
            cut(assistantText, 1500) +
            '\n</conversa>',
          { maxTokens: 2000, signal: AbortSignal.timeout(60_000) },
        );
        const title = cleanTitle(raw);
        if (!title) return;
        await services.conversations.rename(conversationId, title);
        events.emit({ type: 'conversation', conversationId, title });
      } catch (e) {
        services.logger.warn('título automático falhou', shortDetail(e));
      }
    })();
  }

  /** Bloco de texto novo, separado do anterior por uma linha em branco. */
  private emitBlock(turn: Turn, text: string): void {
    if (turn.shown !== '' && !/\s$/.test(turn.shown)) this.emitDelta(turn, '\n\n');
    this.emitDelta(turn, text);
  }

  private emitDelta(turn: Turn, text: string): void {
    turn.shown += text;
    this.deps.events.emit({ type: 'assistant_delta', conversationId: turn.conversationId, text });
  }

  private emitState(state: AssistantState, detail?: string): void {
    this.deps.events.emit({ type: 'state', state, ...(detail ? { detail } : {}) });
  }
}

/* ======================================================================
 * Funções auxiliares
 * ==================================================================== */
/** Temporizador que pode ser pausado (aninhável) e retomado com o tempo que faltava. */
function pausableTimer(ms: number, onExpire: () => void): { pause(): void; resume(): void; clear(): void } {
  let remaining = ms;
  let startedAt = Date.now();
  let paused = 0;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    timer = undefined;
    if (finished) return;
    finished = true;
    onExpire();
  };
  timer = setTimeout(fire, ms);
  return {
    pause() {
      if (finished) return;
      if (paused++ === 0 && timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
        remaining -= Date.now() - startedAt;
      }
    },
    resume() {
      if (finished || paused === 0) return;
      if (--paused === 0) {
        startedAt = Date.now();
        timer = setTimeout(fire, Math.max(0, remaining));
      }
    },
    clear() {
      finished = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}

/** Valida uma imagem devolvida por ferramenta: tipo real pelos bytes e tamanho máximo. Texto = motivo da recusa. */
function checkToolImage(raw: string): ToolResultContent | string {
  const comma = raw.startsWith('data:') ? raw.indexOf(',') : -1;
  const data = (comma >= 0 ? raw.slice(comma + 1) : raw).replace(/\s+/g, '');
  const head = Buffer.from(data.slice(0, 64), 'base64');
  const mediaType = sniffImageType(head);
  if (!mediaType) return 'imagem omitida: formato inválido (só PNG, JPEG, WebP ou GIF)';
  const bytes = Math.floor((data.length * 3) / 4);
  if (bytes > MAX_IMAGE_BYTES) return `imagem omitida: grande demais (${Math.round(bytes / 1024 / 1024)} MB; máximo 5 MB)`;
  return { type: 'image', mediaType, data };
}

/** Rótulo pt-BR para as ferramentas que o próprio servidor do provedor executa. */
function serverToolTitle(name: string): string {
  if (name === 'web_search') return 'Pesquisa na web';
  if (name === 'web_fetch') return 'Leitura de página';
  if (/code_execution/.test(name)) return 'Análise dos resultados da web';
  return oneLine(name, 64) || 'Ferramenta do servidor';
}

const EXTERNAL_NATIVE = /^(server_tool_use|mcp_tool_use|web_search_call|file_search_call|mcp_call)$|_tool_result$/;

/**
 * O histórico já tem conteúdo externo que o modelo continua lendo?
 * (resultados embrulhados, anexos, resumo de conversa anterior, pesquisas feitas pelo servidor do provedor)
 */
export function historyTainted(history: ChatMessage[]): boolean {
  for (const m of history) {
    for (const p of m.parts) {
      if (p.type === 'text' && p.text.includes('<conteudo_externo')) return true;
      if (m.role === 'user' && (p.type === 'image' || p.type === 'document')) return true;
      if (p.type === 'tool_result' && p.content.some((c) => c.type === 'text' && c.text.includes('<conteudo_externo'))) return true;
    }
    const native = m.role === 'assistant' ? m.native?.content : undefined;
    if (Array.isArray(native)) {
      for (const b of native) {
        const t = typeof b === 'object' && b !== null ? (b as { type?: unknown }).type : undefined;
        if (typeof t === 'string' && EXTERNAL_NATIVE.test(t)) return true;
      }
    }
  }
  return false;
}

function errorResult(call: ToolCallPart, text: string): ToolResultPart {
  return { type: 'tool_result', toolCallId: call.id, name: call.name, content: [{ type: 'text', text }], isError: true };
}

function toolMessage(results: ToolResultPart[]): ChatMessage {
  return { id: newId('msg'), role: 'tool', parts: results, createdAt: nowIso() };
}

function hasContent(m: ChatMessage): boolean {
  if (m.parts.length) return true;
  const c = m.native?.content;
  return Array.isArray(c) ? c.length > 0 : c !== undefined && c !== null;
}

function joinText(a: string, b: string): string {
  if (!a) return b;
  return /\s$/.test(a) ? a + b : `${a}\n\n${b}`;
}

function oneLine(s: string, max: number): string {
  const t = stripInvisible(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function cut(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

function cleanTitle(raw: string): string {
  const firstLine = (raw ?? '').split(/\r?\n/).map((l) => l.trim()).find((l) => l !== '') ?? '';
  const t = stripInvisible(firstLine)
    .replace(/^(t[íi]tulo\s*:\s*)/i, '')
    .replace(/^["'“”‘’«»*#\s]+|["'“”‘’«»*.\s]+$/g, '')
    .trim();
  return t.length > 80 ? t.slice(0, 80).trim() + '…' : t;
}

function safeAvailable(tool: ToolDefinition, services: EngineServices): boolean {
  try {
    return tool.available ? tool.available(services) : true;
  } catch {
    return false;
  }
}

function safeDescribe(tool: ToolDefinition, input: unknown): string {
  try {
    const d = tool.describe?.(input);
    if (typeof d === 'string' && d.trim()) return oneLine(d, 300);
  } catch {
    /* descrição falhou: usa o título */
  }
  return tool.title;
}

function previewOf(content: ToolResultContent[]): string {
  const t = content.find((c) => c.type === 'text');
  if (!t || t.type !== 'text') return content.some((c) => c.type === 'image') ? 'Imagem' : '';
  // Não mostra o envelope de conteúdo externo no resumo.
  const plain = t.text.startsWith('<conteudo_externo') ? 'Conteúdo externo recebido' : t.text;
  return oneLine(plain, RESULT_PREVIEW);
}

/** Total de caracteres de texto do histórico (imagens e PDFs não contam). */
export function historyChars(history: ChatMessage[]): number {
  let n = 0;
  for (const m of history) {
    for (const p of m.parts) {
      if (p.type === 'text') n += p.text.length;
      else if (p.type === 'tool_result') {
        for (const c of p.content) if (c.type === 'text') n += c.text.length;
      } else if (p.type === 'tool_call') {
        try {
          n += JSON.stringify(p.input ?? null).length;
        } catch {
          /* entrada não serializável */
        }
      }
    }
  }
  return n;
}

/** Total de dados binários (base64 de imagens e PDFs) no histórico. */
export function historyBinaryBytes(history: ChatMessage[]): number {
  let n = 0;
  for (const m of history) {
    for (const p of m.parts) {
      if (p.type === 'image' || p.type === 'document') n += p.data.length;
      else if (p.type === 'tool_result') {
        for (const c of p.content) if (c.type === 'image') n += c.data.length;
      }
    }
  }
  return n;
}

function transcriptOf(history: ChatMessage[], maxChars: number): string {
  const lines: string[] = [];
  for (const m of history) {
    if (m.role === 'user') lines.push(`Dono: ${textOfParts(m.parts)}`);
    else if (m.role === 'assistant') {
      const t = textOfParts(m.parts);
      if (t.trim()) lines.push(`300: ${t}`);
    }
  }
  const all = lines.join('\n');
  return all.length > maxChars ? '…' + all.slice(all.length - maxChars) : all;
}

function formatSources(citations: Map<string, string | undefined>, alreadyShown: string): string {
  const list = [...citations].filter(([url]) => !alreadyShown.includes(url)).slice(0, 8);
  if (!list.length) return '';
  const lines = list.map(([url, title]) => {
    const label = oneLine(title || url, 120).replace(/[[\]]/g, '');
    // Parênteses, espaços e < > quebrariam o link em Markdown.
    const href = url.replace(/[()<>\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
    return `- [${label}](${href})`;
  });
  return `\n\nFontes:\n${lines.join('\n')}`;
}
