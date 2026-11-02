import { describe, expect, it } from 'vitest';
import type { ChatMessage, ConfirmationRequest, EngineEvent } from '../../../src/core/types';
import { attachedFileName, createInitialState, messageText, reducer, toolResultsOf, type Action, type AppState } from '../../../src/renderer/src/lib/store';
import { base64ByteLength, bytesToBase64, classifyFile, fitWithin, formatBytes, normalizeMediaType, rejectReason } from '../../../src/renderer/src/lib/attachments';
import { errorText, formatDue, formatRelative, prettyJson } from '../../../src/renderer/src/lib/format';

const T0 = Date.parse('2026-11-02T12:00:00Z');

function run(state: AppState, ...actions: Action[]): AppState {
  return actions.reduce((s, a) => reducer(s, a), state);
}
const ev = (event: EngineEvent, follow = false): Action => ({ type: 'engine', event, follow, now: T0 });

const msg = (id: string, role: ChatMessage['role'], text: string, extra: ChatMessage['parts'] = []): ChatMessage => ({
  id,
  role,
  parts: [...(text ? [{ type: 'text' as const, text }] : []), ...extra],
  createdAt: new Date(T0).toISOString(),
});

function withConversation(): AppState {
  return run(createInitialState(T0), { type: 'select', id: 'c1', load: false });
}

const items = (s: AppState) => s.thread.map((it) => (it.kind === 'tool' ? `tool:${it.callId}` : `${it.message.role}${it.local ? '*' : ''}:${messageText(it.message)}`));

