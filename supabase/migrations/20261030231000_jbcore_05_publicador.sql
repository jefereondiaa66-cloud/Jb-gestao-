-- =====================================================================
-- JB CORE · 05 · publicador da nuvem
--
-- jbcore.publicar_nuvem chama a função jb-publicar (supabase/functions),
-- que monta o pacote de um commit do GitHub e entrega ao Netlify. O
-- segredo que autoriza a chamada fica no cofre (vault), nunca no código.
-- A verificação periódica (a cada 10 min) confirma a publicação pelo COMMIT
-- que está no ar (situação "verificada") e marca como "falhou" a que foi
-- recusada pela função/Netlify ou não apareceu no ar em 2 horas.
-- Não toca em dados do sistema.
-- Reversão: drop function jbcore.publicar_nuvem(text, text, text, text), jbcore.resposta(bigint), jbcore.conferir_publicacoes();
--           delete from vault.secrets where name = 'jb_publicar_segredo';
--           reaplicar jbcore.verificar_hospedagem de 20261030224500_jbcore_04_historico_publicacoes.sql
-- =====================================================================

-- segredo criado aqui mesmo, aleatório; só existe se ainda não existir
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'jb_publicar_segredo') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'jb_publicar_segredo',
                                'JB CORE: autoriza o banco a chamar a função jb-publicar');
  end if;
end $$;

