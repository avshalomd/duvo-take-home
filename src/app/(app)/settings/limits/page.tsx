import { LimitsForm } from "@/components/settings/limits-form";
import { UsageCard } from "@/components/settings/usage-card";
import { requireSession } from "@/lib/auth/session";
import { getLimits, getUsage } from "@/lib/usage/budget";
import { canChangeSettings } from "@/lib/auth/roles";

export default async function LimitsPage() {
  const session = await requireSession();
  const [limits, usage] = await Promise.all([getLimits(session.workspaceId), getUsage(session.workspaceId)]);
  const now = new Date(); // this page renders per request (it reads the session), so "now" is the time of the request
  return (
    <div className="space-y-4">
      <UsageCard usage={usage} limits={limits} now={now} />
      {/* a budget is the workspace's money: members see it, owners and admins change it */}
      <LimitsForm limits={limits} canEdit={canChangeSettings(session.role)} />
    </div>
  );
}
