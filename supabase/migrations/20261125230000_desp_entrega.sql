-- =====================================================================================================
-- V177 · Despesas de Entrega (módulo do Setor de Combustível com acesso do motorista pelo celular)
-- 25/11/2026 · pedido do Jeferson ("Projeto do Módulo Despesas de Entrega")
--
-- Só ACRESCENTA: nenhuma função, regra, tabela ou dado que já existe é trocado, apagado ou convertido.
--  1. Duas coleções novas, no módulo "compras" (o mesmo do Setor de Combustível):
--       despEnt     lançamentos de despesa (tipo "desp") e viagens (tipo "viagem"), agrupados por mês
--       despEntCad  cadastro dos motoristas (um documento por motorista) e a configuração ("cfg")
--  2. O login do motorista fica ligado ao cadastro dele (campo userId do documento em despEntCad).
--     Só o administrador liga, troca ou tira esse login (gatilho seg.desp_proteger).
--  3. Login de motorista (que não é administrador) não lê nenhum documento pelo acesso direto
--     (política restritiva nova em public.docs), não grava nada pelo acesso direto (gatilho novo
--     seg.motorista_nao_grava) e só abre as fotos que ele mesmo enviou (política restritiva nova nos
--     anexos). Tudo o que ele vê e grava passa pelas funções jb_mot_*, que conferem cada campo no servidor.
--  4. Gatilho seg.desp_proteger: número único de lançamentos e viagens; lançamento e viagem não são
--     apagados; aprovar, rejeitar e pedir correção só quem aprova; lançamento aprovado só é corrigido
--     por quem aprova; a configuração do módulo só o administrador muda.
--
-- Reversão: 20261125230000_desp_entrega.down.sql (tira as políticas, os gatilhos e as funções novas e
-- as duas coleções de seg.colecoes). Os documentos gravados em despEnt/despEntCad ficam guardados.
-- Antes de aplicar: select seg.fazer_copia();
-- =====================================================================================================

-- 1. coleções do módulo ---------------------------------------------------------------------------------
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar) values
  ('despEnt', 'compras', true, 'dados', true),
  ('despEntCad', 'compras', false, 'dados', true)
on conflict (raiz) do nothing;

-- 2. login de motorista: ligado a um cadastro de motorista (e não é administrador) -----------------------
create or replace function seg.eh_motorista() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
     and exists (select 1 from public.docs d
                  where d.colecao = 'despEntCad' and d.dados->>'tipo' = 'motorista'
                    and d.dados->>'userId' = (select auth.uid())::text)
     and not exists (select 1 from seg.perfis p where p.user_id = (select auth.uid()) and p.admin)
$$;

-- para a nuvem levar o motorista direto para a página dele
create or replace function public.jb_mot_sou() returns boolean
language sql stable security definer set search_path = '' as $$
  select seg.liberado() and seg.eh_motorista()
$$;

-- 3. motorista fora do acesso direto: não lê documentos, não grava, e só abre as próprias fotos ---------
create policy docs_motorista_nao_le on public.docs as restrictive for select to authenticated
  using (not seg.eh_motorista());

create policy jb_anexos_motorista on storage.objects as restrictive for select to authenticated
  using (bucket_id <> 'anexos' or not seg.eh_motorista() or owner_id = (select auth.uid())::text);

create or replace function seg.motorista_nao_grava() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('jb.desp_rpc', true), '') <> 'on' and seg.eh_motorista() then
    raise exception 'Este login é de motorista: os lançamentos são feitos pela página do motorista.' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- "aa" no nome: dispara antes dos outros gatilhos (a mensagem certa aparece primeiro)
create trigger docs_aa_motorista_nao_grava before insert or update or delete on public.docs
  for each row execute function seg.motorista_nao_grava();

-- 4. utilidades do módulo ---------------------------------------------------------------------------------
-- o mesmo "hashTxt" do programa (app/jb-gestao.html): escolhe em qual das 8 partes do mês o registro mora
create or replace function seg.desp_hash(p text) returns bigint
language plpgsql immutable set search_path = '' as $$
declare h bigint := 0; i int;
begin
  for i in 1 .. coalesce(length(p), 0) loop
    h := h * 31 + ascii(substr(p, i, 1));
    h := ((h % 4294967296) + 4294967296) % 4294967296;
    if h >= 2147483648 then h := h - 4294967296; end if;
  end loop;
  return abs(h);
end $$;

create or replace function seg.desp_chave(p_data text, p_id text) returns text
language sql immutable set search_path = '' as $$
  select left(p_data, 7) || '-s' || (seg.desp_hash(p_id) % 8)::text
$$;

create or replace function seg.desp_agora() returns timestamp
language sql stable set search_path = '' as $$ select (now() at time zone 'America/Fortaleza') $$;

create or replace function seg.desp_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select d.dados from public.docs d where d.colecao = 'despEntCad' and d.id = 'cfg'), '{}'::jsonb)
$$;

-- regra da configuração (sim/não), com o padrão quando não foi definida
create or replace function seg.desp_regra(p_cfg jsonb, p_chave text, p_padrao boolean) returns boolean
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_cfg->'regras'->p_chave) = 'boolean' then (p_cfg->'regras'->>p_chave)::boolean else p_padrao end
$$;

