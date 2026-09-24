import { Download, ShieldAlert } from "lucide-react";
import type { FileMeta } from "@/contracts/run";
import { cn } from "@/lib/utils";
import { SMALL } from "./surfaces";

const CHIP = "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-graphite";

// What an example made, as small chips. A held-back file (it seems to hold a password or key) is not a download
// here: the route refuses it until the person confirms, and that choice is offered, with its reason, on the full run.
export function ExampleFiles({ runId, files }: { runId: string; files: FileMeta[] }) {
  if (files.length === 0) return null;
  const heldBack = files.some((f) => f.quarantined);
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {files.map((f) => (
          <li key={f.name}>
            {f.quarantined ? (
              <span className={cn(CHIP, "bg-saffron-wash")}>
                <ShieldAlert aria-hidden className="size-3.5 text-saffron" />
                {f.name}, held back
              </span>
            ) : (
              <a
                href={`/api/runs/${runId}/files/${encodeURIComponent(f.name)}`}
                download
                aria-label={`Download ${f.name}`}
                className={cn(CHIP, "bg-muted outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50")}
              >
                {f.name}
                <Download aria-hidden className="size-3.5 text-slate" />
              </a>
            )}
          </li>
        ))}
      </ul>
      {heldBack && <p className={SMALL}>A file seems to contain a password or key, so it was held back. Open the full run to take it anyway.</p>}
    </div>
  );
}
