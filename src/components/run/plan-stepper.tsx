import { CircleCheck, CircleDashed, CircleMinus, CircleStop, LoaderCircle, TriangleAlert } from "lucide-react";
import type { Plan, PlanStep, RunState } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { barTone, planProgress } from "./plan-progress";

// Below this, the per-step check thinks the step did not do what its title says (a probability from the checker).
const OFF_TRACK = 0.5;

// The plan is the hero of the panel: what the agent decided to do, and where it has got to, as a stepper that
// animates as the run moves. Everything technical about how it did it lives under Details.
export function PlanStepper({
  plan,
  runStatus,
  verdict,
  stepChecks,
}: {
  plan: Plan | null;
  runStatus: string;
  verdict: string | null;
  stepChecks: RunState["stepChecks"];
}) {
  const progress = planProgress(plan);
  const terminal = runStatus === "succeeded" || runStatus === "failed" || runStatus === "cancelled";

  if (!plan || !progress) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {terminal ? "The agent never stated a plan for this run." : "The agent is reading your instructions..."}
      </p>
    );
  }

  const running = terminal ? undefined : plan.steps.find((s) => s.status === "running");
  // a run whose every step was skipped is settled but not successful: a full emerald bar would say the opposite
  const anyDone = plan.steps.some((s) => s.status === "done");
  const bar = { pass: "bg-emerald-600", warn: "bg-amber-500", neutral: "bg-zinc-400 dark:bg-zinc-500" }[barTone(verdict, anyDone)];
  // a run that ended with a step still "running" stopped in the middle of it: say so instead of spinning for ever
  const stoppedMidway = runStatus === "cancelled" || runStatus === "failed";

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          {/* the width transition is the progress animation: one CSS line, no library */}
          <div data-testid="plan-bar" className={cn("h-full rounded-full transition-all duration-700 ease-out", bar)} style={{ width: `${progress.percent}%` }} />
        </div>
        <span data-testid="plan-progress" className="text-xs tabular-nums text-muted-foreground">
          {progress.label}
        </span>
      </div>

      <ol data-testid="plan-steps" className="space-y-1">
        {plan.steps.map((step, i) => {
          const check = stepChecks?.find((c) => c.stepIndex === step.index);
          const offTrack = step.status === "done" && check !== undefined && check.onTrack < OFF_TRACK;
          const stoppedHere = terminal && step.status === "running";
          return (
            <li
              key={step.index}
              // each step fades in just after the one above it, so a plan arriving reads as a list being written
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: "backwards" }}
              className={cn(
                "flex animate-in items-start gap-3 rounded-lg px-2 py-2 fade-in slide-in-from-bottom-1 duration-500",
                step.status === "running" && !terminal && "bg-amber-500/10",
              )}
            >
              <StepIcon status={step.status} stopped={stoppedHere} />
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm leading-snug",
                    step.status === "done" && "text-muted-foreground",
                    step.status === "running" && !terminal && "font-medium",
                    step.status === "skipped" && "text-muted-foreground line-through",
                  )}
                >
                  {step.title}
                  {offTrack && (
                    <TriangleAlert
                      data-testid="step-flag"
                      role="img"
                      aria-label="May be off track"
                      className="ml-1.5 inline size-3.5 align-[-2px] text-amber-600 dark:text-amber-400"
                    />
                  )}
                </p>
                {step.note && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.note}</p>}
                {offTrack && (
                  <p className="mt-0.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    This step may not have done what it says. {check.note}
                  </p>
                )}
                {stoppedHere && stoppedMidway && <p className="mt-0.5 text-xs text-muted-foreground">Stopped here</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {running && !running.note && <p className="mt-2 px-2 text-xs text-muted-foreground">Currently: {running.title.toLowerCase()}</p>}
    </div>
  );
}

function StepIcon({ status, stopped }: { status: PlanStep["status"]; stopped: boolean }) {
  if (stopped) return <CircleStop className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
  if (status === "done")
    // zoom-in on the check is the "step completed" moment; it only plays when the step first renders as done
    return <CircleCheck className="mt-0.5 size-4 shrink-0 animate-in text-emerald-600 zoom-in-50 duration-300 dark:text-emerald-400" />;
  if (status === "running") return <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />;
  if (status === "skipped") return <CircleMinus className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
  return <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground/60" />;
}
