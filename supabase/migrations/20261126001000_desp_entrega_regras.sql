-- =====================================================================================================
-- V177 · Despesas de Entrega — regras do servidor para quem NÃO aprova (troca só a função seg.desp_proteger,
-- criada em 20261125230000_desp_entrega; nenhuma tabela, gatilho ou dado muda):
--  · cancelar um lançamento, ou mexer num lançamento já aprovado, rejeitado ou cancelado, passa a ser só de quem
--    aprova (antes: só aprovar, rejeitar e pedir correção eram travados);
--  · o adiantamento e o acerto da viagem (dinheiro dado ao motorista e a prestação de contas) também são só de
--    quem aprova. O administrador continua podendo tudo; ninguém apaga.
-- Reversão: supabase/migrations/20261126001000_desp_entrega_regras.down.sql (volta a versão anterior da função).
-- =====================================================================================================
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
        if coalesce(vb->>'st', '') is distinct from coalesce(va->>'st', '')
           and (coalesce(vb->>'st', '') in ('aprovado', 'rejeitado', 'correcao', 'cancelado')
                or coalesce(va->>'st', '') in ('aprovado', 'rejeitado', 'cancelado')) then
          raise exception 'Só quem aprova as despesas de entrega pode aprovar, rejeitar, pedir correção ou cancelar.' using errcode = '42501';
        end if;
        if coalesce(va->>'st', '') = 'aprovado' and (
             (va->'valor') is distinct from (vb->'valor') or (va->'tipoDesp') is distinct from (vb->'tipoDesp')
          or (va->'data') is distinct from (vb->'data') or (va->'motoristaId') is distinct from (vb->'motoristaId')
          or (va->'veiculoId') is distinct from (vb->'veiculoId') or (va->'viagemId') is distinct from (vb->'viagemId')) then
          raise exception 'Lançamento aprovado só é corrigido por quem aprova (fica guardado o antes e o depois).' using errcode = '42501';
        end if;
      end if;
      if coalesce(vb->>'tipo', '') = 'viagem' and not v_aprov
         and ((va->'adiant') is distinct from (vb->'adiant') or (va->'acerto') is distinct from (vb->'acerto')) then
        raise exception 'Só quem aprova as despesas de entrega registra o adiantamento e o acerto da viagem.' using errcode = '42501';
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
