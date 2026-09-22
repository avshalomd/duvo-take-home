---
name: requirements
description: Use when the timed task starts and he gives the task after /requirements, as pasted text or as a PDF (attached, or a path). One stage, his first gate - starts the clock and the stack scaffold, saves the task, researches it, posts an executive summary for him to read (T+5), then interviews him until he says aligned (T+12). Hands over to design.
---

# Requirements: understand, summarise, align (T+0 to T+12)

Input: the task, which arrives by mail as text or as a PDF. He either pastes the text after the command, attaches
the PDF, or gives a path to it (often `~/Downloads/<name>.pdf`). Output: `docs/TASK.md`, `docs/REQUIREMENTS.md`
aligned with him, the stack laid and the prep agent's fixtures. This is brainstorming first and questions second:
he reads how you understood the task before he answers anything.

## 1. Start everything (first minute)

1. If `.claude/run/clock` does not exist, run `.claude/scripts/clock-start.sh`. Then start
   `.claude/scripts/scaffold.sh` with `run_in_background: true` (about a minute: it lays the stack from
   `.claude/scaffold/`, runs `npm ci` and `npm run check`, commits). Anything but `SCAFFOLD OK` in its last line
   is fixed before WP0.
2. **Get the task text.** Pasted: use it as it is. A PDF: copy it to `docs/task.pdf`, read it (all pages) and
   transcribe it word for word, keeping headings, numbered lists and tables as markdown. A page with something a
   transcript cannot carry (a diagram, a screenshot) gets a `[figure: ...]` line under the transcript. Both a PDF
   and text: the PDF is the task, the text is his note on it.
3. Save it verbatim to `docs/TASK.md` (from a PDF: the transcript, first line `Source: docs/task.pdf`). No edits,
   no summary. A key or a password in it becomes `<redacted>`; tell him to run
   `.claude/scripts/set-secret.sh NAME` in his own terminal.
4. **Start the prep agent.** One Agent call: general-purpose, `name: "prep"`, `model: "opus"`, `run_in_background: true`, no
   worktree. Its prompt is the task text verbatim, then:
   > You prepare material for a timed build. You need no answers from anyone. Write only `fixtures/` and
   > `docs/NOTES.md`. Do not commit, install packages or touch any other file. Finish within five minutes.
   > - `fixtures/<kind>.json`: realistic sample inputs for this domain, enough to demo every screen and to
   >   evaluate the LLM step. JSON arrays with stable string ids; real-looking names, numbers and dates; the
   >   cases a real user brings: one clean, several typical, one ambiguous, one broken or off-topic. Long free
   >   text may go in a `.txt` beside its JSON. No `.ts` files.
   > - `fixtures/llm-cases.json`: 6-10 cases for the LLM step, each `{ id, input, expected, why }`, covering the
   >   easy case, every category the task names, and at least one the model should fail or flag.
   > - `docs/NOTES.md` (write the fixtures first: the stack is being installed and `node_modules` lands within
   >   about two minutes): the library APIs this task needs, read from `node_modules/next/dist/docs/`,
   >   `node_modules/ai/docs/` and the installed type definitions. Per API: the import, a 3-6 line snippet for
   >   the installed version, the gotcha. Then `## Fixtures`: each file and what it covers. Under 120 lines.
   > Report in three lines: files written, what the LLM cases cover, anything you could not model.

## 2. Research, then the executive summary (by T+5)

5. **Gather context, freely and fast** (about two minutes): web search the domain terms and how real users do
   this job today, fetch a doc page, look at a snippet. Read `.claude/scaffold/src/lib/llm/` to see what the LLM
   templates already give (extraction, agent with tools). Stop when you can explain the task's world; this is
   not a literature review.
