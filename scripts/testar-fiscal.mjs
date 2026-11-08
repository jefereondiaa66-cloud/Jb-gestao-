#!/usr/bin/env node
// Testes do JB Fiscal (supabase/functions/jb-fiscal/nucleo.js) sem rede:
// uma Focus NFe falsa (fetch falso) e um banco falso (reservas e auditoria).
// Confere a tradução infNFe → JSON da Focus, a idempotência da emissão
// (mesma referência nunca é enviada duas vezes), consulta, cancelamento,
// inutilização, rejeição, erros e o bloqueio da produção.
//
//   node scripts/testar-fiscal.mjs        (também roda dentro de scripts/verificar.mjs)
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { criarServico, traduzirInfNFe, lerProtocoloXml, documentoDaFocus, BASES, ACOES } from '../supabase/functions/jb-fiscal/nucleo.js';

/* ---------------- dados de exemplo (fictícios) ---------------- */
const CNPJ = '11222333000181';          // CNPJ de exemplo (dígitos válidos), não é de ninguém do sistema
const CNPJ_DEST = '11444777000161';
const CHAVE = '21' + '2611' + CNPJ + '55' + '001' + '000000012' + '1' + '00000012' + '3';
const PROT = '121260000012345';
const TOKENS = { homologacao: 'tok-homolog-123', producao: 'tok-prod-456' };
const ENV = { FOCUSNFE_TOKEN_HOMOLOGACAO: TOKENS.homologacao, FOCUSNFE_TOKEN_PRODUCAO: TOKENS.producao, PRODUCAO_LIBERADA: '', CNPJ_EMITENTE: CNPJ };
const ADMIN = { origem: 'nuvem', uid: 'u_ADM', nome: 'Administrador', papel: 'admin', autorizados: [] };
const clone = (v) => JSON.parse(JSON.stringify(v));

/** o mesmo formato que montarInfNFe (app/jb-gestao.html) produz: Simples Nacional, CSOSN 102, PIX à vista */
function infSimples() {
  return {
    versao: '4.00',
    ide: { cUF: 21, natOp: 'VENDA DE PRODUCAO DO ESTABELECIMENTO', serie: 1, nNF: 12, dhEmi: '2026-11-08T10:00:00-03:00', tpNF: 1, idDest: 1, cMunFG: '2107902',
      tpImp: 1, tpEmis: 1, finNFe: 1, indFinal: 1, indPres: 1, procEmi: 0, verProc: 'JB Gestao 1.0' },
    emit: { CNPJ, CRT: 1 },
    dest: { CNPJ: CNPJ_DEST, xNome: 'CONSTRUTORA EXEMPLO LTDA',
      enderDest: { xLgr: 'RUA DAS FLORES', nro: '100', xBairro: 'CENTRO', cMun: '2107902', xMun: 'Passagem Franca', UF: 'MA', CEP: '65680000', cPais: '1058', xPais: 'BRASIL', fone: '99999990000' },
      indIEDest: 9, email: 'compras@exemplo.com.br' },
    det: [
      { nItem: 1, prod: { cProd: 'TIJ8', cEAN: 'SEM GTIN', xProd: 'TIJOLO 8 FUROS', NCM: '69041000', CFOP: '5101', uCom: 'MIL', qCom: 2, vUnCom: 650, vProd: 1300,
        cEANTrib: 'SEM GTIN', uTrib: 'MIL', qTrib: 2, vUnTrib: 650, vFrete: 100, indTot: 1 },
        imposto: { ICMS: { ICMSSN102: { orig: 0, CSOSN: '102' } }, PIS: { PISOutr: { CST: '49', vBC: 0, pPIS: 0, vPIS: 0 } }, COFINS: { COFINSOutr: { CST: '49', vBC: 0, pCOFINS: 0, vCOFINS: 0 } } },
        infAdProd: 'Tijolo cerâmico' },
    ],
    total: { ICMSTot: { vBC: 0, vICMS: 0, vICMSDeson: 0, vFCP: 0, vBCST: 0, vST: 0, vFCPST: 0, vFCPSTRet: 0, vProd: 1300, vFrete: 100, vSeg: 0, vDesc: 0, vII: 0,
      vIPI: 0, vIPIDevol: 0, vPIS: 0, vCOFINS: 0, vOutro: 0, vNF: 1400 } },
    transp: { modFrete: 0 },
    pag: { detPag: [{ indPag: 0, tPag: '17', vPag: 1400, card: { tpIntegra: 2 } }] },
    infAdic: { infCpl: 'Pedido JB nº 123.' },
  };
}
/** regime normal: ICMS 00, IPI tributado, PIS/COFINS por alíquota, dinheiro */
function infNormal() {
  const n = infSimples();
  n.emit.CRT = 3;
  n.det[0].imposto = {
    ICMS: { ICMS00: { orig: 0, CST: '00', modBC: 3, vBC: 1400, pICMS: 20, vICMS: 280 } },
    IPI: { cEnq: '999', IPITrib: { CST: '50', vBC: 1400, pIPI: 5, vIPI: 70 } },
    PIS: { PISAliq: { CST: '01', vBC: 1400, pPIS: 1.65, vPIS: 23.1 } },
    COFINS: { COFINSAliq: { CST: '01', vBC: 1400, pCOFINS: 7.6, vCOFINS: 106.4 } },
  };
  Object.assign(n.total.ICMSTot, { vBC: 1400, vICMS: 280, vIPI: 70, vPIS: 23.1, vCOFINS: 106.4, vNF: 1470 });
  n.pag.detPag = [{ indPag: 0, tPag: '01', vPag: 1470 }];
  return n;
}

const xmlAutorizado = (o = {}) => `${o.bom ? '﻿' : ''}<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${CHAVE}" versao="4.00">` +
  `<ide><nNF>12</nNF><dhEmi>2026-11-08T10:00:00-03:00</dhEmi></ide><emit><xNome>CERAMICA EXEMPLO &amp; CIA</xNome></emit><total><ICMSTot><vProd>1300.00</vProd><vNF>1400.00</vNF></ICMSTot></total></infNFe></NFe>` +
  (o.semProt ? '' : `<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${CHAVE}</chNFe><dhRecbto>2026-11-08T10:00:05-03:00</dhRecbto><nProt>${o.nProt || PROT}</nProt><digVal>abc123=</digVal><cStat>${o.cStat || 100}</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`) +
  '</nfeProc>';
