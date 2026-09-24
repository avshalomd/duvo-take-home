import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Run, RunEvent } from "@/contracts/run";

const queries = vi.hoisted(() => ({ getRun: vi.fn(), getFile: vi.fn() }));
vi.mock("@/lib/runs/queries", () => queries);
vi.mock("@/lib/automations/store", () => ({ listAutomations: vi.fn(async () => []) }));
vi.mock("@/lib/connections/store", () => ({ listConnections: vi.fn(async () => []) }));

import { fileFacts } from "./home-data";

const event = (seq: number): RunEvent => ({ seq, at: "2026-09-24T10:00:00.000Z", kind: "text", payload: { text: `step ${seq}` } });
const run = (id: string, parentRunId: string | null) => ({ run: { id, parentRunId } as Run, events: [event(1)], files: [], verdict: null });

beforeEach(() => {
  vi.clearAllMocks();
});

// Review (frontend): opening a follow-up read its parent whole twice, once for its title and once for the sheets it
// carried over. Home reads the parent once and hands it to the facts, which read only the runs before it.
describe("the facts of a follow-up's files", () => {
  it("do not read the parent again when Home has it", async () => {
    await fileFacts("ws", { id: "r2", parentRunId: "r1" }, [], run("r1", null));
    expect(queries.getRun).not.toHaveBeenCalled();
  });

  it("read only the runs before the parent", async () => {
    queries.getRun.mockResolvedValueOnce(run("r0", null));
    await fileFacts("ws", { id: "r2", parentRunId: "r1" }, [], run("r1", "r0"));
    expect(queries.getRun.mock.calls).toEqual([["ws", "r0"]]);
  });
});
