-- V156 (23/11/2026): Controle de Produção por Grade (Enforna e Desenforna), módulo novo dentro da Produção,
-- e o módulo "Pagamento por grade" no Setor Financeiro.
--
-- Só acrescenta. Nenhum dado existente muda e nenhuma regra antiga fica mais fraca:
--  1. seg.colecoes: duas coleções novas, as duas do módulo Produção (com trilha de auditoria):
--       prodGradeTrab  cadastro dos trabalhadores por grade (um documento por trabalhador; o CPF, quando
--                      informado, vai para "sensivel", que continua só do Setor Pessoal)
--       prodGrade      lançamentos de grades (tipo 'lanc') e pagamentos (tipo 'pag'), agrupados por mês
--  2. seg.leitura_compartilhada: o Setor Financeiro lê as duas (para mostrar quanto falta pagar a cada um).
--  3. seg.escrita_item: o Setor Financeiro pode gravar só os PAGAMENTOS (itens tipo 'pag') de prodGrade;
--     antes e depois do mesmo tipo. Lançamentos e cadastro continuam só com a permissão da Produção.
--     Os casos que já existiam (fin, alm) ficam exatamente como estavam.
--
-- Cópia de segurança nº 69 antes (seg.copias, 23/11/2026 03:18 UTC). Reverter: 20261123003000_seg_controle_grade.down.sql

insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar) values
  ('prodGradeTrab', 'producao', false, 'dados', true),
  ('prodGrade',     'producao', true,  'dados', true)
on conflict (raiz) do nothing;

insert into seg.leitura_compartilhada (raiz, modulo, motivo) values
  ('prodGrade',     'financeiro', 'Setor Financeiro: pagamento por grade (Enforna e Desenforna)'),
  ('prodGradeTrab', 'financeiro', 'Setor Financeiro: trabalhadores por grade a pagar')
on conflict (raiz, modulo) do nothing;

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
