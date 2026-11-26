-- Reversão da V162 (20261125120000_seg_refeicoes_cozinha.sql): volta o controle da Cozinha a ser só de almoço (V160).
-- Antes: select seg.fazer_copia();
-- Os lançamentos de café e janta e os valores dessas refeições que já existirem continuam guardados em public.docs
-- (nada é apagado); com as regras da V160 eles só não podem mais ser mudados pela tela.

update seg.modulos
   set nome = 'Cozinha – controle de almoço',
       descricao = 'Almoço do dia na fábrica: quem almoçou, valor do almoço e cadastro rápido de funcionário (vai para o Setor Pessoal)'
 where codigo = 'cozinha';

-- as funções da V160, exatamente como eram
-- valor do almoço num dia: o último valor que começou até esse dia (no mesmo dia, o salvo por último)
create or replace function seg.almoco_preco(p_dia date)
 returns numeric language sql stable security definer set search_path to ''
as $function$
  select case when jsonb_typeof(x.v->'valor') = 'number' then (x.v->>'valor')::numeric end
  from public.docs d,
       jsonb_array_elements(case when jsonb_typeof(d.dados->'tabela') = 'array' then d.dados->'tabela' else '[]'::jsonb end)
         with ordinality x(v, i)
  where d.colecao = 'almocoCfg' and d.id = 'valor'
    and seg.almoco_entrada_valida(x.v) and seg.data_ou_nulo(x.v->>'desde') <= p_dia
  order by seg.data_ou_nulo(x.v->>'desde') desc, x.v->>'em' desc nulls last, x.i desc
  limit 1
$function$;

create or replace function seg.almoco_proteger()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  a jsonb; b jsonb; k text; va jsonb; vb jsonb; ea boolean; eb boolean; v_mudou text[] := '{}';
  v_uid text; v_agora text; v_hoje date; v_dia date; v_meses text[] := '{}'; v_m text; v_sit text;
  v_sim jsonb; v_sim_ant jsonb; v_valor numeric; v_hist jsonb;
