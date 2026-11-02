# Cérebro de IA (provedores LLM e abstração), arquitetura de agente, protocolo de ferramentas/MCP e memória de longo prazo do assistente "300"

> Pesquisa feita em 02/11/2026 por agentes com busca na web, conferida por um verificador adversarial independente. Itens marcados como 'não verificado' não puderam ser confirmados na fonte oficial (alguns sites estavam fora da rede do ambiente de pesquisa).

## Resumo

Conclusões principais (pesquisado em 02/11/2026; os sites oficiais da OpenAI e do Google (developers.openai.com, openai.com, ai.google.dev) estão BLOQUEADOS pelo proxy deste ambiente, então os preços de OpenAI e Gemini vêm da tabela LiteLLM no GitHub, cujo campo "source" aponta para a página oficial de preços, mais imprensa. É preciso conferir de novo antes de usar em produção). (1) Provedores: a OpenAI tem agora GPT-6 Astra ($10/$50), GPT-6/6.1 Sol ($2/$10), GPT-6.1 Terra ($1/$5) e GPT-6 Luna ($0,10/$0,50), contexto de 922k, visão e ferramentas. O SDK openai 7.47.0 trata a Responses API como "primary" e a Chat Completions como "supported indefinitely". No Google, gemini-3.8-flash saiu em 02/09/2026 a $0,75/$3,75 (preço de lançamento, que pode dobrar em 01/01/2027, não verificado), gemini-4-argon a $2/$10 (preço de lançamento até 30/11/2026) e gemini-3.1-pro-preview a $2/$12. Para modelos locais, o Ollama (~0.40.x) no Windows tem /api/chat nativo com tools, think e images, além de /v1/chat/completions e /v1/responses compatíveis com OpenAI (sem tool_choice) e /api/embed. Bons candidatos em pt-BR com tools e visão: Gemma 4 (Apache-2.0, mais de 140 idiomas, E4B/12B/26B-A4B/31B) e Qwen3.5 9B / Qwen3.6 27B (201 idiomas). Modelos abaixo de ~7B erram muito as chamadas de ferramenta. (2) Abstração: a recomendação é uma interface interna fina sobre os SDKs oficiais. Claude é obrigatório no @anthropic-ai/sdk (blocos thinking reenviados sem alteração, tool_choice auto). Os itens de raciocínio da Responses API e as thought signatures do Gemini também exigem replay nativo. Vercel AI SDK, LangGraph, Mastra, OpenAI Agents e Claude Agent SDK servem só como complemento pontual. (3) Arquitetura: um orquestrador único com roteamento de ferramentas e de modelo no caminho de voz. Sub-agentes só para pesquisa em leque, tarefas longas em segundo plano e leitura isolada de conteúdo não confiável. A pesquisa multi-agente da Anthropic gastou cerca de 15x mais tokens. (4) MCP: a especificação atual é a 2026-07-28 (sem estado: sem initialize nem Mcp-Session-Id, com server/discover, subscriptions/listen e MRTR; sampling, roots e logging ficaram obsoletos). O pacote v2 @modelcontextprotocol/client 2.4.0 implementa essa versão e negocia com servidores das versões 2025-xx. O v1 @modelcontextprotocol/sdk 1.32.2 vai só até 2025-11-25. (5) Memória: testei e funcionou a versão DIY em SQLite com better-sqlite3-multiple-ciphers 13.0.3 (protótipos N-API 10 já dentro do pacote, sem electron-rebuild) + sqlite-vec 0.1.9 + FTS5, com o banco criptografado (ChaCha20) e rodando no runtime do Electron 45.2.1 (Node 24.22.1). Teste só em Linux x64, ainda não em Windows. Força bruta com 100k vetores de 768 dimensões leva ~100–130 ms; com quantização binária, ~8 ms. Mem0, Letta, Zep/Graphiti e LangMem não se encaixam bem: exigem Python ou servidor, ou trazem SDKs antigos. Para embeddings em pt-BR, o melhor custo-benefício local é EmbeddingGemma-300m (13º de 93 no MTEB-BR). Na nuvem, gemini-embedding-001 lidera o MTEB-BR ($0,15/MTok) e text-embedding-3-small é o mais barato ($0,02/MTok).

## Recomendação

Orquestrador único em TypeScript, rodando num utilityProcess do Electron 45, com uma INTERFACE INTERNA FINA de provedores: adapters sobre @anthropic-ai/sdk 1.3.0 (padrão: Opus 5.5 para tarefas complexas e computer use; Sonnet 5.5 ou Haiku 5.5 para turnos de voz simples), openai 7.47.0 (Responses API, store:false), @google/genai 2.32.0 e ollama 0.6.4 (/api/chat nativo com num_ctx explícito), mais um adapter genérico OpenAI-compatível (chat.completions + baseURL). Ferramentas unificadas num ToolRegistry com níveis de risco, confirmação explícita e log de auditoria encadeado por hash. MCP via @modelcontextprotocol/client 2.4.0 (spec 2026-07-28, com fallback para servidores 2025-xx). Memória DIY num único SQLite criptografado: better-sqlite3-multiple-ciphers 13.0.3 (ChaCha20, chave guardada com o safeStorage/DPAPI do Electron) + sqlite-vec 0.1.9 + FTS5, com busca híbrida (BM25 + vetor + RRF + recência) e embeddings locais EmbeddingGemma-300m (Ollama ou transformers.js); fallback na nuvem: gemini-embedding-001 ou text-embedding-3-small.

**Alternativas:**

- Provedores de cauda longa (Mistral, Groq, OpenRouter, DeepSeek): um adapter único sobre Vercel AI SDK v7 (ai 7.0.159), sempre com instâncias de provedor (nunca IDs em string que passem pelo @ai-sdk/gateway). Claude continua no SDK oficial.
- LLM local sem exigir instalação do Ollama: node-llama-cpp 3.22.2 (MIT, binários win-x64 CUDA/Vulkan) num utilityProcess, com GGUF baixado no PC do usuário ou espelhado num GitHub Release.
- Se sqlite-vec der problema no Windows ou for abandonado: guardar os vetores como BLOB numa tabela comum do mesmo SQLite cifrado e fazer força bruta em JS (medido ~133 ms em 100k×768), ou quantização binária + rerank. LanceDB 0.41.0 só se passar de ~1M vetores (perde a cifra nativa e adiciona ~356 MB).
- MCP: se o v2 falhar com algum servidor antigo, criar adapter com @modelcontextprotocol/sdk 1.32.2 (protocolo até 2025-11-25) para aquele servidor.
- Tarefas longas e duráveis com checkpoints: se o motor próprio de tarefas ficar complexo, usar LangGraph.js 1.6.0 SÓ nesse subsistema (fora do caminho de voz) com checkpointer próprio no SQLite cifrado.
- Memória gerenciada: copiar o padrão de extração ADD/UPDATE/DELETE do Mem0 e a invalidação temporal do Graphiti para o SQLite próprio, em vez de adotar essas bibliotecas.

**Justificativa:** (a) A exigência de usar @anthropic-ai/sdk com replay exato dos blocos thinking e tool_choice auto, somada às particularidades da Responses API (ordem dos itens de raciocínio) e do Gemini (thought signatures), torna arriscada qualquer camada que normalize mensagens: um transcript nativo por provedor e um histórico canônico neutro resolvem isso com pouco código. (b) Frameworks (Mastra, LangGraph, Agents SDK) trazem dependências pesadas, bancos nativos extras sem cifra (better-sqlite3 ^12, libsql) e telemetria, e mudam quase todo dia. O Claude Agent SDK adiciona ~335 MB e prende o núcleo ao Claude. (c) Na voz, a latência manda: um orquestrador com roteamento de modelo e ferramentas é mais rápido e previsível. Sub-agentes custam ~15x mais tokens (Anthropic) e devem ficar para pesquisa em leque, tarefas em segundo plano e leitura isolada de conteúdo não confiável. (d) MCP 2026-07-28 é a especificação vigente e o SDK v2 é a linha estável que negocia com as duas eras. (e) A memória DIY em SQLite foi testada de ponta a ponta neste ambiente (cifra + vetor + FTS em pt-BR, inclusive no runtime do Electron 45.2.1), atende criptografia em repouso, não precisa de Python nem servidor, e na escala de um único usuário (<100k itens) a força bruta fica abaixo de ~130 ms (8 ms com quantização binária). (f) EmbeddingGemma-300m chega perto do topo do MTEB-BR com 308M parâmetros, roda local e protege a privacidade; a nuvem fica como fallback barato.

## Opções comparadas

