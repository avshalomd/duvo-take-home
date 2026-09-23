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

// Name, email and password. Better Auth signs the new account in at once; the server gives it a personal workspace.
export function SignUpForm({ next, google, email }: { next: string; google: boolean; email?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await authClient.signUp.email({
        name: String(form.get("name")).trim(),
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (result.error) return setError(friendlyAuthError(result.error));
      router.replace(next);
      router.refresh();
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
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" required autoFocus maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          {/* an invitation link fills in the address it was sent to */}
          <Input id="email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} aria-describedby="password-hint" />
          <p id="password-hint" className="text-xs text-muted-foreground">
            At least 8 characters.
          </p>
        </div>
        <FormError message={error} />
        <Button type="submit" className="h-9 w-full" disabled={pending}>
          {pending ? "Creating your account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
}
