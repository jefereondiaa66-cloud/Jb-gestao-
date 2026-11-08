-- =====================================================================
-- Centro de Inventário (módulo independente dentro do JB Gestão)
-- Esquema próprio "inv": relacional, separado de public.docs. Nada dos
-- outros setores é alterado. O esquema não fica exposto na API: o único
-- caminho é public.jb_inv (nuvem, sessão conferida) e inv.api_ponte
-- (Claude, conector do dono). Só quem está em inv.acessos entra, e ser
-- administrador do JB não basta.
-- Reversão: 20261108233000_inv_01_centro_inventario.down.sql
-- =====================================================================
create schema if not exists inv;
revoke all on schema inv from public;

/* ---------- catálogos e acesso ---------- */
create table inv.naturezas(
  codigo text primary key, nome text not null, ativa boolean not null default false);
comment on table inv.naturezas is 'Preparação para inventários de estoque/materiais: só "patrimonial" está ativa. Estoque terá estruturas e relatórios próprios.';
insert into inv.naturezas values
 ('patrimonial','Inventário patrimonial',true),('mercadorias','Mercadorias',false),('materias_primas','Matérias-primas',false),
 ('consumo','Materiais de consumo',false),('insumos','Insumos',false),('acabados','Produtos acabados',false),('auxiliares','Materiais auxiliares',false);

create table inv.acessos(
  user_id uuid primary key references seg.perfis(user_id),
  permissoes jsonb not null,
  concedido_em timestamptz not null default now());

/* ---------- empresas ---------- */
create table inv.empresas(
  id uuid primary key default gen_random_uuid(),
  razao_social text not null check (length(btrim(razao_social))>0),
  nome_fantasia text, cnpj text, inscricao_estadual text, inscricao_municipal text, segmento text,
  endereco text, cidade text, uf text, cep text, telefone text, email text, responsavel text, observacoes text,
  data_cadastro date not null default current_date,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  prefixo_codigo text not null default 'PAT-',
  digitos_codigo int not null default 5 check (digitos_codigo between 1 and 12),
  proximo_numero bigint not null default 1,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create unique index empresas_cnpj_un on inv.empresas(cnpj) where cnpj is not null;

/* ---------- estrutura de cada empresa ---------- */
create table inv.unidades(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  nome text not null, codigo text, endereco text,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), unique (empresa_id,nome));

create table inv.departamentos(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  pai_id uuid, nome text not null, codigo text, ordem int not null default 0,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), foreign key (empresa_id,pai_id) references inv.departamentos(empresa_id,id));
create unique index departamentos_nome_un on inv.departamentos(empresa_id,coalesce(pai_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(nome));

create table inv.localizacoes(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  pai_id uuid, unidade_id uuid, tipo text not null default 'Sala', nome text not null, codigo text, ordem int not null default 0,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id),
  foreign key (empresa_id,pai_id) references inv.localizacoes(empresa_id,id),
  foreign key (empresa_id,unidade_id) references inv.unidades(empresa_id,id));
create unique index localizacoes_nome_un on inv.localizacoes(empresa_id,coalesce(pai_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(nome));

create table inv.grupos(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  natureza text not null default 'patrimonial' references inv.naturezas(codigo),
  pai_id uuid, codigo text, nome text not null, descricao text, ordem int not null default 0,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), foreign key (empresa_id,pai_id) references inv.grupos(empresa_id,id));
create unique index grupos_nome_un on inv.grupos(empresa_id,coalesce(pai_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(nome));
create unique index grupos_codigo_un on inv.grupos(empresa_id,codigo) where codigo is not null;

create table inv.responsaveis(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  nome text not null, cpf text, cargo text, departamento_id uuid, telefone text, email text,
  situacao text not null default 'ativa' check (situacao in ('ativa','inativa')),
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), foreign key (empresa_id,departamento_id) references inv.departamentos(empresa_id,id));
create unique index responsaveis_cpf_un on inv.responsaveis(empresa_id,cpf) where cpf is not null;

/* ---------- inventários ---------- */
create table inv.inventarios(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  natureza text not null default 'patrimonial' references inv.naturezas(codigo),
  nome text not null, codigo text not null, tipo text not null default 'Patrimonial', descricao text,
  data_inicio date, data_prevista date, data_conclusao date,
  responsavel text, equipe text, observacoes text, bens_previstos int check (bens_previstos is null or bens_previstos>=0),
  situacao text not null default 'Não iniciado'
    check (situacao in ('Não iniciado','Em andamento','Em conferência','Aguardando validação','Concluído','Arquivado')),
  aprovado_por text, aprovado_em timestamptz, resumo_final jsonb,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), unique (empresa_id,codigo));

/* ---------- bens ---------- */
create table inv.bens(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  codigo_patrimonial text not null, codigo_interno text, descricao text not null check (length(btrim(descricao))>0), nome_identificacao text,
  grupo_id uuid, subgrupo_id uuid,
  marca text, modelo text, fabricante text, numero_serie text, numero_identificacao text, cor text, dimensoes text, caracteristicas text,
  quantidade numeric not null default 1 check (quantidade>0),
  data_aquisicao date, valor_aquisicao numeric check (valor_aquisicao is null or valor_aquisicao>=0),
  valor_atual numeric check (valor_atual is null or valor_atual>=0),
  documento_fiscal text, numero_nf text, fornecedor text, forma_aquisicao text, data_incorporacao date,
  vida_util_meses int check (vida_util_meses is null or vida_util_meses>0),
  valor_residual numeric check (valor_residual is null or valor_residual>=0),
  taxa_depreciacao numeric check (taxa_depreciacao is null or taxa_depreciacao>0),
  unidade_id uuid, departamento_id uuid, setor_id uuid, localizacao_id uuid, localizacao_especifica text, responsavel_id uuid,
  conservacao text not null default 'Bom' check (conservacao in ('Novo','Ótimo','Bom','Regular','Ruim','Danificado','Em manutenção','Inservível')),
  situacao text not null default 'ativo' check (situacao in ('ativo','em_manutencao','baixado')),
  qr_token uuid not null default gen_random_uuid() unique,
  foto_id uuid, observacoes text, proxima_conferencia date,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), unique (empresa_id,codigo_patrimonial),
  foreign key (empresa_id,grupo_id) references inv.grupos(empresa_id,id),
  foreign key (empresa_id,subgrupo_id) references inv.grupos(empresa_id,id),
  foreign key (empresa_id,unidade_id) references inv.unidades(empresa_id,id),
  foreign key (empresa_id,departamento_id) references inv.departamentos(empresa_id,id),
  foreign key (empresa_id,setor_id) references inv.departamentos(empresa_id,id),
  foreign key (empresa_id,localizacao_id) references inv.localizacoes(empresa_id,id),
  foreign key (empresa_id,responsavel_id) references inv.responsaveis(empresa_id,id));
create index bens_empresa on inv.bens(empresa_id,situacao);

/* cada inventário guarda a fotografia dos seus bens: mexer depois num bem não altera inventário fechado */
create table inv.inventario_itens(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  inventario_id uuid not null, bem_id uuid, retrato jsonb not null default '{}'::jsonb,
  situacao text not null default 'Pendente'
    check (situacao in ('Localizado e conferido','Não localizado','Pendente','Encontrado sem cadastro','Com divergência','Danificado','Em manutenção')),
  quantidade_prevista numeric, quantidade_encontrada numeric, localizacao_encontrada text, localizacao_id_encontrada uuid,
  condicao text, observacoes text, divergencias text, conferido_em timestamptz, conferido_por text,
  criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), unique (inventario_id,bem_id),
  foreign key (empresa_id,inventario_id) references inv.inventarios(empresa_id,id),
  foreign key (empresa_id,bem_id) references inv.bens(empresa_id,id));
create index itens_inv on inv.inventario_itens(inventario_id,situacao);

create table inv.conferencias(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  inventario_id uuid not null, numero int not null, responsavel text, observacoes text,
  situacao text not null default 'aberta' check (situacao in ('aberta','finalizada')),
  iniciada_em timestamptz not null default now(), iniciada_por text,
  finalizada_em timestamptz, finalizada_por text, resumo jsonb,
  unique (empresa_id,id), unique (inventario_id,numero),
  foreign key (empresa_id,inventario_id) references inv.inventarios(empresa_id,id));
create unique index conferencia_uma_aberta on inv.conferencias(inventario_id) where situacao='aberta';

create table inv.leituras(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  inventario_id uuid not null, conferencia_id uuid not null, item_id uuid not null,
  situacao text not null, data_hora timestamptz not null default now(), responsavel text,
  localizacao_encontrada text, condicao text, quantidade numeric, observacoes text, divergencias text, registrado_por text,
  unique (empresa_id,id),
  foreign key (empresa_id,conferencia_id) references inv.conferencias(empresa_id,id),
  foreign key (empresa_id,item_id) references inv.inventario_itens(empresa_id,id));
create index leituras_inv on inv.leituras(inventario_id,data_hora desc);

/* ---------- movimentações, manutenção, termos, etiquetas ---------- */
create table inv.movimentacoes(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  bem_id uuid not null,
  tipo text not null check (tipo in ('Transferência entre setores','Transferência entre departamentos','Transferência entre unidades','Mudança de responsável','Envio para manutenção','Retorno da manutenção','Incorporação patrimonial','Baixa patrimonial')),
  data date not null default current_date, usuario text, justificativa text not null check (length(btrim(justificativa))>0),
  origem jsonb, destino jsonb, estorna_id uuid, cadastro_inicial boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (empresa_id,id),
  foreign key (empresa_id,bem_id) references inv.bens(empresa_id,id),
  foreign key (empresa_id,estorna_id) references inv.movimentacoes(empresa_id,id));
create index mov_bem on inv.movimentacoes(bem_id,criado_em desc);

create table inv.manutencoes(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  bem_id uuid not null, tipo text not null default 'Corretiva' check (tipo in ('Corretiva','Preventiva')),
  descricao text not null, fornecedor text, data_abertura date not null default current_date, data_prevista date, data_retorno date,
  custo numeric check (custo is null or custo>=0),
  situacao text not null default 'aberta' check (situacao in ('programada','aberta','concluida','cancelada')),
  observacoes text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), foreign key (empresa_id,bem_id) references inv.bens(empresa_id,id));

create table inv.termos(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  numero text not null, responsavel_id uuid not null, data date not null default current_date, local text,
  situacao text not null default 'Emitido' check (situacao in ('Emitido','Assinado','Cancelado')),
  responsavel jsonb not null, itens jsonb not null, emitido_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
  unique (empresa_id,id), unique (empresa_id,numero),
  foreign key (empresa_id,responsavel_id) references inv.responsaveis(empresa_id,id));

