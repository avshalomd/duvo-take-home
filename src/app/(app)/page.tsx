import Link from "next/link";
import { Suspense } from "react";
import { InstructionsForm } from "@/components/run/instructions-form";
import { PanelSkeleton } from "@/components/run/panel-skeleton";
import { RunPanel } from "@/components/run/run-panel";
import { RunsList } from "@/components/run/runs-list";
import type { RunView } from "@/components/run/types";
import type { Connection } from "@/contracts/connection";
import { requireSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { getRun, listRuns } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";

// The Run form's Server Action runs the whole agent loop inside this page's function, so the page's own budget is
// what bounds it: 300 s is Vercel's maximum, and the run's wall clock is set well under it (Q55).
export const maxDuration = 300;

// One page: the left column starts a run, the right shows the run named by ?run=<id>.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { run: requested } = await searchParams;
  const { workspaceId } = await requireSession();
  const [runs, connections] = await Promise.all([listRuns(workspaceId), listConnections(workspaceId)]);

  const selectedId = typeof requested === "string" ? requested : runs[0]?.id;

  return (
    <>
      {/* the runs list is 22 tabs deep; this is the first thing the keyboard reaches, and it goes to the run (Q70) */}
      {selectedId && (
        <a
          href="#run"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-[3px] focus:ring-ring/50"
        >
          Skip to the run
        </a>
      )}
      {/* one column under 900px, and there the panel comes first: after pressing Run, the run is what you want to see */}
      <main className="mx-auto grid w-full max-w-[100rem] flex-1 grid-cols-1 gap-4 px-4 py-4 min-[900px]:grid-cols-[21rem_minmax(0,1fr)] min-[900px]:gap-5">
        <div className="min-w-0 space-y-4">
          <InstructionsForm />
          <RunsList runs={runs} selectedId={selectedId} />
        </div>

        <div className="order-first min-w-0 min-[900px]:order-none">
          {/* only the panel waits for its run: the rest of the page is already on screen, and the key makes
              switching runs fall back to a panel-shaped skeleton instead of a blank column (Q66) */}
          <Suspense key={selectedId ?? "none"} fallback={<PanelSkeleton />}>
            <RunColumn workspaceId={workspaceId} selectedId={selectedId} connections={connections} />
          </Suspense>
        </div>
      </main>
    </>
  );
}

async function RunColumn({ workspaceId, selectedId, connections }: { workspaceId: string; selectedId?: string; connections: Connection[] }) {
  const data = selectedId ? await getRun(workspaceId, selectedId) : null;
  // deriveState is pure, so the panel's state card is computed on every render rather than stored and stale
  const view: RunView | null = data ? { ...data, state: deriveState(data.run, data.events) } : null;

  return view ? <RunPanel view={view} connections={connections} /> : <NoRun notFound={Boolean(selectedId)} />;
}

function NoRun({ notFound }: { notFound: boolean }) {
  return (
    <div className="flex h-full min-h-[24rem] flex-col items-center justify-center gap-1 rounded-xl border border-dashed bg-background p-10 text-center">
      <p className="text-sm font-medium">{notFound ? "That run was not found." : "Pick a run on the left, or write instructions and press Run."}</p>
      {notFound ? (
        // a dead link in the address bar is a dead end otherwise: "/" opens the newest run
        <Link href="/" className="text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
          Open the most recent run
        </Link>
      ) : (
        <p className="text-xs text-muted-foreground">The agent says how it read the task before it starts work.</p>
      )}
    </div>
  );
}
