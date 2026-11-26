-- Reversão de 20261125235000_desp_entrega_resumo.sql: volta o resumo do motorista à versão de 20261125230000_desp_entrega.
-- Não apaga dados.
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
