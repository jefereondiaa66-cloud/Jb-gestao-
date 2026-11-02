# Conversa por voz em tempo real (STT, TTS, VAD, detecção de fim de turno, barge-in, speech-to-speech) para o assistente "300" em Electron/Windows, pt-BR

> Pesquisa feita em 02/11/2026 por agentes com busca na web, conferida por um verificador adversarial independente. Itens marcados como 'não verificado' não puderam ser confirmados na fonte oficial (alguns sites estavam fora da rede do ambiente de pesquisa).

## Resumo

Recomendação: um pipeline em cascata próprio, em TypeScript e sem Python (STT em streaming -> cérebro trocável, Claude por padrão -> TTS por frases). Ele mantém o provedor trocável e custa cerca de US$0,7 a 1,7 por hora de conversa. Ao lado dele, um "modo baixa latência" opcional com OpenAI Realtime (gpt-realtime-2.1-mini ou 2.1) via WebRTC no renderer, com chave efêmera. Esse modo responde em cerca de 0,8 a 1,5 s em vez de 1,2 a 2,5 s, mas custa cerca de US$1,3 a 3+/h e prende o cérebro à OpenAI.

O que foi verificado e quanto custa:
- Nomes de modelos: conferidos nos tipos do SDK openai 7.47.0 (gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-whisper, gpt-live-transcribe, gpt-transcribe, gpt-4o-mini-tts-2025-12-15). O SDK também confirma semantic_vad (eagerness), interrupt_response, output_audio_buffer.clear, conversation.item.truncate, truncation por retention_ratio e ferramentas MCP.
- Preços de áudio da OpenAI: gpt-realtime-2.1 a US$32 (entrada) / US$64 (saída) por milhão de tokens, com cache a US$0,40. O mini sai a US$10 / US$20, com cache a US$0,30. Isso dá cerca de US$0,019/min para a fala do usuário e US$0,077/min para a fala do assistente, mais o contexto que é cobrado de novo a cada turno.
- Preços do Google, conferidos direto em cloud.google.com: Chirp 3 HD a US$30 por milhão de caracteres (1M grátis por mês); STT V2 a US$0,016/min.

Opções locais (nenhuma precisa de Python):
- sherpa-onnx-node 2.0.1 (26/10/2026, Apache-2.0, binário pronto win-x64) roda Nemotron-3.5-ASR-streaming-0.6B. É reconhecimento em streaming de verdade, cobre pt-BR, tem licença OpenMDW e o modelo fica em GitHub releases. Também roda Whisper, Parakeet v3, Cohere Transcribe e Qwen3-ASR, que não são streaming e precisam do VAD para cortar as falas.
- Atenção: o sherpa-onnx 2.0.0 REMOVEU o espeak-ng. Para usar as vozes Piper pt_BR (faber, cadu, jeff, edresson, miro, dii) é preciso o piper-phonemize-node 1.5.9, que é GPL-3.0 e addon nativo. A outra saída é o Supertonic 3 (31 idiomas, inclui pt, sem fonetizador, pesos OpenRAIL-M).
- Moonshine e SenseVoice não suportam português. O vosk-browser está parado desde 2022 e os modelos dele ficam em alphacephei, que está bloqueado no ambiente de build. Vale tirar os dois da pilha.

VAD e fim de turno:
- @ricky0123/vad-web 0.0.31 (12/09/2026, ISC) já traz silero_vad_v5 e v6 dentro do pacote npm e funciona no renderer.
- O detector de fim de turno Smart Turn v3.2 (cobre pt, cerca de 12 a 50 ms em CPU, 8,7 MB) está versionado no repositório do Pipecat no GitHub, então dá para baixar mesmo com o Hugging Face bloqueado.

Eco e interrupção: o cancelamento de eco do Chromium só cancela com garantia o áudio que chega por RTCPeerConnection, ou o que o próprio Chromium toca quando o recurso Chrome-wide AEC está ligado. No Electron isso não está garantido: ver a issue electron#47043, e o padrão desse recurso no Electron 45 não foi verificado. Por isso o modo cascata precisa de teste e de proteções em software. Os padrões de interrupção do Pipecat 1.15.0 e do LiveKit Agents (mínimo de duração e de palavras, retomar após interrupção falsa, geração antecipada, aec_warmup) servem de modelo.

Limitação desta pesquisa: platform.openai.com, developers.openai.com, deepgram.com, elevenlabs.io, cartesia.ai, learn.microsoft.com, azure.microsoft.com e prices.azure.com estavam fora da rede desta sessão. Os preços desses fornecedores vieram de buscas (em parte fontes terceiras) e estão marcados quando não foram conferidos na fonte oficial. Para conferir direto, esses domínios precisam ser liberados nas configurações de rede da sessão.

## Recomendação

Pipeline em cascata próprio, em TypeScript, com provedores plugáveis, e um modo baixa latência opcional.

Cascata (padrão):
- Renderer: getUserMedia com {echoCancellation, noiseSuppression, autoGainControl} -> AudioWorklet -> @ricky0123/vad-web 0.0.31 (Silero v6) -> quadros PCM16 de 16 kHz e 20 ms via MessagePort para um utilityProcess.
- STT em streaming plugável. Nuvem padrão: Deepgram Nova-3 multi ou Flux Multilingual (eventos EagerEndOfTurn), ou Soniox stt-rt-v5. Local: sherpa-onnx-node 2.0.1 com Nemotron-3.5-ASR-streaming-0.6B int8 em pt-BR.
- Fim de turno: Smart Turn v3.2 ONNX + silêncio mínimo de 200–300 ms, ou o EOT do Flux.
- Cérebro trocável por uma interface própria (ou AI SDK `ai` 7 + @ai-sdk/anthropic), com Claude por padrão: streaming, prompt caching, AbortSignal. Para voz, recomenda-se Sonnet 5.5 ou Haiku 5.5 no turno e escalar para Opus 5.5 por roteamento ou ferramenta.
- Chunker de frases pt-BR (primeiro trecho de ~40–80 caracteres na primeira vírgula ou ponto).
- TTS plugável. Nuvem: ElevenLabs Flash v2.5 por WebSocket, ou Azure pt-BR Francisca/Thalita como opção barata. Local: Piper pt_BR faber/cadu via sherpa-onnx + piper-phonemize-node, ou Supertonic 3.
- Reprodução no renderer com máquina de estados de interrupção: abaixar volume -> parar -> abortar o LLM e o TTS -> truncar o histórico.

Modo baixa latência (opcional): OpenAI Realtime gpt-realtime-2.1-mini (ou 2.1) por WebRTC no renderer, com chave efêmera criada no main via /v1/realtime/client_secrets e TTL curto. Ferramentas da sessão roteadas ao MESMO executor de ferramentas, com o mesmo controle de permissões. Uma ferramenta 'delegar_ao_cerebro' passa tarefas complexas para Claude e fala um 'só um instante' enquanto espera.

**Alternativas:**

- STT nuvem: Soniox (US$0,12/h), AssemblyAI Universal-Streaming Multilingual (US$0,15/h por conexão), ElevenLabs Scribe v2 Realtime (US$0,39/h), Google STT V2 (US$0,016/min), Azure (~US$1/h, região Brasil).
- STT local de alta precisão por comando: Whisper (small/turbo) via sherpa-onnx ou whisper.cpp v1.9.5 com Vulkan, segmentado pelo VAD; Cohere Transcribe 2B ou Qwen3-ASR 0.6B via sherpa. Evitar Moonshine e SenseVoice (sem pt) e vosk-browser (parado, modelos em alphacephei).
- TTS nuvem: Azure Neural pt-BR (~US$15–16 por milhão de caracteres), Google Chirp 3 HD (US$30 por milhão, verificado), OpenAI gpt-4o-mini-tts (~US$0,015/min), Cartesia Sonic 3.6, ElevenLabs Eleven v4 Turbo (exige Text-to-Dialogue WS).
- TTS local: Supertonic 3 (sem GPL, pt a validar), Piper pt_BR, Kokoro (pt fraco), SAPI via speechSynthesis (último recurso, robótico).
- Speech-to-speech alternativo: Gemini Live (gemini-3.1-flash-live-preview), barato por token mas recobra o contexto inteiro a cada turno; exige compressão de contexto.
- Modo totalmente offline: Silero + Nemotron (ou Whisper) + Piper/Supertonic, com o cérebro em nuvem ou degradado.

**Justificativa:** 1) Trocabilidade: na cascata o LLM é só um passo de texto em streaming, então Claude, OpenAI, Gemini ou um modelo local entram pela mesma interface. Memória, ferramentas, defesas contra prompt injection e trilha de auditoria ficam no núcleo do app, e não no servidor de um fornecedor de speech-to-speech.

2) Custo: cascata com Sonnet + Deepgram/Soniox + Azure/ElevenLabs sai ~US$1,0–1,7/h, contra ~US$2–4/h no gpt-realtime-2.1. Com STT e TTS locais, ~US$0,7/h (Sonnet) ou centavos (Haiku).

3) pt-BR: as melhores vozes brasileiras verificáveis são ElevenLabs e Azure (Francisca, Thalita). O sotaque pt-BR das vozes Realtime não foi verificado, e a OpenAI diz que são 'otimizadas para inglês'.

4) Sem Python e com futuro no Android: sherpa-onnx (Apache-2.0, binários prontos para Windows e Android, modelos no GitHub), vad-web (modelos no npm) e Smart Turn (no GitHub do Pipecat) passam pelo bloqueio do Hugging Face no build.

5) O modo Realtime continua valioso: latência percebida de ~0,8–1,5 s contra ~1,2–2,5 s na cascata com Claude, e cancelamento de eco nativo por ser faixa WebRTC remota. Por isso fica como modo opcional, com o mesmo executor de ferramentas e permissões.

6) Latência da cascata é o ponto fraco. Mitigações tiradas de Pipecat e LiveKit: geração especulativa no EagerEndOfTurn (descartada no TurnResumed); conexões pré-aquecidas (TLS/HTTP2 com a Anthropic e WebSocket de TTS já aberto); primeiro trecho de TTS curto; som curto de confirmação local em ~300 ms; modelo rápido para o turno de conversa.

## Opções comparadas

