-- V160 (24/11/2026): Controle de almoço da Cozinha (Setor do Almoxarifado / Cozinha, parte da Cozinha).
-- A Cozinha marca, dia a dia, quem almoçou na fábrica (SIM ou NÃO). Cada SIM vira o desconto "Desconto refeição"
-- na folha do mês de cada funcionário no Setor Pessoal.
--
-- Só acrescenta. Nenhum dado existente muda e nenhuma regra antiga fica mais fraca:
--  1. seg.modulos: módulo novo "cozinha" (Cozinha – controle de almoço), para o perfil Cozinha.
--  2. seg.colecoes: duas coleções novas, com trilha de auditoria:
--       almoco     os lançamentos do dia (um item por pessoa e dia, agrupados por mês), módulo cozinha
--       almocoCfg  o valor do almoço por dia (tabela com a data em que cada valor passa a valer), módulo folha
--  3. seg.leitura_compartilhada: o Setor Pessoal (dp e folha) lê os almoços, para a folha; a Cozinha e o dp leem o valor.
--  4. seg.escrita_item: quem tem a folha (Setor Pessoal) também pode corrigir um lançamento de almoço.
--     Os casos que já existiam (fin, alm, prodGrade) ficam exatamente como estavam.
--  5. public.jb_compartilhados(): a Cozinha recebe só nome, função e datas dos funcionários (como o Almoxarifado já
--     recebia, agora com a data de desligamento) e só a situação da folha de cada mês ("almocoFolhas"), para travar
--     na tela o mês já fechado. Salário, CPF e dados pessoais (coleção "sensivel") continuam só para o Setor Pessoal.
--  6. Gatilho seg.almoco_proteger, só na coleção almoco, para todo mundo (inclusive administrador e a ponte do Claude):
--       · mês com a folha fechada ou paga no Setor Pessoal não muda (a folha reaberta volta a aceitar);
--       · lançamento não se apaga: para corrigir, marca-se SIM ou NÃO (a troca fica no histórico);
--       · o banco grava quem marcou e a hora (histórico) e o valor do dia: um SIM novo leva o valor em vigor
--         naquele dia; um SIM que já existia guarda o valor de quando foi marcado.
--  7. Gatilho seg.almoco_cfg_proteger, só em almocoCfg: o valor vale só daqui pra frente (o primeiro valor pode
--     começar num dia passado); valor salvo não muda nem some; uma mudança agendada pode ser cancelada antes de valer.
--  8. public.jb_almoco_cadastrar(p): cadastro rápido de funcionário feito na Cozinha (nome, CPF, função, admissão),
--     direto no cadastro do Setor Pessoal, com o CPF na parte protegida, conferindo CPF repetido no servidor.
-- Sem usuário na sessão (manutenção feita pelo próprio banco, cópia de segurança) os dois gatilhos não agem.
--
-- Cópia de segurança nº 72 antes (seg.copias, 24/11/2026 13:19 UTC, 741 registros). Testada antes no banco real, dentro de
-- uma transação desfeita no fim (37 de 37: valor, lançamentos, trava da folha, leitura, cadastro rápido e a ponte do Claude).
-- Reverter: 20261124130000_seg_almoco_cozinha.down.sql

-- 1. módulo do perfil Cozinha
insert into seg.modulos (codigo, nome, ordem, descricao) values
  ('cozinha', 'Cozinha – controle de almoço', 15,
   'Almoço do dia na fábrica: quem almoçou, valor do almoço e cadastro rápido de funcionário (vai para o Setor Pessoal)')
on conflict (codigo) do nothing;

-- 2. coleções novas
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar) values
  ('almoco',    'cozinha', true,  'dados', true),
  ('almocoCfg', 'folha',   false, 'dados', true)
on conflict (raiz) do nothing;

-- 3. quem mais lê
insert into seg.leitura_compartilhada (raiz, modulo, motivo) values
  ('almoco',    'dp',      'Setor Pessoal: desconto refeição no extrato, no holerite e na folha'),
  ('almoco',    'folha',   'Folha de pagamento: desconto refeição (almoços do mês × valor do dia)'),
  ('almocoCfg', 'cozinha', 'Cozinha: valor do almoço do dia'),
  ('almocoCfg', 'dp',      'Setor Pessoal: valor do almoço')