const xmlCancelamento = () => `<?xml version="1.0" encoding="UTF-8"?><procEventoNFe versao="1.00"><evento><infEvento><tpEvento>110111</tpEvento></infEvento></evento><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><cStat>135</cStat><xMotivo>Evento registrado e vinculado a NF-e</xMotivo><chNFe>${CHAVE}</chNFe><tpEvento>110111</tpEvento><dhRegEvento>2026-11-08T11:00:00-03:00</dhRegEvento><nProt>121260000099999</nProt></infEvento></retEvento></procEventoNFe>`;

/* ---------------- Focus NFe falsa ---------------- */
function focusFalsa(o = {}) {
  const notas = new Map();     // "base|ref" -> nota
  const inut = [];
  const chamadas = [];
  const json = (status, corpo) => new Response(corpo === undefined ? '' : JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
  const arquivos = new Map();  // url completa -> {tipo, corpo}
  function base(url) { return Object.entries(BASES).find(([, b]) => url.startsWith(b)) || [null, null]; }
  function consultaDe(n) {
    const c = { cnpj_emitente: CNPJ, ref: n.ref, status: n.status };
    if (n.status_sefaz) Object.assign(c, { status_sefaz: n.status_sefaz, mensagem_sefaz: n.mensagem_sefaz });
    if (['autorizado', 'cancelado', 'denegado'].includes(n.status)) {
      Object.assign(c, { chave_nfe: 'NFe' + CHAVE, numero: String(n.corpo.numero), serie: String(n.corpo.serie) });
      if (n.status !== 'denegado') { c.caminho_xml_nota_fiscal = n.caminhoXml; c.caminho_danfe = n.caminhoDanfe; }
    }
    if (n.status === 'cancelado') c.caminho_xml_cancelamento = n.caminhoCanc;
    return c;
  }
  async function fetchFalso(url, init = {}) {
    const metodo = init.method || 'GET';
    chamadas.push({ url, metodo, headers: { ...(init.headers || {}) }, corpo: init.body ? JSON.parse(init.body) : undefined });
    if (o.redeFora) throw new TypeError('fetch failed');
    if (arquivos.has(url)) {
      const a = arquivos.get(url);
      if (!a.publico && init.headers?.Authorization !== 'Basic ' + btoa(a.token + ':')) return json(401, { codigo: 'nao_autorizado' });
      return new Response(a.corpo, { status: 200, headers: { 'content-type': a.tipo } });
    }
    const [amb, b] = base(url);
    if (!amb) return json(404, {});
    if (init.headers?.Authorization !== 'Basic ' + btoa(TOKENS[amb] + ':')) return json(401, { codigo: 'permissao_negada', mensagem: 'Token inválido' });
    const u = new URL(url), p = u.pathname;
    let m;
    if (metodo === 'POST' && p === '/v2/nfe') {
      const ref = u.searchParams.get('ref');
      if (o.postFalha === 'antes') throw new TypeError('fetch failed');
      if (o.post422) return json(422, { codigo: 'requisicao_invalida', mensagem: 'Erro de validação', erros: [{ campo: 'items[0].codigo_ncm', mensagem: 'NCM inválido' }] });
      if (o.post500) return json(500, { mensagem: 'erro interno' });
      const k = amb + '|' + ref;
      if (notas.has(k)) return json(422, { codigo: 'already_processed', mensagem: 'Referência já usada' });
      const n = { ref, corpo: JSON.parse(init.body), status: 'processando_autorizacao', consultas: 0,
        caminhoXml: `/arquivos_development/${CNPJ}/202611/XMLs/${CHAVE}-nfe.xml`, caminhoDanfe: `/arquivos_development/${CNPJ}/202611/DANFEs/${CHAVE}.pdf`,
        caminhoCanc: `/arquivos_development/${CNPJ}/202611/XMLs/${CHAVE}-can.xml` };
      notas.set(k, n);
      arquivos.set(b + n.caminhoXml, { tipo: 'application/xml', corpo: xmlAutorizado(o.xml || {}), token: TOKENS[amb] });
      arquivos.set(b + n.caminhoDanfe, { tipo: 'application/pdf', corpo: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]), token: TOKENS[amb] });
      arquivos.set(b + n.caminhoCanc, { tipo: 'application/xml', corpo: xmlCancelamento(), token: TOKENS[amb] });
      if (o.postFalha === 'depois') throw new TypeError('fetch failed');   // a Focus recebeu, a resposta se perdeu
      return json(202, { cnpj_emitente: CNPJ, ref, status: 'processando_autorizacao' });
    }
    if (metodo === 'GET' && p === '/v2/nfe/inutilizacoes') return json(200, inut.filter((x) => x.amb === amb && x.cnpj === u.searchParams.get('cnpj')));
    if ((m = /^\/v2\/nfe\/([^/]+)$/.exec(p))) {
      const ref = decodeURIComponent(m[1]), k = amb + '|' + ref, n = notas.get(k);
      if (metodo === 'GET') {
        if (!n) return json(404, { codigo: 'nao_encontrado', mensagem: 'Nota fiscal não encontrada' });
        if (n.status === 'processando_autorizacao' && ++n.consultas >= (o.consultasAteFinal ?? 1)) {
          const fim = o.final || { status: 'autorizado', status_sefaz: '100', mensagem_sefaz: 'Autorizado o uso da NF-e' };
          Object.assign(n, fim);
        }
        return json(200, consultaDe(n));
      }
      if (metodo === 'DELETE') {
        if (!n) return json(404, { codigo: 'nao_encontrado', mensagem: 'Nota fiscal não encontrada' });
        if (o.cancelamentoRejeitado) return json(200, { status: 'erro_cancelamento', status_sefaz: '501', mensagem_sefaz: 'Rejeição: prazo de cancelamento superior ao previsto' });
        n.status = 'cancelado'; n.justificativa = JSON.parse(init.body).justificativa;
        return json(200, { status: 'cancelado', status_sefaz: '135', mensagem_sefaz: 'Evento registrado e vinculado a NF-e', caminho_xml_cancelamento: n.caminhoCanc });
      }
    }
    if (metodo === 'POST' && p === '/v2/nfe/inutilizacao') {
      const c = JSON.parse(init.body);
      const r = { status: 'autorizado', status_sefaz: '102', mensagem_sefaz: 'Inutilização de número homologado', serie: String(c.serie), numero_inicial: String(c.numero_inicial),
        numero_final: String(c.numero_final), modelo: '55', cnpj: c.cnpj, protocolo_sefaz: '121260000055555', justificativa: c.justificativa };
      inut.push({ amb, ...r });
      return json(200, r);
    }
    if (metodo === 'GET' && (m = /^\/v2\/ceps\/(\d{8})$/.exec(p))) {
      if (m[1] === '00000000') return json(404, { codigo: 'nao_encontrado' });
      return json(200, { cep: m[1], tipo: 'logradouro', uf: 'MA', nome_localidade: 'Passagem Franca', codigo_ibge: '2107902', tipo_logradouro: 'Rua', nome_logradouro: 'das Flores', nome_bairro_inicial: 'Centro' });
    }
    if (metodo === 'GET' && (m = /^\/v2\/cnpjs\/(\d{14})$/.exec(p))) {
      return json(200, { razao_social: 'CONSTRUTORA EXEMPLO LTDA', cnpj: m[1], situacao_cadastral: 'ativa', cnae_principal: '4120400', optante_simples_nacional: false, optante_mei: false,
        endereco: { codigo_municipio: '0921', codigo_siafi: '0921', codigo_ibge: '2107902', nome_municipio: 'Passagem Franca', logradouro: 'RUA DAS FLORES', complemento: null, numero: '100', bairro: 'CENTRO', cep: '65680000', uf: 'MA' } });
    }
    if (metodo === 'GET' && p === '/v2/empresas') {
      if (o.empresas403) return json(403, { codigo: 'permissao_negada', mensagem: 'Acesso negado' });
      return json(200, [{ id: 1, nome: 'CERAMICA EXEMPLO LTDA', nome_fantasia: 'Cerâmica', cnpj: CNPJ, inscricao_estadual: '123456789', regime_tributario: '1', habilita_nfe: true,
        certificado_valido_ate: '2027-05-10T23:59:59-03:00', certificado_valido_de: '2026-05-10T00:00:00-03:00', certificado_cnpj: CNPJ }]);
    }
    return json(404, { codigo: 'nao_encontrado' });
  }
  const posts = () => chamadas.filter((c) => c.metodo === 'POST' && /\/v2\/nfe\?/.test(c.url));
  return { fetch: fetchFalso, chamadas, notas, inut, arquivos, posts };
}

