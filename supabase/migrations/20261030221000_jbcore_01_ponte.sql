-- =====================================================================
-- JB CORE · 01 · motor de sincronização do banco central
--
-- Só acrescenta: esquema novo "jbcore", um gatilho que registra cada
-- mudança em public.docs e as funções usadas pela ponte do Claude e pelo
-- painel. Não altera nem apaga nenhum registro existente.
-- Reversão: 20261030221000_jbcore_01_ponte.down.sql
-- =====================================================================

create schema if not exists jbcore;
revoke all on schema jbcore from public;
revoke all on schema jbcore from anon, authenticated;

/* ---------- tabelas ---------- */

-- fila de mudanças: cada inclusão, alteração ou exclusão em public.docs
create table if not exists jbcore.mudancas (
  seq bigserial primary key,
  colecao text not null,
  doc_id text not null,
  operacao text not null check (operacao in ('inclusao', 'alteracao', 'exclusao')),
  versao bigint,
  em timestamptz not null default now()
);
create index if not exists mudancas_em_idx on jbcore.mudancas (em);

-- operações recebidas pela ponte: o op_id garante que a mesma operação
-- nunca é aplicada duas vezes, mesmo quando o envio é repetido
create table if not exists jbcore.operacoes (
  op_id text primary key check (op_id ~ '^[A-Za-z0-9_.:-]{8,100}$'),
  origem text not null,
  uid_app text,
  tipo text not null check (tipo in ('gravar', 'atualizar', 'apagar')),
  colecao text not null,
  doc_id text not null,
  resultado text not null check (resultado in ('aplicada', 'sem_efeito', 'erro')),
  conflito boolean not null default false,
  versao_base bigint,
  versao_antes bigint,
  versao_depois bigint,
  erro text,
  recebida_em timestamptz not null default now()
);
create index if not exists operacoes_recebida_idx on jbcore.operacoes (recebida_em desc);

