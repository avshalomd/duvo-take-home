import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { FirstVisit } from "@/components/run/first-visit";
import { HandoverHost } from "@/components/run/handover-host";
import { NotFoundSheet } from "@/components/run/not-found-sheet";
import { RailFallback, SheetSkeleton } from "@/components/run/panel-skeleton";
import { RunSheet } from "@/components/run/run-sheet";
import { RunsRail, type RailRun } from "@/components/run/runs-rail";
import { RailSheet } from "@/components/run/rail-sheet";
import { requireSession } from "@/lib/auth/session";
import { judgeNames, judgeOf } from "@/lib/runs/judges";
import { getRun, listRuns } from "@/lib/runs/queries";
import { judgeWho, verdictWords } from "@/lib/runs/verdict-words";
import { deriveState } from "@/lib/runs/state";
import { composerProps, connectionsOf, fileFacts, readyAutomations, titles } from "@/components/run/home-data";
import { runTag as runTagOf, runTitle as runTitleOf } from "@/components/run/rail";
import { tabTitle } from "./tab-title";

// The Run button's action may run the agent inside this page's function (the inline runner), so the page's own
// budget is what bounds it: 300 s is Vercel's maximum, and the run's wall clock is set well under it (Q55).
export const maxDuration = 300;

// The open run, read once per request: the tab's title and the page both need it
const readRun = cache(getRun);

// The tab is titled by the open run, as the page is (UX QA U5): "<brief> - Handover"; Home on its own is "Handover".
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const { run } = await searchParams;
  if (typeof run !== "string") return {};
  const { workspaceId } = await requireSession();
  const [data, automations] = await Promise.all([readRun(workspaceId, run), readyAutomations(workspaceId)]);
  if (!data) return { title: "Not found" };
  return { title: tabTitle(runTitleOf(data.run, titles(automations.all).names)) };
}

// Home: the runs rail on the left; the main column holds either the first-visit question ("/") or the run named by
// ?run=<id>, with the composer floating at the bottom of its sheet.
//
// Two Suspense boundaries that stay mounted across navigations. When a run opens, the navigation is a React
// transition: an already visible boundary keeps showing the old view until the new one is complete, so a new run
// replaces the sheet that stood in for it (HandoverHost) in one commit, with nothing in between. A route-level
// loading.tsx would show its skeleton first, so Home has none.
export default async function Home({ searchParams }: PageProps<"/">) {
  const { run } = await searchParams;
  const selectedId = typeof run === "string" ? run : undefined;
  const { workspaceId, userId } = await requireSession();

  return (
    <div className="flex w-full flex-1">
      <Suspense fallback={<RailFallback />}>
        <Rail workspaceId={workspaceId} selectedId={selectedId} />
      </Suspense>
      <main className="min-w-0 flex-1 px-3 pt-3 pb-6 min-[900px]:px-8 min-[900px]:pt-6">
        {/* room for a run that does not exist yet: the sheet the brief moves into at the press of Run (Q138) */}
        <HandoverHost>
          <Suspense fallback={<SheetSkeleton />}>
            <MainColumn workspaceId={workspaceId} userId={userId} selectedId={selectedId} />
          </Suspense>
        </HandoverHost>
      </main>
    </div>
  );
}

async function Rail({ workspaceId, selectedId }: { workspaceId: string; selectedId?: string }) {
  const [runs, automations] = await Promise.all([listRuns(workspaceId), readyAutomations(workspaceId)]);
  const { names, commands } = titles(automations.all);
  const rail: RailRun[] = runs.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    title: runTitleOf(r, names),
    tag: runTagOf(r),
    command: r.automationId ? (commands[r.automationId] ?? null) : null,
    status: r.status,
    outcome: r.outcome ?? null,
    stopping: Boolean(r.cancelRequested),
    healAttempts: r.healAttempts ?? 0,
    createdAt: r.createdAt,
  }));
  return (
    <>
      {/* on a desk: a heavier material beside the sheet, sticky under the 3.5rem top bar, scrolling on its own */}
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-72 shrink-0 flex-col bg-mist-deep min-[900px]:flex">
        <RunsRail runs={rail} selectedId={selectedId} />
      </aside>
      {/* on a phone the same rail is a sheet, opened from the top bar */}
      <RailSheet runs={rail} selectedId={selectedId} />
    </>
  );
}

async function MainColumn({ workspaceId, userId, selectedId }: { workspaceId: string; userId: string; selectedId?: string }) {
  // side by side, not one after another: each read is its own round trip to the database (readyAutomations and
  // connectionsOf are cached per request, so the composer's reads of them are the same ones)
  const [composer, data, automations, allConnections] = await Promise.all([
    composerProps(workspaceId),
    selectedId ? readRun(workspaceId, selectedId) : null,
    readyAutomations(workspaceId),
    connectionsOf(workspaceId),
  ]);
  if (!selectedId) return <FirstVisit composer={composer} />;
  if (!data) return <NotFoundSheet />;
  const { run } = data;
  const { names } = titles(automations.all);
  // a follow-up's parent, read once: its title here, and the sheets it carried over in the file facts
  const parent = run.parentRunId ? await getRun(workspaceId, run.parentRunId) : null;
  const connections = allConnections.map((c) => ({ name: c.name })); // names only: no url, no token state
  // the person's mark, as who made it: "You said" only to them (Q178)
  const [judges, facts] = await Promise.all([judgeNames([run.humanVerdictBy]), fileFacts(workspaceId, run, data.files, parent)]);
  const judge = judgeOf(run.humanVerdictBy, judges);
  const verdictLine = run.humanVerdict ? verdictWords(run.humanVerdict, judge, userId) : null;

  return (
    <RunSheet
      // deriveState is pure, so the run's state is computed on every render rather than stored and stale
      view={{ ...data, state: deriveState(run, data.events) }}
      title={runTitleOf(run, names)}
      parentTitle={parent ? runTitleOf(parent.run, names) : null}
      automationName={run.automationId ? (names[run.automationId] ?? null) : null}
      verdictLine={verdictLine}
      judgedBy={judgeWho(judge, userId)}
      facts={facts}
      connections={connections}
      composer={composer}
    />
  );
}

