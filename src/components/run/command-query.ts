// The composer's command helpers: "/audit Acme Ltd" runs the saved automation "audit" on "Acme Ltd". A front slash
// only, as in coding agents (his call, 2026-09-23): a backslash is plain text. Parsing a whole command for the server
// is parseCommand's job (the automations package); these drive the list under the box while a command is typed,
// and name the command a refused text asked for.

const PARTIAL = /^\s*\/([a-z][a-z0-9-]*)?$/i; // the slash and the start of a word, nothing after it yet
const WORD = /^\s*\/([a-z][a-z0-9-]*)(?:\s|$)/i;

/** The partial command being typed ("" right after the slash), or null when the list should be closed. */
export function commandQuery(text: string): string | null {
  const m = PARTIAL.exec(text);
  return m ? (m[1] ?? "").toLowerCase() : null;
}

/** Replaces the partial command with the chosen one and a space, so the cursor is where the input goes. */
export function applyCommand(text: string, command: string): string {
  void text; // the whole partial command is replaced
  return `/${command} `;
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
