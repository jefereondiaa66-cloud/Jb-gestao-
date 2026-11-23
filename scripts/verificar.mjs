#!/usr/bin/env node
// Bateria de verificação do JB Gestão. Roda antes de toda publicação
// (Netlify e GitHub Actions): se qualquer item falhar, nada é publicado e
// a versão anterior continua no ar.
//
//   node scripts/verificar.mjs            tudo
//   node scripts/verificar.mjs ponte      só os testes da ponte do Claude
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, cpSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { RAIZ, construir, montarNuvem, montarClaude, extrairDoClaude, metaSite, ENVELOPE_CLAUDE, FIM_CLAUDE, juntarScripts, sha256 } from './construir.mjs';
import { criarServidorFalso } from './lib/servidor-falso.mjs';

const filtro = process.argv[2] || '';
const testes = [];
const teste = (grupo, nome, fn) => testes.push({ grupo, nome, fn });
const ler = (p) => readFileSync(join(RAIZ, p), 'utf8');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(cond, ms = 3000, passo = 10) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (await cond()) return true; await esperar(passo); }
  throw new Error('condição não atingida em ' + ms + ' ms');
}

/* ---------- utilidades de HTML ---------- */
function scriptsEmbutidos(html, nome) {
  const out = [], re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    n++;
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs) || /type\s*=\s*["']?(application\/(ld\+)?json|text\/template)/i.test(attrs)) continue;
    out.push({ nome: `${nome} script #${n}${/id="([^"]+)"/.test(attrs) ? ' (' + /id="([^"]+)"/.exec(attrs)[1] + ')' : ''}`, codigo: m[2] });
  }
  return out;
}
function compilar(codigo, nome) {
  try { new vm.Script(codigo, { filename: nome }); }
  catch (e) { throw new Error(`${nome}: ${e.message}`); }
}
function blocoPonte(html) {
  const m = /<script id="jb-core-ponte">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('bloco jb-core-ponte não encontrado');
  return m[1];
}

/* =====================================================================
   1. O programa
   ===================================================================== */
teste('programa', 'estrutura básica intacta', () => {
  const app = ler('app/jb-gestao.html');
  assert.ok(app.startsWith('<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n'), 'início do documento mudou');
  assert.ok(app.endsWith('</html>\n'), 'fim do documento mudou');
  for (const [marca, n] of [['<script id="spot-guarda">', 1], ['<script id="jb-core-ponte">', 1], ['async function iniciar(){', 1],
    ['APP.pronto=true', 1], ['iniciar().catch(', 1], ['function bancoLocal(){', 1], ['function assinar(){', 1]]) {
    const c = app.split(marca).length - 1;
    assert.equal(c, n, `"${marca}" aparece ${c} vez(es), esperado ${n}`);
  }
});
teste('programa', 'navegação centralizada: só o JBNAV muda de tela', () => {
  // Toda troca de tela passa por JBNAV.ir / JBNAV.subst / JBNAV.voltar (um histórico só, linear).
  // Atribuir location.hash direto ou chamar history.back() em outro lugar recria o vai e volta entre telas.
  const app = ler('app/jb-gestao.html');
  const m = /<script id="jb-navegacao">([\s\S]*?)<\/script>/.exec(app);
  assert.ok(m, 'bloco jb-navegacao não encontrado');
  assert.ok(app.includes('JBNAV.ligar(()=>navegar());'), 'o roteador precisa ser ligado pelo JBNAV');
  const fora = app.replace(m[0], '');
  const diretos = (fora.match(/location\.hash\s*=(?!=)/g) || []).length;
  assert.equal(diretos, 0, `há ${diretos} atribuições diretas a location.hash fora do JBNAV. Use JBNAV.ir(...)`);
  assert.equal((fora.match(/location\.replace\(/g) || []).length, 0, 'use JBNAV.subst(...) no lugar de location.replace(...)');
  assert.equal((fora.match(/history\.back\(\)/g) || []).length, 1, 'history.back() só na gaveta do painel; nas telas use JBNAV.voltar()');
});
teste('programa', 'todo o JavaScript do programa compila', () => {
  const app = ler('app/jb-gestao.html');
  const ss = scriptsEmbutidos(app, 'app/jb-gestao.html');
  assert.ok(ss.length >= 4, 'scripts demais sumiram');
  ss.forEach((s) => compilar(s.codigo, s.nome));
});
teste('programa', 'arquivos da nuvem compilam', () => {
  compilar(ler('nuvem/jb-nuvem.js'), 'nuvem/jb-nuvem.js');
  scriptsEmbutidos(ler('nuvem/admin.html'), 'nuvem/admin.html').forEach((s) => compilar(s.codigo, s.nome));
  JSON.parse(ler('nuvem/manifest.webmanifest'));
});
teste('programa', 'nenhum segredo no que é publicado', () => {
  const textos = { app: ler('app/jb-gestao.html'), cab: ler('nuvem/cabecalho.html'), adm: ler('nuvem/admin.html'), js: ler('nuvem/jb-nuvem.js') };
  for (const [n, t] of Object.entries(textos)) {
    assert.ok(!/service_role|sb_secret_[A-Za-z0-9]|BEGIN (RSA |EC )?PRIVATE KEY|SUPABASE_SERVICE/.test(t), `${n}: parece conter chave secreta`);
    for (const jwt of t.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) || []) {
      const corpo = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      assert.equal(corpo.role, 'anon', `${n}: chave com papel "${corpo.role}" (só a chave pública anon pode ir para o site)`);
    }
  }
});

/* =====================================================================
   2. Construção (os dois envelopes do mesmo programa)
   ===================================================================== */
