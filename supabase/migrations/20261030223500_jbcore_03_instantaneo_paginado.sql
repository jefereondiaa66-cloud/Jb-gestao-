-- =====================================================================
-- JB CORE · 03 · retrato do banco em páginas
--
-- A ponte do Claude lê o banco inteiro ao abrir. Em uma resposta só seriam
-- ~800 KB, perto do limite do conector; aqui sai em páginas de até
-- p_max_bytes. O cursor da fila de mudanças vem na primeira página, lido
-- antes dos documentos: o que mudar durante a leitura chega pela fila.
-- Só responde para um administrador ativo (o mesmo critério da gravação).
-- Não toca em dados. Reversão: drop function jbcore.instantaneo_pagina(text, text, text, integer);
-- =====================================================================

create or replace function jbcore.instantaneo_pagina(p_uid_app text, p_depois_col text default null,
                                                     p_depois_id text default null, p_max_bytes integer default 250000)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_docs jsonb := '[]'::jsonb; v_bytes integer := 0; v_ult_col text; v_ult_id text; v_mais boolean := false;
  v_cursor bigint; r record;
begin
  if jbcore.usuario_da_ponte(p_uid_app) is null then
    raise exception 'ponte recusada: % não é administrador ativo', coalesce(p_uid_app, '(vazio)') using errcode = '42501';
  end if;
  if p_depois_col is null then
    select coalesce(max(seq), 0) into v_cursor from jbcore.mudancas;
  end if;
  for r in
    select d.colecao, d.id, d.dados, d.versao, octet_length(d.dados::text) as tam
    from public.docs d
    where p_depois_col is null
       or (d.colecao collate "C", d.id collate "C") > (p_depois_col collate "C", p_depois_id collate "C")
    order by d.colecao collate "C", d.id collate "C"
  loop
    if v_bytes > 0 and v_bytes + r.tam > greatest(p_max_bytes, 10000) then v_mais := true; exit; end if;
    v_docs := v_docs || jsonb_build_array(jsonb_build_array(r.colecao, r.id, r.dados, r.versao));
    v_bytes := v_bytes + r.tam; v_ult_col := r.colecao; v_ult_id := r.id;
  end loop;
  return jsonb_build_object('docs', v_docs, 'cursor', v_cursor, 'agora', now(),
    'proximo', case when v_mais then jsonb_build_array(v_ult_col, v_ult_id) end);
end $$;
revoke all on function jbcore.instantaneo_pagina(text, text, text, integer) from public, anon, authenticated;
