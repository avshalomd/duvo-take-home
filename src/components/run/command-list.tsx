import { cn } from "@/lib/utils";

// One saved automation as the composer offers it: its command, its name and what it produces.
export type CommandOption = { command: string; name: string; produces: string };

export const COMMAND_LIST_ID = "command-list";
export const optionId = (command: string) => `command-${command}`;

// The list under the box while a command is typed. It is not a focus-taking popover: the cursor stays in the box,
// the arrow keys move the highlight (aria-activedescendant), Enter or a click picks one.
export function CommandList({
  options,
  query,
  active,
  hasAny,
  onPick,
}: {
  options: CommandOption[];
  query: string;
  active: number;
  hasAny: boolean;
  onPick: (command: string) => void;
}) {
  return (
    <div
      id={COMMAND_LIST_ID}
      role="listbox"
      aria-label="Saved automations"
      className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border bg-popover p-1 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 duration-100"
    >
      {options.length === 0 ? (
        <p className="px-2 py-2 text-muted-foreground">
          {hasAny ? `No saved automation starts with \\${query}` : "No saved automations yet - make one from a finished run"}
        </p>
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
            className={cn("flex cursor-pointer items-baseline gap-3 rounded-md px-2 py-1.5", i === active && "bg-muted")}
          >
            <span className="shrink-0 font-medium text-emerald-800 dark:text-emerald-300">\{o.command}</span>
            <span className="min-w-0 truncate">{o.name}</span>
            {o.produces && <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground max-sm:hidden">makes {o.produces}</span>}
          </div>
        ))
      )}
    </div>
  );
}
