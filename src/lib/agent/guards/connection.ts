import type { GuardContext } from "@/contracts/guard";
import type { Verdict } from "./verdict";
export function connectionCheck(_ctx: Pick<GuardContext, "connectionNames" | "plan" | "strictConnections">): (tool: string, input: unknown) => Verdict {
  return () => ({ decision: "allowed", reason: "" }); // skeleton
}
