#!/usr/bin/env node
// Teste de ponta a ponta do módulo Revisões e manutenção da frota (V157, Setor de Combustível),
// no navegador, com o programa REAL (saida/claude.html) e o banco central simulado
// (scripts/lib/servidor-falso.mjs). Dados de teste, só em memória.
// Confere: leitura atual pelos abastecimentos, revisão que programa a próxima sozinha, situação
// verde/amarelo/vermelho, foto do painel, validações, "Marcar como feita", volta para a ficha,
// pendências, relatórios, nada apagado e nenhuma coleção nova (tudo na clCtrl).
//
// Uso: node scripts/construir.mjs && node scripts/testar-frota.mjs
// FOTOS=<pasta> guarda capturas das telas (computador e celular).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');

const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const docs = [
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['produtos', 'p_s10', { id: 'p_s10', setor: 'combustivel', nome: 'Diesel S10', unidade: 'L', controlaEstoque: 'Sim', situacao: 'Ativo', tipoItem: 'Combustível', tipoComb: 'Diesel' }],
  ['locais', 'l_cam', { id: 'l_cam', setor: 'combustivel', nome: 'Caminhão Teste 01', tipo: 'Caminhão', identificacao: 'ABC1D23', controleUso: 'Hodômetro (km)', situacao: 'Ativo', responsavel: 'Motorista Teste', revIntervalo: 5000, revMeses: 6 }],
  ['locais', 'l_emp', { id: 'l_emp', setor: 'combustivel', nome: 'Empilhadeira Teste', tipo: 'Empilhadeira', controleUso: 'Horímetro (horas)', situacao: 'Ativo', revIntervalo: 250 }],
  ['locais', 'l_forno', { id: 'l_forno', setor: 'lenha', nome: 'Forno 1', tipo: 'Forno', situacao: 'Ativo' }],
];

const http = createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;