/* ---------------- banco falso (como as funções public.jb_fiscal_*) ---------------- */
function bancoFalso(o = {}) {
  const envios = new Map(), registros = [];
  let relogio = 0;
  return {
    envios, registros, avancar: (s) => { relogio += s; },
    async reservar(amb, ref, sha, uid) {
      if (o.fora) throw new Error('banco fora');
      const k = amb + '|' + ref;
      if (!envios.has(k)) { envios.set(k, { situacao: 'reservada', sha256: sha, uid, em: relogio }); return { nova: true, situacao: 'reservada', idade_s: 0 }; }
      const e = envios.get(k); return { nova: false, situacao: e.situacao, sha256: e.sha256, idade_s: relogio - e.em };
    },
    async marcar(amb, ref, situacao, detalhe) { const e = envios.get(amb + '|' + ref); if (e) Object.assign(e, { situacao, detalhe, em: relogio }); },
    async envio(amb, ref) { const e = envios.get(amb + '|' + ref); return e ? { situacao: e.situacao, idade_s: relogio - e.em } : null; },
    async registrar(r) { registros.push(clone(r)); return registros.length; },
    async auditoria(limite) { return registros.slice(-limite).reverse().map((a) => ({ em: '2026-11-08T10:00:00-03:00', quem: a.nome || a.uid_app, operacao: a.acao, ...a })); },
  };
}
function servico(o = {}) {
  const f = o.focus || focusFalsa(o.focusOpc);
  const b = o.banco || bancoFalso(o.bancoOpc);
  const s = criarServico({ fetch: f.fetch, env: { ...ENV, ...(o.env || {}) }, banco: b, dormir: async () => {}, esperas: o.esperas || [0, 0, 0], agora: () => 1000 });
  return { s, f, b, run: (acao, args, quem = ADMIN) => s.executar(acao, args, quem) };
}

/* ---------------- testes ---------------- */
export const TESTES = [];
const t = (nome, fn) => TESTES.push({ nome, fn });

t('tradução: nota do Simples (CSOSN 102, PIX) vira o JSON da Focus campo a campo', () => {
  const { focus: f, problemas } = traduzirInfNFe(infSimples());
  assert.deepEqual(problemas, []);
  assert.equal(f.natureza_operacao, 'VENDA DE PRODUCAO DO ESTABELECIMENTO');
  assert.equal(f.data_emissao, '2026-11-08T10:00:00-03:00');
  assert.equal(f.tipo_documento, 1); assert.equal(f.local_destino, 1); assert.equal(f.finalidade_emissao, 1);
  assert.equal(f.consumidor_final, 1); assert.equal(f.presenca_comprador, 1); assert.equal(f.numero, 12); assert.equal(f.serie, 1);
  assert.equal(f.cnpj_emitente, CNPJ); assert.equal(f.regime_tributario_emitente, 1);
  assert.equal(f.cnpj_destinatario, CNPJ_DEST); assert.equal(f.nome_destinatario, 'CONSTRUTORA EXEMPLO LTDA');
  assert.equal(f.indicador_inscricao_estadual_destinatario, 9); assert.equal(f.inscricao_estadual_destinatario, undefined);
  assert.equal(f.logradouro_destinatario, 'RUA DAS FLORES'); assert.equal(f.numero_destinatario, '100'); assert.equal(f.bairro_destinatario, 'CENTRO');
  assert.equal(f.municipio_destinatario, 'Passagem Franca'); assert.equal(f.uf_destinatario, 'MA'); assert.equal(f.cep_destinatario, '65680000');
  assert.equal(f.telefone_destinatario, '99999990000'); assert.equal(f.email_destinatario, 'compras@exemplo.com.br');
  assert.equal(f.modalidade_frete, 0); assert.equal(f.informacoes_adicionais_contribuinte, 'Pedido JB nº 123.');
  assert.equal(f.valor_produtos, 1300); assert.equal(f.valor_frete, 100); assert.equal(f.valor_total, 1400); assert.equal(f.icms_valor_total, 0);
  assert.deepEqual(f.formas_pagamento, [{ forma_pagamento: '17', valor_pagamento: 1400, tipo_integracao: 2 }]);
  assert.equal(f.items.length, 1);
  assert.deepEqual(f.items[0], {
    numero_item: 1, codigo_produto: 'TIJ8', descricao: 'TIJOLO 8 FUROS', codigo_ncm: '69041000', cfop: '5101', unidade_comercial: 'MIL', quantidade_comercial: 2,
    valor_unitario_comercial: 650, valor_bruto: 1300, unidade_tributavel: 'MIL', quantidade_tributavel: 2, valor_unitario_tributavel: 650, valor_frete: 100, inclui_no_total: 1,
    icms_origem: 0, icms_situacao_tributaria: '102', pis_situacao_tributaria: '49', pis_base_calculo: 0, pis_aliquota: 0, pis_valor: 0,
    cofins_situacao_tributaria: '49', cofins_base_calculo: 0, cofins_aliquota: 0, cofins_valor: 0, informacoes_adicionais_item: 'Tijolo cerâmico',
  });
  for (const k of ['cUF', 'cMunFG', 'cEAN', 'xPais', 'versao']) assert.ok(!JSON.stringify(f).includes('"' + k + '"'), k + ' não vai no pedido');
});

