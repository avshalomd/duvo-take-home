import { ShieldAlert, ShieldQuestion } from "lucide-react";
import type { RunState } from "@/contracts/run";
import { guardNotices } from "./guard-notice";

// What the safety checks stopped or marked during the run, at glance level and in plain words. The guard's own
// reason, the tool and the address are in Details.
export function GuardNotices({ guards }: { guards: RunState["guards"] }) {
  const notices = guardNotices(guards ?? []);
  if (notices.length === 0) return null;
  return (
    <ul data-testid="guard-notices" className="space-y-1 border-b bg-amber-500/5 px-4 py-2.5 text-sm">
      {notices.map((n) => (
        <li key={n.text} className="flex items-start gap-2">
          {n.tone === "warn" ? (
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          ) : (
            <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span>
            {n.text}
            {n.count > 1 && <span className="text-muted-foreground"> ({n.count} times)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
