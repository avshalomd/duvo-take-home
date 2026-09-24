// What the judge and the reviewer read is cut to a size: a model's context is finite, and a run can write anything
// (engine review #10). The start of a text says what it is and the end how it finished, so both are kept.

/** The text as it is when it fits, else its start and its end with a line saying how much was left out between. */
export function clipMiddle(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.75);
  const tail = max - head;
  return `${text.slice(0, head)}\n[... ${text.length - max} characters left out ...]\n${text.slice(text.length - tail)}`;
}

/** One line cut to `max` characters, marked when it was, so a cut CSV row does not read as a broken one. */
export function clipLine(line: string, max: number): string {
  return line.length <= max ? line : `${line.slice(0, max)} [line cut]`;
}

/** The names of files left out, at most `max` of them, and how many more there were. */
export function namesOf(files: { name: string }[], max = 100): string {
  const names = files.slice(0, max).map((f) => f.name).join(", ");
  return files.length > max ? `${names} and ${files.length - max} more` : names;
}
