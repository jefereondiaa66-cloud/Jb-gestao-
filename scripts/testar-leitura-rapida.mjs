#!/usr/bin/env node
// Teste da leitura por foto "aos poucos" (V109), sem sair para a internet:
//   A. a função do servidor de verdade (supabase/functions/jb-ler-documento), rodando no Deno, com o
//      serviço de IA e a conferência de acesso simulados: acorda com GET, responde inteira (como antes),
//      responde aos poucos quando pedido, e interrompe a IA quando a pessoa cancela.
//      Precisa do Deno instalado; sem ele, esta parte é pulada.
//   B. o adaptador da nuvem de verdade (bloco "leitor" de nuvem/jb-nuvem.js): junta os pedaços, avisa o
//      andamento, devolve o texto final, traduz erro e cancelamento, e continua aceitando a resposta inteira.
// Uso: node scripts/testar-leitura-rapida.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { RAIZ } from './construir.mjs';

let falhas = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) falhas++; };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const LEITURA = '{"tipoDocumento":"cupom","itens":[{"descricao":"CIMENTO CP II 50KG","quantidade":10,"valorTotal":385,"confianca":"alta"},{"descricao":"AREIA MEDIA M3","quantidade":2,"valorTotal":240,"confianca":"alta"}],"valores":{"total":625},"pagamento":{"situacao":"pago"}}';
const PEDACOS = LEITURA.match(/[\s\S]{1,40}/g);

