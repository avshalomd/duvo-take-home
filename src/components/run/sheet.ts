// The paper sheet of Home's main column - the first visit, an open run, a run being started. One width and one
// gutter for all three, so a title set in one lines up with the same title in another: the handover depends on it.
export const SHEET = "relative mx-auto max-w-[52rem] rounded-[22px] bg-paper shadow-sheet";
export const SHEET_GUTTER = "px-6 min-[900px]:px-12";

/** The width a run's title gets inside a sheet this wide: the sheet less SHEET_GUTTER on both sides. */
export function titleWidth(sheetWidth: number): number {
  const gutter = window.matchMedia("(min-width: 900px)").matches ? 48 : 24; // px-12 : px-6, as in SHEET_GUTTER
  return sheetWidth - 2 * gutter;
}
