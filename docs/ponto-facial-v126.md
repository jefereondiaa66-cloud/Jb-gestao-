# Ponto facial profissional (V126 · 15/11/2026)

Reformulação completa do Ponto do Departamento Pessoal. O que eram três telas soltas (Ponto com foto,
Ponto facial com tela travada e Relógio de digital) virou um módulo só, com duas áreas separadas.

## O que saiu

| Saiu | Por quê |
|---|---|
| Ponto com foto (tocar no nome e tirar foto) | Não identifica ninguém: qualquer pessoa toca em qualquer nome. |
| "Fotos do dia" e a câmera ao lado dos horários no espelho | Galeria de fotos sem função de controle de jornada. Nenhuma marcação tinha foto guardada no banco. |
| Relógio de digital (importar planilha do relógio) | Era um ponto separado. Nunca foi usado (não havia nenhuma configuração nem importação no banco). |
| Tela separada "Cadastrar rosto" e a tela de início com "Começar o ponto facial" | Redundantes: o cadastro foi para a Gestão do ponto e a câmera abre direto. |
| Senha obrigatória para abrir a câmera | A câmera abre direto. Travar a tela virou opção do menu. |

Nada foi apagado do banco. Os 36 cadastros faciais feitos antes continuam valendo (mesmo modelo de
reconhecimento). O Espelho de ponto, o Diário do DP, as horas extras e a folha não mudaram.

## Área do funcionário · `#/pontoFacial`

1. A câmera **só abre com um toque**: no atalho "Ponto facial" (menu, botão ou pesquisa) ou no botão "Abrir a câmera"
   da tela de entrada. Entrar no sistema ou recarregar a página nunca abre a câmera. Aberta, ela ocupa a tela inteira,
   na **traseira**; o botão de setas, no alto, alterna para a da frente.
2. O sistema procura o rosto, calcula o código dele e compara com os funcionários do DP que têm cadastro facial.
3. Identificou: aparece **"Funcionário identificado!"**, o nome, a matrícula, o horário e o tipo da marcação.
4. A pessoa toca em **CONFIRMAR MARCAÇÃO**. Só aí a marcação é gravada.

Mensagens da tela: "Procurando rosto…", "Posicione-se melhor diante da câmera.", "Aproxime-se um pouco da
câmera.", "Iluminação insuficiente.", "Uma pessoa por vez.", "Rosto identificado. Confirme sua marcação.",
"Funcionário não identificado." / "Não conseguimos identificar seu rosto. Tente novamente.", "Marcação
registrada com sucesso!", "Já existe uma marcação neste horário.", "Não foi possível registrar. Tente novamente."

Regras:
- **Tipo da marcação**: segue a sequência entrada → saída para intervalo → retorno → saída, olhando o que a pessoa
  já marcou no dia e a **jornada da ficha dela** (quem não tem intervalo na jornada vai direto para a saída; turno da
  noite continua a jornada de ontem). A pessoa pode trocar o tipo sugerido ("Não é isso? Trocar").
- **Nada automático**: o sistema nunca cria, completa nem corrige horário sozinho.
- **Sem duplicar**: o botão trava no primeiro toque, a mesma pessoa não marca duas vezes dentro do intervalo
  mínimo (2 minutos, configurável) e cada marcação tem um código fixo que o banco recusa repetir.
- **Na dúvida, não identifica**: o rosto precisa ficar dentro do limite de semelhança e bem separado do segundo
  cadastro mais parecido, em olhadas seguidas. Rosto sem cadastro nunca é associado ao "mais parecido".
- **Alternativa**: "Registrar sem reconhecimento" (rosto não reconhecido, sem cadastro ou câmera com defeito).
  No celular do ponto ou com a tela travada, pede a senha da responsável. Fica marcado como pendente de tratamento.
- **Menu**: alternar câmera, reiniciar a câmera, tela cheia, travar a tela (só sai com a senha), gestão e sair.

## Área administrativa · `#/pontoGestao`

