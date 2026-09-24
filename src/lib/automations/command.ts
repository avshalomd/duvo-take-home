import type { ParseCommand } from "@/contracts/automation";

// A front slash (his call: the prefix people know from coding agents; a backslash is plain text), then everything up
// to the first space is the command, then the input. His call again (2026-09-24, QA F14): any text that opens with
// "/" and a character that is not a space is a command - "/über test", "/2024-report x" and "/audit, Apple" had
// become paid free-text runs. One that no automation has is refused in its words. "please run /audit x" is a sentence.
const COMMAND = /^\s*\/(\S+)(?:\s+([\s\S]*))?$/;

/** "/audit Apple Inc." -> { command: "audit", input: "Apple Inc." }; plain text, "\audit" and "/ x" -> null. */
export const parseCommand: ParseCommand = (text) => {
  const m = COMMAND.exec(text);
  if (!m) return null;
  return { command: m[1].toLowerCase(), input: (m[2] ?? "").trim() }; // commands are stored lower-case
};

// What an automation's command can be (CommandName in contracts/automation.ts, and what toCommandName makes)
const NAME = /^[a-z][a-z0-9-]{1,23}$/;

/** "There's no /über command." for a name no automation can have, before anything is looked up; null otherwise. */
export function unknownCommandRefusal(command: string): string | null {
  return NAME.test(command) ? null : `There's no /${command} command.`;
}

// What may follow a command, the same limit as a schedule's input. Checked on its own, in its own words: a longer one
// made the filled brief pass the 4000 characters a run takes, and the person read about "instructions" they never
// wrote (Q197).
export const MAX_COMMAND_INPUT = 2000;

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
