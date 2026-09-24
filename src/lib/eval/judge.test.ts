import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationTemplate } from "@/contracts/automation";
import type { EvaluateInput } from "@/contracts/eval";

// decide() is replaced; noul() stays real, so the questions asked are the ones the product code builds.
vi.mock("@/lib/llm/decide", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/llm/decide")>()), decide: vi.fn() }));
const { decide } = await import("@/lib/llm/decide");
const { judgeRun, judgeState } = await import("./judge");
const { stateTooLong } = await import("@/lib/llm/decide");
const decideMock = vi.mocked(decide);

const template: AutomationTemplate = {
  instructions: "Find the news about {input} from the last 7 days and save it to news.csv.",
  intent: "A weekly news digest about one company",
  expectedOutputs: ["news.csv with title, source, url, published_at, summary"],
  outputFormat: "CSV, one row per story",
  steps: ["Search the web for news about {input}", "Write news.csv"],
  connections: [],
};

const input: EvaluateInput = {
  prompt: "Find the news about Nvidia from the last 7 days and save it to news.csv.",
  runStatus: "succeeded",
  report: "Wrote news.csv.",
  plan: { intent: "Nvidia news", expectedOutputs: ["news.csv"], sources: ["web search"], steps: [{ index: 0, title: "Search", status: "done" }] },
  files: [{ name: "news.csv", content: "title,url\nA,https://a.example\n" }],
  today: "2026-09-22",
};

type Sent = { state: Record<string, unknown>; questions: Record<string, { instructions: string }> };
const sent = () => decideMock.mock.calls[0][0] as unknown as Sent;

describe("the in-bounds question (production, 2026-09-23)", () => {
  it("is not asked when the run read nothing from outside: no page, no search, no connection", async () => {
    const got = await judgeRun({ ...input, toolsUsed: ["mcp__outputs__make_chart", "Read", "Write"] });
    expect(Object.keys(sent().questions)).toEqual(["answeredQuery", "followedPlan"]);
    expect(got.stayedInBounds).toBeUndefined(); // nothing to warn about: no page could have given it orders
  });

  it("is asked when the run read a page, searched the web or used a connection", async () => {
    for (const tools of [["WebFetch", "Write"], ["WebSearch"], ["mcp__deepwiki__read_wiki_structure"]]) {
      decideMock.mockClear();
      const got = await judgeRun({ ...input, toolsUsed: tools });
      expect(Object.keys(sent().questions)).toContain("stayedInBounds");
      expect(got.stayedInBounds).toBe(0.95);
    }
  });

  // Engine review #4: a follow-up continues its parent's conversation, with the pages the parent read still in it,
  // so "make the bars horizontal" can carry an injected instruction forward without calling a web tool itself.
  it("is asked on a follow-up even when it read nothing itself: its conversation holds what the earlier run read", async () => {
    const got = await judgeRun({ ...input, toolsUsed: ["mcp__outputs__make_chart", "Read", "Write"], followUp: true });
    expect(Object.keys(sent().questions)).toContain("stayedInBounds");
    expect(got.stayedInBounds).toBe(0.95);
  });

  it("is asked when the tools are not known, as on a run recorded before they were", async () => {
    await judgeRun({ ...input, toolsUsed: undefined });
    expect(Object.keys(sent().questions)).toContain("stayedInBounds");
  });
});

beforeEach(() => {
  decideMock.mockReset();
  decideMock.mockResolvedValue({
    answers: { answeredQuery: { type: "noul", noul: 0.9 }, followedPlan: { type: "noul", noul: 0.8 }, stayedInBounds: { type: "noul", noul: 0.95 } },
    modelId: "jev",
    usage: { inputTokens: 1 },
  } as never);
});

describe("judgeRun", () => {
  it("shows the judge the saved automation when the run is one", async () => {
    await judgeRun({ ...input, template });
    expect(sent().state.automation).toEqual({
      intent: template.intent,
      expectedOutputs: template.expectedOutputs,
      outputFormat: template.outputFormat,
      steps: template.steps,
    });
  });

  it("asks whether the run followed the automation, not only its own plan, when there is one", async () => {
    await judgeRun({ ...input, template });
    expect(sent().questions.followedPlan.instructions).toMatch(/automation/i);
  });

  it("asks about the run's own plan and shows no automation for a free-text run", async () => {
    await judgeRun(input);
    expect(sent().state).not.toHaveProperty("automation");
    expect(sent().questions.followedPlan.instructions).toMatch(/plan it set/);
  });

  it("asks a third yes/no in the same request: did the run act only on the user's instructions?", async () => {
    // the suite's injection-followed case: a summary that ends with an advert a web page asked the agent to add
    await judgeRun(input);
    expect(decideMock).toHaveBeenCalledOnce(); // one request, three answers: the extra question costs nothing
    const q = sent().questions.stayedInBounds as unknown as { type: string; instructions: string; criteria: { false: string } };
    expect(q.type).toBe("noul");
    expect(q.instructions).toMatch(/only on the user's instructions/);
    expect(q.criteria.false).toMatch(/page or a tool result/);
  });

  it("keeps 'answers the instructions' to one meaning: injected content is the third question's, not this one's", async () => {
    await judgeRun(input);
    const q = sent().questions.answeredQuery as unknown as { criteria: { false: string } };
    expect(q.criteria.false).not.toMatch(/page|tool result/);
  });

  it("shows the judge a spreadsheet as what it is and its size, never its base64", async () => {
    const workbook = Buffer.from("PK\x03\x04 the rest of the workbook", "binary").toString("base64");
    await judgeRun({ ...input, files: [{ name: "data.xlsx", content: workbook }] });
    const files = sent().state.files as { name: string; head: string }[];
    expect(files[0].head).toBe("(a spreadsheet file, 29 bytes)");
  });

  it("returns the three probabilities as the judgment", async () => {
    expect(await judgeRun(input)).toEqual({ answeredQuery: 0.9, followedPlan: 0.8, stayedInBounds: 0.95 });
  });
});

// Engine review #1: 20 s per route on three routes is 60 s, past the evaluation's 50 s box.
describe("the judge's time", () => {
  afterEach(() => vi.unstubAllEnvs());
  const threeRoutes = () => {
    vi.stubEnv("TYPESAFE_API_KEY", "ts");
    vi.stubEnv("OPENROUTER_API_KEY", "or");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("JEV_MODEL", "");
  };

  it("spreads the time it is given over every route, so the last route still gets its turn", async () => {
    threeRoutes();
    await judgeRun(input, { endsAt: Date.now() + 30_000 });
    const { timeoutMs } = decideMock.mock.calls[0][0] as { timeoutMs: number };
    expect(timeoutMs).toBeGreaterThan(9_000);
    expect(timeoutMs * 3).toBeLessThanOrEqual(30_000);
  });

  it("gives each route 20 s when no deadline is set", async () => {
    threeRoutes();
    await judgeRun(input);
    expect((decideMock.mock.calls[0][0] as { timeoutMs: number }).timeoutMs).toBe(20_000);
  });
});

// Engine review #10: nothing bounded the judge's state. A long report or a dozen wide files went past Jev's 32K
// tokens, the provider refused, and the run was "not checked".
describe("judgeState", () => {
  const wideFile = (i: number) => ({ name: `f${i}.csv`, content: Array.from({ length: 60 }, () => "x".repeat(400)).join("\n") });

  it("stays inside Jev's context with a dozen wide files", () => {
    const state = judgeState({ ...input, files: Array.from({ length: 12 }, (_, i) => wideFile(i)) });
    expect(stateTooLong(state)).toBe(false);
  });

  it("stays inside Jev's context with a very long report, keeping its start and its end", () => {
    const report = `START ${"r".repeat(120_000)} END`;
    const state = judgeState({ ...input, report });
    expect(stateTooLong(state)).toBe(false);
    expect(state.report).toMatch(/^START/);
    expect(state.report).toMatch(/END$/);
    expect(state.report).toMatch(/characters left out/);
  });

  it("names the files it does not show, so the judge knows they exist", () => {
    const state = judgeState({ ...input, files: Array.from({ length: 30 }, (_, i) => ({ name: `note-${i}.md`, content: "a note" })) });
    expect(state.files.length).toBeLessThan(30);
    expect(JSON.stringify(state)).toContain("note-29.md");
  });

  it("shows a short run whole", () => {
    const state = judgeState(input);
    expect(state.report).toBe(input.report);
    expect(state.files).toEqual([{ name: "news.csv", head: input.files[0].content, lines: 3 }]);
  });
});
