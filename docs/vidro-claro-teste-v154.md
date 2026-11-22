# V154 · Visual "Vidro claro" em teste, só para o dono (22/11/2026)

Pedido do dono: aplicar o novo design ("Vidro claro") no programa de verdade, mas **só para o usuário dele**,
para testar e melhorar. Todos os outros usuários continuam no visual de sempre. Nenhuma função, dado,
cálculo, permissão ou endereço de tela muda.

Esta é a **etapa 1**: a "casca" do visual novo (fundo, barra do topo, abas, cartões, botões, tabelas,
filtros e janelas de lançamento) em todas as telas. As telas redesenhadas setor por setor vêm nas etapas
seguintes, sempre atrás da mesma chave.

Código: bloco `<style id="v154-vidro-claro">` (no fim do `<head>`) e o trecho `V154 · "Vidro claro" em teste`
de `app/jb-gestao.html`. Teste: `scripts/testar-vidro-claro.mjs` (navegador) e a conferência `[vidro]` do
`scripts/verificar.mjs`.

## 1. Como ligar e desligar

1. Entrar no sistema como o dono.
2. Abrir **Configurações › Aparência**.
3. No alto aparece o quadro **"Visual novo · em teste"**, com a chave **"Vidro claro (só para você)"**.
4. Marcar liga na hora. Desmarcar volta ao visual de sempre na hora.

A escolha fica guardada na preferência do próprio usuário (`data/users/<usuário>/prefs`, campo
`vidroClaro`). Por isso acompanha o dono no computador, no celular, na nuvem e no Claude.

## 2. Quem vê

- **Só o dono do sistema.** O programa reconhece o dono pelo registro que já existia, o **dono da
  aparência** (`config/aparencia`, campo `dono`): a mesma pessoa que define o padrão de cores e a versão
  de todos. No Claude vale também o dono do artifact.
- Na nuvem, **ser administrador não basta**: outro administrador não vê a chave e o visual não liga para
  ele, mesmo que a preferência estivesse gravada.
- Não há login, nome nem identificador de pessoa escrito no código (o repositório é público).
- O visual novo **não entra no padrão de todos**: `config/aparencia` não é tocado e a preferência
  `vidroClaro` não faz parte da "versão do sistema" que vale para todo mundo.

## 3. O que muda e o que não muda

Muda só a aparência, e só com a classe `vis-vc` no `<html>`:

- toda regra do bloco começa por `html.vis-vc` (sem a classe, a página fica igual à de antes, letra por letra);
- nenhuma regra esconde, trava ou tira coisa do lugar (sem `display:none`, `visibility`, `pointer-events`,
  `opacity`, `position`, `z-index`), e nada é buscado de fora (sem `url(` nem `@import`);
- o contraste do texto foi varrido em todas as telas com o visual novo ligado; os casos graves (texto claro
  sobre cartão vermelho, texto secundário fraco) foram corrigidos.

Não muda: telas, botões, campos, abas, cálculos, permissões, navegação (`JBNAV`), impressão, comprovantes,
relatórios e o banco. O único dado gravado é a preferência `vidroClaro` do próprio usuário, quando ele
marca ou desmarca a chave.

## 4. Como o programa decide

Um lugar só liga e desliga a classe: `aplicarVidro()`. Ele roda em quatro horas:

1. logo depois de saber quem entrou, **antes de desenhar a primeira tela**;
2. quando chega do banco quem é o dono da aparência;
3. quando chegam as preferências do usuário;
4. quando o dono marca ou desmarca a chave.

Regra: liga quando a pessoa **pode** (item 2) **e** a preferência dela está ligada.

Enquanto o banco ainda não respondeu, vale o que o aparelho lembra (`localStorage`, chave `jb_vidro`, com o
identificador de quem ligou naquele aparelho), e só se for a **mesma pessoa**. Assim:

- o dono que deixou ligado abre a primeira tela já no visual novo, sem piscar;
- outra pessoa que entra no mesmo navegador **nunca** fica com o visual novo, nem por um instante, e o
  aparelho esquece;
- a tela de entrada da nuvem é sempre a de sempre (nada liga antes de saber quem entrou).

## 5. Testes

`node scripts/construir.mjs && node scripts/testar-vidro-claro.mjs` (dados fictícios, banco simulado):

- **no Claude** (`saida/claude.html`): desligado por padrão; a chave aparece para o dono; ligar e desligar
  pela chave; a preferência vai para o usuário dele; 16 telas mostram os mesmos botões antes e depois; sem
  erro de página; quem pode e quem não pode; reabrir sem piscar; desligado em outro aparelho; aparelho
  compartilhado;
- **na nuvem** (a página real `dist/index.html`, com a tela de entrada de verdade): o dono liga pela chave
  e só a preferência dele é gravada; `config/aparencia` não recebe nada; outro administrador e um usuário
  comum não veem a chave nem o visual novo, mesmo no aparelho em que o dono deixou ligado; a tela de
  entrada não muda.

Conferência `[vidro]` do `verificar.mjs` (roda antes de toda publicação): todas as regras presas à classe
`vis-vc`; nada escondido nem travado; um lugar só liga a classe; regra de quem pode; nenhum login no código;
só a preferência do usuário é gravada.

Antes de publicar, a comparação de funcionalidades tela por tela (261 endereços: títulos, abas, botões,
colunas, cartões e campos, mais os 77 formulários, campo por campo) foi rodada com o visual novo ligado e
deu igual à versão anterior, sem nada faltando.

## 6. Como desfazer

- **Para o dono:** desmarcar a chave. Volta na hora.
- **No código:** apagar o bloco `<style id="v154-vidro-claro">`, o trecho `V154 · "Vidro claro" em teste` e
  as três chamadas de `aplicarVidro` (na abertura do programa, nas preferências e na chave da tela de
  Aparência), além do teste, da conferência `[vidro]` e do passo do CI. Nenhum dado depende deles; a
  preferência `vidroClaro` que sobrar no usuário é ignorada.

## 7. Próximas etapas (todas atrás da mesma chave)

1. **Etapa 2:** telas redesenhadas setor por setor, seguindo o material aprovado pelo dono (o PDF de
   redesenho e a conferência de funcionalidades), com a comparação tela por tela antes de cada publicação.
2. **Etapa 3:** detalhes de uso (menus, acesso rápido, avisos, estados vazios).
3. **Depois:** as propostas novas que gravam dados, uma por vez, cada uma com pedido do dono e, quando
   mexer no banco, com cópia de segurança e migração com reversão.

Quando o dono aprovar, a chave deixa de ser "em teste" e o visual pode virar opção para todos.
