/* =====================================================================
   JB Fiscal · núcleo (Focus NFe)

   Lógica pura do serviço fiscal: não lê variável de ambiente, não abre
   conexão sozinho e não guarda segredo. Recebe o fetch, as variáveis e o
   banco por parâmetro, por isso roda igual no Deno (função
   supabase/functions/jb-fiscal/index.ts) e no Node (scripts/testar-fiscal.mjs,
   com um fetch falso, sem rede).

   O que faz:
   · traduz o grupo infNFe (leiaute 4.00) que o programa monta (montarInfNFe)
     para o JSON próprio da Focus NFe, campo a campo, com os nomes conferidos
     no SDK @rodrigogs/focusnfe-sdk 0.1.0. Campo sem nome confirmado NÃO é
     inventado: a nota é recusada antes do envio (tipo "validacao"), com a
     lista do que falta, e nada é transmitido;
   · fala com a Focus NFe (HTTP Basic: o token da empresa é o usuário e a
     senha fica vazia; um token por ambiente) e devolve exatamente o formato
     que o programa já espera (o mesmo contrato do antigo conector "JB Fiscal");
   · emissão idempotente: a referência é reservada no banco, consultada na
     Focus antes do envio e nunca é enviada duas vezes;
   · só conta como autorizada a nota com o protocolo da SEFAZ (lido no XML
     autorizado: nProt com cStat 100 ou 150);
   · produção só com PRODUCAO_LIBERADA = "sim"; qualquer outro valor recusa.
   ===================================================================== */

export const VERSAO = '1.0';
export const PROVEDOR = 'Focus NFe';
export const BASES = Object.freeze({ homologacao: 'https://homologacao.focusnfe.com.br', producao: 'https://api.focusnfe.com.br' });
export const VAR_TOKEN = Object.freeze({ homologacao: 'FOCUSNFE_TOKEN_HOMOLOGACAO', producao: 'FOCUSNFE_TOKEN_PRODUCAO' });
const NOME_AMB = { homologacao: 'homologação', producao: 'produção' };
export const ACOES = Object.freeze(['status_servico', 'emitir_nfe', 'consultar_nfe', 'baixar_xml_nfe', 'baixar_danfe', 'cancelar_nfe',
  'consultar_cancelamento', 'inutilizar_numeracao', 'consultar_cep', 'consultar_cnpj', 'auditoria']);

/* Quem pode o quê: a mesma regra do programa (PERM['setor-fiscal'], 'setor-fiscal-emitir' e
   'setor-fiscal-cancelar'; a inutilização usa a regra do cancelamento, como no programa). */
const VER = Object.freeze(['admin', 'gerente', 'financeiro', 'vendedor']);
export const PAPEIS_ACAO = Object.freeze({
  status_servico: VER, consultar_nfe: VER, baixar_xml_nfe: VER, baixar_danfe: VER, consultar_cancelamento: VER, consultar_cep: VER, consultar_cnpj: VER,
  emitir_nfe: Object.freeze(['admin', 'gerente', 'financeiro']),
  cancelar_nfe: Object.freeze(['admin', 'gerente']),
  inutilizar_numeracao: Object.freeze(['admin', 'gerente']),
  auditoria: Object.freeze(['admin', 'gerente']),
});
/* ações que também respeitam a lista "Quem pode emitir e cancelar" das Configurações fiscais */
const COM_LISTA = new Set(['emitir_nfe', 'cancelar_nfe', 'inutilizar_numeracao']);
const NOME_PAPEL = { admin: 'administrador', gerente: 'gerente', financeiro: 'financeiro', vendedor: 'vendedor', consulta: 'consulta' };
const O_QUE = {
  status_servico: 'verificar o serviço fiscal', emitir_nfe: 'emitir notas fiscais', consultar_nfe: 'consultar notas fiscais', baixar_xml_nfe: 'baixar o XML',
  baixar_danfe: 'baixar o DANFE', cancelar_nfe: 'cancelar notas fiscais', consultar_cancelamento: 'consultar cancelamentos',
  inutilizar_numeracao: 'inutilizar numeração', consultar_cep: 'consultar CEP', consultar_cnpj: 'consultar CNPJ', auditoria: 'ver a auditoria do serviço fiscal',
};
const REF = /^[A-Za-z0-9_.-]{1,80}$/;
const TEMPO_FOCUS = 20000;                      // cada pedido à Focus
const ESPERAS_PADRAO = [1000, 2000, 3000, 4000, 5000];   // acompanhamento depois do envio (~15 s)
const EM_ANDAMENTO_S = 180;                     // envio sem resposta há menos que isso: ainda "em andamento"

/* ---------------- utilidades ---------------- */
const digitos = (v) => String(v ?? '').replace(/\D/g, '');
const vazio = (v) => v === undefined || v === null || v === '';
const curto = (s, n = 300) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const inteiro = (v) => (vazio(v) || !/^\s*-?\d+\s*$/.test(String(v)) ? null : parseInt(String(v), 10));
const fmtCnpj = (c) => { const d = digitos(c); return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d; };
const chave44 = (v) => { const d = digitos(v); return d.length === 44 ? d : null; };
const caminhoNfe = (ref) => '/v2/nfe/' + encodeURIComponent(ref);
const sinal = (ms) => (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined);

export function base64DeBytes(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export async function sha256Hex(dados) {
  const b = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados;
  const h = await crypto.subtle.digest('SHA-256', b);
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
/* XML de NF-e é UTF-8; a marca BOM sai para o hash bater com o que o programa confere depois */
const semBom = (u8) => (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf ? u8.subarray(3) : u8);

/* ---------------- erros (sempre em português, no formato {erro:{tipo, mensagem}}) ---------------- */
export class FalhaFiscal extends Error {
  constructor(status, tipo, mensagem, extra = {}) {
    super(mensagem);
    this.status = status; this.tipo = tipo; this.problemas = extra.problemas || null; this.retryable = extra.retryable;
  }
}
const falha = (status, tipo, mensagem, extra) => new FalhaFiscal(status, tipo, mensagem, extra);
export function corpoDeErro(f) {
  const erro = { tipo: f.tipo, mensagem: f.message };
  if (f.problemas && f.problemas.length) erro.problemas = f.problemas;
  const c = { erro };
  if (typeof f.retryable === 'boolean') { erro.retryable = f.retryable; c.retryable = f.retryable; }
  return c;
}

/* =====================================================================
   Tradução infNFe (leiaute 4.00) → JSON da Focus NFe
   Cada chave do infNFe tem uma destas regras:
     'nome_focus'   copia o valor para o campo da Focus (nome conferido no SDK)
     IGNORA(...)    não vai no pedido: a Focus preenche pelo cadastro da empresa ou é o padrão
                    do leiaute; se o valor não for o padrão, a nota é recusada
     SEM(...)       sem nome confirmado no SDK: a nota que usa este dado é recusada antes do envio
     ZERO(...)      igual a SEM, mas só quando o valor não é zero
     função         grupo com regras próprias
   Chave que não está em nenhuma regra também recusa a nota (nada é descartado em silêncio).
   ===================================================================== */
const IGNORA = (porque, padrao) => ({ ignorar: porque, padrao });
const SEM = (oque) => ({ sem: oque });
const ZERO = (oque) => ({ zero: oque });
const AVISO_SEM = 'a ligação com a Focus NFe ainda não envia este dado (nome do campo não confirmado)';

function copiar(obj, onde, mapa, saida, probs) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (vazio(v)) continue;
    const m = mapa[k];
    const campo = `${onde} (${k})`;
    if (m === undefined) { probs.push({ campo, mensagem: 'campo sem equivalente confirmado na Focus NFe; ' + AVISO_SEM }); continue; }
    if (typeof m === 'string') { saida[m] = v; continue; }
    if (typeof m === 'function') { m(v, saida, probs, onde); continue; }
    if (m.sem) { probs.push({ campo, mensagem: m.sem + ': ' + AVISO_SEM }); continue; }
    if (m.zero) { if (Number(v) !== 0) probs.push({ campo, mensagem: `${m.zero} (${v}): ${AVISO_SEM}` }); continue; }
    if (m.ignorar && m.padrao !== undefined && String(v) !== String(m.padrao)) {
      probs.push({ campo, mensagem: `valor "${v}" diferente do padrão (${m.padrao}, ${m.ignorar}); a ligação com a Focus NFe só trabalha com o padrão` });
    }
  }
}
const grupoUnico = (mapaGrupos, rotulo) => (v, saida, probs, onde) => {
  if (!v || typeof v !== 'object') { probs.push({ campo: `${onde} (${rotulo})`, mensagem: 'grupo inválido' }); return; }
  for (const [g, conteudo] of Object.entries(v)) {
    const m = mapaGrupos[g];
    if (!m) { probs.push({ campo: `${onde} (${rotulo}.${g})`, mensagem: 'situação tributária sem equivalente confirmado na Focus NFe; ' + AVISO_SEM }); continue; }
    copiar(conteudo, `${onde}, ${rotulo} ${g}`, m, saida, probs);
  }
};

