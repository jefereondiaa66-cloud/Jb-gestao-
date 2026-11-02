/*
 * SOMENTE PARA TESTES — NÃO FAZ PARTE DO APLICATIVO.
 *
 * window.api300 FALSO e roteirizado, injetado pelo harness de capturas de tela
 * (tests/e2e/ui-harness/shoot.mjs) antes da interface carregar. Devolve dados
 * de exemplo e permite que o roteiro dispare eventos do motor pela
 * window.__harness. Nenhuma chamada sai do navegador.
 */
(() => {
  const data = window.__HARNESS_DATA__ || {};
  const listeners = { event: new Set(), audioOut: new Set(), audioStop: new Set(), command: new Set() };
  const log = [];
  const stats = { frames: 0, badFrames: 0, lastFrameLen: 0 };
  let seq = 0;
  const now = () => new Date().toISOString();
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const merge = (a, b) => {
    if (b === undefined) return a;
    if (Array.isArray(b) || typeof b !== 'object' || b === null) return b;
    const out = { ...(a || {}) };
    for (const k of Object.keys(b)) out[k] = merge(a ? a[k] : undefined, b[k]);
    return out;
  };

  let settings = clone(data.settings) || {};
  let secrets = ['anthropic_api_key', 'brave_search_api_key'];

  const conversations = [
    { id: 'c1', title: 'Planejamento da semana', createdAt: ago(300), updatedAt: ago(12), messageCount: 4 },
    { id: 'c2', title: 'Orçamento da reforma', createdAt: ago(3000), updatedAt: ago(1500), messageCount: 9 },
    { id: 'c3', title: 'Resumo do contrato de aluguel', createdAt: ago(9000), updatedAt: ago(4200), messageCount: 6 },
  ];

  const messages = {
    c1: [
      { id: 'm1', role: 'user', createdAt: ago(14), parts: [{ type: 'text', text: 'Organize minhas tarefas desta semana por prioridade.' }] },
      {
        id: 'm2',
        role: 'assistant',
        createdAt: ago(14),
        parts: [
          { type: 'text', text: 'Vou consultar suas tarefas pendentes.' },
          { type: 'tool_call', id: 'tc1', name: 'tasks_list', input: { status: 'pendente' } },
        ],
      },
      { id: 'm3', role: 'tool', createdAt: ago(13), parts: [{ type: 'tool_result', toolCallId: 'tc1', name: 'tasks_list', content: [{ type: 'text', text: '5 tarefas' }] }] },
      {
        id: 'm4',
        role: 'assistant',
        createdAt: ago(12),
        parts: [
          {
            type: 'text',
            text:
              'Aqui está a semana organizada:\n\n### Alta prioridade\n1. **Enviar proposta** para o cliente até quarta\n2. Pagar o boleto da internet (vence *amanhã*)\n\n### Média\n- Revisar o `orcamento-reforma.xlsx`\n- Agendar dentista\n\n| Dia | Foco |\n|---|---|\n| Segunda | Proposta |\n| Terça | Financeiro |\n\nQuer que eu crie lembretes? Detalhes em https://exemplo.com.br/agenda.',
          },
        ],
      },
    ],
  };

  const tasks = [
    { id: 't1', title: 'Enviar proposta para o cliente', status: 'pendente', priority: 'alta', dueAt: new Date(Date.now() + 2 * 86400000).toISOString(), createdAt: ago(600), updatedAt: ago(600) },
    { id: 't2', title: 'Pagar boleto da internet', status: 'pendente', priority: 'alta', dueAt: new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T00:00:00', createdAt: ago(900), updatedAt: ago(900) },
    { id: 't3', title: 'Revisar orçamento da reforma', status: 'em_andamento', priority: 'media', project: 'Casa', createdAt: ago(1200), updatedAt: ago(100) },
    { id: 't4', title: 'Agendar dentista', status: 'pendente', priority: 'baixa', createdAt: ago(2000), updatedAt: ago(2000) },
    { id: 't5', title: 'Comprar presente da Ana', status: 'concluida', priority: 'media', createdAt: ago(5000), updatedAt: ago(60), completedAt: ago(60) },
  ];

  const connections = [
    { service: 'anthropic', label: 'Claude (Anthropic)', status: 'ok', detail: 'claude-opus-5-5' },
    { service: 'busca', label: 'Pesquisa (Brave)', status: 'ok' },
    { service: 'voz-local', label: 'Voz local', status: 'ok', detail: 'Whisper base' },
    { service: 'google', label: 'Google', status: 'desconectado' },
    { service: 'mcp:arquivos', label: 'MCP: arquivos', status: 'erro', detail: 'O programa encerrou ao iniciar' },
  ];

  const memories = [
    { id: 'mem1', kind: 'preference', content: 'Prefere respostas curtas e diretas, com valores em reais (R$).', tags: ['estilo'], importance: 0.8, source: 'conversa:c1', sensitive: false, createdAt: ago(9000), updatedAt: ago(900), accessCount: 12 },
    { id: 'mem2', kind: 'person', content: 'Ana é a esposa; aniversário em 14 de março.', tags: ['família'], importance: 0.9, source: 'usuario', sensitive: false, createdAt: ago(20000), updatedAt: ago(20000), accessCount: 3 },
    { id: 'mem3', kind: 'fact', content: 'Conta no banco termina em 4421.', tags: ['finanças'], importance: 0.6, source: 'extração', sensitive: true, createdAt: ago(3000), updatedAt: ago(3000), accessCount: 1 },
  ];

  const audit = [
    { id: 3, ts: ago(5), actor: 'agent', kind: 'tool', tool: 'web_search', risk: 'read', decision: 'allow', outcome: 'ok', detail: 'Pesquisou "previsão do tempo São Paulo"', input: '{"query":"previsão do tempo São Paulo"}' },
    { id: 2, ts: ago(30), actor: 'agent', kind: 'permission', tool: 'shell_run', risk: 'system', decision: 'rejected', outcome: 'bloqueado', detail: 'Negado pelo dono' },
    { id: 1, ts: ago(60), actor: 'user', kind: 'secret', detail: 'Chave anthropic_api_key alterada' },
  ];

  const emit = (event) => {
    for (const l of [...listeners.event]) {
      try {
        l(event);
      } catch (e) {
        console.error('ouvinte falhou', e);
      }
    }
  };

  const handlers = {
    'settings:get': () => clone(settings),
    'settings:update': (patch) => {
      settings = merge(settings, patch);
      return clone(settings);
    },
    'secrets:list': () => [...secrets],
    'secrets:set': ({ name }) => {
      if (!secrets.includes(name)) secrets.push(name);
    },
    'secrets:delete': ({ name }) => {
      secrets = secrets.filter((s) => s !== name);
    },
    'chat:list': () => clone(conversations),
    'chat:messages': ({ conversationId }) => clone(messages[conversationId] || []),
    'chat:new': () => ({ conversationId: 'c-new-' + ++seq }),
    'chat:send': (arg) => {
      const id = arg.conversationId;
      emit({ type: 'message', conversationId: id, message: { id: 'srv-u-' + ++seq, role: 'user', createdAt: now(), parts: [{ type: 'text', text: arg.text }] } });
      emit({ type: 'state', state: 'THINKING' });
      return { conversationId: id };
    },
    'chat:stop': () => emit({ type: 'state', state: 'IDLE' }),
    'chat:delete': () => undefined,
    'chat:rename': () => undefined,
    'confirm:respond': (arg) => {
      emit({ type: 'confirmation_resolved', id: arg.id, approved: arg.response.approved });
    },
    'voice:start': () => emit({ type: 'state', state: 'LISTENING' }),
    'voice:stop': () => emit({ type: 'state', state: 'IDLE' }),
    'voice:stopSpeaking': () => undefined,
    'voice:setWake': ({ enabled }) => {
      settings = merge(settings, { wake: { enabled } });
    },
    'voice:voices': () => [
      { id: 'pt_BR-faber-medium', label: 'Faber', language: 'pt-BR' },
      { id: 'pt_BR-edresson-low', label: 'Edresson', language: 'pt-BR' },
    ],
    'voice:test': () => undefined,
    'voice:downloadModels': () => new Promise((r) => setTimeout(r, 400)),
    'memory:list': () => clone(memories),
    'memory:search': ({ text }) => memories.filter((m) => m.content.toLowerCase().includes(String(text).toLowerCase())).map((item) => ({ item, score: 1, matchedBy: ['fts'] })),
    'memory:add': (a) => ({ id: 'mem' + ++seq, importance: 0.5, source: 'usuario', createdAt: now(), updatedAt: now(), accessCount: 0, tags: [], sensitive: false, ...a }),
    'memory:update': (a) => ({ ...memories.find((m) => m.id === a.id), ...a, updatedAt: now() }),
    'memory:delete': () => true,
    'memory:export': () => JSON.stringify({ version: 1, exportedAt: now(), items: memories }),
    'tasks:list': () => clone(tasks),
    'tasks:create': (a) => {
      const t = { id: 't' + ++seq, status: 'pendente', priority: 'media', createdAt: now(), updatedAt: now(), ...a };
      tasks.unshift(t);
      return clone(t);
    },
    'tasks:update': ({ id, patch }) => {
      const t = tasks.find((x) => x.id === id);
      if (!t) return null;
      Object.assign(t, patch, { updatedAt: now() });
      return clone(t);
    },
    'tasks:delete': () => true,
    'schedules:list': () => [{ id: 's1', name: 'Resumo diário', cron: '0 8 * * *', action: { type: 'resumo_diario' }, enabled: true, createdAt: ago(9000) }],
    'schedules:runs': () => [{ id: 'r1', scheduleId: 's1', startedAt: ago(240), finishedAt: ago(239), status: 'ok', output: 'Resumo do dia enviado: 3 compromissos, 2 tarefas urgentes.' }],
    'audit:list': () => clone(audit),
    'system:info': () => ({
      version: '0.1.0',
      platform: 'windows',
      dataDir: 'C:\\Users\\Usuario\\AppData\\Roaming\\300',
      secretsEncrypted: true,
      databaseEncrypted: true,
      voiceModels: [
        { id: 'whisper-base', label: 'Whisper base (escuta)', installed: true, sizeMb: 148 },
        { id: 'piper-faber', label: 'Piper Faber (fala)', installed: true, sizeMb: 63 },
        { id: 'silero-vad', label: 'Silero VAD (detecção de fala)', installed: false, sizeMb: 2 },
      ],
    }),
    'system:connections': () => clone(connections),
    'system:openExternal': () => undefined,
    'system:setAutoStart': ({ enabled }) => {
      settings = merge(settings, { privacy: { autoStart: enabled } });
    },
    'integrations:connect': () => ({ ok: false, detail: 'Teste: sem rede no harness.' }),
    'integrations:disconnect': () => undefined,
    'mcp:reload': () => clone(connections.filter((c) => c.service.startsWith('mcp:'))),
  };

  window.api300 = {
    invoke(channel, arg) {
      log.push({ channel, arg: clone(arg) });
      const h = handlers[channel];
      try {
        return Promise.resolve(h ? h(arg) : undefined);
      } catch (e) {
        return Promise.reject(e);
      }
    },
    onEvent(l) {
      listeners.event.add(l);
      return () => listeners.event.delete(l);
    },
    sendAudio(frame) {
      stats.frames++;
      stats.lastFrameLen = frame && frame.length;
      if (!(frame instanceof Float32Array) || frame.length !== 512) stats.badFrames++;
    },
    onAudioOut(l) {
      listeners.audioOut.add(l);
      return () => listeners.audioOut.delete(l);
    },
    onAudioStop(l) {
      listeners.audioStop.add(l);
      return () => listeners.audioStop.delete(l);
    },
    onCommand(l) {
      listeners.command.add(l);
      return () => listeners.command.delete(l);
    },
  };

  const loops = {};
  window.__harness = {
    isHarness: true,
    log,
    stats,
    emit,
    command(cmd) {
      for (const l of [...listeners.command]) l(cmd);
    },
    audioOut(seconds, freq, rate) {
      const sr = rate || 24000;
      const n = Math.round(sr * seconds);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = 0.4 * Math.sin((2 * Math.PI * (freq || 220) * i) / sr) * (0.6 + 0.4 * Math.sin(i / 900));
      for (const l of [...listeners.audioOut]) l({ utteranceId: 'u' + ++seq, samples, sampleRate: sr, final: true });
    },
    audioStop() {
      for (const l of [...listeners.audioStop]) l();
    },
    /** Liga um laço de níveis (mic_level ou speech_level) com ondulação. */
    levels(kind, on) {
      clearInterval(loops[kind]);
      if (!on) return;
      let t = 0;
      loops[kind] = setInterval(() => {
        t += 0.05;
        const level = Math.max(0, Math.min(1, 0.45 + 0.35 * Math.sin(t * 7) + 0.15 * Math.sin(t * 17)));
        emit({ type: kind, level });
      }, 50);
    },
  };
})();
