// Pure display helpers for the run panel. Kept out of the components so the one-liners can be tested without React.

export function toolLine(_name: string, _input: unknown, _connections: { name: string }[]): string {
  throw new Error("not implemented");
}

export function formatDuration(_ms: number | null): string {
  throw new Error("not implemented");
}

export function formatCost(_usd: number | null): string {
  throw new Error("not implemented");
}
