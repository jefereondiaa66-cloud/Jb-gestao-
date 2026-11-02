/**
 * Camada de segurança do 300: política de permissões, confirmação, portão de
 * ferramentas, auditoria, guardas (caminhos, comandos, rede/SSRF), heurística
 * de injeção e guardas de segredos.
 */
export { wrapUntrusted, stripInvisible } from './untrusted';

export { DefaultPermissionPolicy } from './policy';

export { ConfirmationBroker } from './confirmation';
export type { ConfirmationBrokerDeps, ConfirmationRequestInput, RequestOptions } from './confirmation';

export { createToolGate } from './gate';
export type { ToolGateDeps } from './gate';

export { redactInput, redactText } from './redact';
export type { RedactOptions } from './redact';

export { PathGuard, SecurityError, defaultRoots } from './paths';
export type { PathGuardOptions, ResolveOptions, OsName } from './paths';

export { classifyCommand, buildSafeEnv } from './commands';
export type { CommandLevel, CommandClassification, ShellKind } from './commands';

export { safeFetch, validatePublicUrl, isBlockedAddress } from './net';
export type { SafeFetchOptions, SafeFetchResult } from './net';

export { scanForInjection, annotateUntrusted } from './injection';
export type { InjectionScan } from './injection';

export { EnvSecretStore, EncryptedFileSecretStore, aesGcmCipher } from './secrets';
export type { SecretCipher, EncryptedFileSecretStoreOptions } from './secrets';