| Opção | Tipo | Licença | Custo | Latência | pt-BR | Windows | Manutenção |
|---|---|---|---|---|---|---|---|
| Claude (Opus/Sonnet/Haiku 5.5) via @anthropic-ai/sdk 1.3.0 | cloud API + SDK oficial TS | SDK Apache-2.0 (npm); uso da API pelos Commercial Terms da Anthropic | Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0,10/$0,50 por MTok (fatos dados). Leitura de cache ~0,1x (padrão da Anthropic, não verificado hoje). web_search ~$10/1000 buscas (histórico, não verificado) | TTFT em nuvem tipicamente 0,5–2 s conforme o modelo e o thinking (estimativa, não verificado) | Excelente (experiência prévia; sem benchmark verificado aqui) | JS puro, roda no processo principal ou em utilityProcess do Electron | 1.3.0 publicado em 2026-10-23; 4 versões entre 21 e 23/10/2026 |
| OpenAI GPT-6 / GPT-6.1 / GPT-5.6 via openai 7.47.0 (Responses API) | cloud API + SDK oficial TS | SDK Apache-2.0 | gpt-6-astra $10 in / $1 cached / $50 out; gpt-6-sol $2/$0,20/$10; gpt-6.1-sol $2/$0,10/$10; gpt-6.1-terra $1/$0,05/$5; gpt-6-luna $0,10/$0,01/$0,50; gpt-5.6-luna $0,20/$1,20; gpt-5.4-mini $0,75/$4,50; contexto 922k (tabela LiteLLM com source=developers.openai.com; a página oficial está bloqueada aqui) | não verificado | Muito boa (não verificado com benchmark) | JS puro | openai 7.47.0 publicado em 2026-10-31 (lançamentos quase diários) |
| Google Gemini via @google/genai 2.32.0 | cloud API + SDK oficial TS | SDK Apache-2.0 | gemini-3.8-flash (e 3.6/3.7) $0,75/$3,75 por MTok (preço de lançamento; uma fonte diz que dobra para $1,50/$7,50 em 01/01/2027, não verificado); gemini-3.5-flash $1,50/$9; gemini-3.5-flash-lite $0,30/$2,50; gemini-3.1-flash-lite $0,25/$1,50; gemini-2.5-flash-lite $0,10/$0,40; gemini-3.1-pro-preview $2/$12 (acima de 200k: $4/$18); gemini-4-argon $2/$10 (lançamento, até 30/11/2026); gemini-3.8-live $0,75/$4,50, áudio de entrada $3/MTok | não verificado | Muito boa (não verificado com benchmark) | JS puro | @google/genai 2.32.0 publicado em 2026-10-29 |
| Ollama local (Gemma 4, Qwen3.5 / Qwen3.6) via ollama 0.6.4 ou endpoint OpenAI-compatível | local (servidor separado em 127.0.0.1:11434) | Ollama MIT; Gemma 4 Apache-2.0; Qwen3.5/3.6 Apache-2.0 (confirmar no arquivo de licença de cada checkpoint) | $0 em tokens; precisa de GPU. Tamanhos aproximados (fontes secundárias): gemma4:e4b ~9,6 GB (QAT ~6,1 GB), gemma4:12b ~7,6 GB, gemma4:26b (MoE com ~4B ativos) ~16–18 GB, gemma4:31b ~19–20 GB, qwen3.5:9b ~6,6 GB, qwen3.6:27b ~17 GB | Depende da GPU; ex.: modelo de 8–12B em Q4 numa GPU de 12 GB gera ~40–70 tok/s e processa um prompt de 8k em 2–5 s sem cache de prefixo (estimativa, não verificado) | Gemma 4 e Qwen3.5/3.6 bons em pt-BR segundo guias secundários; não há benchmark pt-BR de tool calling. Testar com corpus próprio | Sim (Windows 10 22H2+); chamar do processo principal do Electron para evitar CORS | Ollama 0.40.x com RC 0.40.12 em 27/10/2026 (agregador; API do GitHub bloqueada aqui); npm ollama 0.6.4 em 2026-09-29 |
| node-llama-cpp 3.22.2 (LLM local dentro do app, sem Ollama) | biblioteca local (llama.cpp em N-API) | MIT | $0 |  | Igual ao modelo carregado | Sim (prebuilds win-x64 CPU/CUDA/Vulkan) | 3.22.2, metadados atualizados em 2026-10-17 |
| Interface interna fina de provedores (DIY) sobre os SDKs oficiais | padrão de arquitetura (código próprio) | próprio | $0; ~1–2 mil linhas de TS por 4–5 adapters | sem overhead relevante | n/a | JS puro | interno |
| Vercel AI SDK v7 (ai 7.0.159 + @ai-sdk/anthropic 4.0.94, @ai-sdk/openai 4.0.106, @ai-sdk/google 4.0.109, @ai-sdk/mcp, ollama-ai-provider-v2 4.1.0) | framework/biblioteca de abstração de provedores | Apache-2.0 | $0 |  |  | JS puro | ai 7.0.159 em 2026-10-30 |
| LangGraph.js 1.6.0 | framework de grafo de agentes | MIT | $0 |  |  | JS puro (o checkpoint SQLite é nativo) | 1.6.0 em 2026-10-30 |
| Mastra 1.81.0 (@mastra/core, @mastra/memory 1.40.0) | framework de agentes completo | Apache-2.0 | $0 |  |  | JS (libsql é nativo) | 1.81.0 em 2026-10-30; 1.82.0-alpha em 2026-11-01 |
| OpenAI Agents SDK JS 0.21.0 (@openai/agents) | framework multi-agente | MIT | $0 |  |  | JS puro | 0.21.0 em 2026-10-20 |
| Claude Agent SDK 0.3.316 (@anthropic-ai/claude-agent-sdk) | framework de agente (executa o binário do Claude Code) | Commercial Terms da Anthropic ('SEE LICENSE IN README') | tokens Claude |  |  | Sim (binário win32-x64 e win32-arm64) | 0.3.316 em 2026-10-31 |
| MCP TypeScript SDK v2: @modelcontextprotocol/client 2.4.0 (vs v1 @modelcontextprotocol/sdk 1.32.2) | biblioteca de protocolo (cliente MCP) | v2 Apache-2.0; v1 MIT | $0 |  |  | Sim (cross-spawn resolve npx.cmd) | client 2.4.0 em 2026-10-23 (v2 desde 2.0.0-alpha em 01/04/2026); sdk 1.32.2 em 2026-10-23 |
| DIY: SQLite criptografado (better-sqlite3-multiple-ciphers 13.0.3) + sqlite-vec 0.1.9 + FTS5 | biblioteca local embutida | MIT (fork); SQLite3MultipleCiphers MIT; sqlite-vec MIT OR Apache-2.0 | $0 | Medido (container de 4 vCPU): vec0 float 100k×768 KNN k=10 ≈ 106 ms; vec0 bit (quantização binária) k=50 ≈ 8 ms; inserção de 100k ≈ 2,9 s; JS força bruta 100k×768 ≈ 133 ms | FTS5 unicode61 remove_diacritics 2: a busca 'reuniao' encontrou 'Reunião' (testado) | Protótipos win32-x64 no tarball e vec0.dll em sqlite-vec-windows-x64 (não executado em Windows) | multiple-ciphers 13.0.3 em 2026-08-07 (beta 13.0.4 em 2026-09-21); better-sqlite3 13.0.3 em 2026-08-05 |
| LanceDB 0.41.0 (@lancedb/lancedb) | banco vetorial embutido (Rust/N-API) | Apache-2.0 | $0 |  |  | Sim | 0.41.0 em 2026-10-29 (betas frequentes) |
| Orama 3.1.18 | motor de busca em memória (JS) | Apache-2.0 | $0 |  |  | JS puro | 3.1.18 em 2025-12-19 |
| Força bruta em JS (Float32Array, produto escalar de vetores normalizados) | algoritmo DIY | próprio | $0 | linear: ~1,3 ms a cada 1000 vetores de 768 dimensões |  | sim |  |
| Mem0 OSS (mem0ai 3.3.1) | biblioteca/serviço de memória | Apache-2.0 | $0 OSS + 1–2 chamadas de LLM por add() (extração e decisão ADD/UPDATE/DELETE) |  |  | JS | 3.3.1 em 2026-09-25 |
| Letta (ex-MemGPT) | servidor de agentes com memória | Apache-2.0 | $0 self-host / cloud pago |  |  | Só via servidor Docker/Python | cliente TS 1.12.1 em 2026-06-02 |
| Zep Cloud / Graphiti | memória em grafo temporal (SaaS / lib Python) | Graphiti Apache-2.0; Zep Cloud comercial (licença do npm não declarada) | Zep Cloud pago (não verificado); Graphiti exige um banco de grafo |  |  | SaaS / Python | @getzep/zep-cloud 4.0.1 (metadados em 2026-10-20) |
| LangMem | biblioteca de memória do LangChain | MIT (Python) | $0 |  |  | Python |  |
| EmbeddingGemma-300m (local: Ollama 'embeddinggemma' ~622 MB, ou transformers.js 4.3.2 / ONNX) | modelo de embedding local | Gemma Terms of Use (verificar; NÃO é Apache como o Gemma 4) | $0 | ~10–40 ms por frase curta em CPU moderna (estimativa, não verificado) | Muito boa (MTEB-BR 0,649) | Sim |  |
| Qwen3-Embedding-0.6B (Ollama qwen3-embedding:0.6b ~639 MB) / bge-m3 (~1,2 GB) / multilingual-e5-small | modelos de embedding locais | Qwen3-Embedding Apache-2.0; bge-m3 MIT; e5 MIT (conhecido; confirmar nos model cards) | $0 |  | Qwen3-Embedding bom; bge-m3 médio; e5-small razoável | Sim |  |
| Embeddings na nuvem: OpenAI text-embedding-3-small/large, Gemini gemini-embedding-001/-2, Voyage 4 | cloud API | comercial | OpenAI small $0,02/MTok, large $0,13/MTok; gemini-embedding-001 $0,15/MTok (obsolescência prevista para 14/05/2028), gemini-embedding-2 $0,20/MTok (multimodal); Voyage voyage-4-lite $0,02, voyage-4 $0,06, voyage-4-large $0,12, voyage-multilingual-2 $0,12; rerank-2.5 $0,05/MTok |  | Gemini > Voyage ≈ OpenAI-3 (agregador: voyage-3.5-lite ~61,9 e text-embedding-3 ~61,6; não verificado) | n/a |  |

### Prós e contras

**Claude (Opus/Sonnet/Haiku 5.5) via @anthropic-ai/sdk 1.3.0**

- ✅ Já é o padrão do projeto; ferramentas de servidor web_search_20260209/web_fetch_20260209 e computer_toolset_20260801
- ✅ O SDK 1.3.0 traz BetaToolRunner, betaZodTool e helpers MCP (mcpTools, mcpMessages) com tipagem estrutural, que servem para o MCP v1 ou v2 sem dependência direta
- ✅ Prompt caching reduz o custo do bloco fixo (system + ferramentas) em conversas de voz longas
- ⚠️ É preciso guardar e reenviar os blocos de conteúdo sem alteração (thinking + signature, redacted_thinking, tool_use, server_tool_use)
- ⚠️ tool_choice forçado (any/tool) é rejeitado no Opus 5.5: use auto e valide no código
- ⚠️ Opus em todo turno de voz sai caro (~$58/mês só na conversa, ver estimativa) e tem latência maior
- Fontes: https://www.npmjs.com/package/@anthropic-ai/sdk, https://github.com/anthropics/anthropic-sdk-typescript (CHANGELOG 1.3.0 de 2026-10-23, no tarball npm)

**OpenAI GPT-6 / GPT-6.1 / GPT-5.6 via openai 7.47.0 (Responses API)**

