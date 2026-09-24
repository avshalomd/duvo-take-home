import type { Metadata } from "next";
import { ConnectionsList } from "@/components/settings/connections-list";
import { OAuthToast } from "@/components/settings/oauth-toast";
import { requireSession } from "@/lib/auth/session";
import { listConnections } from "@/lib/connections/store";
import { canChangeSettings } from "@/lib/auth/roles";
import { oauthErrorSentence } from "./oauth-error";

// The query only carries the OAuth routes' outcome back; anything but a single string is ignored.
const one = (v: string | string[] | undefined) => (typeof v === "string" && v.length > 0 ? v.slice(0, 200) : undefined);

export const metadata: Metadata = { title: "Connections" };

export default async function ConnectionsPage({ searchParams }: PageProps<"/settings/connections">) {
  const { workspaceId, role } = await requireSession();
  const [params, connections] = await Promise.all([searchParams, listConnections(workspaceId)]);
  return (
    <>
      {/* ?oauth_error is a code, said in the page's own words: the text of a link is never shown as the app's */}
      <OAuthToast signedIn={one(params.signed_in)} error={oauthErrorSentence(one(params.oauth_error))} />
      {/* members see the servers and their state; owners and admins change them (the actions check it again) */}
      <ConnectionsList connections={connections} canEdit={canChangeSettings(role)} />
    </>
  );
}
