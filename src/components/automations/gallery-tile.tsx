import Link from "next/link";
import type { Automation } from "@/contracts/automation";
import { Thread, type ThreadStep } from "@/components/thread/thread";
import { cn } from "@/lib/utils";
import { BriefText } from "./brief-text";
import { StateGlyph } from "./state-glyph";
import { SMALL } from "./surfaces";
import { tileSteps } from "./tile-steps";

// One automation in the gallery, built around what people type (Q139): its command in display type on one line - it
// never breaks; the name under it truncates instead - its state in words, and a quiet mini thread of the steps the
// agent will follow (all still to do: this is the plan, not a run). Pressing it gives the controls' 0.97 feedback.
export function GalleryTile({ automation: a }: { automation: Automation }) {
  const { shown, more } = tileSteps(a.template.steps);
  const steps: ThreadStep[] = shown.map((s, i) => ({
    key: i,
    title: <BriefText text={s} inputLabel={a.inputLabel} className="block truncate" />, // the input as its token (Q118)
    status: "pending",
  }));

  return (
    <Link
      href={`/automations/${a.id}`}
      data-testid="automation-tile"
      className={cn(
        "flex h-full flex-col gap-5 rounded-[22px] bg-paper p-6 shadow-sheet outline-none",
        "transition-transform duration-100 ease-out active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50",
      )}
    >
      <div className="min-w-0 space-y-1.5">
        <p data-testid="tile-command" className="display truncate text-[28px] whitespace-nowrap text-graphite">
          /{a.command}
        </p>
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-[15px] text-slate">{a.name}</p>
          <StateGlyph status={a.status} />
        </div>
      </div>
      <div className="min-w-0">
        <Thread steps={steps} tone="done" size="mini" label={`Steps of /${a.command}`} />
        {more > 0 && <p className={cn(SMALL, "mt-1.5 pl-8")}>and {more} more {more === 1 ? "step" : "steps"}</p>}
      </div>
    </Link>
  );
}
