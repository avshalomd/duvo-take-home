---
name: design
description: Use when requirements are aligned (T+12) - writes docs/DESIGN.md and the contracts as code, presents the whole design in chat (what the user can do, the module map, the interfaces, the tables), and waits for his approval, which the clock never closes (due T+17). Starts WP0's tests in the background while he reads.
---

# Design (T+12 to T+17): his second gate

One document, one review, one approval. It holds the two things he has to be able to explain on the follow-up
call: what the user can do, and the interfaces between the parts. **Nothing is built until he says approved.** If
time is short, make the design shorter, never skip his read. His comments patch the document and the code; never
start over.

1. Read `docs/REQUIREMENTS.md` (Scope (aligned), Assumptions, Design choices), `docs/NOTES.md`, `fixtures/` and
   `src/lib/llm/` (the extraction and agent templates the stack already has).

## docs/DESIGN.md

2. Write it in this order, short:
   - **What the user can do** - the core flow as numbered steps (what the user does, what the system does); per
     screen: route, purpose, actions; the empty, loading and error states, plus the LLM step's slow and failed
     states. The wireframe of the main screen, in ASCII, from the option he picked, filled with fixture data.
   - **Module map** - a small ASCII diagram: the screens, the server actions, the modules in `src/lib/`, the LLM
     step, the database, and the arrows between them. One line under it: what the model decides and what code
     decides (the model extracts or proposes; code computes, validates and stores).
   - **Interfaces** - the code in `src/contracts/`, pasted as it is: the LLM output schema first (the seam between
     the model and the deterministic logic), then one type per module function. One line of why under any field
     that is not obvious.
   - **Tables** - per table: `field  type  why` rows, the why only where it is not trivial, and one line on what
     the table is for. Relations by name.
   - **Model design** - the input; the output schema (by name, it is above); which template it uses (`extract`,
     `runAgent` or `decide` in `src/lib/llm/` - a step whose answer is one of a known list, a point on a rubric or
     a yes/no is `decide`, not a prompt) and where its prompt lives (`src/lib/llm/<step>.prompt.ts`); the timeout and
     what the UI shows on a timeout or off-schema output, and how the user retries; the output stored with its
     input; the eval `src/lib/llm/<step>.eval.test.ts` over `fixtures/llm-cases.json` (skipped unless `EVAL=1`,
     run with `EVAL=1 npx dotenv -e .env.local -- vitest run <file>`, writing `docs/EVAL.md`), and the pass bar.
   - **Look** - one line: the visual direction (density, one accent colour, the shadcn components used).
      - **Risks** - two or three, each with its fallback.
   - **Size** - two cuts for him to pick from at the approval: **the Must core**, and **the Must core plus the
     Shoulds worth their time**, each as `packages: <ids> - all merged ~T+<mm> - leaves ~<n> min for UI/UX rounds`.
     Estimate from the sims: three packages merged at about T+30 (sim 2), five at about T+42 (sim 3, with a phase B
     from his changes). His UI/UX rounds need about ten minutes between the last UI merge and FREEZE (T+50), and
     his mid-build changes are expected (his word): a cut that leaves no room for either says so.

## The contracts as code

3. So every package compiles against them from its first minute:
   - `src/contracts/<seam>.ts` - Zod schemas where data crosses a boundary (form input, LLM output), types by
     `z.infer`, one type per function signature. It imports nothing from the app, so no import cycle can form.
   - One stub per function, at its implementation path, typed by the contract: reads return fixture data (import
     `fixtures/*.json` by relative path), writes return a plausible value or
     `throw new Error("not implemented: <name>")`. Mark each `// STUB`. The package that owns the file replaces the
     body; the type keeps the signature honest. Plain server-side async functions, no `"use server"`: the UI's own
     server actions validate with the contract's schemas and call them.
     ```ts
     // src/contracts/review.ts
     export const Finding = z.object({ kind: z.enum(["qty", "price", "date"]), note: z.string() });
     export type Finding = z.infer<typeof Finding>;
     export type ExtractFindings = (input: { text: string }) => Promise<Finding[]>;
     // src/lib/llm/findings.ts (owned later by the LLM package)
     export const extractFindings: ExtractFindings = async () => cases[0].expected as Finding[]; // STUB
     ```
   - `src/db/schema.ts` - the tables beside `notes` (keep it). Additive only: new tables, nullable or defaulted
     columns. Do not push; WP0 does.
   - If the data model does not fit the fixtures, reshape the fixtures now, in the same commit.
4. `npm run typecheck` passes. Commit twice: `git add docs/DESIGN.md && git commit -m "docs: design"`, then
   `git add src fixtures && git commit -m "feat: contracts"`, then `git push`.

## Present it, start WP0's tests, wait

The question in step 6 blocks you until he answers, so his reading time is only used by what is already running
in the background. Start the agent before posting the design. There is no plan draft agent: the plan is yours,
written in about a minute once he approves (sim 3's background draft took 11 minutes and missed the plan gate).

5. **WP0's tests**: Agent, general-purpose, `name: "wp0-tests"`, `model: "opus"`, `run_in_background: true`, no
   worktree. Prompt:
   read `docs/DESIGN.md`, `src/contracts/`, the stubs they point at and `fixtures/`; write
   `src/contracts/<seam>.test.ts`, one per contract file: each schema accepts a fixture and rejects a broken one
   (name the broken field in the test's name), and each stub answers in its contract's shape; run
   `npx vitest run src/contracts` until they pass against the stubs; write nothing outside
   `src/contracts/*.test.ts`; do not commit; never print a secret. These are tests, not product code, and they
   stay uncommitted until he approves: "nothing is built before approval" holds.
6. **Post the design in chat, as one message he can read in two minutes:**
   ```
   DESIGN - docs/DESIGN.md
   The user can: <the core flow, 3-6 numbered steps>
   <the main screen's wireframe>
   Modules: <the module map>
   Model vs code: <one line>
   LLM output (the seam): <the Zod schema, pasted>
   Tables: <table: field type, field type, ... - one line each, why where not obvious>
   Look: <one line>
      Risks: <one line each>
   Size: A <the Must core> - merged ~T+<mm>, ~<n> min of UI/UX rounds / B <plus which Shoulds> - merged ~T+<mm>, ~<n> min
   Look at: <the two or three decisions most worth his challenge>
   ```
   Then the status block (CLAUDE.md), and the question: AskUserQuestion "Design approved, and which size?",
   options `Approved - <cut A>`, `Approved - <cut B>` and `Change something`, each cut's description carrying its
   merge time and its UI/UX minutes, `(Recommended)` on the cut that leaves room for UI/UX rounds. **The size is his
   call** (2026-09-21), never capped by a rule and never chosen for him.
7. His changes: patch `docs/DESIGN.md` and the code, re-run `npm run typecheck`, commit
   `docs: design - <what changed>`, SendMessage `wp0-tests` what changed (a finished agent is resumed by the message), re-post only the
   changed part and ask again.
8. **Only on approved:** `.claude/scripts/gate.sh design`, write the size he picked under Scope in
   `docs/REQUIREMENTS.md`, then run the `plan` skill. Never on silence, never on
   the clock: an overdue design gate is reported in the status block, not closed.
