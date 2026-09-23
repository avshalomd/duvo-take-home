"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/client";
import { friendlyAuthError } from "@/lib/auth/errors";
import { FormError } from "./form-error";
import { GoogleButton } from "./google-button";

// Email and password. Submitted through onSubmit (not a form action) so a failed try keeps what was typed.
export function SignInForm({ next, google }: { next: string; google: boolean }) {
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
    <div className="space-y-4">
      {google && (
        <>
          <GoogleButton next={next} />
          <p className="text-center text-xs text-muted-foreground">or with your email</p>
        </>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <FormError message={error} />
        <Button type="submit" className="h-9 w-full" disabled={pending}>
          {pending ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
