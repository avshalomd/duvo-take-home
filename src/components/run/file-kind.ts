import type { FileFlag } from "@/contracts/run";

// How a produced file is shown: a chart is previewed, a spreadsheet gets its own card, the rest are documents.
export type FileKind = "chart" | "spreadsheet" | "document";

export function fileKind(name: string): FileKind {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "svg") return "chart"; // only the chart tool makes .svg files (AgentLimits.toolFileExtensions)
  if (ext === "xlsx") return "spreadsheet";
  return "document";
}

/** "Contains 12 email addresses and 1 phone number": the personal data the output scan counted, or null. */
export function flagLine(flags: FileFlag[] | undefined): string | null {
  // a credential quarantines the file, and the quarantine warning says so: it is not repeated here
  const personal = (flags ?? []).filter((f) => f.kind !== "credential").map((f) => f.detail);
  if (personal.length === 0) return null;
  const list = personal.length === 1 ? personal[0] : `${personal.slice(0, -1).join(", ")} and ${personal[personal.length - 1]}`;
  return `Contains ${list}`;
}
