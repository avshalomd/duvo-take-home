"use client";

import { ArrowUp, LoaderCircle, Plug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, useSyncExternalStore, useTransition, ViewTransition } from "react";
import { flushSync } from "react-dom";
import { startRunAction, type FormState } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { StartRefusal } from "@/lib/usage/budget-rule";
import { cn } from "@/lib/utils";
import { applyCommand, commandHint, commandQuery, filterAutomations } from "./command-query";
import { COMMAND_LIST_ID, CommandList, optionId, type CommandOption } from "./command-list";
import { mayTakeFocus } from "./first-focus";
import { useHandover } from "./handover-host";
import { handoverTitle } from "./handover-title";
import { HANDOVER_NAME, TITLE_PX, TITLE_TYPE } from "./run-title";
import { titleWidth } from "./sheet";
import { useRefreshWhenARunSettles } from "./use-refresh-when-a-run-settles";
import "./handover.css";

const PLACEHOLDER = "Describe a task in plain words, or type / to run a saved automation";
const QUESTION_ID = "brief-question"; // the first visit's heading, which names the box there
const UNREACHABLE = "Could not reach the app, so no run was started. Check your connection and press Run again.";
const SHOWN_WITHIN_MS = 600; // the sheet is up within a frame or two; never hold a start longer than the move itself

// The capsule's look, shared with the stand-in the handover shows before the new run's page exists (ComposerStandIn).
// 2 px at 45%: the app's 3 px focus ring reads as a heavy border around something this large. relative z-20: the
// command list is placed against the capsule, above what follows it on the page. The ring is an outline, not a ring
// utility: a ring is a box-shadow, and the style below sets box-shadow (Q143).
const CAPSULE = "glass relative z-20 rounded-[26px] outline-ring/45 focus-within:outline-2";
// glass sets its own box-shadow (the light top edge), which would cancel a shadow utility: the edge, a hairline and the
// float are set together here, or the capsule has no outline at all on white paper
const CAPSULE_STYLE = { boxShadow: "inset 0 1px 0 var(--glass-edge), 0 0 0 1px var(--hairline), var(--shadow-float)" };
// Q203: no ring or border of the box's own when it is refused - a square inside a round capsule; the capsule draws
// the refusal instead, in its own shape
const BOX =
  "relative col-start-1 row-start-1 min-h-0 resize-none rounded-none border-0 bg-transparent p-0 shadow-none placeholder:text-slate focus-visible:ring-0 aria-invalid:border-0 aria-invalid:ring-0 dark:bg-transparent dark:aria-invalid:ring-0";
// One type size for the box, the hint behind it and the brief as it leaves (Q135). The md: sizes are needed: the
// shadcn Textarea sets md:text-sm, which beats a plain size class on a desk and made the box 14 px.
const SIZES = {
  hero: { px: 19, type: "text-[19px] md:text-[19px] leading-7", pad: "px-5 pt-4 pb-3" },
  floating: { px: 15, type: "text-[15px] md:text-[15px] leading-6", pad: "px-4 pt-3 pb-2.5" },
};

