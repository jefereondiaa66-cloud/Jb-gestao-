-- V162 (25/11/2026): Controle de refeições da Cozinha: café, almoço e janta (antes só almoço, V160).
-- Pedido do dono: "Lá vai ser café, almoço e janta [...] Continue prático como tá agora, só apertando em SIM, nos que
-- não forem apertado nem SIM nem NÃO, coloque automaticamente como NÃO".
--
-- Só acrescenta. Nenhum lançamento nem valor já salvo muda; nenhuma regra fica mais fraca:
--  1. seg.modulos: o módulo "cozinha" passa a se chamar "Cozinha – controle de refeições" (só o nome e a descrição).
--  2. seg.almoco_preco(dia, refeição): o valor de cada refeição num dia. Valor sem "ref" é do almoço (o de 24/11/2026).
--     seg.almoco_preco(dia), da V160, continua existindo e dá o valor do almoço.
--  3. Gatilho seg.almoco_proteger: cada lançamento é de uma refeição ("ref": cafe, almoco ou janta), com o código
--     cf-, al- ou jt- + dia + funcionário. Lançamento sem "ref" e com código al- é almoço (os de 24/11/2026).
--     O SIM novo leva o valor daquela refeição no dia; lançamento não muda de refeição. O resto é igual à V160
--     (folha fechada trava o mês, nada se apaga, o banco grava quem marcou e a hora).
--     Quem não foi marcado conta como NÃO: só o SIM desconta na folha (isso é da tela e da folha, nada a mudar aqui).
--     Correção junto: tirar um lançamento de dentro da parte do mês agora volta a mensagem certa ("não se apaga"); antes
--     a V160 também recusava, mas dizendo "dia inválido" (comparação com nulo).
--  4. Gatilho seg.almoco_cfg_proteger: cada valor da tabela é de uma refeição; o primeiro valor de cada refeição pode
--     começar num dia que já passou, os seguintes só de hoje em diante. Valor salvo continua sem mudar nem sumir.
-- Sem usuário na sessão (manutenção pelo próprio banco, cópia de segurança) os gatilhos continuam sem agir.
--
-- Cópia de segurança nº 76 antes (seg.copias, 25/11/2026 12:10 UTC, 754 registros). Testada antes no banco real, dentro de
-- uma transação desfeita no fim (21 de 21: valores por refeição, lançamentos de café, almoço e janta, o almoço antigo sem
-- "ref", trava da folha paga, nada apagado).
-- Reverter: 20261125120000_seg_refeicoes_cozinha.down.sql (volta as funções da V160; os lançamentos de café e janta
-- que já existirem continuam guardados, mas a V160 passa a recusar mudá-los).

-- 1. nome do módulo
update seg.modulos
   set nome = 'Cozinha – controle de refeições',
       descricao = 'Café, almoço e janta na fábrica: quem comeu, valor de cada refeição e cadastro rápido de funcionário (vai para o Setor Pessoal)'
 where codigo = 'cozinha';

-- 2. valor de uma refeição num dia: o último valor daquela refeição que começou até esse dia (no mesmo dia, o salvo por último)
create or replace function seg.almoco_ref(p text)
 returns text language sql immutable set search_path to ''
as $function$
  select case when p in ('cafe', 'almoco', 'janta') then p when p is null then 'almoco' end
$function$;

create or replace function seg.almoco_preco(p_dia date, p_ref text)
 returns numeric language sql stable security definer set search_path to ''
as $function$
  select case when jsonb_typeof(x.v->'valor') = 'number' then (x.v->>'valor')::numeric end
  from public.docs d,
       jsonb_array_elements(case when jsonb_typeof(d.dados->'tabela') = 'array' then d.dados->'tabela' else '[]'::jsonb end)
         with ordinality x(v, i)
  where d.colecao = 'almocoCfg' and d.id = 'valor'
    and seg.almoco_entrada_valida(x.v) and seg.data_ou_nulo(x.v->>'desde') <= p_dia
    and seg.almoco_ref(x.v->>'ref') is not distinct from p_ref
  order by seg.data_ou_nulo(x.v->>'desde') desc, x.v->>'em' desc nulls last, x.i desc
  limit 1
$function$;

-- o da V160 continua: valor do almoço
create or replace function seg.almoco_preco(p_dia date)
 returns numeric language sql stable security definer set search_path to ''
