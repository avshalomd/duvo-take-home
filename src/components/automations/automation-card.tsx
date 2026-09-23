import Link from "next/link";
import type { Automation } from "@/contracts/automation";
import { outcome } from "@/components/run/outcome";
import { StatusDot } from "@/components/run/status-dot";
import { TimeAgo } from "@/components/run/time-ago";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AutomationRun } from "@/lib/automations/runs";
import { AutomationStatusBadge } from "./status-badge";
import { RunBox } from "./run-box";

// One automation on the list: what it is, how to call it, what it produces, how its last run went, and - when it is
// ready - a box to run it right here. Nothing technical: the template itself lives on its own page.
export function AutomationCard({ automation: a, lastRun }: { automation: Automation; lastRun: AutomationRun | undefined }) {
  const last = lastRun ? outcome(lastRun.status, lastRun.outcome) : null;
  return (
    <Card data-testid="automation-card">
      <CardHeader>
        <CardTitle>
          <Link href={`/automations/${a.id}`} className="hover:underline focus-visible:underline focus-visible:outline-none">
            {a.name}
          </Link>
        </CardTitle>
        <CardDescription>{a.description}</CardDescription>
        <CardAction>
          <AutomationStatusBadge status={a.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">\{a.command}</code>{" "}
          <span className="text-muted-foreground">{a.inputLabel}</span>
        </p>
        <p className="text-xs text-muted-foreground">Produces {a.template.expectedOutputs.join("; ")}</p>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {last && lastRun ? (
            <>
              <StatusDot tone={last.tone} />
              <span>
                Last run: {last.label}
                {lastRun.purpose === "trial" ? " (an example)" : ""}
              </span>
              <TimeAgo iso={lastRun.createdAt} className="ml-auto" />
            </>
          ) : (
            <span>Not run yet</span>
          )}
        </p>
        {a.status === "active" && <RunBox automationId={a.id} inputLabel={a.inputLabel} placeholder={a.inputHint} />}
        {a.status === "draft" && (
          <Link href={`/automations/${a.id}`} className="inline-block text-sm font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-400">
            Try it on an example and approve it
          </Link>
        )}
        {a.status === "disabled" && <p className="text-xs text-muted-foreground">Turned off. Open it to turn it back on.</p>}
      </CardContent>
    </Card>
  );
}
