#!/usr/bin/env node
// Testes do resumo diário no WhatsApp (supabase/functions/jb-whatsapp/nucleo.js), sem rede
// e com dados fictícios: as contas do resumo, o que fica de fora, os parâmetros do modelo
// (a Meta recusa parâmetro vazio ou com quebra de linha) e o corpo do envio.
//
//   node scripts/testar-whatsapp.mjs        (também roda dentro de scripts/verificar.mjs)
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { organizar, calcularResumo, corpoModelo, limparParametro, telefoneValido, fMoeda, diaLongo, diaEmFortaleza } from '../supabase/functions/jb-whatsapp/nucleo.js';

const D = '2026-11-07';
const docs = (colecao, itens) => ({ colecao, id: '2026-11-s0', dados: { chave: '2026-11-s0', items: Object.fromEntries(itens.map((x, i) => [x.id || colecao + i, x])) } });
const direto = (colecao, x) => ({ colecao, id: x.id, dados: x });

function base() {
  return [
    docs('vendas', [
      { id: 'v1', numero: 1, data: D, total: 1000, cliente: { nome: 'Cliente A' }, itens: [{ qtd: 2, unidade: 'Milheiro' }], pagamentos: [{ data: D, valor: 1000 }] },
      { id: 'v2', numero: 2, data: D, total: 500, cliente: { nome: 'Cliente B' }, itens: [{ qtd: 1, unidade: 'milheiro' }, { qtd: 3, unidade: 'frete' }], pagamentos: [] },
      { id: 'v3', numero: 3, data: D, total: 999, status: 'Cancelada', cliente: { nome: 'Cancelada' }, itens: [{ qtd: 9, unidade: 'milheiro' }], pagamentos: [{ data: D, valor: 999 }] },
      { id: 'v4', numero: 4, data: '2026-11-01', total: 300, cliente: { nome: 'Antiga' }, itens: [], pagamentos: [{ data: D, valor: 100 }, { data: D, valor: 50, estornado: true }] },
      { id: 'v5', numero: 5, data: '2026-11-02', total: 70, historico: true, cliente: { nome: 'Histórico' }, itens: [], pagamentos: [{ data: D, valor: 70 }] },
    ]),
    docs('compras', [
      { id: 'c1', tipoOp: 'compra', setor: 'lenha', numero: 7, data: D, total: 600, fornecedor: { nome: 'Lenhador' }, itens: [{ qtd: 60, unidade: 'm³' }], pagamentos: [{ data: D, valor: 600 }] },
      { id: 'c2', tipoOp: 'compra', setor: 'combustivel', numero: 8, data: '2026-11-03', total: 2000, historico: true, fornecedor: { nome: 'Posto' }, itens: [], pagamentos: [{ data: D, valor: 2000 }] },
    ]),
    docs('consumos', [
      { id: 'k1', setor: 'combustivel', data: D, hora: '08:00', quantidade: 100, custoTotal: 750.5, produtoId: 'p1', localId: 'l1' },
      { id: 'k2', setor: 'combustivel', data: '2026-11-06', quantidade: 999, custoTotal: 9999 },
      { id: 'k3', setor: 'lenha', data: D, quantidade: 54.5, localId: 'f1', unidade: 'm³' },
    ]),
    docs('fin', [
      { id: 't1', tipo: 'titulo', data: D, valor: 200, categoria: 'Manutenção', beneficiarioNome: 'Oficina', pagamentos: [{ data: D, valor: 200 }, { data: D, valor: 33, estornado: true }] },
      { id: 't2', tipo: 'titulo', data: D, valor: 80, categoria: 'Combustível para entrega', motorista: 'Motorista A', pagamentos: [] },
      { id: 'x1', tipo: 'responsavel', data: D, nome: 'não é título', pagamentos: [{ data: D, valor: 5000 }] },
    ]),
    docs('despesas', [
      { id: 'd1', situacao: 'Pago', dataPagamento: D, valorRealizado: 150, categoria: 'Salários', funcionarioId: 'func1' },
      { id: 'd2', situacao: 'Cancelado', dataPagamento: D, valorRealizado: 777 },
      { id: 'd3', situacao: 'Pendente', dataPagamento: D, valorRealizado: 888 },
    ]),
    docs('prodFab', [
      { id: 'm1', tipo: 'maromba', data: D, situacao: 'Confirmado', grades: 10, porGrade: 500, incompleta: 100, perdas: 50 },
      { id: 'm2', tipo: 'maromba', data: D, situacao: 'Pendente', grades: 99, porGrade: 500 },
      { id: 'fo', tipo: 'fornada', data: D, quantidade: 55000, fornoId: 'f1', numero: 12 },
      { id: 'de', tipo: 'desenforna', data: D, primeira: 40000, segunda: 10000, quebrados: 500, fornoId: 'f1' },
      { id: 'p1', tipo: 'parada', data: D, motivo: 'Almoço' },
      { id: 'p2', tipo: 'parada', data: D, motivo: 'Quebra' },
    ]),
    docs('alm', [
      { id: 'a1', jbt: 'entrada', data: D, total: 120 }, { id: 'a2', jbt: 'entrada', data: D, total: 999, cancelado: true }, { id: 'a3', jbt: 'saida', data: D }, { id: 'a4', jbt: 'item', data: D, total: 5000 },
    ]),
    docs('vales', [{ id: 'va', data: D, valor: 40, funcionarioId: 'func1', tipo: 'Vale' }]),
    docs('diario', [{ id: 'di', data: D, tipo: 'Falta injustificada', funcionarioId: 'func1' }]),
    direto('funcionarios', { id: 'func1', nome: 'Pessoa Teste', admissao: D }),
    direto('locais', { id: 'l1', nome: 'Caçamba', identificacao: 'ABC' }), direto('locais', { id: 'f1', nome: 'Forno 1' }),
    direto('produtos', { id: 'p1', nome: 'S10' }),
    direto('config', { id: 'empresa', empresa: { razao: 'Empresa Exemplo Ltda', cnpj: '11.222.333/0001-81' } }),
  ];
}
const R = () => calcularResumo(organizar(base()), D);
const sec = (r, t) => r.secoes.find((s) => s.titulo === t);

