import Link from "next/link";
import type { Automation, Trial } from "@/contracts/automation";
import { ApprovalBar } from "@/components/automations/approval-bar";
import { ApprovedNote } from "@/components/automations/approved-note";
import { AutomationDocument } from "@/components/automations/automation-document";
import { AutomationSave } from "@/components/automations/automation-save";
import { BackLink } from "@/components/automations/back-link";
import { CommandChip, InputToken } from "@/components/automations/brief-text";
import { DeleteButton } from "@/components/automations/delete-button";
import { ExampleCard, type ExampleView } from "@/components/automations/example-card";
import { History } from "@/components/automations/history";
import { RunForm } from "@/components/automations/run-form";
import { ScheduleForm } from "@/components/automations/schedule-form";
import { StateGlyph } from "@/components/automations/state-glyph";
import { StatusToggle } from "@/components/automations/status-toggle";
import { LINK, SECTION, SHEET, SMALL } from "@/components/automations/surfaces";
import { TryExampleForm } from "@/components/automations/try-example-form";
import { outcome } from "@/components/run/outcome";
import { requireSession } from "@/lib/auth/session";
import { approvalProgress } from "@/lib/automations/approval";
import { canGovernAutomations, hasBeenApproved } from "@/lib/automations/permissions";
import { automationHistory } from "@/lib/automations/runs";
import { getAutomation, listTrials } from "@/lib/automations/store";
import { canApprove } from "@/lib/automations/template";
import { listConnections } from "@/lib/connections/store";
import { schedulerRunning } from "@/lib/runner/mode";
import { judgeNames, judgeOf } from "@/lib/runs/judges";
import { getRun } from "@/lib/runs/queries";
import { verdictChangeLabel, verdictWords } from "@/lib/runs/verdict-words";
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
  const { workspaceId, role, userId } = await requireSession();
  const automation = await getAutomation(workspaceId, id);
  // not notFound(): the loading boundary above has already streamed a 200, so a plain message is what the reader gets anyway
  if (!automation) return <Missing />;

  const [trials, allConnections, history] = await Promise.all([listTrials(workspaceId, id), listConnections(workspaceId), automationHistory(workspaceId, id)]);
  // the editor offers them by name, on or off: no address, sign-in or tool list goes to the browser, members' included
  const connections = allConnections.map((c) => ({ name: c.name, enabled: c.enabled }));
  const current = trials.filter((t) => t.version === automation.version);
  const older = trials.filter((t) => t.version !== automation.version);
  // each judgment says who made it: "You said" to them, their name to everyone else (Q178)
  const names = await judgeNames(trials.map((t) => t.humanVerdictBy));
  const said = (t: Trial) => (t.humanVerdict ? verdictWords(t.humanVerdict, judgeOf(t.humanVerdictBy, names), userId) : null);
  const changeLabel = (t: Trial) => verdictChangeLabel(judgeOf(t.humanVerdictBy, names), userId); // whose judgment a change replaces
  const examples = await examplesOf(workspaceId, current.slice(0, SHOWN_EXAMPLES), said, changeLabel);
  const approval = canApprove(trials, automation.version);
  const isDraft = automation.status === "draft";
  // Q178: a member drafts, edits, tries and judges; approve, turn off, delete and the schedule read as who does them
  const governs = canGovernAutomations(role);
  // once approved, people call it by its command, even after an edit sent it back to draft (review R2)
  const commandLocked = !governs && hasBeenApproved(automation.status, automation.version, trials);
  const deleteButton = governs ? (
    <DeleteButton automationId={automation.id} name={automation.name} command={automation.command} approved={!isDraft} />
  ) : (
    <p className={SMALL}>An owner or an admin can delete it.</p>
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 sm:px-6 sm:py-10">
      <BackLink />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        {/* the save's state lives here, above both layouts: a save that makes a Ready one a draft keeps its message (review) */}
        <AutomationSave key={automation.id}>
          <div className="min-w-0 space-y-6">
            <article className={cn(SHEET, "space-y-10 p-6 sm:p-10")}>
              <Header automation={automation} governs={governs} />
              {isDraft ? (
                <AutomationDocument automation={automation} connections={connections} footer={deleteButton} approver={governs} commandLocked={commandLocked} />
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
                    <Schedule automation={automation} governs={governs} />
                  </section>
                  <section aria-labelledby="its-runs" className="space-y-3 border-t border-hairline pt-8">
                    <h2 id="its-runs" className={SECTION}>
                      Its runs
                    </h2>
                    <History runs={history} callable={automation.status === "active"} />
                  </section>
                </>
              )}
            </article>

            {!isDraft && (
              // what an edit does is said where it matters: under the editor, and in the save's own message
              <article aria-label="The automation" className={cn(SHEET, "p-6 sm:p-10")}>
                <AutomationDocument automation={automation} connections={connections} footer={deleteButton} approver={governs} commandLocked={commandLocked} />
              </article>
            )}
          </div>
        </AutomationSave>

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
          {older.length > 0 && <OlderExamples trials={older} said={said} />}
          {isDraft && (
            <ApprovalBar
              automationId={automation.id}
              progress={approvalProgress(trials, automation.version)}
              allowed={approval.ok}
              reason={approval.ok ? null : approval.reason}
              approver={governs}
            />
          )}
        </aside>
      </div>
    </main>
  );
}

// The name as the page's title, the state with what can be done about it, and how it is called: the command, the
// input's name and its hint side by side.
function Header({ automation: a, governs }: { automation: Automation; governs: boolean }) {
  const active = a.status === "active";
  return (
    <header className="space-y-5">
      <h1 className="page-title break-words text-graphite">{a.name}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StateGlyph status={a.status} className="text-[15px]" />
        {/* a draft's next step is said once, on the approval bar; a ready one gets its switch here (Q106), or who has it (Q178) */}
        {a.status !== "draft" &&
          (governs ? (
            <StatusToggle automationId={a.id} command={a.command} active={active} />
          ) : (
            <p className={SMALL}>{active ? "An owner or an admin can turn it off." : "An owner or an admin can turn it on."}</p>
          ))}
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
function Schedule({ automation: a, governs }: { automation: Automation; governs: boolean }) {
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
      lastSkipped={a.lastSkippedAt && a.lastSkippedReason ? { at: a.lastSkippedAt, reason: a.lastSkippedReason } : null}
      canEdit={governs}
    />
  );
}

/** The current version's examples with what their cards show: the plan, the files and the verdict, read once here. */
async function examplesOf(
  workspaceId: string,
  trials: Trial[],
  said: (t: Trial) => string | null,
  changeLabel: (t: Trial) => string,
): Promise<ExampleView[]> {
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
        said: said(t),
        changeLabel: changeLabel(t),
      },
    ];
  });
}

// Examples of an earlier version no longer count toward approval; they stay, folded, as the record.
function OlderExamples({ trials, said }: { trials: Trial[]; said: (t: Trial) => string | null }) {
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
              {said(t) && `. ${said(t)}`}
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
        <h1 className="page-title text-graphite">That automation was not found</h1>
        <p className="text-slate">It may have been deleted.</p>
      </section>
    </main>
  );
}
