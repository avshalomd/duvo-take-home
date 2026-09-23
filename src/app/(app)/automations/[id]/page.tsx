import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Trial } from "@/contracts/automation";
import { ApproveForm } from "@/components/automations/approve-form";
import { DeleteButton } from "@/components/automations/delete-button";
import { AutomationEditor } from "@/components/automations/editor";
import { ExampleCard, type ExampleView } from "@/components/automations/example-card";
import { ReadySection } from "@/components/automations/ready-section";
import { AutomationStatusBadge } from "@/components/automations/status-badge";
import { TryExampleForm } from "@/components/automations/try-example-form";
import { outcome } from "@/components/run/outcome";
import { StatusDot } from "@/components/run/status-dot";
import { requireSession } from "@/lib/auth/session";
import { automationHistory } from "@/lib/automations/runs";
import { getAutomation, listTrials } from "@/lib/automations/store";
import { canApprove } from "@/lib/automations/template";
import { listConnections } from "@/lib/connections/store";
import { getRun } from "@/lib/runs/queries";

// "Run example" and "Run" start an agent run inside this page's function (the inline runner uses after()), so this
// page's budget bounds the run, as on Home: 300 s is Vercel's maximum and the run's wall clock is set under it.
export const maxDuration = 300;

const SHOWN_EXAMPLES = 6; // each one is read in full for its files and verdict; one or two is the norm

// /automations/<id>: while it is a draft, the editor, the examples and the approval; once it is approved, how to use
// it first, with the editor folded away because a change sends it back to testing.
export default async function AutomationPage({ params }: PageProps<"/automations/[id]">) {
  const { id } = await params;
  const { workspaceId } = await requireSession();
  const automation = await getAutomation(workspaceId, id);
  // not notFound(): the loading boundary above has already streamed a 200, so a plain message is what the reader gets anyway
  if (!automation) return <Missing />;

  const [trials, connections, history] = await Promise.all([
    listTrials(workspaceId, id),
    listConnections(workspaceId),
    automationHistory(workspaceId, id),
  ]);
  const current = trials.filter((t) => t.version === automation.version);
  const older = trials.filter((t) => t.version !== automation.version);
  const examples = await examplesOf(workspaceId, current.slice(0, SHOWN_EXAMPLES));
  const approval = canApprove(trials, automation.version);
  const isDraft = automation.status === "draft";

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-6">
      <Link href="/automations" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Automations
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{automation.name}</h1>
            <AutomationStatusBadge status={automation.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">\{automation.command}</code> {automation.description}
          </p>
          <p className="text-xs text-muted-foreground">Version {automation.version}</p>
        </div>
        <DeleteButton automationId={automation.id} name={automation.name} />
      </header>

      {!isDraft && <ReadySection automation={automation} history={history} />}

      {isDraft && (
        <p className="rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <span className="font-medium">Three steps to use it:</span> check the draft below, try it on an example and say whether the
          result looks right, then approve it.
        </p>
      )}

      <section aria-labelledby="the-automation" className="rounded-xl border bg-background p-5">
        {isDraft ? (
          <>
            <h2 id="the-automation" className="mb-4 text-base font-medium">
              1. Check the draft
            </h2>
            <AutomationEditor automation={automation} connections={connections} />
          </>
        ) : (
          // approved: the editor is one click away, and says what saving a change does
          <details>
            <summary id="the-automation" className="cursor-pointer text-base font-medium">
              Change the automation
            </summary>
            <p className="mt-2 mb-4 text-sm text-muted-foreground">
              Saving a change to what the agent is told sends it back to testing: it needs a new example and your approval again.
            </p>
            <AutomationEditor automation={automation} connections={connections} />
          </details>
        )}
      </section>

      <section aria-labelledby="examples" className="space-y-4 rounded-xl border bg-background p-5">
        <div className="space-y-1">
          <h2 id="examples" className="text-base font-medium">
            {isDraft ? "2. Try it on an example" : "Examples"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Each example is a real run of this version. Check what it made and say whether it looks right.
          </p>
        </div>
        <TryExampleForm
          automationId={automation.id}
          inputLabel={automation.inputLabel}
          inputHint={automation.inputHint}
          suggested={current.length === 0 ? automation.inputExample : ""}
        />
        {examples.length > 0 && (
          <ul className="space-y-3">
            {examples.map((e) => (
              <ExampleCard key={e.runId} automationId={automation.id} example={e} />
            ))}
          </ul>
        )}
        {older.length > 0 && <OlderExamples trials={older} />}
      </section>

      {isDraft && (
        <section aria-labelledby="approve" className="space-y-2">
          <h2 id="approve" className="text-base font-medium">
            3. Approve it
          </h2>
          <ApproveForm automationId={automation.id} allowed={approval.ok} reason={approval.ok ? null : approval.reason} />
        </section>
      )}
    </main>
  );
}

/** The current version's examples with what their cards show: the run's files and verdict, read once on the server. */
async function examplesOf(workspaceId: string, trials: Trial[]): Promise<ExampleView[]> {
  const found = await Promise.all(trials.map((t) => getRun(workspaceId, t.runId)));
  return trials.flatMap((t, i) => {
    const data = found[i];
    if (!data) return [];
    return [
      {
        runId: t.runId,
        input: t.input,
        status: data.run.status,
        outcome: data.run.outcome ?? null,
        files: data.files,
        verdict: data.verdict,
        humanVerdict: t.humanVerdict,
        humanNote: t.humanNote,
      },
    ];
  });
}

// Examples of an earlier version no longer count toward approval; they stay visible, folded, as the record.
function OlderExamples({ trials }: { trials: Trial[] }) {
  return (
    <details className="rounded-lg border px-4 py-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">
        {trials.length} {trials.length === 1 ? "example" : "examples"} from an earlier version
      </summary>
      <ul className="mt-3 space-y-2">
        {trials.map((t) => {
          const o = outcome(t.status, t.outcome);
          return (
            <li key={t.runId} className="flex flex-wrap items-center gap-2 text-sm">
              <StatusDot tone={o.tone} />
              <Link href={`/?run=${t.runId}`} className="font-medium hover:underline">
                {t.input}
              </Link>
              <span className="text-muted-foreground">
                {o.label}, version {t.version}
                {t.humanVerdict === "approved" ? ", you said it looked right" : t.humanVerdict === "rejected" ? ", you said it was not right" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

function Missing() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
      <section className="space-y-2 rounded-xl border border-dashed bg-background p-6">
        <h1 className="text-base font-medium">That automation was not found</h1>
        <p className="text-sm text-muted-foreground">It may have been deleted.</p>
        <Link href="/automations" className="text-sm text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
          Back to automations
        </Link>
      </section>
    </main>
  );
}
