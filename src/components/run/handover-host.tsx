"use client";

import { createContext, use, useCallback, useMemo, useRef, useState } from "react";
import { PendingSheet } from "./pending-sheet";

type Handover = {
  /** Puts up the new run's sheet with its title. Call it inside a transition; resolves once the sheet is on screen. */
  begin: (title: string) => Promise<void>;
  /** Takes the sheet down: the real run has replaced it, or the server refused the start. */
  end: () => void;
};

const HandoverContext = createContext<Handover | null>(null);

/** The handover, for the composer; null outside Home's main column. */
export function useHandover(): Handover | null {
  return use(HandoverContext);
}

/**
 * Home's main column, with room for a run that does not exist yet (Q138). At the press of Run the composer asks for
 * the new run's sheet at once, so the brief can move into its title without waiting for the server; the page under
 * it stays mounted, hidden, so a refused start finds its composer - and what was typed - as it was.
 */
export function HandoverHost({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  const shown = useRef<(() => void) | null>(null);

  const handover = useMemo<Handover>(
    () => ({
      begin: (next) =>
        new Promise<void>((resolve) => {
          shown.current = resolve;
          setTitle(next);
        }),
      end: () => setTitle(null),
    }),
    [],
  );
  const onShown = useCallback(() => shown.current?.(), []);

  return (
    <HandoverContext value={handover}>
      <div className={title === null ? undefined : "hidden"}>{children}</div>
      {title !== null && <PendingSheet title={title} onShown={onShown} />}
    </HandoverContext>
  );
}
