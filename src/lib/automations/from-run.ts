import "server-only";
import type { Automation, AutomationDraft } from "@/contracts/automation";
import { listConnections } from "@/lib/connections/store";
import { getFile, getRun } from "@/lib/runs/queries";
import { usedConnections } from "./connections";
import { draftAutomation } from "./draft";
import type { DraftRun } from "./draft.prompt";
import { AutomationError } from "./errors";
import { createAutomationDraft, recentDraftFromRun } from "./store";

const MAX_FILES = 5; // the draft reads the first lines of each; more files add tokens, not understanding
// One press, one draft (Q119): a draft from the same run this recent is the same press seen again - a reload while the
// model was writing, or the page opened twice. Longer than a draft can take (extract's 60 s, then the fallback's).
const SAME_PRESS_MS = 3 * 60_000;

/**
 * "Make an automation" on a finished run: read the run, let the model draft the template, and store it as a draft.
 * What the model decides: the wording, the input, the steps. What code decides: which connections it needs - read
 * from the connections the run actually called - and that only a run that succeeded can be a starting point.
 */
export async function draftFromRun(
  ctx: { workspaceId: string; userId: string },
  runId: string,
  draft: (run: DraftRun) => Promise<AutomationDraft> = draftAutomation, // tests hand in a fake: no model call
): Promise<Automation> {
  const found = await getRun(ctx.workspaceId, runId);
  if (!found) throw new AutomationError("That run was not found.");
  if (found.run.status !== "succeeded") throw new AutomationError("Only a run that finished well can become an automation. Pick another run.");
  const since = new Date(Date.now() - SAME_PRESS_MS);
  const already = await recentDraftFromRun(ctx.workspaceId, runId, since);
  if (already) return already; // the first press finished: no second model call

  const plan = found.events.findLast((e) => e.kind === "plan")?.payload ?? null; // the last plan event is the plan as it ended
  const files = await Promise.all(
    found.files.slice(0, MAX_FILES).map(async (f) => {
      if (f.encoding === "base64") return { name: f.name, content: `(a binary ${f.mime} file)` }; // an .xlsx has no lines to read
      return { name: f.name, content: (await getFile(ctx.workspaceId, runId, f.name))?.content ?? "" };
    }),
  );

  const drafted = await draft({ prompt: found.run.prompt, plan, report: found.run.report, files });
  // checked again after the model: a reload that started while the first press was drafting ends here, on its draft
  const meanwhile = await recentDraftFromRun(ctx.workspaceId, runId, since);
  if (meanwhile) return meanwhile;
  const connections = usedConnections(found.events, await listConnections(ctx.workspaceId));
  return createAutomationDraft(ctx, { ...drafted, template: { ...drafted.template, connections } }, runId);
}
