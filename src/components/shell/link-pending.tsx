"use client";

import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Inside a <Link> (which it must be, for useLinkStatus): a soft paper pill behind the label from the moment the link is
 * clicked until its page arrives, so a click always changes the screen, even where the page has no skeleton to show
 * (Home's runs). The link needs `relative isolate`. It fades in after 100 ms, so a page that is there at once never
 * flashes it; the fade is opacity only, so reduced motion needs nothing else.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending ? "true" : undefined}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-full bg-paper/70 opacity-0 transition-opacity duration-150",
        pending && "opacity-100 delay-100",
        className,
      )}
    />
  );
}
