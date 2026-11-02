import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase, type AppDatabase } from '@core/memory/database';
import { createStores, type Stores } from '@core/memory/stores';
import { ToolRegistry } from '@core/tools/registry';
import { memoryTools } from '@core/tools/memory';
import { plannerTools } from '@core/tools/planner';
import { DefaultPermissionPolicy } from '@core/security/policy';
import type { PermissionPolicy, ToolDefinition, ToolOutput } from '@core/types';
import { FakeEmbeddings, makeCtx, makeServices, tempDir, type TestServices } from './helpers';

const text = (o: ToolOutput) => o.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
const tool = (name: string): ToolDefinition => [...memoryTools(), ...plannerTools()].find((t) => t.name === name)!;

async function run(name: string, input: unknown, svc: TestServices, opts: { approve?: boolean; conversationId?: string; policy?: PermissionPolicy } = {}) {
  const t = tool(name);
  const parsed = t.inputSchema.parse(input);
  const ctx = makeCtx(svc, { ...opts, tool: name });
  const out = await t.execute(parsed, ctx);
  return { out, ctx, json: (() => {
    try {
      return JSON.parse(text(out));
    } catch {
      return undefined;
    }
  })() };
}

describe('definições das ferramentas', () => {
  it('registram sem conflito e geram JSON Schema', () => {
    const r = new ToolRegistry();
    r.registerAll([...memoryTools(), ...plannerTools()]);
    const names = r.specs().map((s) => s.name);
    expect(names).toEqual([
      'conversation_search',
      'memory_delete',
      'memory_export',
      'memory_save',
      'memory_search',
      'memory_update',
      'task_complete',
      'task_create',
      'task_delete',
      'task_list',
      'task_update',
    ]);
    for (const s of r.specs()) {
      expect(s.inputSchema.type).toBe('object');
      expect(s.description.length).toBeGreaterThan(20);
    }
    const risk = Object.fromEntries(r.list().map((t) => [t.name, r.riskOf(t, {})]));
    expect(risk).toMatchObject({
      memory_search: 'read',
      memory_save: 'write',
      memory_update: 'write',
      memory_delete: 'destructive',
      memory_export: 'write',
      conversation_search: 'read',
      task_create: 'write',
      task_list: 'read',
      task_update: 'write',
      task_complete: 'write',
      task_delete: 'destructive',
    });
    for (const t of r.list()) expect(t.title).toMatch(/[a-zà-ú]/i);
  });
});

