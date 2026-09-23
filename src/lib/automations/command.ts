import type { ParseCommand } from "@/contracts/automation";

// The prefix, then a name that starts with a letter, then either the end or whitespace and the input. The prefix must
// open the text: "please run \audit x" is a sentence, and "/usr/bin ..." fails because a "/" follows the name.
const COMMAND = /^\s*[\\/]([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/i;

/** "\audit Apple Inc." or "/audit Apple Inc." -> { command: "audit", input: "Apple Inc." }; anything else -> null. */
export const parseCommand: ParseCommand = (text) => {
  const m = COMMAND.exec(text);
  if (!m) return null;
  return { command: m[1].toLowerCase(), input: (m[2] ?? "").trim() }; // commands are stored lower-case
};

const MAX = 24; // CommandName's limit

/** Whatever a model or a person wrote ("/Company Audit") as a valid command ("company-audit"). */
export function toCommandName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // spaces, punctuation and the prefix all become one dash
    .replace(/^[^a-z]+/, "") // a command starts with a letter
    .slice(0, MAX)
    .replace(/-+$/, "");
  return slug.length >= 2 ? slug : "automation";
}

/** The command itself when it is free, else the first of base-2, base-3, ... that is, cut to fit 24 characters. */
export function nextFreeCommand(base: string, taken: string[]): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}
