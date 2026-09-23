import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AcceptInvite, SignOutButton } from "@/components/auth/accept-invite";
import { AuthPanel } from "@/components/auth/auth-panel";
import { buttonVariants } from "@/components/ui/button";
import { getInvitation } from "@/lib/auth/members";
import { withNext } from "@/lib/auth/paths";
import { sessionFromHeaders } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Invitation - Automations" };

const primary = cn(buttonVariants(), "h-11 w-full text-[15px]");
const secondary = cn(buttonVariants({ variant: "outline" }), "h-11 w-full text-[15px]");

// Public (the proxy lets it through): the invited person may have no account yet. The page says who invited them
// to what, then asks them to sign in or sign up with the invited address, then to join.
export default async function InvitePage({ params }: PageProps<"/invite/[id]">) {
  const { id } = await params;
  const [invitation, ctx] = await Promise.all([getInvitation(id), sessionFromHeaders(await headers())]);
  const here = `/invite/${id}`;

  if (!invitation || !invitation.open) {
    return (
      <AuthPanel title="This invitation is closed" description="It has expired or was already used. Ask the person who invited you for a new link.">
        <Link href="/" className={secondary}>
          Go to your workspace
        </Link>
      </AuthPanel>
    );
  }

  const title = `Join ${invitation.workspaceName}`;
  const description = `${invitation.inviterName} invited ${invitation.email} to work together in ${invitation.workspaceName}.`;

  if (!ctx) {
    return (
      <AuthPanel title={title} description={description}>
        <div className="flex flex-col gap-3">
          <Link href={withNext("/sign-up", here, invitation.email)} className={primary}>
            Create an account
          </Link>
          <Link href={withNext("/sign-in", here, invitation.email)} className={secondary}>
            I already have an account
          </Link>
        </div>
      </AuthPanel>
    );
  }

  // Better Auth accepts only for the invited address; say so here rather than after a click.
  if (ctx.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthPanel title={title} description={`This invitation was sent to ${invitation.email}, and you are signed in as ${ctx.email}.`}>
        <SignOutButton label={`Sign in as ${invitation.email}`} next={here} />
      </AuthPanel>
    );
  }

  return (
    <AuthPanel title={title} description={description}>
      <AcceptInvite invitationId={invitation.id} workspaceName={invitation.workspaceName} />
    </AuthPanel>
  );
}
