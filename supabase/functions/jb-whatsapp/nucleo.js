// =====================================================================
// JB WhatsApp · núcleo sem rede (testado por scripts/testar-whatsapp.mjs)
//
// Monta, a partir das linhas de public.docs, o mesmo "Resumo do dia" do
// programa (bloco V77 de app/jb-gestao.html) na visão de quem tem acesso a
// todos os setores. Só leitura: nada é gravado e nada é recalculado além das
// mesmas contas da tela. Se as regras do V77 mudarem, mude aqui também.
//
// Também monta os 7 parâmetros do modelo aprovado na Meta e o corpo do envio.
// =====================================================================

export const COLECOES = ['vendas', 'compras', 'consumos', 'fin', 'despesas', 'prodFab', 'alm', 'pal', 'locais', 'produtos', 'funcionarios', 'vales', 'diario', 'config'];

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

/* ---------- números e textos no formato do programa ---------- */
const num = (v) => (v === '' || v == null || !isFinite(+v) ? 0 : +v);
const r2 = (v) => Math.round(num(v) * 100) / 100;
const r3 = (v) => Math.round(num(v) * 1000) / 1000;
const soma = (xs, f) => (xs || []).reduce((a, x) => a + num(f(x)), 0);
const fNum = (v, d = 0) => num(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fMoeda = (v) => (r2(v) < 0 ? '-' : '') + 'R$ ' + fNum(Math.abs(r2(v)), 2);
const fI = (v) => fNum(Math.round(num(v)));
const fQtd = (v) => fNum(v, Number.isInteger(r3(v)) ? 0 : 3).replace(/(,\d*?)0+$/, '$1').replace(/,$/, '');
const fData = (d) => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
const juntar = (...a) => a.filter((x) => x != null && String(x).trim() !== '').join(' · ');
const plural = (n, um, varios) => fI(n) + ' ' + (Math.round(num(n)) === 1 ? um : varios);

export function diaEmFortaleza(agora = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
export const diaValido = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d + 'T12:00:00Z'));
export function diaLongo(d) { return DIAS[new Date(d + 'T12:00:00Z').getUTCDay()] + ', ' + fData(d); }

/* ---------- de public.docs para as listas do programa ---------- */
export function organizar(linhas) {
  const por = {};
  for (const l of linhas || []) {
    const lista = por[l.colecao] || (por[l.colecao] = []);
    const d = l.dados || {};
    if (d.items && typeof d.items === 'object') {
      for (const [id, v] of Object.entries(d.items)) if (v && typeof v === 'object') lista.push({ ...v, id: v.id || id });
    } else lista.push({ ...d, id: d.id || l.id });
  }
  const de = (c) => por[c] || [];
  const fin = de('fin'), pf = de('prodFab'), alm = de('alm'), pal = de('pal');
  const tp = (xs, t) => xs.filter((r) => r.tipo === t);
  const jb = (xs, t) => xs.filter((r) => r.jbt === t);
  return {
    vendas: de('vendas'), compras: de('compras'), consumos: de('consumos'), despesas: de('despesas'),
    locais: de('locais'), produtos: de('produtos'), funcionarios: de('funcionarios'), vales: de('vales'), diario: de('diario'),
    fTitulos: tp(fin, 'titulo'),
    pmaromba: tp(pf, 'maromba'), pparadas: tp(pf, 'parada'), psecmov: tp(pf, 'secagem'), pfornadas: tp(pf, 'fornada'), pdesenf: tp(pf, 'desenforna'),
    almEntradas: jb(alm, 'entrada'), almSaidas: jb(alm, 'saida'), paleteMov: jb(pal, 'mov'),
    empresa: (de('config').find((c) => c.id === 'empresa') || {}).empresa || {},
  };
}

/* ---------- regras iguais às do programa ---------- */
const cancV = (v) => !!v && (v.status === 'Cancelada' || v.status === 'Cancelado');
const parteV = (x) => (x && x[x.tipoOp === 'compra' ? 'fornecedor' : 'cliente']) || {};
const milheirosDe = (v) => soma((v.itens || []).filter((i) => /milheiro/i.test(i.unidade || '')), (i) => i.qtd);
const ehRefeicao = (m) => /refei|almo[cç]o|jantar|intervalo/i.test(String(m || ''));
const liquidaMar = (r) => Math.max(0, num(r.grades) * num(r.porGrade) + num(r.incompleta) - num(r.perdas));
const confirmado = (r) => r && r.situacao === 'Confirmado';
const desQ = (x) => num(x.total) || num(x.primeira) + num(x.segunda) + num(x.quebrados) + num(x.trincados) + num(x.outras);

