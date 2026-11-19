-- Centro de Inventário · fotografias da conferência à vista (V138, 19/11/2026)
-- Pedido do dono: as fotos tiradas na conferência física eram guardadas, mas nenhuma tela mostrava.
-- As fotos ficam presas à LEITURA (inv.arquivos.entidade = 'leitura'), e até aqui só dava para
-- buscá-las uma leitura por vez. Esta migração faz inv.conferencia_resumo devolver também as
-- fotografias do inventário, numa chamada só e em páginas, QUANDO a tela pede ("fotos": true):
--   fotos           lista (mais nova primeiro) com miniatura, leitura, item, código e descrição do bem
--   fotos_total     quantas existem ao todo (para o "Mostrar mais")
--   fotos_por_item  quantas cada item tem (para o selo na lista de bens)
-- Parâmetros novos, todos opcionais: fotos, fotos_limite (1 a 200, padrão 48), fotos_pular, fotos_item.
-- Sem "fotos": true a resposta é exatamente a de antes (a tela "Finalizar a conferência" não muda).
-- Não cria tabela, não mexe em dados e não muda permissão: a ação continua exigindo visualizar_empresas.
-- Antes de aplicar: select seg.fazer_copia();
-- Reverter: 20261119120000_inv_02_fotos_conferencia.down.sql

create or replace function inv.conferencia_resumo(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare v_inv uuid := (d->>'inventario_id')::uuid; v_emp uuid := (d->>'empresa_id')::uuid; r jsonb;
  v_item uuid := case when d->>'fotos_item' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (d->>'fotos_item')::uuid end;
  v_lim int := least(greatest(case when d->>'fotos_limite' ~ '^[0-9]{1,4}$' then (d->>'fotos_limite')::int else 48 end,1),200);
  v_pular int := case when d->>'fotos_pular' ~ '^[0-9]{1,7}$' then (d->>'fotos_pular')::int else 0 end;
begin
  if not exists (select 1 from inv.inventarios where id=v_inv and empresa_id=v_emp) then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  r := jsonb_build_object('progresso',inv.progresso(v_inv),
   'pendentes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',retrato->>'codigo_patrimonial','descricao',retrato->>'descricao') order by retrato->>'codigo_patrimonial'),'[]') from inv.inventario_itens where inventario_id=v_inv and situacao='Pendente'),
   'ocorrencias',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',retrato->>'codigo_patrimonial','descricao',retrato->>'descricao','situacao',situacao,'divergencias',divergencias,'bem_id',bem_id) order by situacao),'[]') from inv.inventario_itens where inventario_id=v_inv and situacao not in ('Pendente','Localizado e conferido')));
  if coalesce(d->>'fotos','') in ('true','t','1') then
    r := r || jsonb_build_object(
     'fotos',(select coalesce(jsonb_agg(x.j order by x.dh desc, x.ce desc, x.aid),'[]') from (
        select jsonb_build_object('id',a.id,'nome',a.nome,'tipo',a.tipo,'categoria',a.categoria,'tamanho',a.tamanho,'partes',a.partes,'miniatura',a.miniatura,
                 'enviado_por',a.enviado_por,'criado_em',a.criado_em,'leitura_id',l.id,'item_id',l.item_id,'situacao',l.situacao,'data_hora',l.data_hora,
                 'responsavel',l.responsavel,'bem_id',i.bem_id,'codigo',i.retrato->>'codigo_patrimonial','descricao',i.retrato->>'descricao') j,
               l.data_hora dh, a.criado_em ce, a.id aid
          from inv.arquivos a
          join inv.leituras l on l.id=a.registro_id and l.empresa_id=a.empresa_id
          left join inv.inventario_itens i on i.id=l.item_id
         where a.empresa_id=v_emp and a.entidade='leitura' and l.inventario_id=v_inv and a.excluido_em is null and a.completo
           and (v_item is null or l.item_id=v_item)
         order by l.data_hora desc, a.criado_em desc, a.id
         limit v_lim offset v_pular) x),
     'fotos_total',(select count(*) from inv.arquivos a join inv.leituras l on l.id=a.registro_id and l.empresa_id=a.empresa_id
         where a.empresa_id=v_emp and a.entidade='leitura' and l.inventario_id=v_inv and a.excluido_em is null and a.completo
           and (v_item is null or l.item_id=v_item)),
     'fotos_por_item',(select coalesce(jsonb_object_agg(y.item_id,y.n),'{}') from (
        select l.item_id, count(*) n from inv.arquivos a join inv.leituras l on l.id=a.registro_id and l.empresa_id=a.empresa_id
         where a.empresa_id=v_emp and a.entidade='leitura' and l.inventario_id=v_inv and a.excluido_em is null and a.completo and l.item_id is not null
         group by l.item_id) y));
  end if;
  return r;
end $$;