| Aba | Para quê |
|---|---|
| Controle do dia | Cada funcionário com cadastro facial, entrada, intervalo, retorno, saída, quantidade de marcações, última marcação e situação da jornada. Filtros por dia, setor e nome. Tocar na linha abre o histórico da pessoa. |
| Cadastro facial | Quem tem, quem não tem, quem está desativado e quem está sem o termo. Cadastrar, atualizar, desativar, reativar e apagar. Avisa quando sobra cadastro de quem foi desligado (LGPD). |
| Histórico | Todas as marcações originais, por funcionário, setor, período e origem. Comprovante e "Tratar" (conferir ou anular, com justificativa). |
| Relatórios | Mensal por funcionário, espelho individual, entradas e saídas, atrasos, horas extras, ausências, pendentes de tratamento, histórico de alterações e falhas de identificação. Visualizar, PDF e Excel. |
| Implantação | Fase atual, botão "Testar o reconhecimento", números dos testes, lista do que falta e histórico dos testes. |
| Configurações | Só administrador, RH e DP. Câmera padrão, intervalo mínimo, rigor, prova de vida, termo, senha e o quadro "Situação legal". |
| Auditoria | Conferência de integridade das marcações, proteção dos dados e registro de atividades. |

Perfis:
- **Celular do ponto**: só a câmera.
- **Responsável pelo ponto** (novo): a câmera e a gestão do ponto (com os relatórios e o espelho individual). Não vê as configurações técnicas, as fichas nem a folha.
- Administrador, RH, DP e gestor: como antes, mais a gestão do ponto.

No painel da nuvem (admin.html), dê ao usuário do ponto a permissão do **Departamento Pessoal: Ver, Criar e Editar**.

## Fase de testes e registro definitivo

O módulo começa em **fase de testes**. Nessa fase:
- as marcações são gravadas e aparecem no Controle do dia, no histórico e nos relatórios, marcadas como "teste";
- elas **não** entram no Diário do DP, no espelho oficial nem na folha (dá para ligar isso em Configurações);
- a tela do funcionário mostra a faixa "Fase de testes · acompanhamento";
- "Testar o reconhecimento" identifica a pessoa e pergunta se acertou, sem registrar marcação nenhuma.

Na aba Implantação, o administrador, o RH ou o DP passam para o **registro definitivo**. A partir daí cada
marcação confirmada é lançada no Diário do DP (campo vazio só; o que o DP escreveu ou corrigiu fica como está).

## Dados

| Coleção | O que guarda |
|---|---|
| `rostos` (já existia) | Um documento por funcionário: códigos numéricos do rosto, situação (ativo), termo de ciência. Nenhuma foto. |
| `pontoMarcacoes` (nova) | Cada marcação confirmada: funcionário, dia da jornada, tipo, hora, origem, confiança, câmera, fase. |
| `pontoEventos` (nova) | Falhas de identificação, testes, tratamentos, atos administrativos e senha errada. |
| `diario` (já existia) | O registro tratado pelo DP. No registro definitivo recebe as marcações, com a ligação `pontoIds`. |

Proteção no banco (migrações `20261115200000_seg_ponto_marcacoes.sql` e `20261115200100_seg_ponto_privilegios.sql`,
aplicadas em 16/11/2026 e testadas no banco real, sem deixar registro):
- item que entrou em `pontoMarcacoes` ou `pontoEventos` **não pode ser alterado nem apagado por ninguém**, nem
  por administrador nem pela ponte do Claude;
- cada marcação recebe do servidor o **NSR** (número sequencial), a **hora do servidor** e um **código encadeado**
  com a marcação anterior;
- `jb_ponto_integridade()` confere a sequência inteira (botão "Conferir agora" na aba Auditoria).

Correção de marcação é sempre por tratamento: a original fica, e entra um evento com a justificativa, quem
tratou e quando. Ajuste de horário continua no Diário do DP, com aprovação e histórico.

## Reconhecimento

