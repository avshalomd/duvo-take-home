/** The earlier run a follow-up continues, as much of it as the new prompt carries over. */
export type ParentRun = {
  prompt: string;
  report: string | null;
  files: { name: string; bytes: number }[];
};

export const REPORT_HEAD_CHARS = 1500; // enough for the report's summary; the files themselves are on disk to read

const size = (bytes: number) => (bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`);

/**
 * The follow-up's prompt. It is sent even when the SDK resumes the parent's session, because a session can be gone
 * (on Vercel /tmp is per instance, a worker is another machine): with this preamble a follow-up works either way.
 * The change comes last, so the last thing the agent reads is what to do now.
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

  return [
    "This continues an earlier run. Its instructions were:",
    "<earlier-instructions>",
    parent.prompt,
    "</earlier-instructions>",
    files,
    "Its report began:",
    "<earlier-report>",
    report,
    "</earlier-report>",
    "",
    "Set a plan for the change first. Read the files you need, make the change, and write each changed file back " +
      "under the same name unless the user asks for a new file. Leave the other files as they are.",
    "",
    "The user now asks for this change:",
    change,
  ].join("\n");
}

/** What the evaluator and the step checks judge a follow-up against: the original instructions plus the change. */
export function followUpInstructions(parentPrompt: string, change: string): string {
  return `${parentPrompt}\n\nThen the user asked for a change: ${change}`;
}
