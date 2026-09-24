import type { Plan } from "@/contracts/run";

/** The earlier run a follow-up continues, as much of it as the new prompt carries over. */
export type ParentRun = {
  prompt: string;
  report: string | null;
  files: { name: string; bytes: number }[];
  plan: Plan | null; // its final plan: each step with its status and note
  verdict: "pass" | "pass_with_notes" | "fail" | "unknown" | null; // the automatic check's headline
  feedback: string | null; // the check's findings as instructions (feedbackForAgent)
};

export const REPORT_HEAD_CHARS = 3000; // the report's substance; the files themselves are on disk to read

const size = (bytes: number) => (bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`);

/** "1. Search the web - done: found 12 stories", one line per step, as the plan ended. */
function planLines(plan: Plan | null): string {
  if (!plan?.steps.length) return "It set no plan.";
  const steps = plan.steps.map((s) => `${s.index + 1}. ${s.title} - ${s.status}${s.note ? `: ${s.note}` : ""}`);
  return ["Its plan, as it ended:", ...steps].join("\n");
}

/**
 * What the automatic check said about the earlier result, when there is something to act on. His follow-up of
 * 2026-09-23 ("fix the table") was never told its parent failed on row 7, and reported the CSV "structurally fine".
 */
function findings(parent: ParentRun): string[] {
  if (!parent.feedback?.trim()) return [];
  if (parent.verdict === "fail") return ["The automatic check failed that result. What it found:", "<check-findings>", parent.feedback, "</check-findings>"];
  if (parent.verdict === "pass_with_notes") return ["The automatic check passed that result, with notes.", "<check-findings>", parent.feedback, "</check-findings>"];
  return []; // a pass has nothing to fix, and "unknown" means nobody looked
}

/**
 * The follow-up's prompt: the earlier run's instructions (the whole thread), its plan with each step's status and
 * note, its files, its report and what the automatic check found - then the change. It is sent even when the SDK
 * resumes the parent's session, because a session can be gone (on Vercel /tmp is per instance, a worker is another
 * machine). The change comes last, so the last thing the agent reads is what to do now.
 */
export function carryOverPrompt(parent: ParentRun, change: string): string {
  const files = parent.files.length
    ? `Its files are already in your working directory: ${parent.files.map((f) => `${f.name} (${size(f.bytes)})`).join(", ")}.`
    : "It produced no files.";
  const report = parent.report
    ? parent.report.length > REPORT_HEAD_CHARS
      ? `${parent.report.slice(0, REPORT_HEAD_CHARS)}...`
      : parent.report
    : "(it ended with no report)";
  const found = findings(parent);

  return [
    "This continues an earlier run. Its instructions were:",
    "<earlier-instructions>",
    parent.prompt,
    "</earlier-instructions>",
    planLines(parent.plan),
    files,
    "Its report:",
    "<earlier-report>",
    report,
    "</earlier-report>",
    ...found,
    "",
    "Set a plan for the change first. Read the files you need, make the change, and write each changed file back " +
      "under the same name unless the user asks for a new file. Leave the other files as they are.",
    ...(found.length ? ["Fix what it found as part of this change, and check the files yourself before you finish."] : []),
    // This run's report stands for the whole thread: it is judged against every instruction so far, and it is what
    // "Make an automation" and the next change read.
    // qa-ai F5: "I re-checked the file against your original request" reached the person as the report.
    "End with your report for the person: the answer to the whole task with this change made - the earlier report " +
      "brought up to date, not only this change. It may say what changed in terms of the work, but never mention " +
      "a check, an earlier run, a correction or re-checking.",
    "",
    "The user now asks for this change:",
    change,
  ].join("\n");
}

/** What the evaluator and the step checks judge a follow-up against: the original instructions plus the change. */
export function followUpInstructions(parentPrompt: string, change: string): string {
  return `${parentPrompt}\n\nThen the user asked for a change: ${change}`;
}
