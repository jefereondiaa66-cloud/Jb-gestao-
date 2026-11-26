# DRE detalhada (V179, 26/11/2026)

Pedido do dono: a DRE estava muito enxuta. Agora ela abre cada grupo nas contas e subgrupos.

- **CPV** abre em: Custos variáveis de produção (Lenha, Barro, Energia, Combustível, Insumos) e Custos fixos de
  produção (Arrendamento, Folha da produção, Manutenção, Depreciação da produção, Outros custos indiretos), mais a
  variação do estoque de tijolos (inicial − final).
- **Despesas variáveis** (Comissões, Fretes), **Despesas fixas** (Administrativas, Folha administrativa, Comerciais,
  Depreciação adm.), **Frota** (Depreciação, Peças, Motoristas/IPVA/seguro) e **Despesas financeiras**.
- Quando o valor vem dos setores, cada conta abre nos subgrupos do detalhamento: insumos por item (paletes, filme,
  fita, EPIs…), folha com carteira, folha sem carteira e **rescisões** (separadas na folha da produção e na
  administrativa), categorias do Financeiro e do Almoxarifado. Lançado à mão: só a conta.
- Os totais são exatamente os da DRE resumida; os subgrupos somam a conta (o arredondamento vai para o maior).
- Botão **Detalhada | Resumida** no título. O PDF da aba acompanha a escolha. A DRE de 12 meses continua resumida.
- Código: `linhasDREDet` e `gruposDetC` (Controladoria); subgrupo `g` gravado no detalhamento de `setoresMes`.
