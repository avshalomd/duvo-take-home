import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeNext, withNext } from "@/lib/auth/paths";
import { googleConfigured } from "@/lib/auth/providers";
import { sessionFromHeaders } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in - Automations" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const { next } = await searchParams;
  const target = safeNext(typeof next === "string" ? next : undefined);
  // A real session (checked against the database, not just a cookie) has nothing to do here.
  if (await sessionFromHeaders(await headers())) redirect(target);

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back. Your runs and automations are where you left them."
      footer={
        <span>
          New here?{" "}
          <Link href={withNext("/sign-up", target)} className="font-medium text-foreground underline underline-offset-4">
            Create an account
          </Link>
        </span>
      }
    >
      <SignInForm next={target} google={googleConfigured()} />
    </AuthCard>
  );
}
