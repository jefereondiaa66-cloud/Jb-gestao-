-- Reverte 20261104231500_seg_preferencias_so_proprio.sql (volta ao estado de 20261104230000)
CREATE OR REPLACE FUNCTION seg.raizes_legiveis()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(array_agg(c.raiz), '{}'::text[])
  from seg.colecoes c
  where seg.liberado() and (c.tipo = 'geral' or seg.pode(c.modulo, 'ler'))
$function$;

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
    if v_raiz = 'data' and v_eu is not null and p_colecao = 'data/users/' || v_eu and p_id = 'prefs' then return true; end if;
  end if;
  return seg.pode(c.modulo, 'ler');
end $function$;
