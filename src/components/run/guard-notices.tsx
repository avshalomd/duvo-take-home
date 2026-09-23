import { ShieldAlert, ShieldQuestion } from "lucide-react";
import type { RunState } from "@/contracts/run";
import { guardNotices } from "./guard-notice";

// What the safety checks stopped or marked during the run, at glance level and in plain words. The guard's own
// reason, the tool and the address are in Details.
export function GuardNotices({ guards }: { guards: RunState["guards"] }) {
  const notices = guardNotices(guards ?? []);
  if (notices.length === 0) return null;
  return (
    <ul data-testid="guard-notices" className="space-y-1.5 rounded-[16px] bg-saffron-wash px-4 py-3 text-[14px] leading-5">
      {notices.map((n) => (
        <li key={n.text} className="flex items-start gap-2.5">
          {n.tone === "warn" ? (
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-saffron" />
          ) : (
            <ShieldQuestion aria-hidden className="mt-0.5 size-4 shrink-0 text-slate" />
          )}
          <span>
            {n.text}
            {n.count > 1 && <span className="text-slate"> ({n.count} times)</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
