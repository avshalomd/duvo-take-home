import type { RunEvent } from "@/contracts/run";

export type EventGroup = {
  key: string;
  title: string;
  // stopped: where a failed or stopped run ended; a finished run has no group left pending or running
  status: "pending" | "running" | "done" | "skipped" | "stopped";
  events: RunEvent[];
};

const LIVE = ["queued", "running", "evaluating"];

// The agent works step by step, so the timeline is read step by step: every event is filed under the plan step
// that was running when it arrived. What happened before the agent had a plan goes under "Planning". Each attempt
// to fix the result (auto-heal) opens its own group, headed by the attempt, with what the agent was told first.
export function groupEvents(events: RunEvent[], runStatus = "running"): EventGroup[] {
  const live = LIVE.includes(runStatus);
  const groups: EventGroup[] = [];
  const keys = new Set<string>();
  const latestVisit = new Map<number, EventGroup>(); // a step's newest group: the one the plan's status now belongs to
  let current: EventGroup | null = null;
  let currentStep: number | null = null;
  let heal: EventGroup | null = null; // the latest attempt: the agent may open step groups inside it, as it redoes steps
  // the report is shown on the run's page: its copy as the agent's closing text would be a wall of raw markdown here
  const reports = new Set(events.flatMap((e) => (e.kind === "finished" ? [e.payload.result.trim()] : [])));

  function open(key: string, title: string, status: EventGroup["status"]): EventGroup {
    // the agent can come back to a step (after a fix, or to redo it): each visit is a group with a key of its own
    let unique = key;
    for (let n = 2; keys.has(unique); n++) unique = `${key}-${n}`;
    keys.add(unique);
    const group: EventGroup = { key: unique, title, status, events: [] };
    groups.push(group);
    return group;
  }

  for (const event of events) {
    if (event.kind === "heal") {
      const { attempt, max, stopped } = event.payload;
      // the engine stopped trying instead (Q148): it never ran. Otherwise under way until the agent's result for it
      // arrives; a run that ended without one was stopped or broke in the middle of it
      const status = stopped ? "skipped" : live ? "running" : "pending";
      heal = open(`heal-${attempt}`, `${stopped ? "Stopped trying" : "Fixing what the check found"} - attempt ${attempt} of ${max}`, status);
      heal.events.push(event);
      current = heal;
      currentStep = null;
      continue;
    }
    if (event.kind === "finished" && heal) heal.status = "done";
    if (event.kind === "plan") {
      if (current?.key === "planning") current.status = "done"; // the plan exists: planning is over
      const running = event.payload.steps.find((s) => s.status === "running");
      // no running step (the plan was only just set, or everything is done): keep filing under the current group
      if (running && currentStep !== running.index) {
        current = open(`step-${running.index}`, running.title, "running");
        currentStep = running.index;
        latestVisit.set(running.index, current);
      }
      // a step's status is whatever the latest plan says; an earlier visit to it keeps the status it was left with
      for (const step of event.payload.steps) {
        const group = latestVisit.get(step.index);
        if (group) group.status = step.status;
      }
      continue; // the plan itself is the header, not a line in the list
    }
    if (event.kind === "text" && reports.has(event.payload.text.trim())) continue;
    if (!current) current = open("planning", "Planning", "running");
    current.events.push(event);
  }

  // A run that is over waits for nothing. Where a failed or stopped run ended is marked; every other group that was
  // left pending or running was worked on and then left behind, so it reads as done.
  if (!live) {
    const stoppedMidway = runStatus === "failed" || runStatus === "cancelled";
    groups.forEach((group, i) => {
      if (group.status !== "pending" && group.status !== "running") return;
      group.status = stoppedMidway && i === groups.length - 1 ? "stopped" : "done";
    });
  }
  return groups;
}
