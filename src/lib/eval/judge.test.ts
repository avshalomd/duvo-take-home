import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutomationTemplate } from "@/contracts/automation";
import type { EvaluateInput } from "@/contracts/eval";

// decide() is replaced; noul() stays real, so the questions asked are the ones the product code builds.
vi.mock("@/lib/llm/decide", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/llm/decide")>()), decide: vi.fn() }));
const { decide } = await import("@/lib/llm/decide");
const { judgeRun } = await import("./judge");
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

beforeEach(() => {
  decideMock.mockReset();
  decideMock.mockResolvedValue({ answers: { answeredQuery: { type: "noul", noul: 0.9 }, followedPlan: { type: "noul", noul: 0.8 } }, modelId: "jev", usage: { inputTokens: 1 } } as never);
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

  it("returns the two probabilities as the judgment", async () => {
    expect(await judgeRun(input)).toEqual({ answeredQuery: 0.9, followedPlan: 0.8 });
  });
});
