"use client";

import { ArrowUp, LoaderCircle, Plug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, useTransition, ViewTransition } from "react";
import { flushSync } from "react-dom";
import { startRunAction, type FormState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { applyCommand, commandHint, commandQuery, filterAutomations } from "./command-query";
import { COMMAND_LIST_ID, CommandList, optionId, type CommandOption } from "./command-list";
import "./handover.css";

const PLACEHOLDER = "Describe a task in plain words, or type / to run a saved automation";
const QUESTION_ID = "brief-question"; // the first visit's heading, which names the box there

// The one box on Home: plain instructions start a new run; "/audit Acme Ltd" runs a saved automation on an input.
// The server decides which is which (startRunAction). Glass, in two sizes: the hero under the first visit's
// question, and a capsule floating at the bottom of an open run.
export function Composer({
  variant,
  automations,
  notReady,
  connections,
}: {
  variant: "hero" | "floating";
  automations: CommandOption[];
  notReady: number;
  connections: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({});
  const [pending, startPending] = useTransition();
  const [text, setText] = useState("");
  const [handover, setHandover] = useState<{ id: string; text: string } | null>(null);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState<string | null>(null); // Escape hides the list until the text changes
  const box = useRef<HTMLTextAreaElement>(null);
  const hero = variant === "hero";

  const query = commandQuery(text);
  const open = query !== null && dismissed !== text;
  const options = open ? filterAutomations(automations, query) : [];
  const highlighted = Math.min(active, Math.max(options.length - 1, 0));
  const hint = commandHint(text, automations);

  // the box grows with the brief instead of scrolling inside itself, up to a third of a phone's screen
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [text]);

  function pick(command: string) {
    setText(applyCommand(text, command));
    setActive(0);
    box.current?.focus();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const brief = text;
    startPending(async () => {
      const result = await startRunAction({}, data);
      if (!result.startedId) {
        setState(result); // refused: what was typed stays in the box, with the reason under it
        return;
      }
      const id = result.startedId;
      // The handover. First the brief becomes an element named after the new run, committed at once ...
      flushSync(() => setHandover({ id, text: brief }));
      // ... then one transition removes it and opens the run, whose title carries the same name: React pairs the
      // two and the browser carries the words from here into the title (handover.css says how they move).
      startTransition(() => {
        setHandover(null);
        setText("");
        setState({});
        router.push(`/?run=${id}`);
      });
    });
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

  // one type size for the box, the hint behind it and the brief as it leaves, so the three line up exactly
  const type = hero ? "text-[19px] leading-7" : "text-[15px] leading-6";

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div
        className={cn("glass rounded-[26px]", hero ? "px-5 pt-4 pb-3" : "px-4 pt-3 pb-2.5")}
        // glass sets its own box-shadow (the light top edge), which would cancel a shadow utility: the edge, a hairline
        // and the float are set together here, or the capsule has no outline at all on white paper
        style={{ boxShadow: "inset 0 1px 0 var(--glass-edge), 0 0 0 1px var(--hairline), var(--shadow-float)" }}
      >
        {!hero && (
          <label htmlFor="prompt" className="sr-only">
            What should the agent do?
          </label>
        )}
        <div className="relative">
          {/* the input's hint after a chosen command (Q93): the typed text drawn invisibly, then the hint */}
          {hint && (
            <p aria-hidden className={cn("pointer-events-none absolute inset-0 break-words whitespace-pre-wrap", type)}>
              <span className="invisible">{text}</span>
              <span data-testid="command-hint" className="text-slate">
                {hint}
              </span>
            </p>
          )}
          <Textarea
            id="prompt"
            name="prompt"
            ref={box}
            rows={hero ? 3 : 1}
            autoFocus={hero}
            placeholder={hint ? undefined : PLACEHOLDER}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            onBlur={() => setDismissed(text)} // clicking elsewhere closes the list, as it would a menu
            onFocus={() => setDismissed(null)}
            aria-labelledby={hero ? QUESTION_ID : undefined}
            aria-invalid={Boolean(state.fieldErrors?.prompt)}
            aria-controls={open ? COMMAND_LIST_ID : undefined}
            aria-activedescendant={open && options.length ? optionId(options[highlighted].command) : undefined}
            aria-autocomplete="list"
            className={cn(
              "relative min-h-0 resize-none rounded-none border-0 bg-transparent p-0 shadow-none placeholder:text-slate focus-visible:ring-0 dark:bg-transparent",
              type,
              handover && "text-transparent caret-transparent", // the brief is leaving: its copy below is what moves
            )}
          />
          {handover && (
            <ViewTransition name={`brief-${handover.id}`} share="handover" default="none">
              <p aria-hidden className={cn("pointer-events-none absolute inset-0 break-words whitespace-pre-wrap", type)}>
                {handover.text}
              </p>
            </ViewTransition>
          )}
          {open && (
            <CommandList
              options={options}
              query={query ?? ""}
              active={highlighted}
              ready={automations.length}
              notReady={notReady}
              placement={hero ? "below" : "above"}
              onPick={pick}
            />
          )}
        </div>

        {state.fieldErrors?.prompt && (
          <p role="alert" className="mt-2 text-[13px] text-crimson">
            {state.fieldErrors.prompt[0]}
          </p>
        )}
        {state.error && (
          <p role="alert" className="mt-2 text-[14px] text-crimson">
            {state.error}
          </p>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <ConnectionChips names={connections} />
          <div className="ml-auto flex shrink-0 items-center">
            {/* ⌘/Ctrl+Enter also runs (onKeyDown); its hint was the one accessory taken off the capsule */}
            <Button type="submit" disabled={pending} className="h-9 px-4 max-[899px]:h-10">
              {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <ArrowUp aria-hidden />}
              {pending ? "Starting..." : "Run"}
            </Button>
          </div>
        </div>
      </div>

      {/* the first visit offers the saved automations as tokens: a click writes the command into the box */}
      {hero && automations.length > 0 && (
        <div data-testid="automation-tokens" className="mt-5 flex flex-wrap justify-center gap-2">
          {automations.map((a) => (
            <button
              key={a.command}
              type="button"
              onClick={() => pick(a.command)}
              title={a.produces ? `Makes ${a.produces}` : undefined}
              className="inline-flex max-w-full items-baseline gap-2 rounded-full bg-mist px-3.5 py-1.5 text-[14px] transition-transform duration-100 active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span className="font-semibold">/{a.command}</span>
              <span className="truncate text-slate">{a.name}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

// Which connections the next run gets: the ones switched on in Settings. Each one links there.
function ConnectionChips({ names }: { names: string[] }) {
  const link = "rounded-full underline-offset-2 hover:text-graphite hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <div data-testid="composer-connections" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] tracking-[0.01em] text-slate">
      <Plug aria-hidden className="size-3.5 shrink-0" />
      {names.length === 0 ? (
        <Link href="/settings/connections" className={link}>
          No connections on
        </Link>
      ) : (
        <>
          <span>Using</span>
          {names.map((n) => (
            <Link key={n} href="/settings/connections" className={cn(link, "font-medium text-graphite")} title={`${n} is on - change it in Settings`}>
              {n}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