on conflict (raiz, modulo) do nothing;

-- 4. o Setor Pessoal (folha) também corrige um lançamento de almoço
create or replace function seg.escrita_item(p_raiz text, p_item jsonb)
 returns text language sql immutable set search_path to ''
as $function$
  select case
    when p_item is null or jsonb_typeof(p_item) <> 'object' then null
    when p_raiz = 'fin' then case p_item->>'tipo'
      when 'terceiro' then 'compras'
      when 'responsavel' then case
        when p_item->>'aba' in ('Óleo e combustível', 'Lenha', 'Almoxarifado / Cozinha', 'Barro', 'Paletes')
          then seg.modulo_da_aba(p_item->>'aba') end
      when 'titulo' then seg.modulo_da_origem(p_item->>'setorOrigem')
    end
    when p_raiz = 'alm' and p_item->>'jbt' = 'item' and p_item->>'origemCadastro' = 'Setor da Lenha'
      and coalesce(p_item->>'categoria', '') <> 'Cozinha' then 'compras'
    when p_raiz = 'alm' and p_item->>'jbt' = 'saida' and jsonb_typeof(p_item->'pagLenha') = 'object'
      and coalesce(p_item->'pagLenha'->>'fornecedorId', '') <> '' then 'compras'
    when p_raiz = 'alm' and p_item->>'jbt' = 'entrada' and coalesce(p_item->>'paraFornLenha', '') <> '' then 'compras'
    -- V156: pagamento por grade registrado pelo Setor Financeiro
    when p_raiz = 'prodGrade' and p_item->>'tipo' = 'pag' then 'financeiro'
    -- V160: lançamento de almoço corrigido pelo Setor Pessoal
    when p_raiz = 'almoco' then 'folha'
  end
$function$;

-- 5. o que a nuvem entrega à Cozinha
create or replace function public.jb_compartilhados()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
declare
  v_leg text[]; v_mods text[]; v_parciais text[] := '{}'; v_docs jsonb := '[]'::jsonb;
  r record; v_itens jsonb; k text; v jsonb; v_raiz text;
begin
  if not seg.liberado() or seg.eh_admin() then
    return jsonb_build_object('parciais', '[]'::jsonb, 'docs', '[]'::jsonb);
  end if;
  v_leg := seg.raizes_legiveis();
  select coalesce(array_agg(m.codigo), '{}'::text[]) into v_mods from seg.modulos m where seg.pode(m.codigo, 'ler');
  if cardinality(v_mods) = 0 then
    return jsonb_build_object('parciais', '[]'::jsonb, 'docs', '[]'::jsonb);
  end if;

  -- coleções agrupadas: só os itens que o setor da pessoa usa
  foreach v_raiz in array array['fin', 'barro'] loop
    continue when v_raiz = any(v_leg);
    v_parciais := v_parciais || v_raiz;
    for r in select d.colecao, d.id, d.dados from public.docs d where d.raiz = v_raiz order by d.colecao, d.id loop
      v_itens := '{}'::jsonb;
      if jsonb_typeof(r.dados->'items') = 'object' then
        for k, v in select e.key, e.value from jsonb_each(r.dados->'items') e loop
          if seg.leitura_item(v_raiz, v) && v_mods then
            if v_raiz = 'fin' and v->>'tipo' = 'conta' then
              v := v - 'saldoInicial' - 'dataSaldoInicial' - 'obs';
            end if;
            v_itens := v_itens || jsonb_build_object(k, v);
          end if;
        end loop;
      end if;
      if v_itens <> '{}'::jsonb then
        v_docs := v_docs || jsonb_build_array(jsonb_build_object('colecao', r.colecao, 'id', r.id,
          'dados', (r.dados - 'items') || jsonb_build_object('items', v_itens)));
      end if;
    end loop;
  end loop;

  -- funcionários: só nome, função e datas, para o Almoxarifado (EPI, empréstimo de ferramenta, requisição)
  -- e para a Cozinha (V160: lista do almoço; a data de desligamento mostra quem ainda trabalhava num dia passado)
  if ('almox' = any(v_mods) or 'cozinha' = any(v_mods)) and not ('funcionarios' = any(v_leg)) then
    v_parciais := v_parciais || 'funcionarios'::text;
    for r in select d.colecao, d.id, d.dados from public.docs d where d.colecao = 'funcionarios' order by d.id loop
      v_docs := v_docs || jsonb_build_array(jsonb_build_object('colecao', r.colecao, 'id', r.id,
        'dados', jsonb_strip_nulls(jsonb_build_object(
          'id', r.dados->'id', 'nome', r.dados->'nome', 'matricula', r.dados->'matricula',
          'situacao', r.dados->'situacao', 'cargo', r.dados->'cargo', 'setor', r.dados->'setor',
          'departamento', r.dados->'departamento', 'admissao', r.dados->'admissao',
          'dataDesligamento', r.dados->'dataDesligamento'))));
    end loop;
  end if;

  -- V160: só a situação da folha de cada mês, para a Cozinha travar na tela o mês já fechado no Setor Pessoal
  if 'cozinha' = any(v_mods) and not ('folhas' = any(v_leg)) then
    v_parciais := v_parciais || 'almocoFolhas'::text;
    for r in select d.id, d.dados from public.docs d where d.colecao = 'folhas' order by d.id loop
      v_docs := v_docs || jsonb_build_array(jsonb_build_object('colecao', 'almocoFolhas', 'id', r.id,
        'dados', jsonb_strip_nulls(jsonb_build_object('id', r.id, 'competencia', r.dados->'competencia',
          'situacao', r.dados->'situacao', 'fechadoEm', r.dados->'fechadoEm', 'pagoEm', r.dados->'pagoEm'))));
    end loop;
  end if;

  return jsonb_build_object('parciais', to_jsonb(v_parciais), 'docs', v_docs);
