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
          <span className="ml-auto flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            {/* the ping is the only motion in the header: it means work is happening right now */}
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
            </span>
            {liveCount} run{liveCount > 1 ? "s" : ""} live
          </span>
        )}
      </div>
    </header>
  );
}
