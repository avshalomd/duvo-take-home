// The composer's command helpers: "\audit Acme Ltd" (or "/audit ...") runs the saved automation "audit" on "Acme Ltd".
// Parsing a whole command for the server is parseCommand's job (the automations package); these only drive the
// list under the box while a command is being typed, and name the command a refused text asked for.

const PARTIAL = /^\s*[\\/]([a-z][a-z0-9-]*)?$/i; // a prefix and the start of a word, nothing after it yet
const WORD = /^\s*[\\/]([a-z][a-z0-9-]*)(?:\s|$)/i;

/** The partial command being typed ("" right after the prefix), or null when the list should be closed. */
export function commandQuery(text: string): string | null {
  const m = PARTIAL.exec(text);
  return m ? (m[1] ?? "").toLowerCase() : null;
}

/** Replaces the partial command with the chosen one and a space, so the cursor is where the input goes. */
export function applyCommand(text: string, command: string): string {
  const prefix = text.trimStart()[0] === "/" ? "/" : "\\"; // keep the prefix the person chose
  return `${prefix}${command} `;
}

/** The command word a text starts with, whether or not such an automation exists. */
export function commandWord(text: string): string | null {
  const m = WORD.exec(text);
  return m ? m[1].toLowerCase() : null;
}

/** Commands that start with the query first (what the person is typing), then names that contain it. */
export function filterAutomations<T extends { command: string; name: string }>(list: T[], query: string): T[] {
  const q = query.toLowerCase();
  const byCommand = list.filter((a) => a.command.startsWith(q));
  const byName = list.filter((a) => !byCommand.includes(a) && a.name.toLowerCase().includes(q));
  return [...byCommand, ...byName];
}