end $function$;

revoke all on function public.jb_compartilhados() from public, anon;
grant execute on function public.jb_compartilhados() to authenticated;

-- 6 e 7. regras do banco para o almoço
-- texto "AAAA-MM-DD" válido vira data; o resto vira nulo
create or replace function seg.data_ou_nulo(p text)
 returns date language plpgsql immutable set search_path to ''
as $function$
begin
  if p is null or p !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end $function$;

-- CPF com os dois dígitos verificadores certos (só os 11 números)
create or replace function seg.cpf_valido(p text)
 returns boolean language plpgsql immutable set search_path to ''
as $function$
declare d int[]; s int; i int;
begin
  if p is null or p !~ '^[0-9]{11}$' or p = repeat(left(p, 1), 11) then return false; end if;
  d := array(select substr(p, g.n, 1)::int from generate_series(1, 11) g(n));
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  if (s * 10) % 11 % 10 <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  return (s * 10) % 11 % 10 = d[11];
end $function$;

-- uma linha da tabela de valores do almoço que vale (não cancelada, com data e valor)
create or replace function seg.almoco_entrada_valida(x jsonb)
 returns boolean language sql immutable set search_path to ''
as $function$
  select case
    when jsonb_typeof(x) is distinct from 'object' then false
    when jsonb_typeof(x->'cancelado') = 'object' then false
    when jsonb_typeof(x->'valor') is distinct from 'number' then false
    when seg.data_ou_nulo(x->>'desde') is null then false
    else (x->>'valor')::numeric >= 0
  end
$function$;

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

-- os gatilhos só agem nas duas coleções do almoço
create or replace trigger docs_almoco_proteger_iu
  before insert or update on public.docs
  for each row when (split_part(new.colecao, '/', 1) = 'almoco')
  execute function seg.almoco_proteger();
create or replace trigger docs_almoco_proteger_d
  before delete on public.docs
  for each row when (split_part(old.colecao, '/', 1) = 'almoco')
  execute function seg.almoco_proteger();
create or replace trigger docs_almoco_cfg_proteger_iu
  before insert or update on public.docs
  for each row when (split_part(new.colecao, '/', 1) = 'almocoCfg')
  execute function seg.almoco_cfg_proteger();
create or replace trigger docs_almoco_cfg_proteger_d
  before delete on public.docs
  for each row when (split_part(old.colecao, '/', 1) = 'almocoCfg')
  execute function seg.almoco_cfg_proteger();

