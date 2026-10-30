#!/usr/bin/env node
// Gera os dois envelopes do MESMO programa (app/jb-gestao.html):
//   dist/              site da nuvem; é a pasta que o Netlify publica
//   saida/claude.html  página para publicar no artifact "JB Gestão" do Claude
// O programa não é alterado: a nuvem só recebe nuvem/cabecalho.html no <head>,
// e o Claude só recebe o envelope padrão de artifact.
//
// Uso: node scripts/construir.mjs [pasta-de-saida]   (padrão: a raiz do repositório)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
export const VIEWPORT = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n';
// envelope que o Claude usa para publicar um artifact (igual ao da ferramenta de publicação)
export const ENVELOPE_CLAUDE = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>';
export const FIM_CLAUDE = '</body></html>';
const ARQUIVOS_NUVEM = ['jb-nuvem.js', 'admin.html', 'manifest.webmanifest', 'icone.svg', '_headers'];

export const sha256 = (t) => createHash('sha256').update(t).digest('hex');

export function montarNuvem(app, cabecalho) {
  const i = app.indexOf(VIEWPORT);
  if (i < 0 || i > 400) throw new Error('app/jb-gestao.html: não achei a linha do viewport no início do <head>');
  return app.slice(0, i + VIEWPORT.length) + cabecalho + app.slice(i + VIEWPORT.length);
}
export function montarClaude(app) { return ENVELOPE_CLAUDE + '\n' + app + FIM_CLAUDE; }
// caminho inverso: tira o envelope de uma página baixada do artifact
export function extrairDoClaude(pagina) {
  if (!pagina.startsWith(ENVELOPE_CLAUDE + '\n') || !pagina.endsWith(FIM_CLAUDE)) throw new Error('a página não tem o envelope de artifact esperado');
  return pagina.slice(ENVELOPE_CLAUDE.length + 1, -FIM_CLAUDE.length);
}

function commitAtual() {
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF; // definido pelo Netlify durante a construção
  try { return execSync('git rev-parse HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

export function construir(saida = RAIZ) {
  const app = readFileSync(join(RAIZ, 'app/jb-gestao.html'), 'utf8');
  const cab = readFileSync(join(RAIZ, 'nuvem/cabecalho.html'), 'utf8');
  const dist = join(saida, 'dist'), sai = join(saida, 'saida');
  rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true }); mkdirSync(sai, { recursive: true });

  const nuvem = montarNuvem(app, cab);
  writeFileSync(join(dist, 'index.html'), nuvem);
  for (const f of ARQUIVOS_NUVEM) copyFileSync(join(RAIZ, 'nuvem', f), join(dist, f));
  const claude = montarClaude(app);
  writeFileSync(join(sai, 'claude.html'), claude);

  const ponte = /var VERSAO = '([^']+)'/.exec(app);
  const versao = {
    versao: sha256(app).slice(0, 12),
    programa_sha256: sha256(app),
    nuvem_sha256: sha256(nuvem),
    claude_sha256: sha256(claude),
    ponte: ponte ? ponte[1] : null,
    commit: commitAtual(),
    construido_em: new Date().toISOString(),
  };
  writeFileSync(join(dist, 'versao.json'), JSON.stringify(versao, null, 1) + '\n');
  writeFileSync(join(sai, 'versao.json'), JSON.stringify(versao, null, 1) + '\n');
  return versao;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const v = construir(process.argv[2] || RAIZ);
  console.log(`construído: versão ${v.versao} (programa ${v.programa_sha256.slice(0, 16)}…, ponte ${v.ponte}, commit ${v.commit || '—'})`);
}