6. Write `docs/REQUIREMENTS.md`, at most about 70 lines:
   - `Goal:` one line, in the task's own terms.
   - `## The task's world` - the actors, the objects they handle, the decision the user makes and what it costs
     to get it wrong. Four to six lines, in the domain's words, not the software's.
   - `## Stated` - R1..Rn, each quoting or tightly paraphrasing one requirement of the task.
   - `## Implied` - I1..In, what a real user needs that the task does not say, each with its reason:
     `I2 A failed model call is visible and retryable - the model can time out or return off-schema output.`
     Only what is specific to this task; the deploy and the README are given.
   - `## Open questions` - Q1..Qn, only questions whose answer changes the product, each with the default you
     would take: `Q1 Who can approve a change? - default: any signed-in operator.`
   - `## Scope (first guess)` - Must / Should / Won't, as lists of R and I ids. The Must tier fits the build
     window (T+22 to T+40) across the parallel packages; an ambitious task gets a deliberate cut, stated in the
     README, not a half-finished everything.
7. `.claude/scripts/gate.sh summary`, then
   `git add docs/TASK.md docs/REQUIREMENTS.md` (and `docs/task.pdf`) `&& git commit -m "docs: task and requirements" -- <those paths> && git push`.
   Commit only these paths: the prep agent and the scaffold are still writing.
8. **Post the executive summary in chat** and end the turn. It is what he reads to check your understanding, so
   it stands on its own, one screen:
   ```
   SUMMARY - <the task in one line>
   The world: <who, what they handle, the decision they make; 2-3 lines>
   What we build: <the core flow in 3-5 numbered steps, as the user lives it>
   Takeaways: <3-5 bullets: what matters most, where the hard part is, what the model does and what code does>
   Scope guess: Must <ids, in words> | Should <...> | Won't <...>
   Unclear: <the open questions, one line each, with my default>
   ```
   Then the status block (CLAUDE.md). Last line: `Read it and correct me; say "go" for the questions.`

## 3. His read (T+5 to about T+7)

9. His corrections patch `docs/REQUIREMENTS.md` in place (never restart it); re-post only what changed. Anything
   he says that answers an open question is recorded now and not asked again.

## 4. The interview (until aligned, due T+12)

10. Before asking, commit the prep agent's output once it has reported (`chore: fixtures and API notes`). Sort
    the open questions: only those that change the product get asked; the rest become Assumptions with your
    default.
11. **Question shape** (AskUserQuestion): header at most 12 characters; 2-4 options; the recommended option first,
    labelled `(Recommended)`; his free text wins over any option. At most four questions per call (the tool's
    limit) and two rounds, and **the last round keeps its final slot for the gate question** (step 14).
12. **Round 1 - scope and product**: what the Must tier really is, who the user is, what "done" looks like.
13. **Round 2 - design options, as previews, only if a screen choice changes the product.** If none does, take
    your default, record it under Design choices and skip the round: round 1 is then the last one. One question
    per screen that matters, each option carrying an
    ASCII mockup in `preview`: at most 12 lines, 60 characters wide, filled with fixture data, single-select.
    Example: an Inbox question whose options are "list + detail pane" and "table with inline actions", each drawn.
14. **The gate question rides in the last round, as its final question**, never as a call of its own (a separate
    call is a whole round trip, and sim 2 reached aligned at T+16.6 against T+12): "With these answers, are we
    aligned?", options `Aligned (Recommended)` and `Change something`. On a change or free text: patch, then ask
    again with this one question. The clock never closes this gate for him: if time is short, ask fewer
    questions, never skip his answer.
15. Update `docs/REQUIREMENTS.md` from his answers: `## Scope (aligned)` replaces the first guess, `## Assumptions`
    (every default taken, one line each), `## Design choices` (the option picked per screen, with its preview
    pasted in).
16. On aligned: `.claude/scripts/gate.sh aligned`,
    `git add docs/REQUIREMENTS.md && git commit -m "docs: requirements aligned" -- docs/REQUIREMENTS.md && git push`,
    then run the `design` skill in the same turn.
