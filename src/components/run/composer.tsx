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
import { useHandover } from "./handover-host";
import { handoverTitle } from "./handover-title";
import { HANDOVER_NAME, TITLE_PX, TITLE_TYPE } from "./run-title";
import { titleWidth } from "./sheet";
import "./handover.css";

const PLACEHOLDER = "Describe a task in plain words, or type / to run a saved automation";
const QUESTION_ID = "brief-question"; // the first visit's heading, which names the box there
const UNREACHABLE = "Could not reach the app, so no run was started. Check your connection and press Run again.";
const SHOWN_WITHIN_MS = 600; // the sheet is up within a frame or two; never hold a start longer than the move itself

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
  const handover = useHandover();
  const [state, setState] = useState<FormState>({});
  const [pending, startPending] = useTransition();
  const [text, setText] = useState("");
  // the brief as it leaves the box: set as the new run's title will be, for the one commit before it moves
  const [ghost, setGhost] = useState<{ title: string; width: number } | null>(null);
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

  // The handover (Q138): the brief moves into the new run's title at the press, and the server is asked afterwards.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    // null when the server is going to refuse before any run exists: then nothing moves, the reason just appears
    const title = handover ? handoverTitle(text, automations) : null;
    const sheet = e.currentTarget.closest<HTMLElement>("[data-sheet]");
    let shown: Promise<unknown> = Promise.resolve();

    if (handover && title && sheet) {
      // 1. The brief, set exactly as the title will be - same width, size and line breaks, scaled down to the box's
      //    size - replaces the typed text for one commit. Old and new then look alike, so they never double up.
      flushSync(() => setGhost({ title, width: titleWidth(sheet.clientWidth) }));
      // 2. One transition takes it away and puts up the new run's sheet, whose title carries the same name: React
      //    pairs the two and the browser carries the words from here into the title (handover.css).
      startTransition(() => {
        setGhost(null);
        shown = handover.begin(title);
      });
    }
    // 3. Only then the server. A start begun in this same event would share the handover's transition lane, and
    //    the move would wait for the server's answer - the second of nothing in Q138.
    void Promise.race([shown, new Promise((r) => setTimeout(r, SHOWN_WITHIN_MS))]).then(() => start(data));
  }

  function start(data: FormData) {
    startPending(async () => {
      let result: FormState;
      try {
        result = await startRunAction({}, data);
      } catch {
        result = { error: UNREACHABLE }; // the request never came back: no run exists
      }
      const id = result.startedId;
      if (!id) {
        handover?.end(); // refused: back to the box, with what was typed and the reason under it
        setState(result);
        return;
      }
      // the real run replaces the sheet that stood in for it, in one commit, once its page is ready
      startTransition(() => {
        handover?.end();
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

  // One type size for the box, the hint behind it and the brief as it leaves (Q135). The md: sizes are needed: the
  // shadcn Textarea sets md:text-sm, which beats a plain size class on a desk and made the box 14 px.
  const size = hero ? 19 : 15;
  const type = hero ? "text-[19px] md:text-[19px] leading-7" : "text-[15px] md:text-[15px] leading-6";

  return (
    <form onSubmit={onSubmit} className="w-full">
      <div
        data-testid="composer-capsule"
        // the ring is an outline, not a ring utility: a ring is a box-shadow, and the style below sets box-shadow (Q143)
        className={cn(
          // 2 px at 45%: the app's 3 px focus ring reads as a heavy border around something this large
          "glass rounded-[26px] outline-ring/45 focus-within:outline-2",
          hero ? "px-5 pt-4 pb-3" : "px-4 pt-3 pb-2.5",
        )}
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
              ghost && "text-transparent caret-transparent", // the brief is leaving: its copy below is what moves
            )}
          />
          {ghost && (
            <ViewTransition name={HANDOVER_NAME} share="handover" default="none">
              {/* laid out at the title's width and size, then scaled down to the box's: the browser snapshots the
                  layout and animates the scale, so what moves is the title itself, growing into place */}
              <p
                aria-hidden
                className={cn("pointer-events-none absolute top-0 left-0 origin-top-left", TITLE_TYPE)}
                style={{ width: ghost.width, transform: `scale(${size / TITLE_PX})` }}
              >
                {ghost.title}
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
  const focus = "focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <div data-testid="composer-connections" className="flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] tracking-[0.01em] text-slate">
      <Plug aria-hidden className="size-3.5 shrink-0" />
      {names.length === 0 ? (
        <Link href="/settings/connections" className={cn("rounded-full underline-offset-2 hover:text-graphite hover:underline", focus)}>
          No connections on
        </Link>
      ) : (
        <>
          <span>Using</span>
          {/* one chip per connection: as plain words, two names ran together into one (Q147) */}
          {names.map((n) => (
            <Link
              key={n}
              data-testid="connection-chip"
              href="/settings/connections"
              title={`${n} is on - change it in Settings`}
              className={cn("rounded-full bg-mist px-2 py-0.5 font-medium text-graphite transition-colors hover:bg-mist-deep", focus)}
            >
              {n}
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
