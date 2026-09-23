type Outcome = "pass" | "pass_with_notes" | "fail" | "unknown" | null;
export const orderForPicker = <T extends { outcome: Outcome }>(runs: T[]): (T & { mark: string | null })[] => runs.map((r) => ({ ...r, mark: null })); // STUB
