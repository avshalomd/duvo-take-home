import type { ConnectionSecret } from "@/contracts/connection";
import { hostReach, type Reach } from "@/lib/net/address";

// What the Connections list shows for a connection a run left out (connection-label.ts keeps a failure's own words).
export const LEFT_OUT_INTERNAL = "left out of the last run: its address now leads to a private or local network";
export const LEFT_OUT_UNKNOWN = "left out of the last run: its address could not be found";

/**
 * A connection's address was checked when it was saved, but a name can be pointed somewhere else afterwards. The
 * SDK child connects to it on its own, where no guard sees the request, so each enabled connection is looked up
 * again at run start: one that leads inside our network, or that could not be looked up, stays out of the run.
 * Side by side, so the run waits for the slowest lookup rather than for all of them in turn.
 */
export async function reachableConnections(
  enabled: ConnectionSecret[],
  reach: Reach = hostReach,
): Promise<{ usable: ConnectionSecret[]; leftOut: { id: string; lastStatus: string }[] }> {
  const verdicts = await Promise.all(enabled.map((c) => reach(new URL(c.url).hostname)));
  const usable: ConnectionSecret[] = [];
  const leftOut: { id: string; lastStatus: string }[] = [];
  enabled.forEach((c, i) => {
    const { reach: where } = verdicts[i];
    if (where === "public") usable.push(c);
    else leftOut.push({ id: c.id, lastStatus: where === "internal" ? LEFT_OUT_INTERNAL : LEFT_OUT_UNKNOWN });
  });
  return { usable, leftOut };
}
