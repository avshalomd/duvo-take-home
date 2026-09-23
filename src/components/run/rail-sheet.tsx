"use client";

import { PanelLeft } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { TOP_BAR_SLOT } from "@/components/shell/top-bar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { RunsRail, type RailRun } from "./runs-rail";

const noSubscribe = () => () => {};

// On a phone there is no room for the rail beside the run: it becomes a sheet, opened from a button that Home
// puts into the top bar's empty slot. The portal keeps the button inside this component's React tree, so it
// still opens this Sheet.
export function RailSheet({ runs, selectedId }: { runs: RailRun[]; selectedId?: string }) {
  const [open, setOpen] = useState(false);
  // the slot is in the layout's DOM, which exists only in the browser: on the server there is nothing to portal into
  const slot = useSyncExternalStore(noSubscribe, () => document.getElementById(TOP_BAR_SLOT), () => null);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {slot &&
        createPortal(
          <SheetTrigger render={<Button variant="ghost" size="icon" className="size-10 shrink-0 text-slate" aria-label="Show runs" />}>
            <PanelLeft />
          </SheetTrigger>,
          slot,
        )}
      {/* data-[side=left]: the Sheet sets its width under that variant, so the override has to name it too */}
      <SheetContent side="left" className="gap-0 bg-mist-deep p-0 data-[side=left]:w-[86vw] data-[side=left]:sm:max-w-xs">
        <SheetHeader className="px-5 pt-4 pb-1">
          <SheetTitle className="text-[17px] font-semibold">Runs</SheetTitle>
        </SheetHeader>
        {/* picking a run closes the sheet: the run is what the person wanted to see */}
        <RunsRail runs={runs} selectedId={selectedId} onPick={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
