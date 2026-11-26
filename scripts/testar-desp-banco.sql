-- =====================================================================================================
-- V177 · Despesas de Entrega — teste das regras do banco (servidor), com dados FICTÍCIOS.
-- Roda tudo numa transação que termina em ROLLBACK: nada fica gravado no banco.
-- Uso (conector do Supabase, execute_sql): antes de a migração estar aplicada, cole o conteúdo de
-- supabase/migrations/20261125230000_desp_entrega.sql logo depois do "begin;"; depois, rode como está.
-- As funções são chamadas com o "crachá" (token) de cada pessoa fictícia; a leitura direta (regras de
-- linha) é conferida com o papel "authenticated", igual ao que o site usa.
-- Resultado: uma linha por conferência (teste, ok, detalhe). Todas precisam vir com ok = true.
-- =====================================================================================================
begin;

create temp table r (n serial, teste text, ok boolean, detalhe text);

-- pessoas fictícias: dois motoristas, um funcionário do Combustível, quem aprova e um administrador
insert into auth.users (id, email) values
 ('00000000-0000-4000-8000-0000000d0001', 'teste-mot-a@jbgestao.invalid'),
 ('00000000-0000-4000-8000-0000000d0002', 'teste-mot-b@jbgestao.invalid'),
 ('00000000-0000-4000-8000-0000000d0003', 'teste-comb@jbgestao.invalid'),
 ('00000000-0000-4000-8000-0000000d0004', 'teste-aprova@jbgestao.invalid'),
 ('00000000-0000-4000-8000-0000000d0005', 'teste-adm@jbgestao.invalid');
insert into seg.perfis (user_id, usuario, nome, uid_app, admin, trocar_senha) values
 ('00000000-0000-4000-8000-0000000d0001', 'teste.mota', 'Motorista Teste A', 'u_testeMotA01', false, false),
 ('00000000-0000-4000-8000-0000000d0002', 'teste.motb', 'Motorista Teste B', 'u_testeMotB01', false, false),
 ('00000000-0000-4000-8000-0000000d0003', 'teste.comb', 'Escritório Teste', 'u_testeComb01', false, false),
 ('00000000-0000-4000-8000-0000000d0004', 'teste.aprova', 'Aprovador Teste', 'u_testeAprov1', false, false),
 ('00000000-0000-4000-8000-0000000d0005', 'teste.adm', 'Administrador Teste', 'u_testeAdm001', true, false);
insert into seg.sessoes (session_id, user_id) values
 ('00000000-0000-4000-8000-00000005e001', '00000000-0000-4000-8000-0000000d0001'),
 ('00000000-0000-4000-8000-00000005e002', '00000000-0000-4000-8000-0000000d0002'),
 ('00000000-0000-4000-8000-00000005e003', '00000000-0000-4000-8000-0000000d0003'),
 ('00000000-0000-4000-8000-00000005e004', '00000000-0000-4000-8000-0000000d0004'),
 ('00000000-0000-4000-8000-00000005e005', '00000000-0000-4000-8000-0000000d0005');
insert into seg.permissoes (user_id, modulo, ler, criar, editar, excluir) values
 ('00000000-0000-4000-8000-0000000d0003', 'compras', true, true, true, true),
 ('00000000-0000-4000-8000-0000000d0004', 'compras', true, true, true, false),
 ('00000000-0000-4000-8000-0000000d0001', 'compras', true, true, true, true);   -- permissão dada por engano a um motorista: não pode valer

