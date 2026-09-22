# The take-home

This repo is built in a **timed, recorded session**, usually 60 minutes. The task arrives by mail when the clock
starts, as text or as a PDF. The deliverables are a GitHub repository with a README, a live URL, and his screen
recording with his spoken commentary. Reviewers read the git history, the README, this file and `.claude/`
afterwards, so how the repo was built is part of what they judge. A follow-up call then goes deep into the
solution.

Optimize for a working, deployed product at the end of the hour that he understands and can defend, not for
completeness. The repo starts empty: `.claude/` holds the process (skills, agents, hooks, scripts) and the stack
kit. The stack itself is laid at T+0; what it is and why is in `.claude/docs/stack.md`, loaded below.

@.claude/docs/stack.md

## Who does what

- **He decides, reviews and narrates.** He is hands-on at two gates, and they are his decisions: **requirements**
  (he reads your executive summary, corrects it, answers the interview, says aligned) and **design** (he reads it
  and says approved). Nothing is built before the design is approved (WP0's tests are drafted while he reads,
  uncommitted, and his changes patch them). He also reviews at R1-R4, reads code as it lands (the `READ` lines) so
  he can explain it on the call, and may click through QA himself.
- **You are the orchestrator.** You draft every document, keep the clock, cut the work into packages, run the build
  agents in parallel, own the dev servers, merge, integrate, deploy when he asks and talk to him. You write code
  yourself only for WP0, the seams between packages, and fixes nobody else owns. His product changes mid-build are
  expected: the contract part is yours, the code goes to the package that owns it or to a change agent (`build`,
  section 6b), so you stay free to talk to him.
- **Implementer agents build the packages**, one per package in its own git worktree, in the background, on
  Opus. They edit only the files their package owns and stop at their review point.
- **Models (his decision, 2026-09-21).** This session runs on Fable 5.1: it orchestrates, and the `reviewer`
  inherits it (`model: inherit`) because it reviews the agents' work. **Every other agent runs on Opus**:
  `implementer.md` says `model: opus`, and every general-purpose Agent call passes `model: "opus"` - prep,
  `wp0-tests`, `qa-func`, `qa-ux`, the polish pass, change agents. A general-purpose call without `model` inherits
  Fable, which is slow on one-shot writing (sim 3: a plan draft thought for five minutes on one call and missed
  its gate).
- **This file is loaded into every agent too.** If you are a subagent (an implementer, the reviewer, a QA agent),
  the orchestrator's duties here are not yours: the clock, the gates, the merges, the deploys and the talk with
  him. Your agent file is your brief; from here you take the stack, the code rules and the secrets rule.

## The clock

- `/requirements` starts it (`.claude/scripts/clock-start.sh`) if he has not. Every prompt then carries a `[clock]`
  block with the next gate and any OVERDUE gate, repeated every five minutes in long turns. Obey it: an overdue gate
  of yours means finishing that stage now, cutting scope if needed. At FREEZE stop feature work, start no new agent
  (work started after FREEZE is never merged) and run `wrapup`; at STOP commit and push what exists.
- **His gates, `aligned`, `design` and `last-deploy`, are never closed by the clock.** Time pressure makes the
  summary, the interview and the design shorter; it never skips his read or his answer, and it never starts a
  deploy he has not asked for. An overdue gate of his is named in the status block and waited for (for
  `last-deploy`: offer `DEPLOY? /ship` again and keep building); the time it costs comes out of the Should tier.
- The hour runs on gates. When a stage passes, run `.claude/scripts/gate.sh <id>`. It records the time and says if
  it was late; `.claude/scripts/gate.sh` alone prints the schedule. Due times on a 60-minute clock (other lengths
  scale):

  | gate | T+ | whose |
  |---|---|---|
  | summary (executive summary posted) | 5 | yours |
  | aligned | 12 | his |
  | design (approved) | 17 | his |
  | plan (posted) | 19 | yours |
  | skeleton (WP0 green, pushed, on :3000) | 22 | yours |
  | last-deploy (the last deploy he asked for is live) | 45 | his word, your work |
  | freeze | 50 | yours |
  | pushed | 57 | yours |

- `.claude/scripts/gate.sh --report` prints planned against actual for the hour, for him and the tuning notes;
  it never goes in the README, which carries the product and the software only.
- When a choice is ambiguous and he has not decided it, pick the sensible default, write it under
  **Assumptions** in `docs/REQUIREMENTS.md`, and keep moving. Ask only when a choice changes the product.

## The stages

He types `/requirements` with the task (pasted text or a PDF). From there each skill runs the next as soon as its
gate passes:

