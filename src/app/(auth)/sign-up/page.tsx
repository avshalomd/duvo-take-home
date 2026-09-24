import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authLink } from "@/components/auth/auth-field";
import { AuthPanel } from "@/components/auth/auth-panel";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { signUpWords } from "@/components/auth/sign-up-words";
import { INVITE_ONLY } from "@/lib/auth/errors";
import { openInvitationFrom } from "@/lib/auth/members";
import { safeNext, withNext } from "@/lib/auth/paths";
import { googleConfigured } from "@/lib/auth/providers";
import { sessionFromHeaders } from "@/lib/auth/session";
import { signupMode } from "@/lib/auth/signup-mode";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next } = await searchParams; // no `email`: an invitation's address is read from the invitation (UX QA U26)
  const target = safeNext(typeof next === "string" ? next : undefined);
  if (await sessionFromHeaders(await headers())) redirect(target);

  const signInLink = (
    <Link href={withNext("/sign-in", target)} className={authLink}>
      Sign in
    </Link>
  );

  const invitation = await openInvitationFrom(target);
  // Invite-only: the form is for someone who came from an open invitation's page. The server refuses everyone
  // else anyway (lib/auth/signup.ts); this only saves them a form that cannot work.
  if (signupMode() === "invite" && (!invitation || invitation.personal)) { // one to a personal workspace opens no account (S11)
    return (
      <AuthPanel title="Create an account" description={INVITE_ONLY} footer={<>Already have an account? {signInLink}</>} />
    );
  }

  const words = signUpWords(invitation); // from an invitation: the workspace they are joining, and who asked them
  return (
    <AuthPanel title={words.title} description={words.description} footer={<>Already have an account? {signInLink}</>}>
      <SignUpForm next={target} google={googleConfigured()} email={invitation?.email} invitationId={invitation?.id} />
    </AuthPanel>
  );
}
