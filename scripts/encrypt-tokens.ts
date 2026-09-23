// One-off: move every plain connection token (v1's `token` column) into `token_enc`, sealed with AES-256-GCM under
// CONNECTION_KEY, and empty the plain column. Idempotent: a second run finds no plain token and changes nothing.
//   npx dotenv -e .env.local -- tsx scripts/encrypt-tokens.ts
// It builds its own client because `@/db` imports `server-only`, which throws outside Next. It prints counts, never a token.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, count, eq, isNotNull } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { encryptSecret } from "../src/lib/connections/crypto";

const { connections } = schema;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set: run it through dotenv -e .env.local");
  const db = drizzle(neon(process.env.DATABASE_URL), { schema });

  const rows = await db
    .select({ id: connections.id, token: connections.token, tokenEnc: connections.tokenEnc, authType: connections.authType })
    .from(connections)
    .where(isNotNull(connections.token));

  let sealed = 0;
  let dropped = 0;
  for (const row of rows) {
    const plain = row.token!;
    // v2 never writes the plain column, so when a row holds both, token_enc is the newer one and the plain copy just goes.
    const change = row.tokenEnc
      ? { token: null }
      : { tokenEnc: encryptSecret(plain), token: null, authType: row.authType === "none" ? "bearer" : row.authType }; // v1 rows say "none" by default
    // One UPDATE per row writes the sealed value and empties the plain one together, so no row is ever left with neither.
    // The `token = plain` condition makes it a no-op if the row was edited since it was read.
    await db
      .update(connections)
      .set({ ...change, updatedAt: new Date() })
      .where(and(eq(connections.id, row.id), eq(connections.token, plain)));
    if (row.tokenEnc) dropped++;
    else sealed++;
  }

  const [{ left }] = await db.select({ left: count() }).from(connections).where(isNotNull(connections.token));
  console.log(`encrypt-tokens: ${sealed} sealed into token_enc, ${dropped} plain copies removed, ${left} plain tokens left.`);
  if (left > 0) process.exitCode = 1; // a row edited mid-run keeps its plain token: run it again
}

main().catch((e) => {
  console.error(`encrypt-tokens failed: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
