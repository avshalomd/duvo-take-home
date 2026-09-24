import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authLink } from "@/components/auth/auth-field";
import { AuthPanel } from "@/components/auth/auth-panel";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { INVITE_ONLY } from "@/lib/auth/errors";
import { getInvitation } from "@/lib/auth/members";
import { invitationIdFrom, safeNext, withNext } from "@/lib/auth/paths";
import { googleConfigured } from "@/lib/auth/providers";
import { sessionFromHeaders } from "@/lib/auth/session";
import { signupMode } from "@/lib/auth/signup-mode";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);
  if (await sessionFromHeaders(await headers())) redirect(target);

  const signInLink = (
    <Link href={withNext("/sign-in", target)} className={authLink}>
      Sign in
    </Link>
  );

  // Invite-only: the form is for someone who came from an open invitation's page. The server refuses everyone
  // else anyway (lib/auth/signup.ts); this only saves them a form that cannot work.
  if (signupMode() === "invite" && !(await fromOpenInvitation(target))) {
    return (
      <AuthPanel title="Create an account" description={INVITE_ONLY} footer={<>Already have an account? {signInLink}</>} />
    );
  }

  return (
    <AuthPanel title="Create an account" description="You get a workspace of your own. Nobody else sees what you run in it." footer={<>Already have an account? {signInLink}</>}>
      <SignUpForm next={target} google={googleConfigured()} email={typeof email === "string" ? email : undefined} />
    </AuthPanel>
  );
}

async function fromOpenInvitation(next: string): Promise<boolean> {
  const id = invitationIdFrom(next);
  return id ? Boolean((await getInvitation(id))?.open) : false;
}
