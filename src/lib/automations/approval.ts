import type { Trial } from "@/contracts/automation";

export type Segment = "right" | "wrong" | "open";
export type ApprovalProgress = { total: number; right: number; wrong: number; open: number; segments: Segment[] };

/** The approval bar: one segment per example of the current version, filled by the person's judgment. */
export function approvalProgress(trials: Trial[], version: number): ApprovalProgress {
  const segments: Segment[] = trials
    .filter((t) => t.version === version) // examples of an earlier version no longer count, so they are not drawn
    .map((t) => (t.humanVerdict === "approved" ? "right" : t.humanVerdict === "rejected" ? "wrong" : "open"));
  const count = (s: Segment) => segments.filter((x) => x === s).length;
  return { total: segments.length, right: count("right"), wrong: count("wrong"), open: count("open"), segments };
}

/**
 * What a member reads under the bar (Q178): the same next step an owner or an admin is given (canApprove's reason), since
 * running, judging and changing the automation are theirs too; once it can be approved, who approves it.
 */
export function memberApprovalLine(allowed: boolean, reason: string | null): string {
  return allowed || !reason ? "An owner or an admin approves it." : reason;
}

/** The bar's words: "1 of 2 looks right, 1 not right". */
export function approvalLabel(p: ApprovalProgress): string {
  if (p.total === 0) return "No examples of this version yet";
  // "0 of 1 look right" reads oddly: before anything looks right, say what is still to do instead
  if (p.right === 0 && p.wrong === 0) return p.total === 1 ? "1 example to check" : `${p.total} examples to check`;
  if (p.right === 0) return `${p.wrong} of ${p.total} not right`;
  const verb = p.right === 1 ? "looks" : "look";
  return `${p.right} of ${p.total} ${verb} right${p.wrong ? `, ${p.wrong} not right` : ""}`;
}
