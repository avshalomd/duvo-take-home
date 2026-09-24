import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { LimitsForm } from "@/components/settings/limits-form";
import { UsageCard } from "@/components/settings/usage-card";
import { requireSession } from "@/lib/auth/session";
import { canChangeSettings } from "@/lib/auth/roles";
import { getLimits, getUsage } from "@/lib/usage/budget";

export const metadata: Metadata = { title: "Limits" };

export default async function LimitsPage() {
  const session = await requireSession();
  const [limits, usage] = await Promise.all([getLimits(session.workspaceId), getUsage(session.workspaceId)]);
  const now = new Date(); // this page renders per request (it reads the session), so "now" is the time of the request
  const canEdit = canChangeSettings(session.role);
  return (
    <div className="space-y-8">
      {/* said first, before anything that looks like a control (UX QA U18: it was the page's last line) */}
      {!canEdit && (
        <p data-testid="limits-read-only" className="flex items-center gap-2 px-4 text-[15px] text-slate">
          <Lock aria-hidden className="size-4 shrink-0" />
          Only an owner or an admin can change the limits.
        </p>
      )}
      <UsageCard usage={usage} limits={limits} now={now} />
      {/* a budget is the workspace's money: members see it, owners and admins change it */}
      <LimitsForm limits={limits} canEdit={canEdit} />
    </div>
  );
}
