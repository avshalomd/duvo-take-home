import type { Trial } from "@/contracts/automation";

export type Segment = "right" | "wrong" | "open";
export type ApprovalProgress = { total: number; right: number; wrong: number; open: number; segments: Segment[] };
export const approvalProgress = (_trials: Trial[], _version: number): ApprovalProgress => ({ total: 0, right: 0, wrong: 0, open: 0, segments: [] }); // STUB
export const approvalLabel = (_p: ApprovalProgress): string => ""; // STUB