-- 8. cadastro rápido de funcionário pela Cozinha: direto no cadastro do Setor Pessoal
create or replace function public.jb_almoco_cadastrar(p jsonb)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
  v_id text; v_nome text; v_cpf text; v_cargo text; v_adm date; v_hoje date; v_mat text;
  v_uid text; v_agora text; v_dados jsonb;
begin
  if not seg.liberado() then
    raise exception 'sessão encerrada ou inválida' using errcode = '28000';
  end if;
  if not (seg.eh_admin() or seg.pode('cozinha', 'criar') or seg.pode('dp', 'criar')) then
    raise exception 'Seu perfil não faz cadastro de funcionário.' using errcode = '42501';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  v_id := p->>'id';
  if v_id is null or v_id !~ '^[A-Za-z0-9_-]{6,60}$' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  v_nome := regexp_replace(btrim(coalesce(p->>'nome', '')), '\s+', ' ', 'g');
  if length(v_nome) < 5 or length(v_nome) > 120 or position(' ' in v_nome) = 0 then
    raise exception 'Escreva o nome completo do funcionário (nome e sobrenome).' using errcode = '22023';
  end if;
  v_cpf := regexp_replace(coalesce(p->>'cpf', ''), '[^0-9]', '', 'g');
  if not seg.cpf_valido(v_cpf) then
    raise exception 'CPF inválido. Confira os 11 números.' using errcode = '22023';
  end if;
  v_cargo := nullif(left(regexp_replace(btrim(coalesce(p->>'cargo', '')), '\s+', ' ', 'g'), 80), '');
  v_hoje := (now() at time zone 'America/Fortaleza')::date;
  v_adm := seg.data_ou_nulo(p->>'admissao');
  if v_adm is null or v_adm < date '1950-01-01' or v_adm > v_hoje + 366 then
    raise exception 'Data de admissão inválida.' using errcode = '22023';
  end if;

  -- um cadastro por vez: matrícula sem repetir e CPF conferido
  perform pg_advisory_xact_lock(hashtext('jb-funcionario-novo'));
  if exists (select 1 from public.docs d where d.colecao in ('funcionarios', 'sensivel') and d.id = v_id) then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  if exists (select 1 from public.docs s join public.docs f on f.colecao = 'funcionarios' and f.id = s.id
             where s.colecao = 'sensivel' and regexp_replace(coalesce(s.dados->>'cpf', ''), '[^0-9]', '', 'g') = v_cpf) then
    raise exception 'Este CPF já está cadastrado no Setor Pessoal. Procure o nome na lista ou fale com o Setor Pessoal.' using errcode = 'JB409';
  end if;
  select lpad((coalesce(max(case when m ~ '^[0-9]{1,9}$' then m::int end), 0) + 1)::text, 4, '0') into v_mat
  from (select regexp_replace(coalesce(f.dados->>'matricula', ''), '[^0-9]', '', 'g') as m
        from public.docs f where f.colecao = 'funcionarios') q;

  v_uid := coalesce(seg.meu_uid_app(), auth.uid()::text);
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_dados := jsonb_build_object('id', v_id, 'nome', v_nome, 'situacao', 'Ativo', 'admissao', to_char(v_adm, 'YYYY-MM-DD'),
    'matricula', v_mat, 'cadastroRapido', jsonb_build_object('origem', 'Cozinha', 'por', v_uid, 'em', v_agora),
    'criadoEm', v_agora, 'criadoPor', v_uid, 'alteradoEm', v_agora, 'alteradoPor', v_uid)
    || case when v_cargo is not null then jsonb_build_object('cargo', v_cargo) else '{}'::jsonb end;
  insert into public.docs (colecao, id, dados, criado_por, atualizado_por)
    values ('funcionarios', v_id, v_dados, auth.uid(), auth.uid());
  insert into public.docs (colecao, id, dados, criado_por, atualizado_por)
    values ('sensivel', v_id, jsonb_build_object('id', v_id, 'cpf', v_cpf), auth.uid(), auth.uid());
  perform seg.tocar_sessao();
  return jsonb_build_object('id', v_id, 'matricula', v_mat);
end $function$;

revoke all on function public.jb_almoco_cadastrar(jsonb) from public, anon;
grant execute on function public.jb_almoco_cadastrar(jsonb) to authenticated;
