-- Ponto facial profissional (V126, 15/11/2026)
-- O que faz:
--   1. Registra duas coleções novas no módulo do DP, agrupadas por mês como os outros lançamentos:
--        pontoMarcacoes  cada marcação de ponto confirmada (o registro original)
--        pontoEventos    falhas de identificação, testes, tratamentos e atos administrativos do ponto
--   2. Cria o gatilho seg.ponto_proteger em public.docs, só para essas duas coleções:
--        · um item que já entrou não pode ser alterado nem apagado, por ninguém (nem administrador,
--          nem a ponte do Claude); o documento do mês também não pode ser apagado;
--        · cada marcação nova recebe do servidor o número sequencial (nsr), a hora do servidor (srv)
--          e um código (hash) que depende da marcação anterior: alteração por fora quebra a sequência.
--   3. Cria public.jb_ponto_integridade(): confere a sequência inteira e devolve o que não bate.
-- Não altera nenhum dado existente. A tabela seg.ponto_cadeia guarda só o último número e o último código.
-- Aplicada em 16/11/2026 (cópia de segurança nº 46 feita antes; teste da trava no banco real: 8 de 8).
-- Antes de aplicar em outro banco: select seg.fazer_copia();
-- Reverter: rodar 20261115200000_seg_ponto_marcacoes.down.sql (as marcações já gravadas ficam em public.docs).

insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar) values
  ('pontoMarcacoes', 'dp', true, 'dados', true),
  ('pontoEventos', 'dp', true, 'dados', true)
on conflict do nothing;

create table if not exists seg.ponto_cadeia (
  id   int primary key check (id = 1),
  nsr  bigint not null default 0,
  hash text not null default ''
);
alter table seg.ponto_cadeia enable row level security;   -- sem política: só as funções abaixo leem e gravam
insert into seg.ponto_cadeia (id) values (1) on conflict do nothing;

create or replace function seg.ponto_elo(p_ant text, p_item jsonb) returns text
language sql immutable set search_path to '' as $$
  select encode(sha256(convert_to(
    coalesce(p_ant, '') || '|' || coalesce(p_item->>'nsr', '') || '|' || coalesce(p_item->>'funcionarioId', '') || '|' ||
    coalesce(p_item->>'data', '') || '|' || coalesce(p_item->>'k', '') || '|' || coalesce(p_item->>'em', '') || '|' ||
    coalesce(p_item->>'origem', '') || '|' || coalesce(p_item->>'srv', ''), 'UTF8')), 'hex')
$$;

create or replace function seg.ponto_proteger() returns trigger
language plpgsql security definer set search_path to '' as $$
declare
  a jsonb; b jsonb; k text; v jsonb; v_nsr bigint; v_ant text; v_hash text;
begin
  if tg_op = 'DELETE' then
    raise exception 'marcação de ponto já registrada não pode ser apagada' using errcode = 'JB409';
  end if;
  a := coalesce(case when tg_op = 'UPDATE' then old.dados->'items' end, '{}'::jsonb);
  b := coalesce(new.dados->'items', '{}'::jsonb);
  if jsonb_typeof(a) <> 'object' then a := '{}'::jsonb; end if;
  if jsonb_typeof(b) <> 'object' then
    raise exception 'dados inválidos' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(a) loop
    if (b->k) is distinct from (a->k) then
      raise exception 'marcação de ponto já registrada não pode ser alterada nem apagada' using errcode = 'JB409';
    end if;
  end loop;
  if split_part(new.colecao, '/', 1) = 'pontoMarcacoes' then
    for k in select x from jsonb_object_keys(b) x where not (a ? x) order by x loop
      v := b->k;
      if jsonb_typeof(v) <> 'object' then
        raise exception 'dados inválidos' using errcode = '22023';
      end if;
      update seg.ponto_cadeia set nsr = nsr + 1 where id = 1 returning nsr, hash into v_nsr, v_ant;
      v := v || jsonb_build_object('nsr', v_nsr, 'srv', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
      v_hash := seg.ponto_elo(v_ant, v);
      v := v || jsonb_build_object('hash', v_hash);
      update seg.ponto_cadeia set hash = v_hash where id = 1;
      new.dados := jsonb_set(new.dados, array['items', k], v);
    end loop;
  end if;
  return new;
end $$;

-- o gatilho só age nas duas coleções do ponto (a migração só acrescenta: não apaga nem troca nada)
create trigger docs_ponto_proteger_iu
  before insert or update on public.docs
  for each row when (split_part(new.colecao, '/', 1) in ('pontoMarcacoes', 'pontoEventos'))
  execute function seg.ponto_proteger();
create trigger docs_ponto_proteger_d
  before delete on public.docs
  for each row when (split_part(old.colecao, '/', 1) in ('pontoMarcacoes', 'pontoEventos'))
  execute function seg.ponto_proteger();

create or replace function public.jb_ponto_integridade() returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare
  r record; v_ant text := ''; n bigint := 0; v_esp bigint := 0; v_nsr bigint; ruins jsonb := '[]'::jsonb;
begin
  if not seg.liberado() or not (seg.eh_admin() or seg.pode('dp', 'ler')) then
    raise exception 'sem permissão' using errcode = '42501';
  end if;
  for r in
    select e.key as id, e.value as v
    from public.docs d, jsonb_each(d.dados->'items') e
    where split_part(d.colecao, '/', 1) = 'pontoMarcacoes'
    order by (e.value->>'nsr')::bigint nulls first
  loop
    n := n + 1; v_esp := v_esp + 1; v_nsr := (r.v->>'nsr')::bigint;
    if v_nsr is distinct from v_esp or (r.v->>'hash') is distinct from seg.ponto_elo(v_ant, r.v - 'hash') then
      ruins := ruins || jsonb_build_array(jsonb_build_object('id', r.id, 'nsr', v_nsr));
      v_esp := coalesce(v_nsr, v_esp);
      exit when jsonb_array_length(ruins) >= 20;
    end if;
    v_ant := coalesce(r.v->>'hash', '');
  end loop;
  return jsonb_build_object('total', n, 'falhas', ruins,
    'ultimo_nsr', (select c.nsr from seg.ponto_cadeia c where c.id = 1), 'conferido_em', now());
end $$;
grant execute on function public.jb_ponto_integridade() to authenticated;
