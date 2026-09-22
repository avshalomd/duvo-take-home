import { AddConnectionForm } from "@/components/automations/add-connection-form";
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

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-6">
        <section className="rounded-xl border bg-background p-4">
          <h1 className="mb-3 text-lg font-semibold">Automations</h1>
          <InstructionsForm />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Connections</h2>
          <ConnectionsList connections={connections} />
          <AddConnectionForm />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Runs</h2>
          <RunsList runs={runs} selectedId={selectedId} />
        </section>
      </div>

      {view ? (
        <RunPanel view={view} connections={connections} />
      ) : (
        <div className="flex items-center justify-center rounded-xl border bg-background p-10 text-sm text-muted-foreground">
          {selectedId ? "That run was not found." : "No run selected - write instructions and press Run."}
        </div>
      )}
    </div>
  );
}
