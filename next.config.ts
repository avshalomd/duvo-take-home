import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"], // it carries the Claude Code binary; never bundle it
  // The SDK picks its platform binary package at runtime, which file tracing cannot see: include the Linux one
  // in every server function so a run can spawn the agent on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/**"],
  },
};

export default nextConfig;