t('tradução: regime normal (ICMS 00, IPI, PIS e COFINS por alíquota)', () => {
  const { focus: f, problemas } = traduzirInfNFe(infNormal());
  assert.deepEqual(problemas, []);
  const it = f.items[0];
  assert.equal(it.icms_situacao_tributaria, '00'); assert.equal(it.icms_modalidade_base_calculo, 3); assert.equal(it.icms_base_calculo, 1400);
  assert.equal(it.icms_aliquota, 20); assert.equal(it.icms_valor, 280);
  assert.equal(it.ipi_codigo_enquadramento_legal, '999'); assert.equal(it.ipi_situacao_tributaria, '50'); assert.equal(it.ipi_base_calculo, 1400); assert.equal(it.ipi_aliquota, 5); assert.equal(it.ipi_valor, 70);
  assert.equal(it.pis_situacao_tributaria, '01'); assert.equal(it.pis_aliquota, 1.65); assert.equal(it.pis_valor, 23.1);
  assert.equal(it.cofins_situacao_tributaria, '01'); assert.equal(it.cofins_aliquota, 7.6); assert.equal(it.cofins_valor, 106.4);
  assert.equal(f.regime_tributario_emitente, 3); assert.equal(f.icms_base_calculo, 1400); assert.equal(f.icms_valor_total, 280); assert.equal(f.valor_ipi, 70);
  assert.equal(f.valor_pis, 23.1); assert.equal(f.valor_cofins, 106.4); assert.equal(f.valor_total, 1470);
  assert.deepEqual(f.formas_pagamento, [{ forma_pagamento: '01', valor_pagamento: 1470 }]);
});

t('tradução: dado sem nome confirmado na Focus recusa a nota (nada é inventado nem descartado)', () => {
  const n = infSimples();
  n.ide.indPres = 2; n.ide.indIntermed = 0;
  n.det[0].prod.CEST = '1000800';
  n.det[0].imposto.ICMS = { ICMSSN101: { orig: 0, CSOSN: '101', pCredSN: 2.5, vCredICMSSN: 35 } };
  n.det[0].imposto.IBSCBS = { CST: '000', cClassTrib: '000001' };
  n.total.IBSCBSTot = { vBCIBSCBS: 1400 };
  n.cobr = { fat: { nFat: '12', vOrig: 1400, vDesc: 0, vLiq: 1400 }, dup: [{ nDup: '001', dVenc: '2026-12-08', vDup: 1400 }] };
  n.pag.detPag = [{ indPag: 1, tPag: '99', xPag: 'Milheiros (tijolos)', vPag: 1400 }];
  n.infRespTec = { CNPJ: CNPJ, xContato: 'Fulano', email: 'a@b.com', fone: '99999999' };
  n.total.ICMSTot.vFCP = 1.5;
  n.det[0].prod.campoNovo = 'x';
  const { problemas } = traduzirInfNFe(n);
  const tem = (re) => assert.ok(problemas.some((p) => re.test(p.campo + ' ' + p.mensagem)), 'faltou apontar ' + re);
  [/indIntermed/, /CEST/, /pCredSN/, /vCredICMSSN/, /IBSCBS\)/, /IBSCBSTot/, /cobr/, /xPag/, /infRespTec/, /vFCP/, /campoNovo/].forEach(tem);
  assert.ok(problemas.every((p) => p.campo && p.mensagem), 'cada problema diz onde e o quê');
  // valor fora do padrão também recusa
  const m = infSimples(); m.ide.tpEmis = 9;
  assert.ok(traduzirInfNFe(m).problemas.some((p) => /tpEmis/.test(p.campo)));
});

t('emitir: consulta antes, envia uma vez, acompanha e só conta como autorizada com o protocolo do XML', async () => {
  const { run, f, b } = servico();
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n1-t1', infNFe: infSimples() });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  const d = r.corpo.documento;
  assert.equal(r.corpo.ja_existia, false);
  assert.equal(d.status, 'autorizado'); assert.equal(d.id, 'jb-n1-t1'); assert.equal(d.chave, CHAVE);
  assert.equal(d.autorizacao.numero_protocolo, PROT); assert.equal(d.autorizacao.codigo_status, 100);
  assert.equal(d.autorizacao.motivo_status, 'Autorizado o uso da NF-e'); assert.equal(d.autorizacao.data_recebimento, '2026-11-08T10:00:05-03:00');
  assert.equal(d.autorizacao.digest_value, 'abc123='); assert.equal(d.numero, '12'); assert.equal(d.serie, '1');
  assert.equal(d.valor_total, 1400); assert.equal(d.data_emissao, '2026-11-08T10:00:00-03:00');
  assert.equal(f.posts().length, 1);
  const post = f.posts()[0];
  assert.equal(post.url, BASES.homologacao + '/v2/nfe?ref=jb-n1-t1');
  assert.equal(post.headers.Authorization, 'Basic ' + btoa(TOKENS.homologacao + ':'), 'HTTP Basic: token como usuário, senha vazia');
  assert.equal(post.corpo.cnpj_emitente, CNPJ);
  const i = f.chamadas.findIndex((c) => c.metodo === 'POST'), g = f.chamadas.findIndex((c) => c.metodo === 'GET' && /jb-n1-t1/.test(c.url));
  assert.ok(g >= 0 && g < i, 'consulta pela referência antes de enviar');
  assert.equal(b.envios.get('homologacao|jb-n1-t1').situacao, 'enviada');
  const a = b.registros.at(-1);
  assert.deepEqual([a.acao, a.ambiente, a.referencia, a.resultado, a.uid_app, a.documento], ['emitir_nfe', 'homologacao', 'jb-n1-t1', 'ok', 'u_ADM', CHAVE]);
});