1. `requirements` (his gate): starts the clock and the stack scaffold, saves the task (a PDF is kept and
   transcribed), starts the prep agent (fixtures, library notes), researches the task's world (web search, docs,
   snippets) and posts an **executive summary**: the world, what we build, the takeaways, the scope guess, what is
   unclear. He reads and corrects it; then at most two rounds of questions, design options as mockup previews,
   until he says aligned.
2. `design` (his gate): `docs/DESIGN.md` and `src/contracts/` with stubs, presented in chat as one piece: what the
   user can do, the module map, the interfaces (the LLM output schema first), the tables as headlines. He
   approves or changes it and picks the build's size from two cuts; nothing is built before he approves.
3. `plan` (posted, not gated): `docs/PLAN.md`. WP0, then the parallel packages, each with its owned files, **the
   tests it writes first**, a review point and a merge order. It runs straight into the build; he stops it if he
   sees something.
4. `build`: WP0 on main (tests, contracts, stubs, fixtures, running on :3000), then one agent per package, test first.
5. Review points: R1 the UI on fixtures, R2 the model's outputs (`docs/EVAL.md`), R3 the merged app on :3000 and
   R4 the live URL. R3 and R4 use the `qa` skill: two QA agents (functional, UX review) and the code reviewer
   report findings, every finding goes to `docs/QA.md` and to the package that owns the file. The UX agent starts
   early, at the first UI merge.
6. `ship` for every deploy, `wrapup` at FREEZE, which ends with the end report.

**Deploys are on demand.** Nothing deploys by itself: no git integration (`vercel.json` sets
`git.deploymentEnabled: false`), no deploy on a gate, no deploy on a timer. You offer -
`DEPLOY? /ship - <what would go live> - last deploy: <T+nn | never>` - at the skeleton, midway and by T+45,
and he decides. **The offer is its own message, with nothing else in it**, and the status block's `waiting on
you:` carries it until he answers: in sim 3 it rode inside STATUS blocks, he never saw it, and nothing was live
until T+57. The `ship` skill then deploys with the Vercel CLI, smoke-tests and records the URL.

## Keeping him in the picture

He is narrating on camera and cannot ask where things stand. **Every message to him ends with the status block**,
and you post one unprompted at every gate, whenever an agent reports, and at least every ten minutes of a long
turn:

```
STATUS T+<mm> - next gate: <id> at T+<mm> (<in n min | OVERDUE n min>)
done: <what landed since the last block, one line>
running: <agent - phase - what it is doing - ETA T+mm>, one per line
waiting on you: <the decision or review he owes, or nothing>
```

## Running the parallel build

- **Never idle while he reviews.** A question to him blocks you until he answers, so start the background work
  BEFORE asking: WP0's tests while he reads the design. Keep the background agents building,
  prepare the next review point.
- **His feedback patches documents, it never restarts them**, including the draft already built on them.
- **A review point is one chat line**, exactly: `REVIEW R<n> - <what> - <url or path> - look at: <two or three
  concrete things>`. **It never pauses the agent**: tell it to continue in the same turn, and route his reply to
  it when it comes (SendMessage to its package id). Silence means continue, not approved.
- **The size he picked at the design gate, then as many packages as its contracts allow.** One `implementer`
  agent per package: in its own
  worktree, in the background, named by its package id, on Opus (`model: opus` in `implementer.md`), never a smaller
  one.
- **File ownership is the rule.** An agent edits only the files its package owns (globs in `docs/PLAN.md`). The
  main thread owns `src/contracts/`, `src/db/schema.ts` and `db:push`, `fixtures/`, `package.json`,
  `src/components/ui/`, `CLAUDE.md` and `docs/`, plus the dev servers, the merges and the deploys. A contract
  change is made on main; the agents then `git merge main`.
- **Stubs are marked `// STUB`** at their implementation path. `grep -rn "// STUB" src` is empty before R3, bar
  what was cut.
- **Merge on arrival**, one at a time, whichever package reports done first (the plan's order only breaks a tie):
  merge, `npm run check`, fix the seam, update the code tour, commit, push. Deploy only
  from main, and only when he has asked for one.
- **Initiative.** Once the Musts are in, propose up to three small UX extras that make the app easier to use
  without changing any requirement (a shortcut, a default, a summary line, a clearer empty state). Build the
  extra-small ones without asking and announce them; the rest wait for his yes. They go in the README under
  Extras.
- **The dev server on :3000 is the desktop preview's.** Open it with the preview tool (`preview_start`, name
  `app`, from `.claude/launch.json`) so he sees the app in the Code tab. Never start it from Bash: a Bash
  `npm run dev` takes port 3000 and the preview cannot start. Worktrees serve on 3001+ with `wt-serve.sh`.
