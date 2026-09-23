import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
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
    <AuthCard
      title="Create an account"
      description="You get a workspace of your own. Nobody else sees what you run in it."
      footer={
        <span>
          Already have an account?{" "}
          <Link href={withNext("/sign-in", target)} className="font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
        </span>
      }
    >
      <SignUpForm next={target} google={googleConfigured()} email={typeof email === "string" ? email : undefined} />
    </AuthCard>
  );
}
