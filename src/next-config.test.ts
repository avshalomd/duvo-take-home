import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../next.config";

// Security QA: nothing stopped another site from framing the app (clickjacking). Response headers on every route, and
// no "X-Powered-By: Next.js". Security review S13: the content policy also closes plugins, <base> and scripts from
// other origins. QA F8: the policy must not replace the inline chart's own stricter one.
const rules = () => nextConfig.headers!();
const policyRule = async () => (await rules()).find((r) => r.headers.some((h) => h.key === "Content-Security-Policy"))!;
const policy = async () => (await policyRule()).headers.find((h) => h.key === "Content-Security-Policy")!.value;
// Next's own matcher for a `source`, as it matches headers() rules (strict, as the server calls it)
const matches = (source: string, path: string) => getPathMatch(source, { strict: true, removeUnnamedParams: true })(path) !== false;

describe("next.config headers", () => {
  it("sends the anti-framing, no-sniffing and referrer headers on every route, pages and API alike", async () => {
    const every = (await rules()).find((r) => r.source === "/:path*")!;
    expect(every.headers).toEqual([
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ]);
  });

  it("gives pages a content policy: no framing, no plugins, no <base>, scripts only from the app itself", async () => {
    const value = await policy();
    expect(value).toContain("frame-ancestors 'none'");
    expect(value).toContain("object-src 'none'");
    expect(value).toContain("base-uri 'none'");
    expect(value).toMatch(/script-src 'self' 'unsafe-inline'(;|$| 'unsafe-eval')/); // eval in development only (React's dev tools)
  });

  it("sends that policy on pages and API routes, but not on a run's files, which carry their own", async () => {
    const { source } = await policyRule();
    for (const path of ["/", "/automations", "/settings/limits", "/api/runs", "/api/runs/abc", "/api/runs/abc/events"]) {
      expect(matches(source, path), path).toBe(true);
    }
    expect(matches(source, "/api/runs/66318d67-0000-4000-8000-000000000000/files/chart.svg")).toBe(false);
    expect(matches(source, "/api/runs/abc/files/report%20final.md")).toBe(false);
  });

  it("does not announce the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("still traces the agent SDK's Linux binary into /api/runner only", () => {
    expect(nextConfig.outputFileTracingIncludes).toEqual({ "/api/runner": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"] });
  });
});
