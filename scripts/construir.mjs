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
const ARQUIVOS_NUVEM = ['jb-nuvem.js', 'admin.html', 'motorista.html', 'motorista.webmanifest', 'manifest.webmanifest', 'icone.svg', 'icone-180.png', 'icone-192.png', 'icone-512.png', 'icone-maskable-512.png', 'entrada-celular.jpg', 'entrada-computador.jpg', '_headers'];

export const sha256 = (t) => createHash('sha256').update(t).digest('hex');
// versão do SITE da nuvem (programa + cabeçalho + arquivos da nuvem). Vai numa <meta> dentro da própria
// página e no versao.json: a página aberta compara a sua com a publicada e avisa quando sai versão nova
// (antes ela comparava com a primeira leitura do versao.json, que pode já ser a nova).
export const metaSite = (site) => `<meta name="jb-site" content="${site}">\n`;

/* 20/11/2026 (desempenho): na nuvem, cada bloco <script> grande do programa vai para um arquivo próprio
   (js/<impressão digital>.js), no mesmo lugar e na mesma ordem. O navegador então compila o programa
   em segundo plano e guarda o código já compilado entre uma abertura e outra: medido num tablet
   simulado, a tela de login passou de ~3,2 s para ~1,6 s e as travadas da abertura de ~1,4 s para ~0,2 s.
   O texto de cada arquivo é exatamente o do bloco (juntarScripts refaz a página e a verificação confere
   que ela é igual à de antes, byte a byte). O Claude continua recebendo a página inteira, num arquivo só. */
export const FORMATO_NUVEM = 'scripts-em-arquivos-1';
const SCRIPT_MIN = 2000;   // blocos pequenos (como a configuração do cabeçalho) ficam na página
export function separarScripts(html) {
  const arquivos = [];
  const pagina = html.replace(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi, (tudo, at, codigo) => {
    at = at || '';
    if (/\b(src|type)\s*=/i.test(at) || codigo.length < SCRIPT_MIN) return tudo;
    /* o navegador terminaria o bloco antes ou leria de outro jeito: não separa (para a construção) */
    if (/<\/script|<!--/i.test(codigo)) throw new Error('bloco <script' + at + '> tem "</script" ou "<!--" dentro: não dá para separar com segurança');
    const nome = 'js/' + sha256(codigo).slice(0, 16) + '.js';
    arquivos.push({ nome, codigo });
    return '<script' + at + ' src="' + nome + '"></script>';
  });
  return { pagina, arquivos };
}
export function juntarScripts(pagina, ler) {
  return pagina.replace(/<script((?:\s[^>]*?)?) src="(js\/[0-9a-f]{16}\.js)"><\/script>/g, (t, at, nome) => '<script' + at + '>' + ler(nome) + '</script>');
}

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
  try { return readFileSync(join(RAIZ, '.jb-commit'), 'utf8').trim(); } catch {}     // pacote enviado pelo publicador (jb-publicar): é o commit exato
  if (process.env.COMMIT_REF) return process.env.COMMIT_REF; // definido pelo Netlify quando constrói a partir do Git
  try { return execSync('git rev-parse HEAD', { cwd: RAIZ, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; }
}

export function construir(saida = RAIZ) {
  const app = readFileSync(join(RAIZ, 'app/jb-gestao.html'), 'utf8');
  const cab = readFileSync(join(RAIZ, 'nuvem/cabecalho.html'), 'utf8');
  const dist = join(saida, 'dist'), sai = join(saida, 'saida');
  rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true }); mkdirSync(sai, { recursive: true });

  const site = sha256(FORMATO_NUVEM + app + cab + ARQUIVOS_NUVEM.map((f) => readFileSync(join(RAIZ, 'nuvem', f), 'utf8')).join('\n')).slice(0, 12);
  const nuvem = montarNuvem(app, metaSite(site) + cab);
  const sep = separarScripts(nuvem);
  mkdirSync(join(dist, 'js'), { recursive: true });
  for (const a of sep.arquivos) writeFileSync(join(dist, a.nome), a.codigo);
  const lidos = new Map(sep.arquivos.map((a) => [a.nome, a.codigo]));
  if (juntarScripts(sep.pagina, (n) => lidos.get(n)) !== nuvem) throw new Error('separar os scripts mudou a página da nuvem');
  writeFileSync(join(dist, 'index.html'), sep.pagina);
  for (const f of ARQUIVOS_NUVEM) {
    /* o painel de administração e a página do motorista (V177) levam a versão do site: a página aberta sabe quando sai versão nova */
    if (f !== 'admin.html' && f !== 'motorista.html') { copyFileSync(join(RAIZ, 'nuvem', f), join(dist, f)); continue; }
    const pg = readFileSync(join(RAIZ, 'nuvem', f), 'utf8');
    if (!pg.includes('<head>\n')) throw new Error('nuvem/' + f + ': não achei o <head>');
    writeFileSync(join(dist, f), pg.replace('<head>\n', '<head>\n' + metaSite(site)));
  }
  const claude = montarClaude(app);
  writeFileSync(join(sai, 'claude.html'), claude);

  const ponte = /var VERSAO = '([^']+)'/.exec(app);
  const versao = {
    versao: sha256(app).slice(0, 12),
    site,
    programa_sha256: sha256(app),
    nuvem_sha256: sha256(nuvem),              // a página inteira (com os scripts dentro), como sempre
    nuvem_arquivos: sep.arquivos.length,       // quantos blocos foram para js/
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
