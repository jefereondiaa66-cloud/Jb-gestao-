/**
 * Leitura de áudio PCM16 transmitido por HTTP (OpenAI, ElevenLabs): junta
 * os bytes em pedaços de ~100 ms e respeita o cancelamento.
 */
import type { AudioChunk } from '../../types';
import { Pcm16Decoder, concatFloat32 } from '../audio';
import { abortError } from '../errors';

export async function* readPcm16Stream(
  body: ReadableStream<Uint8Array>,
  sampleRate: number,
  signal?: AbortSignal,
  chunkMs = 100,
): AsyncGenerator<AudioChunk> {
  const reader = body.getReader();
  const decoder = new Pcm16Decoder();
  const minSamples = Math.max(1, Math.round((sampleRate * chunkMs) / 1000));
  let pending: Float32Array[] = [];
  let pendingLen = 0;
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw abortError();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortError();
      if (done) break;
      if (!value || value.length === 0) continue;
      const samples = decoder.push(value);
      if (samples.length === 0) continue;
      pending.push(samples);
      pendingLen += samples.length;
      if (pendingLen >= minSamples) {
        yield { samples: concatFloat32(pending), sampleRate };
        pending = [];
        pendingLen = 0;
      }
    }
    if (pendingLen > 0) yield { samples: concatFloat32(pending), sampleRate };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      /* leitor já liberado */
    }
  }
}
