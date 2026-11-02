/**
 * Ferramentas que alteram arquivos: criar/escrever, criar pasta, mover,
 * copiar, renomear, apagar (sempre para a lixeira) e abrir com o programa padrão.
 */
import { appendFile, cp, lstat, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import nodePath from 'node:path';
import { z } from 'zod';
import type { EngineServices, RiskLevel, ToolContext, ToolDefinition, ToolOutput } from '../../types';
import { PATH_HINT, SecurityError, guardFor, isExecutablePath, isRootPath, resolveUserPath } from './guard';
import { ownFiles } from './own-files';
import { failure } from './tools-read';
import { errorOutput, formatBytes, plural, preview, textOutput } from './util';

const pm = (services: EngineServices): typeof nodePath.posix => (services.platform.os === 'windows' ? nodePath.win32 : nodePath.posix);

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** Nome de arquivo válido no Windows (vale para todos os sistemas, para não criar nomes que o Windows não abre). */
export function validateFileName(name: string): string | null {
  const n = String(name ?? '');
  if (!n.trim()) return 'o nome está vazio.';
  if (n.length > 255) return 'o nome é longo demais (máximo 255 caracteres).';
  if (n === '.' || n === '..') return 'nome inválido.';
  if (/[\\/]/.test(n)) return 'o nome não pode conter barras (use só o nome, sem pasta).';
  if (/[<>:"|?*\u0000-\u001f]/.test(n)) return 'o nome não pode conter < > : " | ? * nem caracteres de controle.';
  if (/[ .]$/.test(n)) return 'o nome não pode terminar com ponto ou espaço.';
  if (/^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i.test(n)) return 'esse nome é reservado pelo Windows.';
  return null;
}

/** Garante a pasta de destino dentro das pastas liberadas e devolve o caminho final validado para escrita. */
async function prepareTarget(services: EngineServices, target: string): Promise<string> {
  const path = pm(services);
  const dir = path.dirname(target);
  if (!(await exists(dir))) await mkdir(dir, { recursive: true });
  return guardFor(services).resolve(target, { forWrite: true });
}

/** Põe o destino antigo na lixeira antes de sobrescrever (para poder desfazer). */
async function trashBeforeOverwrite(services: EngineServices, target: string, ctx: ToolContext): Promise<string> {
  if (!(await exists(target))) return '';
  const st = await lstat(target);
  if (st.isDirectory()) throw new SecurityError('o destino é uma pasta que já existe; não substituo pastas inteiras.');
  if (services.platform.trashItem) {
    await services.platform.trashItem(target);
    ownFiles(services).forget(target);
    return ' (a versão antiga foi para a lixeira)';
  }
  ctx.log('lixeira indisponível: o arquivo antigo será substituído sem cópia');
  await rm(target, { force: true });
  return ' (a versão antiga foi substituída)';
}

/* ======================================================================
 * file_write
 * ==================================================================== */
const writeSchema = z.object({
  caminho: z.string().min(1).max(2000).describe(`Arquivo a criar/escrever. ${PATH_HINT} Pastas que faltarem são criadas.`),
  conteudo: z.string().max(2_000_000).describe('Texto a gravar (UTF-8).'),
  modo: z
    .enum(['criar', 'sobrescrever', 'acrescentar'])
    .optional()
    .describe('"criar" (padrão): só cria arquivo novo e falha se já existir. "sobrescrever": substitui um arquivo existente (o antigo vai para a lixeira; exige confirmação). "acrescentar": adiciona ao final.'),
});
type WriteInput = z.infer<typeof writeSchema>;

export function fileWriteRisk(i: WriteInput): RiskLevel {
  if (isExecutablePath(i.caminho)) return 'system'; // criar script/programa executável
  return i.modo === 'sobrescrever' ? 'destructive' : 'write';
}

export const fileWriteTool: ToolDefinition<WriteInput> = {
  name: 'file_write',
  title: 'Escrever arquivo',
  description:
    'Cria um arquivo de texto (txt, md, csv, json, código...) numa pasta liberada. Por padrão nunca substitui um arquivo existente; ' +
    'para substituir use modo "sobrescrever" (o antigo vai para a lixeira e o dono precisa confirmar). Para Word/Excel/PDF use create_docx/create_xlsx/create_pdf.',
  inputSchema: writeSchema,
  risk: fileWriteRisk,
  describe: (i) => {
    const size = `${plural(i.conteudo.length, 'caractere', 'caracteres')}`;
    if (i.modo === 'sobrescrever') return `SUBSTITUIR o conteúdo do arquivo ${preview(i.caminho, 140)} (${size})`;
    if (i.modo === 'acrescentar') return `Acrescentar texto ao final de ${preview(i.caminho, 140)} (${size})`;
    return `Criar o arquivo ${preview(i.caminho, 140)} (${size})`;
  },
  async execute(input, ctx) {
    const services = ctx.services;
    try {
      const target = resolveUserPath(services, input.caminho);
      const path = pm(services);
      const name = path.basename(target);
      const bad = validateFileName(name);
      if (bad) return errorOutput(`Nome de arquivo inválido: ${bad}`);
      const final = await prepareTarget(services, target);
      const ledger = ownFiles(services);
      const isCsv = /\.csv$/i.test(name);
      const data = isCsv && !input.conteudo.startsWith('﻿') ? '﻿' + input.conteudo : input.conteudo; // Excel reconhece UTF-8 com BOM
      const mode = input.modo ?? 'criar';
      let note = '';
      if (mode === 'criar') {
        if (await exists(final)) {
          return errorOutput(`Já existe um arquivo em ${final}. Não substituo sem pedido: use outro nome ou modo "sobrescrever" (o dono confirma).`);
        }
        await writeFile(final, data, { encoding: 'utf8', flag: 'wx' });
        ledger.record(final);
      } else if (mode === 'sobrescrever') {
        note = await trashBeforeOverwrite(services, final, ctx);
        await writeFile(final, data, { encoding: 'utf8', flag: 'wx' });
        ledger.record(final);
      } else {
        const wasOwn = ledger.isOwn(final);
        const existed = await exists(final);
        if (existed && (await lstat(final)).isDirectory()) return errorOutput('O caminho é uma pasta, não um arquivo.');
        await appendFile(final, existed ? input.conteudo : data, 'utf8');
        if (wasOwn || !existed) ledger.record(final);
      }
      const st = await stat(final);
      const verb = mode === 'criar' ? 'Arquivo criado' : mode === 'sobrescrever' ? 'Arquivo substituído' : 'Texto acrescentado';
      return textOutput(`${verb}: ${final} (${formatBytes(st.size)})${note}.`, `${verb}: ${name}`);
    } catch (err) {
      return failure('Não consegui gravar o arquivo', err);
    }
  },
};

/* ======================================================================
 * folder_create
 * ==================================================================== */
const folderSchema = z.object({
  caminho: z.string().min(1).max(2000).describe(`Pasta a criar (pastas intermediárias também são criadas). ${PATH_HINT}`),
});

export const folderCreateTool: ToolDefinition<z.infer<typeof folderSchema>> = {
  name: 'folder_create',
  title: 'Criar pasta',
  description: 'Cria uma pasta (e as intermediárias que faltarem) dentro das pastas liberadas.',
  inputSchema: folderSchema,
  risk: 'write',
  describe: (i) => `Criar a pasta ${preview(i.caminho, 150)}`,
  async execute(input, ctx) {
    const services = ctx.services;
    try {
      const target = resolveUserPath(services, input.caminho);
      const bad = validateFileName(pm(services).basename(target));
      if (bad) return errorOutput(`Nome de pasta inválido: ${bad}`);
      if (await exists(target)) {
        const st = await stat(target);
        return st.isDirectory() ? textOutput(`A pasta já existia: ${target}.`, 'Pasta já existia') : errorOutput(`Já existe um arquivo com esse nome: ${target}.`);
      }
      await mkdir(target, { recursive: true });
      guardFor(services).resolve(target, { mustExist: true }); // confere de novo depois de criar
      return textOutput(`Pasta criada: ${target}.`, `Pasta criada: ${pm(services).basename(target)}`);
    } catch (err) {
      return failure('Não consegui criar a pasta', err);
    }
  },
};

/* ======================================================================
 * file_move / file_copy / file_rename
 * ==================================================================== */
const moveSchema = z.object({
  origem: z.string().min(1).max(2000).describe(`Arquivo ou pasta a mover. ${PATH_HINT}`),
  destino: z.string().min(1).max(2000).describe('Novo caminho completo, ou uma pasta existente (o item vai para dentro dela).'),
  sobrescrever: z.boolean().optional().describe('Substituir se já existir um arquivo no destino (o antigo vai para a lixeira; exige confirmação). Padrão: não.'),
});
type MoveInput = z.infer<typeof moveSchema>;

const copySchema = z.object({
  origem: z.string().min(1).max(2000).describe(`Arquivo ou pasta a copiar. ${PATH_HINT}`),
  destino: z.string().min(1).max(2000).describe('Caminho completo da cópia, ou uma pasta existente (a cópia vai para dentro dela).'),
  sobrescrever: z.boolean().optional().describe('Substituir se já existir um arquivo no destino (o antigo vai para a lixeira; exige confirmação). Padrão: não.'),
});

const renameSchema = z.object({
  caminho: z.string().min(1).max(2000).describe(`Arquivo ou pasta a renomear. ${PATH_HINT}`),
  novoNome: z.string().min(1).max(255).describe('Só o novo nome (sem pasta), ex.: "Relatório final.docx".'),
  sobrescrever: z.boolean().optional().describe('Substituir se já existir um item com esse nome (o antigo vai para a lixeira; exige confirmação). Padrão: não.'),
});
type RenameInput = z.infer<typeof renameSchema>;

/** Resolve o destino: pasta existente => dentro dela com o mesmo nome. */
async function resolveDestination(services: EngineServices, src: string, destino: string): Promise<string> {
  const path = pm(services);
  let dest = resolveUserPath(services, destino);
  if (await exists(dest)) {
    const st = await stat(dest);
    if (st.isDirectory()) dest = resolveUserPath(services, path.join(dest, path.basename(src)));
  }
  return dest;
}

function isInside(services: EngineServices, child: string, parent: string): boolean {
  const path = pm(services);
  const norm = (s: string): string => (services.platform.os === 'windows' ? path.normalize(s).toLowerCase() : path.normalize(s));
  const c = norm(child);
  const p = norm(parent).replace(/[\\/]+$/, '');
  return c === p || c.startsWith(p + path.sep);
}

/** Pasta a copiar: confere tamanho total e se não há locais protegidos dentro. */
async function inspectTree(services: EngineServices, dir: string, limits = { files: 20000, bytes: 4 * 1024 ** 3 }): Promise<{ files: number; bytes: number }> {
  const guard = guardFor(services);
  const path = pm(services);
  let files = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    if (!guard.isAllowed(cur)) throw new SecurityError(`a pasta contém um local protegido (${cur}); não copio isso.`);
    for (const e of await readdir(cur, { withFileTypes: true })) {
      const full = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile()) {
        files++;
        bytes += (await stat(full)).size;
      }
      if (files > limits.files) throw new SecurityError(`a pasta tem arquivos demais para copiar de uma vez (mais de ${limits.files.toLocaleString('pt-BR')}).`);
      if (bytes > limits.bytes) throw new SecurityError(`a pasta é grande demais para copiar de uma vez (mais de ${formatBytes(limits.bytes)}).`);
    }
  }
  return { files, bytes };
}

async function moveItem(services: EngineServices, src: string, dest: string, overwrite: boolean, ctx: ToolContext): Promise<string> {
  if (isRootPath(services, src)) throw new SecurityError('não movo uma das pastas principais liberadas.');
  if (isInside(services, dest, src) && isInside(services, src, dest)) throw new SecurityError('a origem e o destino são o mesmo lugar.');
  if (isInside(services, dest, src)) throw new SecurityError('não dá para mover uma pasta para dentro dela mesma.');
  let note = '';
  if (await exists(dest)) {
    if (!overwrite) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
    note = await trashBeforeOverwrite(services, dest, ctx);
  }
  const final = await prepareTarget(services, dest);
  try {
    await rename(src, final);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    // Discos diferentes: copia e só então remove a origem.
    const st = await stat(src);
    if (st.isDirectory()) await inspectTree(services, src);
    await cp(src, final, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
    await rm(src, { recursive: true, force: false });
  }
  ownFiles(services).moved(src, final);
  return note;
}

export const fileMoveTool: ToolDefinition<MoveInput> = {
  name: 'file_move',
  title: 'Mover arquivo',
  description: 'Move um arquivo ou pasta para outro lugar dentro das pastas liberadas. Não substitui nada sem "sobrescrever".',
  inputSchema: moveSchema,
  risk: (i) => (i.sobrescrever ? 'destructive' : 'write'),
  describe: (i) => `Mover ${preview(i.origem, 110)} para ${preview(i.destino, 110)}${i.sobrescrever ? ' (SUBSTITUINDO o que existir lá)' : ''}`,
  async execute(input, ctx) {
    const services = ctx.services;
    try {
      const src = resolveUserPath(services, input.origem, { mustExist: true });
      const dest = await resolveDestination(services, src, input.destino);
      const bad = validateFileName(pm(services).basename(dest));
      if (bad) return errorOutput(`Nome de destino inválido: ${bad}`);
      const note = await moveItem(services, src, dest, !!input.sobrescrever, ctx);
      return textOutput(`Movido: ${src} → ${dest}${note}.`, `Movido: ${pm(services).basename(dest)}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return errorOutput('Já existe um item com esse nome no destino. Escolha outro nome ou use "sobrescrever" (o dono confirma).');
      return failure('Não consegui mover', err);
    }
  },
};

export const fileCopyTool: ToolDefinition<z.infer<typeof copySchema>> = {
  name: 'file_copy',
  title: 'Copiar arquivo',
  description: 'Copia um arquivo ou pasta (com tudo dentro) para outro lugar dentro das pastas liberadas. Não substitui nada sem "sobrescrever".',
  inputSchema: copySchema,
  risk: (i) => (i.sobrescrever ? 'destructive' : 'write'),
  describe: (i) => `Copiar ${preview(i.origem, 110)} para ${preview(i.destino, 110)}${i.sobrescrever ? ' (SUBSTITUINDO o que existir lá)' : ''}`,
  async execute(input, ctx) {
    const services = ctx.services;
    try {
      const src = resolveUserPath(services, input.origem, { mustExist: true });
      const dest = await resolveDestination(services, src, input.destino);
      const path = pm(services);
      const bad = validateFileName(path.basename(dest));
      if (bad) return errorOutput(`Nome de destino inválido: ${bad}`);
      if (isInside(services, dest, src)) return errorOutput('Não dá para copiar uma pasta para dentro dela mesma.');
      const st = await stat(src);
      let detail = '';
      if (st.isDirectory()) {
        const t = await inspectTree(services, src);
        detail = ` (${plural(t.files, 'arquivo', 'arquivos')}, ${formatBytes(t.bytes)})`;
      }
      let note = '';
      if (await exists(dest)) {
        if (!input.sobrescrever) return errorOutput('Já existe um item com esse nome no destino. Escolha outro nome ou use "sobrescrever" (o dono confirma).');
        note = await trashBeforeOverwrite(services, dest, ctx);
      }
      const final = await prepareTarget(services, dest);
      await cp(src, final, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true, dereference: false });
      return textOutput(`Copiado: ${src} → ${final}${detail}${note}.`, `Copiado: ${path.basename(final)}`);
    } catch (err) {
      return failure('Não consegui copiar', err);
    }
  },
};

export function renameRisk(i: RenameInput): RiskLevel {
  if (isExecutablePath(i.novoNome) && !isExecutablePath(i.caminho)) return 'system'; // virar executável
  return i.sobrescrever ? 'destructive' : 'write';
}

export const fileRenameTool: ToolDefinition<RenameInput> = {
  name: 'file_rename',
  title: 'Renomear arquivo',
  description: 'Renomeia um arquivo ou pasta (fica na mesma pasta). Não substitui nada sem "sobrescrever".',
  inputSchema: renameSchema,
  risk: renameRisk,
  describe: (i) => `Renomear ${preview(i.caminho, 120)} para "${preview(i.novoNome, 80)}"${i.sobrescrever ? ' (SUBSTITUINDO o que existir com esse nome)' : ''}`,
  async execute(input, ctx) {
    const services = ctx.services;
    try {
      const bad = validateFileName(input.novoNome);
      if (bad) return errorOutput(`Nome inválido: ${bad}`);
      const src = resolveUserPath(services, input.caminho, { mustExist: true });
      const path = pm(services);
      const dest = resolveUserPath(services, path.join(path.dirname(src), input.novoNome));
      if (path.basename(src) === input.novoNome) return textOutput('O item já tem esse nome.', 'Nada a renomear');
      const sameIgnoringCase = services.platform.os !== 'linux' && path.basename(src).toLowerCase() === input.novoNome.toLowerCase();
      let note = '';
      if (sameIgnoringCase) {
        // Só muda maiúsculas/minúsculas (Windows/macOS): é o mesmo item, renomeia direto.
        await rename(src, dest);
        ownFiles(services).moved(src, dest);
      } else {
        note = await moveItem(services, src, dest, !!input.sobrescrever, ctx);
      }
      return textOutput(`Renomeado: ${src} → ${dest}${note}.`, `Renomeado para ${input.novoNome}`);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return errorOutput('Já existe um item com esse nome. Escolha outro ou use "sobrescrever" (o dono confirma).');
      return failure('Não consegui renomear', err);
    }
  },
};

/* ======================================================================
 * file_delete (sempre para a lixeira)
 * ==================================================================== */
const deleteSchema = z.object({
  caminho: z.string().min(1).max(2000).describe(`Arquivo ou pasta a apagar (vai para a lixeira, dá para recuperar). ${PATH_HINT}`),
});

export const fileDeleteTool: ToolDefinition<z.infer<typeof deleteSchema>> = {
  name: 'file_delete',
  title: 'Apagar (lixeira)',
  description: 'Apaga um arquivo ou pasta movendo para a LIXEIRA do sistema (o dono pode recuperar). Nunca apaga definitivamente. Sempre exige confirmação.',
  inputSchema: deleteSchema,
  risk: 'destructive',
  available: (services) => typeof services.platform.trashItem === 'function',
  describe: (i) => `Mover para a lixeira: ${preview(i.caminho, 160)}`,
  async execute(input, ctx): Promise<ToolOutput> {
    const services = ctx.services;
    const trash = services.platform.trashItem;
    if (typeof trash !== 'function') return errorOutput('A lixeira não está disponível neste sistema; por segurança não apago nada definitivamente.');
    try {
      const target = resolveUserPath(services, input.caminho, { mustExist: true });
      if (isRootPath(services, target)) return errorOutput('Não apago uma das pastas principais liberadas (Documentos, Área de Trabalho...).');
      const st = await lstat(target);
      let detail = '';
      if (st.isDirectory()) {
        let count = 0;
        try {
          count = (await readdir(target)).length;
        } catch {
          /* ignora */
        }
        detail = ` (pasta com ${plural(count, 'item', 'itens')})`;
      } else detail = ` (${formatBytes(st.size)})`;
      await trash.call(services.platform, target);
      ownFiles(services).forget(target);
      return textOutput(`Movido para a lixeira: ${target}${detail}. Dá para recuperar pela Lixeira.`, `Para a lixeira: ${pm(services).basename(target)}`);
    } catch (err) {
      return failure('Não consegui mover para a lixeira', err);
    }
  },
};

/* ======================================================================
 * open_path
 * ==================================================================== */
const openSchema = z.object({
  caminho: z.string().min(1).max(2000).describe(`Arquivo ou pasta a abrir com o programa padrão (pastas abrem no Explorador). ${PATH_HINT}`),
});

export const openPathTool: ToolDefinition<z.infer<typeof openSchema>> = {
  name: 'open_path',
  title: 'Abrir arquivo ou pasta',
  description:
    'Abre um arquivo com o programa padrão do Windows (PDF no leitor, .docx no Word...) ou uma pasta no Explorador. ' +
    'Abrir programas, scripts e atalhos (.exe, .bat, .ps1, .lnk, .msi...) é tratado como execução e sempre pede confirmação.',
  inputSchema: openSchema,
  risk: (i) => (isExecutablePath(i.caminho) ? 'system' : 'read'),
  describe: (i) => (isExecutablePath(i.caminho) ? `EXECUTAR o programa/script ${preview(i.caminho, 150)}` : `Abrir ${preview(i.caminho, 160)}`),
  async execute(input, ctx) {
    const services = ctx.services;
    try {
      const target = resolveUserPath(services, input.caminho, { mustExist: true });
      // O caminho real (depois de seguir links) pode ser um executável mesmo que o pedido não pareça.
      if (isExecutablePath(target) && !isExecutablePath(input.caminho)) {
        const ok = await ctx.confirm('Executar programa', `O caminho pedido leva a um programa/script: ${target}. Abrir (executar) mesmo assim?`, 'system');
        if (!ok) return errorOutput('O dono não autorizou executar esse programa.');
      }
      const res = await services.platform.openPath(target);
      if (res) return errorOutput(`O sistema não conseguiu abrir: ${res}`);
      return textOutput(`Aberto: ${target}.`, `Aberto: ${pm(services).basename(target)}`);
    } catch (err) {
      return failure('Não consegui abrir', err);
    }
  },
};
