import { AppHeader } from "@/components/automations/app-header";
import { ConnectionsList } from "@/components/automations/connections-list";
import { InstructionsForm } from "@/components/automations/instructions-form";
import { RunPanel } from "@/components/automations/run-panel";
import { RunsList } from "@/components/automations/runs-list";
import type { RunView } from "@/components/automations/types";
import { listConnections } from "@/lib/connections/store";
import { getRun, listRuns } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";

// One page: the left column starts a run, the right shows the run named by ?run=<id>.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { run: requested } = await searchParams;
  const [runs, connections] = await Promise.all([listRuns(), listConnections()]);

  const selectedId = typeof requested === "string" ? requested : runs[0]?.id;
  const data = selectedId ? await getRun(selectedId) : null;
  // deriveState is pure, so the panel's state card is computed on every render rather than stored and stale
  const view: RunView | null = data ? { ...data, state: deriveState(data.run, data.events) } : null;
  const live = runs.filter((r) => r.status === "running" || r.status === "queued" || r.status === "evaluating").length;

  return (
    <>
      <AppHeader liveCount={live} />
      {/* one column under 900px, and there the panel comes first: after pressing Run, the run is what you want to see */}
      <main className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 gap-4 px-4 py-4 min-[900px]:grid-cols-[21rem_minmax(0,1fr)] min-[900px]:gap-5">
        <div className="min-w-0 space-y-4">
          <InstructionsForm />
          <ConnectionsList connections={connections} />
          <RunsList runs={runs} selectedId={selectedId} />
        </div>

        <div className="order-first min-w-0 min-[900px]:order-none">
          {view ? <RunPanel view={view} connections={connections} /> : <NoRun notFound={Boolean(selectedId)} />}
        </div>
      </main>
    </>
  );
}

function NoRun({ notFound }: { notFound: boolean }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-background p-10 text-center">
      <p className="text-sm font-medium">{notFound ? "That run was not found." : "Pick a run or start one"}</p>
      <p className="text-xs text-muted-foreground">
        {notFound ? "It may have been deleted." : "Write the task on the left and press Run - the agent plans first."}
      </p>
    </div>
  );
}
