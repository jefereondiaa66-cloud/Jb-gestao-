# Setor de Fichas e Documentação: estrutura inicial (V145, 20/11/2026)

Pedido do dono: criar o setor **Fichas e Documentação** para as fichas, os documentos e os controles
das operações da cerâmica. O setor vai ser construído por etapas: o dono apresenta cada ficha
(finalidade, campos, movimentos e setor responsável) e só depois ela é desenvolvida.

Nesta etapa entrou **só a estrutura e a navegação**. Nenhuma ficha, categoria, campo ou modelo foi
criado por suposição.

## O que aparece

- **Menu principal (seleção de setores):** cartão "Setor de Fichas e Documentação", depois do último
  setor, com o aviso "Nenhuma ficha cadastrada ainda". Também aparece na troca de setor do topo e na
  pesquisa (por "fichas").
- **Início do setor** (`#/setor-fichas`): a mesma saudação do início dos outros setores e a seção
  **Módulos**, onde cada ficha vai virar um cartão (o mesmo desenho dos módulos do Setor Pessoal).
  Enquanto não houver ficha, aparece o aviso no lugar dos cartões. Sem painel, gráfico, indicador,
  resumo nem atalhos a mais.
- **Funções previstas · EM BREVE:** a lista do dono, só para mostrar o que pode vir (emissão e impressão,
  preenchimento, digitalização, importação, leitura por OCR e IA, identificação das informações,
  atualização automática dos setores, histórico e armazenamento, integração com os setores). Nenhuma
  tem botão ou função ligada.
- **Página de cada ficha** (`#/setor-fichas/<ficha>`): **Últimas emitidas**, **Informações**
  (identificação, finalidade, campos, movimentos e setor responsável) e o botão **Emitir ficha** no alto,
  marcado como EM BREVE (tocar nele só avisa que vem em breve).
- Enquanto nenhuma ficha existe, o botão "Ver como fica a página de uma ficha" abre essa página vazia
  (`#/setor-fichas/estrutura`), para conferir a estrutura. Quando a primeira ficha entrar, esse endereço
  passa a levar ao início do setor.

## Como acrescentar uma ficha (próximas etapas)

Só depois de o dono apresentar a ficha. No bloco `fichas-doc-v145` do programa:

- `MODULOS`: um item por ficha, por exemplo
  `{id:'controle-fornada', nome:'…', ic:'fdFicha', cor:'ind', cat:'…', desc:'…', identificacao:'…', finalidade:'…', campos:[…], movimentos:[…], setor:'…'}`.
  O cartão, a página, o botão Módulos do topo, a pesquisa e a contagem no cartão do setor saem sozinhos.
- `CATEGORIAS` (opcional): `{id, nome, cor}`; com elas, aparecem os filtros acima dos cartões (como no
  Setor Pessoal).
- Emissão, preenchimento, histórico, digitalização, OCR/IA e integrações continuam EM BREVE até serem
  pedidos, cada um com a sua etapa.

## Por dentro

- Um bloco só no fim do programa (`<style id="fichas-doc-v145-css">` e `<script id="fichas-doc-v145">`).
  Usa as peças que já existem: `cabSpot`, o envelope dos setores (`sv-topo`, `sv-abas`, `#svCorpo`),
  o início dos setores (`c2-home`, `c2-blk`, `c2-tiles`) e as telas internas (`sec-cab`, `bloco`, `vv-kv`).
- Acesso: `PERM['setor-fichas']` para os perfis dos setores (como o Setor de Produção), sem edição,
  porque não há o que editar. No Controle Central o setor entra na lista sozinho.
- **Banco:** nada. O setor não lê, não grava e não apaga nenhum dado, não cria coleção e não precisa de
  migração. Nenhum outro setor, relatório, comprovante ou documento mudou.

## Testes

- `node scripts/verificar.mjs` (grupo `fichas`): rota, acesso, cartão, listas vazias, a lista EM BREVE
  igual à do dono, nada de banco, painel ou automação.
- `node scripts/construir.mjs && node scripts/testar-fichas.mjs`: programa real com banco simulado, no
  computador e no celular (cartão, início, página da ficha, Voltar, endereço inexistente, fichas de teste
  só na memória do teste, filtros por categoria e banco intacto).
- `node scripts/testar-navegacao.mjs`: a varredura de todos os setores já passa pelo setor novo.
