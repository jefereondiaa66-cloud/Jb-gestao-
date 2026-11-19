# V138 · Centro de Inventário: fotos da conferência à vista e Estoque de materiais (19/11/2026)

Pedidos do Jeferson: (1) as fotografias tiradas na conferência física eram guardadas, mas nenhuma
tela mostrava; (2) o controle de estoque tem de ficar dentro do Centro de Inventário: ver quanto
tem, lançar o que sai e o saldo se atualizar sozinho.

## Fotografias

- **Conferência física**: selo com a quantidade de fotos em cada bem, quadro "Fotografias desta
  conferência" no fim da tela e as fotos já registradas dentro da janela "Registrar". A foto enviada
  aparece na hora. O item "Encontrado sem cadastro" também aceita foto.
- **Ficha do inventário**: o mesmo quadro (é onde se valida depois de finalizada a conferência).
- **Ficha do bem**: botão "Ver as fotografias das conferências".
- **Movimentações**: botão em cada linha para ver os documentos anexados.
- Tocar numa miniatura abre a foto original na tela, com "Baixar". Nas listas vai só a miniatura.

No banco, a migração `20261119120000_inv_02_fotos_conferencia` só recria `inv.conferencia_resumo`
para devolver as fotos de um inventário numa chamada, em páginas, quando a tela pede. Não cria
tabela, não mexe em dados nem em permissão, e a resposta de antes continua igual. Sem a migração a
tela mostra as mesmas fotos, buscando leitura por leitura (mais lento).

## Estoque (`#/inventario/estoque`)

- **Saldo**: cada material com quanto tem, mínimo, valor e situação; busca e filtros por categoria,
  grupo e situação; botão "Saída" na linha.
- **Lançar saída**: material, quantidade, para onde vai e quem retirou. Vira uma requisição de
  verdade (número, custo médio, histórico) e baixa o saldo na hora.
- **Lançar entrada**: para o que entra sem compra (saldo inicial, sobra, devolução). Compra com nota
  continua em Entradas do almoxarifado, porque gera a conta a pagar, e soma aqui sozinha.
- **Entradas e saídas**: tudo o que entrou e saiu.
- **Grupos** e **cadastro de materiais** (um por vez ou vários de uma vez).
- **Contagem**: o que é digitado fica guardado sozinho; ao fechar, cada diferença vira um ajuste.
- **Ficha do material**: saldo, custo, consumo por mês, ponto de reposição e os lançamentos.

## Um estoque só

O Estoque do Centro de Inventário não tem cadastro próprio: mostra e lança sobre os mesmos
materiais, saldos e lançamentos do Setor do Almoxarifado (coleção `alm`), com as mesmas regras
(`window.ALMOX_V52`) e as mesmas permissões. Nada é digitado duas vezes e não existem dois saldos.
O patrimônio continua restrito a quem o servidor autoriza (`inv.acessos`).

## Não foi feito

- Quem só tem a permissão de conferir ainda não consegue enviar foto (o banco exige a permissão de
  editar patrimônio). Hoje só o dono tem acesso, com todas as permissões, então não afeta ninguém.
- Compra com nota fiscal dentro do Centro de Inventário: continua no almoxarifado.

## Teste

`node scripts/construir.mjs && node scripts/testar-inventario-estoque.mjs`
