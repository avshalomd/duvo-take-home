// A person's judgment of a run in words, said as who made it. With several people in a workspace, "You said it looks
// right" is only ever said to the person who did; a colleague is named; a row judged before the judge was stored (or
// whose judge's account is gone) reads neutrally. Pure: the pages pass in the judge they looked up and the viewer.

export type Judge = { id: string; name: string | null } | null;

export function verdictWords(verdict: "approved" | "rejected", judge: Judge, viewerId: string): string {
  const said = verdict === "approved" ? "looks right" : "is not right";
  if (judge && judge.id === viewerId) return `You said it ${said}`;
  if (judge?.name) return `${judge.name} said it ${said}`;
  return `Marked: ${verdict === "approved" ? "looks right" : "not right"}`;
}
