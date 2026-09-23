import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AcceptInvite, SignOutButton } from "@/components/auth/accept-invite";
import { AuthCard } from "@/components/auth/auth-card";
import { buttonVariants } from "@/components/ui/button";
import { getInvitation } from "@/lib/auth/members";
import { withNext } from "@/lib/auth/paths";
import { sessionFromHeaders } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Invitation - Automations" };

// Public (the proxy lets it through): the invited person may have no account yet. The page says who invited them
// to what, then asks them to sign in or sign up with the invited address, then to join.
export default async function InvitePage({ params }: PageProps<"/invite/[id]">) {
  const { id } = await params;
  const [invitation, ctx] = await Promise.all([getInvitation(id), sessionFromHeaders(await headers())]);
  const here = `/invite/${id}`;

  if (!invitation || !invitation.open) {
    return (
      <AuthCard title="This invitation is closed" description="It has expired or was already used. Ask the person who invited you for a new link.">
        <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "h-9 w-full")}>
          Go to your workspace
        </Link>
      </AuthCard>
    );
  }

  const title = `Join ${invitation.workspaceName}`;
  const description = `${invitation.inviterName} invited ${invitation.email} to work together in ${invitation.workspaceName}.`;

  if (!ctx) {
    return (
      <AuthCard title={title} description={description}>
        <div className="space-y-3">
          <Link href={`${withNext("/sign-up", here)}&email=${encodeURIComponent(invitation.email)}`} className={cn(buttonVariants(), "h-9 w-full")}>
            Create an account
          </Link>
          <Link href={withNext("/sign-in", here)} className={cn(buttonVariants({ variant: "outline" }), "h-9 w-full")}>
            I already have an account
          </Link>
        </div>
      </AuthCard>
    );
  }

  // Better Auth accepts only for the invited address; say so here rather than after a click.
  if (ctx.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthCard title={title} description={`This invitation was sent to ${invitation.email}, and you are signed in as ${ctx.email}.`}>
        <SignOutButton label={`Sign in as ${invitation.email}`} next={here} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title={title} description={description}>
      <AcceptInvite invitationId={invitation.id} workspaceName={invitation.workspaceName} />
    </AuthCard>
  );
}
