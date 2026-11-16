#!/usr/bin/env node
// Teste de ponta a ponta do módulo de CONTRATOS COM IA (Setor Pessoal › Contratos, V125): abre o programa
// REAL (saida/claude.html) num Chromium com o banco central simulado e uma IA simulada (responde no mesmo
// formato que o programa pede ao Claude) e confere, pelas telas e funções do próprio sistema:
//   - pedido livre → perguntas (informação incompleta) → complemento → documento completo, salvo e numerado
//   - dados da empresa entram sozinhos; dado pessoal do cadastro não vai para a IA (marcadores)
//   - contrato civil e contrato trabalhista; pedido ilícito é recusado
//   - edição com IA: inclui cláusula, altera cláusula, explica sem alterar; o resto fica letra por letra
//   - conferência das leis citadas contra a base jurídica; análise jurídica
//   - preencher campo, edição à mão, versões, restaurar, PDF (com capa), Word
//   - situações, assinatura só com comprovação, documento assinado travado
//   - duplicar, renovar, aditivo, distrato (o original não muda), modelo da empresa, recuperação
//   - criação pelo modelo pronto (sem IA) continua funcionando
// Para conferir com a IA de verdade: JB_IA_GRAVADA=<pasta> usa respostas reais gravadas (1.txt, 2.txt…) e
// grava em <pasta>/pedido-N.txt o pedido que ficou sem resposta.
// Uso: node scripts/construir.mjs && node scripts/testar-contratos.mjs
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { RAIZ } from './construir.mjs';

const req = createRequire(import.meta.url);
const { chromium } = req('playwright');
const acharLib = (nome) => { for (const base of [RAIZ, process.cwd(), process.env.JB_LIBS || '']) { if (!base) continue; const p = join(base, 'node_modules', nome); if (existsSync(p)) return p; } return null; };
const LIB_PDF = acharLib('jspdf/dist/jspdf.umd.min.js'), LIB_TAB = acharLib('jspdf-autotable/dist/jspdf.plugin.autotable.min.js');
const servidorFalso = readFileSync(join(RAIZ, 'scripts/lib/servidor-falso.mjs'), 'utf8').replace(/^export /m, '');
const GRAV = process.env.JB_IA_GRAVADA || '';
const gravadas = []; if (GRAV) { for (let i = 1; existsSync(join(GRAV, i + '.txt')); i++) gravadas.push(readFileSync(join(GRAV, i + '.txt'), 'utf8')); }

