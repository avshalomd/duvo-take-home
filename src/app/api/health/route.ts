import { sql } from "drizzle-orm";
import { generateText } from "ai";
import { db, dbConfigured } from "@/db";
import { aiProvider, getModel } from "@/lib/ai";
import { toLlmError } from "@/lib/llm/errors";
import { runnerMode } from "@/lib/runner/mode";
import { cacheFor } from "./cache";

export const dynamic = "force-dynamic";

type ModelCheck = { usable: boolean; error?: string };

async function checkModel(): Promise<ModelCheck> {
  try {
    await generateText({ model: getModel(), prompt: "Reply with: ok", maxOutputTokens: 5, timeout: 15_000 });
    return { usable: true };
  } catch (e) {
    // The provider's own words (rate limited, slug retired, parameter refused), not the gateway's
    // "Provider returned error": this line is what deploy.sh points at when the model is down in production.
    return { usable: false, error: toLlmError(e, 15_000).message.slice(0, 300) };
  }
}

// Q177: anyone can call ?deep=1, and each model check costs money, so its answer is kept a minute per server instance.
// A deploy starts new instances, so the deploy's own smoke check still asks the model it just deployed.
const modelCheck = cacheFor(60_000, checkModel);

// GET /api/health          -> database check (the deploy gate), live on every request
// GET /api/health?deep=1   -> also one tiny model call, so "configured" is never mistaken for "usable"
export async function GET(req: Request) {
  let database: "up" | "down" | "unconfigured" = "unconfigured";
  if (dbConfigured) {
    try {
      await db.execute(sql`select 1`);
      database = "up";
    } catch {
      database = "down";
    }
  }

  let ai: { provider: string } & Partial<ModelCheck> = { provider: aiProvider() };
  if (new URL(req.url).searchParams.get("deep") === "1" && ai.provider !== "none") ai = { ...ai, ...(await modelCheck()) };

  const ok = database === "up";
  return Response.json(
    { ok, database, ai, runner: runnerMode(), commit: process.env.APP_COMMIT ?? "local" }, // runner: deploy-handover.sh checks it
    { status: ok ? 200 : 503 },
  );
}
