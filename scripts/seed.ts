// Seed script: `npm run seed` (reads DATABASE_URL from .env.local). Keep it idempotent.
// It builds its own client because `@/db` imports `server-only`, which throws outside Next.
// Seeds the fixture runs (with their events and files) and the connections, so every screen demos without a model.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { isNull } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import * as schema from "../src/db/schema";
import runsFixture from "../fixtures/runs.json";
import connectionsFixture from "../fixtures/connections.json";

const db = drizzle(neon(process.env.DATABASE_URL!), { schema });

// The demo workspace and its user. Local development only: the password is not a secret (DEMO_PASSWORD overrides).
const WS = "demo-workspace";
const USER = "demo-user";
const DEMO_EMAIL = "demo@example.com";

async function demoWorkspace() {
  const now = new Date();
  await db.insert(schema.user).values({ id: USER, name: "Demo", email: DEMO_EMAIL, emailVerified: true, createdAt: now, updatedAt: now }).onConflictDoNothing();
  const password = await hashPassword(process.env.DEMO_PASSWORD ?? "demo-password");
  await db.insert(schema.account).values({ id: "demo-account", accountId: USER, providerId: "credential", userId: USER, password, createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.insert(schema.organization).values({ id: WS, name: "Demo workspace", slug: "demo", createdAt: now }).onConflictDoNothing();
  await db.insert(schema.member).values({ id: "demo-member", organizationId: WS, userId: USER, role: "owner", createdAt: now }).onConflictDoNothing();
  await db.insert(schema.workspaceSettings).values({ workspaceId: WS }).onConflictDoNothing();
  // Rows from before v2 have no workspace: they belong to the demo workspace.
  await db.update(schema.runs).set({ workspaceId: WS }).where(isNull(schema.runs.workspaceId));
  await db.update(schema.connections).set({ workspaceId: WS }).where(isNull(schema.connections.workspaceId));
}

async function main() {
  const existing = await db.select().from(schema.notes).limit(1);
  if (existing.length === 0) await db.insert(schema.notes).values({ body: "seeded" });
  await demoWorkspace();

  if ((await db.select().from(schema.connections).limit(1)).length === 0) {
    for (const c of connectionsFixture) {
      if (c.transport !== "http" && c.transport !== "sse") continue; // stdio/sdk fixtures have no URL to store
      await db.insert(schema.connections).values({ workspaceId: WS, name: c.name, url: c.url as string, transport: c.transport, enabled: c.enabled, lastStatus: c.last_status ?? null });
    }
  }

  if ((await db.select().from(schema.runs).limit(1)).length === 0) {
    for (const r of runsFixture) {
      const finished = r.events.find((e) => e.kind === "finished")?.payload as { result?: string } | undefined;
      // A fixture recorded mid-flight has no finished event; seeded as-is it would say "working on it" for ever.
      const stuck = !finished && r.status === "running";
      const [row] = await db.insert(schema.runs).values({
        workspaceId: WS, createdBy: USER,
        prompt: r.prompt, status: stuck ? "failed" : r.status, model: r.model, connectionIds: [],
        error: stuck ? "Seeded example: this run was recorded while it was still working and has no ending." : null,
        report: finished?.result ?? null, verdict: r.evaluation ?? null,
        numTurns: r.num_turns ?? null, durationMs: r.duration_ms ?? null, costUsd: r.total_cost_usd ?? null,
        createdAt: new Date(r.started_at), finishedAt: r.finished_at ? new Date(r.finished_at) : stuck ? new Date(r.started_at) : null,
      }).returning({ id: schema.runs.id });
      for (const e of r.events) await db.insert(schema.runEvents).values({ runId: row.id, seq: e.seq, kind: e.kind, payload: e.payload, at: new Date(e.at) });
      for (const a of r.artifacts) {
        const content = "source_file" in a ? readFileSync(a.source_file, "utf8") : (a as { content?: string }).content ?? "";
        await db.insert(schema.files).values({ runId: row.id, name: a.name, mime: a.mime, bytes: Buffer.byteLength(content), content });
      }
    }
  }
  console.log("seed done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
