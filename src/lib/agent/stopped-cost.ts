/** The SDK's own totals for a session: what its CLI writes to the transcript as it shuts down. */
export type SdkTotals = { costUsd: number; durationMs: number | null };

/** The last cost-state entry of a session transcript, or null when there is none. */
export function costStateOf(entries: unknown[]): SdkTotals | null {
  throw new Error(`not implemented: costStateOf(${entries.length})`);
}

/** Read a stopped session's totals, waiting up to `waitMs` for the CLI to write them as it shuts down. */
export async function readSdkTotals(
  sessionId: string,
  opts: { load?: (sessionId: string) => Promise<unknown[]>; waitMs?: number; everyMs?: number } = {},
): Promise<SdkTotals | null> {
  throw new Error(`not implemented: readSdkTotals(${sessionId}, ${opts.waitMs})`);
}

/** The cost, duration and turns a stopped run records: the most exact source that exists. */
export function stoppedTotals(args: {
  end: { total_cost_usd: number; duration_ms: number; num_turns: number } | null;
  sdk: SdkTotals | null;
  startedAt: number;
  now: number;
  turns: number;
}): { costUsd: number | null; durationMs: number; numTurns: number } {
  throw new Error(`not implemented: stoppedTotals(${args.turns})`);
}