export const TESTES = [];
const t = (nome, fn) => TESTES.push({ nome, fn });

t('dinheiro: entrou conta recebimentos do dia, sem estornados, canceladas e históricos', () => assert.equal(R().totais.entrou, 1100));
t('dinheiro: saiu soma títulos, compras e despesas pagas; só o que é título do Financeiro', () => assert.equal(R().totais.saiu, 200 + 600 + 150));
t('dinheiro: saldo é entrou menos saiu', () => assert.equal(R().totais.saldo, 150));
t('vendas: só as do dia e não canceladas; milheiros só em unidade milheiro; a receber', () => {
  const x = R().totais; assert.equal(x.vendas, 2); assert.equal(x.vendido, 1500); assert.equal(x.milheiros, 3); assert.equal(x.a_receber, 500);
});
t('vendas por pedido: a receber vem dos títulos', () => {
  const b = base(); b[0].dados.items.v1 = { id: 'v1', numero: 1, data: D, total: 1000, fluxo: 'pedido', cliente: { nome: 'A' }, itens: [], pagamentos: [{ valor: 100 }], titulos: [{ id: 'a', n: 1, venc: D, valor: 400 }, { id: 'b', n: 2, venc: D, valor: 600 }] };
  assert.equal(calcularResumo(organizar(b), D).totais.a_receber, 900 + 500);
});
t('produção: só maromba confirmada; líquida = grades x por grade + incompleta - perdas', () => {
  const r = R(); assert.equal(r.totais.maromba, 5050); assert.equal(r.totais.enfornados, 55000); assert.equal(r.totais.desenfornados, 50500);
  assert.match(sec(r, 'Produção').aviso, /1 lançamento/);
  assert.equal(sec(r, 'Produção').linhas.filter((l) => /^Parada/.test(l.t)).length, 1, 'refeição não é parada');
});
t('combustível e lenha do dia', () => {
  const x = R().totais; assert.equal(x.litros, 100); assert.equal(x.custo_combustivel, 750.5); assert.equal(x.lenha_comprada_m3, 60); assert.equal(x.lenha_valor, 600); assert.equal(x.lenha_usada_m3, 54.5);
});
t('almoxarifado ignora cancelado e outros tipos da mesma coleção', () => assert.match(sec(R(), 'Almoxarifado e cozinha').linhas[0].v, /120,00/));
t('setor pessoal: admissão, vale e falta', () => assert.equal(sec(R(), 'Setor Pessoal').linhas.length, 3));
t('modelo: 7 parâmetros, nenhum vazio ou com quebra de linha', () => {
  for (const r of [R(), calcularResumo(organizar([]), D)]) {
    assert.equal(r.parametros.length, 7);
    r.parametros.forEach((p) => { assert.ok(p.length > 0); assert.ok(!/[\n\r\t]| {5,}/.test(p), p); });
  }
});
t('dia sem nada lançado não quebra e diz que não houve lançamento', () => {
  const r = calcularResumo(organizar([]), D);
  assert.equal(r.totais.entrou, 0); assert.match(r.parametros[2], /nenhuma venda/); assert.match(r.parametros[3], /nenhuma produção/);
});
t('parâmetro: limpa quebras e espaços', () => { assert.equal(limparParametro(' a\n\n b    c\t'), 'a b c'); assert.equal(limparParametro(''), '—'); });
t('moeda e dia no formato do programa', () => {
  assert.equal(fMoeda(1234.5), 'R$ 1.234,50'); assert.equal(fMoeda(-10), '-R$ 10,00');
  assert.equal(diaLongo('2026-11-07'), 'Sábado, 07/11/2026');
  assert.equal(diaEmFortaleza(new Date('2026-11-08T02:30:00Z')), '2026-11-07', '23h30 em Fortaleza ainda é o dia anterior');
});
t('telefone: 55 + DDD + número', () => {
  assert.ok(telefoneValido('5586999998888')); assert.ok(telefoneValido('558632221111'));
  assert.ok(!telefoneValido('86999998888')); assert.ok(!telefoneValido('+5586999998888'));
});
t('corpo do envio: modelo, PDF no cabeçalho e parâmetros em ordem', () => {
  const c = corpoModelo({ para: '5586999998888', modelo: 'm', idioma: 'pt_BR', mediaId: '123', arquivo: 'a.pdf', parametros: ['x', 'y'] });
  assert.equal(c.type, 'template'); assert.equal(c.to, '5586999998888');
  assert.deepEqual(c.template.components[0].parameters[0].document, { id: '123', filename: 'a.pdf' });
  assert.deepEqual(c.template.components[1].parameters.map((p) => p.text), ['x', 'y']);
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let ok = 0;
  for (const x of TESTES) {
    try { await x.fn(); ok++; console.log('  ✓', x.nome); } catch (e) { console.log('  ✗', x.nome, '\n   ', e.message); process.exitCode = 1; }
  }
  console.log(`\n${ok} de ${TESTES.length} testes do resumo no WhatsApp passaram.`);
}
