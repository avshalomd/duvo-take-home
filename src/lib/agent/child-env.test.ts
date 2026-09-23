import { describe, expect, it } from "vitest";
import { childEnv, ISOLATION } from "./child-env";

// Q134: a demo run from a worktree dev server was given the developer's claude.ai connectors (Gmail, Plane, Docs),
// because the child inherited the whole parent environment and account. What the parent of a dev server looks like:
const parent = {
  PATH: "/usr/bin:/bin",
  HOME: "/Users/dev",
  TMPDIR: "/var/folders/tmp/",
  LANG: "en_US.UTF-8",
  ANTHROPIC_API_KEY: "sk-ant-test",
  CLAUDECODE: "1",
  CLAUDE_CODE_ENTRYPOINT: "cli",
  CLAUDE_CODE_OAUTH_TOKEN: "oauth-token",
  CLAUDE_CODE_SESSION_ID: "session",
  CLAUDE_CONFIG_DIR: "/Users/dev/.claude",
  DATABASE_URL: "postgres://user:pw@host/db",
  PROD_DATABASE_URL: "postgres://user:pw@prod/db",
  OPENROUTER_API_KEY: "sk-or-test",
  TYPESAFE_API_KEY: "ts-test",
  BETTER_AUTH_SECRET: "auth-secret",
  CONNECTION_KEY: "connection-key",
  VERCEL_OIDC_TOKEN: "oidc",
  GITHUB_TOKEN: "ghp_test",
  NODE_OPTIONS: "--require ./hook.js",
};

describe("childEnv (Q134)", () => {
  it("passes what the child needs to start and to keep its session files: PATH, HOME, TMPDIR, LANG", () => {
    expect(childEnv(parent)).toMatchObject({ PATH: "/usr/bin:/bin", HOME: "/Users/dev", TMPDIR: "/var/folders/tmp/", LANG: "en_US.UTF-8" });
  });

  it("passes the Anthropic key the agent runs on", () => {
    expect(childEnv(parent).ANTHROPIC_API_KEY).toBe("sk-ant-test");
  });

  it("passes the OpenRouter backend's two variables only when they are set", () => {
    expect(childEnv(parent)).not.toHaveProperty("ANTHROPIC_BASE_URL");
    expect(childEnv(parent)).not.toHaveProperty("ANTHROPIC_AUTH_TOKEN");
    const viaOpenRouter = childEnv({ ...parent, ANTHROPIC_BASE_URL: "https://openrouter.ai/api", ANTHROPIC_AUTH_TOKEN: "sk-or-test" });
    expect(viaOpenRouter).toMatchObject({ ANTHROPIC_BASE_URL: "https://openrouter.ai/api", ANTHROPIC_AUTH_TOKEN: "sk-or-test" });
  });

  it("never passes a variable that is not on the list: session and OAuth tokens, databases, other keys, NODE_OPTIONS", () => {
    const env = childEnv(parent);
    for (const name of Object.keys(parent)) {
      if (["PATH", "HOME", "TMPDIR", "LANG", "ANTHROPIC_API_KEY"].includes(name)) continue;
      expect(env, name).not.toHaveProperty(name);
    }
    expect(Object.keys(env).some((k) => k.startsWith("CLAUDE"))).toBe(false);
  });

  it("leaves out a listed variable that is unset or empty rather than passing an empty string", () => {
    const env = childEnv({ PATH: "/bin", HOME: undefined, LANG: "" });
    expect(env).toEqual({ PATH: "/bin" });
  });
});

describe("ISOLATION (Q134)", () => {
  it("loads no settings files, only the MCP servers we pass, and no claude.ai connectors", () => {
    expect(ISOLATION).toEqual({ settingSources: [], strictMcpConfig: true, settings: { disableClaudeAiConnectors: true } });
  });
});
