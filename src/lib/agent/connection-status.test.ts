import { describe, expect, it } from "vitest";
import type { ConnectionSecret } from "@/contracts/connection";
import { statusUpdates } from "./connection-status";

const conn = (id: string, name: string): ConnectionSecret => ({
  id, name, url: "https://example.test/mcp", transport: "http", hasToken: false, enabled: true, lastStatus: null, token: null,
});

describe("statusUpdates", () => {
  it("matches an mcp server back to the connection it was built from, by its key", () => {
    const given = [conn("c1", "DeepWiki"), conn("c2", "GitHub (read-only)")];
    const servers = [{ name: "deepwiki", status: "connected" }, { name: "github_read_only", status: "failed: 401 Unauthorized" }];
    expect(statusUpdates(servers, given)).toEqual([
      { id: "c1", lastStatus: "connected" },
      { id: "c2", lastStatus: "failed: 401 Unauthorized" },
    ]);
  });

  it("ignores the plan server, which is ours and not one of the user's connections", () => {
    const servers = [{ name: "plan", status: "connected" }, { name: "deepwiki", status: "connected" }];
    expect(statusUpdates(servers, [conn("c1", "DeepWiki")])).toEqual([{ id: "c1", lastStatus: "connected" }]);
  });

  it("writes nothing for a server the run was not given, so a stale row is never overwritten", () => {
    expect(statusUpdates([{ name: "someone_else", status: "connected" }], [conn("c1", "DeepWiki")])).toEqual([]);
    expect(statusUpdates([], [conn("c1", "DeepWiki")])).toEqual([]);
  });
});
