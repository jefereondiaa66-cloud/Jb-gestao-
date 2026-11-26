# V143 · Setor do Barro em dois painéis: consumo e extração (20/11/2026)

Pedido do Jeferson: no painel principal do Setor do Barro, só as informações do consumo de barro (o acúmulo do
barro consumido, o custo do barro, o dia a dia), ligado à maromba. A extração (uma ou duas vezes no ano; a próxima
começa agora em novembro) vai para um painel próprio, aberto por um botão no alto: "clico lá e aparece quanto foi
extraído". Tudo dentro do programa que já existe (`app/jb-gestao.html`, bloco do Setor do Barro). Só muda o que as
telas mostram: nada é gravado, nenhum dado muda e o cálculo do consumo continua o mesmo da V71.

## Por que o painel mostrava a extração

Desde a V71 o Início trocava de tela conforme a chave "Mostrar a parte de extração". A chave foi ligada em 11/11/2026
(está ligada no banco), e o Início passou a mostrar os cartões da extração (extraído hoje e no mês, custo por carrada,
estoque, motoristas a pagar) misturados com os do consumo. A ligação com a maromba nunca deixou de funcionar:
em novembro, até 19/11, são 756.000 tijolos confirmados = 1.682,10 t = R$ 10.372,33.

## O que mudou

- **Painel principal (Início) = consumo do barro, sempre**, com a chave ligada ou desligada. Cartões: consumo do mês
  (toneladas, R$ e tijolos da maromba), hoje, ontem, valor do barro consumido, custo do barro por tonelada
  (R$ 6,1663/t = R$ 13,72 por milheiro, com a origem), média por dia e acumulado do ano. Abaixo: o dia a dia do mês com o
  acumulado (t e R$) e os lançamentos da maromba com quem lançou (pedido de 04/11). O cartão de hoje diz quando a
  maromba do dia ainda não foi lançada ou espera confirmação (lançamento pendente não conta no barro).
- **Botão "Extração do barro"** no alto do painel principal, quando a parte de extração está ligada. Abre o
  **painel da extração** (`#/barroExtracao`): extraído hoje e no mês, custo por tonelada e por carrada (real com
  extração lançada; de referência sem ela), estoque de barro (com o valor e quantos dias dá no ritmo da maromba),
  motoristas a pagar, últimos lançamentos, quanto pesou cada item, a pagar por motorista e os cadastros da extração.
  "Lançar extração do dia" fica no alto desse painel.
- **Módulos, atalhos, o botão Novo e a barra do celular** seguem o painel: no consumo, só as telas do consumo e a
  "Extração do barro"; dentro da extração, as telas dela (lançar extração, lançamentos, custo do barro, motoristas a
  pagar, jazidas, motoristas e caçambas).
- **Chave "Mostrar a parte de extração"** (Configurações do setor): agora só mostra ou esconde o botão e as telas da
  extração. Desligada, o endereço do painel da extração avisa que ela está oculta.
- **Totais exatos:** o total da lista "quem lançou" é o do mês (igual ao dos cartões), e não a soma das linhas
  arredondadas (antes aparecia 1.682,14 t e R$ 10.372,32).
- Cartão do setor na seleção de setores: o consumo primeiro e, com a extração ligada, o extraído no mês.
- No celular, os cartões dos dois painéis ficam sem o ícone para o valor em R$ caber inteiro.

## Técnico

- Funções: `inicioB` chama sempre `inicioConsB`; novo `painelExtB`; `pendMar(dia)` conta lançamentos da maromba
  pendentes. Rota e permissão `barroExtracao`; `ROTAS_EXT` e a marca `dentro:1` nas abas da extração (filtradas em
  `shellB` fora do painel da extração).
- Verificação: `node scripts/verificar.mjs` (itens "Setor do Barro (V124)" e "Setor do Barro (V143)").
- Testes no navegador: `node scripts/construir.mjs && node scripts/testar-barro-paineis.mjs` (43 conferências,
  inclusive a maromba lançada em outro aparelho entrando sozinha no consumo) e `node scripts/testar-barro-valor.mjs`.
