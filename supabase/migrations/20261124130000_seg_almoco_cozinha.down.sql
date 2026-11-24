-- Desfaz 20261124130000_seg_almoco_cozinha.sql (volta como ficou em 20261123003000_seg_controle_grade).
-- Nenhum lançamento é apagado: os almoços (almoco) e o valor do almoço (almocoCfg) continuam em public.docs, e os
-- funcionários do cadastro rápido continuam no Setor Pessoal. Sem o registro das coleções, só o administrador volta a
-- ler e gravar o controle de almoço; as permissões do módulo "cozinha" dadas aos usuários saem junto com o módulo.
drop trigger if exists docs_almoco_proteger_iu on public.docs;
drop trigger if exists docs_almoco_proteger_d on public.docs;
drop trigger if exists docs_almoco_cfg_proteger_iu on public.docs;
drop trigger if exists docs_almoco_cfg_proteger_d on public.docs;
drop function if exists public.jb_almoco_cadastrar(jsonb);
drop function if exists seg.almoco_proteger();
drop function if exists seg.almoco_cfg_proteger();
drop function if exists seg.almoco_preco(date);
drop function if exists seg.almoco_entrada_valida(jsonb);
drop function if exists seg.cpf_valido(text);
drop function if exists seg.data_ou_nulo(text);

delete from seg.leitura_compartilhada where raiz in ('almoco', 'almocoCfg');
delete from seg.colecoes where raiz in ('almoco', 'almocoCfg');
delete from seg.permissoes where modulo = 'cozinha';
delete from seg.modulos where codigo = 'cozinha';

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
  end
$function$;

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