t('emitir de novo com a mesma referência não envia outra vez (recupera a situação)', async () => {
  const { run, f } = servico();
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n2-t1', infNFe: infSimples() });
  const r2 = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n2-t1', infNFe: infSimples() });
  assert.equal(r2.status, 200);
  assert.equal(r2.corpo.ja_existia, true);
  assert.equal(r2.corpo.documento.status, 'autorizado');
  assert.equal(f.posts().length, 1, 'a mesma referência só pode ser enviada uma vez');
});

t('dois envios ao mesmo tempo com a mesma referência: só um chega à Focus', async () => {
  const { run, f } = servico();
  const [x, y] = await Promise.all([1, 2].map(() => run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n3-t1', infNFe: infSimples() })));
  assert.equal(f.posts().length, 1);
  assert.ok([x, y].some((r) => r.status === 200), 'um deles foi enviado');
});

t('resposta perdida no envio: fica "sem confirmação", não reenvia, e a consulta recupera a nota', async () => {
  const f = focusFalsa({ postFalha: 'depois' });
  const { run, b } = servico({ focus: f });
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n4-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'sem_confirmacao'); assert.equal(r.corpo.retryable, false);
  assert.equal(b.envios.get('homologacao|jb-n4-t1').situacao, 'sem_confirmacao');
  const r2 = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n4-t1', infNFe: infSimples() });
  assert.equal(r2.corpo.ja_existia, true, 'a Focus tinha recebido: recupera, não envia');
  assert.equal(f.posts().length, 1);
  const c = await run('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n4-t1', sincronizar: true });
  assert.equal(c.corpo.encontrado, true); assert.equal(c.corpo.documento.status, 'autorizado');
});

t('envio que não chegou à Focus: consulta diz "em andamento" por 3 min e depois "não encontrado" (pode reenviar com outra referência)', async () => {
  const f = focusFalsa({ postFalha: 'antes' });
  const { run, b } = servico({ focus: f });
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n5-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'sem_confirmacao');
  const c1 = await run('consultar_nfe', { ambiente: 'homologacao', referencia: 'jb-n5-t1' });
  assert.equal(c1.corpo.encontrado, true); assert.equal(c1.corpo.documento.status, 'pendente');
  b.avancar(200);
  const c2 = await run('consultar_nfe', { ambiente: 'homologacao', referencia: 'jb-n5-t1' });
  assert.deepEqual(c2.corpo, { encontrado: false });
  const r2 = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n5-t1', infNFe: infSimples() });
  assert.equal(r2.corpo.erro.tipo, 'sem_confirmacao', 'a mesma referência nunca é reenviada');
  assert.equal(f.chamadas.filter((x) => x.metodo === 'POST').length, 1);
});

t('autorizada sem protocolo da SEFAZ não conta como autorizada', async () => {
  const { run } = servico({ focusOpc: { xml: { semProt: true } } });
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n6-t1', infNFe: infSimples() });
  assert.equal(r.corpo.documento.status, 'pendente');
  assert.equal(r.corpo.documento.autorizacao.numero_protocolo, null);
  assert.match(r.corpo.documento.autorizacao.mensagem, /protocolo/);
  const x = documentoDaFocus({ ref: 'a', status: 'autorizado', chave_nfe: 'NFe' + CHAVE }, lerProtocoloXml(xmlAutorizado({ cStat: 110 })));
  assert.equal(x.status, 'pendente', 'protocolo com cStat que não é de autorização não vale');
});

t('rejeição da SEFAZ volta com código e motivo (o programa trata 204 e 539)', async () => {
  const { run } = servico({ focusOpc: { final: { status: 'erro_autorizacao', status_sefaz: '539', mensagem_sefaz: 'Rejeição: Duplicidade de NF-e com diferença na Chave de Acesso' } } });
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n7-t1', infNFe: infSimples() });
  const d = r.corpo.documento;
  assert.equal(d.status, 'rejeitado'); assert.equal(d.autorizacao.codigo_status, 539); assert.match(d.autorizacao.motivo_status, /Duplicidade/);
  assert.equal(d.autorizacao.numero_protocolo, null);
  const c = await run('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n7-t1' });
  assert.equal(c.corpo.documento.status, 'rejeitado');
  assert.equal(documentoDaFocus({ ref: 'b', status: 'erro_autorizacao' }).status, 'erro', 'sem código da SEFAZ é erro técnico');
  assert.equal(documentoDaFocus({ ref: 'c', status: 'denegado', status_sefaz: '302' }).status, 'denegado');
});

t('nota que fica processando: volta "pendente" e a consulta seguinte traz a autorização', async () => {
  const { run } = servico({ focusOpc: { consultasAteFinal: 5 }, esperas: [0, 0] });
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n8-t1', infNFe: infSimples() });
  assert.equal(r.corpo.documento.status, 'pendente');
  let c;
  for (let k = 0; k < 4; k++) c = await run('consultar_nfe', { ambiente: 'homologacao', id: 'jb-n8-t1' });
  assert.equal(c.corpo.documento.status, 'autorizado');
});

