import type { RunEvent } from "@/contracts/run";
import { formatClock, toolLine } from "./format";
import { Empty, Section } from "./section";

// The agent's trace, in order: what it said, what it called, what came back. The evidence behind the verdict.
export function TimelineSection({
  events,
  connections,
}: {
  events: RunEvent[];
  connections: { name: string }[];
}) {
  return (
    <Section title="Timeline">
      {events.length === 0 ? (
        <Empty>Nothing yet - the agent is starting.</Empty>
      ) : (
        <ul data-testid="timeline" className="space-y-1.5 text-xs">
          {events.map((e) => (
            <li key={e.seq} className="flex gap-2">
              <span className="shrink-0 font-mono text-muted-foreground">{formatClock(e.at)}</span>
              <span className="min-w-0 break-words">{line(e, connections)}</span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function line(e: RunEvent, connections: { name: string }[]) {
  switch (e.kind) {
    case "started":
      return <span className="text-muted-foreground">started on {e.payload.model}</span>;
    case "text":
      return <span>{e.payload.text}</span>;
    case "tool_call":
      return <span className="font-mono">{toolLine(e.payload.name, e.payload.input, connections)}</span>;
    case "tool_result":
      return (
        <span className={e.payload.is_error ? "font-mono text-red-600" : "font-mono text-muted-foreground"}>
          {"-> "}
          {e.payload.preview}
        </span>
      );
    case "plan":
      return <span className="text-muted-foreground">plan: {e.payload.steps.length} steps</span>;
    case "finished":
      return (
        <span className={e.payload.is_error ? "text-red-600" : "text-emerald-700"}>
          finished ({e.payload.subtype}) - {e.payload.result}
        </span>
      );
  }
}
