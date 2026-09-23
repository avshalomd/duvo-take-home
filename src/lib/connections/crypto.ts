import "server-only";

export class SecretError extends Error {}

/**
 * Connection secrets at rest: AES-256-GCM under CONNECTION_KEY (32 bytes, base64). The settings package builds it;
 * the OAuth package stores its tokens through it.
 */
export function encryptSecret(_plain: string): string {
  throw new Error("not implemented: encryptSecret"); // STUB: the settings package
}
export function decryptSecret(_sealed: string): string {
  throw new Error("not implemented: decryptSecret"); // STUB
}
