import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { SetPlanInput, UpdateStepInput } from "@/contracts/agent";
import { PLAN_SERVER_KEY } from "./plan-state";

/**
 * The agent's plan tool: in-process (an sdk MCP server), so it needs no credentials and no subprocess.
 * The handlers only acknowledge - the plan itself is rebuilt in map-message.ts from the tool call, so the plan
 * events and the timeline come from one stream in one order.
 *
 * One server per run, built inside runAutomation: a single shared instance can only be connected once, so the
 * second of two concurrent runs got "Already connected" and ran with no plan tool at all.
 */
export const createPlanServer = () =>
  createSdkMcpServer({
    name: PLAN_SERVER_KEY,
    version: "1.0.0",
    tools: [
      tool(
        "set_plan",
        "State what you understood and how you will do it. Call this once, before any other tool.",
        SetPlanInput,
        async ({ steps }) => ({ content: [{ type: "text" as const, text: `Plan recorded with ${steps.length} steps. Start with step 0.` }] }),
      ),
      tool(
        "update_step",
        "Mark a step running when you start it, and done or skipped with a one-line note when it ends.",
        UpdateStepInput,
        async ({ index, status }) => ({ content: [{ type: "text" as const, text: `Step ${index} is ${status}.` }] }),
      ),
    ],
  });
