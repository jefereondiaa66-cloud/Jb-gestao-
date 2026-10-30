-- =====================================================================
-- JB CORE · 02 · conflito com versão base 0
--
-- versao_base = 0 quer dizer "o cliente não conhecia este documento".
-- Só é conflito se o documento já existia. Antes, toda criação com base 0
-- saía marcada como conflito. Não toca em dados.
-- Reversão: reaplicar a função jbcore.aplicar de 20261030221000_jbcore_01_ponte.sql
-- =====================================================================

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
      v_conf := v_base is not null and coalesce(v_ver_antes, 0) <> v_base;

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
revoke all on function jbcore.aplicar(jsonb) from public, anon, authenticated;
