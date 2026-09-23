import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { FetchLike } from "@modelcontextprotocol/sdk/shared/transport.js";
import { publicFetch } from "./fetch";

export type Discovered = {
  authorizationServerUrl: string;
  metadata: AuthorizationServerMetadata;
  resource: string | null;
  scope: string | null;
};

/** Finds how an MCP server wants to be signed in to. */
export async function discoverSignIn(_serverUrl: string, _fetchFn: FetchLike = publicFetch): Promise<Discovered> {
  throw new Error("not implemented: discoverSignIn");
}