const M_IDE = {
  cUF: IGNORA('vem do cadastro da empresa na Focus NFe'),
  natOp: 'natureza_operacao', serie: 'serie', nNF: 'numero', dhEmi: 'data_emissao', tpNF: 'tipo_documento', idDest: 'local_destino',
  cMunFG: IGNORA('vem do cadastro da empresa na Focus NFe'),
  tpImp: IGNORA('DANFE retrato', 1),
  tpEmis: IGNORA('emissão normal', 1),
  finNFe: 'finalidade_emissao', indFinal: 'consumidor_final', indPres: 'presenca_comprador',
  indIntermed: SEM('indicador de intermediador (venda não presencial)'),
  procEmi: IGNORA('emissão pelo aplicativo do contribuinte', 0),
  verProc: IGNORA('versão do aplicativo emissor'),
};
const M_EMIT = { CNPJ: 'cnpj_emitente', CRT: 'regime_tributario_emitente' };
const M_END = {
  xLgr: 'logradouro_destinatario', nro: 'numero_destinatario', xCpl: 'complemento_destinatario', xBairro: 'bairro_destinatario',
  cMun: IGNORA('a Focus NFe recebe o nome do município e a UF'),
  xMun: 'municipio_destinatario', UF: 'uf_destinatario', CEP: 'cep_destinatario',
  cPais: IGNORA('Brasil', '1058'), xPais: IGNORA('Brasil', 'BRASIL'),
  fone: 'telefone_destinatario',
};
const M_DEST = {
  CNPJ: 'cnpj_destinatario', CPF: 'cpf_destinatario', xNome: 'nome_destinatario',
  indIEDest: 'indicador_inscricao_estadual_destinatario', IE: 'inscricao_estadual_destinatario', email: 'email_destinatario',
  enderDest: (v, saida, probs) => copiar(v, 'destinatário, endereço', M_END, saida, probs),
};
const M_PROD = {
  cProd: 'codigo_produto', cEAN: IGNORA('produto sem código de barras', 'SEM GTIN'), xProd: 'descricao', NCM: 'codigo_ncm',
  CEST: SEM('código CEST do produto'), CFOP: 'cfop',
  uCom: 'unidade_comercial', qCom: 'quantidade_comercial', vUnCom: 'valor_unitario_comercial', vProd: 'valor_bruto',
  cEANTrib: IGNORA('produto sem código de barras', 'SEM GTIN'),
  uTrib: 'unidade_tributavel', qTrib: 'quantidade_tributavel', vUnTrib: 'valor_unitario_tributavel',
  vFrete: 'valor_frete', vSeg: 'valor_seguro', vDesc: 'valor_desconto', vOutro: 'valor_outras_despesas', indTot: 'inclui_no_total',
};
const M_ICMS_G = {
  orig: 'icms_origem', CST: 'icms_situacao_tributaria', CSOSN: 'icms_situacao_tributaria', modBC: 'icms_modalidade_base_calculo',
  vBC: 'icms_base_calculo', pICMS: 'icms_aliquota', vICMS: 'icms_valor',
  pRedBC: SEM('percentual de redução da base do ICMS'),
  pFCP: SEM('percentual do FCP (fundo de combate à pobreza)'), vFCP: SEM('valor do FCP (fundo de combate à pobreza)'),
  vICMSOp: SEM('ICMS da operação (diferimento, CST 51)'), pDif: SEM('percentual do diferimento (CST 51)'), vICMSDif: SEM('ICMS diferido (CST 51)'),
  pCredSN: SEM('alíquota do crédito do Simples Nacional (CSOSN 101)'), vCredICMSSN: SEM('crédito de ICMS do Simples Nacional (CSOSN 101)'),
};
const M_ICMS = Object.fromEntries(['ICMS00', 'ICMS20', 'ICMS40', 'ICMS51', 'ICMS90', 'ICMSSN101', 'ICMSSN102', 'ICMSSN900'].map((g) => [g, M_ICMS_G]));
const M_IPI_G = { CST: 'ipi_situacao_tributaria', vBC: 'ipi_base_calculo', pIPI: 'ipi_aliquota', vIPI: 'ipi_valor' };
const M_IPI = {
  cEnq: 'ipi_codigo_enquadramento_legal',
  IPITrib: (v, s, p, onde) => copiar(v, onde + ' IPITrib', M_IPI_G, s, p),
  IPINT: (v, s, p, onde) => copiar(v, onde + ' IPINT', M_IPI_G, s, p),
};
const M_PIS_G = { CST: 'pis_situacao_tributaria', vBC: 'pis_base_calculo', pPIS: 'pis_aliquota', vPIS: 'pis_valor' };
const M_COFINS_G = { CST: 'cofins_situacao_tributaria', vBC: 'cofins_base_calculo', pCOFINS: 'cofins_aliquota', vCOFINS: 'cofins_valor' };
const M_PIS = { PISAliq: M_PIS_G, PISNT: M_PIS_G, PISOutr: M_PIS_G };
const M_COFINS = { COFINSAliq: M_COFINS_G, COFINSNT: M_COFINS_G, COFINSOutr: M_COFINS_G };
const M_IMPOSTO = {
  ICMS: grupoUnico(M_ICMS, 'ICMS'),
  IPI: (v, s, p, onde) => copiar(v, onde + ', IPI', M_IPI, s, p),
  PIS: grupoUnico(M_PIS, 'PIS'),
  COFINS: grupoUnico(M_COFINS, 'COFINS'),
  IBSCBS: SEM('IBS e CBS do item (reforma tributária)'),
};
const M_TOT = {
  vBC: 'icms_base_calculo', vICMS: 'icms_valor_total', vICMSDeson: 'icms_valor_total_desonerado', vFCP: ZERO('valor total do FCP'),
  vBCST: 'icms_base_calculo_st', vST: 'icms_valor_total_st', vFCPST: ZERO('FCP retido por substituição tributária'), vFCPSTRet: ZERO('FCP retido anteriormente'),
  vProd: 'valor_produtos', vFrete: 'valor_frete', vSeg: 'valor_seguro', vDesc: 'valor_desconto', vII: 'valor_total_ii', vIPI: 'valor_ipi',
  vIPIDevol: ZERO('IPI devolvido'), vPIS: 'valor_pis', vCOFINS: 'valor_cofins', vOutro: 'valor_outras_despesas', vNF: 'valor_total',
};
const M_CARD = { tpIntegra: 'tipo_integracao' };
const M_DETPAG = {
  indPag: IGNORA('indicador à vista ou a prazo, opcional no leiaute'),
  tPag: 'forma_pagamento', vPag: 'valor_pagamento',
  xPag: SEM('descrição da forma de pagamento "Outros" (tPag 99)'),
  card: (v, s, p, onde) => copiar(v, onde + ', cartão', M_CARD, s, p),
};
const M_INF = {
  versao: IGNORA('leiaute 4.00', '4.00'),
  ide: (v, f, p) => copiar(v, 'identificação da nota', M_IDE, f, p),
  emit: (v, f, p) => copiar(v, 'emitente', M_EMIT, f, p),
  dest: (v, f, p) => copiar(v, 'destinatário', M_DEST, f, p),
  det: (v, f, p) => {
    f.items = (Array.isArray(v) ? v : []).map((d, i) => {
      const it = {};
      const onde = 'item ' + (d && d.nItem ? d.nItem : i + 1);
      copiar(d, onde, {
        nItem: 'numero_item',
        prod: (x, s, pr) => copiar(x, onde, M_PROD, s, pr),
        imposto: (x, s, pr) => copiar(x, onde, M_IMPOSTO, s, pr),
        infAdProd: 'informacoes_adicionais_item',
      }, it, p);
      return it;
    });
  },
  total: (v, f, p) => copiar(v, 'totais', {
    ICMSTot: (x, s, pr) => copiar(x, 'totais', M_TOT, s, pr),
    IBSCBSTot: SEM('totais de IBS e CBS (reforma tributária)'),
  }, f, p),
  transp: (v, f, p) => copiar(v, 'transporte', { modFrete: 'modalidade_frete' }, f, p),
  cobr: SEM('fatura e duplicatas (venda a prazo com parcelas)'),
  pag: (v, f, p) => copiar(v, 'pagamento', {
    detPag: (lista) => {
      f.formas_pagamento = (Array.isArray(lista) ? lista : []).map((x, i) => { const o = {}; copiar(x, 'pagamento ' + (i + 1), M_DETPAG, o, p); return o; });
    },
    vTroco: ZERO('troco'),
  }, f, p),
  infAdic: (v, f, p) => copiar(v, 'informações adicionais', { infCpl: 'informacoes_adicionais_contribuinte', infAdFisco: 'informacoes_adicionais_fisco' }, f, p),
  infRespTec: SEM('responsável técnico pelo sistema (Configurações fiscais › Responsável técnico)'),
};

