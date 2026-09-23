import { describe, expect, it, vi } from "vitest";
import type { ConnectionSecret } from "@/contracts/connection";
import type { HostVerdict } from "@/lib/net/address";
import { LEFT_OUT_INTERNAL, LEFT_OUT_UNKNOWN, reachableConnections } from "./connection-reach";

// Security QA: a connection's address is checked when it is saved, but a name can be pointed somewhere else later.
// At run start each enabled connection is looked up again; one that now leads inside our network stays out of the
// run, and its status says why.
const conn = (name: string, url: string): ConnectionSecret => ({
  id: `id-${name}`,
  name,
  url,
  transport: "http",
  hasToken: false,
  enabled: true,
  lastStatus: "connected",
  token: null,
  oauth: null,
});

const where = (map: Record<string, HostVerdict>) => vi.fn(async (host: string): Promise<HostVerdict> => map[host] ?? { reach: "public" });

describe("reachableConnections", () => {
  it("keeps the connections whose address leads to public hosts only", async () => {
    const all = [conn("DeepWiki", "https://mcp.deepwiki.com/mcp"), conn("Linear", "https://mcp.linear.app/sse")];
    const reach = where({});
    const { usable, leftOut } = await reachableConnections(all, reach);
    expect(usable.map((c) => c.name)).toEqual(["DeepWiki", "Linear"]);
    expect(leftOut).toEqual([]);
    expect(reach.mock.calls.map(([host]) => host)).toEqual(["mcp.deepwiki.com", "mcp.linear.app"]);
  });

  it("leaves out a connection whose name now resolves to a private address, and says so in plain words", async () => {
    const all = [conn("DeepWiki", "https://mcp.deepwiki.com/mcp"), conn("Rebound", "https://rebind.example.com/mcp")];
    const { usable, leftOut } = await reachableConnections(all, where({ "rebind.example.com": { reach: "internal", address: "10.0.0.7" } }));
    expect(usable.map((c) => c.name)).toEqual(["DeepWiki"]);
    expect(leftOut).toEqual([{ id: "id-Rebound", lastStatus: LEFT_OUT_INTERNAL }]);
    expect(LEFT_OUT_INTERNAL).toBe("left out of the last run: its address now leads to a private or local network");
  });

  it("leaves out a connection whose address could not be looked up, with its own reason", async () => {
    const { usable, leftOut } = await reachableConnections([conn("Gone", "https://gone.example/mcp")], where({ "gone.example": { reach: "unknown" } }));
    expect(usable).toEqual([]);
    expect(leftOut).toEqual([{ id: "id-Gone", lastStatus: LEFT_OUT_UNKNOWN }]);
    expect(LEFT_OUT_UNKNOWN).toBe("left out of the last run: its address could not be found");
  });

  it("looks the connections up side by side, so a slow one does not add to every other's wait", async () => {
    let inFlight = 0;
    let most = 0;
    const slow = async (): Promise<HostVerdict> => {
      most = Math.max(most, ++inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { reach: "public" };
    };
    await reachableConnections([conn("A", "https://a.example.com/"), conn("B", "https://b.example.com/"), conn("C", "https://c.example.com/")], slow);
    expect(most).toBe(3);
  });
});
