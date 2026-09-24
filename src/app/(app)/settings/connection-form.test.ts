// The Add and Edit forms of a connection, as posted, turned into the contract's input or into sentences to act on.
import { describe, expect, it } from "vitest";
import { parseConnectionForm } from "./connection-form";

function form(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) f.set(k, v);
  return f;
}
const base = { name: "Linear", url: "https://mcp.linear.app/mcp", transport: "http" };

describe("parseConnectionForm, adding", () => {
  it("reads a server that needs no sign-in", () => {
    const out = parseConnectionForm(form({ ...base, authType: "none" }), "add");
    expect(out).toEqual({ ok: true, input: { name: "Linear", url: "https://mcp.linear.app/mcp", transport: "http", authType: "none" } });
  });

  it("reads a server that signs in with a token, and keeps the token", () => {
    const out = parseConnectionForm(form({ ...base, authType: "bearer", token: " lin_api_123 " }), "add");
    expect(out.ok && out.input).toMatchObject({ authType: "bearer", token: "lin_api_123" });
  });

  it("asks for the token when 'a token' was chosen and none was pasted", () => {
    const out = parseConnectionForm(form({ ...base, authType: "bearer", token: "" }), "add");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.fieldErrors.token?.[0]).toMatch(/Paste the token/);
  });

  it("drops a token left in the field when the server needs no sign-in or signs in with the service", () => {
    const none = parseConnectionForm(form({ ...base, authType: "none", token: "stale" }), "add");
    const oauth = parseConnectionForm(form({ ...base, authType: "oauth", token: "stale" }), "add");
    expect(none.ok && none.input.token).toBeUndefined();
    expect(oauth.ok && oauth.input).toMatchObject({ authType: "oauth" });
    expect(oauth.ok && oauth.input.token).toBeUndefined();
  });

  it("reads a missing sign-in choice as no sign-in", () => {
    const out = parseConnectionForm(form(base), "add");
    expect(out.ok && out.input.authType).toBe("none");
  });

  it("refuses an address on a private network with the contract's own sentence", () => {
    const out = parseConnectionForm(form({ ...base, url: "http://192.168.1.10/mcp" }), "add");
    expect(!out.ok && out.fieldErrors.url?.[0]).toMatch(/private or local network/);
  });

  it("refuses a name the agent could not use", () => {
    const out = parseConnectionForm(form({ ...base, name: "" }), "add");
    expect(!out.ok && out.fieldErrors.name?.[0]).toBe("Give the connection a name"); // one word for it (UX QA U29)
  });

  it("gives a refused form back as typed, but never the token", () => {
    const out = parseConnectionForm(form({ ...base, url: "not a url", authType: "bearer", token: "secret-value" }), "add");
    expect(!out.ok && out.values).toEqual({ name: "Linear", url: "not a url", transport: "http", authType: "bearer" });
    expect(JSON.stringify(out)).not.toContain("secret-value");
  });
});

describe("parseConnectionForm, editing", () => {
  it("keeps the saved token when the token field is left empty", () => {
    const out = parseConnectionForm(form({ ...base, authType: "bearer", token: "" }), "edit");
    expect(out.ok).toBe(true);
    expect(out.ok && out.input.token).toBeUndefined();
    expect(out.ok && "clearToken" in out.input && out.input.clearToken).toBe(false);
  });

  it("replaces the token when a new one is pasted", () => {
    const out = parseConnectionForm(form({ ...base, authType: "bearer", token: "new-token" }), "edit");
    expect(out.ok && out.input.token).toBe("new-token");
  });

  it("removes the saved token when 'Remove the saved token' is ticked", () => {
    const out = parseConnectionForm(form({ ...base, authType: "bearer", clearToken: "on" }), "edit");
    expect(out.ok && "clearToken" in out.input && out.input.clearToken).toBe(true);
  });
});
