# Acesso por setor na nuvem (16/11/2026)

**Relato do dono:** em alguns computadores da nuvem não apareciam cadastros que apareciam no computador
dele, como os veículos de terceiros do Setor de Combustível.

## Causa

A leitura no servidor é liberada por **módulo** (`seg.permissoes`), e alguns cadastros que um setor usa
moram na coleção de **outro** módulo. Quem não tinha o módulo dono da coleção via a lista vazia — e, ao
tentar cadastrar de novo, o servidor recusava (`sem permissão para criar em financeiro`, 9 vezes em
16/11 no computador do Combustível). O administrador vê tudo, por isso no computador do dono aparecia.

Levantamento tela por tela (todas as telas e formulários de todos os setores, com a pilha de chamadas
para separar o que é da tela do que é do sino/pendências):

| Setor | Usa de outro módulo | Onde mora |
|---|---|---|
| Combustível | terceiros que abastecem, responsáveis, Caixa, despesas com combustível | `fin` (Financeiro) |
| Lenha | Caixa, responsáveis; fornadas do consumo de lenha | `fin`; `prodFab` (Produção) |
| Almoxarifado | funcionários (EPI, empréstimo, requisição), máquinas, Caixa, responsáveis, compromissos das entradas | `funcionarios` (DP), `locais` (Compras), `fin` |
| Paletes | clientes, Caixa, responsáveis, compromissos das compras | `clientes` (Vendas), `fin` |
| Produção | fornos; configuração do barro na maromba | `locais` (Compras); `barro` |
| Barro | máquinas, responsáveis, compromissos dos motoristas | `locais`, `fin` |
| Vendas | tipos de tijolo; Caixa para receber na hora | `tiposProduto` (Compras); `fin` |
| Fiscal | produtos, tipos, clientes, vendas | Compras, Vendas |

Também: duas entradas do Almoxarifado de 13/11 ficaram sem o compromisso no Financeiro (a gravação do
compromisso foi recusada), e havia setores na tela de quem não tinha acesso aos dados deles (telas vazias).

## O que mudou

- **Banco** (`supabase/migrations/20261116150000_seg_compartilhar_setores.sql`, cópia nº 49 antes):
  - `seg.leitura_compartilhada`: coleções inteiras que um setor lê de outro módulo (`locais`, `tiposProduto`,
    `clientes`, `produtos`, `vendas`, `prodFab`, cada uma só para os setores que precisam).
  - `public.jb_compartilhados()`: entrega só os itens que o setor usa dentro de coleções de outro módulo
    (`fin`: terceiros, responsáveis da aba do setor, nome das contas, categorias, compromissos lançados pelo
    setor e despesas com combustível; `barro`: configuração; `funcionarios`: só nome e função).
    **Nunca saem:** pagamentos ao pessoal, MEIs, saldo inicial das contas, extratos, CPF, salário.
  - `seg.verificar_escrita`: o item do setor (terceiro, responsável do setor, compromisso lançado pelo setor)
    pode ser gravado com a permissão do setor; antes e depois têm de ser do mesmo setor.
  - `seg.fin_numerar`: o número do compromisso não se repete (havia um nº 177 repetido de 12/11, lançado ao
    mesmo tempo por duas pessoas; ficou como está).
- **Nuvem** (`nuvem/jb-nuvem.js`): junta os compartilhados ao banco do programa, confere a cada minuto
  (essas coleções não chegam pelo tempo real) e logo depois de gravar nelas; `JB_SETOR_SRV` esconde o setor
  que o servidor não libera para a pessoa.
- **Programa**: a tela de setores e o trilho usam `setorVisivel` (fora da nuvem nada muda).

## Testes

- No banco real, numa transação sempre desfeita, entrando como cada usuário: antes da mudança quem só tem o Combustível
  não lia `fin` e a gravação do terceiro era recusada; depois, vê os 9 terceiros, cadastra e edita terceiro,
  não cria compromisso "Geral", não muda a origem de um compromisso para ganhar acesso, não regrava o
  documento inteiro (apagaria o resto); quem só tem o Almoxarifado vê os funcionários só com nome e função e cria o
  compromisso da entrada (com número novo quando o número já existia). Nada de pessoal/MEI/saldo vazou.
- `scripts/testar-acesso-setores.mjs` (página real da nuvem, servidor simulado): 21 conferências; com o
  código antigo, 10 falham (lista de terceiros vazia, setores sem dados aparecendo).
- `verificar.mjs` 94/94, navegação em 235 telas × 3 ambientes, Combustível e Lenha 69/69, Vendas,
  pendências, comprovante, tela fixa.

## Reverter

`supabase/migrations/20261116150000_seg_compartilhar_setores.down.sql` (volta a leitura e a gravação por
módulo como antes; nenhum dado é apagado).
