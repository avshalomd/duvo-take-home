import { ConnectionsList } from "@/components/settings/connections-list";
import { requireSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";

export default async function ConnectionsPage() {
  const { workspaceId } = await requireSession();
  return <ConnectionsList connections={await listConnections(workspaceId)} />;
}
