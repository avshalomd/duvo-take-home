import type { GetFile, GetRun, ListRuns, Run, RunEvent } from "@/contracts/run";
import runsFixture from "../../../fixtures/runs.json";

// Fixture-backed reads until the engine package replaces them with Drizzle queries.
function toRun(r: (typeof runsFixture)[number]): Run {
  return {
    id: r.id, prompt: r.prompt, status: r.status as Run["status"], model: r.model,
    connectionIds: r.connection_id ? [r.connection_id] : [],
    report: (r.events.find((e) => e.kind === "finished")?.payload as { result?: string } | undefined)?.result ?? null,
    error: null, numTurns: r.num_turns ?? null, durationMs: r.duration_ms ?? null, costUsd: r.total_cost_usd ?? null,
    createdAt: r.started_at, finishedAt: r.finished_at ?? null,
  };
}
export const listRuns: ListRuns = async () => runsFixture.map(toRun); // STUB
export const getRun: GetRun = async (id) => { // STUB
  const r = runsFixture.find((x) => x.id === id);
  if (!r) return null;
  return { run: toRun(r), events: r.events as RunEvent[], files: r.artifacts.map((a) => ({ name: a.name, mime: a.mime, bytes: a.bytes })) };
};
export const getFile: GetFile = async (runId, name) => { // STUB
  const r = runsFixture.find((x) => x.id === runId);
  const a = r?.artifacts.find((f) => f.name === name);
  return a ? { meta: { name: a.name, mime: a.mime, bytes: a.bytes }, content: "title,source,url,published_at,summary\n" } : null;
};
