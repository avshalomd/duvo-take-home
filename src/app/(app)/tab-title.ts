const MAX = 60; // a tab shows twenty-odd characters; a history list or a window menu shows about this many

/** A run's brief as the browser tab's title (UX QA U5): one line, cut at a word with "..." when it is long. */
export function tabTitle(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  if (line.length <= MAX) return line;
  const cut = line.slice(0, MAX + 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > MAX / 2 ? cut.slice(0, space) : line.slice(0, MAX)).replace(/[\s,;:.-]+$/, "")}...`;
}