-- acao: 'simular' (só monta o pacote), 'publicar' (envia ao Netlify) ou 'estado' (andamento de um deploy)
create or replace function jbcore.publicar_nuvem(p_acao text, p_commit text default null, p_proxy text default null, p_deploy text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_seg text; v_req bigint;
begin
  if p_acao is null or p_acao not in ('publicar', 'simular', 'estado') then raise exception 'ação inválida' using errcode = '22023'; end if;
  if p_acao in ('publicar', 'simular') and (p_commit is null or p_commit !~ '^[0-9a-f]{40}$') then
    raise exception 'commit inválido (código completo de 40 caracteres)' using errcode = '22023';
  end if;
  if p_acao in ('publicar', 'estado') and (p_proxy is null or p_proxy !~ '^https://netlify-mcp\.netlify\.app/proxy/[A-Za-z0-9._~-]{20,4000}$') then
    raise exception 'endereço de publicação do Netlify inválido' using errcode = '22023';
  end if;
  select decrypted_secret into v_seg from vault.decrypted_secrets where name = 'jb_publicar_segredo';
  if v_seg is null then raise exception 'segredo do publicador não está no cofre' using errcode = 'P0002'; end if;
  v_req := net.http_post(
    url := 'https://kdsaslmlvjllgzbzsnxt.supabase.co/functions/v1/jb-publicar',
    body := jsonb_build_object('segredo', v_seg, 'acao', p_acao, 'commit', p_commit, 'proxy', p_proxy, 'deploy', p_deploy),
    timeout_milliseconds := 120000);
  if p_acao = 'publicar' then
    insert into jbcore.publicacoes (ambiente, versao, commit_ref, situacao, detalhe)
    values ('nuvem', 'commit ' || left(p_commit, 7), p_commit, 'preparada', jsonb_build_object('origem', 'jb-publicar', 'pedido', v_req));
  end if;
  return v_req;
end $$;

-- resposta de um pedido feito pelo banco (o pg_net responde depois)
create or replace function jbcore.resposta(p_pedido bigint)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((
    select jsonb_build_object('pronto', true, 'status', r.status_code, 'erro', r.error_msg,
      'corpo', case when r.content ~ '^\s*[\{\[]' then r.content::jsonb else to_jsonb(left(r.content, 2000)) end)
    from net._http_response r where r.id = p_pedido), jsonb_build_object('pronto', false))
$$;

-- acompanha as publicações "preparada": recusada pela função/Netlify -> "falhou";
-- aceita -> guarda o número do deploy; sem aparecer no ar em 2 h -> "falhou"
create or replace function jbcore.conferir_publicacoes()
returns void language plpgsql security definer set search_path = '' as $$
declare p record; r record; v_corpo jsonb;
begin
  for p in select id, detalhe from jbcore.publicacoes
           where ambiente = 'nuvem' and situacao = 'preparada' and detalhe ? 'pedido' and not (detalhe ? 'deploy') loop
    select status_code, content, error_msg into r from net._http_response where id = (p.detalhe->>'pedido')::bigint;
    if found then
      begin v_corpo := r.content::jsonb; exception when others then v_corpo := null; end;
      if r.status_code = 200 and v_corpo->>'ok' = 'true' and coalesce(v_corpo->>'deploy', '') <> '' then
        update jbcore.publicacoes set detalhe = detalhe || jsonb_build_object('deploy', v_corpo->'deploy', 'build', v_corpo->'build', 'aceita_em', now())
        where id = p.id;
      else
        update jbcore.publicacoes set situacao = 'falhou', detalhe = detalhe || jsonb_build_object(
          'motivo', coalesce(v_corpo->>'erro', r.error_msg, 'resposta ' || coalesce(r.status_code::text, 'sem código')),
          'status', r.status_code, 'resposta', left(coalesce(v_corpo->>'resposta', ''), 500))
        where id = p.id;
      end if;
    end if;
  end loop;
  update jbcore.publicacoes
  set situacao = 'falhou', detalhe = detalhe || jsonb_build_object('motivo',
    'sem confirmação: a versão não apareceu no ar em 2 horas (o Netlify pode ter barrado a construção na verificação)')
  where ambiente = 'nuvem' and situacao = 'preparada' and criado_em < now() - interval '2 hours';
end $$;

create or replace function jbcore.verificar_hospedagem()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_ant jsonb; v_req bigint; r record; v_res jsonb; v_versao jsonb; v_pub bigint; v_commit text;
begin
  perform jbcore.conferir_publicacoes();
  select valor into v_ant from jbcore.estado where chave = 'nuvem';
  if v_ant ? 'pedido' then
    select status_code, content, error_msg, created into r from net._http_response where id = (v_ant->>'pedido')::bigint;
    if found then
      begin v_versao := r.content::jsonb; exception when others then v_versao := null; end;
      if v_versao is not null and jsonb_typeof(v_versao) <> 'object' then v_versao := null; end if;
      v_res := jsonb_build_object('status', r.status_code, 'erro', r.error_msg, 'verificado_em', r.created,
        'no_ar', r.status_code = 200, 'versao', v_versao);
      if r.status_code = 200 and v_versao ? 'versao' then
        v_commit := v_versao->>'commit';
        -- o que confirma uma publicação é o COMMIT no ar (a "versao" só muda quando o programa muda)
        select id into v_pub from jbcore.publicacoes p
        where p.ambiente = 'nuvem' and p.situacao = 'preparada' and v_commit is not null and p.commit_ref = v_commit
        order by id desc limit 1;
        if v_pub is not null then
          update jbcore.publicacoes set situacao = 'verificada', versao = v_versao->>'versao', sha256 = v_versao->>'programa_sha256',
            detalhe = detalhe || jsonb_build_object('verificada_em', now(), 'construido_em', v_versao->'construido_em',
                                                    'ponte', v_versao->'ponte', 'nuvem_sha256', v_versao->'nuvem_sha256')
          where id = v_pub;
          update jbcore.publicacoes set situacao = 'falhou', detalhe = detalhe || '{"motivo": "substituída por outra tentativa do mesmo commit"}'::jsonb
          where ambiente = 'nuvem' and situacao = 'preparada' and commit_ref = v_commit and id < v_pub;
        elsif not exists (
          select 1 from jbcore.publicacoes p where p.ambiente = 'nuvem' and p.situacao = 'verificada'
            and ((v_commit is not null and p.commit_ref = v_commit)
                 or (v_commit is null and p.detalhe->>'nuvem_sha256' = v_versao->>'nuvem_sha256'))) then
          insert into jbcore.publicacoes (ambiente, versao, sha256, commit_ref, situacao, detalhe)
          values ('nuvem', v_versao->>'versao', v_versao->>'programa_sha256', v_commit, 'verificada',
                  jsonb_build_object('origem', 'verificacao_automatica', 'construido_em', v_versao->'construido_em',
                                     'ponte', v_versao->'ponte', 'nuvem_sha256', v_versao->'nuvem_sha256'));
        end if;
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

revoke all on function jbcore.publicar_nuvem(text, text, text, text) from public, anon, authenticated;
revoke all on function jbcore.resposta(bigint) from public, anon, authenticated;
revoke all on function jbcore.conferir_publicacoes() from public, anon, authenticated;
revoke all on function jbcore.verificar_hospedagem() from public, anon, authenticated;
