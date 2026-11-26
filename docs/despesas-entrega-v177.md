# V177 · Despesas de Entrega (Setor de Combustível)

Pedido do dono em 25/11/2026 (projeto "Módulo Despesas de Entrega"): os motoristas lançam pelo próprio celular os
gastos das viagens; o Setor de Combustível confere e controla tudo; o Financeiro recebe o que é para pagar.

## Onde fica
- **Escritório:** Setor de Combustível › **Despesas de entrega** (Painel, Lançamentos, Viagens, Relatórios, Configurações).
- **Motorista:** `https://jb-gestao-ceramica.netlify.app/motorista.html` (login próprio). Quem é motorista e entra pela
  página principal é levado para lá. No Android: menu do Chrome › "Adicionar à tela inicial".

## Dados (só acrescenta)
- `despEnt` (lançamentos `tipo:'desp'` e viagens `tipo:'viagem'`, por mês, 8 partes) e `despEntCad` (motoristas e `cfg`),
  no módulo `compras` do banco (o acesso do Combustível). Caminhões = Veículos e máquinas (`locais`), nada duplicado.
- Motorista ligado ao login pelo campo `userId` do cadastro (só o administrador grava).

## Regras
- **Motorista:** só as funções `jb_mot_*` (conferem motorista, caminhão, viagem, valor, data e foto). O banco recusa
  leitura e gravação direta de login de motorista e só mostra as fotos que ele mesmo enviou.
- **Classificação automática** pelo tipo: combustível e Arla 32 → Despesas com entregas (categoria *Combustível para
  entrega*); demais → Despesas pagas gerais (alimentação → *Alimentação*; manutenção e óleo → *Manutenção*; outros →
  *Outras despesas*). **Pedágio e hospedagem começam sem categoria**: o administrador escolhe em Configurações (o módulo
  não cria categoria). Mudar o mapeamento vale para lançamentos novos.
- **Situações:** aguardando conferência · correção pedida · aprovado · rejeitado · cancelado. "No Financeiro" e "Pago"
  são calculados do compromisso (aprovar não é pagar).
- **Financeiro:** aprovado com dinheiro do motorista (reembolso) ou da empresa vira UM compromisso `ft_<lançamento>`
  (reenviar não duplica). Pago com o adiantamento entra na prestação de contas da viagem.
- **Adiantamento:** compromisso `fa_<viagem>` a pagar ao motorista (não é despesa); acerto = recebido − despesas aceitas;
  complemento a reembolsar = `fc_<viagem>`. Precisa da categoria do adiantamento configurada.
- **Quem aprova** (Configurações): aprova, rejeita, pede correção, cancela, corrige aprovado, adiantamento e acerto. O
  banco confere (`seg.desp_proteger`). Nada é apagado; correção guarda o antes e o depois.
- **Controladoria:** despesa aprovada entra pela data do gasto e pela categoria; o compromisso gerado não entra de novo.

## Banco (migrações, todas com `.down.sql`; cópia nº 81 antes)
`20261125230000_desp_entrega`, `…233000_politicas_rapidas`, `…234000_execucao`, `…235000_resumo`, `20261126001000_regras`.
Desfazer tudo: rodar os `.down.sql` na ordem inversa (os documentos ficam guardados).

## Testes
- `scripts/testar-desp-banco.sql` (no banco real, com ROLLBACK): 44 conferências.
- `node scripts/testar-despesas-entrega.mjs`: escritório e celular (exemplo do projeto: 850 + 90 + 45 + 80 = 1.065).
- `node scripts/verificar.mjs` (grupo `despesas-entrega`) e `node scripts/testar-navegacao.mjs`.

## Limites conhecidos
- Não testado em aparelho físico: só em Chrome simulando Android. Sem internet o motorista não envia (o rascunho fica
  no celular; a foto precisa ser tirada de novo se o envio dela falhou).
- A sessão do motorista vale 12 h ou 2 h parado (regra geral do sistema); depois pede a senha de novo.
- O login do motorista não deve receber permissões no painel Usuários e segurança (as Configurações avisam se tiver).
- O login só é criado na nuvem, por administrador.
- A devolução do saldo do adiantamento fica registrada no acerto, mas não entra sozinha no caixa do Financeiro.
