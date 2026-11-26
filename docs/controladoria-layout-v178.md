# Controladoria · layout novo (V178, 26/11/2026)

Pedido do dono: melhorar **só a aparência** do Setor de Controladoria e Análise.
Nenhum número, fórmula, cálculo, nome de conta, regra, dado ou banco mudou. Tudo continua
vindo das mesmas funções de hoje (`calcMes`, `linhasDRE`, `linhasGer`, alertas, ajuda `IND`).

## O que mudou na tela

- **Painel no início do setor** (acima de "Atalhos favoritos" e "Módulos"), só com valores
  que já eram calculados:
  - o mesmo seletor de mês;
  - 8 cartões: Receita bruta, Lucro líquido, Margem líquida, IMC, Ponto de equilíbrio,
    Margem de segurança, NCG e Ciclo operacional — com a comparação com o mês anterior
    (▲▼ verde/vermelho) e o "?" de ajuda de sempre; tocar no cartão abre o módulo;
  - gráficos: DRE em cascata, NCG e ciclo financeiro mês a mês, composição de custos e
    despesas, medidores de Margem de segurança e IMC;
  - "Pontos de atenção": os mesmos avisos de hoje, com botão que leva ao lugar do lançamento.
- **DRE em tabela contínua**: Descrição | Mês | AV % (da receita líquida) | Mês de comparação |
  Variação (R$ e %). Contas redutoras recuadas, negativos em vermelho, subtotais em negrito com
  fundo claro e linha mais forte, Lucro líquido destacado, ▲▼ na variação.
- **Todas as tabelas do setor no mesmo padrão** (Capital de giro, Custos, Perdas, Preço, etc.):
  uma linha por item, sem cartões soltos; no celular a primeira coluna fica fixa e o resto rola
  para o lado; fonte mínima de 13 px; números alinhados à direita; "—" quando não há valor.
- **Números grandes não quebram linha**: a fonte diminui até caber no cartão.
- **Fim da tela livre**: espaço para o selo "Powered by Netlify" e a barra de baixo não
  cobrirem nada.
- **Relatório PDF**: o conteúdo é o mesmo; no início do setor ele passa a levar também os dois
  gráficos novos do painel.

## Onde está no código

- `app/jb-gestao.html`, dentro do bloco da Controladoria: `painelD`, `grafDash`, `tabDRE`,
  `tabC`, `acabarC` (ajuste de fonte, rolagem e espaço do fim).
- Estilos em `<style id="ctl-layout-v178-css">`, perto do fim do arquivo, todos presos a `.ctl`.

## Conferência feita

- 13 telas × 2 meses × computador e celular: nenhum número a menos; `calcMes` idêntico em
  todos os meses; textos do relatório PDF idênticos em todas as abas.
- `node scripts/verificar.mjs` (teste "V178") e `node scripts/testar-controladoria-layout.mjs`
  (dados fictícios; também roda no GitHub Actions).

## Como desfazer

- Nuvem: GitHub → Actions → "Reverter publicação".
- Claude: republicar `saida/claude.html` construído a partir do commit anterior.
