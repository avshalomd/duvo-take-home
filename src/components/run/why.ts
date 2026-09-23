import type { Verdict } from "@/contracts/eval";

export type WhyLine = {
  tier: "checks" | "judge" | "review" | "none";
  tone: "ok" | "warn" | "bad" | "idle";
  decided: boolean;
  text: string;
};

export function whyLines(verdict: Verdict | null, runStatus: string): WhyLine[] {
  void verdict; void runStatus;
  return [];
}