- ✅ gpt-6-luna e gpt-6.1-terra são muito baratos para roteamento, extração de memória e sub-agentes de pesquisa
- ✅ Responses API: o README do SDK a chama de 'primary API'; streaming, tools, visão e o helper toResponseInputItems() para replay correto
- ✅ O mesmo SDK com baseURL atende Ollama, LM Studio e outros provedores compatíveis via chat.completions
- ⚠️ Precisa preservar os itens de saída em ordem (o README alerta que filtrar response.output quebra a próxima requisição)
- ⚠️ previous_response_id guarda o estado no servidor da OpenAI. Por privacidade, prefira store:false + include reasoning.encrypted_content (não verificado neste ambiente)
- ⚠️ Linha de modelos muda muito rápido (GPT-5.6, depois 6, depois 6.1 em ~3 meses) e há divergência de preços entre as fontes
- Fontes: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json, https://www.npmjs.com/package/openai, https://www.cloudzero.com/blog/gpt-6-pricing/, https://technews.tw/2026/09/23/openai-launches-gpt-6-sol-and-luna-boasting-lower-cost-and-fewer-mistakes/, https://www.vktr.com/ai-platforms/openai-launches-gpt6-sol-and-luna-cuts-api-prices-in-half/

**Google Gemini via @google/genai 2.32.0**

- ✅ Flash tem o melhor preço por qualidade para voz e visão (imagens, PDF, vídeo) com contexto de 1M
- ✅ gemini-embedding-001 lidera o MTEB-BR (aprox. 68,2, agregador)
- ✅ Há endpoint compatível com OpenAI (generativelanguage.googleapis.com/v1beta/openai/, não verificado hoje)
- ⚠️ Preços de lançamento expiram e há 3 Flash novos em 6 semanas: risco de mudança
- ⚠️ Function calling no Gemini 3+ exige devolver as thought signatures (não verificado neste ambiente)
- ⚠️ Documentação oficial bloqueada no ambiente de build
- Fontes: https://blog.google/innovation-and-ai/models-and-research/gemini-models/3-8-flash-and-3-8-flash-cyber/, https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-8-flash, https://geotoolbox.ai/blog/gemini-api-pricing, https://toolhalla.ai/blog/gemini-4-argon-api-price-context-2026, https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json, https://www.npmjs.com/package/@google/genai

**Ollama local (Gemma 4, Qwen3.5 / Qwen3.6) via ollama 0.6.4 ou endpoint OpenAI-compatível**

- ✅ Privacidade total e funciona offline
- ✅ /api/chat nativo: tools (inclusive paralelas e com streaming), think (low/medium/high/max), images em base64, keep_alive
- ✅ /v1/chat/completions com tools e visão; /v1/responses sem estado (desde v0.13.3); /v1/embeddings e /api/embed (vetores normalizados L2)
- ✅ Windows nativo, instala sem admin; NVIDIA driver 551.61+, AMD ROCm v7 ou Vulkan
- ⚠️ Contexto PADRÃO de 4096 tokens: o prompt do sistema e as ferramentas são cortados em silêncio. Defina num_ctx no /api/chat ou OLLAMA_CONTEXT_LENGTH; o endpoint /v1 não aceita num_ctx
- ⚠️ /v1 não aceita tool_choice; imagem só em base64 (sem URL)
- ⚠️ Modelos menores que ~7B geram chamadas de ferramenta malformadas; 12B ou mais é o mínimo para agente
- ⚠️ É um instalador separado de ~4 GB, que o usuário precisa instalar e manter
- ⚠️ Modelos ':cloud' do Ollama enviam dados para a nuvem: bloquear por padrão
- Fontes: https://raw.githubusercontent.com/ollama/ollama/main/docs/api/openai-compatibility.mdx, https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md, https://raw.githubusercontent.com/ollama/ollama/main/docs/windows.mdx, https://raw.githubusercontent.com/ollama/ollama/main/docs/faq.mdx, https://alternativeto.net/news/2026/4/google-releases-gemma-4-open-weight-ai-models-with-apache-2-0-license, https://www.issoh.co.jp/tech/details/11651/, https://registry.ollama.ai/library/qwen3.6, https://together.ai/models/qwen3-5-397b-a17b

**node-llama-cpp 3.22.2 (LLM local dentro do app, sem Ollama)**

- ✅ Binários prontos win-x64, win-x64-cuda, win-x64-vulkan e win-arm64
- ✅ Dispensa o usuário de instalar o Ollama; roda GGUF de chat e de embedding em utilityProcess
- ✅ Tem function calling e saída JSON por gramática (conhecido; não verificado nesta versão)
- ⚠️ Os modelos GGUF ficam no Hugging Face (inacessível do container de build): baixar no PC do usuário ou espelhar num GitHub Release
- ⚠️ Aumenta o tamanho do instalador quando inclui CUDA
- ⚠️ Aumenta a superfície de crash nativo dentro do app
- Fontes: https://www.npmjs.com/package/node-llama-cpp

**Interface interna fina de provedores (DIY) sobre os SDKs oficiais**

- ✅ Atende a exigência de usar @anthropic-ai/sdk oficial e preserva o transcript nativo de cada provedor (thinking, reasoning items, thought signatures)
- ✅ Recursos novos (computer_toolset, server tools) entram no mesmo dia sem esperar a camada intermediária
- ✅ Registro de modelos como DADO (JSON): trocar modelo ou preço não exige rebuild
- ⚠️ Manutenção própria de 4–5 adapters e testes de contrato
- ⚠️ É preciso implementar o loop de ferramentas, limites e cancelamento (pouco código, mas é responsabilidade nossa)
- Fontes: https://www.npmjs.com/package/@anthropic-ai/sdk, https://www.npmjs.com/package/openai, https://www.npmjs.com/package/@google/genai, https://www.npmjs.com/package/ollama

**Vercel AI SDK v7 (ai 7.0.159 + @ai-sdk/anthropic 4.0.94, @ai-sdk/openai 4.0.106, @ai-sdk/google 4.0.109, @ai-sdk/mcp, ollama-ai-provider-v2 4.1.0)**

- ✅ Uma interface para dezenas de provedores; ToolLoopAgent, stopWhen/isStepCount, prepareStep, toolApproval, abortSignal, repairToolCall
- ✅ @ai-sdk/mcp tem cliente MCP com OAuth 2.1 e elicitation
- ✅ O provedor Anthropic modela thinking com signature e redacted_thinking
- ⚠️ Atrasa nos recursos novos de cada provedor; tradução de mensagens é opaca (risco com thinking e signatures)
- ⚠️ Ritmo de lançamento altíssimo (7.0.158 e 7.0.159 no mesmo dia; três linhas principais em paralelo: 5.x, 6.x e 7.x)
- ⚠️ Depende de @ai-sdk/gateway: IDs de modelo em string podem ser roteados pelo Vercel AI Gateway; usar sempre instâncias de provedor
- ⚠️ Contradiz a exigência de SDK oficial para Claude
- Fontes: https://www.npmjs.com/package/ai, https://www.npmjs.com/package/@ai-sdk/mcp, https://www.npmjs.com/package/ollama-ai-provider-v2

**LangGraph.js 1.6.0**

- ✅ Checkpoints persistentes, interrupções com humano no loop e retomada: bom para tarefas longas agendadas
- ✅ Muito usado para multi-agente
- ⚠️ Exige @langchain/core e os tipos de mensagem do LangChain (mais uma camada de tradução para thinking e signatures)
- ⚠️ @langchain/langgraph-checkpoint-sqlite 1.1.0 depende de better-sqlite3 ^12: segundo módulo nativo e sem criptografia
- ⚠️ Mais pesado e lento de iterar do que um loop próprio no caminho de voz
- Fontes: https://www.npmjs.com/package/@langchain/langgraph, https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite

**Mastra 1.81.0 (@mastra/core, @mastra/memory 1.40.0)**

- ✅ Agentes, workflows, memória, MCP, A2A e agendamento (croner) num pacote só
- ✅ Usa os providers do AI SDK v5, v6 e v7
- ⚠️ Muitas dependências (hono, execa, ws, posthog-node: verificar e desligar a telemetria)
- ⚠️ A memória padrão usa @mastra/libsql (outro banco nativo)
- ⚠️ Pré-lançamentos quase diários: superfície grande para um app desktop de um único usuário
- Fontes: https://www.npmjs.com/package/@mastra/core, https://www.npmjs.com/package/@mastra/memory, https://www.npmjs.com/package/@mastra/libsql

**OpenAI Agents SDK JS 0.21.0 (@openai/agents)**

- ✅ Handoffs, guardrails e agentes realtime de voz (@openai/agents-realtime)
- ✅ Dependência opcional de @modelcontextprotocol/client ^2 (MCP v2)
- ⚠️ Centrado na OpenAI; ainda 0.x (API instável)
- ⚠️ Tracing envia dados para a OpenAI por padrão (conhecido; não verificado nesta versão): desligar
- Fontes: https://www.npmjs.com/package/@openai/agents, https://www.npmjs.com/package/@openai/agents-core

**Claude Agent SDK 0.3.316 (@anthropic-ai/claude-agent-sdk)**

- ✅ Loop de agente pronto com ferramentas de arquivo e shell, subagentes e MCP
- ✅ Bom para uma futura tarefa de 'automação de arquivos e código' isolada
- ⚠️ Binário nativo win32-x64 de ~335 MB descompactado
- ⚠️ Só Claude (impede trocar de provedor no núcleo)
- ⚠️ Feito para agentes de código, não para voz de baixa latência
- Fontes: https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk, https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk-win32-x64

**MCP TypeScript SDK v2: @modelcontextprotocol/client 2.4.0 (vs v1 @modelcontextprotocol/sdk 1.32.2)**

- ✅ v2 é 'the stable release line' e implementa a spec 2026-07-28; aceita versões 2025-11-25, 2025-06-18, 2025-03-26 e 2024-11-05 (negociação de era)
- ✅ Transportes: StdioClientTransport, StreamableHTTPClientTransport e SSEClientTransport (legado); OAuth 2.1/PKCE (jose, pkce-challenge)
- ✅ Plugar servidores novos sem rebuild: o usuário adiciona comando ou URL e o app lista as ferramentas na hora
- ⚠️ A spec 2026-07-28 tem mudanças grandes (sem estado, server/discover, MRTR, cache ttlMs); servidores de terceiros vão misturar versões por um tempo
- ⚠️ v1 (1.32.2) só chega a 2025-11-25 e puxa express e hono como dependências
- ⚠️ Servidores MCP de terceiros executam código arbitrário com os privilégios do usuário
- Fontes: https://www.npmjs.com/package/@modelcontextprotocol/client, https://www.npmjs.com/package/@modelcontextprotocol/sdk, https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2026-07-28/changelog.mdx, https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2026-07-28/basic/authorization/index.mdx, https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/

**DIY: SQLite criptografado (better-sqlite3-multiple-ciphers 13.0.3) + sqlite-vec 0.1.9 + FTS5**