const browser = await chromium.launch();
const resultados = [];
let falhas = 0;
const ok = (c, m) => { resultados.push([c ? 'ok' : 'FALHOU', m]); console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; };
const naoExec = (m) => { resultados.push(['não executado', m]); console.log(`  – NÃO EXECUTADO: ${m}`); };
try {
  const ctx = await browser.newContext();
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(String(e && e.message)));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(({ codigo, docs }) => {
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado, null, { timeout: 30000 });

  /* utilidades dentro da página */
  await page.evaluate(() => {
    window.T = {
      esperar: async (f, ms = 8000) => { const fim = Date.now() + ms; while (Date.now() < fim) { try { if (f()) return true; } catch (e) {} await new Promise((r) => setTimeout(r, 40)); } throw new Error('esperou demais: ' + f + ' | rota ' + location.hash + ' | janela: ' + ((document.querySelector('.veu .modal') || {}).textContent || '—').slice(0, 160) + ' | gaveta: ' + (GAV ? GAV.mod + '/' + GAV.id + (GAV.sujo ? ' (alterada)' : '') : '—')); },
      dorme: (ms) => new Promise((r) => setTimeout(r, ms)),
      /* o que está no banco central (simulado), seja documento solto ou agrupado */
      banco: (col) => { const out = []; window.__srv.estado.docs.forEach((d) => { if (d.colecao !== col) return; if (d.dados && d.dados.items) Object.entries(d.dados.items).forEach(([id, v]) => { if (v) out.push({ ...v, id }); }); else out.push({ ...d.dados, id: d.id }); }); return out; },
      /* confirma a janela que estiver aberta (confirmar() ou modalV()) */
      confirmarJanela: async () => { await T.esperar(() => document.querySelector('.veu .modal [data-r="1"], .veu .modal [data-ok]')); const b = document.querySelector('.veu .modal [data-r="1"]') || document.querySelector('.veu .modal [data-ok]'); b.click(); await T.dorme(150); },
      salvarGaveta: async () => { await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); document.querySelector('#camada [data-acao="salvar"]').click(); await T.dorme(250); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        const er = [...document.querySelectorAll('#camada .cmp.erro')].map((w) => (w.querySelector('.rot') || {}).textContent + ': ' + (w.querySelector('.msg') || {}).textContent); if (er.length) throw new Error('formulário não salvou: ' + er.join(' | ')); },
      escolher: (k, v) => { const el = document.querySelector('#camada [data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); },
      abrirNovo: async (mod, setor, dados) => { SV = setor; PREFILL = { mod, dados }; location.hash = '#/' + mod + '/novo'; await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]')); },
      sincronizado: async () => { await T.esperar(() => !APP.central || APP.central.estado().pendentes === 0, 10000); await T.dorme(300); },
      comprar: async (setor, forn, prod, qtd, preco, extra) => {
        SV = setor; const R = novoRascunhoV(OP.compra, setor); Object.assign(R, { parteId: forn, itens: [{ produtoId: prod, qtd, preco }], condicao: 'A prazo', vencimento: hoje(), forma: 'Boleto' }, setor === 'lenha' ? { lenhaLocal: 'chao' } : {}, extra || {});
        RASC_V.compra = R; const antes = DATA.compras.length;
        /* a barra de abas às vezes volta para a aba anterior logo depois de trocar a rota: confere e tenta de novo */
        for (let k = 0; k < 4 && !(location.hash === '#/compra/nova' && document.querySelector('#vdOk')); k++) { location.hash = '#/compra/nova'; await T.dorme(900); }
        await T.esperar(() => document.querySelector('#vdOk')); document.querySelector('#vdOk').click();
        await T.esperar(() => document.querySelector('.veu .modal [data-r="1"]') || DATA.compras.length > antes); if (document.querySelector('.veu .modal [data-r="1"]')) await T.confirmarJanela();
        await T.esperar(() => DATA.compras.length > antes); await T.dorme(300); if (DATA.compras.length !== antes + 1) throw new Error('compra gravada ' + (DATA.compras.length - antes) + ' vezes'); return DATA.compras.slice().sort((a, b) => (+b.numero || 0) - (+a.numero || 0))[0];
      },
    };
  });


  console.log('Revisões e manutenção da frota');
  /* 0. estoque e um abastecimento com km: a leitura atual vem sozinha do abastecimento */
  const a0 = await page.evaluate(async () => {
    await T.abrirNovo('estoqueMov', 'combustivel', { tipo: 'Entrada', produtoId: 'p_s10', quantidade: 500, motivo: 'Estoque inicial de teste' }); await T.salvarGaveta();
    await T.abrirNovo('consumos', 'combustivel', { produtoId: 'p_s10', localId: 'l_cam', quantidade: 100, medidor: 35000 }); await T.salvarGaveta();
    await T.esperar(() => DATA.consumos.length === 1); await T.sincronizado();
    location.hash = '#/frota'; await T.esperar(() => document.querySelector('.fr-card')); await T.dorme(200);
    const at = FROTA_V157.atual('l_cam');
    return { at: at && at.v, fonte: at && at.fonte, cards: document.querySelectorAll('.fr-card').length, sem: FROTA_V157.situ(LOCAL('l_cam')).t, forno: FROTA_V157.frota().some((l) => l.id === 'l_forno') };
  });
  ok(a0.at === 35000 && a0.fonte === 'Abastecimento', `leitura atual veio do abastecimento (${a0.at} km)`);
  ok(a0.cards === 2 && !a0.forno, `painel mostra só os veículos do Combustível (${a0.cards})`);
  ok(a0.sem === 'Sem programação', 'sem revisão programada aparece como "Sem programação"');

  /* 1. revisão concluída → próxima programada sozinha pelo intervalo do cadastro */
  const r1 = await page.evaluate(async () => {
    await T.abrirNovo('frRev', 'combustivel', { localId: 'l_cam', data: addDias(hoje(), -30), servicos: { 'Troca de óleo do motor': true, 'Troca do filtro de óleo': true, 'Verificação dos freios': true }, pecas: '2 filtros de óleo\n30 L de óleo 15W40', valor: 1850, oficina: 'Oficina Teste' });
    const leit = document.querySelector('#camada [data-k="leitura"]').value, prox = document.querySelector('#camada [data-k="proxLeitura"]').value;
    await T.salvarGaveta(); await T.esperar(() => DATA.frRev.length === 1 && DATA.frPlano.length === 1, 10000); await T.sincronizado();
    const p = DATA.frPlano[0]; const o = FROTA_V157.situ(LOCAL('l_cam'));
    return { leit, prox, prev: p.leituraPrev, data: p.dataPrev, serv: Object.keys(p.servicos).length, mat: p.materiais, sit: o.t, falta: o.falta, banco: T.banco('clCtrl').map((x) => x.tipo).sort().join(','), colecoes: [...new Set(window.__srv.estado.docs ? [...window.__srv.estado.docs.values()].map((d) => d.colecao) : [])].filter((c) => /^fr/.test(c)).length };
  });
  ok(r1.leit === '35000' && r1.prox === '40000', `formulário sugeriu a leitura (${r1.leit}) e a próxima revisão (${r1.prox}) pelo intervalo de 5.000 km`);
  ok(r1.prev === 40000 && !!r1.data && r1.serv === 3 && /filtros/.test(r1.mat), `próxima revisão programada sozinha: 40.000 km ou ${r1.data}, 3 serviços, materiais copiados`);
  ok(r1.sit === 'Revisão em dia' && r1.falta === 5000, `situação "${r1.sit}", faltam ${r1.falta} km`);
  ok(r1.banco === 'frPlano,frRev' && r1.colecoes === 0, `gravado no banco central na coleção clCtrl (${r1.banco}), nenhuma coleção nova`);

  /* 2. foto do painel: 39.300 km → revisão próxima (faltam 700); 40.200 → vencida; pendências */
  const r2 = await page.evaluate(async () => {
    await T.abrirNovo('frLeit', 'combustivel', { localId: 'l_cam', leitura: 39300 }); await T.salvarGaveta(); await T.esperar(() => DATA.frLeit.length === 1); await T.sincronizado();
    const o1 = FROTA_V157.situ(LOCAL('l_cam')); const p1 = window.LEMBRETES_V61().filter((x) => x.mod === 'frota').map((x) => x.prio).join();
    await T.abrirNovo('frLeit', 'combustivel', { localId: 'l_cam', leitura: 40200, hora: '17:00' }); await T.salvarGaveta(); await T.esperar(() => DATA.frLeit.length === 2); await T.sincronizado();
    const o2 = FROTA_V157.situ(LOCAL('l_cam')); const p2 = window.LEMBRETES_V61().filter((x) => x.mod === 'frota');
    return { t1: o1.t, f1: o1.falta, p1, t2: o2.t, f2: o2.falta, p2: p2.map((x) => x.prio + ':' + x.titulo).join() };
  });
  ok(r2.t1 === 'Revisão próxima' && r2.f1 === 700 && r2.p1 === 'media', `39.300 km: "${r2.t1}" (faltam ${r2.f1} km) e aviso em PENDÊNCIAS`);
  ok(r2.t2 === 'Revisão vencida' && r2.f2 === -200 && /^alta:Revisão vencida/.test(r2.p2), `40.200 km: "${r2.t2}" (passou ${-r2.f2} km), pendência de prioridade alta`);

  /* 3. validações: leitura menor pede confirmação, leitura repetida e revisão duplicada são barradas */
  const r3 = await page.evaluate(async () => {
    const st = { ...MODS.frLeit.padrao(), id: 'x1', localId: 'l_cam', leitura: 38000 };
    const menor = conferirRegistro('frLeit', st).aviso || '';
    const L = DATA.frLeit.find((x) => +x.leitura === 40200);
    const rep = conferirRegistro('frLeit', { ...MODS.frLeit.padrao(), id: 'x2', localId: 'l_cam', leitura: 40200, data: L.data }).erros.leitura || '';
    const R = DATA.frRev[0];
    const dup = conferirRegistro('frRev', { ...MODS.frRev.padrao(), id: 'x3', localId: 'l_cam', data: R.data, tipoRev: R.tipoRev, leitura: 40300, servicos: { 'Inspeção geral do veículo': true } }).erros.data || '';
    const fut = conferirRegistro('frRev', { ...MODS.frRev.padrao(), id: 'x4', localId: 'l_cam', data: addDias(hoje(), 3), leitura: 40300, servicos: { 'Correias': true } }).erros.data || '';
    const semServ = conferirRegistro('frRev', { ...MODS.frRev.padrao(), id: 'x5', localId: 'l_cam', leitura: 40300, tipoRev: 'Pneus' }).erros.servicosOutros || '';
    let apagou = 'não tentou'; try { await apagar('frRev', R); apagou = 'apagou'; } catch (e) { apagou = 'barrado'; }
    return { menor, rep, dup, fut, semServ, apagou, ainda: DATA.frRev.length };
  });
  ok(/menor que a última conhecida/.test(r3.menor), 'leitura menor que a última conhecida pede confirmação');
  ok(/já foi registrada/.test(r3.rep), 'a mesma leitura no mesmo dia não é lançada duas vezes');
  ok(/Já existe/.test(r3.dup), 'revisão do mesmo tipo, mesmo veículo e mesma data é barrada (duplicada)');
  ok(/data futura/.test(r3.fut) && /pelo menos um serviço/.test(r3.semServ), 'revisão concluída com data futura ou sem serviço é barrada');
  ok(r3.apagou === 'barrado' && r3.ainda === 1, 'revisão não é apagada (histórico preservado)');

  /* 4. ficha do veículo: "Marcar como feita" → revisão com o plano, plano Realizado, novo plano; volta para a ficha */
  const r4 = await page.evaluate(async () => {
    location.hash = '#/frota/l_cam'; await T.esperar(() => document.querySelector('.fr-feita')); const servFicha = document.querySelectorAll('.fr-chk li').length;
    const p0 = DATA.frPlano[0].id;
    document.querySelector('.fr-feita').click(); await T.esperar(() => document.querySelector('#camada [data-acao="salvar"]'));
    const marcado = document.querySelectorAll('#camada [data-chk="servicos"]:checked').length;
    T.escolher('leitura', '40250'); await T.dorme(100);
    await T.salvarGaveta(); await T.esperar(() => DATA.frRev.length === 2 && DATA.frPlano.length === 2, 10000); await T.sincronizado(); await T.dorme(500);
    const ant = DATA.frPlano.find((p) => p.id === p0); const nv = DATA.frPlano.find((p) => p.id !== p0);
    return { servFicha, marcado, ant: ant.situacao, revId: !!ant.revId, nv: nv.situacao, prev: nv.leituraPrev, abertos: DATA.frPlano.filter((p) => p.situacao === 'Programada').length, rota: location.hash, sit: FROTA_V157.situ(LOCAL('l_cam')).t };
  });
  ok(r4.servFicha >= 3, `ficha mostra visualmente o que será necessário (${r4.servFicha} itens)`);
  ok(r4.marcado === 3, 'Marcar como feita abre a revisão já com os serviços previstos');
  ok(r4.ant === 'Realizada' && r4.revId && r4.nv === 'Programada' && r4.prev === 45250 && r4.abertos === 1, `programação cumprida ficou "Realizada" e a próxima foi para ${r4.prev} km (uma só aberta)`);
  ok(r4.rota === '#/frota/l_cam', `depois de salvar voltou para a ficha do veículo (${r4.rota})`);
  ok(r4.sit === 'Revisão em dia', 'depois da revisão o veículo voltou para "em dia"');

  /* 5. veículo em manutenção, programação manual (substitui a anterior), horímetro */
  const r5 = await page.evaluate(async () => {
    await T.abrirNovo('frRev', 'combustivel', { localId: 'l_emp', status: 'Em andamento', tipoRev: 'Manutenção corretiva (conserto)', leitura: 1200, servicosOutros: 'Vazamento no cilindro hidráulico' }); await T.salvarGaveta();
    await T.esperar(() => DATA.frRev.length === 3); await T.sincronizado();
    const man = !!FROTA_V157.situ(LOCAL('l_emp')).man; const semPlano = DATA.frPlano.filter((p) => p.localId === 'l_emp').length;
    await T.abrirNovo('frPlano', 'combustivel', { localId: 'l_emp', servicos: { 'Óleo hidráulico': true } }); const sug = document.querySelector('#camada [data-k="leituraPrev"]').value; await T.salvarGaveta();
    await T.esperar(() => DATA.frPlano.some((p) => p.localId === 'l_emp')); await T.sincronizado();
    await T.abrirNovo('frPlano', 'combustivel', { localId: 'l_emp', leituraPrev: 1500, servicos: { 'Lubrificação (graxa)': true } }); await T.salvarGaveta();
    await T.esperar(() => DATA.frPlano.filter((p) => p.localId === 'l_emp').length === 2 && DATA.frPlano.some((p) => p.localId === 'l_emp' && p.situacao === 'Substituída'), 10000); await T.sincronizado();
    const o = FROTA_V157.situ(LOCAL('l_emp'));
    return { man, semPlano, sug, abertos: DATA.frPlano.filter((p) => p.localId === 'l_emp' && p.situacao === 'Programada').length, u: o.u, falta: o.falta, txt: o.p && document.createElement('div') && o.t };
  });
  ok(r5.man && r5.semPlano === 0, 'revisão "Em andamento" deixa a empilhadeira em manutenção e não programa a próxima');
  ok(r5.sug === '1450', `programação manual sugeriu ${r5.sug} h (leitura atual + 250 h)`);
  ok(r5.abertos === 1 && r5.u === 'h' && r5.falta === 300, `nova programação substituiu a anterior; horímetro em horas (faltam ${r5.falta} h)`);

  /* 6. relatórios no modelo dos documentos e menu do setor */
  const r6 = await page.evaluate(async () => {
    const G = FROTA_V157.relGeral(); const V = FROTA_V157.relVeic('l_cam');
    location.hash = '#/frota'; await T.esperar(() => document.querySelector('.fr-card')); await T.dorme(200);
    const kpis = [...document.querySelectorAll('.fr-hero .kpi .v')].map((x) => x.textContent).join(',');
    let doc = false; try { verDoc(G); await T.dorme(400); doc = !!document.querySelector('.veu, .doc-prev, #docPrev, .dv'); } catch (e) { doc = 'erro ' + e.message; }
    for (let k = 0; k < 4; k++) { const b = [...document.querySelectorAll('.veu .modal button, .veu button')].find((x) => /Cancelar|Fechar/.test(x.textContent)); if (!b) break; b.click(); await T.dorme(250); }
    SV = 'combustivel'; location.hash = '#/clLanc'; await T.dorme(900); const txt = document.body.innerText;
    const central = ['Registrar revisão', 'Foto do painel (km)'];
    const menu = [...document.querySelectorAll('a[href="#/frota"]')].map((a) => a.textContent.trim());
    return { secG: G.blocos.filter((b) => b.tipo === 'secao').map((b) => b.titulo), secV: V.blocos.filter((b) => b.tipo === 'secao').length, kpis, doc, menu: menu.some((t) => /Revisões e manutenção/.test(t)), central: central.every((t) => txt.includes(t)) };
  });
  ok(r6.secG.length === 5 && /Situação atual/.test(r6.secG[0]) && /Custos/.test(r6.secG[3]), `relatório geral: ${r6.secG.join(' · ')}`);
  ok(r6.secV === 5, 'ficha de manutenção do veículo (relatório individual) com 5 partes');
  ok(r6.doc === true, 'relatório abre na tela de documentos (imprimir e PDF)');
  ok(r6.kpis === '2,2,0,0,1', `indicadores do painel: ${r6.kpis} (veículos, em dia, próximas, vencidas, em manutenção)`);
  ok(r6.menu && r6.central, 'Revisões e manutenção no menu do setor e na Central de lançamentos');

  if (process.env.FOTOS) {
    for (const [larg, alt, suf] of [[1280, 900, 'pc'], [390, 844, 'cel']]) {
      await page.setViewportSize({ width: larg, height: alt });
      for (const [rota, nome] of [['#/frota', 'painel'], ['#/frota/l_cam', 'ficha'], ['#/frRev/novo', 'revisao']]) {
        await page.evaluate(async (r) => { SV = 'combustivel'; if (/novo/.test(r)) PREFILL = { mod: 'frRev', dados: { localId: 'l_cam' } }; location.hash = r; await T.dorme(900); }, rota);
        await page.screenshot({ path: join(process.env.FOTOS, `frota-${nome}-${suf}.png`), fullPage: true });
        await page.evaluate(async () => { if (GAV) { fecharRota(true); await T.dorme(300); } });
      }
    }
  }
  const relevantes = erros.filter((e) => !/Chart|XLSX|jspdf|fonts|Failed to fetch|NetworkError/i.test(e));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
} catch (e) {
  falhas++; console.error('  ✘ o teste parou:', e && (e.stack || e.message || e));
} finally {
  await browser.close(); http.close();
}
const n = (k) => resultados.filter((r) => r[0] === k).length;
console.log(`\nRevisões e manutenção da frota: ${n('ok')} aprovados, ${n('FALHOU')} falharam, ${n('não executado')} não executados.`);
process.exit(falhas ? 1 : 0);
