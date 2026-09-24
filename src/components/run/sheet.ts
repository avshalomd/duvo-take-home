// The paper sheet of Home's main column - the first visit, an open run, a run being started. One width and one
// gutter for all three, so a title set in one lines up with the same title in another: the handover depends on it.
export const SHEET = "relative mx-auto max-w-[52rem] rounded-[22px] bg-paper shadow-sheet";
export const SHEET_GUTTER = "px-6 min-[900px]:px-12";

// Where the composer floats at the bottom of a run's sheet. The fade above the capsule is where the run meets it: the
// content eases out instead of ending on a line. Shared by the run's sheet and the one that stands in for it.
export const COMPOSER_DOCK =
  "sticky bottom-0 z-20 rounded-b-[22px] bg-[linear-gradient(to_top,var(--paper)_45%,transparent)] px-3 pt-8 pb-3 min-[900px]:px-8 min-[900px]:pb-6";

/** The width a run's title gets inside a sheet this wide: the sheet less SHEET_GUTTER on both sides. */
export function titleWidth(sheetWidth: number): number {
  const gutter = window.matchMedia("(min-width: 900px)").matches ? 48 : 24; // px-12 : px-6, as in SHEET_GUTTER
  return sheetWidth - 2 * gutter;
}
