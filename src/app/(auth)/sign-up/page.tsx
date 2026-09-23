import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authLink } from "@/components/auth/auth-field";
import { AuthPanel } from "@/components/auth/auth-panel";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { safeNext, withNext } from "@/lib/auth/paths";
import { googleConfigured } from "@/lib/auth/providers";
import { sessionFromHeaders } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create an account - Automations" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const { next, email } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);
  if (await sessionFromHeaders(await headers())) redirect(target);

  return (
    <AuthPanel
      title="Create an account"
      description="You get a workspace of your own. Nobody else sees what you run in it."
      footer={
        <>
          Already have an account?{" "}
          <Link href={withNext("/sign-in", target)} className={authLink}>
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={target} google={googleConfigured()} email={typeof email === "string" ? email : undefined} />
    </AuthPanel>
  );
}
