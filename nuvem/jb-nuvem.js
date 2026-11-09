/* =====================================================================
   JB Gestão · ponte com o servidor próprio (Supabase)
   Entrega ao sistema o mesmo "banco" que ele usava dentro do Claude
   (window.claude.use('db'), 'user'...), mas tudo passa pelo login do JB
   e pelas permissões conferidas no servidor. Telas, dados e cálculos do
   sistema não mudam. Nenhuma senha, chave secreta ou token fica gravado
   em localStorage: a sessão fica só na memória desta aba.
   ===================================================================== */
(function () {
  'use strict';
  var CFG = window.JB_NUVEM || {};
  var SB_URL = CFG.url, SB_CHAVE = CFG.chavePublica;
  var AUTH = SB_URL + '/functions/v1/jb-auth/';
  window.__SPOT_TESTE__ = true; // a guarda de versões do Claude não se aplica fora dele

  var sb = null, sessao = null, eu = null, prontoRes, pronto = new Promise(function (r) { prontoRes = r; });
  var cache = new Map();            // "colecao/id" -> {colecao, id, dados}
  var ouvintes = new Set();         // {tipo:'doc'|'col', colecao, id, filtros, cb, erro}
  var ultimaAtividade = Date.now();

  /* ---------------- utilidades ---------------- */
  function erro(code, message) { var e = new Error(message || code); e.code = code; return e; }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function separar(caminho) {
    var p = String(caminho || '').split('/').filter(Boolean);
    if (p.length < 2 || p.length % 2) throw erro('invalid_argument', 'caminho inválido: ' + caminho);
    return { colecao: p.slice(0, -1).join('/'), id: p[p.length - 1] };
  }
  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function mesclar(a, b) {
    var o = Object.assign({}, a || {});
    Object.keys(b || {}).forEach(function (k) {
      var v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = mesclar(o[k], v);
      else o[k] = v;
    });
    return o;
  }
  function traduzErro(e) {
    if (!e) return erro('unknown');
    var c = e.code || '', m = e.message || '';
    if (c === '42501') return erro('permission_denied', 'Seu acesso não permite esta operação.');
    if (c === '28000' || c === 'PGRST301' || /JWT/i.test(m)) { sessaoEncerrada(); return erro('revoked', 'Sua sessão foi encerrada.'); }
    if (c === 'P0002' || c === '22023') return erro('invalid_argument', m);
    if (c === '54000') return erro('invalid_argument', 'Documento grande demais.');
    if (/Failed to fetch|NetworkError|network/i.test(m)) return erro('unavailable', 'Sem conexão com o servidor.');
    return erro(c || 'unknown', m);
  }

  /* ---------------- cache e ouvintes ---------------- */
  function snapDoc(colecao, id) {
    var r = cache.get(colecao + '/' + id);
    return { id: id, exists: !!r, data: function () { return r ? clone(r.dados) : undefined; }, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function passa(dados, filtros) {
    return filtros.every(function (f) {
      var x = dados ? dados[f[0]] : undefined, op = f[1], v = f[2];
      return op === '>=' ? x >= v : op === '<' ? x < v : op === '<=' ? x <= v : op === '>' ? x > v : op === '!=' ? x !== v : x === v;
    });
  }
  function snapCol(colecao, filtros) {
    var ds = [];
    cache.forEach(function (r) { if (r.colecao === colecao && passa(r.dados, filtros)) ds.push(r); });
    ds.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
    var docs = ds.map(function (r) { return snapDoc(r.colecao, r.id); });
    return { docs: docs, size: docs.length, empty: !docs.length, metadata: { fromCache: false, hasPendingWrites: false } };
  }
  function avisar(colecao, id) {
    ouvintes.forEach(function (o) {
      if (o.colecao !== colecao) return;
      if (o.tipo === 'doc' && id !== undefined && o.id !== id) return;
      setTimeout(function () { try { o.cb(o.tipo === 'doc' ? snapDoc(o.colecao, o.id) : snapCol(o.colecao, o.filtros)); } catch (e) { console.warn(e); } }, 0);
    });
  }
  function avisarTodos() {
    var cols = new Set(); ouvintes.forEach(function (o) { cols.add(o.colecao); });
    cols.forEach(function (c) { avisar(c); });
  }
  function guardar(colecao, id, dados) {
    if (dados === null || dados === undefined) cache.delete(colecao + '/' + id);
    else cache.set(colecao + '/' + id, { colecao: colecao, id: id, dados: dados });
  }
  async function carregarTudo() {
    var novo = new Map(), de = 0, passo = 1000;
    for (;;) {
      var r = await sb.from('docs').select('colecao,id,dados').order('colecao').order('id').range(de, de + passo - 1);
      if (r.error) throw traduzErro(r.error);
      r.data.forEach(function (x) { novo.set(x.colecao + '/' + x.id, x); });
      if (r.data.length < passo) break;
      de += passo;
    }
    /* devolve as coleções que mudaram, para redesenhar só elas */
    var mudaram = new Set(), velho = cache;
    novo.forEach(function (r, k) { var a = velho.get(k); if (!a || JSON.stringify(a.dados) !== JSON.stringify(r.dados)) mudaram.add(r.colecao); });
    velho.forEach(function (r, k) { if (!novo.has(k)) mudaram.add(r.colecao); });
    cache = novo;
    return mudaram;
  }
  async function recarregarDoc(colecao, id) {
    var r = await sb.from('docs').select('colecao,id,dados').eq('colecao', colecao).eq('id', id).maybeSingle();
    if (r.error) throw traduzErro(r.error);
    guardar(colecao, id, r.data ? r.data.dados : null);
    avisar(colecao, id);
  }

  /* ---------------- banco no formato que o sistema já usa ---------------- */
  var gravando = 0;                 // gravações ainda sem resposta do servidor (o aviso de versão nova pergunta antes de recarregar)
  async function rpcGravar(nome, args) { gravando++; try { return await sb.rpc(nome, args); } finally { gravando--; } }
  function refDoc(caminho) {
    var p = separar(caminho);
    return {
      id: p.id, path: caminho,
      get: async function () { await pronto; return snapDoc(p.colecao, p.id); },
      set: async function (d) {
        await pronto; atividade();
        var r = await rpcGravar('jb_gravar', { p_colecao: p.colecao, p_id: p.id, p_dados: clone(d) });
        if (r.error) throw traduzErro(r.error);
        guardar(p.colecao, p.id, clone(d)); avisar(p.colecao, p.id);
      },
      update: async function (d) {
        await pronto; atividade();
        var r = await rpcGravar('jb_atualizar', { p_colecao: p.colecao, p_id: p.id, p_campos: clone(d) });
        if (r.error) throw traduzErro(r.error);
        var ant = cache.get(p.colecao + '/' + p.id);
        guardar(p.colecao, p.id, mesclar(ant ? ant.dados : {}, clone(d))); avisar(p.colecao, p.id);
      },
      delete: async function () {
        await pronto; atividade();
        var r = await rpcGravar('jb_apagar', { p_colecao: p.colecao, p_id: p.id });
        if (r.error) throw traduzErro(r.error);
        guardar(p.colecao, p.id, null); avisar(p.colecao, p.id);
      },
      onSnapshot: function (cb, aoErro) {
        var o = { tipo: 'doc', colecao: p.colecao, id: p.id, filtros: [], cb: cb, erro: aoErro };
        ouvintes.add(o);
        pronto.then(function () { if (ouvintes.has(o)) cb(snapDoc(p.colecao, p.id)); });
        return function () { ouvintes.delete(o); };
      }
    };
  }
  function consulta(colecao, filtros) {
    return {
      path: colecao,
      where: function (f, op, v) { return consulta(colecao, filtros.concat([[f, op, v]])); },
      get: async function () { await pronto; return snapCol(colecao, filtros); },
      onSnapshot: function (cb, aoErro) {
        var o = { tipo: 'col', colecao: colecao, filtros: filtros, cb: cb, erro: aoErro };
        ouvintes.add(o);
        pronto.then(function () { if (ouvintes.has(o)) cb(snapCol(colecao, filtros)); });
        return function () { ouvintes.delete(o); };
      },
      doc: function (id) { return refDoc(colecao + '/' + (id || novoId())); }
    };
  }
  var db = Object.freeze({
    doc: refDoc,
    collection: function (c) { return consulta(String(c).replace(/^\/+|\/+$/g, ''), []); }
  });

  var nomes = {};
  var user = Object.freeze({
    me: async function () {
      await pronto;
      return { id: eu.uid, name: eu.nome, avatarUrl: '', isOwner: !!eu.admin,
        canEdit: !!eu.admin || !!(eu.permissoes.dp_sensivel && eu.permissoes.dp_sensivel.ler) };
    },
    id: async function () { await pronto; return eu.uid; },
    isOwner: function () { return !!(eu && eu.admin); },
    canEdit: function () { return !!(eu && eu.admin); },
    profiles: async function (ids) {
      await pronto;
      var falta = (ids || []).filter(function (i) { return !(i in nomes); });
      if (falta.length) {
        var r = await sb.rpc('jb_nomes', { p_uids: falta });
        if (!r.error && r.data) Object.keys(r.data).forEach(function (k) { nomes[k] = r.data[k]; });
        falta.forEach(function (i) { if (!(i in nomes)) nomes[i] = { name: '' }; });
      }
      var o = {}; (ids || []).forEach(function (i) { o[i] = nomes[i] || { name: '' }; }); return o;
    }
  });

  /* anexos: armazenamento privado; o sistema guarda só o código do arquivo */
  var assets = Object.freeze({
    upload: async function (arquivo) {
      await pronto; atividade();
      if (!arquivo || arquivo.size > 20 * 1024 * 1024) throw erro('too_large', 'Arquivo maior que 20 MB.');
      var b = new Uint8Array(16); crypto.getRandomValues(b);
      var id = Array.prototype.map.call(b, function (x) { return x.toString(16).padStart(2, '0'); }).join('');
      var r = await sb.storage.from('anexos').upload(id, arquivo, { contentType: arquivo.type || 'application/octet-stream', upsert: false });
      if (r.error) throw erro(/row-level|policy|403/i.test(r.error.message || '') ? 'permission_denied' : 'unavailable', r.error.message);
      return { id: id, url: '/_blob/' + id, sizeBytes: arquivo.size, contentType: arquivo.type || 'application/octet-stream' };
    },
    list: async function () { return { assets: [], usage: {} }; },
    delete: async function (id) { await pronto; var r = await sb.storage.from('anexos').remove([String(id)]); if (r.error) throw erro('permission_denied', r.error.message); }
  });

  /* leitura de documentos por IA (Lançamento Inteligente por Foto): a função do servidor confere a
     sessão e a permissão e chama a IA com a chave guardada no Supabase; o navegador nunca vê a chave */
  var LEITOR = SB_URL + '/functions/v1/jb-ler-documento';
  var leitor = Object.freeze({
    ler: async function (corpo, sinal) {
      await pronto; atividade();
      var r;
      try {
        r = await fetch(LEITOR, { method: 'POST', signal: sinal,
          headers: { 'Content-Type': 'application/json', apikey: SB_CHAVE, Authorization: 'Bearer ' + sessao.access_token },
          body: JSON.stringify(corpo || {}) });
      } catch (e) {
        if (sinal && sinal.aborted) throw erro('cancelado', '');
        throw erro('rede', 'Sem conexão com o servidor de leitura. Verifique a internet e tente de novo.');
      }
      var j = {}; try { j = await r.json(); } catch (e) {}
      if (!r.ok) throw erro(j.erro || 'erro', j.mensagem || ('O servidor de leitura respondeu com erro (' + r.status + ').'));
      return j;
    }
  });

  /* serviço fiscal (Setor Fiscal · NF-e pela Focus NFe): a função jb-fiscal do servidor confere a sessão e o
     perfil e fala com a Focus NFe com os tokens guardados no Supabase; o navegador nunca vê os tokens.
     Devolve a resposta do serviço (dados, ou {erro:{tipo, mensagem}}). Sem resposta reconhecível, o erro é
     "sem_resposta"/"rede": o pedido pode ter chegado, por isso o programa consulta antes de reenviar. */
  var FISCAL = SB_URL + '/functions/v1/jb-fiscal';
  async function fiscal(acao, args) {
    await pronto; atividade();
    var r;
    try {
      r = await fetch(FISCAL, { method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SB_CHAVE, Authorization: 'Bearer ' + sessao.access_token },
        body: JSON.stringify({ acao: String(acao || ''), args: args || {} }) });
    } catch (e) {
      throw erro('rede', 'Sem conexão com o servidor fiscal. Verifique a internet; se estava emitindo, consulte a nota antes de enviar de novo.');
    }
    var j = null; try { j = await r.json(); } catch (e) {}
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      if (r.ok) return j;
      if (j.erro && typeof j.erro === 'object' && j.erro.tipo) return j;   // recusa do próprio serviço fiscal
    }
    throw erro('sem_resposta', 'O servidor fiscal não respondeu direito (código ' + r.status + '). Se estava emitindo, consulte a nota antes de enviar de novo.');
  }

  window.claude = Object.freeze({
    use: async function (nome) {
      if (nome === 'db') { await pronto; return db; }
      if (nome === 'user') { await pronto; return user; }
      if (nome === 'assets') { await pronto; return assets; }
      if (nome === 'leitor') { await pronto; return leitor; }
      return null; // assistente, editor por IA e versões do Claude não existem fora dele (o serviço fiscal vem por JB_NUVEM_API.fiscal)
    }
  });

  /* ---------------- atividade, tempo de sessão e tempo real ---------------- */
  function atividade() { ultimaAtividade = Date.now(); }
  ['click', 'keydown', 'touchstart', 'scroll'].forEach(function (ev) { addEventListener(ev, atividade, { passive: true, capture: true }); });
  setInterval(async function () {
    if (!sb || !eu) return;
    if (Date.now() - ultimaAtividade > 5 * 60 * 1000) return;   // sem uso: deixa a sessão vencer no servidor
    var r = await sb.rpc('jb_sinal');
    if (!r.error && r.data && r.data.ok === false) sessaoEncerrada();
  }, 4 * 60 * 1000);
  setInterval(async function () {          // conferência completa periódica (cobre eventos perdidos)
    if (!sb || !eu || document.hidden) return;
    try { (await carregarTudo()).forEach(function (c) { avisar(c); }); } catch (e) { /* tratado em traduzErro */ }   // antes: a tela inteira era redesenhada mesmo sem mudança
  }, 10 * 60 * 1000);
  function ligarTempoReal() {
    sb.channel('jb-docs').on('postgres_changes', { event: '*', schema: 'public', table: 'docs' }, function (p) {
      var r = p.new && p.new.colecao ? p.new : p.old;
      if (!r || !r.colecao) return;
      if (p.eventType === 'DELETE') { guardar(r.colecao, r.id, null); avisar(r.colecao, r.id); }
      else recarregarDoc(r.colecao, r.id).catch(function () {});
    }).subscribe();
  }

  var encerrando = false;
  function sessaoEncerrada() {
    if (encerrando) return; encerrando = true;
    eu = null;
    tela('Sua sessão foi encerrada. Entre novamente para continuar.', true);
  }
  async function sair() {
    try { await fetch(AUTH + 'logout', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token }, body: '{}' }); } catch (e) {}
    location.reload();
  }
  window.JB_SAIR = sair;
  /* acesso para a página de administração (mesma sessão, mesmas regras do servidor) */
  window.JB_NUVEM_API = Object.freeze({
    pronto: pronto,
    eu: function () { return eu ? clone(eu) : null; },
    rpc: async function (fn, args) { await pronto; atividade(); var r = await sb.rpc(fn, args || {}); if (r.error) throw traduzErro(r.error); return r.data; },
    auth: async function (acao, corpo) { await pronto; atividade(); return post(acao, corpo, sessao.access_token); },
    fiscal: fiscal,
    db: db
  });

  /* ---------------- tela de entrada ---------------- */
  /* visual "céu aberto" (09/11/2026): a foto real da cerâmica. Celular e tablet: formulário em cima e a foto embaixo,
     com o céu sumindo no branco. Computador e tablet deitado: fundo creme, formulário à esquerda e a foto em tom de fim de tarde à direita.
     Os mesmos elementos de antes: logo e nome, usuário, senha, botão Entrar, aviso e rodapé. */
  var JBL_LARGA = '(min-width:1040px),(min-width:900px) and (orientation:landscape)';
  var CSS = '#jbl{position:fixed;inset:0;z-index:2147483600;display:flex;flex-direction:column;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#fff;' +
      'font:15px Barlow,Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#121318}' +
    '#jbl .f{flex:0 0 auto;display:flex;justify-content:center;align-items:center;box-sizing:border-box;padding:calc(28px + env(safe-area-inset-top,0px)) 28px 8px}' +
    '#jbl .c{width:100%;max-width:400px}' +
    '#jbl .m{display:flex;align-items:center;gap:12px;margin-bottom:36px}' +
    '#jbl .lg{width:48px;height:48px;display:block;flex:none}' +
    '#jbl .mt b{display:block;font-family:"Barlow Condensed","Arial Narrow",Barlow,sans-serif;font-size:26px;font-weight:700;line-height:1}#jbl .mt span{display:block;font-size:13px;line-height:1.3;color:#5B606B;margin-top:2px}' +
    '#jbl h1{font-size:36px;line-height:1.08;font-weight:600;letter-spacing:-.01em;margin:0}#jbl h1 span{color:#D3121C}' +
    '#jbl small{display:block;color:#4E5260;font-size:16px;line-height:1.35;margin:8px 0 10px}' +
    '#jbl label{display:block;font-size:13px;font-weight:600;color:#3A3E48;margin:14px 0 6px}' +
    '#jbl input{width:100%;box-sizing:border-box;height:54px;padding:0 14px;border:1px solid #CFD3DA;border-radius:10px;font:inherit;font-size:16px;color:#121318;background:#fff}' +
    '#jbl input[type=password],#jbl .cs input{padding-right:54px}' +
    '#jbl input:focus{outline:none;border-color:#D3121C;box-shadow:0 0 0 3px rgba(211,18,28,.16)}' +
    '#jbl .cs{position:relative}' +
    '#jbl .olho{position:absolute;right:5px;top:50%;transform:translateY(-50%);width:44px;height:44px;border:0;border-radius:8px;background:transparent;color:#4E5260;display:grid;place-items:center;cursor:pointer;padding:0;margin:0}' +
    '#jbl .olho:hover,#jbl .olho[aria-pressed=true]{color:#D3121C}#jbl .olho:focus-visible{outline:3px solid #D3121C;outline-offset:1px}' +
    '#jbl button[type=submit]{width:100%;height:54px;margin-top:20px;border:0;border-radius:10px;background:#D3121C;color:#fff;font:inherit;font-size:17px;font-weight:700;cursor:pointer}' +
    '#jbl button[type=submit]:hover{background:#B90F18}#jbl button[type=submit]:focus-visible{outline:3px solid #121318;outline-offset:2px}' +
    '#jbl button[type=submit]:disabled{opacity:.75;cursor:wait}' +
    '#jbl .msg{font-size:14px;line-height:1.35;color:#8E1016}#jbl .msg:not(:empty){margin-top:12px;background:#FDECEE;border:1px solid #F6C7CB;border-radius:10px;padding:10px 12px}' +
    '#jbl .ok{color:#16784A}#jbl .msg.ok:not(:empty){background:#E6F4EC;border-color:#BFE3CD}' +
    '#jbl .rod{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;font-size:13px;color:#5B606B;text-align:center}' +
    '#jbl .ft{position:relative;flex:1 0 292px;min-height:292px;overflow:hidden}' +
    '#jbl .ft img{position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:60% 100%;-webkit-mask-image:linear-gradient(to bottom,rgba(0,0,0,0) 0%,#000 30%);mask-image:linear-gradient(to bottom,rgba(0,0,0,0) 0%,#000 30%)}' +
    '#jbl .vu{display:none}' +
    '#jbl .sb{position:absolute;left:0;right:0;bottom:0;height:72px;background:linear-gradient(to bottom,rgba(18,12,8,0),rgba(18,12,8,.66))}' +
    '#jbl .cr{position:absolute;left:0;right:0;bottom:calc(14px + env(safe-area-inset-bottom,0px));text-align:center;font-size:13px;font-weight:500;color:#fff}' +
    '@media ' + JBL_LARGA + '{#jbl{background:#FBF5EC;flex-direction:row}' +
      '#jbl .f{position:relative;z-index:1;flex:0 0 560px;padding:48px 80px}' +
      '#jbl h1{font-size:52px;line-height:1.04}' +
      '#jbl .ft{position:fixed;top:0;left:380px;right:0;bottom:0;min-height:0}' +
      '#jbl .ft img{object-position:100% 100%;-webkit-mask-image:none;mask-image:none}' +
      '#jbl .vu{display:block;position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(90deg,#FBF5EC 0,#FBF5EC 130px,rgba(251,245,236,0) 340px)}' +
      '#jbl .sb{display:none}' +
      '#jbl .cr{position:fixed;left:80px;right:auto;bottom:12px;color:#5B606B}}' +
    '@media (prefers-reduced-motion:no-preference){#jbl .c{animation:jblEntra .25s ease-out}@keyframes jblEntra{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}' +
    '#jbsair{position:fixed;left:12px;bottom:12px;z-index:2147483000;border:1px solid #E8E1DA;background:#fff;color:#5C534C;border-radius:999px;padding:6px 12px;font:12.5px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 3px rgba(38,28,20,.08)}' +
    '#jbsair:hover{color:#A3461F;border-color:#A3461F}@media(max-width:960px){#jbsair{bottom:auto;top:calc(8px + env(safe-area-inset-top,0px));left:auto;right:64px}}' +
    '#jbadm{position:fixed;left:130px;bottom:12px;z-index:2147483000;border:1px solid #E8E1DA;background:#fff;color:#5C534C;border-radius:999px;padding:6px 12px;font:12.5px Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 1px 3px rgba(38,28,20,.08)}' +
    '#jbadm:hover{color:#A3461F;border-color:#A3461F}@media(max-width:960px){#jbadm{display:none}}' +
    /* aviso de versão nova: logo abaixo da barra do topo (z 20), acima da barra de baixo do celular (45) e
       abaixo das gavetas (50), das mensagens de salvo/erro (80), do "Sair" e da tela de entrada */
    '#jbversao{position:fixed;left:50%;top:calc(66px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:49;display:flex;align-items:center;gap:10px;flex-wrap:nowrap;width:max-content;max-width:min(780px,calc(100% - 24px));box-sizing:border-box;background:#A3461F;color:#fff;border-radius:12px;padding:8px 10px 8px 16px;font:13.5px Inter,system-ui,sans-serif;box-shadow:0 10px 30px -8px rgba(38,28,20,.45)}' +
    '#jbversao>span{flex:1 1 auto;min-width:0}#jbversao b{font-weight:600}#jbversao small{display:block;opacity:.85;font-size:12px;margin-top:1px}' +
    '#jbversao button{flex:none;white-space:nowrap;border:0;border-radius:8px;padding:7px 12px;font:inherit;font-weight:600;cursor:pointer}' +
    '#jbversao .sim{background:#fff;color:#A3461F}#jbversao .nao{background:transparent;color:#fff;border:1px solid rgba(255,255,255,.6)}' +
    '@media(max-width:960px){#jbversao{left:10px;right:10px;transform:none;width:auto;max-width:none;top:calc(62px + env(safe-area-inset-top,0px));padding:6px 6px 6px 12px;gap:6px;font-size:13px}#jbversao small{display:none}#jbversao button{padding:6px 10px;font-size:12.5px}}' +
    '@media(max-width:380px){#jbversao b{font-size:12px}#jbversao button{padding:6px 8px}}' +
    '@media print{#jbversao{display:none}}' +
    /* selo "Powered by Netlify": o Netlify o põe no canto de baixo à direita, em cima do botão Salvar das
       gavetas. No plano gratuito ele não pode ser escondido; aqui ele só muda de canto e continua visível:
       embaixo à esquerda, acima de "Sair" (computador) ou acima da barra de baixo (tablet em pé e celular) */
    '#nl-badge-frame{left:0!important;right:auto!important;bottom:36px!important}' +
    '@media(max-width:960px){#nl-badge-frame{bottom:calc(60px + env(safe-area-inset-bottom,0px))!important}}';
  function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function caixa(titulo, sub, campos, botao, rodape) {
    var v = document.getElementById('jbl'); if (v) v.remove();
    var cadeado = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
    var manchete = titulo === 'JB ERP' ? 'A gente cuida da gestão da sua <span>cerâmica.</span>' : esc(titulo);   // nas outras caixas fica o título delas
    v = el('<div id="jbl" role="dialog" aria-modal="true" aria-labelledby="jblt"><div class="f"><form class="c" novalidate><div class="m"><img class="lg" src="icone.svg" alt="" width="48" height="48"><div class="mt"><b>JB ERP</b><span>Cerâmica Concretiza</span></div></div><h1 id="jblt">' + manchete + '</h1><small>' + esc(sub) + '</small>' +
      campos + '<button type="submit">' + esc(botao) + '</button><div class="msg" role="status" aria-live="polite"></div><div class="rod">' + (rodape || cadeado + '<span>Acesso restrito a usuários autorizados</span>') + '</div></form></div>' +
      '<div class="ft" aria-hidden="true"><picture><source media="' + JBL_LARGA + '" srcset="entrada-computador.jpg"><img src="entrada-celular.jpg" alt=""></picture><div class="vu"></div><div class="sb"></div><div class="cr">Cerâmica Concretiza · JB ERP</div></div></div>');
    (document.body || document.documentElement).appendChild(v);
    /* olho: mostra e esconde a senha digitada */
    v.addEventListener('click', function (e) {
      var o = e.target.closest && e.target.closest('.olho'); if (!o) return;
      var i = o.parentNode.querySelector('input'); var mostra = i.type === 'password';
      i.type = mostra ? 'text' : 'password'; o.setAttribute('aria-pressed', mostra ? 'true' : 'false');
      o.setAttribute('aria-label', mostra ? 'Esconder a senha' : 'Mostrar a senha'); i.focus();
    });
    var f = v.querySelector('input'); if (f) setTimeout(function () { f.focus(); }, 30);
    return v;
  }
  var OLHO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  function campo(id, rot, tipo, auto) {
    var i = '<input id="' + id + '" type="' + tipo + '" autocomplete="' + auto + '" required' + (tipo === 'text' ? ' autocapitalize="none" spellcheck="false"' : '') + '>';
    if (tipo === 'password') i = '<div class="cs">' + i + '<button type="button" class="olho" aria-label="Mostrar a senha" aria-pressed="false" aria-controls="' + id + '">' + OLHO + '</button></div>';
    return '<label for="' + id + '">' + esc(rot) + '</label>' + i;
  }
  async function post(acao, corpo, token) {
    var h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
    var r; try { r = await fetch(AUTH + acao, { method: 'POST', headers: h, body: JSON.stringify(corpo || {}) }); }
    catch (e) { throw erro('rede', 'Sem conexão com o servidor. Verifique a internet.'); }
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw erro(j.erro || 'erro', j.mensagem || 'Não foi possível concluir.');
    return j;
  }
  /* o servidor de login desliga ~15 s depois de usado e religar custa ~1 s. Enquanto a tela de
     entrada está aberta, ele é "acordado" (no máximo a cada 10 s, só se a pessoa estiver mexendo),
     para já estar pronto quando ela apertar Entrar. O "ping" não envia nada da pessoa. */
  var ultimoAcordar = 0;
  function acordarLogin() {
    if (Date.now() - ultimoAcordar < 10000 || !document.getElementById('jbl')) return;
    ultimoAcordar = Date.now();
    fetch(AUTH + 'ping', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(function () {});
  }
  function etapa(v, texto) {
    var b = v.querySelector('button[type=submit]'); if (b) b.textContent = texto;
    var m = v.querySelector('.msg'); if (m) { m.className = 'msg ok'; m.textContent = ''; }
  }
  function tela(aviso, encerrada) {
    if (encerrada) { var s = document.getElementById('jbsair'); if (s) s.remove(); }
    var v = caixa('JB ERP', 'Entre com seu usuário e senha.', campo('jblu', 'Usuário', 'text', 'username') + campo('jbls', 'Senha', 'password', 'current-password'), 'Entrar');
    var msg = v.querySelector('.msg'); if (aviso) msg.textContent = aviso;
    acordarLogin();
    ['focusin', 'input'].forEach(function (ev) { v.addEventListener(ev, acordarLogin); });
    v.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var b = v.querySelector('button[type=submit]'), u = v.querySelector('#jblu').value.trim().toLowerCase(), s = v.querySelector('#jbls').value;
      if (!u || !s) { msg.textContent = 'Informe usuário e senha.'; return; }
      b.disabled = true; msg.textContent = ''; etapa(v, 'Conferindo a senha…');
      try {
        var r = await post('login', { usuario: u, senha: s });
        v.querySelector('#jbls').value = '';
        if (r.trocarSenha) { trocarSenha(r); return; }
        if (encerrada) { etapa(v, 'Abrindo…'); location.reload(); return; }
        await entrar(r, function (t) { etapa(v, t); });
      } catch (e) { msg.className = 'msg'; msg.textContent = e.message; b.disabled = false; b.textContent = 'Entrar'; }
    });
  }
  function trocarSenha(r) {
    var v = caixa('Crie sua senha', 'Primeiro acesso de ' + r.nome + ': troque a senha provisória',
      campo('jbla', 'Senha provisória', 'password', 'current-password') + campo('jbln', 'Nova senha (mínimo 8 caracteres)', 'password', 'new-password') + campo('jblr', 'Repita a nova senha', 'password', 'new-password'), 'Salvar nova senha');
    var msg = v.querySelector('.msg');
    v.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var a = v.querySelector('#jbla').value, n = v.querySelector('#jbln').value, rr = v.querySelector('#jblr').value, b = v.querySelector('button[type=submit]');
      if (n !== rr) { msg.textContent = 'As duas senhas novas não são iguais.'; return; }
      b.disabled = true; msg.textContent = '';
      try {
        await post('trocar-senha', { senhaAtual: a, senhaNova: n }, r.access_token);
        await post('logout', {}, r.access_token).catch(function () {});
        tela('Senha criada. Entre agora com a senha nova.');
        var m2 = document.querySelector('#jbl .msg'); if (m2) m2.className = 'msg ok';
      } catch (e) { msg.textContent = e.message; b.disabled = false; }
    });
  }
  function instalar() {
    var v = caixa('Instalação do JB ERP', 'Criar o primeiro administrador',
      campo('jbic', 'Código de instalação', 'text', 'one-time-code') + campo('jbiu', 'Usuário (ex.: jeferson)', 'text', 'username') +
      campo('jbin', 'Nome completo', 'text', 'name') + campo('jbis', 'Senha (mínimo 8 caracteres)', 'password', 'new-password') + campo('jbir', 'Repita a senha', 'password', 'new-password'), 'Criar administrador');
    var msg = v.querySelector('.msg');
    v.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var g = function (i) { return v.querySelector(i).value; }, b = v.querySelector('button[type=submit]');
      if (g('#jbis') !== g('#jbir')) { msg.textContent = 'As duas senhas não são iguais.'; return; }
      b.disabled = true; msg.textContent = '';
      try {
        await post('instalar', { codigo: g('#jbic').trim(), usuario: g('#jbiu').trim().toLowerCase(), nome: g('#jbin').trim(), senha: g('#jbis'), uidApp: CFG.uidAdministrador || null });
        history.replaceState(null, '', location.pathname);
        tela('Administrador criado. Entre com o usuário e a senha que você acabou de definir.');
        var m2 = document.querySelector('#jbl .msg'); if (m2) m2.className = 'msg ok';
      } catch (e) { msg.textContent = e.message; b.disabled = false; }
    });
  }

  async function entrar(r, avisarEtapa) {
    avisarEtapa = avisarEtapa || function () {};
    avisarEtapa('Abrindo a sessão…');
    sessao = r;
    sb = window.supabase.createClient(SB_URL, SB_CHAVE, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
    var s = await sb.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
    if (s.error) throw erro('sessao', 'Não foi possível abrir a sessão. Entre de novo.');
    sb.auth.onAuthStateChange(function (ev, nova) {
      if (nova) sessao = Object.assign({}, sessao, { access_token: nova.access_token, refresh_token: nova.refresh_token });
      if (ev === 'SIGNED_OUT') sessaoEncerrada();
    });
    avisarEtapa('Carregando os dados…');
    // acesso e dados ao mesmo tempo (antes era um depois do outro). Os dados só ficam
    // disponíveis ao sistema depois que o acesso é confirmado (prontoRes, abaixo).
    var dados = carregarTudo().then(function () { return null; }, function (e) { return e; });
    var q = await sb.rpc('jb_eu');
    if (q.error || !q.data) { cache = new Map(); throw erro('sessao', 'Não foi possível confirmar seu acesso.'); }
    eu = { uid: q.data.uid, nome: q.data.nome, usuario: q.data.usuario, admin: !!q.data.admin, permissoes: q.data.permissoes || {} };
    var falhaDados = await dados;
    if (falhaDados) throw falhaDados;
    ligarTempoReal();
    var v = document.getElementById('jbl'); if (v) v.remove();
    var bt = el('<button id="jbsair" type="button" title="Encerrar a sessão neste aparelho">' + esc(eu.usuario) + ' · Sair</button>');
    bt.addEventListener('click', sair); document.body.appendChild(bt);
    if (eu.admin && !CFG.paginaAdmin) {
      var ad = el('<a id="jbadm" href="admin.html" title="Usuários, senhas, permissões e histórico de segurança">Usuários e segurança</a>');
      document.body.appendChild(ad);
    }
    prontoRes();
  }

  /* anexos: links "/_blob/<id>" abrem por um endereço temporário e privado */
  document.addEventListener('click', async function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="/_blob/"]');
    if (!a || !sb) return;
    ev.preventDefault();
    var id = a.getAttribute('href').slice(7);
    var r = await sb.storage.from('anexos').createSignedUrl(id, 300);
    if (r.data && r.data.signedUrl) window.open(r.data.signedUrl, '_blank', 'noopener');
  }, true);

  /* imagens "/_blob/<id>" (foto da ficha, fotos do ponto): a página pede a imagem pelo código e aqui
     ela é trocada por um endereço temporário e privado do armazenamento (vale 1 hora). Os códigos
     que o armazenamento não reconhece ficam 5 minutos sem nova tentativa (sem repetir pedidos). */
  var blobUrls = {}, blobPedindo = {}, blobAgendado = false;
  /* a página pode montar a imagem já com o endereço guardado (sem pedir "/_blob/" de novo a cada redesenho) */
  window.JB_BLOB_URL = function (id) { var c = blobUrls[id]; return c && c.url && c.ate > Date.now() + 60000 ? c.url : ''; };
  function blobVarrer() {
    blobAgendado = false;
    if (!sb || !sessao) return;
    var agora = Date.now(), faltam = [];
    document.querySelectorAll('img[src^="/_blob/"]').forEach(function (img) {
      var id = img.getAttribute('src').slice(7), c = blobUrls[id];
      if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) return;
      if (c && c.ate > agora) {
        if (c.url) { img.setAttribute('data-blob', id); img.src = c.url; }
        else if (!img.hasAttribute('data-blob-falhou')) { img.setAttribute('data-blob-falhou', '1'); img.dispatchEvent(new Event('error')); }   // o armazenamento não tem essa foto
        return;
      }
      if (!blobPedindo[id] && faltam.indexOf(id) < 0) faltam.push(id);
    });
    if (!faltam.length) return;
    faltam.forEach(function (id) { blobPedindo[id] = true; });
    sb.storage.from('anexos').createSignedUrls(faltam, 3600).then(function (r) {
      var ok = {};
      (r && r.data || []).forEach(function (x) { if (x && x.path && x.signedUrl) { ok[x.path] = 1; blobUrls[x.path] = { url: x.signedUrl, ate: Date.now() + 3300000 }; } });
      faltam.forEach(function (id) { if (!ok[id]) blobUrls[id] = { url: '', ate: Date.now() + 300000 }; });
    }).catch(function () {
      faltam.forEach(function (id) { blobUrls[id] = { url: '', ate: Date.now() + 60000 }; });
    }).then(function () {
      faltam.forEach(function (id) { delete blobPedindo[id]; });
      blobAgendar();
    });
  }
  function blobAgendar() { if (!blobAgendado) { blobAgendado = true; setTimeout(blobVarrer, 30); } }
  new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (m.type === 'attributes' ? m.target.tagName === 'IMG' && (m.target.getAttribute('src') || '').indexOf('/_blob/') === 0 : m.addedNodes.length) { blobAgendar(); return; }
    }
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });

  /* ---------------- versão nova publicada ----------------
     Quem deixava o sistema aberto continuava na versão antiga até recarregar a página por conta
     própria (foi o que aconteceu em 05/11/2026). A página sabe a própria versão (<meta name="jb-site">,
     gravada na construção) e compara com o /versao.json de tempos em tempos e ao voltar para a aba.
     - Tela de entrada parada e vazia: recarrega sozinha (no máximo uma vez por versão a cada 10 min,
       para não entrar em laço se o servidor ainda entregar a página antiga).
     - Com alguém usando: só avisa, com "Atualizar agora" e "Agora não" (30 min). Recarregar pede o login
       de novo (a sessão fica só na memória da aba), então o botão pergunta antes se há algo digitado
       e não salvo ou gravação em andamento. */
  var metaVersao = document.querySelector('meta[name="jb-site"]');
  var versaoAberta = metaVersao ? metaVersao.getAttribute('content') : null;
  var campoVersao = metaVersao ? 'site' : 'versao';   // sem a meta (página antiga): usa a primeira leitura
  var avisoVersao = null, adiarVersaoAte = 0;
  function lerVersao() {
    return fetch('versao.json', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && typeof j[campoVersao] === 'string' ? j[campoVersao] : null; }, function () { return null; });
  }
  function entradaParada() {
    var v = document.getElementById('jbl');
    if (!v || !v.querySelector('#jblu') || /[?&]instalar\b/.test(location.search)) return false;   // só a tela de entrada comum
    if ([].some.call(v.querySelectorAll('input'), function (i) { return i.value; })) return false;   // alguém digitando
    var b = v.querySelector('button[type=submit]'); if (b && b.disabled) return false;              // entrada em andamento
    var m = v.querySelector('.msg'); if (m && m.textContent.trim()) return false;                  // há um recado na tela
    return true;
  }
  function recarregarSozinho(nova) {
    try {
      var k = 'jb_recarga_versao', a = JSON.parse(sessionStorage.getItem(k) || 'null');   // só a versão, nada da pessoa
      if (a && a.para === nova && Date.now() - a.em < 10 * 60 * 1000) return;
      sessionStorage.setItem(k, JSON.stringify({ para: nova, em: Date.now() }));
    } catch (e) { return; }
    location.reload();
  }
  function conferirVersao() {
    if (document.hidden) return;
    lerVersao().then(function (v) {
      if (!v) return;
      if (!versaoAberta) { versaoAberta = v; return; }
      if (v === versaoAberta) return;
      if (!eu) { if (entradaParada()) recarregarSozinho(v); return; }
      if (Date.now() >= adiarVersaoAte) mostrarAvisoVersao();
    });
  }
  /* o programa informa o que ainda não foi salvo: nativo = já tem a pergunta do navegador ao sair
     (gaveta e Configurações); outro = algo digitado nesta tela que só existe na memória */
  function naoSalvo() {
    var r = null;
    try { if (typeof window.JB_NAO_SALVO === 'function') r = window.JB_NAO_SALVO(); } catch (e) {}
    if (!r) r = { nativo: false, outro: !!document.querySelector('.gaveta') };
    return r;
  }
  function mostrarAvisoVersao() {
    if (avisoVersao || !document.body) return;
    avisoVersao = el('<div id="jbversao" role="status" aria-live="polite"><span><b>Saiu uma versão nova do sistema.</b>' +
      '<small>Para ver, atualize a página. Depois é só entrar de novo com seu usuário e senha.</small></span>' +
      '<button type="button" class="sim">Atualizar agora</button><button type="button" class="nao">Agora não</button></div>');
    avisoVersao.querySelector('.sim').addEventListener('click', function () {
      if (gravando > 0) { window.alert('Ainda estou gravando o que você salvou. Espere alguns segundos e toque em "Atualizar agora" de novo.'); return; }
      var ns = naoSalvo();
      if (ns.outro && !ns.nativo && !window.confirm('Você digitou algo nesta tela. Se ainda não salvou, isso se perde ao atualizar. Atualizar mesmo assim?')) return;
      location.reload();   // gaveta ou Configurações com alteração: o próprio navegador pergunta
    });
    avisoVersao.querySelector('.nao').addEventListener('click', function () {
      adiarVersaoAte = Date.now() + 30 * 60 * 1000;
      if (avisoVersao) { avisoVersao.remove(); avisoVersao = null; }
    });
    document.body.appendChild(avisoVersao);
  }
  conferirVersao();
  setInterval(conferirVersao, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) conferirVersao(); });
  addEventListener('online', conferirVersao);

  function iniciarTela() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (/[?&]instalar\b/.test(location.search)) instalar(); else tela();
  }
  if (document.body) iniciarTela(); else document.addEventListener('DOMContentLoaded', iniciarTela);
})();