describe('redutor — conversa em transmissão', () => {
  it('mensagem otimista do usuário é trocada pela real', () => {
    let s = withConversation();
    s = run(s, { type: 'local_user', conversationId: 'c1', text: 'Oi', attachments: [], now: T0 });
    expect(items(s)).toEqual(['user*:Oi']);
    expect(s.activeTurn).toBe('c1');
    s = run(s, ev({ type: 'message', conversationId: 'c1', message: msg('m1', 'user', 'Oi') }));
    expect(items(s)).toEqual(['user:Oi']);
  });

  it('texto em transmissão vira mensagem e não duplica', () => {
    let s = withConversation();
    s = run(
      s,
      ev({ type: 'message', conversationId: 'c1', message: msg('m1', 'user', 'Oi') }),
      ev({ type: 'assistant_delta', conversationId: 'c1', text: 'Olá, ' }),
      ev({ type: 'assistant_delta', conversationId: 'c1', text: 'tudo bem?' }),
    );
    expect(s.streaming).toBe('Olá, tudo bem?');
    s = run(s, ev({ type: 'message', conversationId: 'c1', message: msg('m2', 'assistant', 'Olá, tudo bem?') }));
    expect(s.streaming).toBe('');
    s = run(s, ev({ type: 'assistant_done', conversationId: 'c1', text: 'Olá, tudo bem?', stopReason: 'end_turn' }));
    expect(items(s)).toEqual(['user:Oi', 'assistant:Olá, tudo bem?']);
    expect(s.activeTurn).toBeNull();
  });

  it('sem evento de mensagem do assistente, o fim cria uma provisória que depois é substituída', () => {
    let s = withConversation();
    s = run(
      s,
      ev({ type: 'message', conversationId: 'c1', message: msg('m1', 'user', 'Oi') }),
      ev({ type: 'assistant_delta', conversationId: 'c1', text: 'Resposta' }),
      ev({ type: 'assistant_done', conversationId: 'c1', text: 'Resposta', stopReason: 'end_turn' }),
    );
    expect(items(s)).toEqual(['user:Oi', 'assistant*:Resposta']);
    s = run(s, ev({ type: 'message', conversationId: 'c1', message: msg('m2', 'assistant', 'Resposta') }));
    expect(items(s)).toEqual(['user:Oi', 'assistant:Resposta']);
  });

  it('ferramentas aparecem na conversa e a mensagem com tool_call substitui a linha avulsa', () => {
    let s = withConversation();
    s = run(
      s,
      ev({ type: 'message', conversationId: 'c1', message: msg('m1', 'user', 'Pesquise') }),
      ev({ type: 'assistant_delta', conversationId: 'c1', text: 'Vou pesquisar.' }),
      ev({ type: 'tool_start', callId: 't1', name: 'web_search', title: 'Pesquisar na web', description: 'Pesquisando "clima"', risk: 'read' }),
    );
    expect(items(s)).toEqual(['user:Pesquise', 'assistant*:Vou pesquisar.', 'tool:t1']);
    expect(s.tools.t1!.status).toBe('running');
    s = run(s, ev({ type: 'tool_end', callId: 't1', name: 'web_search', ok: true, summary: '5 resultados' }));
    expect(s.tools.t1).toMatchObject({ status: 'ok', summary: '5 resultados' });
    expect(s.activity[0]).toMatchObject({ id: 'tool:t1', status: 'ok', detail: '5 resultados' });
    s = run(s, ev({ type: 'message', conversationId: 'c1', message: msg('m2', 'assistant', 'Vou pesquisar.', [{ type: 'tool_call', id: 't1', name: 'web_search', input: {} }]) }));
    expect(items(s)).toEqual(['user:Pesquise', 'assistant:Vou pesquisar.']);
  });

  it('eventos de outra conversa marcam não lida (sem seguir) ou trocam de conversa (seguindo a voz)', () => {
    let s = withConversation();
    s = run(s, ev({ type: 'message', conversationId: 'c2', message: msg('x', 'user', 'oi') }));
    expect(s.currentId).toBe('c1');
    expect(s.unread.c2).toBe(true);
    s = run(s, ev({ type: 'assistant_delta', conversationId: 'c3', text: 'A' }, true));
    expect(s.currentId).toBe('c3');
    expect(s.loadRequest).toMatchObject({ id: 'c3' });
    expect(s.streaming).toBe('A');
  });

  it('carga do histórico mantém o que chegou por evento durante a carga', () => {
    let s = run(createInitialState(T0), { type: 'select', id: 'c1' });
    expect(s.loadRequest?.id).toBe('c1');
    s = run(s, ev({ type: 'message', conversationId: 'c1', message: msg('m9', 'user', 'nova') }));
    s = run(s, { type: 'thread_loaded', id: 'c1', messages: [msg('m1', 'user', 'antiga'), msg('m2', 'assistant', 'resp')] });
    expect(items(s)).toEqual(['user:antiga', 'assistant:resp', 'user:nova']);
    expect(s.loadRequest).toBeNull();
    // carga atrasada de outra conversa é ignorada
    const t = run(s, { type: 'thread_loaded', id: 'outra', messages: [] });
    expect(t).toBe(s);
  });

  it('falha no envio marca a mensagem', () => {
    let s = withConversation();
    s = run(s, { type: 'local_user', conversationId: 'c1', text: 'Oi', attachments: [], now: T0 }, { type: 'send_failed', conversationId: 'c1', error: 'sem rede' });
    const it0 = s.thread[0]!;
    expect(it0.kind === 'msg' && it0.failed).toBe('sem rede');
    expect(s.activeTurn).toBeNull();
  });
});