// dados fictícios: nunca use dados reais num ambiente compartilhado
const CPF = '52998224725';
const docs = [
  ['funcionarios', 'f1', { id: 'f1', nome: 'Funcionário Exemplo Um', situacao: 'Ativo', departamento: 'Produção', setor: 'Queima', cargo: 'Forneiro', matricula: '0012', admissao: '2026-11-20', tipoContratacao: 'Contrato de experiência' }],
  ['funcionarios', 'f2', { id: 'f2', nome: 'Funcionário Exemplo Dois', situacao: 'Ativo', departamento: 'Produção', setor: 'Produção', cargo: 'Operador', matricula: '0013', admissao: '2025-01-10', tipoContratacao: 'Empregado CLT' }],
  ['sensivel', 'f1', { id: 'f1', cpf: CPF, rg: '1234567', endereco: 'Rua das Olarias, 10', cidade: 'Cidade Exemplo', uf: 'MA', salario: 1850 }],
  ['sensivel', 'config:empresa', { id: 'config:empresa', repCpf: '11144477735' }],
  ['acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true }],
  ['config', 'empresa', { empresa: { razao: 'Empresa Exemplo LTDA', fantasia: 'Cerâmica Exemplo', cnpj: '11.222.333/0001-81', endereco: 'Rodovia Exemplo, km 1', cidade: 'Cidade Exemplo/MA', telefone: '(99) 99999-0000', responsavel: 'Responsável Exemplo' } }],
];

/* ---------- IA simulada: lê a TAREFA do pedido e responde no formato pedido ---------- */
function iaSimulada(pedido) {
  const tem = (re) => re.test(pedido);
  const usuario = (/PEDIDO DO USUÁRIO\n([\s\S]*?)(\n\n[A-ZÁÉÍÓÚÇÃÕ ,()º0-9:-]{8,}\n|\n\nRESPONDA|\n\nFORMATO|$)/.exec(pedido) || [])[1] || '';
  const u = usuario.toLowerCase();
  if (tem(/TAREFA: INTERPRETAR O PEDIDO/)) {
    if (/esconder|sem registrar|disfar/.test(u)) return JSON.stringify({ licito: false, recusa: 'Não posso elaborar um contrato para esconder vínculo de emprego: quem trabalha como empregado tem de ser registrado (arts. 3º e 9º da CLT).' });
    const trab = /experi[êe]ncia|empregad|carteira/.test(u), comp = /distrato|aditivo|renova/.test(u);
    const semPerg = tem(/NÃO pergunte mais nada/) || tem(/INFORMAÇÕES JÁ DADAS/) || comp || trab;
    return 'Segue a interpretação:\n' + JSON.stringify({ licito: true, recusa: '', tipo: trab ? 'Contrato de trabalho por experiência' : comp ? (/distrato/.test(u) ? 'Distrato' : /aditivo/.test(u) ? 'Termo aditivo' : 'Termo de renovação') : /manuten/.test(u) ? 'Contrato de prestação de serviços de manutenção industrial' : 'Contrato de prestação de serviços',
      categoria: trab ? 'trabalhista' : comp ? 'complementar' : 'civil', vinculo: trab ? 'com' : comp ? 'nao_se_aplica' : 'sem', entendi: 'Você quer formalizar ' + (trab ? 'a admissão de um empregado em experiência.' : comp ? 'um documento ligado a um contrato existente.' : 'a contratação de uma empresa para um serviço.'),
      alerta_vinculo: '', legislacao: trab ? ['CLT, arts. 443 e 445'] : ['Código Civil, arts. 593 a 609'], pessoa: /funcion[áa]rio exemplo um/.test(u) ? 'Funcionário Exemplo Um' : '',
      perguntas: semPerg ? [] : [{ pergunta: 'Qual é a empresa que fará o serviço (razão social e CNPJ)?', sugestoes: [] }, { pergunta: 'O pagamento será mensal ou por serviço realizado?', sugestoes: ['Mensal', 'Por serviço'] }, { pergunta: 'Qual será o prazo do contrato?', sugestoes: ['12 meses', 'Indeterminado'] }] });
  }
  if (tem(/TAREFA: REDIGIR O DOCUMENTO COMPLETO/)) {
    const emp = (k) => (new RegExp('^' + k + ': (.*)$', 'm').exec(pedido) || [])[1] || '';
    const parteEmp = (papel) => `@@PARTE: ${papel}\nRazão social: ${emp('Razão social')}\nCNPJ: ${emp('CNPJ')}\nEndereço: ${emp('Endereço')}\nRepresentante: ${emp('Representante legal')}\nCPF do representante: {{empresa.rep_cpf}}`;
    const analise = (leg, extra) => `@@ANALISE-LEGISLACAO\n- ${leg}\n@@ANALISE-ATENCAO\n- Defina por escrito os prazos de atendimento.\n@@ANALISE-REVISAR\n- Cláusula de multa: confirmar o percentual com um profissional.\n@@ANALISE-CONFIRMAR\n- Dados da outra parte.\n@@ALERTA-VINCULO\n${extra || 'nenhum'}\n@@FIM`;
    if (/experi[êe]ncia/.test(u)) return `@@TITULO: CONTRATO DE TRABALHO POR EXPERIÊNCIA\n@@SUBTITULO: CLT, arts. 443, 445 e 451\n@@TIPO: Contrato de experiência\n@@CATEGORIA: trabalhista\n@@VISUAL: trabalho\n@@VINCULO: com\n@@OUTRA-PARTE: Funcionário Exemplo Um\n@@INICIO: 2026-11-20\n@@TERMINO: 2027-01-03\n${parteEmp('EMPREGADOR')}\n@@PARTE: EMPREGADO(A)\nNome: Funcionário Exemplo Um\nCPF: {{pessoa.cpf}}\nRG: {{pessoa.rg}}\nEndereço: {{pessoa.endereco}}\n@@ABERTURA\nAs partes celebram contrato de trabalho por experiência, regido pela CLT.\n@@CLAUSULA: Da função\nO(A) EMPREGADO(A) exercerá a função de Forneiro.\n@@CLAUSULA: Do prazo\nO contrato vigora por 45 dias, nos termos do art. 443, § 2º, e do art. 445 da CLT, podendo ser prorrogado uma vez (art. 451 da CLT). Aplica-se ainda o art. 999 da CLT.\n@@CLAUSULA: Do salário\nO salário mensal é de {{pessoa.salario}}.\n@@CLAUSULA: Da jornada\nA jornada é de 44 horas semanais.\n@@FECHO\nE, por estarem de acordo, assinam em duas vias.\n@@LOCAL-DATA: Cidade Exemplo/MA, 15 de novembro de 2026.\n@@ASSINATURA: Empresa Exemplo LTDA | EMPREGADOR\n@@ASSINATURA: Funcionário Exemplo Um | EMPREGADO(A)\n@@TESTEMUNHAS: sim\n${analise('CLT, arts. 443, 445 e 451 — contrato de experiência')}`;
    if (/distrato|aditivo|renova/.test(u)) { const t = /distrato/.test(u) ? 'DISTRATO' : /aditivo/.test(u) ? 'TERMO ADITIVO' : 'TERMO DE RENOVAÇÃO'; const num = (/DOCUMENTO DE ORIGEM \(Nº ([^)]+)\)/.exec(pedido) || [])[1] || '';
      return `@@TITULO: ${t}\n@@SUBTITULO: Código Civil, art. 472\n@@TIPO: ${t.charAt(0) + t.slice(1).toLowerCase()}\n@@CATEGORIA: complementar\n@@VISUAL: termo\n@@VINCULO: nao_se_aplica\n@@OUTRA-PARTE: Manutenção Exemplo LTDA\n${parteEmp('CONTRATANTE')}\n@@PARTE: CONTRATADA\nRazão social: Manutenção Exemplo LTDA\nCNPJ: 22.333.444/0001-81\nEndereço: Rua B, 20\n@@ABERTURA\nAs partes do contrato Nº ${num} ajustam o que segue.\n@@CLAUSULA: Do objeto\nEste termo se refere ao contrato Nº ${num}. ${usuario.slice(0, 200)}\n@@CLAUSULA: Da ratificação\nFicam mantidas as demais cláusulas.\n@@FECHO\nAssinam em duas vias.\n@@LOCAL-DATA: Cidade Exemplo/MA, 15 de novembro de 2026.\n@@ASSINATURA: Empresa Exemplo LTDA | CONTRATANTE\n@@ASSINATURA: Manutenção Exemplo LTDA | CONTRATADA\n@@TESTEMUNHAS: sim\n${analise('Código Civil, art. 472 — distrato pela mesma forma do contrato')}`; }
    const cls = [['Do objeto', 'A CONTRATADA prestará serviços de manutenção preventiva e corretiva dos equipamentos industriais da CONTRATANTE (arts. 593 a 609 do Código Civil).'], ['Da execução', 'Os serviços serão executados com autonomia, por equipe própria da CONTRATADA.\nParágrafo único. A CONTRATADA atenderá os chamados em até 24 horas.'],
      ['Das obrigações da contratada', 'São obrigações da CONTRATADA:\na) executar os serviços com qualidade;\nb) cumprir as normas de segurança, em especial a NR-12.'], ['Das obrigações da contratante', 'A CONTRATANTE dará acesso aos equipamentos e pagará o preço no prazo.'],
      ['Do preço e do pagamento', 'Pelos serviços, a CONTRATANTE pagará R$ 4.500,00 (quatro mil e quinhentos reais) por mês, até o dia 10, mediante nota fiscal.'], ['Do prazo', 'O contrato vigora por 12 meses, respeitado o limite do art. 598 do Código Civil.'], ['Da garantia', 'A CONTRATADA garante os serviços por 90 dias.'],
      ['Da proteção de dados', 'As partes cumprirão a Lei nº 13.709/2018.'], ['Da rescisão', 'Qualquer parte pode encerrar o contrato com aviso de 30 dias (art. 473 do Código Civil). A multa por descumprimento é de 10% do valor mensal (art. 412 do Código Civil).'], ['Do foro', 'Fica eleito o foro de Cidade Exemplo/MA.']];
    return `Aqui está o documento.\n@@TITULO: CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MANUTENÇÃO INDUSTRIAL\n@@SUBTITULO: Código Civil, arts. 593 a 609\n@@TIPO: Prestação de serviços de manutenção\n@@CATEGORIA: civil\n@@VISUAL: contrato\n@@VINCULO: sem\n@@OUTRA-PARTE: Manutenção Exemplo LTDA\n@@INICIO: 2026-12-01\n@@TERMINO: 2027-11-30\n${parteEmp('CONTRATANTE')}\n@@PARTE: CONTRATADA\nRazão social: Manutenção Exemplo LTDA\nCNPJ: 22.333.444/0001-81\nEndereço: [PREENCHER: endereço da contratada]\nRepresentante: [PREENCHER: representante da contratada]\n@@ABERTURA\nAs partes acima celebram o presente contrato, que se regerá pelas cláusulas seguintes.\n${cls.map(([t, x]) => '@@CLAUSULA: ' + t + '\n' + x).join('\n')}\n@@FECHO\nE, por estarem de acordo, assinam em duas vias, na presença de duas testemunhas.\n@@LOCAL-DATA: Cidade Exemplo/MA, 15 de novembro de 2026.\n@@ASSINATURA: Empresa Exemplo LTDA | CONTRATANTE · Responsável Exemplo\n@@ASSINATURA: Manutenção Exemplo LTDA | CONTRATADA\n@@TESTEMUNHAS: sim\n${analise('Código Civil, arts. 593 a 609 — prestação de serviços')}`;
  }
  if (tem(/TAREFA: ATENDER AO PEDIDO/)) {
    if (/materiais/.test(u)) return '@@RESPOSTA\nAcrescentei a cláusula dos materiais depois da cláusula das obrigações da contratada.\n@@NOVA-CLAUSULA-APOS: 3 | Dos materiais\nOs materiais utilizados na manutenção serão de responsabilidade da CONTRATADA, que os fornecerá por sua conta.\n@@FIM';
    if (/pagamento/.test(u)) return '@@RESPOSTA\nAlterei o pagamento.\n@@ALTERAR-CLAUSULA: 6 | Do preço e do pagamento\nPelos serviços, a CONTRATANTE pagará R$ 5.000,00 (cinco mil reais) por mês, até o dia 5, mediante nota fiscal.\n@@FIM';
    if (/explique/.test(u)) return 'A cláusula do foro define em qual cidade uma eventual ação será julgada.';
    if (/revise/.test(u)) return '@@RESPOSTA\nRevisei o documento.\n@@ANALISE-LEGISLACAO\n- Código Civil, arts. 593 a 609\n@@ANALISE-ATENCAO\n- A garantia poderia detalhar o que cobre.\n@@ANALISE-REVISAR\n- Cláusula da execução: a obrigação de atender em 24 horas está genérica.\n@@ANALISE-CONFIRMAR\n- Endereço da contratada.\n@@ALERTA-VINCULO\nnenhum\n@@FIM';
    return '@@RESPOSTA\nNão entendi.';
  }
  return 'não sei';
}

