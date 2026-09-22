import "server-only";
import { after } from "next/server";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { StartRunInput, type StartRun } from "@/contracts/agent";
import { AGENT_MODEL, runAutomation } from "@/lib/agent/run";

/**
 * Insert the run and hand the id back at once; the agent loop runs in after(), so the caller is not held for
 * the minutes the agent takes. The page then polls /api/runs/[id].
 */
export const startRun: StartRun = async (input) => {
  const { prompt } = StartRunInput.parse(input); // validated again here: the action is not the only caller
  const [row] = await db.insert(runs).values({ prompt, status: "queued", model: AGENT_MODEL }).returning({ id: runs.id });

  after(async () => {
    try {
      await runAutomation(row.id);
    } catch (err) {
      // after() swallows rejections: log it, the run row itself is closed as failed inside runAutomation.
      console.error(`run ${row.id} failed`, err);
    }
  });

  return { id: row.id };
};
