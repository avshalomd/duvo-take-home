"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvitation, signOut } from "@/lib/auth/actions";
import { FormError } from "./form-error";

// The one button of the invitation page once the right person is signed in. On success the action redirects Home.
export function AcceptInvite({ invitationId, workspaceName }: { invitationId: string; workspaceName: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <FormError message={error} />
      <Button
        className="h-11 w-full text-[15px]"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(invitationId);
            if (result?.error) setError(result.error);
          })
        }
      >
        {pending ? "Joining..." : `Join ${workspaceName}`}
      </Button>
    </div>
  );
}

// Signed in as someone else: the way out is to sign out and come back through the same link.
export function SignOutButton({ label, next }: { label: string; next: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="outline" className="h-11 w-full text-[15px]" disabled={pending} onClick={() => startTransition(() => signOut(next))}>
      {label}
    </Button>
  );
}
