// Whether an edited address still points at the same server, which decides whether its saved credentials may follow.
import { describe, expect, it } from "vitest";
import { sameServer } from "./store-origin";

describe("sameServer", () => {
  it("is the same server when only the path changes", () => {
    expect(sameServer("https://api.githubcopilot.com/mcp/", "https://api.githubcopilot.com/mcp/readonly")).toBe(true);
  });

  it("ignores the case of the host name", () => {
    expect(sameServer("https://MCP.example.com/mcp", "https://mcp.example.com/v2")).toBe(true);
  });

  it("is another server when the host changes", () => {
    expect(sameServer("https://api.githubcopilot.com/mcp/", "https://attacker.example/mcp")).toBe(false);
  });

  it("is another server on another subdomain", () => {
    expect(sameServer("https://mcp.example.com/mcp", "https://evil.example.com/mcp")).toBe(false);
  });

  it("is another server on another port", () => {
    expect(sameServer("https://mcp.example.com/mcp", "https://mcp.example.com:8443/mcp")).toBe(false);
  });

  it("is another server when https becomes http, since the token would then travel unencrypted", () => {
    expect(sameServer("https://mcp.example.com/mcp", "http://mcp.example.com/mcp")).toBe(false);
  });

  it("answers no for an address it cannot read, so a doubt clears the credentials rather than keeps them", () => {
    expect(sameServer("https://mcp.example.com/mcp", "not a url")).toBe(false);
  });
});
