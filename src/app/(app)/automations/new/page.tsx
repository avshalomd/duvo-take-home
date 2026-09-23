import Link from "next/link";
import { Drafting } from "@/components/automations/drafting";
import { requireSession } from "@/lib/auth/session";
import { getRun } from "@/lib/runs/queries";

// The draft runs as a Server Action from this page, so this page's function budget bounds it: extract() may take its
// 60 s and then try the fallback model for as long again.
export const maxDuration = 150;

// /automations/new?run=<id>: checks the run, then the page drafts an automation from it and opens the editor.
export default async function NewAutomationPage({ searchParams }: PageProps<"/automations/new">) {
  const { run } = await searchParams;
  const runId = typeof run === "string" ? run : "";
  const { workspaceId } = await requireSession();
  const found = runId ? await getRun(workspaceId, runId) : null; // another workspace's run reads as missing

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      {!found ? (
        <Problem title="Pick a run to start from" text="That run was not found. Open Automations and press New from a run to pick one." />
      ) : found.run.status !== "succeeded" ? (
        <Problem
          title="This run cannot become an automation"
          text="Only a run that finished well can be a starting point. Wait for it to finish, or pick another run."
        />
      ) : (
        <Drafting runId={found.run.id} prompt={found.run.prompt} />
      )}
    </main>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <section className="space-y-2 rounded-xl border border-dashed bg-background p-6">
      <h1 className="text-base font-medium">{title}</h1>
      <p className="text-sm text-muted-foreground">{text}</p>
      <Link href="/automations" className="inline-block text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
        Back to automations
      </Link>
    </section>
  );
}
