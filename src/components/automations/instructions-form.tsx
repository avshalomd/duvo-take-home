"use client";

import { LoaderCircle, Play } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { startRunAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// The example lives in the placeholder only: free text in, no presets, so the agent has to read the instructions.
const PLACEHOLDER =
  "Fetch the latest AI news from the web and save them into a CSV. Write the file as output.csv in your working directory with the columns title, source, url, published_at, summary. At least 8 rows, all published in the last 7 days, no duplicate URLs.";

export function InstructionsForm() {
  const [state, action] = useActionState(startRunAction, {});
  const box = useRef<HTMLTextAreaElement>(null);

  // the field grows with the task instead of scrolling inside itself: a long instruction is read while it is written
  function grow() {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 420)}px`;
  }
  useEffect(grow, [state.values?.prompt]);

  // the action redirects on success, so anything coming back is a refusal: replace the "starting" toast with it
  useEffect(() => {
    if (state.error) toast.error(state.error, { id: "start-run" });
    else if (state.fieldErrors) toast.dismiss("start-run");
  }, [state]);

  return (
    <form
      action={action}
      className="space-y-2 rounded-xl border bg-background p-3"
      onSubmit={() => toast.loading("Starting the agent...", { id: "start-run", duration: 6000 })}
    >
      <div className="flex items-baseline justify-between">
        <Label htmlFor="prompt" className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          Instructions
        </Label>
        <kbd className="rounded border px-1 py-0.5 font-mono text-[10px] text-muted-foreground">⌘/Ctrl+Enter to run</kbd>
      </div>
      <Textarea
        id="prompt"
        name="prompt"
        ref={box}
        rows={6}
        placeholder={PLACEHOLDER}
        defaultValue={state.values?.prompt}
        aria-invalid={Boolean(state.fieldErrors?.prompt)}
        onInput={grow}
        // the shortcut submits the form itself, so validation and the pending state behave exactly as on the button
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
        }}
        className="resize-none text-sm leading-relaxed"
      />
      {state.fieldErrors?.prompt && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {state.fieldErrors.prompt[0]}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">The enabled connections below are what the run gets.</p>
        <RunButton />
      </div>
    </form>
  );
}

// useFormStatus reads the pending state of the form it sits in, so the button owns its own spinner.
function RunButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
      {pending ? "Starting..." : "Run"}
    </Button>
  );
}
