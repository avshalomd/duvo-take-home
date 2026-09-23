import Link from "next/link";
import type { Automation } from "@/contracts/automation";
import { cn } from "@/lib/utils";
import { BriefText } from "./brief-text";
import { StatePill } from "./state-pill";
import { TILE } from "./surfaces";

// One automation in the gallery: its command as people will type it, what it does in one line, and its state.
// The whole tile opens it; running it happens there or from Home.
export function GalleryTile({ automation: a }: { automation: Automation }) {
  const line = a.description || a.template.expectedOutputs[0] || a.name;
  return (
    <Link
      href={`/automations/${a.id}`}
      data-testid="automation-tile"
      className={cn(TILE, "flex h-full flex-col gap-2 p-5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="display min-w-0 text-[28px] break-words text-graphite">\{a.command}</span>
        <StatePill status={a.status} className="mt-1.5" />
      </span>
      {/* the line may mention the input: drawn as its token, never as "{input}" (Q118) */}
      <BriefText text={line} inputLabel={a.inputLabel} className="line-clamp-2 text-[15px] leading-6 text-slate" />
    </Link>
  );
}