/** infNFe do programa → {focus: JSON da Focus NFe, problemas: [{campo, mensagem}]}. Com problemas, nada deve ser enviado. */
export function traduzirInfNFe(inf) {
  const problemas = [];
  if (!inf || typeof inf !== 'object' || Array.isArray(inf)) return { focus: null, problemas: [{ campo: 'nota', mensagem: 'os dados da nota não vieram no pedido' }] };
  const f = {};
  copiar(inf, 'nota', M_INF, f, problemas);
  if (!f.cnpj_emitente || digitos(f.cnpj_emitente).length !== 14) problemas.push({ campo: 'emitente (CNPJ)', mensagem: 'CNPJ do emitente ausente ou inválido' });
  if (vazio(f.numero) || vazio(f.serie)) problemas.push({ campo: 'identificação da nota (nNF, serie)', mensagem: 'número e série da nota são obrigatórios' });
  if (!Array.isArray(f.items) || !f.items.length) problemas.push({ campo: 'itens', mensagem: 'a nota não tem itens' });
  if (!Array.isArray(f.formas_pagamento) || !f.formas_pagamento.length) problemas.push({ campo: 'pagamento', mensagem: 'a nota não tem forma de pagamento' });
  return { focus: f, problemas };
}

/* =====================================================================
   Leitura do XML autorizado (o protocolo vem da SEFAZ, dentro do próprio XML)
   ===================================================================== */
const ent = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function bloco(xml, nome) {
  const m = new RegExp(`<(?:[A-Za-z0-9_]+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${nome}>`).exec(xml || '');
  return m ? m[1] : '';
}
const valorTag = (xml, nome) => { const v = bloco(xml, nome); return v ? ent(v.trim()) : null; };
const prot15 = (v) => (/^\d{15}$/.test(String(v || '')) ? String(v) : null);
const cstat = (v) => (/^\d{3}$/.test(String(v ?? '')) ? +v : null);

/** Protocolo de autorização (protNFe/infProt) e dados da nota de um nfeProc. */
export function lerProtocoloXml(xml) {
  const s = String(xml || ''), p = bloco(s, 'infProt'), nfe = bloco(s, 'infNFe') || s;
  const vnf = valorTag(bloco(nfe, 'ICMSTot'), 'vNF');
  return {
    nProt: prot15(valorTag(p, 'nProt')), cStat: cstat(valorTag(p, 'cStat')), xMotivo: valorTag(p, 'xMotivo'),
    dhRecbto: valorTag(p, 'dhRecbto'), digVal: valorTag(p, 'digVal'), chNFe: chave44(valorTag(p, 'chNFe')),
    dhEmi: valorTag(nfe, 'dhEmi'), vNF: vnf != null && /^\d+(\.\d+)?$/.test(vnf) ? Number(vnf) : null,
  };
}
/** Retorno de um evento (cancelamento): retEvento/infEvento. */
export function lerEventoXml(xml) {
  const s = String(xml || ''), r = bloco(s, 'retEvento'), e = bloco(r || s, 'infEvento');
  return { nProt: prot15(valorTag(e, 'nProt')), cStat: cstat(valorTag(e, 'cStat')), xMotivo: valorTag(e, 'xMotivo'), dhRegEvento: valorTag(e, 'dhRegEvento'), tpEvento: valorTag(e, 'tpEvento') };
}
/* protocolo_nota_fiscal vem sem tipo no SDK: só é usado se o valor tiver a forma certa (15 dígitos) */
function protocoloDoJson(p) {
  if (!p || typeof p !== 'object') return {};
  return { nProt: prot15(p.numero_protocolo ?? p.protocolo ?? p.nProt), cStat: cstat(p.status ?? p.cStat), dhRecbto: p.data_recebimento || p.dhRecbto || null, digVal: p.digest_value || p.digVal || null };
}