-- caminhões e cadastro fictícios (o sistema grava sem login)
insert into public.docs (colecao, id, dados) values
 ('locais', 'teste-cam-01', '{"id":"teste-cam-01","nome":"Caminhão Teste 01","identificacao":"TST-0A01","tipo":"Caminhão","setor":"combustivel","situacao":"Ativo"}'),
 ('locais', 'teste-cam-02', '{"id":"teste-cam-02","nome":"Caminhão Teste 02","identificacao":"TST-0B02","tipo":"Caminhão","setor":"combustivel","situacao":"Ativo"}'),
 ('despEntCad', 'cfg', '{"id":"cfg","tipo":"cfg","aprovadores":["u_testeAprov1"],"regras":{"avulsaJustificativa":true}}'),
 ('despEntCad', 'mt_testeA01', '{"id":"mt_testeA01","tipo":"motorista","nome":"Motorista Teste A","situacao":"Ativo","veiculos":["teste-cam-01"],"userId":"00000000-0000-4000-8000-0000000d0001"}'),
 ('despEntCad', 'mt_testeB01', '{"id":"mt_testeB01","tipo":"motorista","nome":"Motorista Teste B","situacao":"Ativo","veiculos":["teste-cam-02"],"userId":"00000000-0000-4000-8000-0000000d0002"}'),
 ('despEntCad', 'mt_testeC01', '{"id":"mt_testeC01","tipo":"motorista","nome":"Motorista Teste C","situacao":"Ativo","veiculos":[]}')
on conflict (colecao, id) do update set dados = excluded.dados;

-- paridade do "hashTxt" do programa (os mesmos números calculados no Node)
insert into r (teste, ok, detalhe)
select 'hash igual ao do programa', seg.desp_hash('de_abc123XYZ7') = 1805222636 and seg.desp_hash('vg_testeviagem01') = 1625583687
       and seg.desp_chave('2026-11-25', 'de_abc123XYZ7') = '2026-11-s4',
       seg.desp_hash('de_abc123XYZ7')::text || ' / ' || seg.desp_hash('vg_testeviagem01')::text || ' / ' || seg.desp_chave('2026-11-25', 'de_abc123XYZ7');

-- ================= como o motorista A =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0001","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e001"}', true);
-- leitura direta com o papel do site (regras de linha valendo)
select set_config('role', 'authenticated', true);
select set_config('jb.t_docs', (select count(*)::text from public.docs), true);
select set_config('jb.t_fotos', (select count(*)::text from storage.objects where bucket_id = 'anexos'), true);
select set_config('role', 'postgres', true);
insert into r (teste, ok, detalhe) select 'motorista não lê nenhum documento direto (mesmo com permissão dada por engano)', current_setting('jb.t_docs') = '0', current_setting('jb.t_docs');
insert into r (teste, ok, detalhe) select 'motorista não abre fotos de outras pessoas', current_setting('jb.t_fotos') = '0', current_setting('jb.t_fotos');
insert into r (teste, ok, detalhe) select 'jb_mot_sou: é motorista', public.jb_mot_sou(), '';
insert into r (teste, ok, detalhe) select 'jb_mot_eu: quem é, caminhão liberado e regras',
  x->'motorista'->>'id' = 'mt_testeA01' and jsonb_array_length(x->'veiculos') = 1 and x->'veiculos'->0->>'placa' = 'TST-0A01'
  and (x->'regras'->>'avulsaJustificativa')::boolean, x::text from (select public.jb_mot_eu() x) s;

-- viagem iniciada pelo motorista
insert into r (teste, ok, detalhe) select 'iniciar viagem', x->>'st' = 'andamento' and x->>'veiculoId' = 'teste-cam-01' and (x->>'numero') ~ '^[0-9]+$', x::text
  from (select public.jb_mot_viagem('{"acao":"iniciar","id":"vg_testeviagem01","destino":"Entrega teste","km":1000}') x) s;
