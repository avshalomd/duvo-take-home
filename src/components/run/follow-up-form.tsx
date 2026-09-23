"use client";

import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { followUpAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// "Ask for a change": a short note that becomes a follow-up run continuing this one, with its files in place.
// When the reviewer said what would make the result better, that sentence is one click away.
export function FollowUpForm({ runId, suggestion }: { runId: string; suggestion: string | null }) {
  const [state, action, pending] = useActionState(followUpAction, {});
  const [text, setText] = useState("");

  // submitted by hand, not through <form action>, so a refused note stays in the box (React resets action forms)
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="runId" value={runId} />
      <label htmlFor="follow-up" className="block text-sm font-medium">
        Ask for a change
      </label>
      <Textarea
        id="follow-up"
        name="prompt"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="For example: add a column with the source's country"
        aria-invalid={Boolean(state.fieldErrors?.prompt)}
        className="min-h-14 resize-none text-sm"
      />
      {state.fieldErrors?.prompt && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.fieldErrors.prompt[0]}
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="max-[899px]:h-10">
          {pending ? <LoaderCircle className="animate-spin" /> : <MessageSquarePlus />}
          Send the change
        </Button>
        {suggestion && text !== suggestion && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setText(suggestion)} className="text-muted-foreground max-[899px]:h-10">
            Use the reviewer&apos;s suggestion
          </Button>
        )}
      </div>
    </form>
  );
}