/** Resposta da Focus (+ dados do XML autorizado) → "documento" no formato que o programa já usa. */
export function documentoDaFocus(j, xml) {
  j = j || {}; const x = xml || {};
  const st = String(j.status || '');
  const codJ = inteiro(j.status_sefaz);
  const pj = protocoloDoJson(j.protocolo_nota_fiscal);
  const nProt = x.nProt || pj.nProt || null;
  const cStatProt = x.cStat ?? pj.cStat ?? null;
  let status, mensagem = null;
  if (st === 'autorizado') {
    /* regra do JB: autorizada só com o protocolo da SEFAZ */
    if (nProt && (cStatProt == null || cStatProt === 100 || cStatProt === 150)) status = 'autorizado';
    else { status = 'pendente'; mensagem = 'A Focus NFe informou a nota como autorizada, mas o protocolo da SEFAZ ainda não apareceu. Consulte de novo em instantes: só conta como autorizada com o protocolo.'; }
  } else if (st === 'processando_autorizacao') { status = 'pendente'; mensagem = 'A Focus NFe recebeu a nota e está aguardando a SEFAZ.'; }
  else if (st === 'erro_autorizacao') status = codJ ? 'rejeitado' : 'erro';
  else if (st === 'denegado') status = 'denegado';
  else if (st === 'cancelado') status = 'cancelado';
  else status = st || 'desconhecido';
  const comProt = ['autorizado', 'denegado', 'cancelado'].includes(status);
  return {
    id: vazio(j.ref) ? null : String(j.ref),
    chave: x.chNFe || chave44(j.chave_nfe),
    status,
    numero: vazio(j.numero) ? null : String(j.numero),
    serie: vazio(j.serie) ? null : String(j.serie),
    data_emissao: x.dhEmi || null,
    valor_total: x.vNF ?? null,
    autorizacao: {
      numero_protocolo: comProt ? nProt : null,
      codigo_status: status === 'autorizado' ? cStatProt ?? codJ : codJ ?? cStatProt,
      motivo_status: (status === 'autorizado' && x.xMotivo) || j.mensagem_sefaz || x.xMotivo || null,
      mensagem,
      data_recebimento: comProt ? x.dhRecbto || pj.dhRecbto || null : null,
      digest_value: comProt ? x.digVal || pj.digVal || null : null,
    },
    provedor: 'focusnfe',
    status_provedor: st || null,
  };
}
const docPendente = (ref, mensagem) => ({ id: ref, chave: null, status: 'pendente', numero: null, serie: null, data_emissao: null, valor_total: null,
  autorizacao: { numero_protocolo: null, codigo_status: null, motivo_status: null, mensagem, data_recebimento: null, digest_value: null }, provedor: 'focusnfe', status_provedor: null });

/* =====================================================================
   Serviço: recebe {acao, args} de alguém já identificado e devolve {status, corpo}
   opc: { fetch, env, banco, dormir?, esperas?, agora?, aviso? }
   banco: { reservar(amb, ref, sha256, uid) → {nova, situacao, idade_s}, marcar(amb, ref, situacao, detalhe),
            envio(amb, ref) → null | {situacao, idade_s}, registrar(registro), auditoria(limite) → [registros] }
   ===================================================================== */
