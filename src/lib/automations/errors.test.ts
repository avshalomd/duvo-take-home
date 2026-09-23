import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { LlmError } from "@/lib/llm/errors";
import { RunLimitError } from "@/lib/runs/limits";
import { AutomationError, readError } from "./errors";

describe("readError", () => {
  it("passes on a message written for the user", () => {
    expect(readError(new AutomationError("Turn on DeepWiki in Settings to run /audit"))).toBe("Turn on DeepWiki in Settings to run /audit");
    expect(readError(new LlmError("The model took too long (30 s). Retry.", "timeout"))).toMatch(/too long/);
    expect(readError(new RunLimitError("Three runs are already in progress"))).toMatch(/in progress/);
  });

  it("passes on the first validation message", () => {
    const e = z.object({ prompt: z.string().min(10, "Say what the agent should do") }).safeParse({ prompt: "x" }).error;
    expect(readError(e)).toBe("Say what the agent should do");
  });

  it("answers anything else with one sentence, never the raw error", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(readError(new Error("connect ECONNREFUSED db.internal:5432 user=app"))).toBe("Something went wrong on our side - try again");
    log.mockRestore();
  });
});
