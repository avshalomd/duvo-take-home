export type BriefPart = { kind: "text"; text: string } | { kind: "input" };
export const briefParts = (text: string): BriefPart[] => [{ kind: "text", text }]; // STUB