create table inv.etiquetas(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  bem_id uuid not null, modelo text not null, saida text, lote uuid not null, gerada_por text, gerada_em timestamptz not null default now(),
  unique (empresa_id,id), foreign key (empresa_id,bem_id) references inv.bens(empresa_id,id));
create index etiquetas_bem on inv.etiquetas(bem_id,gerada_em desc);

/* ---------- anexos (no próprio banco, em partes: valem igual na nuvem e no Claude) ---------- */
create table inv.arquivos(
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references inv.empresas(id),
  entidade text not null check (entidade in ('bem','leitura','movimentacao','manutencao','termo','empresa','inventario')),
  registro_id uuid not null,
  categoria text not null default 'Complementar' check (categoria in ('Fotografia','Nota fiscal','Comprovante','Contrato','Manual','Complementar')),
  nome text not null, tipo text, tamanho bigint not null check (tamanho>0), partes int not null check (partes between 1 and 400), miniatura text,
  completo boolean not null default false, enviado_por text, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), excluido_em timestamptz,
  unique (empresa_id,id));
create index arquivos_registro on inv.arquivos(empresa_id,entidade,registro_id) where excluido_em is null;
create table inv.arquivo_partes(
  arquivo_id uuid not null references inv.arquivos(id) on delete cascade, n int not null, dados bytea not null, primary key (arquivo_id,n));
alter table inv.arquivo_partes alter column dados set storage external;
alter table inv.bens add foreign key (empresa_id,foto_id) references inv.arquivos(empresa_id,id);

/* ---------- auditoria e cópias ---------- */
create table inv.auditoria(
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(), user_id uuid, usuario text, empresa_id uuid,
  operacao text not null, tabela text not null, registro_id uuid, alteracao jsonb);
create index auditoria_empresa on inv.auditoria(empresa_id,id desc);
create index auditoria_registro on inv.auditoria(registro_id,id desc);

create table inv.copias(
  id bigint generated always as identity primary key,
  feita_em timestamptz not null default now(), tamanho_bytes bigint not null, conteudo jsonb not null);

do $$ declare t text; begin
  for t in select tablename from pg_tables where schemaname='inv' loop
    execute format('alter table inv.%I enable row level security', t);
  end loop;
end $$;

/* ---------- gatilhos ---------- */
create function inv.t_atualizado() returns trigger language plpgsql set search_path=inv,pg_temp as $$
begin new.atualizado_em := now(); return new; end $$;

create function inv.t_imutavel() returns trigger language plpgsql set search_path=inv,pg_temp as $$
begin raise exception 'Este histórico é permanente e não pode ser alterado nem apagado.' using errcode='22023'; end $$;

create function inv.t_sem_exclusao() returns trigger language plpgsql set search_path=inv,pg_temp as $$
begin raise exception 'Este registro não pode ser apagado. Use inativar, baixar ou arquivar.' using errcode='22023'; end $$;

create function inv.usuario() returns uuid language sql stable set search_path=inv,pg_temp as $$
  select nullif(current_setting('inv.user_id',true),'')::uuid $$;
create function inv.usuario_nome() returns text language sql stable set search_path=inv,pg_temp as $$
  select coalesce(nullif(current_setting('inv.user_nome',true),''),'Sistema') $$;

create function inv.t_auditar() returns trigger language plpgsql set search_path=inv,pg_temp as $$
declare a jsonb; d jsonb; dif jsonb; v_id uuid; v_emp uuid; ruido text[] := array['atualizado_em','retrato','miniatura','proximo_numero'];
begin
  if TG_OP<>'INSERT' then a := to_jsonb(old); end if;
  if TG_OP<>'DELETE' then d := to_jsonb(new); end if;
  v_id := coalesce(d,a)->>'id';
  v_emp := case when TG_TABLE_NAME='empresas' then v_id else (coalesce(d,a)->>'empresa_id')::uuid end;
  if TG_OP='UPDATE' then
    select jsonb_object_agg(k,jsonb_build_object('de',a->k,'para',d->k)) into dif
      from jsonb_object_keys(d) k where k<>all(ruido) and (a->k) is distinct from (d->k);
    if dif is null then return new; end if;
  elsif TG_OP='INSERT' then
    select jsonb_object_agg(k,v) into dif from jsonb_each(d) x(k,v) where k<>all(ruido) and v<>'null'::jsonb;
  else
    dif := a - ruido;
  end if;
  insert into inv.auditoria(user_id,usuario,empresa_id,operacao,tabela,registro_id,alteracao)
    values (inv.usuario(),inv.usuario_nome(),v_emp,case TG_OP when 'INSERT' then 'Cadastro' when 'UPDATE' then 'Alteração' else 'Exclusão' end,TG_TABLE_NAME,v_id,dif);
  return coalesce(new,old);
end $$;

do $$ declare t text; begin
  foreach t in array array['empresas','unidades','departamentos','localizacoes','grupos','responsaveis','inventarios','bens','inventario_itens','manutencoes','termos','arquivos'] loop
    if t<>'x' then
      execute format('create trigger aud after insert or update or delete on inv.%I for each row execute function inv.t_auditar()',t);
      execute format('create trigger atu before update on inv.%I for each row execute function inv.t_atualizado()',t);
    end if;
  end loop;
  foreach t in array array['conferencias','leituras','movimentacoes','etiquetas'] loop
    execute format('create trigger aud after insert or update or delete on inv.%I for each row execute function inv.t_auditar()',t);
  end loop;
end $$;

create trigger imutavel before update or delete on inv.auditoria for each row execute function inv.t_imutavel();
create trigger imutavel before update or delete on inv.movimentacoes for each row execute function inv.t_imutavel();
create trigger imutavel before update or delete on inv.leituras for each row execute function inv.t_imutavel();
create trigger sem_exclusao before delete on inv.empresas for each row execute function inv.t_sem_exclusao();
create trigger sem_exclusao before delete on inv.bens for each row execute function inv.t_sem_exclusao();
create trigger sem_exclusao before delete on inv.inventarios for each row execute function inv.t_sem_exclusao();
create trigger sem_exclusao before delete on inv.termos for each row execute function inv.t_sem_exclusao();

/* nós de árvore: não pode virar filho de si mesmo */
create function inv.t_arvore() returns trigger language plpgsql set search_path=inv,pg_temp as $$
declare v uuid := new.pai_id; n int := 0; p uuid;
begin
  while v is not null loop
    if v=new.id then raise exception 'Um item não pode ficar dentro dele mesmo.' using errcode='22023'; end if;
    execute format('select pai_id from inv.%I where id=$1',TG_TABLE_NAME) into p using v; v := p; n := n+1;
    if n>50 then raise exception 'A hierarquia está profunda demais.' using errcode='22023'; end if;
  end loop;
  return new;
end $$;
create trigger arvore before insert or update of pai_id on inv.departamentos for each row execute function inv.t_arvore();
create trigger arvore before insert or update of pai_id on inv.localizacoes for each row execute function inv.t_arvore();
create trigger arvore before insert or update of pai_id on inv.grupos for each row execute function inv.t_arvore();

/* bem: conferências de coerência */
create function inv.t_bem_valida() returns trigger language plpgsql set search_path=inv,pg_temp as $$
declare v uuid; n int := 0; ok boolean;
begin
  if TG_OP='UPDATE' and (new.empresa_id<>old.empresa_id or new.qr_token<>old.qr_token) then
    raise exception 'A empresa e o QR Code de um bem não mudam.' using errcode='22023'; end if;
  if new.subgrupo_id is not null then
    if new.grupo_id is null then raise exception 'Escolha o grupo do subgrupo.' using errcode='22023'; end if;
    v := new.subgrupo_id; ok := false;
    while v is not null and n<50 loop
      select pai_id into v from inv.grupos where id=v; n := n+1;
      if v=new.grupo_id then ok := true; exit; end if;
    end loop;
    if not ok then raise exception 'O subgrupo escolhido não pertence a esse grupo.' using errcode='22023'; end if;
  end if;
  if new.setor_id is not null then
    if new.departamento_id is null then raise exception 'Escolha o departamento do setor.' using errcode='22023'; end if;
    v := new.setor_id; ok := false; n := 0;
    while v is not null and n<50 loop
      select pai_id into v from inv.departamentos where id=v; n := n+1;
      if v=new.departamento_id then ok := true; exit; end if;
    end loop;
    if not ok then raise exception 'O setor escolhido não pertence a esse departamento.' using errcode='22023'; end if;
  end if;
  return new;
end $$;
create trigger valida before insert or update on inv.bens for each row execute function inv.t_bem_valida();

/* itens de inventário fechado ficam congelados */
create function inv.inventario_fechado(p uuid) returns boolean language sql stable set search_path=inv,pg_temp as $$
  select coalesce((select situacao in ('Concluído','Arquivado') from inv.inventarios where id=p),false) $$;
create function inv.t_item_congelado() returns trigger language plpgsql set search_path=inv,pg_temp as $$
begin
  if inv.inventario_fechado(coalesce(new.inventario_id,old.inventario_id)) then
    raise exception 'Inventário concluído: seus dados ficam guardados como estão.' using errcode='22023'; end if;
  return coalesce(new,old);
end $$;
create trigger congelado before insert or update or delete on inv.inventario_itens for each row execute function inv.t_item_congelado();

create function inv.t_inventario_regra() returns trigger language plpgsql set search_path=inv,pg_temp as $$
begin
  if old.situacao in ('Concluído','Arquivado') then
    if (to_jsonb(new)-'situacao'-'atualizado_em')<>(to_jsonb(old)-'situacao'-'atualizado_em')
       or new.situacao not in ('Concluído','Arquivado') then
      raise exception 'Inventário concluído não pode ser alterado; ele só pode ser arquivado.' using errcode='22023';
    end if;
  end if;
  return new;
end $$;
create trigger regra before update on inv.inventarios for each row execute function inv.t_inventario_regra();

/* ---------- depreciação: só com os parâmetros necessários ---------- */
create function inv.depreciacao(b inv.bens) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare ini date := coalesce(b.data_incorporacao,b.data_aquisicao); m int; base numeric; mensal numeric; acum numeric;
begin
  if b.valor_aquisicao is null or ini is null or b.valor_residual is null or (b.vida_util_meses is null and b.taxa_depreciacao is null) or ini>current_date then return null; end if;
  if b.valor_residual>b.valor_aquisicao then return null; end if;
  m := extract(year from age(current_date,ini))::int*12+extract(month from age(current_date,ini))::int;
  base := b.valor_aquisicao-b.valor_residual;
  mensal := case when b.vida_util_meses is not null then base/b.vida_util_meses else b.valor_aquisicao*b.taxa_depreciacao/1200 end;
  acum := round(least(base,mensal*m),2);
  return jsonb_build_object('meses',m,'mensal',round(mensal,2),'acumulada',acum,'valor_liquido',round(b.valor_aquisicao-acum,2),
    'metodo',case when b.vida_util_meses is not null then 'Linear pela vida útil' else 'Linear pela taxa anual' end);
