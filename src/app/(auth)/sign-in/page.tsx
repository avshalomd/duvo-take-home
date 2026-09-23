import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authLink } from "@/components/auth/auth-field";
import { AuthPanel } from "@/components/auth/auth-panel";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNext, withNext } from "@/lib/auth/paths";
import { googleConfigured } from "@/lib/auth/providers";
import { sessionFromHeaders } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in - Automations" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next, email } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);
  // A real session (checked against the database, not just a cookie) has nothing to do here.
  if (await sessionFromHeaders(await headers())) redirect(target);

  return (
    <AuthPanel
      title="Sign in"
      description="Welcome back. Your runs and automations are where you left them."
      footer={
        <>
          New here?{" "}
          <Link href={withNext("/sign-up", target)} className={authLink}>
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={target} google={googleConfigured()} email={typeof email === "string" ? email : undefined} />
    </AuthPanel>
  );
}
