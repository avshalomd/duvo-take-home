"use client";

import { useActionState } from "react";
import { startRunAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// The example lives in the placeholder only: free text in, no presets, so the agent has to read the instructions.
const PLACEHOLDER =
  "Fetch the latest AI news from the web and save them into a CSV. Write the file as output.csv in your working directory with the columns title, source, url, published_at, summary. At least 8 rows, all published in the last 7 days, no duplicate URLs.";

export function InstructionsForm() {
  const [state, action, pending] = useActionState(startRunAction, {});

  return (
    // useActionState, because React 19 resets the form after an action and the typed instructions must survive an error
    <form action={action} className="space-y-2">
      <Label htmlFor="prompt" className="text-sm font-medium">
        Instructions
      </Label>
      <Textarea
        id="prompt"
        name="prompt"
        rows={7}
        placeholder={PLACEHOLDER}
        defaultValue={state.values?.prompt}
        aria-invalid={Boolean(state.fieldErrors?.prompt)}
        className="resize-y text-sm"
      />
      {state.fieldErrors?.prompt && <p className="text-sm text-red-600">{state.fieldErrors.prompt[0]}</p>}
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending} className="bg-emerald-600 text-white hover:bg-emerald-700">
          {pending ? "Starting..." : "Run"}
        </Button>
      </div>
    </form>
  );
}