describe('redutor — confirmações, estado, avisos', () => {
  const req = (id: string): ConfirmationRequest => ({
    id,
    tool: 'shell_run',
    title: 'Executar comando',
    description: 'dir',
    risk: 'system',
    input: { cmd: 'dir' },
    actor: 'agent',
    tainted: false,
    createdAt: new Date(T0).toISOString(),
    expiresAt: new Date(T0 + 60000).toISOString(),
  });

  it('fila de confirmações sem duplicar e resolvidas saem', () => {
    let s = createInitialState(T0);
    s = run(s, ev({ type: 'confirmation_request', request: req('a') }), ev({ type: 'confirmation_request', request: req('b') }), ev({ type: 'confirmation_request', request: req('a') }));
    expect(s.confirmations.map((c) => c.id)).toEqual(['a', 'b']);
    s = run(s, ev({ type: 'confirmation_resolved', id: 'a', approved: false }));
    expect(s.confirmations.map((c) => c.id)).toEqual(['b']);
    s = run(s, { type: 'confirmation_done', id: 'b' });
    expect(s.confirmations).toHaveLength(0);
  });

  it('estado de erro guarda a mensagem; erro vira aviso', () => {
    let s = createInitialState(T0);
    s = run(s, ev({ type: 'error', message: 'Chave inválida' }));
    expect(s.toasts).toHaveLength(1);
    expect(s.toasts[0]).toMatchObject({ tone: 'erro', body: 'Chave inválida' });
    s = run(s, ev({ type: 'state', state: 'ERROR' }));
    expect(s.assistant).toMatchObject({ state: 'ERROR', error: 'Chave inválida' });
    s = run(s, ev({ type: 'state', state: 'IDLE' }));
    expect(s.assistant.error).toBeUndefined();
    // aviso repetido em seguida não duplica
    s = run(s, ev({ type: 'error', message: 'Chave inválida' }));
    expect(s.toasts).toHaveLength(1);
  });

  it('conexões: evento atualiza um serviço, lista completa substitui', () => {
    let s = run(createInitialState(T0), { type: 'connections', list: [{ service: 'anthropic', label: 'Claude', status: 'ok' }] });
    s = run(s, ev({ type: 'connection', service: 'anthropic', status: 'erro', detail: 'sem crédito' }));
    expect(s.connections).toEqual([{ service: 'anthropic', label: 'Claude', status: 'erro', detail: 'sem crédito' }]);
    s = run(s, ev({ type: 'connection', service: 'mcp:x', status: 'verificando' }));
    expect(s.connections).toHaveLength(2);
  });

  it('jobs e revisões', () => {
    let s = run(createInitialState(T0), { type: 'schedules', names: { s1: 'Resumo diário' } });
    s = run(s, ev({ type: 'job', run: { id: 'r1', scheduleId: 's1', startedAt: new Date(T0).toISOString(), status: 'executando' } }));
    expect(s.activity[0]).toMatchObject({ id: 'job:r1', title: 'Agendamento: Resumo diário', status: 'running' });
    s = run(s, ev({ type: 'job', run: { id: 'r1', scheduleId: 's1', startedAt: new Date(T0).toISOString(), status: 'aguardando_aprovacao' } }));
    expect(s.activity).toHaveLength(1);
    expect(s.activity[0]!.status).toBe('aguardando');
    s = run(s, ev({ type: 'tasks_changed' }), ev({ type: 'memory_changed' }));
    expect(s.rev).toMatchObject({ tasks: 1, memory: 1 });
  });

  it('conversa removida volta para rascunho', () => {
    let s = run(createInitialState(T0), { type: 'conversations', list: [{ id: 'c1', title: 'A', createdAt: '', updatedAt: '', messageCount: 1 }] }, { type: 'select', id: 'c1' });
    s = run(s, { type: 'conversation_removed', id: 'c1' });
    expect(s.currentId).toBeNull();
    expect(s.conversations).toHaveLength(0);
  });
});

describe('auxiliares de exibição', () => {
  it('toolResultsOf e attachedFileName', () => {
    const m = msg('t', 'tool', '', [{ type: 'tool_result', toolCallId: 'k', content: [{ type: 'text', text: 'feito' }], isError: true }]);
    const r = toolResultsOf([{ kind: 'msg', key: 't', message: m }]);
    expect(r.get('k')).toEqual({ isError: true, text: 'feito' });
    expect(attachedFileName('Arquivo anexado "nota.txt":\n<conteudo_externo origem="x">...')).toBe('nota.txt');
    expect(attachedFileName('Arquivo anexado "nota.txt":\nsem envelope')).toBeNull();
  });
});

