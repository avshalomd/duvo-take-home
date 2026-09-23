import { ViewTransition } from "react";
import { cn } from "@/lib/utils";

// A run's title: the brief, or "<automation>: <input>". Two lines at most, so the thread below stays in view (Q137).
export const TITLE_TYPE = "run-title line-clamp-2 break-words";
export const TITLE_PX = 28; // the run-title utility's size (globals.css): the handover scales its copy from it

// The name the brief carries as it moves from the composer into a new run's title (handover.css says how it moves).
export const HANDOVER_NAME = "handover-brief";

/**
 * handover: this is the title the brief lands in - the sheet shown at the press, before the server has answered.
 * The whole brief is the tooltip, since the title may be cut or be the automation's name for it.
 */
export function RunTitle({ title, brief, id = "run-title", handover = false }: { title: string; brief: string; id?: string; handover?: boolean }) {
  const heading = (
    <h1 id={id} className={cn("mt-3", TITLE_TYPE)} title={brief}>
      {title}
    </h1>
  );
  if (!handover) return heading;
  return (
    <ViewTransition name={HANDOVER_NAME} share="handover" default="none">
      {heading}
    </ViewTransition>
  );
}
