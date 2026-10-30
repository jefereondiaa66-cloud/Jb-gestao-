#!/usr/bin/env node
// Traz para o repositório uma versão publicada no Claude (por exemplo, feita
// pelo editor por IA de dentro do sistema). Recebe a página baixada do
// artifact "JB Gestão", tira o envelope e grava app/jb-gestao.html.
// Depois: node scripts/verificar.mjs, revisar o diff e fazer o commit.
//
// Uso: node scripts/do-claude.mjs <pagina-baixada.html>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, extrairDoClaude, sha256 } from './construir.mjs';

const origem = process.argv[2];
if (!origem) { console.error('uso: node scripts/do-claude.mjs <pagina-baixada.html>'); process.exit(2); }
const novo = extrairDoClaude(readFileSync(origem, 'utf8'));
const destino = join(RAIZ, 'app/jb-gestao.html');
const atual = readFileSync(destino, 'utf8');
if (novo === atual) { console.log('O programa no Claude é igual ao do repositório. Nada a fazer.'); process.exit(0); }
if (!novo.includes('<script id="jb-core-ponte">'))
  console.warn('ATENÇÃO: a versão do Claude não tem a ponte do JB CORE. Publicada assim, ela volta a gravar só no banco do Claude.');
writeFileSync(destino, novo);
console.log(`app/jb-gestao.html atualizado: ${sha256(atual).slice(0, 12)} → ${sha256(novo).slice(0, 12)} (${atual.length} → ${novo.length} caracteres)`);
