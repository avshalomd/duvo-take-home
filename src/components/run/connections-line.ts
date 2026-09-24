/**
 * The connections the next run gets, as the composer names them in one line (UX QA U24): the only one by name, or
 * the first and how many more ("DeepWiki and 3 more"), with the whole list behind it. Null when none is on.
 */
export function connectionsLine(names: string[]): { first: string; more: number; label: string } | null {
  if (names.length === 0) return null;
  const more = names.length - 1;
  return { first: names[0], more, label: more === 0 ? names[0] : `${names[0]} and ${more} more` };
}