describe('anexos', () => {
  it('classifica tipos e completa tipo vazio pela extensão', () => {
    expect(classifyFile('foto.JPG', '')).toBe('image');
    expect(normalizeMediaType('foto.jpg', 'image/jpg')).toBe('image/jpeg');
    expect(classifyFile('doc.pdf', 'application/pdf')).toBe('pdf');
    expect(classifyFile('notas.md', '')).toBe('text');
    expect(classifyFile('dados.json', 'application/json')).toBe('text');
    expect(classifyFile('programa.exe', 'application/x-msdownload')).toBeNull();
    expect(classifyFile('imagem.svg', 'image/svg+xml')).toBeNull();
  });

  it('limites e motivos em pt-BR', () => {
    expect(rejectReason('a.exe', '', 10)).toMatch(/não é um tipo aceito/);
    expect(rejectReason('a.txt', 'text/plain', 0)).toMatch(/vazio/);
    expect(rejectReason('a.pdf', 'application/pdf', 31 * 1024 * 1024)).toMatch(/grande demais/);
    expect(rejectReason('a.png', 'image/png', 1000)).toBeNull();
  });

  it('base64 em blocos confere com Buffer', () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    const b64 = bytesToBase64(bytes);
    expect(b64).toBe(Buffer.from(bytes).toString('base64'));
    expect(base64ByteLength(b64)).toBe(100_000);
    expect(base64ByteLength('YQ==')).toBe(1);
  });

  it('fitWithin mantém proporção', () => {
    expect(fitWithin(4000, 2000, 1568)).toEqual({ width: 1568, height: 784, scaled: true });
    expect(fitWithin(800, 600, 1568)).toEqual({ width: 800, height: 600, scaled: false });
  });

  it('formatBytes em pt-BR', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1,5 KB');
    expect(formatBytes(30 * 1024 * 1024)).toBe('30 MB');
  });
});

describe('formatação', () => {
  it('datas relativas e vencimentos', () => {
    expect(formatRelative(T0 - 10_000, T0)).toBe('agora');
    expect(formatRelative(T0 - 5 * 60_000, T0)).toBe('há 5 min');
    expect(formatDue(new Date(T0 - 1000).toISOString(), T0).overdue).toBe(true);
  });

  it('prettyJson limita e errorText limpa o prefixo do IPC', () => {
    expect(prettyJson({ a: 1 })).toBe('{\n  "a": 1\n}');
    expect(prettyJson('x'.repeat(50), 10)).toMatch(/caracteres omitidos/);
    expect(errorText(new Error("Error invoking remote method 'chat:send': Error: sem chave"))).toBe('sem chave');
  });
});

describe('transcrição', () => {
  it('parcial some ao sair de "ouvindo"; final permanece', () => {
    let s = run(createInitialState(T0), ev({ type: 'state', state: 'LISTENING' }), ev({ type: 'transcript', text: 'me lembra', final: false }));
    expect(s.transcript?.text).toBe('me lembra');
    s = run(s, ev({ type: 'state', state: 'IDLE' }));
    expect(s.transcript).toBeNull();
    s = run(s, ev({ type: 'transcript', text: 'me lembra de ligar', final: true }), ev({ type: 'state', state: 'THINKING' }));
    expect(s.transcript).toMatchObject({ text: 'me lembra de ligar', final: true });
  });
});

describe('tentar de novo', () => {
  it('remove a mensagem que falhou', () => {
    let s = run(createInitialState(T0), { type: 'select', id: 'c1', load: false }, { type: 'local_user', conversationId: 'c1', text: 'Oi', attachments: [], now: T0 }, { type: 'send_failed', conversationId: 'c1', error: 'x' });
    const key = s.thread[0]!.key;
    s = run(s, { type: 'remove_item', key });
    expect(s.thread).toHaveLength(0);
  });
});

describe('mensagem enviada', () => {
  it('deixa de mostrar "enviando" quando o motor responde ou confirma', () => {
    let s = run(createInitialState(T0), { type: 'select', id: 'c1', load: false }, { type: 'local_user', conversationId: 'c1', text: 'Oi', attachments: [], now: T0 });
    const pending = (st: AppState) => {
      const it = st.thread[0]!;
      return it.kind === 'msg' && !it.sent;
    };
    expect(pending(s)).toBe(true);
    s = run(s, ev({ type: 'assistant_delta', conversationId: 'c1', text: 'O' }));
    expect(pending(s)).toBe(false);
    let t = run(createInitialState(T0), { type: 'select', id: 'c1', load: false }, { type: 'local_user', conversationId: 'c1', text: 'Oi', attachments: [], now: T0 });
    t = run(t, { type: 'send_ok', conversationId: 'c1' });
    expect(pending(t)).toBe(false);
    // a mensagem real ainda substitui a provisória
    t = run(t, ev({ type: 'message', conversationId: 'c1', message: msg('m1', 'user', 'Oi') }));
    expect(items(t)).toEqual(['user:Oi']);
  });
});
