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
    cache = novo;
  }
  async function recarregarDoc(colecao, id) {
    var r = await sb.from('docs').select('colecao,id,dados').eq('colecao', colecao).eq('id', id).maybeSingle();
    if (r.error) throw traduzErro(r.error);
    guardar(colecao, id, r.data ? r.data.dados : null);
    avisar(colecao, id);
  }

  /* ---------------- banco no formato que o sistema já usa ---------------- */
  function refDoc(caminho) {
    var p = separar(caminho);
    return {
      id: p.id, path: caminho,
      get: async function () { await pronto; return snapDoc(p.colecao, p.id); },
      set: async function (d) {
        await pronto; atividade();
        var r = await sb.rpc('jb_gravar', { p_colecao: p.colecao, p_id: p.id, p_dados: clone(d) });
        if (r.error) throw traduzErro(r.error);
        guardar(p.colecao, p.id, clone(d)); avisar(p.colecao, p.id);
      },
      update: async function (d) {
        await pronto; atividade();
        var r = await sb.rpc('jb_atualizar', { p_colecao: p.colecao, p_id: p.id, p_campos: clone(d) });
        if (r.error) throw traduzErro(r.error);
        var ant = cache.get(p.colecao + '/' + p.id);
        guardar(p.colecao, p.id, mesclar(ant ? ant.dados : {}, clone(d))); avisar(p.colecao, p.id);
      },
      delete: async function () {
        await pronto; atividade();
        var r = await sb.rpc('jb_apagar', { p_colecao: p.colecao, p_id: p.id });
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

  window.claude = Object.freeze({
    use: async function (nome) {
      if (nome === 'db') { await pronto; return db; }
      if (nome === 'user') { await pronto; return user; }
      if (nome === 'assets') { await pronto; return assets; }
      return null; // assistente, editor por IA, conector fiscal e versões do Claude não existem fora dele
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
    try { await carregarTudo(); avisarTodos(); } catch (e) { /* tratado em traduzErro */ }
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
    db: db
  });

  /* ---------------- tela de entrada ---------------- */
  var CSS = '#jbl{position:fixed;inset:0;z-index:2147483600;background:#F6F3EF;display:flex;align-items:center;justify-content:center;padding:16px;font:14px Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#221C18}' +
    '#jbl .c{background:#fff;border:1px solid #E8E1DA;border-radius:16px;box-shadow:0 12px 28px -10px rgba(38,28,20,.18);width:100%;max-width:380px;padding:28px 26px}' +
    '#jbl .m{display:flex;align-items:center;gap:12px;margin-bottom:20px}#jbl .lg{width:42px;height:42px;border-radius:11px;background:linear-gradient(150deg,#C2603A,#8A3A19);color:#fff;display:grid;place-items:center;font-weight:700}' +
    '#jbl h1{font-size:18px;margin:0;font-weight:600}#jbl small{color:#5C534C;font-size:12.5px}' +
    '#jbl label{display:block;font-size:12.5px;font-weight:500;color:#5C534C;margin:12px 0 4px}' +
    '#jbl input{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #E8E1DA;border-radius:8px;font:inherit;font-size:16px;background:#FAF8F5}' +
    '#jbl input:focus{outline:none;border-color:#A3461F;box-shadow:0 0 0 3px rgba(163,70,31,.18);background:#fff}' +
    '#jbl button{width:100%;margin-top:18px;padding:11px;border:0;border-radius:8px;background:#A3461F;color:#fff;font:inherit;font-weight:600;cursor:pointer}' +
    '#jbl button:disabled{opacity:.6;cursor:wait}#jbl .msg{min-height:18px;margin-top:12px;font-size:13px;color:#B3302A}#jbl .ok{color:#16784A}' +
    '#jbl .rod{margin-top:16px;font-size:11.5px;color:#9C9188;text-align:center}' +
    '#jbsair{position:fixed;left:12px;bottom:12px;z-index:2147483000;border:1px solid #E8E1DA;background:#fff;color:#5C534C;border-radius:999px;padding:6px 12px;font:12.5px Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 1px 3px rgba(38,28,20,.08)}' +
    '#jbsair:hover{color:#A3461F;border-color:#A3461F}@media(max-width:960px){#jbsair{bottom:auto;top:calc(8px + env(safe-area-inset-top,0px));left:auto;right:64px}}' +
    '#jbadm{position:fixed;left:130px;bottom:12px;z-index:2147483000;border:1px solid #E8E1DA;background:#fff;color:#5C534C;border-radius:999px;padding:6px 12px;font:12.5px Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 1px 3px rgba(38,28,20,.08)}' +
    '#jbadm:hover{color:#A3461F;border-color:#A3461F}@media(max-width:960px){#jbadm{display:none}}' +
    /* selo "Powered by Netlify": o Netlify o põe no canto de baixo à direita, em cima do botão Salvar das
       gavetas. No plano gratuito ele não pode ser escondido; aqui ele só muda de canto e continua visível:
       embaixo à esquerda, acima de "Sair" (computador) ou acima da barra de baixo (tablet em pé e celular) */
    '#nl-badge-frame{left:0!important;right:auto!important;bottom:36px!important}' +
    '@media(max-width:960px){#nl-badge-frame{bottom:calc(60px + env(safe-area-inset-bottom,0px))!important}}';
  function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function caixa(titulo, sub, campos, botao, rodape) {
    var v = document.getElementById('jbl'); if (v) v.remove();
    v = el('<div id="jbl" role="dialog" aria-modal="true" aria-labelledby="jblt"><form class="c" novalidate><div class="m"><span class="lg">JB</span><div><h1 id="jblt">' + esc(titulo) + '</h1><small>' + esc(sub) + '</small></div></div>' +
      campos + '<button type="submit">' + esc(botao) + '</button><div class="msg" role="status" aria-live="polite"></div><div class="rod">' + (rodape || 'JB Gestão de Cerâmica e Controladoria') + '</div></form></div>');
    (document.body || document.documentElement).appendChild(v);
    var f = v.querySelector('input'); if (f) setTimeout(function () { f.focus(); }, 30);
    return v;
  }
  function campo(id, rot, tipo, auto) { return '<label for="' + id + '">' + esc(rot) + '</label><input id="' + id + '" type="' + tipo + '" autocomplete="' + auto + '" required>'; }
  async function post(acao, corpo, token) {
    var h = { 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
    var r; try { r = await fetch(AUTH + acao, { method: 'POST', headers: h, body: JSON.stringify(corpo || {}) }); }
    catch (e) { throw erro('rede', 'Sem conexão com o servidor. Verifique a internet.'); }
    var j = {}; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw erro(j.erro || 'erro', j.mensagem || 'Não foi possível concluir.');
    return j;
  }
  function tela(aviso, encerrada) {
    if (encerrada) { var s = document.getElementById('jbsair'); if (s) s.remove(); }
    var v = caixa('JB Gestão', 'Entre com seu usuário e senha', campo('jblu', 'Usuário', 'text', 'username') + campo('jbls', 'Senha', 'password', 'current-password'), 'Entrar');
    var msg = v.querySelector('.msg'); if (aviso) msg.textContent = aviso;
    v.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var b = v.querySelector('button'), u = v.querySelector('#jblu').value.trim().toLowerCase(), s = v.querySelector('#jbls').value;
      if (!u || !s) { msg.textContent = 'Informe usuário e senha.'; return; }
      b.disabled = true; msg.textContent = '';
      try {
        var r = await post('login', { usuario: u, senha: s });
        v.querySelector('#jbls').value = '';
        if (r.trocarSenha) { trocarSenha(r); return; }
        if (encerrada) { location.reload(); return; }
        await entrar(r);
      } catch (e) { msg.textContent = e.message; b.disabled = false; }
    });
  }
  function trocarSenha(r) {
    var v = caixa('Crie sua senha', 'Primeiro acesso de ' + r.nome + ': troque a senha provisória',
      campo('jbla', 'Senha provisória', 'password', 'current-password') + campo('jbln', 'Nova senha (mínimo 8 caracteres)', 'password', 'new-password') + campo('jblr', 'Repita a nova senha', 'password', 'new-password'), 'Salvar nova senha');
    var msg = v.querySelector('.msg');
    v.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var a = v.querySelector('#jbla').value, n = v.querySelector('#jbln').value, rr = v.querySelector('#jblr').value, b = v.querySelector('button');
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
    var v = caixa('Instalação do JB Gestão', 'Criar o primeiro administrador',
      campo('jbic', 'Código de instalação', 'text', 'one-time-code') + campo('jbiu', 'Usuário (ex.: jeferson)', 'text', 'username') +
      campo('jbin', 'Nome completo', 'text', 'name') + campo('jbis', 'Senha (mínimo 8 caracteres)', 'password', 'new-password') + campo('jbir', 'Repita a senha', 'password', 'new-password'), 'Criar administrador');
    var msg = v.querySelector('.msg');
    v.querySelector('form').addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var g = function (i) { return v.querySelector(i).value; }, b = v.querySelector('button');
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

  async function entrar(r) {
    sessao = r;
    sb = window.supabase.createClient(SB_URL, SB_CHAVE, { auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } });
    var s = await sb.auth.setSession({ access_token: r.access_token, refresh_token: r.refresh_token });
    if (s.error) throw erro('sessao', 'Não foi possível abrir a sessão. Entre de novo.');
    sb.auth.onAuthStateChange(function (ev, nova) {
      if (nova) sessao = Object.assign({}, sessao, { access_token: nova.access_token, refresh_token: nova.refresh_token });
      if (ev === 'SIGNED_OUT') sessaoEncerrada();
    });
    var q = await sb.rpc('jb_eu');
    if (q.error || !q.data) throw erro('sessao', 'Não foi possível confirmar seu acesso.');
    eu = { uid: q.data.uid, nome: q.data.nome, usuario: q.data.usuario, admin: !!q.data.admin, permissoes: q.data.permissoes || {} };
    await carregarTudo();
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

  function iniciarTela() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    if (/[?&]instalar\b/.test(location.search)) instalar(); else tela();
  }
  if (document.body) iniciarTela(); else document.addEventListener('DOMContentLoaded', iniciarTela);
})();