- Biblioteca face-api 1.7.15 (modelos abertos), a mesma dos cadastros já feitos. Detecta o rosto, acha 68 pontos,
  gera um código de 128 números e compara pela distância.
- Roda **no próprio aparelho**, fora da tela (Web Worker). Nenhuma imagem sai do aparelho.
- A câmera abre em alta (1280 × 720) para a tela ficar nítida; a conta usa o quadro reduzido, para ser rápida.
- Câmera e reconhecimento começam a carregar juntos. A olhada leve roda o tempo todo; a pesada só com rosto
  perto e no centro.
- Qualidade: tamanho do rosto, posição, claridade da imagem, uma pessoa só.
- **Prova de vida** (opcional, desligada por padrão): pede para piscar. Dificulta o uso de fotografia, mas não é
  infalível. Com a responsável segurando o aparelho e apontando a câmera traseira, o risco é baixo.

Limites conhecidos, ditos com franqueza:
- não há detecção de profundidade nem de tela de celular: a prova de vida é só o piscar;
- gêmeos e irmãos muito parecidos podem não ser identificados (o sistema prefere não identificar a trocar a pessoa);
- precisa de internet para gravar a marcação; sem internet, avisa e não grava;
- a biblioteca e os modelos vêm do jsDelivr na primeira vez e ficam guardados pelo navegador.

## LGPD

- Rosto é dado pessoal sensível. O cadastro só começa depois de registrar o **termo de ciência** assinado
  (o sistema imprime o termo). A exigência pode ser desligada em Configurações.
- Finalidade única: identificar a pessoa no registro de ponto. Nenhuma foto é guardada.
- Acesso restrito a quem tem permissão no Departamento Pessoal. Tudo fica na auditoria do banco.
- Retenção: quando o funcionário é desligado, a aba Cadastro facial avisa e oferece apagar o código do rosto.
- Quem não quiser ou não puder usar o rosto usa o registro sem reconhecimento.

## Situação legal (Portaria MTP 671/2021)

**Este sistema não é um registrador eletrônico de ponto homologado e não deve ser apresentado como tal.**

| Requisito | Situação |
|---|---|
| Identificação do empregador e do trabalhador | Feito |
| Marcação original inalterável, com NSR, hora do servidor e encadeamento | Feito |
| Marcação só com a confirmação do trabalhador; nada automático | Feito |
| Correções com justificativa, responsável e histórico | Feito |
| Comprovante de Registro de Ponto do Trabalhador (PDF com assinatura PAdES) | Parcial: há comprovante de controle interno |
| Espelho de ponto no modelo oficial | Parcial |
| Registro do programa no INPI | Falta |
| Atestado Técnico e Termo de Responsabilidade | Falta |
| Arquivo Fonte de Dados (AFD) e Arquivo Eletrônico de Jornada (AEJ) assinados | Falta |
| Certificado digital para as assinaturas | Falta |

Fontes consultadas em 15/11/2026: Portaria MTP 671/2021 e Portaria MTP 1.486/2022 (legisweb.com.br, gov.br),
Anexo IX (requisitos do REP-P) e perguntas e respostas do Ministério do Trabalho. Antes de usar como ponto
oficial, confirme com o contador ou com um advogado trabalhista.

## Testes

`node scripts/construir.mjs && node scripts/testar-ponto-facial.mjs` roda o programa de verdade num navegador,
com câmera simulada mostrando rostos reais e o reconhecimento rodando de verdade. Confere os 14 pontos da
auditoria (câmera traseira, da frente, alternância, identificação, rejeição, confirmação, sequência, controle
individual, horário, duplicidade, relatórios, permissões, persistência e aparelhos diferentes) e mais.

O que o teste automático **não** substitui: um teste com o celular de verdade e os funcionários de verdade. É
para isso que existe a fase de testes.

## V127 (16/11/2026) · Pontos do funcionário e foto da marcação

Pedido do dono: ver, por funcionário, as fotos e a hora de cada marcação.

