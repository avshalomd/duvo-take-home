import Link from "next/link";
import type { Automation, Trial } from "@/contracts/automation";
import { ApprovalBar } from "@/components/automations/approval-bar";
import { ApprovedNote } from "@/components/automations/approved-note";
import { AutomationDocument } from "@/components/automations/automation-document";
import { BackLink } from "@/components/automations/back-link";
import { CommandChip, InputToken } from "@/components/automations/brief-text";
import { DeleteButton } from "@/components/automations/delete-button";
import { ExampleCard, type ExampleView } from "@/components/automations/example-card";
import { History } from "@/components/automations/history";
import { RunForm } from "@/components/automations/run-form";
import { ScheduleForm } from "@/components/automations/schedule-form";
import { StatePill } from "@/components/automations/state-pill";
import { StatusToggle } from "@/components/automations/status-toggle";
import { LINK, SECTION, SHEET } from "@/components/automations/surfaces";
import { TryExampleForm } from "@/components/automations/try-example-form";
import { outcome } from "@/components/run/outcome";
import { requireSession } from "@/lib/auth/session";
import { approvalProgress } from "@/lib/automations/approval";
import { automationHistory } from "@/lib/automations/runs";
import { getAutomation, listTrials } from "@/lib/automations/store";
import { canApprove } from "@/lib/automations/template";
import { listConnections } from "@/lib/connections/store";
import { schedulerRunning } from "@/lib/runner/mode";
import { getRun } from "@/lib/runs/queries";
import { deriveState } from "@/lib/runs/state";
import { cn } from "@/lib/utils";

// "Run example" and "Run" start an agent run inside this page's function (the inline runner uses after()), so this
// page's budget bounds the run, as on Home: 300 s is Vercel's maximum and the run's wall clock is set under it.
export const maxDuration = 300;

const SHOWN_EXAMPLES = 6; // each one is read in full for its plan, files and verdict; one or two is the norm

// /automations/<id>. A draft is a document to check, with "Try it" beside it and the approval bar under the examples.
// A ready one leads with its one primary action, Run, then its schedule and its runs; the document follows.
export default async function AutomationPage({ params, searchParams }: PageProps<"/automations/[id]">) {
  const { id } = await params;
  const { approved } = await searchParams;
  const { workspaceId } = await requireSession();
  const automation = await getAutomation(workspaceId, id);
  // not notFound(): the loading boundary above has already streamed a 200, so a plain message is what the reader gets anyway
  if (!automation) return <Missing />;

  const [trials, connections, history] = await Promise.all([listTrials(workspaceId, id), listConnections(workspaceId), automationHistory(workspaceId, id)]);
  const current = trials.filter((t) => t.version === automation.version);
  const older = trials.filter((t) => t.version !== automation.version);
  const examples = await examplesOf(workspaceId, current.slice(0, SHOWN_EXAMPLES));
  const approval = canApprove(trials, automation.version);
  const isDraft = automation.status === "draft";
  const deleteButton = <DeleteButton automationId={automation.id} name={automation.name} />;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <BackLink />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <article className={cn(SHEET, "space-y-10 p-6 sm:p-10")}>
            <Header automation={automation} />
            {isDraft ? (
              <AutomationDocument automation={automation} connections={connections} footer={deleteButton} />
            ) : (
              <>
                {approved === "1" && automation.status === "active" && <ApprovedNote command={automation.command} />}
                {automation.status === "active" && (
                  <RunForm
                    automationId={automation.id}
                    command={automation.command}
                    inputLabel={automation.inputLabel}
                    inputHint={automation.inputHint}
                    inputExample={automation.inputExample}
                  />
                )}
                <section aria-labelledby="schedule" className="space-y-3 border-t border-hairline pt-8">
                  <h2 id="schedule" className={SECTION}>
                    Schedule
                  </h2>
                  <Schedule automation={automation} />
                </section>
                <section aria-labelledby="its-runs" className="space-y-3 border-t border-hairline pt-8">
                  <h2 id="its-runs" className={SECTION}>
                    Its runs
                  </h2>
                  <History runs={history} />
                </section>
              </>
            )}
          </article>

          {!isDraft && (
            // what an edit does is said where it matters: under the editor, and in the save's own message
            <article aria-label="The automation" className={cn(SHEET, "p-6 sm:p-10")}>
              <AutomationDocument automation={automation} connections={connections} footer={deleteButton} />
            </article>
          )}
        </div>

        <aside aria-labelledby="try-it" className="space-y-4 lg:sticky lg:top-20">
          <div className="space-y-1 px-1">
            <h2 id="try-it" className={SECTION}>
              Try it
            </h2>
            <p className="text-[15px] text-slate">Each example is a real run of this version. Check what it made.</p>
          </div>
          <TryExampleForm
            automationId={automation.id}
            inputLabel={automation.inputLabel}
            inputHint={automation.inputHint}
            suggested={current.length === 0 ? automation.inputExample : ""}
            secondary={!isDraft}
          />
          {examples.length > 0 && (
            <ul className="space-y-4">
              {examples.map((e) => (
                <ExampleCard key={e.runId} automationId={automation.id} example={e} />
              ))}
            </ul>
          )}
          {older.length > 0 && <OlderExamples trials={older} />}
          {isDraft && (
            <ApprovalBar
              automationId={automation.id}
              progress={approvalProgress(trials, automation.version)}
              allowed={approval.ok}
              reason={approval.ok ? null : approval.reason}
            />
          )}
        </aside>
      </div>
    </main>
  );
}

