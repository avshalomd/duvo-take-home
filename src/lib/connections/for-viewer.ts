import type { Connection } from "@/contracts/connection";

/**
 * What a viewer's page is sent of each connection (security review S7, the owner's call 2026-09-24). Several services
 * put the key in the server's address (https://mcp.<service>/s/<key>/mcp), so a plain member is sent only its origin
 * - scheme, host and port - and never the path, the query or a user and password in it. Owners and admins, who can
 * edit the address, get it whole. Decided on the server: what a page is never sent, it cannot show or leak.
 */
export function connectionsFor(connections: Connection[], viewer: { seesFullAddress: boolean }): Connection[] {
  if (viewer.seesFullAddress) return connections;
  return connections.map((c) => ({ ...c, url: originOf(c.url), addressHidden: true }));
}

function originOf(url: string): string {
  try {
    return new URL(url).origin; // "https://mcp.example.com:8443": no user, password, path, query or fragment
  } catch {
    return ""; // an address that does not parse is not shown at all rather than shown whole
  }
}
