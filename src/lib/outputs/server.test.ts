import { describe, expect, it } from "vitest";
import { createOutputsServer, OUTPUTS_SERVER_KEY } from "./server";

describe("createOutputsServer", () => {
  it("registers as an in-process sdk server under the outputs key, so its tools arrive as mcp__outputs__*", () => {
    const server = createOutputsServer("/tmp/runs/abc");
    expect(OUTPUTS_SERVER_KEY).toBe("outputs");
    expect(server?.type).toBe("sdk");
    expect(server?.name).toBe(OUTPUTS_SERVER_KEY);
  });

  it("returns a fresh server on every call, so two concurrent runs never share one connection or one directory", () => {
    const a = createOutputsServer("/tmp/runs/a");
    const b = createOutputsServer("/tmp/runs/b");
    expect(a?.instance).toBeDefined();
    expect(a?.instance).not.toBe(b?.instance);
  });
});
