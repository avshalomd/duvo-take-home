"use client";

import { LoaderCircle, Play, Plug } from "lucide-react";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { startRunAction } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { applyCommand, commandQuery, filterAutomations } from "./command-query";
import { COMMAND_LIST_ID, CommandList, optionId, type CommandOption } from "./command-list";

const PLACEHOLDER = "Describe a task in plain words, or type \\ to run a saved automation";

// The one box on Home: plain instructions start a new run; "\audit Acme Ltd" runs a saved automation on an input.
// The server decides which is which (startRunAction); the list under the box only helps to type a command.
export function Composer({ automations, connections }: { automations: CommandOption[]; connections: string[] }) {
  const [state, action, pending] = useActionState(startRunAction, {});
  const [text, setText] = useState(state.values?.prompt ?? "");
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null); // Escape hides the list until the text changes
  const box = useRef<HTMLTextAreaElement>(null);

  const query = commandQuery(text);
  const open = query !== null && dismissed !== text;
  const options = open ? filterAutomations(automations, query) : [];
  const highlighted = Math.min(active, Math.max(options.length - 1, 0));

  // the action redirects on success, so anything coming back is a refusal: replace the "starting" toast with it
  useEffect(() => {
    if (state.error || state.fieldErrors) toast.dismiss("start-run");
  }, [state]);

  // the box grows with the task instead of scrolling inside itself: a long instruction is read while it is written
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);

  function pick(command: string) {
    setText(applyCommand(text, command));
    setActive(0);
    box.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // the shortcut submits the form itself, so validation and the pending state behave exactly as on the button
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setDismissed(text);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((highlighted + step + options.length) % Math.max(options.length, 1));
    } else if ((e.key === "Enter" || e.key === "Tab") && options.length > 0) {
      e.preventDefault();
      pick(options[highlighted].command);
    }
  }

  // Submitted by hand rather than through <form action>: React resets a form after its action, and the box must
  // keep what was typed when the server refuses it.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    toast.loading("Starting the agent...", { id: "start-run", duration: 6000 });
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form onSubmit={onSubmit} className="rounded-xl border bg-background p-3 shadow-xs">
      <label htmlFor="prompt" className="mb-1.5 block text-sm font-medium">
        What should the agent do?
      </label>
      <div className="relative">
        <Textarea
          id="prompt"
          name="prompt"
          ref={box}
          rows={2}
          placeholder={PLACEHOLDER}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => setDismissed(text)} // clicking elsewhere closes the list, as it would a menu
          onFocus={() => setDismissed(null)}
          aria-invalid={Boolean(state.fieldErrors?.prompt)}
          aria-controls={open ? COMMAND_LIST_ID : undefined}
          aria-activedescendant={open && options.length ? optionId(options[highlighted].command) : undefined}
          aria-autocomplete="list"
          className="min-h-16 resize-none text-sm leading-relaxed"
        />
        {open && <CommandList options={options} query={query ?? ""} active={highlighted} hasAny={automations.length > 0} onPick={pick} />}
      </div>

      {state.fieldErrors?.prompt && (
        <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          {state.fieldErrors.prompt[0]}
        </p>
      )}
      {state.error && (
        <p role="alert" className="mt-1.5 text-sm text-red-700 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="mt-2 flex items-center gap-2">
        <ConnectionChips names={connections} />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-[11px] text-muted-foreground max-sm:hidden">⌘/Ctrl+Enter</span>
          <RunButton pending={pending} />
        </div>
      </div>
    </form>
  );
}

// Which connections the next run will get: the ones switched on in Settings. Each chip links there.
function ConnectionChips({ names }: { names: string[] }) {
  const chip =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <div data-testid="composer-connections" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {names.length === 0 ? (
        <>
          <span>No connections on</span>
          <Link href="/settings/connections" className={chip}>
            <Plug className="size-3" aria-hidden />
            Settings
          </Link>
        </>
      ) : (
        <>
          <span>Using:</span>
          {names.map((n) => (
            <Link key={n} href="/settings/connections" className={chip} title={`${n} is on - change it in Settings`}>
              <Plug className="size-3" aria-hidden />
              {n}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}

function RunButton({ pending }: { pending: boolean }) {
  return (
    <Button
      type="submit"
      size="sm"
      disabled={pending}
      // emerald-700: white on emerald-600 was 3.65:1 (Q64). h-10 under 900px: 28 px is a miss under a thumb (Q75)
      className="shrink-0 bg-emerald-700 text-white hover:bg-emerald-800 max-[899px]:h-10 max-[899px]:px-4 dark:bg-emerald-700 dark:hover:bg-emerald-600"
    >
      {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
      {pending ? "Starting..." : "Run"}
    </Button>
  );
}
