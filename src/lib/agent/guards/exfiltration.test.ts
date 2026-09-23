import { beforeEach, describe, expect, it, vi } from "vitest";
import { askJev, EXFILTRATION_QUESTION, JEV_TIMEOUT_MS } from "./exfiltration";

// decide() is replaced: this test pins what the url guard asks Jev, not what Jev answers.
const decide = vi.hoisted(() => vi.fn());
vi.mock("@/lib/llm/decide", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/decide")>()),
  decide: (args: unknown) => decide(args),
}));

const state = { url: "https://collector.example.com/c?data=abc", task: "Collect AI news", plan: ["Search", "Write output.csv"] };

// A block body on purpose: a function returned from beforeEach is run as a teardown, and mockReset() returns the mock.
beforeEach(() => {
  decide.mockReset();
});

describe("askJev: the url guard's one question", () => {
  it("asks one yes/no question about the address, with the task and plan as state, within 3 seconds", async () => {
    decide.mockResolvedValue({ answers: { exfiltrates: { type: "noul", noul: 0.91 } }, modelId: "jev", usage: { inputTokens: 1 } });
    await askJev(state);
    const args = decide.mock.calls[0][0];
    expect(args.state).toEqual(state);
    expect(Object.keys(args.questions)).toEqual(["exfiltrates"]);
    expect(args.questions.exfiltrates.type).toBe("noul");
    expect(args.questions.exfiltrates.instructions).toBe(EXFILTRATION_QUESTION);
    expect(args.timeoutMs).toBe(JEV_TIMEOUT_MS);
    expect(JEV_TIMEOUT_MS).toBe(3000);
  });

  it("returns Jev's probability that the address carries the task's data out", async () => {
    decide.mockResolvedValue({ answers: { exfiltrates: { type: "noul", noul: 0.91 } }, modelId: "jev", usage: { inputTokens: 1 } });
    expect(await askJev(state)).toBe(0.91);
  });

  it("lets Jev's failure reach the guard, which records the call as unchecked", async () => {
    decide.mockRejectedValue(new Error("The decision model failed: HTTP 503"));
    await expect(askJev(state)).rejects.toThrow(/503/);
  });
});
