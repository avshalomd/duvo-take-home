import { importSessionToStore, type SessionStore } from "@anthropic-ai/claude-agent-sdk";

// A run stopped mid-way gets no result message, so no cost: Limits' "Spent today" left it out (QA Q129). The CLI still
// writes its own totals to the session transcript as it shuts down after the abort - a "cost-state" entry, checked on
// a stopped run on 2026-09-23 ($0.0988, the helper model's web searches included, which the token counts alone miss).

/** The SDK's own totals for a session: what its CLI writes to the transcript as it shuts down. */
export type SdkTotals = { costUsd: number; durationMs: number | null };

type Rec = Record<string, unknown>;

/** The last cost-state entry of a session transcript, or null when there is none. */
export function costStateOf(entries: unknown[]): SdkTotals | null {
  const states = entries.filter((e): e is Rec => !!e && typeof e === "object" && (e as Rec).type === "cost-state");
  const last = states.at(-1); // a resumed session writes its own after the parent's: the newest is this process's
  if (!last || typeof last.totalCostUSD !== "number") return null;
  return { costUsd: last.totalCostUSD, durationMs: typeof last.totalDuration === "number" ? last.totalDuration : null };
}

/** Every entry of a local session transcript, through the SDK's own reader rather than a guessed file path. */
async function transcriptEntries(sessionId: string): Promise<unknown[]> {
  const entries: unknown[] = [];
  const collector = {
    append: async (_key: unknown, batch: unknown[]) => void entries.push(...batch),
    load: async () => null,
  } as unknown as SessionStore;
  await importSessionToStore(sessionId, collector, { includeSubagents: false });
  return entries;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Read a stopped session's totals, waiting up to `waitMs` for the CLI to write them as it shuts down. */
export async function readSdkTotals(
  sessionId: string,
  opts: { load?: (sessionId: string) => Promise<unknown[]>; waitMs?: number; everyMs?: number } = {},
): Promise<SdkTotals | null> {
  const { load = transcriptEntries, waitMs = 3000, everyMs = 250 } = opts;
  const until = Date.now() + waitMs;
  for (;;) {
    try {
      const totals = costStateOf(await load(sessionId));
      if (totals) return totals;
    } catch {
      return null; // no transcript on this machine: nothing to wait for
    }
    if (Date.now() >= until) return null; // never hold the run's close for long
    await sleep(everyMs);
  }
}

/** The cost, duration and turns a stopped run records: the most exact source that exists. */
export function stoppedTotals(args: {
  end: { total_cost_usd: number; duration_ms: number; num_turns: number } | null;
  sdk: SdkTotals | null;
  startedAt: number;
  now: number;
  turns: number;
  costBase?: number;
}): { costUsd: number | null; durationMs: number; numTurns: number } {
  const base = args.costBase ?? 0;
  // Stopped during the evaluation: the agent had finished, and its result says exactly what it cost.
  if (args.end) return { costUsd: ownCost(args.end.total_cost_usd, base), durationMs: args.end.duration_ms, numTurns: args.end.num_turns };
  return {
    costUsd: args.sdk ? ownCost(args.sdk.costUsd, base) : null, // no number rather than a guess: a token count misses the search helper's cost
    durationMs: args.sdk?.durationMs ?? args.now - args.startedAt,
    numTurns: args.turns,
  };
}

/**
 * A run's own share of the SDK's session total. A resumed or forked session "continues from the total its transcript
 * saved", so a follow-up's total carries its parent's again; `base` is that saved total (0 for a fresh session).
 */
export function ownCost(sessionTotal: number, base: number): number {
  return Math.max(0, sessionTotal - base); // never negative: the SDK's figure is an estimate, not a ledger
}
