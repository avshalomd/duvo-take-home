// the three things of the document the rule reads: the real document passes, and so does a test's stand-in
type FocusDoc = { activeElement: Element | null; body: Element; querySelector: (selectors: string) => Element | null };

// The open layers a person may be using: a menu (the user menu), a dialog (the runs sheet, Details), a list.
const OPEN_LAYER = '[role="menu"], [role="dialog"], [role="listbox"]';

/**
 * Whether the first visit's box may take the focus as it appears. Home streams in, so the box can arrive a second
 * after the page: by then the person may have opened the user menu, and taking the focus closed it. So only when
 * nothing has the focus and no menu or dialog is open.
 */
export function mayTakeFocus(doc: FocusDoc): boolean {
  const free = doc.activeElement === null || doc.activeElement === doc.body;
  return free && doc.querySelector(OPEN_LAYER) === null;
}
