/** A tab clicked while the page at `from` was showing. */
export type PickedTab = { from: string; href: string };

/**
 * The tab the segmented control marks: the one just clicked while the address has not changed yet, else the page's
 * own. Settings has no skeleton of its own (React would hold it 300 ms, longer than a warm tab takes), so this is
 * what moves at the click; once the address changes, whatever it changed to is the truth again.
 */
export function tabShown(path: string, picked: PickedTab | null): string {
  return picked && picked.from === path ? picked.href : path;
}
