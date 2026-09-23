import Link from "next/link";
import { Suspense } from "react";
import type { CommandOption } from "@/components/run/command-list";
import { Composer } from "@/components/run/composer";
import { PanelSkeleton } from "@/components/run/panel-skeleton";
import { runTag, runTitle } from "@/components/run/rail";
import { RailSheet } from "@/components/run/rail-sheet";
import { RunPanel } from "@/components/run/run-panel";
import { RunsRail, type RailRun } from "@/components/run/runs-rail";
import type { RunView } from "@/components/run/types";
import type { Automation } from "@/contracts/automation";
import type { Connection } from "@/contracts/connection";
import type { Run } from "@/contracts/run";
import { requireSession } from "@/lib/auth/session";
import { listAutomations } from "@/lib/automations/store";
import { listConnections } from "@/lib/connections/store";
import { getRun, listRuns } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";

// The Run button's Server Action may run the agent inside this page's function (the inline runner), so the page's
// own budget is what bounds it: 300 s is Vercel's maximum, and the run's wall clock is set well under it (Q55).
export const maxDuration = 300;

// Home: the runs rail on the left, and the main column - the box on top, the run named by ?run=<id> under it.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { run: requested } = await searchParams;
  const { workspaceId } = await requireSession();
  const [runs, connections, automations] = await Promise.all([
    listRuns(workspaceId),
    listConnections(workspaceId),
    // the saved automations only add the command list and the rail's tags: Home must open even if they cannot load
    listAutomations(workspaceId).catch((): Automation[] => []),
  ]);

  const selectedId = typeof requested === "string" ? requested : runs[0]?.id;
  const commands = Object.fromEntries(automations.map((a) => [a.id, a.command]));
  const rail: RailRun[] = runs.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    title: runTitle(r),
    tag: runTag(r, commands),
    status: r.status,
    outcome: r.outcome ?? null,
    stopping: Boolean(r.cancelRequested),
    createdAt: r.createdAt,
  }));
  const offered: CommandOption[] = automations
    .filter((a) => a.status === "active") // a draft has not been approved on an example yet: it cannot be called
    .map((a) => ({ command: a.command, name: a.name, produces: a.template.expectedOutputs[0] ?? a.description }));

  return (
    <div className="flex w-full flex-1">
      {/* the rail on a desk: sticky under the 3.5rem top bar, scrolling on its own */}
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 flex-col border-r bg-background min-[900px]:flex">
        <RunsRail runs={rail} selectedId={selectedId} />
      </aside>
      {/* on a phone the same rail is a sheet, opened from the top bar */}
      <RailSheet runs={rail} selectedId={selectedId} />

      <main className="mx-auto w-full max-w-4xl min-w-0 space-y-4 px-3 py-4 min-[900px]:px-6 min-[900px]:py-6">
        <Composer automations={offered} connections={connections.filter((c) => c.enabled).map((c) => c.name)} />
        {/* only the run waits for its data: the rail and the box are on screen already, and the key makes switching
            runs fall back to a run-shaped skeleton instead of a blank column (Q66) */}
        <Suspense key={selectedId ?? "none"} fallback={<PanelSkeleton />}>
          <RunColumn workspaceId={workspaceId} selectedId={selectedId} connections={connections} runs={runs} />
        </Suspense>
      </main>
    </div>
  );
}

async function RunColumn({ workspaceId, selectedId, connections, runs }: { workspaceId: string; selectedId?: string; connections: Connection[]; runs: Run[] }) {
  const data = selectedId ? await getRun(workspaceId, selectedId) : null;
  if (!data) return <NoRun notFound={Boolean(selectedId)} />;
  // deriveState is pure, so the run's state is computed on every render rather than stored and stale
  const view: RunView = { ...data, state: deriveState(data.run, data.events) };
  const parent = data.run.parentRunId ? runs.find((r) => r.id === data.run.parentRunId) : undefined;
  return <RunPanel view={view} connections={connections} parentTitle={parent ? runTitle(parent) : null} />;
}

function NoRun({ notFound }: { notFound: boolean }) {
  return (
    <div className="flex min-h-[20rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-background p-10 text-center">
      <p className="text-sm font-medium">{notFound ? "That run was not found." : "Nothing has run yet."}</p>
      {notFound ? (
        // a dead link in the address bar is a dead end otherwise: "/" opens the newest run
        <Link href="/" className="text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
          Open the most recent run
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">Describe a task above and press Run. The agent says how it read it before it starts.</p>
      )}
    </div>
  );
}
