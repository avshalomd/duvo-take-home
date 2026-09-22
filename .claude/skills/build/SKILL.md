---
name: build
description: Use when the plan is posted (T+19) - lands WP0 on main tests first, fans out one implementer agent per package in its own worktree, runs the review points without pausing the agents, merges each package as it arrives, adds small UX extras once the Musts are in, and gets the integrated app to /ship by T+45.
---

# Build: WP0, fan-out, review points, merge (T+19 to T+45)

You are the orchestrator: you land WP0, talk to him, own the dev servers, merge and integrate. The implementer
agents write the packages. Never edit a file that a running package owns. Every message to him in this stage ends
with the status block (CLAUDE.md), and so does every agent report you relay.

## 1. WP0 on main (about 3 minutes)

0. The scaffold reported `SCAFFOLD OK` (the stack is laid, installed and committed). If it failed, fix that first:
   nothing below works without it.
1. **Tests first**: the `wp0-tests` agent (started by the design skill while he read) has usually written them,
   uncommitted, in `src/contracts/*.test.ts`. Read them against the APPROVED design and `docs/PLAN.md`, patch what
   his changes moved, run them, commit `test: WP0 contracts`. If it failed or is still running, write them
   yourself (the contract tests and one test per stub signature): never wait for it.
2. Land exactly what the plan puts in WP0: the schema pushed (`npm run db:push`) and the seed loaded
   (`npm run seed`), the contracts and their `// STUB` implementations compiling, fixtures and `docs/NOTES.md`
   committed, every shadcn component the screens need, one page rendering fixture data through the stubs.