t('Focus recusa o pedido (422): "validacao" com a lista, nada transmitido', async () => {
  const { run, b } = servico({ focusOpc: { post422: true } });
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n9-t1', infNFe: infSimples() });
  assert.equal(r.status, 422); assert.equal(r.corpo.erro.tipo, 'validacao');
  assert.deepEqual(r.corpo.erro.problemas, [{ campo: 'items[0].codigo_ncm', mensagem: 'NCM inválido' }]);
  assert.match(r.corpo.erro.mensagem, /Nada foi transmitido/);
  assert.equal(b.envios.get('homologacao|jb-n9-t1').situacao, 'recusada');
});

t('nota com dado sem equivalente: recusada antes de qualquer pedido à Focus', async () => {
  const { run, f, b } = servico();
  const n = infSimples(); n.cobr = { fat: { nFat: '1' } };
  const r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-n10-t1', infNFe: n });
  assert.equal(r.corpo.erro.tipo, 'validacao'); assert.ok(r.corpo.erro.problemas.some((p) => /cobr/.test(p.campo)));
  assert.equal(f.chamadas.length, 0); assert.equal(b.envios.size, 0);
});

t('produção bloqueada sem PRODUCAO_LIBERADA = "sim" (nenhum pedido à Focus)', async () => {
  for (const v of ['', 'Sim, mas depois', 'nao', 'true']) {
    const { run, f } = servico({ env: { PRODUCAO_LIBERADA: v } });
    for (const [acao, args] of [['emitir_nfe', { referencia: 'jb-p1-t1', infNFe: infSimples() }], ['consultar_nfe', { id: 'jb-p1-t1' }], ['cancelar_nfe', { id: 'x1', justificativa: 'Erro de digitação no pedido' }],
      ['inutilizar_numeracao', { ano: 26, serie: 1, numero_inicial: 5, numero_final: 5, justificativa: 'Numeracao nao utilizada no sistema' }]]) {
      const r = await run(acao, { ambiente: 'producao', ...args });
      assert.equal(r.corpo.erro.tipo, 'configuracao', acao + ' com PRODUCAO_LIBERADA=' + JSON.stringify(v));
      assert.match(r.corpo.erro.mensagem, /PRODUCAO_LIBERADA/);
    }
    const st = await run('status_servico', { ambiente: 'producao' });
    assert.equal(st.corpo.producao_liberada, false);
    assert.equal(f.chamadas.length, 0, 'nada pode ir para a produção');
  }
  const { run, f } = servico({ env: { PRODUCAO_LIBERADA: ' SIM ' } });
  const r = await run('emitir_nfe', { ambiente: 'producao', referencia: 'jb-p2-t1', infNFe: infSimples() });
  assert.equal(r.corpo.documento.status, 'autorizado');
  assert.ok(f.posts()[0].url.startsWith(BASES.producao + '/'));
  assert.equal(f.posts()[0].headers.Authorization, 'Basic ' + btoa(TOKENS.producao + ':'), 'produção usa o token de produção');
});

t('sem token do ambiente, CNPJ diferente ou ambiente inválido: recusa clara, nada enviado', async () => {
  let { run, f } = servico({ env: { FOCUSNFE_TOKEN_HOMOLOGACAO: '' } });
  let r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-t1-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'configuracao'); assert.match(r.corpo.erro.mensagem, /FOCUSNFE_TOKEN_HOMOLOGACAO/);
  ({ run, f } = servico({ env: { CNPJ_EMITENTE: CNPJ_DEST } }));
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-t2-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'configuracao'); assert.match(r.corpo.erro.mensagem, /CNPJ_EMITENTE/);
  r = await run('emitir_nfe', { ambiente: 'teste', referencia: 'jb-t3-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'validacao');
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'ref com espaço', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'validacao');
  assert.equal(f.chamadas.length, 0);
  ({ run, f } = servico({ bancoOpc: { fora: true } }));
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-t4-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'indisponivel', 'sem reserva no banco, nada é enviado'); assert.equal(r.corpo.retryable, true);
  assert.equal(f.chamadas.length, 0);
});

t('Focus fora do ar antes do envio: "indisponivel" (nada enviado); token recusado: "autenticacao"', async () => {
  let { run } = servico({ focusOpc: { redeFora: true } });
  let r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-r1-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'indisponivel'); assert.equal(r.corpo.retryable, true);
  ({ run } = servico({ env: { FOCUSNFE_TOKEN_HOMOLOGACAO: 'token-errado' } }));
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-r2-t1', infNFe: infSimples() });
  assert.equal(r.corpo.erro.tipo, 'autenticacao'); assert.match(r.corpo.erro.mensagem, /FOCUSNFE_TOKEN_HOMOLOGACAO/);
});

t('consultar: por id (= referência) e por referência; inexistente = não encontrado', async () => {
  const { run } = servico();
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-c1-t1', infNFe: infSimples() });
  const a = await run('consultar_nfe', { ambiente: 'homologacao', id: 'jb-c1-t1', sincronizar: false });
  const b = await run('consultar_nfe', { ambiente: 'homologacao', referencia: 'jb-c1-t1' });
  assert.equal(a.corpo.encontrado, true); assert.deepEqual(a.corpo, b.corpo);
  assert.equal(a.corpo.documento.id, 'jb-c1-t1', 'o provedorId que o programa guarda é a própria referência');
  const c = await run('consultar_nfe', { ambiente: 'homologacao', referencia: 'jb-nunca-t1' });
  assert.deepEqual(c.corpo, { encontrado: false });
});