teste('construcao', 'nuvem e Claude levam exatamente o mesmo programa', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jb-'));
  try {
    const v = construir(tmp);
    const app = ler('app/jb-gestao.html'), cab = ler('nuvem/cabecalho.html');
    /* 20/11/2026: os blocos <script> grandes vão para dist/js/ (desempenho). Juntando de volta, a página
       precisa ser exatamente o programa + cabeçalho, como sempre foi. */
    const pagina = readFileSync(join(tmp, 'dist/index.html'), 'utf8');
    const usados = [...pagina.matchAll(/ src="(js\/[0-9a-f]{16}\.js)"/g)].map((m) => m[1]);
    const nojs = readdirSync(join(tmp, 'dist/js')).map((f) => 'js/' + f);
    assert.ok(usados.length > 50, 'os blocos do programa deveriam estar em dist/js (' + usados.length + ')');
    assert.deepEqual([...new Set(usados)].sort(), nojs.sort(), 'dist/js tem que ter exatamente os arquivos que a página usa');
    assert.equal(v.nuvem_arquivos, usados.length);
    assert.ok(![...pagina.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].some((m) => !/\bsrc=/.test(m[1] || '') && m[2].length >= 2000), 'sobrou bloco grande dentro da página');
    for (const n of nojs) assert.equal(sha256(readFileSync(join(tmp, 'dist', n), 'utf8')).slice(0, 16), n.slice(3, 19), 'nome do arquivo não confere com o conteúdo: ' + n);
    assert.ok(pagina.indexOf('jb-nuvem.js') < pagina.indexOf('<script id="spot-guarda"'), 'o adaptador da nuvem precisa carregar antes do programa (página separada)');
    /* o vigia de arquivo faltando (nuvem/cabecalho.html) fica dentro da página e antes de todos os arquivos js/ */
    assert.ok(pagina.indexOf("K='jb_recarga_js'") > 0 && pagina.indexOf("K='jb_recarga_js'") < pagina.indexOf(' src="js/'), 'o vigia de arquivo faltando precisa estar na página, antes dos arquivos js/');
    const nuvem = juntarScripts(pagina, (n) => readFileSync(join(tmp, 'dist', n), 'utf8'));
    const claude = readFileSync(join(tmp, 'saida/claude.html'), 'utf8');
    assert.match(v.site, /^[0-9a-f]{12}$/);
    assert.equal(nuvem, montarNuvem(app, metaSite(v.site) + cab));
    assert.equal(nuvem.replace(metaSite(v.site) + cab, ''), app, 'a nuvem deve ser o programa + cabeçalho (com a versão do site), sem nenhuma outra diferença');
    assert.ok(nuvem.indexOf('name="jb-site"') < nuvem.indexOf('jb-nuvem.js'), 'a versão do site precisa vir antes do adaptador da nuvem');
    const adm = readFileSync(join(tmp, 'dist/admin.html'), 'utf8');
    assert.equal(adm.replace(metaSite(v.site), ''), ler('nuvem/admin.html'), 'o admin.html só ganha a versão do site');
    assert.ok(claude.startsWith(ENVELOPE_CLAUDE) && claude.endsWith(FIM_CLAUDE));
    assert.equal(extrairDoClaude(claude), app, 'ida e volta Claude ⇄ repositório perde algo');
    assert.equal(montarClaude(extrairDoClaude(claude)), claude);
    for (const f of ['jb-nuvem.js', 'admin.html', 'manifest.webmanifest', 'icone.svg', 'icone-180.png', 'icone-192.png', 'icone-512.png', 'icone-maskable-512.png', 'entrada-celular.jpg', 'entrada-computador.jpg', '_headers', 'versao.json'])
      readFileSync(join(tmp, 'dist', f));
    const vj = JSON.parse(readFileSync(join(tmp, 'dist/versao.json'), 'utf8'));
    assert.equal(vj.versao, v.versao); assert.equal(vj.site, v.site); assert.match(vj.programa_sha256, /^[0-9a-f]{64}$/);
    assert.ok(nuvem.indexOf('jb-nuvem.js') < nuvem.indexOf('<script id="spot-guarda">'), 'o adaptador da nuvem precisa carregar antes do programa');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
teste('programa', 'Setor Fiscal: chamarF usa a função jb-fiscal (nuvem e ponte) e erro incerto nunca vira "nada enviado"', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('async function chamarF('), f = app.indexOf('async function statusServicoF(');
  assert.ok(i > 0 && f > i, 'chamarF não encontrado');
  assert.match(app.slice(i, f), /const via = transporteF\(\);/, 'chamarF precisa usar a ligação nova primeiro');
  assert.match(app.slice(i, f), /if \(TRANSMITE_F\.has\(tool\)\)[^\n]*throw e; \}\n  const m = await mcpF\(\);/, 'o conector antigo nunca pode transmitir (emitir, cancelar, inutilizar)');
  const e1 = app.indexOf('async function emitirTravadaF('), e2 = app.indexOf('async function consultarNotaF(');
  assert.ok(e1 > 0 && e2 > e1, 'emitirTravadaF não encontrado');
  const emitir = app.slice(e1, e2);
  assert.ok(!/mcpF|callTool|FISC\.mcp/.test(emitir), 'emitirTravadaF não pode usar o conector MCP antigo');
  assert.match(emitir, /const lg = ligacaoF\(\);\n  if \(!lg\.via \|\| lg\.motivo\) return \{ ok: false, parar: true/, 'emitirTravadaF para antes de numerar quando a ligação recusaria');
  assert.ok(emitir.indexOf('ligacaoF()') < emitir.indexOf('reservarNumeroF('), 'a ligação é conferida antes de reservar o número');
  const nada = /const NADA_ENVIADO = new Set\(\[([^\]]*)\]\)/.exec(app);
  assert.ok(nada, 'lista NADA_ENVIADO não encontrada');
  for (const c of ['sem_resposta', 'prazo_fiscal', 'rede', 'upstream_error', 'server_unavailable']) assert.ok(!nada[1].includes("'" + c + "'"), c + ' é incerto: não pode estar em NADA_ENVIADO');
  for (const c of ['desligado', 'recusado_banco']) assert.ok(nada[1].includes("'" + c + "'"), c + ' garante que nada foi enviado');
  assert.ok(!/Cloudflare|Nuvem Fiscal ou ACBr/.test(app), 'texto antigo do conector "JB Fiscal" da Cloudflare');
  const nv = ler('nuvem/jb-nuvem.js');
  assert.match(nv, /functions\/v1\/jb-fiscal/); assert.match(nv, /fiscal: fiscal,/);
});
teste('programa', 'leitura por foto aos poucos (V109): programa, adaptador da nuvem e função do servidor falam a mesma língua', () => {
  const app = ler('app/jb-gestao.html'), nv = ler('nuvem/jb-nuvem.js');
  // o pacote que vai para o Netlify não leva a pasta supabase/: a função é conferida só no repositório
  if (existsSync(join(RAIZ, 'supabase/functions/jb-ler-documento/index.ts'))) {
    const fn = ler('supabase/functions/jb-ler-documento/index.ts');
    assert.match(fn, /corpo\.fluxo !== true/, 'a função só responde aos poucos quando pedido (programa antigo continua recebendo a resposta inteira)');
    assert.match(fn, /application\/x-ndjson/); assert.match(fn, /t: "fim"/); assert.match(fn, /t: "erro"/);
    assert.match(fn, /req\.method === "GET"/, 'a função precisa aceitar o GET que só a acorda');
    assert.match(fn, /cancel\(\) \{ parar\(\); \}/, 'cancelar na tela precisa interromper o pedido à IA');
  }
  assert.match(nv, /envio\.fluxo = true/); assert.match(nv, /ndjson/); assert.match(nv, /o\.t === 'fim' \|\| o\.t === 'erro'/);
  assert.match(nv, /A leitura foi interrompida antes de terminar/, 'resposta sem o fim não pode valer como leitura');
  assert.match(app, /lt\.ler\(\{prompt,paginas\},sinal,typeof aoAndar==='function'\?aoAndar:undefined\)/, 'o programa precisa pedir o andamento ao adaptador');
  assert.ok(!/de 20 segundos a alguns minutos/.test(app), 'texto antigo de espera da leitura');
  assert.equal(app.split('em UMA linha só').length - 1, 2, 'os dois pedidos de leitura (documentos e combustível) pedem a resposta enxuta');
});
teste('programa', 'ponto facial (V126): câmera liberada só para o próprio site, perfis do ponto no painel e um bloco só', () => {
  const h = ler('nuvem/_headers');
  assert.match(h, /Permissions-Policy:[^\n]*camera=\(self\)/, 'o ponto facial precisa da câmera: nuvem/_headers deve ter camera=(self)');
  assert.match(h, /Permissions-Policy:[^\n]*microphone=\(self\)/, 'ditado dos contratos (V125): microfone liberado só para o próprio site');
  const app = ler('app/jb-gestao.html');
  assert.equal(app.split('<script id="ponto-facial-v126">').length - 1, 1, 'bloco do ponto facial ausente ou repetido');
  for (const velho of ['ponto-foto-v78', 'ponto-facial-v100', 'relogio-ponto-v79']) assert.ok(!app.includes('id="' + velho + '"'), 'bloco antigo do ponto ainda presente: ' + velho);
  const adm = ler('nuvem/admin.html');
  assert.match(adm, /\['celularPonto', 'Celular do ponto/, 'o painel de usuários precisa oferecer o perfil "Celular do ponto"');
  assert.match(adm, /\['respPonto', 'Responsável pelo ponto/, 'o painel de usuários precisa oferecer o perfil "Responsável pelo ponto"');
  assert.match(ler('nuvem/jb-nuvem.js'), /JB_PONTO/, 'a nuvem não pode recarregar a página com a câmera do ponto aberta');
});
teste('programa', 'ponto facial (V126/V127): reconhecimento com versão fixa, cadastro sem foto, foto só da marcação confirmada e marcações que só entram', () => {
  const app = ler('app/jb-gestao.html');
  assert.match(app, /cdn\.jsdelivr\.net\/npm\/@vladmandic\/face-api@\d+\.\d+\.\d+\//, 'a biblioteca do reconhecimento precisa ter a versão fixa');
  const pz = /<script id="ponto-facial-v126">([\s\S]*?)<\/script>/.exec(app)[1];
  assert.ok(!/toDataURL/.test(pz), 'o ponto facial não guarda imagem dentro do banco');
  assert.equal(pz.split('assets.upload(').length - 1, 1, 'a única foto enviada é a da marcação (guardarFoto); o cadastro facial continua sem foto');
  assert.match(pz, /if\(querFoto\(\)\)guardarFoto\(m,/, 'a foto só é guardada depois que a marcação foi gravada (a marcação nunca espera pela foto)');
  assert.match(pz, /\['pontos','Pontos do funcionário','pessoas'\]/, 'a gestão do ponto tem a aba "Pontos do funcionário"');
  assert.match(pz, /foto:true\}/, 'a foto da marcação vem ligada e pode ser desligada em Configurações');
  assert.match(pz, /CONFIRMAR MARCAÇÃO/, 'a marcação só é gravada com o toque em CONFIRMAR MARCAÇÃO');
  assert.match(pz, /CFG_PF=\{fase:'teste'/, 'o ponto facial começa na fase de testes');
  assert.match(pz, /lado:'environment'/, 'a câmera traseira é o padrão');
  // o pacote que vai para o Netlify não leva a pasta supabase/: as migrações são conferidas só no repositório
  if (existsSync(join(RAIZ, 'supabase/migrations'))) {
    assert.match(ler('supabase/migrations/20261112120000_seg_rostos.sql'), /values \('rostos', 'dp', false, 'dados', true\)/, 'a coleção "rostos" precisa estar em seg.colecoes, no módulo do DP');
    const m = ler('supabase/migrations/20261115200000_seg_ponto_marcacoes.sql');
    assert.match(m, /\('pontoMarcacoes', 'dp', true, 'dados', true\)/, 'a coleção "pontoMarcacoes" precisa estar em seg.colecoes');
    assert.match(m, /\('pontoEventos', 'dp', true, 'dados', true\)/, 'a coleção "pontoEventos" precisa estar em seg.colecoes');
    assert.match(m, /before insert or update on public\.docs[\s\S]*before delete on public\.docs/, 'as marcações precisam do gatilho que impede alterar e apagar');
    assert.ok(existsSync(join(RAIZ, 'supabase/migrations/20261115200000_seg_ponto_marcacoes.down.sql')), 'a migração do ponto precisa do arquivo de reversão');
  }
});
teste('programa', 'Setor do Barro (V124): o valor do barro entra junto da tonelada, também com a parte de extração ligada', () => {
  const app = ler('app/jb-gestao.html');
  const trecho = (ini, fim) => { const i = app.indexOf(ini); assert.ok(i >= 0, ini); const j = app.indexOf(fim, i + ini.length); assert.ok(j > i, fim); return app.slice(i, j); };
  assert.match(app, /const PRECO_PAD=\[\{desde:'2026-11-01',valorT:6\.1663,origem:'Índices jan–set\/2026 – taxa fixa'\}\]/, 'valor de referência do barro: R$ 6,1663/t desde 01/11/2026');
  const cust = trecho('function custoTonB(k,de,ate){', '\n/* ritmo:');
  assert.ok(/if\(k\.ton>0&&k\.total>0\)return\{real:true/.test(cust), 'com extração com custo, vale o custo real');
  assert.ok(cust.includes("txt:fRt(r.v),sub:'valor de referência"), 'sem extração com custo, o custo por tonelada é o R$/t vigente (nunca R$ 0,00)');
  // V143: o valor do barro consumido fica no painel principal (consumo); os custos e o estoque, no painel da extração
  assert.ok(trecho('function inicioConsB(c){', '\n}\n').includes("'Valor do barro consumido · '"), 'painel do consumo sem o valor do barro consumido');
  const ini = trecho('function painelExtB(c){', '\n}\n');
  for (const p of ['custoTonB(km,', 'custoCarB(km,', 'valorEstB(est.ton)']) assert.ok(ini.includes(p), 'painel da extração sem ' + p);
  assert.ok(!ini.includes('esc(fMoeda(km.porTon))'), 'o painel da extração não pode voltar a mostrar só o custo das extrações (R$ 0,00 sem extração)');
  assert.ok(trecho('function telaCusto(c){', '\n}\n').includes('custoTonB(k,UC.de,UC.ate)'), 'Custo do barro: custo por tonelada com o valor de referência');
  assert.ok(trecho('function telaEstoque(c){\n const e=estoqueB()', '\n}\n').includes('valorEstB(e.ton)'), 'Estoque de barro com o valor');
  assert.ok(trecho('function resumoMes(mes){', '\n}\n').includes('r.consV='), 'resumo do mês com o valor do barro consumido');
  // V124 só mostra: nada é gravado pelas funções novas
  const novo = trecho('/* ---------- V124 (14/11/2026)', '\n/* ritmo:');
  for (const proibido of ['gravar(', 'apagar(', 'bucketPut(', 'registrarLog(']) assert.ok(!novo.includes(proibido), 'a V124 não grava nada: achou ' + proibido);
});
teste('programa', 'Setor do Barro (V143): painel principal só com o consumo (maromba) e a extração em painel próprio', () => {
  const app = ler('app/jb-gestao.html');
  const trecho = (ini, fim) => { const i = app.indexOf(ini); assert.ok(i >= 0, ini); const j = app.indexOf(fim, i + ini.length); assert.ok(j > i, fim); return app.slice(i, j); };
  assert.ok(app.includes('function inicioB(c){inicioConsB(c)}'), 'o Início do Setor do Barro é sempre o painel do consumo (não muda com a chave da extração)');
  const cons = trecho('function inicioConsB(c){', '\n}\n');
  for (const p of ['linhasCons()', 'consMes(m)', "'Consumo do mês · '", "'Hoje · '", "'Ontem · '", "'Custo do barro por tonelada'", "'Acumulado em '", 'href="#/barroExtracao"', 'Extração do barro']) assert.ok(cons.includes(p), 'painel do consumo sem ' + p);
  for (const p of ['Extraído hoje', 'Custo por carrada', 'Motoristas a pagar', 'estoqueB(', 'custoDe(', 'DATA.barroExt']) assert.ok(!cons.includes(p), 'o painel do consumo não pode mostrar a extração: achou ' + p);
  const ext = trecho('function painelExtB(c){', '\n}\n');
  for (const p of ["'Extraído hoje'", "'Motoristas a pagar'", "'Estoque de barro'", 'Lançar extração do dia', 'Cadastros da extração']) assert.ok(ext.includes(p), 'painel da extração sem ' + p);
  assert.ok(!ext.includes("'Valor do barro consumido · '") && !ext.includes("'Consumo do mês · '"), 'os cartões do consumo ficam só no painel principal');
  assert.ok(app.includes("barroExtracao:naB('barroExtracao',painelExtB)") && app.includes("barroExtracao:{v:BV,e:[]}"), 'rota e permissão do painel da extração');
  assert.ok(app.includes("const ROTAS_EXT=['barroExtracao',") && app.includes('&&(!a.dentro||emExt)'), 'fora da extração, as telas de dentro dela ficam fora das abas');
  for (const corpo of [cons, ext]) for (const proibido of ['gravar(', 'apagar(', 'bucketPut(', 'registrarLog(']) assert.ok(!corpo.includes(proibido), 'os painéis só mostram: achou ' + proibido);
});
teste('construcao', 'TESTE F: publicação com erro é barrada e a versão anterior continua válida', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'jb-f-'));
  try {
    for (const d of ['app', 'nuvem', 'scripts']) cpSync(join(RAIZ, d), join(tmp, d), { recursive: true });
    const bom = ler('app/jb-gestao.html');
    // versão "quebrada": um erro de digitação dentro da função de iniciar
    const ruim = bom.replace('async function iniciar(){', 'async function iniciar(){ let quebrado = ;');
    writeFileSync(join(tmp, 'app/jb-gestao.html'), ruim);
    assert.throws(() => scriptsEmbutidos(ruim, 'versão nova').forEach((s) => compilar(s.codigo, s.nome)), /SyntaxError|Unexpected/);
    // recuperação: voltar ao arquivo anterior (é o que "git revert" faz) devolve uma versão que passa
    writeFileSync(join(tmp, 'app/jb-gestao.html'), bom);
    scriptsEmbutidos(readFileSync(join(tmp, 'app/jb-gestao.html'), 'utf8'), 'versão restaurada').forEach((s) => compilar(s.codigo, s.nome));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

/* =====================================================================
   3. Ponte do Claude com o banco central (com servidor falso)
   ===================================================================== */
function ambiente() {
  const armazenado = new Map(), timers = new Set(), ouvintesDoc = [];
  let encerrado = false;   // depois do teste, nenhum relógio novo da ponte é aceito
  const elem = () => ({ style: {}, setAttribute() {}, addEventListener() {}, remove() {}, appendChild() {}, querySelector: () => elem(), textContent: '', innerHTML: '', href: '' });
  const toasts = [];
  const g = {
    console, JSON, Math, Date, Promise, Map, Set, Array, Object, String, Number, Error, RegExp, Uint8Array, TextEncoder, TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: globalThis.crypto,
    setTimeout: (f, ms) => { if (encerrado) return 0; const t = setTimeout(f, ms); timers.add(t); return t; },
    clearTimeout: (t) => clearTimeout(t),
    setInterval: (f, ms) => { if (encerrado) return 0; const t = setInterval(f, ms); timers.add(t); return t; },
    addEventListener: () => {},
    location: { reload() {} },
    localStorage: { getItem: (k) => (armazenado.has(k) ? armazenado.get(k) : null), setItem: (k, v) => armazenado.set(k, String(v)), removeItem: (k) => armazenado.delete(k) },
    document: { hidden: false, body: elem(), documentElement: elem(), addEventListener: (t, f) => ouvintesDoc.push([t, f]), getElementById: () => null, createElement: () => elem() },
    toast: (m, t) => toasts.push([t, m]),
  };
  g.window = g;
  return { g, armazenado, toasts, limpar: () => { encerrado = true; timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); } };
}
function carregarPonte(amb, ajustes) {
  vm.createContext(amb.g);
  vm.runInContext(blocoPonte(ler('app/jb-gestao.html')), amb.g, { filename: 'jb-core-ponte' });
  Object.assign(amb.g.JB_CORE_PONTE.CFG, { intervalo: 30, intervaloOculto: 30, esperaGravacao: 150, esperaSemCache: 400, prazoConexao: 1500, sinal: 0 }, ajustes || {});
  return amb.g.JB_CORE_PONTE;
}
function bancoReserva(inicial) {   // imita o banco do artifact (somente o necessário)
  const docs = new Map(Object.entries(inicial || {}));
  const snap = (p) => ({ id: p.split('/').pop(), exists: docs.has(p), data: () => docs.get(p) });
  return {
    doc: (p) => ({ get: async () => snap(p), onSnapshot: (cb) => { setTimeout(() => cb(snap(p)), 0); return () => {}; } }),
    collection: (c) => { const q = { where: () => q, get: async () => ({ docs: [...docs.keys()].filter((k) => k.startsWith(c + '/')).map(snap) }), onSnapshot: (cb) => { q.get().then(cb); return () => {}; } }; return q; },
  };
}
async function cenario(fn, opcoes = {}) {
  const amb = opcoes.amb || ambiente();
  const srv = opcoes.srv || criarServidorFalso({ admins: ['u_ADMIN'] });
  try { return await fn({ amb, srv }); } finally { amb.limpar(); }
}
async function ligar(amb, srv, extra = {}) {
  const ponte = carregarPonte(amb, extra.cfg);
  const r = await ponte.conectar({ mcp: 'mcp' in extra ? extra.mcp : srv.mcp, uid: extra.uid || 'u_ADMIN', reserva: extra.reserva || bancoReserva() });
  return { ponte, db: r.db, api: r.api };
}

teste('ponte', 'abre o banco central e entrega os dados no formato do sistema', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('funcionarios', 'f1', { nome: 'Ana', setor: 'Produção' });
  srv.estado.gravarDireto('config', 'empresa', { empresa: { razao: 'Teste' } });
  const { db, api } = await ligar(amb, srv);
  assert.equal(api.estado().modo, 'central');
  const g = await db.doc('funcionarios/f1').get();
  assert.ok(g.exists); assert.equal(g.data().nome, 'Ana');
  const s = await db.collection('funcionarios').get();
  assert.equal(s.size, 1);
  let visto = null; db.doc('config/empresa').onSnapshot((x) => { visto = x; });
  await ate(() => visto && visto.exists);
}));
teste('ponte', 'lê o banco em várias páginas sem perder registros', () => cenario(async ({ amb, srv }) => {
  const grande = 'x'.repeat(4000);
  for (let i = 0; i < 60; i++) srv.estado.gravarDireto('compras', 'c' + String(i).padStart(3, '0'), { texto: grande, n: i });
  const { db } = await ligar(amb, srv, { cfg: { pagina: 20000 } });
  const s = await db.collection('compras').get();
  assert.equal(s.size, 60);
  assert.ok(srv.estado.chamadas.filter((c) => /instantaneo_pagina/.test(c.query)).length >= 10, 'deveria ter lido em várias páginas');
}));
teste('ponte', 'TESTE B: funcionário cadastrado no Claude é gravado no banco central', () => cenario(async ({ amb, srv }) => {
  const { db } = await ligar(amb, srv);
  await db.doc('funcionarios/novo1').set({ nome: 'Carlos', cargo: 'Forneiro', admissao: '2026-10-30' });
  await ate(() => srv.estado.docs.has('funcionarios/novo1'));
  assert.equal(srv.estado.docs.get('funcionarios/novo1').dados.nome, 'Carlos');
  assert.equal(srv.estado.contarAplicadas(), 1);
}));
teste('ponte', 'TESTE C: despesa lançada (documento agrupado) chega ao banco e aos relatórios', () => cenario(async ({ amb, srv }) => {
  const { db } = await ligar(amb, srv);
  let relatorio = [];
  db.collection('despesas').where('chave', '>=', '2026-09').onSnapshot((s) => {
    relatorio = []; s.docs.forEach((d) => Object.values(d.data().items || {}).forEach((x) => x && relatorio.push(x)));
  });
  // o mesmo caminho do sistema (bucketPut0): tenta atualizar; se o bloco não existe, cria
  async function lancar(chave, id, val) {
    const ref = db.doc('despesas/' + chave);
    try { await ref.update({ items: { [id]: val } }); }
    catch (e) {
      assert.equal(e.code, 'invalid_argument');
      const g = await ref.get();
      if (!g.exists) await ref.set({ chave, items: { [id]: val } }); else await ref.update({ items: { [id]: val } });
    }
  }
  await lancar('2026-10-s3', 'd1', { id: 'd1', competencia: '2026-10', valor: 150.5, descricao: 'Lenha' });
  await lancar('2026-10-s3', 'd2', { id: 'd2', competencia: '2026-10', valor: 80, descricao: 'Diesel' });
  await ate(() => relatorio.length === 2);
  await ate(() => srv.estado.docs.has('despesas/2026-10-s3') && Object.keys(srv.estado.docs.get('despesas/2026-10-s3').dados.items).length === 2);
  assert.equal(relatorio.reduce((s, x) => s + x.valor, 0), 230.5);
}));
teste('ponte', 'TESTE D: alteração feita na nuvem aparece no Claude, e a do Claude chega na nuvem', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo 8 furos', preco: 1.1 });
  const { db } = await ligar(amb, srv);
  let preco = null; db.doc('produtos/p1').onSnapshot((s) => { preco = s.exists ? s.data().preco : null; });
  await ate(() => preco === 1.1);
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo 8 furos', preco: 1.25 });     // alguém altera na nuvem
  await ate(() => preco === 1.25);
  await db.doc('produtos/p1').update({ preco: 1.3 });                                     // e o Claude altera de volta
  await ate(() => srv.estado.docs.get('produtos/p1').dados.preco === 1.3);
  assert.equal(srv.estado.docs.get('produtos/p1').dados.nome, 'Tijolo 8 furos', 'a mescla não pode apagar outros campos');
  srv.estado.apagarDireto('produtos', 'p1');                                                // exclusão na nuvem
  await ate(() => preco === null);
}));
teste('ponte', 'conferência completa só redesenha o que mudou e a página parada consulta menos', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo', preco: 1 });
  srv.estado.gravarDireto('clientes', 'c1', { nome: 'Construtora X' });
  const { db, api } = await ligar(amb, srv, { cfg: { intervalo: 100000 } });
  let nProd = 0, nCli = 0;
  db.collection('produtos').onSnapshot(() => { nProd++; });
  db.collection('clientes').onSnapshot(() => { nCli++; });
  await ate(() => nProd === 1 && nCli === 1);
  srv.estado.gravarDireto('produtos', 'p1', { nome: 'Tijolo', preco: 2 });
  await api.sincronizar();
  await ate(() => nProd === 2);
  await esperar(50);
  assert.equal(nCli, 1, 'clientes não mudou: não pode redesenhar');
  await api.sincronizar(); await esperar(50);
  assert.equal(nProd, 2, 'sem mudança nenhuma: não pode redesenhar');
  const ponte = amb.g.JB_CORE_PONTE.CFG;
  assert.ok(ponte.intervalo >= 1 && ponte.ocioso > 0, 'ritmo com regra de ociosidade');
  const original = ler('app/jb-gestao.html');
  const cfg = /intervalo: (\d+), intervaloOculto: ([^,]+), ocioso: ([^,]+), conferencia: ([^,]+),/.exec(original);
  assert.ok(cfg, 'ritmo da ponte não encontrado');
  assert.ok(+cfg[1] >= 30000, 'consulta de mudanças não pode ser mais rápida que 30 s');
  assert.ok(eval(cfg[2]) >= 5 * 60 * 1000 && eval(cfg[4]) >= 30 * 60 * 1000, 'aba escondida/parada e conferência precisam ser econômicas');
}));
teste('ponte', 'TESTE E: resposta perdida no meio da gravação não duplica o registro', () => cenario(async ({ amb, srv }) => {
  const { db, api } = await ligar(amb, srv);
  srv.estado.falhas.depois = 1;        // o banco grava, mas a resposta não chega
  const p = db.doc('vendas/v1').set({ cliente: 'Construtora X', total: 900 });
  await ate(() => api.estado().pendentes === 0, 8000);
  await p;
  assert.equal(srv.estado.docs.get('vendas/v1').versao, 1, 'o documento só pode ter sido gravado uma vez');
  assert.equal(srv.estado.contarAplicadas(), 1);
  const envios = srv.estado.chamadas.filter((c) => /jbcore\.aplicar/.test(c.query)).length;
  assert.ok(envios >= 2, 'deveria ter reenviado a mesma operação');
}));
teste('ponte', 'TESTE E: sem conexão, o lançamento fica guardado e sobe ao reabrir, uma vez só', async () => {
  const amb = ambiente(), srv = criarServidorFalso({ admins: ['u_ADMIN'] });
  try {
    const a = await ligar(amb, srv);
    srv.estado.falhas.permanente = 'server_unavailable';            // a internet cai
    await a.db.doc('fin/2026-10-s1').set({ chave: '2026-10-s1', items: { t1: { valor: 500 } } });   // a tela não trava
    assert.equal(a.api.estado().pendentes, 1);
    const guardado = JSON.parse(amb.armazenado.get('jbcore_fila_v1:u_ADMIN'));
    assert.equal(guardado.length, 1, 'a operação precisa estar guardada no navegador');
    amb.limpar();
    // página fechada e aberta de novo, já com internet
    srv.estado.falhas.permanente = null;
    const amb2 = ambiente(); for (const [k, v] of amb.armazenado) amb2.armazenado.set(k, v);
    try {
      const b = await ligar(amb2, srv);
      await ate(() => b.api.estado().pendentes === 0, 4000);
      assert.equal(srv.estado.docs.get('fin/2026-10-s1').dados.items.t1.valor, 500);
      assert.equal(srv.estado.contarAplicadas(), 1);
      assert.ok(!amb2.armazenado.has('jbcore_fila_v1:u_ADMIN'), 'a fila deve ser limpa depois de confirmada');
    } finally { amb2.limpar(); }
  } finally { amb.limpar(); }
});
teste('ponte', 'atualizar documento que não existe é recusado e não cria nada', () => cenario(async ({ amb, srv }) => {
  const { db } = await ligar(amb, srv);
  await assert.rejects(db.doc('horasExtras/2026-10-s1').update({ items: { h: 1 } }), (e) => e.code === 'invalid_argument');
  assert.ok(!srv.estado.docs.has('horasExtras/2026-10-s1'));
}));
teste('ponte', 'gravação recusada por falta de conexão sai da fila e não gera erro repetido depois', () => cenario(async ({ amb, srv }) => {
  const { db, api } = await ligar(amb, srv);
  srv.estado.falhas.permanente = 'server_unavailable';
  await assert.rejects(db.doc('vales/2026-11-s0').update({ items: { v1: { valor: 10 } } }), (e) => e.code === 'unavailable');
  assert.equal(api.estado().pendentes, 0, 'a operação já dada como não gravada não pode continuar na fila');
  srv.estado.falhas.permanente = null;
  await api.sincronizar();
  await esperar(50);
  assert.equal(amb.toasts.filter(([t]) => t === 'erro').length, 0, 'não pode aparecer um segundo aviso de erro');
  assert.ok(!srv.estado.docs.has('vales/2026-11-s0'));
}));
teste('ponte', 'exclusão chega ao banco e repetir a exclusão não dá erro', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('clientes', 'k1', { nome: 'Cliente' });
  const { db } = await ligar(amb, srv);
  await db.doc('clientes/k1').delete();
  await ate(() => !srv.estado.docs.has('clientes/k1'));
  await db.doc('clientes/k1').delete();
  assert.equal((await db.doc('clientes/k1').get()).exists, false);
}));
teste('ponte', 'conflito: gravação sobre versão que mudou fica marcada', () => cenario(async ({ amb, srv }) => {
  srv.estado.gravarDireto('locais', 'l1', { nome: 'Galpão' });
  const { db, api } = await ligar(amb, srv, { cfg: { intervalo: 100000 } });   // sem puxar mudanças no meio
  srv.estado.gravarDireto('locais', 'l1', { nome: 'Galpão 2' });                // a nuvem muda; o Claude ainda não viu
  await db.doc('locais/l1').set({ nome: 'Galpão A' });
  await ate(() => api.estado().pendentes === 0);
  assert.equal(api.estado().conflitos, 1);
  const op = [...srv.estado.operacoes.values()].pop();
  assert.equal(op.conflito, true);
}));
teste('ponte', 'quem não é administrador fica só consultando (nunca grava numa cópia separada)', () => cenario(async ({ amb, srv }) => {
  const reserva = bancoReserva({ 'funcionarios/a': { nome: 'Antigo' } });
  const { db, api } = await ligar(amb, srv, { uid: 'u_OUTRO', reserva });
  assert.equal(api.estado().modo, 'reserva');
  assert.match(api.estado().motivo, /administradores/);
  assert.equal((await db.doc('funcionarios/a').get()).data().nome, 'Antigo');
  await assert.rejects(db.doc('funcionarios/b').set({ nome: 'X' }), (e) => e.code === 'permission_denied');
  assert.equal(srv.estado.contarAplicadas(), 0);
}));
teste('ponte', 'sem conector (ou conector negado) abre só para consulta com o motivo certo', () => cenario(async ({ amb, srv }) => {
  const r1 = await ligar(amb, srv, { mcp: null });
  assert.equal(r1.api.estado().modo, 'reserva');
  const amb2 = ambiente();
  try {
    const negado = { callTool: async () => { const e = new Error('x'); e.code = 'server_not_connected'; throw e; } };
    const r2 = await ligar(amb2, srv, { mcp: negado });
    assert.match(r2.api.estado().motivo, /conector Supabase não está ligado/);
  } finally { amb2.limpar(); }
}));
teste('ponte', 'banco que não responde a tempo não trava a abertura do sistema', () => cenario(async ({ amb, srv }) => {
  const lento = { callTool: () => new Promise(() => {}) };
  const t0 = Date.now();
  const { api } = await ligar(amb, srv, { mcp: lento, cfg: { prazoConexao: 300 } });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(api.estado().modo, 'reserva');
}));
teste('ponte', 'envia sinal de vida ao banco para o painel', () => cenario(async ({ amb, srv }) => {
  await ligar(amb, srv);
  await ate(() => srv.estado.sinais.length > 0);
  assert.equal(srv.estado.sinais[0].origem, 'claude');
}));