begin
  -- manutenção pelo próprio banco (sem usuário na sessão): sem regra
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if jsonb_typeof(old.dados->'items') = 'object'
       and exists (select 1 from jsonb_each(old.dados->'items') e where jsonb_typeof(e.value) = 'object') then
      raise exception 'Lançamento de almoço não se apaga: para corrigir, marque SIM ou NÃO.' using errcode = 'JB409';
    end if;
    return old;
  end if;

  a := case when tg_op = 'UPDATE' then old.dados->'items' end;
  if jsonb_typeof(a) is distinct from 'object' then a := '{}'::jsonb; end if;
  b := coalesce(new.dados->'items', '{}'::jsonb);
  if jsonb_typeof(b) <> 'object' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;

  -- 1ª passada: o que mudou e de que meses; lançamento que já existe não some
  for k in select jsonb_object_keys(a) union select jsonb_object_keys(b) loop
    va := a->k; vb := b->k;
    ea := jsonb_typeof(va) = 'object'; eb := jsonb_typeof(vb) = 'object';
    continue when not ea and not eb;
    continue when ea and eb and va = vb;
    if not eb then
      raise exception 'Lançamento de almoço não se apaga: para corrigir, marque SIM ou NÃO.' using errcode = 'JB409';
    end if;
    v_mudou := v_mudou || k;
    if ea then v_meses := v_meses || left(va->>'data', 7); end if;
    v_meses := v_meses || left(vb->>'data', 7);
  end loop;
  if cardinality(v_mudou) = 0 then return new; end if;

  -- folha do mês fechada (ou paga) no Setor Pessoal: os almoços desse mês não mudam
  for v_m in select distinct x from unnest(v_meses) x where x is not null loop
    select d.dados->>'situacao' into v_sit from public.docs d where d.colecao = 'folhas' and d.id = v_m;
    if found and coalesce(v_sit, 'Aberta') <> 'Aberta' then
      raise exception 'A folha de %/% já foi fechada no Setor Pessoal. Os almoços desse mês não mudam mais: para corrigir, o Pessoal precisa reabrir a folha.',
        substr(v_m, 6, 2), left(v_m, 4) using errcode = 'JB423';
    end if;
  end loop;

  -- 2ª passada: confere cada lançamento que mudou e grava quem marcou, a hora e o valor do dia
  v_uid := coalesce(seg.meu_uid_app(), auth.uid()::text);
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_hoje := (now() at time zone 'America/Fortaleza')::date;
  foreach k in array v_mudou loop
    va := a->k; vb := b->k; ea := jsonb_typeof(va) = 'object';
    v_dia := seg.data_ou_nulo(vb->>'data');
    if v_dia is null or v_dia < date '2020-01-01' or v_dia > v_hoje + 1 then
      raise exception 'Dia do almoço inválido.' using errcode = '22023';
    end if;
    if k <> 'al-' || (vb->>'data') || '-' || coalesce(vb->>'funcionarioId', '')
       or (new.id ~ '^[0-9]{4}-[0-9]{2}' and left(new.id, 7) <> left(vb->>'data', 7)) then
      raise exception 'dados inválidos' using errcode = '22023';
    end if;
    if ea and ((va->>'funcionarioId') is distinct from (vb->>'funcionarioId') or (va->>'data') is distinct from (vb->>'data')) then
      raise exception 'O lançamento de almoço não muda de pessoa nem de dia.' using errcode = '22023';
    end if;
    if not exists (select 1 from public.docs f where f.colecao = 'funcionarios' and f.id = vb->>'funcionarioId') then
      raise exception 'Funcionário não encontrado no Setor Pessoal.' using errcode = '22023';
    end if;

    v_sim := case when vb->'sim' in ('true'::jsonb, 'false'::jsonb) then vb->'sim' else 'null'::jsonb end;
    v_sim_ant := case when not ea then null
                      when va->'sim' in ('true'::jsonb, 'false'::jsonb) then va->'sim' else 'null'::jsonb end;
    if v_sim = 'true'::jsonb then
      if v_sim_ant = 'true'::jsonb and jsonb_typeof(va->'valor') = 'number' then
        v_valor := (va->>'valor')::numeric;            -- o SIM que já existia guarda o valor de quando foi marcado
      else
        v_valor := seg.almoco_preco(v_dia);           -- SIM novo: o valor em vigor naquele dia
        if v_valor is null then
          raise exception 'O valor do almoço ainda não foi definido para %. Peça ao Setor Pessoal para definir o valor.',
            to_char(v_dia, 'DD/MM/YYYY') using errcode = 'JB422';
        end if;
      end if;
    else
      v_valor := 0;
    end if;
    v_hist := case when ea and jsonb_typeof(va->'hist') = 'array' then va->'hist' else '[]'::jsonb end;
    if not ea or v_sim_ant is distinct from v_sim then
      v_hist := v_hist || jsonb_build_array(jsonb_build_array(
        case when v_sim = 'true'::jsonb then '1'::jsonb when v_sim = 'false'::jsonb then '0'::jsonb else 'null'::jsonb end,
        v_uid, v_agora));
    end if;
    b := jsonb_set(b, array[k], jsonb_build_object('id', k, 'funcionarioId', vb->'funcionarioId', 'data', vb->'data',
      'sim', v_sim, 'valor', trim_scale(round(v_valor, 2)), 'hist', v_hist));
  end loop;

  new.dados := jsonb_set(new.dados, '{items}', b);
  return new;
end $function$;

