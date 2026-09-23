"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { withNext } from "@/lib/auth/paths";

// Shown only when Google is configured on the server (the page decides). Google sends the browser back to `next`,
// or on a failure (an invite-only refusal among them) to the sign-in page with ?error=<code>, which says it in words.
export function GoogleButton({ next }: { next: string }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full text-[15px]"
        disabled={leaving}
        onClick={() => {
          setLeaving(true); // the page is about to leave for Google; a second click would start a second sign-in
          void authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: withNext("/sign-in", next) });
        }}
      >
        Continue with Google
      </Button>
      <p className="flex items-center gap-3 text-[13px] text-slate">
        <span aria-hidden className="h-px flex-1 bg-hairline" />
        or with your email
        <span aria-hidden className="h-px flex-1 bg-hairline" />
      </p>
    </div>
  );
}