-- destino financeiro de cada tipo (o motorista nunca escolhe): o da configuração ou o padrão do projeto
create or replace function seg.desp_mapa(p_tipo text, p_cfg jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(case when jsonb_typeof(p_cfg->'mapa'->p_tipo) = 'object' then p_cfg->'mapa'->p_tipo end,
    case p_tipo
      when 'combustivel' then '{"destino":"entregas","categoria":"Combustível para entrega"}'::jsonb
      when 'arla' then '{"destino":"entregas","categoria":"Combustível para entrega"}'::jsonb
      when 'alimentacao' then '{"destino":"gerais","categoria":"Alimentação"}'::jsonb
      when 'manutencao' then '{"destino":"gerais","categoria":"Manutenção"}'::jsonb
      when 'oleo' then '{"destino":"gerais","categoria":"Manutenção"}'::jsonb
      when 'outros' then '{"destino":"gerais","categoria":"Outras despesas"}'::jsonb
      else '{"destino":"gerais","categoria":""}'::jsonb end)
$$;

-- registro da coleção agrupada: em qual documento (mês e parte) ele mora hoje
create or replace function seg.desp_item(p_id text) returns table (doc_id text, item jsonb)
language sql stable security definer set search_path = '' as $$
  select d.id, d.dados->'items'->p_id from public.docs d
   where d.colecao = 'despEnt' and jsonb_typeof(d.dados->'items'->p_id) = 'object' limit 1
$$;

-- grava um registro na coleção despEnt (documento do mês e da parte certa), tirando de onde estava
create or replace function seg.desp_gravar_item(p_id text, p_item jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_chave text := seg.desp_chave(p_item->>'data', p_id); v_ant text;
begin
  perform set_config('jb.desp_rpc', 'on', true);   -- já conferido pela função do motorista
  select i.doc_id into v_ant from seg.desp_item(p_id) i;
  insert into public.docs (colecao, id, dados, criado_por, atualizado_por)
  values ('despEnt', v_chave, jsonb_build_object('chave', v_chave, 'items', jsonb_build_object(p_id, p_item)), auth.uid(), auth.uid())
  on conflict (colecao, id) do update
    set dados = jsonb_set(public.docs.dados, '{items}', coalesce(public.docs.dados->'items', '{}'::jsonb) || jsonb_build_object(p_id, p_item)),
        versao = public.docs.versao + 1, atualizado_em = now(), atualizado_por = auth.uid();
  if v_ant is not null and v_ant <> v_chave then   -- mudou de mês: sai do documento antigo (já está no novo)
    update public.docs set dados = jsonb_set(dados, array['items', p_id], 'null'::jsonb), versao = versao + 1, atualizado_em = now(), atualizado_por = auth.uid()
     where colecao = 'despEnt' and id = v_ant;
  end if;
  perform set_config('jb.desp_rpc', '', true);
end $$;

-- o motorista que está usando (cadastro ativo e ligado ao login)
create or replace function seg.desp_eu_motorista() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_id text;
begin
  if not seg.liberado() then raise exception 'sessão encerrada ou inválida' using errcode = '28000'; end if;
  select d.dados, d.id into v, v_id from public.docs d
   where d.colecao = 'despEntCad' and d.dados->>'tipo' = 'motorista' and d.dados->>'userId' = auth.uid()::text
   order by d.id limit 1;
  if v is null then raise exception 'Este login não é de motorista.' using errcode = '42501'; end if;
  if coalesce(v->>'situacao', 'Ativo') <> 'Ativo' then
    raise exception 'Seu cadastro de motorista está inativo. Procure o escritório.' using errcode = '42501';
  end if;
  return v || jsonb_build_object('id', v_id);
end $$;

-- confere e limpa os campos de um lançamento do motorista (lançar e corrigir usam a mesma regra)
create or replace function seg.desp_validar(m jsonb, p jsonb, p_cfg jsonb, p_atual jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tipo text := coalesce(p->>'tipoDesp', ''); v_valor numeric; v_data date; v_hoje date := seg.desp_agora()::date;
  v_hora text := coalesce(p->>'hora', ''); v_veic text := nullif(p->>'veiculoId', ''); v_viag text := nullif(p->>'viagemId', '');
  v_veics jsonb := case when jsonb_typeof(m->'veiculos') = 'array' then m->'veiculos' else '[]'::jsonb end;
  v_dias int; v_trip jsonb; v_just text := left(btrim(coalesce(p->>'justificativa', '')), 300); v_foto jsonb := p->'foto';
  v_forma text := coalesce(p->>'forma', ''); v_orig text := coalesce(p->>'origem', ''); v_lit numeric; v_km numeric; v_mapa jsonb;
begin
  if v_tipo not in ('combustivel', 'arla', 'alimentacao', 'pedagio', 'hospedagem', 'manutencao', 'oleo', 'outros') then
    raise exception 'Escolha o tipo da despesa.' using errcode = '22023';
  end if;
  begin v_valor := round((p->>'valor')::numeric, 2); exception when others then v_valor := null; end;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor da despesa (maior que zero).' using errcode = '22023'; end if;
  if v_valor > 50000 then raise exception 'Valor alto demais para uma despesa de viagem. Confira o número.' using errcode = '22023'; end if;

  if seg.desp_regra(p_cfg, 'ajustarData', true) then
    begin v_data := (p->>'data')::date; exception when others then v_data := null; end;
    v_data := coalesce(v_data, v_hoje);
    v_dias := least(greatest(coalesce(case when jsonb_typeof(p_cfg->'regras'->'diasAtras') = 'number' then (p_cfg->'regras'->>'diasAtras')::int end, 7), 0), 60);
    if v_data > v_hoje then raise exception 'A data da despesa não pode ser depois de hoje.' using errcode = '22023'; end if;
    if v_data < v_hoje - v_dias and (p_atual is null or (p_atual->>'data') is distinct from v_data::text) then
      raise exception 'A data passa do limite de % dia(s) para trás. Fale com o escritório.', v_dias using errcode = '22023';
    end if;
    if v_hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then v_hora := to_char(seg.desp_agora(), 'HH24:MI'); end if;
  elsif p_atual is not null then
    v_data := (p_atual->>'data')::date; v_hora := coalesce(p_atual->>'hora', to_char(seg.desp_agora(), 'HH24:MI'));
  else
    v_data := v_hoje; v_hora := to_char(seg.desp_agora(), 'HH24:MI');
  end if;

  -- caminhão: só os liberados para ele; com um só, vai sozinho
  if v_veic is not null and not (v_veics ? v_veic) and (p_atual is null or (p_atual->>'veiculoId') is distinct from v_veic) then
    raise exception 'Este caminhão não está liberado para você. Fale com o escritório.' using errcode = '42501';
  end if;

  -- viagem: só as dele, abertas; sem viagem, segue a regra da empresa
  if v_viag is not null then
    select e.value into v_trip from public.docs d, jsonb_each(d.dados->'items') e
     where d.colecao = 'despEnt' and e.key = v_viag and jsonb_typeof(e.value) = 'object' limit 1;
    if v_trip is null or coalesce(v_trip->>'tipo', '') <> 'viagem' or (v_trip->>'motoristaId') is distinct from (m->>'id') then
      raise exception 'Viagem não encontrada para você.' using errcode = '22023';
    end if;
    if coalesce(v_trip->>'st', '') not in ('planejada', 'andamento') and (p_atual is null or (p_atual->>'viagemId') is distinct from v_viag) then
      raise exception 'Esta viagem já foi encerrada. Escolha outra ou lance sem viagem.' using errcode = '22023';
    end if;
    if v_veic is null then v_veic := nullif(v_trip->>'veiculoId', ''); end if;
    v_just := '';
  else
    if seg.desp_regra(p_cfg, 'exigirViagem', false) then raise exception 'Escolha a viagem desta despesa.' using errcode = '22023'; end if;
    if seg.desp_regra(p_cfg, 'avulsaJustificativa', true) and length(v_just) < 5 then
      raise exception 'Despesa sem viagem: escreva o motivo (pelo menos 5 letras).' using errcode = '22023';
    end if;
  end if;
  if v_veic is null and jsonb_array_length(v_veics) = 1 then v_veic := v_veics->>0; end if;
  if v_veic is null and jsonb_array_length(v_veics) > 1 then raise exception 'Escolha o caminhão.' using errcode = '22023'; end if;

  -- foto do comprovante: tem de ter chegado ao servidor, enviada por ele
  if jsonb_typeof(v_foto) = 'object' and coalesce(v_foto->>'id', '') <> '' then
    if (v_foto->>'id') !~ '^[0-9a-f]{32}$' then raise exception 'Foto inválida.' using errcode = '22023'; end if;
    if not (p_atual is not null and (p_atual->'foto'->>'id') is not distinct from (v_foto->>'id'))
       and not exists (select 1 from storage.objects o where o.bucket_id = 'anexos' and o.name = v_foto->>'id' and o.owner_id = auth.uid()::text) then
      raise exception 'A foto do comprovante não chegou ao servidor. Tente enviar de novo.' using errcode = '22023';
    end if;
    v_foto := jsonb_build_object('id', v_foto->>'id', 'nome', left(coalesce(nullif(v_foto->>'nome', ''), 'comprovante.jpg'), 80),
      'tipo', left(coalesce(nullif(v_foto->>'tipo', ''), 'image/jpeg'), 60),
      'tam', case when jsonb_typeof(v_foto->'tam') = 'number' then (v_foto->>'tam')::bigint else 0 end);
  else
    v_foto := null;
  end if;
  if v_foto is null and seg.desp_regra(p_cfg, 'fotoObrigatoria', false) then
    raise exception 'Tire a foto do comprovante (cupom, nota ou recibo).' using errcode = '22023';
  end if;

  if v_forma not in ('', 'Dinheiro', 'Cartão', 'PIX', 'Faturado', 'Outro') then v_forma := ''; end if;
  if v_orig not in ('', 'adiantamento', 'motorista', 'empresa') then v_orig := ''; end if;
  begin v_lit := round((p->>'litros')::numeric, 3); exception when others then v_lit := null; end;
  if v_lit is not null and (v_lit <= 0 or v_lit > 3000) then raise exception 'Confira os litros.' using errcode = '22023'; end if;
  begin v_km := round((p->>'km')::numeric, 0); exception when others then v_km := null; end;
  if v_km is not null and (v_km < 0 or v_km > 9999999) then raise exception 'Confira o km do painel.' using errcode = '22023'; end if;
  if v_tipo not in ('combustivel', 'arla') then v_lit := null; end if;

  v_mapa := seg.desp_mapa(v_tipo, p_cfg);
  return jsonb_strip_nulls(jsonb_build_object(
    'tipoDesp', v_tipo, 'valor', v_valor, 'data', v_data::text, 'hora', v_hora,
    'veiculoId', v_veic, 'viagemId', v_viag, 'avulsa', v_viag is null, 'justificativa', nullif(v_just, ''),
    'local', nullif(left(btrim(coalesce(p->>'local', '')), 120), ''),
    'descricao', nullif(left(btrim(coalesce(p->>'descricao', '')), 300), ''),
    'obs', nullif(left(btrim(coalesce(p->>'obs', '')), 500), ''),
    'forma', nullif(v_forma, ''), 'origem', nullif(v_orig, ''), 'litros', v_lit, 'km', v_km, 'foto', v_foto,
    'destino', coalesce(v_mapa->>'destino', 'gerais'), 'categoria', coalesce(v_mapa->>'categoria', '')));
end $$;

-- resumo de um lançamento para o motorista (sem dado de outra pessoa)
create or replace function seg.desp_resumo(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_trip jsonb; v_veic jsonb; v_pago numeric := 0; v_fin jsonb; v_dec jsonb;
begin
  if p is null then return null; end if;
  if coalesce(p->>'viagemId', '') <> '' then select i.item into v_trip from seg.desp_item(p->>'viagemId') i; end if;
  if coalesce(p->>'veiculoId', '') <> '' then select l.dados into v_veic from public.docs l where l.colecao = 'locais' and l.id = p->>'veiculoId'; end if;
  if coalesce(p->'fin'->>'id', '') <> '' then
    select e.value into v_fin from public.docs d, jsonb_each(d.dados->'items') e
     where d.colecao = 'fin' and e.key = p->'fin'->>'id' and jsonb_typeof(e.value) = 'object' limit 1;
    if v_fin is not null and v_fin->'cancelado' is null then
      select coalesce(sum((x->>'valor')::numeric), 0) into v_pago from jsonb_array_elements(coalesce(v_fin->'pagamentos', '[]'::jsonb)) x
       where coalesce((x->>'estornado')::boolean, false) = false and jsonb_typeof(x->'valor') = 'number';
    end if;
  end if;
  select h into v_dec from jsonb_array_elements(coalesce(p->'hist', '[]'::jsonb)) h
   where h->>'acao' in ('rejeitou', 'pediu correção', 'aprovou') order by h->>'em' desc limit 1;
  return jsonb_strip_nulls(jsonb_build_object(
    'id', p->>'id', 'numero', p->'numero', 'data', p->>'data', 'hora', p->>'hora', 'tipoDesp', p->>'tipoDesp', 'valor', p->'valor',
    'litros', p->'litros', 'km', p->'km', 'st', p->>'st', 'local', p->>'local', 'descricao', p->>'descricao', 'obs', p->>'obs',
    'forma', p->>'forma', 'origem', p->>'origem', 'justificativa', p->>'justificativa', 'foto', p->'foto',
    'viagemId', p->>'viagemId', 'viagemNumero', v_trip->'numero', 'viagemDestino', v_trip->>'destino',
    'veiculoId', p->>'veiculoId', 'veiculoNome', v_veic->>'nome', 'veiculoPlaca', v_veic->>'identificacao',
    'motivo', case when v_dec->>'acao' in ('rejeitou', 'pediu correção') then v_dec->>'motivo' end,
    'pedidoCorrecao', p->'pedidoCorrecao', 'criadoEm', p->>'criadoEm',
    'pago', case when v_fin is null then null when v_pago >= coalesce((v_fin->>'valor')::numeric, 0) - 0.004 then 'pago'
                 when v_pago > 0 then 'parcial' else 'aberto' end,
    'noFinanceiro', v_fin is not null));
end $$;

-- 5. gatilho do módulo: número, nada apagado, quem aprova, quem configura e quem liga o login --------------
create or replace function seg.desp_proteger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_raiz text; v_priv boolean; v_aprov boolean; v_eu text; v_cfg jsonb;
  a jsonb; b jsonb; k text; va jsonb; vb jsonb; n bigint; v_tipo text; v_num text;
begin
  if tg_op = 'DELETE' then v_raiz := split_part(old.colecao, '/', 1); else v_raiz := split_part(new.colecao, '/', 1); end if;
  -- quem grava sem restrição: o sistema (sem login), um administrador ativo, ou as funções do motorista (já conferidas)
  v_priv := auth.uid() is null
         or coalesce(current_setting('jb.desp_rpc', true), '') = 'on'
         or exists (select 1 from seg.perfis p where p.user_id = auth.uid() and p.admin and p.ativo);

  if v_raiz = 'despEntCad' then
    if tg_op = 'DELETE' then
      if not v_priv then raise exception 'Cadastro das Despesas de Entrega não é apagado: marque como inativo.' using errcode = '42501'; end if;
      return old;
    end if;
    if not v_priv then
      if new.id = 'cfg' then
        raise exception 'Só o administrador muda as configurações das Despesas de Entrega.' using errcode = '42501';
      end if;
      if (case when tg_op = 'UPDATE' then old.dados->'userId' end) is distinct from (new.dados->'userId')
         or (case when tg_op = 'UPDATE' then old.dados->'acesso' end) is distinct from (new.dados->'acesso') then
        raise exception 'Só o administrador liga ou tira o login do motorista.' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not v_priv then raise exception 'Lançamentos e viagens das Despesas de Entrega não são apagados.' using errcode = '42501'; end if;
    return old;
  end if;
  b := new.dados->'items';
  if b is null or jsonb_typeof(b) <> 'object' then return new; end if;
  a := case when tg_op = 'UPDATE' then old.dados->'items' end;
  if a is null or jsonb_typeof(a) <> 'object' then a := '{}'::jsonb; end if;

  if not v_priv then
    v_eu := seg.meu_uid_app();
    select d.dados into v_cfg from public.docs d where d.colecao = 'despEntCad' and d.id = 'cfg';
    v_aprov := v_eu is not null and jsonb_typeof(v_cfg->'aprovadores') = 'array' and (v_cfg->'aprovadores') ? v_eu;
    for k in select jsonb_object_keys(a) union select jsonb_object_keys(b) loop
      va := a->k; vb := b->k;
      continue when va is not distinct from vb;
      if jsonb_typeof(va) = 'object' and jsonb_typeof(vb) is distinct from 'object' then
        -- sair de um documento para outro (mudou o mês) é permitido; sumir de vez, não
        if not exists (select 1 from public.docs d where d.colecao = 'despEnt' and d.id <> new.id and jsonb_typeof(d.dados->'items'->k) = 'object') then
          raise exception 'Lançamentos e viagens das Despesas de Entrega não são apagados: use Cancelar.' using errcode = '42501';
        end if;
        continue;
      end if;
      continue when jsonb_typeof(vb) is distinct from 'object';
      if coalesce(vb->>'tipo', '') = 'desp' and not v_aprov then
        if coalesce(vb->>'st', '') in ('aprovado', 'rejeitado', 'correcao')
           and coalesce(vb->>'st', '') is distinct from coalesce(va->>'st', '') then
          raise exception 'Só quem aprova as despesas de entrega pode aprovar, rejeitar ou pedir correção.' using errcode = '42501';
        end if;
        if coalesce(va->>'st', '') = 'aprovado' and (
             (va->'valor') is distinct from (vb->'valor') or (va->'tipoDesp') is distinct from (vb->'tipoDesp')
          or (va->'data') is distinct from (vb->'data') or (va->'motoristaId') is distinct from (vb->'motoristaId')
          or (va->'veiculoId') is distinct from (vb->'veiculoId') or (va->'viagemId') is distinct from (vb->'viagemId')) then
          raise exception 'Lançamento aprovado só é corrigido por quem aprova (fica guardado o antes e o depois).' using errcode = '42501';
        end if;
      end if;
    end loop;
  end if;

  -- número único: o que veio é mantido se ninguém usa; senão, o próximo livre (como os compromissos do Financeiro)
  if exists (select 1 from jsonb_each(b) e where jsonb_typeof(e.value) = 'object' and e.value->>'tipo' in ('desp', 'viagem')
             and jsonb_typeof(a->e.key) is distinct from 'object') then
    perform pg_advisory_xact_lock(hashtext('jb-desp-numero'));
    for k in select e.key from jsonb_each(b) e
              where jsonb_typeof(e.value) = 'object' and e.value->>'tipo' in ('desp', 'viagem')
                and jsonb_typeof(a->e.key) is distinct from 'object' order by e.key loop
      v_tipo := b->k->>'tipo'; v_num := coalesce(b->k->>'numero', '');
      -- o mesmo registro que só trocou de documento (mudou o mês) mantém o número
      continue when exists (select 1 from public.docs d where d.colecao = 'despEnt' and d.id <> new.id
                              and (d.dados->'items'->k->>'numero') = v_num and v_num <> '');
      if v_num ~ '^[0-9]{1,9}$' and not exists (
           select 1 from public.docs d, jsonb_each(d.dados->'items') e
            where d.colecao = 'despEnt' and d.id <> new.id and jsonb_typeof(d.dados->'items') = 'object'
              and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = v_tipo and e.value->>'numero' = v_num and e.key <> k)
         and not exists (select 1 from jsonb_each(b) e where e.key <> k and jsonb_typeof(e.value) = 'object'
              and e.value->>'tipo' = v_tipo and e.value->>'numero' = v_num) then
        continue;
      end if;
      select coalesce(max(x.num), 0) + 1 into n from (
        select (e.value->>'numero')::bigint num from public.docs d, jsonb_each(d.dados->'items') e
         where d.colecao = 'despEnt' and d.id <> new.id and jsonb_typeof(d.dados->'items') = 'object'
           and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = v_tipo and coalesce(e.value->>'numero', '') ~ '^[0-9]{1,9}$'
        union all
        select (e.value->>'numero')::bigint from jsonb_each(b) e
         where e.key <> k and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = v_tipo and coalesce(e.value->>'numero', '') ~ '^[0-9]{1,9}$'
      ) x;
      b := jsonb_set(b, array[k, 'numero'], to_jsonb(n));
    end loop;
    new.dados := jsonb_set(new.dados, '{items}', b);
  end if;
  return new;
end $$;

create trigger docs_desp_proteger_iu before insert or update on public.docs for each row
  when (split_part(new.colecao, '/', 1) = any (array['despEnt', 'despEntCad'])) execute function seg.desp_proteger();
create trigger docs_desp_proteger_d before delete on public.docs for each row
  when (split_part(old.colecao, '/', 1) = any (array['despEnt', 'despEntCad'])) execute function seg.desp_proteger();

-- 6. funções do motorista --------------------------------------------------------------------------------
-- quem ele é, os caminhões liberados, as viagens abertas, as regras e as cores do sistema
create or replace function public.jb_mot_eu() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m jsonb; v_cfg jsonb; v_veics jsonb; v_viagens jsonb; v_tema jsonb;
begin
  m := seg.desp_eu_motorista();
  v_cfg := seg.desp_config();
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', l.id, 'nome', l.dados->>'nome', 'placa', l.dados->>'identificacao',
           'modelo', l.dados->>'marcaModelo', 'tipo', l.dados->>'tipo')) order by l.dados->>'nome'), '[]'::jsonb)
    into v_veics
    from public.docs l
   where l.colecao = 'locais' and jsonb_typeof(m->'veiculos') = 'array' and (m->'veiculos') ? l.id
     and coalesce(l.dados->>'situacao', '') <> 'Inativo';
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.key, 'numero', e.value->'numero', 'data', e.value->>'data',
           'hora', e.value->>'hora', 'st', e.value->>'st', 'destino', e.value->>'destino', 'cliente', e.value->>'cliente',
           'veiculoId', e.value->>'veiculoId', 'kmIni', e.value->'kmIni', 'adiantamento', e.value->'adiant'->'valor'))
           order by e.value->>'data' desc, e.value->>'hora' desc), '[]'::jsonb)
    into v_viagens
    from public.docs d, jsonb_each(d.dados->'items') e
   where d.colecao = 'despEnt' and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'viagem'
     and (e.value->>'motoristaId') = (m->>'id') and coalesce(e.value->>'st', '') in ('planejada', 'andamento');
  select jsonb_build_object('p', d.dados->'tema'->>'p', 'm', d.dados->'tema'->>'m') into v_tema
    from public.docs d where d.colecao = 'config' and d.id = 'aparencia';
  perform seg.tocar_sessao();
  return jsonb_build_object(
    'motorista', jsonb_strip_nulls(jsonb_build_object('id', m->>'id', 'nome', m->>'nome', 'apelido', m->>'apelido')),
    'veiculos', v_veics, 'viagens', v_viagens, 'tema', v_tema,
    'regras', jsonb_build_object(
      'exigirViagem', seg.desp_regra(v_cfg, 'exigirViagem', false),
      'avulsaJustificativa', seg.desp_regra(v_cfg, 'avulsaJustificativa', true),
      'motoristaAbreViagem', seg.desp_regra(v_cfg, 'motoristaAbreViagem', true),
      'ajustarData', seg.desp_regra(v_cfg, 'ajustarData', true),
      'fotoObrigatoria', seg.desp_regra(v_cfg, 'fotoObrigatoria', false),
      'pedirKm', seg.desp_regra(v_cfg, 'pedirKm', true),
      'diasAtras', least(greatest(coalesce(case when jsonb_typeof(v_cfg->'regras'->'diasAtras') = 'number' then (v_cfg->'regras'->>'diasAtras')::int end, 7), 0), 60)),
    'hoje', seg.desp_agora()::date, 'hora', to_char(seg.desp_agora(), 'HH24:MI'));
