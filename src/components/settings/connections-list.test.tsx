import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/(app)/settings/actions", () => ({
  addConnectionAction: vi.fn(),
  updateConnectionAction: vi.fn(),
  deleteConnectionAction: vi.fn(),
  setConnectionEnabledAction: vi.fn(),
}));

import type { Connection } from "@/contracts/connection";
import { ConnectionsList } from "./connections-list";

const deepWiki: Connection = {
  id: "c1",
  name: "DeepWiki",
  url: "https://mcp.deepwiki.com/mcp",
  transport: "http",
  hasToken: false,
  enabled: true,
  lastStatus: "connected",
  authType: "none",
  tools: [],
};

// The words a page shows, without its markup (class names mention nothing a reader sees).
const words = (html: string) => html.replace(/<[^>]+>/g, " ");

// UX QA U29: the tab said Connections, its group "Servers the agent can use", its button "Add a server". One word for
// office workers, "connection"; "server" only in the add form's Advanced part.
describe("ConnectionsList - its words", () => {
  it("calls them connections: the group, the Add row and the footer", () => {
    const text = words(renderToStaticMarkup(<ConnectionsList connections={[deepWiki]} canEdit />));
    expect(text).toContain("Connections the agent can use");
    expect(text).toContain("Add a connection");
    expect(text).toContain("A run uses the connections that are switched on. Open a connection to see its tools.");
    expect(text).not.toMatch(/server/i);
  });

  it("says so in the same word when there are none, and to a member", () => {
    const empty = words(renderToStaticMarkup(<ConnectionsList connections={[]} canEdit />));
    expect(empty).toContain("No connections yet. Add one to give the agent more to work with.");
    const member = words(renderToStaticMarkup(<ConnectionsList connections={[deepWiki]} canEdit={false} />));
    expect(member).toContain("A run uses the connections that are switched on. Only an owner or an admin can change them.");
    expect(`${empty} ${member}`).not.toMatch(/server/i);
  });
});
