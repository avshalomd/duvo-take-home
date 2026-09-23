import { describe, expect, it } from "vitest";
import type { Run, RunEvent, RunStatus } from "@/contracts/run";
import { nextMessage, parseAfter, sseFrame } from "./diff";

const run = (status: RunStatus): Run => ({
  id: "4f9c1d2e-0000-4000-8000-000000000001",
  prompt: "Fetch the news",
  status,
  model: "claude-sonnet-5",
  connectionIds: [],
  report: null,
  error: null,
  numTurns: null,
  durationMs: null,
  costUsd: null,
  createdAt: "2026-09-23T10:00:00.000Z",
  finishedAt: null,
});
const text = (seq: number, body = `event ${seq}`): RunEvent => ({ seq, at: "2026-09-23T10:00:00.000Z", kind: "text", payload: { text: body } });
const events = [text(1), text(2), text(3), text(4)];

describe("parseAfter", () => {
  it("reads a whole number", () => {
    expect(parseAfter("12")).toBe(12);
  });

  it.each([null, "", "-3", "abc", "2.5", "1e3"])("treats %j as 'no events seen yet'", (v) => {
    expect(parseAfter(v)).toBe(0);
  });
});

describe("nextMessage", () => {
  it("sends only the events after the client's cursor", () => {
    const { message } = nextMessage({ run: run("running"), events }, 2);
    expect(message.events.map((e) => e.seq)).toEqual([3, 4]);
  });

  it("moves the cursor to the last event it sent", () => {
    expect(nextMessage({ run: run("running"), events }, 2).after).toBe(4);
  });

  it("keeps the cursor and sends no events when nothing new arrived", () => {
    const { message, after } = nextMessage({ run: run("running"), events }, 4);
    expect(message.events).toEqual([]);
    expect(after).toBe(4);
  });

  it("sends everything from a cursor of 0", () => {
    expect(nextMessage({ run: run("queued"), events }, 0).message.events).toHaveLength(4);
  });

  it("always carries the run as it is now, so a status change with no new event still reaches the client", () => {
    expect(nextMessage({ run: run("evaluating"), events }, 4).message.run.status).toBe("evaluating");
  });

  it.each(["succeeded", "failed", "cancelled"] as const)("says done once the run is %s", (status) => {
    expect(nextMessage({ run: run(status), events }, 0).message.done).toBe(true);
  });

  it.each(["queued", "running", "evaluating"] as const)("is not done while the run is %s", (status) => {
    expect(nextMessage({ run: run(status), events }, 0).message.done).toBe(false);
  });
});

describe("sseFrame", () => {
  it("is one data line with the JSON message, ended by a blank line", () => {
    const message = nextMessage({ run: run("running"), events: [text(1, "two\nlines")] }, 0).message;
    const frame = sseFrame(message);
    expect(frame.startsWith("data: ")).toBe(true);
    expect(frame.endsWith("\n\n")).toBe(true);
    expect(frame.slice(0, -2)).not.toContain("\n");
    expect(JSON.parse(frame.slice("data: ".length))).toEqual(message);
  });
});