t('cancelar: pede uma vez, protocolo do evento; pedir de novo não reenvia; consultar cancelamento', async () => {
  const { run, f } = servico();
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-k1-t1', infNFe: infSimples() });
  const curta = await run('cancelar_nfe', { ambiente: 'homologacao', id: 'jb-k1-t1', justificativa: 'curta' });
  assert.equal(curta.corpo.erro.tipo, 'pedido');
  const r = await run('cancelar_nfe', { ambiente: 'homologacao', id: 'jb-k1-t1', justificativa: 'Cliente desistiu da compra antes da entrega' });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.deepEqual(r.corpo.evento, { id: 'jb-k1-t1', status: 'registrado', codigo_status: 135, motivo_status: 'Evento registrado e vinculado a NF-e', numero_protocolo: '121260000099999', data_registro: '2026-11-08T11:00:00-03:00' });
  const del = f.chamadas.filter((c) => c.metodo === 'DELETE');
  assert.equal(del.length, 1); assert.deepEqual(del[0].corpo, { justificativa: 'Cliente desistiu da compra antes da entrega' });
  const r2 = await run('cancelar_nfe', { ambiente: 'homologacao', id: 'jb-k1-t1', justificativa: 'Cliente desistiu da compra antes da entrega' });
  assert.equal(r2.corpo.ja_existia, true); assert.equal(r2.corpo.evento.status, 'registrado');
  assert.equal(f.chamadas.filter((c) => c.metodo === 'DELETE').length, 1, 'cancelamento não é pedido duas vezes');
  const cc = await run('consultar_cancelamento', { ambiente: 'homologacao', id: 'jb-k1-t1' });
  assert.equal(cc.corpo.evento.status, 'registrado'); assert.equal(cc.corpo.evento.numero_protocolo, '121260000099999');
  const d = await run('consultar_nfe', { ambiente: 'homologacao', id: 'jb-k1-t1' });
  assert.equal(d.corpo.documento.status, 'cancelado');
  const x = await run('baixar_xml_nfe', { ambiente: 'homologacao', id: 'jb-k1-t1', tipo: 'cancelamento' });
  assert.match(Buffer.from(x.corpo.conteudo_base64, 'base64').toString('utf8'), /procEventoNFe/);
});

t('cancelamento rejeitado pela SEFAZ e consulta sem cancelamento', async () => {
  const { run } = servico({ focusOpc: { cancelamentoRejeitado: true } });
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-k2-t1', infNFe: infSimples() });
  const r = await run('cancelar_nfe', { ambiente: 'homologacao', id: 'jb-k2-t1', justificativa: 'Erro na quantidade informada na nota' });
  assert.equal(r.corpo.evento.status, 'rejeitado'); assert.equal(r.corpo.evento.codigo_status, 501);
  const cc = await run('consultar_cancelamento', { ambiente: 'homologacao', id: 'jb-k2-t1' });
  assert.equal(cc.corpo.evento, null);
  const nao = await run('cancelar_nfe', { ambiente: 'homologacao', id: 'jb-nao-existe', justificativa: 'Erro na quantidade informada na nota' });
  assert.equal(nao.corpo.erro.tipo, 'nao_encontrado');
});

t('inutilizar: envia com o CNPJ do servidor, protocolo da SEFAZ, e não repete a mesma faixa', async () => {
  const { run, f } = servico();
  const args = { ambiente: 'homologacao', ano: 26, serie: 1, numero_inicial: 7, numero_final: 7, justificativa: 'Numeracao reservada e nao utilizada no sistema JB Gestao' };
  const r = await run('inutilizar_numeracao', args);
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(r.corpo.evento.status, 'registrado'); assert.equal(r.corpo.evento.numero_protocolo, '121260000055555'); assert.equal(r.corpo.evento.codigo_status, 102);
  const post = f.chamadas.find((c) => c.metodo === 'POST' && /inutilizacao$/.test(c.url));
  assert.deepEqual(post.corpo, { cnpj: CNPJ, serie: 1, numero_inicial: 7, numero_final: 7, justificativa: args.justificativa });
  const r2 = await run('inutilizar_numeracao', args);
  assert.equal(r2.corpo.ja_existia, true);
  assert.equal(f.chamadas.filter((c) => c.metodo === 'POST' && /inutilizacao$/.test(c.url)).length, 1);
  const semCnpj = await servico({ env: { CNPJ_EMITENTE: '' } }).run('inutilizar_numeracao', args);
  assert.equal(semCnpj.corpo.erro.tipo, 'configuracao'); assert.match(semCnpj.corpo.erro.mensagem, /CNPJ_EMITENTE/);
});

t('XML e DANFE em base64 no formato do programa (sem BOM, hash confere com o texto)', async () => {
  const { run } = servico({ focusOpc: { xml: { bom: true } } });
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-x1-t1', infNFe: infSimples() });
  const x = await run('baixar_xml_nfe', { ambiente: 'homologacao', id: 'jb-x1-t1', tipo: 'nfe' });
  assert.equal(x.status, 200, JSON.stringify(x.corpo));
  const bytes = Buffer.from(x.corpo.conteudo_base64, 'base64');
  assert.notEqual(bytes[0], 0xef, 'a marca BOM sai');
  const texto = new TextDecoder('utf-8').decode(bytes);
  const { createHash } = await import('node:crypto');
  assert.equal(x.corpo.sha256, createHash('sha256').update(new TextEncoder().encode(texto)).digest('hex'), 'o programa confere o hash do texto');
  assert.match(texto, new RegExp('<nProt>' + PROT));
  const p = await run('baixar_danfe', { ambiente: 'homologacao', id: 'jb-x1-t1', logotipo: true });
  assert.equal(Buffer.from(p.corpo.conteudo_base64, 'base64').subarray(0, 4).toString('latin1'), '%PDF');
});

t('o token só vai para o endereço da própria Focus', async () => {
  const f = focusFalsa();
  const { run } = servico({ focus: f });
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-s1-t1', infNFe: infSimples() });
  const n = f.notas.get('homologacao|jb-s1-t1');
  n.caminhoXml = 'https://outro-lugar.example.com/arquivo.xml';
  f.arquivos.set(n.caminhoXml, { tipo: 'application/xml', corpo: xmlAutorizado(), publico: true });
  const x = await run('baixar_xml_nfe', { ambiente: 'homologacao', id: 'jb-s1-t1' });
  assert.equal(x.status, 200);
  const pedido = f.chamadas.find((c) => c.url === n.caminhoXml);
  assert.equal(pedido.headers.Authorization, undefined);
});

t('CEP e CNPJ no formato que o programa aplica no endereço', async () => {
  const { run } = servico();
  const c = await run('consultar_cep', { cep: '65680-000' });
  assert.deepEqual(c.corpo, { endereco: { cep: '65680000', tipo_logradouro: 'Rua', logradouro: 'das Flores', bairro: 'Centro', municipio: 'Passagem Franca', uf: 'MA', codigo_ibge: '2107902' } });
  const n = await run('consultar_cep', { cep: '00000000' });
  assert.equal(n.corpo.erro.tipo, 'nao_encontrado');
  const j = await run('consultar_cnpj', { cnpj: CNPJ_DEST });
  const e = j.corpo.empresa;
  assert.equal(e.razao_social, 'CONSTRUTORA EXEMPLO LTDA');
  assert.deepEqual(e.endereco, { cep: '65680000', logradouro: 'RUA DAS FLORES', numero: '100', complemento: '', bairro: 'CENTRO', uf: 'MA', municipio: { descricao: 'Passagem Franca', codigo_ibge: '2107902' } });
});