- ✅ TESTADO aqui (Linux x64): banco ChaCha20, vec0 (KNN cosseno, colunas auxiliares) e FTS5 com remove_diacritics funcionam juntos; sem a chave dá 'file is not a database'; cabeçalho do arquivo não fica em texto puro
- ✅ TESTADO no runtime do Electron 45.2.1 (Node 24.22.1, N-API 10, ABI 150) com ELECTRON_RUN_AS_NODE=1: o protótipo N-API carrega sem electron-rebuild
- ✅ Pacote 13.x traz protótipos win32-x64 e win32-arm64; SQLite 3.53.4; loadExtension habilitado
- ✅ Um arquivo só (memória, conversas, tarefas, log), transações e backup
- ⚠️ sqlite-vec é pré-1.0, de um único mantenedor, só força bruta (sem ANN); último estável 0.1.9 em 31/03/2026 (alpha 0.1.10 em 18/05/2026); sem protótipo npm win32-arm64 nem Android
- ⚠️ O fork de criptografia depende de um único mantenedor (o README pede apoio)
- ⚠️ Ainda não testado no Windows de verdade nem empacotado em asar (precisa de asarUnpack e ajuste de caminho)
- Fontes: https://www.npmjs.com/package/better-sqlite3-multiple-ciphers, https://github.com/m4heshd/better-sqlite3-multiple-ciphers, https://www.npmjs.com/package/sqlite-vec, https://github.com/asg017/sqlite-vec, https://codenote.net/en/posts/electron-encrypted-sqlite-libraries-comparison/

**LanceDB 0.41.0 (@lancedb/lancedb)**

- ✅ Índices ANN, busca híbrida vetor + full-text, escala para milhões de vetores
- ✅ Binários Windows x64 e arm64
- ⚠️ Binário win32-x64 de ~356 MB descompactado
- ⚠️ Sem criptografia em repouso nativa (não verificado), o que quebra o requisito de banco cifrado
- ⚠️ Segundo armazenamento ao lado do SQLite; exagero para um único usuário
- Fontes: https://www.npmjs.com/package/@lancedb/lancedb, https://lancedb.com/documentation/js/index.html

**Orama 3.1.18**

- ✅ JS puro, full-text + vetor + híbrido, sem módulo nativo (bom para Android e WebView)
- ⚠️ Tudo em memória JS; persistência por plugin e sem criptografia
- ⚠️ Última versão em 19/12/2025: ~11 meses parado
- Fontes: https://www.npmjs.com/package/@orama/orama

**Força bruta em JS (Float32Array, produto escalar de vetores normalizados)**

- ✅ Zero dependência; portátil para Android
- ✅ Medido: 100k×768 ≈ 133 ms (single-thread); 10k ≈ 13 ms
- ⚠️ Precisa de todos os vetores na RAM (100k×768×4 B ≈ 307 MB)
- ⚠️ Não combina com FTS dentro de uma única query
- Fontes: medição própria neste ambiente (Node 22.23.4)

**Mem0 OSS (mem0ai 3.3.1)**

- ✅ Padrão de extração e atualização de fatos bem conhecido (vale copiar a ideia)
- ✅ Tem modo JS
- ⚠️ Peers antigos: openai ^4.93 e @anthropic-ai/sdk ^0.40.1 (duplicam e conflitam com openai 7 e anthropic 1.3); better-sqlite3 ^12
- ⚠️ Benchmarks contestados (LoCoMo 92,5% segundo o próprio Mem0 vs 29,3% numa reimplementação independente)
- ⚠️ Prompts de extração em inglês; pouco controle de sensibilidade
- Fontes: https://www.npmjs.com/package/mem0ai, https://www.codebridge.tech/articles/best-ai-memory-frameworks, https://www.digitalapplied.com/blog/open-source-agent-memory-mem0-letta-zep-compared

**Letta (ex-MemGPT)**

- ✅ O agente gerencia a própria memória (core/archival), bom para agentes de vida longa
- ⚠️ Servidor em Python (Docker/Postgres): viola o requisito de não ter Python no PC
- ⚠️ Erros do agente podem corromper a memória
- ⚠️ @letta-ai/letta-client sem lançamento desde 02/06/2026
- Fontes: https://www.npmjs.com/package/@letta-ai/letta-client, https://www.codebridge.tech/articles/best-ai-memory-frameworks

**Zep Cloud / Graphiti**

- ✅ Invalidação temporal de fatos (valid_from/valid_to), útil para fatos que mudam
- ⚠️ Zep encerrou a Community Edition self-host em 2025: memória pessoal iria para a nuvem (privacidade/LGPD)
- ⚠️ Graphiti é Python + Neo4j/FalkorDB/Kuzu
- Fontes: https://techsy.io/en/blog/best-ai-agent-memory-tools, https://www.contextstudios.ai/guides/best-ai-agent-memory-tools-2026, https://www.npmjs.com/package/@getzep/zep-cloud

**LangMem**

- ✅ Integra com LangGraph
- ⚠️ Só Python: não existe pacote npm 'langmem'
- ⚠️ Sem benchmark robusto
- Fontes: https://www.codebridge.tech/articles/best-ai-memory-frameworks, https://www.npmjs.com/package/langmem (vazio)

**EmbeddingGemma-300m (local: Ollama 'embeddinggemma' ~622 MB, ou transformers.js 4.3.2 / ONNX)**

- ✅ MTEB-BR: 13º de 93, média de 22 tarefas 0,6490; perto do topo com só 308M parâmetros
- ✅ Mais de 100 idiomas, 768 dimensões com Matryoshka (dá para reduzir a dimensão)
- ✅ Roda em CPU; serve Ollama (/api/embed) ou transformers.js no Node (onnxruntime-node)
- ⚠️ Pesos no Hugging Face (inacessível no build) ou no registro do Ollama
- ⚠️ A licença Gemma exige repassar os termos ao redistribuir
- Fontes: https://huggingface.co/datasets/MTEB-BR/mteb-pt-results, https://arxiv.org/abs/2607.04581, https://huggingface.co/blog/embeddinggemma, https://raw.githubusercontent.com/ollama/ollama/main/docs/capabilities/embeddings.mdx, https://www.morphllm.com/ollama-embedding-models

**Qwen3-Embedding-0.6B (Ollama qwen3-embedding:0.6b ~639 MB) / bge-m3 (~1,2 GB) / multilingual-e5-small**

- ✅ Qwen3-Embedding 4B/8B estão no top 6 do MTEB-BR (66,2 / 67,0, autodeclarado); 0.6B é leve
- ✅ bge-m3: 1024 dimensões, 8k de contexto, também gera vetores esparsos
- ✅ e5-small: ~118M parâmetros e 384 dimensões; o mais leve para transformers.js
- ⚠️ bge-m3 ~61,5 no MTEB-BR (agregador): pior que EmbeddingGemma e com o dobro do tamanho
- ⚠️ e5-small: nota MTEB-BR não encontrada; qualidade inferior
- ⚠️ EVITAR nomic-embed-text v1.5 em pt-BR (focado em inglês)
- Fontes: https://benchmarklist.com/benchmarks/mteb_br/, https://registry.ollama.ai/library/qwen3-embedding, https://www.morphllm.com/ollama-embedding-models

**Embeddings na nuvem: OpenAI text-embedding-3-small/large, Gemini gemini-embedding-001/-2, Voyage 4**

- ✅ Sem download nem GPU
- ✅ gemini-embedding-001 é o 1º no MTEB-BR (aprox. 68,2, agregador)
- ✅ Custo irrisório para uso pessoal (centavos por mês)
- ⚠️ Envia o texto das memórias para terceiros (privacidade)
- ⚠️ Trocar de modelo obriga a reindexar tudo
- Fontes: https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json, https://benchlm.ai/google/api-pricing, https://benchmarklist.com/benchmarks/mteb_br/

## Notas de implementação