describe('ferramentas de memória', () => {
  let t: ReturnType<typeof tempDir>;
  let db: AppDatabase;
  let s: Stores;
  let svc: TestServices;
  beforeEach(() => {
    t = tempDir();
    db = openDatabase({ path: join(t.dir, 'm.db'), key: 'k' });
    s = createStores(db);
    svc = makeServices(s, { documents: join(t.dir, 'Documentos') });
  });
  afterEach(() => {
    s.dispose();
    db.close();
    t.cleanup();
  });

  it('memory_save guarda, evita duplicata e avisa a interface', async () => {
    const r1 = await run('memory_save', { content: 'O dono prefere chá de hortelã.', kind: 'preference', tags: ['bebida'] }, svc, { conversationId: 'c9' });
    expect(r1.out.isError).toBeUndefined();
    expect(r1.json.situacao).toBe('guardada');
    const saved = (await s.memory.list())[0]!;
    expect(saved).toMatchObject({ kind: 'preference', source: 'conversa:c9', tags: ['bebida'], importance: 0.6, sensitive: false });
    expect(svc.emitted).toContainEqual({ type: 'memory_changed' });
    const r2 = await run('memory_save', { content: 'O dono prefere chá de hortelã', importance: 0.9 }, svc);
    expect(r2.json.situacao).toBe('ja_existia');
    expect(await s.memory.count()).toBe(1);
    expect((await s.memory.get(saved.id))!.importance).toBe(0.9);
    expect(r1.ctx.confirms).toEqual([]);
  });

  it('memory_save de informação sensível pede autorização', async () => {
    const denied = await run('memory_save', { content: 'A senha do wi-fi é abacate123.' }, svc, { approve: false });
    expect(denied.ctx.confirms).toEqual(['Guardar informação sensível']);
    expect(text(denied.out)).toMatch(/não autorizou/);
    expect(await s.memory.count()).toBe(0);
    const ok = await run('memory_save', { content: 'A senha do wi-fi é abacate123.' }, svc, { approve: true });
    expect(ok.json.memoria.sensivel).toBe(true);
    expect((await s.memory.list())[0]!.sensitive).toBe(true);
  });

  it('memory_search acha por texto e esconde sensíveis sem autorização', async () => {
    await s.memory.add({ kind: 'fact', content: 'O dono nasceu em Belém.', tags: [], importance: 0.7, source: 'u', sensitive: false });
    await s.memory.add({ kind: 'fact', content: 'O RG do dono nasceu... número 12.345.678 de Belém.', tags: [], importance: 0.7, source: 'u', sensitive: true });
    const r = await run('memory_search', { query: 'belem' }, svc);
    expect(r.json.total).toBe(1);
    expect(r.json.memorias[0]).toMatchObject({ tipo: 'fact', conteudo: 'O dono nasceu em Belém.', encontradaPor: ['fts'] });
    expect(r.out.summary).toBe('1 memória encontrada');
    const denied = await run('memory_search', { query: 'belem', includeSensitive: true }, svc, { approve: false });
    expect(text(denied.out)).not.toContain('12.345.678');
    expect(denied.ctx.confirms).toEqual(['Consultar memórias sensíveis']);
    const allowed = await run('memory_search', { query: 'belem', includeSensitive: true }, svc, { approve: true });
    expect(allowed.json.total).toBe(2);
    const none = await run('memory_search', { query: 'tóquio' }, svc);
    expect(none.json.total).toBe(0);
    expect(tool('memory_search').describe!({ query: 'pão' })).toMatch(/pão/);
  });

  it('memory_update altera; tirar a marca de sensível exige autorização', async () => {
    const a = await s.memory.add({ kind: 'fact', content: 'O dono mora em Natal.', tags: [], importance: 0.5, source: 'u', sensitive: false, expiresAt: new Date(Date.now() + 1e9).toISOString() });
    const r = await run('memory_update', { id: a.id, content: 'O dono mora em Fortaleza.', expiresAt: null, tags: ['casa'] }, svc);
    expect(r.json.situacao).toBe('alterada');
    const now = (await s.memory.get(a.id))!;
    expect(now.content).toBe('O dono mora em Fortaleza.');
    expect(now.expiresAt).toBeUndefined();
    expect(now.tags).toEqual(['casa']);
    const sens = await s.memory.add({ kind: 'fact', content: 'Info sigilosa do dono.', tags: [], importance: 0.5, source: 'u', sensitive: true });
    const denied = await run('memory_update', { id: sens.id, sensitive: false }, svc, { approve: false });
    expect(denied.ctx.confirms).toEqual(['Deixar de tratar como sensível']);
    expect((await s.memory.get(sens.id))!.sensitive).toBe(true);
    // conteúdo que vira sensível é marcado automaticamente (com autorização)
    const r3 = await run('memory_update', { id: a.id, content: 'O CPF do dono é 529.982.247-25.' }, svc, { approve: true });
    expect(r3.ctx.confirms).toEqual(['Guardar informação sensível']);
    expect((await s.memory.get(a.id))!.sensitive).toBe(true);
    const missing = await run('memory_update', { id: 'mem_nao_existe', content: 'x' }, svc);
    expect(missing.out.isError).toBe(true);
  });

  it('memory_delete apaga e informa quando não existe', async () => {
    const a = await s.memory.add({ kind: 'fact', content: 'Esquecer isto.', tags: [], importance: 0.5, source: 'u', sensitive: false });
    const r = await run('memory_delete', { id: a.id }, svc);
    expect(r.json).toEqual({ situacao: 'apagada', id: a.id });
    expect(await s.memory.get(a.id)).toBeNull();
    expect(svc.emitted).toContainEqual({ type: 'memory_changed' });
    const again = await run('memory_delete', { id: a.id }, svc);
    expect(again.out.isError).toBe(true);
    expect(text(again.out)).toMatch(/não encontrada/);
  });

  it('memory_export grava JSON em Documentos/300/exportacoes sem sensíveis por padrão', async () => {
    await s.memory.add({ kind: 'fact', content: 'Normal.', tags: [], importance: 0.5, source: 'u', sensitive: false });
    await s.memory.add({ kind: 'fact', content: 'Sigilo absoluto.', tags: [], importance: 0.5, source: 'u', sensitive: true });
    const r = await run('memory_export', {}, svc);
    const dir = join(t.dir, 'Documentos', '300', 'exportacoes');
    expect(r.json.caminho.startsWith(dir)).toBe(true);
    expect(r.json.memorias).toBe(1);
    expect(r.json.sensiveisDeFora).toBe(1);
    const data = JSON.parse(readFileSync(r.json.caminho, 'utf8'));
    expect(data.version).toBe(1);
    expect(data.items.map((i: { content: string }) => i.content)).toEqual(['Normal.']);
    expect(readFileSync(r.json.caminho, 'utf8')).not.toContain('Sigilo');
    const denied = await run('memory_export', { includeSensitive: true }, svc, { approve: false });
    expect(text(denied.out)).toMatch(/não autorizou/);
    const full = await run('memory_export', { includeSensitive: true }, svc, { approve: true });
    expect(full.json.memorias).toBe(2);
    expect(full.json.caminho).not.toBe(r.json.caminho);
    expect(readdirSync(dir)).toHaveLength(2);
    expect(tool('memory_export').available!(svc)).toBe(true);
  });

  it('conversation_search devolve trechos marcados como não confiáveis (o motor embrulha e marca a tarefa)', async () => {
    await s.conversations.append('c1', { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Falei do portão azul da casa da praia.' }], createdAt: new Date().toISOString() });
    const r = await run('conversation_search', { query: 'portao azul' }, svc);
    // Antes: embrulhava sozinho e não marcava untrusted (a tarefa não ficava "contaminada").
    expect(r.out.untrusted).toEqual({ source: 'conversas anteriores do 300' });
    expect(text(r.out)).not.toContain('<conteudo_externo'); // sem envelope duplo
    expect(r.json.trechos).toHaveLength(1);
    expect(r.json.trechos[0]).toMatchObject({ conversa: 'c1', mensagem: 'm1' });
    expect(r.json.trechos[0].trecho).toContain('«');
    expect(r.out.summary).toBe('1 trecho encontrado');
    const none = await run('conversation_search', { query: 'xilofone' }, svc);
    expect(text(none.out)).toMatch(/Nenhum trecho/);
  });

  it('conversation_search esconde trechos sensíveis do histórico sem autorização do dono', async () => {
    const now = new Date().toISOString();
    await s.conversations.append('c2', { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Anota: a senha do banco é abacate123.' }], createdAt: now });
    await s.conversations.append('c2', { id: 'm2', role: 'user', parts: [{ type: 'text', text: 'O banco da praça foi pintado de azul.' }], createdAt: now });
    await s.conversations.append('c2', { id: 'm3', role: 'user', parts: [{ type: 'text', text: 'O banco me mandou a chave sk-proj-abcdefghijklmnopqrstuvwxyz0123 por engano.' }], createdAt: now });
    const r = await run('conversation_search', { query: 'banco' }, svc);
    const out = text(r.out);
    expect(out).not.toContain('abacate123');
    expect(out).not.toContain('sk-proj-abcdefghijklmnop');
    expect(out).toContain('pintado');
    expect(r.json.ocultos).toBeGreaterThanOrEqual(1);
    expect(r.out.summary).toMatch(/oculto/);
    expect(r.ctx.confirms).toEqual([]);
    const denied = await run('conversation_search', { query: 'banco', includeSensitive: true }, svc, { approve: false });
    expect(denied.ctx.confirms).toEqual(['Ver trechos sensíveis de conversas']);
    expect(text(denied.out)).not.toContain('abacate123');
    const allowed = await run('conversation_search', { query: 'banco', includeSensitive: true }, svc, { approve: true });
    expect(text(allowed.out)).toContain('abacate123');
  });

  it('memory_save: o oposto de uma memória existente não é tratado como "já existia"', async () => {
    await run('memory_save', { content: 'O dono prefere café sem açúcar.', kind: 'preference' }, svc);
    const r = await run('memory_save', { content: 'O dono prefere café com açúcar.', kind: 'preference' }, svc);
    expect(r.json.situacao).toBe('guardada');
    expect((await s.memory.list()).map((m) => m.content).sort()).toEqual(['O dono prefere café com açúcar.', 'O dono prefere café sem açúcar.']);
  });

  it('memory_save de conteúdo sensível não envia o texto ao provedor de embeddings', async () => {
    s.dispose();
    db.close();
    db = openDatabase({ path: join(t.dir, 'emb.db'), key: 'k' });
    const emb = new FakeEmbeddings();
    s = createStores(db, { embeddings: emb });
    svc = makeServices(s, { documents: join(t.dir, 'Documentos') });
    await s.memory.add({ kind: 'fact', content: 'O dono tem um cão.', tags: [], importance: 0.5, source: 'u', sensitive: false });
    await s.memory.whenEmbeddingsIdle();
    emb.textsSeen = [];
    const secret = 'O dono guarda o documento da casa no cofre do quarto.';
    const r = await run('memory_save', { content: secret, sensitive: true }, svc, { approve: true });
    expect(r.json.situacao).toBe('guardada');
    await s.memory.whenEmbeddingsIdle();
    expect(emb.textsSeen).not.toContain(secret);
  });

  it('confirmações que revelam dados sensíveis sempre chegam ao dono (a política não aprova sozinha)', async () => {
    // Pior caso: escritas aprovadas automaticamente e "não perguntar de novo" já escolhido para tudo.
    await svc.settings.update({ permissions: { autoApproveWrites: true } });
    const policy = new DefaultPermissionPolicy(svc.settings);
    for (const name of ['memory_search', 'conversation_search', 'memory_export', 'memory_update', 'memory_save']) {
      policy.rememberForSession(name, 'read');
      policy.rememberForSession(name, 'write');
    }
    const secret = await s.memory.add({ kind: 'fact', content: 'O cofre de Belém abre com 4321.', tags: [], importance: 0.7, source: 'u', sensitive: true });
    await s.conversations.append('c3', { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'Anota: a senha do cofre de Belém é 4321.' }], createdAt: new Date().toISOString() });
    const deny = { approve: false, policy };

    const search = await run('memory_search', { query: 'cofre belem', includeSensitive: true }, svc, deny);
    expect(search.ctx.autoApproved).toEqual([]); // antes: risco 'read' = liberado sem perguntar
    expect(search.ctx.confirms).toEqual(['Consultar memórias sensíveis']);
    expect(text(search.out)).not.toContain('4321');

    const conv = await run('conversation_search', { query: 'cofre belem', includeSensitive: true }, svc, deny);
    expect(conv.ctx.autoApproved).toEqual([]);
    expect(text(conv.out)).not.toContain('4321');

    const exp = await run('memory_export', { includeSensitive: true }, svc, deny);
    expect(exp.ctx.autoApproved).toEqual([]); // antes: risco 'write' = aprovado sozinho
    expect(text(exp.out)).toMatch(/não autorizou/);

    const upd = await run('memory_update', { id: secret.id, sensitive: false }, svc, deny);
    expect(upd.ctx.autoApproved).toEqual([]);
    expect((await s.memory.get(secret.id))!.sensitive).toBe(true);

    for (const r of [search, conv, exp, upd]) expect(r.ctx.risks).toEqual(['external']);
  });

  it('esquemas recusam entradas inválidas', () => {
    expect(tool('memory_save').inputSchema.safeParse({}).success).toBe(false);
    expect(tool('memory_save').inputSchema.safeParse({ content: 'x', kind: 'senha' }).success).toBe(false);
    expect(tool('memory_save').inputSchema.safeParse({ content: 'x', expiresAt: 'amanhã' }).success).toBe(false);
    expect(tool('memory_search').inputSchema.safeParse({ query: 'x', limit: 500 }).success).toBe(false);
    expect(tool('task_create').inputSchema.safeParse({ title: 'x', dueAt: '31/12/2026' }).success).toBe(false);
  });
});

describe('ferramentas do planejador', () => {
  let db: AppDatabase;
  let s: Stores;
  let svc: TestServices;
  beforeEach(() => {
    db = openDatabase({ path: ':memory:' });
    s = createStores(db);
    svc = makeServices(s);
  });
  afterEach(() => {
    s.dispose();
    db.close();
  });

  it('cria, lista, altera, conclui e apaga', async () => {
    const c1 = await run('task_create', { title: 'Comprar ração', priority: 'alta', dueAt: '2026-11-04' }, svc);
    expect(c1.json.situacao).toBe('criada');
    const id1 = c1.json.tarefa.id as string;
    const c2 = await run('task_create', { title: 'Revisar contrato', project: 'Trabalho', notes: 'cláusula 4' }, svc);
    const id2 = c2.json.tarefa.id as string;
    expect(svc.emitted.filter((e) => e.type === 'tasks_changed')).toHaveLength(2);

    let l = await run('task_list', {}, svc);
    expect(l.json.total).toBe(2);
    expect(l.json.tarefas[0].id).toBe(id1); // tem prazo: vem antes

    const u = await run('task_update', { id: id2, status: 'em_andamento', notes: null, dueAt: '2026-11-20T10:00:00-03:00' }, svc);
    expect(u.json.tarefa).toMatchObject({ status: 'em_andamento', dueAt: '2026-11-20T13:00:00.000Z' });
    expect(u.json.tarefa.notes).toBeUndefined();
    l = await run('task_list', { status: 'abertas' }, svc);
    expect(l.json.tarefas.map((x: { id: string }) => x.id)).toEqual([id2, id1]);

    const done = await run('task_complete', { id: id1 }, svc);
    expect(done.json.tarefa.status).toBe('concluida');
    expect(done.json.tarefa.completedAt).toBeDefined();
    l = await run('task_list', {}, svc);
    expect(l.json.tarefas.map((x: { id: string }) => x.id)).toEqual([id2]);
    l = await run('task_list', { status: 'todas' }, svc);
    expect(l.json.total).toBe(2);
    l = await run('task_list', { status: 'concluida' }, svc);
    expect(l.json.tarefas.map((x: { id: string }) => x.id)).toEqual([id1]);
    l = await run('task_list', { status: 'todas', project: 'trabalho' }, svc);
    expect(l.json.total).toBe(1);

    const del = await run('task_delete', { id: id1 }, svc);
    expect(del.out.summary).toBe('Tarefa apagada: Comprar ração');
    expect((await s.tasks.list()).map((x) => x.id)).toEqual([id2]);
    const miss = await run('task_complete', { id: id1 }, svc);
    expect(miss.out.isError).toBe(true);
    const miss2 = await run('task_delete', { id: id1 }, svc);
    expect(miss2.out.isError).toBe(true);
    const nothing = await run('task_update', { id: id2 }, svc);
    expect(text(nothing.out)).toMatch(/Nada para alterar/);
  });
});
