# Centro de Inventário: setor da cerâmica (18/11/2026)

Pedido do dono: "tirar esse cadastro de empresa; ele vai ser um setor igual os outros".

## O que mudou na tela

- Saiu a tela **Empresas** (lista, cadastro, ficha, inativar) das abas, do Módulos e dos atalhos.
- Saiu a escolha de empresa de todas as telas (Visão geral, Inventários, Bens, Grupos,
  Departamentos, Localizações, Conferência, Etiquetas, Movimentações, Responsáveis, Relatórios,
  Configurações › Códigos).
- Visão geral: sem o quadro "Empresas cadastradas" e sem o atalho "Cadastrar empresa". O alto da
  tela segue o padrão dos outros setores (data • Centro de Inventário).
- Relatórios: sai "Inventário individual por empresa"; o "Inventário patrimonial geral" passa a
  ser o da cerâmica, sem a coluna Empresa.
- Configurações › Acesso: sem o bloco "Isolamento entre empresas" e sem as permissões de empresas
  na lista. Auditoria: sem "Ver todas as empresas".
- Textos como "nesta empresa" viraram "cadastrado(s)" ou "da cerâmica".
- Endereços antigos (`#/inventario/empresas...`) abrem a Visão geral.

## Como funciona por dentro

O banco do módulo (esquema `inv`, migração `20261108233000_inv_01_centro_inventario.sql`) prende
cada registro a uma empresa. Nada no banco mudou: o programa usa uma empresa só, a própria cerâmica.

- Na primeira vez que alguém com permissão abre o setor, o programa cria essa empresa sozinho com os
  dados da empresa das Configurações do JB (razão social, nome fantasia, CNPJ, endereço, cidade/UF,
  telefone e responsável) e a numeração padrão dos códigos (`PAT-00001`).
- Nas vezes seguintes não cria outra: escolhe a do mesmo CNPJ das Configurações (ou a primeira
  ativa) e, uma vez por visita, atualiza só os campos que mudaram nas Configurações.
- A numeração dos códigos patrimoniais continua em Configurações › Códigos do próprio setor.
- Quem não pode preparar o setor vê "O Centro de Inventário ainda não está pronto" e nada é gravado.
- O acesso continua o mesmo de antes (regra do servidor em `inv.acessos`).

## Testes

- `node scripts/verificar.mjs` (grupo `inventario`).
- `node scripts/construir.mjs && node scripts/testar-inventario-setor.mjs`: programa real com banco
  simulado; confere a criação automática, a ausência de qualquer tela ou escolha de empresa, a
  atualização pelas Configurações sem duplicar e o aviso para quem não tem permissão.
