// The materials of docs/DESIGN-V2.md as class strings, so every automations screen uses the same three: a sheet (the
// document, the ready panel), a tile (a gallery entry, an example card) and a control. No borders: depth is the shadow.
export const SHEET = "rounded-[22px] bg-paper shadow-sheet";
export const TILE = "rounded-[16px] bg-paper shadow-tile";
export const FIELD = "h-10 rounded-[12px] bg-paper px-3 text-[15px]";

// Links are graphite and underlined, never blue.
export const LINK = "text-graphite underline decoration-graphite/30 underline-offset-[3px] hover:decoration-graphite focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm";

// Small text: 13 px with a little tracking, in slate.
export const SMALL = "text-[13px] leading-5 tracking-[0.01em] text-slate";

// A section heading inside a sheet: the system font, weight and size do the work (no eyebrow, no capitals).
export const SECTION = "text-[17px] leading-6 font-semibold text-graphite";
