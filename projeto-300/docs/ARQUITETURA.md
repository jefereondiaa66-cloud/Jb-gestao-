# Projeto 300 — Arquitetura, tecnologias, custos, riscos e plano

> Documento da Fase 1 (pesquisa e arquitetura). A pesquisa completa, com comparações, fontes e a
> verificação adversarial de cada frente, está em [`docs/pesquisa/`](pesquisa/).
> Data: 02/11/2026.

## 1. Diagnóstico do ambiente de desenvolvimento

| Item | Situação |
|---|---|
| Ambiente de construção | Contêiner Linux x64 (4 CPUs, 15 GB RAM), Node 22.23, Python 3.13, Rust, Xvfb, ffmpeg |
| Destino | Windows 10/11 x64 (o Electron 45 embute Node 24.22 / Chromium 156) |
| Rede do contêiner | npm e GitHub (inclusive *releases*) liberados; Hugging Face e alphacephei bloqueados |
| Chaves de API | Nenhuma disponível no contêiner: integrações com nuvem são testadas contra servidores locais que imitam as APIs; testes reais ficam em `npm run test:live` (com as chaves do dono) |
| Verificado na prática aqui | Electron 45 abre (Xvfb); SQLite criptografado (SQLCipher) + busca vetorial (sqlite-vec) + FTS5 funcionam dentro do Electron; senha errada é rejeitada; motor de voz sherpa-onnx 2.0.1 carrega no Electron; voz pt-BR local + reconhecimento NeMo pt reconheceram "trezentos" em 15/15 frases e 0 falsos disparos em 21 frases parecidas (40–80 ms por frase) |
| Windows de verdade | Testes e instalador NSIS rodam no GitHub Actions `windows-latest` (gerar NSIS no Linux exige Wine) |

## 2. Visão geral