/* ---------- serviço fiscal pela ponte (jbcore.fiscal + jbcore.resposta) ---------- */
const CFG_FISCAL = { cfg: { prazoFiscal: 1500, esperaFiscal: 10 } };
const SRV_FISCAL = () => criarServidorFalso({ admins: ['u_ADMIN'], fiscal: (acao, args) => acao === 'consultar_nfe'
  ? { status: 200, corpo: { encontrado: true, documento: { id: args.id, status: 'autorizado' } } }
  : { status: 503, corpo: { erro: { tipo: 'configuracao', mensagem: 'Produção bloqueada (simulado).' } } } });
teste('ponte', 'serviço fiscal: pede pelo banco, espera a resposta e devolve o mesmo formato da nuvem', () => cenario(async ({ amb, srv }) => {
  const { api } = await ligar(amb, srv, CFG_FISCAL);
  const r = await api.fiscal('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n1-t1' });
  const simples = (v) => JSON.parse(JSON.stringify(v));   // objetos criados dentro do vm têm outro protótipo
  assert.deepEqual(simples(r), { encontrado: true, documento: { id: 'jb-n1-t1', status: 'autorizado' } });
  const p = srv.estado.fiscal.pedidos[0];
  assert.deepEqual([p.acao, p.args, p.uid], ['consultar_nfe', { ambiente: 'homologacao', id: 'jb-n1-t1' }, 'u_ADMIN']);
  assert.ok(srv.estado.chamadas.filter((c) => /jbcore\.resposta\(/.test(c.query)).length >= 2, 'pergunta pela resposta até ela chegar');
  const recusa = await api.fiscal('emitir_nfe', { ambiente: 'producao' });
  assert.deepEqual(simples(recusa), { erro: { tipo: 'configuracao', mensagem: 'Produção bloqueada (simulado).' } }, 'recusa do serviço volta como {erro}');
  assert.equal(api.estado().modo, 'central');
}, { srv: SRV_FISCAL() }));
teste('ponte', 'serviço fiscal: recusa do banco = nada enviado; sem resposta = incerto (nunca "nada enviado")', async () => {
  const admins = ['u_ADMIN'];
  await cenario(async ({ amb, srv }) => {
    const { api } = await ligar(amb, srv, CFG_FISCAL);
    admins.length = 0;                                                     // deixou de ser administrador
    await assert.rejects(api.fiscal('emitir_nfe', {}), (e) => e.code === 'recusado_banco' && /administradores/.test(e.message));
    assert.equal(srv.estado.fiscal.pedidos.length, 0);
    admins.push('u_ADMIN');
    await assert.rejects(api.fiscal('emitir_nfe', {}), (e) => e.code === 'sem_resposta');        // pg_net: tempo esgotado
    srv.estado.fiscal.esperas = 1e9;                                       // a resposta nunca chega
    await assert.rejects(api.fiscal('emitir_nfe', {}), (e) => e.code === 'prazo_fiscal');
    srv.estado.fiscal.esperas = 1;
    const p = api.fiscal('emitir_nfe', {});
    await ate(() => srv.estado.fiscal.pedidos.length === 3);
    srv.estado.falhas.permanente = 'server_not_connected';                 // o conector cai depois do pedido feito
    await assert.rejects(p, (e) => e.code === 'prazo_fiscal', 'depois do pedido registrado, nenhuma falha pode dizer que nada foi enviado');
  }, { srv: criarServidorFalso({ admins, fiscal: () => ({ erro: 'Timeout of 90000 ms reached' }) }) });
});
teste('ponte', 'serviço fiscal fora do modo central: recusa sem pedir nada ao banco', () => cenario(async ({ amb, srv }) => {
  const { api } = await ligar(amb, srv, { uid: 'u_OUTRO' });
  await assert.rejects(api.fiscal('status_servico', { ambiente: 'homologacao' }), (e) => e.code === 'desligado');
  assert.equal(srv.estado.fiscal.pedidos.length, 0);
}));

/* ---------- Setor Fiscal do programa: por onde cada pedido vai (chamarF de verdade, num contexto isolado) ---------- */
function ligacaoFiscal(janela) {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('const FISC = {'), f = app.indexOf('async function statusServicoF(');
  assert.ok(i > 0 && f > i, 'trecho da ligação fiscal não encontrado');
  const g = { window: janela, Error, Set, Object, String, Promise, JSON, Array };
  vm.createContext(g);
  vm.runInContext("const SERVIDOR_FISCAL = 'JB Fiscal';\n" + app.slice(i, f) + '\nglobalThis.__f = { chamarF, ligacaoF, NADA_ENVIADO };', g, { filename: 'ligacao-fiscal' });
  return g.__f;
}
function conectorAntigo() {   // o conector MCP "JB Fiscal": anota cada chamada
  const chamadas = [];
  return { chamadas, claude: { use: async (n) => (n === 'mcp' ? { callTool: async (...a) => { chamadas.push(a.slice(0, 2)); return { structuredContent: { ok: true } }; } } : null) } };
}
const TRANSMITEM = [['emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-x-t1' }], ['cancelar_nfe', { ambiente: 'homologacao', id: 'jb-x-t1', justificativa: 'x'.repeat(20) }],
  ['inutilizar_numeracao', { ambiente: 'homologacao', serie: 1, numero_inicial: 5, numero_final: 5 }]];
teste('programa', 'Setor Fiscal no Claude: com a ponte, tudo vai por ela; o conector antigo nunca é usado', async () => {
  const antigo = conectorAntigo();
  const amb = ambiente();
  try {
    const ponte = carregarPonte(amb);                         // ainda não ligada ao banco central
    const F = ligacaoFiscal({ JB_CORE_PONTE: ponte, claude: antigo.claude });
    assert.match(F.ligacaoF().motivo, /banco central/, 'fora do modo central, a emissão para antes de numerar');
    for (const [acao, args] of [...TRANSMITEM, ['consultar_nfe', { ambiente: 'homologacao', id: 'jb-x-t1' }], ['status_servico', { ambiente: 'homologacao' }], ['consultar_cep', { cep: '65680000' }]]) {
      await assert.rejects(F.chamarF(acao, args), (e) => e.code === 'desligado' && F.NADA_ENVIADO.has(e.code), acao + ': a ponte recusa (nada enviado)');
    }
    const semFiscal = ligacaoFiscal({ JB_CORE_PONTE: { api: { estado: () => ({ modo: 'central' }) } }, claude: antigo.claude });
    await assert.rejects(semFiscal.chamarF('emitir_nfe', {}), (e) => e.code === 'desligado', 'ponte sem o serviço fiscal: recusa, sem conector');
    assert.ok(semFiscal.ligacaoF().motivo);
    assert.equal(antigo.chamadas.length, 0, 'o conector "JB Fiscal" não pode ser chamado quando a ponte existe');
  } finally { amb.limpar(); }
  await cenario(async ({ amb: a2, srv }) => {
    const { ponte } = await ligar(a2, srv, CFG_FISCAL);       // administrador, banco central ligado
    const F = ligacaoFiscal({ JB_CORE_PONTE: ponte, claude: antigo.claude });
    assert.equal(F.ligacaoF().motivo, '');
    const r = await F.chamarF('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n1-t1' });
    assert.equal(r.documento.status, 'autorizado');
    await assert.rejects(F.chamarF('emitir_nfe', { ambiente: 'producao' }), (e) => e.code === 'tool_error' && e.erro.tipo === 'configuracao');
    assert.deepEqual(srv.estado.fiscal.pedidos.map((p) => p.acao), ['consultar_nfe', 'emitir_nfe']);
    assert.equal(antigo.chamadas.length, 0);
  }, { srv: SRV_FISCAL() });
});
teste('programa', 'Setor Fiscal na nuvem e sem ligação nenhuma: o conector antigo nunca transmite', async () => {
  const antigo = conectorAntigo();
  const pedidos = [];
  const nuvem = ligacaoFiscal({ JB_NUVEM_API: { fiscal: async (a) => { pedidos.push(a); return { ok: true }; } }, JB_CORE_PONTE: { api: { fiscal: async () => { throw new Error('não era para a ponte'); }, estado: () => ({ modo: 'central' }) } }, claude: antigo.claude });
  for (const [acao, args] of TRANSMITEM) assert.deepEqual({ ...(await nuvem.chamarF(acao, args)) }, { ok: true });
  assert.deepEqual(pedidos, ['emitir_nfe', 'cancelar_nfe', 'inutilizar_numeracao'], 'na nuvem vai pela função jb-fiscal');
  const velha = ligacaoFiscal({ JB_NUVEM_API: {}, claude: antigo.claude });   // adaptador da nuvem desatualizado
  await assert.rejects(velha.chamarF('emitir_nfe', {}), (e) => e.code === 'desligado' && /Atualize a página/.test(e.message));
  const nada = ligacaoFiscal({ claude: antigo.claude });                        // nem nuvem nem ponte
  for (const [acao, args] of TRANSMITEM) await assert.rejects(nada.chamarF(acao, args), (e) => e.code === 'sem_mcp' && nada.NADA_ENVIADO.has(e.code), acao);
  assert.equal(antigo.chamadas.length, 0, 'emitir, cancelar e inutilizar nunca passam pelo conector antigo');
  assert.ok(nada.ligacaoF().motivo, 'sem ligação, a emissão para antes de numerar');
  await nada.chamarF('consultar_cep', { cep: '65680000' });                     // só consulta, por compatibilidade
  assert.deepEqual(antigo.chamadas, [['JB Fiscal', 'consultar_cep']]);
});
teste('programa', 'Setor Fiscal: consulta nunca apaga o protocolo já gravado na nota', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('function mesclarSefazF('), f = app.indexOf('/** Aplica a resposta oficial do provedor/SEFAZ à nota.');
  assert.ok(i > 0 && f > i, 'mesclarSefazF não encontrado');
  const a1 = app.indexOf('async function aplicarDocumentoF('), a2 = app.indexOf('async function vincularVendaF(');
  const aplicar = app.slice(a1, a2);
  assert.match(aplicar, /const sefaz = mesclarSefazF\(n\.sefaz, novo\);/);
  assert.ok(!/\.\.\.\(n\.sefaz \|\| \{\}\), \.\.\.sefaz/.test(aplicar), 'a mescla antiga apagava o protocolo com null');
  const g = { Object };
  vm.createContext(g);
  vm.runInContext(app.slice(i, f) + '\nglobalThis.mesclar = mesclarSefazF;', g);
  const gravado = { provedorId: 'jb-n1-t1', chave: '2'.repeat(44), protocolo: '121260000012345', codigo: 100, motivo: 'Autorizado o uso da NF-e', mensagem: null, dataRecebimento: '2026-11-08T10:00:05-03:00', dataEmissao: '2026-11-08T10:00:00-03:00', valorTotal: 1400, statusProvedor: 'autorizado', digest: 'abc=', atualizadoEm: 'antes' };
  const vazio = { provedorId: 'jb-n1-t1', chave: null, protocolo: null, codigo: 135, motivo: null, mensagem: 'aviso novo', dataRecebimento: null, dataEmissao: null, valorTotal: null, statusProvedor: 'cancelado', digest: null, atualizadoEm: 'agora' };
  const m = JSON.parse(JSON.stringify(g.mesclar(gravado, vazio)));
  assert.deepEqual(m, { ...gravado, codigo: 135, mensagem: 'aviso novo', statusProvedor: 'cancelado', atualizadoEm: 'agora' });
  assert.equal(JSON.parse(JSON.stringify(g.mesclar(gravado, { ...vazio, mensagem: null }))).mensagem, null, 'o aviso é sempre o da resposta nova');
  const outra = { ...vazio, provedorId: 'jb-n1-t2' };
  assert.deepEqual(JSON.parse(JSON.stringify(g.mesclar(gravado, outra))), outra, 'outra referência é outro documento');
  assert.deepEqual(JSON.parse(JSON.stringify(g.mesclar(null, vazio))), vazio);
});

/* =====================================================================
   4. JB Fiscal (Focus NFe): tradução e idempotência, sem rede (scripts/testar-fiscal.mjs)
   O pacote que o publicador (jb-publicar) manda ao Netlify não leva supabase/: aí o grupo é pulado
   (o GitHub e o Netlify ligado ao repositório rodam tudo).
   ===================================================================== */
const temFiscal = existsSync(join(RAIZ, 'supabase/functions/jb-fiscal/nucleo.js'));
if (temFiscal) {
  const { TESTES } = await import('./testar-fiscal.mjs');
  TESTES.forEach((x) => teste('fiscal', x.nome, x.fn));
} else console.log('  – [fiscal] pulado: este pacote não tem supabase/functions/jb-fiscal');

/* Resumo diário no WhatsApp: contas, parâmetros do modelo e corpo do envio, sem rede (mesma regra do pacote sem supabase/) */
if (existsSync(join(RAIZ, 'supabase/functions/jb-whatsapp/nucleo.js'))) {
  const { TESTES: TW } = await import('./testar-whatsapp.mjs');
  TW.forEach((x) => teste('whatsapp', x.nome, x.fn));
} else console.log('  – [whatsapp] pulado: este pacote não tem supabase/functions/jb-whatsapp');

/* ---------- V129: padrão global de filtros e de lançamentos ---------- */
teste('lancamentos', 'V129: filtros e ações dos lançamentos num componente só, depois das listas em cartões, sem gravar nada', () => {
  const app = ler('app/jb-gestao.html');
  for (const id of ['<style id="lanc-filtros-v129-css">', '<script id="lanc-filtros-v129">']) assert.equal(app.split(id).length - 1, 1, id + ' uma vez só');
  assert.ok(app.indexOf('<script id="lanc-filtros-v129">') > app.indexOf('<script id="lista-cartoes-js">'), 'o bloco V129 vem depois das listas em cartões');
  const i = app.indexOf('<script id="lanc-filtros-v129">'); const bloco = app.slice(i, app.indexOf('</script>', i));
  for (const proibido of ['gravar(', 'apagar(', 'bucketPut(', 'registrarLog(', '.update(', 'salvarCfg(', 'location.hash', 'location.replace(', 'history.back(']) assert.ok(!bloco.includes(proibido), 'o bloco V129 não pode usar ' + proibido);
  assert.ok(bloco.includes("c.querySelector('.c2-home')"), 'o início dos setores fica de fora');
  assert.ok(bloco.includes('#camada [data-acao="excluir"]'), 'o Excluir do menu é o botão da janela do registro (mesma confirmação e regras)');
  const css = app.slice(app.indexOf('<style id="lanc-filtros-v129-css">'), app.indexOf('</style>', app.indexOf('<style id="lanc-filtros-v129-css">')));
  assert.ok(/@media print\{[^}]*\.jbl-m[^}]*display:none/.test(css), 'botões e menus do V129 não saem na impressão');
});

