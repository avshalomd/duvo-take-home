"use client";

import { Button } from "@/components/ui/button";

// A Settings page that could not load (the database unreachable, say) keeps the title and the segments and says so
// calmly. The error's own text stays out of view: it can name the database host. Next 16 hands error boundaries
// `retry`, not `reset`.
export default function SettingsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div role="alert" className="space-y-3 rounded-[16px] bg-paper px-4 py-5 shadow-tile">
      <p className="font-medium">This page could not be loaded.</p>
      <p className="text-[13px] tracking-[0.01em] text-slate">Nothing was changed. Try again in a moment.</p>
      <Button type="button" size="lg" variant="outline" onClick={() => retry()} className="px-4">
        Try again
      </Button>
    </div>
  );
}
