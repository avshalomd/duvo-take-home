
// The composer's command helpers: "/audit Acme Ltd" runs the saved automation "audit" on "Acme Ltd". A front slash
// only, as in coding agents (his call, 2026-09-23): a backslash is plain text. Parsing a whole command for the server
// is parseCommand's job (the automations package); these drive the list under the box while a command is typed,
// and name the command a refused text asked for.

const PARTIAL = /^\s*\/([a-z][a-z0-9-]*)?$/i; // the slash and the start of a word, nothing after it yet
const WORD = /^\s*\/([a-z][a-z0-9-]*)(?:\s|$)/i;

/** The partial command being typed ("" right after the prefix), or null when the list should be closed. */
export function commandQuery(text: string): string | null {
  const m = PARTIAL.exec(text);
  return m ? (m[1] ?? "").toLowerCase() : null;
}

/** Replaces the partial command with the chosen one and a space, so the cursor is where the input goes. */
export function applyCommand(text: string, command: string): string {
  void text; // the whole partial command is replaced: only one prefix exists
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

const CHOSEN = /^\s*\/([a-z][a-z0-9-]*)\s+$/i; // a command, then whitespace, and nothing typed after it yet

/** What to type after a chosen command - the automation's input hint - until the input is typed (Q93). */
export function commandHint(text: string, ready: { command: string; hint: string }[]): string | null {
  const m = CHOSEN.exec(text);
  if (!m) return null;
  return ready.find((a) => a.command === m[1].toLowerCase())?.hint || null;
}

/** What the command list says when it has nothing to offer: none made, none ready (Q117), or none matching. */
export function emptyListLine({ ready, notReady, query }: { ready: number; notReady: number; query: string }): string {
  if (ready > 0) return `No ready automation starts with /${query}`;
  if (notReady === 1) return "Your automation is not ready yet - approve or turn it on in Automations";
  if (notReady > 1) return `None of your ${notReady} automations is ready yet - approve or turn one on in Automations`;
  return "No saved automations yet - make one from a finished run";
}

// What a file is, for someone who does not read extensions; anything unknown is simply "a file".
const KIND: Record<string, string> = {
  csv: "a CSV table",
  xlsx: "a spreadsheet",
  xls: "a spreadsheet",
  svg: "a chart",
  png: "a chart",
  md: "a document",
  txt: "a document",
  json: "a data file",
};
const FILE_FIRST = /^[\w.-]+\.([A-Za-z0-9]{1,5})\b\s*(.*)$/;

/**
 * An automation's output line, in plain words, for the command list and the tokens: its input named ("about
 * {input}" reads "about the topic", Q118), the file said by its kind ("output.csv" reads "a CSV table"), and the
 * template's fine print left to the automation's page - column names, and whatever follows the first comma.
 */
export function describeOutput(text: string, inputLabel: string): string {
  const line = text.replaceAll("{input}", `the ${inputLabel.toLowerCase()}`).trim();
  const m = FILE_FIRST.exec(line);
  if (!m) return line; // no file named first: already words ("a short answer in the report")
  const rest = /^with (the )?columns\b/i.test(m[2]) ? "" : m[2].split(",")[0].trim();
  return [KIND[m[1].toLowerCase()] ?? "a file", rest].filter(Boolean).join(" ");
}
