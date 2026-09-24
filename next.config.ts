import type { NextConfig } from "next";

/**
 * The pages' content policy (security review S13), static so pages stay cacheable (a nonce would make every page
 * dynamic). No frame may show the app, no plugin runs, no <base> can move where relative links go, and scripts come
 * from the app itself only; 'unsafe-inline' because Next's hydration data is inline script, and 'unsafe-eval' in
 * development only, where React's dev tools need it. No page renders agent text as HTML, so this is defence in depth.
 */
const CONTENT_POLICY = [
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
].join("; ");

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
          { key: "X-Frame-Options", value: "DENY" }, // no other site may frame the app (clickjacking), for old browsers
          { key: "X-Content-Type-Options", value: "nosniff" }, // a download is what its Content-Type says, never sniffed into HTML
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, // another site sees our origin, never a run's path
        ],
      },
      {
        // Everything but a run's files: a config header replaces a route's own of the same name, and the inline chart
        // sends a stricter policy of its own (F8, lib/runs/download-headers.ts).
        source: "/((?!api/runs/[^/]+/files/).*)",
        headers: [{ key: "Content-Security-Policy", value: CONTENT_POLICY }],
      },
    ];
  },
};

export default nextConfig;
