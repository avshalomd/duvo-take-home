"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation } from "@/lib/auth/actions";
import { authClient } from "@/lib/auth/client";
import { aboutPassword, accountExists, friendlyAuthError } from "@/lib/auth/errors";
import { withNext } from "@/lib/auth/paths";
import { MIN_PASSWORD_LENGTH, passwordRefusal } from "@/lib/auth/password";
import { AuthField, authLink } from "./auth-field";
import { FormError } from "./form-error";
import { GoogleButton } from "./google-button";

type Failure = { message: string; takenEmail?: string };
type PasswordError = { message: string }; // an object, so the same sentence twice still moves the cursor back

// Name, email and password. Better Auth signs the new account in at once; the server gives it a personal workspace.
// From an invitation (`invitationId`, `email` read from it on the server) the new account then joins its workspace.
export function SignUpForm({ next, google, email, invitationId }: { next: string; google: boolean; email?: string; invitationId?: string }) {
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [passwordError, setPasswordError] = useState<PasswordError | null>(null);
  const [pending, startTransition] = useTransition();
  const password = useRef<HTMLInputElement>(null);

  // the refused password takes the cursor back, selected so the next try replaces it (as sign-in does, UX QA U15)
  useEffect(() => {
    if (!passwordError) return;
    password.current?.focus();
    password.current?.select();
  }, [passwordError]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = String(form.get("email"));
    const typed = String(form.get("password"));
    setFailure(null);
    // UX QA U27: the rule is asked here and said under the field, not left to the browser's bubble (no minLength)
    const refusal = passwordRefusal(typed);
    if (refusal) return setPasswordError({ message: refusal });
    setPasswordError(null);
    startTransition(async () => {
      const result = await authClient.signUp.email({ name: String(form.get("name")).trim(), email: address, password: typed });
      if (result.error) {
        if (aboutPassword(result.error)) return setPasswordError({ message: friendlyAuthError(result.error) });
        // a taken email gets a way out: sign-in with that address already typed (Q110)
        return setFailure({ message: friendlyAuthError(result.error), takenEmail: accountExists(result.error) ? address : undefined });
      }
      if (invitationId) {
        // they came from the invitation's link, so they join now, as its Join button would (UX QA U26); on success the
        // action opens the workspace. Refused (another address was typed, or the invitation closed meanwhile), the
        // invitation's page says why in words, signed in as the new account.
        const joined = await acceptInvitation(invitationId);
        if (!joined?.error) return;
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
        {/* from an invitation, the address it was sent to, as the invitation says (never the link's query) */}
        <AuthField id="email" label="Email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        <AuthField
          ref={password}
          id="password"
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          aria-required // not `required`: an empty password gets the same sentence under the field as a short one
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={passwordError?.message}
          onChange={() => setPasswordError(null)} // corrected: the error goes and the hint is back
        />
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
