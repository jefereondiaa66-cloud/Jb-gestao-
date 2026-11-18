-- =====================================================================
-- Cadastros compartilhados entre setores (16/11/2026)
--
-- Problema (relatado pelo dono): em alguns computadores da nuvem não apareciam cadastros que
-- apareciam no computador dele, como os veículos de terceiros do Setor de Combustível.
-- Causa: a leitura no servidor é liberada por MÓDULO, e alguns cadastros que um setor usa moram
-- na coleção de outro módulo. Exemplos:
--   · terceiros que abastecem, responsáveis dos setores, contas (Caixa) e compromissos lançados
--     pelos setores ficam na coleção "fin" (módulo Financeiro);
--   · os fornos e as máquinas ficam em "locais" (módulo Compras), usados pela Produção, pelo
--     Almoxarifado e pelo Barro;
--   · os nomes dos funcionários (DP) aparecem no EPI, no empréstimo e na requisição do Almoxarifado.
-- Quem não tinha o módulo dono da coleção via a lista vazia, e ao tentar cadastrar de novo o
-- servidor recusava ("sem permissão para criar em financeiro": 9 vezes em 16/11, no Combustível).
-- Também: duas entradas do Almoxarifado de 13/11 ficaram sem o compromisso no Financeiro.
--
-- O que esta migração faz (só acrescenta; nenhum dado existente é alterado):
--  1. seg.leitura_compartilhada: coleções inteiras que um setor precisa LER de outro módulo.
--  2. seg.raizes_legiveis(): passa a considerar essa tabela (vale para a leitura e o tempo real).
--  3. seg.leitura_item / seg.escrita_item: em coleções agrupadas (fin, barro), quais itens o setor
--     usa (e quais ele mesmo lança); funcionarios: só nome e função, para o Almoxarifado.
--  4. public.jb_compartilhados(): entrega à nuvem só esses itens e campos, nada além.
--  5. seg.verificar_escrita(): aceita gravar o item que é do setor (terceiro, responsável do setor,
--     compromisso lançado pelo setor) com a permissão do setor. O antes e o depois têm de ser do
--     mesmo setor; o resto da coleção continua só para quem tem o módulo.
--  6. seg.fin_numerar(): o número do compromisso do Financeiro nunca se repete, mesmo quando quem
--     lança só enxerga os compromissos do próprio setor.
--
-- Fica de fora de propósito: pagamentos ao pessoal ("Mão de obra", "Funcionários"), MEIs, saldo
-- inicial das contas, extratos e demais lançamentos do Financeiro continuam só para o Financeiro;
-- salário, CPF e dados pessoais (coleção "sensivel") continuam só para o DP.
--
-- Antes de aplicar: select seg.fazer_copia();  (feita: seg.copias nº 49, 683 registros, 16/11/2026 12:41)
-- Reverter: rodar 20261116150000_seg_compartilhar_setores.down.sql
-- =====================================================================

-- 1. coleções inteiras que um setor lê de outro módulo
create table if not exists seg.leitura_compartilhada (
  raiz   text not null,
  modulo text not null,
  motivo text not null,
  primary key (raiz, modulo)
);
alter table seg.leitura_compartilhada enable row level security;

insert into seg.leitura_compartilhada (raiz, modulo, motivo) values
  ('produtos',     'vendas',   'Setor de Vendas: produtos à venda (regra de 13/11/2026)'),
  ('produtos',     'fiscal',   'Setor Fiscal: produtos da nota'),
  ('tiposProduto', 'vendas',   'Setor de Vendas: tipos de tijolo'),
  ('tiposProduto', 'fiscal',   'Setor Fiscal: tipo do produto da nota'),
  ('clientes',     'fiscal',   'Setor Fiscal: destinatário da nota'),
  ('clientes',     'paletes',  'Setor de Paletes: paletes com os clientes'),
  ('vendas',       'fiscal',   'Setor Fiscal: nota emitida a partir da venda'),
  ('locais',       'producao', 'Setor de Produção: fornos'),
  ('locais',       'almox',    'Almoxarifado: máquina da requisição'),
  ('locais',       'barro',    'Setor do Barro: máquinas da extração'),
  ('prodFab',      'compras',  'Setor da Lenha: fornada do consumo de lenha')
on conflict do nothing;

