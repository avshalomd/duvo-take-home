"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { outcome } from "@/components/run/outcome";
import { StatusDot } from "@/components/run/status-dot";
import { TimeAgo } from "@/components/run/time-ago";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { StartingRun } from "@/lib/automations/runs";

// "New from a run": the picker of recent finished runs. Each row links to the drafting page; prefetch is off because
// nothing there is worth fetching ahead - the draft itself only starts once the page is open.
export function NewFromRun({ runs }: { runs: StartingRun[] }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button className="bg-emerald-700 text-white hover:bg-emerald-800" />}>
        <Plus className="size-4" />
        New from a run
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start from a run</DialogTitle>
          <DialogDescription>Pick a run that did what you wanted. An automation is drafted from it, and you check it before it is saved.</DialogDescription>
        </DialogHeader>
        {runs.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
            No finished runs yet. Do a normal run from{" "}
            <Link href="/" className="underline underline-offset-2">
              Home
            </Link>{" "}
            first.
          </p>
        ) : (
          <ul className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
            {runs.map((r) => {
              const o = outcome("succeeded", r.outcome);
              return (
                <li key={r.id}>
                  <Link
                    href={`/automations/new?run=${r.id}`}
                    prefetch={false}
                    className="block px-3 py-2.5 hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="line-clamp-2 text-sm">{r.prompt}</span>
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <StatusDot tone={o.tone} />
                      {o.label}
                      <TimeAgo iso={r.createdAt} className="ml-auto" />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
