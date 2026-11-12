-- Ponto facial (V100, 12/11/2026)
-- Acrescenta a coleção "rostos": um documento por funcionário com os códigos numéricos do rosto
-- (as fotos do cadastro não são guardadas) e o documento "_senha" com a senha embaralhada da tela
-- travada. Fica no módulo do DP, com as mesmas permissões de "funcionarios" e "diario":
-- quem lê o DP lê os códigos (o celular da parede precisa deles para reconhecer), quem edita o DP cadastra.
-- Só acrescenta uma linha em seg.colecoes; não altera nenhum dado.
-- Antes de aplicar: select seg.fazer_copia();
-- Reverter: rodar 20261112120000_seg_rostos.down.sql.
insert into seg.colecoes (raiz, modulo, agrupada, tipo, auditar)
values ('rostos', 'dp', false, 'dados', true)
on conflict do nothing;
