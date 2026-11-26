-- Reverte 20261119120000_inv_02_fotos_conferencia.sql: inv.conferencia_resumo volta a ser a de
-- 20261108233000_inv_01_centro_inventario.sql (sem as fotografias). Não apaga nenhuma foto nem dado.
-- A tela continua mostrando as fotos, pelo caminho antigo (uma leitura por vez, mais lento).
create or replace function inv.conferencia_resumo(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare v_inv uuid := (d->>'inventario_id')::uuid; v_emp uuid := (d->>'empresa_id')::uuid;
begin
  if not exists (select 1 from inv.inventarios where id=v_inv and empresa_id=v_emp) then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  return jsonb_build_object('progresso',inv.progresso(v_inv),
   'pendentes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',retrato->>'codigo_patrimonial','descricao',retrato->>'descricao') order by retrato->>'codigo_patrimonial'),'[]') from inv.inventario_itens where inventario_id=v_inv and situacao='Pendente'),
   'ocorrencias',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',retrato->>'codigo_patrimonial','descricao',retrato->>'descricao','situacao',situacao,'divergencias',divergencias,'bem_id',bem_id) order by situacao),'[]') from inv.inventario_itens where inventario_id=v_inv and situacao not in ('Pendente','Localizado e conferido')));
end $$;