end $$;

/* ---------- retratos ---------- */
create function inv.local_de(b inv.bens) returns jsonb language sql stable set search_path=inv,pg_temp as $$
  select jsonb_build_object(
   'unidade_id',b.unidade_id,'unidade',(select nome from inv.unidades where id=b.unidade_id),
   'departamento_id',b.departamento_id,'departamento',(select nome from inv.departamentos where id=b.departamento_id),
   'setor_id',b.setor_id,'setor',(select nome from inv.departamentos where id=b.setor_id),
   'localizacao_id',b.localizacao_id,'localizacao',(select nome from inv.localizacoes where id=b.localizacao_id),
   'localizacao_especifica',b.localizacao_especifica,
   'responsavel_id',b.responsavel_id,'responsavel',(select nome from inv.responsaveis where id=b.responsavel_id),
   'situacao',b.situacao) $$;

create function inv.retrato_de(b inv.bens) returns jsonb language sql stable set search_path=inv,pg_temp as $$
  select (to_jsonb(b)-'criado_em'-'atualizado_em'-'qr_token') || inv.local_de(b) || jsonb_build_object(
   'grupo',(select nome from inv.grupos where id=b.grupo_id),'subgrupo',(select nome from inv.grupos where id=b.subgrupo_id),
   'depreciacao',inv.depreciacao(b)) $$;

create function inv.t_bem_retrato() returns trigger language plpgsql set search_path=inv,pg_temp as $$
begin
  update inv.inventario_itens i set retrato=inv.retrato_de(new), quantidade_prevista=new.quantidade
   from inv.inventarios v where i.bem_id=new.id and v.id=i.inventario_id and v.situacao not in ('Concluído','Arquivado');
  return null;
end $$;
create trigger retrato after update on inv.bens for each row execute function inv.t_bem_retrato();

/* ---------- progresso ---------- */
create function inv.progresso(p uuid) returns jsonb language sql stable set search_path=inv,pg_temp as $$
  with c as (select
    count(*) t, count(*) filter (where situacao<>'Pendente') conf,
    count(*) filter (where situacao='Pendente') pend, count(*) filter (where situacao='Localizado e conferido') loc,
    count(*) filter (where situacao='Não localizado') nl, count(*) filter (where situacao='Encontrado sem cadastro') sc,
    count(*) filter (where situacao='Com divergência') dv, count(*) filter (where situacao='Danificado') dn,
    count(*) filter (where situacao='Em manutenção') mn
    from inv.inventario_itens where inventario_id=p)
  select jsonb_build_object('previstos',(select bens_previstos from inv.inventarios where id=p),'cadastrados',t,'conferidos',conf,'pendentes',pend,
    'localizados',loc,'nao_localizados',nl,'sem_cadastro',sc,'divergencias',dv,'danificados',dn,'em_manutencao',mn,
    'percentual',case when greatest(t,coalesce((select bens_previstos from inv.inventarios where id=p),0))=0 then 0
      else round(conf*100.0/greatest(t,coalesce((select bens_previstos from inv.inventarios where id=p),0)),1) end) from c $$;

/* ---------- utilidades da API ---------- */
create function inv.erro(m text) returns void language plpgsql set search_path=inv,pg_temp as $$
begin raise exception '%',m using errcode='22023'; end $$;

create function inv.exigir(p text) returns void language plpgsql stable set search_path=inv,pg_temp as $$
begin
  if coalesce((nullif(current_setting('inv.perms',true),'')::jsonb->>p)::boolean,false) is not true then
    raise exception 'Seu acesso não permite esta operação.' using errcode='42501'; end if;
end $$;

