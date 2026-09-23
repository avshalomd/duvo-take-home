"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { accountExists, friendlyAuthError } from "@/lib/auth/errors";
import { withNext } from "@/lib/auth/paths";
import { AuthField, authLink } from "./auth-field";
import { FormError } from "./form-error";
import { GoogleButton } from "./google-button";

type Failure = { message: string; takenEmail?: string };

// Name, email and password. Better Auth signs the new account in at once; the server gives it a personal workspace.
export function SignUpForm({ next, google, email }: { next: string; google: boolean; email?: string }) {
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = String(form.get("email"));
    setFailure(null);
    startTransition(async () => {
      const result = await authClient.signUp.email({ name: String(form.get("name")).trim(), email: address, password: String(form.get("password")) });
      if (result.error) {
        // a taken email gets a way out: sign-in with that address already typed (Q110)
        return setFailure({ message: friendlyAuthError(result.error), takenEmail: accountExists(result.error) ? address : undefined });
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {google && <GoogleButton next={next} />}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthField id="name" label="Your name" name="name" autoComplete="name" required autoFocus maxLength={80} />
        {/* an invitation link fills in the address it was sent to */}
        <AuthField id="email" label="Email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        <AuthField id="password" label="Password" name="password" type="password" autoComplete="new-password" required minLength={8} hint="At least 8 characters." />
        <FormError message={failure?.message}>
          {failure?.takenEmail && (
            <Link href={withNext("/sign-in", next, failure.takenEmail)} className={`${authLink} whitespace-nowrap`}>
              Sign in instead
            </Link>
          )}
        </FormError>
        <Button type="submit" className="mt-1 h-11 w-full text-[15px]" disabled={pending}>
          {pending ? "Creating your account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}
