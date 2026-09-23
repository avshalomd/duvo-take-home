"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

// Shown only when Google is configured on the server (the page decides). Google sends the browser back to `next`.
export function GoogleButton({ next }: { next: string }) {
  const [leaving, setLeaving] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      className="h-9 w-full"
      disabled={leaving}
      onClick={() => {
        setLeaving(true); // the page is about to leave for Google; a second click would start a second sign-in
        void authClient.signIn.social({ provider: "google", callbackURL: next });
      }}
    >
      Continue with Google
    </Button>
  );
}
