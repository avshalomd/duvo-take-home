import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"], // it carries the Claude Code binary; never bundle it
  // The SDK picks its platform binary package at runtime, which file tracing cannot see: include the Linux one.
  // Only in /api/runner (RUNNER=route on Vercel): the binary is ~240 MB, a route that carries it gets a function of
  // its own, and in every route v2 passed the Hobby plan's cap of 12 functions. Keys match anywhere in the route.
  outputFileTracingIncludes: {
    "/api/runner": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"],
  },
  poweredByHeader: false, // no "X-Powered-By: Next.js": it only tells a stranger what to try
  async headers() {
    return [
      {
        source: "/:path*", // every page and every API route
        headers: [
          // No other site may show the app in a frame (clickjacking): the old header for old browsers, the CSP one
          // for new ones. The policy is frame-ancestors only, so it cannot block the app's own scripts or styles.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" }, // a download is what its Content-Type says, never sniffed into HTML
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, // another site sees our origin, never a run's path
        ],
      },
    ];
  },
};

export default nextConfig;
