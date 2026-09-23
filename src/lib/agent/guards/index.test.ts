import path from "node:path";
import type { HookCallback, PreToolUseHookInput, SyncHookJSONOutput } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it, vi } from "vitest";
import type { GuardContext, GuardRecord } from "@/contracts/guard";
import type { Plan } from "@/contracts/run";
import { buildGuardHooks } from "./index";

// The composed hooks as the SDK sees them: matchers by tool name, each answering in the PreToolUse shape, and
// every decision that is not "allowed" written through ctx.record.
const dir = path.join(path.sep, "tmp", "runs", "abc");
const plan: Plan = {
  intent: "Summarise the open issues",
  expectedOutputs: ["report.md"],
  sources: ["WebSearch"],
  steps: [{ index: 0, title: "List the issues", status: "running" }],
};
const apiKey = ["sk-", "ant-api03-", "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY3zA5bC7dE9"].join(""); // assembled: see write.test.ts

function setup(over: Partial<GuardContext> = {}) {
  const records: GuardRecord[] = [];
  const ctx: GuardContext = {
    runId: "run-1",
    dir,
    deniedDomains: ["evil.example"],
    strictConnections: false,
    connectionNames: { github: "GitHub" },
    plan: () => plan,
    record: vi.fn(async (r: GuardRecord) => {
      records.push(r);
    }),
    ...over,
  };
  return { ctx, records, hooks: buildGuardHooks(ctx) };
}

// The CLI matches a hook's `matcher` against the tool name: a plain `A|B` is a list of exact names, anything else
// a regular expression. Anchoring the pattern gives the same answer for every matcher used here.
function hooksFor(hooks: ReturnType<typeof buildGuardHooks>, tool: string): HookCallback[] {
  return (hooks.PreToolUse ?? []).filter((m) => new RegExp(`^(?:${m.matcher})$`).test(tool)).flatMap((m) => m.hooks);
}

async function call(hooks: ReturnType<typeof buildGuardHooks>, tool: string, toolInput: unknown) {
  const matched = hooksFor(hooks, tool);
  expect(matched).toHaveLength(1); // one hook per tool: the order of the guards inside it is ours, not the CLI's
  const input: PreToolUseHookInput = {
    hook_event_name: "PreToolUse",
    tool_name: tool,
    tool_input: toolInput,
    tool_use_id: "toolu_1",
    session_id: "s",
    transcript_path: "",
    cwd: dir,
  };
  return (await matched[0](input, "toolu_1", { signal: new AbortController().signal })) as SyncHookJSONOutput;
}

const decisionOf = (out: SyncHookJSONOutput) =>
  out.hookSpecificOutput?.hookEventName === "PreToolUse" ? out.hookSpecificOutput.permissionDecision : undefined;

describe("buildGuardHooks: the shape the SDK expects", () => {
  it("denies a blocked call with a reason the agent can read", async () => {
    const { hooks } = setup();
    const out = await call(hooks, "Read", { file_path: "/etc/hosts" });
    expect(out.hookSpecificOutput).toEqual({
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: expect.stringContaining("/etc/hosts"),
    });
  });

  it("allows an allowed call and records nothing, to keep the timeline quiet", async () => {
    const { hooks, records } = setup();
    const out = await call(hooks, "Write", { file_path: "report.md", content: "# Report\n" });
    expect(decisionOf(out)).toBe("allow");
    expect(records).toEqual([]);
  });

  it("gives every tool the agent can call one hook, and leaves WebSearch to itself", () => {
    const { hooks } = setup();
    for (const tool of ["Read", "Write", "Edit", "Glob", "Grep", "NotebookEdit", "WebFetch", "mcp__github__list_issues", "mcp__plan__set_plan"]) {
      expect(hooksFor(hooks, tool), tool).toHaveLength(1);
    }
    expect(hooksFor(hooks, "WebSearch")).toHaveLength(0);
  });
});

describe("buildGuardHooks: each guard records its own decisions", () => {
  it("records a path outside the run directory as blocked by the path guard, with the path as target", async () => {
    const { hooks, records } = setup();
    await call(hooks, "Read", { file_path: "../../.env.local" });
    expect(records).toEqual([{ guard: "path", tool: "Read", decision: "blocked", reason: expect.any(String), target: "../../.env.local" }]);
  });

  it("checks the path before the content on Write, so a write outside the directory is the path guard's", async () => {
    const { hooks, records } = setup();
    const out = await call(hooks, "Write", { file_path: "/etc/cron.d/job", content: `key: ${apiKey}` });
    expect(decisionOf(out)).toBe("deny");
    expect(records.map((r) => r.guard)).toEqual(["path"]);
  });

  it("blocks a Write inside the directory that holds a credential, under the write guard", async () => {
    const { hooks, records } = setup();
    const out = await call(hooks, "Write", { file_path: "notes.md", content: `key: ${apiKey}` });
    expect(decisionOf(out)).toBe("deny");
    expect(records).toEqual([expect.objectContaining({ guard: "write", tool: "Write", decision: "blocked", target: "notes.md" })]);
  });

  it("blocks a WebFetch to a private address, under the url guard with the host as target", async () => {
    const { hooks, records } = setup();
    const out = await call(hooks, "WebFetch", { url: "http://169.254.169.254/latest/meta-data/", prompt: "read" });
    expect(decisionOf(out)).toBe("deny");
    expect(records).toEqual([expect.objectContaining({ guard: "url", tool: "WebFetch", decision: "blocked", target: "169.254.169.254" })]);
  });

  it("blocks a WebFetch to a denied domain from the workspace's settings", async () => {
    const { hooks } = setup();
    expect(decisionOf(await call(hooks, "WebFetch", { url: "https://www.evil.example/", prompt: "read" }))).toBe("deny");
  });

  it("flags a connection the plan did not name, and lets the call through", async () => {
    const { hooks, records } = setup();
    const out = await call(hooks, "mcp__github__list_issues", { repo: "a/b" });
    expect(decisionOf(out)).toBe("allow");
    expect(records).toEqual([expect.objectContaining({ guard: "connection", tool: "mcp__github__list_issues", decision: "flagged", target: "GitHub" })]);
  });
});

describe("buildGuardHooks: failures", () => {
  it("keeps the decision when recording it fails: a database hiccup must not open the gate", async () => {
    const { hooks } = setup({ record: async () => Promise.reject(new Error("db down")) });
    expect(decisionOf(await call(hooks, "Read", { file_path: "/etc/hosts" }))).toBe("deny");
  });

  it("stops the call when a guard itself crashes, since a crashed guard cannot vouch for it", async () => {
    const { hooks, records } = setup({
      plan: () => {
        throw new Error("boom");
      },
    });
    const out = await call(hooks, "mcp__github__list_issues", {});
    expect(decisionOf(out)).toBe("deny");
    expect(records).toEqual([expect.objectContaining({ guard: "connection", decision: "blocked", reason: expect.stringContaining("boom") })]);
  });
});