function saldoTitulos(tits, pg) {
  const ord = tits.slice().sort((a, b) => String(a.venc).localeCompare(String(b.venc)) || (a.n - b.n));
  const pago = {}; ord.forEach((t) => { pago[t.id] = 0; });
  const resto = [];
  pg.forEach((p) => {
    let x = num(p.valor);
    if (p.tituloId && pago[p.tituloId] != null) {
      const t = ord.find((y) => y.id === p.tituloId);
      const usa = Math.min(x, r2(num(t.valor) - pago[t.id]));
      pago[t.id] = r2(pago[t.id] + usa); x = r2(x - usa);
    }
    if (x > 0.004) resto.push(x);
  });
  resto.forEach((x0) => {
    let x = x0;
    for (const t of ord) {
      if (x <= 0.004) break;
      const f = r2(num(t.valor) - pago[t.id]);
      if (f <= 0.004) continue;
      const usa = Math.min(x, f);
      pago[t.id] = r2(pago[t.id] + usa); x = r2(x - usa);
    }
  });
  return r2(soma(ord, (t) => (t.renegociado ? 0 : Math.max(0, r2(num(t.valor) - pago[t.id])))));
}
function saldoVenda(v) {
  const pg = (v.pagamentos || []).filter((p) => !p.estornado);
  if (v.fluxo === 'pedido') {
    const tits = (v.titulos || []).filter((t) => !t.cancelado);
    return tits.length ? saldoTitulos(tits, pg) : 0;
  }
  if (v.historico && !cancV(v)) return 0;
  if (cancV(v)) return 0;
  return r2(Math.max(0, r2(v.total) - r2(soma(pg, (p) => p.valor))));
}

/* tudo o que saiu no dia: os compromissos do Financeiro (títulos, compras, despesas de pessoal) */
function saidasDoDia(D, d, nomeF) {
  const sai = [];
  const pega = (pagamentos, base) => pagamentos.filter((p) => p.data === d).forEach((p) => sai.push({ ...base, valor: r2(p.valor), forma: p.forma || '' }));
  D.fTitulos.forEach((t) => pega((t.pagamentos || []).filter((p) => !p.estornado), {
    benef: t.beneficiarioNome || t.beneficiario || t.descricao || '—', categoria: t.categoria || '', descricao: t.descricao || '',
  }));
  D.compras.filter((c) => c.tipoOp === 'compra' && !c.historico).forEach((c) => pega((c.pagamentos || []).filter((p) => !p.estornado), {
    benef: parteV(c).nome || 'Compra', categoria: c.setor === 'lenha' ? 'Lenha' : 'Combustíveis', descricao: (c.itens || []).map((i) => i.nome).filter(Boolean).join(', ') || 'Compra',
  }));
  D.despesas.filter((x) => x.situacao !== 'Cancelado').forEach((x) => {
    if (x.situacao !== 'Pago') return;
    const prev = r2(x.valorPrevisto), real = r2(num(x.valorRealizado) || num(x.valor));
    const val = prev > 0 ? prev : real;
    pega([{ data: x.dataPagamento || '', valor: real > 0 ? real : val, forma: x.formaPagamento || '' }], {
      benef: (x.funcionarioId && nomeF(x.funcionarioId)) || x.descricao || x.categoria || 'Despesa com pessoal', categoria: x.categoria || '', descricao: x.descricao || x.categoria || '',
    });
  });
  return sai;
}

/* ---------- o resumo ---------- */
const lin = (t, s, v) => ({ t: String(t || '—'), s: s || '', v: v || '' });

