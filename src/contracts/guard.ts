import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { FileFlag, Plan } from "./run";

// Guardrails for an agent that reads the open web and connected services. Each guard is a PreToolUse hook with
// one job; every decision it takes is recorded as a `guard` run event so the user can see it.
export type GuardName = "path" | "url" | "write" | "connection";
export type GuardDecision = "allowed" | "blocked" | "flagged" | "unchecked";
export type GuardRecord = { guard: GuardName; tool: string; decision: GuardDecision; reason: string; target?: string };

export type GuardContext = {
  runId: string;
  dir: string; // the run's working directory
  deniedDomains: string[];
  strictConnections: boolean; // block (not flag) a connection call the plan did not name
  connectionNames: Record<string, string>; // mcp key -> the connection's display name
  plan: () => Plan | null; // the latest plan, read at call time
  record: (r: GuardRecord) => Promise<void>;
};
export type BuildGuardHooks = (ctx: GuardContext) => NonNullable<Options["hooks"]>;

/** The output scan, run on every file before it is stored: credentials quarantine it, personal data is counted. */
export type ScanOutput = (file: { name: string; content: string; encoding: "utf8" | "base64" }) => {
  flags: FileFlag[];
  quarantined: boolean;
};
