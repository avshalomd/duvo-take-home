import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@/contracts/run";

// decide() is replaced; noul() stays real, so the question asked is the one the product code builds.
vi.mock("@/lib/llm/decide", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/llm/decide")>()), decide: vi.fn() }));
const { decide } = await import("@/lib/llm/decide");
const { checkStep } = await import("./step-check");
const decideMock = vi.mocked(decide);

const prompt = "Fetch the latest AI news from the web and save them into a CSV with title, source, url, published_at, summary. " + "x".repeat(2000);
const plan: Plan = {
  intent: "AI news to CSV",
  expectedOutputs: ["output.csv"],
  sources: ["web search"],
  steps: [
    { index: 0, title: "Search the web for AI news from the last 7 days", status: "done", note: "no results from search, tried RSS" },
    { index: 1, title: "Write output.csv", status: "done" },
  ],
};
const calls = [
  { name: "WebSearch", input: { query: "AI news this week" }, preview: "API Error 400: web_search is not enabled" },
  { name: "WebFetch", input: { url: "https://news.example/rss", prompt: "AI stories" } },
];

const answer = (p: number) => ({ answers: { onTrack: { type: "noul", noul: p } }, modelId: "jev", usage: { inputTokens: 1 } }) as never;
type Sent = { state: { instructions: string; step: { title: string; note?: string }; calls: { name: string; input: string; result?: string }[] }; questions: Record<string, { type: string; instructions: string }>; timeoutMs?: number };
const sent = () => decideMock.mock.calls[0][0] as unknown as Sent;

beforeEach(() => {
  decideMock.mockReset();
  decideMock.mockResolvedValue(answer(0.91));
});

describe("checkStep", () => {
  it("asks Jev one yes/no question: did this step do what its title says?", async () => {
    await checkStep({ prompt, plan, stepIndex: 0, calls });
    const questions = Object.values(sent().questions);
    expect(questions).toHaveLength(1);
    expect(questions[0].type).toBe("noul");
    expect(questions[0].instructions).toMatch(/what its title says/);
  });

  it("shows Jev the head of the instructions, the step's title and note, and the calls made during it", async () => {
    await checkStep({ prompt, plan, stepIndex: 0, calls });
    const { state } = sent();
    expect(state.instructions.startsWith("Fetch the latest AI news")).toBe(true);
    expect(state.instructions.length).toBeLessThan(700); // the head, not the whole brief: Jev judges one step
    expect(state.step).toEqual({ title: plan.steps[0].title, note: "no results from search, tried RSS" });
    expect(state.calls.map((c) => c.name)).toEqual(["WebSearch", "WebFetch"]);
    expect(state.calls[0].input).toContain("AI news this week");
    expect(state.calls[0].result).toContain("web_search is not enabled");
  });

  it("cuts a long tool input down, so one big Write does not fill Jev's context", async () => {
    await checkStep({ prompt, plan, stepIndex: 1, calls: [{ name: "Write", input: { file_path: "output.csv", content: "y".repeat(5000) } }] });
    expect(sent().state.calls[0].input.length).toBeLessThanOrEqual(201);
  });

  it("keeps the last 20 calls of a long step and says how many came before", async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ name: `WebFetch`, input: { url: `https://s.example/${i}` } }));
    await checkStep({ prompt, plan, stepIndex: 0, calls: many });
    const { state } = sent();
    expect(state.calls).toHaveLength(20);
    expect(state.calls[0].input).toContain("/5");
    expect(JSON.stringify(state)).toMatch(/5 earlier calls/);
  });

  it("returns Jev's probability as onTrack and 'Looks done' when it says yes", async () => {
    expect(await checkStep({ prompt, plan, stepIndex: 1, calls })).toEqual({ stepIndex: 1, onTrack: 0.91, note: "Looks done" });
  });

  it("quotes the step's own note when Jev doubts the step: code writes the sentence, not the model", async () => {
    decideMock.mockResolvedValue(answer(0.2));
    const got = await checkStep({ prompt, plan, stepIndex: 0, calls });
    expect(got).toEqual({ stepIndex: 0, onTrack: 0.2, note: "May not have done what it says: no results from search, tried RSS" });
  });

  it("says so plainly when a doubted step has no note", async () => {
    decideMock.mockResolvedValue(answer(0.3));
    expect((await checkStep({ prompt, plan, stepIndex: 1, calls })).note).toBe("May not have done what it says.");
  });

  it("gives Jev five seconds, so a slow answer cannot hold up the stepper", async () => {
    await checkStep({ prompt, plan, stepIndex: 0, calls });
    expect(sent().timeoutMs).toBe(5000);
  });

  it("lets a failure through for the run loop to catch and record nothing", async () => {
    decideMock.mockRejectedValue(new Error("The decision model took too long (5 s). Retry."));
    await expect(checkStep({ prompt, plan, stepIndex: 0, calls })).rejects.toThrow(/too long/);
  });

  it("refuses a step that is not in the plan instead of judging nothing", async () => {
    await expect(checkStep({ prompt, plan, stepIndex: 7, calls })).rejects.toThrow(/step 7/);
    expect(decideMock).not.toHaveBeenCalled();
  });
});