/* ---------- serviços simulados: conferência de acesso do JB e serviço de IA ---------- */
const visto = { ia: 0, iaFechouCedo: 0, corpoIa: null, modo: 'normal', intervalo: 60 };
const falso = createServer((req, res) => {
  let corpo = '';
  req.on('data', (d) => { corpo += d; });
  req.on('end', async () => {
    if (req.url.startsWith('/rest/v1/rpc/jb_eu')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ uid: 'u_teste', admin: false, permissoes: { almox: { criar: true } } }));
      return;
    }
    if (req.url.startsWith('/v1/messages')) {
      visto.ia++; visto.corpoIa = JSON.parse(corpo || '{}');
      if (visto.modo === 'erro') { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' }); res.end(JSON.stringify({ type: 'error', error: { type: 'rate_limit_error', message: 'devagar' } })); return; }
      let terminou = false;
      res.on('close', () => { if (!terminou) visto.iaFechouCedo++; });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const ev = (tipo, dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...dados })}\n\n`);
      ev('message_start', { message: { id: 'msg_teste', type: 'message', role: 'assistant', model: 'modelo-de-teste', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } } });
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      for (const p of PEDACOS) { if (res.destroyed) return; ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: p } }); await esperar(visto.intervalo); }
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 80 } });
      ev('message_stop', {});
      terminou = true; res.end();
      return;
    }
    res.writeHead(404); res.end();
  });
});
await new Promise((r) => falso.listen(0, '127.0.0.1', r));
const FALSO = `http://127.0.0.1:${falso.address().port}`;

let deno = null, FUNCAO = '';
try {
  /* ================= A. a função do servidor ================= */
  console.log('A. função do servidor (jb-ler-documento)');
  const temDeno = spawnSync('deno', ['--version'], { encoding: 'utf8' }).status === 0;
  if (!temDeno) console.log('  - pulado: Deno não está instalado nesta máquina');
  else {
    const porta = 20000 + Math.floor(Math.random() * 20000);
    deno = spawn('deno', ['run', '--allow-net', '--allow-env', '--allow-read', '--allow-sys', join(RAIZ, 'supabase/functions/jb-ler-documento/index.ts')], {
      env: { ...process.env, SUPABASE_URL: FALSO, SUPABASE_ANON_KEY: 'anon', ANTHROPIC_API_KEY: 'sk-ant-chave-de-teste', ANTHROPIC_BASE_URL: FALSO, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${porta}`, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let saidaDeno = ''; deno.stdout.on('data', (d) => { saidaDeno += d; }); deno.stderr.on('data', (d) => { saidaDeno += d; });
    FUNCAO = `http://127.0.0.1:${porta}`;
    let subiu = false;
    for (let i = 0; i < 600 && !subiu; i++) { try { const r = await fetch(FUNCAO, { method: 'OPTIONS' }); subiu = r.status === 204; } catch { await esperar(200); } if (deno.exitCode != null) break; }
    ok(subiu, 'a função sobe e responde' + (subiu ? '' : ': ' + saidaDeno.slice(-600)));
    if (subiu) {
      const cab = { 'content-type': 'application/json', authorization: 'Bearer sessao-de-teste' };
      const pagina = { tipo: 'image/jpeg', dados: Buffer.from('foto').toString('base64') };

      const g = await fetch(FUNCAO, { headers: cab }); const gj = await g.json();
      ok(g.status === 200 && gj.ok === true && gj.pronto === true && visto.ia === 0, 'GET só acorda a função: não chama a IA');

      const semSessao = await fetch(FUNCAO, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      ok(semSessao.status === 401, 'sem sessão não lê');

      const r1 = await fetch(FUNCAO, { method: 'POST', headers: cab, body: JSON.stringify({ prompt: 'leia', paginas: [pagina] }) });
      const j1 = await r1.json();
      ok(r1.status === 200 && /json/.test(r1.headers.get('content-type')) && j1.ok && j1.texto === LEITURA, 'sem "fluxo" responde inteira, como antes (programa antigo continua funcionando)');
      ok(visto.corpoIa && visto.corpoIa.stream === true && visto.corpoIa.output_config && visto.corpoIa.output_config.effort === 'medium' && visto.corpoIa.messages[0].content.length === 2, 'pedido à IA: mesmas configurações de leitura (esforço médio, imagem + pedido)');

      const r2 = await fetch(FUNCAO, { method: 'POST', headers: cab, body: JSON.stringify({ prompt: 'leia', paginas: [pagina], fluxo: true }) });
      ok(r2.status === 200 && /ndjson/.test(r2.headers.get('content-type')), 'com "fluxo" responde aos poucos');
      const chegadas = []; const dec = new TextDecoder(); let resto = '';
      for await (const pedaco of r2.body) { resto += dec.decode(pedaco, { stream: true }); let q; while ((q = resto.indexOf('\n')) >= 0) { chegadas.push({ ...JSON.parse(resto.slice(0, q)), em: Date.now() }); resto = resto.slice(q + 1); } }
      const textos = chegadas.filter((c) => c.t === 'texto'), fim = chegadas[chegadas.length - 1];
      ok(chegadas[0].t === 'inicio' && textos.length >= 2 && fim.t === 'fim', `chega o início, ${textos.length} pedaços de texto e o fim`);
      ok(textos.map((c) => c.d).join('') === LEITURA && fim.texto === LEITURA && fim.ok === true, 'os pedaços juntos e o texto final são a leitura completa');
      ok(fim.em - textos[0].em > 150, 'o primeiro pedaço chega bem antes do fim (não fica guardado até acabar)');

      visto.modo = 'erro';
      const r3 = await fetch(FUNCAO, { method: 'POST', headers: cab, body: JSON.stringify({ prompt: 'leia', paginas: [pagina], fluxo: true }) });
      const l3 = (await r3.text()).trim().split('\n').map((l) => JSON.parse(l));
      ok(l3[l3.length - 1].t === 'erro' && l3[l3.length - 1].erro === 'rate_limited' && /Muitas leituras/.test(l3[l3.length - 1].mensagem), 'erro da IA chega como linha de erro, com a mensagem em português');
      visto.modo = 'normal';

      visto.intervalo = 400; const antes = visto.iaFechouCedo; const ctl = new AbortController();
      const r4 = await fetch(FUNCAO, { method: 'POST', headers: cab, signal: ctl.signal, body: JSON.stringify({ prompt: 'leia', paginas: [pagina], fluxo: true }) });
      const leitor = r4.body.getReader(); await leitor.read(); await esperar(500); ctl.abort();
      let parou = false; for (let i = 0; i < 40 && !parou; i++) { await esperar(100); parou = visto.iaFechouCedo > antes; }
      ok(parou, 'cancelar no meio interrompe o pedido à IA (não gasta a leitura inteira)');
      visto.intervalo = 60;
    }
  }

  /* ================= B. o adaptador da nuvem ================= */
  console.log('B. adaptador da nuvem (nuvem/jb-nuvem.js → leitor)');
  const nv = readFileSync(join(RAIZ, 'nuvem/jb-nuvem.js'), 'utf8');
  const a = nv.indexOf('  var aquecido = 0;'), b = nv.indexOf('  /* serviço fiscal');
  ok(a > 0 && b > a, 'bloco do leitor encontrado no adaptador');
  const montar = (buscar) => {
    const caixa = { fetch: buscar, TextDecoder, Object, Date, JSON, Promise, Error, LEITOR: 'http://leitor.teste/', SB_CHAVE: 'anon', sessao: { access_token: 'sessao-de-teste' }, pronto: Promise.resolve(),
      atividade: () => {}, erro: (code, message) => { const e = new Error(message || code); e.code = code; return e; }, saida: null };
    vm.runInNewContext(nv.slice(a, b) + '\nsaida = leitor;', caixa);
    return caixa.saida;
  };
  const respostaAosPoucos = (linhas, { cortar = false, espera = 5 } = {}) => async (url, o) => {
    const cod = new TextEncoder(); const tudo = linhas.map((l) => JSON.stringify(l) + '\n').join('');
    const corpo = new ReadableStream({ async start(c) {
      // pedaços que quebram no meio das linhas, como na rede de verdade
      for (let i = 0; i < tudo.length; i += 37) { if (o.signal && o.signal.aborted) { c.error(new DOMException('cancelado', 'AbortError')); return; } c.enqueue(cod.encode(tudo.slice(i, i + 37))); await esperar(espera); }
      if (cortar) c.error(new TypeError('rede caiu')); else c.close();
    } });
    return new Response(corpo, { status: 200, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
  };
  const linhasBoas = [{ t: 'inicio' }, ...PEDACOS.map((d) => ({ t: 'texto', d })), { t: 'pulso' }, { t: 'fim', ok: true, texto: LEITURA, modelo: 'modelo-de-teste' }];

  { const pedidos = []; const l = montar(async (u, o) => { pedidos.push(JSON.parse(o.body)); return respostaAosPoucos(linhasBoas)(u, o); });
    const passos = []; const r = await l.ler({ prompt: 'leia', paginas: [] }, undefined, (x) => passos.push(x.texto));
    ok(pedidos[0].fluxo === true, 'com andamento, o pedido vai marcado como "fluxo"');
    ok(r.ok && r.texto === LEITURA && r.modelo === 'modelo-de-teste', 'devolve a leitura completa no fim');
    ok(passos.length >= 3 && passos[0] === '' && passos[passos.length - 1] === LEITURA && passos.every((p, i) => !i || p.startsWith(passos[i - 1])), 'o andamento cresce pedaço a pedaço até o texto inteiro'); }

  { const pedidos = []; const l = montar(async (u, o) => { pedidos.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true, texto: LEITURA, modelo: 'm' }), { status: 200, headers: { 'content-type': 'application/json' } }); });
    const semAndamento = await l.ler({ prompt: 'leia', paginas: [] });
    const funcaoAntiga = await l.ler({ prompt: 'leia', paginas: [] }, undefined, () => {});
    ok(!('fluxo' in pedidos[0]) && semAndamento.texto === LEITURA, 'sem andamento, pede e recebe a resposta inteira (como antes)');
    ok(funcaoAntiga.texto === LEITURA, 'se o servidor responder inteiro mesmo assim (função antiga), também funciona'); }

  { const l = montar(respostaAosPoucos([{ t: 'inicio' }, { t: 'erro', status: 422, erro: 'recusado', mensagem: 'A IA não leu esta imagem.' }]));
    const e = await l.ler({}, undefined, () => {}).catch((x) => x);
    ok(e && e.code === 'recusado' && /não leu/.test(e.message), 'linha de erro vira o erro certo para a tela'); }

  { const l = montar(respostaAosPoucos(linhasBoas.slice(0, 3), { cortar: true }));
    const e = await l.ler({}, undefined, () => {}).catch((x) => x);
    ok(e && e.code === 'rede' && /caiu|interrompida/.test(e.message), 'conexão que cai no meio vira aviso de rede (não trava nem inventa leitura)'); }

  { const l = montar(respostaAosPoucos(linhasBoas.slice(0, 4)));
    const e = await l.ler({}, undefined, () => {}).catch((x) => x);
    ok(e && e.code === 'rede', 'resposta que termina sem o fim não é aceita como leitura'); }

  { const ctl = new AbortController(); const l = montar(respostaAosPoucos(linhasBoas, { espera: 40 }));
    const p = l.ler({}, ctl.signal, () => {}).catch((x) => x); await esperar(120); ctl.abort(); const e = await p;
    ok(e && e.code === 'cancelado', 'parar a leitura no meio devolve "cancelado"'); }

  { const l = montar(async () => new Response(JSON.stringify({ erro: 'sem_chave', mensagem: 'falta a chave' }), { status: 503, headers: { 'content-type': 'application/json' } }));
    const e = await l.ler({}, undefined, () => {}).catch((x) => x);
    ok(e && e.code === 'sem_chave' && e.message === 'falta a chave', 'erro antes de começar (resposta comum) continua igual'); }

  { let n = 0; const l = montar(async (u, o) => { n++; return new Response('{"ok":true}', { status: 200 }); });
    l.aquecer(); l.aquecer(); await esperar(30);
    ok(n === 1, 'acordar o servidor: uma chamada só, mesmo abrindo a tela várias vezes'); }

  if (FUNCAO) {
    const l = montar((u, o) => fetch(FUNCAO, o)); const passos = [];
    const r = await l.ler({ prompt: 'leia', paginas: [{ tipo: 'image/jpeg', dados: Buffer.from('foto').toString('base64') }] }, undefined, (x) => passos.push(x.texto.length));
    ok(r.texto === LEITURA && passos.length >= 3, `adaptador + função juntos: leitura completa com ${passos.length} avisos de andamento`);
  }
} finally {
  if (deno) deno.kill('SIGKILL');
  falso.close(); if (falso.closeAllConnections) falso.closeAllConnections();
}
console.log(falhas ? `\nLeitura rápida: ${falhas} falha(s).` : '\nLeitura rápida: tudo certo.');
process.exit(falhas ? 1 : 0);
