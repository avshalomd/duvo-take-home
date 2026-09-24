import { describe, expect, it } from "vitest";
import type { Connection } from "@/contracts/connection";
import { connectionsFor } from "./for-viewer";

const keyed: Connection = {
  id: "c1",
  name: "Linear",
  url: "https://user:pass@mcp.example.com:8443/s/sk-live-4f9a2b/mcp?key=abc#frag",
  transport: "http",
  hasToken: false,
  enabled: true,
  lastStatus: "connected",
};

// Security review S7: several MCP providers put the key in the address, and every member could read it in Settings
describe("connectionsFor: what a viewer's page is sent of each connection's address", () => {
  it("sends a plain member only the server's origin: no path, no query, no user or password", () => {
    const [shown] = connectionsFor([keyed], { seesFullAddress: false });
    expect(shown.url).toBe("https://mcp.example.com:8443");
    expect(JSON.stringify(shown)).not.toContain("sk-live");
    expect(JSON.stringify(shown)).not.toContain("key=abc");
    expect(JSON.stringify(shown)).not.toContain("pass");
    expect(shown.addressHidden).toBe(true);
  });

  it("sends an owner or an admin the whole address, as saved", () => {
    const [shown] = connectionsFor([keyed], { seesFullAddress: true });
    expect(shown.url).toBe(keyed.url);
    expect(shown.addressHidden).toBeUndefined();
  });

  it("keeps everything else about the connection for a member: name, state and switch", () => {
    const [shown] = connectionsFor([keyed], { seesFullAddress: false });
    expect(shown).toMatchObject({ id: "c1", name: "Linear", enabled: true, lastStatus: "connected" });
  });
});
