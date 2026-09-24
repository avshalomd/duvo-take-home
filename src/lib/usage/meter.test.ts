import { describe, expect, it } from "vitest";
import { metered, reportModelUsage } from "./meter";

const sonnet = (inputTokens: number, outputTokens: number) => ({ modelId: "claude-sonnet-5", inputTokens, outputTokens });

describe("metered: the model spend of one piece of work", () => {
  it("adds up every model call reported while the work runs, and hands the total to record", async () => {
    const recorded: number[] = [];
    const value = await metered(
      async () => {
        reportModelUsage(sonnet(1_000_000, 0)); // $2
        await Promise.resolve(); // across an await, as a real call is
        reportModelUsage(sonnet(0, 100_000)); // $1
        return "done";
      },
      async (usd) => void recorded.push(usd),
    );
    expect(value).toBe("done");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toBeCloseTo(3, 6);
  });

  it("records what was spent even when the work fails, and the failure still reaches the caller", async () => {
    const recorded: number[] = [];
    const err = await metered(
      async () => {
        reportModelUsage(sonnet(500_000, 0)); // $1, paid before the failure
        throw new Error("the reviewer could not be reached");
      },
      async (usd) => void recorded.push(usd),
    ).catch((e) => e);
    expect(err.message).toBe("the reviewer could not be reached");
    expect(recorded[0]).toBeCloseTo(1, 6);
  });

  it("keeps two pieces of work running at once apart", async () => {
    const a: number[] = [];
    const b: number[] = [];
    await Promise.all([
      metered(async () => void reportModelUsage(sonnet(1_000_000, 0)), async (usd) => void a.push(usd)),
      metered(async () => void reportModelUsage(sonnet(0, 1_000_000)), async (usd) => void b.push(usd)),
    ]);
    expect(a[0]).toBeCloseTo(2, 6);
    expect(b[0]).toBeCloseTo(10, 6);
  });

  it("ignores a call made outside any metered work (a live run's own checks)", () => {
    expect(() => reportModelUsage(sonnet(1, 1))).not.toThrow();
  });
});
