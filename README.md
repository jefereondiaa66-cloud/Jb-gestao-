# JB Gestão Cerâmica

Um programa, dois endereços, um banco só.

```
             app/jb-gestao.html  (fonte única, neste repositório)
                     │  node scripts/construir.mjs
          ┌──────────┴──────────┐
  dist/ (nuvem, Netlify)   saida/claude.html (artifact no Claude)
          │                      │
  jb-nuvem.js: login,      jb-core-ponte: conector
  tempo real               Supabase do dono
          └──────────┬──────────┘
          Banco central (Supabase · public.docs)
          + jbcore: fila de mudanças, operações idempotentes,
            painel, histórico de publicações, verificação do site
```

- **Lançou na nuvem?** Grava no banco central na hora; o Claude recebe em até ~30 s (página parada: na hora em que voltar a mexer).
- **Lançou no Claude?** Vai para o mesmo banco (cada gravação com código único: se a
  conexão cair, o reenvio não duplica; o que não subir fica guardado no navegador).
- **Mudou o código?** Commit na `main` → o Netlify verifica, constrói e publica sozinho;
  a mesma construção gera a página do Claude.

| Comando | Para quê |
|---|---|
| `node scripts/verificar.mjs` | verificações do programa, da construção, da ponte (testes B–F) e do JB Fiscal |
| `node scripts/construir.mjs` | gera `dist/` (nuvem) e `saida/claude.html` (Claude) |
| `node scripts/testar-navegador.mjs` | abre o programa real no Chromium com o banco simulado |
| `node scripts/testar-navegacao.mjs` | navegação central (JBNAV): Voltar linear, limite, janelas, abas, cliques repetidos, F5 e celular, em todas as telas de todos os setores (135 itens) |
| `node scripts/testar-janelas.mjs` | testa janelas, abas, rascunhos, clique duplo e gravação sem conexão (21 itens) |
| `node scripts/testar-vendas.mjs` | Setor de Vendas: pedido, venda, ticket 58/80 mm, orçamento, simulação ([docs/vendas-v110.md](docs/vendas-v110.md)) |
| `node scripts/testar-combustivel-lenha.mjs` | Combustível e Lenha de ponta a ponta: lançamentos, foto (IA simulada), programação, descontos e acerto (69 conferências) |
| `node scripts/testar-custo-buscar.mjs` | V115: custo por litro do combustível = média das compras + custo de buscar |
| `node scripts/testar-combustivel-fornecedor-lenha.mjs` | V117: combustível para fornecedor de lenha, descontado sozinho do que a cerâmica deve, painéis nos dois setores, lançamento à mão e acerto ([docs/combustivel-fornecedor-lenha-v117.md](docs/combustivel-fornecedor-lenha-v117.md)) (37 conferências) |
| `node scripts/testar-contas-pagar-lenha.mjs` | Financeiro › Contas a pagar – Lenha: saldo por fornecedor, PAGAR / DAR BAIXA inteiro e parcial, acima do saldo com justificativa (adiantamento), combustível como crédito, estorno, queda no meio sem duplicar, agendamento, histórico e recarga ([docs/contas-pagar-lenha-2026-11-17.md](docs/contas-pagar-lenha-2026-11-17.md)) (39 conferências) |
| `node scripts/testar-pagar-lenha-fornecedor.mjs` | V159: Contas a pagar do Setor da Lenha com um cartão por fornecedor (total igual ao Financeiro), compras dele ao tocar, Voltar, pesquisa, Pagar do cartão, Exportar e Combustível sem mudança |
| `node scripts/testar-almoco.mjs` | V160/V162: Controle de refeições da Cozinha (café, almoço e janta; quem não foi marcado é NÃO): SIM e NÃO do dia, marcar todos e desfazer, valor só daqui pra frente, cadastro rápido no Setor Pessoal, desconto refeição na folha, mês fechado travado, relatórios, perfil Cozinha e celular ([docs/almoco-cozinha-v160.md](docs/almoco-cozinha-v160.md), [docs/refeicoes-cozinha-v162.md](docs/refeicoes-cozinha-v162.md)) |
| `node scripts/testar-boletos.mjs` | V166: Boletos e contas a pagar: linha digitável conferida pelos dígitos (valor, vencimento e banco do próprio código), boleto repetido bloqueado, faixas de vencimento, prioridades, Pagar ou Enviar para agendamento, fila na agenda de quem paga, leitura por foto e celular ([docs/boletos-v166.md](docs/boletos-v166.md)) |
| `node scripts/testar-caixa-dia.mjs` | V167: Resumo financeiro do dia (saldo inicial e final, entradas, saídas, resultado, por categoria e setor, pessoal e produção, boletos e avulsos, caixa e bancos), fechamento do dia com pendências e histórico, relatório ao proprietário (PDF e WhatsApp), painel do caixa, pagamentos avulsos com repetidos e Controle por grade no caixa ([docs/caixa-dia-v167.md](docs/caixa-dia-v167.md)) |
| `node scripts/testar-pagamentos-producao.mjs` | V169: Pagamentos da Produção: conferência na Produção (ordem do controle, "Conferi" obrigatório, envio único, desfazer com motivo), compromisso no Financeiro com identificador fixo, fila e agenda de quem paga, pagamento pelo Controle por grade (recibo e Caixa), lançamento conferido travado, indicadores e filtros ([docs/pagamentos-producao-v169.md](docs/pagamentos-producao-v169.md)) |
| `node scripts/testar-comprovante-lenha-conta.mjs` | comprovante de entrega de lenha com a conta do fornecedor: saldo anterior + esta entrega = total devido (igual ao Financeiro), combustível, pagamento parcial, emitido de novo, adiantamento, cupom 80/58 mm, A4 e PDF ([docs/comprovante-lenha-conta-2026-11-18.md](docs/comprovante-lenha-conta-2026-11-18.md)) |
| `node scripts/testar-central-pagamentos.mjs` | Financeiro › Central de pagamentos e módulos (Combustível, Despesas gerais, Outros pagamentos): os 14 testes do prompt master — cadastrar, localizar fornecedor, agendar, alterar agendamento, parcial, saldo, pagamento final, quitação, histórico, indicadores, filtros, navegação, persistência e sem duplicados |
| `node scripts/testar-comprovante-lancamento.mjs` | V120: botão "Comprovante" em todo lançamento fora do Setor Pessoal (cupom 80/58 mm e folha A4), ficha dos cadastros e comprovante do compromisso do Financeiro ([docs/comprovante-lancamento-v120.md](docs/comprovante-lancamento-v120.md)) |
| `node scripts/testar-contratos.mjs` | V125/V127: Contratos com IA de ponta a ponta (IA simulada): pedido livre direto para a redação, civil e trabalhista, edição, comandos na hora sem IA, pontos de atenção, tela fixa, PDF, assinatura, versões, renovar, aditivo, distrato e modelos ([docs/contratos-ia-v125.md](docs/contratos-ia-v125.md)) |
| `node scripts/testar-acesso-setores.mjs` | nuvem com permissão por setor: quem só tem o Combustível vê os terceiros (guardados no Financeiro), quem só tem o Almoxarifado vê funcionários (só nome e função) e máquinas, e cada um só vê os setores dele ([docs/acesso-setores-2026-11-16.md](docs/acesso-setores-2026-11-16.md)) |
| `node scripts/testar-fichas.mjs` | V145: Setor de Fichas e Documentação (estrutura inicial): cartão no menu principal, módulos em cartões, página da ficha (Últimas emitidas, Informações, Emitir ficha em breve), funções previstas EM BREVE, banco intacto ([docs/fichas-documentacao-v145.md](docs/fichas-documentacao-v145.md)) |
| `node scripts/testar-variacoes-vendedor.mjs` | V152: Variação de vendas por vendedor na aba Variações do Setor de Vendas (R$, milheiros, preço médio, participação, TOTAL GERAL, filtros, gráficos e celular) e as outras telas iguais às da versão sem ela ([docs/variacoes-vendedor-v152.md](docs/variacoes-vendedor-v152.md)) |
| `node scripts/testar-variacoes-visual.mjs` | V181: visual novo da tela Variações em todos os setores (resumo, destaques, cartões com mini-gráfico, mês × mês anterior, tabela contínua no celular): números iguais aos calculados, cores pelo sentido, seletor do mês, celular e fim da tela livre do selo ([docs/variacoes-visual-v181.md](docs/variacoes-visual-v181.md)) |
| `node scripts/testar-vidro-claro.mjs` | V154: visual "Vidro claro" em teste, só para o dono que ligar a chave em Configurações › Aparência; outro administrador e usuário comum nunca veem (Claude e página real da nuvem), mesmos botões nas telas e só a preferência do usuário gravada ([docs/vidro-claro-teste-v154.md](docs/vidro-claro-teste-v154.md)) |
| `node scripts/testar-vidro-producao.mjs` | V155: Setor de Produção no visual "Vidro claro" (só com a chave): barra de módulos, Início novo, Lançamentos do setor, listas; nada some das 15 telas e nada é gravado ([docs/vidro-producao-v155.md](docs/vidro-producao-v155.md)) |
| `node scripts/testar-lancamento-foto.mjs` | testa o Lançamento Inteligente por Foto de ponta a ponta (IA e banco simulados) |
| `node scripts/testar-leitura-rapida.mjs` | testa a leitura por foto aos poucos: função do servidor (precisa do Deno) e adaptador da nuvem, com a IA simulada |
| `node scripts/testar-fiscal.mjs` | testa o JB Fiscal (tradução da nota para a Focus NFe, envio sem duplicar, produção bloqueada) sem rede |
| `node scripts/do-claude.mjs <pagina>` | traz para cá uma versão alterada dentro do Claude |

