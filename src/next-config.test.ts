import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

// Security QA: nothing stopped another site from framing the app (clickjacking). Four response headers on every
// route, and no "X-Powered-By: Next.js". The content policy is frame-ancestors alone: anything more could block the
// app's own scripts and styles, and is a change of its own.
describe("next.config headers", () => {
  it("sends the anti-framing, no-sniffing and referrer headers on every route, pages and API alike", async () => {
    const rules = await nextConfig.headers!();
    expect(rules).toEqual([
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]);
  });

  it("does not announce the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("still traces the agent SDK's Linux binary into /api/runner only", () => {
    expect(nextConfig.outputFileTracingIncludes).toEqual({ "/api/runner": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"] });
  });
});
