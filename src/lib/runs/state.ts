import type { DeriveState } from "@/contracts/run";

// STUB - the engine package derives the real state from the events (pure, no I/O).
export const deriveState: DeriveState = (run, events) => ({
  status: run.status, turn: events.filter((e) => e.kind === "tool_call").length, maxTurns: 25,
  plan: null, currentStep: null, lastTool: null, toolsUsed: [], connections: [], files: [],
  costUsd: run.costUsd, durationMs: run.durationMs, error: run.error,
});
