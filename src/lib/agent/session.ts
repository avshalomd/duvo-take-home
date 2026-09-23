/** The SDK session id, read from the init message; null for every other message. */
export function sessionIdOf(message: unknown): string | null {
  throw new Error(`not implemented: sessionIdOf(${typeof message})`);
}
