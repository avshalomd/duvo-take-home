"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * After the service's sign-in page, the OAuth callback sends the browser back here with ?signed_in=<name> or
 * ?oauth_error=<code>, which the page has already turned into its own sentence. Say it once as a toast, then drop
 * the query, so a reload does not say it again.
 */
export function OAuthToast({ signedIn, error }: { signedIn?: string; error?: string }) {
  const router = useRouter();
  const shown = useRef(false); // React runs effects twice in development; the toast must still appear once

  useEffect(() => {
    if (shown.current || (!signedIn && !error)) return;
    shown.current = true;
    if (signedIn) toast.success(`Signed in to ${signedIn}. Runs can use it now.`);
    else toast.error(error); // the page's sentence for the code (settings/connections/oauth-error.ts)
    router.replace("/settings/connections", { scroll: false });
  }, [signedIn, error, router]);

  return null;
}
