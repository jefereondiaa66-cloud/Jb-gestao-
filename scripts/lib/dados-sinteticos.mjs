// Dados SIMULADOS para medir o desempenho do JB ERP (scripts/medir-desempenho.mjs).
// Nenhum dado real: nomes, documentos e valores são inventados por um gerador com semente fixa
// (a mesma semente gera sempre os mesmos dados, para comparar antes e depois).
// Quantidades na escala 1 = o volume do banco em 22/11/2026 (contado só por coleção, sem ler os dados):
// ~73 funcionários, ~470 compras, ~270 títulos do financeiro, ~240 itens do almoxarifado,
// ~160 lançamentos da produção, ~135 abastecimentos/baixas, ~40 vendas e ~1.250 registros de histórico.
// Escala 5 = mais ou menos um ano e meio de uso (teste de grande volume).
export function gerarDadosSinteticos(escala, semente) {
  escala = escala || 1;
  var s = (semente || 7) >>> 0;
  function rnd() { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function ent(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function um(l) { return l[Math.floor(rnd() * l.length)]; }
  function pesado(l) { var t = 0, i; for (i = 0; i < l.length; i++) t += l[i][1]; var r = rnd() * t; for (i = 0; i < l.length; i++) { r -= l[i][1]; if (r <= 0) return l[i][0]; } return l[0][0]; }
  function pad(n, k) { n = String(n); while (n.length < (k || 2)) n = '0' + n; return n; }
  function dia(ini, fim) { var a = Date.UTC(ini[0], ini[1] - 1, ini[2]), b = Date.UTC(fim[0], fim[1] - 1, fim[2]); return new Date(a + rnd() * (b - a)).toISOString().slice(0, 10); }
  function hora() { return pad(ent(6, 18)) + ':' + pad(ent(0, 59)); }
  function ts(d) { return d + 'T' + hora() + ':00.000Z'; }
  function dinheiro(a, b) { return Math.round((a + rnd() * (b - a)) * 100) / 100; }
  var n = function (q) { return Math.max(1, Math.round(q * escala)); };
  var hashTxt = function (t) { var h = 0; for (var c of String(t)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };
  var PARTES = { vendas: 12, compras: 6, consumos: 8, prodFab: 6, fin: 8, alm: 6, log: 16, despesas: 4 };
  var docs = [], baldes = {};
  function doc(c, id, d) { docs.push([c, id, d]); }
  function noBalde(c, item, campo) {
    var d = String(item[campo || 'data'] || '2026-11-01').slice(0, 7), k = d + '-s' + (hashTxt(item.id) % PARTES[c]);
    var b = baldes[c + '/' + k]; if (!b) { b = baldes[c + '/' + k] = { c: c, k: k, items: {} }; }
    b.items[item.id] = item;
  }
  var ATE = [2026, 11, 21], INI = [2026, 1, 2];
  var REG = function (d) { return { criadoEm: ts(d), criadoPor: 'u_DONO', alteradoEm: ts(d), alteradoPor: 'u_DONO' }; };

  doc('acesso', 'u_DONO', { id: 'u_DONO', nome: 'Dono', papel: 'admin', ativo: true });

  /* ---------- pessoal ---------- */
  var SETORES = [['Produção', 34], ['Pátio e expedição', 15], ['Queima', 7], ['Manutenção', 6], ['Administrativo', 6], ['Portaria', 3], ['Cozinha', 1]];
  var CARGOS = { 'Produção': ['Auxiliar de produção', 'Operador de maromba', 'Cortador'], 'Pátio e expedição': ['Carregador', 'Motorista', 'Operador de empilhadeira'], 'Queima': ['Forneiro', 'Auxiliar de forno'], 'Manutenção': ['Mecânico', 'Eletricista'], 'Administrativo': ['Auxiliar administrativo', 'Encarregado'], 'Portaria': ['Porteiro'], 'Cozinha': ['Cozinheira'] };
  var funcs = [];
  for (var i = 1; i <= n(73); i++) {
    var id = 'f' + pad(i, 4), setor = pesado(SETORES), adm = dia([2019, 1, 1], [2026, 10, 30]);
    var f = Object.assign({ id: id, nome: 'Funcionário Simulado ' + pad(i, 3), matricula: pad(i, 4), situacao: pesado([['Ativo', 64], ['Desligado', 5], ['Afastado', 4]]),
      departamento: setor === 'Administrativo' ? 'Administrativo' : setor === 'Portaria' ? 'Portaria' : setor === 'Cozinha' ? 'Cozinha' : 'Produção', setor: setor, cargo: um(CARGOS[setor]),
      tipoContratacao: pesado([['Empregado CLT', 42], ['Contrato por prazo determinado', 5]]), periodicidade: pesado([['Mensal', 66], ['Quinzenal', 4], ['Semanal', 2]]),
      formaRemuneracao: pesado([['Mensal fixo', 60], ['Por produção', 9], ['Diária', 3]]), formaPagamento: pesado([['PIX', 57], ['Dinheiro', 11], ['Folha de pagamento', 2]]),
      admissao: adm, entrada: '07:00', saida: '17:00', intervalo: 60, cargaSemanal: 44, responsavel: 'Encarregado' }, REG(adm));
    funcs.push(f); doc('funcionarios', id, f);
    doc('sensivel', id, { id: id, cpf: '000.000.' + pad(i, 3) + '-00', nascimento: dia([1965, 1, 1], [2005, 12, 31]), cidade: 'Cidade Simulada', uf: 'MA', rg: '00' + pad(i, 5), banco: 'Banco Simulado', salario: dinheiro(1518, 3800) });
  }
  /* ---------- cadastros ---------- */
  var fornL = [], fornC = [], clientes = [], fornos = [], veiculos = [];
  for (i = 1; i <= n(32); i++) {
    var lenha = i <= Math.round(n(32) * 0.62), fid = 'forn' + pad(i, 3), d0 = dia(INI, [2026, 6, 1]);
    var fo = Object.assign({ id: fid, nome: (lenha ? 'Fornecedor de Lenha ' : 'Posto Simulado ') + pad(i, 2), setor: lenha ? 'lenha' : 'combustivel', situacao: 'Ativo', tipoPessoa: lenha ? 'Física' : 'Jurídica', cidade: 'Cidade Simulada', uf: 'MA' }, REG(d0));
    (lenha ? fornL : fornC).push(fo); doc('fornecedores', fid, fo);
  }
  for (i = 1; i <= n(31); i++) { var cid = 'cli' + pad(i, 3), d1 = dia(INI, ATE); var cl = Object.assign({ id: cid, codigo: pad(i, 4), razao: 'Cliente Simulado ' + pad(i, 3), situacao: 'Ativo', tipoPessoa: i % 7 ? 'Física' : 'Jurídica', classificacao: 'Novo cliente', cidade: 'Cidade Simulada', uf: 'MA' }, REG(d1)); clientes.push(cl); doc('clientes', cid, cl); }
  for (i = 1; i <= 11; i++) { var lf = Object.assign({ id: 'forno' + pad(i, 2), nome: 'Forno ' + pad(i, 2), setor: 'lenha', situacao: 'Ativo', tipo: 'Forno', capacidade: 54, continuo: i === 11 }, REG('2026-01-02')); fornos.push(lf); doc('locais', lf.id, lf); }
  var TV = ['Empilhadeira', 'Empilhadeira', 'Empilhadeira', 'Empilhadeira', 'Caminhão', 'Caminhão', 'Caminhão', 'Caminhão', 'Pá carregadeira', 'Pá carregadeira', 'Carro', 'Caminhonete', 'Cavalo mecânico', 'Outro'];
  TV.forEach(function (t, k) { var lv = Object.assign({ id: 'veic' + pad(k + 1, 2), nome: t + ' ' + pad(k + 1, 2), setor: 'combustivel', situacao: 'Ativo', tipo: t, controleUso: /Empilh|Pá/.test(t) ? 'Horímetro (horas)' : 'Hodômetro (km)', propriedade: 'Própria', setorTrabalho: /Caminh|Cavalo/.test(t) ? 'Entrega' : 'Carregamento', combPadraoId: 'prodS10' }, REG('2026-01-02')); veiculos.push(lv); doc('locais', lv.id, lv); });
  var PRODS = [['prodS10', 'Diesel S10', 'combustivel', 'L', 'Combustível', 'Diesel'], ['prodS500', 'Diesel S500', 'combustivel', 'L', 'Combustível', 'Diesel'], ['prodGas', 'Gasolina', 'combustivel', 'L', 'Combustível', 'Gasolina'], ['prodOl1', 'Óleo 15W40', 'combustivel', 'L', 'Óleo lubrificante', ''], ['prodOl2', 'Óleo hidráulico', 'combustivel', 'L', 'Óleo lubrificante', ''], ['prodOl3', 'Óleo de transmissão', 'combustivel', 'L', 'Óleo lubrificante', ''], ['prodAdt', 'Aditivo de radiador', 'combustivel', 'L', 'Aditivo', ''], ['prodGrx', 'Graxa', 'combustivel', 'kg', 'Graxa', ''], ['prodLenha', 'Lenha', 'lenha', 'm³', '', ''], ['prodLenhaSt', 'Lenha (estéreo)', 'lenha', 'st (estéreo)', '', ''], ['prodT8', 'Tijolo 8 furos', 'vendas', 'milheiro', '', ''], ['prodT6', 'Tijolo 6 furos', 'vendas', 'milheiro', '', '']];
  PRODS.forEach(function (p) { doc('produtos', p[0], Object.assign({ id: p[0], nome: p[1], setor: p[2], unidade: p[3], situacao: 'Ativo', controlaEstoque: 'Sim', tipoItem: p[4] || undefined, tipoComb: p[5], precoCompra: p[2] === 'combustivel' ? 6.1 : undefined, precoVenda: p[2] === 'vendas' ? 750 : undefined }, REG('2026-01-02'))); });

  /* ---------- compras (lenha e combustível) ---------- */
  for (i = 1; i <= n(472); i++) {
    var lenhaC = rnd() < 0.94, dC = dia(INI, ATE), fC = lenhaC ? um(fornL) : um(fornC), pr = lenhaC ? 'prodLenha' : um(['prodS10', 'prodS500']);
    var q = lenhaC ? ent(8, 60) : ent(300, 3000), pu = lenhaC ? dinheiro(38, 55) : dinheiro(5.6, 6.4), tot = Math.round(q * pu * 100) / 100;
    var compra = Object.assign({ id: 'cmp' + pad(i, 5), data: dC, hora: hora(), numero: i, tipoOp: 'compra', status: rnd() < 0.998 ? 'Concluída' : 'Cancelada', setor: lenhaC ? 'lenha' : 'combustivel', fornecedorId: fC.id,
      fornecedor: { nome: fC.nome, doc: '', fantasia: '', ie: '', endereco: '', cidade: fC.cidade, telefone: '', whatsapp: '', email: '' },
      itens: [{ produtoId: pr, codigo: '', nome: lenhaC ? 'Lenha' : 'Diesel', tipo: 'produto', unidade: lenhaC ? 'm³' : 'L', qtd: q, preco: pu, total: tot, anterior: 0, atual: q, baixaEstoque: false }],
      subtotal: tot, desconto: 0, descTipo: 'valor', descValor: 0, frete: 0, outros: 0, total: tot, condicao: rnd() < 0.92 ? 'À vista' : 'A prazo', forma: '', vencimento: dC,
      pagamentos: rnd() < 0.1 ? [{ id: 'pg' + i, data: dC, valor: tot, forma: 'PIX', obs: '', por: 'u_DONO', em: ts(dC), contaId: 'conta1' }] : [],
      responsavel: 'u_DONO', responsavelNome: 'Dono', obs: '', fiscal: { status: 'sem nota' }, historico: true, lenhaClasse: lenhaC ? um(['MISTURADA', 'Fina', 'Grossa']) : undefined }, REG(dC));
    noBalde('compras', compra);
  }
  /* ---------- financeiro ---------- */
  var CATS = [['Mão de obra da produção', 71], ['Peças e materiais', 49], ['Alimentação dos funcionários', 31], ['Fornecedores', 22], ['Funcionários', 22], ['Combustível para entrega', 14], ['Manutenção de máquinas', 13], ['Outras despesas administrativas', 10], ['Material de escritório', 3]];
  noBalde('fin', Object.assign({ id: 'conta1', tipo: 'conta', data: '2026-01-02', nome: 'Caixa da fábrica', situacao: 'Ativo' }, REG('2026-01-02')));
  for (i = 1; i <= n(268); i++) {
    var dF = dia([2026, 9, 1], ATE), vF = dinheiro(30, 4500), pago = rnd() < 0.85;
    noBalde('fin', Object.assign({ id: 'tit' + pad(i, 5), tipo: 'titulo', data: dF, descricao: 'Despesa simulada ' + i, valor: vF, categoria: pesado(CATS), beneficiarioTipo: 'Outro', beneficiarioNome: 'Beneficiário Simulado ' + ent(1, 40), beneficiario: '',
      numero: i, vencimento: dF, dataPrevista: dF, formaPrevista: pesado([['Dinheiro', 161], ['PIX', 39], ['Boleto', 37]]), condicao: rnd() < 0.93 ? 'À vista' : 'A prazo', docOrigemTipo: pesado([['Registro de caixa', 174], ['Nota fiscal', 60]]), docOrigemNum: String(ent(100, 9999)),
      contaId: 'conta1', setorOrigem: rnd() < 0.75 ? 'Geral (Financeiro)' : 'Almoxarifado / Cozinha', repetir: 'Não repete', responsavelNome: 'Dono', obs: '',
      pagamentos: pago ? [{ id: 'pf' + i, data: dF, valor: vF, forma: 'Dinheiro', contaId: 'conta1', obs: '', obsDif: '', motivoDif: '', quitacao: true, por: 'u_DONO', em: ts(dF) }] : [] }, REG(dF)));
  }
  /* ---------- almoxarifado ---------- */
  var ALMC = [['Peças e manutenção', 69], ['Cozinha', 29], ['Ferramentas', 18], ['EPI', 14], ['Produtos em geral', 11], ['Limpeza', 9], ['Elétrico', 8], ['Escritório', 5]], almItens = [];
  for (i = 1; i <= n(162); i++) { var cat = pesado(ALMC), dA = dia([2026, 10, 1], ATE); var it = Object.assign({ id: 'ai' + pad(i, 4), jbt: 'item', data: dA, nome: 'Material simulado ' + pad(i, 3), categoria: cat, unidade: pesado([['unidade', 117], ['kg', 16], ['par', 9], ['pacote', 8], ['rolo', 6]]), minimo: ent(0, 10), codigo: 'M' + pad(i, 4), ca: cat === 'EPI' ? String(ent(10000, 99999)) : '', caValidade: '', local: 'Almoxarifado', ativo: true, tipoCoz: cat === 'Cozinha' ? 'Mercearia' : '', obs: '' }, REG(dA)); almItens.push(it); noBalde('alm', it); }
  for (i = 1; i <= n(50); i++) { var dE = dia([2026, 10, 1], ATE), its = []; for (var j = 0; j < ent(1, 5); j++) its.push({ itemId: um(almItens).id, qtd: ent(1, 20), preco: dinheiro(3, 180) }); var te = its.reduce(function (a, x) { return a + x.qtd * x.preco; }, 0);
    noBalde('alm', Object.assign({ id: 'ae' + pad(i, 4), jbt: 'entrada', data: dE, fornecedorId: 'forn' + pad(ent(1, 32), 3), itens: its, total: Math.round(te * 100) / 100, totalNota: Math.round(te * 100) / 100, nota: String(ent(1000, 99999)), forma: pesado([['prazo', 30], ['vista', 20]]), parcelas: [{ n: 1, venc: dE, valor: Math.round(te * 100) / 100 }], frete: 0, pagoVia: 'PIX', recebedor: 'Encarregado', finTitulos: [], obs: '' }, REG(dE))); }
  for (i = 1; i <= n(3); i++) noBalde('alm', Object.assign({ id: 'as' + pad(i, 4), jbt: 'saida', data: dia([2026, 11, 1], ATE), itens: [{ itemId: um(almItens).id, qtd: 1 }], obs: '' }, REG('2026-11-02')));
  /* ---------- produção (maromba, fornadas, desenforna, secagem, paradas) ---------- */
  var fornadas = [];
  for (i = 1; i <= n(37); i++) { var dM = dia(INI, ATE); noBalde('prodFab', Object.assign({ id: 'pm' + pad(i, 4), tipo: 'maromba', data: dM, hora: hora(), turno: '1º turno', grades: ent(80, 140), porGrade: 300, incompleta: 0, bruta: 0, liquida: 0, perdas: ent(0, 400), situacao: 'Confirmado', confirmacao: 'Confirmada', confirmadaEm: ts(dM), confirmadaPor: 'u_DONO', obs: '' }, REG(dM))); }
  for (i = 1; i <= n(31); i++) { var dFo = dia(INI, ATE), fo2 = um(fornos); var fd = Object.assign({ id: 'pf' + pad(i, 4), tipo: 'fornada', data: dFo, hora: hora(), fornoId: fo2.id, numero: i, quantidade: ent(40, 58), situacao: pesado([['Confirmado', 3], ['Em queima', 1]]), inicio: dFo, obs: '' }, REG(dFo)); fornadas.push(fd); noBalde('prodFab', fd); }
  for (i = 1; i <= n(38); i++) { var fz = um(fornadas), dD = fz.data; noBalde('prodFab', Object.assign({ id: 'pd' + pad(i, 4), tipo: 'desenforna', data: dD, hora: hora(), fornoId: fz.fornoId, fornadaId: fz.id, primeira: ent(30, 48), segunda: ent(1, 5), quebrados: ent(0, 2), trincados: ent(0, 2), outras: 0, total: 50, aprovado: 48, situacao: 'Confirmado', obs: '' }, REG(dD))); }
  for (i = 1; i <= n(20); i++) { var dS = dia(INI, ATE); noBalde('prodFab', Object.assign({ id: 'ps' + pad(i, 4), tipo: 'secagem', data: dS, hora: hora(), mov: pesado([['Saída do secador', 17], ['Saída', 9], ['Entrada no secador', 1]]), delta: ent(5, 40), obs: '' }, REG(dS))); }
  for (i = 1; i <= n(20); i++) { var dP = dia(INI, ATE); noBalde('prodFab', Object.assign({ id: 'pp' + pad(i, 4), tipo: 'parada', data: dP, hora: hora(), horaInicio: '09:00', horaFim: '09:40', duracao: 40, motivo: 'Parada simulada', refeicao: false, colecaoOrigem: 'paradasMaromba', obs: '' }, REG(dP))); }
  /* ---------- abastecimentos e baixas de lenha ---------- */
  for (i = 1; i <= n(89); i++) { var dAb = dia(INI, ATE), qa = ent(20, 250), cu = dinheiro(5.8, 6.3), ve = um(veiculos); noBalde('consumos', Object.assign({ id: 'ab' + pad(i, 5), data: dAb, hora: hora(), setor: 'combustivel', produtoId: um(['prodS10', 'prodS500']), quantidade: qa, unidade: 'L', custoUnit: cu, custoTotal: Math.round(qa * cu * 100) / 100, localId: ve.id, anterior: ent(1000, 9000), atual: ent(9001, 9999), origem: 'Estoque da fábrica', abastecidoEm: ts(dAb), responsavelNome: 'Dono', obs: '' }, REG(dAb))); }
  for (i = 1; i <= n(41); i++) { var fz2 = um(fornadas), ml = fz2.quantidade; noBalde('consumos', Object.assign({ id: 'bl' + pad(i, 5), data: fz2.data, hora: hora(), setor: 'lenha', produtoId: 'prodLenha', quantidade: Math.round(ml * 1.03 * 100) / 100, unidade: 'm³', custoUnit: 46, custoTotal: Math.round(ml * 1.03 * 46 * 100) / 100, milheiros: ml, milheirosEnfornados: ml, fornada: fz2.id, enfornaId: fz2.id, custoMetodo: 'custo médio das compras', auto: true, origem: 'Estoque da fábrica', obs: '' }, REG(fz2.data))); }
  /* ---------- vendas ---------- */
  for (i = 1; i <= n(37); i++) { var dV = dia([2026, 10, 15], ATE), cv = um(clientes), mi = ent(1, 12), pv = dinheiro(700, 850), tv = Math.round(mi * pv * 100) / 100;
    noBalde('vendas', Object.assign({ id: 'vd' + pad(i, 5), numero: i, data: dV, hora: hora(), clienteId: cv.id, cliente: { nome: cv.razao, doc: '', fantasia: '', ie: '', endereco: '', cidade: cv.cidade, telefone: '', whatsapp: '', email: '' },
      itens: [{ produtoId: 'prodT8', codigo: 'T8', nome: 'Tijolo 8 furos', tipo: 'produto', unidade: 'milheiro', qtd: mi, preco: pv, precoTabela: 800, precoMinimo: 700, origemPreco: 'tabela', total: tv, anterior: 0, atual: 0, baixaEstoque: false }],
      subtotal: tv, desconto: 0, descTipo: 'valor', descValor: 0, frete: 0, outros: 0, total: tv, forma: pesado([['PIX', 28], ['Dinheiro', 8]]), condicao: 'À vista', vencimento: dV, status: 'Concluída', setor: 'vendas', vendedor: 'u_DONO', vendedorNome: 'Vendedor Simulado ' + ent(1, 3),
      pagamentos: [{ id: 'pv' + i, data: dV, valor: tv, forma: 'PIX', obs: '', por: 'u_DONO', em: ts(dV) }], responsavel: 'u_DONO', responsavelNome: 'Dono', obs: '', obsInterna: '', fiscal: { status: 'sem nota' } }, REG(dV))); }
  /* ---------- histórico (auditoria) ---------- */
  var MODS = [['compras', 473], ['funcionarios', 138], ['consumos', 98], ['fTitulos', 89], ['almItens', 81], ['almEntradas', 41], ['vendas', 34], ['pmaromba', 28], ['locais', 25]];
  for (i = 1; i <= n(1251); i++) { var dL = dia([2026, 9, 20], ATE); noBalde('log', { id: 'lg' + pad(i, 6), uid: 'u_DONO', ts: ts(dL), acao: pesado([['criou', 419], ['alterou', 118], ['registrou pagamento', 51], ['excluiu', 7]]), modulo: pesado(MODS), recId: 'rec' + ent(1, 900), campos: ['valor', 'obs'] }, 'ts'); }

  Object.keys(baldes).forEach(function (k) { var b = baldes[k]; doc(b.c, b.k, { chave: b.k, items: b.items }); });
  return docs;
}