t('status do serviço: token aceito, cadastro da empresa e certificado A1', async () => {
  const { run } = servico();
  const r = await run('status_servico', { ambiente: 'homologacao' });
  const d = r.corpo;
  assert.equal(d.provedor, 'Focus NFe'); assert.equal(d.cnpj_emitente, CNPJ); assert.equal(d.credenciais_configuradas, true); assert.equal(d.producao_liberada, false);
  assert.deepEqual(d.voce, { nome: 'Administrador', papel: 'administrador' });
  assert.equal(d.config_nfe.ok, true); assert.equal(d.empresa.ok, true); assert.equal(d.empresa.dados.nome_razao_social, 'CERAMICA EXEMPLO LTDA');
  assert.equal(d.certificado.ok, true); assert.equal(String(d.certificado.dados.not_valid_after).slice(0, 10), '2027-05-10');
  assert.equal(d.sefaz.ok, null);
  const sem = await servico({ focusOpc: { empresas403: true } }).run('status_servico', { ambiente: 'homologacao' });
  assert.equal(sem.corpo.certificado.ok, false); assert.match(sem.corpo.certificado.erro.mensagem, /FOCUSNFE_TOKEN_CONTA/);
  const ruim = await servico({ env: { FOCUSNFE_TOKEN_HOMOLOGACAO: 'errado' } }).run('status_servico', { ambiente: 'homologacao' });
  assert.equal(ruim.corpo.config_nfe.ok, false);
});

t('permissões: a mesma regra do programa (emitir, cancelar, ver) e a lista de autorizados', async () => {
  const { run, f } = servico();
  const q = (papel, extra) => ({ origem: 'nuvem', uid: 'u_' + papel, nome: papel, papel, autorizados: [], ...extra });
  let r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-q1-t1', infNFe: infSimples() }, q('vendedor'));
  assert.equal(r.corpo.erro.tipo, 'permissao');
  r = await run('consultar_nfe', { ambiente: 'homologacao', id: 'jb-q1-t1' }, q('vendedor'));
  assert.equal(r.status, 200);
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-q2-t1', infNFe: infSimples() }, q('financeiro'));
  assert.equal(r.status, 200);
  r = await run('cancelar_nfe', { ambiente: 'homologacao', id: 'jb-q2-t1', justificativa: 'Cliente desistiu da compra antes da entrega' }, q('financeiro'));
  assert.equal(r.corpo.erro.tipo, 'permissao');
  r = await run('auditoria', { limite: 5 }, q('financeiro'));
  assert.equal(r.corpo.erro.tipo, 'permissao');
  r = await run('status_servico', { ambiente: 'homologacao' }, q('consulta'));
  assert.equal(r.corpo.erro.tipo, 'permissao');
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-q3-t1', infNFe: infSimples() }, q('gerente', { autorizados: ['u_outro'] }));
  assert.equal(r.corpo.erro.tipo, 'permissao', 'fora da lista de autorizados');
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-q4-t1', infNFe: infSimples() }, q('gerente', { autorizados: ['u_gerente'] }));
  assert.equal(r.status, 200);
  r = await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-q5-t1', infNFe: infSimples() }, null);
  assert.equal(r.corpo.erro.tipo, 'autenticacao');
  assert.equal(f.posts().length, 2);
});

t('auditoria: cada chamada fica registrada e a ação "auditoria" lê o registro', async () => {
  const { run, b } = servico();
  await run('emitir_nfe', { ambiente: 'homologacao', referencia: 'jb-a1-t1', infNFe: infSimples() });
  await run('consultar_cep', { cep: '65680000' });
  await run('emitir_nfe', { ambiente: 'producao', referencia: 'jb-a2-t1', infNFe: infSimples() });
  assert.deepEqual(b.registros.map((a) => [a.acao, a.resultado]), [['emitir_nfe', 'ok'], ['consultar_cep', 'ok'], ['emitir_nfe', 'configuracao']]);
  const r = await run('auditoria', { limite: 10 });
  assert.equal(r.status, 200);
  const regs = r.corpo.registros;
  assert.equal(regs.length, 3);
  assert.deepEqual(Object.keys(regs[0]).sort(), ['ambiente', 'detalhe', 'documento', 'em', 'operacao', 'origem', 'papel', 'quem', 'referencia', 'resultado'].sort());
  assert.equal(regs[2].operacao, 'emitir_nfe'); assert.equal(regs[2].referencia, 'jb-a1-t1'); assert.equal(regs[2].quem, 'Administrador');
  assert.ok(!JSON.stringify(b.registros).includes(TOKENS.homologacao), 'token nunca vai para a auditoria');
});

t('toda ação do programa existe e erro sempre vem como {erro:{tipo, mensagem}}', async () => {
  assert.deepEqual([...ACOES].sort(), ['auditoria', 'baixar_danfe', 'baixar_xml_nfe', 'cancelar_nfe', 'consultar_cancelamento', 'consultar_cep', 'consultar_cnpj', 'consultar_nfe', 'emitir_nfe', 'inutilizar_numeracao', 'status_servico']);
  const { run } = servico();
  const r = await run('apagar_tudo', {});
  assert.equal(r.status, 400); assert.equal(typeof r.corpo.erro.tipo, 'string'); assert.equal(typeof r.corpo.erro.mensagem, 'string');
});

/* ---------- execução direta ---------- */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ok = 0, falhou = 0;
  for (const x of TESTES) {
    try { await x.fn(); ok++; console.log('  ✔ ' + x.nome); }
    catch (e) { falhou++; console.log('  ✘ ' + x.nome + '\n      ' + String(e && (e.stack || e.message) || e).split('\n').slice(0, 5).join('\n      ')); }
  }
  console.log(`\n${ok} de ${TESTES.length} testes do JB Fiscal passaram.`);
  process.exit(falhou ? 1 : 0);
}