- INTERFACE DE PROVEDOR (sugestão): interface LLMProvider { id; capabilities:{tools,vision,pdf,thinking,computerUse,serverWebSearch,promptCache,maxContext}; stream(req:TurnRequest, signal:AbortSignal): AsyncIterable<TurnEvent> }. TurnRequest = { system, canonicalHistory, nativeTail?:unknown, tools:ToolSpec[], toolChoice:'auto'|'none', maxOutputTokens, reasoningEffort?, cacheHints }. TurnEvent = text_delta | thinking_delta | tool_call{id,name,input} | usage{in,cachedIn,out} | stop{reason} | native_turn{provider,payload}. Guardar o 'native_turn' na tabela messages.native_json para replay; o histórico canônico (texto, chamadas e resultados de ferramenta, anexos) serve para UI, memória e TROCA de provedor (ao trocar, reconstrói a partir do canônico e descarta thinking antigo).
- ADAPTER CLAUDE: reenviar response.content sem alteração (thinking+signature, redacted_thinking, tool_use, server_tool_use e resultados de web_search); tool_choice:{type:'auto'} (forçado é rejeitado no Opus 5.5); cache_control nos blocos fixos (tools + system) e ordem das ferramentas DETERMINÍSTICA para acertar o cache; passar {signal} para cancelar o stream. Helpers em '@anthropic-ai/sdk/helpers/beta/mcp' (mcpTools, mcpMessages) usam tipagem estrutural e servem para o MCP v1 ou v2.
- ADAPTER OPENAI: client.responses.create({ model, input, tools, stream:true }); manter os itens de saída em ordem e usar toResponseInputItems() (o README do SDK 7.47.0 alerta que filtrar output quebra a requisição seguinte). Para privacidade: store:false + include:['reasoning.encrypted_content'] (não verificado neste ambiente). function_call vira function_call_output. Os modelos 'pro' são só Responses (LiteLLM mode=responses).
- ADAPTER GEMINI: @google/genai 2.32.0; preservar as partes com thoughtSignature junto de functionCall ao reenviar (não verificado aqui). Preços de lançamento expiram (Argon em 30/11/2026; Flash possivelmente em 01/01/2027): o medidor de custo lê do registro de modelos.
- ADAPTER OLLAMA: preferir o /api/chat nativo (npm ollama 0.6.4) com options.num_ctx 16384–32768, keep_alive '30m', think:'low' para voz e images base64. O padrão de 4096 tokens corta o prompt em silêncio. /v1/chat/completions (baseURL http://127.0.0.1:11434/v1) aceita tools e visão, mas não aceita tool_choice nem num_ctx. Detectar o servidor com GET /api/tags; chamar do processo principal (CORS). Embeddings: POST /api/embed {model:'embeddinggemma', input:[...]} retorna vetores normalizados L2. Bloquear modelos ':cloud' por padrão.
- REGISTRO DE MODELOS COMO DADO: JSON (id, provedor, preços in/cached/out, contexto, capacidades, data de obsolescência) editável nas configurações e atualizável sem rebuild; dá para gerar a partir de https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json (acessível do build, ao contrário de openai.com e ai.google.dev). Testar as capacidades na primeira execução (uma chamada mínima com tool).
- ROTEADOR DE MODELO: classificação barata (regra + Haiku 5.5 / gpt-6-luna / gemma local) define o nível: 'voz simples' (Haiku/Sonnet), 'raciocínio/plano/computer use' (Opus 5.5), 'pesquisa' (sub-agentes Haiku/Sonnet com web_search), 'privado/offline' (Ollama). O usuário pode fixar o modelo por comando ('300, usa o modelo local').
- LOOP DO ORQUESTRADOR: ReAct com limites: voz ≤6 passos de ferramenta ou ~20 s antes de dar uma fala de progresso ('tô verificando...'); texto ≤15 passos; tarefa em segundo plano ≤50 passos + orçamento de tokens (ex.: 300k) + 15 min de relógio. Timeout padrão de 30 s por ferramenta. Detectar laço: mesma ferramenta com os mesmos argumentos 3 vezes encerra com explicação.
- BARGE-IN / CANCELAR: um AbortController por turno, propagado para o SDK do LLM, o TTS e as ferramentas canceláveis. Ao interromper, gravar no histórico SÓ o texto que já foi falado (marcar como 'interrompido'). Nunca reenviar ao Claude um tool_use sem o tool_result: descartar blocos incompletos. Ferramentas com efeito colateral já confirmadas terminam de forma atômica e o resultado é relatado no próximo turno.
- SUB-AGENTES (quando usar): (1) pesquisa em leque: o orquestrador cria 2–5 sub-agentes baratos em paralelo, cada um devolve um resumo de ≤800 tokens com URLs, e o orquestrador sintetiza; (2) tarefas agendadas e longas num utilityProcess separado; (3) 'leitor em quarentena' SEM ferramentas (padrão Dual LLM) para resumir web, e-mail e documentos não confiáveis em JSON estruturado. NÃO usar sub-agentes no caminho de voz comum (latência, e a pesquisa multi-agente da Anthropic gastou ~15x mais tokens).
- PLANEJAMENTO: para controle do computador e tarefas de várias etapas, usar plan-then-execute: o modelo gera um plano JSON (passos, ferramentas, alvos), o usuário aprova por voz ou clique, e a execução só usa as ferramentas listadas no plano (isso também defende contra prompt injection). Tarefas ficam numa tabela com máquina de estados (pending, running, waiting_confirmation, done/failed/cancelled) e checkpoint por passo para retomar depois de um crash.
- TOOL REGISTRY: cada ferramenta (interna ou MCP) com {name, description, inputSchema (JSON Schema 2020-12, gerado com zod 4.6.7), risk:'read'|'local_write'|'external_send'|'destructive'|'financial', confirm:'never'|'first_time'|'always', voiceAllowed, idempotent, timeoutMs}. Para risco ≥ external_send, confirmação explícita com resumo do que será feito ('Vou enviar e-mail para X com assunto Y. Confirma?'), aceitando só 'confirmo' ou o clique.
- PROMPT INJECTION (no nível do loop): marcar o conteúdo de ferramentas, web, e-mail e arquivos como não confiável (<dados_nao_confiaveis origem=...>). Depois que algo não confiável entra no contexto do turno, ferramentas de risco ≥ external_send exigem confirmação mesmo que normalmente não exigissem. Allowlist de domínios no web_fetch para tarefas agendadas; nunca seguir sozinho links de e-mail. Referências: Design Patterns for Securing LLM Agents (arXiv 2506.08837) e CaMeL (arXiv 2503.18813).
- MCP CLIENTE: npm i @modelcontextprotocol/client@2.4.0; transportes StdioClientTransport (servidores locais), StreamableHTTPClientTransport (remotos) e SSEClientTransport (legado). Mudanças da spec 2026-07-28: sem initialize nem Mcp-Session-Id, server/discover obrigatório, subscriptions/listen no lugar de GET e resources/subscribe, MRTR (InputRequiredResult) no lugar de sampling/elicitation iniciados pelo servidor, resultType obrigatório, cabeçalhos Mcp-Method/Mcp-Name, cache por ttlMs. Roots, Sampling e Logging estão obsoletos: não implementar sampling.
- MCP PLUGÁVEL SEM REBUILD: tela de configurações aceita o formato 'mcpServers' {command,args,env} ou {url}. Para servidores em JS sem Node instalado no PC, rodar com command=process.execPath e env ELECTRON_RUN_AS_NODE=1 (o runtime do Electron 45 é o Node 24.22.1, verificado). No Windows o cross-spawn resolve npx.cmd. Servidores Python (uvx) ficam como opção avançada, com o usuário instalando o uv.
- SEGURANÇA MCP: ao adicionar um servidor, mostrar nome, descrição e schema de cada ferramenta para aprovação. Guardar o HASH das definições e pedir nova aprovação se mudarem (ataque 'rug pull'). Prefixar nomes (servidor__ferramenta) e recusar nomes que colidam com ferramentas internas. Ferramentas de terceiros com confirm:'always' por padrão. Processo stdio com env mínimo (sem chaves de outros serviços) e cwd restrito. Na stdio, credenciais vêm do ambiente (a spec diz que STDIO 'SHOULD NOT' usar o fluxo OAuth). Remotos: OAuth 2.1 + PKCE + Resource Indicators (RFC 8707, OBRIGATÓRIO), validar 'iss' (RFC 9207), preferir Client ID Metadata Documents (DCR está obsoleto), credenciais indexadas pelo issuer, tokens cifrados com safeStorage.
- BANCO DE MEMÓRIA, TESTADO (Node 22.23.4 e Electron 45.2.1 com ELECTRON_RUN_AS_NODE=1, Linux x64): const db = new Database(file); db.pragma("cipher='chacha20'"); db.pragma("key='...'"); require('sqlite-vec').load(db); create virtual table mem_vec using vec0(embedding float[768] distance_metric=cosine, +memory_id integer); create virtual table mem_fts using fts5(texto, assunto, content='memories', content_rowid='id', tokenize='unicode61 remove_diacritics 2'). Vetores passados como Float32Array e rowid como BigInt. Abrir sem a chave dá 'file is not a database'. As tabelas sombra do vec0 e do FTS5 ficam dentro do arquivo cifrado.
- EMPACOTAMENTO ELECTRON: better-sqlite3(-multiple-ciphers) 13.x usa N-API 10 com prototipos/<plataforma>.node dentro do tarball (win32-x64 e win32-arm64), sem prebuild-install nem electron-rebuild. Configurar electron-builder asarUnpack: ['**/*.node','**/node_modules/sqlite-vec-windows-x64/**']. sqlite-vec.getLoadablePath() usa require.resolve e cai dentro de app.asar: aplicar .replace('app.asar','app.asar.unpacked') antes de db.loadExtension(). Não existe sqlite-vec para win32-arm64 no npm.
- ESQUEMA (resumo): conversations(id, started_at, ended_at, canal, resumo, provider, model); messages(id, conversation_id, role, content_json, native_json, interrupted, tokens, created_at); memories(id, kind CHECK in ('fato','preferencia','pessoa','projeto','tarefa','conhecimento','episodio'), texto, assunto, attrs_json, sensibilidade CHECK in ('normal','pessoal','sensivel'), origem ('usuario'|'inferido'|'documento'), source_message_id, confianca, valid_from, valid_to, pinned, access_count, last_accessed_at, created_at, updated_at, deleted_at); embedding_models(id, nome, dims, criado_em) para reindexar quando o modelo mudar; tasks(id, titulo, status, cron, next_run_at, plano_json, ferramentas_permitidas_json, aprovado_em, ultimo_resultado); action_log(id, ts, ator, ferramenta, args_redigidos_json, risco, aprovacao, resultado, prev_hash, hash), só inserção e encadeado por SHA-256 para detectar adulteração.
- TAXONOMIA: curto prazo = janela dos últimos N turnos + resumo corrido (compactação quando passar ~60% do contexto); longo prazo = fatos e preferências (sem decaimento, editáveis), pessoas e projetos (entidades com atributos), episódios e conversas (resumo por sessão, com decaimento), tarefas (tabela tasks), conhecimento (pedaços de documentos e arquivos indexados com caminho e mtime), log de ações (auditoria, nunca injetado inteiro no prompt).
- RECUPERAÇÃO HÍBRIDA: consulta = última fala + resumo curto. FTS5 bm25 top 30 + vec0 KNN top 30, fusão por RRF (k=60), depois peso = RRF × (pinned ? 1,5 : 1) × confiança × decaimento por recência (meia-vida de 30 dias SÓ para episódios), mais um pequeno bônus por access_count. Pegar as 6–10 melhores dentro de ~1500 tokens e injetar num bloco <memoria> tratado como dado. Opcional: rerank com Voyage rerank-2.5 ($0,05/MTok) ou com Haiku. Filtrar valid_to IS NULL (fatos vigentes).
- EXTRAÇÃO AUTOMÁTICA: ao fim da sessão ou a cada ~10 turnos, um modelo barato (Haiku 5.5, gpt-6-luna ou gemma local) com saída estruturada devolve candidatos {kind, texto, assunto, sensibilidade, confiança, substitui_id?}. Deduplicar por similaridade ≥0,90 e decidir ADD/UPDATE/INVALIDATE (valid_to=agora)/NOOP, no estilo Mem0 + Graphiti. Só extrair de falas do USUÁRIO: nunca de web, e-mail ou documento (evita envenenar a memória por injeção).
- FILTRO DE SENSIBILIDADE (LGPD): antes de gravar, aplicar detectores com regex e validação (CPF com dígito verificador, CNPJ, cartão via Luhn, IBAN/PIX, senhas, tokens/chaves 'sk-'/'AIza', códigos 2FA). Esses dados nunca entram na memória: vão para o cofre (safeStorage), se o usuário pedir. Dados sensíveis do art. 5º, II (saúde, religião, política, vida sexual, biometria, origem racial) só são gravados com confirmação explícita, marcados 'sensivel' e excluídos de prompts para provedores na nuvem por padrão. Comandos de voz: 'esquece isso', 'o que você sabe sobre mim'. Tela de memória para ver, editar e apagar.
- CHAVE DE CIFRA: gerar 32 bytes aleatórios (crypto.randomBytes), cifrar com safeStorage.encryptString (DPAPI no Windows, ligado à conta do usuário) e guardar em userData. Protege contra roubo do disco, não contra malware rodando como o usuário. Opção 'senha mestra' com scrypt/Argon2id. Rotação por db.rekey(). Confirmar a sintaxe de chave em hex do SQLite3MC antes de usar chave bruta (não verificado).
- EMBEDDINGS: padrão local = EmbeddingGemma-300m (Ollama 'embeddinggemma' ~622 MB, ou transformers.js 4.3.2 com onnxruntime-node 1.30, que puxa 'sharp' como dependência nativa) em 768 dimensões; dá para reduzir a 256/512 por Matryoshka (conferir no model card). Guardar o modelo e a dimensão em embedding_models e criar um job de reindexação. Quantização binária no vec0 (vec_quantize_binary) mediu 8 ms em 100k: usar como pré-filtro + rerank float acima de ~50k itens.
- HOSPEDAGEM DOS MODELOS: os pesos de EmbeddingGemma, Qwen e bge-m3 (ONNX/GGUF) ficam no Hugging Face (bloqueado no container de build) ou em registry.ollama.ai (não testado daqui). O GitHub Releases é acessível, então dá para baixar no 1º uso no PC do usuário ou espelhar os arquivos num GitHub Release próprio (licenças MIT/Apache sem problema; Gemma exige repassar os termos). Nunca colocar modelos no repositório público do projeto.
- TESTES SEM HARDWARE: FakeProvider determinístico (roteiro de eventos) para o loop, os limites, o cancelamento e o barge-in. Fixtures gravadas das APIs via fetch customizado (todos os SDKs aceitam 'fetch'), sem chamada real no CI. Testes da memória rodam em Node puro (cifra + vec + FTS, como feito aqui). Teste de ABI no Electron com ELECTRON_RUN_AS_NODE=1 node_modules/electron/dist/electron teste.cjs (funcionou aqui; o binário vem do GitHub Releases). Corpus pt-BR de extração de fatos e de prompt injection (e-mails e páginas com instruções escondidas) como teste de regressão.
- AGENDAMENTO: tabela tasks + agendador em utilityProcess (croner ou setTimeout com next_run_at persistido). Cada tarefa guarda um plano aprovado e uma allowlist de ferramentas fixada na criação. Execução sem usuário presente NUNCA usa ferramentas com risco ≥ external_send sem a pré-aprovação daquela ação específica. Resultado vai para notificação e para o log.
- ARMADILHAS DO VERCEL AI SDK (se usado): @ai-sdk/gateway vem por padrão, então use createAnthropic/createOpenAI explícitos. O padrão do stopWhen é isStepCount(1) no generateText/streamText e isStepCount(20) no ToolLoopAgent. Ajustar toolApproval para o nosso fluxo de confirmação.
- ANDROID FUTURO: manter o núcleo (orquestrador, registry, retrieval, extração) em TS puro sem depender do Electron. Acesso ao banco atrás de uma interface (MemoryStore). No Android, um driver SQLite com SQLCipher + sqlite-vec (ex.: op-sqlite, não verificado) ou força bruta em JS. O sqlite-vec não tem prebuild Android no npm (é C puro e compila com o NDK).

## Custo estimado

Só o 'cérebro' (LLM + busca + embeddings), sem STT/TTS. Premissas: 1 h de voz/dia ≈ 120 turnos; cada turno ≈ 10k tokens de entrada (8k em cache), 250 de saída; 50 pesquisas/dia com ~5–15k tokens de resultado cada; 30 dias. (a) Tudo no Opus 5.5: conversa ≈ $0,016/turno → ~$58/mês; pesquisas no Opus ≈ $45–90/mês em tokens + taxa de busca ~$15/mês (web_search ~$10/1000, não verificado) → TOTAL ~$120–160/mês. (b) RECOMENDADO com roteamento: voz no Sonnet 5.5 (~$29/mês) ou Haiku nos turnos simples, Opus só em ~10% dos turnos (~$6/mês), sub-agentes de pesquisa no Haiku 5.5 (~$2–5/mês em tokens + ~$15/mês de taxa), extração de memória no Haiku (~$0,40/mês), embeddings locais ($0) ou text-embedding-3-small (~$0,25/mês) → TOTAL ~$35–55/mês. (c) Econômico: Haiku 5.5 / gpt-6-luna ($0,10/$0,50) para quase tudo + busca → ~$18–22/mês (a taxa de busca domina). Gemini 3.8 Flash como cérebro de voz: ~$11/mês. (d) Local (Ollama ou node-llama-cpp + EmbeddingGemma): $0 em tokens, mas precisa de GPU com ≥12 GB de VRAM para um modelo 12B confiável com ferramentas; busca na web continua paga ou via API de busca separada. Todos os preços de OpenAI e Gemini são de fontes secundárias (o site oficial está bloqueado aqui); os preços de lançamento do Gemini expiram entre 30/11/2026 e 01/01/2027.

## Riscos

- Rotatividade de modelos e preços muito alta (OpenAI: GPT-5.6, 6 e 6.1 em ~3 meses; Gemini: 3 Flash em 6 semanas; preços de lançamento acabando em 30/11/2026 e possivelmente 01/01/2027): IDs e preços fixos no código vão quebrar. Mitigação: registro de modelos como dado + teste de capacidades.
- Os sites oficiais (openai.com, developers.openai.com, ai.google.dev) estão bloqueados no ambiente de pesquisa/build: os preços aqui vêm do LiteLLM e da imprensa, com divergências entre as fontes. Liberar esses domínios na rede da sessão para conferir.
- sqlite-vec é pré-1.0, de um único mantenedor, sem ANN, último estável em 31/03/2026, sem build npm para win32-arm64 nem Android. Mitigação: isolar atrás de MemoryStore, com plano B de força bruta em JS.
- better-sqlite3-multiple-ciphers e SQLite3MultipleCiphers dependem cada um de um único mantenedor: risco de atraso em correções de segurança do SQLite.
- A combinação cifra + sqlite-vec + Electron foi testada só em Linux x64. Windows real, asar unpack e antivírus (vec0.dll carregada em tempo de execução pode gerar alerta do SmartScreen/Defender) ainda precisam de teste. Assinar o instalador.
- MCP de terceiros = código arbitrário com os privilégios do usuário, mais envenenamento de ferramentas, 'rug pull' e sombreamento de nomes. A spec 2026-07-28 tem mudanças grandes e o ecossistema vai misturar versões.
- Envenenamento de memória por prompt injection (conteúdo da web ou de e-mail que vira 'fato'). Mitigação: só extrair de falas do usuário, guardar a proveniência e permitir revisão.
- Ollama com contexto padrão de 4096 corta em silêncio o prompt do sistema e as ferramentas. Modelos locais pequenos erram chamadas de ferramenta. Não existe benchmark pt-BR de tool calling.
- Bugs de replay de thinking blocks, reasoning items e thought signatures ao trocar de provedor ou interromper no meio de um tool_use (erro 400). Mitigação: transcript nativo por provedor + testes de contrato.
- Latência e custo do Opus 5.5 em todo turno de voz; sub-agentes multiplicam tokens (~15x). Um orçamento mensal com alerta é obrigatório.
- A cifra com chave em DPAPI não protege contra malware rodando como o usuário. Embeddings também vazam informação (por isso ficam cifrados).
- Peso de dependências: Claude Agent SDK ~335 MB e LanceDB ~356 MB por plataforma. Mem0 puxa openai v4 e anthropic 0.40 (conflito de versões). Mastra traz posthog-node (telemetria).
- Licença do EmbeddingGemma (Gemma Terms) é diferente da Apache do Gemma 4: conferir antes de redistribuir os pesos.

## Perguntas em aberto

- Qual a GPU e a VRAM do PC do usuário? Isso decide se o LLM local (Gemma 4 12B/26B, Qwen3.5 9B) é viável ou se o local fica só para embeddings.
- Qual o orçamento mensal aceitável? Isso define se o Opus 5.5 continua como padrão em todo turno ou só para tarefas complexas.
- O usuário aceita mandar o texto das memórias e conversas para provedores na nuvem (embeddings e LLM)? Há dados de terceiros (clientes, funcionários) que exigem cuidado de LGPD?
- É preciso suportar Windows ARM (Snapdragon)? O sqlite-vec não tem build npm win32-arm64.
- Qual tecnologia será usada no Android (React Native, Capacitor ou nativo)? Isso define o driver SQLite com cifra e vetor.
- Aceitamos exigir a instalação do Ollama (~4 GB) ou é melhor embutir node-llama-cpp no app?
- Vamos permitir servidores MCP em Python (uvx), o que exige o uv, ou só JS/HTTP?
- Liberar developers.openai.com, openai.com e ai.google.dev na rede da sessão para conferir os preços oficiais e a sintaxe atual (store/encrypted reasoning, thought signatures)?
- Para pesquisa na web: usar só o web_search do Claude ou também uma API de busca independente (para modelos locais e outros provedores)? O preço atual do web_search_20260209 não foi verificado.

## Verificação adversarial

Recomendação se mantém: **sim**

A recomendação central se sustenta: interface interna fina sobre os SDKs oficiais, MCP pelo @modelcontextprotocol/client 2.4.0 e memória DIY num SQLite cifrado (better-sqlite3-multiple-ciphers 13.0.3 + sqlite-vec 0.1.9 + FTS5). As versões, licenças, a negociação de era do MCP v2, os prebuilds Windows no tarball e o comportamento do Ollama foram confirmados no npm e nos fontes do GitHub raw. Ela precisa de cinco correções antes de virar arquitetura.

(1) O adapter do Claude tem que ser append-only. Com o thinking preservado do Opus/Sonnet/Haiku 5.5, editar o histórico dá 400 nas contas novas (a partir de 31/08/2026; não verifiquei a data da conta do usuário). Por isso o barge-in que trunca a resposta, a janela deslizante, o resumo feito no cliente e a memória injetada no system de cada turno precisam ser refeitos: mensagens role:'system' no meio da conversa, compactação ou context editing no servidor, e retomada da fala interrompida pelo turno do usuário.

(2) O roteamento de modelo a cada turno anula o prompt caching (o cache é separado por modelo) e descarta os blocos de thinking. Fixe um modelo de voz por conversa (Sonnet 5.5 com between_tools ou Haiku 5.5 com effort low) e use sub-agentes para o resto.

(3) O Opus 5.5 não deixa desligar o thinking, o que pesa na latência e no custo da voz. A estimativa de ~$58/mês subestima: dá ~$75–118/mês só de conversa no Opus. A leitura de cache do Opus é 0,05x, não 0,1x; as gravações de cache (1,25x/2x) e a tabela >100k do Haiku ficaram de fora.

(4) O contexto padrão do Ollama agora depende da VRAM (4k abaixo de 24 GiB). O Qwen3.8-27B e o Qwen3.6-35B-A3B já existem e devem entrar no teste. O caminho transformers.js para o EmbeddingGemma adiciona ~301 MB de onnxruntime-node; prefira GGUF via node-llama-cpp ou o Ollama.

(5) Vale avaliar o libSQL (cifra + vetor com índice num único módulo nativo) antes de fechar o par multiple-ciphers + sqlite-vec, que depende de dois mantenedores únicos e de um sqlite-vec sem versão estável há 7 meses.

Limites desta verificação: o orçamento de WebSearch acabou e blog.google e docs.cloud.google.com não resolvem nesta sessão. Os preços de OpenAI e Gemini foram confirmados só contra a LiteLLM, que é a mesma fonte secundária do relatório. As datas de fim dos preços de lançamento do Gemini, a licença do Gemma 4, o ranking MTEB-BR e a versão atual do Ollama ficaram como não verificáveis. É preciso liberar esses domínios (ou mandar uma nova mensagem para continuar a busca) e reconferir antes da produção. Arquivos baixados para conferência ficaram em /tmp/claude-0/-home-user-Jb-gestao-/7c040ecf-bb57-5006-80bd-4733edb1eda1/scratchpad/dl.

| Afirmação | Veredito | Correção | Fonte |
|---|---|---|---|
| Versões, licenças e datas dos SDKs centrais: @anthropic-ai/sdk 1.3.0 (Apache-2.0, 2026-10-23), openai 7.47.0 (2026-10-31), @google/genai 2.32.0 (2026-10-29), ollama 0.6.4 (MIT, 2026-09-29), node-llama-cpp 3.22.2 (MIT), ai 7.0.159 (2026-10-30), @langchain/langgraph 1.6.0, @mastra/core 1.81.0, @openai/agents 0.21.0, @anthropic-ai/claude-agent-sdk 0.3.316 | confirmado | Tudo bate com o npm em 02/11/2026. Detalhe: o time.modified de @mastra/core (2026-11-01) é do 1.82.0-alpha.0. O 1.81.0 estável saiu em 2026-10-30T23:22Z. | npm view <pkg> version license time (registry.npmjs.org); https://www.npmjs.com/package/@anthropic-ai/sdk ; https://www.npmjs.com/package/openai ; https://www.npmjs.com/package/@google/genai |
| Recursos dos SDKs: o README do openai 7.47.0 chama a Responses API de 'primary' e a Chat Completions de 'supported indefinitely', e tem toResponseInputItems(). Os tipos aceitam store e include 'reasoning.encrypted_content'. O @google/genai tem Part.thoughtSignature. O @anthropic-ai/sdk 1.3.0 tem helpers/beta/mcp (mcpTools/mcpMessages) e BetaToolRunner | confirmado | Conferi nos tarballs do npm (README e .d.ts). Isso prova que os campos existem nos tipos, não o comportamento do servidor (store:false + encrypted_content não foi testado ao vivo). | npm pack openai@7.47.0 (README.md linhas 29/53/59; resources/responses/responses.d.ts); npm pack @google/genai@2.32.0 (dist/genai.d.ts: thoughtSignature); npm pack @anthropic-ai/sdk@1.3.0 (helpers/beta/mcp.*, lib/tools/BetaToolRunner.*) |
| Preços OpenAI: gpt-6-astra $10/$1/$50, gpt-6-sol $2/$0,20/$10, gpt-6.1-sol $2/$0,10/$10, gpt-6.1-terra $1/$0,05/$5, gpt-6-luna $0,10/$0,01/$0,50, gpt-5.6-luna $0,20/$1,20, gpt-5.4-mini $0,75/$4,50, contexto de 922k | confirmado | Bate exatamente com a tabela LiteLLM, que é a mesma fonte do relatório, com source=developers.openai.com/api/docs/pricing. Não consegui chegar à página oficial: WebSearch esgotado e domínios do Google/OpenAI bloqueados. Fonte secundária, então conferir de novo. A LiteLLM também mostra degraus de preço acima de 272k tokens e cache de 12 h no gpt-6-luna, que o relatório não cita. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json |
| Preços Gemini: 3.8-flash $0,75/$3,75; 4-argon $2/$10; 3.1-pro-preview $2/$12 ($4/$18 acima de 200k); 3.5-flash $1,50/$9; 3.5-flash-lite $0,30/$2,50; 3.1-flash-lite $0,25/$1,50; 3.8-live $0,75/$4,50 com áudio de entrada a $3/MTok; gemini-embedding-001 $0,15 (obsolescência em 14/05/2028) | confirmado | Os números batem com a LiteLLM, que cita ai.google.dev/gemini-api/docs/pricing. Faltou no relatório: no 3.8-live o áudio de SAÍDA custa $12/MTok, o que pesa num cérebro de voz falando. Já 'preço de lançamento do Argon até 30/11/2026' e 'Flash dobra em 01/01/2027' são não verificáveis: blog.google e docs.cloud.google.com não resolvem nesta sessão. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json |
| Claude: leitura de cache ~0,1x da entrada (padrão da Anthropic) | errado | No Opus 5.5 a leitura de cache custa $0,20/MTok, ou seja 0,05x (não 0,1x). No Sonnet 5.5 também é $0,20 (0,1x); a LiteLLM erra ao dizer $0,10. No Haiku 5.5 é 0,1x. As gravações de cache custam 1,25x (TTL de 5 min) ou 2x (TTL de 1 h) e ficaram fora da estimativa. O Haiku 5.5 tem DUAS tabelas: $0,10/$0,50 até 100k tokens de prompt e $0,50/$2,50 acima disso. | skill claude-api (cache 2026-10-06): SKILL.md 'Claude Opus 5.5 ... cache reads $0.20'; shared/prompt-caching.md linha 144; shared/model-migration.md linhas 2087 e 2240; https://platform.claude.com/docs/en/about-claude/pricing |
| web_search do Claude ~$10 por 1000 buscas | confirmado | $10/1000 buscas aparece na skill (custo de tabela) e na LiteLLM (search_context_cost_per_query 0,01). A skill lista web_search_20260209 só para Opus e Sonnet (5.5/5/4.x), sem citar o Haiku 5.5. Sub-agentes de pesquisa no Haiku talvez precisem do web_search_20250305 básico ou do Sonnet (não verificado). | skill claude-api shared/managed-agents-core.md linha 205 e tabela Server Tools; LiteLLM claude-opus-5-5.search_context_cost_per_query |
| tool_choice forçado (any/tool) é rejeitado no Opus 5.5: usar auto | confirmado | Correto, e vale também para o Sonnet 5.5 (400 'tool_choice: type "tool" and "any" are not supported'). Faltou no relatório: no Opus 5.5 o thinking NÃO pode ser desligado (disabled e budget_tokens dão 400 em qualquer effort; o effort padrão é medium). No Sonnet 5.5 o thinking só desliga com {type:'between_tools'}. temperature/top_p/top_k dão 400 em todos os modelos a partir da versão de API 2026-10-21: o adapter não pode repassar sampling. | skill claude-api SKILL.md (Thinking & Effort, Common Pitfalls 'Forced tool use removed') |
| Estimativa: Opus 5.5 em toda a voz ≈ $0,016/turno, ~$58/mês; com roteamento (Sonnet + 10% Opus + Haiku) o total fica em ~$35–55/mês | errado | Faltam três coisas. (1) O thinking do Opus 5.5 é sempre ligado e cobrado como saída a $20/MTok: 300–800 tokens de thinking por turno levam o custo a ~$0,021–0,033/turno, ou ~$75–118/mês só de conversa. (2) As gravações de cache a 1,25x não entraram na conta. (3) O cache do Claude é separado por modelo: trocar Haiku, Sonnet e Opus a cada turno anula os 8k de cache em cada troca, e a premissa de 8k em cache por turno não vale com o roteamento por turno proposto. Recalculado: Sonnet 5.5 com between_tools fica em ~$0,009/turno (~$33/mês); Haiku 5.5 com thinking desligado em ~$0,0005/turno (~$2/mês). A taxa de busca (~$15/mês) continua igual. | skill claude-api shared/prompt-caching.md linhas 97, 144 e 238 ('caches are model-scoped'); SKILL.md tabela de thinking |
| MCP: a especificação atual é a 2026-07-28 (sem initialize nem Mcp-Session-Id, com server/discover, subscriptions/listen, MRTR, resultType, Mcp-Method/Mcp-Name, ttlMs; Roots, Sampling e Logging obsoletos; DCR obsoleto em favor de Client ID Metadata Documents) | confirmado | O docs.json do repositório marca 'Version 2026-07-28 (latest)', e o changelog traz cada item. O ttlMs vem junto com cacheScope, que é obrigatório. | https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/docs.json ; https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/docs/specification/2026-07-28/changelog.mdx |
| @modelcontextprotocol/client 2.4.0 (Apache-2.0) é a linha estável, implementa a 2026-07-28 e negocia com servidores 2025-11-25/06-18/03-26/2024-11-05; o v1 @modelcontextprotocol/sdk 1.32.2 (MIT) vai só até 2025-11-25 e puxa express e hono | confirmado | O README diz 'v2 ... the stable release line'. O @modelcontextprotocol/core 2.4.0 traz SUPPORTED_PROTOCOL_VERSIONS legado (2025-11-25, 06-18, 03-26, 2024-11-05, 2024-10-07) e a lógica de 'era negotiation'. Dependências do v2: cross-spawn, eventsource, jose, pkce-challenge, zod ^4. O v1 tem LATEST_PROTOCOL_VERSION='2025-11-25' e depende de express ^5.2.1, hono ^4.11.4 e @hono/node-server. | npm pack @modelcontextprotocol/client@2.4.0, @modelcontextprotocol/core@2.4.0, @modelcontextprotocol/sdk@1.32.2 (README.md, dist/*.mjs, package.json) |
| better-sqlite3-multiple-ciphers 13.0.3: protótipos N-API dentro do tarball (win32-x64 e win32-arm64), sem electron-rebuild, SQLite 3.53.4, MIT; 13.0.3 em 2026-08-07 e beta 13.0.4 em 2026-09-21 | confirmado | O tarball tem prebuilds/win32-x64.node e win32-arm64.node (além de linux, musl e darwin), 'gypfile': false e nenhum script de install. O README cita SQLite 3.53.4 e SQLite3MultipleCiphers 2.4.0. O binding carrega por require do caminho em prebuilds/, então asarUnpack de **/*.node é necessário. A carga no runtime do Electron não foi testada por mim. Um único mantenedor: o README pede patrocínio. | npm pack better-sqlite3-multiple-ciphers@13.0.3 (prebuilds/, lib/binding.js, README.md); npm view better-sqlite3-multiple-ciphers time |
| sqlite-vec 0.1.9 (MIT OR Apache-2.0): último estável em 31/03/2026, alpha 0.1.10 em 18/05/2026, sem pacote win32-arm64 nem Android no npm | confirmado | 0.1.9 em 2026-03-31; 0.1.10-alpha.4 em 2026-05-18 (são ~7 meses sem estável). Os optionalDependencies cobrem só linux-x64/arm64, darwin-x64/arm64 e windows-x64 (sqlite-vec-windows-x64 tem ~290 KB). O npm grava a licença como 'MIT OR Apache'. | npm view sqlite-vec time optionalDependencies license; https://www.npmjs.com/package/sqlite-vec |
| Ollama: contexto PADRÃO de 4096 tokens que corta o prompt em silêncio; o /v1 não aceita tool_choice nem num_ctx; imagem só em base64; /v1/responses sem estado desde a v0.13.3; Windows 10 22H2+, NVIDIA 551.61+, ROCm v7/Vulkan, sem admin, ~4 GB | desatualizado | O padrão agora depende da VRAM (docs/context-length.mdx): menos de 24 GiB dá 4k, de 24 a 48 GiB dá 32k e 48 GiB ou mais dá 256k (o FAQ ainda diz 4096). Para GPUs de consumo o 4k continua valendo, mas não é universal. Todo o resto foi confirmado: tool_choice e Image URL estão desmarcados, o /v1/responses é 'Added in v0.13.3' e só sem estado, a OpenAI API 'does not have a way of setting the context size' (exige Modelfile), e os requisitos do Windows batem. A versão '0.40.x / RC 0.40.12' não é verificável: as páginas de releases do github.com dão 403 aqui. | https://raw.githubusercontent.com/ollama/ollama/main/docs/context-length.mdx ; https://raw.githubusercontent.com/ollama/ollama/main/docs/faq.mdx ; https://raw.githubusercontent.com/ollama/ollama/main/docs/api/openai-compatibility.mdx ; https://raw.githubusercontent.com/ollama/ollama/main/docs/windows.mdx ; https://raw.githubusercontent.com/ollama/ollama/main/docs/api.md |
| Mem0 (mem0ai 3.3.1): 'peers antigos: openai ^4.93 e @anthropic-ai/sdk ^0.40.1; better-sqlite3 ^12' | errado | O openai ^4.93.0 é dependência DIRETA (sempre instalada), não peer, então o conflito com o openai 7 é garantido. Como peers ficam @anthropic-ai/sdk ^0.40.1, better-sqlite3 ^12.6.2, ollama ^0.5.14, @google/genai ^1.40.0 e mais de 30 outros. A conclusão (não adotar) fica mais forte. Data: 3.3.1 em 2026-09-25 (confirmado). | npm view mem0ai dependencies peerDependencies time |
| Peso das dependências: o Claude Agent SDK win32-x64 tem ~335 MB e o LanceDB win32-x64 ~356 MB descompactados; Orama 3.1.18 parado desde 19/12/2025; @letta-ai/letta-client 1.12.1 em 02/06/2026; não existe npm 'langmem'; o checkpoint SQLite do LangGraph depende de better-sqlite3 ^12; o Mastra puxa posthog-node, hono, execa e ws; o ai depende de @ai-sdk/gateway; @openai/agents-core tem @modelcontextprotocol/client ^2 como opcional | confirmado | Sizes: 335.469.792 B e 355.807.711 B. langgraph-checkpoint-sqlite 1.1.0 depende de better-sqlite3 ^12.10.0. Ficou de fora do relatório: o caminho transformers.js 4.3.2 puxa onnxruntime-node 1.30.0, com ~301 MB descompactados (binários de todas as plataformas, mais um postinstall), e sharp ^0.35.4. No node-llama-cpp, os pacotes Windows têm cpu ~33 MB, vulkan ~74 MB, cuda ~183 MB e cuda-ext ~388 MB. | npm view <pkg> dist.unpackedSize / dependencies / time; https://www.npmjs.com/package/onnxruntime-node ; https://www.npmjs.com/package/@node-llama-cpp/win-x64-cuda |
| LLMs locais recomendados: Gemma 4 (Apache-2.0; E4B/12B/26B-A4B/31B) e Qwen3.5 9B / Qwen3.6 27B | desatualizado | Os tamanhos do Gemma 4 aparecem na LiteLLM (e2b, e4b, 12b, 26b-a4b, 31b). A licença Apache-2.0 não é verificável aqui (HF e blog.google bloqueados). A LiteLLM já lista Qwen3.8-27B (Groq $0,80/$4, Cerebras $0,99/$1,49, AIand), Qwen3.8-flash e Qwen3.6-35B-A3B (MoE com ~3B ativos, mais rápido em GPU de consumo). Se os pesos do Qwen3.8-27B forem abertos (não verificado), ele substitui o Qwen3.6 27B como candidato. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json (chaves groq/qwen/qwen3.8-27b, cerebras/qwen-3.8-27b, deepinfra/Qwen/Qwen3.6-35B-A3B, bedrock_mantle/google.gemma-4-*) |
| EmbeddingGemma-300m é o 13º de 93 no MTEB-BR (0,6490); gemini-embedding-001 é o 1º (~68,2); licença Gemma Terms; sub-agentes custam ~15x mais tokens (Anthropic) | não verificável | huggingface.co, arxiv.org e blog.google não puderam ser consultados: o orçamento de WebSearch acabou e os hosts estão bloqueados. Sobre os 15x, de memória (não reconferido): o post da Anthropic compara com CHAT ('agents ~4x, multi-agent ~15x more tokens than chats'). Comparado a um agente único, o fator fica perto de 3–4x. | tentativas bloqueadas; o preço de $0,15/MTok do gemini-embedding-001 foi confirmado só pela LiteLLM |

**Alternativas que a pesquisa inicial não considerou:**

- Thinking preservado no Claude (Opus 5.5, Sonnet 5.5 e Haiku 5.5): contas criadas a partir de 31/08/2026 recebem 400 quando o histórico é EDITADO. A arquitetura do relatório bate de frente com isso em quatro pontos: no barge-in (gravar 'só o texto falado' trunca o turno do assistente), na 'janela dos últimos N turnos', no resumo corrido feito no cliente e na injeção de <memoria> no system de cada requisição. A saída é um histórico append-only: system fixo, mensagens role:'system' no meio da conversa para memória e lembretes, compactação no servidor (beta compact-2026-01-12) ou context editing (clear_tool_uses_20250919 / clear_thinking_20251015), e retomada pelo turno do usuário ('Sua resposta anterior foi interrompida e terminou em ...').
- Recursos nativos da API do Claude que o relatório não usa: o MCP connector (mcp_servers + tools mcp_toolset, beta mcp-client-2025-11-20) para servidores MCP remotos rodando no servidor da Anthropic; o memory tool memory_20250818 (o backend fica no cliente e pode ser o próprio SQLite cifrado); thinking.display:'updates' (beta thinking-display-updates-2026-08-18) para falar o progresso entre ferramentas; o parâmetro fallbacks:'default' (beta server-side-fallback-2026-07-01) para recusas dos classificadores (bio/cyber/reasoning_extraction); cache com TTL de 1 h para as pausas da voz; fast mode do Opus 5.5 ($8/$40) quando a latência importar; e effort por mensagem (beta mid-conversation-output-config-2026-07-01) sem perder o cache.
- Para a voz, usar Sonnet 5.5 com thinking {type:'between_tools'} ou Haiku 5.5 com effort low e thinking desligado, num modelo FIXO por conversa (o cache é separado por modelo), em vez de rotear o modelo a cada turno. Tarefas mais baratas ou mais caras vão para sub-agentes.
- libSQL (@libsql/client 0.18.0 / libsql 0.5.29, MIT, prebuild win32-x64): cifra em repouso e busca vetorial nativa com índice num único módulo nativo. É alternativa ao par multiple-ciphers + sqlite-vec, com o risco de a Turso agora priorizar a reescrita em Rust (@tursodatabase/database 0.8.3, com cifra e FTS ainda experimentais e ANN só no roadmap).
- usearch 2.26.5 (Apache-2.0, HNSW, Windows/Android) ou @electric-sql/pglite 0.5.14 + pgvector como plano B de ANN, mais leves que o LanceDB (~356 MB).
- Foundry Local (foundry-local-sdk 2.3.0, MIT, Microsoft): runtime local compatível com OpenAI e ONNX Runtime com NPU/GPU no Windows 11. Também LM Studio (@lmstudio/sdk 2.1.0). São alternativas ao Ollama.
- Modelos abertos hospedados com latência baixíssima para o turno de voz: Groq (gpt-oss-20b $0,075/$0,30; qwen3.8-27b $0,80/$4) e Cerebras (gemma-4-31b $0,99/$1,49), pelo adapter OpenAI-compatível (preços da LiteLLM, não verificados na fonte oficial).
- OpenRouter (@openrouter/ai-sdk-provider 3.1.0) como gateway único para os provedores de cauda longa, em vez de vários adapters.
- Modelos de fala nativos (speech-to-speech) como caminho alternativo do cérebro de voz: gemini-3.8-live (áudio de entrada $3/MTok, saída $12/MTok, segundo a LiteLLM) e a realtime da OpenAI (@openai/agents-realtime). O relatório cita o preço, mas não avalia a arquitetura.
- Embeddings sem onnxruntime-node (~301 MB): GGUF de embedding no node-llama-cpp (já previsto como fallback de LLM) ou /api/embed do Ollama, o que evita o peso do transformers.js mais sharp no instalador.
- Provedor especializado em pt-BR (Maritaca AI / Sabiá, API compatível com OpenAI): não está na LiteLLM; preço e status não verificados.
