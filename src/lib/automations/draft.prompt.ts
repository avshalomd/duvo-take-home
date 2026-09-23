export const DRAFT_INSTRUCTIONS = ""; // STUB
export type DraftRun = { prompt: string; plan: unknown; report: string | null; files: { name: string; content: string }[] };
export const draftInput = (_run: DraftRun): string => ""; // STUB
