/**
 * Erros do módulo de voz. A mensagem é sempre em pt-BR simples, pronta para
 * aparecer na interface; o código ajuda a interface e os testes a reagir.
 */
export type VoiceErrorCode =
  | 'modelo_ausente'
  | 'download_falhou'
  | 'arquivo_corrompido'
  | 'arquivo_inseguro'
  | 'chave_ausente'
  | 'chave_recusada'
  | 'limite_uso'
  | 'servico_falhou'
  | 'sem_suporte'
  | 'audio_invalido'
  | 'motor_falhou'
  | 'cancelado';

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;

  constructor(code: VoiceErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'VoiceError';
    this.code = code;
  }
}

/** Erro de cancelamento (AbortSignal disparado). */
export function isAbortError(err: unknown): boolean {
  if (err instanceof VoiceError) return err.code === 'cancelado';
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'AbortError' || name === 'APIUserAbortError';
}

export function abortError(): VoiceError {
  return new VoiceError('cancelado', 'Cancelado.');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

/** Mensagem pt-BR para qualquer erro (sem vazar detalhes técnicos longos). */
export function voiceErrorMessage(err: unknown, fallback = 'Algo deu errado na voz.'): string {
  if (err instanceof VoiceError) return err.message;
  if (isAbortError(err)) return 'Cancelado.';
  return fallback;
}

/** Converte respostas HTTP de serviços de voz em erros pt-BR. */
export function httpVoiceError(service: string, status: number, detail = ''): VoiceError {
  const extra = detail ? ` (${detail.slice(0, 160)})` : '';
  if (status === 401 || status === 403) {
    return new VoiceError('chave_recusada', `A chave da ${service} foi recusada. Confira a chave nas configurações.`);
  }
  if (status === 429) return new VoiceError('limite_uso', `A ${service} recusou por limite de uso. Tente de novo daqui a pouco.`);
  if (status === 404) return new VoiceError('servico_falhou', `A ${service} não encontrou a voz ou o modelo pedido${extra}.`);
  return new VoiceError('servico_falhou', `A ${service} respondeu com erro ${status}${extra}.`);
}