/* ---------- V151: Movimentações dos setores ---------- */
teste('movimentacoes', 'V151: Movimentações do Almoxarifado, da Lenha, do Combustível e da Produção, só leitura e com o comprovante padrão', () => {
  const app = ler('app/jb-gestao.html');
  const m = /<script id="movimentacoes-v151">([\s\S]*?)<\/script>/.exec(app); assert.ok(m, 'bloco das movimentações');
  assert.ok(app.includes('<style id="movimentacoes-v151-css">'), 'aparência');
  const b = m[1];
  for (const proibido of ['gravar(', 'apagar(', 'gravarRegistro(', 'bucketPut(', 'registrarLog(', 'salvarCfg(', 'localStorage']) assert.ok(!b.includes(proibido), 'o bloco é só leitura: não pode usar ' + proibido);
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)/.test(b), 'navegação só pelo JBNAV');
  for (const r of ['TELAS_V.movCombustivel=', 'TELAS_V.movLenha=', 'TELAS_V.movProducao=', 'TELAS_V.almMov=function']) assert.ok(b.includes(r), 'rota ' + r);
  assert.ok(b.includes("baseRel('COMPROVANTE DE MOVIMENTAÇÃO'") && b.includes("kind:'movimentacao'") && b.includes('acaoDocumento('), 'comprovante no gerador de documentos do sistema, com visualizar, imprimir, PDF e compartilhar');
  assert.ok(app.includes("['#/movCombustivel','lupa','Movimentações',['movCombustivel'],'movCombustivel']") && app.includes("['#/movLenha','lupa','Movimentações',['movLenha'],'movLenha']"), 'Movimentações no menu da Lenha e do Combustível');
  assert.ok(app.includes("{r:'#/movProducao',m:'setor-producao',ic:'lupa',l:'Movimentações',at:['movProducao']}") && /window\.PRODUCAO_SETOR=\{[^}]*shellP\}/.test(app), 'aba Movimentações na Produção');
  assert.ok(app.indexOf('<script id="movimentacoes-v151">') > app.indexOf('<script id="lanc-filtros-v129">'), 'vem depois do padrão de lançamentos (V129)');
  const ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  if (ci) assert.ok(ci.includes('node scripts/testar-movimentacoes.mjs'), 'teste no navegador roda na conferência automática');
});

/* ---------- V157: revisões e manutenção da frota (Setor de Combustível) ---------- */
teste('frota', 'V157: Revisões e manutenção da frota dentro do Combustível, sobre o cadastro de Veículos e máquinas, sem coleção nova e sem apagar', () => {
  const app = ler('app/jb-gestao.html');
  for (const id of ['<style id="frota-revisoes-v157-css">', '<script id="frota-revisoes-v157">']) assert.equal(app.split(id).length - 1, 1, id + ' uma vez só');
  const b = /<script id="frota-revisoes-v157">([\s\S]*?)<\/script>/.exec(app)[1];
  assert.ok(b.includes("const COL='clCtrl';") && b.includes("const TIPO={frRev:'frRev',frPlano:'frPlano',frLeit:'frLeit'};"), 'grava na coleção clCtrl (já liberada para o setor), com o tipo no registro');
  assert.ok(!/DATA,\s*\{\s*\[?['"]?fr/.test(b) && !/Object\.assign\(DATA/.test(b), 'nenhuma coleção nova');
  assert.ok(/apagar=async function\(col,rec\)\{if\(TIPO\[col\]\)\{[^}]*throw e\}/.test(b), 'registros de revisão não são apagados');
  for (const m of ['frRev', 'frPlano', 'frLeit']) assert.ok(new RegExp('MODS\\.' + m + '=\\{[^]*?semExcluir:true').test(b), m + ' sem excluir');
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)|localStorage/.test(b), 'navegação só pelo JBNAV e nada guardado no navegador');
  assert.ok(b.includes("const frota=()=>DATA.locais.filter(l=>l.setor==='combustivel'"), 'a frota é o cadastro de Veículos e máquinas do Combustível');
  assert.ok(b.includes("baseRel('RELATÓRIO DE REVISÕES E MANUTENÇÃO DA FROTA'") && b.includes("baseRel('FICHA DE MANUTENÇÃO DO VEÍCULO'") && b.includes('itensAcaoDoc('), 'relatórios no gerador de documentos (ver, imprimir, PDF, compartilhar)');
  assert.ok(app.includes("['#/frota','ferramenta','Revisões e manutenção',['frota','frRev','frPlano','frLeit'],'frota']"), 'no menu do Combustível');
  assert.ok(app.indexOf('<script id="frota-revisoes-v157">') > app.indexOf('<script id="pendencias-v81">'), 'vem depois das pendências (V81), onde ficam os avisos');
  const ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  if (ci) assert.ok(ci.includes('node scripts/testar-frota.mjs'), 'teste no navegador roda na conferência automática');
});

/* ---------- V152: variação de vendas por vendedor ---------- */
teste('variacoes', 'V152: variação de vendas por vendedor na aba Variações de Vendas, só leitura e sem mexer nas variações (V73) nem no Setor de Vendas', () => {
  const app = ler('app/jb-gestao.html');
  for (const id of ['<style id="variacoes-vendedor-v152-css">', '<script id="variacoes-vendedor-v152">']) assert.equal(app.split(id).length - 1, 1, id + ' uma vez só');
  const m = /<script id="variacoes-vendedor-v152">([\s\S]*?)<\/script>/.exec(app); const b = m[1];
  assert.ok(app.indexOf('<script id="variacoes-vendedor-v152">') > app.indexOf('<script id="variacoes-v73">'), 'vem depois das variações (V73), que ele completa');
  for (const proibido of ['gravar(', 'apagar(', 'atualizar(', 'gravarRegistro(', 'bucketPut(', 'registrarLog(', 'salvarCfg(', 'salvarPrefs(', 'localStorage', 'APP.db', 'jbcore', 'execute_sql', 'fetch(']) assert.ok(!b.includes(proibido), 'a seção só lê: não pode usar ' + proibido);
  assert.ok(!/\bDATA\b/.test(b), 'a seção não mexe nos dados carregados (lê as vendas por vendasFatV)');
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)/.test(b), 'navegação só pelo JBNAV');
  assert.ok(b.includes("const ROTA='setor-variacoes',SETOR='vendas',TITULO='Variação de vendas por vendedor';") && b.includes('const t0=TELAS_V[ROTA];') && b.includes('vendasFatV({ini:P.A.ini,fim:P.A.fim})'), 'na aba Variações de Vendas, com as mesmas vendas faturadas do cartão Faturamento');
  // as variações (V73) continuam com a mesma rota, as mesmas peças e o mesmo acesso (V85), sem nada da seção nova
  const v73 = /<script id="variacoes-v73">([\s\S]*?)<\/script>/.exec(app); assert.ok(v73, 'bloco das variações (V73)');
  assert.ok(v73[1].includes("const ROTA='setor-variacoes',ROTA_DP='dpvariacoes';") && v73[1].includes('window.VARIACOES_V73={SETS,ORDEM,setorVisivel,setoresVisiveis,val,comparar,fmt,VR,veVariacoes};') && v73[1].includes("const SO_ESTES=['u_FZmOBZqQYLD0VE7xkGL8AA','u_IUQfnrH8QROQdTs42EhcUQ'];"), 'variações (V73/V85) com a mesma rota, as mesmas peças e o mesmo acesso');
  assert.ok(!v73[1].includes('vvd') && !v73[1].includes('V152'), 'o bloco das variações (V73) não foi mexido para a seção nova');
  const ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  if (ci) assert.ok(ci.includes('node scripts/testar-variacoes-vendedor.mjs'), 'teste no navegador roda na conferência automática');
});

teste('lenha', 'V159: Contas a pagar da Lenha com um cartão por fornecedor (mesmos números, só leitura; Combustível e Vendas sem mudança)', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('const SEM_FORN_V='); const j = app.indexOf('/* ================= relatórios: a mesma tela de relatórios do sistema', i);
  assert.ok(i > 0 && j > i, 'trecho da V159 dentro dos setores operacionais');
  const b = app.slice(i, j);
  for (const proibido of ['gravar(', 'apagar(', 'gravarRegistro(', 'bucketPut(', 'registrarLog(', 'salvarCfg(', 'localStorage', 'location.hash', 'location.replace(', 'history.back(']) assert.ok(!b.includes(proibido), 'a tela só lê e navega pelo JBNAV: não pode usar ' + proibido);
  assert.ok(b.includes("const porForn=!venda&&s==='lenha';"), 'só o Setor da Lenha junta por fornecedor');
  assert.ok(b.includes('const fin=base.map(v=>{const f=finVenda(v);') && b.includes('saldo:round2(soma(ok,x=>x.f.saldo))'), 'o total do fornecedor é a soma do finVenda das compras (o mesmo número de antes)');
  assert.ok(b.includes('window.CPL_LENHA.abrirPagar(fid)') && b.includes("pode('fLenha','e')"), 'Pagar do cartão = PAGAR / DAR BAIXA do Financeiro, só para quem registra lá');
  assert.ok(b.includes('modalPagamentoV(v)') && b.includes('totalPorParteRel(O,rows.map(x=>x.v))'), 'compras de um fornecedor (e Combustível/Vendas) continuam com o Pagar de cada compra e o total por fornecedor no Exportar');
  // agrupamento: função pura com dados de exemplo
  const r2 = (v) => Math.round((+v || 0) * 100) / 100;
  const g = new Function('FORN', 'nomeFornecedor', 'parteSnap', 'cancV', 'round2', 'soma', b.slice(0, b.indexOf('function telaFinV(')) + ';return gruposFornV;')(
    (id) => ({ f1: { nome: 'VASCO' }, f2: { nome: 'EDUARDO' } })[id], (f) => (f ? f.nome : ''), (v) => v.fornecedor || {}, (v) => v.status === 'Cancelada', r2, (xs, fn) => xs.reduce((a, x) => a + (+fn(x) || 0), 0));
  const x = (id, forn, venc, total, pago, st, extra) => ({ v: { id, fornecedorId: forn, vencimento: venc, ...(extra || {}) }, f: { total, pago, saldo: r2(total - pago), status: st }, atraso: st === 'Vencido' ? 3 : 0 });
  const G = g([x('a', 'f1', '2026-11-20', 1672.45, 0, 'Vencido'), x('b', 'f2', '2026-11-23', 2284.8, 0, 'Pendente'), x('c', 'f1', '2026-11-21', 1797.25, 0, 'Vencido'), x('d', 'f1', '2026-11-23', 1789.45, 0, 'Pendente'), x('e', 'f1', '2026-11-22', 500, 0, 'Cancelado', { status: 'Cancelada' }), x('h', '', '2026-11-25', 100, 40, 'Parcial', { fornecedor: { nome: 'Avulso' } })]);
  assert.equal(G.length, 3, 'um grupo por fornecedor (sem fornecedor fica num grupo só)');
  assert.deepEqual([G[0].nome, G[0].n, G[0].nAb, G[0].nCanc, G[0].saldo, G[0].vencido, G[0].venc, G[0].st], ['VASCO', 3, 3, 1, 5259.15, 3469.7, '2026-11-20', 'Vencido'], 'VASCO: 3 compras somadas, cancelada fora da conta, vencimento mais antigo');
  assert.deepEqual([G[1].nome, G[1].saldo, G[1].st], ['EDUARDO', 2284.8, 'Pendente']);
  assert.deepEqual([G[2].fid, G[2].nome, G[2].saldo, G[2].st], ['__sem', 'Avulso', 60, 'Parcial'], 'compra sem fornecedor: grupo próprio, pagamento parcial');
  const ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  if (ci) assert.ok(ci.includes('node scripts/testar-pagar-lenha-fornecedor.mjs'), 'teste no navegador roda na conferência automática');
});

