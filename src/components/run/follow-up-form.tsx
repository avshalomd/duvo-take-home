"use client";

import { LoaderCircle } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { followUpAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// "Ask for a change": a short note that becomes a follow-up run continuing this one, with its files in place.
// When the reviewer said what would make the result better, that sentence is one click away. When the result did
// not pass, the box opens on a draft - fix the first thing the check found - for the person to edit.
export function FollowUpForm({
  runId,
  suggestion,
  draft = null,
  onCancel,
}: {
  runId: string;
  suggestion: string | null;
  draft?: string | null;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(followUpAction, {});
  const [text, setText] = useState(draft ?? "");
  const form = useRef<HTMLFormElement>(null);

  // The whole form in view as it opens, Send included, not only the box the focus went to (UX QA U1). "nearest": a
  // form already in view does not move.
  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    form.current?.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, []);

  // submitted by hand, not through <form action>, so a refused note stays in the box (React resets action forms)
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form ref={form} onSubmit={onSubmit} className="space-y-2.5 scroll-mb-6">
      <input type="hidden" name="runId" value={runId} />
      <label htmlFor="follow-up" className="sr-only">
        Ask for a change
      </label>
      <Textarea
        id="follow-up"
        name="prompt"
        rows={2}
        autoFocus // it opened because the person asked to write a change
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel(); // as Cancel does
          }
        }}
        placeholder="What should change? For example: add a column with each source's country"
        aria-invalid={Boolean(state.fieldErrors?.prompt)}
        className="min-h-16 resize-none rounded-[16px] border-0 bg-mist/70 px-4 py-3 text-[15px] shadow-none focus-visible:ring-[3px] dark:bg-mist/70"
      />
      {state.fieldErrors?.prompt && (
        <p role="alert" className="text-[13px] text-crimson">
          {state.fieldErrors.prompt[0]}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-[14px] text-crimson">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending} className="h-9 px-4 max-[899px]:h-10">
          {pending && <LoaderCircle aria-hidden className="animate-spin" />}
          Send the change
        </Button>
        {/* the way back: the change is dropped and the composer returns */}
        <Button type="button" variant="ghost" onClick={onCancel} className="h-9 px-3 text-slate max-[899px]:h-10">
          Cancel
        </Button>
        {suggestion && text !== suggestion && (
          <Button type="button" variant="ghost" onClick={() => setText(suggestion)} className="h-9 px-3 text-slate max-[899px]:h-10" title={suggestion}>
            Use the suggested change
          </Button>
        )}
      </div>
    </form>
  );
}
