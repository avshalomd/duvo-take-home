import { AutomationCard } from "@/components/automations/automation-card";
import { NewFromRun } from "@/components/automations/new-from-run";
import { requireSession } from "@/lib/auth/session";
import { lastRunPerAutomation, runsToStartFrom } from "@/lib/automations/runs";
import { listAutomations } from "@/lib/automations/store";

// A card's Run box starts an agent run inside this page's function (the inline runner uses after()), so this page's
// budget bounds the run, as on Home: 300 s is Vercel's maximum and the run's wall clock is set under it.
export const maxDuration = 300;

// /automations: the workspace's automations as cards, and the way to make a new one from a run.
export default async function AutomationsPage() {
  const { workspaceId } = await requireSession();
  const [automations, lastRuns, startingRuns] = await Promise.all([
    listAutomations(workspaceId),
    lastRunPerAutomation(workspaceId),
    runsToStartFrom(workspaceId),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Automations</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            A run you liked, saved to do again on a new input. Call a ready one from Home by typing{" "}
            <code className="rounded bg-muted px-1 text-xs">\</code> and its name.
          </p>
        </div>
        <NewFromRun runs={startingRuns} />
      </header>

      {automations.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {automations.map((a) => (
            <li key={a.id}>
              <AutomationCard automation={a} lastRun={lastRuns.get(a.id)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

// The flow in three steps, so a first visit explains itself instead of showing an empty grid.
function EmptyState() {
  return (
    <section className="rounded-xl border border-dashed bg-background px-6 py-10 text-center">
      <h2 className="text-base font-medium">No automations yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">Do a normal run first, then make it an automation.</p>
      <ol className="mx-auto mt-5 max-w-md space-y-2 text-left text-sm">
        <li>
          <span className="font-medium">1.</span> Run something from Home and check that the result is what you wanted.
        </li>
        <li>
          <span className="font-medium">2.</span> Press <span className="font-medium">New from a run</span> above and pick that run. A draft is written for you.
        </li>
        <li>
          <span className="font-medium">3.</span> Try the draft on an example, say whether the result looks right, and approve it.
        </li>
      </ol>
      <p className="mt-5 text-sm text-muted-foreground">
        From then on, <code className="rounded bg-muted px-1 text-xs">\audit Apple Inc.</code> on Home runs it for you.
      </p>
    </section>
  );
}
