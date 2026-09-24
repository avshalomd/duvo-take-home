import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authLink } from "@/components/auth/auth-field";
import { AuthPanel } from "@/components/auth/auth-panel";
import { FormError } from "@/components/auth/form-error";
import { SignInForm } from "@/components/auth/sign-in-form";
import { oauthErrorMessage } from "@/lib/auth/errors";
import { openInvitationFrom } from "@/lib/auth/members";
import { safeNext, withNext } from "@/lib/auth/paths";
import { googleConfigured } from "@/lib/auth/providers";
import { sessionFromHeaders } from "@/lib/auth/session";
import { signupMode } from "@/lib/auth/signup-mode";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, email, error } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);
  // A real session (checked against the database, not just a cookie) has nothing to do here.
  if (await sessionFromHeaders(await headers())) redirect(target);
  const googleError = oauthErrorMessage(typeof error === "string" ? error : undefined); // Google comes back here on failure
  // `email` is what the person typed on sign-up ("Sign in instead", Q110); from an invitation the page reads the
  // invited address from the invitation itself, so it never travels in the link (UX QA U26)
  const filled = typeof email === "string" ? email : (await openInvitationFrom(target))?.email;

  return (
    <AuthPanel
      title="Sign in"
      description="Welcome back. Your runs and automations are where you left them."
      footer={
        signupMode() === "invite" ? (
          "New here? Ask someone in a workspace to send you an invitation."
        ) : (
          <>
            New here?{" "}
            <Link href={withNext("/sign-up", target)} className={authLink}>
              Create an account
            </Link>
          </>
        )
      }
    >
      <FormError message={googleError} />
      <SignInForm next={target} google={googleConfigured()} email={filled} />
    </AuthPanel>
  );
}