```
┌──────────────────────────── Aplicativo 300 (Electron 45) ─────────────────────────────┐
│  Interface (renderer, React, sandbox + CSP)                                          │
│   orbe animado (IDLE/LISTENING/THINKING/SPEAKING/EXECUTING/ERROR) · conversa · tarefas │
│   atividades · conexões · configurações · confirmação de ações · captura do microfone │
│        │  window.api300 (IPC tipado, lista fechada de canais)                         │
│  Processo principal: janela, bandeja, atalho global, inicialização automática,        │
│   cofre de segredos (safeStorage/DPAPI), notificações, captura de tela/câmera         │
│        │                                                                              │
│  MOTOR (src/core — não depende do Electron; também roda na CLI)                       │
│   ┌──────────────┐  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│   │ Agente central│→│ Provedores IA  │  │ Memória       │  │ Segurança                │ │
│   │ (laço de      │  │ Claude (padrão)│  │ SQLCipher +   │  │ política de risco,       │ │
│   │  ferramentas) │  │ OpenAI, Ollama │  │ FTS5 + vetores│  │ confirmação, auditoria,  │ │
│   └──────┬───────┘  └───────────────┘  └──────────────┘  │ guardas (caminhos,       │ │
│          │ registro de ferramentas (riscos)              │ comandos, rede/SSRF),    │ │
│   ┌──────┴──────────────────────────────────────────┐    │ conteúdo externo marcado │ │
│   │ web · arquivos · sistema · navegador · documentos │    └──────────────────────────┘ │
│   │ visão · tarefas · agenda · Google · Microsoft · MCP│                                 │
│   └──────────────────────────────────────────────────┘                                 │
│   Voz: VAD Silero → ativação "trezentos" (NeMo pt local) → STT → agente → TTS por frase  │
│   Agendador: lembretes, tarefas em segundo plano, resumo diário                         │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Princípios:
1. **Cérebro trocável.** Uma interface interna fina (`LlmProvider`) com adaptadores sobre os SDKs oficiais: `@anthropic-ai/sdk` (Claude, padrão), `openai` (Responses API) e Ollama nativo (`/api/chat`, local). Trocar de modelo é uma configuração.
2. **Histórico só cresce.** Os modelos Claude 5.5 preservam o "raciocínio" entre turnos e recusam histórico editado. Memórias e data/hora entram como mensagens de contexto no meio da conversa, nunca editando o que já foi enviado.
3. **Ferramentas com nível de risco.** `read`, `write`, `external`, `destructive`, `financial`, `system`. Só leitura roda sem perguntar. Externo, destrutivo, financeiro e sistema **sempre** pedem confirmação. Tudo vai para a auditoria.
4. **Conteúdo externo é dado, não ordem.** Páginas, e-mails, arquivos de terceiros e servidores MCP chegam dentro de um envelope `<conteudo_externo>` com fronteira aleatória. Depois que conteúdo externo entra numa tarefa, ela fica "contaminada" e nenhuma escrita é aprovada automaticamente.
5. **Privacidade por padrão.** A palavra de ativação vem desligada até o dono ligar. O áudio só sai do PC depois da ativação (e só se o STT na nuvem estiver escolhido). O banco é criptografado e os segredos ficam no cofre do Windows (DPAPI).

## 3. Tecnologias escolhidas (e por quê)

| Área | Escolha | Alternativas avaliadas / motivo |
|---|---|---|
| Aplicativo | **Electron 45 + TypeScript** | Tauri 2 exigiria reescrever o núcleo em Rust ou usar um processo Node à parte, o que anula o ganho. .NET/Flutter perdem o ecossistema de IA em JS |
| Cérebro padrão | **Claude Opus 5.5** (`claude-opus-5-5`), raciocínio adaptativo, esforço configurável (texto: médio, voz: baixo) | OpenAI (gpt-5.x via Responses API) e Ollama local (Qwen3/Gemma 4) por configuração. Para voz mais rápida e barata recomenda-se escolher Sonnet 5.5 nas configurações |
| Modelo utilitário | **Claude Haiku 5.5** (títulos, extração de memória, leitor em quarentena) | US$ 0,10 / 0,50 por milhão de tokens |
| Pesquisa web | **Brave Search API** (pt-br, BR) → **Tavily** (reserva) → **busca nativa do Claude** (`web_search_20260209`, modo profundo; só Opus/Sonnet) → SearXNG próprio (opcional) | Bing API aposentada; Google CSE fechado a clientes novos |
| Leitura de páginas | Busca local com guarda contra SSRF (cada IP resolvido é validado na conexão) + Readability/linkedom + Turndown; PDF via unpdf | — |
| Memória | **SQLite criptografado** (`better-sqlite3-multiple-ciphers`, SQLCipher) + **FTS5** (sem acentos) + **sqlite-vec**; busca híbrida (texto + vetor + recência + importância) | Mem0 (conflito de dependências), Letta/Zep (servidor à parte), LanceDB (sem criptografia) |
| Embeddings | Opcional: Ollama local (EmbeddingGemma) ou OpenAI `text-embedding-3-small`; sem eles a memória usa só busca por texto | — |
| Voz — detecção de fala | **Silero VAD** (sherpa-onnx 2.0.1, local) | — |
| Voz — ativação "trezentos" | **Silero VAD → NeMo pt FastConformer (local) nos 2 primeiros segundos de cada fala → comparação fonética** (aceita "e trezentos", "300"; rejeita "trezentas", "duzentos", "presentes") + atalho global sempre disponível | Porcupine (plano gratuito encerrado), openWakeWord (só inglês; modelos NC), KWS do sherpa (0/24 em teste), Whisper tiny (4/24, alucina), Vosk (parado) |
| Voz — STT | Local: NeMo pt (gratuito, offline). Nuvem: OpenAI `gpt-4o-mini-transcribe` | Deepgram/Soniox/AssemblyAI ficam como evolução |
| Voz — TTS | Local: **Piper pt_BR** (sherpa-onnx + piper-phonemize). Nuvem: OpenAI `gpt-4o-mini-tts`, ElevenLabs Flash v2.5. Reserva: vozes do Windows (SAPI) | Supertonic (projeto arquivado), Kokoro (pt fraco) |
| Interrupção (barge-in) | Fala do 300 tocada no próprio Chromium com cancelamento de eco (ligado por padrão no Chromium 156) + limiares mais altos enquanto fala | Modo de baixa latência com OpenAI Realtime/Live fica para fase posterior |
| Controle do PC | Em camadas: (1) abrir apps/URLs/arquivos e comandos PowerShell com confirmação; (2) UI Automation do Windows; (3) navegador via Playwright (Edge, perfil dedicado); (4) último recurso: tela + mouse/teclado (`robotjs`) | nut.js (fork), Claude computer use como evolução |
| Documentos | docx, exceljs, pdf-lib; leitura com unpdf, mammoth, exceljs; OCR com tesseract.js (`por`) | — |
| Integrações | Google (Agenda, Gmail, Drive) por OAuth "Desktop app" com PKCE e loopback; Microsoft Graph (Outlook, OneDrive) com MSAL; **MCP** (`@modelcontextprotocol/client` 2.4) para acrescentar capacidades sem reconstruir | Servidores MCP de terceiros não entram no caminho dos dados pessoais por padrão |
| Agendador | croner + tabela no SQLite; tarefas em segundo plano só leem sozinhas, e qualquer outra ação vira pedido de aprovação | — |
| Empacotamento | electron-builder 26.18.1 (NSIS) no GitHub Actions `windows-latest` | Assinatura de código é opcional (o instalador não assinado mostra o aviso do SmartScreen) |
| Android (futuro) | Cliente fino (mesma interface) que conversa com o motor no PC por canal pareado | — |

## 4. Custos estimados (uso pessoal)

Premissas: 1 h de conversa por voz por dia, 50 pesquisas por dia, 30 dias.

| Perfil | Como fica | Custo mensal aproximado |
|---|---|---|
| **Econômico** | Haiku 5.5 no turno, voz local (NeMo + Piper), Brave | **US$ 5–10** |
| **Equilibrado (recomendado)** | Sonnet 5.5 na voz, Opus 5.5 no texto, voz local ou TTS OpenAI, Brave + Tavily | **US$ 40–60** |
| **Máximo** | Opus 5.5 em tudo (raciocínio sempre ligado), TTS na nuvem, busca nativa do Claude | **US$ 120–170** |

Componentes: Opus 5.5 = US$ 4 / 20 por milhão de tokens (entrada/saída, leitura de cache US$ 0,20); Sonnet 5.5 = US$ 2 / 10; Haiku 5.5 = US$ 0,10 / 0,50. Brave ≈ US$ 5 por mil buscas, com US$ 5 de crédito por mês. Tavily: mil créditos grátis por mês. Busca nativa do Claude ≈ US$ 10 por mil buscas mais os tokens. TTS OpenAI ≈ US$ 0,015 por minuto falado. Tudo que roda localmente (voz, ativação, memória, banco) custa US$ 0. Fontes e ressalvas estão em `docs/pesquisa/`.

## 5. Riscos principais e como são tratados

| Risco | Tratamento |
|---|---|
| Ativação por voz falhar com a voz real do dono, ruído ou TV | Testado só com voz sintética: ajuste de sensibilidade, comparação fonética, atalho global e botão sempre disponíveis. Fase 2 da ativação: detector pessoal treinado com gravações do dono |
| Eco: o 300 se ouvir e se interromper | Cancelamento de eco do Chromium, limiar e duração mínima maiores enquanto fala, opção de desligar a interrupção. Fone de ouvido elimina o problema |
| Latência do Opus na voz | Esforço baixo na voz, frases faladas assim que ficam prontas, recomendação de Sonnet 5.5 para a voz |
| Injeção de instruções (páginas, e-mails, MCP) | Envelope de conteúdo externo, contaminação da tarefa, confirmação obrigatória para ações de risco, leitor em quarentena sem ferramentas, auditoria |
| Ação destrutiva por engano | Lixeira em vez de apagar, pastas permitidas, bloqueio de pastas do sistema, classificação de comandos (os piores são recusados), botão PARAR geral |
| Chaves vazarem | Cofre do Windows (DPAPI) via safeStorage, ocultação nos registros, variáveis de ambiente limpas para processos filhos |
| Instalador não assinado | Aviso do SmartScreen, e o Smart App Control pode bloquear. Alternativas: certificado ou Microsoft Store/MSIX |
| Google: app não verificado | Cliente OAuth do próprio dono, publicado "em produção" sem verificação (aviso aceito uma vez) para os tokens não expirarem em 7 dias |
| Licença GPL do fonetizador (piper-phonemize/espeak-ng) | Sem problema para uso pessoal; trocar antes de qualquer distribuição pública |
| Mudanças nas APIs (rápidas em 2026) | Versões fixas, provedores isolados em adaptadores, testes contra servidores simulados e `npm run test:live` |

## 6. Plano de execução (16 fases)

| Fase | Conteúdo | Situação |
|---|---|---|
| 1 | Pesquisa e arquitetura | ✅ concluída (este documento + `docs/pesquisa/`) |
| 2 | Núcleo de inteligência (provedores, agente, persona) | em implementação |
| 3 | Interface visual | em implementação |
| 4 | Conversação por texto | em implementação |
| 5 | Voz (VAD, STT, TTS, interrupção, modo contínuo) | próxima leva |
| 6 | Palavra de ativação "trezentos" | próxima leva |
| 7 | Memória persistente | em implementação |
| 8 | Pesquisa na internet | próxima leva |
| 9 | Agentes e ferramentas | próxima leva |
| 10 | Controle do computador | próxima leva |
| 11 | Visão (imagens, tela, PDF, OCR, câmera) | próxima leva |
| 12 | Integrações (Google, Microsoft, MCP) | próxima leva |
| 13 | Autonomia (agendador, lembretes, resumo diário) | próxima leva |
| 14 | Segurança e testes | contínuo em cada módulo + revisão final |
| 15 | Aplicativo Windows (instalador) | GitHub Actions |
| 16 | Documentação e entrega | ao final |

A situação de cada fase é atualizada no `README.md` do projeto à medida que for concluída e testada.
