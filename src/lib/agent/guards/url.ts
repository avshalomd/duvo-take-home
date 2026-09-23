import type { GuardContext } from "@/contracts/guard";
import { askJev, JEV_TIMEOUT_MS, type AskExfiltration } from "./exfiltration";
import type { Check } from "./verdict";

export const QUERY_LIMIT = 80;
export function isPrivateHost(_hostname: string): boolean { return false; } // skeleton
export function isDeniedHost(_hostname: string, _denied: string[]): boolean { return false; } // skeleton
export function urlCheck(_ctx: Pick<GuardContext, "deniedDomains" | "plan">, _ask: AskExfiltration = askJev, _timeoutMs = JEV_TIMEOUT_MS): Check {
  return () => ({ decision: "allowed", reason: "" }); // skeleton
}
