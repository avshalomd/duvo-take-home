import type { RunView } from "./types";

export function shouldPoll(_status: string): boolean {
  throw new Error("not implemented");
}

export function parseRunPayload(_json: unknown): RunView | null {
  throw new Error("not implemented");
}