do $t$ begin perform public.jb_mot_viagem('{"acao":"iniciar","id":"vg_testeviagem02","destino":"Outra"}');
  insert into r (teste, ok, detalhe) values ('segunda viagem ao mesmo tempo é recusada', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('segunda viagem ao mesmo tempo é recusada', sqlerrm like '%já tem uma viagem em andamento%', sqlerrm); end $t$;

-- as quatro despesas do exemplo do projeto: diesel 850, alimentação 90, pedágio 45, borracharia 80
insert into r (teste, ok, detalhe) select 'lançar diesel na viagem', x->>'st' = 'aguardando' and (x->>'valor')::numeric = 850 and x->>'viagemId' = 'vg_testeviagem01'
  and x->>'veiculoPlaca' = 'TST-0A01' and (x->>'repetida')::boolean = false, x::text
  from (select public.jb_mot_lancar('{"id":"de_testediesel01","tipoDesp":"combustivel","valor":850,"viagemId":"vg_testeviagem01","litros":140.5,"km":1180,"forma":"Dinheiro","origem":"adiantamento","local":"Posto Teste"}') x) s;
insert into r (teste, ok, detalhe) select 'mesmo código de novo não duplica', (x->>'repetida')::boolean and (x->>'valor')::numeric = 850, x::text
  from (select public.jb_mot_lancar('{"id":"de_testediesel01","tipoDesp":"combustivel","valor":850,"viagemId":"vg_testeviagem01"}') x) s;
select public.jb_mot_lancar('{"id":"de_testealim0001","tipoDesp":"alimentacao","valor":90,"viagemId":"vg_testeviagem01","forma":"Dinheiro","origem":"motorista"}');
select public.jb_mot_lancar('{"id":"de_testepedag001","tipoDesp":"pedagio","valor":45,"viagemId":"vg_testeviagem01"}');
select public.jb_mot_lancar('{"id":"de_testeborr0001","tipoDesp":"manutencao","valor":80,"viagemId":"vg_testeviagem01","local":"Borracharia Teste"}');

do $t$ begin perform public.jb_mot_lancar('{"id":"de_testeavulsa01","tipoDesp":"alimentacao","valor":20}');
  insert into r (teste, ok, detalhe) values ('sem viagem e sem motivo é recusado', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('sem viagem e sem motivo é recusado', sqlerrm like '%escreva o motivo%', sqlerrm); end $t$;
insert into r (teste, ok, detalhe) select 'sem viagem com motivo é aceito', (x->>'valor')::numeric = 20 and x->>'justificativa' is not null, x::text
  from (select public.jb_mot_lancar('{"id":"de_testeavulsa01","tipoDesp":"alimentacao","valor":20,"justificativa":"Almoço antes de sair"}') x) s;
do $t$ begin perform public.jb_mot_lancar('{"id":"de_testezero0001","tipoDesp":"pedagio","valor":0,"viagemId":"vg_testeviagem01"}');
  insert into r (teste, ok, detalhe) values ('valor zero é recusado', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('valor zero é recusado', sqlerrm like '%maior que zero%', sqlerrm); end $t$;
do $t$ begin perform public.jb_mot_lancar('{"id":"de_testecam00001","tipoDesp":"pedagio","valor":10,"viagemId":"vg_testeviagem01","veiculoId":"teste-cam-02"}');
  insert into r (teste, ok, detalhe) values ('caminhão de outro motorista é recusado', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('caminhão de outro motorista é recusado', sqlerrm like '%não está liberado%', sqlerrm); end $t$;
do $t$ begin perform public.jb_mot_lancar('{"id":"de_testefut00001","tipoDesp":"pedagio","valor":10,"viagemId":"vg_testeviagem01","data":"2099-01-01"}');
  insert into r (teste, ok, detalhe) values ('data no futuro é recusada', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('data no futuro é recusada', sqlerrm like '%depois de hoje%', sqlerrm); end $t$;
do $t$ begin perform public.jb_mot_lancar('{"id":"de_testefoto0001","tipoDesp":"pedagio","valor":10,"viagemId":"vg_testeviagem01","foto":{"id":"0123456789abcdef0123456789abcdef"}}');
  insert into r (teste, ok, detalhe) values ('foto que não chegou ao servidor é recusada', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('foto que não chegou ao servidor é recusada', sqlerrm like '%não chegou ao servidor%', sqlerrm); end $t$;
do $t$ begin perform public.jb_gravar('despEnt', '2026-11-s0', '{"chave":"2026-11-s0","items":{}}');
  insert into r (teste, ok, detalhe) values ('motorista não grava direto no banco (mesmo com permissão dada por engano)', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('motorista não grava direto no banco (mesmo com permissão dada por engano)', sqlerrm like '%login é de motorista%', sqlerrm); end $t$;
do $t$ begin perform public.jb_gravar('fornecedores', 'teste-forn-01', '{"id":"teste-forn-01","nome":"x"}');
  insert into r (teste, ok, detalhe) values ('motorista não grava em outro setor', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('motorista não grava em outro setor', sqlerrm like '%login é de motorista%', sqlerrm); end $t$;

-- corrigir antes da conferência
insert into r (teste, ok, detalhe) select 'corrigir antes da conferência', (x->>'valor')::numeric = 95 and x->>'st' = 'aguardando', x::text
  from (select public.jb_mot_corrigir('{"id":"de_testealim0001","campos":{"tipoDesp":"alimentacao","valor":95,"viagemId":"vg_testeviagem01","forma":"Dinheiro","origem":"motorista"},"motivo":"valor errado"}') x) s;
insert into r (teste, ok, detalhe) select 'lista do motorista: só os dele', jsonb_array_length(x->'despesas') = 5 and jsonb_array_length(x->'viagens') = 1, x::text
  from (select public.jb_mot_lista('{}') x) s;

-- ================= como o motorista B =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0002","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e002"}', true);
insert into r (teste, ok, detalhe) select 'outro motorista não vê os lançamentos do A', jsonb_array_length(x->'despesas') = 0 and jsonb_array_length(x->'viagens') = 0, x::text
  from (select public.jb_mot_lista('{}') x) s;
do $t$ begin perform public.jb_mot_corrigir('{"id":"de_testediesel01","campos":{"tipoDesp":"combustivel","valor":1,"viagemId":"vg_testeviagem01"}}');
  insert into r (teste, ok, detalhe) values ('outro motorista não corrige o que é do A', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('outro motorista não corrige o que é do A', sqlerrm like '%não encontrado%', sqlerrm); end $t$;
do $t$ begin perform public.jb_mot_lancar('{"id":"de_testeviagA001","tipoDesp":"pedagio","valor":10,"viagemId":"vg_testeviagem01"}');
  insert into r (teste, ok, detalhe) values ('outro motorista não lança na viagem do A', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('outro motorista não lança na viagem do A', sqlerrm like '%Viagem não encontrada%', sqlerrm); end $t$;

-- ================= como o funcionário do Combustível (não aprova) =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0003","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e003"}', true);
select set_config('role', 'authenticated', true);
select set_config('jb.t_func', (select count(*)::text from public.docs where colecao = 'despEnt'), true);
select set_config('role', 'postgres', true);
insert into r (teste, ok, detalhe) select 'funcionário do Combustível vê os lançamentos', current_setting('jb.t_func')::int > 0, current_setting('jb.t_func');
insert into r (teste, ok, detalhe) select 'funcionário não é motorista', not public.jb_mot_sou(), '';
do $t$ begin perform public.jb_atualizar('despEntCad', 'mt_testeC01', '{"userId":"00000000-0000-4000-8000-0000000d0003"}');
  insert into r (teste, ok, detalhe) values ('só o administrador liga o login do motorista', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('só o administrador liga o login do motorista', sqlerrm like '%Só o administrador liga%', sqlerrm); end $t$;
do $t$ begin perform public.jb_atualizar('despEntCad', 'mt_testeC01', '{"telefone":"(00) 0000-0000"}');
  insert into r (teste, ok, detalhe) values ('funcionário edita o cadastro do motorista (sem o login)', true, '');
exception when others then insert into r (teste, ok, detalhe) values ('funcionário edita o cadastro do motorista (sem o login)', false, sqlerrm); end $t$;
do $t$ declare v_doc text; begin
  select d.id into v_doc from public.docs d where d.colecao = 'despEnt' and jsonb_typeof(d.dados->'items'->'de_testediesel01') = 'object';
  perform public.jb_atualizar('despEnt', v_doc, '{"items":{"de_testediesel01":{"st":"aprovado"}}}');
  insert into r (teste, ok, detalhe) values ('quem não aprova não aprova', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('quem não aprova não aprova', sqlerrm like '%Só quem aprova%', sqlerrm); end $t$;
do $t$ declare v_doc text; begin
  select d.id into v_doc from public.docs d where d.colecao = 'despEnt' and jsonb_typeof(d.dados->'items'->'de_testepedag001') = 'object';
  perform public.jb_atualizar('despEnt', v_doc, '{"items":{"de_testepedag001":null}}');
  insert into r (teste, ok, detalhe) values ('lançamento não é apagado', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('lançamento não é apagado', sqlerrm like '%não são apagados%', sqlerrm); end $t$;
do $t$ begin perform public.jb_atualizar('despEntCad', 'cfg', '{"aprovadores":["u_testeComb01"]}');
  insert into r (teste, ok, detalhe) values ('configuração só o administrador', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('configuração só o administrador', sqlerrm like '%Só o administrador muda%', sqlerrm); end $t$;
do $t$ declare v_doc text; begin
  select d.id into v_doc from public.docs d where d.colecao = 'despEnt' and jsonb_typeof(d.dados->'items'->'de_testeborr0001') = 'object';
  perform public.jb_atualizar('despEnt', v_doc, '{"items":{"de_testeborr0001":{"obs":"conferido o cupom"}}}');
  insert into r (teste, ok, detalhe) values ('funcionário anota observação (não é decisão)', true, '');
exception when others then insert into r (teste, ok, detalhe) values ('funcionário anota observação (não é decisão)', false, sqlerrm); end $t$;

-- ================= como quem aprova =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0004","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e004"}', true);
do $t$ declare v_doc text; begin
  select d.id into v_doc from public.docs d where d.colecao = 'despEnt' and jsonb_typeof(d.dados->'items'->'de_testediesel01') = 'object';
  perform public.jb_atualizar('despEnt', v_doc, '{"items":{"de_testediesel01":{"st":"aprovado"}}}');
  insert into r (teste, ok, detalhe) values ('quem aprova aprova', true, '');
exception when others then insert into r (teste, ok, detalhe) values ('quem aprova aprova', false, sqlerrm); end $t$;

-- ================= de novo o funcionário: aprovado não muda =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0003","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e003"}', true);
do $t$ declare v_doc text; begin
  select d.id into v_doc from public.docs d where d.colecao = 'despEnt' and jsonb_typeof(d.dados->'items'->'de_testediesel01') = 'object';
  perform public.jb_atualizar('despEnt', v_doc, '{"items":{"de_testediesel01":{"valor":1}}}');
  insert into r (teste, ok, detalhe) values ('aprovado: valor não muda por quem não aprova', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('aprovado: valor não muda por quem não aprova', sqlerrm like '%só é corrigido por quem aprova%', sqlerrm); end $t$;

-- ================= motorista A depois da aprovação =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0001","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e001"}', true);
do $t$ begin perform public.jb_mot_corrigir('{"id":"de_testediesel01","campos":{"tipoDesp":"combustivel","valor":800,"viagemId":"vg_testeviagem01"}}');
  insert into r (teste, ok, detalhe) values ('aprovado: motorista não altera', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('aprovado: motorista não altera', sqlerrm like '%Pedir correção%', sqlerrm); end $t$;
insert into r (teste, ok, detalhe) select 'aprovado: motorista pede correção', x->'pedidoCorrecao'->>'st' = 'aberto' and (x->>'valor')::numeric = 850, x::text
  from (select public.jb_mot_pedir_correcao('{"id":"de_testediesel01","texto":"o valor certo é 800"}') x) s;
do $t$ begin perform public.jb_mot_viagem('{"acao":"encerrar","id":"vg_testeviagem01","km":900}');
  insert into r (teste, ok, detalhe) values ('km final menor que o da saída é recusado', false, 'aceitou');
exception when others then insert into r (teste, ok, detalhe) values ('km final menor que o da saída é recusado', sqlerrm like '%km final%', sqlerrm); end $t$;
insert into r (teste, ok, detalhe) select 'encerrar viagem', x->>'st' = 'concluida' and (x->>'kmFim')::numeric = 1420, x::text
  from (select public.jb_mot_viagem('{"acao":"encerrar","id":"vg_testeviagem01","km":1420}') x) s;

-- ================= administrador =================
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000d0005","role":"authenticated","session_id":"00000000-0000-4000-8000-00000005e005"}', true);
do $t$ begin perform public.jb_atualizar('despEntCad', 'cfg', '{"regras":{"exigirViagem":false}}');
  insert into r (teste, ok, detalhe) values ('administrador muda a configuração', true, '');
exception when others then insert into r (teste, ok, detalhe) values ('administrador muda a configuração', false, sqlerrm); end $t$;
do $t$ begin perform public.jb_atualizar('despEntCad', 'mt_testeC01', '{"userId":"00000000-0000-4000-8000-0000000d0003"}');
  insert into r (teste, ok, detalhe) values ('administrador liga o login do motorista', true, '');
exception when others then insert into r (teste, ok, detalhe) values ('administrador liga o login do motorista', false, sqlerrm); end $t$;
insert into r (teste, ok, detalhe) select 'logins de motorista (administrador)', jsonb_array_length(public.jb_desp_logins()) = 3, public.jb_desp_logins()::text;

-- ================= conferências finais (sem login) =================
select set_config('request.jwt.claims', '', true);
insert into r (teste, ok, detalhe)
select 'custo da viagem = 850 + 95 + 45 + 80 = 1.070 (sem duplicar)', sum((e.value->>'valor')::numeric) = 1070, sum((e.value->>'valor')::numeric)::text
  from public.docs d, jsonb_each(d.dados->'items') e
 where d.colecao = 'despEnt' and e.value->>'tipo' = 'desp' and e.value->>'viagemId' = 'vg_testeviagem01' and e.value->>'st' <> 'cancelado';
insert into r (teste, ok, detalhe)
select 'números únicos dos lançamentos', count(*) = count(distinct e.value->>'numero') and count(*) = 5, string_agg(e.value->>'numero', ',' order by e.value->>'numero')
  from public.docs d, jsonb_each(d.dados->'items') e where d.colecao = 'despEnt' and e.value->>'tipo' = 'desp' and e.key like 'de_teste%';
insert into r (teste, ok, detalhe)
select 'classificação: diesel → Combustível para entrega; alimentação → Alimentação; pedágio sem categoria (pendência)',
  bool_and(case e.key when 'de_testediesel01' then e.value->>'categoria' = 'Combustível para entrega' and e.value->>'destino' = 'entregas'
                      when 'de_testealim0001' then e.value->>'categoria' = 'Alimentação' and e.value->>'destino' = 'gerais'
                      when 'de_testepedag001' then e.value->>'categoria' = '' and e.value->>'destino' = 'gerais'
                      else true end), string_agg(e.key || '=' || coalesce(e.value->>'categoria', '?'), '; ')
  from public.docs d, jsonb_each(d.dados->'items') e where d.colecao = 'despEnt' and e.key like 'de_teste%';
insert into r (teste, ok, detalhe)
select 'histórico guarda o antes da correção', (e.value->'hist'->1->'antes'->>'valor')::numeric = 90, (e.value->'hist')::text
  from public.docs d, jsonb_each(d.dados->'items') e where d.colecao = 'despEnt' and e.key = 'de_testealim0001';
insert into r (teste, ok, detalhe)
select 'auditoria do banco registrou as gravações', count(*) > 0, count(*)::text from seg.auditoria where colecao = 'despEnt' and quando > now() - interval '5 minutes';

select n, teste, ok, left(detalhe, 300) detalhe from r order by n;
rollback;
