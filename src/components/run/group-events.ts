import type { Plan, RunEvent } from "@/contracts/run";

export type EventGroup = {
  key: string;
  title: string;
  status: "planning" | "pending" | "running" | "done" | "skipped";
  events: RunEvent[];
};

const LIVE = ["queued", "running", "evaluating"];

// The agent works step by step, so the timeline is read step by step: every event is filed under the plan step
// that was running when it arrived. What happened before the agent had a plan goes under "Planning". Each attempt
// to fix the result (auto-heal) opens its own group, headed by the attempt, with what the agent was told first.
export function groupEvents(events: RunEvent[], runStatus = "running"): EventGroup[] {
  const groups: EventGroup[] = [];
  let current: EventGroup | null = null;
  let lastPlan: Plan | null = null;
  let heal: EventGroup | null = null; // the latest attempt: the agent may open step groups inside it, as it redoes steps

  for (const event of events) {
    if (event.kind === "heal") {
      const { attempt, max, stopped } = event.payload;
      // the engine stopped trying instead (Q148): it never ran. Otherwise under way until the agent's result for it
      // arrives; a run that ended without one was stopped or broke in the middle of it
      const status = stopped ? "skipped" : LIVE.includes(runStatus) ? "running" : "pending";
      const title = `${stopped ? "Stopped trying" : "Fixing what the check found"} - attempt ${attempt} of ${max}`;
      heal = { key: `heal-${attempt}`, title, status, events: [event] };
      current = heal;
      groups.push(heal);
      continue;
    }
    if (event.kind === "finished" && heal) heal.status = "done";
    if (event.kind === "plan") {
      lastPlan = event.payload;
      const running = event.payload.steps.find((s) => s.status === "running");
      // no running step (the plan was only just set, or everything is done): keep filing under the current group
      if (running && current?.key !== `step-${running.index}`) {
        current = { key: `step-${running.index}`, title: running.title, status: running.status, events: [] };
        groups.push(current);
      }
      continue; // the plan itself is the header, not a line in the list
    }
    if (!current) {
      current = { key: "planning", title: "Planning", status: "planning", events: [] };
      groups.push(current);
    }
    current.events.push(event);
  }

  // a step's status is whatever the last plan said: a step that finished later must not still read "running"
  if (lastPlan) {
    for (const group of groups) {
      const step = lastPlan.steps.find((s) => `step-${s.index}` === group.key);
      if (step) group.status = step.status;
    }
  }
  return groups;
}
