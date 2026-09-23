"use client";

import { Check, Link2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeInvitationAction } from "@/lib/auth/actions";

// The two things an owner or admin does with a pending invitation: copy its link again, or take it back.
export function InvitationActions({ id, email, link }: { id: string; email: string; link: string }) {
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link and send it:", link); // the clipboard needs a secure page; this always works
    }
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeInvitationAction(id);
      if (result.error) toast.error(result.error);
      else toast.success(`The invitation to ${email} no longer works.`);
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button variant="secondary" className="h-9 px-3.5 text-[14px]" onClick={copy} aria-label={`Copy the invitation link for ${email}`}>
        {copied ? <Check aria-hidden className="text-fern" /> : <Link2 aria-hidden />}
        {copied ? "Copied" : "Copy link"}
      </Button>
      <Button variant="ghost" className="h-9 px-3.5 text-[14px] text-crimson hover:bg-crimson-wash hover:text-crimson" disabled={pending} onClick={revoke} aria-label={`Revoke the invitation for ${email}`}>
        {pending ? "Revoking..." : "Revoke"}
      </Button>
    </div>
  );
}
