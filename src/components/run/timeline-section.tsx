import { CircleCheck, CircleDashed, CircleDot, CircleMinus, CircleStop, LoaderCircle } from "lucide-react";
import type { RunEvent } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { attemptCost, formatCost, formatDuration, relativeToRun, runFolders } from "./format";
import { LocalTime } from "./local-time";
import { groupEvents, type EventGroup } from "./group-events";
import { isTerminal } from "./poll";
import { Empty, Section } from "./section";
import { ToolCard } from "./tool-card";

// the same icons as the plan stepper above, so a step means the same thing in both places
function GroupIcon({ status }: { status: EventGroup["status"] }) {
  if (status === "done") return <CircleCheck className="size-3.5 text-fern" />;
  if (status === "running") return <LoaderCircle className="size-3.5 animate-spin text-saffron" />;
  if (status === "skipped") return <CircleMinus className="size-3.5 text-slate" />;
  if (status === "stopped") return <CircleStop aria-label="Stopped here" className="size-3.5 text-slate" />;
  if (status === "unmarked") return <CircleDot aria-label="Not marked" className="size-3.5 text-fern/60" />;
  return <CircleDashed className="size-3.5 text-slate/60" />;
}

// What the timeline's lines need besides the events: connection names, the run's folder for its paths, and
// whether the run is over (a call with no result on a finished run is not "waiting" any more).
type Context = { connections: { name: string }[]; folders: string[]; over: boolean };

// The agent's trace, grouped under the plan step it belonged to: the evidence behind the verdict, in the shape
// the agent itself worked in.
export function TimelineSection({ events, connections, runStatus }: { events: RunEvent[]; connections: { name: string }[]; runStatus: string }) {
  const groups = groupEvents(events, runStatus);
  const context: Context = { connections, folders: runFolders(events), over: isTerminal(runStatus) };
  return (
    <Section title="Timeline">
      {groups.length === 0 ? (
        <Empty>Nothing yet - the agent is starting.</Empty>
      ) : (
        <div data-testid="timeline" className="space-y-3">
          {groups.map((group) => (
            <Group key={group.key} group={group} context={context} />
          ))}
        </div>
      )}
    </Section>
  );
}

function Group({ group, context }: { group: EventGroup; context: Context }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <GroupIcon status={group.status} />
        <span className={group.status === "done" ? "text-slate" : ""}>{group.title}</span>
      </p>
      <div className="mt-1 space-y-1.5 border-l border-hairline pl-3">{renderEvents(group.events, context)}</div>
    </div>
  );
}

// A tool call and its result are one card, so the result is looked up by id and skipped when it comes round.
function renderEvents(events: RunEvent[], { connections, folders, over }: Context) {
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
            folders={folders}
            over={over}
          />
        );
      case "tool_result":
        // shown inside its call's card; only an orphan (its call fell in an earlier step) gets its own line
        return callIds.has(event.payload.tool_use_id) ? null : (
          <p key={event.seq} className="font-mono text-[11px] text-slate">
            {"-> "}
            {relativeToRun(event.payload.preview, folders)}
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
      case "heal":
        // auto-heal: what the check found, and the exact words the agent was then given - the feedback is for this
        // reader, the one who asks "what did it tell the agent?"
        return (
          <div key={event.seq} className="space-y-1 rounded-[10px] bg-saffron-wash/60 px-2.5 py-2 text-[12px]">
            <p className="text-slate">The check found: {event.payload.reasons.join("; ") || "no reasons given"}</p>
            {event.payload.stopped ? (
              // the engine's own reason for not trying again (Q148); the feedback was never sent
              <p className="text-graphite">{event.payload.stopped}</p>
            ) : (
              <>
                <p className="text-slate">The agent was told:</p>
                <pre className="font-mono text-[11px] whitespace-pre-wrap text-graphite">{event.payload.feedback}</pre>
              </>
            )}
          </div>
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
            {/* this attempt's own cost (Q149): the run's one total is in the state card above */}
            finished ({event.payload.subtype}) - {formatDuration(event.payload.duration_ms)},{" "}
            {formatCost(attemptCost(event.payload))}
          </p>
        );
      default:
        return null;
    }
  });
}