create function inv.limpar(d jsonb) returns jsonb language sql immutable set search_path=inv,pg_temp as $$
  select coalesce(jsonb_object_agg(k,case when jsonb_typeof(v)='string' and btrim(v#>>'{}')='' then 'null'::jsonb
                                         when jsonb_typeof(v)='string' then to_jsonb(btrim(v#>>'{}')) else v end),'{}'::jsonb) from jsonb_each(d) x(k,v) $$;

create function inv.empresa_ativa(p uuid) returns void language plpgsql stable set search_path=inv,pg_temp as $$
declare s text;
begin
  select situacao into s from inv.empresas where id=p;
  if s is null then perform inv.erro('Empresa não encontrada.'); end if;
  if s<>'ativa' then perform inv.erro('Esta empresa está inativa. Reative-a para lançar novos registros.'); end if;
end $$;

create function inv.colunas(p_ent text,p_novo boolean) returns text[] language sql immutable set search_path=inv,pg_temp as $$
 select case p_ent
  when 'empresas' then array['razao_social','nome_fantasia','cnpj','inscricao_estadual','inscricao_municipal','segmento','endereco','cidade','uf','cep','telefone','email','responsavel','observacoes','prefixo_codigo','digitos_codigo','proximo_numero']
  when 'unidades' then array['nome','codigo','endereco']
  when 'departamentos' then array['pai_id','nome','codigo','ordem']
  when 'localizacoes' then array['pai_id','unidade_id','tipo','nome','codigo','ordem']
  when 'grupos' then array['pai_id','codigo','nome','descricao','ordem']
  when 'responsaveis' then array['nome','cpf','cargo','departamento_id','telefone','email']
  when 'inventarios' then array['nome','codigo','tipo','descricao','data_inicio','data_prevista','responsavel','equipe','observacoes','bens_previstos']
  when 'manutencoes' then array['bem_id','tipo','descricao','fornecedor','data_abertura','data_prevista','custo','observacoes','situacao']
  when 'bens' then array['codigo_patrimonial','codigo_interno','descricao','nome_identificacao','grupo_id','subgrupo_id','marca','modelo','fabricante','numero_serie','numero_identificacao','cor','dimensoes','caracteristicas','quantidade',
    'data_aquisicao','valor_aquisicao','valor_atual','documento_fiscal','numero_nf','fornecedor','forma_aquisicao','data_incorporacao','vida_util_meses','valor_residual','taxa_depreciacao','conservacao','observacoes','proxima_conferencia']
    || case when p_novo then array['unidade_id','departamento_id','setor_id','localizacao_id','localizacao_especifica','responsavel_id'] else array[]::text[] end
 end $$;

create function inv.salvar(p_ent text,d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_id uuid := nullif(d->>'id','')::uuid; v_emp uuid := nullif(d->>'empresa_id','')::uuid; c text[]; l text; r jsonb; achou boolean; escopo text;
begin
  d := inv.limpar(d);
  escopo := case when p_ent='empresas' then '' else ' and empresa_id=$2' end;
  if p_ent<>'empresas' then perform inv.empresa_ativa(v_emp); end if;
  c := array(select x from unnest(inv.colunas(p_ent,v_id is null)) x where d ? x);
  if coalesce(cardinality(c),0)=0 then perform inv.erro('Nada para salvar.'); end if;
  select string_agg(quote_ident(x),',') into l from unnest(c) x;
  if v_id is null then
    if p_ent='empresas' then
      execute format('insert into inv.%I as t (%s) select %s from jsonb_populate_record(null::inv.%I,$1) returning to_jsonb(t)',p_ent,l,l,p_ent) into r using d;
    else
      execute format('insert into inv.%I as t (empresa_id,%s) select $2,%s from jsonb_populate_record(null::inv.%I,$1) returning to_jsonb(t)',p_ent,l,l,p_ent) into r using d,v_emp;
    end if;
  else
    execute format('select exists(select 1 from inv.%I where id=$1%s)',p_ent,escopo) into achou using v_id,v_emp;
    if not achou then perform inv.erro('Registro não encontrado nesta empresa.'); end if;
    execute format('update inv.%I t set (%s)=(select %s from jsonb_populate_record(null::inv.%I,$1)) where t.id=$2 returning to_jsonb(t)',p_ent,l,l,p_ent) into r using d,v_id;
  end if;
  return r;
end $$;

create function inv.proximo_codigo(p uuid) returns text language plpgsql set search_path=inv,pg_temp as $$
declare e inv.empresas; c text; n int := 0;
begin
  select * into e from inv.empresas where id=p for update;
  loop
    c := e.prefixo_codigo||lpad(e.proximo_numero::text,e.digitos_codigo,'0');
    e.proximo_numero := e.proximo_numero+1; n := n+1;
    exit when not exists (select 1 from inv.bens where empresa_id=p and codigo_patrimonial=c) or n>100000;
  end loop;
  update inv.empresas set proximo_numero=e.proximo_numero where id=p;
  return c;
end $$;

create function inv.incluir_item(v_inv uuid,b inv.bens) returns uuid language plpgsql set search_path=inv,pg_temp as $$
declare v uuid;
begin
  insert into inv.inventario_itens(empresa_id,inventario_id,bem_id,retrato,quantidade_prevista)
   values (b.empresa_id,v_inv,b.id,inv.retrato_de(b),b.quantidade)
   on conflict (inventario_id,bem_id) do nothing returning id into v;
  return v;
end $$;

create function inv.salvar_bem(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare novo boolean := nullif(d->>'id','') is null; v_emp uuid := nullif(d->>'empresa_id','')::uuid; r jsonb; b inv.bens; v_inv uuid := nullif(d->>'inventario_id','')::uuid; fx boolean;
begin
  perform inv.empresa_ativa(v_emp);
  if novo and nullif(btrim(coalesce(d->>'codigo_patrimonial','')),'') is null then
    d := d || jsonb_build_object('codigo_patrimonial',inv.proximo_codigo(v_emp));
  end if;
  r := inv.salvar('bens',d);
  select * into b from inv.bens where id=(r->>'id')::uuid;
  if novo then
    insert into inv.movimentacoes(empresa_id,bem_id,tipo,data,usuario,justificativa,origem,destino,cadastro_inicial)
      values (v_emp,b.id,'Incorporação patrimonial',coalesce(b.data_incorporacao,b.data_aquisicao,current_date),inv.usuario_nome(),'Cadastro inicial do bem',null,inv.local_de(b),true);
  end if;
  if v_inv is not null then
    select situacao in ('Concluído','Arquivado') into fx from inv.inventarios where id=v_inv and empresa_id=v_emp;
    if fx is null then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
    if fx then perform inv.erro('Esse inventário já foi concluído.'); end if;
    perform inv.incluir_item(v_inv,b);
  end if;
  return to_jsonb(b)||jsonb_build_object('depreciacao',inv.depreciacao(b));
end $$;

/* ---------- inventário: mudança de situação ---------- */
create function inv.inventario_mudar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v inv.inventarios; n text := d->>'situacao'; ok boolean;
begin
  select * into v from inv.inventarios where id=(d->>'id')::uuid and empresa_id=(d->>'empresa_id')::uuid for update;
  if v.id is null then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  ok := (v.situacao,n) in (('Não iniciado','Em andamento'),('Em andamento','Não iniciado'),('Aguardando validação','Em andamento'),('Concluído','Arquivado'),('Arquivado','Concluído'));
  if not ok then perform inv.erro('Não é possível passar de "'||v.situacao||'" para "'||coalesce(n,'')||'".'); end if;
  update inv.inventarios set situacao=n, data_inicio=coalesce(data_inicio,case when n='Em andamento' then current_date end) where id=v.id returning * into v;
  return to_jsonb(v);
end $$;

create function inv.inventario_incluir(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v inv.inventarios; b inv.bens; n int := 0; x uuid; ids uuid[];
begin
  select * into v from inv.inventarios where id=(d->>'inventario_id')::uuid and empresa_id=(d->>'empresa_id')::uuid;
  if v.id is null then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  if v.situacao in ('Concluído','Arquivado') then perform inv.erro('Inventário concluído não recebe novos bens.'); end if;
  if coalesce((d->>'todos')::boolean,false) then ids := null;
  else ids := array(select jsonb_array_elements_text(coalesce(d->'bem_ids','[]'))::uuid); end if;
  for b in select * from inv.bens where empresa_id=v.empresa_id and situacao<>'baixado' and (ids is null or id=any(ids)) loop
    x := inv.incluir_item(v.id,b); if x is not null then n := n+1; end if;
  end loop;
  return jsonb_build_object('incluidos',n,'progresso',inv.progresso(v.id));
end $$;

/* ---------- conferência física ---------- */
create function inv.conferencia_iniciar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v inv.inventarios; c inv.conferencias; n int;
begin
  select * into v from inv.inventarios where id=(d->>'inventario_id')::uuid and empresa_id=(d->>'empresa_id')::uuid for update;
  if v.id is null then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  if v.situacao in ('Concluído','Arquivado') then perform inv.erro('Inventário concluído não recebe conferência.'); end if;
  select * into c from inv.conferencias where inventario_id=v.id and situacao='aberta';
  if c.id is not null then return to_jsonb(c); end if;
  select coalesce(max(numero),0)+1 into n from inv.conferencias where inventario_id=v.id;
  insert into inv.conferencias(empresa_id,inventario_id,numero,responsavel,observacoes,iniciada_por)
    values (v.empresa_id,v.id,n,nullif(d->>'responsavel',''),nullif(d->>'observacoes',''),inv.usuario_nome()) returning * into c;
  update inv.inventarios set situacao='Em conferência',data_inicio=coalesce(data_inicio,current_date) where id=v.id;
  return to_jsonb(c);
end $$;

create function inv.conferencia_registrar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_emp uuid := (d->>'empresa_id')::uuid; v_inv uuid := (d->>'inventario_id')::uuid; c inv.conferencias; i inv.inventario_itens; b inv.bens; s text := d->>'situacao';
        q numeric := nullif(d->>'quantidade','')::numeric; dv text := nullif(btrim(coalesce(d->>'divergencias','')),''); le inv.leituras; loc uuid := nullif(d->>'localizacao_id','')::uuid; quando timestamptz; autos text[] := '{}';
        nome_loc text := nullif(btrim(coalesce(d->>'localizacao_encontrada','')),'');
begin
  select * into c from inv.conferencias where inventario_id=v_inv and empresa_id=v_emp and situacao='aberta';
  if c.id is null then perform inv.erro('Inicie a conferência deste inventário antes de registrar.'); end if;
  if s not in ('Localizado e conferido','Não localizado','Pendente','Encontrado sem cadastro','Com divergência','Danificado','Em manutenção') then perform inv.erro('Situação de conferência inválida.'); end if;
  quando := coalesce(nullif(d->>'data_hora','')::timestamptz,now());
  if loc is not null then
    if not exists (select 1 from inv.localizacoes where id=loc and empresa_id=v_emp) then perform inv.erro('Localização não encontrada nesta empresa.'); end if;
    if nome_loc is null then select nome into nome_loc from inv.localizacoes where id=loc; end if;
  end if;
  if nullif(d->>'item_id','') is not null then
    select * into i from inv.inventario_itens where id=(d->>'item_id')::uuid and inventario_id=v_inv and empresa_id=v_emp;
    if i.id is null then perform inv.erro('Item não encontrado neste inventário.'); end if;
  elsif nullif(d->>'bem_id','') is not null then
    select * into b from inv.bens where id=(d->>'bem_id')::uuid and empresa_id=v_emp;
    if b.id is null then perform inv.erro('Bem não encontrado nesta empresa.'); end if;
    perform inv.incluir_item(v_inv,b);
    select * into i from inv.inventario_itens where inventario_id=v_inv and bem_id=b.id;
  else
    if s<>'Encontrado sem cadastro' then perform inv.erro('Escolha o bem conferido.'); end if;
    if nullif(btrim(coalesce(d->>'descricao','')),'') is null then perform inv.erro('Descreva o bem encontrado sem cadastro.'); end if;
    insert into inv.inventario_itens(empresa_id,inventario_id,retrato,situacao)
      values (v_emp,v_inv,jsonb_build_object('descricao',btrim(d->>'descricao'),'codigo_patrimonial',null,'sem_cadastro',true),s) returning * into i;
  end if;
  /* localizado com quantidade ou lugar diferentes do registrado é divergência, com o motivo escrito */
  if s='Localizado e conferido' and i.bem_id is not null then
    if q is not null and i.quantidade_prevista is not null and q<>i.quantidade_prevista then
      autos := autos||('Quantidade encontrada '||trim(to_char(q,'FM999999990.###'))||', registrada '||trim(to_char(i.quantidade_prevista,'FM999999990.###'))); end if;
    if loc is not null and (i.retrato->>'localizacao_id') is distinct from loc::text and (i.retrato->>'localizacao_id') is not null then
      autos := autos||('Encontrado em '||coalesce(nome_loc,'outro local')||', registrado em '||coalesce(i.retrato->>'localizacao','outro local')); end if;
    if cardinality(autos)>0 then s := 'Com divergência'; dv := concat_ws('; ',dv,array_to_string(autos,'; ')); end if;
  end if;
  if s='Pendente' then
    update inv.inventario_itens set situacao=s,quantidade_encontrada=null,localizacao_encontrada=null,localizacao_id_encontrada=null,condicao=null,observacoes=null,divergencias=null,conferido_em=null,conferido_por=null where id=i.id returning * into i;
  else
    update inv.inventario_itens set situacao=s,quantidade_encontrada=coalesce(q,case when s='Não localizado' then 0 end),localizacao_encontrada=nome_loc,localizacao_id_encontrada=loc,
      condicao=nullif(d->>'condicao',''),observacoes=nullif(d->>'observacoes',''),divergencias=dv,conferido_em=quando,conferido_por=coalesce(nullif(d->>'responsavel',''),c.responsavel,inv.usuario_nome())
      where id=i.id returning * into i;
  end if;
  insert into inv.leituras(empresa_id,inventario_id,conferencia_id,item_id,situacao,data_hora,responsavel,localizacao_encontrada,condicao,quantidade,observacoes,divergencias,registrado_por)
    values (v_emp,v_inv,c.id,i.id,s,quando,coalesce(nullif(d->>'responsavel',''),c.responsavel,inv.usuario_nome()),nome_loc,nullif(d->>'condicao',''),q,nullif(d->>'observacoes',''),dv,inv.usuario_nome()) returning * into le;
  return jsonb_build_object('item',to_jsonb(i),'leitura',to_jsonb(le),'progresso',inv.progresso(v_inv));
end $$;

create function inv.conferencia_resumo(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare v_inv uuid := (d->>'inventario_id')::uuid; v_emp uuid := (d->>'empresa_id')::uuid;
begin
  if not exists (select 1 from inv.inventarios where id=v_inv and empresa_id=v_emp) then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  return jsonb_build_object('progresso',inv.progresso(v_inv),
   'pendentes',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',retrato->>'codigo_patrimonial','descricao',retrato->>'descricao') order by retrato->>'codigo_patrimonial'),'[]') from inv.inventario_itens where inventario_id=v_inv and situacao='Pendente'),
   'ocorrencias',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'codigo',retrato->>'codigo_patrimonial','descricao',retrato->>'descricao','situacao',situacao,'divergencias',divergencias,'bem_id',bem_id) order by situacao),'[]') from inv.inventario_itens where inventario_id=v_inv and situacao not in ('Pendente','Localizado e conferido')));
end $$;

create function inv.conferencia_finalizar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare c inv.conferencias; p jsonb;
begin
  select * into c from inv.conferencias where id=(d->>'conferencia_id')::uuid and empresa_id=(d->>'empresa_id')::uuid and situacao='aberta' for update;
  if c.id is null then perform inv.erro('Conferência aberta não encontrada.'); end if;
  if coalesce((d->>'ciente')::boolean,false) is not true then perform inv.erro('Veja as pendências e divergências antes de finalizar.'); end if;
  p := inv.progresso(c.inventario_id);
  update inv.conferencias set situacao='finalizada',finalizada_em=now(),finalizada_por=inv.usuario_nome(),resumo=p,observacoes=coalesce(nullif(d->>'observacoes',''),observacoes) where id=c.id returning * into c;
  update inv.inventarios set situacao='Aguardando validação' where id=c.inventario_id;
  return to_jsonb(c);
end $$;

create function inv.inventario_aprovar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v inv.inventarios;
begin
  select * into v from inv.inventarios where id=(d->>'id')::uuid and empresa_id=(d->>'empresa_id')::uuid for update;
  if v.id is null then perform inv.erro('Inventário não encontrado nesta empresa.'); end if;
  if v.situacao<>'Aguardando validação' then perform inv.erro('Só um inventário aguardando validação pode ser aprovado.'); end if;
  update inv.inventarios set situacao='Concluído',data_conclusao=current_date,aprovado_por=inv.usuario_nome(),aprovado_em=now(),resumo_final=inv.progresso(id) where id=v.id returning * into v;
  return to_jsonb(v);
end $$;

create function inv.regularizar_item(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare i inv.inventario_itens; r jsonb; b inv.bens; v_emp uuid := (d->>'empresa_id')::uuid; c inv.conferencias;
begin
  select * into i from inv.inventario_itens where id=(d->>'item_id')::uuid and empresa_id=v_emp;
  if i.id is null or i.situacao<>'Encontrado sem cadastro' then perform inv.erro('Item não encontrado para regularizar.'); end if;
  r := inv.salvar_bem((d->'bem')||jsonb_build_object('empresa_id',v_emp));
  select * into b from inv.bens where id=(r->>'id')::uuid;
  update inv.inventario_itens set bem_id=b.id,retrato=inv.retrato_de(b),situacao='Localizado e conferido',quantidade_prevista=b.quantidade,quantidade_encontrada=coalesce(quantidade_encontrada,b.quantidade) where id=i.id returning * into i;
  select * into c from inv.conferencias where inventario_id=i.inventario_id order by numero desc limit 1;
  if c.id is not null then
    insert into inv.leituras(empresa_id,inventario_id,conferencia_id,item_id,situacao,responsavel,observacoes,registrado_por)
      values (v_emp,i.inventario_id,c.id,i.id,'Localizado e conferido',inv.usuario_nome(),'Regularizado: cadastrado como '||b.codigo_patrimonial,inv.usuario_nome());
  end if;
  return jsonb_build_object('item',to_jsonb(i),'bem',to_jsonb(b));
end $$;

/* ---------- movimentações ---------- */
create function inv.movimentar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_emp uuid := (d->>'empresa_id')::uuid; b inv.bens; t text := d->>'tipo'; p jsonb := coalesce(d->'para','{}'::jsonb); o jsonb; m inv.movimentacoes; j text := nullif(btrim(coalesce(d->>'justificativa','')),''); n inv.bens;
begin
  perform inv.empresa_ativa(v_emp);
  select * into b from inv.bens where id=(d->>'bem_id')::uuid and empresa_id=v_emp for update;
  if b.id is null then perform inv.erro('Bem não encontrado nesta empresa.'); end if;
  if j is null then perform inv.erro('Informe a justificativa da movimentação.'); end if;
  if b.situacao='baixado' and t<>'Incorporação patrimonial' then perform inv.erro('Este bem foi baixado. Só uma incorporação o traz de volta.'); end if;
  if t='Envio para manutenção' and b.situacao='em_manutencao' then perform inv.erro('Este bem já está em manutenção.'); end if;
  if t='Retorno da manutenção' and b.situacao<>'em_manutencao' then perform inv.erro('Este bem não está em manutenção.'); end if;
  if t='Incorporação patrimonial' and b.situacao<>'baixado' then perform inv.erro('Este bem já está incorporado.'); end if;
  o := inv.local_de(b);
  n := b;
  if t like 'Transferência%' or t='Mudança de responsável' or t='Retorno da manutenção' or t='Incorporação patrimonial' then
    if p ? 'unidade_id' then n.unidade_id := nullif(p->>'unidade_id','')::uuid; end if;
    if p ? 'departamento_id' then n.departamento_id := nullif(p->>'departamento_id','')::uuid; end if;
    if p ? 'setor_id' then n.setor_id := nullif(p->>'setor_id','')::uuid; end if;
    if p ? 'localizacao_id' then n.localizacao_id := nullif(p->>'localizacao_id','')::uuid; end if;
    if p ? 'localizacao_especifica' then n.localizacao_especifica := nullif(p->>'localizacao_especifica',''); end if;
    if p ? 'responsavel_id' then n.responsavel_id := nullif(p->>'responsavel_id','')::uuid; end if;
  end if;
  n.situacao := case t when 'Envio para manutenção' then 'em_manutencao' when 'Retorno da manutenção' then 'ativo' when 'Baixa patrimonial' then 'baixado' when 'Incorporação patrimonial' then 'ativo' else b.situacao end;
  if t='Envio para manutenção' then n.conservacao := 'Em manutenção'; end if;
  if t='Retorno da manutenção' and nullif(d->>'conservacao','') is not null then n.conservacao := d->>'conservacao'; end if;
  if t='Baixa patrimonial' and nullif(d->>'conservacao','') is not null then n.conservacao := d->>'conservacao'; end if;
  if t<>'Baixa patrimonial' and t<>'Envio para manutenção' and n.conservacao='Em manutenção' and t='Retorno da manutenção' and nullif(d->>'conservacao','') is null then n.conservacao := 'Bom'; end if;
  update inv.bens set unidade_id=n.unidade_id,departamento_id=n.departamento_id,setor_id=n.setor_id,localizacao_id=n.localizacao_id,localizacao_especifica=n.localizacao_especifica,responsavel_id=n.responsavel_id,situacao=n.situacao,conservacao=n.conservacao where id=b.id returning * into n;
  insert into inv.movimentacoes(empresa_id,bem_id,tipo,data,usuario,justificativa,origem,destino)
    values (v_emp,b.id,t,coalesce(nullif(d->>'data','')::date,current_date),inv.usuario_nome(),j,o,inv.local_de(n)||jsonb_build_object('conservacao_anterior',b.conservacao)) returning * into m;
  if t='Envio para manutenção' then
    insert into inv.manutencoes(empresa_id,bem_id,tipo,descricao,fornecedor,data_abertura,data_prevista,custo,situacao)
     values (v_emp,b.id,coalesce(nullif(d#>>'{manutencao,tipo}',''),'Corretiva'),j,nullif(d#>>'{manutencao,fornecedor}',''),m.data,nullif(d#>>'{manutencao,data_prevista}','')::date,nullif(d#>>'{manutencao,custo}','')::numeric,'aberta');
  elsif t='Retorno da manutenção' then
    update inv.manutencoes set situacao='concluida',data_retorno=m.data,custo=coalesce(nullif(d#>>'{manutencao,custo}','')::numeric,custo)
     where bem_id=b.id and situacao='aberta';
  end if;
  return to_jsonb(m);
end $$;

create function inv.estornar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_emp uuid := (d->>'empresa_id')::uuid; m inv.movimentacoes; u inv.movimentacoes; b inv.bens; o jsonb; e inv.movimentacoes; j text := nullif(btrim(coalesce(d->>'justificativa','')),'');
begin
  select * into m from inv.movimentacoes where id=(d->>'id')::uuid and empresa_id=v_emp;
  if m.id is null then perform inv.erro('Movimentação não encontrada nesta empresa.'); end if;
  if j is null then perform inv.erro('Informe por que a movimentação está sendo estornada.'); end if;
  if m.cadastro_inicial then perform inv.erro('O cadastro inicial não pode ser estornado.'); end if;
  if m.estorna_id is not null then perform inv.erro('Um estorno não pode ser estornado. Faça nova movimentação.'); end if;
  if exists (select 1 from inv.movimentacoes where estorna_id=m.id) then perform inv.erro('Esta movimentação já foi estornada.'); end if;
  select * into u from inv.movimentacoes where bem_id=m.bem_id order by criado_em desc limit 1;
  if u.id<>m.id then perform inv.erro('Só a última movimentação do bem pode ser estornada.'); end if;
  select * into b from inv.bens where id=m.bem_id for update;
  o := inv.local_de(b);
  update inv.bens set unidade_id=nullif(m.origem->>'unidade_id','')::uuid,departamento_id=nullif(m.origem->>'departamento_id','')::uuid,setor_id=nullif(m.origem->>'setor_id','')::uuid,
    localizacao_id=nullif(m.origem->>'localizacao_id','')::uuid,localizacao_especifica=m.origem->>'localizacao_especifica',responsavel_id=nullif(m.origem->>'responsavel_id','')::uuid,
    situacao=m.origem->>'situacao',conservacao=coalesce(m.destino->>'conservacao_anterior',conservacao) where id=b.id;
  insert into inv.movimentacoes(empresa_id,bem_id,tipo,data,usuario,justificativa,origem,destino,estorna_id)
    values (v_emp,m.bem_id,m.tipo,current_date,inv.usuario_nome(),'Estorno: '||j,o,m.origem,m.id) returning * into e;
  if m.tipo='Envio para manutenção' then
    update inv.manutencoes set situacao='cancelada',observacoes=concat_ws(' · ',observacoes,'Envio estornado') where bem_id=m.bem_id and situacao='aberta';
  elsif m.tipo='Retorno da manutenção' then
    update inv.manutencoes set situacao='aberta',data_retorno=null where id=(select id from inv.manutencoes where bem_id=m.bem_id and situacao='concluida' order by data_retorno desc nulls last,atualizado_em desc limit 1);
  end if;
  return to_jsonb(e);
end $$;

/* ---------- termos e etiquetas ---------- */
create function inv.termo_emitir(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_emp uuid := (d->>'empresa_id')::uuid; r inv.responsaveis; ids uuid[]; its jsonb; n int; t inv.termos; x text;
begin
  perform inv.empresa_ativa(v_emp);
  select * into r from inv.responsaveis where id=(d->>'responsavel_id')::uuid and empresa_id=v_emp;
  if r.id is null then perform inv.erro('Responsável não encontrado nesta empresa.'); end if;
  ids := array(select jsonb_array_elements_text(coalesce(d->'bem_ids','[]'))::uuid);
  select jsonb_agg(jsonb_build_object('bem_id',b.id,'codigo',b.codigo_patrimonial,'descricao',b.descricao,'quantidade',b.quantidade,'conservacao',b.conservacao,'local',inv.local_de(b)) order by b.codigo_patrimonial) into its
    from inv.bens b where b.empresa_id=v_emp and b.situacao<>'baixado' and (cardinality(ids)=0 and b.responsavel_id=r.id or b.id=any(ids));
  if its is null then perform inv.erro('Nenhum bem para este termo. Vincule bens ao responsável primeiro.'); end if;
  perform pg_advisory_xact_lock(hashtext('inv-termo-'||v_emp::text));
  select coalesce(max(substring(numero from '\d+$')::int),0)+1 into n from inv.termos where empresa_id=v_emp;
  x := 'TR-'||lpad(n::text,4,'0');
  insert into inv.termos(empresa_id,numero,responsavel_id,data,local,responsavel,itens,emitido_por)
    values (v_emp,x,r.id,coalesce(nullif(d->>'data','')::date,current_date),nullif(d->>'local',''),to_jsonb(r),its,inv.usuario_nome()) returning * into t;
  return to_jsonb(t);
end $$;

create function inv.etiquetas_registrar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_emp uuid := (d->>'empresa_id')::uuid; l uuid := gen_random_uuid(); n int;
begin
  insert into inv.etiquetas(empresa_id,bem_id,modelo,saida,lote,gerada_por)
    select v_emp,b.id,d->>'modelo',d->>'saida',l,inv.usuario_nome() from inv.bens b
     where b.empresa_id=v_emp and b.id=any(array(select jsonb_array_elements_text(d->'bem_ids')::uuid));
  get diagnostics n=row_count;
  if n=0 then perform inv.erro('Escolha ao menos um bem desta empresa.'); end if;
  return jsonb_build_object('lote',l,'quantidade',n);
end $$;

/* ---------- arquivos ---------- */
create function inv.arquivo_iniciar(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare a inv.arquivos; usado bigint; t bigint := (d->>'tamanho')::bigint; lim constant bigint := 262144000; v_emp uuid := (d->>'empresa_id')::uuid;
begin
  perform inv.empresa_ativa(v_emp);
  if t>8388608 then perform inv.erro('Arquivo maior que 8 MB. Reduza o tamanho e tente de novo.'); end if;
  select coalesce(sum(tamanho),0) into usado from inv.arquivos where excluido_em is null;
  if usado+t>lim then perform inv.erro('O espaço de anexos do Centro de Inventário acabou (250 MB). Apague anexos antigos antes de enviar outros.'); end if;
  if pg_database_size(current_database())>429496729 then perform inv.erro('O banco está quase cheio; os anexos foram pausados para proteger o sistema.'); end if;
  insert into inv.arquivos(empresa_id,entidade,registro_id,categoria,nome,tipo,tamanho,partes,miniatura,enviado_por)
   values (v_emp,d->>'entidade',(d->>'registro_id')::uuid,coalesce(nullif(d->>'categoria',''),'Complementar'),d->>'nome',d->>'tipo',t,(d->>'partes')::int,nullif(d->>'miniatura',''),inv.usuario_nome()) returning * into a;
  return jsonb_build_object('id',a.id);
end $$;

create function inv.arquivo_concluir(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare a inv.arquivos; n int;
begin
  select * into a from inv.arquivos where id=(d->>'id')::uuid and empresa_id=(d->>'empresa_id')::uuid;
  if a.id is null then perform inv.erro('Arquivo não encontrado nesta empresa.'); end if;
  select count(*) into n from inv.arquivo_partes where arquivo_id=a.id;
  if n<>a.partes then perform inv.erro('O envio do arquivo ficou incompleto. Tente de novo.'); end if;
  update inv.arquivos set completo=true where id=a.id returning * into a;
  if a.entidade='bem' and a.categoria='Fotografia' then
    update inv.bens set foto_id=coalesce(foto_id,a.id) where id=a.registro_id and empresa_id=a.empresa_id;
  end if;
  return to_jsonb(a);
end $$;

create function inv.arquivo_excluir(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare a inv.arquivos;
begin
  select * into a from inv.arquivos where id=(d->>'id')::uuid and empresa_id=(d->>'empresa_id')::uuid and excluido_em is null;
  if a.id is null then perform inv.erro('Arquivo não encontrado nesta empresa.'); end if;
  update inv.bens set foto_id=null where foto_id=a.id;
  update inv.arquivos set excluido_em=now() where id=a.id;
  delete from inv.arquivo_partes where arquivo_id=a.id;
  return jsonb_build_object('ok',true);
end $$;

/* ---------- exclusão segura de estrutura ---------- */
create function inv.estrutura_usos(p_ent text,p_id uuid) returns int language plpgsql stable set search_path=inv,pg_temp as $$
declare n int;
begin
  if p_ent='grupos' then select count(*) into n from inv.bens where grupo_id=p_id or subgrupo_id=p_id;
  elsif p_ent='departamentos' then select count(*) into n from inv.bens where departamento_id=p_id or setor_id=p_id;
  elsif p_ent='localizacoes' then select count(*) into n from inv.bens where localizacao_id=p_id;
  elsif p_ent='unidades' then select count(*) into n from inv.bens where unidade_id=p_id;
  elsif p_ent='responsaveis' then select count(*) into n from inv.bens where responsavel_id=p_id;
  else n := 0; end if;
  return n;
end $$;

create function inv.excluir(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare p_ent text := d->>'ent'; v_id uuid := (d->>'id')::uuid; v_emp uuid := (d->>'empresa_id')::uuid; dest uuid := nullif(d->>'transferir_para','')::uuid; achou boolean; n int;
begin
  if p_ent not in ('grupos','departamentos','localizacoes','unidades','responsaveis') then perform inv.erro('Este registro não pode ser apagado.'); end if;
  execute format('select exists(select 1 from inv.%I where id=$1 and empresa_id=$2)',p_ent) into achou using v_id,v_emp;
  if not achou then perform inv.erro('Registro não encontrado nesta empresa.'); end if;
  n := inv.estrutura_usos(p_ent,v_id);
  if n>0 and dest is null then perform inv.erro('Existem '||n||' bem(ns) ligados a este item. Transfira-os ou inative o item.'); end if;
  if n>0 then
    execute format('select exists(select 1 from inv.%I where id=$1 and empresa_id=$2)',p_ent) into achou using dest,v_emp;
    if not achou or dest=v_id then perform inv.erro('Destino da transferência inválido.'); end if;
    if p_ent='grupos' then
      update inv.bens set grupo_id=case when grupo_id=v_id then dest else grupo_id end, subgrupo_id=case when subgrupo_id=v_id then null else subgrupo_id end where empresa_id=v_emp and (grupo_id=v_id or subgrupo_id=v_id);
    elsif p_ent='departamentos' then
      update inv.bens set departamento_id=case when departamento_id=v_id then dest else departamento_id end, setor_id=case when setor_id=v_id then null when departamento_id=v_id then null else setor_id end where empresa_id=v_emp and (departamento_id=v_id or setor_id=v_id);
    elsif p_ent='localizacoes' then update inv.bens set localizacao_id=dest where empresa_id=v_emp and localizacao_id=v_id;
    elsif p_ent='unidades' then update inv.bens set unidade_id=dest where empresa_id=v_emp and unidade_id=v_id;
    else update inv.bens set responsavel_id=dest where empresa_id=v_emp and responsavel_id=v_id; end if;
  end if;
  if p_ent in ('grupos','departamentos','localizacoes') then
    execute format('select count(*) from inv.%I where pai_id=$1',p_ent) into n using v_id;
    if n>0 then perform inv.erro('Este item tem subitens. Apague ou mova os subitens primeiro.'); end if;
  end if;
  execute format('delete from inv.%I where id=$1',p_ent) using v_id;
  return jsonb_build_object('ok',true);
end $$;

create function inv.mudar_situacao(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare p_ent text := d->>'ent'; s text := d->>'situacao'; v_id uuid := (d->>'id')::uuid; r jsonb;
begin
  if p_ent not in ('empresas','unidades','departamentos','localizacoes','grupos','responsaveis') or s not in ('ativa','inativa') then perform inv.erro('Mudança de situação inválida.'); end if;
  if p_ent='empresas' then
    update inv.empresas t set situacao=s where t.id=v_id returning to_jsonb(t) into r;
  else
    execute format('update inv.%I t set situacao=$1 where t.id=$2 and t.empresa_id=$3 returning to_jsonb(t)',p_ent) into r using s,v_id,(d->>'empresa_id')::uuid;
  end if;
  if r is null then perform inv.erro('Registro não encontrado nesta empresa.'); end if;
  return r;
end $$;

/* ---------- leitura ---------- */
create function inv.carregar(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare ent text := d->>'ent'; v_emp uuid := nullif(d->>'empresa_id','')::uuid; lim int := least(coalesce((d->>'limite')::int,300),500); depois uuid := nullif(d->>'depois','')::uuid; v_inv uuid := nullif(d->>'inventario_id','')::uuid; expr text; filtro text := ''; r jsonb; ult uuid; q int;
begin
  if ent not in ('empresas','unidades','departamentos','localizacoes','grupos','responsaveis','inventarios','bens','itens','conferencias','leituras','movimentacoes','manutencoes','termos','etiquetas') then perform inv.erro('Lista desconhecida.'); end if;
  expr := case ent
    when 'bens' then 'to_jsonb(t)||jsonb_build_object(''depreciacao'',inv.depreciacao(t),''miniatura'',(select miniatura from inv.arquivos a where a.id=t.foto_id))'
    when 'inventarios' then 'to_jsonb(t)||jsonb_build_object(''progresso'',inv.progresso(t.id))'
    when 'empresas' then 'to_jsonb(t)||jsonb_build_object(''resumo'',jsonb_build_object(''bens'',(select count(*) from inv.bens b where b.empresa_id=t.id and b.situacao<>''baixado''),''inventarios'',(select count(*) from inv.inventarios i where i.empresa_id=t.id),''valor'',(select coalesce(sum(coalesce(b.valor_atual,b.valor_aquisicao)*b.quantidade),0) from inv.bens b where b.empresa_id=t.id and b.situacao<>''baixado'')))'
    else 'to_jsonb(t)' end;
  if ent<>'empresas' then
    if v_emp is null then perform inv.erro('Escolha a empresa.'); end if;
    filtro := ' and t.empresa_id=$1';
  end if;
  if v_inv is not null and ent in ('itens','leituras','conferencias') then filtro := filtro||' and t.inventario_id=$4'; end if;
  if depois is not null then filtro := filtro||' and t.id>$2'; end if;
  execute format('select coalesce(jsonb_agg(x.j order by x.i),''[]''),max(x.i::text)::uuid,count(*) from (select %s j,t.id i from inv.%I t where true%s order by t.id limit $3) x',expr,case ent when 'itens' then 'inventario_itens' else ent end,filtro)
    into r,ult,q using v_emp,depois,lim,v_inv;
  return jsonb_build_object('linhas',r,'depois',case when q=lim then ult end);
end $$;

create function inv.painel(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare v_emp uuid := nullif(d->>'empresa_id','')::uuid;
begin
  return jsonb_build_object(
   'empresas',(select count(*) from inv.empresas where situacao='ativa' and (v_emp is null or id=v_emp)),
   'em_andamento',(select count(*) from inv.inventarios where situacao in ('Em andamento','Em conferência') and (v_emp is null or empresa_id=v_emp)),
   'concluidos',(select count(*) from inv.inventarios where situacao in ('Concluído','Arquivado') and (v_emp is null or empresa_id=v_emp)),
   'pendentes',(select count(*) from inv.inventarios where situacao in ('Não iniciado','Aguardando validação') and (v_emp is null or empresa_id=v_emp)),
   'bens',(select count(*) from inv.bens where situacao<>'baixado' and (v_emp is null or empresa_id=v_emp)),
   'valor',(select coalesce(sum(coalesce(valor_atual,valor_aquisicao)*quantidade),0) from inv.bens where situacao<>'baixado' and (v_emp is null or empresa_id=v_emp)),
   'sem_valor',(select count(*) from inv.bens where situacao<>'baixado' and coalesce(valor_atual,valor_aquisicao) is null and (v_emp is null or empresa_id=v_emp)),
   'nao_localizados',(select count(*) from inv.inventario_itens i join inv.inventarios v on v.id=i.inventario_id where i.situacao='Não localizado' and v.situacao<>'Arquivado' and (v_emp is null or i.empresa_id=v_emp)),
   'aguardando',(select count(*) from inv.inventario_itens i join inv.inventarios v on v.id=i.inventario_id where i.situacao='Pendente' and v.situacao not in ('Concluído','Arquivado') and (v_emp is null or i.empresa_id=v_emp)),
   'atividades',(select coalesce(jsonb_agg(z),'[]') from (select a.id,a.quando,a.usuario,a.operacao,a.tabela,a.registro_id,e.nome_fantasia,e.razao_social,
        case a.tabela when 'bens' then (select b.codigo_patrimonial||' '||b.descricao from inv.bens b where b.id=a.registro_id)
          when 'empresas' then (select x.razao_social from inv.empresas x where x.id=a.registro_id)
          when 'inventarios' then (select x.nome from inv.inventarios x where x.id=a.registro_id)
          when 'movimentacoes' then a.alteracao->>'tipo' when 'leituras' then a.alteracao->>'situacao' when 'termos' then a.alteracao->>'numero'
          when 'responsaveis' then (select x.nome from inv.responsaveis x where x.id=a.registro_id) when 'manutencoes' then (select x.descricao from inv.manutencoes x where x.id=a.registro_id) else null end detalhe
       from inv.auditoria a left join inv.empresas e on e.id=a.empresa_id where a.tabela<>'inventario_itens' and (v_emp is null or a.empresa_id=v_emp) order by a.id desc limit 10) z),
   'recentes',(select coalesce(jsonb_agg(z),'[]') from (select i.id,i.empresa_id,i.nome,i.codigo,i.data_inicio,i.data_prevista,i.situacao,i.criado_em,e.nome_fantasia,e.razao_social,inv.progresso(i.id) progresso
       from inv.inventarios i join inv.empresas e on e.id=i.empresa_id where (v_emp is null or i.empresa_id=v_emp) order by i.criado_em desc limit 6) z));
end $$;

create function inv.bem_historico(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare v_id uuid := (d->>'bem_id')::uuid; v_emp uuid := (d->>'empresa_id')::uuid; b inv.bens;
begin
  select * into b from inv.bens where id=v_id and empresa_id=v_emp;
  if b.id is null then perform inv.erro('Bem não encontrado nesta empresa.'); end if;
  return jsonb_build_object(
   'bem',to_jsonb(b)||jsonb_build_object('depreciacao',inv.depreciacao(b)),
   'movimentacoes',(select coalesce(jsonb_agg(to_jsonb(m) order by m.criado_em desc),'[]') from inv.movimentacoes m where m.bem_id=v_id),
   'leituras',(select coalesce(jsonb_agg(to_jsonb(l)||jsonb_build_object('inventario',v.nome) order by l.data_hora desc),'[]') from inv.leituras l join inv.inventario_itens i on i.id=l.item_id join inv.inventarios v on v.id=l.inventario_id where i.bem_id=v_id),
   'manutencoes',(select coalesce(jsonb_agg(to_jsonb(m) order by m.data_abertura desc),'[]') from inv.manutencoes m where m.bem_id=v_id),
   'etiquetas',(select coalesce(jsonb_agg(to_jsonb(e) order by e.gerada_em desc),'[]') from inv.etiquetas e where e.bem_id=v_id),
   'inventarios',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'nome',v.nome,'situacao',v.situacao,'conferencia',i.situacao)),'[]') from inv.inventario_itens i join inv.inventarios v on v.id=i.inventario_id where i.bem_id=v_id),
   'arquivos',(select coalesce(jsonb_agg(to_jsonb(a)-'empresa_id' order by a.criado_em desc),'[]') from inv.arquivos a where a.empresa_id=v_emp and a.entidade='bem' and a.registro_id=v_id and a.excluido_em is null and a.completo),
   'auditoria',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]') from (select * from inv.auditoria where registro_id=v_id order by id desc limit 100) a));
end $$;

create function inv.buscar_qr(d jsonb) returns jsonb language plpgsql stable set search_path=inv,pg_temp as $$
declare t text := btrim(coalesce(d->>'token','')); v_emp uuid := nullif(d->>'empresa_id','')::uuid; b inv.bens; e inv.empresas;
begin
  if t='' then perform inv.erro('Código vazio.'); end if;
  select * into b from inv.bens where qr_token::text=t;
  if b.id is null and v_emp is not null then select * into b from inv.bens where empresa_id=v_emp and upper(codigo_patrimonial)=upper(t); end if;
  if b.id is null then return jsonb_build_object('achou',false); end if;
  if v_emp is not null and b.empresa_id<>v_emp then
    select * into e from inv.empresas where id=b.empresa_id;
    return jsonb_build_object('achou',false,'outra_empresa',jsonb_build_object('id',e.id,'nome',coalesce(e.nome_fantasia,e.razao_social)));
  end if;
  return jsonb_build_object('achou',true,'bem',to_jsonb(b),'empresa_id',b.empresa_id);
end $$;

/* ---------- importação (cria o que faltar da estrutura) ---------- */
create function inv.achar(p_ent text,v_emp uuid,p_nome text,p_pai uuid default null) returns uuid language plpgsql set search_path=inv,pg_temp as $$
declare v uuid; n text := nullif(btrim(coalesce(p_nome,'')),'');
begin
  if n is null then return null; end if;
  if p_ent in ('unidades') then
    execute format('select id from inv.%I where empresa_id=$1 and lower(nome)=lower($2)',p_ent) into v using v_emp,n;
    if v is null then execute format('insert into inv.%I(empresa_id,nome) values ($1,$2) returning id',p_ent) into v using v_emp,n; end if;
  elsif p_ent='responsaveis' then
    select id into v from inv.responsaveis where empresa_id=v_emp and lower(nome)=lower(n) limit 1;
    if v is null then insert into inv.responsaveis(empresa_id,nome) values (v_emp,n) returning id into v; end if;
  else
    execute format('select id from inv.%I where empresa_id=$1 and lower(nome)=lower($2) and pai_id is not distinct from $3',p_ent) into v using v_emp,n,p_pai;
    if v is null then execute format('insert into inv.%I(empresa_id,nome,pai_id) values ($1,$2,$3) returning id',p_ent) into v using v_emp,n,p_pai; end if;
  end if;
  return v;
end $$;

create function inv.importar_bens(d jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare v_emp uuid := (d->>'empresa_id')::uuid; l jsonb; i int := 0; ok int := 0; errs jsonb := '[]'; g uuid; sg uuid; dp uuid; st uuid; x jsonb; msg text;
begin
  perform inv.empresa_ativa(v_emp);
  for l in select jsonb_array_elements(d->'linhas') loop
    i := i+1;
    begin
      g := inv.achar('grupos',v_emp,l->>'grupo'); sg := case when g is not null then inv.achar('grupos',v_emp,l->>'subgrupo',g) end;
      dp := inv.achar('departamentos',v_emp,l->>'departamento'); st := case when dp is not null then inv.achar('departamentos',v_emp,l->>'setor',dp) end;
      x := (l-'grupo'-'subgrupo'-'departamento'-'setor'-'unidade'-'localizacao'-'responsavel'-'linha')||jsonb_build_object('empresa_id',v_emp,'grupo_id',g,'subgrupo_id',sg,'departamento_id',dp,'setor_id',st,
        'unidade_id',inv.achar('unidades',v_emp,l->>'unidade'),'localizacao_id',inv.achar('localizacoes',v_emp,l->>'localizacao'),'responsavel_id',inv.achar('responsaveis',v_emp,l->>'responsavel'),'inventario_id',d->>'inventario_id');
      perform inv.salvar_bem(x); ok := ok+1;
    exception when others then
      get stacked diagnostics msg = message_text;
      if sqlstate='23505' then msg := 'Código patrimonial já cadastrado nesta empresa.';
      elsif sqlstate='23502' or sqlstate='23514' then msg := 'Descrição obrigatória ou valor inválido.';
      elsif sqlstate in ('22P02','22007','22008') then msg := 'Número ou data em formato inválido.'; end if;
      errs := errs||jsonb_build_object('linha',coalesce((l->>'linha')::int,i),'erro',msg);
    end;
  end loop;
  return jsonb_build_object('importados',ok,'erros',errs);
end $$;

/* ---------- cópias de segurança ---------- */
create function inv.fazer_copia() returns bigint language plpgsql security definer set search_path=inv,pg_temp as $$
declare j jsonb := jsonb_build_object('formato','jb-inventario-1','geradoEm',now()); t text; r jsonb; v bigint;
begin
  for t in select unnest(array['empresas','unidades','departamentos','localizacoes','grupos','responsaveis','inventarios','bens','inventario_itens','conferencias','leituras','movimentacoes','manutencoes','termos','etiquetas']) loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from inv.%I x',t) into r;
    j := j||jsonb_build_object(t,r);
  end loop;
  j := j||jsonb_build_object('arquivos',(select coalesce(jsonb_agg(to_jsonb(a)-'miniatura'),'[]') from inv.arquivos a));
  insert into inv.copias(tamanho_bytes,conteudo) values (octet_length(j::text),j) returning id into v;
  delete from inv.copias where feita_em<now()-interval '30 days';
  return v;
end $$;

/* ---------- porta de entrada única ---------- */
create function inv.executar(p_user uuid,p_acao text,p jsonb) returns jsonb language plpgsql set search_path=inv,pg_temp as $$
declare a inv.acessos; nome text; e text; c text; r jsonb; novo boolean := nullif(p->>'id','') is null; v_ent text;
begin
  select * into a from inv.acessos where user_id=p_user;
  if p_acao='eu' then
    if a.user_id is null then return jsonb_build_object('acesso',false); end if;
    return jsonb_build_object('acesso',true,'permissoes',a.permissoes,'nome',(select x.nome from seg.perfis x where x.user_id=p_user),
      'anexos',jsonb_build_object('usado',(select coalesce(sum(tamanho),0) from inv.arquivos where excluido_em is null),'limite',262144000));
  end if;
  if a.user_id is null then raise exception 'Centro de Inventário: acesso restrito.' using errcode='42501'; end if;
  select x.nome into nome from seg.perfis x where x.user_id=p_user;
  perform set_config('inv.user_id',p_user::text,true),set_config('inv.user_nome',coalesce(nome,'Usuário'),true),set_config('inv.perms',a.permissoes::text,true);
  p := coalesce(p,'{}'::jsonb);
  case p_acao
    when 'carregar' then perform inv.exigir('visualizar_empresas'); r := inv.carregar(p);
    when 'painel' then perform inv.exigir('visualizar_empresas'); r := inv.painel(p);
    when 'bem_historico' then perform inv.exigir('visualizar_empresas'); r := inv.bem_historico(p);
    when 'buscar_qr' then perform inv.exigir('visualizar_empresas'); r := inv.buscar_qr(p);
    when 'conferencia_resumo' then perform inv.exigir('visualizar_empresas'); r := inv.conferencia_resumo(p);
    when 'arquivos' then perform inv.exigir('visualizar_empresas');
      r := (select coalesce(jsonb_agg(to_jsonb(x)-'empresa_id' order by x.criado_em desc),'[]') from inv.arquivos x where x.empresa_id=(p->>'empresa_id')::uuid and x.entidade=p->>'entidade' and x.registro_id=(p->>'registro_id')::uuid and x.excluido_em is null and x.completo);
    when 'arquivo_baixar' then perform inv.exigir('visualizar_empresas');
      r := (select jsonb_build_object('n',q.n,'b64',encode(q.dados,'base64')) from inv.arquivo_partes q join inv.arquivos x on x.id=q.arquivo_id where q.arquivo_id=(p->>'id')::uuid and q.n=(p->>'n')::int and x.empresa_id=(p->>'empresa_id')::uuid);
      if r is null then perform inv.erro('Parte do arquivo não encontrada.'); end if;
    when 'salvar' then
      v_ent := p->>'ent'; novo := nullif(p#>>'{dados,id}','') is null;
      if v_ent='empresas' then perform inv.exigir(case when novo then 'cadastrar_empresas' else 'editar_empresas' end);
      elsif v_ent='inventarios' then perform inv.exigir('criar_inventarios');
        if novo and nullif(p#>>'{dados,codigo}','') is null then perform inv.erro('Informe o código do inventário.'); end if;
      elsif v_ent='manutencoes' then perform inv.exigir('realizar_movimentacoes');
      else perform inv.exigir('administrar_configuracoes'); end if;
      r := inv.salvar(v_ent,p->'dados');
    when 'salvar_bem' then perform inv.exigir(case when nullif(p->>'id','') is null then 'cadastrar_bens' else 'editar_patrimonios' end); r := inv.salvar_bem(p);
    when 'situacao' then perform inv.exigir(case when p->>'ent'='empresas' then 'editar_empresas' else 'administrar_configuracoes' end); r := inv.mudar_situacao(p);
    when 'excluir' then perform inv.exigir('administrar_configuracoes'); r := inv.excluir(p);
    when 'inventario_mudar' then perform inv.exigir(case when p->>'situacao' in ('Concluído','Arquivado') then 'aprovar_inventarios' else 'criar_inventarios' end); r := inv.inventario_mudar(p);
    when 'inventario_incluir' then perform inv.exigir('criar_inventarios'); r := inv.inventario_incluir(p);
    when 'inventario_aprovar' then perform inv.exigir('aprovar_inventarios'); r := inv.inventario_aprovar(p);
    when 'conferencia_iniciar' then perform inv.exigir('realizar_conferencias'); r := inv.conferencia_iniciar(p);
    when 'conferencia_registrar' then perform inv.exigir('realizar_conferencias'); r := inv.conferencia_registrar(p);
    when 'conferencia_finalizar' then perform inv.exigir('realizar_conferencias'); r := inv.conferencia_finalizar(p);
    when 'regularizar_item' then perform inv.exigir('cadastrar_bens'); r := inv.regularizar_item(p);
    when 'movimentar' then perform inv.exigir('realizar_movimentacoes'); r := inv.movimentar(p);
    when 'estornar' then perform inv.exigir('realizar_movimentacoes'); r := inv.estornar(p);
    when 'manutencao_concluir' then perform inv.exigir('realizar_movimentacoes');
      update inv.manutencoes t set situacao='concluida',data_retorno=coalesce(nullif(p->>'data_retorno','')::date,current_date),custo=coalesce(nullif(p->>'custo','')::numeric,custo)
       where t.id=(p->>'id')::uuid and t.empresa_id=(p->>'empresa_id')::uuid and t.situacao='programada' returning to_jsonb(t) into r;
      if r is null then perform inv.erro('Manutenção programada não encontrada.'); end if;
    when 'termo_emitir' then perform inv.exigir('gerar_relatorios'); r := inv.termo_emitir(p);
    when 'termo_situacao' then perform inv.exigir('gerar_relatorios');
      if p->>'situacao' not in ('Assinado','Cancelado') then perform inv.erro('Situação inválida.'); end if;
      update inv.termos t set situacao=p->>'situacao' where t.id=(p->>'id')::uuid and t.empresa_id=(p->>'empresa_id')::uuid and t.situacao='Emitido' returning to_jsonb(t) into r;
      if r is null then perform inv.erro('Termo não encontrado ou já encerrado.'); end if;
    when 'etiquetas_registrar' then perform inv.exigir('gerar_relatorios'); r := inv.etiquetas_registrar(p);
    when 'arquivo_iniciar' then perform inv.exigir('editar_patrimonios'); r := inv.arquivo_iniciar(p);
    when 'arquivo_parte' then perform inv.exigir('editar_patrimonios');
      if not exists (select 1 from inv.arquivos x where x.id=(p->>'id')::uuid and x.empresa_id=(p->>'empresa_id')::uuid and not x.completo) then perform inv.erro('Arquivo não encontrado.'); end if;
      insert into inv.arquivo_partes(arquivo_id,n,dados) values ((p->>'id')::uuid,(p->>'n')::int,decode(p->>'b64','base64')) on conflict (arquivo_id,n) do update set dados=excluded.dados;
      r := jsonb_build_object('ok',true);
    when 'arquivo_concluir' then perform inv.exigir('editar_patrimonios'); r := inv.arquivo_concluir(p);
    when 'arquivo_excluir' then perform inv.exigir('editar_patrimonios'); r := inv.arquivo_excluir(p);
    when 'importar_bens' then perform inv.exigir('cadastrar_bens'); r := inv.importar_bens(p);
    when 'auditoria' then perform inv.exigir('administrar_configuracoes');
      r := (select coalesce(jsonb_agg(z),'[]') from (select x.* from inv.auditoria x where (nullif(p->>'empresa_id','') is null or x.empresa_id=(p->>'empresa_id')::uuid) and (nullif(p->>'antes','') is null or x.id<(p->>'antes')::bigint) order by x.id desc limit least(coalesce((p->>'limite')::int,50),200)) z);
    when 'copia_fazer' then perform inv.exigir('administrar_configuracoes'); r := jsonb_build_object('id',inv.fazer_copia());
    when 'copias' then perform inv.exigir('administrar_configuracoes');
      r := (select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'feita_em',x.feita_em,'tamanho',x.tamanho_bytes) order by x.id desc),'[]') from inv.copias x);
    when 'copia_baixar' then perform inv.exigir('administrar_configuracoes');
      r := (select x.conteudo from inv.copias x where x.id=(p->>'id')::bigint);
      if r is null then perform inv.erro('Cópia não encontrada.'); end if;
    else perform inv.erro('Operação desconhecida: '||coalesce(p_acao,''));
  end case;
  return coalesce(r,'null'::jsonb);
exception
  when unique_violation then
    get stacked diagnostics c = constraint_name;
    raise exception '%', case
      when c='bens_empresa_id_codigo_patrimonial_key' then 'Já existe um bem com este código patrimonial nesta empresa.'
      when c='inventarios_empresa_id_codigo_key' then 'Já existe um inventário com este código nesta empresa.'
      when c='empresas_cnpj_un' then 'Já existe uma empresa cadastrada com este CNPJ.'
      when c='responsaveis_cpf_un' then 'Já existe um responsável com este CPF nesta empresa.'
      when c='grupos_codigo_un' then 'Já existe uma classificação com este código nesta empresa.'
      when c like '%nome%' then 'Já existe um item com este nome neste mesmo nível.'
      else 'Registro repetido.' end using errcode='22023';
  when foreign_key_violation then
    raise exception 'Este registro está ligado a outros dados ou aponta para outra empresa.' using errcode='22023';
  when check_violation then
    raise exception 'Algum valor informado não é válido. Confira os campos e tente de novo.' using errcode='22023';
  when not_null_violation then
    get stacked diagnostics c = column_name;
    raise exception 'Preencha o campo obrigatório: %', c using errcode='22023';
  when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'Algum número ou data informado não é válido.' using errcode='22023';
end $$;

/* nuvem: usuário logado, sessão válida, e precisa estar em inv.acessos */
create function public.jb_inv(p_acao text,p_dados jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not seg.liberado() then raise exception 'sessão inválida' using errcode='42501'; end if;
  return inv.executar(auth.uid(),p_acao,p_dados);
end $$;
revoke all on function public.jb_inv(text,jsonb) from public,anon;
grant execute on function public.jb_inv(text,jsonb) to authenticated;

/* Claude: chamada pelo conector do dono (o mesmo caminho do jbcore) */
create function inv.api_ponte(p_acao text,p_dados jsonb,p_uid_app text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v uuid := jbcore.usuario_da_ponte(p_uid_app);
begin
  if v is null then
    if p_acao='eu' then return jsonb_build_object('acesso',false); end if;
    raise exception 'Centro de Inventário: acesso restrito.' using errcode='42501';
  end if;
  return inv.executar(v,p_acao,p_dados);
end $$;
revoke all on function inv.api_ponte(text,jsonb,text) from public;

/* só o dono */
insert into inv.acessos(user_id,permissoes)
select user_id,jsonb_build_object('visualizar_empresas',true,'cadastrar_empresas',true,'editar_empresas',true,'criar_inventarios',true,'cadastrar_bens',true,
  'editar_patrimonios',true,'realizar_conferencias',true,'aprovar_inventarios',true,'gerar_relatorios',true,'realizar_movimentacoes',true,'administrar_configuracoes',true)
from seg.perfis where uid_app='u_FZmOBZqQYLD0VE7xkGL8AA';

/* cópia diária do inventário às 3h20 (depois da cópia geral) */
do $$ begin
  if exists (select 1 from pg_extension where extname='pg_cron') then
    perform cron.schedule('inv-copia-diaria','20 6 * * *','select inv.fazer_copia()');
  end if;
end $$;
