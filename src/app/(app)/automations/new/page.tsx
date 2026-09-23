import Link from "next/link";
import { BackLink } from "@/components/automations/back-link";
import { Drafting } from "@/components/automations/drafting";
import { RunPicker } from "@/components/automations/run-picker";
import { LINK, SHEET } from "@/components/automations/surfaces";
import { requireSession } from "@/lib/auth/session";
import { runsToStartFrom } from "@/lib/automations/runs";
import { getRun } from "@/lib/runs/queries";
import { cn } from "@/lib/utils";

// The draft runs as a Server Action from this page, so this page's function budget bounds it: extract() may take its
// 60 s and then try the fallback model for as long again.
export const maxDuration = 150;

// /automations/new: the runs to start from. /automations/new?run=<id>: that run, drafted into an automation.
export default async function NewAutomationPage({ searchParams }: PageProps<"/automations/new">) {
  const { run } = await searchParams;
  const runId = typeof run === "string" ? run : "";
  const { workspaceId } = await requireSession();

  if (!runId) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <BackLink />
        <header className="space-y-2">
          <h1 className="page-title text-graphite">Which run should it learn from?</h1>
          <p className="max-w-prose text-slate">Pick a run that did what you wanted. A first draft is written from it, and you check it before it is saved.</p>
        </header>
        <RunPicker runs={await runsToStartFrom(workspaceId)} />
      </main>
    );
  }

  const found = await getRun(workspaceId, runId); // another workspace's run reads as missing
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <BackLink />
      {!found ? (
        <Problem title="That run was not found" text="It may have been deleted, or it belongs to another workspace." />
      ) : found.run.status !== "succeeded" ? (
        <Problem title="This run cannot become an automation" text="Only a run that finished well can be a starting point. Wait for it to finish, or pick another run." />
      ) : (
        <Drafting runId={found.run.id} prompt={found.run.prompt} />
      )}
    </main>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <section className={cn(SHEET, "space-y-3 p-6 sm:p-10")}>
      <h1 className="page-title text-graphite">{title}</h1>
      <p className="text-slate">{text}</p>
      <Link href="/automations/new" className={LINK}>
        Pick a run
      </Link>
    </section>
  );
}
