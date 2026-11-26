-- Desfaz 20261126000000_seg_estoque_integrado_setores.sql: as quatro funções voltam exatamente como estavam antes
-- (seg.leitura_item e seg.escrita_item de 20261125160000/20261124130000, seg.verificar_escrita de 20261116150000 e
-- public.jb_compartilhados de 20261124130000). Nenhum dado é apagado: o que o Almoxarifado lançou no Combustível
-- continua lá; sem esta liberação, quem é só do Almoxarifado volta a não ver o saldo do Combustível e as entradas
-- de óleo e graxa feitas por ele voltam a ficar no Almoxarifado.
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
      -- V168: fila e agenda do pagamento que a Produção conferiu (Pagamentos da Produção)
      when 'meta' then case
        when coalesce(p_item->>'ref', '') like 'pp:%' then array['producao']
        else '{}'::text[] end
      else '{}'::text[] end
    -- configuração do barro (valor e parâmetros), usada no lançamento da maromba
    when p_raiz = 'barro' then case when p_item->>'jbt' = 'config' then array['producao'] else '{}'::text[] end
    else '{}'::text[]
  end
$function$;

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
