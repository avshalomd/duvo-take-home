import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockLanguageModelV4 } from "ai/test";
import { apiError, failingModel, scriptedModel } from "@/lib/llm/test-models";

// The deep check exists so "configured" is never mistaken for "usable" - and when the model is NOT usable, the
// reason has to be the provider's own words. No database and no network here: both modules are replaced.
const model = vi.hoisted(() => ({ current: null as unknown }));
const database = vi.hoisted(() => ({ execute: vi.fn(async () => []) }));
vi.mock("@/db", () => ({ db: database, dbConfigured: true }));
vi.mock("@/lib/ai", () => ({ aiProvider: () => "openrouter", getModel: () => model.current }));

// The route keeps the model's answer for a minute in module memory (Q177): each test imports a fresh copy of it.
let GET: typeof import("./route").GET;
beforeEach(async () => {
  vi.resetModules();
  database.execute.mockClear();
  ({ GET } = await import("./route"));
});

describe("GET /api/health", () => {
  it("does not call the model unless deep=1", async () => {
    model.current = failingModel([new Error("must not be called")]);
    const body = await (await GET(new Request("http://x/api/health"))).json();
    expect(body).toMatchObject({ ok: true, database: "up", ai: { provider: "openrouter" } });
    expect(body.ai.usable).toBeUndefined();
  });

  it("says how runs execute, so a deploy can check it: Vercel needs RUNNER=route", async () => {
    vi.stubEnv("RUNNER", "route");
    const body = await (await GET(new Request("http://x/api/health"))).json();
    expect(body.runner).toBe("route");
    vi.unstubAllEnvs();
  });

  it("names the deployed commit: a push to main carries Vercel's git sha, a CLI deploy its APP_COMMIT", async () => {
    vi.stubEnv("APP_COMMIT", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "589d372f0c1e9b2a7d4e6f8a0b1c2d3e4f5a6b7c");
    expect((await (await GET(new Request("http://x/api/health"))).json()).commit).toBe("589d372");
    vi.stubEnv("APP_COMMIT", "4327198");
    expect((await (await GET(new Request("http://x/api/health"))).json()).commit).toBe("4327198");
    vi.stubEnv("APP_COMMIT", "");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "");
    expect((await (await GET(new Request("http://x/api/health"))).json()).commit).toBe("local");
    vi.unstubAllEnvs();
  });

  it("reports a usable model on deep=1", async () => {
    model.current = scriptedModel(["ok"]);
    const body = await (await GET(new Request("http://x/api/health?deep=1"))).json();
    expect(body.ai).toEqual({ provider: "openrouter", usable: true }); // the shape deploy-handover.sh reads, unchanged
  });

  it("names the provider's reason when the model is down, not the gateway's summary", async () => {
    const retired = { error: { message: "Provider returned error", metadata: { raw: "This model is unavailable for free" } } };
    model.current = failingModel([apiError(404, retired)]);
    const res = await GET(new Request("http://x/api/health?deep=1"));
    const body = await res.json();
    expect(res.status).toBe(200); // the database is up: a dead model is a warning for deploy.sh, not a failed deploy
    expect(body.ai.usable).toBe(false);
    expect(body.ai.error).toMatch(/unavailable for free/);
    expect(body.ai.error).not.toMatch(/Provider returned error/);
  });

  it("makes one model call for repeated deep checks within a minute, and still asks the database every time (Q177)", async () => {
    const counted = scriptedModel(["ok"]);
    model.current = counted;
    for (let i = 0; i < 3; i++) {
      const body = await (await GET(new Request("http://x/api/health?deep=1"))).json();
      expect(body).toMatchObject({ ok: true, database: "up", ai: { provider: "openrouter", usable: true } });
    }
    expect((counted as MockLanguageModelV4).doGenerateCalls).toHaveLength(1);
    expect(database.execute).toHaveBeenCalledTimes(3);
  });
});