as $function$
  select seg.almoco_preco(p_dia, 'almoco')
$function$;

-- 3. lançamentos: um por pessoa, dia e refeição
create or replace function seg.almoco_proteger()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  a jsonb; b jsonb; k text; va jsonb; vb jsonb; ea boolean; eb boolean; v_mudou text[] := '{}';
  v_uid text; v_agora text; v_hoje date; v_dia date; v_meses text[] := '{}'; v_m text; v_sit text;
  v_sim jsonb; v_sim_ant jsonb; v_valor numeric; v_hist jsonb; v_ref text; v_pre text; v_nome text;
begin
  -- manutenção pelo próprio banco (sem usuário na sessão): sem regra
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if jsonb_typeof(old.dados->'items') = 'object'
       and exists (select 1 from jsonb_each(old.dados->'items') e where jsonb_typeof(e.value) = 'object') then
      raise exception 'Lançamento de refeição não se apaga: para corrigir, marque SIM ou NÃO.' using errcode = 'JB409';
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
    ea := coalesce(jsonb_typeof(va) = 'object', false); eb := coalesce(jsonb_typeof(vb) = 'object', false);
    continue when not ea and not eb;
    continue when ea and eb and va = vb;
    if not eb then
      raise exception 'Lançamento de refeição não se apaga: para corrigir, marque SIM ou NÃO.' using errcode = 'JB409';
    end if;
    v_mudou := v_mudou || k;
    if ea then v_meses := v_meses || left(va->>'data', 7); end if;
    v_meses := v_meses || left(vb->>'data', 7);
  end loop;
  if cardinality(v_mudou) = 0 then return new; end if;

  -- folha do mês fechada (ou paga) no Setor Pessoal: as refeições desse mês não mudam
  for v_m in select distinct x from unnest(v_meses) x where x is not null loop
    select d.dados->>'situacao' into v_sit from public.docs d where d.colecao = 'folhas' and d.id = v_m;
    if found and coalesce(v_sit, 'Aberta') <> 'Aberta' then
      raise exception 'A folha de %/% já foi fechada no Setor Pessoal. As refeições desse mês não mudam mais: para corrigir, o Pessoal precisa reabrir a folha.',
        substr(v_m, 6, 2), left(v_m, 4) using errcode = 'JB423';
    end if;
  end loop;

  -- 2ª passada: confere cada lançamento que mudou e grava quem marcou, a hora e o valor da refeição no dia
  v_uid := coalesce(seg.meu_uid_app(), auth.uid()::text);
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_hoje := (now() at time zone 'America/Fortaleza')::date;
  foreach k in array v_mudou loop
    va := a->k; vb := b->k; ea := coalesce(jsonb_typeof(va) = 'object', false);
    v_dia := seg.data_ou_nulo(vb->>'data');
    if v_dia is null or v_dia < date '2020-01-01' or v_dia > v_hoje + 1 then
      raise exception 'Dia da refeição inválido.' using errcode = '22023';
    end if;
    -- a refeição: a do lançamento (sem "ref" é almoço); o código começa com cf-, al- ou jt-
    v_ref := seg.almoco_ref(vb->>'ref');
    if v_ref is null or jsonb_typeof(coalesce(vb->'ref', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'Refeição inválida: use café, almoço ou janta.' using errcode = '22023';
    end if;
    v_pre := case v_ref when 'cafe' then 'cf' when 'janta' then 'jt' else 'al' end;
    v_nome := case v_ref when 'cafe' then 'do café' when 'janta' then 'da janta' else 'do almoço' end;
    if k <> v_pre || '-' || (vb->>'data') || '-' || coalesce(vb->>'funcionarioId', '')
       or (new.id ~ '^[0-9]{4}-[0-9]{2}' and left(new.id, 7) <> left(vb->>'data', 7)) then
      raise exception 'dados inválidos' using errcode = '22023';
    end if;
    if ea and ((va->>'funcionarioId') is distinct from (vb->>'funcionarioId') or (va->>'data') is distinct from (vb->>'data')
               or seg.almoco_ref(va->>'ref') is distinct from v_ref) then
      raise exception 'O lançamento da refeição não muda de pessoa, de dia nem de refeição.' using errcode = '22023';
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
        v_valor := seg.almoco_preco(v_dia, v_ref);    -- SIM novo: o valor daquela refeição em vigor naquele dia
        if v_valor is null then
          raise exception 'O valor % ainda não foi definido para %. Peça ao Setor Pessoal para definir o valor.',
            v_nome, to_char(v_dia, 'DD/MM/YYYY') using errcode = 'JB422';
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
      'ref', v_ref, 'sim', v_sim, 'valor', trim_scale(round(v_valor, 2)), 'hist', v_hist));
  end loop;

  new.dados := jsonb_set(new.dados, '{items}', b);
  return new;
