import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"], // it carries the Claude Code binary; never bundle it
  // The SDK picks its platform binary package at runtime, which file tracing cannot see: include the Linux one.
  // Only in /api/runner (RUNNER=route on Vercel): the binary is ~240 MB, a route that carries it gets a function of
  // its own, and in every route v2 passed the Hobby plan's cap of 12 functions. Keys match anywhere in the route.
  outputFileTracingIncludes: {
    "/api/runner": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"],
  },
};

export default nextConfig;