-- 2. leitura por coleção: a regra antiga + a tabela acima
create or replace function seg.raizes_legiveis()
 returns text[]
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce(array_agg(c.raiz), '{}'::text[])
  from seg.colecoes c
  where seg.liberado() and (c.tipo = 'geral' or seg.pode(c.modulo, 'ler')
         or (c.raiz = 'produtos' and seg.pode('vendas', 'ler'))
         or exists (select 1 from seg.leitura_compartilhada x where x.raiz = c.raiz and seg.pode(x.modulo, 'ler')))
    and c.raiz <> 'data'   -- V68: preferências de cada pessoa, só a própria
$function$;

-- 3. itens de um setor dentro da coleção de outro módulo
-- módulo do setor de cada aba do cadastro de responsáveis (Financeiro › Cadastros › Responsáveis)
create or replace function seg.modulo_da_aba(p_aba text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_aba
    when 'Óleo e combustível' then 'compras'
    when 'Lenha' then 'compras'
    when 'Vendas' then 'vendas'
    when 'Produção' then 'producao'
    when 'Almoxarifado / Cozinha' then 'almox'
    when 'Barro' then 'barro'
    when 'Paletes' then 'paletes'
    when 'Fiscal' then 'fiscal'
  end
$function$;

-- módulo do setor que lançou o compromisso (campo "setorOrigem" do compromisso)
create or replace function seg.modulo_da_origem(p_origem text)
 returns text
 language sql
 immutable
 set search_path to ''
as $function$
  select case p_origem
    when 'Almoxarifado / Cozinha' then 'almox'
    when 'Paletes' then 'paletes'
    when 'Setor do Barro' then 'barro'
    when 'Setor de Combustível' then 'compras'
    when 'Setor da Lenha' then 'compras'
  end
$function$;

-- quais módulos (além do dono da coleção) podem LER este item
create or replace function seg.leitura_item(p_raiz text, p_item jsonb)
 returns text[]
 language sql
 immutable
 set search_path to ''
as $function$
  select case
    when p_item is null or jsonb_typeof(p_item) <> 'object' then '{}'::text[]
    when p_raiz = 'fin' then case p_item->>'tipo'
      -- Combustível › Terceiros que abastecem
      when 'terceiro' then array['compras']
      -- responsáveis da aba do setor; o responsável do Financeiro vai no compromisso que o
      -- Almoxarifado, os Paletes e o Barro lançam
      when 'responsavel' then case
        when p_item->>'aba' = 'Financeiro' then array['almox', 'paletes', 'barro']
        when seg.modulo_da_aba(p_item->>'aba') is not null then array[seg.modulo_da_aba(p_item->>'aba')]
        else '{}'::text[] end
      -- conta em que se paga ou recebe na hora (Caixa, bancos): só o nome (o saldo inicial sai na entrega)
      when 'conta' then array['compras', 'vendas', 'almox', 'paletes', 'barro']
      -- categorias do Financeiro, usadas no compromisso que o setor lança
      when 'config' then array['compras', 'almox', 'paletes', 'barro']
      -- compromisso lançado pelo setor; despesa com combustível aparece no Setor de Combustível
      when 'titulo' then case
        when seg.modulo_da_origem(p_item->>'setorOrigem') is not null then array[seg.modulo_da_origem(p_item->>'setorOrigem')]
        when coalesce(p_item->>'categoria', '') ~* 'combust' then array['compras']
        else '{}'::text[] end
      else '{}'::text[] end
    -- configuração do barro (valor e parâmetros), usada no lançamento da maromba
    when p_raiz = 'barro' then case when p_item->>'jbt' = 'config' then array['producao'] else '{}'::text[] end
    else '{}'::text[]
  end
$function$;

-- qual módulo pode GRAVAR (criar, editar, excluir) este item, além do dono da coleção
create or replace function seg.escrita_item(p_raiz text, p_item jsonb)
 returns text
 language sql
 immutable
 set search_path to ''
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
  end
$function$;

-- 4. o que a nuvem recebe, além dos documentos que a pessoa já lê inteiros
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

  -- funcionários: só nome e função, para o Almoxarifado (EPI, empréstimo de ferramenta, requisição)
  if 'almox' = any(v_mods) and not ('funcionarios' = any(v_leg)) then
    v_parciais := v_parciais || 'funcionarios'::text;
    for r in select d.colecao, d.id, d.dados from public.docs d where d.colecao = 'funcionarios' order by d.id loop
      v_docs := v_docs || jsonb_build_array(jsonb_build_object('colecao', r.colecao, 'id', r.id,
        'dados', jsonb_strip_nulls(jsonb_build_object(
          'id', r.dados->'id', 'nome', r.dados->'nome', 'matricula', r.dados->'matricula',
          'situacao', r.dados->'situacao', 'cargo', r.dados->'cargo', 'setor', r.dados->'setor',
          'departamento', r.dados->'departamento', 'admissao', r.dados->'admissao'))));
    end loop;
  end if;

  return jsonb_build_object('parciais', to_jsonb(v_parciais), 'docs', v_docs);
end $function$;

revoke all on function public.jb_compartilhados() from public, anon;
grant execute on function public.jb_compartilhados() to authenticated;

-- 5. gravação: o item do setor pode ser gravado com a permissão do setor
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
  v_op text; v_mudou_item boolean := false; m_a text; m_b text;
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
      v_op := null;
      if not ea and eb then v_op := 'criar';
      elsif ea and not eb then v_op := 'excluir';
      elsif ea and eb and va <> vb then v_op := 'editar';
      end if;
      continue when v_op is null;
      v_mudou_item := true;
      continue when seg.pode(c.modulo, v_op);
      -- 16/11/2026: item que é de um setor (terceiro, responsável do setor, compromisso lançado
      -- pelo setor) pode ser gravado com a permissão desse setor; antes e depois do mesmo setor
      m_a := case when ea then seg.escrita_item(v_raiz, va) end;
      m_b := case when eb then seg.escrita_item(v_raiz, vb) end;
      if (ea and m_a is null) or (eb and m_b is null) or (ea and eb and m_a is distinct from m_b)
         or not seg.pode(coalesce(m_b, m_a), v_op) then
        v_ops := v_ops || v_op;
      end if;
    end loop;
    if p_antes is not null and p_depois is not null
       and (p_antes - 'items') is distinct from (p_depois - 'items') then
      v_ops := v_ops || 'editar'::text;
    end if;
    if p_antes is null and not v_mudou_item then v_ops := v_ops || 'criar'::text; end if;
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

-- 6. número do compromisso sem repetição: só o compromisso NOVO cujo número já existe ganha o
-- próximo número livre (quem lança no setor só enxerga os compromissos do próprio setor)
create or replace function seg.fin_numerar()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  a jsonb; b jsonb; k text; v jsonb; n bigint; v_usados bigint[]; v_max bigint;
begin
  b := new.dados->'items';
  if b is null or jsonb_typeof(b) <> 'object' then return new; end if;
  a := case when tg_op = 'UPDATE' then old.dados->'items' end;
  if a is null or jsonb_typeof(a) <> 'object' then a := '{}'::jsonb; end if;
  if not exists (select 1 from jsonb_each(b) e
                 where jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'titulo'
                   and coalesce(e.value->>'numero', '') ~ '^[0-9]{1,15}$'
                   and jsonb_typeof(a->e.key) is distinct from 'object') then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('jb-fin-numero'));
  for k in select e.key from jsonb_each(b) e
           where jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'titulo'
             and coalesce(e.value->>'numero', '') ~ '^[0-9]{1,15}$'
             and jsonb_typeof(a->e.key) is distinct from 'object'
           order by e.key loop
    v := b->k;
    n := (v->>'numero')::bigint;
    select array_agg(x.num) into v_usados from (
      select (e.value->>'numero')::bigint as num
        from public.docs d, jsonb_each(d.dados->'items') e
       where d.colecao = 'fin' and d.id <> new.id and jsonb_typeof(d.dados->'items') = 'object'
         and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'titulo'
         and coalesce(e.value->>'numero', '') ~ '^[0-9]{1,15}$'
      union all
      select (e.value->>'numero')::bigint
        from jsonb_each(b) e
       where e.key <> k and jsonb_typeof(e.value) = 'object' and e.value->>'tipo' = 'titulo'
         and coalesce(e.value->>'numero', '') ~ '^[0-9]{1,15}$'
    ) x;
    if n = any(coalesce(v_usados, '{}'::bigint[])) then
      select coalesce(max(u), 0) into v_max from unnest(v_usados) u;
      b := jsonb_set(b, array[k, 'numero'], to_jsonb(v_max + 1));
    end if;
  end loop;
  new.dados := jsonb_set(new.dados, '{items}', b);
  return new;
end $function$;

create or replace trigger docs_fin_numero
  before insert or update on public.docs
  for each row when (new.colecao = 'fin')
  execute function seg.fin_numerar();
