import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createOutputsServer, OUTPUTS_SERVER_KEY } from "./server";

/** Connects a real MCP client to the server, the way the agent's CLI does. */
async function connect(dir: string) {
  const server = createOutputsServer(dir);
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await server.instance.connect(serverSide);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientSide);
  return client;
}

describe("createOutputsServer", () => {
  it("registers as an in-process sdk server under the outputs key, so its tools arrive as mcp__outputs__*", () => {
    const server = createOutputsServer("/tmp/runs/abc");
    expect(OUTPUTS_SERVER_KEY).toBe("outputs");
    expect(server.type).toBe("sdk");
    expect(server.name).toBe(OUTPUTS_SERVER_KEY);
  });

  it("returns a fresh server on every call, so two concurrent runs never share one connection or one directory", () => {
    const a = createOutputsServer("/tmp/runs/a");
    const b = createOutputsServer("/tmp/runs/b");
    expect(a.instance).toBeDefined();
    expect(a.instance).not.toBe(b.instance);
  });

  // The first live run showed the server "connected" with no tools: the SDK could not turn z.record into JSON
  // Schema, tools/list failed, and the agent never knew it could draw a chart. This lists them the way the CLI does.
  it("lists both tools to an MCP client, with a JSON Schema for every argument", async () => {
    const { tools } = await (await connect("/tmp/runs/abc")).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["make_chart", "make_spreadsheet"]);
    const chart = tools.find((t) => t.name === "make_chart")!;
    expect(Object.keys(chart.inputSchema.properties ?? {}).sort()).toEqual(["data", "file", "kind", "series", "title", "x", "y"]);
  });
});
