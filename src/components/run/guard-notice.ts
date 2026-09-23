import type { RunState } from "@/contracts/run";

// What the guards did to a run, said to the person who asked for it. The raw decision - the guard's reason, the
// tool, the address - is technical and stays in Details; this is the one sentence a reader of the run needs.

export type GuardNotice = { text: string; tone: "warn" | "idle"; count: number };
type Guard = NonNullable<RunState["guards"]>[number];

// The url guard blocks for four causes and says which in its reason (src/lib/agent/guards/url.ts). The notice names
// the cause, so a site blocked in Settings is not reported as an attack (Q127).
function urlBlocked(g: Guard): string {
  if (g.reason.includes("private or local address")) return "The agent tried to open a private or local address. It was stopped.";
  if (g.reason.includes("blocked in this workspace's settings"))
    return `The agent tried to open ${g.target ?? "a site"}, which is blocked in Settings. It was stopped.`;
  if (g.reason.startsWith("Only web pages")) return "The agent tried to open an address that is not a web page. It was stopped.";
  if (g.reason.includes("carries the task's data")) return "A web page tried to make the agent send your data elsewhere. It was stopped.";
  return "The agent was stopped from opening a web address.";
}

function sentence(g: Guard): string {
  if (g.decision === "unchecked") return "A safety check could not run, so one step went ahead unchecked.";
  const stopped = g.decision === "blocked";
  switch (g.guard) {
    case "url":
      return stopped ? urlBlocked(g) : "The agent opened a web address that might pass your data on. It was let through and marked.";
    case "write":
      return stopped ? "The agent tried to save a password or key in a file. It was stopped." : "The agent saved something that looked like a password or key.";
    case "path":
      return stopped ? "The agent tried to reach files outside its own folder. It was stopped." : "The agent reached for files outside its own folder.";
    case "connection": {
      const name = g.target ?? "a connection";
      return stopped ? `The agent tried to use ${name}, which was not in its plan. It was stopped.` : `The agent used ${name}, which was not in its plan.`;
    }
    default:
      return stopped ? "A safety check stopped one of the agent's steps." : "A safety check marked one of the agent's steps.";
  }
}

/** One notice per distinct sentence, in the order they first happened, with how often each one happened. */
export function guardNotices(guards: NonNullable<RunState["guards"]>): GuardNotice[] {
  const notices: GuardNotice[] = [];
  for (const g of guards) {
    const text = sentence(g);
    const seen = notices.find((n) => n.text === text);
    if (seen) seen.count += 1;
    else notices.push({ text, tone: g.decision === "unchecked" ? "idle" : "warn", count: 1 });
  }
  return notices;
}
