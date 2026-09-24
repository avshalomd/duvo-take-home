import { describe, expect, it } from "vitest";
import { chooseView, isTerminal, mergeStreamMessage, parseRunPayload, parseStreamMessage, pollGivesUp, reconnectDelay, shouldPoll, streamUrl } from "./poll";

const payload = {
  run: {
    id: "run_1",
    prompt: "do the thing",
    status: "running",
    model: "claude-sonnet-5",
    connectionIds: [],
    report: null,
    error: null,
    numTurns: null,
    durationMs: null,
    costUsd: null,
    createdAt: "2026-09-22T09:14:03.120Z",
    finishedAt: null,
  },
  events: [
    { seq: 1, at: "2026-09-22T09:14:06.502Z", kind: "tool_call", payload: { tool_use_id: "t1", name: "WebSearch", input: { query: "ai" } } },
  ],
  files: [{ name: "output.csv", mime: "text/csv", bytes: 12 }],
  state: {
    status: "running",
    turn: 1,
    maxTurns: 25,
    plan: null,
    currentStep: null,
    lastTool: null,
    toolsUsed: ["WebSearch"],
    connections: [],
    files: [],
    costUsd: null,
    durationMs: null,
    error: null,
  },
  verdict: null,
};

describe("shouldPoll - the panel only polls a run that can still change", () => {
  it("polls a run that is queued, running or being evaluated", () => {
    expect(shouldPoll("queued")).toBe(true);
    expect(shouldPoll("running")).toBe(true);
    expect(shouldPoll("evaluating")).toBe(true);
  });

  it("stops polling once the run has ended", () => {
    expect(shouldPoll("succeeded")).toBe(false);
    expect(shouldPoll("failed")).toBe(false);
  });
});

// Q79: the row in the runs list is a server render, so the panel has to say when a run has settled.
describe("isTerminal - the moment the rest of the page has to be told about", () => {
  it("is true only for a run that has ended, whichever way it ended", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
  });

  it("is false while the run can still change, evaluating included", () => {
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("evaluating")).toBe(false);
  });
});

describe("parseRunPayload - the poll is validated before it replaces what the server rendered", () => {
  it("accepts the route's payload and carries the verdict", () => {
    const view = parseRunPayload({ ...payload, verdict: null });
    expect(view?.run.id).toBe("run_1");
    expect(view?.events).toHaveLength(1);
    expect(view?.verdict).toBeNull();
  });

  it("returns null for a payload that does not match the contract, so the panel keeps its data", () => {
    expect(parseRunPayload({ error: "not found" })).toBeNull();
    expect(parseRunPayload(null)).toBeNull();
  });
});

describe("chooseView - which of the two views the panel shows", () => {
  const server = parseRunPayload(payload)!;

  it("prefers the live poll while a run is moving: it is ahead of the server's render", () => {
    const live = { ...server, events: [...server.events, { ...server.events[0], seq: 2 }] };
    expect(chooseView(server, live)).toBe(live);
  });

  it("drops a poll from another run, so switching runs never shows the previous one", () => {
    const other = { ...server, run: { ...server.run, id: "run_2" } };
    expect(chooseView(server, other)).toBe(server);
  });

  it("lets a fresher server render win: after Re-evaluate the new verdict must not be hidden by the old poll", () => {
    const evaluated = {
      ...server,
      verdict: { verdict: "pass" as const, checks: [], judgment: null, review: null, reasons: [], evaluatedAt: "2026-09-22T10:00:00.000Z" },
    };
    expect(chooseView(evaluated, server)).toBe(evaluated);
  });

  it("shows the server's render when nothing has been polled yet", () => {
    expect(chooseView(server, null)).toBe(server);
  });
});

describe("isTerminal / shouldPoll - a stopped run has ended too", () => {
  it("treats cancelled as settled: no more polling, and one refresh of the page", () => {
    expect(isTerminal("cancelled")).toBe(true);
    expect(shouldPoll("cancelled")).toBe(false);
  });
});