export function criarServico(opc) {
  const buscar = opc.fetch;
  const env = opc.env || {};
  const banco = opc.banco;
  const dormir = opc.dormir || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const esperas = opc.esperas || ESPERAS_PADRAO;
  const agora = opc.agora || (() => Date.now());
  const aviso = opc.aviso || (() => {});

  const token = (amb) => String(env[VAR_TOKEN[amb]] || '').trim();
  const producaoLiberada = () => String(env.PRODUCAO_LIBERADA || '').trim().toLowerCase() === 'sim';
  const cnpjServico = () => { const c = digitos(env.CNPJ_EMITENTE); return c.length === 14 ? c : ''; };

  /* ---------- Focus NFe: um pedido ---------- */
  async function focus(amb, metodo, caminho, o = {}) {
    const tk = o.token || token(amb);
    const base = o.base || BASES[amb];
    const q = o.consulta ? '?' + new URLSearchParams(Object.entries(o.consulta).map(([k, v]) => [k, String(v)])).toString() : '';
    const h = { Accept: 'application/json', Authorization: 'Basic ' + btoa(tk + ':') };
    if (o.corpo !== undefined) h['Content-Type'] = 'application/json';
    let r;
    try { r = await buscar(base + caminho + q, { method: metodo, headers: h, body: o.corpo !== undefined ? JSON.stringify(o.corpo) : undefined, signal: sinal(TEMPO_FOCUS) }); }
    catch (e) { return { rede: true, status: 0, ok: false, falha: curto(e && e.message, 200) }; }
    let texto = '';
    try { texto = await r.text(); } catch { texto = ''; }
    let json = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }
    return { status: r.status, ok: r.ok, json, texto };
  }
  /* arquivos (XML, DANFE) pelos caminhos que a consulta devolve. O token só vai para o próprio endereço da Focus. */
  async function arquivo(amb, caminho) {
    const base = BASES[amb];
    let url, comToken = false;
    if (typeof caminho !== 'string' || !caminho) return { ok: false, status: 0, invalido: true };
    if (caminho.startsWith('/') && !caminho.startsWith('//')) { url = base + caminho; comToken = true; }
    else if (/^https:\/\//i.test(caminho)) {
      try { comToken = new URL(caminho).host === new URL(base).host; } catch { return { ok: false, status: 0, invalido: true }; }
      url = caminho;
    } else return { ok: false, status: 0, invalido: true };
    const h = { Accept: '*/*' };
    if (comToken) h.Authorization = 'Basic ' + btoa(token(amb) + ':');
    try {
      const r = await buscar(url, { method: 'GET', headers: h, signal: sinal(TEMPO_FOCUS) });
      if (!r.ok) return { ok: false, status: r.status };
      return { ok: true, status: r.status, bytes: semBom(new Uint8Array(await r.arrayBuffer())), tipo: r.headers.get('content-type') || '' };
    } catch { return { ok: false, rede: true, status: 0 }; }
  }

  function erroDaFocus(r, amb, escrita) {
    if (r.rede || r.status >= 500) {
      return escrita
        ? falha(504, 'sem_confirmacao', 'A Focus NFe não confirmou o pedido. Ele pode ter chegado: consulte a situação antes de qualquer novo pedido.', { retryable: false })
        : falha(503, 'indisponivel', 'A Focus NFe não respondeu agora. Nada foi enviado. Tente de novo em instantes.', { retryable: true });
    }
    const j = r.json && typeof r.json === 'object' ? r.json : {};
    const msgF = curto(j.mensagem, 300);
    if (r.status === 401 || r.status === 403) {
      return falha(502, 'autenticacao', `A Focus NFe recusou o acesso em ${NOME_AMB[amb]}${msgF ? ' (' + msgF + ')' : ''}. Confira o token ${VAR_TOKEN[amb]} nos segredos do Supabase e se a empresa está habilitada para NF-e na Focus NFe. Nada foi enviado.`, { retryable: false });
    }
    if (r.status === 404) return falha(404, 'nao_encontrado', 'A Focus NFe não encontrou este documento' + (msgF ? ' (' + msgF + ')' : '') + '.', { retryable: false });
    if (r.status === 429) return falha(503, 'indisponivel', 'Muitos pedidos seguidos à Focus NFe. Espere um minuto e tente de novo. Nada foi enviado.', { retryable: true });
    if (r.status >= 400 && r.status < 500) {
      const problemas = (Array.isArray(j.erros) ? j.erros : []).map((e) => ({ campo: curto(e && e.campo, 80) || 'Focus NFe', mensagem: curto(e && e.mensagem, 300) })).filter((p) => p.mensagem);
      return falha(422, 'validacao', 'A Focus NFe recusou o pedido' + (msgF ? ': ' + msgF : '') + '. Nada foi transmitido à SEFAZ.', { problemas, retryable: false });
    }
    return falha(502, 'interno', `A Focus NFe respondeu de um jeito inesperado (código ${r.status}).`, { retryable: false });
  }

  /* ---------- conferências comuns ---------- */
  function ambienteDe(a, tipoErro = 'pedido') {
    const amb = a.ambiente;
    if (amb !== 'homologacao' && amb !== 'producao') throw falha(400, tipoErro, 'Ambiente fiscal inválido (use homologação ou produção). Nada foi enviado.');
    if (amb === 'producao' && !producaoLiberada()) {
      throw falha(503, 'configuracao', 'A produção está bloqueada no servidor: o segredo PRODUCAO_LIBERADA não está como "sim" nas funções do Supabase. Até lá, só homologação (teste, sem valor fiscal). Nada foi enviado.', { retryable: false });
    }
    if (!token(amb)) throw falha(503, 'configuracao', `Falta o token da Focus NFe de ${NOME_AMB[amb]}: guarde ${VAR_TOKEN[amb]} nos segredos das funções do Supabase. Nada foi enviado.`, { retryable: false });
    return amb;
  }
  function refDe(a, tipoErro = 'pedido') {
    const ref = String(a.id || a.referencia || '');
    if (!REF.test(ref)) throw falha(400, tipoErro, 'Referência da nota inválida. Nada foi enviado.');
    return ref;
  }
  function conferirPermissao(acao, quem) {
    if (!quem || typeof quem !== 'object') throw falha(401, 'autenticacao', 'Entre no sistema de novo para usar o Setor Fiscal.');
    const papel = String(quem.papel || '');
    if (!(PAPEIS_ACAO[acao] || []).includes(papel)) {
      throw falha(403, 'permissao', `Seu perfil (${NOME_PAPEL[papel] || papel || 'sem perfil'}) não pode ${O_QUE[acao] || acao} no Setor Fiscal.`, { retryable: false });
    }
    if (COM_LISTA.has(acao) && papel !== 'admin') {
      const l = Array.isArray(quem.autorizados) ? quem.autorizados.map(String) : [];
      if (l.length && !l.includes(String(quem.uid || ''))) {
        throw falha(403, 'permissao', 'Só as pessoas marcadas em Configurações fiscais › "Quem pode emitir e cancelar" (e o administrador) podem fazer isso.', { retryable: false });
      }
    }
  }
  /* ambiente das consultas de cadastro (CEP, CNPJ): homologação quando houver token; produção só liberada */
  function ambienteConsulta() {
    if (token('homologacao')) return 'homologacao';
    if (producaoLiberada() && token('producao')) return 'producao';
    throw falha(503, 'configuracao', 'Falta o token da Focus NFe: guarde FOCUSNFE_TOKEN_HOMOLOGACAO nos segredos das funções do Supabase.', { retryable: false });
  }
  const marcar = async (amb, ref, situacao, detalhe) => { try { await banco.marcar(amb, ref, situacao, detalhe ? curto(detalhe, 500) : null); } catch (e) { aviso('jb-fiscal: situação do envio não gravada', e); } };

  async function consultaCompleta(amb, ref) { return focus(amb, 'GET', caminhoNfe(ref), { consulta: { completa: 1 } }); }
  /* documento + protocolo do XML (para "autorizado") */
  async function documentoCompleto(amb, j, ref) {
    j = { ...(j || {}) };
    if (vazio(j.ref) && ref) j.ref = ref;
    let x = null;
    if (j.status === 'autorizado') {
      let caminho = j.caminho_xml_nota_fiscal;
      if (!caminho) { const c = await consultaCompleta(amb, j.ref); if (c.ok && c.json) { j = { ...j, ...c.json }; caminho = j.caminho_xml_nota_fiscal; } }
      if (caminho) { const a = await arquivo(amb, caminho); if (a.ok) x = lerProtocoloXml(new TextDecoder('utf-8').decode(a.bytes)); }
    }
    return documentoDaFocus(j, x);
  }
  async function eventoCancelamento(amb, j, ref) {
    let x = {};
    if (j.caminho_xml_cancelamento) { const a = await arquivo(amb, j.caminho_xml_cancelamento); if (a.ok) x = lerEventoXml(new TextDecoder('utf-8').decode(a.bytes)); }
    return { id: ref, status: 'registrado', codigo_status: x.cStat ?? inteiro(j.status_sefaz), motivo_status: x.xMotivo || j.mensagem_sefaz || 'Cancelamento registrado na SEFAZ',
      numero_protocolo: x.nProt || null, data_registro: x.dhRegEvento || null };
  }
  async function exigirDocumento(amb, ref) {
    const c = await consultaCompleta(amb, ref);
    if (c.ok && c.json) return c.json;
    if (c.status === 404) throw falha(404, 'nao_encontrado', 'A Focus NFe não tem esta nota.', { retryable: false });
    throw erroDaFocus(c, amb, false);
  }

  /* ---------- ações ---------- */
  const ACAO = {
    async status_servico(a, quem, aud) {
      const amb = a.ambiente === 'producao' ? 'producao' : 'homologacao';
      aud.ambiente = amb;
      const tk = token(amb), cnpj = cnpjServico() || null, liberada = producaoLiberada();
      const r = {
        servico: 'JB Fiscal', versao: VERSAO, provedor: PROVEDOR, api: 'v2', ambiente: amb,
        voce: { nome: curto(quem.nome || quem.uid, 120), papel: NOME_PAPEL[quem.papel] || String(quem.papel || '') },
        cnpj_emitente: cnpj, credenciais_configuradas: !!tk, producao_liberada: liberada,
      };
      const nao = (m) => ({ ok: false, erro: { mensagem: m } });
      const sefaz = { ok: null, erro: { mensagem: 'Não é consultada por esta ligação: a Focus NFe informa a situação da SEFAZ na própria emissão.' } };
      if (amb === 'producao' && !liberada) {
        const m = 'Produção bloqueada no servidor (PRODUCAO_LIBERADA não está como "sim"): nada é consultado em produção.';
        return { ...r, empresa: nao(m), certificado: nao(m), config_nfe: nao(m), sefaz };
      }
      if (!tk) { const m = `Falta o token ${VAR_TOKEN[amb]} nos segredos das funções do Supabase.`; return { ...r, empresa: nao(m), certificado: nao(m), config_nfe: nao(m), sefaz }; }
      /* 1) o token é aceito? consulta uma referência que não existe (não cria nada) */
      const t = await focus(amb, 'GET', caminhoNfe('jb-verificacao-' + agora().toString(36)));
      const ligacao = t.status === 404 ? { ok: true }
        : t.rede || t.status >= 500 ? nao('A Focus NFe não respondeu agora.')
          : t.status === 401 || t.status === 403 ? nao(`A Focus NFe recusou o token ${VAR_TOKEN[amb]}.`)
            : t.ok ? { ok: true } : nao(`A Focus NFe respondeu com o código ${t.status}.`);
      /* 2) cadastro da empresa na Focus (certificado A1). Com FOCUSNFE_TOKEN_CONTA (opcional), usa o token da conta. */
      let empresa = nao('Guarde CNPJ_EMITENTE (só números) nos segredos do Supabase para ver o cadastro da empresa na Focus NFe.');
      let certificado = nao('O certificado aparece aqui quando o cadastro da empresa na Focus NFe puder ser lido.');
      let crt = null;
      if (cnpj && ligacao.ok) {
        const conta = String(env.FOCUSNFE_TOKEN_CONTA || '').trim();
        const e = await focus(amb, 'GET', '/v2/empresas', { consulta: { cnpj }, ...(conta ? { token: conta, base: BASES.producao } : {}) });
        const lista = e.ok ? (Array.isArray(e.json) ? e.json : e.json && typeof e.json === 'object' ? [e.json] : []) : [];
        const emp = lista.find((x) => x && digitos(x.cnpj) === cnpj) || null;
        if (emp) {
          crt = emp.regime_tributario ?? null;
          empresa = { ok: true, dados: { nome_razao_social: emp.nome || '', nome_fantasia: emp.nome_fantasia || '', inscricao_estadual: emp.inscricao_estadual || '', regime_tributario: crt, habilita_nfe: emp.habilita_nfe ?? null } };
          certificado = emp.certificado_valido_ate
            ? { ok: true, dados: { not_valid_after: String(emp.certificado_valido_ate), not_valid_before: emp.certificado_valido_de ? String(emp.certificado_valido_de) : null,
              subject_name: [emp.nome, emp.certificado_cnpj ? 'CNPJ ' + fmtCnpj(emp.certificado_cnpj) : ''].filter(Boolean).join(' · ') } }
            : nao('A Focus NFe não informou certificado A1 para esta empresa. Envie o certificado no painel da Focus NFe.');
        } else if (e.ok) {
          empresa = nao(`A Focus NFe não tem a empresa ${fmtCnpj(cnpj)} no cadastro desta conta.`);
        } else if (e.status === 401 || e.status === 403) {
          const m = 'O token não dá acesso ao cadastro da empresa na Focus NFe (essa consulta pode exigir o token principal da conta, FOCUSNFE_TOKEN_CONTA). Confira o certificado no painel da Focus NFe.';
          empresa = nao(m); certificado = nao(m);
        } else {
          empresa = nao('A Focus NFe não mostrou o cadastro da empresa agora' + (e.status ? ` (código ${e.status})` : '') + '.');
        }
      }
      const config_nfe = ligacao.ok ? { ok: true, dados: { CRT: crt ?? '—', ambiente: NOME_AMB[amb] } } : ligacao;
      return { ...r, empresa, certificado, config_nfe, sefaz };
    },

    async emitir_nfe(a, quem, aud) {
      const amb = ambienteDe(a, 'validacao');
      aud.ambiente = amb;
      const ref = String(a.referencia || '');
      aud.referencia = ref || null;
      if (!REF.test(ref)) throw falha(422, 'validacao', 'Referência do envio inválida. Nada foi transmitido.', { retryable: false });
      const { focus: nf, problemas } = traduzirInfNFe(a.infNFe);
      if (problemas.length) throw falha(422, 'validacao', 'A nota usa dados que a ligação com a Focus NFe ainda não sabe enviar. Nada foi transmitido.', { problemas, retryable: false });
      const cnpjCfg = cnpjServico();
      if (cnpjCfg && digitos(nf.cnpj_emitente) !== cnpjCfg) {
        throw falha(503, 'configuracao', `A nota é do CNPJ ${fmtCnpj(nf.cnpj_emitente)}, mas o serviço fiscal está configurado para ${fmtCnpj(cnpjCfg)} (CNPJ_EMITENTE). Nada foi enviado.`, { retryable: false });
      }
      const sha = await sha256Hex(JSON.stringify(nf));
      let reserva;
      try { reserva = await banco.reservar(amb, ref, sha, quem.uid || null); }
      catch (e) { aviso('jb-fiscal: reserva falhou', e); throw falha(503, 'indisponivel', 'O banco do servidor não confirmou a reserva do envio. Nada foi enviado. Tente de novo.', { retryable: true }); }
      if (!reserva || typeof reserva !== 'object') throw falha(503, 'indisponivel', 'O banco do servidor não confirmou a reserva do envio. Nada foi enviado. Tente de novo.', { retryable: true });

      /* 1) a Focus já tem esta referência? (reenvio, resposta perdida, outra aba) */
      const c = await consultaCompleta(amb, ref);
      if (c.ok && c.json) {
        await marcar(amb, ref, 'ja_existia');
        const doc = await documentoCompleto(amb, c.json, ref);
        aud.documento = doc.chave; aud.detalhe = 'referência já existia na Focus NFe · ' + doc.status;
        return { documento: doc, ja_existia: true };
      }
      if (c.status !== 404) throw erroDaFocus(c, amb, false);   // não deu para conferir: nada é enviado
      if (!reserva.nova) {
        throw falha(504, 'sem_confirmacao', 'Esta referência já foi usada num envio anterior e a Focus NFe não a encontrou agora. Para não enviar duas vezes, o serviço não reenvia a mesma referência: consulte a situação da nota.', { retryable: false });
      }

      /* 2) envio, uma vez só */
      await marcar(amb, ref, 'enviando');
      const p = await focus(amb, 'POST', '/v2/nfe', { consulta: { ref }, corpo: nf });
      if (!p.ok) {
        const f = erroDaFocus(p, amb, true);
        await marcar(amb, ref, f.tipo === 'sem_confirmacao' ? 'sem_confirmacao' : 'recusada', f.message);
        throw f;
      }
      await marcar(amb, ref, 'enviada');

      /* 3) acompanha o processamento por alguns segundos (a Focus é assíncrona) */
      let j = p.json && typeof p.json === 'object' ? p.json : { status: 'processando_autorizacao' };
      for (const ms of esperas) {
        if (j.status !== 'processando_autorizacao') break;
        await dormir(ms);
        const q = await consultaCompleta(amb, ref);
        if (q.ok && q.json) j = q.json; else break;   // sem consulta agora: fica pendente; o programa consulta depois
      }
      const doc = await documentoCompleto(amb, j, ref);
      aud.documento = doc.chave; aud.detalhe = 'enviada · ' + doc.status + (doc.autorizacao.numero_protocolo ? ' · protocolo ' + doc.autorizacao.numero_protocolo : '');
      return { documento: doc, ja_existia: false };
    },

    async consultar_nfe(a, quem, aud) {
      const amb = ambienteDe(a); aud.ambiente = amb;
      const ref = refDe(a); aud.referencia = ref;
      const c = await consultaCompleta(amb, ref);
      if (c.ok && c.json) { const doc = await documentoCompleto(amb, c.json, ref); aud.documento = doc.chave; aud.detalhe = doc.status; return { encontrado: true, documento: doc }; }
      if (c.status !== 404) throw erroDaFocus(c, amb, false);
      /* a Focus não tem: confere se um envio desta referência ainda está em andamento aqui */
      let ev;
      try { ev = await banco.envio(amb, ref); }
      catch (e) { aviso('jb-fiscal: envio não conferido', e); throw falha(503, 'indisponivel', 'O banco do servidor não respondeu para conferir o envio desta nota. Tente de novo em instantes.', { retryable: true }); }
      if (ev && (['enviada', 'ja_existia'].includes(ev.situacao) || (['reservada', 'enviando', 'sem_confirmacao'].includes(ev.situacao) && +ev.idade_s < EM_ANDAMENTO_S))) {
        aud.detalhe = 'envio em andamento (' + ev.situacao + ')';
        return { encontrado: true, documento: docPendente(ref, ev.situacao === 'enviada' || ev.situacao === 'ja_existia'
          ? 'A Focus NFe aceitou esta nota, mas não a encontrou agora. Consulte de novo em alguns minutos antes de qualquer reenvio.'
          : 'O envio desta nota ainda está em andamento no servidor. Consulte de novo em instantes.') };
      }
      aud.detalhe = 'não encontrada';
      return { encontrado: false };
    },

    async baixar_xml_nfe(a, quem, aud) {
      const amb = ambienteDe(a); aud.ambiente = amb;
      const ref = refDe(a); aud.referencia = ref;
      const tipo = a.tipo === 'cancelamento' ? 'cancelamento' : 'nfe';
      const j = await exigirDocumento(amb, ref);
      const caminho = tipo === 'cancelamento' ? j.caminho_xml_cancelamento : j.caminho_xml_nota_fiscal;
      if (!caminho) throw falha(404, 'nao_encontrado', tipo === 'cancelamento' ? 'O XML do cancelamento ainda não está disponível na Focus NFe.' : 'O XML ainda não está disponível na Focus NFe (a nota precisa estar autorizada).', { retryable: false });
      const arq = await arquivo(amb, caminho);
      if (!arq.ok) throw arq.rede || arq.status >= 500 ? falha(503, 'indisponivel', 'A Focus NFe não entregou o XML agora. Tente de novo em instantes.', { retryable: true }) : falha(502, 'interno', `A Focus NFe não entregou o XML (código ${arq.status || '—'}).`, { retryable: false });
      const ini = new TextDecoder('utf-8').decode(arq.bytes.subarray(0, 2000));
      if (!/^\s*(<\?xml|<)/.test(ini) || !/<(?:[A-Za-z0-9_]+:)?(nfeProc|NFe|procEventoNFe|retEnvEvento|retEvento|evento)\b/.test(ini)) throw falha(502, 'interno', 'A Focus NFe devolveu um arquivo que não é o XML da nota.', { retryable: false });
      aud.documento = chave44(j.chave_nfe); aud.detalhe = 'XML ' + tipo + ' · ' + arq.bytes.length + ' bytes';
      return { tipo, conteudo_base64: base64DeBytes(arq.bytes), sha256: await sha256Hex(arq.bytes), tamanho: arq.bytes.length, chave: chave44(j.chave_nfe) };
    },

    async baixar_danfe(a, quem, aud) {
      const amb = ambienteDe(a); aud.ambiente = amb;
      const ref = refDe(a); aud.referencia = ref;
      const j = await exigirDocumento(amb, ref);
      if (!j.caminho_danfe) throw falha(404, 'nao_encontrado', 'O DANFE ainda não está disponível na Focus NFe (a nota precisa estar autorizada).', { retryable: false });
      const arq = await arquivo(amb, j.caminho_danfe);
      if (!arq.ok) throw arq.rede || arq.status >= 500 ? falha(503, 'indisponivel', 'A Focus NFe não entregou o DANFE agora. Tente de novo em instantes.', { retryable: true }) : falha(502, 'interno', `A Focus NFe não entregou o DANFE (código ${arq.status || '—'}).`, { retryable: false });
      const b = arq.bytes;
      if (!(b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)) throw falha(502, 'interno', 'A Focus NFe devolveu um arquivo que não é PDF.', { retryable: false });
      aud.documento = chave44(j.chave_nfe); aud.detalhe = 'DANFE · ' + b.length + ' bytes';
      return { conteudo_base64: base64DeBytes(b), sha256: await sha256Hex(b), tamanho: b.length, tipo: 'application/pdf' };
    },

    async cancelar_nfe(a, quem, aud) {
      const amb = ambienteDe(a); aud.ambiente = amb;
      const ref = refDe(a); aud.referencia = ref;
      const just = curto(a.justificativa, 255);
      if (just.length < 15) throw falha(400, 'pedido', 'A justificativa do cancelamento precisa ter de 15 a 255 caracteres. Nada foi enviado.', { retryable: false });
      const j = await exigirDocumento(amb, ref);
      aud.documento = chave44(j.chave_nfe);
      /* já cancelada: não pede de novo */
      if (j.status === 'cancelado') { const ev = await eventoCancelamento(amb, j, ref); aud.detalhe = 'já estava cancelada'; return { evento: ev, ja_existia: true }; }
      if (j.status !== 'autorizado') throw falha(422, 'validacao', `Só nota autorizada pode ser cancelada (situação na Focus NFe: ${j.status || 'desconhecida'}). Nada foi enviado.`, { retryable: false });
      const d = await focus(amb, 'DELETE', caminhoNfe(ref), { corpo: { justificativa: just } });
      if (!d.ok) throw erroDaFocus(d, amb, true);
      const r = d.json && typeof d.json === 'object' ? d.json : {};
      aud.detalhe = 'cancelamento: ' + (r.status || '—');
      if (r.status === 'cancelado') return { evento: await eventoCancelamento(amb, { ...j, ...r }, ref) };
      if (r.status === 'erro_cancelamento') return { evento: { id: ref, status: 'rejeitado', codigo_status: inteiro(r.status_sefaz), motivo_status: r.mensagem_sefaz || null, numero_protocolo: null } };
      return { evento: { id: ref, status: 'pendente', codigo_status: inteiro(r.status_sefaz), motivo_status: r.mensagem_sefaz || 'A Focus NFe ainda não confirmou o cancelamento.', numero_protocolo: null } };
    },

    async consultar_cancelamento(a, quem, aud) {
      const amb = ambienteDe(a); aud.ambiente = amb;
      const ref = refDe(a); aud.referencia = ref;
      const j = await exigirDocumento(amb, ref);
      aud.documento = chave44(j.chave_nfe); aud.detalhe = j.status || '—';
      if (j.status === 'cancelado') return { evento: await eventoCancelamento(amb, j, ref) };
      return { evento: null, situacao: j.status || null };
    },

    async inutilizar_numeracao(a, quem, aud) {
      const amb = ambienteDe(a); aud.ambiente = amb;
      const cnpj = cnpjServico();
      if (!cnpj) throw falha(503, 'configuracao', 'Para inutilizar números, o servidor precisa saber o CNPJ da empresa: guarde CNPJ_EMITENTE (só os 14 números) nos segredos das funções do Supabase. Nada foi enviado.', { retryable: false });
      const serie = inteiro(a.serie), ni = inteiro(a.numero_inicial), nfim = inteiro(a.numero_final);
      if (serie == null || serie < 0 || serie > 999 || ni == null || nfim == null || ni < 1 || nfim < ni || nfim - ni > 9999) throw falha(400, 'pedido', 'Série ou faixa de números inválida. Nada foi enviado.', { retryable: false });
      const just = curto(a.justificativa, 255);
      if (just.length < 15) throw falha(400, 'pedido', 'A justificativa precisa ter de 15 a 255 caracteres. Nada foi enviado.', { retryable: false });
      aud.referencia = `inutilizacao-s${serie}-${ni}-${nfim}`;
      const sucesso = (x) => (x.status === 'autorizado' || inteiro(x.status_sefaz) === 102) && !!x.protocolo_sefaz;
      const evento = (x) => ({
        status: sucesso(x) ? 'registrado' : x.status === 'erro_autorizacao' || (inteiro(x.status_sefaz) != null && inteiro(x.status_sefaz) !== 102) ? 'rejeitado' : 'pendente',
        codigo_status: inteiro(x.status_sefaz), motivo_status: x.mensagem_sefaz || null, numero_protocolo: x.protocolo_sefaz || null,
        serie: x.serie ?? serie, numero_inicial: x.numero_inicial ?? ni, numero_final: x.numero_final ?? nfim,
      });
      /* a faixa já foi inutilizada? (só consulta) */
      const l = await focus(amb, 'GET', '/v2/nfe/inutilizacoes', { consulta: { cnpj, numero_inicial: ni, numero_final: nfim } });
      if (l.ok) {
        const ja = (Array.isArray(l.json) ? l.json : []).find((x) => x && inteiro(x.serie) === serie && inteiro(x.numero_inicial) === ni && inteiro(x.numero_final) === nfim && sucesso(x));
        if (ja) { aud.detalhe = 'faixa já inutilizada'; return { evento: evento(ja), ja_existia: true }; }
      } else if (l.status !== 404) throw erroDaFocus(l, amb, false);
      const p = await focus(amb, 'POST', '/v2/nfe/inutilizacao', { corpo: { cnpj, serie, numero_inicial: ni, numero_final: nfim, justificativa: just } });
      if (!p.ok) throw erroDaFocus(p, amb, true);
      const ev = evento(p.json && typeof p.json === 'object' ? p.json : {});
      aud.detalhe = 'inutilização: ' + ev.status + (ev.numero_protocolo ? ' · protocolo ' + ev.numero_protocolo : '');
      return { evento: ev };
    },

    async consultar_cep(a, quem, aud) {
      const cep = digitos(a.cep);
      if (cep.length !== 8) throw falha(400, 'pedido', 'Digite o CEP com 8 números.', { retryable: false });
      const amb = ambienteConsulta(); aud.ambiente = amb; aud.detalhe = 'CEP ' + cep;
      const r = await focus(amb, 'GET', '/v2/ceps/' + cep);
      if (r.status === 404) throw falha(404, 'nao_encontrado', 'CEP não encontrado na base da Focus NFe. Confira o número.', { retryable: false });
      if (!r.ok || !r.json) throw erroDaFocus(r, amb, false);
      const c = r.json;
      return { endereco: { cep: digitos(c.cep) || cep, tipo_logradouro: c.tipo_logradouro || '', logradouro: c.nome_logradouro || '', bairro: c.nome_bairro_inicial || '',
        municipio: c.nome_localidade || '', uf: c.uf || '', codigo_ibge: vazio(c.codigo_ibge) ? '' : String(c.codigo_ibge) } };
    },

    async consultar_cnpj(a, quem, aud) {
      const cnpj = digitos(a.cnpj);
      if (cnpj.length !== 14) throw falha(400, 'pedido', 'Digite o CNPJ com 14 números.', { retryable: false });
      const amb = ambienteConsulta(); aud.ambiente = amb; aud.detalhe = 'CNPJ ' + fmtCnpj(cnpj);
      const r = await focus(amb, 'GET', '/v2/cnpjs/' + cnpj);
      if (r.status === 404) throw falha(404, 'nao_encontrado', 'CNPJ não encontrado na consulta da Focus NFe.', { retryable: false });
      if (!r.ok || !r.json) throw erroDaFocus(r, amb, false);
      const x = r.json, e = x.endereco || {};
      return { empresa: { cnpj: digitos(x.cnpj) || cnpj, razao_social: x.razao_social || '', situacao_cadastral: x.situacao_cadastral || '',
        optante_simples_nacional: x.optante_simples_nacional ?? null, optante_mei: x.optante_mei ?? null,
        endereco: { cep: digitos(e.cep), logradouro: e.logradouro || '', numero: e.numero || '', complemento: e.complemento || '', bairro: e.bairro || '', uf: e.uf || '',
          municipio: { descricao: e.nome_municipio || '', codigo_ibge: vazio(e.codigo_ibge) ? '' : String(e.codigo_ibge) } } } };
    },

    async auditoria(a) {
      const limite = Math.min(500, Math.max(1, inteiro(a.limite) || 100));
      let regs;
      try { regs = await banco.auditoria(limite); }
      catch (e) { aviso('jb-fiscal: auditoria não lida', e); throw falha(503, 'indisponivel', 'O banco do servidor não entregou a auditoria agora. Tente de novo.', { retryable: true }); }
      return { registros: (Array.isArray(regs) ? regs : []).map((x) => ({ em: x.em, quem: x.quem || x.nome || x.uid_app || '—', papel: x.papel || '', operacao: x.operacao || x.acao || '',
        ambiente: x.ambiente || '', resultado: x.resultado || '', referencia: x.referencia || '', documento: x.documento || '', detalhe: x.detalhe || '', origem: x.origem || '' })) };
    },
  };

  async function executar(acao, args, quem) {
    const t0 = agora();
    const a = args && typeof args === 'object' && !Array.isArray(args) ? args : {};
    const aud = { ambiente: null, referencia: null, documento: null, detalhe: null };
    let res, resultado;
    try {
      if (!ACOES.includes(acao)) throw falha(400, 'pedido', 'Ação fiscal desconhecida.', { retryable: false });
      conferirPermissao(acao, quem);
      res = { status: 200, corpo: await ACAO[acao](a, quem, aud) };
      resultado = 'ok';
    } catch (e) {
      const f = e instanceof FalhaFiscal ? e : falha(500, 'interno', 'Falha inesperada no serviço fiscal. Se era uma emissão, consulte a nota antes de reenviar.', { retryable: false });
      if (!(e instanceof FalhaFiscal)) aviso('jb-fiscal: falha inesperada', e);
      res = { status: f.status, corpo: corpoDeErro(f) };
      resultado = f.tipo;
      aud.detalhe = curto(f.message, 300);
    }
    try {
      await banco.registrar({
        origem: quem && quem.origem === 'claude' ? 'claude' : 'nuvem', uid_app: (quem && quem.uid) || null, nome: (quem && quem.nome) || null, papel: (quem && quem.papel) || null,
        acao: ACOES.includes(acao) ? acao : String(acao || '?').slice(0, 40), ambiente: aud.ambiente, referencia: aud.referencia, documento: aud.documento,
        resultado, detalhe: aud.detalhe ? curto(aud.detalhe, 500) : null, duracao_ms: Math.max(0, Math.round(agora() - t0)),
      });
    } catch (e) { aviso('jb-fiscal: auditoria não registrada', e); }
    return res;
  }

  return { executar };
}
