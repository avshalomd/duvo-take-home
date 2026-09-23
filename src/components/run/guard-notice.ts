import type { RunState } from "@/contracts/run";

export type GuardNotice = { text: string; tone: "warn" | "idle"; count: number };

export function guardNotices(guards: NonNullable<RunState["guards"]>): GuardNotice[] {
  void guards;
  return [];
}
