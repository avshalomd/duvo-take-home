import { Plug } from "lucide-react";
import type { RunState } from "@/contracts/run";
import { connectionName, formatCost, formatDuration, toolLabel } from "./format";
import { Section } from "./section";
import { StatusBadge } from "./status-badge";

// The key state of the run, derived from the events at whatever point the run is at.
export function StateSection({ state, connections }: { state: RunState; connections: { name: string }[] }) {
  return (
    <Section title="State" aside={<StatusBadge status={state.status} />}>
      <dl data-testid="state-card" className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <Row label="Status">
          {state.status}
          {/* a run that failed before its first turn has no turn count worth showing */}
          {state.turn > 0 && ` - turn ${state.turn} of ${state.maxTurns}`}
        </Row>
        <Row label="Last tool">
          {state.lastTool ? (
            <span className="font-mono text-xs">
              {toolLabel(state.lastTool.name, connections)} {state.lastTool.summary}
            </span>
          ) : (
            "-"
          )}
        </Row>
        <Row label="Tools used">
          {state.toolsUsed.length ? state.toolsUsed.map((t) => toolLabel(t, connections)).join(", ") : "-"}
        </Row>
        <Row label="Connections">
          {state.connections.length === 0 ? (
            "none"
          ) : (
            <ul className="space-y-0.5">
              {state.connections.map((c) => (
                <li key={c.name} className="flex items-center gap-1.5">
                  <Plug className="size-3 shrink-0 text-muted-foreground" />
                  {connectionName(c.name, connections)} - {c.status}, {c.used ? "used by this run" : "not used by this run"}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Files">{state.files.length ? state.files.join(", ") : "-"}</Row>
        <Row label="Duration">
          <span className="tabular-nums">{formatDuration(state.durationMs)}</span>
        </Row>
        <Row label="Cost">
          <span className="tabular-nums">{formatCost(state.costUsd)}</span>
        </Row>
        {state.error && (
          <Row label="Error">
            <span className="text-red-600 dark:text-red-400">{state.error}</span>
          </Row>
        )}
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