create or replace function seg.almoco_cfg_proteger()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  ta jsonb; tb jsonb; e jsonb; n jsonb; v_uid text; v_agora text; v_hoje date; v_dia date;
  v_ids text[] := '{}'; v_tinha boolean; v_nova jsonb := '[]'::jsonb; v_obs text; v_val numeric;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'O valor do almoço não se apaga: para mudar, salve um valor novo.' using errcode = 'JB409';
  end if;
  if new.colecao <> 'almocoCfg' or new.id <> 'valor' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  ta := case when tg_op = 'UPDATE' then old.dados->'tabela' end;
  if jsonb_typeof(ta) is distinct from 'array' then ta := '[]'::jsonb; end if;
  tb := new.dados->'tabela';
  if jsonb_typeof(tb) is distinct from 'array' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  v_uid := coalesce(seg.meu_uid_app(), auth.uid()::text);
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_hoje := (now() at time zone 'America/Fortaleza')::date;
  v_tinha := exists (select 1 from jsonb_array_elements(ta) x where seg.almoco_entrada_valida(x));

  -- o que já estava salvo continua igual; só uma mudança que ainda não começou pode ser cancelada
  for e in select x from jsonb_array_elements(ta) x loop
    n := (select y from jsonb_array_elements(tb) y where jsonb_typeof(y) = 'object' and y->>'id' = e->>'id' limit 1);
    if n is null then
      raise exception 'Valor do almoço já salvo não some: para mudar, salve um valor novo.' using errcode = 'JB409';
    end if;
    if n is distinct from e then
      if jsonb_typeof(e->'cancelado') is distinct from 'object' and jsonb_typeof(n->'cancelado') = 'object'
         and (n - 'cancelado') = (e - 'cancelado') and seg.data_ou_nulo(e->>'desde') > v_hoje then
        n := e || jsonb_build_object('cancelado', jsonb_build_object('por', v_uid, 'em', v_agora));
      else
        raise exception 'Valor do almoço já salvo não muda: para mudar, salve um valor novo a partir de hoje.' using errcode = 'JB409';
      end if;
    end if;
    v_nova := v_nova || jsonb_build_array(n);
    v_ids := v_ids || (e->>'id');
  end loop;

  -- valores novos: daqui pra frente (o primeiro valor pode começar num dia que já passou)
  for e in select x from jsonb_array_elements(tb) x loop
    continue when jsonb_typeof(e) = 'object' and (e->>'id') = any(v_ids);
    if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'id', '') !~ '^[A-Za-z0-9_-]{4,60}$'
       or jsonb_typeof(e->'valor') is distinct from 'number' then
      raise exception 'dados inválidos' using errcode = '22023';
    end if;
    v_dia := seg.data_ou_nulo(e->>'desde');
    v_val := (e->>'valor')::numeric;
    if v_dia is null or v_dia < date '2020-01-01' or v_dia > v_hoje + 3660 or v_val < 0 or v_val > 1000 then
      raise exception 'Valor do almoço inválido.' using errcode = '22023';
    end if;
    if v_tinha and v_dia < v_hoje then
      raise exception 'O novo valor do almoço vale só daqui pra frente: escolha hoje ou um dia depois.' using errcode = 'JB422';
    end if;
    v_obs := nullif(left(btrim(coalesce(e->>'obs', '')), 140), '');
    v_nova := v_nova || jsonb_build_array(jsonb_build_object('id', e->'id', 'desde', e->'desde',
      'valor', trim_scale(round(v_val, 2)), 'por', v_uid, 'em', v_agora)
      || case when v_obs is not null then jsonb_build_object('obs', v_obs) else '{}'::jsonb end);
    v_ids := v_ids || (e->>'id');
  end loop;

  new.dados := jsonb_set(new.dados, '{tabela}', v_nova) || jsonb_build_object('alteradoEm', v_agora, 'alteradoPor', v_uid);
  return new;
end $function$;

revoke all on function seg.almoco_proteger() from public, anon, authenticated;
revoke all on function seg.almoco_cfg_proteger() from public, anon, authenticated;
revoke all on function seg.almoco_preco(date) from public, anon, authenticated;

drop function if exists seg.almoco_preco(date, text);
drop function if exists seg.almoco_ref(text);
