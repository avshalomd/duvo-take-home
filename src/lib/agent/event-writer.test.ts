import { describe, expect, it, vi } from "vitest";
import type { RunEvent } from "@/contracts/run";
import { createEventWriter } from "./event-writer";

const text = (t: string): Omit<RunEvent, "seq"> => ({ kind: "text", payload: { text: t }, at: "2026-09-24T10:00:00.000Z" }) as Omit<RunEvent, "seq">;
const blink = () => new Error("Connection terminated unexpectedly");

// Engine review #12: the run's single write chain was poisoned by one rejected write - every later write rejected
// with the same error - so one transient database error failed the whole run with its raw message.
describe("createEventWriter", () => {
  it("writes events in order, each with the next seq", async () => {
    const stored: RunEvent[] = [];
    const w = createEventWriter({ insert: async (e) => void stored.push(e), written: () => {} });
    await Promise.all([w.write([text("a"), text("b")]), w.write([text("c")])]);
    expect(stored.map((e) => [e.seq, (e.payload as { text: string }).text])).toEqual([
      [1, "a"],
      [2, "b"],
      [3, "c"],
    ]);
  });

  it("retries an insert that fails once, under the same seq", async () => {
    const stored: RunEvent[] = [];
    const insert = vi.fn().mockRejectedValueOnce(blink()).mockImplementation(async (e: RunEvent) => void stored.push(e));
    const w = createEventWriter({ insert, written: () => {} });
    await w.write([text("a")]);
    expect(insert).toHaveBeenCalledTimes(2);
    expect(stored.map((e) => e.seq)).toEqual([1]);
  });

  it("fails only the write whose insert failed twice: the writes queued after it still land", async () => {
    const stored: RunEvent[] = [];
    const insert = vi
      .fn()
      .mockRejectedValueOnce(blink())
      .mockRejectedValueOnce(blink())
      .mockImplementation(async (e: RunEvent) => void stored.push(e));
    const w = createEventWriter({ insert, written: () => {} });
    const first = w.write([text("lost")]);
    const second = w.write([text("kept")]);
    await expect(first).rejects.toThrow(/Connection terminated/);
    await expect(second).resolves.toBeUndefined();
    expect(stored.map((e) => [e.seq, (e.payload as { text: string }).text])).toEqual([[1, "kept"]]); // no gap left by the lost one
  });

  it("hands each written event on, and drained() waits for every queued write without ever rejecting", async () => {
    const seen: number[] = [];
    const insert = vi.fn().mockRejectedValueOnce(blink()).mockRejectedValueOnce(blink()).mockResolvedValue(undefined);
    const w = createEventWriter({ insert, written: (e) => void seen.push(e.seq) });
    void w.write([text("lost")]).catch(() => {});
    void w.write([text("a"), text("b")]);
    await expect(w.drained()).resolves.toBeUndefined();
    expect(seen).toEqual([1, 2]);
  });
});
