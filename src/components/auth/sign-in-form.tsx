"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { friendlyAuthError } from "@/lib/auth/errors";
import { AuthField } from "./auth-field";
import { FormError } from "./form-error";
import { GoogleButton } from "./google-button";

// Email and password. Submitted through onSubmit (not a form action) so a failed try keeps what was typed.
// `email` arrives filled in from sign-up's "Sign in instead" (Q110); the password is then the field to type in.
export function SignInForm({ next, google, email }: { next: string; google: boolean; email?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await authClient.signIn.email({ email: String(form.get("email")), password: String(form.get("password")) });
      if (result.error) return setError(friendlyAuthError(result.error));
      router.replace(next);
      router.refresh(); // the layout reads the new session cookie on the server
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {google && <GoogleButton next={next} />}
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <AuthField id="email" label="Email" name="email" type="email" autoComplete="email" required defaultValue={email} autoFocus={!email} />
        <AuthField id="password" label="Password" name="password" type="password" autoComplete="current-password" required autoFocus={Boolean(email)} />
        <FormError message={error} />
        <Button type="submit" className="mt-1 h-11 w-full text-[15px]" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
