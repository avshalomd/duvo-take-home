export type BriefPart = { kind: "text"; text: string } | { kind: "input" };

/** Text with {input} placeholders, as the pieces the page draws: plain text, and the input as a token between them. */
export function briefParts(text: string): BriefPart[] {
  const parts: BriefPart[] = [];
  text.split("{input}").forEach((piece, i) => {
    if (i > 0) parts.push({ kind: "input" }); // every split point was an {input}
    if (piece) parts.push({ kind: "text", text: piece });
  });
  return parts;
}
