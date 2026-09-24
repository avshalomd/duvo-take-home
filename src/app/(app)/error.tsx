"use client";

import { Button } from "@/components/ui/button";

// A page behind sign-in that failed: a render that threw (the database unreachable while Home streams) or an action
// or transition that rejected (Stop, Run again, the workspace menu on a dropped connection). It stays under the top
// bar, so every other page is one press away, and says so calmly. The error's own text stays out of view: it can
// name the database host. Next 16 hands error boundaries `retry`, not `reset`. Settings keeps its own, in its frame.
export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:px-6 sm:py-12">
      <section role="alert" className="flex h-fit w-full max-w-[40rem] flex-col items-center gap-3 rounded-[22px] bg-paper px-6 py-16 text-center shadow-sheet">
        <h1 className="display text-[28px]">This page could not be loaded</h1>
        <p className="max-w-[46ch] text-[15px] text-slate">Something got in the way, often a dropped connection. Try again in a moment, or open another page above.</p>
        <Button type="button" size="lg" onClick={() => retry()} className="mt-3 h-10 px-5 text-[15px]">
          Try again
        </Button>
      </section>
    </main>
  );
}
