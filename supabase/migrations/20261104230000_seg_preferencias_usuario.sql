-- Preferências de cada usuário na nuvem (V68 · Personalizar aparência, 04/11/2026)
-- O programa guarda as preferências de cada pessoa (tema de cores, visual, menu recolhido,
-- alertas lidos) em data/users/<uid>/prefs. Até aqui só administradores conseguiam ler e gravar
-- esse documento na nuvem; para os demais a escolha ficava só no navegador.
-- Esta migração deixa CADA usuário ler e gravar SOMENTE o próprio documento
-- data/users/<seu uid>/prefs. Nenhum outro caminho muda e nenhum dado existente é alterado.
--   1. seg.colecoes ganha a raiz "data" (tipo "proprio", como "ws");
--   2. seg.verificar_escrita aceita gravar o próprio prefs (não aceita apagar);
--   3. seg.pode_ler e a política docs_leitura aceitam ler o próprio prefs.
-- Antes de aplicar: select seg.fazer_copia();
-- Reverter: rodar 20261104230000_seg_preferencias_usuario.down.sql (devolve as definições anteriores).

insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('data', 'auditoria', false, 'proprio', false)
on conflict do nothing;

CREATE OR REPLACE FUNCTION seg.verificar_escrita(p_colecao text, p_id text, p_antes jsonb, p_depois jsonb)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_raiz text := split_part(p_colecao, '/', 1);
  c seg.colecoes%rowtype; v_eu text; v_ops text[] := '{}'; op text;
  k text; a jsonb; b jsonb; va jsonb; vb jsonb; ea boolean; eb boolean;
begin
  if not seg.liberado() then
    raise exception 'sessão encerrada ou inválida' using errcode = '28000';
  end if;
  if seg.eh_admin() then return; end if;
  select * into c from seg.colecoes where raiz = v_raiz;
  if not found then raise exception 'sem permissão' using errcode = '42501'; end if;
  v_eu := seg.meu_uid_app();

  if c.tipo = 'proprio' then
    if v_raiz = 'ws' and p_colecao = 'ws' and p_id = v_eu then return; end if;
    if v_raiz = 'ccAuditoria' and split_part(p_colecao, '/', 2) = v_eu and p_depois is not null then return; end if;
    -- V68: as próprias preferências (tema de cores etc.), só gravar, só o próprio documento
    if v_raiz = 'data' and v_eu is not null and p_colecao = 'data/users/' || v_eu and p_id = 'prefs' and p_depois is not null then return; end if;
    raise exception 'sem permissão' using errcode = '42501';
  end if;

  if c.tipo = 'log' then
    if p_depois is null then raise exception 'sem permissão' using errcode = '42501'; end if;
    if p_antes is not null then
      if (p_antes - 'items') is distinct from (p_depois - 'items') then
        raise exception 'sem permissão' using errcode = '42501';
      end if;
      for k in select jsonb_object_keys(coalesce(p_antes->'items', '{}'::jsonb)) loop
        va := p_antes->'items'->k;
        if va is not null and va <> 'null'::jsonb and (p_depois->'items'->k) is distinct from va then
          raise exception 'sem permissão' using errcode = '42501';
        end if;
      end loop;
    end if;
    return;
  end if;

  if c.agrupada then
    a := coalesce(p_antes->'items', '{}'::jsonb);
    b := coalesce(p_depois->'items', '{}'::jsonb);
    for k in select jsonb_object_keys(a) union select jsonb_object_keys(b) loop
      va := a->k; vb := b->k;
      ea := va is not null and va <> 'null'::jsonb;
      eb := vb is not null and vb <> 'null'::jsonb;
      if not ea and eb then v_ops := v_ops || 'criar'::text;
      elsif ea and not eb then v_ops := v_ops || 'excluir'::text;
      elsif ea and eb and va <> vb then v_ops := v_ops || 'editar'::text;
      end if;
    end loop;
    if p_antes is not null and p_depois is not null
       and (p_antes - 'items') is distinct from (p_depois - 'items') then
      v_ops := v_ops || 'editar'::text;
    end if;
    if p_antes is null and cardinality(v_ops) = 0 then v_ops := v_ops || 'criar'::text; end if;
    if p_depois is null then v_ops := v_ops || 'excluir'::text; end if;
  else
    if p_antes is null then v_ops := array['criar'];
    elsif p_depois is null then v_ops := array['excluir'];
    elsif p_antes is distinct from p_depois then v_ops := array['editar'];
    end if;
  end if;

  foreach op in array coalesce((select array_agg(distinct x) from unnest(v_ops) x), '{}'::text[]) loop
    if op is not null and not seg.pode(c.modulo, op) then
      raise exception 'sem permissão para % em %', op, c.modulo using errcode = '42501';
    end if;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION seg.pode_ler(p_colecao text, p_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_raiz text := split_part(p_colecao, '/', 1); c seg.colecoes%rowtype; v_eu text;
begin
  if not seg.liberado() then return false; end if;
  if seg.eh_admin() then return true; end if;
  select * into c from seg.colecoes where raiz = v_raiz;
  if not found then return false; end if;
  if c.tipo = 'geral' then return true; end if;
  if c.tipo in ('proprio', 'acesso') then
    v_eu := seg.meu_uid_app();
    if v_raiz in ('ws', 'acesso') and p_colecao = v_raiz and p_id = v_eu then return true; end if;
    if v_raiz = 'ccAuditoria' and split_part(p_colecao, '/', 2) = v_eu then return true; end if;
    -- V68: as próprias preferências
    if v_raiz = 'data' and v_eu is not null and p_colecao = 'data/users/' || v_eu and p_id = 'prefs' then return true; end if;
  end if;
  return seg.pode(c.modulo, 'ler');
end $function$;

drop policy if exists docs_leitura on public.docs;
create policy docs_leitura on public.docs for select to authenticated using (
  (select seg.liberado()) and (
    (select seg.eh_admin())
    or (raiz = any ((select seg.raizes_legiveis())::text[]))
    or ((raiz = any (array['ws'::text, 'acesso'::text])) and (colecao = raiz) and (id = (select seg.meu_uid_app())))
    or ((raiz = 'ccAuditoria'::text) and (split_part(colecao, '/'::text, 2) = (select seg.meu_uid_app())))
    or ((raiz = 'data'::text) and (colecao = ('data/users/'::text || (select seg.meu_uid_app()))) and (id = 'prefs'::text))
  )
);
