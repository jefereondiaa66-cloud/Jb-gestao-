-- Reversão de 20261116150000_seg_compartilhar_setores.sql.
-- Volta a leitura e a gravação por módulo como eram antes de 16/11/2026: cada pessoa volta a ver
-- só as coleções dos módulos dela (os terceiros, responsáveis e contas somem de novo para quem não
-- tem o Financeiro). Nenhum dado é apagado: compromissos e cadastros lançados continuam no banco.
-- A nuvem segue funcionando sem public.jb_compartilhados (o adaptador ignora a falta da função).

drop trigger if exists docs_fin_numero on public.docs;
drop function if exists seg.fin_numerar();
drop function if exists public.jb_compartilhados();

create or replace function seg.raizes_legiveis()
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(array_agg(c.raiz), '{}'::text[])
  from seg.colecoes c
  where seg.liberado() and (c.tipo = 'geral' or seg.pode(c.modulo, 'ler')
         or (c.raiz = 'produtos' and seg.pode('vendas', 'ler')))
    and c.raiz <> 'data'   -- V68: preferências de cada pessoa, só a própria
$function$;

create or replace function seg.verificar_escrita(p_colecao text, p_id text, p_antes jsonb, p_depois jsonb)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

drop function if exists seg.escrita_item(text, jsonb);
drop function if exists seg.leitura_item(text, jsonb);
drop function if exists seg.modulo_da_origem(text);
drop function if exists seg.modulo_da_aba(text);
drop table if exists seg.leitura_compartilhada;
