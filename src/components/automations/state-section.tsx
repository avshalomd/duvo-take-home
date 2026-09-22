import type { RunState } from "@/contracts/run";
import { formatCost, formatDuration } from "./format";
import { Section } from "./section";
import { StatusBadge } from "./status-badge";

// The key state of the run, derived from the events at whatever point the run is at.
export function StateSection({ state }: { state: RunState }) {
  const connections = state.connections.length
    ? state.connections.map((c) => `${c.name} ${c.status}${c.used ? ", used" : ", unused"}`).join(" - ")
    : "none";
  return (
    <Section title="State" aside={<StatusBadge status={state.status} />}>
      <dl data-testid="state-card" className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1 text-sm">
        <Row label="Status">
          {state.status} - turn {state.turn} of {state.maxTurns}
        </Row>
        <Row label="Last tool">
          {state.lastTool ? (
            <span className="font-mono text-xs">
              {state.lastTool.name} {state.lastTool.summary}
              {state.lastTool.viaConnection && ` (via ${state.lastTool.viaConnection})`}
            </span>
          ) : (
            "-"
          )}
        </Row>
        <Row label="Tools used">{state.toolsUsed.length ? state.toolsUsed.join(", ") : "-"}</Row>
        <Row label="Connections">{connections}</Row>
        <Row label="Files">{state.files.length ? state.files.join(", ") : "-"}</Row>
        <Row label="Cost / duration">
          {formatCost(state.costUsd)} / {formatDuration(state.durationMs)}
        </Row>
        {state.error && <Row label="Error">{<span className="text-red-600">{state.error}</span>}</Row>}
      </dl>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