-- sinais de vida e verificações (ponte do Claude, hospedagem, conferência)
create table if not exists jbcore.estado (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- histórico de publicações do sistema (código), em qualquer ambiente
create table if not exists jbcore.publicacoes (
  id bigserial primary key,
  ambiente text not null check (ambiente in ('claude', 'nuvem', 'repositorio', 'banco')),
  versao text not null,
  sha256 text,
  commit_ref text,
  situacao text not null check (situacao in ('preparada', 'publicada', 'verificada', 'falhou', 'revertida')),
  detalhe jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

alter table jbcore.mudancas enable row level security;
alter table jbcore.operacoes enable row level security;
alter table jbcore.estado enable row level security;
alter table jbcore.publicacoes enable row level security;

/* ---------- registro de mudanças ---------- */

-- Nunca impede uma gravação do sistema: se o registro falhar, a gravação
-- segue e a conferência completa periódica da ponte cobre a falha.
create or replace function jbcore.registrar_mudanca()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    if tg_op = 'DELETE' then
      insert into jbcore.mudancas (colecao, doc_id, operacao, versao) values (old.colecao, old.id, 'exclusao', old.versao);
    elsif tg_op = 'INSERT' then
      insert into jbcore.mudancas (colecao, doc_id, operacao, versao) values (new.colecao, new.id, 'inclusao', new.versao);
    elsif old.dados is distinct from new.dados then
      insert into jbcore.mudancas (colecao, doc_id, operacao, versao) values (new.colecao, new.id, 'alteracao', new.versao);
    end if;
  exception when others then
    raise warning 'jbcore: mudança não registrada (%): %', sqlstate, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists docs_jbcore_mudancas on public.docs;
create trigger docs_jbcore_mudancas after insert or update or delete on public.docs
  for each row execute function jbcore.registrar_mudanca();

/* ---------- leitura pela ponte ---------- */

-- retrato completo do banco + cursor da fila de mudanças (uma única leitura,
-- portanto um único instantâneo consistente)
create or replace function jbcore.instantaneo()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'cursor', (select coalesce(max(seq), 0) from jbcore.mudancas),
    'agora', now(),
    'docs', coalesce((select jsonb_agg(jsonb_build_array(d.colecao, d.id, d.dados, d.versao) order by d.colecao, d.id) from public.docs d), '[]'::jsonb))
$$;

-- mudanças depois do cursor. A janela de 30 s cobre transações que
-- terminaram fora de ordem; repetir um documento não causa problema porque
-- o cliente aplica o estado atual dele. "recarregar" avisa quando o cliente
-- ficou tanto tempo fora que a fila já foi podada.
create or replace function jbcore.mudancas_desde(p_cursor bigint, p_sinal jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; v_min bigint;
begin
  if p_sinal is not null and jsonb_typeof(p_sinal) = 'object' and coalesce(p_sinal->>'origem', '') ~ '^[a-z0-9_-]{1,40}$' then
    insert into jbcore.estado (chave, valor, atualizado_em)
    values ('ponte:' || (p_sinal->>'origem'), p_sinal || jsonb_build_object('ultimo_contato', now()), now())
    on conflict (chave) do update set valor = jbcore.estado.valor || excluded.valor, atualizado_em = now();
  end if;
  select min(seq) into v_min from jbcore.mudancas;
  with m as (
    select colecao, doc_id, max(seq) as seq from jbcore.mudancas
    where seq > coalesce(p_cursor, 0) or em > now() - interval '30 seconds'
    group by colecao, doc_id
  )
  select jsonb_build_object(
    'cursor', greatest(coalesce(p_cursor, 0), (select coalesce(max(seq), 0) from jbcore.mudancas)),
    'agora', now(),
    'recarregar', v_min is not null and coalesce(p_cursor, 0) < v_min - 1,
    'docs', coalesce((select jsonb_agg(jsonb_build_array(m.colecao, m.doc_id, d.dados, d.versao) order by m.seq)
                      from m left join public.docs d on d.colecao = m.colecao and d.id = m.doc_id), '[]'::jsonb))
  into v;
  return v;
end $$;

/* ---------- escrita pela ponte ---------- */

-- só um administrador ativo e desbloqueado pode gravar pela ponte
create or replace function jbcore.usuario_da_ponte(p_uid_app text)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.user_id from seg.perfis p
  where p.uid_app = p_uid_app and p.admin and p.ativo and not p.bloqueado
    and (p.bloqueado_ate is null or p.bloqueado_ate <= now())
$$;

-- Aplica um lote de operações. Cada operação:
--   {op_id, tipo: gravar|atualizar|apagar, colecao, id, dados?, campos?, versao_base?}
-- Idempotente pelo op_id: a mesma operação reenviada devolve o resultado
-- guardado e não grava de novo. Cada operação roda isolada: a falha de uma
-- não desfaz as outras. A gravação segue a regra do sistema (a última vale);
-- quando o documento mudou desde a versão que o cliente conhecia, a operação
-- sai marcada como conflito e o estado anterior fica na auditoria.
create or replace function jbcore.aplicar(p_lote jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid text := p_lote->>'uid_app';
  v_origem text := coalesce(nullif(p_lote->>'origem', ''), 'claude');
  v_user uuid;
  op jsonb; ja jbcore.operacoes%rowtype;
  v_id text; v_tipo text; v_col text; v_doc text; v_base bigint;
  v_antes jsonb; v_ver_antes bigint; v_novo jsonb; v_ver bigint; v_conf boolean;
  v_res text; v_err text; v_code text;
  r jsonb := '[]'::jsonb;
begin
  if v_origem !~ '^[a-z0-9_-]{1,40}$' then raise exception 'origem inválida' using errcode = '22023'; end if;
  v_user := jbcore.usuario_da_ponte(v_uid);
  if v_user is null then
    raise exception 'ponte recusada: % não é administrador ativo', coalesce(v_uid, '(vazio)') using errcode = '42501';
  end if;
  if jsonb_typeof(p_lote->'ops') is distinct from 'array' then raise exception 'lote inválido' using errcode = '22023'; end if;
  if jsonb_array_length(p_lote->'ops') > 200 then raise exception 'lote grande demais (máximo 200 operações)' using errcode = '54000'; end if;

  -- a auditoria do banco registra a alteração em nome deste usuário
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_user::text, true);

  for op in select value from jsonb_array_elements(p_lote->'ops') loop
    v_id := op->>'op_id';
    if v_id is null or v_id !~ '^[A-Za-z0-9_.:-]{8,100}$' then
      r := r || jsonb_build_array(jsonb_build_object('op_id', v_id, 'resultado', 'erro', 'codigo', '22023', 'erro', 'op_id inválido'));
      continue;
    end if;
    select * into ja from jbcore.operacoes where op_id = v_id;
    if found then
      r := r || jsonb_build_array(jsonb_build_object('op_id', v_id, 'resultado', ja.resultado, 'repetida', true,
        'versao', ja.versao_depois, 'conflito', ja.conflito, 'erro', ja.erro, 'codigo', nullif(split_part(coalesce(ja.erro, ''), ':', 1), '')));
      continue;
    end if;

    v_tipo := op->>'tipo'; v_col := op->>'colecao'; v_doc := op->>'id';
    v_base := case when jsonb_typeof(op->'versao_base') = 'number' then (op->>'versao_base')::bigint end;
    v_conf := false; v_ver := null; v_ver_antes := null; v_antes := null; v_err := null; v_code := null;
    begin
      if v_tipo is null or v_tipo not in ('gravar', 'atualizar', 'apagar') then
        raise exception 'tipo de operação inválido' using errcode = '22023';
      end if;
      perform seg.validar_caminho(v_col, v_doc);
      select d.dados, d.versao into v_antes, v_ver_antes from public.docs d where d.colecao = v_col and d.id = v_doc for update;
      v_conf := v_base is not null and v_ver_antes is distinct from v_base;

      if v_tipo = 'gravar' then
        v_novo := op->'dados';
        if v_novo is null or jsonb_typeof(v_novo) <> 'object' then raise exception 'dados inválidos' using errcode = '22023'; end if;
        if octet_length(v_novo::text) > 1048576 then raise exception 'documento grande demais' using errcode = '54000'; end if;
        if v_ver_antes is null then
          insert into public.docs (colecao, id, dados, criado_por, atualizado_por)
          values (v_col, v_doc, v_novo, v_user, v_user) returning versao into v_ver;
        else
          update public.docs set dados = v_novo, versao = versao + 1, atualizado_em = now(), atualizado_por = v_user
          where colecao = v_col and id = v_doc returning versao into v_ver;
        end if;
        v_res := 'aplicada';
      elsif v_tipo = 'atualizar' then
        if v_ver_antes is null then raise exception 'documento inexistente' using errcode = 'P0002'; end if;
        if op->'campos' is null or jsonb_typeof(op->'campos') <> 'object' then raise exception 'campos inválidos' using errcode = '22023'; end if;
        v_novo := seg.mesclar(v_antes, op->'campos');
        if octet_length(v_novo::text) > 1048576 then raise exception 'documento grande demais' using errcode = '54000'; end if;
        update public.docs set dados = v_novo, versao = versao + 1, atualizado_em = now(), atualizado_por = v_user
        where colecao = v_col and id = v_doc returning versao into v_ver;
        v_res := 'aplicada';
      else
        if v_ver_antes is null then
          v_res := 'sem_efeito';
        else
          delete from public.docs where colecao = v_col and id = v_doc;
          v_res := 'aplicada';
        end if;
      end if;
    exception when others then
      v_res := 'erro'; v_code := sqlstate; v_err := sqlstate || ': ' || sqlerrm;
    end;

    -- erros passageiros (corrida, trava, tempo esgotado) não ficam guardados:
    -- o reenvio com o mesmo op_id tenta de novo
    if v_res <> 'erro' or v_code not in ('23505', '40001', '40P01', '55P03', '57014') then
      insert into jbcore.operacoes (op_id, origem, uid_app, tipo, colecao, doc_id, resultado, conflito, versao_base, versao_antes, versao_depois, erro)
      values (v_id, v_origem, v_uid, coalesce(v_tipo, '?'), coalesce(v_col, '?'), coalesce(v_doc, '?'), v_res, v_conf, v_base, v_ver_antes, v_ver, v_err)
      on conflict (op_id) do nothing;
    end if;
    r := r || jsonb_build_array(jsonb_build_object('op_id', v_id, 'resultado', v_res, 'versao', v_ver, 'conflito', v_conf, 'erro', v_err, 'codigo', v_code));
  end loop;

  insert into jbcore.estado (chave, valor, atualizado_em)
  values ('ponte:' || v_origem, jsonb_build_object('ultimo_envio', now(), 'uid_app', v_uid), now())
  on conflict (chave) do update set valor = jbcore.estado.valor || excluded.valor, atualizado_em = now();

  return jsonb_build_object('ok', true, 'resultados', r, 'cursor', (select coalesce(max(seq), 0) from jbcore.mudancas));
end $$;

/* ---------- publicações e conferência ---------- */

create or replace function jbcore.registrar_publicacao(p jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  insert into jbcore.publicacoes (ambiente, versao, sha256, commit_ref, situacao, detalhe)
  values (p->>'ambiente', p->>'versao', p->>'sha256', p->>'commit_ref', p->>'situacao', coalesce(p->'detalhe', '{}'::jsonb))
  returning id into v;
  return v;
end $$;

-- conferência de integridade: quantidade e impressão digital de cada coleção
create or replace function jbcore.conferir()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  select jsonb_build_object('feita_em', now(), 'registros', (select count(*) from public.docs),
    'colecoes', coalesce(jsonb_object_agg(colecao, jsonb_build_object('registros', n, 'md5', h)), '{}'::jsonb))
  into v
  from (select colecao, count(*) n, md5(string_agg(id || '=' || md5(dados::text), ' ' order by id collate "C")) h
        from public.docs group by colecao) x;
  insert into jbcore.estado (chave, valor, atualizado_em) values ('conferencia', v, now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return v;
end $$;

/* ---------- hospedagem: verificação periódica do site no ar ---------- */

-- Em duas etapas (o pg_net responde depois): colhe a resposta do pedido
-- anterior e dispara um pedido novo para /versao.json do site oficial.
create or replace function jbcore.verificar_hospedagem()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ant jsonb; v_req bigint; r record; v_res jsonb; v_versao jsonb;
begin
  select valor into v_ant from jbcore.estado where chave = 'nuvem';
  if v_ant ? 'pedido' then
    select status_code, content, error_msg, created into r from net._http_response where id = (v_ant->>'pedido')::bigint;
    if found then
      begin v_versao := r.content::jsonb; exception when others then v_versao := null; end;
      v_res := jsonb_build_object('status', r.status_code, 'erro', r.error_msg, 'verificado_em', r.created,
        'no_ar', r.status_code = 200, 'versao', v_versao);
    end if;
  end if;
  v_req := net.http_get('https://jb-gestao-ceramica.netlify.app/versao.json?t=' || floor(extract(epoch from now()))::bigint,
                        timeout_milliseconds := 15000);
  insert into jbcore.estado (chave, valor, atualizado_em)
  values ('nuvem', coalesce(v_res, coalesce(v_ant, '{}'::jsonb) - 'pedido') || jsonb_build_object('pedido', v_req), now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return v_res;
end $$;

-- limpeza: mudanças com mais de 30 dias (a ponte recarrega tudo se ficar
-- tanto tempo desligada); operações e publicações ficam guardadas
create or replace function jbcore.podar()
returns void language sql security definer set search_path = '' as $$
  delete from jbcore.mudancas where em < now() - interval '30 days';
$$;

/* ---------- painel ---------- */

create or replace function jbcore.painel()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'agora', now(),
    'banco', jsonb_build_object(
      'registros', (select count(*) from public.docs),
      'colecoes', (select count(distinct colecao) from public.docs),
      'tamanho_bytes', pg_database_size(current_database()),
      'ultima_alteracao', (select max(atualizado_em) from public.docs)),
    'sincronizacao', jsonb_build_object(
      'cursor', (select coalesce(max(seq), 0) from jbcore.mudancas),
      'ultima_mudanca', (select max(em) from jbcore.mudancas),
      'mudancas_24h', (select count(*) from jbcore.mudancas where em > now() - interval '24 hours'),
      'operacoes_24h', (select count(*) from jbcore.operacoes where recebida_em > now() - interval '24 hours'),
      'erros_24h', (select count(*) from jbcore.operacoes where resultado = 'erro' and recebida_em > now() - interval '24 hours'),
      'conflitos_24h', (select count(*) from jbcore.operacoes where conflito and recebida_em > now() - interval '24 hours')),
    'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('quando', recebida_em, 'origem', origem, 'tipo', tipo,
        'onde', colecao || '/' || doc_id, 'resultado', resultado, 'conflito', conflito, 'erro', erro) order by recebida_em desc)
      from (select * from jbcore.operacoes where resultado = 'erro' or conflito order by recebida_em desc limit 20) o), '[]'::jsonb),
    'estado', coalesce((select jsonb_object_agg(chave, valor || jsonb_build_object('atualizado_em', atualizado_em)) from jbcore.estado), '{}'::jsonb),
    'publicacoes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ambiente', ambiente, 'versao', versao, 'commit', commit_ref,
        'situacao', situacao, 'quando', criado_em, 'detalhe', detalhe) order by id desc)
      from (select * from jbcore.publicacoes order by id desc limit 20) p), '[]'::jsonb),
    'copias', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'feita_em', feita_em, 'registros', registros, 'bytes', tamanho_bytes) order by id desc)
      from (select id, feita_em, registros, tamanho_bytes from seg.copias order by id desc limit 10) c), '[]'::jsonb),
    'sessoes_abertas', (select count(*) from seg.sessoes where encerrada_em is null and ultimo_uso_em > now() - interval '30 minutes'))
$$;

-- o painel também abre na página de administração da nuvem, só para administradores
create or replace function public.jb_admin_core_painel()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not seg.eh_admin() then raise exception 'somente administradores' using errcode = '42501'; end if;
  return jbcore.painel();
end $$;
revoke all on function public.jb_admin_core_painel() from public, anon;
grant execute on function public.jb_admin_core_painel() to authenticated;

create or replace function public.jb_admin_core_conferir()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not seg.eh_admin() then raise exception 'somente administradores' using errcode = '42501'; end if;
  return jbcore.conferir();
end $$;
revoke all on function public.jb_admin_core_conferir() from public, anon;
grant execute on function public.jb_admin_core_conferir() to authenticated;

-- as funções do esquema jbcore só rodam pelo dono do banco (conector do Claude e agente)
revoke all on all functions in schema jbcore from public, anon, authenticated;

/* ---------- tarefas agendadas ---------- */
select cron.unschedule(jobid) from cron.job where jobname in ('jbcore-hospedagem', 'jbcore-podar');
select cron.schedule('jbcore-hospedagem', '*/10 * * * *', 'select jbcore.verificar_hospedagem()');
select cron.schedule('jbcore-podar', '17 6 * * *', 'select jbcore.podar()');