- **Aba "Pontos do funcionário"** (`#/pontoGestao/pontos`): lista dos funcionários em cartões (entrada e saída de hoje,
  marcações do mês, situação). Tocar na pessoa abre os pontos dela: totais do mês (dias, horas, atrasos, além da jornada,
  ausências, a conferir) e cada dia num cartão, com a hora (com segundos) e a foto de cada marcação. Tocar na marcação abre
  o comprovante com a foto maior e o botão Tratar. Espelho do mês em tela, PDF e Excel. A linha do Controle do dia abre essa aba.
- **Foto do momento**: quando o rosto é identificado, o sistema recorta o quadro da câmera (240 × 300, cerca de 10 KB).
  Só depois de a marcação ser gravada a foto vai para o armazenamento privado (`anexos`) e entra um evento `foto` em
  `pontoEventos` (que não pode ser alterado nem apagado) ligando a foto à marcação. A marcação nunca espera pela foto. No
  registro sem reconhecimento, a foto é o quadro da câmera na hora da confirmação. O teste de reconhecimento não guarda foto.
- **O que muda no que estava escrito acima**: o cadastro facial continua sem foto, mas a marcação agora guarda uma. O termo
  de ciência foi atualizado; quem assinou o termo antigo (que dizia que nenhuma foto era guardada) precisa assinar o novo.
  Dá para desligar em Configurações › "Foto no momento da marcação".
- **Limites**: as fotos aparecem na versão da nuvem (no Claude o armazenamento é outro); marcações anteriores não têm foto;
  40 funcionários com 4 marcações por dia ocupam cerca de 40 MB por mês no armazenamento.
- Nenhuma migração de banco: usa a coleção `pontoEventos` e o armazenamento que já existiam.

## V163 (25/11/2026) · MEI no ponto facial

Pedido do dono: os MEI também batem o ponto facial.

No cadastro do Departamento Pessoal os MEI são **prestadores de serviços** (tipo de contratação "Prestador de serviços
PJ" ou "Prestador de serviços autônomo"). Até a V162 o ponto facial deixava todos os prestadores de fora. Agora:

- **Cadastro facial**: o prestador aparece na aba Cadastro facial, no atalho da ficha e no "Testar o reconhecimento",
  com o mesmo termo de ciência (LGPD). O texto do termo fala em prestação de serviços e em registro de presença
  (entrada e saída), e a assinatura é do(a) prestador(a) de serviços.
- **Câmera**: identifica o prestador como qualquer pessoa ("Prestador identificado!") e grava a marcação só com o toque em
  CONFIRMAR MARCAÇÃO. O registro sem reconhecimento também lista os prestadores.
- **Sem jornada**: prestador não tem jornada controlada (é o que o próprio DP já diz na ficha). O ponto mostra a presença e
  as horas registradas, sem previsto, atraso, saída antecipada, hora além da jornada, noturno ou ausência. Ele não entra
  nos relatórios de atrasos, horas extras e ausências, não conta como "funcionário sem jornada" na Implantação, e o
  espelho dele sai como "Registro de presença".
- **Fora do Diário do DP**: mesmo no registro definitivo, a marcação do prestador fica só no ponto (`pontoMarcacoes`). Ela
  não vai para o Diário, que alimenta o espelho, as horas extras e a folha dos empregados, nem pelo "Lançar agora".
- **Comprovante**: "Contratante" e "Prestador de serviços" no lugar de "Empregador" e "Trabalhador".
- Nas listas da gestão, o nome do prestador leva a indicação "Prestador de serviços".

Cuidado (dito ao dono): para MEI, o ponto serve como controle de presença. Exigir horário e cobrar jornada de quem é
prestador, como se fosse empregado, pode caracterizar vínculo de emprego. Na dúvida, confirme com o contador ou com um
advogado trabalhista.

Nenhuma migração de banco e nenhum dado alterado: as regras do banco não olham o tipo de contratação.
`node scripts/testar-ponto-facial.mjs` confere o prestador de ponta a ponta (parte 16b).
