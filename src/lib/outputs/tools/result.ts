import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

/** The one-line answer the agent reads after a tool call. */
export const answer = (text: string): CallToolResult => ({ content: [{ type: "text", text }] });

/**
 * A failure as a tool result the agent can read and act on, instead of a thrown error: a throw would reach the agent
 * as a vague MCP error, while this sentence tells it what to change and try again.
 */
export const failure = (file: unknown, err: unknown): CallToolResult => ({
  isError: true,
  content: [{ type: "text", text: `Could not write ${typeof file === "string" ? file : "the file"}: ${err instanceof Error ? err.message : String(err)}` }],
});

/** Zod's issues as one short sentence: "file: a file name ending in .svg; y: expected string". */
export const issues = (error: z.ZodError) => error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
