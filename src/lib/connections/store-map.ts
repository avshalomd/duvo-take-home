import { Transport, type Connection } from "@/contracts/connection";
import type { connections } from "@/db/schema";
import { SecretError, decryptSecret } from "./crypto";

export type ConnectionRow = typeof connections.$inferSelect;
type AuthType = NonNullable<Connection["authType"]>;

/** The one place a row becomes a Connection: it drops the token and answers hasToken, so no caller can leak it by accident. */
export function toConnection(row: ConnectionRow): Connection {
  const authType = authTypeOf(row);
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    transport: Transport.catch("http").parse(row.transport), // the column is text; an unknown value reads as http rather than throwing on a list
    hasToken: hasToken(row),
    enabled: row.enabled,
    lastStatus: row.lastStatus,
    authType,
    ...(authType === "oauth" ? { signedIn: oauthSignedIn(row.oauth) } : {}), // the contract says: oauth only
    tools: row.tools ?? [],
  };
}

/** The token the agent sends: token_enc decrypted, or the plain column of a v1 row the migration has not reached yet. */
export function readToken(row: ConnectionRow): string | null {
  if (row.tokenEnc != null) {
    try {
      return decryptSecret(row.tokenEnc);
    } catch (e) {
      // a damaged value is fixed by pasting the token again; a missing key is not, so that error passes through as it is
      if (e instanceof SecretError && e.problem === "sealed")
        throw new SecretError(`The saved token for ${row.name} could not be read. Edit the connection and paste the token again.`, "sealed");
      throw e;
    }
  }
  return row.token ?? null;
}

/** Signed in once the OAuth module has stored tokens in the connection's state (it seals them; only their presence is read here). */
export function oauthSignedIn(oauth: unknown): boolean {
  return typeof oauth === "object" && oauth !== null && Boolean((oauth as { tokens?: unknown }).tokens);
}

function hasToken(row: ConnectionRow): boolean {
  return row.tokenEnc != null || row.token != null;
}

// v1 rows have only the plain token and the column's default "none": a row holding a token signs in with it.
function authTypeOf(row: ConnectionRow): AuthType {
  if (row.authType === "bearer" || row.authType === "oauth") return row.authType;
  return hasToken(row) ? "bearer" : "none";
}