end $$;

-- lançar uma despesa (o mesmo código enviado duas vezes não duplica)
create or replace function public.jb_mot_lancar(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb; v_cfg jsonb; v_id text := coalesce(p->>'id', ''); v_ex jsonb; r jsonb; v_agora text;
begin
  m := seg.desp_eu_motorista();
  if v_id !~ '^de_[A-Za-z0-9]{10,40}$' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext('jb-desp-lanc:' || v_id));
  select i.item into v_ex from seg.desp_item(v_id) i;
  if v_ex is not null then
    if (v_ex->>'motoristaId') is distinct from (m->>'id') then raise exception 'dados inválidos' using errcode = '22023'; end if;
    return seg.desp_resumo(v_ex) || jsonb_build_object('repetida', true);
  end if;
  v_cfg := seg.desp_config();
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  r := seg.desp_validar(m, p, v_cfg, null) || jsonb_build_object(
    'id', v_id, 'tipo', 'desp', 'motoristaId', m->>'id', 'st', 'aguardando', 'origemLanc', 'motorista',
    'criadoEm', v_agora, 'criadoPor', seg.meu_uid_app(), 'alteradoEm', v_agora, 'alteradoPor', seg.meu_uid_app(),
    'hist', jsonb_build_array(jsonb_build_object('em', v_agora, 'por', seg.meu_uid_app(), 'acao', 'registrou pelo celular')));
  perform seg.desp_gravar_item(v_id, r);
  select i.item into r from seg.desp_item(v_id) i;
  perform seg.tocar_sessao();
  return seg.desp_resumo(r) || jsonb_build_object('repetida', false);