// The name as the page's title, the state with what can be done about it, and how it is called: the command, the
// input's name and its hint side by side.
function Header({ automation: a }: { automation: Automation }) {
  return (
    <header className="space-y-5">
      <h1 className="display text-[32px] break-words text-graphite sm:text-[40px]">{a.name}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatePill status={a.status} />
        {/* a draft's next step is said once, on the approval bar; a ready one gets its switch here (Q106) */}
        {a.status !== "draft" && <StatusToggle automationId={a.id} command={a.command} active={a.status === "active"} />}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-[17px]">
          <CommandChip command={a.command} />
          <InputToken label={a.inputLabel} />
        </span>
        {a.inputHint && <span className="text-[15px] text-slate">{a.inputHint}</span>}
      </div>
    </header>
  );
}

// Q84: a schedule only fires when something calls the scheduler (the worker, or the cron route with its secret).
// Without one the page says so in plain words instead of showing a next run that would never come.
function Schedule({ automation: a }: { automation: Automation }) {
  if (!schedulerRunning())
    return (
      <p className="max-w-[62ch] text-slate">
        Scheduled runs are not switched on here, so this automation runs only when you run it.
        {a.schedule ? " Its saved schedule starts working once they are." : ""}
      </p>
    );
  return (
    <ScheduleForm
      automationId={a.id}
      inputLabel={a.inputLabel}
      inputExample={a.inputExample}
      schedule={a.schedule}
      scheduleInput={a.scheduleInput}
      scheduleTz={a.scheduleTz ?? null}
      nextRunAt={a.status === "active" ? a.nextRunAt : null} // an automation that is off has no next run
    />
  );
}

/** The current version's examples with what their cards show: the plan, the files and the verdict, read once here. */
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
        plan: deriveState(data.run, data.events).plan,
        humanVerdict: t.humanVerdict,
        humanNote: t.humanNote,
      },
    ];
  });
}

// Examples of an earlier version no longer count toward approval; they stay, folded, as the record.
function OlderExamples({ trials }: { trials: Trial[] }) {
  return (
    <details className="rounded-[16px] px-1">
      <summary className="cursor-pointer text-[15px] text-slate">
        {trials.length} {trials.length === 1 ? "example" : "examples"} from an earlier version
      </summary>
      <ul className="mt-3 space-y-2">
        {trials.map((t) => (
          <li key={t.runId} className="text-[15px]">
            <Link href={`/?run=${t.runId}`} className={LINK}>
              {t.input}
            </Link>
            <span className="text-slate">
              {" "}
              {outcome(t.status, t.outcome).label.toLowerCase()}
              {t.humanVerdict === "approved" ? ", you said it looked right" : t.humanVerdict === "rejected" ? ", you said it was not right" : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Missing() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-8 sm:px-6 sm:py-12">
      <BackLink />
      <section className={cn(SHEET, "space-y-3 p-6 sm:p-10")}>
        <h1 className="display text-[28px] text-graphite">That automation was not found</h1>
        <p className="text-slate">It may have been deleted.</p>
      </section>
    </main>
  );
}