const http = createServer((rq, res) => {
  const u = decodeURIComponent(rq.url.split('?')[0]);
  const p = join(RAIZ, u === '/' ? 'saida/claude.html' : u);
  if (!p.startsWith(RAIZ) || !existsSync(p) || statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(p));
});
await new Promise((r) => http.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${http.address().port}`;
const browser = await chromium.launch();
let falhas = 0;
const ok = (c, m) => { console.log(`  ${c ? '✔' : '✘'} ${m}`); if (!c) falhas++; return c; };
const FOTOS = process.env.JB_FOTOS || '';
try {
  const ctx = await browser.newContext({ viewport: { width: 1380, height: 900 } });
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => {
    const u = r.request().url();
    if (/jspdf(\.umd)?(\.min)?\.js/.test(u) && !/autotable/.test(u)) return LIB_PDF ? r.fulfill({ contentType: 'text/javascript', body: readFileSync(LIB_PDF) }) : r.abort();
    if (/autotable/.test(u)) return LIB_TAB ? r.fulfill({ contentType: 'text/javascript', body: readFileSync(LIB_TAB) }) : r.abort();
    return r.abort();
  });
  const page = await ctx.newPage();
  const erros = []; page.on('pageerror', (e) => erros.push(String(e && e.message)));
  const pedidos = [];
  await page.exposeFunction('__iaNode', (texto) => {
    pedidos.push(texto);
    if (GRAV) { const r = gravadas[pedidos.length - 1]; if (r === undefined) { mkdirSync(GRAV, { recursive: true }); writeFileSync(join(GRAV, 'pedido-' + pedidos.length + '.txt'), texto); return { erro: 'sem_gravacao' }; } return { texto: r }; }
    return { texto: iaSimulada(texto) };
  });
  await page.addInitScript(({ codigo, docs }) => {
    // eslint-disable-next-line no-eval
    const criar = (0, eval)('(' + codigo.replace(/^function criarServidorFalso/m, 'function') + ')');
    const srv = criar({ admins: ['u_DONO'] });
    docs.forEach(([c, i, d]) => srv.estado.gravarDireto(c, i, d));
    window.__srv = srv;
    const vazio = { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }), onSnapshot: () => () => {} }), collection: () => { const q = { where: () => q, get: async () => ({ docs: [] }), onSnapshot: () => () => {} }; return q; } };
    const user = { me: async () => ({ id: 'u_DONO', name: 'Dono', avatarUrl: '', isOwner: true, canEdit: true }), id: async () => 'u_DONO', isOwner: () => true, canEdit: () => true, profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { name: '' }])) };
    // a IA simulada: mesma assinatura do window.claude.use('sample') usado pelo programa
    const sample = async (input, opc) => {
      const r = await window.__iaNode(input.map((m) => m.content).join('\n\n=====\n\n'));
      if (r.erro) { const e = new Error(r.erro); e.code = 'empty_completion'; throw e; }
      const t = r.texto; const n = Math.ceil(t.length / 3);
      for (let i = 1; i <= 3; i++) { await new Promise((x) => setTimeout(x, 30)); if (opc && opc.signal && opc.signal.aborted) { const e = new Error('c'); e.code = 'cancelled'; throw e; } if (opc && opc.onText) opc.onText({ text: t.slice(0, n * i) }); }
      return { text: t, truncated: false };
    };
    sample.limits = async () => ({ tools: { maxCount: 9 } });
    window.claude = { use: async (n) => (n === 'db' ? vazio : n === 'user' ? user : n === 'mcp' ? srv.mcp : n === 'sample' ? sample : null) };
  }, { codigo: servidorFalso, docs });
  await page.goto(base + '/saida/claude.html');
  await page.waitForFunction(() => typeof APP !== 'undefined' && APP.pronto === true && APP.carregado === true, null, { timeout: 30000 });
  const foto = async (n) => { if (FOTOS) { mkdirSync(FOTOS, { recursive: true }); await page.screenshot({ path: join(FOTOS, n + '.png'), fullPage: false }); } };
  const pronto = () => page.waitForFunction(() => CTI && !CTI.pensando && APP.central.estado().pendentes === 0, null, { timeout: 20000 });
  const ir = async (h) => { await page.evaluate((x) => { location.hash = x; }, h); await page.waitForTimeout(250); };
  const noBanco = (k) => page.evaluate((x) => { const d = window.__srv.estado.docs.get(x); return d ? d.dados : null; }, k);

  console.log('Tela inicial');
  await ir('#/central');
  const t0 = await page.evaluate(() => ({ heroi: !!document.querySelector('#ctPedido'), titulo: (document.querySelector('.ct-heroi h2') || {}).textContent, abas: [...document.querySelectorAll('.fv-abas [data-ca]')].map((b) => b.dataset.ca), emp: (document.querySelector('.ct-emp') || {}).textContent, ia: ctTemIA() }));
  ok(t0.heroi && /inteligência artificial/i.test(t0.titulo), 'campo grande “Criar contrato com inteligência artificial” na aba Contratos');
  ok(t0.abas.join() === 'docs,livre,biblioteca,controle,base', 'abas: Documentos, Criar do meu jeito, Biblioteca, Controle de vencimentos e Base jurídica');
  ok(/Empresa Exemplo LTDA/.test(t0.emp) && /11\.222\.333/.test(t0.emp), 'empresa cadastrada já aparece (sem digitar de novo)');
  await foto('01-inicio');
  await page.click('[data-ca="biblioteca"]');
  const bib = await page.evaluate(() => ({ cats: [...document.querySelectorAll('[data-bib]')].map((b) => b.textContent.trim()), itens: document.querySelectorAll('.ct-bi').length, preencher: document.querySelectorAll('.ct-bi a[href^="#/doc/novo/"]').length, ia: document.querySelectorAll('[data-bia]').length }));
  ok(bib.cats.length === 5 && /trabalhistas/.test(bib.cats[0]) && /civis e comerciais/.test(bib.cats[1]) && /complementares/.test(bib.cats[2]), 'biblioteca com as três famílias, modelos da empresa e todos os modelos prontos');
  ok(bib.itens >= 10 && bib.preencher >= 6 && bib.ia === bib.itens, 'cada item da biblioteca abre o modelo pronto e/ou a IA');
  await foto('02-biblioteca');
  await page.click('[data-ca="base"]');
  ok(await page.evaluate(() => document.querySelectorAll('.painel table tbody tr').length >= 25 && document.querySelectorAll('.painel table a[href^="https://www.planalto.gov.br"]').length >= 15), 'base jurídica listada com o endereço do texto oficial');
  await page.click('[data-ca="docs"]');

  console.log('Pedido livre com informação incompleta → perguntas → complemento → documento');
  await page.fill('#ctPedido', 'Preciso elaborar um contrato para uma empresa que ficará responsável pela manutenção dos equipamentos da Cerâmica. Quero estabelecer as responsabilidades, os pagamentos, as obrigações, os prazos, as garantias e as condições de encerramento.');
  await page.click('#ctIr');
  await page.waitForSelector('.ct-pergs', { timeout: 15000 });
  const pg = await page.evaluate(() => ({ n: document.querySelectorAll('.ct-perg').length, tipo: CTI.interp.tipo, doc: !!CTI.doc, msg: document.querySelector('.cti-msgs').textContent }));
  ok(pg.n >= 1 && pg.n <= 4 && !pg.doc, `a IA identificou “${pg.tipo}” e fez ${pg.n} pergunta(s) (no máximo 4), sem redigir ainda`);
  ok(!/razão social da cerâmica|CNPJ da cerâmica/i.test(pg.msg), 'não pergunta os dados da empresa');
  await foto('03-perguntas');
  await page.fill('[data-pr="0"]', 'Manutenção Exemplo LTDA, CNPJ 22.333.444/0001-81');
  await page.click('[data-ps="1"]');
  await page.fill('[data-pr="2"]', '12 meses');
  await page.click('#ctiResp');
  await page.waitForFunction(() => CTI && CTI.doc && CTI.rec && !CTI.pensando, null, { timeout: 20000 }); await pronto();
  const d1 = await page.evaluate(() => { const d = CTI.doc, r = CTI.rec; return { id: r.id, numero: r.numero, status: r.status, titulo: d.titulo, n: d.clausulas.length, cat: d.categoria, p0: d.partes[0].campos.map((c) => c.join(': ')).join(' | '), parte: r.parte, termino: r.termino, hash: location.hash, capa: !!document.querySelector('.fvd-capa'), html: document.querySelector('#fvdDoc').textContent, vers: CTI.versoes.length, lista: DATA.docsEmitidos.some((x) => x.id === r.id) }; });
  ok(/^CT-\d{4}-\d{4}$/.test(d1.numero) && d1.status === 'Rascunho' && d1.lista, `documento salvo sozinho como rascunho, com número ${d1.numero}`);
  ok(/MANUTENÇÃO/.test(d1.titulo) && d1.n === 10 && d1.cat === 'civil', `o documento corresponde ao pedido: ${d1.titulo}, ${d1.n} cláusulas`);
  ok(/Empresa Exemplo LTDA/.test(d1.p0) && /11\.222\.333\/0001-81/.test(d1.p0) && /Rodovia Exemplo/.test(d1.p0) && /Responsável Exemplo/.test(d1.p0), 'razão social, CNPJ, endereço e representante da empresa entraram sozinhos');
  ok(/Cláusula primeira/.test(d1.html) && /Cláusula décima/.test(d1.html) && d1.capa, 'cláusulas numeradas e folha de rosto no contrato civil');
  ok(d1.parte === 'Manutenção Exemplo LTDA' && d1.termino === '2027-11-30' && d1.hash === '#/doc/' + d1.id, 'parte, vigência e endereço do documento registrados');
  const c1 = await noBanco('sensivel/docsEmitidos:' + d1.id), v1 = await noBanco('sensivel/docsEmitidos:' + d1.id + ':v1'), m1 = await noBanco('docsEmitidos/' + d1.id);
  ok(!!(c1 && c1.ia && c1.ia.doc.clausulas.length === 10) && !!(v1 && v1.v.n === 1) && !!m1 && !JSON.stringify(m1).includes('Cláusula'), 'no banco: texto e versão 1 na área protegida; a lista guarda só o resumo');
  await foto('04-documento');

  console.log('Análise jurídica e conferência das leis');
  await page.click('[data-cab="analise"]');
  const an = await page.evaluate(() => { const V = ctVerificar(CTI.doc, CTI.analise); return { n: V.itens.length, refs: V.refs.map((r) => r.nome + ':' + (r.ok && !r.fora.length)), pend: V.pend.length, txt: document.querySelector('.ct-an').textContent }; });
  ok(an.n === 8 && an.refs.length >= 3 && an.refs.every((r) => /:true$/.test(r)), `8 verificações; ${an.refs.length} referências citadas, todas conferidas na base`);
  ok(/não substitui advogado/.test(an.txt) && /Legislação consultada/.test(an.txt) && /Pontos de atenção/.test(an.txt) && /merecem revisão/.test(an.txt) && /precisam ser confirmadas/.test(an.txt), 'área “Análise jurídica” com legislação, pontos de atenção, cláusulas a revisar e o que confirmar');
  ok(an.pend === 2, 'campos sem informação ficaram marcados para preencher (não inventou dados)');
  await foto('05-analise');
  await page.click('[data-cab="doc"]');

  console.log('Edição com IA');
  const antes = await page.evaluate(() => JSON.stringify(CTI.doc.clausulas));
  await page.fill('#ctiTxt', 'Quero que você acrescente uma cláusula estabelecendo que os materiais utilizados na manutenção serão de responsabilidade da contratada.');
  await page.click('#ctiForm button[type=submit]');
  await page.waitForFunction(() => CTI.doc.clausulas.length === 11 && !CTI.pensando, null, { timeout: 15000 }); await pronto();
  const e1 = await page.evaluate((a) => { const A = JSON.parse(a), c = CTI.doc.clausulas; return { nova: c[3].t, iguais: A.every((x) => c.some((y) => y.t === x.t && y.x === x.x)), ver: CTI.rec.versao, msg: CTI.msgs[CTI.msgs.length - 1].t }; }, antes);
  ok(e1.nova === 'Dos materiais' && e1.iguais, 'cláusula incluída no lugar pedido; as outras 10 ficaram letra por letra');
  ok(e1.ver === 2 && /O que mudou/.test(e1.msg), 'a alteração virou a versão 2 e a IA disse o que mudou');
  await page.fill('#ctiTxt', 'Altere as condições de pagamento para R$ 5.000,00 até o dia 5.');
  await page.click('#ctiForm button[type=submit]');
  await page.waitForFunction(() => /5\.000,00/.test(CTI.doc.clausulas[5].x) && !CTI.pensando, null, { timeout: 15000 }); await pronto();
  ok(await page.evaluate(() => CTI.doc.clausulas.length === 11 && CTI.rec.versao === 3 && /Dos materiais/.test(CTI.doc.clausulas[3].t)), 'condições de pagamento alteradas só na cláusula certa (versão 3)');
  await page.fill('#ctiTxt', 'Explique em linguagem simples a cláusula do foro');
  await page.click('#ctiForm button[type=submit]');
  await page.waitForFunction(() => /qual cidade/.test(CTI.msgs[CTI.msgs.length - 1].t) && !CTI.pensando, null, { timeout: 15000 });
  ok(await page.evaluate(() => CTI.rec.versao === 3), 'explicar uma cláusula não altera o documento nem cria versão');
  await page.click('[data-cmd="8"]');
  await page.waitForFunction(() => /genérica/.test((CTI.analise.revisar || []).join(' ')) && !CTI.pensando, null, { timeout: 15000 }); await pronto();
  ok(await page.evaluate(() => { const V = ctVerificar(CTI.doc, CTI.analise); return CTI.doc.clausulas.length === 11 && V.itens[5].ok === false; }), '“Revisar inconsistências” atualiza a análise sem mexer no texto');
  await foto('06-edicao');

  console.log('Preencher campo, edição à mão, versões');
  await page.click('[data-pretudo]'); await page.waitForSelector('.ct-dlg');
  ok(await page.evaluate(() => document.querySelectorAll('.ct-dlg input[name^=p_]').length === 2), '“Preencher tudo” abre um formulário só com os campos que faltam');
  await page.fill('.ct-dlg input[name=p_0]', 'Rua B, 20, Cidade Exemplo/MA');
  await page.waitForTimeout(750); await page.click('.ct-dlg button[type=submit]');
  await page.waitForFunction(() => ctPendencias(CTI.doc).length === 1 && !document.querySelector('.ct-dlg'), null, { timeout: 10000 }); await pronto();
  ok(await page.evaluate(() => /Rua B, 20/.test(JSON.stringify(CTI.doc.partes[1]))), 'campo preenchido entra no documento; o que ficou em branco continua marcado');
  await page.click('[data-cab="editar"]');
  await page.evaluate(() => { const t = document.querySelector('[data-ecx="6"]'); t.value = t.value + ' Texto acrescentado à mão.'; t.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#ctiEdSalvar');
  await page.waitForFunction(() => !CTI.sujo && /à mão/.test(CTI.doc.clausulas[6].x), null, { timeout: 10000 }); await pronto();
  const vs = await page.evaluate(() => ({ ver: CTI.rec.versao, n: CTI.versoes.length, motivos: CTI.versoes.map((v) => v.motivo) }));
  ok(vs.ver === 6 && vs.n === 6 && vs.motivos[5] === 'Edição manual', `edição à mão salva; histórico com ${vs.n} versões`);
  await page.click('[data-cab="hist"]');
  await page.click('[data-vver="1"]');
  ok(await page.evaluate(() => /versão 1/.test(document.querySelector('.ct-faixa.in').textContent) && document.querySelectorAll('#ctiPane .fvd-cl').length === 10), 'histórico: a versão 1 abre como era (10 cláusulas)');
  await foto('07-historico');
  await page.click('[data-vsai]');

  console.log('PDF, Word e impressão');
  const pdf = await page.evaluate(async () => { if (!(window.jspdf && window.jspdf.jsPDF)) { try { await carregarLibs(); } catch (e) {} } if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable)) return null; const D = ctD(CTI.doc, ctMetaDe(CTI)); const doc = pdfDoc(D); return { pags: doc.internal.getNumberOfPages(), tam: doc.output('arraybuffer').byteLength, capa: !!D.capa }; }).catch((e) => ({ erro: String(e) }));
  if (pdf === null) console.log('  – PDF: bibliotecas não disponíveis neste ambiente (defina JB_LIBS); conferência pulada');
  else ok(!pdf.erro && pdf.pags >= 3 && pdf.tam > 8000 && pdf.capa, `PDF gerado: ${pdf.pags} páginas (capa + contrato), ${pdf.tam} bytes${pdf.erro ? ' · ' + pdf.erro : ''}`);
  const word = await page.evaluate(() => { const h = wordDoc(ctD(CTI.doc, ctMetaDe(CTI))); return /CONTRATO DE PRESTAÇÃO/.test(h) && /CLÁUSULA DÉCIMA PRIMEIRA/.test(h); });
  ok(word, 'Word editável com todas as cláusulas');

  console.log('Situações, assinatura e documento travado');
  await page.evaluate(async () => { CTI.rec = await ctMudarStatus(CTI.rec, 'Gerado'); CTI.rec = await ctMudarStatus(CTI.rec, 'Pronto para assinar'); ctPintar(); });
  await page.fill('#ctiTxt', 'Altere as condições de pagamento para R$ 9.000,00.');
  await page.click('#ctiForm button[type=submit]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => /aguardando assinatura/.test(CTI.msgs[CTI.msgs.length - 1].t) && !/9\.000/.test(JSON.stringify(CTI.doc))), 'aguardando assinatura: a IA não altera o texto enviado para assinar');
  const nPed = pedidos.length;
  page.evaluate(() => ctMudarStatus(CTI.rec, 'Assinado').then((n) => { window.__ass = n; })).catch(() => {});
  await page.waitForSelector('.ct-dlg');
  await page.fill('.ct-dlg input[name=comprovante]', '');
  await page.click('.ct-dlg button[type=submit]');
  ok(await page.evaluate(() => /comprovação/.test(document.querySelector('.ct-dlg-e').textContent)) && (await noBanco('docsEmitidos/' + d1.id)).status === 'Pronto para assinar', 'sem comprovação, o documento NÃO é marcado como assinado');
  await page.fill('.ct-dlg input[name=comprovante]', 'Via em papel na pasta Contratos 2026');
  await page.check('.ct-dlg input[name=vi]');
  await page.waitForTimeout(800);   // o sistema ignora um segundo clique em menos de 0,7 s (proteção contra gravar duas vezes)
  await page.click('.ct-dlg button[type=submit]');
  await page.waitForFunction(() => window.__ass && window.__ass.status === 'Assinado'); await page.evaluate(() => { CTI.rec = window.__ass; ctPintar(); }); await pronto();
  const as = await noBanco('docsEmitidos/' + d1.id);
  ok(as.status === 'Assinado' && as.assinatura && as.assinatura.comprovante && as.assinatura.registradoPor === 'u_DONO' && as.assinatura.versao === 6, 'assinatura registrada com data, forma, comprovação, responsável e versão');
  await page.fill('#ctiTxt', 'Remova a cláusula 2').catch(() => {});
  const trav = await page.evaluate(async () => { let erro = ''; try { await ctSalvar('tentativa'); } catch (e) { erro = e.code; } await ctEditar('Remova a cláusula 2'); return { erro, msg: CTI.msgs[CTI.msgs.length - 1].t, n: CTI.doc.clausulas.length, ver: CTI.rec.versao }; });
  ok(trav.erro === 'travado' && /não é alterado/.test(trav.msg) && trav.n === 11 && trav.ver === 6 && pedidos.length === nPed, 'documento assinado travado: nem a IA nem o salvamento substituem a versão assinada');
  await page.click('[data-cab="editar"]');
  ok(await page.evaluate(() => /travado/.test(document.querySelector('#ctiPane').textContent)), '“Editar à mão” fechado no documento assinado');
  await foto('08-assinado');

  console.log('Duplicar, renovar, aditivo e distrato');
  await page.evaluate((id) => ctDuplicar(DATA.docsEmitidos.find((x) => x.id === id)), d1.id);
  await page.waitForFunction((id) => CTI && CTI.rec && CTI.rec.id !== id, d1.id, { timeout: 10000 }); await pronto();
  const dup = await page.evaluate(() => ({ numero: CTI.rec.numero, status: CTI.rec.status, n: CTI.doc.clausulas.length, ass: !!CTI.rec.assinatura }));
  ok(dup.numero !== d1.numero && dup.status === 'Rascunho' && dup.n === 11 && !dup.ass, `duplicado como rascunho novo (${dup.numero}), sem a assinatura`);
  await page.click('[data-pre]'); await page.waitForSelector('.ct-dlg');
  await page.fill('.ct-dlg input[name=v]', 'Representante Exemplo'); await page.waitForTimeout(750); await page.click('.ct-dlg button[type=submit]');
  await page.waitForFunction(() => ctPendencias(CTI.doc).length === 0 && !document.querySelector('.ct-dlg'), null, { timeout: 10000 }); await pronto();
  ok(await page.evaluate(() => !document.querySelector('.ct-falta') && /Representante Exemplo/.test(document.querySelector('#fvdDoc').textContent)), 'campo em branco preenchido pelo toque no trecho destacado');
  for (const [tipo, fala, re] of [['renovacao', 'Renovar até 30/11/2028, com o mesmo valor.', /RENOVAÇÃO/], ['aditivo', 'Muda o valor mensal para R$ 5.500,00 a partir de janeiro. É um aditivo.', /ADITIVO/], ['distrato', 'Encerrar em 31/12/2026 com quitação total. É um distrato.', /DISTRATO/]]) {
    await page.evaluate(([id, t]) => ctDerivar(DATA.docsEmitidos.find((x) => x.id === id), t), [d1.id, tipo]);
    await page.waitForFunction(() => CTI && !CTI.rec && CTI.origem && document.querySelector('#ctiTxt'), null, { timeout: 10000 });
    await page.fill('#ctiTxt', fala); await page.click('#ctiForm button[type=submit]');
    await page.waitForFunction(() => CTI && CTI.doc && CTI.rec && !CTI.pensando, null, { timeout: 20000 }); await pronto();
    const dv = await page.evaluate(() => ({ titulo: CTI.doc.titulo, origem: CTI.rec.origemNumero, tipo: CTI.rec.origemTipo, capa: !!document.querySelector('.fvd-capa'), txt: JSON.stringify(CTI.doc) }));
    ok(re.test(dv.titulo) && dv.origem === d1.numero && dv.tipo === tipo && !dv.capa && dv.txt.includes(d1.numero), `${tipo}: ${dv.titulo} ligado ao ${d1.numero}, sem folha de rosto (formato de termo)`);
  }
  const orig = await noBanco('docsEmitidos/' + d1.id), origV = await page.evaluate((id) => ctVersoesDe(id).length, d1.id);
  ok(orig.status === 'Assinado' && orig.versao === 6 && origV === 6, 'o contrato original assinado continua igual depois dos derivados');

  console.log('Contrato trabalhista, dado pessoal fora da IA e conferência de artigo');
  await ir('#/central');
  await page.fill('#ctPedido', 'Quero contratar o Funcionário Exemplo Um com contrato de experiência de 45 dias, com carteira assinada.');
  await page.click('#ctIr');
  await page.waitForFunction(() => CTI && CTI.doc && CTI.rec && CTI.doc.categoria === 'trabalhista' && !CTI.pensando, null, { timeout: 20000 }); await pronto();
  const tr = await page.evaluate(() => { const V = ctVerificar(CTI.doc, CTI.analise); return { fid: CTI.fid, capa: !!document.querySelector('.fvd-capa'), html: document.querySelector('#fvdDoc').textContent, papeis: CTI.doc.partes.map((p) => p.papel).join(), v4: V.itens[3], bruto: JSON.stringify(CTI.doc.partes), tags: CTI.rec.tags.join() }; });
  ok(tr.fid === 'f1' && /EMPREGADOR/.test(tr.papeis) && /trabalho/.test(tr.tags) && !tr.capa, 'contrato de trabalho reconhecido (CLT), ligado ao cadastro do funcionário, sem folha de rosto');
  ok(/529\.982\.247-25/.test(tr.html) && /1\.850,00/.test(tr.html) && /\{\{pessoa\.cpf\}\}/.test(tr.bruto), 'CPF e salário do cadastro aparecem no documento por marcador');
  ok(!pedidos.some((p) => p.includes(CPF) || p.includes('529.982.247-25') || p.includes('1234567') || p.includes('Rua das Olarias')), 'nenhum pedido enviado à IA contém CPF, RG ou endereço do cadastro');
  ok(tr.v4.ok === false && /999/.test(tr.v4.det), 'artigo que não está na base jurídica (art. 999 da CLT) foi apontado para confirmar');
  await foto('09-trabalhista');

  console.log('Pedido ilícito');
  await ir('#/central');
  await page.fill('#ctPedido', 'Quero um contrato de autônomo para esconder o vínculo de um empregado sem registrar.');
  await page.click('#ctIr');
  await page.waitForFunction(() => CTI && !CTI.pensando && CTI.msgs.some((m) => m.k === 'erro'), null, { timeout: 15000 });
  ok(await page.evaluate(() => !CTI.doc && !CTI.rec && /vínculo/.test(CTI.msgs[CTI.msgs.length - 1].t)), 'pedido para esconder vínculo de emprego é recusado, sem gerar documento');

  console.log('Modelo da empresa e recuperação');
  await page.evaluate(async (id) => { CTI = null; location.hash = '#/doc/' + id; }, d1.id); await page.waitForFunction((id) => CTI && CTI.rec && CTI.rec.id === id, d1.id);
  const rec = await page.evaluate(() => ({ n: CTI.doc.clausulas.length, vers: CTI.versoes.length, conv: CTI.msgs.length, ass: !!CTI.rec.assinatura }));
  ok(rec.n === 11 && rec.vers === 6 && rec.conv >= 6 && rec.ass, 'documento reaberto do banco com texto, versões, conversa e assinatura');
  page.evaluate(() => ctSalvarModelo(CTI)).catch(() => {});
  await page.waitForSelector('.ct-dlg'); await page.fill('.ct-dlg input[name=nome]', 'Manutenção de equipamentos (modelo da casa)'); await page.click('.ct-dlg button[type=submit]');
  await page.waitForFunction(() => DATA.docsEmitidos.some((d) => d.serie === 'MD'), null, { timeout: 10000 });
  const md = await page.evaluate(() => { const m = DATA.docsEmitidos.find((d) => d.serie === 'MD'); const c = ctCorpo(m); return { nome: m.nomeModelo, lista: docsVisiveis('CT').some((d) => d.id === m.id), p2: JSON.stringify(c ? c.doc.partes[1] : ''), id: m.id, atual: CTI.rec.serie }; });
  ok(md.nome === 'Manutenção de equipamentos (modelo da casa)' && !md.lista && /PREENCHER/.test(md.p2) && !/22\.333\.444/.test(md.p2) && md.atual === 'CT', 'modelo salvo na biblioteca da empresa, sem os dados da outra parte e fora da lista de contratos');
  await ir('#/central'); await page.click('[data-ca="biblioteca"]'); await page.click('[data-bib="M"]'); await page.click('[data-musar]');
  await page.waitForFunction(() => CTI && CTI.rec && CTI.rec.serie === 'CT' && CTI.rec.status === 'Rascunho' && /modelo/.test(CTI.msgs[0].t), null, { timeout: 10000 }); await pronto();
  ok(await page.evaluate(() => CTI.doc.clausulas.length === 11 && ctPendencias(CTI.doc).length >= 3), 'usar o modelo cria um documento novo com as cláusulas e os campos da outra parte a preencher');

  console.log('Criação pelo modelo pronto (sem IA) e regras de assinatura nos documentos antigos');
  const ant = await page.evaluate(async () => { const m = MODELO['pj-equipamentos']; const v = { ...padraoDoc(m), pj_razao: 'Oficina Exemplo LTDA', cnpj: '11222333000181', atividade: 'manutenção', objeto: 'manutenção dos fornos', valor: 3000, inicio: '2026-12-01', rep_cpf: '52998224725' }; const r = await salvarDocCentral(m, v, m.clausulas, m.intro || null, null, 'Rascunho'); return { id: r.id, numero: r.numero }; });
  await ir('#/doc/' + ant.id);
  ok(await page.evaluate(() => !!document.querySelector('#dvPdf') && /Oficina Exemplo/.test(document.querySelector('#fvdDoc').textContent)), `documento criado pelo modelo pronto abre na tela de sempre (${ant.numero})`);
  const og = await page.evaluate((id) => { const o = ctOrigemDe(DATA.docsEmitidos.find((x) => x.id === id), 'aditivo'); return { cpf: /529\.982\.247-25|52998224725/.test(o.texto), marc: /\{\{orig\.rep_cpf\}\}/.test(o.texto), mapa: o.mapa['{{orig.rep_cpf}}'] }; }, ant.id);
  ok(!og.cpf && og.marc && og.mapa === '529.982.247-25', 'aditivo de documento antigo: o CPF vira marcador antes de ir para a IA');
  await page.click('#dvMais');
  const menu = await page.evaluate(() => [...document.querySelectorAll('.dc-pop button')].map((b) => b.textContent));
  ok(menu.some((t) => /Registrar assinatura/.test(t)) && menu.some((t) => /Criar aditivo/.test(t)) && menu.some((t) => /Criar distrato/.test(t)) && menu.some((t) => /Renovar/.test(t)) && !menu.some((t) => /Marcar como (assinado|vigente)/.test(t)), 'documento antigo ganhou Renovar, Criar aditivo, Criar distrato e Registrar assinatura (com comprovação)');
  await page.keyboard.press('Escape'); await page.mouse.click(5, 5);

  console.log('Empresa, filiais e base jurídica');
  await ir('#/central');
  await page.click('#ctEmpEd'); await page.waitForSelector('.ct-dlg');
  await page.fill('.ct-dlg input[name=repCargo]', 'Sócio-administrador');
  await page.fill('.ct-dlg input[name=f_apelido_0]', 'Filial Centro'); await page.fill('.ct-dlg input[name=f_razao_0]', 'Empresa Exemplo Filial LTDA'); await page.fill('.ct-dlg input[name=f_cnpj_0]', '11.222.333/0002-62');
  await page.waitForTimeout(750); await page.click('.ct-dlg button[type=submit]');
  await page.waitForFunction(() => (CFG.estabelecimentos || []).length === 1 && CFG.empresa.repCargo === 'Sócio-administrador' && !!document.querySelector('#ctEmp'), null, { timeout: 10000 });
  const emp = await page.evaluate(() => ({ op: [...document.querySelectorAll('#ctEmp option')].map((o) => o.textContent), cpf: ctEmpresa('matriz').repCpf, cfgTemCpf: JSON.stringify(CFG).includes('11144477735'), regras: ctRegras({ empresaId: CFG.estabelecimentos[0].id }) }));
  ok(emp.op.length === 2 && emp.op[1] === 'Filial Centro' && /Empresa Exemplo Filial LTDA/.test(emp.regras) && /11\.222\.333\/0002-62/.test(emp.regras), 'filial cadastrada aparece para escolher e os dados dela entram no pedido à IA');
  ok(emp.cpf === '11144477735' && !emp.cfgTemCpf && !/111\.444\.777-35|11144477735/.test(emp.regras), 'CPF do representante fica na área protegida e não vai para a IA');
  await page.click('[data-ca="base"]'); await page.click('#ctBaseAdd'); await page.waitForSelector('.ct-dlg');
  await page.fill('.ct-dlg input[name=lei]', 'Convenção Coletiva 2026/2027'); await page.fill('.ct-dlg textarea[name=nota]', 'Piso salarial de R$ 1.800,00.');
  await page.waitForTimeout(750); await page.click('.ct-dlg button[type=submit]');
  await page.waitForFunction(() => (CFG.ctBase || []).length === 1 && !document.querySelector('.ct-dlg') && /acrescentada pela empresa/.test((document.querySelector('.painel') || {}).textContent || ''), null, { timeout: 10000 });
  const bs = await page.evaluate(() => ({ n: ctBase().length - CT_BASE.length, noPedido: /Convenção Coletiva 2026\/2027/.test(ctRegras({ empresaId: 'matriz' })), tela: /acrescentada pela empresa/.test(document.querySelector('.painel').textContent) }));
  ok(bs.n === 1 && bs.noPedido && bs.tela, 'base jurídica atualizável: a referência acrescentada passa a valer para a IA');
  await page.click('[data-ca="docs"]');

  const cont = await page.evaluate(async () => { const orig = APP.sample; let n = 0; const vistos = []; APP.sample = async (input, o) => { n++; vistos.push(input.length); const t = n === 1 ? 'parte um ' : 'parte dois'; if (o.onText) o.onText({ text: t }); return { text: t, truncated: n === 1 }; }; let parcial = ''; let r; try { r = await ctChamarIA([{ role: 'user', content: 'x' }], { onText: (t) => { parcial = t; } }); } finally { APP.sample = orig; } return { r, n, vistos: vistos.join(), parcial }; });
  ok(cont.r === 'parte um parte dois' && cont.n === 2 && cont.vistos === '1,3' && cont.parcial === 'parte um parte dois', 'resposta cortada no limite da IA continua de onde parou, sem perder o que já veio');

  console.log('Criar do meu jeito (modo livre, em branco e microfone)');
  await ir('#/central'); await page.click('[data-ca="livre"]');
  ok(await page.evaluate(() => !!document.querySelector('#ctLivre') && !!document.querySelector('[data-mic="ctLivre"]') && !!document.querySelector('[data-mic="ctPedido"]') && !!document.querySelector('#ctBranco')), 'aba “Criar do meu jeito” com campo grande, microfone e “Abrir em branco”');
  const n0 = pedidos.length;
  await page.fill('#ctLivre', 'Contrato de manutenção do jeito que eu quero: a contratada recebe R$ 4.500,00 por mês e a multa é de 50% se ela atrasar.');
  await page.click('#ctLivreIr');
  await page.waitForFunction(() => CTI && CTI.livre && CTI.doc && CTI.rec && !CTI.pensando, null, { timeout: 20000 }); await pronto();
  const lv = await page.evaluate(() => ({ livre: CTI.rec.livre, nota: /Modo livre/.test(document.querySelector('.cti-nota').textContent), banner: !!document.querySelector('.ct-faixa.at b') && /Risco trabalhista/.test(document.querySelector('.ct-faixas').textContent) }));
  const pl = pedidos.slice(n0);
  ok(pl.length === 1 && /MODO LIVRE/.test(pl[0]) && !/REGRAS QUE VALEM SEMPRE/.test(pl[0]) && /Faça exatamente o que ele pedir/.test(pl[0]), 'modo livre: vai direto para a redação (sem perguntas) com a regra de fazer do jeito pedido');
  ok(lv.livre && lv.nota && !lv.banner, 'documento do modo livre salvo, marcado como livre e sem faixa de alerta por cima');
  await page.fill('#ctiTxt', 'Altere as condições de pagamento para R$ 5.000,00.'); await page.click('#ctiForm button[type=submit]');
  await page.waitForFunction(() => !CTI.pensando && CTI.rec.versao === 2, null, { timeout: 15000 }); await pronto();
  ok(/Modo livre: faça o que foi pedido/.test(pedidos[pedidos.length - 1]), 'conversa no modo livre também segue o pedido sem barrar');
  await ir('#/central'); await page.click('[data-ca="livre"]'); await page.click('#ctBranco');
  await page.waitForFunction(() => CTI && CTI.livre && CTI.rec && CTI.aba === 'editar' && document.querySelector('[data-ect="0"]'), null, { timeout: 10000 }); await pronto();
  const nb = pedidos.length;
  await page.evaluate(() => { const t = document.querySelector('[data-ect="0"]'); t.value = 'Do que eu quero'; t.dispatchEvent(new Event('input', { bubbles: true })); const x = document.querySelector('[data-ecx="0"]'); x.value = 'Texto escrito por mim, do meu jeito.'; x.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#ctiEdSalvar'); await page.waitForFunction(() => !CTI.sujo && CTI.rec.versao === 2, null, { timeout: 10000 }); await pronto();
  ok(await page.evaluate(() => /Texto escrito por mim/.test(document.querySelector('#ctiPane').textContent) || CTI.doc.clausulas[0].x === 'Texto escrito por mim, do meu jeito.') && pedidos.length === nb, 'contrato em branco escrito à mão, salvo sem passar pela IA');
  const mic = await page.evaluate(() => { let ok1 = false; const R = function () { this.start = () => { ok1 = true; setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'cláusula falada' }], { isFinal: true })] }), 10); }; this.stop = () => { this.onend && this.onend(); }; }; window.webkitSpeechRecognition = R; window.SpeechRecognition = R; ctMic(document.querySelector('[data-mic="ctiTxt"]'), 'ctiTxt'); return new Promise((r) => setTimeout(() => { const v = document.querySelector('#ctiTxt').value; ctMicParar(); r({ ok1, v }); }, 60)); });
  ok(mic.ok1 && /cláusula falada/.test(mic.v), 'microfone: o que é falado aparece escrito no campo');

  console.log('Lista, filtros e celular');
  await ir('#/central');
  await page.click('[data-ca="docs"]');
  const ls = await page.evaluate(() => ({ linhas: document.querySelectorAll('tr[data-doc]').length, chips: Object.fromEntries([...document.querySelectorAll('.dc-chips [data-csit]')].map((b) => [b.dataset.csit, +b.querySelector('span').textContent])) }));
  ok(ls.linhas >= 7 && ls.chips.assinados === 1 && ls.chips.vigentes === 1 && ls.chips.rascunhos >= 5 && 'aguardando' in ls.chips && 'gerados' in ls.chips && 'vencendo' in ls.chips && 'encerrados' in ls.chips && 'cancelados' in ls.chips, `lista com ${ls.linhas} documentos e as oito situações (${JSON.stringify(ls.chips)})`);
  await foto('10-lista');
  await page.setViewportSize({ width: 390, height: 800 });
  await ir('#/doc/' + d1.id); await page.waitForSelector('.cti');
  const mob = await page.evaluate(() => ({ larg: document.documentElement.scrollWidth <= window.innerWidth + 1, abas: getComputedStyle(document.querySelector('.cti-mob')).display !== 'none' }));
  ok(mob.larg && mob.abas, 'no celular: sem rolagem lateral, com as abas Conversa e Documento');
  await foto('11-celular');
  await ir('#/central'); await foto('12-celular-inicio');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'tela inicial cabe no celular');

  const relevantes = erros.filter((m) => !/Chart|XLSX|Failed to fetch|NetworkError|net::/.test(m));
  ok(relevantes.length === 0, `sem erros de JavaScript${relevantes.length ? ': ' + relevantes.slice(0, 4).join(' | ') : ''}`);
  await ctx.close();
} finally {
  await browser.close(); http.close();
}
console.log(falhas ? `\n${falhas} item(ns) falharam.` : '\nContratos com IA: tudo certo.');
process.exit(falhas ? 1 : 0);