end $$;

-- os lançamentos e as viagens dele (últimos dias), com a situação de cada um
create or replace function public.jb_mot_lista(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare m jsonb; v_dias int; v_de date; v_desp jsonb; v_viag jsonb;
begin
  m := seg.desp_eu_motorista();
  v_dias := least(greatest(coalesce(case when jsonb_typeof(p->'dias') = 'number' then (p->>'dias')::int end, 60), 1), 400);
  v_de := seg.desp_agora()::date - v_dias;
  select coalesce(jsonb_agg(seg.desp_resumo(e.value) order by e.value->>'data' desc, e.value->>'hora' desc, e.value->>'criadoEm' desc), '[]'::jsonb)
    into v_desp
    from public.docs d, jsonb_each(d.dados->'items') e
   where d.colecao = 'despEnt' and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'desp'
     and (e.value->>'motoristaId') = (m->>'id') and (e.value->>'data') >= v_de::text and coalesce(e.value->>'st', '') <> 'cancelado';
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', e.key, 'numero', e.value->'numero', 'data', e.value->>'data',
           'hora', e.value->>'hora', 'st', e.value->>'st', 'destino', e.value->>'destino', 'cliente', e.value->>'cliente',
           'veiculoId', e.value->>'veiculoId', 'kmIni', e.value->'kmIni', 'kmFim', e.value->'kmFim', 'fimEm', e.value->>'fimEm',
           'adiantamento', e.value->'adiant'->'valor'))
           order by e.value->>'data' desc, e.value->>'hora' desc), '[]'::jsonb)
    into v_viag
    from public.docs d, jsonb_each(d.dados->'items') e
   where d.colecao = 'despEnt' and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'viagem'
     and (e.value->>'motoristaId') = (m->>'id') and coalesce(e.value->>'st', '') <> 'cancelada'
     and ((e.value->>'data') >= v_de::text or coalesce(e.value->>'st', '') in ('planejada', 'andamento'));
  perform seg.tocar_sessao();
  return jsonb_build_object('despesas', v_desp, 'viagens', v_viag, 'desde', v_de);