/* ---------- execução ---------- */
/* ---------- Centro de Inventário ---------- */
teste('inventario', 'programa: módulo presente e ligado à ponte do Claude pela função própria', () => {
  const app = ler('app/jb-gestao.html');
  for (const id of ['inv-estilos', 'inv-qr-gerador', 'inv-qr-leitor', 'inv-centro']) assert.ok(app.includes(`id="${id}"`), id);
  assert.ok(app.includes("inv.api_ponte("), 'a ponte chama inv.api_ponte');
  assert.ok(app.includes("JB_NUVEM_API.rpc('jb_inv'"), 'a nuvem chama jb_inv');
  assert.ok(!/localStorage\.setItem\([^)]*inv_(bens|dados)/.test(app), 'dados do inventário não ficam no navegador');
});
teste('inventario', 'setor da cerâmica (18/11/2026): sem cadastro nem escolha de empresa; a empresa única vem das Configurações', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('<script id="inv-centro">');
  assert.ok(i > 0, 'bloco do Centro de Inventário');
  const bloco = app.slice(i, app.indexOf('</script>', i));
  assert.ok(!bloco.includes("['empresas','Empresas'") && !bloco.includes('TELA.empresas'), 'sem a tela Empresas');
  assert.ok(!/Cadastrar empresa|Empresas cadastradas|Ver todas as empresas|Inventário individual por empresa|invEmpP|várias empresas/.test(bloco), 'nada de cadastro, contagem ou escolha de empresa');
  assert.ok(/function ctx\(\)\{return ''\}/.test(bloco), 'telas sem caixa de escolha de empresa');
  assert.ok(bloco.includes('function dadosCeramica(){') && bloco.includes('CFG.empresa'), 'a empresa única usa os dados das Configurações');
  assert.ok(bloco.includes("chamar('painel',{empresa_id:eid()})"), 'o painel é só o da cerâmica');
});
/* ---------- identidade documental (V111): um só lugar para logo, cabeçalho e rodapé de todos os documentos ---------- */
teste('documentos', 'identidade central: configuração única, logo sem imagem fixa nos geradores e padrão em todos os formatos', () => {
  const app = ler('app/jb-gestao.html');
  for (const f of ['function idDocs()', 'function carimboDoc(', 'function metaDoc(', 'function linhaInstDoc()', 'function rodInstDoc()', 'function htmlIdDocs(', 'function previaIdDocs(', 'function tituloFormalDoc(', 'function logoDocSrc()']) assert.ok(app.includes(f), 'falta ' + f);
  assert.ok(app.includes("sec('Identidade visual e documentos'"), 'seção nas Configurações');
  // a logo dos documentos vem só da configuração central (CFG.marcaImg) ou da logo oficial embutida; nenhum gerador traz imagem própria
  const fora = app.replace(/var LOGO_CC='data:image[^']+'/, '').split('\n').filter((l) => /addImage\(\s*'data:image|<img[^>]+class="fvd-logo"[^>]+src="data:image/.test(l));
  assert.equal(fora.length, 0, 'imagem fixa em gerador de documento');
  // tela, PDF e Word usam as mesmas peças centrais
  const trecho = (ini, fim) => { const i = app.indexOf(ini); assert.ok(i >= 0, ini); return app.slice(i, app.indexOf(fim, i + ini.length)); };
  const html = trecho('function htmlDoc(D,opc){', '\n/* ---------- PDF, no mesmo desenho'), pdf = trecho('function pdfDoc(D){', '\nconst nomeArqDoc='), word = trecho('function wordDoc(D){', '\nasync function baixarWordDoc');
  for (const [n, t] of [['tela', html], ['PDF', pdf], ['Word', word]]) for (const peca of ['carimboDoc(D)', 'metaDoc(D)', 'sobreTituloDoc(D)', 'rodapeDoc(D)', 'linhaCabDoc(D)']) assert.ok(t.includes(peca), n + ' sem ' + peca);
  // documentos com desenho próprio também passam pelo cabeçalho e rodapé centrais
  assert.ok(/function faixaPdf\(p,e,tit,sub\)\{[^\n]*\n return cabPdfCC\(/.test(app), 'inventário usa o cabeçalho central');
  assert.ok(trecho('function fichaFeriasPDF(fid){', '\n}\n').includes('cabPdfCC(') && trecho('function fichaFeriasPDF(fid){', '\n}\n').includes('rodPdfCC('), 'ficha de férias usa as peças centrais');
  // impressão: página A4 numerada só para a folha de documento; ticket térmico e etiquetas continuam com a página própria
  assert.ok(app.includes('#printDoc.folha{page:jbdoc}') && !/#printDoc\{page:jbdoc\}/.test(app), 'página A4 só para a folha');
  assert.ok(app.includes('counter(page) " de " counter(pages)'), 'numeração de páginas na impressão');
});
teste('documentos', 'comprovante do lançamento (V120): em todos os setores, inclusive o Pessoal, só leitura', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('<script id="comprovante-lanc-v120">'), j = app.indexOf('</script>', i);
  assert.ok(i > 0 && j > i, 'bloco do comprovante do lançamento');
  const bloco = app.slice(i, j);
  // telas do menu do DP e telas dos outros setores
  assert.ok(bloco.includes('MENU.forEach') && bloco.includes('return DPS.has(mod)||') && bloco.includes('ROTAS_SETOR.includes(mod)'), 'regra de setor');
  // só leitura: o bloco não grava, não apaga e não registra nada
  assert.ok(!/\b(gravar|apagar|registrarLog|salvarRegistro)\(|APP\.db\b|\.set\(|\.delete\(/.test(bloco), 'o comprovante não pode gravar nada');
  // sai do que está gravado e usa o visualizador central de documentos
  assert.ok(bloco.includes('Salve as alterações antes') && bloco.includes('verDoc(D)') && bloco.includes("baseRel("), 'usa o registro gravado e o padrão dos documentos');
  assert.ok(app.includes("COMP_LANC.botao(mod,st)") && app.includes("if(a==='comprovante')") && app.includes('data-a="comprovante"'), 'botão no lançamento e no compromisso do Financeiro');
});
teste('documentos', 'nomenclatura: títulos formais sem mudar os dados', () => {
  const app = ler('app/jb-gestao.html');
  const i = app.indexOf('const TITULOS_FORMAIS=['), j = app.indexOf('const CAB_FORMAL=', i);
  assert.ok(i > 0 && j > i);
  const { tituloFormalDoc } = new Function(app.slice(i, j) + ';return {tituloFormalDoc};')();
  assert.equal(tituloFormalDoc('Contas a pagar'), 'Relatório de Contas a Pagar');
  assert.equal(tituloFormalDoc('Custo da lenha mês a mês'), 'Demonstrativo Mensal do Custo da Lenha');
  assert.equal(tituloFormalDoc('1. Vendas por período · 01/11/2026 a 30/11/2026'), 'Relatório de vendas por período · 01/11/2026 a 30/11/2026');
  assert.equal(tituloFormalDoc('Relatório de contratos'), 'Relatório de contratos', 'o que já é formal não muda');
  assert.equal(tituloFormalDoc('Espelho de ponto (gerencial) · Fulano · 11/2026'), 'Espelho de Ponto (gerencial) · Fulano · 11/2026');
});
/* ---------- V120: documento de cada lançamento, Lançamentos do setor e tela padrão de relatórios ---------- */
teste('documentos', 'V120: Lançamentos do setor e documentos nos relatórios de todos os setores, só leitura, sem botão repetido', () => {
  const app = ler('app/jb-gestao.html');
  const trecho = (ini, fim) => { const i = app.indexOf(ini); assert.ok(i >= 0, ini); const j = app.indexOf(fim, i + ini.length); assert.ok(j > i, fim); return app.slice(i, j); };
  assert.equal(app.split('<script id="v120-relatorios-documentos">').length - 1, 1, 'bloco V120 uma vez só');
  assert.ok(app.indexOf('<script id="v120-relatorios-documentos">') > app.indexOf('<script id="custo-buscar-v115">'), 'bloco V120 depois de todos os setores');
  const bloco = trecho('<script id="v120-relatorios-documentos">', '</script>');
  // só leitura: o bloco não grava, não apaga e não registra nada
  for (const proibido of ['gravar(', 'apagar(', 'bucketPut(', 'gravarRegistro(', 'registrarLog(', '.set(', '.update(', '.delete(', 'salvarCfg(']) assert.ok(!bloco.includes(proibido), 'o bloco V120 não pode chamar ' + proibido);
  for (const s of ['dp', 'producao', 'financeiro', 'vendas', 'lenha', 'combustivel', 'almox', 'paletes', 'barro', 'fiscal']) assert.ok(new RegExp('\\n ' + s + ':\\(\\)=>').test(trecho('const FONTES_LANC={', 'function lancamentosSetor(')), 'Lançamentos do setor sem o setor ' + s);
  // a janela continua com um botão só (o Comprovante); os relatórios usam o mesmo documento
  assert.ok(!/abrirRegistro\s*=|abrirObrig\s*=|telaFicha\s*=/.test(bloco), 'o bloco V120 não põe outro botão na janela');
  assert.ok(bloco.includes('C.doc(mod,r)') && bloco.includes('C.docObrig(') && bloco.includes('const temDoc=mod=>!!MODS[mod]'), 'relatórios com o documento do botão Comprovante, em todos os setores');
  assert.ok(bloco.includes('sensDe(mod,id)') && bloco.includes('veSensivel()'), 'documento respeita os campos sigilosos');
  // tela padrão de relatórios: pesquisa, filtros, imprimir, compartilhar e linhas que abrem o lançamento
  const rel = trecho('function telaRelatorios(el,cfg){', '\n/* ================= configurações');
  for (const p of ['filtrosExtraRel(R,res,U)', 'data-x="imprimir"', 'data-x="compartilhar"', 'acaoLinhaRel(tr,', 'ligarFiltrosExtraRel(el,U)', "data-sem-total"]) assert.ok(rel.includes(p), 'telaRelatorios sem ' + p);
  const exp = trecho('function exportar(formato,nome,cols,rows,titulo,opc){', '/* CSV para o Excel');
  assert.ok(exp.includes("formato==='imprimir'") && exp.includes("formato==='compartilhar'"), 'exportar com Imprimir e Compartilhar');
  // setores com tela própria de relatórios passam para a tela padrão, com os mesmos cálculos
  assert.ok(trecho('function telaRelAlm(c){', '\n}\n').includes('dadosRelAlm()') && trecho('function telaRelAlm(c){', '\n}\n').includes('telaRelatorios(c,'), 'almoxarifado na tela padrão');
  assert.ok(trecho('function telaRelPal(c){', '\n}\n').includes('dadosRelPal()') && app.includes('function dadosRelPal(){'), 'paletes na tela padrão');
  assert.ok(trecho("function telaRel(c){\n if(UR.id&&UR.id!==URB._sinc", '\n}\n').includes('dadosRel()'), 'barro na tela padrão');
  assert.ok(app.includes("{ r: '#/setor-fiscal/relatorios', k: 'relatorios'") && app.includes('relatorios: relatoriosFis'), 'Setor Fiscal com Relatórios');
  // pesquisa e filtros de situação e responsável: mesma conta da tela, sem mexer nas linhas originais
  const ajudas = trecho('const REL_COL_SIT=', '\nconst linhaAbreRel=');
  const f = new Function('esc', 'semAcento', 'fData', 'fMoeda', 'fNum', 'fHm', ajudas + ';return {filtrosExtraRel};')(
    (x) => String(x), (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), (x) => x, (x) => 'R$ ' + x, (x) => String(x), (x) => String(x)).filtrosExtraRel;
  const res = { cols: [{ k: 'tipo', l: 'Tipo' }, { k: 'sit', l: 'Situação' }, { k: 'resp', l: 'Responsável' }], rows: [{ tipo: 'Vale', sit: 'Pago', resp: 'Ana' }, { tipo: 'Hora extra', sit: 'Pendente', resp: 'João' }, { tipo: 'Vale', sit: 'Pendente', resp: 'João' }] };
  const R = { f: ['periodo'] };
  let x = f(R, res, {});
  assert.equal(x.rows.length, 3); assert.ok(!x.ativo && /data-r="_sit"/.test(x.html) && /data-r="_resp"/.test(x.html) && /data-rbusca/.test(x.html));
  x = f(R, res, { _sit: 'Pendente' }); assert.equal(x.rows.length, 2); assert.ok(x.ativo);
  x = f(R, res, { _sit: 'Pendente', _resp: 'Ana' }); assert.equal(x.rows.length, 0);
  x = f(R, res, { _q: 'hóra' }); assert.deepEqual(x.rows.map((r) => r.tipo), ['Hora extra'], 'pesquisa sem diferença de acento');
  x = f({ f: ['usuario', 'stvenda'] }, res, {}); assert.ok(!/data-r="_sit"/.test(x.html) && !/data-r="_resp"/.test(x.html), 'relatório que já filtra situação e usuário não ganha filtro repetido');
  assert.equal(res.rows.length, 3, 'as linhas do relatório não mudam');
});
/* ---------- comprovante de entrega de lenha: conta com o fornecedor (pedido do Jeferson, 18/11/2026) ---------- */
teste('documentos', 'comprovante de entrega de lenha: saldo anterior + esta entrega = total devido ao fornecedor, só leitura', () => {
  const app = ler('app/jb-gestao.html');
  const trecho = (ini, fim) => { const i = app.indexOf(ini); assert.ok(i >= 0, ini); const j = app.indexOf(fim, i + ini.length); assert.ok(j > i, fim); return app.slice(i, j); };
  const fn = trecho('function contaFornLenhaV(v){', '\nfunction docEntregaLenhaV(v){');
  for (const proibido of ['gravar(', 'apagar(', 'bucketPut(', 'registrarLog(', '.set(', '.update(', '.delete(']) assert.ok(!fn.includes(proibido), 'a conta do comprovante não pode gravar nada: ' + proibido);
  const doc = trecho('function docEntregaLenhaV(v){', '\nfunction docRelLenhaDonoV(v){');
  assert.ok(doc.includes("total:['TOTAL DEVIDO',fMoeda(cf.total)]") && doc.includes("foot:['Total devido ao fornecedor',fMoeda(cf.total)]"), 'cupom e folha A4 com o total devido ao fornecedor');
  // o cupom (tela e PDF) desenha o total do bloco no mesmo destaque do total do cupom
  assert.ok(app.includes('${b.total?`<div class="cp-sep d"></div><div class="cp-total">') && app.includes('if(b.total){sep(1);lr(b.total[0],b.total[1],{b:1,s:fs+2.4})'), 'total do bloco no cupom (tela e PDF)');
  const r2 = (v) => Math.round((+v || 0) * 100) / 100;
  const montar = (win, DATA, finVenda) => new Function('ehLenhaV', 'cancV', 'round2', 'window', 'DATA', 'finVenda', 'console', fn + ';return contaFornLenhaV;')(
    (v) => !!(v && v.setor === 'lenha' && v.tipoOp === 'compra'), (v) => !!v && v.status === 'Cancelada', r2, win, DATA, finVenda, { warn() {} });
  const v = { id: 'e3', setor: 'lenha', tipoOp: 'compra', fornecedorId: 'f1', data: '2026-11-12', numero: 6, total: 300 };
  // com o Financeiro: os saldos do CPL_LENHA; mesmo dia conta pelo número; compromisso da conta entra pela data
  const conta = { saldo: 2075, credito: 0, ents: [{ id: 'e1', data: '2026-11-10', numero: 2, saldo: 1000 }, { id: 'e2', data: '2026-11-12', numero: 5, saldo: 500 }, { id: 'e3', data: '2026-11-12', numero: 6, saldo: 300 }, { id: 'e4', data: '2026-11-13', numero: 7, saldo: 200 }],
    tits: [{ data: '2026-11-11', saldo: 50 }, { data: '2026-11-14', saldo: 25 }] };
  let pedido = null;
  let f = montar({ CPL_LENHA: { conta: (fid) => { pedido = fid; return conta; } } }, { compras: [] }, () => ({ saldo: 0 }));
  let x = f(v);
  assert.equal(pedido, 'f1');
  assert.deepEqual([x.antes, x.esta, x.depois, x.total, x.credito], [1550, 300, 225, 2075, 0], 'antes 1.000 + 500 + 50 · esta 300 · depois 200 + 25');
  assert.equal(r2(x.antes + x.esta + x.depois), x.total, 'a conta fecha');
  // cancelada, importada do controle antigo, sem fornecedor ou fora da lenha: sem conta
  for (const w of [{ ...v, status: 'Cancelada' }, { ...v, historico: true }, { ...v, fornecedorId: '' }, { ...v, setor: 'combustivel' }]) assert.equal(f(w), null);
  // entrega que o Financeiro não conhece ou falha na conta: sem o quadro (o comprovante sai igual)
  assert.equal(f({ ...v, id: 'outra' }), null);
  assert.equal(montar({ CPL_LENHA: { conta: () => { throw new Error('falha'); } } }, { compras: [] }, () => ({ saldo: 0 }))(v), null);
  // crédito da cerâmica (adiantamento ou combustível acima do devido)
  x = montar({ CPL_LENHA: { conta: () => ({ saldo: 0, credito: 250, ents: [{ id: 'e3', data: '2026-11-12', numero: 6, saldo: 0 }], tits: [] }) } }, { compras: [] }, () => ({ saldo: 0 }))(v);
  assert.deepEqual([x.antes, x.esta, x.total, x.credito], [0, 0, 0, 250]);
  // sem o módulo do Financeiro: soma dos saldos das entregas do mesmo fornecedor (outras ficam de fora)
  const compras = [{ ...v, s: 300 }, { id: 'e1', setor: 'lenha', tipoOp: 'compra', fornecedorId: 'f1', data: '2026-11-10', numero: 2, s: 1000.1 },
    { id: 'e4', setor: 'lenha', tipoOp: 'compra', fornecedorId: 'f1', data: '2026-11-13', numero: 7, s: 200.2 }, { id: 'x1', setor: 'lenha', tipoOp: 'compra', fornecedorId: 'f2', data: '2026-11-10', numero: 3, s: 999 },
    { id: 'x2', setor: 'lenha', tipoOp: 'compra', fornecedorId: 'f1', data: '2026-11-10', numero: 4, s: 999, status: 'Cancelada' }, { id: 'x3', setor: 'lenha', tipoOp: 'compra', fornecedorId: 'f1', data: '2026-01-10', numero: 1, s: 999, historico: true },
    { id: 'x4', setor: 'combustivel', tipoOp: 'compra', fornecedorId: 'f1', data: '2026-11-10', numero: 8, s: 999 }];
  x = montar({}, { compras }, (c) => ({ saldo: c.s }))(v);
  assert.deepEqual([x.antes, x.esta, x.depois, x.total], [1000.1, 300, 200.2, 1500.3]);
});
/* =====================================================================
   Contratos com inteligência artificial (V125)
   ===================================================================== */
teste('contratos', 'aba Contratos: criação por pedido livre, biblioteca, base jurídica e documento assinado travado', () => {
  const app = ler('app/jb-gestao.html');
  assert.equal(app.split('function telaCentral(el){').length - 1, 1, 'uma só tela de Contratos no Setor Pessoal (a nova substitui a antiga)');
  for (const f of ['function telaCtIA(', 'function ctVerificar(', 'function ctRefs(', 'function ctAplicarOps(', 'async function ctRegistrarAssinatura(', 'function ctDerivar(', 'function ctDuplicar(', 'async function ctSalvarModelo(']) assert.ok(app.includes(f), f);
  assert.ok(app.includes('Criar contrato com inteligência artificial') && app.includes('Descreva o contrato ou documento que você precisa. Explique a finalidade, as condições, as obrigações e as informações que deseja incluir.'), 'campo de pedido livre com a orientação');
  assert.ok(app.includes("if(rec&&rec.modelo==='ia')return telaCtIA(el,rec);") && app.includes("if(r.id==='ia')return telaCtIA(el,null);"), 'o documento da IA abre pela mesma rota dos documentos');
  // regras que a IA recebe sempre
  const regras = app.slice(app.indexOf('function ctRegras(S){'), app.indexOf('function ctCtxPedido(S){'));
  for (const r of [/Não invente artigo, lei, decisão judicial nem obrigação/, /só cite lei, artigo, norma ou entendimento que esteja na BASE JURÍDICA/, /nunca escreva cláusula genérica para afastar direitos trabalhistas/, /\[PREENCHER: o que falta\]/, /Nunca diga que o documento substitui advogado/, /Não peça confirmação, não faça perguntas, não recuse por discordar/, /você não faz validação jurídica, só aponta pontos de atenção/, /\{\{empresa\.rep_cpf\}\}/]) assert.match(regras, r);
  assert.ok(!/s\.cpf|s\.rg|s\.endereco|s\.salario/.test(app.slice(app.indexOf('function ctCtxPedido(S){'), app.indexOf('function ctPromptInterpretar('))), 'dado pessoal do cadastro não entra no pedido à IA (só marcadores)');
  // base jurídica: toda referência com endereço oficial
  const base = app.slice(app.indexOf('const CT_BASE=['), app.indexOf('const ctBase=()=>'));
  const urls = base.match(/url:(CT_URL_C(C|LT)|'[^']+')/g) || [];
  assert.ok(urls.length >= 25, 'base jurídica encolheu: ' + urls.length);
  urls.forEach((u) => assert.match(u, /CT_URL_|'https:\/\/www\.(planalto\.gov\.br|gov\.br|tst\.jus\.br)/, 'endereço fora das fontes oficiais: ' + u));
  // assinatura só com comprovação; assinado não é alterado
  assert.match(app, /if\(s==='Assinado'\|\|s==='Vigente'\)return ctRegistrarAssinatura\(rec\);/);
  assert.match(app, /!o\.comprovante\?'Informe a comprovação da assinatura\.'/);
  assert.match(app, /if\(!novo&&CT_TRAVADO\(base\.status\)&&!opc\.forcar\)throw \{code:'travado'\};/);
  assert.ok(app.includes("if(r.x==='editar'&&podeDoc(m,'e')&&!CT_TRAVADO(rec.status))return telaEditorDoc(el,m,rec);"), 'documento antigo assinado também não abre para edição');
});
teste('contratos', 'formato do documento e operações de edição: o que a IA não citou fica letra por letra', () => {
  const app = ler('app/jb-gestao.html');
  const cod = app.slice(app.indexOf('const ctLinhas=t=>'), app.indexOf('/* ---------- marcadores: dado pessoal do cadastro não vai para a IA ---------- */'));
  const { ctLerDoc, ctEscreverDoc, ctAplicarOps } = new Function('clone', cod + ';return {ctLerDoc,ctEscreverDoc,ctAplicarOps};')((o) => (o == null ? o : JSON.parse(JSON.stringify(o))));
  const texto = 'Segue.\n@@TITULO: contrato de locação\n@@SUBTITULO: Código Civil, arts. 565 a 578\n@@CATEGORIA: civil\n@@VISUAL: contrato\n@@VINCULO: nao_se_aplica\n@@OUTRA-PARTE: Locadora X\n@@INICIO: 2026-12-01\n@@TERMINO: 31/12/2027\n@@PARTE: locatária\nRazão social: Empresa\nCNPJ: 11.222.333/0001-81\n@@PARTE: LOCADORA\nRazão social: Locadora X\n@@ABERTURA\nAs partes ajustam.\n@@CLAUSULA: Do objeto\nLocação de uma pá carregadeira.\na) com operador;\n@@CLAUSULA: Do preço\nR$ 1,00.\n@@CLAUSULA: Do foro\nForo local.\n@@FECHO\nAssinam.\n@@LOCAL-DATA: Cidade/UF, 1 de dezembro de 2026.\n@@ASSINATURA: Empresa | LOCATÁRIA\n@@ASSINATURA: Locadora X | LOCADORA\n@@TESTEMUNHAS: sim\n@@ANALISE-ATENCAO\n- Conferir o seguro.\n@@ALERTA-VINCULO\nnenhum\n@@FIM';
  const L = ctLerDoc(texto, { mapa: { '{{pessoa.cpf}}': '1' } });
  assert.equal(L.doc.titulo, 'CONTRATO DE LOCAÇÃO'); assert.equal(L.doc.clausulas.length, 3); assert.equal(L.doc.partes[0].papel, 'LOCATÁRIA');
  assert.deepEqual(L.doc.partes[0].campos[1], ['CNPJ', '11.222.333/0001-81'], 'o valor pode ter dois-pontos e barras');
  assert.equal(L.doc.inicio, '2026-12-01'); assert.equal(L.doc.termino, '', 'data fora do formato não vira vigência');
  assert.equal(L.doc.assinaturas.length, 2); assert.equal(L.doc.testemunhas, true); assert.deepEqual(L.analise.atencao, ['Conferir o seguro.']); assert.equal(L.analise.alertaVinculo, '');
  assert.deepEqual(L.doc.mapa, { '{{pessoa.cpf}}': '1' }, 'os marcadores acompanham o documento');
  assert.equal(ctLerDoc(texto.slice(0, texto.indexOf('@@CLAUSULA: Do preço'))).doc.clausulas.length, 1, 'texto ainda chegando também é lido');
  assert.deepEqual(ctLerDoc(ctEscreverDoc(L.doc)).doc.clausulas, L.doc.clausulas, 'ida e volta sem perda');
  const antes = JSON.stringify(L.doc);
  const r = ctAplicarOps(L.doc, '@@RESPOSTA\nFeito.\n@@ALTERAR-CLAUSULA: [2] | Do preço e do reajuste\nR$ 2,00.\n@@NOVA-CLAUSULA-APOS: 1 | Do seguro\nO bem terá seguro.\n@@REMOVER-CLAUSULA: 9\n@@ALTERAR-DATAS: termino=2027-12-31\n@@FIM');
  assert.equal(JSON.stringify(L.doc), antes, 'o documento original não é mexido');
  assert.deepEqual(r.doc.clausulas.map((c) => c.t), ['Do objeto', 'Do seguro', 'Do preço e do reajuste', 'Do foro']);
  assert.deepEqual(r.doc.clausulas[0], L.doc.clausulas[0]); assert.deepEqual(r.doc.clausulas[3], L.doc.clausulas[2]); assert.equal(r.doc.clausulas[2].x, 'R$ 2,00.');
  assert.equal(r.doc.termino, '2027-12-31'); assert.equal(r.resposta, 'Feito.'); assert.equal(r.mudancas.length, 3, 'número de cláusula que não existe é ignorado');
  assert.deepEqual(r.doc.partes, L.doc.partes); assert.equal(r.doc.abertura, L.doc.abertura); assert.equal(r.doc.fecho, L.doc.fecho);
  const e = ctAplicarOps(L.doc, 'A cláusula do foro diz onde uma ação seria julgada.');
  assert.equal(e.mexeu, false); assert.equal(e.resposta, 'A cláusula do foro diz onde uma ação seria julgada.'); assert.deepEqual(e.doc.clausulas, L.doc.clausulas);
  const rem = ctAplicarOps(L.doc, '@@REMOVER-CLAUSULA: 2\n@@FIM');
  assert.deepEqual(rem.doc.clausulas.map((c) => c.t), ['Do objeto', 'Do foro']);
});
teste('contratos', 'autonomia (V127): sem rodada de perguntas, sem etapa jurídica obrigatória e sem travas por limite legal', () => {
  const app = ler('app/jb-gestao.html');
  const enviar = app.slice(app.indexOf('async function ctEnviar(txt){'), app.indexOf('/* ---------- ditado por voz'));
  assert.ok(!enviar.includes('ctInterpretar(') && enviar.includes('return ctElaborar();') && enviar.includes('ctAcharPessoa('), 'o pedido vai direto para a redação, com a pessoa do cadastro');
  assert.ok(!app.includes("add(8,'Revisão por profissional'") && !app.includes('Consultando a base jurídica') && !app.includes("'Análise jurídica'"), 'nada de etapa ou aba de análise jurídica obrigatória');
  assert.ok(app.includes('O sistema não faz validação nem parecer jurídico'), 'a tela não afirma validação jurídica');
  const salvar = app.slice(app.indexOf('async function salvarEditorDoc('), app.indexOf('let DOC_APOS=null;'));
  assert.ok(!salvar.includes("'Campo obrigatório.'") && !salvar.includes('await confirmar(') && salvar.includes('avisos.push('), 'campo em branco e limite legal viram aviso, não trava');
  assert.ok(app.includes("if(st==='Pronto para assinar'){S.rec=await mudarStatusDoc(S.rec,'Rascunho')"), 'aguardando assinatura: altera e volta para rascunho');
  assert.match(app, /if\(!novo&&CT_TRAVADO\(base\.status\)&&!opc\.forcar\)throw \{code:'travado'\};/, 'documento assinado continua protegido');
  assert.ok(app.includes("data-ch=\"${esc(String(S.chave))}\"") && app.includes('function fvdRemendar(art,novoArt){'), 'tela fixa e documento remendado por partes');
});
teste('contratos', 'comandos simples na hora, sem IA: só o trecho pedido muda; na dúvida, o pedido segue para a IA', () => {
  const app = ler('app/jb-gestao.html');
  const cod = app.slice(app.indexOf('const CT_CL_PRONTAS=['), app.indexOf('/* pedidos pequenos vão para a IA no modo leve'));
  const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const { ctComandoLocal } = new Function('clone', 'semAcento', 'sMoeda', 'extensoMoeda', cod + ';return {ctComandoLocal};')(
    (o) => JSON.parse(JSON.stringify(o)), semAcento, (v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 }), (v) => 'por extenso ' + v);
  const doc = { titulo: 'CONTRATO DE TRABALHO', clausulas: [
    { t: 'Da função', x: 'O(A) EMPREGADO(A) exercerá a função de Forneiro, no setor Queima.' },
    { t: 'Do salário', x: 'O salário mensal é de R$ 1.850,00 (um mil oitocentos e cinquenta reais), pago até o 5º dia útil.' },
    { t: 'Da jornada', x: 'A jornada é de 44 horas semanais.' },
    { t: 'Das disposições gerais', x: 'Aplica-se a CLT.' }] };
  const antes = JSON.stringify(doc);
  let r = ctComandoLocal(doc, 'Altere o salário para R$ 2.800.');
  assert.ok(r && r.mexeu); assert.equal(JSON.stringify(doc), antes, 'o original não é mexido');
  assert.equal(r.doc.clausulas[1].x, 'O salário mensal é de R$ 2.800,00 (por extenso 2800), pago até o 5º dia útil.');
  [0, 2, 3].forEach((i) => assert.deepEqual(r.doc.clausulas[i], doc.clausulas[i], 'as outras cláusulas ficam letra por letra'));
  assert.equal(ctComandoLocal(doc, 'mude o salário para 2,8 mil').doc.clausulas[1].x.includes('R$ 2.800,00'), true);
  const marc = { titulo: 'X', clausulas: [{ t: 'Do salário', x: 'O salário é de {{pessoa.salario}}.' }] };
  assert.equal(ctComandoLocal(marc, 'Altere o salário para 3000').doc.clausulas[0].x, 'O salário é de R$ 3.000,00 (por extenso 3000).', 'troca também o marcador do cadastro');
  r = ctComandoLocal(doc, 'Mude o cargo para Auxiliar de Produção');
  assert.equal(r.doc.clausulas[0].x, 'O(A) EMPREGADO(A) exercerá a função de Auxiliar de Produção, no setor Queima.');
  r = ctComandoLocal(doc, 'Adicione uma cláusula de confidencialidade');
  assert.deepEqual(r.doc.clausulas.map((c) => c.t), ['Da função', 'Do salário', 'Da jornada', 'Da confidencialidade', 'Das disposições gerais'], 'entra antes das disposições gerais');
  const de = ctComandoLocal(r.doc, 'Adicione uma cláusula de confidencialidade');
  assert.ok(de && !de.mexeu && /já tem/.test(de.resposta), 'não duplica cláusula');
  assert.deepEqual(ctComandoLocal(doc, 'Retire a cláusula 3').doc.clausulas.map((c) => c.t), ['Da função', 'Do salário', 'Das disposições gerais']);
  assert.deepEqual(ctComandoLocal(doc, 'remova a cláusula da jornada').doc.clausulas.map((c) => c.t), ['Da função', 'Do salário', 'Das disposições gerais']);
  assert.deepEqual(ctComandoLocal(doc, 'tire a terceira cláusula').doc.clausulas.length, 3);
  assert.equal(ctComandoLocal(doc, 'Retire a cláusula 9').mexeu, false, 'cláusula que não existe: avisa e não mexe');
  assert.equal(ctComandoLocal(doc, 'Mude o título para contrato de experiência').doc.titulo, 'CONTRATO DE EXPERIÊNCIA');
  // na dúvida, não adivinha: segue para a IA
  const dois = { titulo: 'X', clausulas: [{ t: 'Do preço', x: 'Valor de R$ 100,00 e multa de R$ 50,00.' }] };
  const nasPartes = { titulo: 'X', partes: [{ papel: 'EMPREGADO(A)', campos: [['Salário', 'R$ 1.850,00']] }], clausulas: [{ t: 'Do salário', x: 'O salário é de R$ 1.850,00 (um mil oitocentos e cinquenta reais).' }] };
  const extensoSolto = { titulo: 'X', clausulas: [{ t: 'Do salário', x: 'O salário é de R$ 1.850,00 por mês (um mil oitocentos e cinquenta reais).' }] };
  const cargoComSetor = { titulo: 'X', clausulas: [{ t: 'Da função', x: 'Exercerá a função de Forneiro no setor de Queima, com zelo.' }] };
  for (const [d, p] of [[nasPartes, 'Altere o salário para 2800'], [extensoSolto, 'Altere o salário para 2800'], [cargoComSetor, 'Mude o cargo para Operador'], [doc, 'Mude o cargo para Operador a partir de 01/12'], [doc, 'Adicione uma cláusula de confidencialidade por 5 anos']])
    assert.equal(ctComandoLocal(d, p), null, 'alvo incerto ou pedido com condição própria vai para a IA: ' + p);
  for (const [d, p] of [[dois, 'Altere o valor para 200'], [doc, 'Adicione uma cláusula sobre uso do celular no trabalho'], [doc, 'Altere o salário para 2800 e inclua uma cláusula de sigilo'], [doc, 'Explique a cláusula 2?'], [doc, 'Melhore este contrato'], [doc, 'retire a cláusula das obrigações'], [doc, 'Mude a jornada para 40 horas']])
    assert.equal(ctComandoLocal(d, p), null, 'deveria ir para a IA: ' + p);
});
teste('contratos', 'pessoa do cadastro: só liga quando o nome é inconfundível (dado pessoal nunca vai para o contrato da pessoa errada)', () => {
  const app = ler('app/jb-gestao.html');
  const cod = app.slice(app.indexOf('function ctAcharPessoa(texto){'), app.indexOf('async function ctEnviar(txt){'));
  const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const DATA = { funcionarios: [
    { id: 'a', nome: 'João Pedro Barbosa', situacao: 'Ativo' }, { id: 'b', nome: 'Maria de Jesus Silva', situacao: 'Ativo' }, { id: 'c', nome: 'Maria de Jesus Costa', situacao: 'Ativo' },
    { id: 'd', nome: 'Ana Paula Souza', situacao: 'Ativo' }, { id: 'e', nome: 'Carlos Alberto Lima', situacao: 'Desligado' }, { id: 'f', nome: 'Raimundo', situacao: 'Ativo' }] };
  const { ctAcharPessoa } = new Function('DATA', 'filtroSetor', 'semAcento', cod + ';return {ctAcharPessoa};')(DATA, (l) => l, semAcento);
  const id = (t) => { const f = ctAcharPessoa(t); return f ? f.id : null; };
  assert.equal(id('Contrato de experiência de 45 dias para João Pedro Barbosa'), 'a', 'nome completo');
  assert.equal(id('contrato de experiência para o joão pedro, auxiliar de produção'), 'a', 'dois primeiros nomes, sem diferença de maiúscula ou acento');
  assert.equal(id('Contrato para João Pedro, Auxiliar de Produção'), 'a', 'vírgula depois do nome separa o cargo');
  assert.equal(id('Contrato para a Ana Paula com salário de R$ 2.000'), 'd');
  assert.equal(id('Contrato para João Pedro Almeida'), null, 'outro sobrenome: é outra pessoa');
  assert.equal(id('Contrato para João Pedro da Silva'), null, 'outro sobrenome depois de "da"');
  assert.equal(id('Contrato para Maria de Fátima'), null); assert.equal(id('Contrato para Maria de Jesus'), null, 'duas pessoas com o mesmo começo de nome: não escolhe');
  assert.equal(id('Contrato para Maria de Jesus Costa'), 'c');
  assert.equal(id('Contrato para o João'), null, 'só o primeiro nome não liga ninguém'); assert.equal(id('Contrato para o Raimundo'), null);
  assert.equal(id('Contrato para Carlos Alberto Lima'), null, 'desligado não entra'); assert.equal(id('Contrato de manutenção para uma empresa'), null);
});
teste('contratos', 'redator da nuvem: adaptador e função do servidor conferem a sessão e a permissão; a chave nunca vai para o navegador', () => {
  const app = ler('app/jb-gestao.html'), nv = ler('nuvem/jb-nuvem.js');
  assert.match(nv, /functions\/v1\/jb-contratos-ia/); assert.match(nv, /if \(nome === 'redator'\) \{ await pronto; return redator; \}/);
  assert.match(nv, /ler: function \(corpo, sinal, aoAndar\) \{ return pedirFluxo\(LEITOR, corpo, sinal, aoAndar\); \}/, 'a leitura por foto continua pelo mesmo caminho');
  assert.match(app, /if\(w&&typeof w\.use==='function'&&window\.JB_NUVEM\)\{try\{APP\.redator=await w\.use\('redator'\)/);
  assert.match(app, /APP\.redator\.escrever\(\{mensagens:input,rapido:!!o\.rapido,longo:!!o\.longo\}/);
  assert.match(app, /ctPromptElaborar\(S\)\}\],\{signal:S\.ctl\.signal,rapido:true,longo:true,tier:'complex'/, 'a redação pede resposta ligeira e comprida (o texto começa a chegar antes)');
  if (existsSync(join(RAIZ, 'supabase/functions/jb-contratos-ia/index.ts'))) {
    const fn = ler('supabase/functions/jb-contratos-ia/index.ts');
    assert.match(fn, /rpc\/jb_eu/, 'a sessão é conferida pela mesma regra do sistema');
    assert.match(fn, /!!eu\.admin \|\| \(!!\(p\.dp && p\.dp\.criar\) && !!\(p\.dp_sensivel && p\.dp_sensivel\.ler\)\)/, 'só quem cria no Setor Pessoal e vê dados pessoais');
    assert.match(fn, /Deno\.env\.get\("ANTHROPIC_API_KEY"\)/); assert.ok(!/sk-ant-[A-Za-z0-9]/.test(fn), 'nenhuma chave escrita na função');
    assert.match(fn, /includes\(MARCA\)/, 'só atende o pedido montado pelo programa'); assert.match(fn, /MAX_LETRAS/);
    assert.match(fn, /max_tokens: corpo\.rapido === true && corpo\.longo !== true \? 4000 : 32000,/, 'pedido rápido e comprido (redação) não é cortado em 4000');
    assert.match(fn, /application\/x-ndjson/); assert.match(fn, /cortado: msg\.stop_reason === "max_tokens"/); assert.match(fn, /cancel\(\) \{ parar\(\); \}/);
  }
});
teste('nuvem', 'acesso por setor (16/11/2026): cadastros de um setor guardados no módulo de outro chegam a quem trabalha no setor', () => {
  const app = ler('app/jb-gestao.html'), nv = ler('nuvem/jb-nuvem.js');
  assert.match(nv, /sb\.rpc\('jb_compartilhados'\)/, 'o adaptador pede ao servidor os cadastros compartilhados');
  assert.match(nv, /r\.error\.code === 'PGRST202' \|\| r\.error\.code === '42883'/, 'servidor sem a função: segue como antes (não trava a entrada)');
  assert.match(nv, /var comp = lerCompartilhados\(\)\.catch/, 'a carga completa já traz os compartilhados junto');
  assert.match(nv, /if \(!novo\.has\(k\)\) novo\.set\(k,/, 'documento que a pessoa lê inteiro nunca é trocado pela parte compartilhada');
  assert.match(nv, /parciais\.size\) atualizarCompartilhados\(\)/, 'coleção parcial (sem tempo real) é conferida ao voltar para a aba');
  assert.match(nv, /agendarCompartilhados\(p\.colecao\)/, 'depois de gravar, confere o que o servidor completou (ex.: número do compromisso)');
  assert.match(nv, /window\.JB_SETOR_SRV = function \(id\)/, 'setores sem acesso no servidor não aparecem na nuvem');
  assert.match(app, /const setorVisivel=s=>\(!s\.v\|\|s\.v\(\)\)&&\(typeof window\.JB_SETOR_SRV!=='function'\|\|window\.JB_SETOR_SRV\(s\.id\)!==false\);/, 'fora da nuvem a regra dos setores não muda');
  assert.match(app, /const ult=setorUlt\(\);const vis=SETORES\.filter\(setorVisivel\);/, 'tela de setores usa a mesma regra');
  assert.match(app, /const vis=SETORES\.filter\(typeof setorVisivel==='function'\?setorVisivel:/, 'trilho dos setores usa a mesma regra');
  if (existsSync(join(RAIZ, 'supabase/migrations/20261116150000_seg_compartilhar_setores.sql'))) {
    const m = ler('supabase/migrations/20261116150000_seg_compartilhar_setores.sql');
    assert.ok(existsSync(join(RAIZ, 'supabase/migrations/20261116150000_seg_compartilhar_setores.down.sql')), 'reversão descrita');
    assert.ok(!/\bdrop\b/i.test(m.replace(/--.*$/gm, '')), 'a migração só acrescenta (sem drop: pelo celular a confirmação não aparece)');
    assert.match(m, /revoke all on function public\.jb_compartilhados\(\) from public, anon;/);
    assert.match(m, /grant execute on function public\.jb_compartilhados\(\) to authenticated;/);
    const li = /function seg\.leitura_item[\s\S]*?\$function\$;/.exec(m)[0];
    assert.ok(!/'mei'|Mão de obra|Funcionários/.test(li), 'MEI e pagamento de pessoal nunca são compartilhados');
    assert.match(m, /v := v - 'saldoInicial' - 'dataSaldoInicial' - 'obs';/, 'conta compartilhada vai sem o saldo inicial');
    const fu = /'dados', jsonb_strip_nulls\(jsonb_build_object\(([\s\S]*?)\)\)\)\);/.exec(m)[1];
    assert.ok(!/sensivel|cpf|salario|obs|formaRemuneracao|telefone|email/i.test(fu), 'do funcionário só vão nome e função');
    assert.match(m, /\(ea and m_a is null\) or \(eb and m_b is null\) or \(ea and eb and m_a is distinct from m_b\)/, 'gravar item compartilhado: antes e depois do mesmo setor');
    assert.match(m, /pg_advisory_xact_lock\(hashtext\('jb-fin-numero'\)\)/, 'número do compromisso sem repetição');
  }
});
/* o pacote do publicador da nuvem não leva supabase/migrations: aí esta conferência fica para o repositório (GitHub Actions e antes do commit) */
if (existsSync(join(RAIZ, 'supabase/migrations/20261108233000_inv_01_centro_inventario.sql'))) teste('inventario', 'banco: só a função conferida é exposta, e só para usuário logado; histórico imutável', () => {
  const m = ler('supabase/migrations/20261108233000_inv_01_centro_inventario.sql');
  assert.ok(/revoke all on function public\.jb_inv\(text,jsonb\) from public,anon/.test(m));
  assert.ok(/grant execute on function public\.jb_inv\(text,jsonb\) to authenticated/.test(m));
  assert.ok(!/grant[^;]+schema inv/i.test(m), 'esquema inv não pode ser liberado');
  for (const t of ['auditoria', 'movimentacoes', 'leituras']) assert.ok(m.includes(`create trigger imutavel before update or delete on inv.${t}`), t);
  assert.ok(m.includes('unique (empresa_id,codigo_patrimonial)'), 'código único por empresa');
  assert.ok(existsSync(join(RAIZ, 'supabase/migrations/20261108233000_inv_01_centro_inventario.down.sql')), 'reversão descrita');
});
if (existsSync(join(RAIZ, 'supabase/migrations/20261119120000_inv_02_fotos_conferencia.sql'))) teste('inventario', 'banco (V139): fotos da conferência numa chamada só, só com create or replace, com reversão e sem mudar a resposta antiga', () => {
  const m = ler('supabase/migrations/20261119120000_inv_02_fotos_conferencia.sql');
  const d = ler('supabase/migrations/20261119120000_inv_02_fotos_conferencia.down.sql');
  const o = ler('supabase/migrations/20261108233000_inv_01_centro_inventario.sql');
  for (const [n, t] of [['migração', m], ['reversão', d]]) {
    assert.ok(!/\bdrop\b|\bdelete\b|\btruncate\b|\balter\b|\bgrant\b|\binsert\b|\bupdate\b/i.test(t.replace(/--.*$/gm, '')), n + ': só pode recriar a função (nada de apagar, alterar tabela, dar permissão ou mexer em dados)');
    assert.equal((t.match(/create or replace function/g) || []).length, 1, n + ': uma função só');
    assert.ok(t.includes('create or replace function inv.conferencia_resumo(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp'), n + ': mesma assinatura e mesmos atributos da função original');
  }
  assert.ok(m.includes('select seg.fazer_copia()') && m.includes('20261119120000_inv_02_fotos_conferencia.down.sql'), 'cabeçalho com a cópia de segurança e a reversão');
  assert.ok(/if coalesce\(d->>'fotos',''\) in \('true','t','1'\) then/.test(m), 'as fotos só vêm quando a tela pede');
  assert.ok(m.includes("a.entidade='leitura'") && m.includes('a.excluido_em is null and a.completo') && m.includes('a.empresa_id=v_emp'), 'só fotos de leitura, completas, não excluídas e da própria empresa');
  assert.ok(/least\(greatest\(.*,1\),200\)/.test(m), 'página limitada a 200 fotos');
  // a reversão devolve exatamente o corpo original; a migração mantém as três chaves de sempre
  const corpo = (t) => /create (?:or replace )?function inv\.conferencia_resumo\(d jsonb\)[\s\S]*?end \$\$;/.exec(t)[0].replace('create or replace function', 'create function');
  assert.equal(corpo(d), corpo(o), 'a reversão é a função original, letra por letra');
  for (const k of ["'progresso',inv.progresso(v_inv)", "'pendentes',(select coalesce(jsonb_agg(", "'ocorrencias',(select coalesce(jsonb_agg("]) assert.ok(m.includes(k), 'resposta antiga mantida: ' + k);
});
teste('inventario', 'programa (V139): fotos da conferência à vista e Estoque dentro do setor, sobre os dados do almoxarifado', () => {
  const app = ler('app/jb-gestao.html');
  const bloco = /<script id="inv-centro">([\s\S]*?)<\/script>/.exec(app)[1];
  // recorta uma função pelo começo dela e pelo começo da seguinte, para conferir DENTRO dela (e não num comentário qualquer)
  const trecho = (t, de, ate) => { const a = t.indexOf(de); assert.ok(a >= 0, 'não achei: ' + de); const b = t.indexOf(ate, a + de.length); assert.ok(b > a, 'não achei o fim: ' + ate); return t.slice(a, b); };
  assert.ok(bloco.includes("['estoque','Estoque','iEstoque']"), 'aba Estoque no Centro de Inventário');
  // fotos: caminho novo (uma chamada, só quando a tela pede) e caminho antigo (por leitura)
  const fotos = trecho(bloco, 'function fotosDe(id,aoMudar){', 'function pintaFotos(');
  assert.ok(fotos.includes("chamar('conferencia_resumo',Object.assign({empresa_id:eid(),inventario_id:id,fotos:true,fotos_limite:lim,fotos_pular:pular}"), 'fotos numa chamada só');
  assert.ok(fotos.includes("chamar('arquivos',{empresa_id:eid(),entidade:'leitura',registro_id:l.id})"), 'caminho antigo, leitura por leitura');
  assert.ok(fotos.includes('emFila(') && fotos.includes('conferir(){'), 'cargas em fila e conferência periódica leve');
  assert.ok(bloco.includes('function verArq(') && bloco.includes('function pintaFotos(') && bloco.includes('seloFt(FT.porItem[i.id])'), 'visualizador, quadro e selo de fotografias');
  assert.ok(/if\(!c\.isConnected\)\{clearInterval\(tm\)/.test(trecho(bloco, 'async function telaConf(c,id){', 'function tokenDe(')), 'a conferência para de consultar quando a tela sai');
  // Estoque: cada porta confere a permissão do almoxarifado dentro da própria função
  assert.ok(trecho(bloco, 'TELA.estoque=async function(c,p){', 'function estInicio(c){').includes("if(!pode('almEstoque')){"), 'ver o estoque exige a permissão do almoxarifado');
  assert.ok(trecho(bloco, 'function estSaida(itemId){', 'function estEntrada(itemId){').includes("if(!pode('almSaida','e')){"), 'saída exige permissão');
  assert.ok(trecho(bloco, 'function estEntrada(itemId){', 'function estMaterial(id,ini){').includes("if(!pode('almAjustes','e')){"), 'entrada exige permissão');
  assert.ok(trecho(bloco, 'function estMaterial(id,ini){', 'function estGrupo(id){').includes("if(!pode('almItens','e')){"), 'cadastro de material exige permissão');
  assert.ok(trecho(bloco, 'function estNovaContagem(){', 'function estContagem(c,id){').includes("if(!pode('almInventarios','e')){"), 'contagem exige permissão');
  // o Centro de Inventário não tem regra própria de gravação de saída, compra ou ajuste de contagem: usa as do almoxarifado
  assert.ok(!/(gravar|gravarRegistro|apagar)\('alm(Saidas|Entradas)'/.test(bloco), 'o Centro não grava saída nem compra por conta própria');
  assert.ok(bloco.includes('A.saidaRapida(') && bloco.includes('K.salvar(v,env)') && bloco.includes('K.fechar('), 'saída e contagem pelas funções do almoxarifado');
  assert.ok(/saidaRapida:saidaRapidaAlm,contagem:\{itens:itensDaContagem,difs:difsContagem,salvar:salvarContagemAlm,fechar:fecharContagemAlm\}/.test(app), 'o almoxarifado expõe a saída rápida e a contagem');
  const saida = trecho(app, 'async function saidaRapidaAlm(d){', 'const temCont=');
  assert.ok(/^async function saidaRapidaAlm\(d\)\{\s*if\(!pode\('almSaida','e'\)\)throw/.test(saida) && saida.includes('const r=conferirS(x);if(r.erros.length)throw') && saida.includes("reservarSeqV('numeracao/almSaidas'"), 'saída rápida: permissão, as regras da requisição e a numeração de lá');
  const salvar = trecho(app, 'async function salvarContagemAlm(v,mapa){', 'async function fecharContagemAlm(v,mapa){');
  assert.ok(/^async function salvarContagemAlm\(v,mapa\)\{\s*if\(!pode\('almInventarios','e'\)\)throw/.test(salvar) && salvar.includes("if(atual.status==='fechado')throw"), 'guardar contagem: permissão e contagem fechada travada');
  assert.ok(salvar.includes('else if(k in ct)ct[k]=null'), 'contagem apagada vai como null (a gravação junta campo a campo)');
  const fechar = trecho(app, 'async function fecharContagemAlm(v,mapa){', '/* ================= para os testes e para as telas');
  assert.ok(fechar.includes('const atual=await salvarContagemAlm(v,mapa);') && fechar.includes("const ja=DATA.almAjustes.filter(a=>a.inventarioId===atual.id)") && fechar.includes('delete RASC_INV[v.id]'), 'fechar contagem: vale o que está gravado e não repete ajuste de tentativa anterior');
  // a contagem da tela guarda só o que foi digitado nela e junta o que veio de outros aparelhos
  const cont = trecho(bloco, 'function estContagem(c,id){', '/* ---------- ligação com o resto do JB');
  assert.ok(cont.includes("if(!INV.rasc||INV.rasc.id!==id)INV.rasc={id,m:{}};") && cont.includes('const sinc=()=>{') && cont.includes('falhas<8'), 'rascunho só do que foi digitado, junção com o banco e fim das tentativas sem conexão');
});

teste('almox', 'Estoque / Produtos (V140): lista com saldo, cadastro por foto, saída marcando os produtos, cupom e relatórios sobre os mesmos dados', () => {
  /* a pasta .github não vai para a publicação da nuvem: lá esta conferência do CI é pulada */
  const app = ler('app/jb-gestao.html'), ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  const i = app.indexOf('/* ================= Estoque / Produtos (V140'); assert.ok(i > 0, 'bloco do Estoque / Produtos');
  const bloco = app.slice(i, app.indexOf('/* ================= para os testes e para as telas ================= */\nwindow.ALMOX_V52={', i));
  const fn = (de, ate) => { const a = bloco.indexOf(de); assert.ok(a >= 0, 'não achei: ' + de); const b = bloco.indexOf(ate, a + de.length); assert.ok(b > a, 'não achei o fim: ' + ate); return bloco.slice(a, b); };
  // rota, permissão, aba e o botão do início no lugar de "Grupos de materiais"
  assert.ok(app.includes('almGrupos:{v:AV,e:AE},almProdutos:{v:AV,e:AE},') && app.includes("'almGrupos','almProdutos'];") && app.includes("almProdutos:naA('almProdutos',telaProdutos)"), 'rota e permissão');
  assert.ok(app.includes("{r:'#/almProdutos',m:'almProdutos',ic:'caixa',l:'Estoque / Produtos',at:['almProdutos']}") && app.includes('href="#/almProdutos">${ic(\'caixa\')}Estoque / Produtos</a>'), 'aba e botão do início');
  // nada de saldo próprio: a saída é a requisição de verdade e a entrada é o ajuste com as regras de lá
  assert.ok(fn('function modalLancPr(tipo,pre){', 'function posLancPr(').includes('await saidaRapidaAlm({data,setor,') && !/gravar\('almSaidas'/.test(bloco), 'saída pela saída rápida do almoxarifado');
  assert.ok(/if\(sai&&!pode\('almSaida','e'\)\)\{toast/.test(bloco) && /if\(!sai&&!pode\('almAjustes','e'\)\)\{toast/.test(bloco) && /if\(!pode\('almItens','e'\)\)\{toast\('Seu perfil não cadastra produtos/.test(bloco), 'cada lançamento exige a permissão dele');
  assert.ok((bloco.match(/conferirRegistro\('almAjustes'/g) || []).length >= 4 && bloco.includes("conferirRegistro('almItens',st)") && bloco.includes("conferirRegistro('almGrupos',sg)"), 'ajustes, produtos e grupos passam pelas regras de cada cadastro');
  // cadastro por foto: não duplica (nome ou o que a IA reconheceu) e o leitor é o mesmo do lançamento por foto.
  // V146 (20/11/2026, pedido do Jeferson): o lançamento não tem mais o campo de código de barras (os itens antigos não têm).
  const foto = fn('function modalFotoPr(ini){', '/* depois de salvar: limpa');
  assert.ok(!foto.includes('fpRef') && foto.includes('normT(i.nome)===nm') && foto.includes("name=\"fpModo\" value=\"somar\"") && foto.includes("name=\"fpModo\" value=\"total\""), 'produto que já existe: soma ou acerta, não duplica; sem código de barras no lançamento');
  // V148: a limpeza também tem estoque próprio; a foto só é exigida no que fica no almoxarifado
  assert.ok(foto.includes("if(escCat(cat)==='alm'&&!blob){toast('Tire a foto do produto"), 'no almoxarifado o produto novo é cadastrado com foto (na cozinha e na limpeza a foto é opcional)');
  assert.ok(app.includes('window.ALM_IA_LER={motor:motorLeitura,semMotorTxt};') && foto.includes('window.ALM_IA_LER'), 'leitor da foto é o do lançamento por foto');
  // excluir entrada que já saiu do estoque é barrado
  assert.ok(fn('async function excluirAjPr(a){', '/* ---------- cadastrar por foto').includes("estI(x.itemId).saldo-(+x.qtd||0)<-1e-9"), 'excluir entrada não deixa saldo negativo');
  // cupom e relatórios: documentos de comprovante (ganham o cupom 80/58 mm) e de relatório
  assert.ok(bloco.includes("baseRel(ent?'COMPROVANTE DE ENTRADA NO ESTOQUE':'COMPROVANTE DE SAÍDA DO ESTOQUE'") && bloco.includes("baseRel('RELATÓRIO DE POSIÇÃO DO ESTOQUE'") && bloco.includes("baseRel('RELATÓRIO DE LANÇAMENTOS DO ESTOQUE'"), 'comprovantes e relatórios');
  if (ci) assert.ok(ci.includes('node scripts/testar-almox-produtos.mjs'), 'teste no navegador roda na conferência automática');
});

teste('fichas', 'Setor de Fichas e Documentação (V145): só a estrutura, sem ficha inventada, sem banco e sem painel', () => {
  /* a pasta .github não vai para a publicação da nuvem: lá esta conferência do CI é pulada */
  const app = ler('app/jb-gestao.html'), ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  const m = /<script id="fichas-doc-v145">([\s\S]*?)<\/script>/.exec(app); assert.ok(m, 'bloco do setor');
  assert.ok(app.includes('<style id="fichas-doc-v145-css">'), 'aparência do setor');
  const b = m[1];
  // setor no menu principal, rota de setor, tela e acesso só de leitura (não há o que editar)
  assert.ok(b.includes("const ID='fichas',ROTA='setor-fichas',H='#/'+ROTA;") && b.includes("const NOME='Setor de Fichas e Documentação';"), 'nome e rota');
  assert.ok(b.includes('PERM[ROTA]={v:[...TODOS,...PAP_NOVOS],e:[]};') && b.includes('if(!ROTAS_SETOR.includes(ROTA))ROTAS_SETOR.push(ROTA);') && b.includes('TELAS_V[ROTA]=el=>telaFichas(el);'), 'acesso, rota e tela');
  assert.ok(b.includes('SETORES.splice(i+1,0,card)') && b.includes('telaSetores=function(el){tsFD.apply(this,arguments);'), 'cartão na seleção de setores');
  // nenhuma ficha, categoria, campo ou modelo por suposição
  assert.ok(/\n const MODULOS=\[\];\n/.test(b) && /\n const CATEGORIAS=\[\];\n/.test(b) && !/(MODULOS|CATEGORIAS)\.(push|unshift|splice|concat)\(/.test(b), 'nenhuma ficha nem categoria cadastrada por suposição');
  // EM BREVE: exatamente a lista do dono
  const eb = /const EM_BREVE=\[([\s\S]*?)\];/.exec(b); assert.ok(eb, 'lista do que vem em breve');
  assert.deepEqual(eb[1].match(/'[^']+'/g).map((x) => x.slice(1, -1)), ['Emissão e impressão de fichas', 'Preenchimento de fichas', 'Digitalização por scanner ou fotografia',
    'Importação de arquivos e documentos', 'Leitura automática por OCR e inteligência artificial', 'Identificação de informações das fichas',
    'Atualização automática dos setores correspondentes', 'Histórico e armazenamento digital', 'Integração com Produção, Lenha, Combustível, Vendas e demais setores']);
  // não lê nem grava no banco, não guarda nada no navegador, não tem automação nem painel
  assert.ok(!/\b(gravar|apagar|atualizar|gravarRegistro|salvarCfg|salvarPrefs|chamar|fetch)\s*\(/.test(b) && !/jbcore|execute_sql|localStorage|indexedDB|\bDATA\b/.test(b), 'o setor não lê nem grava dados');
  assert.ok(!/\b(canvas|Chart|kpi|hero|setInterval)\b/.test(b), 'sem gráfico, indicador, painel ou rotina automática');
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)/.test(b), 'navegação só pelo JBNAV');
  // a página da ficha: as três partes; Emitir ficha em breve (só avisa)
  assert.ok(b.includes('<h3>Últimas emitidas</h3>') && b.includes('<h3>Informações</h3>') && b.includes('aria-disabled="true" data-fd-emitir') && b.includes("b.onclick=()=>toast('Emitir ficha: em breve."), 'últimas emitidas, informações e Emitir ficha (em breve)');
  if (ci) assert.ok(ci.includes('node scripts/testar-fichas.mjs'), 'teste no navegador roda na conferência automática');
});

teste('vidro', 'Visual "Vidro claro" em teste (V154): só aparência, só com a classe vis-vc e só para o dono que ligar a chave', () => {
  /* a pasta .github não vai para a publicação da nuvem: lá esta conferência do CI é pulada */
  const app = ler('app/jb-gestao.html'), ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  const m = /<style id="v154-vidro-claro">([\s\S]*?)<\/style>/.exec(app); assert.ok(m, 'bloco de aparência');
  const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '');
  // toda regra só vale com a classe vis-vc no <html>: sem a classe, ninguém vê nada diferente
  const semMedia = css.replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g, '$1');
  assert.ok(!semMedia.includes('@'), 'só regras comuns e @media');
  const regras = [...semMedia.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  assert.ok(regras.length >= 60, 'regras lidas (' + regras.length + ')');
  const partes = (sel) => { const out = []; let n = 0, a = ''; for (const ch of sel) { if (ch === '(') n++; if (ch === ')') n--; if (ch === ',' && n === 0) { out.push(a); a = ''; } else a += ch; } out.push(a); return out.map((x) => x.trim()).filter(Boolean); };
  for (const r of regras) for (const sel of partes(r[1])) assert.ok(/^html(\.vis-vc)+(\s|$)/.test(sel), 'regra fora da classe vis-vc: ' + sel);
  // só aparência: nada some, nada deixa de ser clicável, nada muda de lugar na pilha e nada vem de fora
  assert.ok(!/display\s*:\s*none|visibility\s*:|pointer-events|opacity\s*:|content\s*:|position\s*:|z-index|url\(|@import/.test(css), 'o visual não esconde, não trava e não busca nada de fora');
  // a classe só liga e desliga num lugar (aplicarVidro), que confere quem entrou; nada liga antes de saber quem é
  assert.equal(app.split("classList.toggle('vis-vc'").length - 1, 1, 'um lugar só liga e desliga a classe');
  assert.ok(!app.includes("classList.add('vis-vc')") && !/class(Name|List)[^;\n]{0,40}['"]vis-vc['"]/.test(app.replace("classList.toggle('vis-vc'", '')), 'nenhum outro caminho liga a classe');
  const j = /\/\* V154 · "Vidro claro" em teste[\s\S]*?(?=const _ligarAparenciaJB=ligarAparencia;)/.exec(app); assert.ok(j, 'bloco da chave');
  const b = j[0];
  // quem pode: o dono da aparência (config/aparencia → dono) e, no Claude, o dono do artifact; na nuvem ser administrador não basta
  assert.ok(b.includes("const vidroPode=()=>{try{ if(APP.modo==='local')return true; if(APP.uid&&APARENCIA&&APARENCIA.dono&&APARENCIA.dono===APP.uid)return true; return !vidroNuvem()&&!!APP.isOwner; }catch(e){return false}};"), 'regra de quem pode');
  assert.ok(b.includes('const vidroNuvem=()=>!!(window.JB_NUVEM||window.JB_NUVEM_API);'), 'reconhece a nuvem');
  assert.ok(b.includes("if(typeof forcar==='boolean')on=forcar&&vidroPode(); else if(sabe)on=vidroLigado(); else on=!!eu&&localStorage.getItem('jb_vidro')===eu;"), 'antes de o banco responder, só a mesma pessoa que ligou neste aparelho');
  assert.ok(b.includes('async function definirVidro(on){ if(!vidroPode())return;') && b.includes('if(!vidroPode())return base;'), 'quem não pode não liga nem vê a chave');
  // não há nome, login nem identificador de pessoa no código (repositório público)
  assert.ok(!/['"]u_[A-Za-z0-9]{6,}['"]|usuario\s*===?\s*['"]/.test(b), 'sem login nem identificador de pessoa no código');
  // o único dado gravado é a preferência do próprio usuário; o padrão de todos (config/aparencia) não é tocado
  assert.ok(!/\b(gravar|apagar|atualizar|gravarRegistro|salvarCfg|gravarVersao|chamar|fetch)\s*\(/.test(b) && !/\.set\(|VERSAO_LER/.test(b), 'não grava dados nem mexe no padrão de todos');
  assert.equal((b.match(/salvarPrefs\(/g) || []).length, 1); assert.ok(b.includes('salvarPrefs({vidroClaro:!!on})'), 'só a preferência vidroClaro do próprio usuário');
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)/.test(b), 'navegação só pelo JBNAV');
  // confere quem entrou antes de desenhar a primeira tela, e de novo quando chegam o dono da aparência e a preferência
  assert.ok(app.includes("if(document.readyState==='loading')await paginaLida();\n try{if(typeof aplicarVidro==='function')aplicarVidro()}catch(e){console.warn('vidro',e)}"), 'confere antes da primeira tela');
  assert.ok(app.includes("PREFS_OK=true;agendarVersao();atualizarSino();try{if(typeof aplicarVidro==='function')aplicarVidro()}catch(e){console.warn('vidro',e)}"), 'confere quando a preferência chega');
  assert.ok(b.includes("receberAparencia=function(){ const r=_receberAparenciaV154.apply(this,arguments); VIDRO_AP=true; try{aplicarVidro()}catch(e){console.warn('vidro',e)} return r; };"), 'confere quando o dono da aparência chega');
  if (ci) assert.ok(ci.includes('node scripts/testar-vidro-claro.mjs'), 'teste no navegador roda na conferência automática');
});

teste('vidro', 'Produção no visual "Vidro claro" em teste (V155): só com a chave, só nas telas da Produção, sem gravar nada', () => {
  const app = ler('app/jb-gestao.html'), ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  const m = /<style id="v155-vidro-producao">([\s\S]*?)<\/style>/.exec(app); assert.ok(m, 'aparência da V155');
  const css = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g, '$1');
  const partes = (sel) => { const out = []; let n = 0, a = ''; for (const ch of sel) { if (ch === '(') n++; if (ch === ')') n--; if (ch === ',' && n === 0) { out.push(a); a = ''; } else a += ch; } out.push(a); return out.map((x) => x.trim()).filter(Boolean); };
  const regras = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]; assert.ok(regras.length > 60, 'regras lidas');
  for (const r of regras) for (const sel of partes(r[1])) assert.ok(/^html(\.vis-vc)+ body\.vc-prod(\.vc-r-pcfg)?(\s|$|:)/.test(sel), 'regra fora da chave e da Produção: ' + sel);
  assert.ok(!/visibility\s*:|pointer-events|opacity\s*:|url\(|@import/.test(css), 'nada travado nem buscado de fora');
  /* o que some da vista é só enfeite: as barrinhas do gráfico antigo (trocadas pelo gráfico novo), ícones repetidos e a saudação duplicada */
  const somem = regras.filter((r) => /display\s*:\s*none/.test(r[2])).flatMap((r) => partes(r[1]).map((x) => x.replace(/^html(\.vis-vc)+ body\.vc-prod\s*/, '')));
  assert.deepEqual([...new Set(somem)].sort(), ['.pp-fluxo .pp-eti', '.pp-fluxo .pp-et:after', '.pp-fo .pp-foi', '.pp-hero .pp-spark', '.pp-ind2 .pp-k .pp-ki', '.spot.sv>.sv-topo>.spot-cab', '.sv-abas .aba-ind', '.sv-abas::-webkit-scrollbar', 'p.v83-saud', '.vc-tab .vc-ocm'].sort(), 'só enfeites somem da vista');
  const j = /<script id="v155-vidro-producao">([\s\S]*?)<\/script>/.exec(app); assert.ok(j, 'bloco da V155'); const b = j[1];
  assert.ok(b.includes("const ligado=()=>document.documentElement.matches('.vis-vc');") && b.includes("const on=ligado()&&doProd();") && b.includes("document.body.classList.toggle('vc-prod',on);"), 'só com a chave e só nas telas da Produção');
  assert.ok(!/classList\.(add|toggle|remove)\(\s*['"]vis-vc|className\s*\+?=[^;\n]*vis-vc/.test(b), 'não liga a chave por conta própria');
  assert.ok(!/\b(gravar|apagar|atualizar|gravarRegistro|salvarCfg|salvarPrefs|gravarVersao|chamar|fetch)\s*\(/.test(b) && !/\.set\(|localStorage|jbcore|execute_sql/.test(b), 'não grava nada');
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)/.test(b), 'navegação só pelo JBNAV');
  assert.ok(b.includes("const RAPIDO=[['pparadas','#/pparadas/novo','relogio','Registrar parada'],['pfornadas','#/pfornadas/novo','chama','Nova fornada'],['pdesenf','#/pdesenf/novo','saida','Desenforna']];") && b.includes("const rp=RAPIDO.filter(([m])=>pode(m,'e'));"), 'atalhos só para quem pode lançar, nos formulários de sempre');
  assert.ok(b.includes("acaoDocumento(doc,modo)") && b.includes("window.JB_MOV.montar('producao')") && b.includes("if(m&&PERM[m[1]]&&pode(m[1]))JBNAV.ir(r.ref)"), 'lançamentos do setor: os movimentos e comprovantes da V151, com a mesma permissão');
  assert.ok(b.includes("if(a!==ligado()&&typeof APP!=='undefined'&&APP.pronto&&typeof renderTela==='function')"), 'ligar ou desligar redesenha a tela inteira');
  if (ci) assert.ok(ci.includes('node scripts/testar-vidro-producao.mjs'), 'teste no navegador roda na conferência automática');
});

teste('grade', 'Controle de Produção por Grade (V156): coleções próprias, valor gravado em cada lançamento, nada apagado nem misturado', () => {
  const app = ler('app/jb-gestao.html'), ci = existsSync(join(RAIZ, '.github/workflows/verificar.yml')) ? ler('.github/workflows/verificar.yml') : null;
  assert.equal((app.match(/<script id="grade-v156">/g) || []).length, 1, 'um bloco só');
  assert.ok(app.includes('<style id="grade-v156-css">'), 'aparência do bloco');
  const b = /<script id="grade-v156">([\s\S]*?)<\/script>/.exec(app)[1];
  /* dados: só as duas coleções novas; lançamento e pagamento são tipos dentro de prodGrade */
  assert.ok(b.includes("const COL='prodGrade',COL_T='prodGradeTrab';") && b.includes("const TIPO={pgLanc:'lanc',pgPag:'pag'};"), 'coleções do controle');
  assert.ok(b.includes("if(TIPO[col])return g0(COL,{...rec,tipo:TIPO[col]},ant?{...ant,tipo:TIPO[col]}:ant);") && b.includes("if(col==='pgTrab')return g0(COL_T,rec,ant);") && b.includes('return g0.apply(this,arguments)};'), 'gravação desviada só para as coleções do controle; o resto do sistema grava como antes');
  /* não mistura com custos, despesas, contas a pagar, folha nem Controladoria */
  assert.ok(!/gravar(Registro)?\(\s*['"](fin|fTitulos|despesas|folhas|ctl|prodFab|producaoSetor|producao)['"]/.test(b) && !/sincronizarDespesa|despesa\s*:/.test(b), 'não grava em custo, despesa nem produção');
  /* cadastro sem valor por grade; o valor é digitado e guardado em cada lançamento */
  const trab = /MODS\.pgTrab=\{[\s\S]*?\nMODS\.pgLanc=/.exec(b); assert.ok(trab, 'cadastro do trabalhador');
  assert.ok(!/k:'(valor|valorGrade|preco)/.test(trab[0]), 'cadastro sem valor por grade');
  assert.ok(b.includes("const tot=l=>ehEmp(l)?r2(n0(l.valorEmp)):r2(n0(l.grades)*n0(l.valorGrade));"), 'total = grades × valor por grade do próprio lançamento (empreita do forno: a parte gravada nela)');
  /* nada é apagado: cancelamento e estorno com motivo; sem excluir nas listas */
  assert.equal((b.match(/semExcluir:true/g) || []).length, 3, 'trabalhadores, lançamentos e pagamentos sem excluir');
  assert.ok(b.includes('window.ACOES_FORM.pgCancelarLanc') && b.includes('window.ACOES_FORM.pgEstornarPag') && b.includes("cancelamento:{em:agora(),por:eu(),motivo:m}") && b.includes("estorno:{em:agora(),por:eu(),motivo:m}"), 'cancelar e estornar guardam quem, quando e o motivo');
  assert.ok(!/\bapagar\(\s*['"](pgLanc|pgPag|pgTrab)/.test(b), 'o controle não apaga registro');
  /* repetição e pagamento acima do saldo pedem confirmação */
  assert.ok(b.includes('já tem lançamento neste dia na') && b.includes('Este pagamento parece repetido') && b.includes("if(!$('#pgExcOk',v).checked)"), 'avisos de repetição e de pagamento acima do saldo');
  /* navegação só pelo JBNAV */
  assert.ok(!/location\.hash\s*=(?!=)|location\.replace\(|history\.back\(\)/.test(b), 'navegação só pelo JBNAV');
  /* ligações com o resto do programa (só acrescentam) */
  assert.ok(app.includes("function abasP(){return comExtrasP([") && app.includes("{r:'#/pcfg',m:'pcfg',ic:'engrenagem',l:'Configurações',at:['pcfg']}]).filter(a=>pode(a.m,a.e?'e':'v'))}")
    && app.includes("function comExtrasP(L){(window.PROD_ABAS_EXTRA||[]).forEach(a=>{const i=a.antes?L.findIndex(x=>x.r===a.antes):-1;if(i>=0)L.splice(i,0,a);else L.push(a)});return L}"), 'aba da Produção só acrescentada, as antigas na mesma ordem');
  /* V156.1 ("não apareceu"): a barra de abas fica desligada nos setores; o controle aparece também no painel e no Lançar */
  assert.ok(b.includes("antes:'#/prel'") && b.includes("window.PROD_LANC_EXTRA.push({k:'pgDia',m:'pgDia'") && b.includes('window.PROD_MES_EXTRA.push(cartaoMesProd)'), 'controle à vista: módulo antes de Relatórios, Lançar e cartão no painel');
  assert.ok(app.includes("].concat(window.PROD_LANC_EXTRA||[]).filter(x=>pode(x.m,'e'));") && app.includes("<div class=\"pp-ind2${mesX?' pp-ind2-x':''}\"><h3 class=\"pp-sub\">No mês · ${esc(fMes(N.m))}</h3>${mes}${mesX}${perdas}</div>"), 'pontos de extensão da Produção (só acrescentam)');
  assert.ok(app.includes("'pgrade','pgDia','pgEmp','pgLanc','pgTrab','pgPag','pgExtrato','pgRel'];   /* V156: Controle por grade é da Produção (V158: pgEmp, empreita do forno) */") && app.includes("'fMeta','fGrade'];   /* V156: Pagamento por grade */"), 'painel do dono: concessão e suspensão da Produção e do Financeiro valem para as telas novas');
  assert.ok(b.includes("window.FIN_ABAS_EXTRA.push({depois:'fOutros',r:'#/fGrade'"), 'módulo no Setor Financeiro');
  /* banco: as duas coleções registradas, com reversão e sem apagar nada
     (o pacote que vai para o Netlify não leva a pasta supabase/: a migração é conferida só no repositório) */
  if (existsSync(join(RAIZ, 'supabase/migrations'))) {
    const mig = join(RAIZ, 'supabase/migrations/20261123003000_seg_controle_grade.sql');
    assert.ok(existsSync(mig) && existsSync(mig.replace('.sql', '.down.sql')), 'migração com reversão');
    const sql = ler('supabase/migrations/20261123003000_seg_controle_grade.sql');
    assert.ok(sql.includes("('prodGradeTrab', 'producao', false, 'dados', true)") && sql.includes("('prodGrade',     'producao', true,  'dados', true)") && sql.includes("when p_raiz = 'prodGrade' and p_item->>'tipo' = 'pag' then 'financeiro'"), 'coleções do módulo Produção; o Financeiro grava só pagamentos');
    assert.ok(!/\b(drop|delete|truncate)\b/i.test(sql.replace(/--.*$/gm, '')), 'a migração só acrescenta');
  }
  if (ci) assert.ok(ci.includes('node scripts/testar-controle-grade.mjs'), 'teste no navegador roda na conferência automática');
});

teste('grade', 'Empreita do forno (V158): valor digitado em cada empreita, divisão que fecha, as duas formas de pagar e a empreita inteira cancelada junto', () => {
  const app = ler('app/jb-gestao.html');
  const b = /<script id="grade-v156">([\s\S]*?)<\/script>/.exec(app)[1];
  /* cada parte é um lançamento comum do controle, na Desenforna, com o valor gravado nela */
  assert.ok(b.includes("const SETOR_EMP='Desenforna';") && b.includes("const ehEmp=l=>!!(l&&l.emp&&typeof l.emp==='object');"), 'empreita é da Desenforna e se reconhece pelo campo emp');
  assert.ok(b.includes("gravarRegistro('pgLanc',{id:x.id,data:Pl.data,trabId:x.trabId,setor:SETOR_EMP,grades:0,valorGrade:0,valorEmp:x.valor,lote:Pl.emp.id,obs:Pl.obs,emp:clone(Pl.emp)},null,true)"), 'grava só no controle, como lançamento do trabalhador');
  assert.ok(!/fornoValor|valorForno|valorPorForno/.test(b), 'sem valor guardado por forno: o valor é digitado em cada empreita');
  /* divisão: partes iguais em centavos (a soma fecha) ou a parte de cada um, que tem que dar o valor da empreita */
  assert.ok(b.includes('const ct=Math.round(total*100),b=Math.floor(ct/n);let r=ct-b*n;'), 'partes iguais em centavos');
  assert.ok(b.includes('if(Math.abs(Q.falta)>=0.005){toast(') && b.includes("const z=Q.ids.filter(id=>!(Q.partes[id]>0));"), 'parte digitada: maior que zero e a soma tem que fechar');
  /* pagamento: cada peão a sua parte, ou tudo para um responsável do grupo (um lançamento só) */
  assert.ok(b.includes("const partes=Q.modo==='resp'?[{id:novoId(),trabId:Q.resp,valor:Q.total}]:membros.map(m=>({id:novoId(),trabId:m.id,valor:m.parte}));"), 'as duas formas de pagar');
  assert.ok(b.includes("if(EMP.modo==='resp'&&Q.ids.length>1&&!Q.resp)"), 'responsável escolhido entre os peões do grupo');
  /* repetição: os mesmos códigos numa nova tentativa; empreita do mesmo forno em dias próximos pede confirmação */
  assert.ok(b.includes('EMP.plano={data:d,emp,obs,partes,feitos:[]};') && b.includes('const falta=Pl.partes.filter(x=>!Pl.feitos.includes(x.id));'), 'nova tentativa não duplica');
  assert.ok(b.includes("'Já existe empreita do '") && b.includes('Math.abs(diasEntre(g.data,d))<=3'), 'aviso de empreita repetida');
  /* nada é apagado: a empreita inteira é cancelada (e reativada) junto, com motivo; a parte não muda sozinha */
  assert.ok(b.includes('window.ACOES_FORM.pgCancelarEmp') && b.includes('window.ACOES_FORM.pgReativarEmp') && b.includes('cancelamento:{em:agora(),por:eu(),motivo:m,empreita:true}'), 'cancelar e reativar a empreita inteira, com motivo');
  assert.ok(b.includes('Este lançamento é parte de uma empreita do forno: para mudar o dia, a pessoa ou o valor, cancele a empreita e lance de novo.'), 'a parte não muda de dia, pessoa ou valor');
  /* à vista: sub-aba, tela Lançar, painel, busca, extrato, recibo, relatórios e comprovante */
  assert.ok(b.includes("pgEmp:{v:PE,e:PE}") && b.includes("const ROTAS=['pgrade','pgDia','pgEmp',") && b.includes("['#/pgEmp','pgEmp','Empreita do forno',['pgEmp']]") && b.includes(" pgEmp:el=>shellProd(el,'pgEmp',telaEmp),"), 'tela registrada com a permissão de quem lança');
  assert.ok(b.includes("window.PROD_LANC_EXTRA.push({k:'pgEmp',m:'pgEmp'") && b.includes("b('#pgEmpB',()=>JBNAV.ir('#/pgEmp'))"), 'no Lançar da Produção e no painel do controle');
  assert.ok(b.includes("['emp','Empreitas do forno']") && b.includes('function docEmp(id)') && b.includes("if(mod==='pgLanc'&&ant&&ehEmp(ant)){verDoc(docEmp(ant.emp.id));return}"), 'relatório e comprovante da empreita');
  assert.ok(b.includes('const jaNoDia=(tid,d,s)=>DATA.pgLanc.filter(l=>!l.cancelamento&&!ehEmp(l)&&'), 'a empreita não conta como grade repetida do dia');
});

const escolhidos = testes.filter((t) => !filtro || t.grupo === filtro);
let ok = 0, falhou = 0;
const inicio = Date.now();
for (const t of escolhidos) {
  try { await t.fn(); ok++; console.log(`  ✔ [${t.grupo}] ${t.nome}`); }
  catch (e) { falhou++; console.log(`  ✘ [${t.grupo}] ${t.nome}\n      ${String(e && (e.stack || e.message) || e).split('\n').slice(0, 4).join('\n      ')}`); }
}
console.log(`\n${ok} de ${escolhidos.length} verificações passaram (${((Date.now() - inicio) / 1000).toFixed(1)} s).`);
if (falhou) console.log('PUBLICAÇÃO BLOQUEADA: corrija os itens marcados com ✘.');
process.exit(falhou ? 1 : 0);