Documentação: [`docs/operacao.md`](docs/operacao.md) (como funciona e como operar) ·
[`docs/fiscal.md`](docs/fiscal.md) (nota fiscal pela Focus NFe: tokens, instalação, produção) ·
[`docs/auditoria-2026-10-30.md`](docs/auditoria-2026-10-30.md) (estado encontrado e decisões) ·
[`docs/evolucao-2026-11-13.md`](docs/evolucao-2026-11-13.md) (área de trabalho: janelas, abas, rascunhos) ·
[`docs/combustivel-lenha-2026-11-13.md`](docs/combustivel-lenha-2026-11-13.md) (Combustível e Lenha, V112) ·
[`docs/combustivel-fornecedor-lenha-v117.md`](docs/combustivel-fornecedor-lenha-v117.md) (combustível para fornecedor de lenha, V117) ·
[`docs/comprovante-lancamento-v120.md`](docs/comprovante-lancamento-v120.md) (comprovante do lançamento, V120) ·
[`docs/contas-pagar-lenha-2026-11-17.md`](docs/contas-pagar-lenha-2026-11-17.md) (Financeiro › Contas a pagar – Lenha) ·
[`docs/financeiro-central-pagamentos-2026-11-17.md`](docs/financeiro-central-pagamentos-2026-11-17.md) (Financeiro: auditoria, Central de pagamentos e módulos) ·
[`docs/comprovante-lenha-conta-2026-11-18.md`](docs/comprovante-lenha-conta-2026-11-18.md) (comprovante de entrega de lenha com o total devido ao fornecedor) ·
[`docs/fichas-documentacao-v145.md`](docs/fichas-documentacao-v145.md) (Setor de Fichas e Documentação, estrutura inicial) ·
[`docs/variacoes-vendedor-v152.md`](docs/variacoes-vendedor-v152.md) (Variação de vendas por vendedor, V152) ·
[`docs/variacoes-visual-v181.md`](docs/variacoes-visual-v181.md) (visual novo da tela Variações, V181) ·
[`docs/vidro-claro-teste-v154.md`](docs/vidro-claro-teste-v154.md) (visual "Vidro claro" em teste, só para o dono, V154) ·
[`docs/vidro-producao-v155.md`](docs/vidro-producao-v155.md) (Setor de Produção no visual novo, V155) ·
[`docs/almoco-cozinha-v160.md`](docs/almoco-cozinha-v160.md) (Controle de almoço da Cozinha, desconto refeição na folha, V160) ·
[`docs/refeicoes-cozinha-v162.md`](docs/refeicoes-cozinha-v162.md) (café, almoço e janta na Cozinha, V162) ·
[`docs/boletos-v166.md`](docs/boletos-v166.md) (Boletos e contas a pagar e fila de agendamento, V166) ·
[`docs/caixa-dia-v167.md`](docs/caixa-dia-v167.md) (Resumo financeiro do dia, fechamento, relatório ao proprietário e pagamentos avulsos, V167) ·
[`docs/pagamentos-producao-v169.md`](docs/pagamentos-producao-v169.md) (Pagamentos da Produção: conferência, fila de quem paga e pagamento pelo controle, V169) ·
agente: [`.claude/agents/jb-core.md`](.claude/agents/jb-core.md).
