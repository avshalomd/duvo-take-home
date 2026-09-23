import { cn } from "@/lib/utils";
import { emptyListLine } from "./command-query";

// One ready automation as the composer offers it: its command, its name, what it produces and what to type after it.
export type CommandOption = { command: string; name: string; produces: string; hint: string };

export const COMMAND_LIST_ID = "command-list";
export const optionId = (command: string) => `command-${command}`;

// The list of ready automations while a command is typed. Not a focus-taking popover: the cursor stays in the box,
// the arrow keys move the highlight (aria-activedescendant), Enter, Tab or a click picks one. It opens away from the
// edge of the screen: under the box on the first visit, above it when the box floats at the bottom of a run.
export function CommandList({
  options,
  query,
  active,
  ready,
  notReady,
  placement,
  onPick,
}: {
  options: CommandOption[];
  query: string;
  active: number;
  ready: number;
  notReady: number;
  placement: "below" | "above";
  onPick: (command: string) => void;
}) {
  return (
    <div
      id={COMMAND_LIST_ID}
      role="listbox"
      aria-label="Saved automations"
      className={cn(
        "absolute inset-x-0 z-30 max-h-72 overflow-y-auto rounded-[16px] bg-paper p-1.5 text-left shadow-float ring-1 ring-hairline",
        placement === "below" ? "top-full mt-3" : "bottom-full mb-3",
      )}
    >
      {options.length === 0 ? (
        <p className="px-3 py-2.5 text-[14px] text-slate">{emptyListLine({ ready, notReady, query })}</p>
      ) : (
        options.map((o, i) => (
          <div
            key={o.command}
            id={optionId(o.command)}
            role="option"
            aria-selected={i === active}
            // mousedown, not click: a click would first blur the box, and the cursor has to stay in it
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(o.command);
            }}
            className={cn("cursor-pointer rounded-[12px] px-3 py-2", i === active && "bg-mist")}
          >
            {/* the command and its name first; what it makes is the line that gives way (Q92) */}
            <p className="flex items-baseline gap-2.5 text-[14px]">
              <span className="shrink-0 font-semibold">/{o.command}</span>
              <span className="min-w-0 truncate text-slate">{o.name}</span>
            </p>
            {o.produces && <p className="mt-0.5 truncate text-[13px] tracking-[0.01em] text-slate">Makes {o.produces}</p>}
          </div>
        ))
      )}
    </div>
  );
}