export function calcularResumo(D, d) {
  const nomeF = (id) => { const f = D.funcionarios.find((x) => x.id === id); return f ? f.nome : ''; };
  const nomeLoc = (id) => { const l = D.locais.find((x) => x.id === id); return l ? String(l.nome || '') + (l.identificacao ? ' (' + l.identificacao + ')' : '') : ''; };
  const nomeProd = (id) => { const p = D.produtos.find((x) => x.id === id); return p ? String(p.nome || '') : ''; };

  /* dinheiro */
  const ent = [];
  D.vendas.filter((v) => v.tipoOp !== 'compra' && !cancV(v) && !v.historico)
    .forEach((v) => (v.pagamentos || []).filter((p) => !p.estornado && p.data === d).forEach((p) => ent.push({ v, p })));
  const sai = saidasDoDia(D, d, nomeF);
  const totEnt = r2(soma(ent, (x) => x.p.valor)), totSai = r2(soma(sai, (x) => x.valor)), saldo = r2(totEnt - totSai);
  const cats = {};
  sai.forEach((x) => { const k = x.categoria || 'Sem categoria'; const c = cats[k] || (cats[k] = { v: 0, q: 0 }); c.v += x.valor; c.q++; });
  const catL = Object.entries(cats).sort((a, b) => b[1].v - a[1].v);

  /* vendas */
  const vs = D.vendas.filter((v) => v.tipoOp !== 'compra' && !cancV(v) && v.data === d).sort((a, b) => num(a.numero) - num(b.numero));
  const totV = r2(soma(vs, (v) => v.total)), mil = soma(vs, milheirosDe), abr = r2(soma(vs, saldoVenda));

  /* produção */
  const mar = D.pmaromba.filter((r) => r.data === d), marOk = mar.filter(confirmado), marP = mar.filter((r) => !confirmado(r));
  const enf = D.pfornadas.filter((f) => f.data === d), des = D.pdesenf.filter((x) => x.data === d);
  const par = D.pparadas.filter((p) => p.data === d && !ehRefeicao(p.motivo));
  const prod = soma(marOk, liquidaMar), totEnf = soma(enf, (f) => f.quantidade), totDes = soma(des, desQ);

  /* combustível */
  const cs = D.consumos.filter((c) => c.setor === 'combustivel' && c.data === d).sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
  const quem = (c) => (c.localId ? nomeLoc(c.localId) || 'Veículo ou máquina' : c.terceiroNome ? c.terceiroNome + (/terceir/i.test(c.terceiroNome) ? '' : ' (terceiro)') : c.abastecidoEm || 'Abastecimento');
  const litros = soma(cs, (c) => c.quantidade), custo = r2(soma(cs, (c) => c.custoTotal));
  const cpComb = D.compras.filter((v) => v.tipoOp === 'compra' && v.setor === 'combustivel' && !cancV(v) && v.data === d);
  const entrega = D.fTitulos.filter((t) => !t.cancelado && t.categoria === 'Combustível para entrega' && t.data === d);

  /* lenha */
  const cpL = D.compras.filter((v) => v.tipoOp === 'compra' && v.setor === 'lenha' && !cancV(v) && v.data === d);
  const qtdC = (v) => soma(v.itens, (i) => i.qtd);
  const csL = D.consumos.filter((c) => c.setor === 'lenha' && c.data === d);
  const m3C = soma(cpL, qtdC), m3U = soma(csL, (c) => c.quantidade), valL = r2(soma(cpL, (v) => v.total));

  /* almoxarifado e paletes */
  const almE = D.almEntradas.filter((e) => e.data === d && !e.cancelado), almS = D.almSaidas.filter((s) => s.data === d && !s.cancelado);
  const pals = D.paleteMov.filter((m) => m.data === d && !m.cancelado);

  /* setor pessoal */
  const adm = D.funcionarios.filter((f) => f.admissao === d), dem = D.funcionarios.filter((f) => f.dataDesligamento === d);
  const vales = D.vales.filter((v) => v.data === d), faltas = D.diario.filter((x) => x.data === d && /^falta/i.test(x.tipo || ''));

  const secoes = [
    {
      titulo: 'Dinheiro: entrou e saiu',
      linhas: [
        lin('Entrou', plural(ent.length, 'recebimento', 'recebimentos'), fMoeda(totEnt)),
        lin('Saiu', plural(sai.length, 'pagamento', 'pagamentos'), fMoeda(totSai)),
        lin('Saldo do dia', 'entrou menos saiu', fMoeda(saldo)),
        ...catL.map(([k, c]) => lin('Saiu em ' + k, plural(c.q, 'pagamento', 'pagamentos'), fMoeda(c.v))),
        ...ent.map((x) => lin('Recebido de ' + (parteV(x.v).nome || 'cliente não informado'), juntar('Venda nº ' + String(x.v.numero || '').padStart(6, '0'), x.p.forma), fMoeda(x.p.valor))),
        ...sai.slice().sort((a, b) => b.valor - a.valor).map((x) => lin('Pago a ' + x.benef, juntar(x.categoria, x.descricao && x.descricao !== x.benef ? x.descricao : '', x.forma), fMoeda(x.valor))),
      ],
    },
    {
      titulo: 'Vendas',
      vazio: 'Nenhuma venda lançada neste dia.',
      linhas: vs.length ? [
        lin('Total vendido', juntar(plural(vs.length, 'venda', 'vendas'), fQtd(mil) + ' milheiro(s)', abr > 0.004 ? 'a receber ' + fMoeda(abr) : ''), fMoeda(totV)),
        ...vs.map((v) => { const q = milheirosDe(v); const sd = saldoVenda(v); return lin(parteV(v).nome || 'Cliente não informado', juntar('Nº ' + String(v.numero || '').padStart(6, '0'), q ? fQtd(q) + ' milheiro(s)' : '', v.tipoVenda, sd > 0.004 ? 'a receber ' + fMoeda(sd) : v.forma || 'recebido'), fMoeda(v.total)); }),
      ] : [],
    },
    {
      titulo: 'Produção',
      aviso: marP.length ? marP.length + ' lançamento(s) da maromba aguardando confirmação: não entram no total.' : '',
      vazio: 'Nenhuma produção lançada neste dia.',
      linhas: (mar.length || enf.length || des.length || par.length) ? [
        lin('Produzido na maromba', '', fI(prod) + ' tijolos'),
        lin('Enfornados', '', fI(totEnf) + ' tijolos'),
        lin('Desenfornados', '', fI(totDes) + ' tijolos'),
        ...enf.map((f) => lin('Enfornou · ' + (nomeLoc(f.fornoId) || 'Forno'), juntar(f.numero && !/cont/i.test(f.fornoId || '') ? 'fornada nº ' + f.numero : '', f.hora), fI(f.quantidade) + ' tijolos')),
        ...des.map((x) => lin('Desenfornou · ' + (nomeLoc(x.fornoId) || 'Forno'), juntar(num(x.primeira) ? '1ª ' + fI(x.primeira) : '', num(x.segunda) ? '2ª ' + fI(x.segunda) : ''), fI(desQ(x)) + ' tijolos')),
        ...par.map((p) => lin('Parada · ' + (p.motivo || 'motivo não informado'), juntar(p.turno, p.inicio && p.fim ? p.inicio + ' às ' + p.fim : ''), '')),
      ] : [],
    },
    {
      titulo: 'Combustível',
      vazio: 'Nenhum abastecimento lançado neste dia.',
      linhas: (cs.length || entrega.length || cpComb.length) ? [
        lin('Total abastecido', plural(cs.length, 'abastecimento', 'abastecimentos'), fQtd(litros) + ' L · ' + fMoeda(custo)),
        ...cs.map((c) => lin(quem(c), juntar(nomeProd(c.produtoId), c.hora, c.responsavelNome || c.operador), fQtd(c.quantidade) + ' ' + (c.unidade || 'L') + ' · ' + fMoeda(c.custoTotal))),
        ...entrega.map((t) => lin('Entrega · ' + (t.motorista || t.beneficiarioNome || t.beneficiario || 'Motorista'), juntar('Combustível para entrega', t.descricao), fMoeda(t.valor))),
        ...cpComb.map((v) => lin('Compra · ' + (parteV(v).nome || 'Fornecedor'), 'Compra nº ' + String(v.numero || '').padStart(6, '0'), fMoeda(v.total))),
      ] : [],
    },
    {
      titulo: 'Lenha',
      vazio: 'Nenhuma compra ou uso de lenha lançado neste dia.',
      linhas: (cpL.length || csL.length) ? [
        lin('Comprado', plural(cpL.length, 'carrada', 'carradas'), fQtd(m3C) + ' m³ · ' + fMoeda(valL)),
        lin('Usado nos fornos', '', fQtd(m3U) + ' m³'),
        ...cpL.map((v) => lin('Compra · ' + (parteV(v).nome || 'Fornecedor'), 'Compra nº ' + String(v.numero || '').padStart(6, '0'), fQtd(qtdC(v)) + ' m³ · ' + fMoeda(v.total))),
        ...csL.map((c) => lin('Baixa · ' + (nomeLoc(c.localId) || 'Forno'), juntar(c.fornada, c.auto ? 'baixa automática da desenforna' : ''), fQtd(c.quantidade) + ' ' + (c.unidade || 'm³'))),
      ] : [],
    },
    {
      titulo: 'Almoxarifado e cozinha',
      vazio: 'Nada lançado neste dia.',
      linhas: (almE.length || almS.length) ? [
        lin('Compras recebidas', plural(almE.length, 'entrada', 'entradas'), fMoeda(soma(almE, (e) => e.total))),
        lin('Requisições', '', fI(almS.length)),
      ] : [],
    },
    ...(pals.length ? [{ titulo: 'Paletes', linhas: [lin('Movimentações', '', fI(pals.length))] }] : []),
    {
      titulo: 'Setor Pessoal',
      vazio: 'Nenhuma admissão, desligamento, vale ou falta lançados neste dia.',
      linhas: [
        ...adm.map((f) => lin(f.nome, juntar('Admissão', f.cargo, f.setor), '')),
        ...dem.map((f) => lin(f.nome, juntar('Desligamento', f.cargo, f.setor), '')),
        ...vales.map((v) => lin(nomeF(v.funcionarioId) || '—', juntar(v.tipo || 'Vale', v.formaPagamento), fMoeda(v.valor))),
        ...faltas.map((x) => lin(nomeF(x.funcionarioId) || '—', juntar(x.tipo, x.obs), '')),
      ],
    },
  ];

  const parametros = [
    diaLongo(d),
    'entrou ' + fMoeda(totEnt) + ', saiu ' + fMoeda(totSai) + ', saldo do dia ' + fMoeda(saldo),
    vs.length ? plural(vs.length, 'venda', 'vendas') + ', ' + fQtd(mil) + ' milheiro(s), ' + fMoeda(totV) : 'nenhuma venda lançada',
    mar.length ? fI(prod) + ' tijolos' + (marP.length ? ' (' + marP.length + ' lançamento(s) aguardando confirmação)' : '') : 'nenhuma produção lançada',
    (enf.length || des.length) ? fI(totEnf) + ' enfornados, ' + fI(totDes) + ' desenfornados' : 'nenhuma enforna ou desenforna lançada',
    cs.length ? fQtd(litros) + ' L, ' + fMoeda(custo) : 'nenhum abastecimento lançado',
    (cpL.length || csL.length) ? 'comprados ' + fQtd(m3C) + ' m³ (' + fMoeda(valL) + '), usados ' + fQtd(m3U) + ' m³' : 'nenhuma compra ou uso lançado',
  ].map(limparParametro);

  const e = D.empresa || {};
  return {
    dia: d, dia_longo: diaLongo(d),
    empresa: { razao: String(e.razao || e.fantasia || 'Cerâmica Concretiza LTDA').replace(/\s+ltda\.?$/i, ' LTDA'), cnpj: e.cnpj || '54.122.076/0001-19' },
    totais: { entrou: totEnt, saiu: totSai, saldo, vendido: totV, milheiros: mil, a_receber: abr, vendas: vs.length, maromba: prod, enfornados: totEnf, desenfornados: totDes, litros, custo_combustivel: custo, lenha_comprada_m3: m3C, lenha_valor: valL, lenha_usada_m3: m3U },
    secoes, parametros,
  };
}

/* A Meta recusa parâmetro vazio, com quebra de linha, tabulação ou mais de 4 espaços seguidos */
export function limparParametro(t) {
  const s = String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
  return s || '—';
}

export function telefoneValido(t) { return /^55\d{10,11}$/.test(String(t || '')); }

export function corpoModelo({ para, modelo, idioma, mediaId, arquivo, parametros }) {
  return {
    messaging_product: 'whatsapp', recipient_type: 'individual', to: para, type: 'template',
    template: {
      name: modelo, language: { code: idioma },
      components: [
        { type: 'header', parameters: [{ type: 'document', document: { id: mediaId, filename: arquivo } }] },
        { type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) },
      ],
    },
  };
}
