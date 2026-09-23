import { CircleCheck, CircleDashed, CircleMinus, LoaderCircle } from "lucide-react";
import type { RunEvent } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { formatCost, formatDuration } from "./format";
import { LocalTime } from "./local-time";
import { groupEvents, type EventGroup } from "./group-events";
import { Empty, Section } from "./section";
import { ToolCard } from "./tool-card";

// the same icons as the plan stepper above, so a step means the same thing in both places
function GroupIcon({ status }: { status: EventGroup["status"] }) {
  if (status === "done") return <CircleCheck className="size-3.5 text-fern" />;
  if (status === "running") return <LoaderCircle className="size-3.5 animate-spin text-saffron" />;
  if (status === "skipped") return <CircleMinus className="size-3.5 text-slate" />;
  return <CircleDashed className="size-3.5 text-slate/60" />;
}

// The agent's trace, grouped under the plan step it belonged to: the evidence behind the verdict, in the shape
// the agent itself worked in.
export function TimelineSection({ events, connections }: { events: RunEvent[]; connections: { name: string }[] }) {
  const groups = groupEvents(events);
  return (
    <Section title="Timeline">
      {groups.length === 0 ? (
        <Empty>Nothing yet - the agent is starting.</Empty>
      ) : (
        <div data-testid="timeline" className="space-y-3">
          {groups.map((group) => (
            <Group key={group.key} group={group} connections={connections} />
          ))}
        </div>
      )}
    </Section>
  );
}

function Group({ group, connections }: { group: EventGroup; connections: { name: string }[] }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <GroupIcon status={group.status} />
        <span className={group.status === "done" ? "text-slate" : ""}>{group.title}</span>
      </p>
      <div className="mt-1 space-y-1.5 border-l border-hairline pl-3">{renderEvents(group.events, connections)}</div>
    </div>
  );
}

// A tool call and its result are one card, so the result is looked up by id and skipped when it comes round.
function renderEvents(events: RunEvent[], connections: { name: string }[]) {
  const results = new Map(events.filter((e) => e.kind === "tool_result").map((e) => [e.payload.tool_use_id, e]));
  const callIds = new Set(events.filter((e) => e.kind === "tool_call").map((e) => e.payload.tool_use_id));

  return events.map((event) => {
    switch (event.kind) {
      case "tool_call":
        return (
          <ToolCard
            key={event.seq}
            call={event}
            result={results.get(event.payload.tool_use_id)}
            connections={connections}
          />
        );
      case "tool_result":
        // shown inside its call's card; only an orphan (its call fell in an earlier step) gets its own line
        return callIds.has(event.payload.tool_use_id) ? null : (
          <p key={event.seq} className="font-mono text-[11px] text-slate">
            {"-> "}
            {event.payload.preview}
          </p>
        );
      case "text":
        // the agent thinking out loud is context, not an action: a quiet paragraph, never a card
        return (
          <p key={event.seq} className="text-[13px] text-slate italic">
            {event.payload.text}
          </p>
        );
      case "guard":
        // the raw decision, for the reader of Details: the glance view only carries the plain-words notice
        return (
          <p
            key={event.seq}
            className={cn(
              "text-[11px]",
              event.payload.decision === "allowed" ? "text-slate" : "text-[color-mix(in_oklab,var(--saffron),var(--graphite)_40%)]",
            )}
          >
            guard {event.payload.guard}: {event.payload.decision} {event.payload.tool}
            {event.payload.target && ` (${event.payload.target})`} - {event.payload.reason}
          </p>
        );
      case "check":
        return (
          <p
            key={event.seq}
            className={cn("text-[11px] tabular-nums", event.payload.onTrack < 0.5 ? "text-[color-mix(in_oklab,var(--saffron),var(--graphite)_40%)]" : "text-slate")}
          >
            step check {event.payload.stepIndex + 1}: {Math.round(event.payload.onTrack * 100)}% on track - {event.payload.note}
          </p>
        );
      case "started":
        return (
          <p key={event.seq} className="flex gap-2 text-[11px] text-slate">
            <LocalTime iso={event.at} />
            started on {event.payload.model}
          </p>
        );
      case "finished":
        // the report itself is the panel's "What it produced" section: here the event is one line of bookkeeping
        return (
          <p
            key={event.seq}
            className={cn(
              "text-[13px] tabular-nums",
              event.payload.is_error ? "text-crimson" : "text-fern",
            )}
          >
            finished ({event.payload.subtype}) - {formatDuration(event.payload.duration_ms)},{" "}
            {formatCost(event.payload.total_cost_usd)}
          </p>
        );
      default:
        return null;
    }
  });
}
