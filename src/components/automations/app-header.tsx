// The product bar: what this is, in one line, plus a live dot so a run in flight is visible from any scroll position.
export function AppHeader({ liveCount }: { liveCount: number }) {
  return (
    <header data-testid="app-header" className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[100rem] flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight">Automations</h1>
        <p className="text-xs text-muted-foreground">
          Write a task in plain English; an agent plans it, works through it and is judged on the result.
        </p>
        {liveCount > 0 && (
          // amber-700 rather than amber-600: 4.5:1 on the header's background (Q64)
          <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            {/* the ping is the only motion in the header: it means work is happening right now */}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            {liveCount} run{liveCount > 1 ? "s" : ""} live
          </span>
        )}
        {/* on a phone the open run fills the screen and the instructions box is a thousand pixels below it (Q76) */}
        <a
          href="#new-run"
          className="ml-auto flex h-10 shrink-0 items-center rounded-md border px-3 text-xs font-medium focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none min-[900px]:hidden"
        >
          New run
        </a>
      </div>
    </header>
  );
}