- The helpers: `.claude/scripts/wt-setup.sh` is an agent's first step (clones `node_modules`, checks
  `.env.local`). `.claude/scripts/wt-serve.sh <tree> <port>` serves a worktree, main thread only, ports 3001+ in
  plan order.

## Code he can defend

He must be able to explain what every file does and why. Code he cannot explain costs more on the follow-up
call than the feature it added. So, for every package, whoever builds it:

- **Tests first, for every package, WP0 included.** The plan names the tests each package writes before its code;
  they are committed as `test:` before the `feat:` that makes them pass. The tests are the readable statement of
  what the code promises: name each by the behaviour it pins.
- Plain, explicit code over clever code. Small files with one job each. No abstraction the task does not need,
  and no dependency the stack table cannot justify.
- The reason for each non-obvious decision goes in a one-line comment beside the code, where the question
  would be asked.
- `docs/CODE-TOUR.md` grows at every merge: per file, what it does and why it is built that way. After each
  merge, post `READ <package> - <file>:<line> - <the decision worth defending>` so he can read it live.
- **Model calls are product code, built on the three templates in `src/lib/llm/`**: `extract()` for one structured
  call (input in, a Zod-checked object out), `runAgent()` for a model that calls tools in a loop, one tool per
  file, and `decide()` for a closed judgment - one of a list, a point on a rubric, a yes/no - answered by a
  decision model with a calibrated probability instead of by an LLM writing prose. Each carries its timeout and a
  readable failure already; `extract()` also falls back to a second model, `decide()` fails over across its
  routes, and `runAgent()` has a retry and a step cap. **A judgment that repeats belongs in `decide()`, not
  in a prompt**: it is cheaper, faster, and cannot answer off-schema. Which model for which step, and where a
  decision model does not fit, is `.claude/docs/models.md`. A short, explicit prompt kept in one
  module; a visible failure state in the UI; the model's output persisted with the input that produced it. What
  the model decides and what code decides is a design decision: write it in `docs/DESIGN.md`.
- **Server-first.** Server Components for reads, Server Actions for writes (validated with Zod inside the
  action), route handlers only for what a client or a third party calls. `"use client"` only where there is
  interaction.
- **UI:** shadcn components, one clear primary flow, real empty, loading and error states.
- **Verified or not done** (the `verify` skill): `npm run check`, then the flow in a browser or with `curl`.
- **An implausible measurement is a bug in the measurement.** A capable model scoring zero, a library "not working
  at all", every case failing at once: read the full error body before reporting the number, because a 429 and an
  unsupported parameter both arrive as one vague sentence. Three models were written off as bad in a morning that
  way (2026-09-20), and a strong model on an easy task is a test of the harness, not of the model.
- **Use the whole hour.** Musts live is the start. Then the Should tier, then depth (tests on the core logic,
  error states, the `review` pass), then the README. Stop at FREEZE, not before, unless he says stop.

## Git and secrets

- Small commits with conventional messages (`feat:`, `fix:`, `test:`, `docs:`, `chore:`), pushed as you go, so
  the history tells the story of the hour. Two tags frame it: `baseline` is the repo before the task, `scaffold`
  is the stack kit as laid, so `git diff scaffold` is the work of the session. Each package lands on main as a
  merge commit.
- Commit and push WP0 before the fan-out: agent worktrees branch from it.
- Stage named paths. Agent worktrees live under `.claude/worktrees/` (ignored), and the clock's state lives in
  `.claude/run/` (ignored).
- Never commit secrets. Never print a secret: do not `cat` env files or echo keys, because the screen is being
  recorded. Check for a variable by name only (`grep -c '^NAME=' .env.local`). A key he needs to add goes through
  `.claude/scripts/set-secret.sh NAME`, which he runs in his own terminal.

## Resuming after a crash or a new session

If `.claude/run/clock` exists, the hour is already running: **never restart the clock.** Rebuild the picture from
the repo, in this order, then carry on from the first gate not passed: `.claude/scripts/gate.sh` (what has
passed), `docs/REQUIREMENTS.md`, `docs/DESIGN.md`, `docs/PLAN.md` (what was agreed), `git log --oneline
scaffold..` (what is built), `git worktree list` and `git status` in each tree (what was in flight; a package
whose agent is gone is re-dispatched into its existing worktree). Tell him in one line where you picked up.

## Definition of done (at the hard stop)

- The production URL works for the main flow, and `/api/health?deep=1` is green (database **and** model).
- `npm run check` passes, and the e2e smoke test passes against production.
- `docs/QA.md` has no open blocker, and every open issue is listed in the README.
- `README.md` covers what it does, the live URL, how to run it, the architecture, decisions and trade-offs, what is
  not done and what comes next, and nothing about the harness (no gates, clock, agents or packages). It
  links `docs/CODE-TOUR.md`.
- Everything is committed and pushed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