end $$;

-- corrigir um lançamento que ainda não foi aprovado (ou que o escritório devolveu para correção)
create or replace function public.jb_mot_corrigir(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb; v_cfg jsonb; v_id text := coalesce(p->>'id', ''); v_at jsonb; v_novo jsonb; v_ant jsonb := '{}'::jsonb; k text; v_agora text;
begin
  m := seg.desp_eu_motorista();
  if v_id !~ '^de_[A-Za-z0-9]{10,40}$' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  select i.item into v_at from seg.desp_item(v_id) i;
  if v_at is null or (v_at->>'motoristaId') is distinct from (m->>'id') then raise exception 'Lançamento não encontrado.' using errcode = '22023'; end if;
  if coalesce(v_at->>'st', '') not in ('aguardando', 'correcao') then
    raise exception 'Este lançamento já foi conferido pelo escritório. Use "Pedir correção".' using errcode = '42501';
  end if;
  v_cfg := seg.desp_config();
  v_novo := seg.desp_validar(m, coalesce(p->'campos', '{}'::jsonb), v_cfg, v_at);
  -- o destino financeiro fica o do registro (só muda se o tipo mudou)
  if (v_novo->>'tipoDesp') = (v_at->>'tipoDesp') then
    v_novo := v_novo || jsonb_build_object('destino', v_at->'destino', 'categoria', v_at->'categoria');
  end if;
  for k in select jsonb_object_keys(v_novo) union select unnest(array['viagemId','veiculoId','justificativa','local','descricao','obs','forma','origem','litros','km','foto']) loop
    if (v_at->k) is distinct from (v_novo->k) then v_ant := v_ant || jsonb_build_object(k, coalesce(v_at->k, 'null'::jsonb)); end if;
  end loop;
  if v_ant = '{}'::jsonb then return seg.desp_resumo(v_at) || jsonb_build_object('semMudanca', true); end if;
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_novo := (v_at - array['viagemId','veiculoId','justificativa','local','descricao','obs','forma','origem','litros','km','foto','avulsa'])
    || v_novo || jsonb_build_object('st', 'aguardando', 'alteradoEm', v_agora, 'alteradoPor', seg.meu_uid_app(),
       'hist', coalesce(v_at->'hist', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('em', v_agora, 'por', seg.meu_uid_app(),
         'acao', 'corrigiu pelo celular', 'antes', v_ant, 'motivo', nullif(left(btrim(coalesce(p->>'motivo', '')), 300), ''))));
  perform seg.desp_gravar_item(v_id, v_novo);
  select i.item into v_novo from seg.desp_item(v_id) i;
  perform seg.tocar_sessao();
  return seg.desp_resumo(v_novo);
end $$;

-- lançamento já aprovado: o motorista só pede a correção, com o motivo (o escritório decide)
create or replace function public.jb_mot_pedir_correcao(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb; v_id text := coalesce(p->>'id', ''); v_at jsonb; v_txt text := left(btrim(coalesce(p->>'texto', '')), 500); v_agora text;
begin
  m := seg.desp_eu_motorista();
  if v_id !~ '^de_[A-Za-z0-9]{10,40}$' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  if length(v_txt) < 5 then raise exception 'Escreva o que precisa ser corrigido.' using errcode = '22023'; end if;
  select i.item into v_at from seg.desp_item(v_id) i;
  if v_at is null or (v_at->>'motoristaId') is distinct from (m->>'id') then raise exception 'Lançamento não encontrado.' using errcode = '22023'; end if;
  if coalesce(v_at->>'st', '') not in ('aprovado', 'rejeitado') then
    raise exception 'Este lançamento ainda pode ser corrigido por você: use "Corrigir".' using errcode = '22023';
  end if;
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_at := v_at || jsonb_build_object('pedidoCorrecao', jsonb_build_object('texto', v_txt, 'em', v_agora, 'st', 'aberto'),
    'hist', coalesce(v_at->'hist', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('em', v_agora, 'por', seg.meu_uid_app(),
      'acao', 'pediu correção pelo celular', 'motivo', v_txt)));
  perform seg.desp_gravar_item(v_id, v_at);
  perform seg.tocar_sessao();
  return seg.desp_resumo(v_at);
end $$;

-- iniciar e encerrar viagem pelo celular (quando a empresa deixa)
create or replace function public.jb_mot_viagem(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare m jsonb; v_cfg jsonb; v_acao text := coalesce(p->>'acao', ''); v_id text := coalesce(p->>'id', ''); v_at jsonb; v_r jsonb;
  v_veic text := nullif(p->>'veiculoId', ''); v_km numeric; v_agora text; v_hoje text := seg.desp_agora()::date::text;
  v_hora text := to_char(seg.desp_agora(), 'HH24:MI'); v_aberta jsonb;
begin
  m := seg.desp_eu_motorista();
  v_cfg := seg.desp_config();
  if v_id !~ '^vg_[A-Za-z0-9]{10,40}$' then raise exception 'dados inválidos' using errcode = '22023'; end if;
  begin v_km := round(coalesce(p->>'km', p->>'kmIni', p->>'kmFim')::numeric, 0); exception when others then v_km := null; end;
  if v_km is not null and (v_km < 0 or v_km > 9999999) then raise exception 'Confira o km do painel.' using errcode = '22023'; end if;
  v_agora := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  perform pg_advisory_xact_lock(hashtext('jb-desp-viagem:' || (m->>'id')));
  select i.item into v_at from seg.desp_item(v_id) i;

  if v_acao = 'iniciar' then
    if v_at is not null and (v_at->>'motoristaId') is distinct from (m->>'id') then raise exception 'dados inválidos' using errcode = '22023'; end if;
    if v_at is not null and coalesce(v_at->>'st', '') = 'andamento' then return v_at; end if;   -- toque repetido
    if v_at is null and not seg.desp_regra(v_cfg, 'motoristaAbreViagem', true) then
      raise exception 'A viagem é aberta pelo escritório. Peça para abrirem a sua viagem.' using errcode = '42501';
    end if;
    select e.value into v_aberta from public.docs d, jsonb_each(d.dados->'items') e
     where d.colecao = 'despEnt' and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'viagem'
       and (e.value->>'motoristaId') = (m->>'id') and e.value->>'st' = 'andamento' and e.key <> v_id limit 1;
    if v_aberta is not null then
      raise exception 'Você já tem uma viagem em andamento (nº %). Encerre antes de começar outra.', coalesce(v_aberta->>'numero', '—') using errcode = '22023';
    end if;
    if v_veic is null then v_veic := nullif(coalesce(v_at->>'veiculoId', ''), ''); end if;
    if v_veic is null and jsonb_typeof(m->'veiculos') = 'array' and jsonb_array_length(m->'veiculos') = 1 then v_veic := m->'veiculos'->>0; end if;
    if v_veic is not null and not (jsonb_typeof(m->'veiculos') = 'array' and (m->'veiculos') ? v_veic) and (v_at->>'veiculoId') is distinct from v_veic then
      raise exception 'Este caminhão não está liberado para você.' using errcode = '42501';
    end if;
    if v_at is null then
      if length(btrim(coalesce(p->>'destino', ''))) < 2 then raise exception 'Informe o destino da viagem.' using errcode = '22023'; end if;
      v_r := jsonb_strip_nulls(jsonb_build_object('id', v_id, 'tipo', 'viagem', 'data', v_hoje, 'hora', v_hora, 'st', 'andamento',
        'motoristaId', m->>'id', 'veiculoId', v_veic, 'destino', left(btrim(p->>'destino'), 120),
        'cliente', nullif(left(btrim(coalesce(p->>'cliente', '')), 120), ''), 'kmIni', v_km, 'origemLanc', 'motorista',
        'inicioEm', v_agora, 'criadoEm', v_agora, 'criadoPor', seg.meu_uid_app(), 'alteradoEm', v_agora, 'alteradoPor', seg.meu_uid_app(),
        'hist', jsonb_build_array(jsonb_build_object('em', v_agora, 'por', seg.meu_uid_app(), 'acao', 'iniciou pelo celular'))));
    else
      if coalesce(v_at->>'st', '') <> 'planejada' then raise exception 'Esta viagem não está aguardando início.' using errcode = '22023'; end if;
      v_r := v_at || jsonb_strip_nulls(jsonb_build_object('st', 'andamento', 'veiculoId', v_veic, 'kmIni', coalesce(v_km, (v_at->>'kmIni')::numeric),
        'inicioEm', v_agora, 'alteradoEm', v_agora, 'alteradoPor', seg.meu_uid_app(),
        'hist', coalesce(v_at->'hist', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('em', v_agora, 'por', seg.meu_uid_app(), 'acao', 'iniciou pelo celular'))));
    end if;
  elsif v_acao = 'encerrar' then
    if v_at is null or (v_at->>'motoristaId') is distinct from (m->>'id') then raise exception 'Viagem não encontrada.' using errcode = '22023'; end if;
    if coalesce(v_at->>'st', '') = 'concluida' then return v_at; end if;   -- toque repetido
    if coalesce(v_at->>'st', '') <> 'andamento' then raise exception 'Esta viagem não está em andamento.' using errcode = '22023'; end if;
    if v_km is not null and jsonb_typeof(v_at->'kmIni') = 'number' and v_km < (v_at->>'kmIni')::numeric then
      raise exception 'O km final é menor que o km da saída (%). Confira o painel.', v_at->>'kmIni' using errcode = '22023';
    end if;
    v_r := v_at || jsonb_strip_nulls(jsonb_build_object('st', 'concluida', 'kmFim', v_km, 'fimEm', v_agora, 'alteradoEm', v_agora,
      'alteradoPor', seg.meu_uid_app(),
      'hist', coalesce(v_at->'hist', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('em', v_agora, 'por', seg.meu_uid_app(), 'acao', 'encerrou pelo celular'))));
  else
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  perform seg.desp_gravar_item(v_id, v_r);
  select i.item into v_r from seg.desp_item(v_id) i;
  perform seg.tocar_sessao();
  return jsonb_strip_nulls(jsonb_build_object('id', v_id, 'numero', v_r->'numero', 'data', v_r->>'data', 'hora', v_r->>'hora', 'st', v_r->>'st',
    'destino', v_r->>'destino', 'cliente', v_r->>'cliente', 'veiculoId', v_r->>'veiculoId', 'kmIni', v_r->'kmIni', 'kmFim', v_r->'kmFim'));
end $$;

-- 7. administrador: situação dos logins de motorista (tela de configurações do módulo) ---------------------
create or replace function public.jb_desp_logins() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not seg.eh_admin() then raise exception 'Somente administradores podem fazer isso.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('motoristaId', d.id, 'userId', p.user_id, 'usuario', p.usuario,
      'ativo', p.ativo, 'bloqueado', p.bloqueado, 'trocarSenha', p.trocar_senha, 'ultimoAcesso', p.ultimo_acesso_em,
      'permissoes', (select count(*) from seg.permissoes x where x.user_id = p.user_id and (x.ler or x.criar or x.editar or x.excluir)),
      'admin', p.admin) order by p.usuario)
    from public.docs d join seg.perfis p on p.user_id::text = d.dados->>'userId'
   where d.colecao = 'despEntCad' and d.dados->>'tipo' = 'motorista'), '[]'::jsonb);
end $$;
