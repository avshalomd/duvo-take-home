import { describe, expect, it } from "vitest";
import { connectionStatus } from "./connection-label";

describe("connectionStatus", () => {
  it("shows a connection the last run reached as connected", () => {
    expect(connectionStatus("connected")).toEqual({ label: "connected", tone: "ok" });
  });

  it("shows a connection no run has used yet as 'never used', not as an error", () => {
    expect(connectionStatus(null)).toEqual({ label: "never used", tone: "idle" });
  });

  it("says what to do about a server with no credentials, rather than the store's own enum", () => {
    const needsToken = { label: "needs a token before a run can use it", tone: "warn" };
    expect(connectionStatus("not_configured")).toEqual(needsToken);
    expect(connectionStatus("needs-auth")).toEqual(needsToken);
  });

  it("keeps the server's own words when it failed, because the reason is the useful part", () => {
    expect(connectionStatus("failed: 401 Unauthorized")).toEqual({ label: "failed: 401 Unauthorized", tone: "bad" });
  });
});