3. `npm run check`, commit, `git push origin main scaffold` (the tag `scaffold.sh` set: it is what makes
   `git diff scaffold` the session's work). Agent worktrees branch from local HEAD (`worktree.baseRef: "head"`), so
   this commit is what they start from (an untracked file never reaches them); the push keeps GitHub in step.
4. **Open :3000 in the desktop preview**: `preview_start` with
   `name: "app"` (`.claude/launch.json`), so he sees the app in the Code tab. Never start the main dev server
   from Bash (`npm run dev`, `wt-serve.sh . 3000`): it takes the port the preview needs. Only when there is no
   preview tool (a terminal session) use `.claude/scripts/wt-serve.sh . 3000`. Fan out now, then run
   `.claude/scripts/gate.sh skeleton` (WP0 green, pushed, running on :3000).
5. **Offer the first deploy, never start one yourself** (the `ship` skill): post
   `DEPLOY? /ship - the skeleton on stubs - last deploy: never` as its own message and carry on. Nothing deploys until he says so.

## 2. Fan out, every package at once

One Agent call per package in PLAN.md, all in the same message: `subagent_type: "implementer"`,
`isolation: "worktree"`, `run_in_background: true`, `name: "<package id>"` (if the tool takes no name, keep the
agent id it returns and address that). The prompt:

```
You are package <id>. Your section of docs/PLAN.md, verbatim:
<goal, files owned, contract used/provided, tests first, review point>
Contracts (read only): src/contracts/<file>.ts, src/db/schema.ts. Fixtures: fixtures/<files>.
Port: <from the plan, 3001 and up>. Tests first, then code. Phase A only: stop at your review point R<n> and report.
<UI packages only:> Phase A is the screens on fixture data only; report at R1 within about eight minutes.
```

Then tell him which agents are running, what each is testing first, and which review point comes first. In the
same message, **what he can review now**, while nothing is built yet, one line each:
`REVIEW NOW - <path> - <what to check>`: the contracts (the LLM output schema first), `src/db/schema.ts`, the plan's
seams, the eval cases in `fixtures/llm-cases.json`, WP0's tests. In sim 3 he spent the start of the build hunting
for these himself.

## 3. Review points

R1 is a UI on fixtures (one per UI package), R2 the model and data outputs (the eval table in `docs/EVAL.md`).
A bad eval row is read twice: a wrong answer is the prompt's problem, but an error, a rate limit or every case
failing at once is the harness's (`.claude/docs/models.md`), and switching model is one env var.
When an agent returns at its review point:
1. Read its report; `git -C <worktree> log --oneline main..` shows its commits (a `test(<id>)` commit before its
   first `feat(<id>)`; if the tests came after the code, say so in the status block).
2. If it has UI: `.claude/scripts/wt-serve.sh <worktree path> <port>` (idempotent, so a server the agent left running is
   reused).
3. Post one line: `REVIEW R<n> - <what> - <url or path> - look at: <two or three concrete things>`.
4. **In the same turn, tell the agent to go on**: SendMessage "R<n> is posted. Continue with phase B; his comments
   follow if he has any." A review point never pauses an agent: three minutes of waiting is a sixth of the build
   window, and his rule is already that silence means continue (continue, not approved).
5. When he replies, route it verbatim to that agent: "Review R<n>: <his words>. Apply it after your current step,
   test first where it changes behaviour, then carry on." If the agent has already finished, it is resumed by the
   same message. The page he is looking at is the live worktree, so it may move under him as phase B lands; say
   so in the REVIEW line's turn.

A package with nothing to show on its own (data, API) is reviewed at R3: when its phase A tests pass, send
"Continue with phase B" at once. Never sit idle while he reviews: merge finished packages, integrate, answer the
other agents, get the README ready.

## 4. Merge, per finished package (phase B reported done)

From the main checkout, **the moment a package reports phase B done**: merge on arrival, one merge at a time.
Ownership is disjoint and everything compiles against the contracts, so nothing is gained by waiting for an
earlier package; the plan's merge order only breaks a tie between two that are ready together. A UI merged before
its data package runs on the stubs' fixture data until that one lands, which is fine.
1. `git diff --stat main...<branch>` lists only the package's files. Anything else is reverted first (section 7).
2. `git merge --no-ff <branch>`.
3. `npm run check`, fix the seam on main, commit. Stage named paths or use `git commit -a`.
4. **Code tour.** Add the package to `docs/CODE-TOUR.md`: per file it added, one line on what it does and why it
   is built that way (the decision, not a description of the syntax). Commit it with the merge.
5. `git push`, then `.claude/scripts/wt-serve.sh --stop <its port>`. The preview on :3000 reloads by itself.
6. **The first UI package merged**: start the early UX pass now (the `qa` skill, "Early"), while the UI agents are
   still alive to fix what it finds.
7. Post one line so he can read the code while the rest builds: `READ <package> - <file>:<line> - <the one
   decision in it worth defending>`. One file, the one he would be asked about on the follow-up call.

## 5. Initiative: small UX extras

Once every Must is merged and green, look at the app as its user would and **propose up to three small extras**
that make it easier to use without changing any requirement: a keyboard shortcut, a sensible default, a count or
a summary line, a clearer empty state, a sort order, sample input one click away. Post them as one line each with
a size (`XS`, `S`). Build the `XS` ones at once, without asking (on main or through the package that owns the
file), and announce each as it lands; the `S` ones wait for his yes. Never an extra that changes what a requirement
says, and never one that risks the Musts or the T+45 deploy. Every extra goes in the README under **Extras**.

## 5b. UI/UX rounds (from the first UI merge to FREEZE)

The size he picked left room for his UI/UX iterations; spend it on them. **At the first UI merge**, besides the
early `qa-ux` pass, start one polish agent: Agent, general-purpose, `name: "polish"`, `model: "opus"`,
`isolation: "worktree"`, `run_in_background: true`. It owns the UI files of the packages whose agents have
finished (a file a running agent owns stays that agent's). Prompt: apply `qa-ux`'s XS findings and his UI comments
as they are sent to you, one small commit each, test first where behaviour changes; report every two or three
changes with your branch, and carry on; never edit contracts, schema, `package.json` or `docs/`. Merge it on
arrival like a package. His UI comments go to the UI package's agent while it is alive, to `polish` after.
**Nothing is started after FREEZE**: sim 3's polish pass began at T+55, ran to T+75, and none of it was merged.

## 6. Contract changes

An agent asks in its report (`CONTRACT REQUEST`) for anything main owns: `src/contracts/`, `src/db/schema.ts`
(then `npm run db:push`), `fixtures/`, `package.json`, a shadcn component. Change it on main, `npm run check`,
commit, push. Then SendMessage every agent that uses it: "Contract changed in <sha>: <one line>. Commit, run
`git merge main` in your worktree, then continue."

## 6b. His product changes mid-build (expect them)

His changes during the build are real product decisions (his word, 2026-09-21), not interruptions: sim 3 had five.
Absorb each one without becoming its builder, so you stay free to answer him and to merge:
1. Post one line: `CHANGE C<n> - <the change, in his words> - owner <package id | new agent> - lands ~T+<mm>`.
2. **The contract part is yours**: the type, the stub, the schema column, on main, `npm run check`, commit, push
   (section 6). That is the only code you write for it.
3. **The code goes to the package that owns the files**: SendMessage it (a finished agent is resumed by the
   message) with the change, test first where it changes behaviour. A change that spans no single package, or
   whose owner is gone and is not UI: one new `implementer` agent named `C<n>` (it is on Opus by its agent file),
   in its own worktree, with the files it owns and the tests it writes first. Merge it on arrival.
4. Write it under "Changes during the hour" in `docs/REQUIREMENTS.md` with its T+, so the README's decisions carry
   it.
5. After T+45 a change goes to the README's next steps unless it is XS (a few minutes); tell him which.

Why: in sim 3 the orchestrator built a whole feature and four gate changes itself, answered slowly while it did,
and its context ran out at T+46 (a two-minute compaction in the QA window).

## 7. When it goes wrong

- **Fails** (an error, red tests): send one precise correction. A second failure: take the package over on main,
  starting from what is green on its branch.
- **Stalls** (no report five minutes past its review ETA): look at `git -C <worktree> log --oneline main..`, then
  SendMessage "Report now: what is done, what is blocked." Still nothing: stop it and finish on main.
- **Edits beyond its files**: revert those files on its branch before merging and tell it why. An edit to a
  contract or the schema becomes a contract request.
- **Worked in the main checkout** (no worktree): stop it, sort out the change on main, respawn with isolation.
- **Late**: at T+40, merge what is green and hide what is not (no broken path in the live app). Tell him.

## 8. Integrate and ship

After the last merge: `grep -rn "// STUB" src` is empty (bar what was cut), `npm run check` and
`npx playwright test e2e/flow.spec.ts` pass. Then run the `qa` skill for R3 (two QA agents and the code reviewer,
one message) and offer the last
deploy (`DEPLOY? /ship`) in time to be live by T+45; R4 is the live URL, once he has deployed.