end $function$;

-- 4. valores: cada um é de uma refeição
create or replace function seg.almoco_cfg_proteger()
 returns trigger language plpgsql security definer set search_path to ''
as $function$
declare
  ta jsonb; tb jsonb; e jsonb; n jsonb; v_uid text; v_agora text; v_hoje date; v_dia date;
  v_ids text[] := '{}'; v_tinha boolean; v_nova jsonb := '[]'::jsonb; v_obs text; v_val numeric; v_ref text; v_nome text;
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'O valor das refeições não se apaga: para mudar, salve um valor novo.' using errcode = 'JB409';
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

  -- o que já estava salvo continua igual; só uma mudança que ainda não começou pode ser cancelada
  for e in select x from jsonb_array_elements(ta) x loop
    n := (select y from jsonb_array_elements(tb) y where jsonb_typeof(y) = 'object' and y->>'id' = e->>'id' limit 1);
    if n is null then
      raise exception 'Valor de refeição já salvo não some: para mudar, salve um valor novo.' using errcode = 'JB409';
    end if;
    if n is distinct from e then
      if jsonb_typeof(e->'cancelado') is distinct from 'object' and jsonb_typeof(n->'cancelado') = 'object'
         and (n - 'cancelado') = (e - 'cancelado') and seg.data_ou_nulo(e->>'desde') > v_hoje then
        n := e || jsonb_build_object('cancelado', jsonb_build_object('por', v_uid, 'em', v_agora));
      else
        raise exception 'Valor de refeição já salvo não muda: para mudar, salve um valor novo a partir de hoje.' using errcode = 'JB409';
      end if;
    end if;
    v_nova := v_nova || jsonb_build_array(n);
    v_ids := v_ids || (e->>'id');
  end loop;

  -- valores novos: daqui pra frente (o primeiro valor de cada refeição pode começar num dia que já passou)
  for e in select x from jsonb_array_elements(tb) x loop
    continue when jsonb_typeof(e) = 'object' and (e->>'id') = any(v_ids);
    if jsonb_typeof(e) is distinct from 'object' or coalesce(e->>'id', '') !~ '^[A-Za-z0-9_-]{4,60}$'
       or jsonb_typeof(e->'valor') is distinct from 'number'
       or jsonb_typeof(coalesce(e->'ref', 'null'::jsonb)) not in ('string', 'null') then
      raise exception 'dados inválidos' using errcode = '22023';
    end if;
    v_ref := seg.almoco_ref(e->>'ref');
    if v_ref is null then
      raise exception 'Refeição inválida: use café, almoço ou janta.' using errcode = '22023';
    end if;
    v_nome := case v_ref when 'cafe' then 'do café' when 'janta' then 'da janta' else 'do almoço' end;
    v_dia := seg.data_ou_nulo(e->>'desde');
    v_val := (e->>'valor')::numeric;
    if v_dia is null or v_dia < date '2020-01-01' or v_dia > v_hoje + 3660 or v_val < 0 or v_val > 1000 then
      raise exception 'Valor % inválido.', v_nome using errcode = '22023';
    end if;
    v_tinha := exists (select 1 from jsonb_array_elements(ta) x
                       where seg.almoco_entrada_valida(x) and seg.almoco_ref(x->>'ref') is not distinct from v_ref);
    if v_tinha and v_dia < v_hoje then
      raise exception 'O novo valor % vale só daqui pra frente: escolha hoje ou um dia depois.', v_nome using errcode = 'JB422';
    end if;
    v_obs := nullif(left(btrim(coalesce(e->>'obs', '')), 140), '');
    v_nova := v_nova || jsonb_build_array(jsonb_build_object('id', e->'id', 'ref', v_ref, 'desde', e->'desde',
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
revoke all on function seg.almoco_preco(date, text) from public, anon, authenticated;
revoke all on function seg.almoco_ref(text) from public, anon, authenticated;
