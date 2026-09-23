import { ConnectionsList } from "@/components/settings/connections-list";
import { OAuthToast } from "@/components/settings/oauth-toast";
import { requireSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";

// The query only carries a message back from the OAuth callback; anything but a single string is ignored.
const one = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v.slice(0, 200) : undefined);

export default async function ConnectionsPage({ searchParams }: PageProps<"/settings/connections">) {
  const { workspaceId } = await requireSession();
  const [params, connections] = await Promise.all([searchParams, listConnections(workspaceId)]);
  return (
    <>
      <OAuthToast signedIn={one(params.signed_in)} error={one(params.oauth_error)} />
      <ConnectionsList connections={connections} />
    </>
  );
}
