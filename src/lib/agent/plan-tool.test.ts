import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createPlanServer } from "./plan-tool";

/** The plan tools as the agent's CLI lists them, through a real MCP client. */
async function listPlanTools() {
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await createPlanServer().instance.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client.listTools();
}

// Q4: the plan server used to be one module-level instance shared by every run, so a second concurrent run got
// "Already connected" and no plan tool at all. One instance per run is the fix, and this is what pins it.
describe("createPlanServer", () => {
  it("returns a fresh server on every call, so two concurrent runs never share one connection", () => {
    const a = createPlanServer();
    const b = createPlanServer();
    expect(a).not.toBe(b);
    expect(a.instance).not.toBe(b.instance);
  });

  // qa-ai F14: a fix attempt names its own step
  it("offers a tool to name a fix attempt's step, besides setting the plan and marking a step", async () => {
    const { tools } = await listPlanTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["describe_fix", "set_plan", "update_step"]);
    expect(tools.find((t) => t.name === "describe_fix")?.description).toMatch(/fix attempt/i);
  });

  it("registers as an in-process sdk server under the plan key, so its tools arrive as mcp__plan__*", () => {
    const server = createPlanServer();
    expect(server.type).toBe("sdk");
    expect(server.name).toBe("plan");
  });
});