// The events stream (/api/runs/<id>/events) sends {events, run, done} every second; the panel folds each message in.
describe("parseStreamMessage - a stream message is validated like a poll", () => {
  it("accepts the stream's shape", () => {
    const msg = parseStreamMessage({ events: payload.events, run: payload.run, done: false });
    expect(msg?.run.id).toBe("run_1");
    expect(msg?.done).toBe(false);
  });

  it("returns null for anything else, so a changed shape falls back to polling instead of blanking the run", () => {
    expect(parseStreamMessage({ events: [] })).toBeNull();
    expect(parseStreamMessage("ping")).toBeNull();
  });
});

// The stream sends the events after a cursor, and ends itself after 280 s: every (re)connection asks from the last
// event the panel already has, so nothing is sent twice and nothing is missed.
describe("streamUrl - where the panel listens", () => {
  it("asks for the events after the last one the panel has", () => {
    const events = parseRunPayload(payload)!.events;
    expect(streamUrl("run_1", [...events, { ...events[0], seq: 7 }, { ...events[0], seq: 3 }])).toBe("/api/runs/run_1/events?after=7");
  });

  it("asks for everything when the panel has no events yet", () => {
    expect(streamUrl("run_1", [])).toBe("/api/runs/run_1/events");
  });
});

describe("mergeStreamMessage - folding a stream message into what the panel shows", () => {
  const server = parseRunPayload(payload)!;
  const call = (seq: number) => ({ seq, at: "2026-09-22T09:14:10.000Z", kind: "tool_call" as const, payload: { tool_use_id: `t${seq}`, name: "WebFetch", input: { url: "https://x.example" } } });

  it("adds the new events once each, in order, whether the stream sends all events or only the new ones", () => {
    const all = mergeStreamMessage(server, parseStreamMessage({ events: [...payload.events, call(2)], run: payload.run, done: false })!);
    expect(all.events.map((e) => e.seq)).toEqual([1, 2]);
    const onlyNew = mergeStreamMessage(all, parseStreamMessage({ events: [call(4), call(3)], run: payload.run, done: false })!);
    expect(onlyNew.events.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it("takes the run from the message and derives the state again from the merged events", () => {
    const check = { seq: 2, at: "2026-09-22T09:14:10.000Z", kind: "check" as const, payload: { stepIndex: 0, onTrack: 0.3, note: "off track" } };
    const next = mergeStreamMessage(server, parseStreamMessage({ events: [check], run: { ...payload.run, status: "evaluating" }, done: false })!);
    expect(next.run.status).toBe("evaluating");
    expect(next.state.status).toBe("evaluating");
    expect(next.state.stepChecks).toEqual([{ stepIndex: 0, onTrack: 0.3, note: "off track" }]);
    expect(next.state.toolsUsed).toEqual(["WebSearch"]);
  });

  it("keeps the files and the verdict, which the stream does not carry", () => {
    const next = mergeStreamMessage(server, parseStreamMessage({ events: [], run: payload.run, done: false })!);
    expect(next.files).toEqual(server.files);
    expect(next.verdict).toBe(server.verdict);
  });
});

// Review (frontend): a stream that delivered and then broke was opened again at once, every time, and the polling
// fallback asked every two seconds for a run that was deleted or a session that had ended, for as long as the tab stayed open.
describe("reconnecting and giving up", () => {
  it("waits longer before each new try of a stream that keeps breaking: 1 s, then 2 s, then 5 s", () => {
    expect([0, 1, 2, 3, 10].map(reconnectDelay)).toEqual([1000, 2000, 5000, 5000, 5000]);
  });

  it("stops polling a run that is gone or a session that has ended", () => {
    expect(pollGivesUp(404)).toBe(true);
    expect(pollGivesUp(401)).toBe(true);
    expect(pollGivesUp(403)).toBe(true);
  });

  it("keeps polling through a passing server error or a busy moment", () => {
    expect(pollGivesUp(500)).toBe(false);
    expect(pollGivesUp(503)).toBe(false);
    expect(pollGivesUp(429)).toBe(false);
  });
});