| Opção | Tipo | Licença | Custo | Latência | pt-BR | Windows | Manutenção |
|---|---|---|---|---|---|---|---|
| OpenAI Realtime API: gpt-realtime-2.1 / gpt-realtime-2.1-mini (speech-to-speech) | cloud API (WebRTC / WebSocket / SIP) | Proprietária (termos da API OpenAI) | gpt-realtime-2.1: áudio de entrada US$32, cache US$0,40, saída US$64 por milhão de tokens; texto US$4 / US$24. Mini: áudio US$10, cache US$0,30, saída US$20; texto US$0,60 / US$2,40. Com cerca de 600 tokens/min de fala do usuário e 1.200 tokens/min de fala do assistente: ~US$0,019/min de entrada e ~US$0,077/min de saída no 2.1. O contexto é cobrado de novo a cada turno, a preço de cache. Estimativa: ~US$2–4 por hora de conversa no 2.1 e ~US$1,1–1,5/h no mini. | Medições de terceiros até o primeiro áudio: 1,12 s com raciocínio minimal e 2,33 s com high (gpt-realtime-2). Outros relatos falam em 300–500 ms em regime estável. Some a espera do VAD (server_vad: silence_duration_ms; semantic_vad com eagerness low/medium/high/auto) e ~120–180 ms de ida e volta Brasil–EUA. Percebido estimado: ~0,8–1,5 s (não verificado para pt-BR). | Fala multilíngue, mas a OpenAI diz que as vozes são 'otimizadas para inglês'. O sotaque brasileiro de marin e cedar não foi verificado: testar com instruções do tipo 'português do Brasil, sotaque paulistano'. | Excelente no Electron: o renderer usa RTCPeerConnection nativo do Chromium. Chave efêmera via POST https://api.openai.com/v1/realtime/client_secrets (feito no main, com a chave padrão) e SDP via POST https://api.openai.com/v1/realtime/calls (Content-Type application/sdp, Bearer ek_...). O áudio do modelo chega como faixa WebRTC remota, então o cancelamento de eco do Chromium funciona. Pacotes: openai 7.47.0 ou @openai/agents-realtime 0.21.0 (MIT, 20/10/2026). | gpt-realtime-2 lançado em maio/2026; 2.1 e 2.1-mini em 06/07/2026. SDK openai 7.47.0 ativo. |
| Google Gemini Live API (gemini-3.1-flash-live-preview; 'Gemini 3.8 Live' citado por terceiros) | cloud API (WebSocket, speech-to-speech) | Proprietária | Áudio: US$3 de entrada e US$12 de saída por milhão de tokens (~US$0,005/min e ~US$0,018/min), segundo terceiro lendo a página do Google em 20/10/2026. O Google cobra o contexto INTEIRO a cada turno (~25 tokens/s de áudio). Sem compressão de contexto o custo cresce com o número de turnos: estimativa de ~US$3–11/h (não verificado). | Não verificado; esperado semelhante ao OpenAI Realtime (~0,8–1,5 s). | Áudio nativo multilíngue; vozes em pt-BR não verificadas. | WebSocket a partir do renderer com token efêmero (Live API, v1beta) ou a partir do main. Pacote @google/genai 2.32.0 (Apache-2.0, 29/10/2026). | Ativo (SDK publicado em 29/10/2026). |
| Deepgram Nova-3 (multilíngue / pt) e Flux Multilingual (flux-general-multi) | cloud API STT em streaming (WebSocket) | Proprietária; SDK @deepgram/sdk 5.17.0 MIT | Nova-3 monolíngue em streaming: US$0,0077/min (promoção de US$0,0048/min sem data de fim). Nova-3 multilíngue: US$0,0092/min (promoção de US$0,0058). Flux Multilingual: ~US$0,0078/min. US$200 de crédito inicial. Cobrança pela duração do stream: abrir só depois da palavra de ativação ou do VAD. | Transcrições parciais em ~100–300 ms; final após endpointing configurável (ex.: endpointing=300 ms). O Flux tem eventos EndOfTurn, EagerEndOfTurn e TurnResumed (eager_eot_threshold de 0,3 a 0,9) para geração especulativa. | Português incluído no Nova-3 multilíngue e no Flux Multilingual (10 idiomas). WER específico de pt-BR não verificado. | WebSocket a partir do utilityProcess/main (a chave não vai para o renderer). Autenticação Authorization: Token <key>. Endpoint wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&interim_results=true. Flux em /v2/listen (parâmetros exatos não verificados). | SDK 5.17.0 publicado em 28/10/2026; Flux Multilingual anunciado em ~abril/2026 (não verificado). |
| Soniox stt-rt-v5 | cloud API STT em streaming (WebSocket) | Proprietária; @soniox/node 2.4.0 MIT | Tempo real: US$0,12/h; assíncrono: US$0,10/h (página de preços da Soniox). | Palavras emitidas enquanto o usuário fala; números em ms não publicados (não verificado). | A Soniox afirma WER de 1,25% em português no próprio benchmark de 2026 (OpenAI 3,24%, Google 2,84%). É alegação do fornecedor. | WebSocket a partir do Node; pacote @soniox/node 2.4.0 (12/10/2026). | v5 Real-Time recente; SDK ativo. |
| ElevenLabs Scribe v2 Realtime (scribe_v2_realtime) | cloud API STT em streaming (WebSocket) | Proprietária; @elevenlabs/elevenlabs-js 2.75.0 MIT | US$0,39/h no PAYG (página pricing/api); US$0,28/h em planos Business anuais. Keyterms +US$0,05/h. | ~150 ms anunciados (o site também cita <100 ms). | Português entre 90+ idiomas; 93,5% de precisão em 30 idiomas (fornecedor). | WebSocket/REST a partir do Node. | Lançado em nov/2025; SDK 2.75.0 publicado em 28/10/2026. |
| AssemblyAI Universal-Streaming Multilingual / Universal-3.x Pro Realtime | cloud API STT em streaming (WebSocket) | Proprietária; assemblyai 4.42.0 MIT | Universal-Streaming Multilingual: US$0,15/h, cobrado por TEMPO DE CONEXÃO. Universal-3.5/3.6 Pro Realtime: US$0,45/h (a 3.6 com 32 idiomas não foi verificada). | Não verificado (baixa, voltado a agentes). | Português listado no Multilingual em fontes de 2026 (uma referência antiga não listava pt). | SDK Node assemblyai 4.42.0 (26/10/2026). | Ativo (Universal-3.6 Pro Realtime em 25/10/2026, segundo terceiro). |
| OpenAI STT: gpt-realtime-whisper, gpt-live-transcribe, gpt-transcribe, gpt-4o(-mini)-transcribe, whisper-1 | cloud API STT (streaming via Realtime transcription session / lote via /v1/audio/transcriptions) | Proprietária | gpt-realtime-whisper: US$0,017/min (US$1,02/h). gpt-transcribe (lote): US$0,0045/min. gpt-4o-transcribe: US$0,006/min. gpt-4o-mini-transcribe: US$0,003/min. whisper-1: US$0,006/min. Preço do gpt-live-transcribe não verificado. | gpt-realtime-whisper tem parâmetro delay (minimal/low/medium/high/xhigh), que troca latência por precisão; valores em ms não publicados. | pt suportado (código ISO); WER de pt-BR não verificado. | Mesmo SDK openai 7.47.0; sessão de transcrição Realtime via WebSocket. | gpt-transcribe e gpt-live-transcribe lançados por volta de 28–29/07/2026. A família gpt-4o-transcribe deixou de ser recomendada (há relato de descontinuação em 26/08/2026, não verificado). |
| Google Cloud STT V2 (Chirp) e Azure Speech STT em tempo real | cloud API STT | Proprietária; @google-cloud/speech 8.2.1 Apache-2.0; microsoft-cognitiveservices-speech-sdk 1.53.0 MIT | Google V2 padrão: US$0,016/min nos primeiros 500 mil minutos; dynamic batch US$0,003/min; arredondamento por segundo (VERIFICADO em cloud.google.com/speech-to-text/pricing). Azure tempo real: ~US$1/h (fonte terceira, não verificado no site oficial). | Não verificado; Azure tem região brazilsouth, o que reduz a ida e volta. | Ambos suportam pt-BR há anos; qualidade boa (não medida aqui). | SDKs Node oficiais (gRPC no Google; o SDK do Azure funciona em Node e no browser). | SDKs publicados em out/2026. |
| Mistral Voxtral Realtime (Voxtral Transcribe 2) | cloud API STT em streaming + pesos abertos | Pesos Apache 2.0; API proprietária | API: US$0,006/min (anúncio de fev/2026). | Atraso configurável abaixo de 200 ms; a 480 ms fica a 1–2% de WER do modo offline (Mistral). | PT entre os 13 idiomas (fonte terceira). | API via @mistralai/mistralai 3.5.0. Os pesos abertos precisam de GPU e runtime Python/vLLM: não serve para Node puro. | Lançado em fev/2026; SDK publicado em 01/11/2026. |
| sherpa-onnx-node 2.0.1 + Nemotron-3.5-ASR-streaming-0.6B int8 (STT local em streaming) | local (addon nativo N-API + ONNX Runtime) | sherpa-onnx Apache-2.0; modelo NVIDIA OpenMDW-1.1 (uso comercial permitido) | US$0 (só CPU) | Chunk configurável de 80, 160, 320, 560 ou 1120 ms (a release npm de exemplo usa 1120 ms; existe export de 560 ms). Latência real em CPU Windows não verificada: medir. Modelo de 600M parâmetros em int8, tamanho em disco não verificado. | pt-BR e pt-PT entre ~40 combinações idioma/local; idioma fixado por stream (stream.setOption('language','pt-BR')) ou detecção automática. Existe fine-tune comunitário em pt-BR (Ottema). WER não verificado. | Binário pronto sherpa-onnx-win-x64 2.0.1 (~23 MB, também win-arm64 e ia32). No Electron: asarUnpack, rodar em utilityProcess e usar enableExternalBuffer:false (nota oficial para Electron). O modelo baixa de github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11.tar.bz2 (GitHub: acessível no build). | sherpa-onnx 2.0.1 em 26/10/2026; commit de 29/10/2026; muito ativo. Tem Android, Kotlin, Flutter e WASM, bom para o futuro Android. |
| sherpa-onnx (offline + VAD): Whisper (tiny…turbo), Parakeet-TDT-0.6B-v3, Cohere Transcribe 2B, Qwen3-ASR-0.6B, Omnilingual-ASR 300M | local (STT não streaming, segmentado por VAD) | Whisper MIT; Parakeet v3 CC-BY-4.0 (o build.nvidia.com cita NVIDIA Open Model License: conflito); Cohere Transcribe Apache-2.0; Qwen3-ASR Apache-2.0 (fonte terceira); Omnilingual (Meta) não verificado | US$0 | Latência ≈ duração da fala × RTF + carga do modelo. Whisper turbo em CPU é lento (não verificado); Parakeet e Qwen3 0.6B são rápidos em CPU (não verificado). | Whisper: pt muito bom. Parakeet v3: 25 idiomas europeus, treino com pt EUROPEU (o model card admite). Cohere Transcribe: pt entre 14 idiomas, ganha do Parakeet v3 em pt e perde do Whisper large-v3 em pt. Qwen3-ASR: pt suportado. Moonshine (v2, só inglês) e SenseVoice (zh/en/ja/ko/yue) NÃO servem. | Mesmo addon sherpa-onnx-node; modelos em GitHub releases (ex.: sherpa-onnx-cohere-transcribe-14-lang-int8-2026-04-01, sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25, sherpa-onnx-omnilingual-asr-1600-languages-300M-ctc-int8-2025-11-12, silero_vad.onnx). | Ativo (correções de alucinação em silêncio para Qwen3, Cohere e Moonshine em 1.13.8). |
| whisper.cpp v1.9.5 (Vulkan/CUDA) via bindings Node | local (C++; bindings npm) | MIT | US$0 | Com GPU (Vulkan/CUDA) large-v3-turbo fica perto do tempo real; em CPU, lento. RTF não verificado. | Whisper: muito bom em pt. | Binários Windows oficiais e de terceiros (Vulkan). Bindings: nodejs-whisper 0.4.1 (26/10/2026, MIT, chama o binário), @fugood/whisper.node 1.2.0-rc.1 (07/10/2026), whisper-cpp-node 0.2.12; smart-whisper parado desde 2024. Modelos ggml ficam no Hugging Face (bloqueado no build): usar o ONNX do sherpa no GitHub ou espelhar. | Tag v1.9.5 de 06/10/2026. |
| transformers.js 4.3.2 (Whisper WebGPU no renderer) | local (ONNX Runtime Web, WebGPU/WASM) | Apache-2.0 (biblioteca); modelos conforme cada card | US$0 | Depende da GPU; o guia recomenda tiny/base para conversa; turbo pesado (não verificado). | Whisper multilíngue (pt bom nos modelos small em diante). | Roda no renderer do Electron com WebGPU. Modelos onnx-community ficam no Hugging Face (bloqueado no build): precisa de espelho. Há relatos de saída corrompida em WebGPU em algumas GPUs. | 4.3.2 publicado em 30/10/2026. |
| ElevenLabs TTS: Flash v2.5 (eleven_flash_v2_5), Eleven v4 Turbo (eleven_v4_turbo), v4 / v3 / Multilingual v2 | cloud API TTS (WebSocket stream-input / Text-to-Dialogue WS / HTTP stream) | Proprietária; @elevenlabs/elevenlabs-js 2.75.0 MIT | pricing/api: Flash, Turbo e v4 Turbo a US$0,04 por mil caracteres; v4, v3 e Multilingual a US$0,08 por mil. Outras páginas mostram US$0,05 e US$0,10 (preço mudou em mai/2026 e set/2026). Uma hora com 20 min de fala (~18 mil caracteres): ~US$0,72. | Flash v2.5: ~75 ms de inferência (125–225 ms com rede). v4 Turbo: ~100 ms de inferência e ~150 ms até a primeira fala sem rede; medição de terceiro: ~90–138 ms. | Flash v2.5 com 32 idiomas, incluindo pt; v4 com 90+ idiomas. Vozes brasileiras na Voice Library (lista específica não verificada). | WebSocket wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5&output_format=pcm_16000. ATENÇÃO: v3 e v4 (inclusive v4 Turbo) NÃO funcionam nesse endpoint; usam o Text-to-Dialogue WebSocket. | v4 e v4 Turbo lançados em 28/09/2026; SDK publicado em 28/10/2026. |
| OpenAI gpt-4o-mini-tts (gpt-4o-mini-tts-2025-12-15) | cloud API TTS (HTTP streaming) | Proprietária | US$0,60 por milhão de tokens de texto + US$12 por milhão de tokens de áudio de saída (~US$0,015/min, estimativa). Limite de 2.000 tokens por requisição. Fontes terceiras. | Primeiro byte ~300–600 ms (não verificado). | Fala pt, mas as vozes são 'otimizadas para inglês'; dá para pedir sotaque por instruções. Vozes (SDK): alloy, ash, ballad, coral, echo, sage, shimmer, verse, marin, cedar, fable, onyx, nova. | SDK openai 7.47.0; saída pcm/mp3/opus em streaming HTTP. | Snapshot de 15/12/2025; sem sucessor confirmado. |
| Cartesia Sonic 3 / Sonic 3.6 | cloud API TTS (WebSocket) | Proprietária; @cartesia/cartesia-js 4.2.0 Apache-2.0 | 1 crédito por caractere. Pro US$5/100 mil; Startup US$49/1,25 milhão (~US$0,039 por mil caracteres); Scale US$299/8 milhões, excedente US$38 por milhão. Estimativa de terceiro: ~US$0,031/min no Scale. | Primeiro áudio ~90 ms (Sonic 3); 40 ms para Turbo não verificado; outra fonte cita ~190 ms de mediana. | pt na lista oficial do Sonic 3 (42 idiomas; 3.6 com 44). Vozes 'brasileiras' (Luana, Ana Paula) só em diretório de terceiros. | SDK Node 4.2.0 (02/09/2026). | Sonic 3.6 é o modelo atual recomendado. |
| Azure Neural TTS pt-BR (pt-BR-FranciscaNeural, pt-BR-AntonioNeural, pt-BR-ThalitaMultilingualNeural, pt-BR-MacerioMultilingualNeural e outras ~20) | cloud API TTS (SDK com WebSocket) | Proprietária; microsoft-cognitiveservices-speech-sdk 1.53.0 MIT | ~US$15–16 por milhão de caracteres (Neural) e 0,5 milhão grátis por mês; HD ~US$22–30 por milhão (fontes terceiras; o site oficial apareceu sem números na busca). Uma hora nas premissas: ~US$0,29. | Primeiro byte ~150–300 ms (não verificado); a região brazilsouth reduz a ida e volta. | Vozes brasileiras maduras (Francisca desde 2020, com estilos como 'cheerful'; Thalita Multilingual). Muito boas para assistente. | SDK oficial em Node e no browser; eventos de word boundary para alinhamento (truncar na interrupção). | SDK publicado em 21/10/2026. |
| Google Cloud TTS Chirp 3: HD (pt-BR) e Gemini 3.8 Flash TTS (preview) | cloud API TTS (streaming gRPC) | Proprietária; @google-cloud/text-to-speech 7.2.0 Apache-2.0 | Chirp 3 HD: US$30 por milhão de caracteres, 1 milhão grátis por mês. Instant custom voice: US$60 por milhão. Neural2: US$16 por milhão. Gemini 3.8 Flash TTS (preview até 31/12/2026): US$0,50 por milhão de tokens de texto + US$9 por milhão de tokens de áudio. VERIFICADO em cloud.google.com. | Streaming suportado (PCM, OGG_OPUS, MULAW, ALAW): primeira requisição com a configuração, depois os textos. Valores em ms não publicados. | pt-BR listado no Chirp 3 HD; GA em global, us e eu. | SDK Node gRPC (streamingSynthesize). | SDK publicado em 12/10/2026. |
| Piper pt_BR (faber-medium, cadu-medium, jeff-medium, edresson-low, miro-high, dii-high) via sherpa-onnx-node + piper-phonemize-node | local TTS (VITS ONNX) | Código piper1-gpl: GPL-3.0. piper-phonemize-node 1.5.9: GPL-3.0-or-later (espeak-ng). Datasets cadu e jeff: CC0-1.0. faber: CC0 ou MIT (conflito). miro e dii (OpenVoiceOS): CC BY-NC-SA 4.0 (só uso não comercial, ok para uso pessoal). | US$0 | Medium em CPU: RTF ~0,05–0,2 (não verificado); primeira frase em ~100–300 ms. | Aceitável a boa (faber e cadu são as mais usadas); menos natural que a nuvem; prosódia monótona. | IMPORTANTE: o sherpa-onnx 2.0.0 removeu espeak-ng e piper-phonemize (#4055). Para vozes Piper em pt é preciso fonetizar com piper-phonemize-node (addon nativo) e passar GenerationConfig.phonemeCodepoints, ou usar léxico (não há léxico pt). Pacotes vits-piper-pt_BR-*.tar.bz2 em GitHub releases (tts-models); originais no Hugging Face rhasspy/piper-voices. | piper1-gpl v1.8.0 (04/09/2026); piper-phonemize-node publicado em 20/10/2026. |
| Supertonic 3 (Supertone) via sherpa-onnx | local TTS (ONNX ~99M parâmetros, int8) | Pesos OpenRAIL-M (restrições de uso no Anexo A); código MIT | US$0 | Não verificado; numSteps configurável (exemplo usa 8); feito para rodar no dispositivo. | 'pt' entre 31 idiomas; se é sotaque brasileiro ou europeu não foi verificado: TESTE DE AUDIÇÃO obrigatório. | sherpa-onnx-node com config supertonic (duration_predictor, text_encoder, vector_estimator, vocoder, tts.json, unicode_indexer.bin, voice.bin). Sem fonetizador e sem GPL. Modelo sherpa-onnx-supertonic-3-tts-int8-2026-05-11 em GitHub releases. | Suporte no sherpa desde ~mai/2026. Relato não confirmado de dissolução da Supertone em jul/2026: sem atualizações futuras. |
| Kokoro-82M v1.0 (pf_dora, pm_alex, pm_santa) via sherpa-onnx ou kokoro-js | local TTS | Apache-2.0 | US$0 | CPU com RTF ~0,2–0,5 (não verificado). | Fraca: nota de terceiros 'C' para pf_dora e pm_alex; sem nota oficial. | sherpa kokoro-multi-lang-v1_0 (GitHub releases; ids de voz 42 a 44), mas pt precisa de fonemas externos (espeak removido). kokoro-js 1.2.1 está parado desde 05/2025, depende de transformers v3 e baixa do Hugging Face. | kokoro-js sem release desde 03/05/2025. |
| Windows SAPI via Web Speech API (speechSynthesis) no Electron | local (SO) | Incluído no Windows | US$0 | Imediata (~50 ms) | Vozes SAPI5 do tipo 'Microsoft Maria' soam robóticas. As vozes Natural do Narrador (Francisca, Thalita) só via hack (NaturalVoiceSAPIAdapter, frágil a atualizações). As vozes 'Online (Natural)' são do Edge, não do Electron. | speechSynthesis.getVoices() no renderer (PR electron#14070 corrigiu vozes no Windows). webkitSpeechRecognition NÃO serve no Electron (depende do serviço do Google; erro 'network', não verificado). | N/A |
| Silero VAD via @ricky0123/vad-web 0.0.31 (renderer) | biblioteca local (onnxruntime-web WASM + AudioWorklet) | ISC (lib); Silero VAD MIT | US$0 | Quadros de 512 amostras a 16 kHz (~32 ms) no v5; detecção de início de fala em ~100–200 ms com os ajustes certos. | Independe de idioma. | Funciona no renderer do Electron (Chromium). O pacote npm JÁ inclui silero_vad_v5.onnx, silero_vad_v6.onnx e vad.worklet.bundle.min.js (nada do Hugging Face). Configurar baseAssetPath e onnxWASMBasePath (copiar os .wasm de onnxruntime-web). getStream sobrescrevível para restrições de eco. Padrões a ajustar: positiveSpeechThreshold 0.3, redemptionMs 1400 (alto demais para conversa: usar ~300–600 ou Smart Turn), preSpeechPadMs 800, minSpeechMs 400. | 0.0.31 em 12/09/2026 (repo ativo). @ricky0123/vad-node 0.0.3 está parado desde 2024: não usar. |
| Smart Turn v3.2 (Pipecat) — detector semântico de fim de turno | modelo local ONNX (~8,7 MB float32; int8 de 11,1 MB no espelho) | Pipecat BSD-2-Clause; licença dos pesos não verificada separadamente | US$0 | 12 ms em CPU moderna (Daily); 36 ms de média e 51 ms de p95 (M5 Pro); 84,5 ms p50 com 1 thread (outro teste). | 23 idiomas, inclui português. | onnxruntime-node 1.31.1 ou onnxruntime-web. O arquivo src/pipecat/audio/turn/smart_turn/data/smart-turn-v3.2-cpu.onnx está versionado no GitHub do Pipecat (sem LFS), acessível no build. Entrada: até 8 s de áudio 16 kHz do usuário. | Pipecat v1.15.0 em 29/10/2026. |
| Pipecat 1.15.0 (padrões de referência) | framework Python (cliente JS @pipecat-ai/client-js 1.16.0) | BSD-2-Clause | US$0 | N/A | N/A | Núcleo em Python: não usar no PC do usuário, só copiar padrões. | v1.15.0 em 29/10/2026; muito ativo. |
| LiveKit Agents (Python 1.8.10; JS @livekit/agents 1.9.5) | framework (exige sala LiveKit/WebRTC SFU) | Apache-2.0 (código); turn-detector sob LiveKit Model License (restrita) | US$0 (self-host) ou LiveKit Cloud | N/A | turn-detector multilíngue com 14 idiomas, inclui Portuguese (~99,4% de acurácia no card). | Exige servidor LiveKit: exagero para desktop local. Modelo turn-detector no Hugging Face. | Commit de 01/11/2026; JS 1.9.5 em 28/10/2026. |

### Prós e contras

**OpenAI Realtime API: gpt-realtime-2.1 / gpt-realtime-2.1-mini (speech-to-speech)**

- ✅ Menor latência de ponta a ponta; interrupção feita pelo servidor (interrupt_response) e eventos output_audio_buffer.clear, response.cancel e conversation.item.truncate
- ✅ Function calling e ferramentas MCP na sessão; entrada de imagem (input_image); raciocínio configurável
- ✅ Cancelamento de eco 'de graça' por ser WebRTC; redução de ruído near_field/far_field no servidor
- ✅ Truncamento automático de contexto (retention_ratio) e idle_timeout_ms
- ⚠️ Prende o 'cérebro' à OpenAI: Claude não fica no laço de voz, a não ser delegando por ferramenta
- ⚠️ Custo 2–4x maior que a cascata com Claude Sonnet; o contexto em áudio cresce rápido
- ⚠️ Qualidade do pt-BR não verificada; memória e prompt ficam do lado do servidor
- ⚠️ Renderer recebe credencial (efêmera, TTL curto); o áudio sai continuamente durante a sessão (só abrir depois da palavra de ativação)
- Fontes: https://openai.com/index/advancing-voice-intelligence-with-new-models-in-the-api/, https://community.openai.com/t/new-realtime-models-on-the-api-gpt-realtime-2-1-and-gpt-realtime-2-1-mini/1385896, https://aireiter.com/blog/openai-realtime-api-pricing, https://developers.openai.com/api/docs/pricing, https://developers.openai.com/api/docs/guides/realtime-webrtc, https://developers.openai.com/api/docs/api-reference/realtime-sessions, https://www.layer3labs.io/guides/openai-realtime-api-pricing, https://community.openai.com/t/estimate-the-cost-for-1-min-usage-of-real-time-api/1019290

**Google Gemini Live API (gemini-3.1-flash-live-preview; 'Gemini 3.8 Live' citado por terceiros)**

- ✅ Preço por token de áudio ~10x menor que o OpenAI 2.1
- ✅ Tokens efêmeros oficiais para cliente
- ✅ Alternativa de baixa latência com outro fornecedor
- ⚠️ Recobrança do contexto completo a cada turno: precisa de ContextWindowCompressionConfig, que descarta histórico
- ⚠️ Também prende o cérebro (Gemini)
- ⚠️ Nomes de modelo e preços instáveis (preview)
- Fontes: https://www.developersdigest.tech/voice-agents/gemini-live-api, https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens, https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/live-api/best-practices, https://discuss.ai.google.dev/t/does-gemini-live-native-audio-bill-cumulative-prompt-tokens-on-every-turn-cost-seems-to-scale-with-turn-count-not-call-duration/173248, https://www.npmjs.com/package/@google/genai

**Deepgram Nova-3 (multilíngue / pt) e Flux Multilingual (flux-general-multi)**

- ✅ Barato e com baixa latência
- ✅ Detecção de fim de turno nativa (Flux) que reduz a dependência de VAD e Smart Turn
- ✅ Provedor de STT no AI SDK (@ai-sdk/deepgram 3.1.43), útil para transcrição em lote
- ⚠️ Preço promocional confunde o orçamento
- ⚠️ Servidores nos EUA/UE: latência maior a partir do Brasil
- ⚠️ TTS Aura-2 NÃO tem português
- Fontes: https://deepgram.com/pricing, https://convertaudiototext.com/blog/deepgram-nova-3-explained, https://www.gladia.io/blog/deepgram-pricing, https://developers.deepgram.com/docs/flux/configuration.md, https://www.bolna.ai/docs/deepgram-flux, https://texttolab.com/blog/deepgram-pricing, https://www.npmjs.com/package/@deepgram/sdk

**Soniox stt-rt-v5**

- ✅ STT em nuvem mais barato da lista
- ✅ Precisão alegada muito alta em pt
- ⚠️ Números de latência só do fornecedor
- ⚠️ Empresa menor (risco de continuidade)
- Fontes: https://soniox.com/compare/stt/pricing, https://soniox.com/speech-to-text/portuguese, https://soniox.com/compare-stt/soniox-vs-openai/portuguese, https://www.npmjs.com/package/@soniox/node

**ElevenLabs Scribe v2 Realtime (scribe_v2_realtime)**

- ✅ Mesmo fornecedor do TTS (uma só conta e chave)
- ✅ Latência baixa
- ⚠️ Mais caro que Soniox e AssemblyAI
- ⚠️ Preços da ElevenLabs mudaram várias vezes em 2026
- Fontes: https://elevenlabs.io/pricing/api, https://elevenlabs.io/realtime-speech-to-text, https://elevenlabs.io/blog/scribe-v2-realtime-in-elevenlabs-agents, https://www.mobiletime.com.br/noticias/26/11/2025/elevenlabs-scribe-v2/, https://www.npmjs.com/package/@elevenlabs/elevenlabs-js

**AssemblyAI Universal-Streaming Multilingual / Universal-3.x Pro Realtime**

- ✅ Barato
- ✅ Keyterms incluídos no Multilingual
- ⚠️ Cobra a conexão aberta, não só a fala
- ⚠️ Lista de idiomas inconsistente entre fontes
- Fontes: https://www.assemblyai.com/pricing.md, https://pricingsaas.com/companies/assemblyai/diffs/2026W27, https://www.usagepricing.com/blueprint/activity/assemblyai-2026-10-25-universal-3-6-pro-realtime, https://www.npmjs.com/package/assemblyai

**OpenAI STT: gpt-realtime-whisper, gpt-live-transcribe, gpt-transcribe, gpt-4o(-mini)-transcribe, whisper-1**

- ✅ Um fornecedor só, se o modo Realtime for usado
- ✅ Lote barato para notas de voz e arquivos
- ⚠️ Streaming caro comparado a Deepgram, Soniox e AssemblyAI
- ⚠️ Mudanças frequentes de modelo e descontinuações
- Fontes: https://developers.openai.com/api/docs/guides/realtime-transcription, https://dev.to/lukeocodes/gpt-transcribe-makes-context-the-new-asr-feature-1hi1, https://gigazine.net/gsc_news/en/20260729-gpt-live-transcribe, https://convertaudiototext.com/blog/openai-whisper-api-pricing-2026, https://www.npmjs.com/package/openai

**Google Cloud STT V2 (Chirp) e Azure Speech STT em tempo real**

- ✅ Fornecedores grandes e estáveis; região no Brasil (Azure)
- ⚠️ Mais caros que Deepgram e Soniox para streaming
- ⚠️ Configuração de nuvem mais pesada (conta GCP/Azure)
- Fontes: https://cloud.google.com/speech-to-text/pricing, https://azure.microsoft.com/en-us/pricing/details/speech/, https://makerstack.co/reviews/azure-ai-speech-review/, https://www.npmjs.com/package/@google-cloud/speech, https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk

**Mistral Voxtral Realtime (Voxtral Transcribe 2)**

- ✅ Barato; streaming com atraso ajustável
- ✅ Pesos abertos (servidor próprio no futuro)
- ⚠️ Rodar localmente exige Python e GPU (fora do requisito)
- Fontes: https://mistral.ai/news/voxtral-transcribe-2, https://www.gend.co/blog/voxtral-transcribe-2, https://www.npmjs.com/package/@mistralai/mistralai

**sherpa-onnx-node 2.0.1 + Nemotron-3.5-ASR-streaming-0.6B int8 (STT local em streaming)**

- ✅ STT local em streaming de verdade com pt-BR, sem Python
- ✅ Mesmo runtime faz VAD (Silero, TEN-VAD), TTS, isolamento de voz do usuário (VoxLock, novo) e identificação de locutor
- ✅ Modelos hospedados no GitHub
- ⚠️ Precisão em pt-BR não medida; uso de CPU com KWS, VAD e TTS ao mesmo tempo
- ⚠️ Addon nativo exige cuidado com asar, ABI e buffers externos no Electron
- Fontes: https://github.com/k2-fsa/sherpa-onnx, https://github.com/k2-fsa/sherpa-onnx/blob/master/CHANGELOG.md, https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-addon-examples, https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models, https://www.npmjs.com/package/sherpa-onnx-node, https://huggingface.co/cstr/nemotron-3.5-asr-streaming-GGUF, https://together.ai/models/nvidia-nemotron-35-asr

**sherpa-onnx (offline + VAD): Whisper (tiny…turbo), Parakeet-TDT-0.6B-v3, Cohere Transcribe 2B, Qwen3-ASR-0.6B, Omnilingual-ASR 300M**

- ✅ Alternativa offline mais precisa para comandos curtos depois da palavra de ativação
- ✅ Tudo no GitHub
- ⚠️ Não é streaming: latência proporcional à duração da fala
- ⚠️ Modelos grandes (Cohere 2B) pesam em RAM e CPU
- Fontes: https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-addon-examples, https://huggingface.co/blog/CohereLabs/cohere-transcribe-03-2026-release, https://docs.cohere.com/docs/transcribe, https://huggingface.co/Qwen/Qwen3-ASR-0.6B, https://catalog.ngc.nvidia.com/orgs/nim/nvidia/containers/parakeet-0.6b-tdt/1.3, https://build.nvidia.com/nvidia/parakeet-tdt-0_6b/modelcard, https://huggingface.co/handy-computer/moonshine-streaming-medium-gguf

**whisper.cpp v1.9.5 (Vulkan/CUDA) via bindings Node**

- ✅ Melhor aproveitamento de GPU AMD/NVIDIA via Vulkan
- ✅ Comunidade grande
- ⚠️ Não é streaming de verdade; o flash attention padrão já causou crash em GPUs NVIDIA (relato)
- ⚠️ Modelos no Hugging Face
- Fontes: https://github.com/ggml-org/whisper.cpp, https://archlinux.org/packages/extra/x86_64/whisper-cpp-vulkan/, https://www.npmjs.com/package/nodejs-whisper, https://www.npmjs.com/package/@fugood/whisper.node

**transformers.js 4.3.2 (Whisper WebGPU no renderer)**

- ✅ Sem addon nativo
- ✅ Aproveita GPU via WebGPU
- ⚠️ Sem streaming verdadeiro; modelos no Hugging Face; disputa GPU e memória com a interface
- Fontes: https://www.npmjs.com/package/@huggingface/transformers, https://huggingface.co/striimit/whisper-large-v3-turbo-webgpu, https://blog.logrocket.com/how-to-build-a-real-time-voice-ai-agent-in-the-browser

**ElevenLabs TTS: Flash v2.5 (eleven_flash_v2_5), Eleven v4 Turbo (eleven_v4_turbo), v4 / v3 / Multilingual v2**

- ✅ Melhor naturalidade e expressividade em pt-BR entre as nuvens (avaliação qualitativa)
- ✅ Latência muito baixa; timestamps de alinhamento permitem truncar o histórico com precisão na interrupção
- ⚠️ Mais caro que Azure e OpenAI TTS
- ⚠️ Preços voláteis; endpoints diferentes por modelo
- Fontes: https://elevenlabs.io/pricing/api, https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go, https://elevenlabs.io/docs/pt/eleven-api/guides/how-to/websockets/realtime-tts, https://micdrop.dev/blog/eleven-v4-turbo-voice-agent, https://openrouter.ai/elevenlabs/eleven-flash-v2.5, https://www.npmjs.com/package/@elevenlabs/elevenlabs-js

**OpenAI gpt-4o-mini-tts (gpt-4o-mini-tts-2025-12-15)**

- ✅ Barato (~US$0,30/h nas premissas)
- ✅ Controle de estilo por instrução
- ⚠️ Latência e sotaque pt-BR inferiores aos da ElevenLabs (não medido)
- Fontes: https://developers.openai.com/api/docs/guides/text-to-speech, https://gate.ai/blog/gpt-4o-mini-tts-openai-specs-pricing-api-use-cases, https://texttolab.com/blog/openai-tts-pricing, https://www.npmjs.com/package/openai

**Cartesia Sonic 3 / Sonic 3.6**

- ✅ Latência muito baixa; preço parecido com o da ElevenLabs
- ⚠️ Qualidade pt-BR não verificada
- ⚠️ Assinatura mensal
- Fontes: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest, https://smallest.ai/blog/cartesia-pricing-plans-cost-what-you-get-in-2026, https://soniox.com/pricing/tts/soniox-vs-cartesia, https://invideo.io/blog/cartesia-sonic-ai-voice/, https://www.npmjs.com/package/@cartesia/cartesia-js

**Azure Neural TTS pt-BR (pt-BR-FranciscaNeural, pt-BR-AntonioNeural, pt-BR-ThalitaMultilingualNeural, pt-BR-MacerioMultilingualNeural e outras ~20)**

- ✅ Barato, estável, região no Brasil, vozes pt-BR nativas
- ✅ Word boundaries e SSML (pronúncia de '300' -> 'trezentos')
- ⚠️ Menos expressivo que a ElevenLabs
- ⚠️ Preço oficial não confirmado nesta sessão
- Fontes: https://azure.microsoft.com/en-us/pricing/details/speech/, https://docs.signalwire.com/voice/tts/azure, https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support, https://news.microsoft.com/pt-br/portugues-do-brasil-e-adicionado-aos-servicos-cognitivos-do-azure-para-texto-e-fala-neural/, https://www.beri.net/article/elevenlabs-vs-cartesia-vs-azure-tts-latency-pricing-voice-cloning-2026, https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk

**Google Cloud TTS Chirp 3: HD (pt-BR) e Gemini 3.8 Flash TTS (preview)**

- ✅ Preço oficial verificado; streaming de texto incremental
- ⚠️ 2x o preço do Azure Neural; latência não medida
- Fontes: https://cloud.google.com/text-to-speech/pricing, https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd, https://www.npmjs.com/package/@google-cloud/text-to-speech

**Piper pt_BR (faber-medium, cadu-medium, jeff-medium, edresson-low, miro-high, dii-high) via sherpa-onnx-node + piper-phonemize-node**

- ✅ Offline, leve, grátis, rápido em CPU
- ✅ Hospedagem no GitHub via sherpa
- ⚠️ GPL no fonetizador (ok para uso pessoal; atenção se um dia distribuir)
- ⚠️ Binários Windows e ABI Electron do piper-phonemize-node não verificados
- ⚠️ Qualidade abaixo da nuvem
- Fontes: https://github.com/k2-fsa/sherpa-onnx/blob/master/CHANGELOG.md, https://github.com/k2-fsa/sherpa-onnx/blob/master/scripts/piper/generate.py, https://github.com/k2-fsa/sherpa-onnx/tree/master/nodejs-addon-examples, https://www.npmjs.com/package/piper-phonemize-node, https://github.com/OHF-Voice/piper1-gpl, https://huggingface.co/rhasspy/piper-voices, https://prod.datacollective.mozillafoundation.org/datasets/cmiupaf3e01i0mf07qkqxbzzx, https://huggingface.co/Trelis/piper-pt-br-faber-medium

**Supertonic 3 (Supertone) via sherpa-onnx**

- ✅ Local sem espeak e sem GPL; multilíngue; pequeno
- ⚠️ Sotaque pt-BR incerto; fornecedor possivelmente extinto
- Fontes: https://github.com/k2-fsa/sherpa-onnx/blob/master/scripts/supertonic/README.md, https://github.com/supertone-inc/supertonic, https://huggingface.co/mlx-community/supertonic-3, https://huggingface.co/jiangzhuo9357/supertonic-3

**Kokoro-82M v1.0 (pf_dora, pm_alex, pm_santa) via sherpa-onnx ou kokoro-js**

- ✅ Leve, licença permissiva
- ⚠️ Qualidade pt-BR baixa; mesma dependência de fonetizador
- Fontes: https://replicate.com/codingayam/kokoro-82m-complete/readme, https://offlinetts.com/voice/pf-dora/, https://github.com/k2-fsa/sherpa-onnx/blob/master/scripts/kokoro/v1.0/generate_voices_bin.py, https://www.npmjs.com/package/kokoro-js

**Windows SAPI via Web Speech API (speechSynthesis) no Electron**

- ✅ Zero dependência; último recurso de fala
- ⚠️ Qualidade baixa; sem eventos de alinhamento confiáveis; não dá para mixar no pipeline de eco
- Fontes: https://github.com/electron/electron/pull/14070, https://developer.mozilla.org/docs/Web/API/Web_Speech_API, https://github.com/gexgd0419/NaturalVoiceSAPIAdapter

**Silero VAD via @ricky0123/vad-web 0.0.31 (renderer)**

- ✅ Leve, roda junto da captura (sem IPC no caminho crítico da interrupção)
- ✅ Modelos via npm
- ⚠️ Precisa de protocolo customizado/CSP com 'wasm-unsafe-eval'
- Fontes: https://www.npmjs.com/package/@ricky0123/vad-web, https://docs.vad.ricky0123.com/user-guide/browser/, https://docs.vad.ricky0123.com/user-guide/api/, https://github.com/ricky0123/vad

**Smart Turn v3.2 (Pipecat) — detector semântico de fim de turno**

- ✅ Corta a espera de silêncio fixa (de ~800 ms para ~200–300 ms) sem cortar o usuário no meio da frase
- ⚠️ Precisa de reimplementação em TS do pré-processamento (features Whisper)
- Fontes: https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/, https://huggingface.co/soniqo/Smart-Turn-v3.2-ONNX, https://github.com/pipecat-ai/pipecat, https://www.npmjs.com/package/onnxruntime-node

**Pipecat 1.15.0 (padrões de referência)**

- ✅ Padrões úteis: MinWordsUserTurnStartStrategy (interromper só após N palavras enquanto o bot fala), SpeculationGate (resposta especulativa no fim de turno 'eager', descartada se o usuário continuar), FunctionCallUserMuteStrategy (silencia o usuário durante chamadas de ferramenta), WakePhraseUserTurnStartStrategy, LLMTurnCompletion, match_endofsentence (fim de frase sensível a idioma)
- ⚠️ Python; arquitetura de frames pesada para app desktop de um usuário
- Fontes: https://github.com/pipecat-ai/pipecat, https://www.npmjs.com/package/@pipecat-ai/client-js

**LiveKit Agents (Python 1.8.10; JS @livekit/agents 1.9.5)**

- ✅ Valores-padrão bons de copiar: endpointing min_delay 0,5 s (0,3 s com STT em streaming) e max_delay 3,0 s (2,5 s); interruption min_duration 0,5 s, min_words 0, resume_false_interruption=True, false_interruption_timeout 2,0 s, backchannel_boundary (1,0 s, 1,0 s), aec_warmup_duration 3,0 s (ignora interrupções no início da fala do agente), preemptive_generation
- ⚠️ Dependência de infraestrutura WebRTC; licença do modelo restritiva
- Fontes: https://github.com/livekit/agents, https://pypi.org/project/livekit-plugins-turn-detector, https://www.npmjs.com/package/@livekit/agents

## Notas de implementação

- Pacotes npm (versão, data e licença verificadas via npm view em 02/11/2026): sherpa-onnx-node 2.0.1 (Apache-2.0, 26/10/2026; binários opcionais sherpa-onnx-win-x64, win-arm64, win-ia32 2.0.1), @ricky0123/vad-web 0.0.31 (ISC, 12/09/2026, traz silero_vad_v5 e v6 .onnx), onnxruntime-web e onnxruntime-node 1.31.1 (MIT, 30/10/2026), piper-phonemize-node 1.5.9 (GPL-3.0-or-later, 20/10/2026), @deepgram/sdk 5.17.0, @elevenlabs/elevenlabs-js 2.75.0, assemblyai 4.42.0, @soniox/node 2.4.0, @cartesia/cartesia-js 4.2.0, microsoft-cognitiveservices-speech-sdk 1.53.0, @google-cloud/speech 8.2.1, @google-cloud/text-to-speech 7.2.0, @google/genai 2.32.0, openai 7.47.0, @openai/agents-realtime 0.21.0, ai 7.0.159, @ai-sdk/anthropic 4.0.94, @ai-sdk/openai 4.0.106, @ai-sdk/elevenlabs 3.0.76, @ai-sdk/deepgram 3.1.43. Tirar da pilha: vosk-browser 0.0.8 (última publicação em 25/12/2022; modelos em alphacephei, bloqueado) e @ricky0123/vad-node 0.0.3 (2024).
- Onde ficam os modelos (bloqueio do build: Hugging Face e alphacephei). Vêm do GitHub: os modelos sherpa-onnx em github.com/k2-fsa/sherpa-onnx/releases/download/{asr-models|tts-models}/..., por exemplo:
- sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11.tar.bz2
- silero_vad.onnx
- sherpa-onnx-whisper-*.tar.bz2
- sherpa-onnx-cohere-transcribe-14-lang-int8-2026-04-01.tar.bz2
- sherpa-onnx-qwen3-asr-0.6B-int8-2026-03-25.tar.bz2
- vits-piper-pt_BR-{faber,cadu,jeff}-medium.tar.bz2
- sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2
- kokoro-multi-lang-v1_0.tar.bz2
Também fora do Hugging Face: Silero VAD vem no pacote npm do vad-web; Smart Turn v3.2 está no repositório do Pipecat (src/pipecat/audio/turn/smart_turn/data/smart-turn-v3.2-cpu.onnx, 8.679.182 bytes, sem LFS). Ficam SÓ no Hugging Face: transformers.js/onnx-community Whisper, modelos ggml do whisper.cpp, kokoro-js, LiveKit turn-detector e os originais rhasspy/piper-voices.
- sherpa-onnx 2.0.0 removeu espeak-ng e piper-phonemize (#4055). Para vozes Piper pt_BR: `const ph = require('piper-phonemize-node').phonemize(texto, tts.lang||'pt-br').filter(s=>s.length)`; depois `tts.generate({text:'', generationConfig:new GenerationConfig({phonemeCodepoints:ph, sid:0, speed:1.0, silenceScale:0.2})})` (padrão do exemplo test_tts_non_streaming_vits_piper_de_phonemize.js). Confirmar se há binário pronto de piper-phonemize-node para Windows x64 no Electron 45; se não houver, compilar ou trocar para Supertonic 3 (sem fonetizador; generationConfig com extra:{lang:'pt'}, numSteps 4–8).
- sherpa-onnx no Electron:
- Rodar em utilityProcess.fork() (nunca no main, porque bloqueia a interface).
- electron-builder com asarUnpack para '**/node_modules/sherpa-onnx-*/**' e '**/*.node'.
- Usar enableExternalBuffer:false nas APIs que retornam áudio (o Electron exige buffers do próprio JS, conforme o README oficial).
- Recognizer streaming: new OnlineRecognizer(config); stream.setOption('language','pt-BR'); acceptWaveform({sampleRate:16000, samples:Float32Array}); isReady/decode/getResult; isEndpoint.
- Captura e eco no renderer:
- getUserMedia({audio:{channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true}}) e passar via MicVAD.new({getStream, baseAssetPath, onnxWASMBasePath, model:'v5' ou 'v6', positiveSpeechThreshold:0.5, negativeSpeechThreshold:0.35, redemptionMs:300–600, minSpeechMs:250, preSpeechPadMs:300, onSpeechStart, onSpeechEnd, onFrameProcessed}).
- Servir os assets por protocolo customizado registrado com protocol.registerSchemesAsPrivileged({standard:true, secure:true, supportFetchAPI:true}) e CSP com `script-src 'self' 'wasm-unsafe-eval'`. O AudioWorklet exige contexto seguro.
- Cancelamento de eco (risco nº 1 do barge-in):
- No Chromium, com garantia, só é cancelado o áudio que chega por RTCPeerConnection. O áudio que o próprio Chromium toca só é cancelado se o recurso ChromeWideEchoCancellation estiver ligado, e o padrão dele no Electron 45 não foi verificado. A issue electron#47043 confirma que o áudio de OUTROS apps não é cancelado.
- Plano: (1) tocar o TTS no MESMO renderer via WebAudio e medir o eco residual com arquivo de teste; (2) se falhar, tentar app.commandLine.appendSwitch('enable-features','ChromeWideEchoCancellation') (não verificado); (3) contorno conhecido: tocar o TTS por um par RTCPeerConnection local em loopback para virar faixa remota; (4) echoCancellation:'all' (Chrome 141+) usa loopback do sistema, mas há bug que suprime a fala do usuário por até 1 s e o atraso do loopback passa de 100 ms; (5) proteções em software: limiar de VAD maior enquanto fala, ignorar 0,5–1 s iniciais (como o aec_warmup do LiveKit), exigir ≥2 palavras não ecoadas (comparar a transcrição parcial com o texto em reprodução), recomendar fone de ouvido.
- Máquina de estados de interrupção (cascata). Estados: OUVINDO -> PENSANDO -> FALANDO.
- onSpeechStart durante PENSANDO/FALANDO: abaixar o volume em ~12 dB imediatamente (GainNode).
- Interrupção confirmada (≥300–500 ms de fala ou ≥2 palavras parciais): AudioBufferSourceNode.stop() / limpar o ring buffer do worklet; abortController.abort() no stream do Claude (SDK @anthropic-ai/sdk com {signal} ou stream.abort(); AI SDK com streamText({abortSignal})); fechar ou dar flush no contexto do WebSocket de TTS; descartar frases na fila.
- Gravar no histórico só o texto realmente tocado: usar alinhamento ou timestamps (ElevenLabs alignment, eventos WordBoundary do Azure, contagem de amostras por frase no local) e marcar '[interrompido pelo usuário]'.
- Interrupção falsa: se em ~1,5–2 s não houver transcrição útil, retomar a fala (resume_false_interruption do LiveKit).
- Ignorar backchannels ('uhum', 'tá', 'sei').
- Meta: áudio parado em menos de 150 ms após a confirmação.
- Interrupção no OpenAI Realtime:
- Com turn_detection {type:'semantic_vad', eagerness:'auto'|'high', interrupt_response:true, create_response:true} o servidor cancela sozinho.
- Em WebRTC o cliente pode mandar response.cancel e depois output_audio_buffer.clear.
- Em WebSocket use conversation.item.truncate {item_id, content_index:0, audio_end_ms}.
- server_vad aceita prefix_padding_ms (padrão 300), silence_duration_ms e idle_timeout_ms.
- Para limitar custo: session.truncation {type:'retention_ratio', retention_ratio:0.8}.
- Ruído: audio.input.noise_reduction {type:'near_field'}.
- Chave efêmera: POST https://api.openai.com/v1/realtime/client_secrets com {expires_after:{anchor:'created_at', seconds:<curto>}, session:{type:'realtime', model:'gpt-realtime-2.1-mini', audio:{output:{voice:'marin'}}}}. O renderer faz POST https://api.openai.com/v1/realtime/calls com o SDP offer (Content-Type: application/sdp) e usa o data channel 'oai-events'.
- Chunker de frases pt-BR:
- Mandar ao TTS ao encontrar [.!?…;:] seguido de espaço, ou uma vírgula depois de ≥40 caracteres, só no primeiro trecho.
- Não quebrar em '3.000', 'R$ 1.234,56', 'Sr.', 'Dra.', 'etc.', 'p.ex.', URLs e decimais. Base: match_endofsentence do Pipecat.
- Normalizar números para TTS local: '300' -> 'trezentos'. Atenção ao nome do assistente: o próprio TTS não deve disparar a palavra de ativação; ignorar a palavra de ativação enquanto FALANDO ou comparar com o texto em reprodução.
- WebSockets de TTS:
- ElevenLabs Flash v2.5: wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input?model_id=eleven_flash_v2_5&output_format=pcm_16000 (ou 22050/24000). Mandar o primeiro pacote com voice_settings, depois cada frase com flush:true no fim da frase. Eleven v3/v4/v4 Turbo NÃO aceitam esse endpoint (usam o Text-to-Dialogue WS).
- Azure: SpeechSynthesizer com voz pt-BR-FranciscaNeural e saída Raw24Khz16BitMonoPcm; região brazilsouth.
- Google Chirp 3 HD: streamingSynthesize (primeira mensagem com a configuração, depois os textos).
- Deepgram STT: wss://api.deepgram.com/v1/listen?model=nova-3&language=multi&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=300&smart_format=true com o cabeçalho Authorization: Token <key>.
- Formatos de áudio:
- Capturar no AudioContext do sistema (48 kHz) e reamostrar para 16 kHz mono (o vad-web reamostra internamente; para STT, mandar PCM16 LE em quadros de 20–40 ms).
- OpenAI Realtime por WebSocket usa pcm16 a 24 kHz; por WebRTC usa Opus automático.
- Piper medium sai a 22.050 Hz (edresson-low a 16 kHz). Tocar via AudioBuffer na taxa original ou reamostrar no worklet de saída.
- Pré-carregar o próximo trecho para não ter lacuna entre frases.
- Segurança:
- Chaves (Anthropic, Deepgram, ElevenLabs, OpenAI) só no main/utilityProcess, cifradas com safeStorage. O renderer nunca vê chave padrão; no máximo a chave efêmera da OpenAI, com TTL curto e restrita à sessão.
- session.setPermissionRequestHandler: liberar 'media' só para a origem do app.
- Áudio só sai para a nuvem depois da palavra de ativação ou no modo conversa contínua explícito, com indicador visível.
- Transcrição de voz é ENTRADA NÃO CONFIÁVEL (TV ou vídeo podem falar comandos): ações exigem confirmação. Opcional: verificação do locutor (embeddings de locutor do sherpa ou VoxLock).
- Como testar sem hardware:
- Microfone falso no Electron: app.commandLine.appendSwitch('use-fake-ui-for-media-stream'); appendSwitch('use-fake-device-for-media-stream'); appendSwitch('use-file-for-fake-audio-capture','C:/testes/pt-br-frase.wav') (flags do Chromium; confirmar no Electron 45).
- E2E com playwright-core 1.64.1 via _electron.launch().
- Testes unitários do utilityProcess com WAVs (16 kHz mono) passados direto a acceptWaveform.
- Provedores falsos determinísticos (FakeSTT, FakeLLM, FakeTTS) com atrasos configuráveis para testar a máquina de interrupção (casos: fala durante PENSANDO, durante FALANDO, interrupção falsa, eco).
- Registrar marcos de tempo: t_fim_fala_usuario, t_stt_final, t_llm_primeiro_token, t_primeira_frase, t_tts_primeiro_byte, t_audio_inicio, t_barge_in_parado.
- Medir o TTFT real de Claude Haiku, Sonnet e Opus 5.5 a partir do Brasil (não verificado aqui).
- Estimativas de latência:
(a) Realtime speech-to-speech: espera de fim de turno 200–500 ms (semantic_vad) + primeiro áudio 300–1.100 ms (minimal/low) + rede Brasil–EUA 120–180 ms = ~0,8–1,5 s percebido.
(b) Cascata com Claude: fim de turno 200–400 ms (Smart Turn ou Flux) + STT final 100–300 ms (nuvem) ou 200–600 ms (Nemotron local) + TTFT Claude ~0,3–0,7 s (Haiku), ~0,5–1,2 s (Sonnet), ~0,8–2 s (Opus) (não verificado) + primeira frase 100–250 ms + TTS primeiro byte 150–350 ms (ElevenLabs/Cartesia com rede) ou 100–300 ms (Piper local) = ~1,2–1,8 s (Haiku), ~1,4–2,4 s (Sonnet), ~1,8–3 s (Opus). A geração especulativa no EagerEndOfTurn corta ~200–500 ms.
- Estimativas de custo por hora de conversa. Premissas: 20 min de fala do usuário, 20 min de fala do assistente (~18 mil caracteres pt-BR), 120 turnos, prompt médio de ~10 mil tokens com cache (multiplicadores de cache da Anthropic assumidos, não pesquisados).
- gpt-realtime-2.1: ~US$0,38 de áudio de entrada + US$1,54 de saída + ~US$1,0 de contexto em cache = ~US$2,9/h.
- gpt-realtime-2.1-mini: ~US$1,35/h.
- Cascata com Sonnet 5.5: STT Deepgram via VAD ~US$0,23 (US$0,55 com stream aberto) ou Soniox US$0,12 + LLM ~US$0,7 + TTS ElevenLabs ~US$0,72 ou Azure ~US$0,29 = ~US$1,1–1,7/h.
- Cascata com Opus 5.5: ~US$1,8–2,4/h.
- Local (STT + TTS) com Sonnet: ~US$0,7/h; com Haiku: ~US$0,04/h.

## Custo estimado

Só a voz, com 1 h de conversa por dia (30 h/mês) e as premissas acima. A pesquisa web (50 por dia) é outro domínio e não está incluída.
- (1) Cascata recomendada com Claude Sonnet 5.5 no turno de voz + Deepgram/Soniox + Azure pt-BR: ~US$33–40/mês. Trocando o Azure pela ElevenLabs Flash: ~US$45–50/mês.
- (2) Mesma cascata com Opus 5.5 em todo turno: ~US$55–75/mês.
- (3) STT e TTS locais (Nemotron + Piper/Supertonic) + Sonnet: ~US$21/mês. Com Haiku 5.5: ~US$1–2/mês.
- (4) Modo baixa latência OpenAI Realtime usado o tempo todo: gpt-realtime-2.1 ~US$85–120/mês; mini ~US$35–45/mês. Usado só em ~20% do tempo, soma ~US$7–24/mês à opção (1).
- (5) Gemini Live: ~US$90–330/mês sem compressão de contexto (não verificado), por recobrar o contexto inteiro a cada turno.

Por minuto, só fala: OpenAI Realtime 2.1 ~US$0,019/min de entrada + US$0,077/min de saída; Deepgram Nova-3 multilíngue US$0,0092/min; Soniox US$0,002/min; ElevenLabs Flash ~US$0,036/min de fala; Azure Neural ~US$0,014/min de fala; Google Chirp 3 HD ~US$0,027/min de fala.

Créditos e cotas grátis: Deepgram US$200 iniciais; Azure 0,5 milhão de caracteres/mês; Google 1 milhão de caracteres/mês no Chirp 3 HD. Isso cobre boa parte do uso pessoal no começo.

## Riscos

- O cancelamento de eco no Electron não está garantido para o TTS tocado por WebAudio ou elemento Audio (issue electron#47043; o padrão de ChromeWideEchoCancellation no Electron 45 não foi verificado). Sem ele, o próprio TTS dispara interrupções e a palavra de ativação. Mitigar com teste, loopback por RTCPeerConnection, ignorar o início da fala, comparar com o texto em reprodução e recomendar fone de ouvido.
- sherpa-onnx 2.0 removeu o espeak-ng: Piper pt_BR depende de piper-phonemize-node (GPL-3.0, addon nativo). Binário pronto para Windows no Electron 45 não verificado. A GPL é aceitável para uso pessoal, mas complica uma distribuição futura.
- Preços voláteis e em parte não verificados na fonte oficial (domínios bloqueados nesta sessão): ElevenLabs mudou preço em mai/2026 e de novo com o v4 (US$0,04–0,05 e US$0,08–0,10 por mil caracteres); Deepgram tem promoção sem data de fim; Azure sem número oficial confirmado; a família gpt-4o-transcribe deixou de ser recomendada ou foi descontinuada.
- Qualidade pt-BR não verificada de: vozes do gpt-realtime-2.1 (marin, cedar), Supertonic 3 'pt' (pode soar europeu), Parakeet v3 (treinado com pt europeu), Nemotron 3.5 (WER pt-BR desconhecido). Testes de audição e de WER com áudio do próprio usuário são obrigatórios antes de fixar padrões.
- Custo do speech-to-speech cresce com o tamanho da sessão (o contexto de áudio é cobrado de novo a cada turno). No Gemini Live a recobrança é a preço cheio; no OpenAI, a preço de cache. Precisa de truncamento (retention_ratio) e de limite de sessão e orçamento.
- Latência da cascata com Opus 5.5 (provavelmente 2–3 s) pode ficar abaixo da expectativa 'JARVIS'. Exige roteamento (modelo rápido no turno), geração especulativa e confirmações sonoras.
- Prompt injection por áudio: TV, vídeos ou terceiros falando comandos; transcrições são entrada não confiável. Ações no computador precisam de confirmação explícita. Opcional: verificação do locutor.
- Exposição de credenciais: a chave efêmera da OpenAI no renderer (TTL curto, nunca a chave padrão); WebSockets de STT/TTS devem sair do main/utilityProcess.
- Carga de CPU e RAM no PC do usuário com palavra de ativação contínua + VAD + ASR em streaming (600M) + TTS local + Electron. Precisa de medição em hardware modesto e de modo 'nuvem leve'.
- Dependência de modelos no Hugging Face (bloqueado no build) para transformers.js, ggml do whisper.cpp, kokoro-js e LiveKit turn-detector. Preferir os pacotes do GitHub (sherpa releases, Pipecat) ou baixar no primeiro uso no PC do usuário.
- Licenças de modelos: LiveKit turn-detector restrito; vozes Piper miro/dii CC BY-NC-SA (não comercial); Supertonic sob OpenRAIL-M com restrições de uso; conflito de licença no Parakeet v3 (CC-BY-4.0 vs NVIDIA Open Model License).
- Continuidade: relato não confirmado de dissolução da Supertone (sem atualizações do Supertonic); kokoro-js parado desde 05/2025; vosk-browser abandonado.
- echoCancellation:'all' (Chrome 141+) tem bug que suprime a fala do usuário por até ~1 s e uma preocupação de privacidade com loopback do sistema em aberto: não usar como solução principal.
- Ida e volta Brasil–EUA (+120–180 ms) em Deepgram, ElevenLabs, OpenAI e Anthropic; só Azure tem região no Brasil confirmada aqui.

## Perguntas em aberto

- O usuário usa fone de ouvido ou caixa de som? Isso define o peso do cancelamento de eco e da proteção contra interrupção falsa.
- O PC tem GPU (NVIDIA ou AMD) para whisper.cpp com Vulkan ou CUDA, ou só CPU? Quanta RAM fica livre para modelos locais?
- Qual o teto de orçamento mensal? Pode enviar áudio para a nuvem depois da palavra de ativação, ou a voz precisa funcionar 100% offline?
- Qual modelo Claude usar no turno de voz (Haiku ou Sonnet 5.5, por latência) e quando escalar para o Opus 5.5 (padrão do projeto)?
- Preferência de voz (feminina ou masculina, estilo)? Aceita assinar ElevenLabs, ou Azure pt-BR (Francisca, Thalita) basta?
- O Electron 45 liga ChromeWideEchoCancellation por padrão? Teste prático necessário com TTS tocado por WebAudio no mesmo renderer.
- Existe binário pronto do piper-phonemize-node 1.5.9 para Windows x64 compatível com Electron 45, ou será preciso compilar (ou optar por Supertonic 3)?
- O sotaque das vozes marin e cedar do gpt-realtime-2.1 é aceitável em pt-BR? E o 'pt' do Supertonic 3 soa brasileiro?
- Qual é o TTFT real de Claude Haiku, Sonnet e Opus 5.5 e a latência dos provedores de STT/TTS medidos a partir da rede do usuário no Brasil?
- Liberar platform.openai.com, developers.openai.com, deepgram.com, elevenlabs.io, cartesia.ai, learn.microsoft.com e azure.microsoft.com na rede da sessão para confirmar os preços oficiais marcados como não verificados?

## Verificação adversarial

Recomendação se mantém: **sim**

A recomendação principal se mantém: uma cascata própria em TypeScript, com STT, LLM e TTS plugáveis, mantém Claude como cérebro, memória e ferramentas no núcleo do app, e não precisa de Python. As peças essenciais foram confirmadas: sherpa-onnx-node 2.0.1 com binários Windows, Nemotron com pt-BR no GitHub, vad-web com Silero v5/v6 no npm, Smart Turn no GitHub sob BSD-2, preços do Google oficiais e preços da OpenAI, ElevenLabs e Soniox por fonte secundária. Seis ajustes, porém, afetam decisões:

(1) O modo de baixa latência deveria avaliar primeiro a nova OpenAI Live API (gpt-live-1). A delegação 'client' resolve de forma nativa o 'prende o cérebro à OpenAI', que é o principal contra do relatório, e a separação entre frontend não confiável e sideband confiável encaixa no modelo de segurança. O custo seria de ~US$3/h por tempo de sessão (não oficial), parecido com o do gpt-realtime-2.1.

(2) O ChromeWideEchoCancellation está LIGADO por padrão no Chromium 156, que é a base do Electron 45.2.1, e o Electron não o desliga. Isso reduz o risco nº 1 (eco no barge-in): o TTS tocado no próprio renderer deve ser cancelado. O plano deve começar pelo teste prático e deixar de lado o appendSwitch e o loopback por RTCPeerConnection como passos prováveis. Fone de ouvido e as proteções em software continuam valendo.

(3) Usar o Nemotron com chunk de 160 ou 320 ms, e não o de 1120 ms. O download de ~475 MB deve ser feito no primeiro uso.

(4) O caminho Piper pt_BR é menos arriscado do que o relatório diz. Existe binário win-x64 N-API pronto e uma versão WASM, e o dataset do faber é CC0. Já o Supertonic 3 deve cair de 'TTS local preferido' para 'experimental': o repositório foi arquivado e não recebe mais correções.

(5) O Gemini Live não tem desconto de cache e recobra o contexto inteiro a cada turno, a preço cheio. Deve ficar abaixo do OpenAI como alternativa speech-to-speech.

(6) Os orçamentos que dependem da Deepgram (streaming e promoção), do Azure, da AssemblyAI e do Scribe v2 Realtime continuam sem confirmação oficial. Como a cascata é plugável, isso não derruba a arquitetura, mas o padrão de STT em nuvem pode passar a ser o Soniox (preço confirmado por fonte secundária) até alguém conferir a Deepgram.

Limitação desta verificação: a cota de WebSearch do turno acabou, e só cloud.google.com, GitHub (raw e releases), npm e PyPI estavam acessíveis. Para conferir preços oficiais, é preciso liberar nas configurações de rede da sessão: openai.com, developers.openai.com, deepgram.com, elevenlabs.io, soniox.com, assemblyai.com, cartesia.ai, azure.microsoft.com, learn.microsoft.com, huggingface.co e ai.google.dev.

| Afirmação | Veredito | Correção | Fonte |
|---|---|---|---|
| OpenAI Realtime: gpt-realtime-2.1 cobra US$32 por milhão de tokens de áudio de entrada, US$64 de saída e US$0,40 em cache; o gpt-realtime-2.1-mini cobra US$10 / US$20 / US$0,30. Texto do 2.1 a US$4 / US$24. | confirmado | Confirmado por fonte secundária: a tabela de preços do LiteLLM no GitHub, que cita developers.openai.com/api/docs/pricing, tem exatamente esses valores. Também mostra cache de texto a US$0,40 (2.1) e US$0,06 (mini), mais 10% para processamento regional nos EUA e na UE. O site oficial estava bloqueado nesta sessão (openai.com e developers.openai.com não resolvem). A conta de ~US$0,019/min de entrada e ~US$0,077/min de saída fecha. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json (entradas gpt-realtime-2.1 e gpt-realtime-2.1-mini) |
| Nomes de modelos de voz no SDK openai 7.47.0: gpt-realtime-2.1, gpt-realtime-2.1-mini, gpt-realtime-whisper, gpt-live-transcribe, gpt-transcribe, gpt-4o-mini-tts-2025-12-15. O SDK confirma semantic_vad, interrupt_response, output_audio_buffer.clear, conversation.item.truncate, retention_ratio, near_field, idle_timeout_ms, /realtime/client_secrets e /realtime/calls. | confirmado | Tudo isso está nos tipos do pacote. Mas o relatório deixou passar a nova API 'Live' (client.live, modelo 'gpt-live-1'), adicionada no openai 7.14.0 (10/09/2026). Ela delega tarefas para a sua própria aplicação (delegation type 'client') e tem os eventos session.commentary.append e session.thinking.append. Isso muda o argumento de que o modo de baixa latência 'prende o cérebro' (ver missedOptions). O @openai/agents-realtime 0.21.0 usa gpt-realtime-2.1 por padrão e não usa gpt-live-1. | npm openai@7.47.0 (resources/live/live.d.ts, resources/live/sessions.d.ts, CHANGELOG.md); npm @openai/agents-realtime@0.21.0 |
| Preços OpenAI STT: gpt-realtime-whisper a US$0,017/min, gpt-transcribe a US$0,0045/min; preço do gpt-live-transcribe não verificado. | confirmado | A tabela do LiteLLM confirma gpt-realtime-whisper a US$0,000283/s (US$0,017/min) e gpt-transcribe a US$0,000075/s (US$0,0045/min). Ela também traz o preço que faltava: gpt-live-transcribe a US$0,017/min, igual ao realtime-whisper. É fonte secundária; o site oficial estava bloqueado. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json |
| Google: Chirp 3 HD a US$30 por milhão de caracteres com 1 milhão grátis por mês; Instant custom voice a US$60/M; Neural2 a US$16/M; STT V2 a US$0,016/min; dynamic batch a US$0,003/min; Gemini 3.8 Flash TTS (preview até 31/12/2026) a US$0,50 / US$9 por milhão de tokens. | confirmado | Conferido na fonte oficial nesta sessão. Falta um dado: a partir de 01/01/2027 o Gemini 3.8 Flash TTS passa para US$1,00 de entrada e US$18,00 por milhão de tokens de áudio, o dobro. O STT V2 também tem 60 min grátis por mês na opção com registro de dados (data logging). | https://cloud.google.com/text-to-speech/pricing ; https://cloud.google.com/speech-to-text/pricing |
| Gemini Live: US$3 de entrada e US$12 de saída por milhão de tokens de áudio, com o contexto inteiro cobrado de novo a cada turno; 'Gemini 3.8 Live' só aparece em fontes de terceiros. | confirmado | A página oficial de preços do Vertex AI lista 'Gemini 3.8 Live API': áudio de entrada US$3,00, áudio de saída US$12,00, texto US$0,75 / US$4,50, e cache marcado 'N/A' (sem desconto de cache). A mesma página confirma a cobrança por turno: 'Tokens from past turns are re-processed and billed in every new turn', a 25 tokens por segundo de áudio. Ou seja, o Gemini 3.8 Live é oficial, não 'citado por terceiros'. E a recobrança é a preço cheio, enquanto no OpenAI ela é a preço de cache. Assim, a vantagem de 'preço por token ~10x menor' quase some em sessões longas. A faixa de ~US$3–11/h é plausível pelas premissas do relatório. | https://cloud.google.com/vertex-ai/generative-ai/pricing |
| sherpa-onnx-node 2.0.1 (Apache-2.0, 26/10/2026) tem binário pronto para win-x64 (~23 MB), win-arm64 e ia32; o sherpa-onnx 2.0.0 removeu espeak-ng e piper-phonemize (#4055). | confirmado | npm view confirma a versão 2.0.1, a licença Apache-2.0 e a data 2026-10-26. Os optionalDependencies trazem sherpa-onnx-win-x64, win-arm64 e win-ia32 2.0.1; o win-x64 tem 23.161.917 bytes descompactado. O CHANGELOG 2.0.0 diz literalmente 'Remove espeak-ng and piper-phonemize from sherpa-onnx (#4055)'. A nota sobre enableExternalBuffer:false no Electron aparece no README para OfflineSourceSeparation. Aplicá-la às outras APIs que devolvem áudio é dedução razoável, mas não está escrita no README. | npm view sherpa-onnx-node ; https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/CHANGELOG.md ; https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/nodejs-addon-examples/README.md |
| Nemotron-3.5-ASR-streaming-0.6B int8 roda em streaming no sherpa com pt-BR, em sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11.tar.bz2 nos GitHub releases. Uso: stream.setOption('language','pt-BR'). Licença OpenMDW-1.1. Tamanho em disco não verificado. Existe export de 560 ms. | confirmado | O arquivo existe no GitHub (HTTP 200, 475.276.334 bytes, ~475 MB compactado). O tokens.txt dentro dele tem as tags <pt-BR> e <pt-PT> entre 39 locais. Correções: (1) existem exports int8 com chunks de 80, 160, 320, 560 e 1120 ms, todos com data 2026-06-11. Para conversa, use 160 ou 320 ms, e não o 1120 ms do exemplo, que sozinho soma mais de 1 s de latência. (2) O README do modelo diz 'Use per-stream language strings such as "en", "ja", or "auto"'. Se a string exata é 'pt-BR' ou 'pt' não foi verificado (o 'pt' pode ser ambíguo entre BR e PT). (3) A licença OpenMDW não pôde ser verificada (huggingface.co bloqueado). | https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-nemotron-3.5-asr-streaming-0.6b-1120ms-int8-2026-06-11.tar.bz2 (README.md e tokens.txt) ; https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/nodejs-addon-examples/test_asr_streaming_nemotron.js |
| piper-phonemize-node 1.5.9 é GPL-3.0, addon nativo, e não há binário pronto para Windows x64 no Electron 45 confirmado. | errado | A licença está certa: GPL-3.0-or-later, publicado em 20/10/2026. Mas o binário pronto EXISTE: optionalDependencies piper-phonemize-win-x64, win-arm64 e win-ia32 1.5.9. O pacote win-x64 traz piper-phonemize.node (137 KB) e piper_phonemize_core.dll (986 KB). O addon usa node-addon-api (N-API), que tem ABI estável e deve carregar no Electron 45 sem recompilar (ainda falta teste prático; precisa de asarUnpack para a .dll). Há também a variante WebAssembly 'piper-phonemize' 1.5.9 (GPL), que roda no renderer sem addon nativo. Os dados espeak-ng-data vêm dentro do pacote npm. | npm view piper-phonemize-node / piper-phonemize-win-x64 / piper-phonemize ; conteúdo do tarball piper-phonemize-win-x64-1.5.9.tgz |
| @ricky0123/vad-web 0.0.31 (ISC, 12/09/2026) traz silero_vad_v5.onnx, silero_vad_v6.onnx e o worklet no pacote npm. Padrões: positiveSpeechThreshold 0.3, redemptionMs 1400, preSpeechPadMs 800, minSpeechMs 400. | confirmado | O tarball contém dist/silero_vad_v5.onnx, silero_vad_v6.onnx, silero_vad_legacy.onnx e vad.worklet.bundle.min.js. Os padrões conferem; falta citar negativeSpeechThreshold, que tem padrão 0.25. O @ricky0123/vad-node 0.0.3 está parado desde 01/06/2024 (confirmado). | npm pack @ricky0123/vad-web@0.0.31 ; npm view @ricky0123/vad-node |
| Smart Turn v3.2: ~8,7 MB em float32, 23 idiomas incluindo português, BSD-2-Clause, licença dos pesos não verificada; o arquivo smart-turn-v3.2-cpu.onnx está versionado no repositório do Pipecat (8.679.182 bytes, sem LFS). | confirmado | O arquivo existe em raw.githubusercontent.com com exatamente 8.679.182 bytes, e o Pipecat 1.15.0 saiu em 29/10/2026 (PyPI). Correções: o README oficial diz que a versão CPU é QUANTIZADA em int8 (~8 MB) e que a versão GPU é fp32 (~32 MB), então o rótulo 'float32' está errado. Os pesos também são abertos: 'truly open model (BSD 2-clause license)... datasets, training script, and model weights are all open source'. O idioma listado é 'Portuguese', com a bandeira de Portugal, sem dado específico de pt-BR. | https://raw.githubusercontent.com/pipecat-ai/smart-turn/main/README.md ; https://raw.githubusercontent.com/pipecat-ai/pipecat/main/src/pipecat/audio/turn/smart_turn/data/smart-turn-v3.2-cpu.onnx ; https://pypi.org/pypi/pipecat-ai/json |
| Cancelamento de eco: o padrão do ChromeWideEchoCancellation no Electron 45 não foi verificado; seria preciso testar app.commandLine.appendSwitch('enable-features','ChromeWideEchoCancellation'). A issue electron#47043 confirma que o áudio de outros apps não é cancelado. | desatualizado | O Electron 45.2.1 usa o Chromium 156.0.8078.75 (arquivo DEPS). Nessa versão, media_switches.cc declara BASE_FEATURE(kChromeWideEchoCancellation, FEATURE_ENABLED_BY_DEFAULT), disponível em Windows, macOS e Linux, e o feature_list.cc do Electron 45.2.1 NÃO desliga esse recurso. Então, pelo código-fonte, o AEC de todo o Chromium já vem LIGADO, e o TTS tocado pelo próprio app (WebAudio ou elemento Audio) deve entrar como referência de eco. O appendSwitch é redundante; teste prático continua obrigatório. A issue #47043 é real: aberta em 09/05/2025 contra o Electron 37, fechada como 'not planned' em 03/06/2025. Ela confirma que o áudio de outros apps não é cancelado, e há relatos no macOS de Electron sem cancelamento algum. | https://raw.githubusercontent.com/electron/electron/v45.2.1/DEPS ; https://raw.githubusercontent.com/chromium/chromium/156.0.8078.75/media/base/media_switches.cc ; https://raw.githubusercontent.com/chromium/chromium/main/media/media_options.gni ; https://raw.githubusercontent.com/electron/electron/v45.2.1/shell/browser/feature_list.cc ; https://github.com/electron/electron/issues/47043 |
| Supertonic 3: 31 idiomas incluindo pt, pesos OpenRAIL-M, código MIT, modelo no GitHub do sherpa. Há relato não confirmado de dissolução da Supertone. | desatualizado | Agora está confirmado. O README de supertone-inc/supertonic diz: 'This repository is archived. Development and support have ended... No updates, bug fixes, security patches, or support will be provided'. O código foi para a organização supertone-oss-archive. As licenças (MIT no código, OpenRAIL-M nos pesos), os 31 idiomas com 'pt' genérico e o lançamento do Supertonic 3 em 29/04/2026 estão confirmados. O modelo int8 do sherpa existe no GitHub (128.774.318 bytes). Na prática, é um projeto congelado: pode ser usado, mas sem correções. | https://raw.githubusercontent.com/supertone-inc/supertonic/main/README.md ; https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/sherpa-onnx-supertonic-3-tts-int8-2026-05-11.tar.bz2 |
| Moonshine (v2, só inglês) e SenseVoice (zh/en/ja/ko/yue) não suportam português; vosk-browser está parado desde 2022; kokoro-js parado desde 05/2025; vozes Kokoro pt com ids 42 a 44. | confirmado | SenseVoiceSmall: só mandarim, cantonês, inglês, japonês e coreano (README). Moonshine: não tem português, mas já NÃO é só inglês; tem modelos streaming MIT para ar, de, ja, zh, es, tl e vi. vosk-browser 0.0.8: última publicação em 25/12/2022. kokoro-js 1.2.1: 03/05/2025. O generate_voices_bin.py do sherpa mapeia 42 para pf_dora, 43 para pm_alex e 44 para pm_santa. | https://raw.githubusercontent.com/moonshine-ai/moonshine/main/docs/models/available-models.md ; https://raw.githubusercontent.com/FunAudioLLM/SenseVoice/main/README.md ; npm view vosk-browser / kokoro-js ; https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/master/scripts/kokoro/v1.0/generate_voices_bin.py |
| Piper pt_BR (faber, cadu, jeff, edresson, miro, dii) em GitHub releases do sherpa; faber com licença CC0 ou MIT (conflito); miro e dii CC BY-NC-SA. | confirmado | As 6 vozes vits-piper-pt_BR-* respondem HTTP 200 nos tts-models (faber-medium tem ~67 MB). O MODEL_CARD do faber dentro do arquivo diz 'Language: pt_BR... Dataset License: CC0... Finetuned from U.S. English lessac voice', a 22.050 Hz. Isso resolve o conflito a favor de CC0, ao menos para o dataset. A licença CC BY-NC-SA de miro e dii não pôde ser verificada (Hugging Face bloqueado). | https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-pt_BR-faber-medium.tar.bz2 (MODEL_CARD) |
| ElevenLabs: Flash v2.5, Turbo e v4 Turbo a US$0,04 por mil caracteres; v4, v3 e Multilingual a US$0,08; Scribe v2 Realtime a US$0,39/h; v3, v4 e v4 Turbo não funcionam no endpoint stream-input e usam o Text-to-Dialogue WS. | confirmado | Preços de TTS confirmados por fonte secundária (LiteLLM, citando elevenlabs.io/pricing/api): eleven_flash_v2_5 e eleven_v4_turbo a US$0,04 por mil; eleven_v4, eleven_v3 e eleven_multilingual_v2 a US$0,08 por mil. No SDK 2.75.0, TextToDialogueTtsModelId = eleven_flash_v2_5 \| eleven_v3 \| eleven_v4_turbo, o que bate com a afirmação sobre o Text-to-Dialogue. O SDK também traz modelos que o relatório não cita: eleven_v3_conversational e scribe_v2_turbo. O preço de US$0,39/h do Scribe v2 Realtime NÃO foi verificado (o LiteLLM só lista scribe_v2 em lote, ~US$0,22/h), e o elevenlabs.io estava bloqueado. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json ; npm @elevenlabs/elevenlabs-js@2.75.0 (TextToDialogueTtsModelId.d.ts, TtsConversationalModel.d.ts) |
| Soniox stt-rt-v5 a US$0,12/h e WER de 1,25% em português. | não verificável | O preço de US$0,12/h (US$0,002/min) é confirmado pelo LiteLLM, que cita soniox.com/pricing. O WER de 1,25% em pt é alegação do fornecedor, e o soniox.com estava bloqueado: continua não verificável. O @soniox/node 2.4.0 (MIT, 12/10/2026) confirma stt-rt-v5 e também traz TTS (tts-rt-v2), que o relatório não citou. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json ; npm @soniox/node@2.4.0 |
| Deepgram: Nova-3 em streaming a US$0,0077/min (promoção de US$0,0048), multilíngue a US$0,0092 (promoção de US$0,0058), Flux Multilingual a ~US$0,0078. O Flux tem EagerEndOfTurn, TurnResumed e eager_eot_threshold em /v2/listen. O Aura-2 não tem português. | não verificável | O deepgram.com estava bloqueado, e o LiteLLM só lista o nova-3 em lote a US$0,0043/min. Nenhum preço de streaming ou promoção pôde ser conferido. O resto foi confirmado no @deepgram/sdk 5.17.0: o modelo 'flux-general-multi', /v2/listen, os eventos EagerEndOfTurn e TurnResumed e o parâmetro eager_eot_threshold. As vozes Aura-2 enumeradas no SDK cobrem só de, en, es, fr, it, ja e nl, sem pt, o que confirma que o Aura-2 não tem português. | npm pack @deepgram/sdk@5.17.0 ; https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json |
| Azure Neural TTS a ~US$15–16 por milhão de caracteres (HD ~US$22–30/M) e STT em tempo real a ~US$1/h. | não verificável | A fonte oficial (azure.microsoft.com, prices.azure.com) estava bloqueada. Uma fonte secundária concorda: o LiteLLM tem azure-tts a US$15/M, azure-tts-hd a US$30/M e azure-stt a US$0,000278/s (US$1/h), citando a calculadora do Azure. A cota grátis de 0,5 milhão de caracteres por mês não foi verificada. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json |
| Mistral Voxtral Realtime a US$0,006/min. | confirmado | O LiteLLM tem voxtral-mini-transcribe-realtime-2602 a US$0,0001/s (US$0,006/min). Já existe uma versão mais nova, voxtral-mini-transcribe-realtime-3, a US$0,008/min, e a Mistral agora tem TTS (voxtral-mini-tts-3 a ~US$13 por milhão de caracteres). Fonte secundária; mistral.ai bloqueado. | https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json |
| AssemblyAI Universal-Streaming Multilingual a US$0,15/h cobrado por tempo de conexão; Universal-3.5/3.6 Pro Realtime a US$0,45/h. | não verificável | O assemblyai.com estava bloqueado, e o LiteLLM não tem esses itens. O SDK assemblyai 4.42.0 (MIT, 26/10/2026) confirma que os modelos existem: universal-streaming-multilingual, universal-streaming-english, u3-rt-pro, universal-3-5-pro e universal-3-6-pro. | npm pack assemblyai@4.42.0 |

**Alternativas que a pesquisa inicial não considerou:**

- OpenAI Live API (client.live, modelo 'gpt-live-1'; openai ≥7.14.0, de 10/09/2026; não está no @openai/agents-realtime). É speech-to-speech com delegation {type:'client'}: o servidor emite session.delegation.created, o app (Claude) resolve a tarefa e devolve o resultado por session.commentary.append ou session.thinking.append (até 500 tokens), e acknowledgement_delay_ms faz o modelo falar um 'só um instante' sozinho. Também separa o frontend WebRTC 'não confiável', com permissões do data channel definidas em client_config, de uma conexão sideband confiável a partir do main. Tem 23 vozes (inclui 'bossa'; sotaque pt-BR não verificado). Preço segundo o LiteLLM: US$0,000833/s, ~US$0,05/min ou ~US$3/h de sessão (não oficial). É exatamente o padrão 'delegar_ao_cerebro' que o relatório propõe montar à mão sobre o gpt-realtime-2.1.
- Gemini 3.5 Transcribe Live (Google): STT em streaming pela Live API, com code-mixing, cobrando só os tokens finais. Preço oficial no Vertex AI: US$3,50 por milhão de tokens de áudio + US$21 por milhão de tokens de texto, preço médio efetivo de ~US$0,0089/min. A versão síncrona sai a ~US$0,0051/min. Suporte e qualidade em pt-BR não verificados.
- Soniox TTS (tts-rt-v2) no mesmo @soniox/node 2.4.0: um fornecedor só para STT e TTS em tempo real. Preço e suporte a pt não verificados.
- Mistral Voxtral Mini TTS 3 (~US$13 por milhão de caracteres, segundo o LiteLLM) e Voxtral Mini Transcribe Realtime 3 (~US$0,008/min). Suporte a pt-BR não verificado.
- piper-phonemize (variante WebAssembly, 1.5.9, GPL-3.0-or-later): fonetização para as vozes Piper no renderer ou em Worker, sem addon nativo. Existe também o binário pronto piper-phonemize-win-x64 1.5.9 (N-API).
- Exports do Nemotron-3.5 streaming com chunks de 80, 160 e 320 ms (int8, no GitHub). São bem melhores para conversa do que o 1120 ms do exemplo.
- ElevenLabs eleven_v3_conversational (TtsConversationalModel) e scribe_v2_turbo, presentes no SDK 2.75.0 e não avaliados.
- Deepgram Nova-3 monolíngue com language=pt-BR, em vez de language=multi. Para um único usuário que fala pt-BR, tende a ser mais barato e mais preciso. Preços não verificados.
