"use client";

import { Button } from "@/components/ui/button";

// A Settings page that could not load (the database unreachable, say) keeps the tabs and says so calmly. The error's
// own text stays out of view: it can name the database host. Next 16 hands error boundaries `retry`, not `reset`.
export default function SettingsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-xl border bg-background p-6">
      <p className="text-sm font-medium">This page could not be loaded.</p>
      <p className="text-xs text-muted-foreground">Nothing was changed. Try again in a moment.</p>
      <Button type="button" size="sm" variant="outline" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