// The one box on Home: plain instructions start a new run; "/audit Acme Ltd" runs a saved automation on an input.
// The server decides which is which (startRunAction). Glass, in two sizes: the hero under the first visit's
// question, and a capsule floating at the bottom of an open run.
export function Composer({
  variant,
  automations,
  notReady,
  connections,
  refusal,
}: {
  variant: "hero" | "floating";
  automations: CommandOption[];
  notReady: number;
  connections: string[];
  refusal: StartRefusal | null; // the workspace's limits refuse a start right now (UX QA U3), as the server read them
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
  const box = useGrowingBox(text);
  // Q195: set on the press itself, synchronously. The Run button is only disabled once the start is pending, which
  // waits for the handover's move (up to SHOWN_WITHIN_MS): a second press or Cmd+Enter in between started a second run
  const starting = useRef(false);
  const hero = variant === "hero";
  // Refused in the box, without asking the server (UX QA U3). Shown only while the page still says so: once a run
  // settles and the fresh page lifts the refusal, the reason goes with it and the next Run goes to the server.
  const [refusedHere, setRefusedHere] = useState(false);
  const refused = refusedHere && refusal ? refusal.reason : null;
  const error = state.error ?? refused;
  const invalid = Boolean(error || state.fieldErrors?.prompt);
  useRefreshWhenARunSettles(refusal?.waitsForRun ? refusal.inFlight : null);

  const query = commandQuery(text);
  const open = query !== null && dismissed !== text;
  const options = open ? filterAutomations(automations, query) : [];
  const highlighted = Math.min(active, Math.max(options.length - 1, 0));
  const hint = commandHint(text, automations);

  // The first visit's box takes the focus as it appears - not with autoFocus, which took it from a menu the person
  // had opened while Home streamed in, and closed the menu: only when nobody else is using it (first-focus.ts)
  useEffect(() => {
    if (hero && mayTakeFocus(document)) box.current?.focus();
  }, [hero, box]);

  // Every change to the text, typed or picked from the list, drops a refusal: it was about the text as it was (Q202)
  function edit(next: string) {
    setText(next);
    setActive(0);
    if (invalid) setState({});
    setRefusedHere(false);
  }

  function pick(command: string) {
    edit(applyCommand(text, command));
    box.current?.focus();
  }

  // The handover (Q138): the brief moves into the new run's title at the press, and the server is asked afterwards.
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (starting.current) return; // one press, one run: this brief is already on its way
    // null when the server is going to refuse before any run exists: then nothing moves, the reason just appears
    const title = handover ? handoverTitle(text, automations) : null;
    // UX QA U3: a start the workspace's limits refuse is refused here, in the box: no sheet flies up to snap back. Only a
    // start that would otherwise go (a title): a mistyped command or a short brief still gets its own reason first.
    if (refusal && title) {
      setState({});
      setRefusedHere(true);
      box.current?.focus(); // the person goes on from the box: it keeps what they typed
      return;
    }
    starting.current = true;
    const data = new FormData(e.currentTarget);
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
        shown = handover.begin(title, connections);
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
      starting.current = false; // answered, either way: the next press is a new start
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

  const { px: size, type, pad } = SIZES[variant];

  return (
    // data-start-refused: the page knows the limits refuse a start (e2e reads it; nothing styles it)
    <form onSubmit={onSubmit} data-testid="composer-form" data-start-refused={refusal ? "" : undefined} className="w-full">
      <div
        data-testid="composer-capsule"
        data-invalid={invalid || undefined}
        className={cn(
          CAPSULE,
          invalid && "outline-2 outline-crimson/60", // refused: the capsule's own outline says so, whether focused or not
          pad,
        )}
        style={CAPSULE_STYLE}
      >
        {!hero && (
          <label htmlFor="prompt" className="sr-only">
            What should the agent do?
          </label>
        )}
        {/* One grid cell holds the input and its hint, so the box is as tall as the taller of the two: laid over the
            input, a hint that wrapped ran over the controls below (his report, 2026-09-23). */}
        <div className="relative grid">
          {/* the input's hint after a chosen command (Q93): the typed text drawn invisibly, then the hint */}
          {hint && (
            <p aria-hidden className={cn("pointer-events-none col-start-1 row-start-1 break-words whitespace-pre-wrap", type)}>
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
            placeholder={hint ? undefined : PLACEHOLDER}
            value={text}
            onChange={(e) => edit(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={() => setDismissed(text)} // clicking elsewhere closes the list, as it would a menu
            onFocus={() => setDismissed(null)}
            aria-labelledby={hero ? QUESTION_ID : undefined}
            aria-invalid={Boolean(state.fieldErrors?.prompt)}
            aria-controls={open ? COMMAND_LIST_ID : undefined}
            aria-activedescendant={open && options.length ? optionId(options[highlighted].command) : undefined}
            aria-autocomplete="list"
            className={cn(
              BOX,
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
        </div>

        {state.fieldErrors?.prompt && (
          <p role="alert" className="mt-2 text-[13px] text-crimson">
            {state.fieldErrors.prompt[0]}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 text-[14px] text-crimson">
            {error}
          </p>
        )}

        <ControlsRow connections={connections} pending={pending} />

        {/* anchored to the whole capsule, not the text: it opens past the Run button and the chips, never over them */}
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

/**
 * The floating composer as the new run's page will show it, for the sheet that stands in for the run until that page
 * arrives (PendingSheet, UX QA U11): the same capsule, box, hint and row, so the swap changes nothing on screen. Inert:
 * nothing in it can be pressed or typed into, and a screen reader passes over it.
 */
export function ComposerStandIn({ connections }: { connections: string[] }) {
  const box = useGrowingBox("");
  const { type, pad } = SIZES.floating;
  return (
    <div inert className="w-full">
      <div data-testid="composer-capsule" className={cn(CAPSULE, pad)} style={CAPSULE_STYLE}>
        <div className="relative grid">
          <Textarea ref={box} rows={1} readOnly tabIndex={-1} placeholder={PLACEHOLDER} className={cn(BOX, type)} />
        </div>
        <ControlsRow connections={connections} pending={false} />
      </div>
    </div>
  );
}

// the box grows with the brief instead of scrolling inside itself, up to a third of a phone's screen
function useGrowingBox(text: string) {
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [text]);
  return box;
}

// Under the box: the connections the run gets, and Run.
function ControlsRow({ connections, pending }: { connections: string[]; pending: boolean }) {
  const shortcut = useShortcutName();
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <ConnectionChips names={connections} />
      <div className="ml-auto flex shrink-0 items-center gap-2.5">
        {/* Q209: Enter makes a new line, so the key that runs is named beside Run, quietly and in the platform's
            words; a phone has no such key, so it is not shown there. Screen readers get it from aria-keyshortcuts */}
        {shortcut && (
          <span data-testid="run-shortcut" aria-hidden className="text-[12px] tracking-[0.01em] text-slate max-[899px]:hidden">
            {shortcut.label} Enter
          </span>
        )}
        <Button type="submit" disabled={pending} aria-keyshortcuts={shortcut?.aria} className="h-9 px-4 max-[899px]:h-10">
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <ArrowUp aria-hidden />}
          {pending ? "Starting..." : "Run"}
        </Button>
      </div>
    </div>
  );
}

// The run shortcut's key, as the keyboard in front of the person names it: ⌘ on Apple's, Ctrl elsewhere. The server
// cannot know, so it renders nothing and the browser fills it in (useSyncExternalStore: no hydration mismatch).
const APPLE = { label: "⌘", aria: "Meta+Enter" };
const OTHER = { label: "Ctrl", aria: "Control+Enter" };
const noSubscribe = () => () => {};
function useShortcutName(): typeof APPLE | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? APPLE : OTHER),
    () => null,
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
