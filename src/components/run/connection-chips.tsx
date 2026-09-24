"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { Plug } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { connectionsLine } from "./connections-line";

const SETTINGS = "/settings/connections";
const focus = "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";
// one chip, set apart from "Using" around it: as plain words, two names ran together into one (Q147)
const CHIP = cn("inline-flex min-w-0 items-center rounded-full bg-mist px-2 py-0.5 font-medium text-graphite transition-[background-color,transform] duration-100 hover:bg-mist-deep active:scale-[0.97]", focus);

// Which connections the next run gets: the ones switched on in Settings, in one line (UX QA U24). One is named and
// links to Settings; several are "DeepWiki and 3 more", a chip that opens the whole list, so at 390 px the floating
// composer stays one line high however many are on.
export function ConnectionChips({ names }: { names: string[] }) {
  const line = connectionsLine(names);
  return (
    <div data-testid="composer-connections" className="flex min-w-0 items-center gap-1.5 text-[13px] tracking-[0.01em] whitespace-nowrap text-slate">
      <Plug aria-hidden className="size-3.5 shrink-0" />
      {!line ? (
        <Link href={SETTINGS} className={cn("truncate rounded-full underline-offset-2 hover:text-graphite hover:underline", focus)}>
          No connections on
        </Link>
      ) : (
        <>
          <span className="shrink-0">Using</span>{" "}
          {line.more === 0 ? (
            <Link data-testid="connection-chip" href={SETTINGS} title={`${line.first} is on - change it in Settings`} className={CHIP}>
              <span className="truncate">{line.first}</span>
            </Link>
          ) : (
            <ConnectionList names={names} first={line.first} more={line.more} />
          )}
        </>
      )}
    </div>
  );
}

// The chip for several, and the list it opens: a small popover from the chip itself (its transform origin), above the
// composer where it floats at the bottom of a run. Escape or a click outside closes it and the focus goes back.
function ConnectionList({ names, first, more }: { names: string[]; first: string; more: number }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger data-testid="connection-chip" className={cn(CHIP, "cursor-pointer")}>
        {/* the first name gives way on a narrow screen; the count never does */}
        <span className="truncate">{first}</span>
        <span className="shrink-0">&nbsp;and {more} more</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="z-50">
          <PopoverPrimitive.Popup
            className="glass w-64 max-w-[calc(100vw-1.5rem)] origin-(--transform-origin) rounded-[18px] p-1.5 text-graphite transition-[opacity,scale] duration-150 ease-(--ease-out-soft) outline-none data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-opacity motion-reduce:data-ending-style:scale-100 motion-reduce:data-starting-style:scale-100"
            // the same edge as the member menu: glass's own shadow alone left no edge on the white page
            style={{ boxShadow: "inset 0 1px 0 var(--glass-edge), 0 0 0 1px var(--hairline), var(--shadow-float)" }}
          >
            <PopoverPrimitive.Title className="px-2.5 pt-1.5 pb-1 text-[13px] tracking-[0.01em] text-slate">The next run can use</PopoverPrimitive.Title>
            <ul className="max-h-60 overflow-y-auto">
              {names.map((n) => (
                <li key={n} className="flex items-center gap-2 rounded-[12px] px-2.5 py-1.5 text-[14px]">
                  <Plug aria-hidden className="size-3.5 shrink-0 text-slate" />
                  <span className="min-w-0 truncate">{n}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1 border-t border-hairline px-2.5 pt-2 pb-1.5">
              <Link href={SETTINGS} className={cn("rounded-sm text-[13px] font-medium underline-offset-2 hover:underline", focus)}>
                Change in Settings
              </Link>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
