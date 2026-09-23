import { Plug } from "lucide-react";
import type { RunState } from "@/contracts/run";
import { connectionName, formatCost, formatDuration, toolLabel, turnsLine } from "./format";
import { Section } from "./section";
import { StatusBadge } from "./status-badge";

// The key state of the run, derived from the events at whatever point the run is at.
export function StateSection({ state, connections }: { state: RunState; connections: { name: string }[] }) {
  const checks = state.stepChecks ?? [];
  const guards = state.guards ?? [];
  const stepTitle = (i: number) => state.plan?.steps.find((s) => s.index === i)?.title ?? `step ${i + 1}`;
  const turns = turnsLine(state.status, state.turn, state.maxTurns);

  return (
    <Section title="State" aside={<StatusBadge status={state.status} />}>
      <dl data-testid="state-card" className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-[14px]">
        <Row label="Status">
          {state.status}
          {/* live: the turn it is on, of the cap; ended: how many it took (a run that failed before its first has none) */}
          {turns && ` - ${turns}`}
        </Row>
        <Row label="Last tool">
          {state.lastTool ? (
            <span className="font-mono text-[12px]">
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
                  <Plug className="size-3 shrink-0 text-slate" />
                  {connectionName(c.name, connections)} - {c.status}, {c.used ? "used by this run" : "not used by this run"}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Files">{state.files.length ? state.files.join(", ") : "-"}</Row>
        <Row label="Step checks">
          {checks.length === 0 ? (
            "-"
          ) : (
            <ul className="space-y-0.5">
              {checks.map((c) => (
                <li key={c.stepIndex} className="tabular-nums">
                  {stepTitle(c.stepIndex)}: {Math.round(c.onTrack * 100)}% on track - {c.note}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Guards">
          {guards.length === 0 ? (
            "nothing stopped or flagged"
          ) : (
            <ul className="space-y-0.5">
              {guards.map((g, i) => (
                <li key={i}>
                  {g.guard}: {g.decision}
                  {g.target && ` (${g.target})`} - {g.reason}
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Duration">
          <span className="tabular-nums">{formatDuration(state.durationMs)}</span>
        </Row>
        <Row label="Cost">
          <span className="tabular-nums">{formatCost(state.costUsd)}</span>
        </Row>
        {/* the run's error text is printed once, at the bottom of Details: repeating it here read as two failures */}
      </dl>
    </Section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
