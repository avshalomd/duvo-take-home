import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk"], // it carries the Claude Code binary; never bundle it
};

export default nextConfig;
