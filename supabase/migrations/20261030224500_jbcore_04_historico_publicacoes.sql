-- =====================================================================
-- JB CORE · 04 · histórico automático das publicações da nuvem
--
-- A verificação periódica do site (a cada 10 min) passa a anotar em
-- jbcore.publicacoes cada versão nova que encontra no ar (lida de
-- /versao.json, gerado pela construção). Assim o histórico de publicações
-- e a "verificação de funcionamento" não dependem de ninguém lembrar de
-- registrar. Não toca em dados do sistema.
-- Reversão: reaplicar jbcore.verificar_hospedagem de 20261030221000_jbcore_01_ponte.sql
-- =====================================================================

create or replace function jbcore.verificar_hospedagem()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ant jsonb; v_req bigint; r record; v_res jsonb; v_versao jsonb;
begin
  select valor into v_ant from jbcore.estado where chave = 'nuvem';
  if v_ant ? 'pedido' then
    select status_code, content, error_msg, created into r from net._http_response where id = (v_ant->>'pedido')::bigint;
    if found then
      begin v_versao := r.content::jsonb; exception when others then v_versao := null; end;
      if v_versao is not null and jsonb_typeof(v_versao) <> 'object' then v_versao := null; end if;
      v_res := jsonb_build_object('status', r.status_code, 'erro', r.error_msg, 'verificado_em', r.created,
        'no_ar', r.status_code = 200, 'versao', v_versao);
      -- versão nova no ar: entra no histórico como publicada e verificada
      if r.status_code = 200 and v_versao ? 'versao'
         and (v_versao->>'versao') is distinct from (v_ant->'versao'->>'versao')
         and not exists (select 1 from jbcore.publicacoes p where p.ambiente = 'nuvem' and p.versao = v_versao->>'versao') then
        insert into jbcore.publicacoes (ambiente, versao, sha256, commit_ref, situacao, detalhe)
        values ('nuvem', v_versao->>'versao', v_versao->>'programa_sha256', v_versao->>'commit', 'verificada',
                jsonb_build_object('origem', 'verificacao_automatica', 'construido_em', v_versao->'construido_em', 'ponte', v_versao->'ponte'));
      end if;
    end if;
  end if;
  v_req := net.http_get('https://jb-gestao-ceramica.netlify.app/versao.json?t=' || floor(extract(epoch from now()))::bigint,
                        timeout_milliseconds := 15000);
  insert into jbcore.estado (chave, valor, atualizado_em)
  values ('nuvem', coalesce(v_res, coalesce(v_ant, '{}'::jsonb) - 'pedido') || jsonb_build_object('pedido', v_req), now())
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
  return v_res;
end $$;
revoke all on function jbcore.verificar_hospedagem() from public, anon, authenticated;
