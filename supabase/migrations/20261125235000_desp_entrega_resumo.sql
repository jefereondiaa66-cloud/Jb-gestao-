-- =====================================================================================================
-- V177 · Despesas de Entrega — resumo que o motorista recebe de cada lançamento (seg.desp_resumo).
-- Só troca a função criada em 20261125230000_desp_entrega (nenhuma tabela, regra ou dado muda):
--  · passa a trazer o destino e a categoria financeira (a confirmação do celular mostra "Combustível ·
--    Despesas com entregas"); o motorista continua sem escolher nem mudar nada disso;
--  · despesa aprovada paga com o adiantamento da viagem aparece como "paga com o adiantamento";
--  · o compromisso do Financeiro é achado direto pela chave guardada no lançamento (fin.id e fin.data);
--    só se não achar, procura no Financeiro inteiro (o compromisso pode ter mudado de mês lá).
-- Reversão: supabase/migrations/20261125235000_desp_entrega_resumo.down.sql (volta a versão anterior).
-- =====================================================================================================
create or replace function seg.desp_resumo(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_trip jsonb; v_veic jsonb; v_pago numeric := 0; v_fin jsonb; v_dec jsonb; v_fid text; v_fdata text; v_canc boolean := false;
begin
  if p is null then return null; end if;
  if coalesce(p->>'viagemId', '') <> '' then select i.item into v_trip from seg.desp_item(p->>'viagemId') i; end if;
  if coalesce(p->>'veiculoId', '') <> '' then select l.dados into v_veic from public.docs l where l.colecao = 'locais' and l.id = p->>'veiculoId'; end if;
  v_fid := coalesce(p->'fin'->>'id', '');
  if v_fid <> '' then
    v_fdata := coalesce(nullif(p->'fin'->>'data', ''), p->>'data', '');
    if v_fdata ~ '^\d{4}-\d{2}' then
      select d.dados->'items'->v_fid into v_fin from public.docs d
       where d.colecao = 'fin' and d.id = seg.desp_chave(v_fdata, v_fid) and jsonb_typeof(d.dados->'items'->v_fid) = 'object';
    end if;
    if v_fin is null then
      select e.value into v_fin from public.docs d, jsonb_each(d.dados->'items') e
       where d.colecao = 'fin' and e.key = v_fid and jsonb_typeof(e.value) = 'object' limit 1;
    end if;
    v_canc := v_fin is not null and (jsonb_typeof(v_fin->'cancelado') = 'object' or v_fin->'cancelado' = 'true'::jsonb);
    if v_fin is not null and not v_canc then
      select coalesce(sum((x->>'valor')::numeric), 0) into v_pago from jsonb_array_elements(coalesce(v_fin->'pagamentos', '[]'::jsonb)) x
       where jsonb_typeof(x->'valor') = 'number'
         and (x->'estornado' is null or jsonb_typeof(x->'estornado') = 'null' or x->'estornado' = 'false'::jsonb);
    end if;
  end if;
  select h into v_dec from jsonb_array_elements(coalesce(p->'hist', '[]'::jsonb)) h
   where h->>'acao' in ('rejeitou', 'pediu correção', 'aprovou') order by h->>'em' desc limit 1;
  return jsonb_strip_nulls(jsonb_build_object(
    'id', p->>'id', 'numero', p->'numero', 'data', p->>'data', 'hora', p->>'hora', 'tipoDesp', p->>'tipoDesp', 'valor', p->'valor',
    'litros', p->'litros', 'km', p->'km', 'st', p->>'st', 'local', p->>'local', 'descricao', p->>'descricao', 'obs', p->>'obs',
    'forma', p->>'forma', 'origem', p->>'origem', 'justificativa', p->>'justificativa', 'foto', p->'foto',
    'destino', p->>'destino', 'categoria', p->>'categoria',
    'viagemId', p->>'viagemId', 'viagemNumero', v_trip->'numero', 'viagemDestino', v_trip->>'destino',
    'veiculoId', p->>'veiculoId', 'veiculoNome', v_veic->>'nome', 'veiculoPlaca', v_veic->>'identificacao',
    'motivo', case when v_dec->>'acao' in ('rejeitou', 'pediu correção') then v_dec->>'motivo' end,
    'pedidoCorrecao', p->'pedidoCorrecao', 'criadoEm', p->>'criadoEm',
    'pago', case
      when coalesce(p->>'st', '') = 'aprovado' and coalesce(p->>'origem', '') = 'adiantamento' then 'adiantamento'
      when v_fin is null then null
      when v_canc then null
      when v_pago >= coalesce((v_fin->>'valor')::numeric, 0) - 0.004 then 'pago'
      when v_pago > 0 then 'parcial' else 'aberto' end,
    'noFinanceiro', v_fin is not null and not v_canc));
end $$;
